// ElysiaJS server for high-concurrency endpoint
require("dotenv").config();

const { Elysia } = require("elysia");
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
    const { uni_id, year, semester } = context.params;
    let searchData = context.body;

    if (searchData.type.length == 0) {
      searchData.type = ["004*"];
    }

    let major_groups = "";
    let include_groups = [];

    const result_updated = await db.query(
      `SELECT LOWER(uni_key) as uni_key, to_char(
          refresh_updated_at + interval '543 years',
          'DD/MM/YY HH24:MI:SS'
      ) AS formatted_date FROM university_detail WHERE uni_id = $1`,
      [uni_id]
    );

    const data_updated = result_updated.rows[0].formatted_date;
    const uni_key = result_updated.rows[0].uni_key;

    const searchData_ = `planriean-${uni_key}:subjs:${year}-${semester}:${searchData.type.join(",")}-${searchData.code.join(",")}-${searchData.date.join(",")}-${searchData.master.join(",")}-${searchData.time}`;
    const lastDataUpdatedKey = `planriean-${uni_key}:subjs:dataUpdated`;
    const lastDataUpdatedCacheTime = await redis.get(lastDataUpdatedKey);

    if (lastDataUpdatedCacheTime == data_updated) {
      const cachedData = await redis.get(searchData_);
      if (cachedData) {
        return { cached: true, updated: data_updated, subjects: JSON.parse(cachedData) };
      }
    }

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
          (major_groups == "" ? "" : major_groups + "|") +
          (searchData.code.length > 0
            ? searchData.code.join("|")
            : searchData.type.join("|").replaceAll("*", "%")),
        ]
      ),
      getSubjects()
    ]);

    const courses = result.rows;

    // Create hash maps for faster lookups
    const subjectsMap = subjects.reduce((acc, sub) => {
      acc[sub.suj_real_id] = sub.suj_name_th;
      return acc;
    }, {});

    const coursesMap = courses.reduce((acc, course) => {
      const key = `${course.suj_real_code}_${course.sec}`;
      acc[key] = course;
      return acc;
    }, {});

    // Use hash maps for O(1) lookups instead of find()
    const enhancedResults = coursesData.map(row => {
      const courseKey = `${row.suj_real_code}_${row.sec}`;
      const matchingCourse = coursesMap[courseKey];

      return matchingCourse ? {
        ...row,
        name_th: subjectsMap[row.suj_real_code] || null,
        ...matchingCourse
      } : null;
    }).filter(r => r != null);

    // Filter results based on search criteria
    const searchResults = enhancedResults
      .filter((item) => {
        return (
          (searchData.date.includes(item.time.substring(0, 2)) ||
            searchData.date.length == 0) &&
          (searchData.master.length == 0 ||
            searchData.master.filter((m) => item.lecturer.includes(m)).length >
            0) &&
          (item.time.split(";").filter((fitem) => {
            if (searchData.time.includes("-")) {
              if (fitem.trim() == "") {
                return false;
              }
              const fts = fitem.split("-");
              const ss = searchData.time.split("-");
              const sj_start_time = Number(fts[0].substring(2, 4));
              const sj_end_time = Number(fts[1].substring(0, 2));
              const ss_start_time = Number(ss[0]);
              const ss_end_time = Number(ss[1]);
              return (
                sj_start_time >= ss_start_time && sj_end_time <= ss_end_time
              );
            } else {
              return Number(fitem.substring(2, 4)) >= Number(searchData.time);
            }
          }).length > 0 ||
            searchData.time === "total")
        );
      })
      .map((r) => {
        // Use destructuring to create a new object without unwanted properties
        const { ['cr_id(1)']: _, ...rest } = r;
        return rest;
      });

    try {
      const pipeline = redis.pipeline();
      pipeline.set(searchData_, JSON.stringify(searchResults), 'EX', 30);
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
  
// Create Elysia app
const app = new Elysia()
  .post('/university/:uni_id/course/:year/:semester', elysiaGetCoursesSpecific)
  .listen(ELYSIA_PORT);

console.log(`🦊 ElysiaJS server running at http://${app.server?.hostname}:${app.server?.port}`);
console.log(`High-concurrency endpoint available at: http://${app.server?.hostname}:${app.server?.port}/university/:uni_id/course/:year/:semester`); 