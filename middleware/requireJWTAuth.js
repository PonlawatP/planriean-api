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
  // console.log(payload);
  const result = await db.query(
    `SELECT * FROM user_detail WHERE LOWER(${
      payload.email ? "email" : "username"
    }) = LOWER($1)${!payload.email ? " OR LOWER(email) = LOWER($2)" : ""}`,
    [...(payload.email ? [payload.email] : [payload.sub, payload.sub])]
  );
  if (result.rowCount > 0) {
    done(null, true);
  } else {
    done(null, false);
  }
});

const passport = require("passport");
passport.use(jwtAuth);

const requireJWTAuth = passport.authenticate("jwt", { session: false });

module.exports = {
  requireJWTAuth,
};
