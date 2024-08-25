const db = require("../../db");
const { templateGE } = require("../../utils/customs/msu");
const { getUserFromToken, getUserFromUID } = require("../../utils/userutil");

async function getCoursesetDetail(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { id } = req.params;
    if (user != null) {
      const crs = await db.query(
        "SELECT * FROM courseset_detail WHERE cr_id = $1;",
        [id]
      );
      if (crs.rows.length > 0) {
        const crsr = crs.rows[0];
        const unv = await db.query(
          "SELECT * FROM university_detail WHERE uni_id = $1;",
          [crsr.uni_id]
        );
        const fac = await db.query(
          "SELECT * FROM university_faculty WHERE uni_id = $1 AND fac_id = $2;",
          [crsr.uni_id, crsr.fac_id]
        );
        const major = await db.query(
          "SELECT * FROM university_major WHERE uni_id = $1 AND fac_id = $2 AND major_id = $3;",
          [crsr.uni_id, crsr.fac_id, crsr.major_key_ref]
        );
        const courseset_group = await db.query(
          "SELECT name_en, name_th FROM courseset_group WHERE uni_id = $1 AND cr_group_id = $2;",
          [crsr.uni_id, crsr.cr_group_id]
        );

        const contents = await getCoursesetSubject(req);

        const result = {
          ...crsr,
          corseset_group: courseset_group.rows[0],
          cr_group_id: undefined,
          uni_id: undefined,
          fac_id: undefined,
          major_key_ref: undefined,
          university: unv.rows[0],
          faculty: fac.rows[0],
          major: crsr.major_key_ref == null ? null : major.rows[0],
          contents,
        };
        res.json(result);
      } else {
        throw new Error("error!");
      }
    } else {
      throw new Error("error!");
    }
  } catch (err) {
    console.error(err);
    res.status(404).send("Courseset Not Found");
  }
}
async function getCoursesetSubject(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { id } = req.params;
    if (user != null) {
      const crs = await db.query(
        "SELECT * FROM courseset_detail WHERE cr_id = $1;",
        [id]
      );
      if (crs.rows.length > 0) {
        const crsr = crs.rows[0];
        const courseset_header = await db.query(
          "SELECT * FROM courseset_header WHERE uni_id = $1 AND cr_id = $2;",
          [crsr.uni_id, id]
        );

        function compareCrHeadId(a, b) {
          return a.cr_head_id.localeCompare(b.cr_head_id);
        }

        const cr_hdd = courseset_header.rows.map((r) => {
          return {
            ...r,
            cr_id: undefined,
            fac_id: undefined,
            uni_id: undefined,
            cr_id_ref: undefined,
            fac_id_ref: undefined,
            uni_id_ref: undefined,
            children: [],
            subjects: [],
            // cr_head_id_ref: undefined
          };
        });
        let sortedObjects = cr_hdd.sort(compareCrHeadId);

        // TODO: add courseset subjects here
        const courseset_subject = await db.query(
          "SELECT * FROM courseset_subject WHERE uni_id = $1 AND cr_id = $2;",
          [crsr.uni_id, id]
        );

        for (const head of sortedObjects) {
          for (const subj of courseset_subject.rows) {
            if (subj.cr_head_id == head.cr_head_id) {
              head.subjects.push({
                ...subj,
                cr_id: undefined,
                fac_id: undefined,
                uni_id: undefined,
              });
            }
          }
        }

        let header_noparent = sortedObjects.filter(
          (f) => f.cr_head_id_ref == null
        );

        const sortedHeaders = (headers) =>
          headers.sort((a, b) => {
            const aParts = a.cr_head_id.split(".").map(Number);
            const bParts = b.cr_head_id.split(".").map(Number);

            for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
              const aPart = aParts[i] || 0;
              const bPart = bParts[i] || 0;

              if (aPart !== bPart) {
                return aPart - bPart;
              }
            }

            return 0;
          });

        function sumHeaderDetailInside(objects, parent) {
          for (const object of objects) {
            if (object.cr_head_id_ref === parent.cr_head_id) {
              parent.children.push(object);
              sumHeaderDetailInside(objects, object);
            }
          }
          parent.children = sortedHeaders(parent.children);
        }
        function sumHeaderDetail(objects, parents) {
          for (const parent of parents) {
            for (const object of objects) {
              if (object.cr_head_id_ref === parent.cr_head_id) {
                parent.children.push(object);
                sumHeaderDetailInside(objects, object);
              }
              parent.children = sortedHeaders(parent.children);
            }
          }
        }
        sumHeaderDetail(sortedObjects, header_noparent);

        const result = {
          data: sortedHeaders(header_noparent),
        };

        if (!res) return header_noparent;
        res.json(result);
      } else {
        throw new Error("error!");
      }
    } else {
      throw new Error("error!");
    }
  } catch (err) {
    console.error(err);
    res.status(404).send("Courseset Not Found");
  }
}
async function getCoursesetSubjectRestricted(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { plan_id } = req.params;

    let plan_restrict = null;
    if (user != null || user.std_start_year == null) {
      const crs = await db.query(
        "SELECT * FROM plan_detail WHERE plan_id = $1;",
        [plan_id]
      );
      if (crs.rows.length > 0) {
        const plan = crs.rows[0];
        const plan_user = await getUserFromUID(plan.user_uid);

        const plan_restricts = await db.query(
          "SELECT * FROM courseset_restrictgrp WHERE cr_id = $1 AND uni_id = $2 AND std_year = $3 AND term = $4;",
          [plan.cr_id, plan.uni_id, plan.std_year, plan.cr_seamseter]
        );

        for (const prs of plan_restricts.rows) {
          const plan_restrict_users = await db.query(
            "SELECT * FROM restrictgrp_user WHERE cr_restgrp_id = $1 AND std_id = $2;",
            [prs.cr_restgrp_id, plan_user.std_id]
          );
          if (plan_restrict_users.rows.length > 0) {
            const plan_restrict_subjects = await db.query(
              "SELECT * FROM restrictgrp_subject WHERE cr_restgrp_id = $1;",
              [prs.cr_restgrp_id]
            );
            plan_restrict = { ...prs, subjects: plan_restrict_subjects.rows };
          }
        }
      }
      const result = {
        plan_restrict,
      };
      res.json(result);
    }
  } catch (err) {
    console.error(err);
    const result = {
      plan_restrict,
    };
    res.status(404).json(result);
  }
}

