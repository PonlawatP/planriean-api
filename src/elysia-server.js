// ElysiaJS server for high-concurrency endpoint
require("dotenv").config();

const { Elysia } = require("elysia");
const { cors } = require('@elysiajs/cors');
const db = require("./db");
const redis = require("./redis");

// Import the course module
const courseModule = require("./routes/course");

// Define the cache durations
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
const COURSE_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds

// Cache variables
let subjectCache = null;
let lastCacheTime = null;
let courseCache = null;
let lastCourseCacheTime = null;

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

// Define the getCoursesData function directly in this file
async function getCoursesData(data) {
  // Check if cache exists and is still valid
  if (courseCache && lastCourseCacheTime && (Date.now() - lastCourseCacheTime < COURSE_CACHE_DURATION)) {
    return courseCache;
  }

  // If no cache or expired, run the query
  const result = await db.query(
    `SELECT
    course_detail.uni_id,
    course_detail.YEAR,
    course_detail.semester,
    course_detail.code,
    course_detail.name_en,
    course_detail.note,
    course_detail.credit,
    course_detail.TIME,
    course_detail.sec,
    course_detail.lecturer,
    course_detail.exam_mid,
    course_detail.exam_final,
    course_detail.cr_id,
    course_detail.suj_real_code
  FROM
    course_detail
  WHERE
    uni_id = $1 AND year = $2 AND semester = $3`,
    data
  );

  // Store in cache
  courseCache = result.rows;
  lastCourseCacheTime = Date.now();

  return courseCache;
}

// Port for ElysiaJS server (different from Express)
const ELYSIA_PORT = process.env.ELYSIA_PORT || 3031;

// Create a specialized version of getCoursesSpecific for Elysia
async function elysiaGetCoursesSpecific(context) {
  try {
    // Add response compression
    // context.set.headers['Content-Encoding'] = 'gzip';
    
    const { year, semester } = context.params;
    const uni_id = context.params.uni_id || 1; // Get uni_id from params
    let searchData = context.body;

    if (searchData.type.length == 0) {
      searchData.type = ["004*"];
    }

    // Create cache key early to check cache first (fastest path)
    const uni_key = await getUniKey(uni_id);
    const searchData_ = `planriean-${uni_key}:subjs:${year}-${semester}:${searchData.type.join(",")}-${searchData.code.join(",")}-${searchData.date.join(",")}-${searchData.master.join(",")}-${searchData.time}`;
    const lastDataUpdatedKey = `planriean-${uni_key}:subjs:dataUpdated`;
    
    // Check cache first (fastest path)
    const [lastDataUpdatedCacheTime, cachedData] = await Promise.all([
      redis.get(lastDataUpdatedKey),
      redis.get(searchData_)
    ]);
    
    // Get data_updated only if needed
    let data_updated;
    if (!cachedData || !lastDataUpdatedCacheTime) {
      const result_updated = await db.query(
        `SELECT LOWER(uni_key) as uni_key, to_char(
            refresh_updated_at + interval '543 years',
            'DD/MM/YY HH24:MI:SS'
        ) AS formatted_date FROM university_detail WHERE uni_id = $1`,
        [uni_id]
      );
      data_updated = result_updated.rows[0].formatted_date;
      
      // If we already have cached data and it's still valid, return it
      if (cachedData && lastDataUpdatedCacheTime == data_updated) {
        return { cached: true, updated: data_updated, subjects: JSON.parse(cachedData) };
      }
    } else if (cachedData && lastDataUpdatedCacheTime) {
      // We have both cache values, check if valid
      const result_updated = await db.query(
        `SELECT to_char(
            refresh_updated_at + interval '543 years',
            'DD/MM/YY HH24:MI:SS'
        ) AS formatted_date FROM university_detail WHERE uni_id = $1`,
        [uni_id]
      );
      data_updated = result_updated.rows[0].formatted_date;
      
      if (lastDataUpdatedCacheTime == data_updated) {
        return { cached: true, updated: data_updated, subjects: JSON.parse(cachedData) };
      }
    }

    // If we get here, we need to generate fresh data
    // Run these queries in parallel for better performance
    const [coursesData, result, subjects] = await Promise.all([
      getCoursesData([uni_id, year, semester]),
      db.query(
        `SELECT
          course_detail.suj_real_code,
          course_detail.sec,
          course_seat.seat_remain,
          course_seat.seat_available 
        FROM
          course_detail
          LEFT JOIN course_seat ON course_detail.cr_id = course_seat.cr_id
        WHERE
          uni_id = $1 AND year = $2 AND semester = $3 AND code SIMILAR TO $4`,
        [
          uni_id,
          year,
          semester,
          (searchData.code.length > 0
            ? searchData.code.join("|")
            : searchData.type.join("|").replaceAll("*", "%")),
        ]
      ),
      getSubjects()
    ]);

    const courses = result.rows;

    // Use Map objects instead of reduce for better performance
    const subjectsMap = new Map();
    for (const sub of subjects) {
      subjectsMap.set(sub.suj_real_id, sub.suj_name_th);
    }

    const coursesMap = new Map();
    for (const course of courses) {
      const key = `${course.suj_real_code}_${course.sec}`;
      coursesMap.set(key, course);
    }

    // Pre-allocate array size if possible
    const enhancedResults = [];
    for (const row of coursesData) {
      const courseKey = `${row.suj_real_code}_${row.sec}`;
      const matchingCourse = coursesMap.get(courseKey);

      if (matchingCourse) {
        // Use Object.assign for faster object merging
        enhancedResults.push(Object.assign({}, row, {
          name_th: subjectsMap.get(row.suj_real_code) || null
        }, matchingCourse));
      }
    }

    // Use a more efficient filtering approach
    const searchResults = [];
    for (const item of enhancedResults) {
      // Skip early if possible
      if (searchData.date.length > 0 && !searchData.date.includes(item.time.substring(0, 2))) {
        continue;
      }
      
      if (searchData.master.length > 0) {
        let found = false;
        for (const m of searchData.master) {
          if (item.lecturer.includes(m)) {
            found = true;
            break;
          }
        }
        if (!found) continue;
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

    try {
      // Use pipelining for Redis operations
      const pipeline = redis.pipeline();
      pipeline.set(searchData_, JSON.stringify(searchResults), 'EX', 60); // Increased cache time to 60 seconds
      pipeline.set(lastDataUpdatedKey, data_updated);
      await pipeline.exec();
    } catch (redisError) {
      console.error('Redis pipeline failed:', redisError);
    }

    return { cached: false, updated: data_updated, subjects: searchResults };
  } catch (err) {
    console.error(err);
    context.set.status = 500;
    return "Internal Server Error";
  }
}

// Helper function to get uni_key (with caching)
const uniKeyCache = new Map();
async function getUniKey(uni_id) {
  if (uniKeyCache.has(uni_id)) {
    return uniKeyCache.get(uni_id);
  }
  
  const result = await db.query(
    `SELECT LOWER(uni_key) as uni_key FROM university_detail WHERE uni_id = $1`,
    [uni_id]
  );
  
  const uni_key = result.rows[0].uni_key;
  uniKeyCache.set(uni_id, uni_key);
  return uni_key;
}

// Create Elysia app with CORS support
const app = new Elysia()
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
  .listen(ELYSIA_PORT);

console.log(`🦊 ElysiaJS server running at http://${app.server?.hostname}:${app.server?.port}`);
console.log(`High-concurrency endpoint available at: http://${app.server?.hostname}:${app.server?.port}/university/:uni_id/course/:year/:semester`); 