const db = require("../../db");
const { templateGE } = require("../../utils/customs/msu");
const { getUserFromToken, getUserFromUID } = require("../../utils/userutil");

/** TODO: Admin section */
async function a_editCourseSetGroupDetail(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_group_id } = req.params; // Extract uni_id and cr_group_id from the request parameters
    const { name_en, name_th } = req.body; // Extract name_en and name_th from the request body

    // Construct the SQL UPDATE statement to modify the courseset_group table
    const updateResult = await db.query(
      `UPDATE courseset_group SET name_en = $1, name_th = $2 WHERE uni_id = $3 AND cr_group_id = $4`,
      [name_en, name_th, uni_id, cr_group_id] // Pass the values to the query
    );

    // Check if the update was successful
    if (updateResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "Courseset Group updated successfully",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "Courseset Group not found" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to update Courseset Group" });
  }
}

async function a_addCoursesetGroupDetail(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id } = req.params;
    const { name_en, name_th } = req.body;

    // Get the next available cr_group_id
    const nextIdResult = await db.query(
      `SELECT MAX(cr_group_id) AS max_id FROM courseset_group WHERE uni_id = $1`,
      [uni_id]
    );
    let cr_group_id = 1;
    if (nextIdResult.rowCount > 0 && nextIdResult.rows[0].max_id) {
      cr_group_id = nextIdResult.rows[0].max_id + 1;
    }

    // Insert the new courseset group
    const insertResult = await db.query(
      `INSERT INTO courseset_group (uni_id, cr_group_id, name_en, name_th) VALUES ($1, $2, $3, $4)`,
      [uni_id, cr_group_id, name_en, name_th]
    );

    if (insertResult.rowCount > 0) {
      res.status(201).json({
        success: true,
        message: "Courseset Group added successfully",
      });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Failed to add Courseset Group" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to add Courseset Group" });
  }
}

async function a_removeCoursesetGroupDetail(req, res) {
  try {
    const user = await getUserFromToken(req);
    const { uni_id, cr_group_id } = req.params;

    // Delete the courseset group
    const deleteResult = await db.query(
      `DELETE FROM courseset_group WHERE uni_id = $1 AND cr_group_id = $2`,
      [uni_id, cr_group_id]
    );

    if (deleteResult.rowCount > 0) {
      res.status(200).json({
        success: true,
        message: "Courseset Group removed successfully",
      });
    } else {
      res
        .status(404)
        .json({ success: false, message: "Courseset Group not found" });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to remove Courseset Group" });
  }
}

async function a_addCoursesetSubjectRestrictedGroup(req, res) {
  // NOTED: logic check role on user. improve later
  try {
    const user = await getUserFromToken(req);
    if (user != null) {
      const user_role = await getUserRole(user);
      if (
        user_role.role != "user" &&
        user_role.fac_id != null &&
        user_role.major_id != null
      ) {
        // add coursesetsubject
      } else {
      }
    } else {
    }
  } catch (err) {
    res.status(500).send("error");
  }
}

module.exports = {
  a_addCoursesetGroupDetail,
  a_removeCoursesetGroupDetail,
  a_editCourseSetGroupDetail,
};