async function getSubjectGroups(req, res) {
  try {
    const { year, semester } = req.params;
    // console.log(year, semester);
    // return;
    // if (user != null) {
    let crs = await db.query(
      "SELECT fac_id, fac_key, fac_name_en, fac_name_th FROM university_faculty WHERE uni_id = $1 ORDER BY fac_id;",
      [1]
    );
    const crs_sujs = await db.query(
      `
      SELECT 
          course_detail.code, 
          course_detail.name_en, 
          courseset_subject.suj_name_th as name_th
      FROM 
          course_detail 
      LEFT JOIN 
          courseset_subject 
      ON 
          courseset_subject.suj_real_id = course_detail.suj_real_code 
      WHERE 
          course_detail.year = $1 
          AND course_detail.semester = $2 
          AND course_detail.uni_id = $3 
      GROUP BY
          course_detail.code,
          course_detail.name_en,
          courseset_subject.suj_name_th 
      ORDER BY 
          course_detail.code ASC;
      `,
      [year, semester, 1]
    );
    // console.log(crs.rows);
    // console.log(crs_sujs.rows);

    crs = crs.rows.map((m) => {
      return {
        ...m,
        groups:
          m.fac_id == 0
            ? templateGE.map((t) => {
                return {
                  ...t,
                  global: false,
                  startsWith: undefined,
                  subjects: crs_sujs.rows.filter((s) =>
                    s.code.startsWith(String(t.startsWith).padStart(2, "0"))
                  ),
                };
              })
            : [
                {
                  global: true,
                  subjects: crs_sujs.rows.filter((s) =>
                    s.code.startsWith(String(m.fac_id).padStart(2, "0"))
                  ),
                },
                // {
                //   header: "หมวดหมู่ที่ 1",
                //   desc: "ทักษะการเรียนรู้ตลอดชีวิต",
                //   global: false,
                //   subjects: crs_sujs.rows.filter((s) =>
                //     s.code.startsWith(String(m.fac_id).padStart(2, "0"))
                //   ),
                // },
              ],
      };
    });
    // console.log(crs);
    // if (crs.rows.length > 0) {
    //   const crsr = crs.rows[0];
    //   const unv = await db.query(
    //     "SELECT * FROM university_detail WHERE uni_id = $1;",
    //     [crsr.uni_id]
    //   );
    //   const fac = await db.query(
    //     "SELECT * FROM university_faculty WHERE uni_id = $1 AND fac_id = $2;",
    //     [crsr.uni_id, crsr.fac_id]
    //   );
    //   const major = await db.query(
    //     "SELECT * FROM university_major WHERE uni_id = $1 AND fac_id = $2 AND major_id = $3;",
    //     [crsr.uni_id, crsr.fac_id, crsr.major_key_ref]
    //   );
    //   const courseset_group = await db.query(
    //     "SELECT name_en, name_th FROM courseset_group WHERE uni_id = $1 AND cr_group_id = $2;",
    //     [crsr.uni_id, crsr.cr_group_id]
    //   );

    const result = {
      data: crs,
    };
    res.json(result);
    // } else {
    //   throw new Error("error!");
    // }
    // } else {
    //   throw new Error("error!");
    // }
  } catch (err) {
    console.error(err);
    res.status(404).send("Courseset Not Found");
  }
}

