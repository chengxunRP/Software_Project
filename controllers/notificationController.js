const pool = require("../config/database");

function normalizeNotificationType(type) {
  if (!type) return "General";
  const allowed = ["Registration", "WaitingList", "Promotion", "EventUpdate", "EventCancellation", "Attendance", "General"];
  return allowed.indexOf(type) !== -1 ? type : "General";
}

async function createNotification(connectionOrPool, { userId, eventId, title, message, notificationType, isRead }) {
  const safeTitle = String(title || "New notification").trim();
  const safeMessage = String(message || "You have a new notification.").trim();
  const safeUserId = Number(userId);
  const safeEventId = eventId === null || eventId === undefined || eventId === "" ? null : Number(eventId);
  const finalType = normalizeNotificationType(notificationType);
  const unread = Boolean(isRead) ? 1 : 0;

  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    return null;
  }

  const [result] = await connectionOrPool.query(
    `INSERT INTO notifications (user_id, event_id, title, message, notification_type, is_read)
     VALUES (?, ?, ?, ?, ?, ?)` ,
    [safeUserId, safeEventId, safeTitle, safeMessage, finalType, unread]
  );

  return result.insertId;
}

async function listNotifications(connectionOrPool, userId, options) {
  const safeUserId = Number(userId);
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    return [];
  }

  const limit = Number(options && options.limit) || 10;
  const offset = Number(options && options.offset) || 0;
  const includeRead = options && Object.prototype.hasOwnProperty.call(options, "includeRead") ? Boolean(options.includeRead) : true;

  let sql = `SELECT notification_id, user_id, event_id, title, message, notification_type, is_read, created_at
             FROM notifications
             WHERE user_id = ?`;
  const values = [safeUserId];

  if (!includeRead) {
    sql += ` AND is_read = FALSE`;
  }

  sql += ` ORDER BY created_at DESC, notification_id DESC LIMIT ? OFFSET ?`;
  values.push(limit, offset);

  const [rows] = await connectionOrPool.query(sql, values);
  return rows;
}

async function markNotificationsRead(connectionOrPool, userId, notificationIds) {
  const safeUserId = Number(userId);
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    return 0;
  }

  const normalizedIds = Array.isArray(notificationIds) ? notificationIds.filter(function (value) {
    return Number.isInteger(Number(value)) && Number(value) > 0;
  }) : [];

  if (!normalizedIds.length) {
    return 0;
  }

  const placeholders = normalizedIds.map(function () { return "?"; }).join(", ");
  const [result] = await connectionOrPool.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE user_id = ? AND notification_id IN (${placeholders})`,
    [safeUserId].concat(normalizedIds)
  );

  return result.affectedRows || 0;
}

async function createVolunteerRegistrationNotification(connectionOrPool, userId, eventId, eventName) {
  return createNotification(connectionOrPool, {
    userId: userId,
    eventId: eventId,
    title: "Volunteer registration received",
    message: 'Your volunteer registration for "' + eventName + '" has been recorded.',
    notificationType: "Registration"
  });
}

async function createEventCreatedNotification(connectionOrPool, organiserId, eventId, eventName) {
  return createNotification(connectionOrPool, {
    userId: organiserId,
    eventId: eventId,
    title: "Event created",
    message: 'Your event "' + eventName + '" has been created successfully.',
    notificationType: "EventUpdate"
  });
}

async function createEventUpdatedNotification(connectionOrPool, organiserId, eventId, eventName) {
  return createNotification(connectionOrPool, {
    userId: organiserId,
    eventId: eventId,
    title: "Event updated",
    message: 'Your event "' + eventName + '" has been updated.',
    notificationType: "EventUpdate"
  });
}

async function createEventCancelledNotification(connectionOrPool, organiserId, eventId, eventName) {
  return createNotification(connectionOrPool, {
    userId: organiserId,
    eventId: eventId,
    title: "Event cancelled",
    message: 'Your event "' + eventName + '" has been cancelled.',
    notificationType: "EventCancellation"
  });
}

module.exports = {
  createNotification,
  listNotifications,
  markNotificationsRead,
  createVolunteerRegistrationNotification,
  createEventCreatedNotification,
  createEventUpdatedNotification,
  createEventCancelledNotification
};
