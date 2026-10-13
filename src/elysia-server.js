// ElysiaJS server for high-concurrency endpoint
require("dotenv").config();

const { t } = require('elysia');

const { Elysia } = require("elysia");
const { cors } = require('@elysiajs/cors');
const db = require("./db");
const redis = require("./redis");
const { withSeatNames } = require("./utils/seatutil");
const { scheduleTokenRefresh, verifyTransporter } = require("./utils/mailutil");

// Import the course module
const { getUserFromToken } = require("./utils/userutil");
const { stripBearer } = require("./middleware/requireJWTAuth");
const courseModule = require("./routes/course");
const planModule = require("./routes/plan");

// Define the cache durations
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
const VERSION_TTL = 5 * 1000; // how stale a semester snapshot may be after a scrape

// Cache variables
let subjectCache = null;
let lastCacheTime = null;
const versions = new Map(); // uni_id -> { at, promise<formatted refresh_updated_at> }
const snapshots = new Map(); // `${uni_id}:${year}:${semester}` -> { version, promise<snapshot> }

// Define the getSubjects function directly in this file
async function getSubjects() {
  // Check if cache exists and is still valid
  if (subjectCache && lastCacheTime && (Date.now() - lastCacheTime < CACHE_DURATION)) {
    return subjectCache;
  }

  // If no cache or expired, run the query
  const result = await db.query(`
        SELECT DISTINCT ON (suj_real_id) suj_real_id, suj_name_th
        FROM courseset_subject
        ORDER BY suj_real_id
    `);

  // Store in cache
  subjectCache = result.rows;
  lastCacheTime = Date.now();

  return subjectCache;
}

// The scraper bumps university_detail.refresh_updated_at after every run; that timestamp is the data version.
// Checked at most once per VERSION_TTL per uni (not per request); concurrent callers share one query.
function getVersion(uni_id) {
  const hit = versions.get(uni_id);
  if (hit && Date.now() - hit.at < VERSION_TTL) return hit.promise;
  const promise = db
    .query(
      `SELECT to_char(refresh_updated_at + interval '543 years', 'DD/MM/YY HH24:MI:SS') AS formatted_date FROM university_detail WHERE uni_id = $1`,
      [uni_id]
    )
    .then((r) => {
      if (r.rows.length === 0) throw new Error(`university ${uni_id} not found`);
      return r.rows[0].formatted_date;
    });
  versions.set(uni_id, { at: Date.now(), promise });
  promise.catch(() => versions.delete(uni_id));
  return promise;
}

// Whole semester (courses + seats + Thai names) held in memory, rebuilt with one query only when the version changes,
// so course search and seat polling cost no DB/Redis round trip per request.
// ponytail: one snapshot per semester ever requested, never evicted; a few MB each, add LRU if many semesters get hit.
async function getSnapshot(uni_id, year, semester) {
  const version = await getVersion(uni_id);
  const key = `${uni_id}:${year}:${semester}`;
  const hit = snapshots.get(key);
  if (hit && hit.version === version) return hit.promise;
  const promise = Promise.all([
    db.query(
      `SELECT cd.uni_id, cd.year, cd.semester, cd.code, cd.name_en, cd.note, cd.credit, cd.time, cd.sec,
         cd.exam_mid, cd.exam_final, cd.cr_id, cd.suj_real_code, cs.seat_remain, cs.seat_available
       FROM course_detail cd LEFT JOIN course_seat cs ON cd.cr_id = cs.cr_id
       WHERE cd.uni_id = $1 AND cd.year = $2 AND cd.semester = $3`,
      [uni_id, year, semester]
    ),
    getSubjects(),
  ]).then(([result, subjects]) => {
    const names = new Map(subjects.map((s) => [s.suj_real_id, s.suj_name_th]));
    const bySection = new Map(); // `${code}::${sec}` -> row
    for (const row of result.rows) {
      row.name_th = names.get(row.suj_real_code) || null;
      bySection.set(`${row.code}::${row.sec}`, row);
    }
    return { version, rows: result.rows, bySection };
  });
  snapshots.set(key, { version, promise });
  promise.catch(() => snapshots.delete(key));
  return promise;
}

