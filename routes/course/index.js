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

module.exports = {
    getCourses
}