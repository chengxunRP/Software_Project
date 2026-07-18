const pool = require("../config/database");
const { toViewUser } = require("../lib/userDisplay");
const { takeFlash } = require("../lib/flash");
const notifications = require("../lib/notifications");

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TONE_COLORS = {
  green: { badgeBg: "#E7F2EA", badgeFg: "#1E4D33" },
  amber: { badgeBg: "#FBF3DF", badgeFg: "#8A5E08" },
  grey: { badgeBg: "#EDEAE0", badgeFg: "#6E7266" }
};

// Mirrors lib/publicEvents.js CATEGORY_STYLES — kept local per the design
// preservation rules (no shared export exists for this small colour map).
const CATEGORY_STYLES = {
  Environment: { badgeBg: "#E7F2EA", badgeFg: "#1E4D33" },
  "Food Support": { badgeBg: "#FBF3DF", badgeFg: "#8A5E08" },
  "Elderly Support": { badgeBg: "#F3E9F2", badgeFg: "#7A4472" },
  Education: { badgeBg: "#E9EDF6", badgeFg: "#3B5384" },
  Fundraising: { badgeBg: "#FBEAE8", badgeFg: "#9C4038" }
};
const DEFAULT_CATEGORY_STYLE = { badgeBg: "#EDEAE0", badgeFg: "#6E7266" };

const NOTIFICATION_TYPE_TONE = {
  Registration: "success",
  Promotion: "success",
  Attendance: "success",
  WaitingList: "warning",
  EventCancellation: "warning",
  EventUpdate: "muted",
  General: "muted"
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** month short + day for the dashboard date-chip */
function dateChip(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return { month: "", day: "" };
  }
  return { month: MONTH_SHORT[d.getMonth()], day: pad2(d.getDate()) };
}

/** "Sat 25/07/2026" */
function dateLabel(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAY_SHORT[d.getDay()] + " " + pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
}

/** "08:00" */
function timeLabel(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

/** "DD/MM/YYYY" — used for volunteer-hours history table */
function shortDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
}

/** "Sat 25/07/2026 · 08:00–11:00 · Location" */
function eventMeta(startValue, endValue, location) {
  return dateLabel(startValue) + " · " + timeLabel(startValue) + "–" + timeLabel(endValue) + " · " + location;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatHours(value) {
  const num = Number(value) || 0;
  return num.toFixed(1);
}

function relativeNotificationTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfToday - startOfThat) / (24 * 60 * 60 * 1000));

  if (dayDiff === 0) return "Today, " + timeLabel(d);
  if (dayDiff === 1) return "Yesterday, " + timeLabel(d);
  return shortDate(d) + ", " + timeLabel(d);
}

/** Registration rows for a given status + participation type, mapped to the dashboard row shape. */
async function fetchRegistrationRows(userId, status, participationType, options) {
  const upcomingOnly = Boolean(options && options.upcomingOnly);

  let sql = `
    SELECT
      r.registration_id,
      r.event_id,
      r.participation_type,
      r.status,
      r.waiting_position,
      r.notes,
      e.event_name,
      e.start_datetime,
      e.end_datetime,
      e.location,
      (
        SELECT COUNT(*)
        FROM event_registrations w
        WHERE w.event_id = r.event_id
          AND w.participation_type = r.participation_type
          AND w.status = 'Waitlisted'
      ) AS waitlist_total
    FROM event_registrations r
    INNER JOIN events e ON e.event_id = r.event_id
    WHERE r.user_id = ?
      AND r.status = ?
      AND r.participation_type = ?
  `;
  const params = [userId, status, participationType];

  if (upcomingOnly) {
    sql += " AND e.start_datetime >= NOW()";
  }

  sql += " ORDER BY e.start_datetime ASC, r.registered_at ASC";

  const [rows] = await pool.query(sql, params);

  return rows.map(function (row) {
    const tone = status === "Waitlisted" ? "amber" : "green";
    const chip = dateChip(row.start_datetime);
    const colors = TONE_COLORS[tone];
    const waitlistTotal = Number(row.waitlist_total) || 0;

    const base = {
      name: row.event_name,
      meta: eventMeta(row.start_datetime, row.end_datetime, row.location),
      month: chip.month,
      day: chip.day,
      tone: tone,
      participation_type: row.participation_type,
      eventId: row.event_id,
      badgeBg: colors.badgeBg,
      badgeFg: colors.badgeFg
    };

    if (status === "Waitlisted") {
      base.waiting_position = row.waiting_position;
      base.badge = "Waitlist #" + row.waiting_position;
      base.note = row.participation_type
        + " waitlist — position "
        + row.waiting_position
        + " of "
        + waitlistTotal
        + ".";
    }

    return base;
  });
}

