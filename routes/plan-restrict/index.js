const jwt = require("jwt-simple");
const db = require("../../db");
const { getUserFromToken } = require("../../utils/userutil");
const { createDbDate } = require("../../utils/dateutil");

async function getPlanRestricted(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { restgrp_id } = req.params;

    // old data
    // แผนการเรียนใหม่ 04/09	95	2567	2	1	12				f			2024-10-04	65	personal	2024-10-03 22:47:31.951	f	4	1126302
    const result = await db.query(
      "SELECT * FROM courseset_restrictgrp WHERE cr_restgrp_id = $1",
      [restgrp_id]
    );

    // new data (SELECT * FROM courseset_restrictgrp WHERE cr_restgrp_id = $1)
    // 	67-1 A	1	1	1	1126502	1	2024-02-22

    if (result.rows.length > 0 && !result.rows[0].is_delete) {
      const plan_detail = result.rows[0];
      const subjects_res = await getSubjectDataFromPlanRestrictSubject(
        restgrp_id,
        plan_detail.std_year,
        plan_detail.term
      );

      const plan_res = {
        detail: {
          ...plan_detail,
          "plan_name": plan_detail.name_th,
          "cr_year": plan_detail.std_year,
          "cr_seamseter": plan_detail.term,
        },
        subjects: subjects_res,
      };

      res.json(plan_res);
    } else {
      res
        .status(404)
        .json({ success: false, error: 404, msg: "Plan Not Found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Sad");
  }
}
async function updatePlanRestricted(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { plan_id } = req.params;
    const {
      plan_name,
      cr_year,
      cr_seamseter,
      cr_id,
      std_year,
      plan_color,
      plan_img,
      plan_dark,
      is_folder,
      ref_folder_plan_id,
      status,
    } = req.body;
    const result = await db.query(
      `UPDATE "plan_detail" SET "plan_name" = $1, "cr_year" = $2, "cr_seamseter" = $3, "uni_id" = $4, "fac_id" = $5, "major_id" = $6, "plan_color" = $7, "plan_img" = $8, "plan_dark" = $9, "is_folder" = $10, "ref_folder-plan_id" = $11, "status" = $12, "update_at" = to_timestamp($13), "cr_id" = $14, "std_year" = $15 WHERE "plan_id" = $16 RETURNING *;`,
      [
        plan_name,
        cr_year,
        cr_seamseter,
        user.uni_id,
        user.fac_id,
        user.major_id,
        plan_color,
        plan_img,
        plan_dark,
        is_folder,
        ref_folder_plan_id,
        status,
        Date.now() / 1000.0,
        cr_id,
        std_year,
        plan_id,
      ]
    );
    res.json({ success: true, result: result.rows[0] });
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: error.code, msg: error.detail });
  }
}
async function getPlanSubjectsRestricted(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { plan_id } = req.params;

    const result = await db.query(
      "SELECT * FROM plan_detail WHERE plan_id = $1",
      [plan_id]
    );
    if (result.rows.length > 0 || result.rows[0].plan_uid == user.uid) {
      const plan_detail = result.rows[0];
      const subjects_res = await getSubjectDataFromPlanSubject(
        plan_id,
        plan_detail.cr_year,
        plan_detail.cr_seamseter
      );

      res.json({ success: true, subjects: subjects_res });
    } else {
      res
        .status(404)
        .json({ success: false, error: 404, msg: "Plan Not Found" });
    }
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: error.code, msg: error.detail });
  }
}
async function updatePlanSubjectsRestricted(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { restgrp_id } = req.params;
    const { subjects } = req.body;

    const result = await db.query(
      "SELECT * FROM courseset_restrictgrp WHERE cr_restgrp_id = $1",
      [restgrp_id]
    );
    if (result.rows.length > 0) {
      const plan_detail = result.rows[0];

      // Reset subject data for this restricted group
      await db.query(`DELETE FROM restrictgrp_subject WHERE cr_restgrp_id = $1;`, [restgrp_id]);

      if (subjects.length > 0) {
        const insertQuery = `
          INSERT INTO "restrictgrp_subject" (cr_restgrp_id, suj_id, sec) 
          VALUES ${subjects.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(',')}
        ;`;
        const values = subjects.flatMap((subject) => [
          restgrp_id,
          subject.code,
          subject.sec,
        ]);

        await db.query(insertQuery, values);
      }

      // Update the last modified time
      await db.query(
        `UPDATE "courseset_restrictgrp" SET "create_at" = to_timestamp($1) WHERE "cr_restgrp_id" = $2 RETURNING *`,
        [Date.now() / 1000.0, restgrp_id]
      );

      const subjects_res = await getSubjectDataFromPlanRestrictSubject(
        restgrp_id,
        plan_detail.std_year,
        plan_detail.term
      );
      res.json({ success: true, result: subjects_res });
    } else {
      res
        .status(404)
        .json({ success: false, error: 404, msg: "Restricted Group Not Found" });
    }
  } catch (err) {
    console.log(err);
    res.status(400).json({ success: false, error: err.code, msg: err.detail });
  }
}

