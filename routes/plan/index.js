const jwt = require("jwt-simple");
const db = require("../../db");
const { getUserFromToken } = require("../../utils/userutil");
const { createDbDate } = require("../../utils/dateutil");
async function getListPlanUser(req, res){
    try {
        const jwt_dc = jwt.decode(req.headers['authorization'], process.env.SECRET_JWT)
        
          const user = jwt_dc.sub
          let result = await db.query('SELECT uid FROM user_detail WHERE username = $1', [user]);
          if(result.rows.length == 0) {
            res.status(400).send('User Not Found');
            return;
          }

          const uid = result.rows[0].uid

          result = await db.query('SELECT * FROM plan_detail WHERE user_uid = $1', [uid]);
          res.send({
            username: user,
            plans: result.rows
          });
        } catch (err) {
          console.error(err);
          res.status(500).send('Server Sad');
        }
}

async function getSubjectDataFromPlanSubject(plan_id, year, semester){
            // ดึงรายวิชาที่แผนการเรียนนี้เลือก
            const result_subjects = await db.query(`SELECT * FROM plan_subject WHERE plan_id = $1;`, [plan_id]);
            // ดึงข้อมูลรายวิชาที่ออกในปี/เทอมที่แผนการเรียนเลือก
            const data_course_detail = await db.query('SELECT * FROM course_detail WHERE year = $1 AND semester = $2', [year, semester]);

            const subjects_res = result_subjects.rows.map((s)=>{
                // ดึงข้อมูลจากรหัสวิชา
                const ref_subject = data_course_detail.rows.find((c)=>
                    c.code == s.code && c.semester == s.seamster
                )
                if (ref_subject != null) return {...ref_subject, cr_id: undefined, mute_alert: s.mute_alert != null ? s.mute_alert : false}
            })
            return subjects_res;
}

async function getPlanUser(req, res){
    try {
          const user = await getUserFromToken(req)
          const {plan_id} = req.params

          const result = await db.query('SELECT * FROM plan_detail WHERE plan_id = $1', [plan_id]);
          if (result.rows.length > 0){
            const plan_detail = result.rows[0]
            const subjects_res = await getSubjectDataFromPlanSubject(plan_id, plan_detail.cr_year, plan_detail.cr_seamseter)

            const plan_res = {
                detail: plan_detail,
                subjects: subjects_res
            }

            if(plan_detail.user_uid == user.uid){
                res.send(plan_res);
            } else if(plan_detail.status == 'public') {
                res.send(plan_res);
            } else {
                res.status(403).json({success: false, error: 403, msg: "Plan Not Allow To Aceess"});
            }
          } else {
            res.status(404).json({success: false, error: 404, msg: "Plan Not Found"});
          }
        } catch (err) {
          console.error(err);
          res.status(500).send('Server Sad');
        }
}

