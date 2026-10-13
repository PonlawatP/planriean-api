const db = require("../db");
const { getUserFromRequest } = require("../utils/userutil");
const { hasRoleFor, getRoleIndex } = require("../routes/users/userTypes");

// Use AFTER requireJWTAuth. minRole: "helper" | "moderator" | "admin".
// scope: "param" (req.params.uni_id / param_uni_id must be inside the role's university) | "global" (role must have no university).
const requireRole = (minRole, scope = "param") => async (req, res, next) => {
  const user = await getUserFromRequest(req);
  const uni_id = scope === "global" ? null : req.params.uni_id ?? req.params.param_uni_id;
  if (user && hasRoleFor(user.roles, getRoleIndex(minRole), uni_id)) return next();
  res.status(403).json({ success: false, message: "Permission forbidden." });
};

// Restricted-group routes: the university comes from the group row (courseset_restrictgrp.uni_id), never from the URL/body.
// Missing group (or a URL :uni_id that does not own it) -> 404; otherwise role must cover that university.
const requireRestrictGroupRole = (minRole) => async (req, res, next) => {
  try {
    const id = req.params.cr_restgrp_id ?? req.params.restgrp_id;
    const g = /^\d+$/.test(String(id)) ? await db.query("SELECT uni_id FROM courseset_restrictgrp WHERE cr_restgrp_id = $1", [id]) : { rows: [] };
    if (!g.rows.length || (req.params.uni_id != null && g.rows[0].uni_id != req.params.uni_id)) {
      return res.status(404).json({ success: false, error: 404, msg: "Restricted Group Not Found" });
    }
    const user = await getUserFromRequest(req);
    if (user && hasRoleFor(user.roles, getRoleIndex(minRole), g.rows[0].uni_id)) return next();
    res.status(403).json({ success: false, message: "Permission forbidden." });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Sad");
  }
};

// Course-set routes (course-set, header, course, map): a helper is also limited to the faculty (and course-set, if set) on its role row.
// Faculty comes from the DB row for :cr_id (never the body); for create (no :cr_id) it is body.fac_id. Unknown :cr_id -> only the
// university-level check, the handler answers its own 404 (nothing to write).
const requireCourseSetRole = (minRole) => async (req, res, next) => {
  try {
    const uni_id = req.params.uni_id;
    const user = await getUserFromRequest(req);
    const min = getRoleIndex(minRole);
    if (!user || !hasRoleFor(user.roles, min, uni_id)) return res.status(403).json({ success: false, message: "Permission forbidden." });
    let scope = { fac_id: req.body?.fac_id, cr_id: null };
    if (req.params.cr_id != null) {
      const id = req.params.cr_id;
      const c = /^\d+$/.test(String(id)) ? await db.query("SELECT fac_id FROM courseset_detail WHERE cr_id = $1 AND uni_id = $2", [id, uni_id]) : { rows: [] };
      if (!c.rows.length) return next();
      scope = { fac_id: c.rows[0].fac_id, cr_id: Number(id) };
    }
    if (hasRoleFor(user.roles, min, uni_id, scope)) return next();
    res.status(403).json({ success: false, message: "Permission forbidden." });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Sad");
  }
};

module.exports = { requireRole, requireRestrictGroupRole, requireCourseSetRole };
