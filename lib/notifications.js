/**
 * Feature 6 — reusable in-app notification helpers.
 * Call only after an existing feature action succeeds.
 * Does not change capacity, promotion, or event-update decisions.
 */
const pool = require("../config/database");

const ALLOWED_TYPES = [
  "Registration",
  "WaitingList",
  "Promotion",
  "EventUpdate",
  "EventCancellation",
  "Attendance",
  "General"
];

/**
 * Insert one notification for a user.
 * @param {object} opts
 * @param {number} opts.userId
 * @param {number|null} [opts.eventId]
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} opts.type - notifications.notification_type enum value
 * @param {object} [opts.connection] - optional mysql2 connection (transaction)
 */
async function createNotification(opts) {
  const userId = Number(opts.userId);
  const eventId = opts.eventId == null ? null : Number(opts.eventId);
  const title = String(opts.title || "").trim().slice(0, 150);
  const message = String(opts.message || "").trim();
  const type = opts.type;

  if (!Number.isInteger(userId) || userId < 1) return null;
  if (!title || !message) return null;
  if (ALLOWED_TYPES.indexOf(type) === -1) return null;

  const db = opts.connection || pool;
  const [result] = await db.query(
    `INSERT INTO notifications (user_id, event_id, title, message, notification_type, is_read)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [userId, eventId, title, message, type]
  );
  return result.insertId;
}

/** Notify many users with the same title/message/type (e.g. event update). */
async function notifyUsers(userIds, opts) {
  const ids = [];
  const seen = {};
  (userIds || []).forEach(function (id) {
    const n = Number(id);
    if (Number.isInteger(n) && n > 0 && !seen[n]) {
      seen[n] = true;
      ids.push(n);
    }
  });
  if (!ids.length) return 0;

  let created = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = await createNotification({
      userId: ids[i],
      eventId: opts.eventId,
      title: opts.title,
      message: opts.message,
      type: opts.type,
      connection: opts.connection
    });
    if (id) created += 1;
  }
  return created;
}

async function markNotificationRead(userId, notificationId) {
  const [result] = await pool.query(
    `UPDATE notifications
     SET is_read = 1
     WHERE notification_id = ? AND user_id = ? AND is_read = 0`,
    [notificationId, userId]
  );
  return result.affectedRows > 0;
}

async function markAllNotificationsRead(userId) {
  const [result] = await pool.query(
    `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
    [userId]
  );
  return result.affectedRows;
}

module.exports = {
  createNotification: createNotification,
  notifyUsers: notifyUsers,
  markNotificationRead: markNotificationRead,
  markAllNotificationsRead: markAllNotificationsRead,
  ALLOWED_TYPES: ALLOWED_TYPES
};
