/**
 * Admin pages — dashboard, category management and system reports.
 * Feature 1 (User Account, Role and Admin Management) / Feature 6-style
 * reporting views. Every function is protected by requireAdmin in
 * routes/adminRoutes.js and reads real MySQL data — no fixed sample arrays.
 */
const pool = require("../config/database");
const { toViewUser } = require("../lib/userDisplay");
const { flash, takeFlash } = require("../lib/flash");

// Same palette as lib/publicEvents.js so category colours stay consistent
// across the public catalogue and the admin pages.
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

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// When a "this year" count is this small, the dashboard falls back to an
// all-time count instead so the stat card is not left showing near-zero
// numbers on a freshly seeded database. Still real data either way.
const FEW_THRESHOLD = 5;

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

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatAsOf(date) {
  return pad2(date.getDate()) + "/" + pad2(date.getMonth() + 1) + "/" + date.getFullYear() +
    ", " + pad2(date.getHours()) + ":" + pad2(date.getMinutes());
}

function formatDateLabel(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
}

function categoryStyle(name) {
  return CATEGORY_STYLES[name] || DEFAULT_CATEGORY_STYLE;
}

/**
 * Total events for `year`, falling back to an all-time count when the
 * current year has very few events, plus a real note built from statuses
 * within whichever scope was used (so the note always matches the number).
 */
