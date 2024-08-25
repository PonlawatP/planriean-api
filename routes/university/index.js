const db = require("../../db");
const {
  semesterRoundGroupData,
  semesterYearGroupData,
} = require("../../utils/seasonutil");
const { getUserFromToken } = require("../../utils/userutil");

async function getUniversityList(req, res) {
  try {
    const university_list = await db.query(`SELECT 
    *,
    to_char(
      refresh_updated_at AT TIME ZONE 'UTC' + interval '543 years',
      'DD/MM/YY HH24:MI:SS'
    ) AS refresh_updated_at
  FROM 
    university_detail ORDER BY uni_id;`);

    const result = {
      data: university_list.rows,
    };
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(404).send("University Not Found");
  }
}

async function getUniversityDetail(req, res) {
  try {
    const { uni_id } = req.params;
    const { type = "normal" } = req.query;
    // console.log(type);
    const uni = await getUniversityDetailFunc(uni_id, type);
    if (uni != null) {
      res.json(uni);
    } else {
      throw new Error("error");
    }
  } catch (err) {
    console.error(err);
    res.status(404).send("University Not Found");
  }
}

async function getUniversityDetailFunc(uni_id, type) {
  const university_list = await db.query(
    `SELECT *,
    to_char(
      refresh_updated_at AT TIME ZONE 'UTC' + interval '543 years',
      'DD/MM/YY HH24:MI:SS'
    ) AS refresh_updated_at FROM university_detail WHERE uni_id = $1;`,
    [uni_id]
  );
  if (university_list.rows.length != 0) {
    const faculty_list = await db.query(
      "SELECT * FROM university_faculty WHERE uni_id = $1 ORDER BY fac_id;",
      [uni_id]
    );
    let facultys = faculty_list.rows;
    const learn_group = await db.query("SELECT * FROM courseset_group;");
    for (const faculty of facultys) {
      faculty.uni_id = undefined;

      faculty.coursesets = structuredClone(learn_group.rows);
      for (const courseset of faculty.coursesets) {
        courseset.uni_id = undefined;

        const major_list = await db.query(
          "SELECT name_th, credit, year, lowset_grade, fac_id, cr_id, cr_key, uni_id, courseset_id, major_key_ref, cr_group_id, name_en FROM courseset_detail WHERE uni_id = $1 AND fac_id = $2 AND cr_group_id = $3 ORDER BY cr_id;",
          [uni_id, faculty.fac_id, courseset.cr_group_id]
        );
        // console.log(major_list.rows)
        if (type == "major_group") {
          let grouping = [];
          for (const cld of major_list.rows) {
            let gr = grouping.find(
              (g) => g.cr_key.toLowerCase() == cld.cr_key.toLowerCase()
            );
            if (gr == null) {
              grouping.push({
                cr_key: cld.cr_key.toUpperCase(),
                name_th: cld.name_th,
                name_en: cld.name_en,
                children: [
                  {
                    cr_id: cld.cr_id,
                    courseset_id: cld.courseset_id,
                    cr_group_id: cld.cr_group_id,
                  },
                ],
              });
            } else {
              gr.children.push({
                cr_id: cld.cr_id,
                courseset_id: cld.courseset_id,
                cr_group_id: cld.cr_group_id,
              });
            }
          }
          // console.log(grouping);
          courseset.children = grouping;
        } else {
          courseset.children = major_list.rows;
        }
      }
    }
    const result = {
      university_data: university_list.rows[0],
      facultys,
      coursesets: learn_group.rows,
    };
    return result;
  } else {
    return null;
  }
}
async function getUniversitySeasons(req, res) {
  const { uni_id } = req.params;

  const university_list = await db.query(
    `SELECT *,
    to_char(
      refresh_updated_at AT TIME ZONE 'UTC' + interval '543 years',
      'DD/MM/YY HH24:MI:SS'
    ) AS refresh_updated_at FROM university_detail WHERE uni_id = $1;`,
    [uni_id]
  );
  if (university_list.rows.length != 0) {
    const seamster_detail = await db.query(
      "SELECT * FROM seamster_detail WHERE uni_id = $1;",
      [uni_id]
    );

    const years = [];

    for (let index = 0; index < seamster_detail.rows.length; index++) {
      const d = seamster_detail.rows[index];

      const seamster_rounding = await db.query(
        "SELECT * FROM seamster_rounding WHERE seamster_id = $1;",
        [d.seamster_id]
      );

      const semesters = semesterRoundGroupData(seamster_rounding.rows);

      years.push({
        ...d,
        uni_id: undefined,
        seamster_id: undefined,
        seamster_rounding: semesters,
      });
    }
    const result = {
      years: semesterYearGroupData(years),
    };
    res.json(result);
    return result;
  } else {
    res.status(404).send("University Not Found");
    return null;
  }
}