// New function to wrap the previously loose code
async function updatePlanSubjects(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { plan_id } = req.params;
    const { subjects } = req.body;
    // console.log(subjects);
    const result = await db.query(
      "SELECT * FROM plan_detail WHERE plan_id = $1",
      [plan_id]
    );
    if (result.rows.length > 0) {
      const plan_detail = result.rows[0];
      // ไม่ให้ user id อื่นอัพเดตข้อมูลได้
      if (plan_detail.user_uid != user.uid) {
        return res
          .status(403)
          .json({ success: false, error: 403, msg: "Plan Forbidden" });
      }

      // reset ข้อมูลรายวิชาในแผนเรียนนั้นก่อนทำขั้นตอนต่อไป
      await db.query(`DELETE FROM plan_subject WHERE plan_id = $1;`, [plan_id]);

      if (subjects.length > 0) {
        // เอาข้อมูลบางส่วนที่ไม่ได้ส่งมากับ body ยัดใส่ก่อนสร้าง sql placeholder
        const sjs = subjects.map((s) => {
          return { plan_id, ...s, uni_id: plan_detail.uni_id };
        });
        const sql_placeholders = sjs
          .map(
            (_, i) =>
              `(${Object.keys(sjs[0])
                .map((_, j) => `$${i * Object.keys(sjs[0]).length + j + 1}`)
                .join(",")})`
          )
          .join(",");
        // console.log(sql_placeholders);
        const insertQuery = `
                  INSERT INTO "plan_subject" (plan_id, year, seamster, code, sec, mute_alert, uni_id) 
                  VALUES ${sql_placeholders}
              ;`;
        const values = subjects.flatMap((subject) => [
          plan_id,
          subject.year,
          subject.semester,
          subject.code,
          subject.sec,
          subject.mute_alert,
          plan_detail.uni_id,
        ]);
        // console.log(values);
        // ยัดข้อมูลลง database
        await db.query(insertQuery, values);
      }

      // update เวลาแก้ไขตาราง
      await db.query(
        `UPDATE "plan_detail" SET "update_at" = to_timestamp($1) WHERE "plan_id" = $2 RETURNING *`,
        [Date.now() / 1000.0, plan_id]
      );
      // return ข้อมูล
      const subjects_res = await getSubjectDataFromPlanSubject(
        plan_id,
        plan_detail.cr_year,
        plan_detail.cr_seamseter
      );
      res.json({ success: true, result: subjects_res });
    } else {
      res
        .status(404)
        .json({ success: false, error: 404, msg: "Plan Not Found" });
    }
  } catch (err) {
    console.log(err);
    res.status(400).json({ success: false, error: err.code, msg: err.detail });
  }
}

async function getSubjectDataFromPlanRestrictSubject(restgrp_id, year, semester) {
  // ดึงรายวิชาที่แผนการเรียนนี้เลือก
  const result_subjects = await db.query(
    `SELECT * FROM restrictgrp_subject WHERE cr_restgrp_id = $1;`,
    [restgrp_id]
  );

  // ดึงข้อมูลรายวิชาที่ออกในปี/เทอมที่แผนการเรียนเลือก
  const data_course_detail = await db.query(
    "SELECT * FROM course_detail WHERE year = $1 AND semester = $2",
    [year, semester]
  );

  const subjects_res = result_subjects.rows
    .map((s) => {
      // ดึงข้อมูลจากรหัสวิชา
      const ref_subject = data_course_detail.rows.find(
        (c) => c.code == s.suj_id && c.semester == semester && c.sec == s.sec
      );
      if (ref_subject != null) {
        return {
          ...ref_subject,
          cr_id: undefined,
        };
      } else {
        return null;
      }
    })
    .filter((s) => s !== null);
  return subjects_res;
}

module.exports = {
  getPlanRestricted,
  updatePlanRestricted,
  getPlanSubjectsRestricted,
  updatePlanSubjectsRestricted,
  updatePlanSubjects, // Add this new function to the exports
  getSubjectDataFromPlanRestrictSubject,
};