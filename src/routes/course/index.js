const db = require("../../db");

const Redis = require('ioredis');
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASS,  // Changed from REDIS_PASSWORD to REDIS_PASS
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  reconnectOnError: function (err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  }
});

// Create a cache variable at module level

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
const COURSE_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds
let subjectCache = null;
let lastCacheTime = null;
let courseCache = null;
let lastCourseCacheTime = null;

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
    // [year, semester, "12%"]
    data
  )

  // Store in cache
  courseCache = result.rows;
  lastCourseCacheTime = Date.now();

  return courseCache;
}

async function getCourses(req, res) {
  try {
    const result = await db.query("SELECT * FROM course_detail");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
}

// NOTED: temporary cache for user search data only
// let lastDataUpdatedCacheTime = null;

async function getCoursesSpecific(req, res, parameter = null, data = null) {
  try {
    const { uni_id = 1, year, semester } = parameter || req.params;
    let searchData = data || req.body;

    if (searchData.type.length == 0) {
      searchData.type = ["004*"];
    }

    // console.log(searchData);

    // console.log(coursecode);
    let major_groups = "";
    let include_groups = [];
    // TODO: search subject from major book
    // for (const cc of searchData.type) {
    //   if (!cc.startsWith("_M-")) {
    //     include_groups.push(cc.slice(0, -1));
    //     continue;
    //   }

    //   const key = cc.substring(3);
    //   // console.log(key);
    //   const rr_result = await db.query(
    //     `SELECT cr_id from courseset_detail WHERE uni_id = 1 AND cr_group_id = 34 AND upper(cr_key) = $1 ORDER BY cr_id DESC`,
    //     [key]
    //   );
    //   const majorlist = rr_result.rows.map((r) => r.cr_id).join("|");
    //   // console.log(rr_result.rows.map((r) => r.cr_id).join("|"));
    //   const rr2_result = await db.query(
    //     `SELECT * from courseset_subject WHERE CAST(cr_id AS TEXT) SIMILAR TO $1`,
    //     [majorlist]
    //   );
    //   // console.log(rr2_result.rows.map((r) => r.suj_id).join("|"));
    //   major_groups = rr2_result.rows
    //     .map((r) => r.suj_id)
    //     .filter((r) => !r.startsWith("00"))
    //     .join("|");
    //   // SELECT * from courseset_detail WHERE uni_id = 1 AND cr_group_id = 34 AND upper(cr_key) = 'IS' ORDER BY cr_key, cr_id DESC
    // }
    // for (const cc of include_groups) {
    //   major_groups = major_groups.filter((r) => !r.startsWith("00"))
    // }

    // console.log(major_groups);
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
        if (parameter != null || data != null) {
          return { cached: true, updated: data_updated, subjects: JSON.parse(cachedData) };
        }
        return res.json({ cached: true, updated: data_updated, subjects: JSON.parse(cachedData) });
      }
    }

    // console.time('getCoursesData');
    const coursesData = await getCoursesData([
      uni_id,
      year,
      semester
    ]);
    // console.timeEnd('getCoursesData');

    // console.time('getSubjects');

    const result = await db.query(
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
      // [year, semester, "12%"]
      [
        uni_id,
        year,
        semester,
        (major_groups == "" ? "" : major_groups + "|") +
        (searchData.code.length > 0
          ? searchData.code.join("|")
          : searchData.type.join("|").replaceAll("*", "%")),
      ]
    );
    // console.timeEnd('getSubjects');
    const subjects = await getSubjects();
    const courses = result.rows;

    // Map through results and inject suj_name_th
    // console.time('map');
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
    // console.timeEnd('map');

    // console.log(enhancedResults);
    // console.log(
    //   searchData.code.length > 0
    //     ? searchData.code.join("|")
    //     : searchData.type.join("|").replaceAll("*", "%")
    // );

    // TODO: convert into new code
    const searchResults = enhancedResults
      .filter((item) => {
        return (
          // (searchData.code.includes(item.code) ||
          //   searchData.code.length == 0) &&
          (searchData.date.includes(item.time.substring(0, 2)) ||
            searchData.date.length == 0) &&
          (searchData.master.length == 0 ||
            searchData.master.filter((m) => item.lecturer.includes(m)).length >
            0) &&
          // if has more than 1 day it will check iterable
          (item.time.split(";").filter((fitem) => {
            // time filter had been ranged
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
        // console.log(r);
        delete r["cr_id(1)"];
        return r;
      });

    try {
      const pipeline = redis.pipeline();

      pipeline.set(searchData_, JSON.stringify(searchResults), 'EX', 30);
      pipeline.set(lastDataUpdatedKey, data_updated);
      await pipeline.exec();
    } catch (redisError) {
      console.error('Redis pipeline failed:', redisError);
    }

    if (parameter != null || data != null) {
      return { cached: false, updated: data_updated, subjects: searchResults };
    }

    res.json({ cached: false, updated: data_updated, subjects: searchResults });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
}

module.exports = {
  getCourses,
  getCoursesSpecific,
};
