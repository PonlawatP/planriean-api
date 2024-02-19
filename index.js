require('dotenv').config()

const express = require("express");
const app = express();
const fs = require('fs');
var pjson = require('./package.json');
const port = process.env.PORT || 3031;
const { home } = require("./routes");
var cors = require('cors');
const { getCourses, getCoursesSpecific } = require("./routes/course");
const { authToken, authGetUser } = require("./routes/auth/login");
const { loginMiddleware } = require("./middleware/loginMiddleware");
const { requireJWTAuth } = require('./middleware/requireJWTAuth');
const { registerUser } = require('./routes/auth/register');
const { getListPlanUser, createPlanUser, getPlanUser, updatePlanUser, updatePlanSubjectsUser, getPlanSubjectsUser, deletePlanUser } = require('./routes/plan');
const { getCoursesetDetail, getCoursesetSubject } = require('./routes/courseset');
const { getUserSubjectHistory, updateUserSubjectHistory } = require('./routes/user/history');
app.use(express.json());
app.use(cors())

app.get("/", home);
app.post("/auth/register", registerUser)
app.post("/auth/login", loginMiddleware, authToken)

app.get("/user", requireJWTAuth, authGetUser)
app.get("/user/history", requireJWTAuth, getUserSubjectHistory)
app.put("/user/history", requireJWTAuth, updateUserSubjectHistory)

app.get("/plan", requireJWTAuth, getListPlanUser)
app.post("/plan/create", requireJWTAuth, createPlanUser)
app.get("/plan/view/:plan_id", requireJWTAuth, getPlanUser)
app.put("/plan/view/:plan_id", requireJWTAuth, updatePlanUser)
app.delete("/plan/view/:plan_id", requireJWTAuth, deletePlanUser)
app.get("/plan/view/:plan_id/subject", requireJWTAuth, getPlanSubjectsUser)
app.put("/plan/view/:plan_id/subject", requireJWTAuth, updatePlanSubjectsUser)

app.get("/course", getCourses)
app.post("/course/:year/:semester/:coursecode", getCoursesSpecific)
app.get("/courseset/:id/detail", getCoursesetDetail)
app.get("/courseset/:id/subject", getCoursesetSubject)
// app.post('/datamajor', (req, res) => {
//    res.json(dataALL);
// });
// app.get('/Group/:id', (req, res) => {
//    const groupId = req.params.id;
//    const universal = "MSU";
//    try {
//       const data = require("./Group/" + universal + "/G" + groupId + ".json")
//       if (data.length > 0) {
//          res.json(data);
//       } else {
//          res.status(404).send("Group not found");
//       }
//    } catch {
//       res.status(404).send("Group not found");
//    }
// });
// app.post('/seccount/:type', (req, res) => {
//    const type = req.params.type;
//    try {
//       const filteredData = dataALL.filter(item => item.type === type);
//       const result = filteredData.map(item => ({
//          code: item.code,
//          name: item.name
//       }));
//       const mergedObjects = [];
//       result.map(data => {
//          if (!mergedObjects.map(mo => mo.code).includes(data.code)) {
//             mergedObjects.push({
//                ...data,
//                sec_count: filteredData.filter(df => df.code === data.code).length
//             })
//          }
//       })
//       res.json(mergedObjects);
//    } catch (error) {
//       res.status(404).send("Not found");
//    }
// });
// app.post('/updated', (req, res) => {
//    res.json(JSON.stringify(cache_updated));
// });
// app.post('/Filter', (req, res) => {
//    try {
//       const searchData = req.body;
//       const universal = "MSU";
//       fs.readFile('Group/' + universal + '/dataALL.json', 'utf8', (err, data) => {
//          if (err) {
//             console.error(err);
//             return res.status(404).send("Not found");
//          }
//          const dataALL = JSON.parse(data);
//          const searchResults = dataALL.filter(item => {
//             return (searchData.type.includes(item.type) || searchData.type.length == 0) &&
//                (searchData.code.includes(item.code) || searchData.code.length == 0) &&
//                (searchData.date.includes(item.time.substring(0, 2)) || searchData.date.length == 0) &&
//                (
//                   // if has more than 1 day it will check iterable
//                   item.time.split(' & ').filter(
//                      (fitem) => {
//                         // time filter had been ranged
//                         if(searchData.time.includes("-")){
//                            const fts = fitem.split("-");
//                            const ss = searchData.time.split("-");
//                            const sj_start_time = Number(fts[0].substring(2, 4))
//                            const sj_end_time = Number(fts[1].substring(0, 2))
//                            const ss_start_time = Number(ss[0])
//                            const ss_end_time = Number(ss[1])

//                            return sj_start_time >= ss_start_time && sj_end_time <= ss_end_time
//                         } else {
//                            return Number(fitem.substring(2, 4)) >= Number(searchData.time)
//                         }
//                      }
//                   ).length > 0 || searchData.time === "total"
//                )
//          });

//          // // Sort the search results by remaining most
//          // searchResults.sort((a, b) => {
//          //    return b.remaining - a.remaining;
//          // });

//          // Sort the search results by subject time
//          searchResults.sort((a, b) => {
//             return Number(a.time.substring(2, 4)) - Number(b.time.substring(2, 4));
//          });
//          res.json(searchResults);
//       });
//    } catch {
//       res.status(404).send("Not found");
//    }
// });
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
