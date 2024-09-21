const {
  getUsers,
  getUserFromToken,
  getUserFromUID,
} = require("../../utils/userutil");
const db = require("../../db");

const jwt = require("jwt-simple");
const {
  roleGrantAccess,
  getLargestRole,
  isUserHadRole,
  getRoleIndex,
} = require("./userTypes");

async function getAllUsers(req, res) {
  try {
    const jwt_dc = jwt.decode(
      req.headers["authorization"],
      process.env.SECRET_JWT
    );
    let data = null;

    if (jwt_dc) {
      const { uni_id = 0 } = req.params;
      const { page = 1, limit = 25, search = "", role = "" } = req.query;
      data = await getUsers(uni_id, page, limit, search, role);
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(403).json({ message: "Invalid Input" });
  }
}

async function a_addUserRole(req, res) {
  try {
    const { param_uni_id, uid } = req.params;
    const { uni_id, fac_id, major_id, role } = req.body;

    const user = await getUserFromToken(req);
    const targetUser = await getUserFromUID(uid);

    const actLargestRole = getLargestRole(user.roles);
    const tgtLargestRole = getLargestRole(targetUser.roles);

    const roleGrant = roleGrantAccess(actLargestRole.role, tgtLargestRole.role);
    const hadRole = isUserHadRole(
      { uni_id, fac_id, major_id, role },
      targetUser.roles
    );

    if (actLargestRole.index <= 1) {
      return res
        .status(403)
        .json({ success: false, message: "Permission forbidden." });
    }

    const roleIndex = getRoleIndex(role);

    if (roleIndex === 1 || roleIndex === 2) {
      if (!uni_id || (roleIndex === 1 && !fac_id)) {
        return res.status(403).json({
          success: false,
          message:
            roleIndex === 1
              ? "Please insert university and Faculty."
              : "Please insert university.",
        });
      }
      if (isCrossUniversity(actLargestRole, uni_id)) {
        return res.status(403).json({
          success: false,
          message: "Cannot add permission to different university.",
        });
      }
    } else if (roleIndex === 3 && isCrossUniversity(actLargestRole, uni_id)) {
      return res.status(403).json({
        success: false,
        message: "Cannot add permission to different university.",
      });
    }

    if (
      !(await isValidUniversity(uni_id)) ||
      !(await isValidFaculty(uni_id, fac_id)) ||
      !(await isValidMajor(uni_id, fac_id, major_id))
    ) {
      return res.status(403).json({
        success: false,
        message: "Invalid University, Faculty, or Major ID.",
      });
    }

    if (roleGrant) {
      if (!hadRole) {
        const resQuery = await db.query(
          `INSERT INTO user_additionrole (uid, fac_id, major_id, uni_id, role) VALUES ($1, $2, $3, $4, $5)`,
          [uid, fac_id, major_id, uni_id, role]
        );

        if (resQuery.rowCount === 0) {
          return res
            .status(406)
            .json({ success: false, message: "Duplicated Permission." });
        }

        res
          .status(201)
          .json({ success: true, message: "Permission added successfully." });
      } else {
        res
          .status(406)
          .json({ success: false, message: "Duplicated Permission." });
      }
    } else {
      res
        .status(403)
        .json({ success: false, message: "Permission forbidden." });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}
async function a_editUserRole(req, res) {
  try {
    const { param_uni_id, uid } = req.params;

    const user = await getUserFromToken(req);
    const actLargestRole = getLargestRole(user.roles);

    const { old, edit } = req.body;
    // Edit role
    await editUserRole(uid, { old, edit }, actLargestRole, res);
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}
async function a_deleteUserRole(req, res) {
  try {
    const { param_uni_id, uid } = req.params;

    const user = await getUserFromToken(req);
    const actLargestRole = getLargestRole(user.roles);

    // Remove role
    const { uni_id, fac_id, major_id, role } = req.body;
    await removeUserRole(
      uid,
      { uni_id, fac_id, major_id, role },
      actLargestRole,
      res
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}

async function editUserRole(uid, { old, edit }, actLargestRole, res) {
  if (!isValidRoleEdit(actLargestRole, old.role, old.uni_id, old.fac_id)) {
    return res
      .status(403)
      .json({ success: false, message: "Permission forbidden." });
  }

  if (!(await validateEntities(edit.uni_id, edit.fac_id, edit.major_id))) {
    return res.status(403).json({
      success: false,
      message: "Invalid University, Faculty, or Major ID.",
    });
  }

  const resQuery = await db.query(
    `DELETE FROM user_additionrole WHERE uid = $1 AND 
    (fac_id = $2 ${old.fac_id == null ? "OR (fac_id is NULL)" : ""}) AND 
    (major_id = $3 ${old.major_id == null ? "OR (major_id is NULL)" : ""}) AND 
    (uni_id = $4 ${old.uni_id == null ? "OR (uni_id is NULL)" : ""}) AND 
    role = $5`,
    [uid, old.fac_id, old.major_id, old.uni_id, old.role]
  );

  if (resQuery.rowCount === 0) {
    return res
      .status(406)
      .json({ success: false, message: "No changes made or role not found." });
  }

  const resQueryNew = await db.query(
    `INSERT INTO user_additionrole (uid, fac_id, major_id, uni_id, role) VALUES ($1, $2, $3, $4, $5)`,
    [uid, edit.fac_id, edit.major_id, edit.uni_id, edit.role]
  );

  if (resQueryNew.rowCount === 0) {
    await db.query(
      `INSERT INTO user_additionrole (uid, fac_id, major_id, uni_id, role) VALUES ($1, $2, $3, $4, $5)`,
      [uid, old.fac_id, old.major_id, old.uni_id, old.role]
    );
    return res
      .status(406)
      .json({ success: false, message: "No changes made or role not found." });
  }

  res
    .status(200)
    .json({ success: true, message: "Role updated successfully." });
}

async function removeUserRole(
  uid,
  { uni_id, fac_id, major_id, role },
  actLargestRole,
  res
) {
  if (!isValidRoleRemoval(actLargestRole, role, uni_id)) {
    return res
      .status(403)
      .json({ success: false, message: "Permission forbidden." });
  }

  const resQuery = await db.query(
    `DELETE FROM user_additionrole WHERE uid = $1 AND 
    (fac_id = $2 ${fac_id == null ? "OR (fac_id is NULL)" : ""}) AND 
    (major_id = $3 ${major_id == null ? "OR (major_id is NULL)" : ""}) AND 
    (uni_id = $4 ${uni_id == null ? "OR (uni_id is NULL)" : ""}) AND 
    role = $5`,
    [uid, fac_id, major_id, uni_id, role]
  );

  if (resQuery.rowCount === 0) {
    return res
      .status(406)
      .json({ success: false, message: "Role not found or already removed." });
  }

  res
    .status(200)
    .json({ success: true, message: "Role removed successfully." });
}

function isValidRoleEdit(actLargestRole, role, uni_id, fac_id) {
  // Implement logic to validate if the role can be edited based on actLargestRole and other parameters
  const cross = isCrossUniversity(actLargestRole, uni_id);

  return actLargestRole.index >= getRoleIndex(role) && !cross; // Placeholder
}

function isValidRoleRemoval(actLargestRole, role, uni_id) {
  // Implement logic to validate if the role can be removed based on actLargestRole and other parameters
  const cross = isCrossUniversity(actLargestRole, uni_id);

  return actLargestRole.index >= getRoleIndex(role) && !cross; // Placeholder
}

async function validateEntities(uni_id, fac_id, major_id) {
  const validUniversity = await isValidUniversity(uni_id);
  const validFaculty = await isValidFaculty(uni_id, fac_id);
  const validMajor = await isValidMajor(uni_id, fac_id, major_id);
  return validUniversity && validFaculty && validMajor;
}

function isCrossUniversity(actLargestRole, uni_id) {
  return (
    (actLargestRole.index >= 3 &&
      actLargestRole.role.university != null &&
      actLargestRole.role.university.uni_id != uni_id) ||
    (actLargestRole.role.university != null &&
      actLargestRole.role.university.uni_id != uni_id)
  );
}

async function isValidUniversity(uni_id) {
  if (uni_id == null) {
    return true;
  }
  const uniIdCheck = await db.query(
    `SELECT 1 FROM university_detail WHERE uni_id = $1`,
    [uni_id]
  );
  return uniIdCheck.rowCount > 0;
}

async function isValidFaculty(uni_id, fac_id) {
  if (fac_id == null) {
    return true;
  }
  const facIdCheck = await db.query(
    `SELECT 1 FROM university_faculty WHERE uni_id = $1 AND fac_id = $2`,
    [uni_id, fac_id]
  );
  return facIdCheck.rowCount > 0;
}

async function isValidMajor(uni_id, fac_id, major_id) {
  if (major_id == null) {
    return true;
  }
  const majorIdCheck = await db.query(
    `SELECT 1 FROM courseset_detail WHERE uni_id = $1 AND fac_id = $2 AND cr_id = $3`,
    [uni_id, fac_id, major_id]
  );
  return majorIdCheck.rowCount > 0;
}

module.exports = {
  getAllUsers,
  a_addUserRole,
  a_editUserRole,
  a_deleteUserRole,
};
