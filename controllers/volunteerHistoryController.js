const pool = require("../config/database");

const DEFAULT_PAGE_SIZE = 10;

function initialsFromName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "CM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatHours(value) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return "0.0";
  return numericValue.toFixed(1);
}

function getPageSize(rawValue) {
  const pageSize = Number(rawValue || DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(pageSize) || pageSize <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(pageSize, 50);
}

function getPage(rawValue) {
  const page = Number(rawValue || 1);
  if (!Number.isInteger(page) || page <= 0) return 1;
  return page;
}

function buildHistoryViewModel(req, historyData) {
  const user = req.currentUser || req.session?.user || {};
  return {
    currentUser: {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role === "community_member" ? "Community member" : user.role,
      initials: initialsFromName(user.name),
      avatarBg: "#D99E2B"
    },
    role: "member",
    activeNav: "hours",
    pageTitle: "Volunteer Contribution History · Community member",
    messages: [],
    summary: historyData.summary,
    rows: historyData.rows,
    categories: historyData.categories,
    years: historyData.years,
    pagination: historyData.pagination,
    filters: historyData.filters
  };
}

async function getVolunteerContributionHistory(userId, options = {}) {
  const search = String(options.search || "").trim();
  const category = String(options.category || "").trim();
  const year = String(options.year || "").trim();
  const page = getPage(options.page);
  const pageSize = getPageSize(options.limit);
  const offset = (page - 1) * pageSize;

  const whereClauses = [
    "er.user_id = ?",
    "er.participation_type = 'Volunteer'",
    "(er.status IN ('Attended', 'Absent') OR a.attendance_status IN ('Attended', 'Absent'))"
  ];
  const params = [userId];

  if (search) {
    whereClauses.push("e.event_name LIKE ?");
    params.push(`%${search}%`);
  }

  if (category) {
    whereClauses.push("ec.category_name = ?");
    params.push(category);
  }

  if (year) {
    whereClauses.push("YEAR(e.end_datetime) = ?");
    params.push(year);
  }

  const whereSql = whereClauses.join(" AND ");

  const countQuery = `
    SELECT COUNT(*) AS total_count
    FROM event_registrations er
    JOIN events e ON e.event_id = er.event_id
    LEFT JOIN event_categories ec ON ec.category_id = e.category_id
    LEFT JOIN attendance a ON a.registration_id = er.registration_id
    WHERE ${whereSql}
  `;

  const [countRows] = await pool.query(countQuery, params);
  const totalCount = Number(countRows[0].total_count) || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const rowsQuery = `
    SELECT
      er.registration_id,
      er.event_id,
      er.status AS registration_status,
      e.event_name,
      e.start_datetime,
      e.end_datetime,
      e.location,
      u.name AS organiser_name,
      ec.category_name,
      COALESCE(a.attendance_status, er.status) AS attendance_status,
      COALESCE(a.volunteer_hours, 0) AS volunteer_hours
    FROM event_registrations er
    JOIN events e ON e.event_id = er.event_id
    JOIN users u ON u.user_id = e.organiser_id
    LEFT JOIN event_categories ec ON ec.category_id = e.category_id
    LEFT JOIN attendance a ON a.registration_id = er.registration_id
    WHERE ${whereSql}
    ORDER BY e.end_datetime DESC, e.start_datetime DESC, er.registration_id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(rowsQuery, [...params, pageSize, offset]);

  const normalizedRows = rows.map(function (row) {
    const hours = Number(row.volunteer_hours || 0);
    const attendanceStatus = row.attendance_status || row.registration_status || "Pending";
    return {
      registration_id: row.registration_id,
      event_id: row.event_id,
      event_name: row.event_name,
      organiser_name: row.organiser_name,
      category_name: row.category_name || "Uncategorised",
      attendance_status: attendanceStatus,
      volunteer_hours: hours,
      volunteer_hours_display: formatHours(hours),
      completion_date: formatDate(row.end_datetime),
      completion_value: row.end_datetime
    };
  });

  const categoriesQuery = `
    SELECT DISTINCT ec.category_name
    FROM event_registrations er
    JOIN events e ON e.event_id = er.event_id
    LEFT JOIN event_categories ec ON ec.category_id = e.category_id
    WHERE er.user_id = ?
      AND er.participation_type = 'Volunteer'
      AND (er.status IN ('Attended', 'Absent') OR EXISTS (
        SELECT 1 FROM attendance a WHERE a.registration_id = er.registration_id
      ))
    ORDER BY ec.category_name ASC
  `;

  const [categoryRows] = await pool.query(categoriesQuery, [userId]);
  const categories = categoryRows.map(function (categoryRow) {
    return categoryRow.category_name || "Uncategorised";
  });

  const yearsQuery = `
    SELECT DISTINCT YEAR(e.end_datetime) AS event_year
    FROM event_registrations er
    JOIN events e ON e.event_id = er.event_id
    WHERE er.user_id = ?
      AND er.participation_type = 'Volunteer'
      AND (er.status IN ('Attended', 'Absent') OR EXISTS (
        SELECT 1 FROM attendance a WHERE a.registration_id = er.registration_id
      ))
    ORDER BY event_year DESC
  `;

  const [yearRows] = await pool.query(yearsQuery, [userId]);
  const years = yearRows.map(function (row) { return String(row.event_year); });

  const totalHours = normalizedRows.reduce(function (sum, row) {
    return sum + Number(row.volunteer_hours || 0);
  }, 0);
  const averageHours = totalCount ? totalHours / totalCount : 0;

  return {
    rows: normalizedRows,
    categories,
    years,
    summary: {
      completedEvents: totalCount,
      totalHours: formatHours(totalHours),
      averageHours: formatHours(averageHours)
    },
    pagination: {
      currentPage: page,
      pageSize, 
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    },
    filters: {
      search,
      category,
      year,
      limit: pageSize
    }
  };
}

async function renderVolunteerHistoryPage(req, res) {
  try {
    const historyData = await getVolunteerContributionHistory(req.currentUser.user_id, {
      search: req.query.search,
      category: req.query.category,
      year: req.query.year,
      page: req.query.page,
      limit: req.query.limit
    });

    res.render("member/volunteer-history", buildHistoryViewModel(req, historyData));
  } catch (error) {
    console.error("volunteer contribution history load failed:", error.message);
    res.status(500).render("error", {
      layout: "public",
      activeNav: "hours",
      pageTitle: "Something went wrong · CommunityConnect SG",
      currentUser: null,
      messages: [],
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load your volunteer contribution history. Please try again shortly."
    });
  }
}

async function apiVolunteerHistory(req, res) {
  try {
    const historyData = await getVolunteerContributionHistory(req.currentUser.user_id, {
      search: req.query.search,
      category: req.query.category,
      year: req.query.year,
      page: req.query.page,
      limit: req.query.limit
    });

    res.json(historyData);
  } catch (error) {
    console.error("volunteer contribution history API failed:", error.message);
    res.status(500).json({ error: "Unable to load volunteer contribution history." });
  }
}

module.exports = {
  renderVolunteerHistoryPage,
  apiVolunteerHistory,
  getVolunteerContributionHistory
};
