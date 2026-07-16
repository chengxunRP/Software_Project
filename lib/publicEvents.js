const pool = require("../config/database");

const CATEGORY_STYLES = {
  Environment: { color: "#2E7D4F", badgeBg: "#E7F2EA", badgeFg: "#1E4D33" },
  "Food Support": { color: "#D99E2B", badgeBg: "#FBF3DF", badgeFg: "#8A5E08" },
  "Elderly Support": { color: "#C08FBB", badgeBg: "#F3E9F2", badgeFg: "#7A4472" },
  Education: { color: "#7FA8D9", badgeBg: "#E9EDF6", badgeFg: "#3B5384" },
  Fundraising: { color: "#D9A08F", badgeBg: "#FBEAE8", badgeFg: "#9C4038" }
};

const DEFAULT_CATEGORY_STYLE = {
  color: "#6E7266",
  badgeBg: "#EDEAE0",
  badgeFg: "#6E7266"
};

const AREA_KEYWORDS = {
  East: ["East Coast", "Bedok", "Tampines", "Pasir Ris", "Changi"],
  West: ["Jurong", "Clementi", "Bukit Batok", "Pioneer"],
  North: ["Woodlands", "Yishun", "Sembawang", "Mandai"],
  Central: ["Bishan", "Ang Mo Kio", "Toa Payoh", "Central", "Orchard", "Bugis"]
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateParts(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return {
      when: "",
      dateLabel: "",
      timeLabel: "",
      month: "",
      day: "",
      deadlineLabel: ""
    };
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const weekday = weekdays[d.getDay()];
  const day = pad2(d.getDate());
  const monthShort = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = pad2(d.getHours());
  const minutes = pad2(d.getMinutes());

  return {
    weekday: weekday,
    day: day,
    month: monthShort,
    year: year,
    dateLabel: weekday + " " + day + "/" + pad2(d.getMonth() + 1) + "/" + year,
    timePart: hours + ":" + minutes,
    deadlineLabel: day + "/" + pad2(d.getMonth() + 1) + "/" + year + ", " + hours + ":" + minutes
  };
}

function capacityMeta(filled, capacity) {
  const safeFilled = Number(filled) || 0;
  const safeCapacity = Number(capacity) || 0;
  const pct = safeCapacity ? Math.round((safeFilled / safeCapacity) * 100) : 0;
  const left = Math.max(safeCapacity - safeFilled, 0);
  const full = safeCapacity > 0 && left <= 0;
  return {
    filled: safeFilled,
    capacity: safeCapacity,
    pct: pct,
    left: left,
    full: full,
    capLabel: safeFilled + " of " + safeCapacity + " spaces filled",
    capNote: full ? "Full · waitlist open" : left + " left",
    capColor: full ? "#B0433B" : pct >= 80 ? "#D99E2B" : "#2E7D4F",
    statusLabel: full ? "Full" : "Open"
  };
}

function dualCapacityMeta(pFilled, pCap, vFilled, vCap, pWait, vWait) {
  const participants = capacityMeta(pFilled, pCap);
  const volunteers = capacityMeta(vFilled, vCap);
  const combined = capacityMeta(pFilled + vFilled, pCap + vCap);
  return {
    participant_capacity: pCap,
    volunteer_capacity: vCap,
    participants_filled: pFilled,
    volunteers_filled: vFilled,
    participant_count: pFilled,
    volunteer_count: vFilled,
    participant_spaces_remaining: participants.left,
    volunteer_spaces_remaining: volunteers.left,
    participant_waitlist_count: pWait || 0,
    volunteer_waitlist_count: vWait || 0,
    participants: participants,
    volunteers: volunteers,
    filled: pFilled + vFilled,
    capacity: pCap + vCap,
    pct: combined.pct,
    left: participants.left + volunteers.left,
    full: participants.full && volunteers.full,
    capLabel: "Participants " + pFilled + "/" + pCap + " · Volunteers " + vFilled + "/" + vCap,
    capNote: participants.full && volunteers.full
      ? "Both full · waitlists open"
      : (!participants.full ? participants.left + " participant spaces left" : volunteers.left + " volunteer spaces left"),
    capColor: participants.full && volunteers.full
      ? "#B0433B"
      : (participants.full || volunteers.full || combined.pct >= 80 ? "#D99E2B" : "#2E7D4F"),
    participantWaitlistCount: pWait || 0,
    volunteerWaitlistCount: vWait || 0
  };
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-SG");
}

function formatHours(value) {
  const num = Number(value || 0);
  if (Number.isInteger(num)) {
    return formatNumber(num);
  }
  return num.toLocaleString("en-SG", { maximumFractionDigits: 2 });
}

function formatPublicEvent(row) {
  const style = CATEGORY_STYLES[row.category_name] || DEFAULT_CATEGORY_STYLE;
  const start = formatDateParts(row.start_datetime);
  const end = formatDateParts(row.end_datetime);
  const deadline = formatDateParts(row.registration_deadline);
  const pCount = Number(row.participant_count) || 0;
  const vCount = Number(row.volunteer_count) || 0;
  const pWait = Number(row.participant_waitlist_count) || 0;
  const vWait = Number(row.volunteer_waitlist_count) || 0;
  const meta = dualCapacityMeta(
    pCount,
    Number(row.participant_capacity) || 0,
    vCount,
    Number(row.volunteer_capacity) || 0,
    pWait,
    vWait
  );

  return Object.assign({
    id: row.event_id,
    event_id: row.event_id,
    event_name: row.event_name,
    category_id: row.category_id,
    category: row.category_name,
    description: row.description,
    start_datetime: row.start_datetime,
    end_datetime: row.end_datetime,
    when: start.dateLabel + " · " + start.timePart + "–" + end.timePart,
    dateLabel: start.dateLabel,
    timeLabel: start.timePart + "–" + end.timePart,
    month: start.month,
    day: start.day,
    location: row.location,
    registration_deadline: row.registration_deadline,
    deadlineLabel: deadline.deadlineLabel,
    status: row.status,
    organiser: row.organiser_name || "CommunityConnect SG",
    photoLabel: row.image ? String(row.image) : ("photo: " + row.event_name),
    badgeBg: style.badgeBg,
    badgeFg: style.badgeFg,
    catColor: style.color
  }, meta);
}

const EVENT_SELECT = `
  SELECT
    e.event_id,
    e.event_name,
    e.description,
    e.start_datetime,
    e.end_datetime,
    e.location,
    e.participant_capacity,
    e.volunteer_capacity,
    e.registration_deadline,
    e.status,
    e.image,
    c.category_id,
    c.category_name,
    u.name AS organiser_name,
    COALESCE(SUM(CASE WHEN r.participation_type = 'Participant' AND r.status = 'Confirmed' THEN 1 ELSE 0 END), 0) AS participant_count,
    COALESCE(SUM(CASE WHEN r.participation_type = 'Volunteer' AND r.status = 'Confirmed' THEN 1 ELSE 0 END), 0) AS volunteer_count,
    COALESCE(SUM(CASE WHEN r.participation_type = 'Participant' AND r.status = 'Waitlisted' THEN 1 ELSE 0 END), 0) AS participant_waitlist_count,
    COALESCE(SUM(CASE WHEN r.participation_type = 'Volunteer' AND r.status = 'Waitlisted' THEN 1 ELSE 0 END), 0) AS volunteer_waitlist_count
  FROM events e
  INNER JOIN event_categories c ON c.category_id = e.category_id
  INNER JOIN users u ON u.user_id = e.organiser_id
  LEFT JOIN event_registrations r ON r.event_id = e.event_id
`;

const EVENT_GROUP_BY = `
  GROUP BY
    e.event_id,
    e.event_name,
    e.description,
    e.start_datetime,
    e.end_datetime,
    e.location,
    e.participant_capacity,
    e.volunteer_capacity,
    e.registration_deadline,
    e.status,
    e.image,
    c.category_id,
    c.category_name,
    u.name
`;

async function getPublicCategories() {
  const [rows] = await pool.query(`
    SELECT category_id, category_name, description
    FROM event_categories
    ORDER BY category_name ASC
  `);

  return rows.map(function (row) {
    const style = CATEGORY_STYLES[row.category_name] || DEFAULT_CATEGORY_STYLE;
    return {
      category_id: row.category_id,
      name: row.category_name,
      category_name: row.category_name,
      desc: row.description,
      color: style.color,
      badgeBg: style.badgeBg,
      badgeFg: style.badgeFg
    };
  });
}

async function getLandingStats() {
  const [[members]] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM users
    WHERE role = 'community_member' AND account_status = 'Active'
  `);

  const [[eventsHosted]] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM events
  `);

  const [[hours]] = await pool.query(`
    SELECT COALESCE(SUM(a.volunteer_hours), 0) AS total
    FROM attendance a
    INNER JOIN event_registrations r ON r.registration_id = a.registration_id
    WHERE r.participation_type = 'Volunteer'
  `);

  const [[organisers]] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM users
    WHERE role = 'organiser' AND account_status = 'Active'
  `);

  return {
    activeMembers: formatNumber(members.total),
    eventsHosted: formatNumber(eventsHosted.total),
    volunteerHours: formatHours(hours.total),
    activeOrganisers: formatNumber(organisers.total)
  };
}

async function getFeaturedEvents(limit) {
  const safeLimit = Number(limit) || 3;
  const sql = EVENT_SELECT + `
    WHERE e.status IN ('Open', 'Full')
      AND e.start_datetime >= NOW()
    ${EVENT_GROUP_BY}
    ORDER BY e.start_datetime ASC
    LIMIT ?
  `;
  const [rows] = await pool.query(sql, [safeLimit]);
  return rows.map(formatPublicEvent);
}

function buildCatalogueFilters(query) {
  const requestedSort = (query.sort || query.order || "date").trim().toLowerCase();
  const sortMode = requestedSort === "popularity" ? "popularity" : "date";

  const filters = {
    search: (query.search || query.q || "").trim(),
    category: (query.category || query.category_id || "").trim(),
    date: (query.date || "").trim(),
    location: (query.location || "").trim(),
    availability: (query.availability || "").trim(),
    sort: sortMode
  };

  const where = [];
  const params = [];

  if (filters.search) {
    where.push(`(
      e.event_name LIKE ?
      OR e.description LIKE ?
      OR e.location LIKE ?
    )`);
    const like = "%" + filters.search + "%";
    params.push(like, like, like);
  }

  if (filters.category) {
    if (/^\d+$/.test(filters.category)) {
      where.push("e.category_id = ?");
      params.push(Number(filters.category));
    } else {
      where.push("c.category_name = ?");
      params.push(filters.category);
    }
  }

  if (filters.date && filters.date !== "Any date") {
    if (filters.date === "This weekend") {
      where.push(`
        e.start_datetime >= DATE_ADD(CURDATE(), INTERVAL (5 - WEEKDAY(CURDATE())) DAY)
        AND e.start_datetime < DATE_ADD(CURDATE(), INTERVAL (7 - WEEKDAY(CURDATE())) DAY)
      `);
    } else if (filters.date === "Next 7 days") {
      where.push("e.start_datetime >= NOW() AND e.start_datetime < DATE_ADD(NOW(), INTERVAL 7 DAY)");
    } else if (filters.date === "Next 30 days") {
      where.push("e.start_datetime >= NOW() AND e.start_datetime < DATE_ADD(NOW(), INTERVAL 30 DAY)");
    }
  }

  if (filters.location && filters.location !== "All areas") {
    const keywords = AREA_KEYWORDS[filters.location] || [filters.location];
    const locationClauses = keywords.map(function () {
      return "e.location LIKE ?";
    });
    where.push("(" + locationClauses.join(" OR ") + ")");
    keywords.forEach(function (word) {
      params.push("%" + word + "%");
    });
  }

  const having = [];
  if (filters.availability === "Participant spaces available") {
    having.push("(participant_capacity - participant_count) > 0");
  } else if (filters.availability === "Volunteer spaces available") {
    having.push("(volunteer_capacity - volunteer_count) > 0");
  } else if (filters.availability === "Waiting list available") {
    having.push(`(
      (participant_capacity - participant_count) <= 0
      OR (volunteer_capacity - volunteer_count) <= 0
      OR participant_waitlist_count > 0
      OR volunteer_waitlist_count > 0
    )`);
  }

  return {
    filters: filters,
    whereSql: where.length ? (" WHERE " + where.join(" AND ")) : "",
    havingSql: having.length ? (" HAVING " + having.join(" AND ")) : "",
    params: params
  };
}

async function getCatalogueEvents(query) {
  const built = buildCatalogueFilters(query || {});
  const orderSql = built.filters.sort === "popularity"
    ? " ORDER BY (participant_count + volunteer_count + participant_waitlist_count + volunteer_waitlist_count) DESC, e.start_datetime ASC"
    : " ORDER BY e.start_datetime ASC";

  const sql = EVENT_SELECT
    + built.whereSql
    + EVENT_GROUP_BY
    + built.havingSql
    + orderSql;

  const [rows] = await pool.query(sql, built.params);
  return {
    events: rows.map(formatPublicEvent),
    filters: built.filters
  };
}

async function getEventById(eventId) {
  const sql = EVENT_SELECT + `
    WHERE e.event_id = ?
    ${EVENT_GROUP_BY}
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [eventId]);
  if (!rows.length) {
    return null;
  }
  return formatPublicEvent(rows[0]);
}

