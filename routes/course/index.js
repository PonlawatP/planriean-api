const db = require("../../db");

async function getCourses(req, res) {
  try {
    const result = await db.query("SELECT * FROM course_detail");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
}

async function getCoursesSpecific(req, res) {
  try {
    const { year, semester } = req.params;
    let searchData = req.body;

    if (searchData.type.length == 0) {
      searchData.type = ["004*"];
    }

    // console.log(searchData);

    // console.log(coursecode);
    let major_groups = "";
    let include_groups = [];
    // TODO: search subject from major book
    // for (const cc of searchData.type) {
    //   if (!cc.startsWith("_M-")) {
    //     include_groups.push(cc.slice(0, -1));
    //     continue;
    //   }

    //   const key = cc.substring(3);
    //   // console.log(key);
    //   const rr_result = await db.query(
    //     `SELECT cr_id from courseset_detail WHERE uni_id = 1 AND cr_group_id = 34 AND upper(cr_key) = $1 ORDER BY cr_id DESC`,
    //     [key]
    //   );
    //   const majorlist = rr_result.rows.map((r) => r.cr_id).join("|");
    //   // console.log(rr_result.rows.map((r) => r.cr_id).join("|"));
    //   const rr2_result = await db.query(
    //     `SELECT * from courseset_subject WHERE CAST(cr_id AS TEXT) SIMILAR TO $1`,
    //     [majorlist]
    //   );
    //   // console.log(rr2_result.rows.map((r) => r.suj_id).join("|"));
    //   major_groups = rr2_result.rows
    //     .map((r) => r.suj_id)
    //     .filter((r) => !r.startsWith("00"))
    //     .join("|");
    //   // SELECT * from courseset_detail WHERE uni_id = 1 AND cr_group_id = 34 AND upper(cr_key) = 'IS' ORDER BY cr_key, cr_id DESC
    // }
    // for (const cc of include_groups) {
    //   major_groups = major_groups.filter((r) => !r.startsWith("00"))
    // }

    // console.log(major_groups);
    const result_updated = await db.query(
      `SELECT to_char(
          refresh_updated_at AT TIME ZONE 'UTC' + interval '543 years',
          'DD/MM/YY HH24:MI:SS'
      ) AS formatted_date FROM university_detail WHERE LOWER(uni_key) = LOWER($1)`,
      ["msu"]
    );

    const data_updated = result_updated.rows[0].formatted_date;

    const result = await db.query(
      `SELECT * FROM course_detail LEFT JOIN course_seat ON course_detail.cr_id = course_seat.cr_id WHERE year = $1 AND semester = $2 AND code SIMILAR TO $3`,
      // [year, semester, "12%"]
      [
        year,
        semester,
        (major_groups == "" ? "" : major_groups + "|") +
          (searchData.code.length > 0
            ? searchData.code.join("|")
            : searchData.type.join("|").replaceAll("*", "%")),
      ]
    );
    const data = result.rows;

    // console.log(
    //   searchData.code.length > 0
    //     ? searchData.code.join("|")
    //     : searchData.type.join("|").replaceAll("*", "%")
    // );

    // TODO: convert into new code
    const searchResults = data
      .filter((item) => {
        return (
          // (searchData.code.includes(item.code) ||
          //   searchData.code.length == 0) &&
          (searchData.date.includes(item.time.substring(0, 2)) ||
            searchData.date.length == 0) &&
          (searchData.master.length == 0 ||
            searchData.master.filter((m) => item.lecturer.includes(m)).length >
              0) &&
          // if has more than 1 day it will check iterable
          (item.time.split(";").filter((fitem) => {
            // time filter had been ranged
            if (searchData.time.includes("-")) {
              if (fitem.trim() == "") {
                return false;
              }
              const fts = fitem.split("-");
              const ss = searchData.time.split("-");
              const sj_start_time = Number(fts[0].substring(2, 4));
              const sj_end_time = Number(fts[1].substring(0, 2));
              const ss_start_time = Number(ss[0]);
              const ss_end_time = Number(ss[1]);
              return (
                sj_start_time >= ss_start_time && sj_end_time <= ss_end_time
              );
            } else {
              return Number(fitem.substring(2, 4)) >= Number(searchData.time);
            }
          }).length > 0 ||
            searchData.time === "total")
        );
      })
      .map((r) => {
        // console.log(r);
        return { ...r, "cr_id(1)": undefined };
      });

    res.json({ updated: data_updated, subjects: searchResults });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
}

module.exports = {
  getCourses,
  getCoursesSpecific,
};