/** Up to `limit` Open/Full upcoming events the member has not already registered for. */
async function fetchRecommendedEvents(userId, limit) {
  const [rows] = await pool.query(
    `SELECT
       e.event_id,
       e.event_name,
       e.start_datetime,
       e.end_datetime,
       e.participant_capacity,
       e.volunteer_capacity,
       c.category_name,
       COALESCE(SUM(CASE WHEN r.participation_type = 'Participant' AND r.status = 'Confirmed' THEN 1 ELSE 0 END), 0) AS participant_count,
       COALESCE(SUM(CASE WHEN r.participation_type = 'Volunteer' AND r.status = 'Confirmed' THEN 1 ELSE 0 END), 0) AS volunteer_count
     FROM events e
     INNER JOIN event_categories c ON c.category_id = e.category_id
     LEFT JOIN event_registrations r ON r.event_id = e.event_id
     WHERE e.status IN ('Open', 'Full')
       AND e.start_datetime >= NOW()
       AND e.event_id NOT IN (
         SELECT event_id
         FROM event_registrations
         WHERE user_id = ?
           AND status IN ('Confirmed', 'Waitlisted')
       )
     GROUP BY
       e.event_id,
       e.event_name,
       e.start_datetime,
       e.end_datetime,
       e.participant_capacity,
       e.volunteer_capacity,
       c.category_name
     ORDER BY e.start_datetime ASC
     LIMIT ?`,
    [userId, limit]
  );

  return rows.map(function (row) {
    const style = CATEGORY_STYLES[row.category_name] || DEFAULT_CATEGORY_STYLE;
    const participantLeft = Math.max((Number(row.participant_capacity) || 0) - (Number(row.participant_count) || 0), 0);
    const volunteerLeft = Math.max((Number(row.volunteer_capacity) || 0) - (Number(row.volunteer_count) || 0), 0);

    return {
      id: row.event_id,
      event_id: row.event_id,
      event_name: row.event_name,
      category: row.category_name,
      badgeBg: style.badgeBg,
      badgeFg: style.badgeFg,
      when: dateLabel(row.start_datetime) + " · " + timeLabel(row.start_datetime) + "–" + timeLabel(row.end_datetime),
      participants: { left: participantLeft },
      volunteers: { left: volunteerLeft }
    };
  });
}

