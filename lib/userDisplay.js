/**
 * Helpers for shaping logged-in users for the session and EJS views.
 * Account roles match the SQL ENUM exactly: community_member | organiser | admin
 */

const ROLE_LABELS = {
  community_member: "Community member",
  organiser: "Organiser",
  admin: "Administrator"
};

const ROLE_AVATAR_BG = {
  community_member: "#F4B83F",
  organiser: "#7FA8D9",
  admin: "#C08FBB"
};

function initialsFromName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "CC";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function firstNameFromName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[0] : "Member";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatJoined(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
}

/** Minimum user info kept in req.session.user — never the password hash. */
function toSessionUser(dbUser) {
  return {
    user_id: dbUser.user_id,
    name: dbUser.name,
    email: dbUser.email,
    role: dbUser.role,
    account_status: dbUser.account_status,
    joined: dbUser.created_at ? formatJoined(dbUser.created_at) : ""
  };
}

/** Shape the navbar and signed-in pages expect (name, firstName, initials, role label, avatarBg). */
function toViewUser(sessionUser) {
  return {
    name: sessionUser.name,
    firstName: firstNameFromName(sessionUser.name),
    initials: initialsFromName(sessionUser.name),
    role: ROLE_LABELS[sessionUser.role] || "Community member",
    email: sessionUser.email,
    joined: sessionUser.joined || "",
    mobile: "",
    avatarBg: ROLE_AVATAR_BG[sessionUser.role] || ROLE_AVATAR_BG.community_member
  };
}

function dashboardPathForRole(role) {
  if (role === "organiser") return "/organiser/dashboard";
  if (role === "admin") return "/admin/dashboard";
  return "/member/dashboard";
}

module.exports = {
  ROLE_LABELS: ROLE_LABELS,
  initialsFromName: initialsFromName,
  firstNameFromName: firstNameFromName,
  formatJoined: formatJoined,
  toSessionUser: toSessionUser,
  toViewUser: toViewUser,
  dashboardPathForRole: dashboardPathForRole
};
