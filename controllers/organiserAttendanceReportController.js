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

  if (process.env.NODE_ENV !== "production") {
    const devOrganiserId = Number(process.env.DEV_ORGANISER_ID);
    if (Number.isInteger(devOrganiserId) && devOrganiserId > 0) {
      return devOrganiserId;
    }
  }

  throw new Error("No organiser context available for attendance report.");
}

function ensureOrganiserAccess(req) {
  const role = req.currentUser?.role || req.session?.user?.role || "";
  if (role !== "organiser") {
    throw new Error("Only organisers can access attendance reports.");
  }
}

function buildAttendanceReportRows(rows, options = {}) {
  const sortBy = options.sortBy || "event_date";
  const sortOrder = options.sortOrder === "asc" ? "asc" : "desc";

  const normalizedRows = (rows || []).map((row) => {
    const totalRegisteredVolunteers = Number(row.total_registered_volunteers ?? row.registered_volunteers ?? row.total_registered ?? 0);
    const present = Number(row.present ?? row.attended_count ?? row.present_count ?? 0);
    const absent = Number(row.absent ?? row.absent_count ?? row.absent_count ?? 0);
    const attendancePercentage = totalRegisteredVolunteers > 0 ? Math.round((present / totalRegisteredVolunteers) * 100) : 0;

    return {
      event_id: row.event_id,
      event_name: row.event_name,
      event_date: row.start_datetime,
      formatted_event_date: formatEventDate(row.start_datetime),
      total_registered_volunteers: totalRegisteredVolunteers,
      present,
      absent,
      attendance_percentage: attendancePercentage,
      volunteer_hours_earned: Number(row.volunteer_hours_earned ?? row.volunteer_hours ?? 0),
      waitlisted_volunteers: Number(row.waitlisted_volunteers ?? row.waitlisted_count ?? row.waitlisted ?? 0),
      event_status: row.event_status
    };
  });

  const comparator = (left, right) => {
    const direction = sortOrder === "asc" ? 1 : -1;

    switch (sortBy) {
      case "event_name":
        return direction * String(left.event_name || "").localeCompare(String(right.event_name || ""));
      case "total_registered_volunteers":
        return direction * (left.total_registered_volunteers - right.total_registered_volunteers);
      case "present":
        return direction * (left.present - right.present);
      case "absent":
        return direction * (left.absent - right.absent);
      case "attendance_percentage":
        return direction * (left.attendance_percentage - right.attendance_percentage);
      case "volunteer_hours_earned":
        return direction * (left.volunteer_hours_earned - right.volunteer_hours_earned);
      case "waitlisted_volunteers":
        return direction * (left.waitlisted_volunteers - right.waitlisted_volunteers);
      case "event_date":
      default:
        return direction * (new Date(left.event_date || 0) - new Date(right.event_date || 0));
    }
  };

  return normalizedRows.sort(comparator);
}

function formatEventDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "TBC";
  }
  return date.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

function buildAttendanceReportCsv(rows) {
  const header = [
    "event_name",
    "event_date",
    "total_registered_volunteers",
    "present",
    "absent",
    "attendance_percentage",
    "volunteer_hours_earned",
    "waitlisted_volunteers"
  ];

  const lines = [header.join(",")];
  rows.forEach((row) => {
    const values = [
      escapeCsv(row.event_name),
      escapeCsv(row.formatted_event_date),
      row.total_registered_volunteers,
      row.present,
      row.absent,
      `${row.attendance_percentage}%`,
      row.volunteer_hours_earned,
      row.waitlisted_volunteers
    ];
    lines.push(values.join(","));
  });

  return lines.join("\n");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function getAttendanceReportData(req) {
  ensureOrganiserAccess(req);
  const organiserId = getOrganiserId(req);
  const search = String(req.query.search || "").trim();
  const rawEventId = req.query.event_id;
  const eventId = Number.isFinite(Number(rawEventId)) && Number(rawEventId) > 0 ? Number(rawEventId) : null;
  const status = String(req.query.status || "").trim();
  const sortBy = ["event_name", "event_date", "total_registered_volunteers", "present", "absent", "attendance_percentage", "volunteer_hours_earned", "waitlisted_volunteers"].includes(req.query.sortBy)
    ? req.query.sortBy
    : "event_date";
  const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";

  const conditions = ["e.organiser_id = ?"];
  const values = [organiserId];

  if (search) {
    conditions.push("e.event_name LIKE ?");
    values.push(`%${search}%`);
  }

  if (eventId) {
    conditions.push("e.event_id = ?");
    values.push(eventId);
  }

  if (status) {
    conditions.push("e.status = ?");
    values.push(status);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [reportRowsData, eventOptionsData] = await Promise.all([
    pool.query(
      `SELECT
         e.event_id,
         e.event_name,
         e.start_datetime,
         e.status AS event_status,
         COUNT(DISTINCT CASE WHEN er.participation_type = 'Volunteer' AND er.status <> 'Cancelled' THEN er.registration_id END) AS total_registered_volunteers,
         COUNT(DISTINCT CASE WHEN er.participation_type = 'Volunteer' AND er.status <> 'Cancelled' AND a.attendance_status = 'Attended' THEN er.registration_id END) AS present,
         COUNT(DISTINCT CASE WHEN er.participation_type = 'Volunteer' AND er.status <> 'Cancelled' AND a.attendance_status = 'Absent' THEN er.registration_id END) AS absent,
         COALESCE(SUM(CASE WHEN er.participation_type = 'Volunteer' AND a.attendance_status = 'Attended' THEN a.volunteer_hours ELSE 0 END), 0) AS volunteer_hours_earned,
         COUNT(DISTINCT CASE WHEN er.participation_type = 'Volunteer' AND er.status = 'Waitlisted' THEN er.registration_id END) AS waitlisted_volunteers
       FROM events e
       LEFT JOIN event_registrations er ON er.event_id = e.event_id
       LEFT JOIN attendance a ON a.registration_id = er.registration_id
       ${whereClause}
       GROUP BY e.event_id, e.event_name, e.start_datetime, e.status
       ORDER BY e.start_datetime ASC`,
      values
    ),
    pool.query(
      `SELECT event_id, event_name FROM events WHERE organiser_id = ? ORDER BY start_datetime ASC`,
      [organiserId]
    )
  ]);

  const [rows] = reportRowsData;
  const [eventOptions] = eventOptionsData;
  const reportRows = buildAttendanceReportRows(rows, { sortBy, sortOrder });

  return {
    organiserId,
    rows: reportRows,
    eventOptions,
    filters: { search, event_id: eventId || "", status, sortBy, sortOrder },
    exportUrl: buildExportUrl(req.query, { search, event_id: eventId || "", status, sortBy, sortOrder })
  };
}

function buildExportUrl(query, filters) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (key === "export") {
      return;
    }
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  if (filters.search) params.set("search", filters.search);
  if (filters.event_id) params.set("event_id", String(filters.event_id));
  if (filters.status) params.set("status", filters.status);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);

  return `/organiser/reports/export${params.toString() ? `?${params.toString()}` : ""}`;
}

