const db = require("../db");
const bcrypt = require("bcryptjs");

/**
 * Middleware สำหรับ ตรวจสอบว่า user password ที่ป้อนเข้ามาถูกต้องหรือไม่
 */
const loginMiddleware = async (req, res, next) => {
  try {
    const user = req.body.username;
    const password = req.body.password;
    const result = await db.query(
      "SELECT * FROM user_detail WHERE lower(username) = lower($1) OR lower(email) = lower($2)",
      [user, user]
    );
    if (result.rows.length > 0) {
      let user = result.rows[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        next();
      } else {
        res.status(401).send("Invalid Username or password");
      }
    } else {
      // 404 - No User Found
      res.status(401).send("Invalid Username or password");
    }
  } catch (err) {
    console.error(err);
    // 403 - Invalid Input
    res.status(401).send("Invalid Username or password");
  }
};
module.exports = {
  loginMiddleware,
};