async function getEventsSummary(year) {
  const [[yearRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM events WHERE YEAR(start_datetime) = ?",
    [year]
  );
  const yearTotal = Number(yearRow.total) || 0;
  const useYear = yearTotal >= FEW_THRESHOLD;

  const scopeWhere = useYear ? "WHERE YEAR(start_datetime) = ?" : "";
  const scopeParams = useYear ? [year] : [];

  const [[row]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status IN ('Draft', 'Open', 'Full') THEN 1 ELSE 0 END) AS upcoming,
       SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed
     FROM events
     ${scopeWhere}`,
    scopeParams
  );

  return {
    total: Number(row.total) || 0,
    note: (Number(row.upcoming) || 0) + " upcoming · " + (Number(row.completed) || 0) + " completed"
  };
}

/**
 * Total registrations for `year` (falling back to all-time when few), plus
 * a "P x · V y" note split by participation_type within the same scope.
 */
async function getRegistrationsSummary(year) {
  const [[yearRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM event_registrations WHERE YEAR(registered_at) = ?",
    [year]
  );
  const yearTotal = Number(yearRow.total) || 0;
  const useYear = yearTotal >= FEW_THRESHOLD;

  const scopeWhere = useYear ? "WHERE YEAR(registered_at) = ?" : "";
  const scopeParams = useYear ? [year] : [];

  const [rows] = await pool.query(
    `SELECT participation_type, COUNT(*) AS cnt
     FROM event_registrations
     ${scopeWhere}
     GROUP BY participation_type`,
    scopeParams
  );

  let participantCount = 0;
  let volunteerCount = 0;
  rows.forEach(function (row) {
    if (row.participation_type === "Participant") participantCount = Number(row.cnt) || 0;
    else if (row.participation_type === "Volunteer") volunteerCount = Number(row.cnt) || 0;
  });

  return {
    total: participantCount + volunteerCount,
    note: "P " + formatNumber(participantCount) + " · V " + formatNumber(volunteerCount)
  };
}

/**
 * Volunteer hours earned (Attended + Volunteer participation) for events
 * starting in `year`, falling back to an all-time total when the year has
 * no recorded hours yet.
 */
async function getVolunteerHoursSummary(year) {
  const [[yearRow]] = await pool.query(
    `SELECT COALESCE(SUM(a.volunteer_hours), 0) AS total, COUNT(DISTINCT r.registration_id) AS regs
     FROM attendance a
     INNER JOIN event_registrations r ON r.registration_id = a.registration_id
     INNER JOIN events e ON e.event_id = r.event_id
     WHERE a.attendance_status = 'Attended'
       AND r.participation_type = 'Volunteer'
       AND YEAR(e.start_datetime) = ?`,
    [year]
  );

  if (Number(yearRow.total) > 0) {
    return {
      total: Number(yearRow.total) || 0,
      note: "Across " + formatNumber(Number(yearRow.regs) || 0) + " volunteer registrations"
    };
  }

  const [[allRow]] = await pool.query(
    `SELECT COALESCE(SUM(a.volunteer_hours), 0) AS total, COUNT(DISTINCT r.registration_id) AS regs
     FROM attendance a
     INNER JOIN event_registrations r ON r.registration_id = a.registration_id
     WHERE a.attendance_status = 'Attended'
       AND r.participation_type = 'Volunteer'`
  );

  return {
    total: Number(allRow.total) || 0,
    note: "Across " + formatNumber(Number(allRow.regs) || 0) + " volunteer registrations"
  };
}

/** Registration counts per month of `year`, scaled to a 140px-tall bar chart. */
async function getMonthlyRegistrations(year) {
  const [rows] = await pool.query(
    `SELECT MONTH(registered_at) AS m, COUNT(*) AS cnt
     FROM event_registrations
     WHERE YEAR(registered_at) = ?
     GROUP BY MONTH(registered_at)`,
    [year]
  );

  const counts = new Array(12).fill(0);
  rows.forEach(function (row) {
    counts[Number(row.m) - 1] = Number(row.cnt) || 0;
  });

  const max = Math.max.apply(null, counts.concat([1]));
  const currentMonthIndex = new Date().getMonth();

  return MONTH_LABELS.map(function (label, idx) {
    return {
      label: label,
      val: formatNumber(counts[idx]),
      h: Math.round((counts[idx] / max) * 140),
      current: idx === currentMonthIndex
    };
  });
}

/** Account counts by permanent role, with each role's share of all users. */
async function getUserRoles() {
  const [rows] = await pool.query("SELECT role, COUNT(*) AS cnt FROM users GROUP BY role");

  const counts = { community_member: 0, organiser: 0, admin: 0 };
  rows.forEach(function (row) {
    if (Object.prototype.hasOwnProperty.call(counts, row.role)) {
      counts[row.role] = Number(row.cnt) || 0;
    }
  });
  const total = counts.community_member + counts.organiser + counts.admin;

  const roleDefs = [
    { key: "community_member", label: "Community members", color: "#2E7D4F" },
    { key: "organiser", label: "Organisers", color: "#D99E2B" },
    { key: "admin", label: "Admins", color: "#7FA8D9" }
  ];

  return roleDefs.map(function (def) {
    const cnt = counts[def.key];
    return {
      label: def.label,
      count: formatNumber(cnt),
      pct: total ? Math.round((cnt / total) * 100) : 0,
      color: def.color
    };
  });
}

/**
 * Volunteer hours earned per category for the current month, falling back
 * to all-time totals when nothing has been recorded yet this month.
 */
async function getHoursByCategory() {
  const now = new Date();

  const monthSql = `
    SELECT c.category_name, COALESCE(SUM(a.volunteer_hours), 0) AS hours
    FROM event_categories c
    LEFT JOIN events e ON e.category_id = c.category_id
    LEFT JOIN event_registrations r ON r.event_id = e.event_id AND r.participation_type = 'Volunteer'
    LEFT JOIN attendance a ON a.registration_id = r.registration_id
      AND a.attendance_status = 'Attended'
      AND MONTH(a.recorded_at) = ? AND YEAR(a.recorded_at) = ?
    GROUP BY c.category_id, c.category_name
    ORDER BY hours DESC, c.category_name ASC
  `;
  const [monthRows] = await pool.query(monthSql, [now.getMonth() + 1, now.getFullYear()]);
  const monthTotal = monthRows.reduce(function (sum, row) { return sum + (Number(row.hours) || 0); }, 0);

  let rows = monthRows;
  if (monthTotal <= 0) {
    const [allRows] = await pool.query(`
      SELECT c.category_name, COALESCE(SUM(a.volunteer_hours), 0) AS hours
      FROM event_categories c
      LEFT JOIN events e ON e.category_id = c.category_id
      LEFT JOIN event_registrations r ON r.event_id = e.event_id AND r.participation_type = 'Volunteer'
      LEFT JOIN attendance a ON a.registration_id = r.registration_id AND a.attendance_status = 'Attended'
      GROUP BY c.category_id, c.category_name
      ORDER BY hours DESC, c.category_name ASC
    `);
    rows = allRows;
  }

  return rows.map(function (row) {
    return {
      label: row.category_name,
      val: formatHours(Number(row.hours) || 0) + " h",
      color: categoryStyle(row.category_name).color
    };
  });
}

async function dashboard(req, res) {
  try {
    const now = new Date();
    const year = now.getFullYear();

    const [[userCountRow]] = await pool.query("SELECT COUNT(*) AS total FROM users");
    const [[activeMembersRow]] = await pool.query(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'community_member' AND account_status = 'Active'"
    );

    const eventsSummary = await getEventsSummary(year);
    const registrationsSummary = await getRegistrationsSummary(year);
    const hoursSummary = await getVolunteerHoursSummary(year);
    const months = await getMonthlyRegistrations(year);
    const userRoles = await getUserRoles();
    const hoursByCat = await getHoursByCategory();

    res.render("admin/dashboard", {
      layout: "app",
      role: "admin",
      activeNav: "dashboard",
      pageTitle: "Admin Dashboard",
      currentUser: toViewUser(req.session.user),
      messages: takeFlash(req),
      stats: {
        totalUsers: formatNumber(Number(userCountRow.total) || 0),
        usersDelta: formatNumber(Number(activeMembersRow.total) || 0) + " active community members",
        events2026: formatNumber(eventsSummary.total),
        eventsNote: eventsSummary.note,
        registrations2026: formatNumber(registrationsSummary.total),
        registrationsNote: registrationsSummary.note,
        hours2026: formatHours(hoursSummary.total),
        hoursDelta: hoursSummary.note
      },
      asOf: formatAsOf(now),
      chartYear: year,
      hoursMonthLabel: MONTH_LABELS[now.getMonth()],
      months: months,
      userRoles: userRoles,
      hoursByCat: hoursByCat
    });
  } catch (err) {
    console.error("dashboard failed:", err.message);
    res.status(500).render("error", {
      layout: "public",
      activeNav: "",
      pageTitle: "Something went wrong · CommunityConnect SG",
      currentUser: req.session.user || null,
      messages: [],
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load the admin dashboard. Please try again shortly."
    });
  }
}

async function categories(req, res) {
  try {
    const editId = Number(req.query.edit) || 0;

    const [rows] = await pool.query(`
      SELECT
        c.category_id,
        c.category_name,
        c.description,
        COUNT(e.event_id) AS event_count
      FROM event_categories c
      LEFT JOIN events e ON e.category_id = c.category_id
      GROUP BY c.category_id, c.category_name, c.description
      ORDER BY c.category_name ASC
    `);

    const mapped = rows.map(function (row) {
      const style = categoryStyle(row.category_name);
      return {
        category_id: row.category_id,
        name: row.category_name,
        color: style.color,
        badgeBg: style.badgeBg,
        badgeFg: style.badgeFg,
        desc: row.description || "",
        eventCount: Number(row.event_count) || 0,
        // The schema has no category status column yet — every category is
        // Active until the team adds an archive/status feature.
        status: "Active"
      };
    });

    let formMode = "create";
    let form = { category_id: "", category_name: "", description: "" };
    if (editId > 0) {
      const editing = mapped.find(function (c) { return Number(c.category_id) === editId; });
      if (editing) {
        formMode = "edit";
        form = {
          category_id: editing.category_id,
          category_name: editing.name,
          description: editing.desc
        };
      }
    }

    res.render("admin/categories", {
      layout: "app",
      role: "admin",
      activeNav: "categories",
      pageTitle: "Event Categories · Admin",
      currentUser: toViewUser(req.session.user),
      messages: takeFlash(req),
      categories: mapped,
      formMode: formMode,
      form: form
    });
  } catch (err) {
    console.error("categories failed:", err.message);
    flash(req, "error", "We could not load event categories. Please try again.");
    return res.redirect("/admin/dashboard");
  }
}

// POST /admin/categories
async function createCategory(req, res) {
  const categoryName = String(req.body.category_name || "").trim();
  const description = String(req.body.description || "").trim();

  if (!categoryName || categoryName.length < 2) {
    flash(req, "error", "Please enter a category name.");
    return res.redirect("/admin/categories");
  }

  try {
    await pool.query(
      "INSERT INTO event_categories (category_name, description) VALUES (?, ?)",
      [categoryName, description || null]
    );
    flash(req, "success", "Category created successfully.");
    return res.redirect("/admin/categories");
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      flash(req, "error", "A category with that name already exists.");
      return res.redirect("/admin/categories");
    }
    console.error("createCategory failed:", err.message);
    flash(req, "error", "We could not create that category. Please try again.");
    return res.redirect("/admin/categories");
  }
}

// POST /admin/categories/:id/edit
async function updateCategory(req, res) {
  const categoryId = Number(req.params.id);
  const categoryName = String(req.body.category_name || "").trim();
  const description = String(req.body.description || "").trim();

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    flash(req, "error", "That category could not be found.");
    return res.redirect("/admin/categories");
  }
  if (!categoryName || categoryName.length < 2) {
    flash(req, "error", "Please enter a category name.");
    return res.redirect("/admin/categories?edit=" + categoryId);
  }

  try {
    const [result] = await pool.query(
      "UPDATE event_categories SET category_name = ?, description = ? WHERE category_id = ?",
      [categoryName, description || null, categoryId]
    );
    if (!result.affectedRows) {
      flash(req, "error", "That category could not be found.");
    } else {
      flash(req, "success", "Category updated successfully.");
    }
    return res.redirect("/admin/categories");
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      flash(req, "error", "A category with that name already exists.");
      return res.redirect("/admin/categories?edit=" + categoryId);
    }
    console.error("updateCategory failed:", err.message);
    flash(req, "error", "We could not update that category. Please try again.");
    return res.redirect("/admin/categories?edit=" + categoryId);
  }
}

// POST /admin/categories/:id/delete
async function deleteCategory(req, res) {
  const categoryId = Number(req.params.id);

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    flash(req, "error", "That category could not be found.");
    return res.redirect("/admin/categories");
  }

  try {
    const [[usage]] = await pool.query(
      "SELECT COUNT(*) AS total FROM events WHERE category_id = ?",
      [categoryId]
    );
    if (Number(usage.total) > 0) {
      flash(req, "error", "This category is used by existing events and cannot be deleted.");
      return res.redirect("/admin/categories");
    }

    const [result] = await pool.query(
      "DELETE FROM event_categories WHERE category_id = ?",
      [categoryId]
    );
    if (!result.affectedRows) {
      flash(req, "error", "That category could not be found.");
    } else {
      flash(req, "success", "Category deleted successfully.");
    }
    return res.redirect("/admin/categories");
  } catch (err) {
    console.error("deleteCategory failed:", err.message);
    flash(req, "error", "We could not delete that category. It may still be linked to events.");
    return res.redirect("/admin/categories");
  }
}

/** One row per event with the registration/attendance/hours totals reports() needs. */
async function getEventReportRows() {
  const [rows] = await pool.query(`
    SELECT
      e.event_id,
      e.event_name,
      e.start_datetime,
      e.status,
      e.category_id,
      c.category_name,
      (e.participant_capacity + e.volunteer_capacity) AS capacity,
      COUNT(DISTINCT r.registration_id) AS regs,
      COUNT(DISTINCT CASE WHEN r.status IN ('Confirmed', 'Attended', 'Absent') THEN r.registration_id END) AS filled,
      COUNT(DISTINCT CASE WHEN a.attendance_status = 'Attended' THEN a.attendance_id END) AS attended,
      COUNT(DISTINCT CASE WHEN a.attendance_status = 'Absent' THEN a.attendance_id END) AS absent,
      COUNT(DISTINCT CASE WHEN r.status = 'Cancelled' THEN r.registration_id END) AS cancelled,
      COALESCE(SUM(CASE WHEN a.attendance_status = 'Attended' AND r.participation_type = 'Volunteer' THEN a.volunteer_hours ELSE 0 END), 0) AS hours
    FROM events e
    INNER JOIN event_categories c ON c.category_id = e.category_id
    LEFT JOIN event_registrations r ON r.event_id = e.event_id
    LEFT JOIN attendance a ON a.registration_id = r.registration_id
    GROUP BY e.event_id, e.event_name, e.start_datetime, e.status, e.category_id, c.category_name,
             e.participant_capacity, e.volunteer_capacity
  `);

  return rows.map(function (row) {
    return {
      event_id: row.event_id,
      event_name: row.event_name,
      start_datetime: row.start_datetime,
      status: row.status,
      category_id: row.category_id,
      category_name: row.category_name,
      capacity: Number(row.capacity) || 0,
      regs: Number(row.regs) || 0,
      filled: Number(row.filled) || 0,
      attended: Number(row.attended) || 0,
      absent: Number(row.absent) || 0,
      cancelled: Number(row.cancelled) || 0,
      hours: Number(row.hours) || 0
    };
  });
}

async function reports(req, res) {
  try {
    const eventRows = await getEventReportRows();

    const eventsCompleted = eventRows.filter(function (e) { return e.status === "Completed"; }).length;

    const fillRates = eventRows
      .filter(function (e) { return e.capacity > 0; })
      .map(function (e) { return (e.filled / e.capacity) * 100; });
    const avgFillRate = fillRates.length
      ? fillRates.reduce(function (sum, v) { return sum + v; }, 0) / fillRates.length
      : 0;

    const totalAttended = eventRows.reduce(function (sum, e) { return sum + e.attended; }, 0);
    const totalAbsent = eventRows.reduce(function (sum, e) { return sum + e.absent; }, 0);
    const avgAttendance = (totalAttended + totalAbsent) > 0
      ? (totalAttended / (totalAttended + totalAbsent)) * 100
      : 0;

    const totalRegs = eventRows.reduce(function (sum, e) { return sum + e.regs; }, 0);
    const totalCancelled = eventRows.reduce(function (sum, e) { return sum + e.cancelled; }, 0);
    const cancellationRate = totalRegs > 0 ? (totalCancelled / totalRegs) * 100 : 0;

    const byCategoryMap = new Map();
    eventRows.forEach(function (e) {
      if (!byCategoryMap.has(e.category_id)) {
        byCategoryMap.set(e.category_id, {
          name: e.category_name,
          events: 0,
          regs: 0,
          att: 0,
          hours: 0,
          capacity: 0,
          filled: 0
        });
      }
      const entry = byCategoryMap.get(e.category_id);
      entry.events += 1;
      entry.regs += e.regs;
      entry.att += e.attended;
      entry.hours += e.hours;
      entry.capacity += e.capacity;
      entry.filled += e.filled;
    });

    const byCategory = Array.from(byCategoryMap.values())
      .sort(function (a, b) { return b.events - a.events; })
      .map(function (entry) {
        const style = categoryStyle(entry.name);
        const fillPct = entry.capacity > 0 ? Math.round((entry.filled / entry.capacity) * 100) : 0;
        return {
          name: entry.name,
          color: style.color,
          events: formatNumber(entry.events),
          regs: formatNumber(entry.regs),
          att: formatNumber(entry.att),
          hours: formatHours(entry.hours),
          fill: fillPct + "%"
        };
      });

    const topEvents = eventRows
      .slice()
      .sort(function (a, b) { return b.attended - a.attended; })
      .slice(0, 5)
      .map(function (e, index) {
        return {
          rank: index + 1,
          name: e.event_name,
          date: formatDateLabel(e.start_datetime),
          attendees: formatNumber(e.attended)
        };
      });

    res.render("admin/reports", {
      layout: "app",
      role: "admin",
      activeNav: "reports",
      pageTitle: "System Reports · Admin",
      currentUser: toViewUser(req.session.user),
      messages: takeFlash(req),
      kpis: {
        eventsCompleted: formatNumber(eventsCompleted),
        avgFillRate: Math.round(avgFillRate) + "%",
        avgAttendance: Math.round(avgAttendance) + "%",
        cancellationRate: cancellationRate.toFixed(1) + "%"
      },
      byCategory: byCategory,
      topEvents: topEvents
    });
  } catch (err) {
    console.error("reports failed:", err.message);
    flash(req, "error", "We could not load system reports. Please try again.");
    return res.redirect("/admin/dashboard");
  }
}

module.exports = {
  dashboard: dashboard,
  categories: categories,
  createCategory: createCategory,
  updateCategory: updateCategory,
  deleteCategory: deleteCategory,
  reports: reports
};

