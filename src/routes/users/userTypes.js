const userType = ["user", "helper", "moderator", "admin"];

const getRoleIndex = (targetRole) => {
  return userType.findIndex((role) => role === targetRole);
};
const roleGrantAccess = (actorRole, targetRole) => {
  const actInt = userType.findIndex((role) => role === actorRole);
  const tgtInt = userType.findIndex((role) => role === targetRole);
  return actInt >= tgtInt;
};

const getLargestRole = (roles) => {
  let current = 0;
  let current_ind = 0;
  roles.forEach((r, rIndex) => {
    const compared = userType.findIndex((role) => role === r.role);
    if (compared > current) {
      current = compared;
      current_ind = rIndex;
    }
  });
  return { role: roles[current_ind], index: current };
};
const isUserHadRole = (targetRole, roles) => {
  return (
    roles.find(
      (r) =>
        r.role === targetRole.role &&
        r.university?.uni_id === targetRole.uni_id &&
        r.faculty?.fac_id === targetRole.fac_id &&
        r.major?.cr_id === targetRole.major
    ) != undefined
  );
};

// roles = getUserRoles() shape: [{ role, university: {uni_id} | null, ... }]. A role with university == null is global.
// uni_id == null asks for a global role (e.g. creating a university).
// scope = { fac_id, cr_id } narrows HELPER rows only (helpers are created with a mandatory faculty and an optional course-set,
// see a_addUserRole): fac_id != null on the row must equal scope.fac_id, major (course-set) != null must equal scope.cr_id.
// moderator/admin rows stay university-wide. scope omitted = university-level check only.
const hasRoleFor = (roles, minIndex, uni_id = null, scope = null) =>
  (roles || []).some(
    (r) =>
      getRoleIndex(r.role) >= minIndex &&
      (r.university == null || (uni_id != null && r.university.uni_id == uni_id)) &&
      (!scope ||
        r.role !== "helper" ||
        ((r.faculty == null || r.faculty.fac_id == scope.fac_id) && (r.major == null || r.major.cr_id == scope.cr_id)))
  );

module.exports = {
  hasRoleFor,
  userType,
  getRoleIndex,
  roleGrantAccess,
  getLargestRole,
  isUserHadRole,
};
