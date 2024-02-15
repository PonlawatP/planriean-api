const db = require("../db");
// สร้าง strategy ของ JWT
//ใช้ในการ decode jwt ออกมา
const ExtractJwt = require("passport-jwt").ExtractJwt;
//ใช้ในการประกาศ Strategy
const JwtStrategy = require("passport-jwt").Strategy;
const jwtOptions = {
   jwtFromRequest: ExtractJwt.fromHeader("authorization"),
   secretOrKey: process.env.SECRET_JWT,
}
const jwtAuth = new JwtStrategy(jwtOptions, async (payload, done) => {
   const result = await db.query(
   "SELECT * FROM user_detail WHERE username = $1",
      [payload.sub]
    );
    if (result.rows.length > 0) {
      done(null, true);
    } else {
      done(null, false);
    }
});

const passport = require("passport");
passport.use(jwtAuth);

const requireJWTAuth = passport.authenticate("jwt",{session:false});

module.exports = {
   requireJWTAuth:requireJWTAuth
}