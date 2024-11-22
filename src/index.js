require("dotenv").config();

const bodyParser = require("body-parser");
const express = require("express");
const app = express();
const fs = require("fs");
var pjson = require("../package.json");
const redis = require("redis");

const port = process.env.PORT || 3030;
const { home } = require("./routes");
var cors = require("cors");

const { getCourses, getCoursesSpecific } = require("./routes/course");
const {
  authToken,
  authGetUser,
  authFromToken,
  forgetPassword,
  verifyOTP,
  changePassword,
} = require("./routes/auth/login");
const { loginMiddleware } = require("./middleware/loginMiddleware");
const { requireJWTAuth } = require("./middleware/requireJWTAuth");
const {
  registerUser,
  updateUser,
  updateFSUser,
  checkEmailUser,
  checkUsernameUser,
} = require("./routes/auth/register");
const {
  getListPlanUser,
  createPlanUser,
  getPlanUser,
  updatePlanUser,
  updatePlanSubjectsUser,
  getPlanSubjectsUser,
  deletePlanUser,
  updatePlanName,
} = require("./routes/plan");
const {
  getCoursesetDetail,
  getSubjectGroups,
  getLectureGroups,
  a_addCoursesetDetail,
  a_editCoursesetDetail,
  a_removeCoursesetDetail,
  a_removeCoursesetHeader,
  a_editCoursesetHeader,
  a_addCoursesetHeader,
  a_addCoursesetSubject,
  a_removeCoursesetSubject,
  a_editCoursesetSubject,
  getCoursesetMapping,
  a_editCoursesetMapping,
} = require("./routes/course-set");
const {
  getUserSubjectHistory,
  updateUserSubjectHistory,
} = require("./routes/user/history");
const {
  getUniversityList,
  getUniversityDetail,
  getUniversitySeasons,
  addUniversityDetail,
  editUniversityDetail,
  removeUniversityDetail,
  addFacultyDetail,
  removeFacultyDetail,
  editFacultyDetail,
} = require("./routes/university");
const {
  a_addCoursesetGroupDetail,
  a_editCourseSetGroupDetail,
  a_removeCoursesetGroupDetail,
} = require("./routes/course-set-group");
const {
  getCourseRestrictGroups,
  getCourseRestrictGroupData,
  a_addCourseRestrictGroupUsers,
  a_removeCourseRestrictGroupUsers,
  a_addCourseRestrictGroupSubjects,
  a_removeCourseRestrictGroupSubjects,
  a_updateCourseRestrictGroupSubjects,
  a_updateCourseRestrictGroupUsers,
  a_addCourseRestrictGroup,
  a_editCourseRestrictGroup,
  a_removeCourseRestrictGroup,
} = require("./routes/restricted-group");
const {
  getRegisterIntevals,
  a_manageRegisterYear,
  a_manageRegisterSubTimeline,
  a_manageRegisterTimeline,
  a_manageRegisterSemester,
} = require("./routes/register");
const {
  getAllUsers,
  a_addUserRole,
  a_deleteUserRole,
  a_editUserRole,
} = require("./routes/users");
const { getPlanRestricted, updatePlanRestricted, getPlanSubjectsRestricted, updatePlanSubjectsRestricted } = require("./routes/plan-restrict");
const { Pool } = require('pg');

