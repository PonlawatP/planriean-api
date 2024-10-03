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

    const roles = await getUserRoles(result.rows[0]);
    const plancount = await db.query(
      "SELECT CAST(COUNT(*) AS INT) FROM plan_detail WHERE user_uid = $1 AND is_delete = false",
      [result.rows[0].uid]
    );

    return show_passwd
      ? { ...result.rows[0], plan_created: plancount.rows[0].count, roles }
      : {
        ...result.rows[0],
        password: undefined,
        plan_created: plancount.rows[0].count,
        roles,
      };
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

    let result;

    if (jwt_dc?.login_with == "auth-msu") {
      result = await db.query(
        "SELECT * FROM user_detail WHERE auth_reg_username = $1",
        [jwt_dc.auth_reg_username]
      );
    } else {
      result = await db.query(
        `SELECT * FROM user_detail WHERE ${jwt_dc.email ? "email" : "lower(username)"
        } = lower($1)${!jwt_dc.email ? " OR lower(email) = lower($2)" : ""}`,
        [...(jwt_dc.email ? [jwt_dc.email] : [jwt_dc.sub, jwt_dc.sub])]
      );
    }

    if (result.rows.length == 0) {
      return null;
    }

    const roles = await getUserRoles(result.rows[0]);

    const plancount = await db.query(
      "SELECT CAST(COUNT(*) AS INT) FROM plan_detail WHERE user_uid = $1 AND is_delete = false",
      [result.rows[0].uid]
    );

    return show_passwd
      ? { ...result.rows[0], plan_created: plancount.rows[0].count, roles }
      : {
        ...result.rows[0],
        password: undefined,
        plan_created: plancount.rows[0].count,
        roles,
      };
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
    const roles = await getUserRoles(result.rows[0]);

    const plancount = await db.query(
      "SELECT CAST(COUNT(*) AS INT) FROM plan_detail WHERE user_uid = $1 AND is_delete = false",
      [uid]
    );

    return show_passwd
      ? { ...result.rows[0], plan_created: plancount.rows[0].count, roles }
      : {
        ...result.rows[0],
        password: undefined,
        plan_created: plancount.rows[0].count,
        roles,
      };
  } catch (err) {
    return null;
  }
}
async function getUserRoles(user) {
  try {
    let result = await db.query(
      "SELECT * FROM user_additionrole WHERE uid = $1",
      [user.uid]
    );

    const uni_res = await db.query(
      "SELECT uni_key, uni_name_en, uni_name_th, uni_logo, uni_id FROM university_detail WHERE uni_id = $1",
      [user.uni_id]
    );

    if (result.rows.length == 0) {
      return [
        {
          role: "user",
          university: user.uni_id != null ? { ...uni_res.rows[0] } : null,
          faculty: null,
          major: null,
        },
      ];
    }

    const res = [];
    for (let index = 0; index < result.rows.length; index++) {
      const sts = result.rows[index];

      const fac_res = await db.query(
        "SELECT fac_id, fac_key, fac_name_th, fac_name_en FROM university_faculty WHERE uni_id = $1 AND fac_id = $2",
        [sts.uni_id, sts.fac_id]
      );

      // const maj_res = await db.query(
      //   "SELECT * FROM university_major WHERE uni_id = $1 AND fac_id = $2 AND major_id = $3",
      //   [user.uni_id, user.fac_id, user.major_id]
      // );

      const courseset_res = await db.query(
        "SELECT cr_id, cr_key, name_th, name_en FROM courseset_detail WHERE cr_id = $1",
        [sts.major_id]
      );

      res.push({
        role: sts.role,
        university: sts.uni_id != null ? { ...uni_res.rows[0] } : null,
        faculty: sts.fac_id != null ? { ...fac_res.rows[0] } : null,
        major: sts.major_id != null ? { ...courseset_res.rows[0] } : null,
      });
    }
    return res;
  } catch (err) {
    console.log(err);

    const uni_res = await db.query(
      "SELECT uni_key, uni_name_en, uni_name_th, uni_logo, uni_id FROM university_detail WHERE uni_id = $1",
      [user.uni_id]
    );
    return [
      {
        role: "user",
        university: user.uni_id != null ? { ...uni_res.rows[0] } : null,
        faculty: null,
        major: null,
      },
    ];
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

async function getUsers(
  uni_id = 0,
  page = 1,
  limit = 25,
  search = "",
  role = ""
) {
  const offset = (page - 1) * limit;

  // Prepare the search condition
  const searchCondition = search
    ? `
    WHERE (
      ud.username ILIKE $1 OR
      ud.std_id ILIKE $1 OR
      ud.std_name ILIKE $1 OR
      ud.std_surname ILIKE $1 OR
      ud.phone ILIKE $1 OR
      ud.email ILIKE $1 OR
      ud.auth_reg_username ILIKE $1
    ) ${uni_id != 0 ? `AND ud.uni_id = $2` : ""} ${role ? `AND COALESCE(r.role, 'user') ILIKE $3` : ""
    }
  `
    : uni_id != 0
      ? `WHERE ud.uni_id = $1 ${role ? `AND COALESCE(r.role, 'user') ILIKE $2` : ""
      }`
      : `${role ? `WHERE COALESCE(r.role, 'user') ILIKE $1` : ""}`;

  // Query to get the total count of users
  const totalCountResult = await db.query(
    `SELECT CAST(COUNT(ud.*) AS INT) AS total FROM user_detail ud
     ${role ? "LEFT JOIN user_additionrole r ON ud.uid = r.uid" : ""
    } ${searchCondition}`,
    search
      ? uni_id != 0
        ? role
          ? [`%${search}%`, uni_id, role]
          : [`%${search}%`, uni_id]
        : [`%${search}%`]
      : uni_id != 0
        ? role
          ? [uni_id, role]
          : [uni_id]
        : role
          ? [role]
          : []
  );

  const totalCount = totalCountResult.rows[0].total;
  const last_page = Math.ceil(totalCount / limit);

  // Query to get the paginated users
  const result = await db.query(
    `SELECT DISTINCT ud.*${role ? ", COALESCE(r.role, 'user') AS match_role " : " "
    }
     FROM user_detail ud
     ${role ? "LEFT JOIN user_additionrole r ON ud.uid = r.uid" : ""
    } ${searchCondition} ${search
      ? uni_id != 0
        ? role
          ? "LIMIT $4 OFFSET $5"
          : "LIMIT $3 OFFSET $4"
        : role
          ? "LIMIT $3 OFFSET $4"
          : "LIMIT $2 OFFSET $3"
      : uni_id != 0
        ? role
          ? "LIMIT $3 OFFSET $4"
          : "LIMIT $2 OFFSET $3"
        : role
          ? "LIMIT $2 OFFSET $3"
          : "LIMIT $1 OFFSET $2"
    }`,
    search
      ? uni_id != 0
        ? role
          ? [`%${search}%`, uni_id, role, limit, offset]
          : [`%${search}%`, uni_id, limit, offset]
        : role
          ? [`%${search}%`, role, limit, offset]
          : [`%${search}%`, limit, offset]
      : uni_id != 0
        ? role
          ? [uni_id, role, limit, offset]
          : [uni_id, limit, offset]
        : role
          ? [role, limit, offset]
          : [limit, offset]
  );

  const res = [];
  for (let index = 0; index < result.rowCount; index++) {
    const user = result.rows[index];
    const user_roles = await getUserRoles(user);
    const uni_res = await db.query(
      "SELECT uni_key, uni_name_en, uni_name_th, uni_logo, uni_id FROM university_detail WHERE uni_id = $1",
      [user.uni_id]
    );

    const fac_res = await db.query(
      "SELECT fac_id, fac_key, fac_name_th, fac_name_en FROM university_faculty WHERE uni_id = $1 AND fac_id = $2",
      [user.uni_id, user.fac_id]
    );

    const maj_res = await db.query(
      "SELECT * FROM university_major WHERE uni_id = $1 AND fac_id = $2 AND major_id = $3",
      [user.uni_id, user.fac_id, user.major_id]
    );

    const courseset_res = await db.query(
      "SELECT cr_id, cr_key, name_th, name_en FROM courseset_detail WHERE cr_id = $1",
      [user.cr_id]
    );

    const plancount = await db.query(
      "SELECT CAST(COUNT(*) AS INT) FROM plan_detail WHERE user_uid = $1 AND is_delete = false",
      [user.uid]
    );

    res.push({
      ...user,
      password: undefined,
      match_role: undefined,
      uni_id: undefined,
      fac_id: undefined,
      major_id: undefined,
      cr_id: undefined,
      roles: user_roles,
      plan_created: plancount.rows[0].count,
      study_status: {
        university: uni_res.rowCount == 0 ? null : { ...uni_res.rows[0] },
        faculty: fac_res.rowCount == 0 ? null : { ...fac_res.rows[0] },
        major: maj_res.rowCount == 0 ? null : { ...maj_res.rows[0] },
        courseset:
          courseset_res.rowCount == 0 ? null : { ...courseset_res.rows[0] },
      },
    });
  }

  return {
    pagination: {
      totalItem: totalCount,
      totalPage: last_page,
      page,
      limit,
      offset,
    },
    users: res,
  };
}

async function getUserFromUsername(user) {
  const result = await db.query(
    "SELECT * FROM user_detail WHERE lower(username) = lower($1) OR lower(email) = lower($2)",
    [user, user]
  );
  if (result.rows.length > 0) {
    let user_nopass = { ...result.rows[0], password: undefined };

    const uni_res = await db.query(
      "SELECT uni_key, uni_name_en, uni_name_th, uni_logo, uni_id FROM university_detail WHERE uni_id = $1",
      [user_nopass.uni_id]
    );

    const fac_res = await db.query(
      "SELECT fac_id, fac_key, fac_name_th, fac_name_en FROM university_faculty WHERE uni_id = $1 AND fac_id = $2",
      [user_nopass.uni_id, user_nopass.fac_id]
    );

    const maj_res = await db.query(
      "SELECT * FROM university_major WHERE uni_id = $1 AND fac_id = $2 AND major_id = $3",
      [user_nopass.uni_id, user_nopass.fac_id, user_nopass.major_id]
    );

    const courseset_res = await db.query(
      "SELECT cr_id, cr_key, name_th, name_en FROM courseset_detail WHERE cr_id = $1",
      [user_nopass.cr_id]
    );
    const plancount = await db.query(
      "SELECT CAST(COUNT(*) AS INT) FROM plan_detail WHERE user_uid = $1 AND is_delete = false",
      [user_nopass.uid]
    );

    const user_roles = await getUserRoles(user_nopass);

    return {
      user: {
        login_with: "username",
        ...user_nopass,
        uni_id: undefined,
        fac_id: undefined,
        major_id: undefined,
        cr_id: undefined,
        roles: user_roles,
        plan_created: plancount.rows[0].count,
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
      "SELECT uni_key, uni_name_en, uni_name_th, uni_logo, uni_id FROM university_detail WHERE uni_id = $1",
      [user_nopass.uni_id]
    );

    const fac_res = await db.query(
      "SELECT fac_id, fac_key, fac_name_th, fac_name_en FROM university_faculty WHERE uni_id = $1 AND fac_id = $2",
      [user_nopass.uni_id, user_nopass.fac_id]
    );

    const maj_res = await db.query(
      "SELECT * FROM university_major WHERE uni_id = $1 AND fac_id = $2 AND major_id = $3",
      [user_nopass.uni_id, user_nopass.fac_id, user_nopass.major_id]
    );

    const courseset_res = await db.query(
      "SELECT cr_id, cr_key, name_th, name_en FROM courseset_detail WHERE cr_id = $1",
      [user_nopass.cr_id]
    );
    const plancount = await db.query(
      "SELECT CAST(COUNT(*) AS INT) FROM plan_detail WHERE user_uid = $1 AND is_delete = false",
      [user_nopass.uid]
    );

    const user_roles = await getUserRoles(user_nopass);

    return {
      user: {
        login_with: "google",
        ...user_nopass,
        uni_id: undefined,
        fac_id: undefined,
        major_id: undefined,
        cr_id: undefined,
        roles: user_roles,
        plan_created: plancount.rows[0].count,
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
async function getUserFromAuthMSU(student_id) {
  const result = await db.query("SELECT * FROM user_detail WHERE auth_reg_username = $1", [
    student_id,
  ]);

  if (result.rows.length > 0) {
    let user_nopass = { ...result.rows[0], password: undefined };

    // Check if std_id matches student_id and update if necessary
    if (user_nopass.std_id !== student_id) {
      const updateResult = await db.query(
        "UPDATE user_detail SET std_id = $1 WHERE uid = $2 RETURNING std_id",
        [student_id, user_nopass.uid]
      );
      if (updateResult.rowCount > 0) {
        user_nopass.std_id = updateResult.rows[0].std_id;
      }
    }

    const uni_res = await db.query(
      "SELECT uni_key, uni_name_en, uni_name_th, uni_logo, uni_id FROM university_detail WHERE uni_id = $1",
      [user_nopass.uni_id]
    );

    const fac_res = await db.query(
      "SELECT fac_id, fac_key, fac_name_th, fac_name_en FROM university_faculty WHERE uni_id = $1 AND fac_id = $2",
      [user_nopass.uni_id, user_nopass.fac_id]
    );

    const maj_res = await db.query(
      "SELECT * FROM university_major WHERE uni_id = $1 AND fac_id = $2 AND major_id = $3",
      [user_nopass.uni_id, user_nopass.fac_id, user_nopass.major_id]
    );

    const courseset_res = await db.query(
      "SELECT cr_id, cr_key, name_th, name_en FROM courseset_detail WHERE cr_id = $1",
      [user_nopass.cr_id]
    );
    const plancount = await db.query(
      "SELECT CAST(COUNT(*) AS INT) FROM plan_detail WHERE user_uid = $1 AND is_delete = false",
      [user_nopass.uid]
    );

    const user_roles = await getUserRoles(user_nopass);

    return {
      user: {
        login_with: "auth-msu",
        ...user_nopass,
        uni_id: undefined,
        fac_id: undefined,
        major_id: undefined,
        cr_id: undefined,
        roles: user_roles,
        plan_created: plancount.rows[0].count,
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
  getUsers,
  getUser,
  getUserFromToken,
  getUserFromUID,
  getUserRoles,
  getUserFromGoogle,
  getUserFromUsername,
  getUserFromAuthMSU,
  checkUsername,
  checkEmail,
  encryptPassword,
};