async function getVolunteerRolesForEvent(eventId) {
  const [rows] = await pool.query(`
    SELECT
      vr.role_id AS volunteer_role_id,
      vr.event_id,
      vr.role_name AS name,
      vr.description,
      vr.required_volunteers AS capacity,
      COALESCE(SUM(CASE
        WHEN r.status IN ('Confirmed', 'Attended')
          AND r.participation_type = 'Volunteer'
          AND r.preferred_role_id = vr.role_id
        THEN 1 ELSE 0 END), 0) AS filled
    FROM volunteer_roles vr
    LEFT JOIN event_registrations r
      ON r.preferred_role_id = vr.role_id
     AND r.event_id = vr.event_id
    WHERE vr.event_id = ?
    GROUP BY
      vr.role_id,
      vr.event_id,
      vr.role_name,
      vr.description,
      vr.required_volunteers
    ORDER BY vr.role_name ASC
  `, [eventId]);

  return rows.map(function (row) {
    return {
      volunteer_role_id: row.volunteer_role_id,
      event_id: row.event_id,
      name: row.name,
      description: row.description || "",
      capacity: Number(row.capacity) || 0,
      filled: Number(row.filled) || 0
    };
  });
}

async function countEvents() {
  const [[row]] = await pool.query("SELECT COUNT(*) AS total FROM events");
  return Number(row.total) || 0;
}

module.exports = {
  getLandingStats: getLandingStats,
  getFeaturedEvents: getFeaturedEvents,
  getCatalogueEvents: getCatalogueEvents,
  getPublicCategories: getPublicCategories,
  getEventById: getEventById,
  getVolunteerRolesForEvent: getVolunteerRolesForEvent,
  countEvents: countEvents,
  formatNumber: formatNumber,
  buildCatalogueFilters: buildCatalogueFilters
};
