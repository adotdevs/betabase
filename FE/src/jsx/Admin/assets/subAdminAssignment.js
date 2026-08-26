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

export const getAssignedSubAdminIds = (user) => {
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

export const isAssignedToSubAdmin = (user, subAdminId) => {
  const target = normalizeId(subAdminId);
  if (!target) return false;
  return getAssignedSubAdminIds(user).includes(target);
};

export const hasSubAdminAccessToUser = (user, subAdminId) =>
  Boolean(user?.isShared) || isAssignedToSubAdmin(user, subAdminId);
