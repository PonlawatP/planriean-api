const db = require("../db");
// สร้าง strategy ของ JWT
//ใช้ในการ decode jwt ออกมา
const ExtractJwt = require("passport-jwt").ExtractJwt;
//ใช้ในการประกาศ Strategy
const JwtStrategy = require("passport-jwt").Strategy;
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromHeader("authorization"),
  secretOrKey: process.env.SECRET_JWT,
};
const jwtAuth = new JwtStrategy(jwtOptions, async (payload, done) => {
  // console.log("JWT Payload:", payload); // Log the payload
  try {
    let result

    if (payload?.login_with == "auth-msu") {
      result = await db.query(
        "SELECT * FROM user_detail WHERE auth_reg_username = $1",
        [payload.auth_reg_username]
      );
    } else {
      result = await db.query(
        `SELECT * FROM user_detail WHERE LOWER(${payload.email ? "email" : "username"
        }) = LOWER($1)${!payload.email ? " OR LOWER(email) = LOWER($2)" : ""}`,
        [...(payload.email ? [payload.email] : [payload.sub, payload.sub])]
      );
    }
    // console.log("Database Query Result:", result.rows); // Log the query result
    if (result.rowCount > 0) {
      done(null, true);
    } else {
      done(null, false);
    }
  } catch (err) {
    // console.error("Error during JWT verification:", err); // Log any errors
    done(err, false);
  }
});

const passport = require("passport");
passport.use(jwtAuth);

const requireJWTAuth = passport.authenticate("jwt", { session: false });

module.exports = {
  requireJWTAuth,
};
