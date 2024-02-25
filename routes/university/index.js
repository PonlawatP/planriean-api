const db = require("../../db");

async function getUniversityList(req, res) {
  try {
    const university_list = await db.query(
      "SELECT * FROM university_detail;",
    );

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
    const {uni_id} = req.params
    const university_list = await db.query(
      "SELECT * FROM university_detail WHERE uni_id = $1;", [uni_id],
    );
    if(university_list.rows.length != 0){
      const faculty_list = await db.query(
        "SELECT * FROM university_faculty WHERE uni_id = $1;", [uni_id],
      );
      let facultys = faculty_list.rows
      for (const faculty of facultys) {
        faculty.uni_id = undefined

        const learn_group = await db.query(
          "SELECT * FROM courseset_group;",
        );
        faculty.coursesets = learn_group.rows
        for (const courseset of faculty.coursesets) {
          courseset.uni_id = undefined
          
          const major_list = await db.query(
            "SELECT * FROM courseset_detail WHERE uni_id = $1 AND fac_id = $2 AND cr_group_id = $3;", [uni_id, faculty.fac_id, courseset.cr_group_id],
          );
          // console.log(major_list.rows)
          courseset.children = major_list.rows
        }
      }
      const result = {
        facultys: facultys,
      };
      res.json(result);
    } else {
      throw new Error('error')
    }
  } catch (err) {
    console.error(err);
    res.status(404).send("University Not Found");
  }

}

/** TODO: Admin section */
module.exports = {
  getUniversityList,
  getUniversityDetail
};