// Postgres `code SIMILAR TO pattern` in JS: whole-string match, % = any string, _ = any char, | ( ) * + ? [ ] pass through.
function similarTo(pattern) {
  const re = pattern.replace(/[.^$\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^(?:${re})$`);
}

// Seat lookup for a plan's sections; same dedupe and -1-for-unknown rules as the old Redis/DB version.
async function getSeats(uni_id, year, semester, subjects) {
  const { version, bySection } = await getSnapshot(uni_id, year, semester);
  const seen = new Set();
  const seats = [];
  for (const s of subjects) {
    const code = (s.code || '').toString();
    const secValue = s.sec;
    const num = secValue === undefined || secValue === null ? '' : Number(secValue);
    const sec = Number.isNaN(num) ? (secValue || '').toString() : num;
    const k = `${code}::${sec}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const row = bySection.get(k);
    const item = row
      ? { code: row.code, sec: row.sec, seat_remain: row.seat_remain ?? -1, seat_available: row.seat_available ?? -1 }
      : { code, sec, seat_remain: -1, seat_available: -1 };
    // DB columns: seat_remain = seats TAKEN, seat_available = total capacity (see utils/seatutil.js)
    seats.push(withSeatNames({ ...item, sec: Number(item.sec) || item.sec }));
  }
  return { cached: true, updated: version, seats };
}

// Port for ElysiaJS server (different from Express)
const ELYSIA_PORT = process.env.ELYSIA_PORT || 3031;

// Create a specialized version of getCoursesSpecific for Elysia
// Single-arg signature on purpose: Elysia only parses the body when the handler's source reads context.body
// and the function takes just (context); extra default params made context.body undefined (H8).
async function elysiaGetCoursesSpecific(context) {
  const parameter = null, data = null;
  try {
    // Add response compression
    // context.set.headers['Content-Encoding'] = 'gzip';
    
    const { year, semester } = parameter || context.params;
    const uni_id = parameter?.uni_id || context.params.uni_id || 1; // Get uni_id from params
    let searchData = data || context.body;

    // If client POSTs only { subjects: [...] } then act as the seats endpoint
    if (searchData && Array.isArray(searchData.subjects)) {
      return await getSeats(uni_id, year, semester, searchData.subjects);
    }

    if (searchData.type.length == 0) {
      searchData.type = ["004*"];
    }

    const { version: data_updated, rows } = await getSnapshot(uni_id, year, semester);
    const codeMatches = similarTo(
      searchData.code.length > 0 ? searchData.code.join("|") : searchData.type.join("|").replaceAll("*", "%")
    );

    // Sections whose code matches, keyed by suj_real_code+sec (a row is shown when any row with its key matches)
    const coursesMap = new Map();
    for (const row of rows) {
      if (codeMatches.test(row.code)) coursesMap.set(`${row.suj_real_code}_${row.sec}`, row);
    }

    const enhancedResults = [];
    for (const row of rows) {
      const matchingCourse = coursesMap.get(`${row.suj_real_code}_${row.sec}`);
      if (matchingCourse) {
        const { seat_remain, seat_available, ...course } = row;
        enhancedResults.push(Object.assign(course, withSeatNames({
          suj_real_code: matchingCourse.suj_real_code,
          sec: matchingCourse.sec,
          seat_remain: matchingCourse.seat_remain,
          seat_available: matchingCourse.seat_available,
        })));
      }
    }

    // Use a more efficient filtering approach
    const searchResults = [];
    for (const item of enhancedResults) {
      // Skip early if possible
      if (searchData.date.length > 0 && !item.time.split(";").some((m) => searchData.date.includes(m.trim().substring(0, 2)))) {
        continue;
      }
      
      // Time filtering
      if (searchData.time !== "total") {
        const timeParts = item.time.split(";");
        let timeMatch = false;
        
        for (const fitem of timeParts) {
          if (fitem.trim() === "") continue;
          
          if (searchData.time.includes("-")) {
            const fts = fitem.split("-");
            const ss = searchData.time.split("-");
            const sj_start_time = Number(fts[0].substring(2, 4));
            const sj_end_time = Number(fts[1].substring(0, 2));
            const ss_start_time = Number(ss[0]);
            const ss_end_time = Number(ss[1]);
            
            if (sj_start_time >= ss_start_time && sj_end_time <= ss_end_time) {
              timeMatch = true;
              break;
            }
          } else {
            if (Number(fitem.substring(2, 4)) >= Number(searchData.time)) {
              timeMatch = true;
              break;
            }
          }
        }
        
        if (!timeMatch) continue;
      }
      
      // Create a new object without the unwanted property
      const { ['cr_id(1)']: _, ...rest } = item;
      searchResults.push(rest);
    }

    return { cached: true, updated: data_updated, subjects: searchResults };
  } catch (err) {
    console.error(err);
    if (parameter == null && data == null) {
      context.set.status = 500;
    }
    return "Internal Server Error";
  }
}

// Elysia handler: POST /university/:uni_id/course/:year/:semester/seats
async function elysiaGetPlanSubjectSeats(context) {
  const parameter = null, data = null; // single-arg signature, see elysiaGetCoursesSpecific
  try {
    const { year, semester } = parameter || context.params;
    const uni_id = parameter?.uni_id || context.params.uni_id || 1;
    const body = data || context.body || {};

    const subjects = Array.isArray(body.subjects) ? body.subjects : [];
    if (subjects.length === 0) {
      return { seats: [] };
    }

    return await getSeats(uni_id, year, semester, subjects);
  } catch (err) {
    console.error(err);
    context.set.status = 500;
    return "Internal Server Error";
  }
}

// Create Elysia app with CORS support
const devlog = require("./utils/devlog");
const app = new Elysia()
  .use((a) => (devlog.enabled ? devlog.elysiaLogger(a) : a))
  // Add CORS plugin with appropriate configuration
  .use(cors({
    origin: [
      '*'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Length', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400  // 24 hours
  }))
  .post('/university/:uni_id/course/:year/:semester', elysiaGetCoursesSpecific)
  .post('/university/:uni_id/course/:year/:semester/seats', elysiaGetPlanSubjectSeats)
  .ws('/ws/planriean', {
    // validate incoming message
    body: t.Object({
        message: t.String(),
        plan_id: t.Optional(t.Number()),
        parameter: t.Optional(t.Any()),
        data: t.Optional(t.Any())
    }),
    headers: t.Object({
      authorization: t.String()
    }),
    open(ws) {
      console.log(`[open] user connected: ${ws.id}`);
    },
    async message(ws, raw_message) {
      const { message, plan_id, parameter, data } = raw_message;
      // console.log(`[msg from ${ws.id}]`, message);

      let ws_session = null;

      switch (message) {
        case "register":
          /* register websocket into redis session to reusing on token session (like. add/edit/remove subject) */
          const authorization = stripBearer(ws.data.headers.authorization);
          const { plan_id } = parameter;
          ws.send({
            message: "page_loading",
            time: Date.now(),
          });
          const user = await getUserFromToken(authorization);

          // register plan_id into redis session - no expiration
          const redis_key = `planriean:plan_session:${ws.id}`;
          ws_session = {
            authorization: authorization,
            user: user,
            plan_id: plan_id,
          };  
          await redis.set(redis_key, JSON.stringify(ws_session));
          
          const plan_res = await planModule.getPlanUser(null, null, ws_session);
          
          ws.send({
            plan_id,
            result: plan_res,
            message: "registered",
            time: Date.now()
          });

          if (plan_res.success == false) {
            ws.close();
            return;
          }
          break;
        case "update_plan_subjects":
          if (ws_session == null) {
            ws_session = JSON.parse(await redis.get(`planriean:plan_session:${ws.id}`));
          }

          const update_plan_result = await planModule.updatePlanSubjectsUser(null, null, ws_session, data);

          ws.send({
            result: update_plan_result,
            message: "updated_plan_subjects",
            time: Date.now()
          });
          break;
        case "get_course_list":
          const result = await courseModule.getCoursesSpecific(null, null, parameter, data);
          ws.send({
            result,
            message,
            time: Date.now()
          });
          break;
      }
    },
    async close(ws) {
      console.log(`[close] ${ws.id} disconnected`);
      const redis_key = `planriean:plan_session:${ws.id}`;
      await redis.del(redis_key);
    }
  })
  .listen(ELYSIA_PORT);

console.log(`🦊 ElysiaJS server running at http://${app.server?.hostname}:${app.server?.port}`);
console.log(`High-concurrency endpoint available at: http://${app.server?.hostname}:${app.server?.port}/university/:uni_id/course/:year/:semester`); 
console.log(`WebSocket endpoint available at: ws://${app.server?.hostname}:${app.server?.port}/ws/planriean`);

// Initialize email transporter and set up automatic token refresh
(async () => {
  try {
    await verifyTransporter();
    scheduleTokenRefresh(); // Start automatic token refresh every 45 minutes
    console.log("[Email] Automatic token refresh scheduler started");
  } catch (err) {
    console.error("[Email] Failed to initialize email transporter:", err);
  }
})();