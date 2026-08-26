const normalizeId = (id) => {
  if (id == null || id === "") return null;
  if (typeof id === "object") {
    if (id._id) return String(id._id);
    if (typeof id.toString === "function") {
      const asString = id.toString();
      if (asString && asString !== "[object Object]") return asString;
    }
  }
  const asString = String(id);
  if (!asString || asString === "null" || asString === "undefined") return null;
  return asString;
};

const getAssignedSubAdminIds = (user) => {
  if (!user) return [];
  const ids = [];
  const seen = new Set();
  const add = (raw) => {
    const id = normalizeId(raw);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  add(user.assignedSubAdmin);
  if (Array.isArray(user.assignedSubAdmins)) {
    user.assignedSubAdmins.forEach(add);
  }
  return ids;
};

const isAssignedToSubAdmin = (user, subAdminId) => {
  const target = normalizeId(subAdminId);
  if (!target) return false;
  return getAssignedSubAdminIds(user).includes(target);
};

const hasSubAdminAccessToUser = (user, subAdminId) => {
  if (!user) return false;
  if (user.isShared === true) return true;
  return isAssignedToSubAdmin(user, subAdminId);
};

const assignedToSubAdminQuery = (subAdminId) => ({
  $or: [{ assignedSubAdmin: subAdminId }, { assignedSubAdmins: subAdminId }],
});

const subadminAccessibleUsersQuery = (subAdminId) => ({
  $or: [
    { isShared: true },
    { assignedSubAdmin: subAdminId },
    { assignedSubAdmins: subAdminId },
  ],
});

const syncAssignedSubAdmins = (user, ids) => {
  const unique = [];
  const seen = new Set();
  (ids || []).forEach((raw) => {
    const id = normalizeId(raw);
    if (!id || seen.has(id)) return;
    seen.add(id);
    unique.push(id);
  });
  user.assignedSubAdmins = unique;
  user.assignedSubAdmin = unique[0] || null;
  return unique;
};

module.exports = {
  normalizeId,
  getAssignedSubAdminIds,
  isAssignedToSubAdmin,
  hasSubAdminAccessToUser,
  assignedToSubAdminQuery,
  subadminAccessibleUsersQuery,
  syncAssignedSubAdmins,
};