// Enable CORS for all routes with wildcard origin
const corsOptions = {
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(bodyParser.json({ limit: "6mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "6mb" }));

app.get("/", home);
app.post("/auth/register", registerUser);
app.post("/auth/register/email", checkEmailUser);
app.post("/auth/register/username", checkUsernameUser);
app.post("/auth/login", loginMiddleware, authToken);
app.post("/auth/token", authFromToken);
app.post("/auth/forget-password", forgetPassword);
app.post("/auth/verify-otp", verifyOTP);
app.post("/auth/change-password", changePassword);

app.get("/user", requireJWTAuth, authGetUser);
app.get("/user/history", requireJWTAuth, getUserSubjectHistory);
app.put("/user/history", requireJWTAuth, updateUserSubjectHistory);
app.put("/user", requireJWTAuth, updateUser);
app.put("/user/update/fs", updateFSUser);

app.get("/plan", requireJWTAuth, getListPlanUser);
app.post("/plan/create", requireJWTAuth, createPlanUser);
app.get("/plan/view/:plan_id", requireJWTAuth, getPlanUser);
app.put("/plan/view/:plan_id", requireJWTAuth, updatePlanUser);
app.put("/plan/view/:plan_id/name", requireJWTAuth, updatePlanName);
app.delete("/plan/view/:plan_id", requireJWTAuth, deletePlanUser);
app.get("/plan/view/:plan_id/subject", requireJWTAuth, getPlanSubjectsUser);
app.put("/plan/view/:plan_id/subject", requireJWTAuth, updatePlanSubjectsUser);

// v.2 old api - deprecated
app.get("/course", getCourses);
app.post("/course/:year/:semester", getCoursesSpecific);
app.get("/course/:year/:semester/group", getSubjectGroups);
app.get("/course/:year/:semester/lecturer", getLectureGroups);
// v.2.0.1 new api
app.post("/university/:uni_id/course/:year/:semester", getCoursesSpecific);
app.get("/university/:uni_id/course/:year/:semester/group", getSubjectGroups);
app.get("/university/:uni_id/course/:year/:semester/lecturer", getLectureGroups);
app.get("/university/:uni_id/course-set/:cr_id", getCoursesetDetail);
app.get("/university/:uni_id/course-set/:cr_id/map", getCoursesetMapping);


app.get("/university/", getUniversityList);
app.get("/university/:uni_id", getUniversityDetail);
app.get("/university/:uni_id/season", getUniversitySeasons);

/** admin section */
// users
app.get("/university/:uni_id/user", requireJWTAuth, getAllUsers);
app.post("/university/:param_uni_id/user/:uid", requireJWTAuth, a_addUserRole);
app.put("/university/:param_uni_id/user/:uid", requireJWTAuth, a_editUserRole);
app.delete(
  "/university/:param_uni_id/user/:uid",
  requireJWTAuth,
  a_deleteUserRole
);
// university
app.post("/university", requireJWTAuth, addUniversityDetail);
app.put("/university/:uni_id", requireJWTAuth, editUniversityDetail);
app.delete("/university/:uni_id", requireJWTAuth, removeUniversityDetail);
// faculty
app.post("/university/:uni_id/faculty", requireJWTAuth, addFacultyDetail);
app.put(
  "/university/:uni_id/faculty/:fac_id",
  requireJWTAuth,
  editFacultyDetail
);
app.delete(
  "/university/:uni_id/faculty/:fac_id",
  requireJWTAuth,
  removeFacultyDetail
);
// course-set group
app.post(
  "/university/:uni_id/course-set-group",
  requireJWTAuth,
  a_addCoursesetGroupDetail
);
app.put(
  "/university/:uni_id/course-set-group/:cr_group_id",
  requireJWTAuth,
  a_editCourseSetGroupDetail
);
app.delete(
  "/university/:uni_id/course-set-group/:cr_group_id",
  requireJWTAuth,
  a_removeCoursesetGroupDetail
);
// course-set detail
app.post(
  "/university/:uni_id/course-set",
  requireJWTAuth,
  a_addCoursesetDetail
);
app.put(
  "/university/:uni_id/course-set/:cr_id",
  requireJWTAuth,
  a_editCoursesetDetail
);
app.delete(
  "/university/:uni_id/course-set/:cr_id",
  requireJWTAuth,
  a_removeCoursesetDetail
);
// course-set header
app.post(
  "/university/:uni_id/course-set/:cr_id/header",
  requireJWTAuth,
  a_addCoursesetHeader
);
app.put(
  "/university/:uni_id/course-set/:cr_id/header/:cr_head_id",
  requireJWTAuth,
  a_editCoursesetHeader
);
app.delete(
  "/university/:uni_id/course-set/:cr_id/header/:cr_head_id",
  requireJWTAuth,
  a_removeCoursesetHeader
);
// course-set course - subjects in course_set
app.post(
  "/university/:uni_id/course-set/:cr_id/course",
  requireJWTAuth,
  a_addCoursesetSubject
);
app.put(
  "/university/:uni_id/course-set/:cr_id/course/:suj_id",
  requireJWTAuth,
  a_editCoursesetSubject
);
app.delete(
  "/university/:uni_id/course-set/:cr_id/course/:suj_id",
  requireJWTAuth,
  a_removeCoursesetSubject
);

// course-set mapping
app.put("/university/:uni_id/course-set/:cr_id/map", a_editCoursesetMapping);

// course-set restricted
app.get("/university/:uni_id/restrict", getCourseRestrictGroups);
app.post("/university/:uni_id/restrict", a_addCourseRestrictGroup);
app.put(
  "/university/:uni_id/restrict/:cr_restgrp_id",
  a_editCourseRestrictGroup
);
app.delete(
  "/university/:uni_id/restrict/:cr_restgrp_id",
  a_removeCourseRestrictGroup
);
app.get(
  "/university/:uni_id/restrict/:cr_restgrp_id",
  getCourseRestrictGroupData
);
app.post(
  "/university/:uni_id/restrict/:cr_restgrp_id/user",
  a_addCourseRestrictGroupUsers
);
app.delete(
  "/university/:uni_id/restrict/:cr_restgrp_id/user",
  a_removeCourseRestrictGroupUsers
);
app.put(
  "/university/:uni_id/restrict/:cr_restgrp_id/user",
  a_updateCourseRestrictGroupUsers
);
app.post(
  "/university/:uni_id/restrict/:cr_restgrp_id/subject",
  a_addCourseRestrictGroupSubjects
);
app.delete(
  "/university/:uni_id/restrict/:cr_restgrp_id/subject",
  a_removeCourseRestrictGroupSubjects
);
app.put(
  "/university/:uni_id/restrict/:cr_restgrp_id/subject",
  a_updateCourseRestrictGroupSubjects
);

// get university register intervals
app.get("/university/:uni_id/register", getRegisterIntevals);
// university register intervals - year
app.post("/university/:uni_id/register/year", a_manageRegisterYear);
app.put("/university/:uni_id/register/year/:oldYear", a_manageRegisterYear);
app.delete("/university/:uni_id/register/year/:oldYear", a_manageRegisterYear);
// university register intervals - semester
app.post(
  "/university/:uni_id/register/year/:year/semester",
  a_manageRegisterSemester
);
app.put(
  "/university/:uni_id/register/year/:year/semester/:oldSemester",
  a_manageRegisterSemester
);
app.delete(
  "/university/:uni_id/register/year/:year/semester/:semester",
  a_manageRegisterSemester
);
// university register intervals - timeline
app.post(
  "/university/:uni_id/register/year/:year/semester/:semester/timeline",
  a_manageRegisterTimeline
);
app.put(
  "/university/:uni_id/register/year/:year/semester/:semester/timeline/:oldTimeline",
  a_manageRegisterTimeline
);
app.delete(
  "/university/:uni_id/register/year/:year/semester/:semester/timeline/:timeline",
  a_manageRegisterTimeline
);
// university register intervals - sub-timeline
app.post(
  "/university/:uni_id/register/year/:year/semester/:semester/timeline/:timeline/sub",
  a_manageRegisterSubTimeline
);
app.put(
  "/university/:uni_id/register/year/:year/semester/:semester/timeline/:timeline/sub/:oldSub",
  a_manageRegisterSubTimeline
);
app.delete(
  "/university/:uni_id/register/year/:year/semester/:semester/timeline/:timeline/sub/:sub",
  a_manageRegisterSubTimeline
);

// plan restricted
app.get("/plan-restrict/view/:restgrp_id", requireJWTAuth, getPlanRestricted);
app.put("/plan-restrict/view/:restgrp_id", requireJWTAuth, updatePlanRestricted);
app.get("/plan-restrict/view/:restgrp_id/subject", requireJWTAuth, getPlanSubjectsRestricted);
app.put("/plan-restrict/view/:restgrp_id/subject", requireJWTAuth, updatePlanSubjectsRestricted);

/** end admin section */

async function checkDatabaseConnection() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_SQL_USER,
    password: process.env.DB_SQL_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432
  });

  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('\x1b[32m%s\x1b[0m', 'Database connection successful');
    return true;
  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', 'Database connection failed:', err.message);
    return false;
  }
}

async function checkRedisConnection() {
  try {
    const client = redis.createClient({
      url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
      password: process.env.REDIS_PASS
    });

    // Connect to Redis before pinging
    await client.connect();

    await client.ping();
    console.log('\x1b[32m%s\x1b[0m', 'Redis connection successful');

    // Cleanup: disconnect the client
    await client.disconnect();
    return true;
  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', 'Redis connection failed:', err.message);
    return false;
  }
}

app.listen(port, "0.0.0.0", async () => {
  console.log("Planriean Subjects Service");
  console.log("Version: " + pjson.version);
  console.log("Port: " + port);
  console.log("DB Host: " + process.env.DB_HOST);
  await checkDatabaseConnection();
  console.log("Redis Host: " + process.env.REDIS_HOST);
  await checkRedisConnection();
});