async function getLectureGroups(req, res) {
  try {
    const { year, semester } = req.params;
    // console.log(year, semester);
    // return;
    // if (user != null) {
    let crs_ltrs = await db.query(
      "SELECT lecturer from course_detail WHERE year = $1 and semester = $2 AND uni_id = $3 GROUP BY lecturer;",
      [year, semester, 1]
    );

    crs_ltrs = crs_ltrs.rows
      .map((l) => {
        return { l: l.lecturer.split(" / ") };
      })
      .flatMap((l) => l.l)
      .filter((l) => l != "");

    const uniqueNames = Array.from(new Set(crs_ltrs));

    // console.log(uniqueNames);

    const result = {
      data: uniqueNames,
    };
    res.json(result);
    // } else {
    //   throw new Error("error!");
    // }
    // } else {
    //   throw new Error("error!");
    // }
  } catch (err) {
    console.error(err);
    res.status(404).send("Courseset Not Found");
  }
}

/** TODO: Admin section */
async function a_addCoursesetDetail(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id } = req.params;
    const {
      name_th,
      credit,
      year,
      lowset_grade,
      cr_id,
      cr_key,
      og_link,
      major_key_ref,
      name_en,
      fac_id,
      cr_group_id,
    } = req.body;

    // Insert the new courseset detail
    const insertResult = await db.query(
      `INSERT INTO courseset_detail (
        uni_id, fac_id, cr_group_id, cr_id, cr_key, name_th, name_en, credit, year, lowset_grade, og_link, major_key_ref
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )`,
      [
        uni_id,
        fac_id,
        cr_group_id,
        cr_id,
        cr_key,
        name_th,
        name_en,
        credit,
        year,
        lowset_grade,
        og_link,
        major_key_ref,
      ]
    );

    if (insertResult.rowCount > 0) {
      res.status(201).json({
        success: true,
        message: "Courseset Detail added successfully",
      });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Failed to add Courseset Detail" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to add Courseset Detail" });
  }
}

async function a_removeCoursesetDetail(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_id } = req.params;

    // Delete the courseset detail
    const deleteResult = await db.query(
      `DELETE FROM courseset_detail WHERE uni_id = $1 AND cr_id = $2`,
      [uni_id, cr_id]
    );

    if (deleteResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "Courseset Detail removed successfully",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "Courseset Detail not found" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to remove Courseset Detail" });
  }
}

async function a_editCoursesetDetail(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_id } = req.params;
    const {
      name_th,
      credit,
      year,
      lowset_grade,
      cr_key,
      og_link,
      major_key_ref,
      name_en,
      fac_id,
    } = req.body;

    // Update the courseset detail
    const updateResult = await db.query(
      `UPDATE courseset_detail SET 
        name_th = $1, credit = $2, year = $3, lowset_grade = $4, cr_key = $5, og_link = $6, major_key_ref = $7, name_en = $8
      WHERE 
        uni_id = $9 AND fac_id = $10 AND cr_id = $11`,
      [
        name_th,
        credit,
        year,
        lowset_grade,
        cr_key,
        og_link,
        major_key_ref,
        name_en,
        uni_id,
        fac_id,
        cr_id,
      ]
    );

    if (updateResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "Courseset Detail updated successfully",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "Courseset Detail not found" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to update Courseset Detail" });
  }
}
// Course set header
async function a_addCoursesetHeader(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_id } = req.params;
    const {
      fac_id,
      cr_head_id,
      cr_name_en,
      cr_name_th,
      cr_id_ref,
      fac_id_ref,
      uni_id_ref,
      cr_head_id_ref,
      cr_min_credit_ref,
    } = req.body;

    // Insert the new courseset header
    const insertResult = await db.query(
      `INSERT INTO courseset_header (
        uni_id, fac_id, cr_id, cr_head_id, cr_name_en, cr_name_th, cr_id_ref, fac_id_ref, uni_id_ref, cr_head_id_ref, cr_min_credit_ref
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )`,
      [
        uni_id,
        fac_id,
        cr_id,
        cr_head_id,
        cr_name_en,
        cr_name_th,
        cr_id_ref,
        fac_id_ref,
        uni_id_ref,
        cr_head_id_ref,
        cr_min_credit_ref,
      ]
    );

    if (insertResult.rowCount > 0) {
      res.status(201).json({
        success: true,
        message: "Courseset Header added successfully",
      });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Failed to add Courseset Header" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to add Courseset Header" });
  }
}