async function getUniversityDetailWithNameFunc(uni_name) {
  const university_list = await db.query(
    `SELECT *,
    to_char(
      refresh_updated_at AT TIME ZONE 'UTC' + interval '543 years',
      'DD/MM/YY HH24:MI:SS'
    ) AS refresh_updated_at FROM university_detail WHERE uni_key = $1;`,
    [uni_name]
  );
  if (university_list.rows.length != 0) {
    const faculty_list = await db.query(
      `SELECT *,
    to_char(
      refresh_updated_at AT TIME ZONE 'UTC' + interval '543 years',
      'DD/MM/YY HH24:MI:SS'
    ) AS refresh_updated_at FROM university_faculty WHERE uni_id = $1;`,
      [university_list.rows[0].uni_id]
    );
    let facultys = faculty_list.rows;
    for (const faculty of facultys) {
      faculty.uni_id = undefined;

      const learn_group = await db.query("SELECT * FROM courseset_group;");
      faculty.coursesets = learn_group.rows;
      for (const courseset of faculty.coursesets) {
        courseset.uni_id = undefined;

        const major_list = await db.query(
          "SELECT * FROM courseset_detail WHERE uni_id = $1 AND fac_id = $2 AND cr_group_id = $3;",
          [
            university_list.rows[0].uni_id,
            faculty.fac_id,
            courseset.cr_group_id,
          ]
        );
        // console.log(major_list.rows)
        courseset.children = major_list.rows;
      }
    }
    const result = {
      university_data: university_list.rows[0],
      facultys: facultys,
    };
    return result;
  } else {
    return null;
  }
}

/** Admin section: university */
async function addUniversityDetail(req, res) {
  try {
    const user = await getUserFromToken(req);

    const { uni_key, uni_name_th, uni_name_en, uni_logo } = req.body;

    const preInsertResult = await db.query(
      `SELECT uni_id FROM university_detail ORDER BY uni_id DESC LIMIT 1;`,
      []
    );

    let uni_id = 1;
    if (preInsertResult.rowCount > 0) {
      uni_id = preInsertResult.rows[0].uni_id + 1;
    }

    const insertResult = await db.query(
      `INSERT INTO university_detail (uni_key, uni_name_th, uni_name_en, uni_logo, uni_id) VALUES ($1, $2, $3, $4, $5)`,
      [uni_key, uni_name_th, uni_name_en, uni_logo, uni_id]
    );

    if (insertResult.rowCount > 0) {
      res.status(201).json({
        success: true,
        message: "University detail added successfully",
      });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Failed to add university detail" });
    }
  } catch (err) {
    // console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to add university detail" });
  }
}
async function removeUniversityDetail(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id } = req.params;

    const deleteResult = await db.query(
      `DELETE FROM university_detail WHERE uni_id = $1`,
      [uni_id]
    );

    if (deleteResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "University detail removed successfully",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "University detail not found" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to remove university detail" });
  }
}

async function editUniversityDetail(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id } = req.params;
    const { uni_key, uni_name_th, uni_name_en, enabled, uni_logo } = req.body;

    const updateResult = await db.query(
      `UPDATE university_detail SET uni_key = $1, uni_name_th = $2, uni_name_en = $3, uni_logo = $4, enabled = $5 WHERE uni_id = $6`,
      [uni_key, uni_name_th, uni_name_en, uni_logo, enabled, uni_id]
    );

    if (updateResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "University detail updated successfully",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "University detail not found" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to update university detail" });
  }
}

/** Admin section: faculty */
async function addFacultyDetail(req, res) {
  try {
    const user = await getUserFromToken(req);

    const { uni_id } = req.params;
    const {
      fac_id,
      fac_key,
      fac_name_en,
      fac_name_th,
      bg_img,
      bg_color,
      icon,
      place_key,
    } = req.body;

    const insertResult = await db.query(
      `INSERT INTO university_faculty (fac_id, fac_key, fac_name_en, fac_name_th, bg_img, bg_color, icon, place_key, uni_id) 
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        );`,
      [
        fac_id,
        fac_key,
        fac_name_en,
        fac_name_th,
        bg_img,
        bg_color,
        icon,
        place_key,
        uni_id,
      ]
    );

    if (insertResult.rowCount > 0) {
      res.status(201).json({
        success: true,
        message: "University Faculty added successfully",
      });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Failed to add university faculty" });
    }
  } catch (err) {
    // console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to add university faculty" });
  }
}
async function removeFacultyDetail(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, fac_id } = req.params;

    const deleteResult = await db.query(
      `DELETE FROM university_faculty WHERE uni_id = $1 AND fac_id = $2`,
      [uni_id, fac_id]
    );

    if (deleteResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "University Faculty removed successfully",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "University Faculty not found" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to remove university faculty" });
  }
}

async function editFacultyDetail(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, fac_id } = req.params;
    const {
      fac_key,
      fac_name_en,
      fac_name_th,
      bg_img,
      bg_color,
      icon,
      place_key,
    } = req.body;

    const updateResult = await db.query(
      `UPDATE university_faculty SET fac_key = $1, fac_name_en = $2, fac_name_th = $3, bg_img = $4, bg_color = $5, icon = $6, place_key = $7 WHERE uni_id = $8 AND fac_id = $9`,
      [
        fac_key,
        fac_name_en,
        fac_name_th,
        bg_img,
        bg_color,
        icon,
        place_key,
        uni_id,
        fac_id,
      ]
    );

    if (updateResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "University Faculty updated successfully",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "University Faculty not found" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to update university faculty" });
  }
}

module.exports = {
  getUniversityList,
  getUniversityDetail,
  getUniversitySeasons,
  getUniversityDetailFunc,
  getUniversityDetailWithNameFunc,
  addUniversityDetail,
  removeUniversityDetail,
  editUniversityDetail,
  addFacultyDetail,
  removeFacultyDetail,
  editFacultyDetail,
};
