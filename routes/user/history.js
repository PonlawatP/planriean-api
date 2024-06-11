const db = require("../../db");
const { getUserFromToken } = require("../../utils/userutil");

async function getUserSubjectHistory(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { id } = req.params;
    if (user != null) {
      const crs = await db.query(
        "SELECT * FROM user_subjecthistory WHERE uid = $1;",
        [user.uid]
      );
      const history_head = [];
      for (const subj of crs.rows) {
        const head_subj = history_head.find((f) => f.code == subj.subj_id);
        // หาว่ามีรหัสวิชานี้อยู่แล้วมั้ย
        if (head_subj != null) {
          head_subj.learning_try.push({
            semester: subj.study_term,
            year: subj.study_year,
            grade: subj.grade,
          });
        } else {
          history_head.push({
            code: subj.subj_id,
            learning_try: [
              {
                semester: subj.study_term,
                year: subj.study_year,
                grade: subj.grade,
              },
            ],
            current_score: subj.score,
          });
        }
      }
      const result = {
        result: history_head,
      };
      res.json(result);
    } else {
      throw new Error("error!");
    }
  } catch (err) {
    console.error(err);
    res.status(404).send("Courseset Not Found");
  }
}

async function updateUserSubjectHistory(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { subjects } = req.body;
    if (user != null) {
      const subj_sql = [];
      for (const subj of subjects) {
        for (const subj_try of subj.learning_try) {
          subj_sql.push({
            uid: user.uid,
            subj_id: subj.code,
            study_term: subj_try.semester,
            study_year: subj_try.year,
            grade: subj_try.grade,
            score: subj.current_score,
            uni_id: user.uni_id,
          });
        }
      }
      // reset ข้อมูลรายวิชาในแผนเรียนนั้นก่อนทำขั้นตอนต่อไป
      await db.query(`DELETE FROM user_subjecthistory WHERE uid = $1;`, [
        user.uid,
      ]);
      // เอาข้อมูลบางส่วนที่ไม่ได้ส่งมากับ body ยัดใส่ก่อนสร้าง sql placeholder
      const sql_placeholders = subj_sql
        .map(
          (_, i) =>
            `(${Object.keys(subj_sql[0])
              .map((_, j) => `$${i * Object.keys(subj_sql[0]).length + j + 1}`)
              .join(",")})`
        )
        .join(",");
      // console.log(sql_placeholders);
      const insertQuery = `
            INSERT INTO "user_subjecthistory" (uid, subj_id, study_term, study_year, grade, score, uni_id)
            VALUES ${sql_placeholders}
        ;`;
      const values = subj_sql.flatMap((subject) => [
        subject.uid,
        subject.subj_id,
        subject.study_term,
        subject.study_year,
        subject.grade,
        subject.score,
        subject.uni_id,
      ]);
      // ยัดข้อมูลลง database
      await db.query(insertQuery, values);
      // return ข้อมูล
      return getUserSubjectHistory(req, res);
    } else {
      res.status(404).json({ success: false, error: 403, msg: "Unauthorize" });
    }
  } catch (err) {
    res.status(400).json({ success: false, error: err.code, msg: err.detail });
  }
}

module.exports = {
  getUserSubjectHistory,
  updateUserSubjectHistory,
};
