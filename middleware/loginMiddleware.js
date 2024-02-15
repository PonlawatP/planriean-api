const db = require("../db");

/**
 * Middleware สำหรับ ตรวจสอบว่า user password ที่ป้อนเข้ามาถูกต้องหรือไม่
 */
const loginMiddleware = async (req, res, next) => {
  try {
    const user = req.body.username;
    const password = req.body.password;
    const result = await db.query(
      "SELECT * FROM user_detail WHERE username = $1",
      [user]
    );
    if (result.rows.length > 0) {
      let user = result.rows[0];
      //   TODO: password ทดสอบเท่านั้น
      if (user.password === password) {
        next();
      } else {
        res.status(401).send("Invalid Username or password");
      }
    } else {
      res.status(404).send("No User Found");
    }
  } catch (err) {
    console.error(err);
    res.status(403).send("Invalid Input");
  }
};
module.exports = {
  loginMiddleware: loginMiddleware,
};
