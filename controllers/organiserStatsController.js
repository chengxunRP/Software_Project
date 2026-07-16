const pool = require("../config/database");

function getOrganiserId(req) {
  const userId = req.currentUser && Number(req.currentUser.user_id);
  if (Number.isInteger(userId) && userId > 0) {
    return userId;
  }

  const sessionId = req.session && req.session.user && Number(req.session.user.user_id);
  if (Number.isInteger(sessionId) && sessionId > 0) {
    return sessionId;
  }

  const explicitId = Number(req.query.organiser_id || req.body?.organiser_id || process.env.DEV_ORGANISER_ID || 2);
  return Number.isInteger(explicitId) && explicitId > 0 ? explicitId : 2;
}

function formatPercent(value) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return "0%";
  return Math.round(numericValue * 100) + "%";
}

function formatHours(value) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return "0.0";
  return numericValue.toFixed(1);
}

function formatDateChip(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { month: "", day: "", when: "" };
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return {
    month: months[date.getMonth()],
    day: String(date.getDate()).padStart(2, "0"),
    when: date.toLocaleDateString("en-SG", { dateStyle: "medium" })
  };
}

function buildCapacityMeta(filled, capacity) {
  const pct = capacity ? Math.round((filled / capacity) * 100) : 0;
  const left = Math.max(capacity - filled, 0);
  const full = left <= 0;
  return {
    filled,
    capacity,
    pct,
    left,
    full,
    capColor: full ? "#B0433B" : pct >= 80 ? "#D99E2B" : "#2E7D4F"
  };
}

function buildUpcomingEventRow(row) {
  const participants = buildCapacityMeta(Number(row.confirmed_participants || 0), Number(row.participant_capacity || 0));
  const volunteers = buildCapacityMeta(Number(row.confirmed_volunteers || 0), Number(row.volunteer_capacity || 0));
  const dateChip = formatDateChip(row.start_datetime);

  return {
    id: row.event_id,
    event_name: row.event_name,
    month: dateChip.month,
    day: dateChip.day,
    participants_filled: participants.filled,
    participant_capacity: participants.capacity,
    volunteers_filled: volunteers.filled,
    volunteer_capacity: volunteers.capacity,
    participants,
    volunteers,
    status: row.status
  };
}

