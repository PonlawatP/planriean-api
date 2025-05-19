const jwt = require("jwt-simple");
const db = require("../../db");
const { getUserFromToken } = require("../../utils/userutil");
const { createDbDate } = require("../../utils/dateutil");
const { getUniversityDetailWithNameFunc } = require("../university");
const { getCoursesetSubjectRestricted } = require("../course-set");
async function isPlanOwner(req) {
  try {
    const user = await getUserFromToken(req);
    const { plan_id } = req.params;

    const result = await db.query(
      "SELECT * FROM plan_detail WHERE plan_id = $1 AND is_delete = false",
      [plan_id]
    );
    if (result.rows.length > 0 || result.rows[0].plan_uid == user.uid) {
      return true;
    }
  } catch (error) { }
  return false;
}

async function getListPlanUser(req, res) {
  try {
    const user = await getUserFromToken(req);

    if (user == null) {
      res.status(400).send("User Not Found");
      return;
    }

    const { uid } = user;

    const result = await db.query("SELECT * FROM plan_detail WHERE user_uid = $1", [
      uid,
    ]);

    let plan_list = result.rows;
    let plan_folders = plan_list
      .filter((f) => f.is_folder)
      .map((m) => {
        return { ...m, children: [] };
      });

    for (const folder of plan_folders) {
      const plans_in_folder = plan_list.filter(
        (f) => f["ref_folder-plan_id"] == folder.plan_id
      );
      plan_list = plan_list.filter(
        (f) => f["ref_folder-plan_id"] != folder.plan_id
      );
      folder.children = plans_in_folder;
    }

    function getFolderModified(plan_elem) {
      const fold = plan_folders.find((f) => f.plan_id == plan_elem.plan_id);

      return fold != undefined ? fold : plan_elem;
    }

    plan_list = plan_list
      .map((p) => {
        return getFolderModified(p);
      })
      .filter((f) => f != null && !f.is_delete);

    res.json({
      data: plan_list,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Sad");
  }
}

async function getSubjectDataFromPlanSubject(plan_id, year, semester) {
  // ดึงรายวิชาที่แผนการเรียนนี้เลือก
  const result_subjects = await db.query(
    `SELECT * FROM plan_subject WHERE plan_id = $1;`,
    [plan_id]
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
        (c) => c.code == s.code && c.semester == s.seamster && c.sec == s.sec
      );
      if (ref_subject != null) {
        return {
          ...ref_subject,
          cr_id: undefined,
          mute_alert: s.mute_alert != null ? s.mute_alert : false,
        };
      } else {
        return null;
      }
    })
    .filter((s) => s !== null);
  return subjects_res;
}

