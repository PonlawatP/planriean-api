require('dotenv').config()

const express = require("express");
const app = express();
const fs = require('fs');
var pjson = require('./package.json');
const port = process.env.PORT || 3030;
const { home } = require("./routes");
var cors = require('cors');
const { getCourses, getCoursesSpecific } = require("./routes/course");
const { authToken, authGetUser, authFromToken } = require("./routes/auth/login");
const { loginMiddleware } = require("./middleware/loginMiddleware");
const { requireJWTAuth } = require('./middleware/requireJWTAuth');
const { registerUser, updateUser, updateFSUser } = require('./routes/auth/register');
const { getListPlanUser, createPlanUser, getPlanUser, updatePlanUser, updatePlanSubjectsUser, getPlanSubjectsUser, deletePlanUser } = require('./routes/plan');
const { getCoursesetDetail, getCoursesetSubject, getCoursesetSubjectRestricted } = require('./routes/courseset');
const { getUserSubjectHistory, updateUserSubjectHistory } = require('./routes/user/history');
const { getUniversityList, getUniversityDetail } = require('./routes/university');
app.use(express.json());
app.use(cors())

app.get("/", home);
app.post("/auth/register", registerUser)
app.post("/auth/login", loginMiddleware, authToken)
app.post("/auth/token", authFromToken)

app.get("/user", requireJWTAuth, authGetUser)
app.get("/user/history", requireJWTAuth, getUserSubjectHistory)
app.put("/user/history", requireJWTAuth, updateUserSubjectHistory)
app.put("/user/update/fs", updateFSUser)

app.get("/plan", requireJWTAuth, getListPlanUser)
app.post("/plan/create", requireJWTAuth, createPlanUser)
app.get("/plan/view/:plan_id", requireJWTAuth, getPlanUser)
app.put("/plan/view/:plan_id", requireJWTAuth, updatePlanUser)
app.delete("/plan/view/:plan_id", requireJWTAuth, deletePlanUser)
app.get("/plan/view/:plan_id/subject", requireJWTAuth, getPlanSubjectsUser)
app.get("/plan/view/:plan_id/subject/restrict", requireJWTAuth, getCoursesetSubjectRestricted)
app.put("/plan/view/:plan_id/subject", requireJWTAuth, updatePlanSubjectsUser)

app.get("/course", getCourses)
app.post("/course/:year/:semester/:coursecode", getCoursesSpecific)
app.get("/courseset/:id/detail", getCoursesetDetail)
app.get("/courseset/:id/subject", getCoursesetSubject)

app.get("/university/", getUniversityList)
app.get("/university/:uni_id", getUniversityDetail)

/** admin section */
   // TODO: code here
/** end admin section */

app.listen(port, () => {
   console.log("Planriean Subjects Service");
   console.log("Version: " + pjson.version);
   console.log("Port: " + port);
   ready = true;
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