async function getOrganiserDashboardData(organiserId) {
  const [summaryRows] = await pool.query(
    `SELECT
       COUNT(*) AS total_events,
       SUM(CASE WHEN status = 'Open' THEN 1 ELSE 0 END) AS active_events,
       SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed_events,
       SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) AS cancelled_events,
       SUM(volunteer_confirmed_count) AS total_registered_volunteers,
       SUM(attendance_recorded_count) AS attendance_count,
       SUM(attended_count) AS attended_count,
       SUM(total_volunteer_hours) AS total_volunteer_hours
     FROM (
       SELECT
         e.event_id,
         e.status,
         COUNT(DISTINCT CASE WHEN er.participation_type = 'Volunteer' AND er.status = 'Confirmed' THEN er.registration_id END) AS volunteer_confirmed_count,
         COUNT(DISTINCT CASE WHEN a.attendance_id IS NOT NULL THEN a.attendance_id END) AS attendance_recorded_count,
         COUNT(DISTINCT CASE WHEN a.attendance_status = 'Attended' THEN a.attendance_id END) AS attended_count,
         COALESCE(SUM(CASE WHEN er.participation_type = 'Volunteer' AND a.attendance_status = 'Attended' THEN a.volunteer_hours ELSE 0 END), 0) AS total_volunteer_hours
       FROM events e
       LEFT JOIN event_registrations er ON er.event_id = e.event_id
       LEFT JOIN attendance a ON a.registration_id = er.registration_id
       WHERE e.organiser_id = ?
       GROUP BY e.event_id, e.status
     ) event_stats`,
    [organiserId]
  );

  const [upcomingRows] = await pool.query(
    `SELECT
       e.event_id,
       e.event_name,
       e.start_datetime,
       e.status,
       e.participant_capacity,
       e.volunteer_capacity,
       SUM(CASE WHEN er.participation_type = 'Participant' AND er.status = 'Confirmed' THEN 1 ELSE 0 END) AS confirmed_participants,
       SUM(CASE WHEN er.participation_type = 'Volunteer' AND er.status = 'Confirmed' THEN 1 ELSE 0 END) AS confirmed_volunteers
     FROM events e
     LEFT JOIN event_registrations er ON er.event_id = e.event_id
     WHERE e.organiser_id = ? AND e.status IN ('Open', 'Full')
     GROUP BY e.event_id, e.event_name, e.start_datetime, e.status, e.participant_capacity, e.volunteer_capacity
     ORDER BY e.start_datetime ASC
     LIMIT 5`,
    [organiserId]
  );

  const summary = summaryRows[0] || {};

  const totalEvents = Number(summary.total_events || 0);
  const activeEvents = Number(summary.active_events || 0);
  const completedEvents = Number(summary.completed_events || 0);
  const cancelledEvents = Number(summary.cancelled_events || 0);
  const totalRegisteredVolunteers = Number(summary.total_registered_volunteers || 0);
  const attendanceCount = Number(summary.attendance_count || 0);
  const attendedCount = Number(summary.attended_count || 0);
  const totalVolunteerHours = Number(summary.total_volunteer_hours || 0);
  const averageVolunteersPerEvent = totalEvents > 0 ? totalRegisteredVolunteers / totalEvents : 0;
  const attendanceRate = attendanceCount > 0 ? attendedCount / attendanceCount : 0;

  return {
    stats: {
      totalEvents,
      activeEvents,
      completedEvents,
      cancelledEvents,
      totalRegisteredVolunteers,
      attendanceRate: formatPercent(attendanceRate),
      averageVolunteersPerEvent: averageVolunteersPerEvent.toFixed(1),
      totalVolunteerHours: formatHours(totalVolunteerHours)
    },
    upcoming: upcomingRows.map(buildUpcomingEventRow)
  };
}

async function renderOrganiserDashboard(req, res) {
  try {
    const organiserId = getOrganiserId(req);
    const dashboardData = await getOrganiserDashboardData(organiserId);

    res.render("organiser/dashboard", {
      layout: "app",
      role: "organiser",
      activeNav: "dashboard",
      pageTitle: "Dashboard · Organiser",
      currentUser: {
        name: "Marcus Lim",
        initials: "ML",
        role: "Organiser · Green Team",
        avatarBg: "#7FA8D9"
      },
      messages: [],
      stats: dashboardData.stats,
      upcoming: dashboardData.upcoming,
      alerts: [
        { tone: "danger", text: "Volunteer and participant places are monitored live from the latest registrations.", link: "/organiser/events", linkText: "Review events →" }
      ],
      attendance: [
        { name: "Live attendance summary", rate: dashboardData.stats.attendanceRate }
      ]
    });
  } catch (error) {
    console.error("organiser dashboard stats failed:", error.message);
    res.status(500).render("error", {
      layout: "public",
      activeNav: "dashboard",
      pageTitle: "Something went wrong · CommunityConnect SG",
      currentUser: null,
      messages: [],
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load your organiser statistics. Please try again shortly."
    });
  }
}

async function apiOrganiserDashboardStats(req, res) {
  try {
    const organiserId = getOrganiserId(req);
    const dashboardData = await getOrganiserDashboardData(organiserId);
    res.json(dashboardData.stats);
  } catch (error) {
    console.error("organiser dashboard API failed:", error.message);
    res.status(500).json({ error: "Unable to load organiser statistics." });
  }
}

module.exports = {
  renderOrganiserDashboard,
  apiOrganiserDashboardStats,
  getOrganiserDashboardData
};
