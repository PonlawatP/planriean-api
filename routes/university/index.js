const db = require("../../db");
const {
  semesterRoundGroupData,
  semesterYearGroupData,
} = require("../../utils/seasonutil");

async function getUniversityList(req, res) {
  try {
    const university_list = await db.query("SELECT * FROM university_detail;");

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
    const uni = await getUniversityDetailFunc(uni_id, type == "major_group");
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

async function getUniversityDetailFunc(uni_id, group) {
  const university_list = await db.query(
    "SELECT * FROM university_detail WHERE uni_id = $1;",
    [uni_id]
  );
  if (university_list.rows.length != 0) {
    const faculty_list = await db.query(
      "SELECT * FROM university_faculty WHERE uni_id = $1;",
      [uni_id]
    );
    let facultys = faculty_list.rows;
    for (const faculty of facultys) {
      faculty.uni_id = undefined;

      const learn_group = await db.query("SELECT * FROM courseset_group;");
      faculty.coursesets = learn_group.rows;
      for (const courseset of faculty.coursesets) {
        courseset.uni_id = undefined;

        const major_list = await db.query(
          "SELECT name_th, credit, year, lowset_grade, fac_id, cr_id, cr_key, uni_id, courseset_id, major_key_ref, cr_group_id, name_en FROM courseset_detail WHERE uni_id = $1 AND fac_id = $2 AND cr_group_id = $3;",
          [uni_id, faculty.fac_id, courseset.cr_group_id]
        );
        // console.log(major_list.rows)
        if (group) {
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
      facultys: facultys.filter((f) => f.fac_id != 0),
    };
    return result;
  } else {
    return null;
  }
}
async function getUniversitySeasons(req, res) {
  const { uni_id } = req.params;

  const university_list = await db.query(
    "SELECT * FROM university_detail WHERE uni_id = $1;",
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
    "SELECT * FROM university_detail WHERE uni_key = $1;",
    [uni_name]
  );
  if (university_list.rows.length != 0) {
    const faculty_list = await db.query(
      "SELECT * FROM university_faculty WHERE uni_id = $1;",
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

/** TODO: Admin section */
module.exports = {
  getUniversityList,
  getUniversityDetail,
  getUniversitySeasons,
  getUniversityDetailFunc,
  getUniversityDetailWithNameFunc,
};
