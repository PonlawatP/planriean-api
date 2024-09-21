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

module.exports = {
  userType,
  getRoleIndex,
  roleGrantAccess,
  getLargestRole,
  isUserHadRole,
};