async function createPlanUser(req, res){
    try {
        const user = await getUserFromToken(req)
        const date = createDbDate()
        const {plan_name, cr_year, cr_seamseter, plan_color, plan_img, plan_dark, is_folder, ref_folder_plan_id} = req.body
        const result = await db.query(`INSERT INTO "plan_detail" ("plan_name", "user_uid", "cr_year", "cr_seamseter", "uni_id", "fac_id", "major_id", "plan_color", "plan_img", "plan_dark", "is_folder", "ref_folder-plan_id", "create_at", "status") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, $14) RETURNING *;`, [plan_name, user.uid, cr_year, cr_seamseter, user.uni_id, user.fac_id, user.major_id, plan_color, plan_img, plan_dark, is_folder, ref_folder_plan_id, date, "personal"]);
        res.json({success: true, result: result.rows[0]});
    } catch (err) {
        res.status(400).json({success: false, error: error.code, msg: error.detail});
    }
}
async function updatePlanUser(req, res){
    try {
        const user = await getUserFromToken(req)
        const {plan_id} = req.params
        const {plan_name, cr_year, cr_seamseter, plan_color, plan_img, plan_dark, is_folder, ref_folder_plan_id, status} = req.body
        const result = await db.query(`UPDATE "plan_detail" SET "plan_name" = $1, "cr_year" = $2, "cr_seamseter" = $3, "uni_id" = $4, "fac_id" = $5, "major_id" = $6, "plan_color" = $7, "plan_img" = $8, "plan_dark" = $9, "is_folder" = $10, "ref_folder-plan_id" = $11, "status" = $12 WHERE "plan_id" = $13 RETURNING *;`, [plan_name, cr_year, cr_seamseter, user.uni_id, user.fac_id, user.major_id, plan_color, plan_img, plan_dark, is_folder, ref_folder_plan_id, status, plan_id]);
        res.json({success: true, result: result.rows[0]});
    } catch (err) {
        res.status(400).json({success: false, error: error.code, msg: error.detail});
    }
}
async function getPlanSubjectsUser(req, res){
    try {
        const user = await getUserFromToken(req)
        const {plan_id} = req.params
        
        const result = await db.query('SELECT * FROM plan_detail WHERE plan_id = $1', [plan_id]);
        if(result.rows.length > 0 || result.rows[0].plan_uid == user.uid){
            const plan_detail = result.rows[0]
            const subjects_res = await getSubjectDataFromPlanSubject(plan_id, plan_detail.cr_year, plan_detail.cr_seamseter)

            res.send({success: true, subjects: subjects_res})
        } else {
            res.status(404).json({success: false, error: 404, msg: "Plan Not Found"});
        }
    } catch (err) {
        res.status(400).json({success: false, error: error.code, msg: error.detail});
    }
}
async function updatePlanSubjectsUser(req, res){
    try {
        const user = await getUserFromToken(req)
        const {plan_id} = req.params
        const {subjects} = req.body
        const result = await db.query('SELECT * FROM plan_detail WHERE plan_id = $1', [plan_id]);
        if(result.rows.length > 0){
            const plan_detail = result.rows[0]
            // ไม่ให้ user id อื่นอัพเดตข้อมูลได้
            if(plan_detail.user_uid != user.uid){
                return res.status(403).json({success: false, error: 403, msg: "Plan Forbidden"});;
            }

            // reset ข้อมูลรายวิชาในแผนเรียนนั้นก่อนทำขั้นตอนต่อไป
            await db.query(`DELETE FROM plan_subject WHERE plan_id = $1;`, [plan_id]);
            // เอาข้อมูลบางส่วนที่ไม่ได้ส่งมากับ body ยัดใส่ก่อนสร้าง sql placeholder
            const sjs = subjects.map((s)=>{return {plan_id, ...s, uni_id: plan_detail.uni_id}})
            const sql_placeholders = sjs.map((_, i) => `(${Object.keys(sjs[0]).map((_, j) => `$${i * Object.keys(sjs[0]).length + j + 1}`).join(',')})`).join(',');
            const insertQuery = `
                INSERT INTO "plan_subject" (plan_id, year, seamster, code, sec, mute_alert, uni_id) 
                VALUES ${sql_placeholders}
            ;`;
            const values = subjects.flatMap(subject => [plan_id, subject.year, subject.semester, subject.code, subject.sec, subject.mute_alert, plan_detail.uni_id]);
            // ยัดข้อมูลลง database
            await db.query(insertQuery, values);
            // return ข้อมูล
            const subjects_res = await getSubjectDataFromPlanSubject(plan_id, plan_detail.cr_year, plan_detail.cr_seamseter)
            res.json({success: true, result: subjects_res});
        } else {
            res.status(404).json({success: false, error: 404, msg: "Plan Not Found"});
        }
    } catch (err) {
        // console.log(err)
        res.status(400).json({success: false, error: err.code, msg: err.detail});
    }
}

module.exports = {
    getListPlanUser,
    getPlanUser,
    getPlanSubjectsUser,
    createPlanUser,
    updatePlanUser,
    updatePlanSubjectsUser
}