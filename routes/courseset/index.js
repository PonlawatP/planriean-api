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

        const result = {
          data: {
            ...crsr,
            corseset_group: courseset_group.rows[0],
            cr_group_id: undefined,
            uni_id: undefined,
            fac_id: undefined,
            major_key_ref: undefined,
            university: unv.rows[0],
            faculty: fac.rows[0],
            major: crsr.major_key_ref == null ? null : major.rows[0],
          },
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
          "SELECT * FROM courseset_header WHERE uni_id = $1 AND fac_id = $2 AND cr_id = $3;",
          [crsr.uni_id, crsr.fac_id, id]
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
          "SELECT * FROM courseset_subject WHERE uni_id = $1 AND fac_id = $2 AND cr_id = $3;",
          [crsr.uni_id, crsr.fac_id, id]
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

        function sumHeaderDetailInside(objects, parent) {
          for (const object of objects) {
            if (object.cr_head_id_ref === parent.cr_head_id) {
              parent.children.push(object);
              sumHeaderDetailInside(objects, object);
            }
          }
        }
        function sumHeaderDetail(objects, parents) {
          for (const parent of parents) {
            for (const object of objects) {
              if (object.cr_head_id_ref === parent.cr_head_id) {
                parent.children.push(object);
                sumHeaderDetailInside(objects, object);
              }
            }
          }
        }
        sumHeaderDetail(sortedObjects, header_noparent);

        const result = {
          data: header_noparent,
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
      "SELECT code, name_en from course_detail WHERE year = $1 and semester = $2 AND uni_id = $3 GROUP BY code, name_en ORDER BY code asc;",
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
};
