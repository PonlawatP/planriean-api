const db = require("../../db");
const redis = require("../../redis");
const { templateGE } = require("../../utils/customs/msu");
const { getUserFromRequest, getUserFromUID } = require("../../utils/userutil");
const { getSubjectDataFromPlanRestrictSubject } = require("../plan-restrict");
const CACHE_DURATION = 60 * 60; // 1 hour in seconds

async function getCoursesetDetail(req, res) {
  try {
    const user = await getUserFromRequest(req);
    const { cr_id } = req.params;
    if (user != null) {
      const crs = await db.query(
        "SELECT * FROM courseset_detail WHERE cr_id = $1;",
        [cr_id]
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
async function getCoursesetMapping(req, res) {
  try {
    const user = await getUserFromRequest(req);
    const { cr_id } = req.params;

    if (user != null) {
      const cr = await db.query(
        "SELECT * FROM courseset_detail WHERE cr_id = $1;",
        [cr_id]
      );

      if (cr.rows.length > 0) {
        const crs = await db.query(
          "SELECT * FROM courseset_subjectplan WHERE cr_id = $1 ORDER BY cr_id;",
          [cr_id]
        );
        const subjectsData = await db.query(
          "SELECT * FROM courseset_subject WHERE cr_id = $1;",
          [cr_id]
        );
        const headersData = await db.query(
          "SELECT * FROM courseset_header WHERE cr_id = $1;",
          [cr_id]
        );

        let pre_result = {};

        crs.rows.forEach((item) => {
          const year = item.std_year;
          const { term, suj_id } = item;
          const credit = parseInt(item.credit.match(/\d+/)[0]); // Extract the number from credit

          if (!pre_result[year]) {
            pre_result[year] = {
              semesters: {},
            };
          }

          if (!pre_result[year].semesters[term]) {
            pre_result[year].semesters[term] = {
              subjects: {},
            };
          }

          const subjectIndex = Object.keys(
            pre_result[year].semesters[term].subjects
          ).length;
          pre_result[year].semesters[term].subjects[subjectIndex] = {
            ...(suj_id.includes("h-")
              ? {
                ...headersData.rows.find(
                  (f) => f.cr_head_id == suj_id.split("h-")[1]
                ),
              }
              : {
                suj_id: suj_id,
                ...subjectsData.rows.find((f) => f.suj_id == suj_id),
              }),
            credit: credit,
          };
        });

        const result = {
          years: pre_result,
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
    const user = await getUserFromRequest(req);
    const { cr_id } = req.params;
    if (user != null) {
      const crs = await db.query(
        "SELECT * FROM courseset_detail WHERE cr_id = $1;",
        [cr_id]
      );
      if (crs.rows.length > 0) {
        const crsr = crs.rows[0];
        const courseset_header = await db.query(
          "SELECT * FROM courseset_header WHERE uni_id = $1 AND cr_id = $2;",
          [crsr.uni_id, cr_id]
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
          [crsr.uni_id, cr_id]
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

async function getCoursesetSubjectRestricted(req, ws_session = null) {
  try {
    // checks ws_session is next function on express parameter. if it is. force it to null
    if(ws_session instanceof Function){
      ws_session = null;
    }
    
    const user = ws_session != null ? ws_session.user : await getUserFromRequest(req);
    const { plan_id } = ws_session != null ? ws_session : req.params;

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
          [plan.cr_id, plan.uni_id, plan.cr_year, plan.cr_seamseter]
        );

        for (const prs of plan_restricts.rows) {
          const plan_restrict_users = await db.query(
            "SELECT * FROM restrictgrp_user WHERE cr_restgrp_id = $1 AND std_id = $2;",
            [prs.cr_restgrp_id, plan_user.std_id]
          );
          if (plan_restrict_users.rows.length > 0) {

            const subjects_res = await getSubjectDataFromPlanRestrictSubject(
              prs.cr_restgrp_id,
              plan.cr_year,
              plan.cr_seamseter
            );
            plan_restrict = { detail: prs, subjects: subjects_res };
          }
        }
      }

      return plan_restrict;
    }
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function getSubjectGroups(req, res) {
  try {
    const { uni_id = 1, year, semester } = req.params;
    const { type = "normal", no_subjects = false } = req.query;

    const result_updated = await db.query(
      `SELECT LOWER(uni_key) as uni_key, to_char(
          refresh_updated_at + interval '543 years',
          'DD/MM/YY HH24:MI:SS'
      ) AS formatted_date FROM university_detail WHERE uni_id = $1`,
      [uni_id]
    );

    const uni_key = result_updated.rows[0].uni_key;

    // Create cache key
    const cacheKey = `planriean-${uni_key}:subjectgroups:${year}-${semester}:${type}-${no_subjects ? "no_subjects" : "with_subjects"}`;

    // Check if cache is valid
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      return res.json({ cached: true, data: JSON.parse(cachedData) });
    }

    // If no cache or expired, get fresh data
    let crs = await db.query(
      "SELECT fac_id, fac_key, fac_name_en, fac_name_th FROM university_faculty WHERE uni_id = $1 AND enabled = TRUE ORDER BY fac_id;",
      [uni_id]
    );
    const crs_sujs = await db.query(
      `
        SELECT
            course_detail.code,  
            course_detail.name_en, 
            (
                SELECT suj_name_th 
                FROM courseset_subject 
                WHERE suj_real_id = course_detail.suj_real_code 
                LIMIT 1
            ) as name_th
            ,CAST(COUNT(sec) AS INTEGER) as total_sec
            ${type == "review" ? ",CAST((SELECT COUNT(*) FROM subject_review WHERE suj_real_code = course_detail.suj_real_code) AS INTEGER) as total_review, course_detail.suj_real_code" : ""}
        FROM 
            course_detail 
        WHERE 
            course_detail.year = $1 
            AND course_detail.semester = $2 
            AND course_detail.uni_id = $3 
        GROUP BY
            code,
            name_en,
            suj_real_code
        ORDER BY 
            course_detail.code ASC;
      `,
      [year, semester, uni_id]
    );

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
                subjects: no_subjects
                  ? undefined
                  : crs_sujs.rows.filter((s) =>
                    s.code.startsWith(String(t.startsWith).padStart(2, "0"))
                  ),
              };
            })
            : [
              {
                global: true,
                subjects: no_subjects
                  ? undefined
                  : crs_sujs.rows.filter((s) =>
                    s.code.startsWith(String(m.fac_id).padStart(2, "0"))
                  ),
              },
            ],
      };
    });

    const result = {
      cached: false,
      data: crs,
    };

    // Store in Redis cache
    try {
      const pipeline = redis.pipeline();
      pipeline.set(cacheKey, JSON.stringify(crs), 'EX', CACHE_DURATION); // Cache for 30 seconds
      await pipeline.exec();
    } catch (redisError) {
      console.error('Redis pipeline failed:', redisError);
    }

    res.json({ cached: false, data: crs });
  } catch (err) {
    console.error(err);
    res.status(404).send("Courseset Not Found");
  }
}

async function getLectureGroups(req, res) {
  try {
    const { uni_id = 1, year, semester } = req.params;
    // console.log(year, semester);
    // return;
    // if (user != null) {
    let crs_ltrs = await db.query(
      "SELECT lecturer from course_detail WHERE year = $1 and semester = $2 AND uni_id = $3 GROUP BY lecturer;",
      [year, semester, uni_id]
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
    const user = await getUserFromRequest(req);
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
        message: "เพิ่มหลักสูตรแล้ว",
      });
    } else {
      res
        .status(500)
        .json({ success: false, message: "เพิ่มหลักสูตรไม่ได้" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "เพิ่มหลักสูตรไม่ได้" });
  }
}

async function a_removeCoursesetDetail(req, res) {
  try {
    const user = await getUserFromRequest(req);
    const { uni_id, cr_id } = req.params;

    // Delete the courseset detail
    const deleteResult = await db.query(
      `DELETE FROM courseset_detail WHERE uni_id = $1 AND cr_id = $2`,
      [uni_id, cr_id]
    );

    if (deleteResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "ลบหลักสูตรแล้ว",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "ไม่มีหลักสูตร" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "ลบหลักสูตรไม่ได้" });
  }
}

async function a_editCoursesetDetail(req, res) {
  try {
    const user = await getUserFromRequest(req);
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
        message: "อัพเดตหลักสูตรแล้ว",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "ไม่มีหลักสูตร" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "อัพเดตหลักสูตรไม่ได้" });
  }
}
// Course set header
async function a_addCoursesetHeader(req, res) {
  try {
    const user = await getUserFromRequest(req);
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
        message: "เพิ่มหัวข้อหลักสูตรแล้ว",
      });
    } else {
      res
        .status(500)
        .json({ success: false, message: "เพิ่มหัวข้อหลักสูตรไม่ได้" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "เพิ่มหัวข้อหลักสูตรไม่ได้" });
  }
}

