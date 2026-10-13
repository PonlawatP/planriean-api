const jwt = require("jwt-simple");
const db = require("../../db");
const { getUserFromRequest, getUserRowFromRequest } = require("../../utils/userutil");
const { createDbDate } = require("../../utils/dateutil");
const { getUniversityDetailWithNameFunc } = require("../university");
const { getCoursesetSubjectRestricted } = require("../course-set");
const { sanitizeCustomSubject, MAX_CUSTOMS } = require("../../utils/customSubject");

async function isPlanOwner(req) {
  try {
    const user = await getUserFromRequest(req);
    const { plan_id } = req.params;

    const result = await db.query(
      "SELECT * FROM plan_detail WHERE plan_id = $1 AND is_delete = false",
      [plan_id]
    );
    if (result.rows.length > 0 && user != null && result.rows[0].user_uid == user.uid) {
      return true;
    }
  } catch (error) { }
  return false;
}

async function getListPlanUser(req, res) {
  try {
    const user = await getUserFromRequest(req);

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

async function getSubjectDataFromPlanSubject(plan_id, year, semester, force_subjects_data = null) {
  // ดึงรายวิชาที่แผนการเรียนนี้เลือก
  const result_subjects = force_subjects_data != null ? {rows: force_subjects_data.map((s) => {
    return {
      code: s[3],
      sec: s[4],
    };
  })} : await db.query(
    `SELECT * FROM plan_subject WHERE plan_id = $1;`,
    [plan_id]
  );
  const subjects_query = result_subjects.rows.map((s) => {
    return {
      code: s.code,
      sec: s.sec,
    };
  });
  
  // ดึงข้อมูลรายวิชาที่ออกในปี/เทอมที่แผนการเรียนเลือก
  const data_course_detail = await db.query(
    "SELECT * FROM course_detail WHERE year = $1 AND semester = $2 AND (code, sec) IN (SELECT code, sec FROM plan_subject WHERE plan_id = $3)",
    [year, semester, plan_id]
  );

  const subjects_res = result_subjects.rows
    .map((s) => {
      // ดึงข้อมูลจากรหัสวิชา
      const ref_subject = data_course_detail.rows.find(
        (c) => c.code == s.code && c.sec == s.sec
      );
      if (ref_subject != null) {
        const { lecturer, ...refSansLecturer } = ref_subject;
        return {
          ...refSansLecturer,
          cr_id: undefined,
          mute_alert: s.mute_alert != null ? s.mute_alert : false,
        };
      } else {
        return null;
      }
    })
    .filter((s) => s !== null);
  // M20: user-made subjects are standalone rows (own identity), never merged over a course_detail row
  if (force_subjects_data == null) {
    const customs = await db.query(
      `SELECT custom_key, source_code, source_sec, data FROM plan_subject_custom WHERE plan_id = $1 ORDER BY id;`,
      [plan_id]
    );
    for (const c of customs.rows || []) {
      subjects_res.push({
        uni_id: undefined,
        note: '', lecturer: undefined, exam_mid: '', exam_final: '', name_en: '', name_th: '', credit: '',
        ...c.data,
        custom_id: c.custom_key,
        source_code: c.source_code,
        source_sec: c.source_sec,
        is_custom: true,
        mute_alert: c.data.mute_alert === true,
      });
    }
  }
  return subjects_res;
}

async function getPlanUser(req, res, ws_session = null) {
  try {
    // checks ws_session is next function on express parameter. if it is. force it to null
    if(ws_session instanceof Function){
      ws_session = null;
    }
    
    const user = ws_session != null ? ws_session.user : await getUserFromRequest(req);
    const { plan_id } = ws_session != null ? ws_session : req.params;

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

      const restricted = await getCoursesetSubjectRestricted(req, ws_session);

      const plan_res = {
        detail: plan_detail,
        subjects: subjects_res,
        restricted: restricted,
      };

      if (plan_detail.user_uid == user.uid) {
        if (ws_session != null) {
          return plan_res;
        }
        res.json(plan_res);
      } else if (plan_detail.status == "public") {
        if (ws_session != null) {
          return plan_res;
        }
        res.json(plan_res);
      } else {
        if (ws_session != null) {
          return { success: false, error: 403, msg: "Plan Not Allow To Aceess" };
        }
        res.status(403).json({
          success: false,
          error: 403,
          msg: "Plan Not Allow To Aceess",
        });
      }
    } else {
      if (ws_session != null) {
        return { success: false, error: 404, msg: "Plan Not Found" };
      }
      
      res
        .status(404)
        .json({ success: false, error: 404, msg: "Plan Not Found" });
    }
  } catch (err) {
    console.error(err);
    if (ws_session != null) {
      return { success: false, error: 500, msg: "Server Sad" };
    }
    res.status(500).send("Server Sad");
  }
}

async function createPlanUser(req, res) {
  try {
    const user = await getUserFromRequest(req);
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

  const user = await getUserFromRequest(req);
  if (plan_detail.rows[0].user_uid !== user.uid) {
    return res.status(403).json({ success: false, error: 403, msg: "Not authorized to update this plan" });
  }
  try {
    const user = await getUserFromRequest(req);
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
    // H5: only columns present in the body are written (undefined = keep; explicit null = clear)
    const cols = {
      plan_name, cr_year, cr_seamseter, plan_color, plan_img, plan_dark, is_folder,
      "ref_folder-plan_id": ref_folder_plan_id, status, cr_id, std_year, plan_settings,
    };
    const sets = [`"uni_id" = COALESCE($1, "uni_id")`, `"fac_id" = COALESCE($2, "fac_id")`, `"major_id" = COALESCE($3, "major_id")`, `"update_at" = to_timestamp($4)`];
    const params = [user.uni_id, user.fac_id, user.major_id, Date.now() / 1000.0];
    for (const [col, val] of Object.entries(cols)) {
      if (val === undefined) continue;
      params.push(val);
      sets.push(`"${col}" = $${params.length}`);
    }
    params.push(plan_id);
    const result = await db.query(
      `UPDATE "plan_detail" SET ${sets.join(", ")} WHERE "plan_id" = $${params.length} RETURNING *;`,
      params
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

  const user = await getUserFromRequest(req);
  if (plan_detail.rows[0].user_uid !== user.uid) {
    return res.status(403).json({ success: false, error: 403, msg: "Not authorized to update this plan" });
  }
  try {
    const user = await getUserFromRequest(req);
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
    const user = await getUserFromRequest(req);
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
    const user = await getUserFromRequest(req);
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
    const user = await getUserFromRequest(req);
    const { plan_id } = req.params;

    const result = await db.query(
      "SELECT * FROM plan_detail WHERE plan_id = $1",
      [plan_id]
    );
    const plan_detail = result.rows[0];
    if (!plan_detail || plan_detail.is_delete) {
      res
        .status(404)
        .json({ success: false, error: 404, msg: "Plan Not Found" });
    } else if (user != null && (plan_detail.user_uid == user.uid || plan_detail.status == "public")) {
      const subjects_res = await getSubjectDataFromPlanSubject(
        plan_id,
        plan_detail.cr_year,
        plan_detail.cr_seamseter
      );

      res.json({ success: true, subjects: subjects_res });
    } else {
      res
        .status(403)
        .json({ success: false, error: 403, msg: "Plan Not Allow To Aceess" });
    }
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: error.code, msg: error.detail });
  }
}
// Hot path during registration: identity is one query, owner check + update_at + row lock are one UPDATE inside the
// save transaction, and the HTTP reply is just { success } (the frontend never reads the saved rows back).
async function updatePlanSubjectsUser(req, res, ws_session = null, ws_body = null) {
  let client = null;
  try {
    // checks ws_session is next function on express parameter. if it is. force it to null
    if(ws_session instanceof Function){
      ws_session = null;
    }
    const fail = (error, msg) => {
      const err = { success: false, error, msg };
      if (ws_session != null) return err;
      return res.status(error).json(err);
    };

    const user = ws_session != null ? ws_session.user : await getUserRowFromRequest(req);
    const { plan_id } = ws_session != null ? ws_session : req.params;
    const { subjects } = ws_body != null ? ws_body : req.body;

    client = await db.connect();
    await client.query("BEGIN");
    // ไม่ให้ user id อื่นอัพเดตข้อมูลได้ — only the owner's row matches; also stamps เวลาแก้ไขตาราง and locks the plan row
    const owned = await client.query(
      `UPDATE "plan_detail" SET "update_at" = to_timestamp($1) WHERE "plan_id" = $2 AND "user_uid" = $3 RETURNING uni_id, cr_year, cr_seamseter`,
      [Date.now() / 1000.0, plan_id, user?.uid]
    );
    if (owned.rows.length === 0) {
      await client.query("ROLLBACK");
      const exists = await client.query("SELECT 1 FROM plan_detail WHERE plan_id = $1", [plan_id]);
      return exists.rows.length > 0 ? fail(403, "Plan Forbidden") : fail(404, "Plan Not Found");
    }
    const plan_detail = owned.rows[0];

    // H7: validate BEFORE touching data
    if (!Array.isArray(subjects)) {
      await client.query("ROLLBACK");
      return fail(400, "subjects must be an array");
    }

    // M20: items carrying custom_id are user-made subjects -> plan_subject_custom; the rest are real course rows
    const customItems = subjects.filter((x) => x && x.custom_id != null);
    const baseItems = subjects.filter((x) => !(x && x.custom_id != null));
    const customRows = [];
    let bad = customItems.length > MAX_CUSTOMS ? "too many custom subjects" : null;
    for (const c of customItems) {
      if (bad) break;
      const r = sanitizeCustomSubject(c);
      if (!r.ok) bad = r.msg;
      else if (customRows.some((x) => x.custom_key === r.row.custom_key)) bad = "duplicate custom_id";
      else customRows.push(r.row);
    }
    if (bad) {
      await client.query("ROLLBACK");
      return fail(400, bad);
    }

    // reset + insert in ONE transaction so a failed INSERT can't leave the plan empty
    await client.query(`DELETE FROM plan_subject WHERE plan_id = $1;`, [plan_id]);
    if (baseItems.length > 0) {
      // one row per (code, sec) — matches UNIQUE(plan_id, code, sec); last one wins
      const uniq = [...new Map(baseItems.map((x) => [`${x.code}|${x.sec}`, x])).values()];
      const sql_placeholders = uniq
        .map((_, i) => `(${[1, 2, 3, 4, 5, 6, 7].map((j) => `$${i * 7 + j}`).join(",")})`)
        .join(",");
      await client.query(
        `INSERT INTO "plan_subject" (plan_id, year, seamster, code, sec, mute_alert, uni_id) VALUES ${sql_placeholders};`,
        uniq.flatMap((subject) => [
          plan_id,
          subject.year,
          subject.semester,
          subject.code,
          subject.sec,
          subject.mute_alert,
          plan_detail.uni_id,
        ])
      );
    }
    await client.query(`DELETE FROM plan_subject_custom WHERE plan_id = $1;`, [plan_id]);
    if (customRows.length > 0) {
      const ph = customRows.map((_, i) => `($1,${[2, 3, 4, 5].map((j) => `$${i * 4 + j}`).join(",")})`).join(",");
      await client.query(
        `INSERT INTO plan_subject_custom (plan_id, custom_key, source_code, source_sec, data) VALUES ${ph};`,
        [plan_id, ...customRows.flatMap((r) => [r.custom_key, r.source_code, r.source_sec, JSON.stringify(r.data)])]
      );
    }
    await client.query("COMMIT");

    if (ws_session != null) {
      // WS draft still returns the saved rows (BUG-PLAN-5 shape); revisit when the WS path is finished (phase B)
      return { success: true, result: await getSubjectDataFromPlanSubject(plan_id, plan_detail.cr_year, plan_detail.cr_seamseter) };
    }
    res.json({ success: true });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.log(err);
    if (ws_session != null) {
      return { success: false, error: err.code, msg: err.detail };
    }
    res.status(400).json({ success: false, error: err.code, msg: err.detail });
  } finally {
    if (client) client.release();
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
