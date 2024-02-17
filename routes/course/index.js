const db = require("../../db");

async function getCourses(req, res){
  try {
      const result = await db.query('SELECT * FROM course_detail');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).send('Internal Server Error');
    }
}

async function getCoursesSpecific(req, res){
  try {
      const {year, semester, coursecode} = req.params
      const searchData = req.body
      const result = await db.query('SELECT * FROM course_detail WHERE year = $1 AND semester = $2 AND code LIKE $3', [year, semester, coursecode.replaceAll("*","%")]);
      const data = result.rows
      
      // TODO: convert into new code
      const searchResults = data.filter(item => {
        return (searchData.code.includes(item.code) || searchData.code.length == 0) &&
           (searchData.date.includes(item.time.substring(0, 2)) || searchData.date.length == 0) &&
           (
              // if has more than 1 day it will check iterable
              item.time.split(';').filter(
                 (fitem) => {
                    // time filter had been ranged
                    if(searchData.time.includes("-")){
                      if(fitem.trim() == ""){
                        return false
                      }
                      const fts = fitem.split("-");
                      const ss = searchData.time.split("-");
                      const sj_start_time = Number(fts[0].substring(2, 4))
                      const sj_end_time = Number(fts[1].substring(0, 2))
                      const ss_start_time = Number(ss[0])
                      const ss_end_time = Number(ss[1])
                      return sj_start_time >= ss_start_time && sj_end_time <= ss_end_time
                    } else {
                       return Number(fitem.substring(2, 4)) >= Number(searchData.time)
                    }
                 }
              ).length > 0 || searchData.time === "total"
           )});

      res.json(searchResults);
    } catch (err) {
      console.error(err);
      res.status(500).send('Internal Server Error');
    }
}


module.exports = {
    getCourses,
    getCoursesSpecific
}