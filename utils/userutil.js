const jwt = require("jwt-simple");
const db = require("../db");
const bcrypt = require("bcryptjs");
async function getUser(username, show_passwd = false) {
  try {
    let result = await db.query(
      "SELECT * FROM user_detail WHERE lower(username) = lower($1) OR lower(email) = lower($2)",
      [username, username]
    );

    if (result.rows.length == 0) {
      return null;
    }

    const ress = show_passwd
      ? result.rows[0]
      : { ...result.rows[0], password: undefined };
    return ress;
  } catch (err) {
    return null;
  }
}
async function getUserFromToken(req, show_passwd = false) {
  try {
    const jwt_dc = jwt.decode(
      req.headers["authorization"],
      process.env.SECRET_JWT
    );

    let result = await db.query(
      `SELECT * FROM user_detail WHERE ${
        jwt_dc.email ? "email" : "lower(username)"
      } = lower($1)${!jwt_dc.email ? " OR lower(email) = lower($2)" : ""}`,
      [...(jwt_dc.email ? [jwt_dc.email] : [jwt_dc.sub, jwt_dc.sub])]
    );

    if (result.rows.length == 0) {
      return null;
    }

    const ress = show_passwd
      ? result.rows[0]
      : { ...result.rows[0], password: undefined };
    return ress;
  } catch (err) {
    return null;
  }
}
async function getUserFromUID(uid, show_passwd = false) {
  try {
    let result = await db.query("SELECT * FROM user_detail WHERE uid = $1", [
      uid,
    ]);

    if (result.rows.length == 0) {
      return null;
    }

    const ress = show_passwd
      ? result.rows[0]
      : { ...result.rows[0], password: undefined };
    return ress;
  } catch (err) {
    return null;
  }
}
async function getUserRole(user_data) {
  try {
    let result = await db.query(
      "SELECT * FROM user_additionrole WHERE uid = $1",
      [user.uid]
    );

    if (result.rows.length == 0) {
      return {
        role: "user",
        uni_id: user.uni_id,
        fac_id: null,
        major_id: null,
      };
    }

    const sts = result.rows[0];

    const ress = {
      role: sts.role,
      uni_id: sts.uni_id,
      fac_id: sts.fac_id,
      major_id: sts.major_id,
    };
    return ress;
  } catch (err) {
    return {
      role: "user",
      uni_id: user.uni_id,
      fac_id: null,
      major_id: null,
    };
  }
}

async function checkUsername(user) {
  const result = await db.query(
    "SELECT * FROM user_detail WHERE lower(username) = lower($1)",
    [user]
  );
  return result.rowCount == 0;
}

async function checkEmail(user) {
  const result = await db.query(
    "SELECT * FROM user_detail WHERE lower(email) = lower($1)",
    [user]
  );
  return result.rowCount == 0;
}

async function getUserFromUsername(user) {
  const result = await db.query(
    "SELECT * FROM user_detail WHERE lower(username) = lower($1) OR lower(email) = lower($2)",
    [user, user]
  );
  if (result.rows.length > 0) {
    let user_nopass = { ...result.rows[0], password: undefined };

    const uni_res = await db.query(
      "SELECT * FROM university_detail WHERE uni_id = $1",
      [user_nopass.uni_id]
    );
    const fac_res = await db.query(
      "SELECT * FROM university_faculty WHERE uni_id = $1 AND fac_id = $2",
      [user_nopass.uni_id, user_nopass.fac_id]
    );
    const maj_res = await db.query(
      "SELECT * FROM university_major WHERE uni_id = $1 AND fac_id = $2 AND major_id = $3",
      [user_nopass.uni_id, user_nopass.fac_id, user_nopass.major_id]
    );
    const courseset_res = await db.query(
      "SELECT * FROM courseset_detail WHERE cr_id = $1",
      [user_nopass.cr_id]
    );

    return {
      user: {
        ...user_nopass,
        uni_id: undefined,
        fac_id: undefined,
        major_id: undefined,
        cr_id: undefined,
        study_status: {
          university: uni_res.rowCount == 0 ? null : { ...uni_res.rows[0] },
          faculty: fac_res.rowCount == 0 ? null : { ...fac_res.rows[0] },
          major: maj_res.rowCount == 0 ? null : { ...maj_res.rows[0] },
          courseset:
            courseset_res.rowCount == 0 ? null : { ...courseset_res.rows[0] },
        },
      },
    };
  } else {
    return null;
  }
}
async function getUserFromGoogle(email) {
  const result = await db.query("SELECT * FROM user_detail WHERE email = $1", [
    email,
  ]);
  if (result.rows.length > 0) {
    let user_nopass = { ...result.rows[0], password: undefined };

    const uni_res = await db.query(
      "SELECT * FROM university_detail WHERE uni_id = $1",
      [user_nopass.uni_id]
    );
    const fac_res = await db.query(
      "SELECT * FROM university_faculty WHERE uni_id = $1 AND fac_id = $2",
      [user_nopass.uni_id, user_nopass.fac_id]
    );
    const maj_res = await db.query(
      "SELECT * FROM university_major WHERE uni_id = $1 AND fac_id = $2 AND major_id = $3",
      [user_nopass.uni_id, user_nopass.fac_id, user_nopass.major_id]
    );
    const courseset_res = await db.query(
      "SELECT * FROM courseset_detail WHERE cr_id = $1",
      [user_nopass.cr_id]
    );

    return {
      user: {
        ...user_nopass,
        uni_id: undefined,
        fac_id: undefined,
        major_id: undefined,
        cr_id: undefined,
        study_status: {
          university: uni_res.rowCount == 0 ? null : { ...uni_res.rows[0] },
          faculty: fac_res.rowCount == 0 ? null : { ...fac_res.rows[0] },
          major: maj_res.rowCount == 0 ? null : { ...maj_res.rows[0] },
          courseset:
            courseset_res.rowCount == 0 ? null : { ...courseset_res.rows[0] },
        },
      },
    };
  } else {
    return null;
  }
}

const encryptPassword = async (password = "") => {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  return hashedPassword;
};

module.exports = {
  getUser,
  getUserFromToken,
  getUserFromUID,
  getUserRole,
  getUserFromGoogle,
  getUserFromUsername,
  checkUsername,
  checkEmail,
  encryptPassword,
};