async function getPlanUser(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { plan_id } = req.params;

    const result = await db.query(
      "SELECT * FROM plan_detail WHERE plan_id = $1",
      [plan_id]
    );
    if (result.rows.length > 0 && !result.rows[0].is_delete) {
      const plan_detail = result.rows[0];
      const subjects_res = await getSubjectDataFromPlanSubject(
        plan_id,
        plan_detail.cr_year,
        plan_detail.cr_seamseter
      );

      const restricted = await getCoursesetSubjectRestricted(req);

      const plan_res = {
        detail: plan_detail,
        subjects: subjects_res,
        restricted: restricted,
      };

      if (plan_detail.user_uid == user.uid) {
        res.json(plan_res);
      } else if (plan_detail.status == "public") {
        res.json(plan_res);
      } else {
        res.status(403).json({
          success: false,
          error: 403,
          msg: "Plan Not Allow To Aceess",
        });
      }
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

async function createPlanUser(req, res) {
  try {
    const user = await getUserFromToken(req);
    const date = createDbDate();
    const {
      plan_name,
      university,
      cr_year,
      cr_seamseter,
      cr_id,
      std_year,
      plan_color,
      plan_img,
      plan_dark,
      is_folder,
      ref_folder_plan_id,
    } = req.body;
    const uni_data = await getUniversityDetailWithNameFunc(university);
    const pre_result = await db.query(
      `SELECT * FROM plan_detail WHERE user_uid = $1 AND is_delete = false AND plan_name = $2;`,
      [user.uid, plan_name]
    );

    const result = await db.query(
      `INSERT INTO "plan_detail" ("plan_name", "user_uid", "cr_year", "cr_seamseter", "cr_id", "std_year", "uni_id", "fac_id", "major_id", "plan_color", "plan_img", "plan_dark", "is_folder", "ref_folder-plan_id", "create_at", "status") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *;`,
      [
        `${plan_name}${pre_result.rowCount > 0 ? ` (${pre_result.rowCount + 1})` : ""
        }`,
        user.uid,
        cr_year,
        cr_seamseter,
        cr_id,
        std_year,
        uni_data.university_data.uni_id,
        user.fac_id,
        user.major_id,
        plan_color,
        plan_img,
        plan_dark,
        is_folder,
        ref_folder_plan_id,
        date,
        "personal",
      ]
    );
    res.json({ success: true, result: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, error: err.code, msg: err.detail });
  }
}
async function updatePlanUser(req, res) {
  const { plan_id } = req.params;
  const plan_detail = await db.query(
    `SELECT user_uid FROM plan_detail WHERE plan_id = $1 AND is_delete = false`,
    [plan_id]
  );

  if (plan_detail.rows.length === 0) {
    return res.status(404).json({ success: false, error: 404, msg: "Plan not found" });
  }

  const user = await getUserFromToken(req);
  if (plan_detail.rows[0].user_uid !== user.uid) {
    return res.status(403).json({ success: false, error: 403, msg: "Not authorized to update this plan" });
  }
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
      plan_settings,
    } = req.body;
    const result = await db.query(
      `UPDATE "plan_detail" SET "plan_name" = $1, "cr_year" = $2, "cr_seamseter" = $3, "uni_id" = $4, "fac_id" = $5, "major_id" = $6, "plan_color" = $7, "plan_img" = $8, "plan_dark" = $9, "is_folder" = $10, "ref_folder-plan_id" = $11, "status" = $12, "update_at" = to_timestamp($13), "cr_id" = $14, "std_year" = $15, "plan_settings" = $16 WHERE "plan_id" = $17 RETURNING *;`,
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
        plan_settings,
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
async function updatePlanSettings(req, res) {
  const { plan_id } = req.params;
  const plan_detail = await db.query(
    `SELECT user_uid FROM plan_detail WHERE plan_id = $1 AND is_delete = false`,
    [plan_id]
  );

  if (plan_detail.rows.length === 0) {
    return res.status(404).json({ success: false, error: 404, msg: "Plan not found" });
  }

  const user = await getUserFromToken(req);
  if (plan_detail.rows[0].user_uid !== user.uid) {
    return res.status(403).json({ success: false, error: 403, msg: "Not authorized to update this plan" });
  }
  try {
    const user = await getUserFromToken(req);
    const { plan_id } = req.params;
    const {
      plan_settings,
    } = req.body;
    const result = await db.query(
      `UPDATE "plan_detail" SET "plan_settings" = $1 WHERE "plan_id" = $2 RETURNING *;`,
      [
        plan_settings,
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
async function updatePlanName(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { plan_id } = req.params;
    const { plan_name } = req.body;

    const result = await db.query(
      `UPDATE "plan_detail" SET "plan_name" = $1, "update_at" = to_timestamp($2) WHERE "plan_id" = $3 AND "user_uid" = $4 RETURNING *;`,
      [
        plan_name,
        Date.now() / 1000.0,
        plan_id,
        user.uid
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 404, msg: "Plan not found or you don't have permission to update it" });
    }

    res.json({ success: true, result: result.rows[0] });
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: error.code, msg: error.detail });
  }
}

// function to duplicate whole plan_subject and plan_detail by plan_id (and edit name using plan_name)
async function duplicatePlan(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { plan_id } = req.params;
    const { plan_name, cr_year, cr_seamseter, cr_id, std_year, uni_id, fac_id, major_id, plan_color, plan_img, plan_dark, is_folder, ref_folder_plan_id, date, plan_settings } = req.body;
    const result = await db.query(
      `INSERT INTO "plan_detail" ("plan_name", "user_uid", "cr_year", "cr_seamseter", "cr_id", "std_year", "uni_id", "fac_id", "major_id", "plan_color", "plan_img", "plan_dark", "is_folder", "ref_folder-plan_id", "create_at", "status", "plan_settings") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *;`,
      [plan_name, user.uid, cr_year, cr_seamseter, cr_id, std_year, uni_id, fac_id, major_id, plan_color, plan_img, plan_dark, is_folder, ref_folder_plan_id, date, "personal", plan_settings]
    );
    res.json({ success: true, result: result.rows[0] });
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: error.code, msg: error.detail });
  }
}

async function getPlanSubjectsUser(req, res) {
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
async function updatePlanSubjectsUser(req, res) {
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
async function deletePlanUser(req, res) {
  try {
    const { plan_id } = req.params;
    if (await isPlanOwner(req)) {
      await db.query(
        `UPDATE "plan_detail" SET "is_delete" = true WHERE "plan_id" = $1 OR "ref_folder-plan_id" = $2;`,
        [plan_id, plan_id]
      );
      res.json({ success: true });
    } else {
      res.status(403).json({
        success: false,
        error: 403,
        msg: "Plan not permitted to change",
      });
    }
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: error.code, msg: error.detail });
  }
}

module.exports = {
  getListPlanUser,
  getPlanUser,
  getPlanSubjectsUser,
  createPlanUser,
  updatePlanUser,
  updatePlanSettings,
  updatePlanSubjectsUser,
  deletePlanUser,
  updatePlanName
};
