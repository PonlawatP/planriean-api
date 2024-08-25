require("dotenv").config();

const bodyParser = require("body-parser");
const express = require("express");
const app = express();
const fs = require("fs");
var pjson = require("./package.json");
const port = process.env.PORT || 3030;
const { home } = require("./routes");
var cors = require("cors");
const { getCourses, getCoursesSpecific } = require("./routes/course");
const {
  authToken,
  authGetUser,
  authFromToken,
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
} = require("./routes/plan");
const {
  getCoursesetDetail,
  getCoursesetSubjectRestricted,
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
app.use(express.json());
app.use(cors());
app.use(bodyParser.json({ limit: "6mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "6mb" }));

app.get("/", home);
app.post("/auth/register", registerUser);
app.post("/auth/register/email", checkEmailUser);
app.post("/auth/register/username", checkUsernameUser);
app.post("/auth/login", loginMiddleware, authToken);
app.post("/auth/token", authFromToken);

app.get("/user", requireJWTAuth, authGetUser);
app.get("/user/history", requireJWTAuth, getUserSubjectHistory);
app.put("/user/history", requireJWTAuth, updateUserSubjectHistory);
app.put("/user/update/fs", updateFSUser);

app.get("/plan", requireJWTAuth, getListPlanUser);
app.post("/plan/create", requireJWTAuth, createPlanUser);
app.get("/plan/view/:plan_id", requireJWTAuth, getPlanUser);
app.put("/plan/view/:plan_id", requireJWTAuth, updatePlanUser);
app.delete("/plan/view/:plan_id", requireJWTAuth, deletePlanUser);
app.get("/plan/view/:plan_id/subject", requireJWTAuth, getPlanSubjectsUser);
app.get(
  "/plan/view/:plan_id/subject/restrict",
  requireJWTAuth,
  getCoursesetSubjectRestricted
);
app.put("/plan/view/:plan_id/subject", requireJWTAuth, updatePlanSubjectsUser);

app.get("/course", getCourses);
app.post("/course/:year/:semester", getCoursesSpecific);
app.get("/course/:year/:semester/group", getSubjectGroups);
app.get("/course/:year/:semester/lecturer", getLectureGroups);
app.get("/university/:uni_id/course-set/:id", getCoursesetDetail);

app.get("/university/", getUniversityList);
app.get("/university/:uni_id", getUniversityDetail);
app.get("/university/:uni_id/season", getUniversitySeasons);

/** admin section */
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

/** end admin section */

app.listen(port, "0.0.0.0", () => {
  console.log("Planriean Subjects Service");
  console.log("Version: " + pjson.version);
  console.log("Port: " + port);
  // ready = true;
});

// // Run a schedule
// // [TODO: it will be another a service to prevent script interrupted]
// // Check has file
// // Add your code here to run the schedule
// const cron = require('node-cron');
// const path = require('path');
// const { exec } = require('child_process');
// var ready = false;
//
// if (!fs.existsSync(dataALLPath)) {
//    console.error(`File ${dataALLPath} does not exist`);
//    exec(`cd ${path.dirname(__filename)} && python3 ./main.py`, (error, stdout, stderr) => {
//       if (error) {
//          console.error(`exec error: ${error}`);
//          return;
//       }
//       init()
//    });
// } else {
//    init()
// }
// console.log("Running schedule...");
// // Run the Python file
// const args = require('minimist')(process.argv.slice(2));
// const sec = args.t || 10;
// var seconds = sec;
// var count = 0;
// const scheduledFunction = () => {
//    if (!ready) return;

//    if (cache_updated === "none" && seconds === sec) {
//       seconds = 0;
//    }

//    if (seconds > 0) {
//       process.stdout.write(`\x1b[K\x1b[90mRequested done on\x1b[0m ${cache_updated} \x1b[90m(${count}) \x1b[33m| \x1b[37m${seconds}\x1b[33m's left...\r`);
//       seconds--;
//       return
//    } else if (seconds == 0) {
//       seconds = -1;

//       if (cache_updated === "none") {
//          process.stdout.write(`\x1b[K\x1b[90mFirst Running \x1b[33m| \x1b[32mUpdating...\r`);
//       } else {
//          process.stdout.write(`\x1b[K\x1b[90mRequested done on\x1b[0m ${cache_updated} \x1b[33m| \x1b[90m${count} \x1b[33m| \x1b[32mUpdating...\r`);
//       }

//       exec(`cd ${path.dirname(__filename)} && python3 ./main.py`, (error, stdout, stderr) => {
//          if (error) {
//             console.error(`exec error: ${error}`);
//             return;
//          }
//          cache_updated = new Date().toLocaleDateString('th-TH', {
//             year: '2-digit',
//             month: '2-digit',
//             day: '2-digit',
//             hour: '2-digit',
//             minute: '2-digit',
//             second: '2-digit',
//             hour12: false
//          }).replace(',', '');

//          seconds = sec;
//          count++;
//       });
//    }
// }
// cron.schedule('* * * * * *', scheduledFunction);