async function a_removeCoursesetHeader(req, res) {
  try {
    const user = await getUserFromRequest(req);
    const { uni_id, cr_id, cr_head_id } = req.params;

    // Delete the courseset header
    const deleteResult = await db.query(
      `DELETE FROM courseset_header WHERE uni_id = $1 AND cr_id = $2 AND cr_head_id = $3`,
      [uni_id, cr_id, cr_head_id]
    );

    if (deleteResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "ลบหัวข้อหลักสูตรแล้ว",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "ไม่มีหัวข้อหลักสูตร" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "ลบหัวข้อหลักสูตรไม่ได้" });
  }
}

async function a_editCoursesetHeader(req, res) {
  try {
    const user = await getUserFromRequest(req);
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

    // Check if the courseset header already exists
    const existingHeader = await db.query(
      `SELECT * FROM courseset_header WHERE uni_id = $1 AND cr_id = $2 AND cr_head_id = $3`,
      [uni_id, cr_id, cr_head_id]
    );

    if (existingHeader.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "ไม่มีหัวข้อหลักสูตร"
      });
    }

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
        message: "อัพเดตหัวข้อหลักสูตรแล้ว",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "ไม่มีหัวข้อหลักสูตร" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "อัพเดตหัวข้อหลักสูตรไม่ได้" });
  }
}
// Course set subject
async function a_addCoursesetSubject(req, res) {
  try {
    const user = await getUserFromRequest(req);
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

    // Check if the courseset subject already exists
    const existingSubject = await db.query(
      `SELECT * FROM courseset_subject WHERE uni_id = $1 AND cr_id = $2 AND suj_id = $3`,
      [uni_id, cr_id, suj_id]
    );

    if (existingSubject.rowCount > 0) {
      return res.status(400).json({
        success: false,
        message: "มีวิชานี้ในหลักสูตรอยู่แล้ว",
      });
    }

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
        message: "เพิ่มวิชาในหลักสูตรแล้ว",
      });
    } else {
      res
        .status(500)
        .json({ success: false, message: "เพิ่มวิชาในหลักสูตรไม่ได้" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "เพิ่มวิชาในหลักสูตรไม่ได้" });
  }
}