async function renderAttendanceReportPage(req, res) {
  try {
    const reportData = await getAttendanceReportData(req);
    const summary = reportData.rows.reduce(
      (acc, row) => {
        acc.totalEvents += 1;
        acc.totalRegisteredVolunteers += row.total_registered_volunteers;
        acc.present += row.present;
        acc.absent += row.absent;
        acc.volunteerHours += row.volunteer_hours_earned;
        acc.waitlisted += row.waitlisted_volunteers;
        return acc;
      },
      { totalEvents: 0, totalRegisteredVolunteers: 0, present: 0, absent: 0, volunteerHours: 0, waitlisted: 0 }
    );

    const overallAttendanceRate = summary.totalRegisteredVolunteers > 0
      ? Math.round((summary.present / summary.totalRegisteredVolunteers) * 100)
      : 0;

    res.render("organiser/attendance-reports", {
      layout: "app",
      role: "organiser",
      activeNav: "attendance-reports",
      pageTitle: "Attendance Reports · Organiser",
      currentUser: req.currentUser ? {
        name: req.currentUser.name || "Organiser",
        initials: (req.currentUser.name || "O").split(/\s+/).slice(0, 2).map((part) => part[0]).join(""),
        avatarBg: "#7FA8D9",
        role: "Organiser"
      } : {
        name: "Organiser",
        initials: "OR",
        avatarBg: "#7FA8D9",
        role: "Organiser"
      },
      messages: [],
      filters: reportData.filters,
      exportUrl: reportData.exportUrl,
      eventOptions: reportData.eventOptions,
      rows: reportData.rows,
      summary,
      overallAttendanceRate
    });
  } catch (error) {
    console.error("attendance report page failed:", error.message);
    if (error.message === "Only organisers can access attendance reports." || error.message === "No organiser context available for attendance report.") {
      return res.status(403).render("error", {
        layout: "public",
        activeNav: "attendance-reports",
        pageTitle: "Not allowed · CommunityConnect SG",
        currentUser: null,
        messages: [],
        statusCode: 403,
        errorTitle: "Not allowed",
        errorMessage: "Only organisers can access attendance reports."
      });
    }

    return res.status(500).render("error", {
      layout: "public",
      activeNav: "attendance-reports",
      pageTitle: "Something went wrong · CommunityConnect SG",
      currentUser: null,
      messages: [],
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load the attendance report. Please try again shortly."
    });
  }
}

async function exportAttendanceReportCsv(req, res) {
  try {
    const reportData = await getAttendanceReportData(req);
    const csv = buildAttendanceReportCsv(reportData.rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=organiser-attendance-report.csv");
    res.send(csv);
  } catch (error) {
    console.error("attendance report export failed:", error.message);
    if (error.message === "Only organisers can access attendance reports." || error.message === "No organiser context available for attendance report.") {
      return res.status(403).send("Only organisers can access attendance reports.");
    }
    return res.status(500).send("Unable to export attendance report.");
  }
}

module.exports = {
  renderAttendanceReportPage,
  exportAttendanceReportCsv,
  buildAttendanceReportRows,
  buildAttendanceReportCsv,
  getAttendanceReportData
};