/** Recent in-app notifications for this member, newest first. */
async function fetchNotifications(userId, limit) {
  const [rows] = await pool.query(
    `SELECT notification_id, title, message, notification_type, is_read, created_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, limit]
  );

  return rows.map(function (row) {
    return {
      id: row.notification_id,
      type: NOTIFICATION_TYPE_TONE[row.notification_type] || "muted",
      text: "<b>" + escapeHtml(row.title) + "</b> — " + escapeHtml(row.message),
      time: relativeNotificationTime(row.created_at),
      is_read: !!row.is_read
    };
  });
}

async function markNotificationRead(req, res) {
  const userId = req.session.user.user_id;
  const notificationId = parseInt(req.params.id, 10);
  if (!Number.isInteger(notificationId) || notificationId < 1) {
    return res.redirect("/member/dashboard");
  }
  try {
    await notifications.markNotificationRead(userId, notificationId);
  } catch (err) {
    console.error("markNotificationRead failed:", err.message);
  }
  return res.redirect("/member/dashboard");
}

async function markAllNotificationsRead(req, res) {
  const userId = req.session.user.user_id;
  try {
    await notifications.markAllNotificationsRead(userId);
  } catch (err) {
    console.error("markAllNotificationsRead failed:", err.message);
  }
  return res.redirect("/member/dashboard");
}

/** Total completed volunteer hours + distinct attended volunteer events for this member. */
async function fetchVolunteerHoursSummary(userId) {
  const [[row]] = await pool.query(
    `SELECT
       COALESCE(SUM(a.volunteer_hours), 0) AS total_hours,
       COUNT(*) AS event_count
     FROM attendance a
     INNER JOIN event_registrations r ON r.registration_id = a.registration_id
     WHERE r.user_id = ?
       AND r.participation_type = 'Volunteer'
       AND a.attendance_status = 'Attended'`,
    [userId]
  );

  return {
    totalHours: formatHours(row.total_hours),
    eventCount: Number(row.event_count) || 0
  };
}

async function dashboard(req, res) {
  const userId = req.session.user.user_id;

  try {
    const [asParticipant, asVolunteer, participantWaitlist, volunteerWaitlist, recommended, notifications, hoursSummary] =
      await Promise.all([
        fetchRegistrationRows(userId, "Confirmed", "Participant", { upcomingOnly: true }),
        fetchRegistrationRows(userId, "Confirmed", "Volunteer", { upcomingOnly: true }),
        fetchRegistrationRows(userId, "Waitlisted", "Participant"),
        fetchRegistrationRows(userId, "Waitlisted", "Volunteer"),
        fetchRecommendedEvents(userId, 2),
        fetchNotifications(userId, 8),
        fetchVolunteerHoursSummary(userId)
      ]);

    res.render("member/dashboard", {
      layout: "app",
      role: "member",
      activeNav: "dashboard",
      pageTitle: "Dashboard · Community member",
      currentUser: toViewUser(req.session.user),
      messages: takeFlash(req),
      asParticipant: asParticipant,
      asVolunteer: asVolunteer,
      participantWaitlist: participantWaitlist,
      volunteerWaitlist: volunteerWaitlist,
      recommended: recommended,
      notifications: notifications,
      stats: {
        participantUpcoming: asParticipant.length,
        volunteerUpcoming: asVolunteer.length,
        participantWaitlist: participantWaitlist.length,
        volunteerWaitlist: volunteerWaitlist.length,
        hours: hoursSummary.totalHours,
        hoursNote: "Across " + hoursSummary.eventCount + " volunteer event" + (hoursSummary.eventCount === 1 ? "" : "s")
      }
    });
  } catch (err) {
    console.error("memberController.dashboard failed:", err.message);
    res.status(500).render("error", {
      layout: "public",
      activeNav: "",
      pageTitle: "Something went wrong · CommunityConnect SG",
      currentUser: req.session.user || null,
      messages: [],
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load your dashboard. Please try again shortly."
    });
  }
}

async function volunteerHours(req, res) {
  const userId = req.session.user.user_id;

  try {
    const [rows] = await pool.query(
      `SELECT
         a.attendance_status,
         a.volunteer_hours,
         e.event_name,
         e.start_datetime,
         e.location
       FROM attendance a
       INNER JOIN event_registrations r ON r.registration_id = a.registration_id
       INNER JOIN events e ON e.event_id = r.event_id
       WHERE r.user_id = ?
         AND r.participation_type = 'Volunteer'
       ORDER BY e.start_datetime DESC`,
      [userId]
    );

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let totalHours = 0;
    let attendedCount = 0;
    let absentCount = 0;
    let monthHours = 0;
    let monthEvents = 0;
    const monthlyHours = new Array(12).fill(0);

    const history = rows.map(function (row) {
      const start = row.start_datetime instanceof Date ? row.start_datetime : new Date(row.start_datetime);
      const isAttended = row.attendance_status === "Attended";
      const hours = Number(row.volunteer_hours) || 0;

      if (isAttended) {
        attendedCount += 1;
        totalHours += hours;
        if (!Number.isNaN(start.getTime())) {
          if (start.getFullYear() === currentYear) {
            monthlyHours[start.getMonth()] += hours;
          }
          if (start.getFullYear() === currentYear && start.getMonth() === currentMonth) {
            monthHours += hours;
            monthEvents += 1;
          }
        }
      } else {
        absentCount += 1;
      }

      return {
        name: row.event_name,
        date: shortDate(row.start_datetime),
        loc: row.location,
        status: isAttended ? "Attended" : "Absent",
        hours: isAttended ? formatHours(hours) : "—"
      };
    });

    const totalAttendance = attendedCount + absentCount;
    const attendanceRate = totalAttendance
      ? Math.round((attendedCount / totalAttendance) * 100) + "%"
      : "0%";

    const maxMonthHours = Math.max.apply(null, monthlyHours);
    const months = MONTH_SHORT.map(function (label, index) {
      const val = monthlyHours[index];
      return {
        label: label,
        val: formatHours(val),
        h: maxMonthHours > 0 ? Math.round((val / maxMonthHours) * 140) : 0,
        current: index === currentMonth
      };
    });

    res.render("member/volunteer-hours", {
      layout: "app",
      role: "member",
      activeNav: "hours",
      pageTitle: "Volunteer Hours · Community member",
      currentUser: toViewUser(req.session.user),
      messages: takeFlash(req),
      summary: {
        totalHours: formatHours(totalHours),
        eventCount: attendedCount,
        monthHours: formatHours(monthHours),
        monthEvents: monthEvents,
        attendanceRate: attendanceRate,
        attended: attendedCount,
        absent: absentCount,
        monthLabel: MONTH_SHORT[currentMonth],
        chartYear: currentYear
      },
      months: months,
      history: history
    });
  } catch (err) {
    console.error("memberController.volunteerHours failed:", err.message);
    res.status(500).render("error", {
      layout: "public",
      activeNav: "",
      pageTitle: "Something went wrong · CommunityConnect SG",
      currentUser: req.session.user || null,
      messages: [],
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load your volunteer hours. Please try again shortly."
    });
  }
}

async function profile(req, res) {
  const userId = req.session.user.user_id;

  try {
    const hoursSummary = await fetchVolunteerHoursSummary(userId);

    res.render("member/profile", {
      layout: "app",
      role: "member",
      activeNav: "profile",
      pageTitle: "My Profile · Community member",
      currentUser: toViewUser(req.session.user),
      messages: takeFlash(req),
      profile: toViewUser(req.session.user),
      hours: hoursSummary.totalHours,
      attendedEvents: hoursSummary.eventCount
    });
  } catch (err) {
    console.error("memberController.profile failed:", err.message);
    res.status(500).render("error", {
      layout: "public",
      activeNav: "",
      pageTitle: "Something went wrong · CommunityConnect SG",
      currentUser: req.session.user || null,
      messages: [],
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load your profile. Please try again shortly."
    });
  }
}

module.exports = {
  dashboard: dashboard,
  volunteerHours: volunteerHours,
  profile: profile,
  markNotificationRead: markNotificationRead,
  markAllNotificationsRead: markAllNotificationsRead
};