async function a_removeCoursesetSubject(req, res) {
  try {
    const user = await getUserFromRequest(req);
    const { uni_id, cr_id, suj_id } = req.params;

    // Delete the courseset subject
    const deleteResult = await db.query(
      `DELETE FROM courseset_subject WHERE uni_id = $1 AND cr_id = $2 AND suj_id = $3`,
      [uni_id, cr_id, suj_id]
    );

    if (deleteResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "ลบวิชาในหลักสูตรแล้ว",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "ไม่มีวิชาในหลักสูตร" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "ลบวิชาในหลักสูตรไม่ได้" });
  }
}

async function a_editCoursesetSubject(req, res) {
  try {
    const user = await getUserFromRequest(req);
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
        message: "อัพเดตวิชาในหลักสูตรแล้ว",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "ไม่มีวิชาในหลักสูตร" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "อัพเดตวิชาในหลักสูตรไม่ได้" });
  }
}

async function a_editCoursesetMapping(req, res) {
  try {
    const user = await getUserFromRequest(req);
    const { uni_id, cr_id } = req.params;
    const newData = req.body; // Assuming the new data is sent in the request body

    // 1. Delete existing data for the given cr_id
    await db.query("DELETE FROM courseset_subjectplan WHERE cr_id = $1", [
      cr_id,
    ]);

    // 2. Insert the new data
    for (let std_year = 0; std_year < newData.length; std_year++) {
      for (const semesterData of newData[std_year]) {
        const term = parseInt(semesterData.semester);
        for (const subject of semesterData.subjects) {
          const credit = subject.suj_credit || subject.credit; // Extract credit from suj_credit if not provided

          const insertResult = await db.query(
            `INSERT INTO courseset_subjectplan (cr_id, std_year, term, suj_id, credit)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              cr_id,
              std_year + 1,
              term,
              subject.suj_id || `h-${subject.cr_head_id}`,
              credit,
            ]
          );

          if (insertResult.rowCount === 0) {
            throw new Error(
              `Failed to insert subject ${subject.suj_id} for year ${std_year + 1
              }, term ${term}`
            );
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "อัพเดตการจัดวิชาในหลักสูตรแล้ว",
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "อัพเดตการจัดวิชาในหลักสูตรไม่ได้" });
  }
}

async function a_addCoursesetSubjectRestrictedGroup(req, res) {
  try {
    const user = await getUserFromRequest(req);
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
  getCoursesetMapping,
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
  a_editCoursesetMapping,
};