async function a_removeCoursesetHeader(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_id, cr_head_id } = req.params;

    // Delete the courseset header
    const deleteResult = await db.query(
      `DELETE FROM courseset_header WHERE uni_id = $1 AND cr_id = $2 AND cr_head_id = $3`,
      [uni_id, cr_id, cr_head_id]
    );

    if (deleteResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "Courseset Header removed successfully",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "Courseset Header not found" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to remove Courseset Header" });
  }
}

async function a_editCoursesetHeader(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_id, cr_head_id } = req.params;
    const {
      fac_id,
      cr_name_en,
      cr_name_th,
      cr_id_ref,
      fac_id_ref,
      uni_id_ref,
      cr_head_id_ref,
      cr_min_credit_ref,
    } = req.body;

    // Update the courseset header
    const updateResult = await db.query(
      `UPDATE courseset_header SET 
        cr_name_en = $1, cr_name_th = $2, cr_id_ref = $3, fac_id_ref = $4, uni_id_ref = $5, cr_head_id_ref = $6, cr_min_credit_ref = $7, fac_id = $8
      WHERE 
        uni_id = $9 AND cr_id = $10 AND cr_head_id = $11`,
      [
        cr_name_en,
        cr_name_th,
        cr_id_ref,
        fac_id_ref,
        uni_id_ref,
        cr_head_id_ref,
        cr_min_credit_ref,
        fac_id,
        uni_id,
        cr_id,
        cr_head_id,
      ]
    );

    if (updateResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "Courseset Header updated successfully",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "Courseset Header not found" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to update Courseset Header" });
  }
}
// Course set subject
async function a_addCoursesetSubject(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_id } = req.params;
    const {
      fac_id,
      cr_head_id,
      suj_name_en,
      suj_name_th,
      suj_credit,
      suj_pre_req,
      suj_real_id,
      suj_id,
    } = req.body;

    // Insert the new courseset subject
    const insertResult = await db.query(
      `INSERT INTO courseset_subject (
        uni_id, fac_id, cr_id, cr_head_id, suj_id, suj_name_en, suj_name_th, suj_credit, suj_pre_req, suj_real_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )`,
      [
        uni_id,
        fac_id,
        cr_id,
        cr_head_id,
        suj_id,
        suj_name_en,
        suj_name_th,
        suj_credit,
        suj_pre_req,
        suj_real_id,
      ]
    );

    if (insertResult.rowCount > 0) {
      res.status(201).json({
        success: true,
        message: "Courseset Subject added successfully",
      });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Failed to add Courseset Subject" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to add Courseset Subject" });
  }
}

async function a_removeCoursesetSubject(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_id, suj_id } = req.params;

    // Delete the courseset subject
    const deleteResult = await db.query(
      `DELETE FROM courseset_subject WHERE uni_id = $1 AND cr_id = $2 AND suj_id = $3`,
      [uni_id, cr_id, suj_id]
    );

    if (deleteResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "Courseset Subject removed successfully",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "Courseset Subject not found" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to remove Courseset Subject" });
  }
}

async function a_editCoursesetSubject(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_id, suj_id } = req.params;
    const {
      fac_id,
      suj_name_en,
      suj_name_th,
      suj_credit,
      suj_pre_req,
      suj_real_id,
    } = req.body;

    // Update the courseset subject
    const updateResult = await db.query(
      `UPDATE courseset_subject SET 
        suj_name_en = $1, suj_name_th = $2, suj_credit = $3, suj_pre_req = $4, suj_real_id = $5, fac_id = $6
      WHERE 
        uni_id = $7 AND cr_id = $8 AND suj_id = $9`,
      [
        suj_name_en,
        suj_name_th,
        suj_credit,
        suj_pre_req,
        suj_real_id,
        fac_id,
        uni_id,
        cr_id,
        suj_id,
      ]
    );

    if (updateResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "Courseset Subject updated successfully",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "Courseset Subject not found" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to update Courseset Subject" });
  }
}

async function a_addCoursesetSubjectRestrictedGroup(req, res) {
  try {
    const user = await getUserFromToken(req);
    if (user != null) {
      const user_role = await getUserRole(user);
      if (
        user_role.role != "user" &&
        user_role.fac_id != null &&
        user_role.major_id != null
      ) {
        // add coursesetsubject
      } else {
      }
    } else {
    }
  } catch (err) {
    res.status(500).send("error");
  }
}

module.exports = {
  getCoursesetDetail,
  getCoursesetSubject,
  getCoursesetSubjectRestricted,
  getSubjectGroups,
  getLectureGroups,
  a_addCoursesetDetail,
  a_removeCoursesetDetail,
  a_editCoursesetDetail,
  a_addCoursesetHeader,
  a_removeCoursesetHeader,
  a_editCoursesetHeader,
  a_addCoursesetSubject,
  a_removeCoursesetSubject,
  a_editCoursesetSubject,
};
