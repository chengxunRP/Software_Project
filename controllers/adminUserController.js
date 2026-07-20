const crypto = require("crypto");
const pool = require("../config/database");
const { flash, takeFlash } = require("../lib/flash");
const {
  ROLE_LABELS,
  initialsFromName,
  formatJoined,
  toViewUser
} = require("../lib/userDisplay");
const passwordResetService = require("../services/passwordResetService");

// Server-side allow-lists — role/status values from the browser are only
// accepted when they match these exactly.
const ALLOWED_ROLES = ["community_member", "organiser", "admin"];
const ALLOWED_STATUSES = ["Active", "Suspended"];

const AVATAR_COLORS = ["#7FA8D9", "#F4B83F", "#C08FBB", "#8FBF9A", "#D9A08F", "#B9C98F"];

function mapUserRow(row, index) {
  return {
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] || row.role,
    status: row.account_status,
    joined: formatJoined(row.created_at),
    initials: initialsFromName(row.name),
    avBg: AVATAR_COLORS[index % AVATAR_COLORS.length]
  };
}

async function listUsers(req, res) {
  const q = String(req.query.q || "").trim();
  const roleFilter = String(req.query.role || "").trim();
  const statusFilter = String(req.query.status || "").trim();

  try {
    const where = [];
    const params = [];

    if (q) {
      where.push("(name LIKE ? OR email LIKE ?)");
      params.push("%" + q + "%", "%" + q + "%");
    }
    if (ALLOWED_ROLES.indexOf(roleFilter) !== -1) {
      where.push("role = ?");
      params.push(roleFilter);
    }
    if (ALLOWED_STATUSES.indexOf(statusFilter) !== -1) {
      where.push("account_status = ?");
      params.push(statusFilter);
    }

    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM users",
      []
    );
    const [rows] = await pool.query(
      `SELECT user_id, name, email, role, account_status, created_at
       FROM users
       ${whereSql}
       ORDER BY created_at DESC, user_id DESC`,
      params
    );

    res.render("admin/users", {
      layout: "app",
      role: "admin",
      activeNav: "users",
      pageTitle: "User Management · Admin",
      currentUser: toViewUser(req.session.user),
      users: rows.map(mapUserRow),
      totalUsers: Number(countRows[0].total) || 0,
      filters: { q: q, role: roleFilter, status: statusFilter },
      messages: takeFlash(req)
    });
  } catch (err) {
    console.error("listUsers failed:", err.message);
    flash(req, "error", "We could not load user accounts. Please try again.");
    return res.redirect("/admin/dashboard");
  }
}

async function updateUserRole(req, res) {
  const userId = Number(req.params.id);
  const newRole = String(req.body.role || "").trim();
  const adminId = Number(req.session.user.user_id);

  if (!Number.isInteger(userId) || userId <= 0) {
    flash(req, "error", "That user could not be found.");
    return res.redirect("/admin/users");
  }
  if (ALLOWED_ROLES.indexOf(newRole) === -1) {
    flash(req, "error", "Please choose a valid account role.");
    return res.redirect("/admin/users");
  }
  // An admin cannot demote themselves — prevents locking everyone out.
  if (userId === adminId && newRole !== "admin") {
    flash(req, "error", "You cannot remove your own administrator role.");
    return res.redirect("/admin/users");
  }

  try {
    const [result] = await pool.query(
      "UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
      [newRole, userId]
    );
    if (!result.affectedRows) {
      flash(req, "error", "That user could not be found.");
    } else {
      flash(req, "success", "The account role has been updated.");
    }
    return res.redirect("/admin/users");
  } catch (err) {
    console.error("updateUserRole failed:", err.message);
    flash(req, "error", "We could not update that role. Please try again.");
    return res.redirect("/admin/users");
  }
}

async function updateUserStatus(req, res) {
  const userId = Number(req.params.id);
  const newStatus = String(req.body.account_status || "").trim();
  const adminId = Number(req.session.user.user_id);

  if (!Number.isInteger(userId) || userId <= 0) {
    flash(req, "error", "That user could not be found.");
    return res.redirect("/admin/users");
  }
  if (ALLOWED_STATUSES.indexOf(newStatus) === -1) {
    flash(req, "error", "Please choose a valid account status.");
    return res.redirect("/admin/users");
  }
  if (userId === adminId && newStatus !== "Active") {
    flash(req, "error", "You cannot suspend your own administrator account.");
    return res.redirect("/admin/users");
  }

  try {
    const [result] = await pool.query(
      "UPDATE users SET account_status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
      [newStatus, userId]
    );
    if (!result.affectedRows) {
      flash(req, "error", "That user could not be found.");
    } else {
      flash(req, "success", newStatus === "Active" ? "The account has been activated." : "The account has been suspended.");
    }
    return res.redirect("/admin/users");
  } catch (err) {
    console.error("updateUserStatus failed:", err.message);
    flash(req, "error", "We could not update that account status. Please try again.");
    return res.redirect("/admin/users");
  }
}

