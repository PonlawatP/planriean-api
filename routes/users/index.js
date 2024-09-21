const { getUsers } = require("../../utils/userutil");
const jwt = require("jwt-simple");

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

module.exports = {
  getAllUsers,
};