/**
 * Admin "reset access": issues a one-time reset token through the same
 * password_reset_tokens flow used by forgot-password, then emails the link.
 */
async function adminResetAccess(req, res) {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId) || userId <= 0) {
    flash(req, "error", "That user could not be found.");
    return res.redirect("/admin/users");
  }

  try {
    const [rows] = await pool.query(
      "SELECT user_id, name, email, account_status FROM users WHERE user_id = ? LIMIT 1",
      [userId]
    );
    if (!rows.length) {
      flash(req, "error", "That user could not be found.");
      return res.redirect("/admin/users");
    }

    const user = rows[0];
    if (user.account_status !== "Active") {
      flash(req, "error", "Activate the account before issuing a password reset.");
      return res.redirect("/admin/users");
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = passwordResetService.hashResetToken(rawToken);
    const expiresMinutes = passwordResetService.getPasswordResetExpiresMinutes();

    await pool.query(
      "UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL",
      [user.user_id]
    );
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
      [user.user_id, tokenHash, expiresMinutes]
    );

    try {
      await passwordResetService.sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl: passwordResetService.buildPasswordResetUrl(rawToken),
        expiresMinutes: expiresMinutes
      });
      flash(req, "success", "A password-reset email was sent for " + user.email + ".");
    } catch (mailErr) {
      console.error("adminResetAccess email failed:", mailErr && mailErr.message
        ? mailErr.message
        : "unknown error");
      flash(req, "success", "A password-reset token was created for " + user.email
        + ". The email could not be sent; ask the user to use Forgot password, or check email configuration.");
    }
    return res.redirect("/admin/users");
  } catch (err) {
    console.error("adminResetAccess failed:", err.message);
    flash(req, "error", "We could not reset access for that account. Please try again.");
    return res.redirect("/admin/users");
  }
}

async function deleteUser(req, res) {
  const userId = Number(req.params.id);
  const adminId = Number(req.session.user.user_id);
  const confirmEmail = String(req.body.confirm_email || "").trim().toLowerCase();

  if (!Number.isInteger(userId) || userId <= 0) {
    flash(req, "error", "That user could not be found.");
    return res.redirect("/admin/users");
  }
  if (userId === adminId) {
    flash(req, "error", "You cannot delete your own administrator account.");
    return res.redirect("/admin/users");
  }

  try {
    const [rows] = await pool.query(
      "SELECT user_id, email, role FROM users WHERE user_id = ? LIMIT 1",
      [userId]
    );
    if (!rows.length) {
      flash(req, "error", "That user could not be found.");
      return res.redirect("/admin/users");
    }

    // Typed-email confirmation prevents accidental deletion.
    if (confirmEmail !== String(rows[0].email).toLowerCase()) {
      flash(req, "error", "Deletion cancelled — the confirmation email did not match.");
      return res.redirect("/admin/users");
    }

    // Organisers own events (events.organiser_id has no CASCADE) — deleting
    // them would orphan or destroy event data owned by Feature 2.
    const [ownedEvents] = await pool.query(
      "SELECT COUNT(*) AS total FROM events WHERE organiser_id = ?",
      [userId]
    );
    if (Number(ownedEvents[0].total) > 0) {
      flash(req, "error", "This account owns events and cannot be deleted. Suspend the account instead.");
      return res.redirect("/admin/users");
    }

    // Member registrations, assignments, attendance, notifications and reset
    // tokens are removed by the schema's ON DELETE CASCADE rules.
    await pool.query("DELETE FROM users WHERE user_id = ?", [userId]);
    flash(req, "success", "The user account has been deleted.");
    return res.redirect("/admin/users");
  } catch (err) {
    console.error("deleteUser failed:", err.message);
    flash(req, "error", "We could not delete that account. It may still be linked to other records.");
    return res.redirect("/admin/users");
  }
}

module.exports = {
  listUsers,
  updateUserRole,
  updateUserStatus,
  adminResetAccess,
  deleteUser
};
