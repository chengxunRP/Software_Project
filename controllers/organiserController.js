// Organiser-facing pages: dashboard, manage events, event form, manage
// registrations and volunteer role assignment.
//
// Every query below is scoped to the logged-in organiser's own events
// (events.organiser_id = req.session.user.user_id) so one organiser can
// never read or edit another organiser's events, registrations or roles.
//
// Known display-only conflict (see CLAUDE.md "Sources of Truth" — report
// before changing schema/views): the approved event-form.ejs / manage-events.ejs
// design uses status labels "Published" / "Draft" / "Registration closed",
// while database/community_event_manager.sql defines
// events.status ENUM('Draft','Open','Full','Closed','Cancelled','Completed').
// The mapping helpers below (manageEventsStatusLabel / eventFormStatusValue)
// only translate the DB value for on-screen display — they do not change the
// schema or the EJS files.
const pool = require("../config/database");
const { toViewUser } = require("../lib/userDisplay");
const { flash, takeFlash } = require("../lib/flash");
const notifications = require("../lib/notifications");
const notificationEmails = require("../services/notificationEmailService");
const { toPublicImagePath } = require("../lib/eventImageUpload");

const ALLOWED_EVENT_STATUSES = ["Draft", "Open", "Full", "Closed", "Cancelled", "Completed"];
const FORM_STATUS_VALUES = ["Published", "Draft", "Registration closed"];

const AVATAR_COLORS = ["#7FA8D9", "#F4B83F", "#C08FBB", "#8FBF9A", "#D9A08F", "#B9C98F"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Mirrors the category fallback in views/partials/event-card-panel.ejs so an
// event with no explicit events.image still resolves to the same photo the
// public catalogue shows for that category.
const CATEGORY_DEFAULT_IMAGE = {
  "Environment": "/images/category-environment.jpg",
  "Food Support": "/images/category-food.jpg",
  "Elderly Support": "/images/category-elderly.jpg",
  "Education": "/images/category-education.jpg",
  "Fundraising": "/images/category-fundraising.jpg"
};

function resolveEventImage(image, categoryName) {
  return image || CATEGORY_DEFAULT_IMAGE[categoryName] || "";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateParts(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return { dateOnly: "", timePart: "", month: "", day: "", dateLabel: "" };
  }
  const day = pad2(d.getDate());
  const dateOnly = day + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
  return {
    dateOnly: dateOnly,
    timePart: pad2(d.getHours()) + ":" + pad2(d.getMinutes()),
    month: MONTHS[d.getMonth()],
    day: day,
    dateLabel: WEEKDAYS[d.getDay()] + " " + dateOnly
  };
}

/** Formats a DB datetime for an <input type="datetime-local"> value. */
function toDatetimeLocalValue(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
    + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

function initialsFromName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "CM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
    capColor: full ? "#B0433B" : pct >= 80 ? "#F4B83F" : "#087F5B",
    statusLabel: full ? "Full" : "Open"
  };
}

function dualCapacityMeta(pFilled, pCap, vFilled, vCap, pWait, vWait) {
  const participants = capacityMeta(pFilled, pCap);
  const volunteers = capacityMeta(vFilled, vCap);
  const combined = capacityMeta(Number(pFilled) + Number(vFilled), Number(pCap) + Number(vCap));
  return {
    participant_capacity: pCap,
    volunteer_capacity: vCap,
    participants_filled: pFilled,
    volunteers_filled: vFilled,
    participants: participants,
    volunteers: volunteers,
    filled: Number(pFilled) + Number(vFilled),
    capacity: Number(pCap) + Number(vCap),
    pct: combined.pct,
    left: participants.left + volunteers.left,
    full: participants.full && volunteers.full,
    capLabel: "Participants " + pFilled + "/" + pCap + " · Volunteers " + vFilled + "/" + vCap,
    capNote: participants.full && volunteers.full
      ? "Both full · waitlists open"
      : (!participants.full ? participants.left + " participant spaces left" : volunteers.left + " volunteer spaces left"),
    capColor: participants.full && volunteers.full
      ? "#B0433B"
      : (participants.full || volunteers.full || combined.pct >= 80 ? "#F4B83F" : "#087F5B"),
    participantWaitlistCount: pWait || 0,
    volunteerWaitlistCount: vWait || 0
  };
}

/** DB status -> manage-events.ejs badge label (statusClass map has no 'Open'/'Closed' entry). */
function manageEventsStatusLabel(dbStatus) {
  if (dbStatus === "Open") return "Published";
  return dbStatus;
}

/** DB status -> event-form.ejs status radio value ('Published' | 'Draft' | 'Registration closed'). */
function eventFormStatusValue(dbStatus) {
  if (dbStatus === "Open" || dbStatus === "Full") return "Published";
  if (dbStatus === "Draft") return "Draft";
  return "Registration closed";
}

/**
 * Maps the design-form status radios onto the schema ENUM.
 * Published → Open (or Full when both capacities are already filled).
 * Registration closed → Closed.
 */
function formStatusToDb(formStatus, participantFilled, volunteerFilled, participantCap, volunteerCap) {
  if (formStatus === "Draft") return "Draft";
  if (formStatus === "Registration closed") return "Closed";
  if (formStatus === "Published") {
    const pFull = Number(participantCap) > 0 && Number(participantFilled) >= Number(participantCap);
    const vFull = Number(volunteerCap) > 0 && Number(volunteerFilled) >= Number(volunteerCap);
    if (pFull && vFull) return "Full";
    return "Open";
  }
  if (ALLOWED_EVENT_STATUSES.indexOf(formStatus) !== -1) return formStatus;
  return null;
}

/** datetime-local ("YYYY-MM-DDTHH:MM") → MySQL DATETIME string. */
function fromDatetimeLocalValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalised = raw.length === 16 ? raw + ":00" : raw;
  const d = new Date(normalised);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
    + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

function parsePositiveInt(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Shared create/edit validation. Returns { ok, error, data } where data holds
 * column values ready for INSERT/UPDATE (organiser_id set by caller).
 */
async function validateEventPayload(body, options) {
  options = options || {};
  const eventName = String(body.event_name || "").trim();
  const description = String(body.description || "").trim();
  const location = String(body.location || "").trim();
  const categoryId = Number(body.category_id);
  const participantCapacity = parsePositiveInt(body.participant_capacity);
  const volunteerCapacity = parsePositiveInt(body.volunteer_capacity);
  const startDatetime = fromDatetimeLocalValue(body.start_datetime);
  const endDatetime = fromDatetimeLocalValue(body.end_datetime);
  const registrationDeadline = fromDatetimeLocalValue(body.registration_deadline);
  const formStatus = String(body.status || "").trim();

  if (!eventName) return { ok: false, error: "Please enter an event name." };
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return { ok: false, error: "Please choose a valid category." };
  }
  if (!description) return { ok: false, error: "Please enter a description." };
  if (!location) return { ok: false, error: "Please enter a location." };
  if (!startDatetime || !endDatetime || !registrationDeadline) {
    return { ok: false, error: "Please provide valid start, end and registration deadline date/times." };
  }
  if (new Date(endDatetime) <= new Date(startDatetime)) {
    return { ok: false, error: "End time must be after start time." };
  }
  if (new Date(registrationDeadline) >= new Date(startDatetime)) {
    return { ok: false, error: "Registration deadline must be before the event start." };
  }
  if (participantCapacity === null || volunteerCapacity === null) {
    return { ok: false, error: "Participant and volunteer capacities must be positive whole numbers." };
  }
  if (FORM_STATUS_VALUES.indexOf(formStatus) === -1 && ALLOWED_EVENT_STATUSES.indexOf(formStatus) === -1) {
    return { ok: false, error: "Please choose a valid event status." };
  }

  const [catRows] = await pool.query(
    "SELECT category_id FROM event_categories WHERE category_id = ? LIMIT 1",
    [categoryId]
  );
  if (!catRows.length) {
    return { ok: false, error: "That category could not be found." };
  }

  const participantFilled = Number(options.participantFilled) || 0;
  const volunteerFilled = Number(options.volunteerFilled) || 0;
  if (participantCapacity < participantFilled) {
    return {
      ok: false,
      error: "Participant capacity cannot be below the " + participantFilled + " confirmed participant(s)."
    };
  }
  if (volunteerCapacity < volunteerFilled) {
    return {
      ok: false,
      error: "Volunteer capacity cannot be below the " + volunteerFilled + " confirmed volunteer(s)."
    };
  }

  const dbStatus = formStatusToDb(
    formStatus,
    participantFilled,
    volunteerFilled,
    participantCapacity,
    volunteerCapacity
  );
  if (!dbStatus) {
    return { ok: false, error: "Please choose a valid event status." };
  }

  const imageValue = options.imageValue != null
    ? options.imageValue
    : (body.image ? String(body.image).trim() || null : null);

  return {
    ok: true,
    data: {
      category_id: categoryId,
      event_name: eventName,
      description: description,
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      location: location,
      participant_capacity: participantCapacity,
      volunteer_capacity: volunteerCapacity,
      registration_deadline: registrationDeadline,
      status: dbStatus,
      image: imageValue
    }
  };
}

function reRenderEventForm(req, res, formMode, event, message) {
  return loadCategories().then(function (categories) {
    return res.status(400).render("organiser/event-form", organiserLocals(req.session.user, "events", {
      pageTitle: (formMode === "create" ? "Add Event" : "Edit Event") + " · Organiser",
      formMode: formMode,
      event: event,
      categories: categories,
      messages: [{ type: "error", text: message }]
    }));
  });
}

function organiserLocals(sessionUser, activeNav, extra) {
  return Object.assign({
    layout: "app",
    role: "organiser",
    activeNav: activeNav,
    pageTitle: "CommunityConnect",
    currentUser: toViewUser(sessionUser),
    messages: [],
    navEventId: null
  }, extra || {});
}

/**
 * Global organiser nav hubs — organiser must pick an owned event.
 * Does not auto-select an arbitrary event_id.
 */
async function selectEventHub(req, res, purpose) {
  const organiserId = req.session.user.user_id;
  const config = {
    registrations: {
      activeNav: "registrations",
      pageTitle: "Registrations · Organiser",
      pageHeading: "Registrations",
      pageLead: "Choose one of your events to review participants, volunteers and waiting lists.",
      actionLabel: "Open registrations",
      pathSuffix: "/registrations"
    },
    roles: {
      activeNav: "roles",
      pageTitle: "Volunteer Roles · Organiser",
      pageHeading: "Volunteer Roles",
      pageLead: "Choose one of your events to manage volunteer roles and assignments.",
      actionLabel: "Open roles",
      pathSuffix: "/roles"
    },
    attendance: {
      activeNav: "attendance",
      pageTitle: "Attendance · Organiser",
      pageHeading: "Attendance",
      pageLead: "Choose one of your events to record attendance.",
      actionLabel: "Open attendance",
      pathSuffix: "/attendance"
    }
  }[purpose];

  if (!config) {
    return res.status(404).send("Page not found.");
  }

  try {
    const [rows] = await pool.query(
      `SELECT event_id, event_name, start_datetime, location, status
       FROM events
       WHERE organiser_id = ?
       ORDER BY start_datetime DESC`,
      [organiserId]
    );

    const events = rows.map(function (r) {
      return {
        event_id: r.event_id,
        event_name: r.event_name,
        location: r.location,
        dateLabel: formatDateParts(r.start_datetime).dateLabel,
        href: "/organiser/events/" + r.event_id + config.pathSuffix
      };
    });

    res.render("organiser/select-event", organiserLocals(req.session.user, config.activeNav, {
      pageTitle: config.pageTitle,
      pageHeading: config.pageHeading,
      pageLead: config.pageLead,
      actionLabel: config.actionLabel,
      events: events,
      messages: takeFlash(req)
    }));
  } catch (err) {
    console.error("organiserController.selectEventHub failed:", err.message);
    res.status(500).send("We could not load your events. Please try again shortly.");
  }
}

async function registrationsHub(req, res) {
  return selectEventHub(req, res, "registrations");
}

async function rolesHub(req, res) {
  return selectEventHub(req, res, "roles");
}

async function attendanceHub(req, res) {
  return selectEventHub(req, res, "attendance");
}

async function loadCategories() {
  const [rows] = await pool.query(
    "SELECT category_id, category_name FROM event_categories ORDER BY category_name ASC"
  );
  return rows.map(function (c) {
    return { category_id: c.category_id, name: c.category_name, status: "Active" };
  });
}

/** One row per organiser event with confirmed/waitlisted counts by participation type. */
async function loadOrganiserEventCounts(organiserId) {
  const [rows] = await pool.query(
    `SELECT e.event_id, e.event_name, e.start_datetime, e.status,
            e.participant_capacity, e.volunteer_capacity,
            COALESCE(pc.total, 0) AS participants_filled,
            COALESCE(vc.total, 0) AS volunteers_filled,
            COALESCE(pw.total, 0) AS participant_waitlist,
            COALESCE(vw.total, 0) AS volunteer_waitlist
     FROM events e
     LEFT JOIN (
       SELECT event_id, COUNT(*) AS total FROM event_registrations
       WHERE participation_type = 'Participant' AND status = 'Confirmed'
       GROUP BY event_id
     ) pc ON pc.event_id = e.event_id
     LEFT JOIN (
       SELECT event_id, COUNT(*) AS total FROM event_registrations
       WHERE participation_type = 'Volunteer' AND status = 'Confirmed'
       GROUP BY event_id
     ) vc ON vc.event_id = e.event_id
     LEFT JOIN (
       SELECT event_id, COUNT(*) AS total FROM event_registrations
       WHERE participation_type = 'Participant' AND status = 'Waitlisted'
       GROUP BY event_id
     ) pw ON pw.event_id = e.event_id
     LEFT JOIN (
       SELECT event_id, COUNT(*) AS total FROM event_registrations
       WHERE participation_type = 'Volunteer' AND status = 'Waitlisted'
       GROUP BY event_id
     ) vw ON vw.event_id = e.event_id
     WHERE e.organiser_id = ?
     ORDER BY e.start_datetime ASC`,
    [organiserId]
  );
  return rows;
}

// GET /organiser/dashboard
async function dashboard(req, res) {
  const organiserId = req.session.user.user_id;

  try {
    const eventRows = await loadOrganiserEventCounts(organiserId);
    const now = new Date();

    const totalEvents = eventRows.length;
    const completed = eventRows.filter(function (r) { return r.status === "Completed"; }).length;
    const upcomingRows = eventRows.filter(function (r) {
      return r.status !== "Cancelled" && new Date(r.start_datetime) >= now;
    });

    const confirmedParticipants = upcomingRows.reduce(function (sum, r) { return sum + Number(r.participants_filled); }, 0);
    const confirmedVolunteers = upcomingRows.reduce(function (sum, r) { return sum + Number(r.volunteers_filled); }, 0);
    const participantWaitlist = upcomingRows.reduce(function (sum, r) { return sum + Number(r.participant_waitlist); }, 0);
    const volunteerWaitlist = upcomingRows.reduce(function (sum, r) { return sum + Number(r.volunteer_waitlist); }, 0);

    const [[attendanceTotals]] = await pool.query(
      `SELECT
         SUM(CASE WHEN a.attendance_status = 'Attended' THEN 1 ELSE 0 END) AS attended,
         COUNT(a.attendance_id) AS total
       FROM attendance a
       INNER JOIN event_registrations r ON r.registration_id = a.registration_id
       INNER JOIN events e ON e.event_id = r.event_id
       WHERE e.organiser_id = ?`,
      [organiserId]
    );
    const attendanceRecords = Number(attendanceTotals.total) || 0;
    const avgAttendance = attendanceRecords > 0
      ? Math.round((Number(attendanceTotals.attended) / attendanceRecords) * 100) + "%"
      : "—";

    const [[hoursRow]] = await pool.query(
      `SELECT COALESCE(SUM(a.volunteer_hours), 0) AS total_hours
       FROM attendance a
       INNER JOIN event_registrations r ON r.registration_id = a.registration_id
       INNER JOIN events e ON e.event_id = r.event_id
       WHERE e.organiser_id = ?
         AND r.participation_type = 'Volunteer'
         AND a.attendance_status = 'Attended'`,
      [organiserId]
    );
    const volunteerHoursTotal = Number(hoursRow.total_hours) || 0;

    const year = now.getFullYear();
    // Grouped by the event's own month (not registered_at, i.e. not when the
    // sign-up action happened) — an organiser wants to see how registrations
    // are distributed across their event calendar, and this way a new
    // sign-up shows up immediately under the month its event is actually
    // happening in.
    const [monthlyRegRows] = await pool.query(
      `SELECT MONTH(e.start_datetime) AS m, COUNT(*) AS cnt
       FROM event_registrations r
       INNER JOIN events e ON e.event_id = r.event_id
       WHERE e.organiser_id = ?
         AND YEAR(e.start_datetime) = ?
         AND r.status IN ('Confirmed', 'Waitlisted', 'Attended', 'Absent')
       GROUP BY MONTH(e.start_datetime)`,
      [organiserId, year]
    );
    const monthlyCounts = new Array(12).fill(0);
    monthlyRegRows.forEach(function (row) {
      monthlyCounts[Number(row.m) - 1] = Number(row.cnt) || 0;
    });
    const maxMonthly = Math.max.apply(null, monthlyCounts.concat([1]));
    const registrationsByMonth = MONTHS.map(function (label, idx) {
      return {
        label: label,
        val: String(monthlyCounts[idx]),
        h: Math.round((monthlyCounts[idx] / maxMonthly) * 140),
        current: idx === now.getMonth()
      };
    });

    const [statusRows] = await pool.query(
      `SELECT status, COUNT(*) AS cnt
       FROM events
       WHERE organiser_id = ?
       GROUP BY status`,
      [organiserId]
    );
    const eventsByStatus = {};
    ALLOWED_EVENT_STATUSES.forEach(function (s) { eventsByStatus[s] = 0; });
    statusRows.forEach(function (row) {
      eventsByStatus[row.status] = Number(row.cnt) || 0;
    });

    const upcoming = upcomingRows.slice(0, 5).map(function (r) {
      const start = formatDateParts(r.start_datetime);
      const meta = dualCapacityMeta(
        r.participants_filled, r.participant_capacity,
        r.volunteers_filled, r.volunteer_capacity,
        r.participant_waitlist, r.volunteer_waitlist
      );
      return Object.assign({
        id: r.event_id,
        event_name: r.event_name,
        month: start.month,
        day: start.day
      }, meta);
    });

    const alerts = [];

    eventRows.forEach(function (r) {
      if (r.status === "Cancelled" || r.status === "Completed") return;
      const participants = capacityMeta(r.participants_filled, r.participant_capacity);
      const volunteers = capacityMeta(r.volunteers_filled, r.volunteer_capacity);
      if (participants.full && volunteers.full) {
        alerts.push({
          tone: "danger",
          text: r.event_name + ": volunteer and participant places are full (waitlists open)",
          link: "/organiser/events/" + r.event_id + "/registrations",
          linkText: "Review registrations →"
        });
      } else if (participants.full && Number(r.participant_waitlist) > 0) {
        alerts.push({
          tone: "warning",
          text: r.event_name + ": participant capacity is full, waiting list is filling up",
          link: "/organiser/events/" + r.event_id + "/registrations",
          linkText: "Review registrations →"
        });
      } else if (volunteers.full && Number(r.volunteer_waitlist) > 0) {
        alerts.push({
          tone: "warning",
          text: r.event_name + ": volunteer capacity is full, waiting list is filling up",
          link: "/organiser/events/" + r.event_id + "/registrations",
          linkText: "Review registrations →"
        });
      }
    });

    const [roleGapRows] = await pool.query(
      `SELECT e.event_id, e.event_name,
              SUM(vr.required_volunteers) AS required_total,
              SUM(COALESCE(ac.assigned_count, 0)) AS assigned_total
       FROM volunteer_roles vr
       INNER JOIN events e ON e.event_id = vr.event_id
       LEFT JOIN (
         SELECT role_id, COUNT(*) AS assigned_count
         FROM volunteer_assignments
         GROUP BY role_id
       ) ac ON ac.role_id = vr.role_id
       WHERE e.organiser_id = ? AND e.status NOT IN ('Cancelled', 'Completed')
       GROUP BY e.event_id, e.event_name
       HAVING assigned_total < required_total`,
      [organiserId]
    );
    roleGapRows.forEach(function (r) {
      const missing = Number(r.required_total) - Number(r.assigned_total);
      alerts.push({
        tone: "warning",
        text: r.event_name + ": " + missing + " volunteer role" + (missing === 1 ? "" : "s") + " still unassigned",
        link: "/organiser/events/" + r.event_id + "/roles",
        linkText: "Assign roles →"
      });
    });

    const [attendanceGapRows] = await pool.query(
      `SELECT e.event_id, e.event_name, e.start_datetime
       FROM events e
       WHERE e.organiser_id = ? AND e.status = 'Completed'
         AND EXISTS (
           SELECT 1 FROM event_registrations r
           LEFT JOIN attendance a ON a.registration_id = r.registration_id
           WHERE r.event_id = e.event_id AND r.status = 'Confirmed' AND a.attendance_id IS NULL
         )
       ORDER BY e.start_datetime DESC`,
      [organiserId]
    );
    attendanceGapRows.forEach(function (r) {
      alerts.push({
        tone: "warning",
        text: "Attendance for " + r.event_name + " (" + formatDateParts(r.start_datetime).dateOnly + ") not yet finalised",
        link: "/organiser/events/" + r.event_id + "/attendance",
        linkText: "Record attendance →"
      });
    });

    const [attendanceSummaryRows] = await pool.query(
      `SELECT e.event_id, e.event_name, e.start_datetime,
              SUM(CASE WHEN a.attendance_status = 'Attended' THEN 1 ELSE 0 END) AS attended,
              COUNT(a.attendance_id) AS total
       FROM events e
       INNER JOIN event_registrations r ON r.event_id = e.event_id
       LEFT JOIN attendance a ON a.registration_id = r.registration_id
       WHERE e.organiser_id = ? AND e.status = 'Completed'
       GROUP BY e.event_id, e.event_name, e.start_datetime
       HAVING total > 0
       ORDER BY e.start_datetime DESC
       LIMIT 3`,
      [organiserId]
    );
    const attendance = attendanceSummaryRows.map(function (r) {
      const rate = Number(r.total) > 0 ? Math.round((Number(r.attended) / Number(r.total)) * 100) : 0;
      return {
        name: r.event_name + " (" + formatDateParts(r.start_datetime).dateOnly + ")",
        rate: rate + "%"
      };
    });

    res.render("organiser/dashboard", organiserLocals(req.session.user, "dashboard", {
      pageTitle: "Dashboard · Organiser",
      stats: {
        totalEvents: totalEvents,
        completed: completed,
        upcoming: upcomingRows.length,
        confirmedParticipants: confirmedParticipants,
        confirmedVolunteers: confirmedVolunteers,
        participantWaitlist: participantWaitlist,
        volunteerWaitlist: volunteerWaitlist,
        avgAttendance: avgAttendance,
        volunteerHours: volunteerHoursTotal.toFixed(1),
        eventsByStatus: eventsByStatus
      },
      registrationsByMonth: registrationsByMonth,
      chartYear: year,
      upcoming: upcoming,
      alerts: alerts.slice(0, 6),
      attendance: attendance,
      messages: takeFlash(req)
    }));
  } catch (err) {
    console.error("organiserController.dashboard failed:", err.message);
    res.status(500).send("We could not load your dashboard. Please try again shortly.");
  }
}

// GET /organiser/events
async function listEvents(req, res) {
  const organiserId = req.session.user.user_id;

  try {
    const [rows] = await pool.query(
      `SELECT e.event_id, e.event_name, e.location, e.start_datetime, e.status,
              e.participant_capacity, e.volunteer_capacity, e.image,
              c.category_name,
              COALESCE(pc.total, 0) AS participants_filled,
              COALESCE(vc.total, 0) AS volunteers_filled
       FROM events e
       INNER JOIN event_categories c ON c.category_id = e.category_id
       LEFT JOIN (
         SELECT event_id, COUNT(*) AS total FROM event_registrations
         WHERE participation_type = 'Participant' AND status = 'Confirmed'
         GROUP BY event_id
       ) pc ON pc.event_id = e.event_id
       LEFT JOIN (
         SELECT event_id, COUNT(*) AS total FROM event_registrations
         WHERE participation_type = 'Volunteer' AND status = 'Confirmed'
         GROUP BY event_id
       ) vc ON vc.event_id = e.event_id
       WHERE e.organiser_id = ?
       ORDER BY e.start_datetime DESC`,
      [organiserId]
    );

    const eventRows = rows.map(function (r) {
      const start = formatDateParts(r.start_datetime);
      return {
        id: r.event_id,
        name: r.event_name,
        loc: r.location,
        cat: r.category_name,
        thumb: resolveEventImage(r.image, r.category_name),
        when: start.dateOnly + " · " + start.timePart,
        participants_filled: Number(r.participants_filled) || 0,
        participant_capacity: r.participant_capacity,
        volunteers_filled: Number(r.volunteers_filled) || 0,
        volunteer_capacity: r.volunteer_capacity,
        status: manageEventsStatusLabel(r.status),
        cancellable: r.status !== "Cancelled" && r.status !== "Completed"
      };
    });

    const categories = await loadCategories();

    res.render("organiser/manage-events", organiserLocals(req.session.user, "events", {
      pageTitle: "Manage Events · Organiser",
      rows: eventRows,
      categories: categories,
      messages: takeFlash(req)
    }));
  } catch (err) {
    console.error("organiserController.listEvents failed:", err.message);
    res.status(500).send("We could not load your events. Please try again shortly.");
  }
}

// GET /organiser/events/new
async function newEventForm(req, res) {
  try {
    const categories = await loadCategories();

    res.render("organiser/event-form", organiserLocals(req.session.user, "events", {
      pageTitle: "Add Event · Organiser",
      formMode: "create",
      event: {
        event_name: "",
        category_id: categories.length ? categories[0].category_id : "",
        description: "",
        start_datetime: "",
        end_datetime: "",
        location: "",
        participant_capacity: "",
        volunteer_capacity: "",
        registration_deadline: "",
        status: "Draft",
        image: ""
      },
      categories: categories,
      messages: takeFlash(req)
    }));
  } catch (err) {
    console.error("organiserController.newEventForm failed:", err.message);
    res.status(500).send("We could not load the event form. Please try again shortly.");
  }
}

// GET /organiser/events/:id/edit
async function editEventForm(req, res) {
  const organiserId = req.session.user.user_id;
  const eventId = req.params.id;

  try {
    const [rows] = await pool.query(
      `SELECT e.event_id, e.organiser_id, e.category_id, e.event_name, e.description,
              e.start_datetime, e.end_datetime, e.location,
              e.participant_capacity, e.volunteer_capacity,
              e.registration_deadline, e.status, e.image,
              COALESCE(pc.total, 0) AS participants_filled,
              COALESCE(vc.total, 0) AS volunteers_filled
       FROM events e
       LEFT JOIN (
         SELECT event_id, COUNT(*) AS total FROM event_registrations
         WHERE participation_type = 'Participant' AND status = 'Confirmed'
         GROUP BY event_id
       ) pc ON pc.event_id = e.event_id
       LEFT JOIN (
         SELECT event_id, COUNT(*) AS total FROM event_registrations
         WHERE participation_type = 'Volunteer' AND status = 'Confirmed'
         GROUP BY event_id
       ) vc ON vc.event_id = e.event_id
       WHERE e.event_id = ?
       LIMIT 1`,
      [eventId]
    );
    const row = rows[0];

    if (!row || Number(row.organiser_id) !== Number(organiserId)) {
      return res.status(404).send("Event not found.");
    }

    const categories = await loadCategories();
    const participantsFilled = Number(row.participants_filled) || 0;
    const volunteersFilled = Number(row.volunteers_filled) || 0;

    res.render("organiser/event-form", organiserLocals(req.session.user, "events", {
      pageTitle: "Edit Event · Organiser",
      formMode: "edit",
      navEventId: eventId,
      event: {
        id: row.event_id,
        event_name: row.event_name,
        category_id: row.category_id,
        description: row.description,
        start_datetime: toDatetimeLocalValue(row.start_datetime),
        end_datetime: toDatetimeLocalValue(row.end_datetime),
        location: row.location,
        participant_capacity: row.participant_capacity,
        volunteer_capacity: row.volunteer_capacity,
        registration_deadline: toDatetimeLocalValue(row.registration_deadline),
        status: eventFormStatusValue(row.status),
        image: row.image || "",
        participants_filled: participantsFilled,
        volunteers_filled: volunteersFilled,
        participants: capacityMeta(participantsFilled, row.participant_capacity),
        volunteers: capacityMeta(volunteersFilled, row.volunteer_capacity)
      },
      categories: categories,
      messages: takeFlash(req)
    }));
  } catch (err) {
    console.error("organiserController.editEventForm failed:", err.message);
    res.status(500).send("We could not load this event. Please try again shortly.");
  }
}

// GET /organiser/events/:id/registrations
async function manageRegistrations(req, res) {
  const organiserId = req.session.user.user_id;
  const eventId = req.params.id;

  try {
    const [eventRows] = await pool.query(
      `SELECT event_id, organiser_id, participant_capacity, volunteer_capacity
       FROM events
       WHERE event_id = ?
       LIMIT 1`,
      [eventId]
    );
    const eventRow = eventRows[0];

    if (!eventRow || Number(eventRow.organiser_id) !== Number(organiserId)) {
      return res.status(404).send("Event not found.");
    }

    const [regRows] = await pool.query(
      `SELECT r.registration_id, r.participation_type, r.status, r.waiting_position,
              r.registered_at, u.name, u.email
       FROM event_registrations r
       INNER JOIN users u ON u.user_id = r.user_id
       WHERE r.event_id = ?
       ORDER BY r.registered_at ASC`,
      [eventId]
    );

    const confirmedParticipants = [];
    const confirmedVolunteers = [];
    const participantWaitlist = [];
    const volunteerWaitlist = [];
    let cancellations = 0;

    regRows.forEach(function (r, i) {
      const person = {
        name: r.name,
        initials: initialsFromName(r.name),
        avBg: AVATAR_COLORS[i % AVATAR_COLORS.length],
        contact: r.email,
        date: formatDateParts(r.registered_at).dateOnly,
        participation_type: r.participation_type
      };

      if (r.status === "Confirmed") {
        if (r.participation_type === "Volunteer") {
          confirmedVolunteers.push(person);
        } else {
          confirmedParticipants.push(person);
        }
      } else if (r.status === "Waitlisted") {
        const waitlistPerson = Object.assign({ pos: r.waiting_position }, person);
        if (r.participation_type === "Volunteer") {
          volunteerWaitlist.push(waitlistPerson);
        } else {
          participantWaitlist.push(waitlistPerson);
        }
      } else if (r.status === "Cancelled") {
        cancellations += 1;
      }
    });

    const [eventOptionRows] = await pool.query(
      `SELECT event_id, event_name, start_datetime
       FROM events
       WHERE organiser_id = ? AND status != 'Draft'
       ORDER BY start_datetime DESC`,
      [organiserId]
    );
    const eventOptions = eventOptionRows.map(function (r) {
      const start = formatDateParts(r.start_datetime);
      return { id: r.event_id, name: r.event_name, when: start.dateOnly + " · " + start.timePart };
    });

    const summary = {
      participant_capacity: eventRow.participant_capacity,
      volunteer_capacity: eventRow.volunteer_capacity,
      confirmedParticipants: confirmedParticipants.length,
      confirmedVolunteers: confirmedVolunteers.length,
      participantWaitlist: participantWaitlist.length,
      volunteerWaitlist: volunteerWaitlist.length,
      cancellations: cancellations
    };

    const messages = takeFlash(req);
    const participantsFull = summary.confirmedParticipants >= summary.participant_capacity;
    const volunteersFull = summary.confirmedVolunteers >= summary.volunteer_capacity;
    if (participantsFull || volunteersFull) {
      messages.push({
        type: "warning",
        text: "One or both capacities are full. If a confirmed registration cancels, the earliest matching waitlisted person is offered the space automatically."
      });
    }

    res.render("organiser/manage-registrations", organiserLocals(req.session.user, "registrations", {
      pageTitle: "Manage Registrations · Organiser",
      event: { id: eventRow.event_id },
      navEventId: eventRow.event_id,
      eventOptions: eventOptions,
      confirmedParticipants: confirmedParticipants,
      confirmedVolunteers: confirmedVolunteers,
      participantWaitlist: participantWaitlist,
      volunteerWaitlist: volunteerWaitlist,
      summary: summary,
      messages: messages
    }));
  } catch (err) {
    console.error("organiserController.manageRegistrations failed:", err.message);
    res.status(500).send("We could not load registrations for this event. Please try again shortly.");
  }
}

// GET /organiser/events/:id/roles
async function roleAssignment(req, res) {
  const organiserId = req.session.user.user_id;
  const eventId = req.params.id;

  try {
    const [eventRows] = await pool.query(
      "SELECT event_id, organiser_id FROM events WHERE event_id = ? LIMIT 1",
      [eventId]
    );
    const eventRow = eventRows[0];

    if (!eventRow || Number(eventRow.organiser_id) !== Number(organiserId)) {
      return res.status(404).send("Event not found.");
    }

    const [roleRows] = await pool.query(
      `SELECT vr.role_id, vr.role_name, vr.description, vr.required_volunteers,
              u.user_id, u.name
       FROM volunteer_roles vr
       LEFT JOIN volunteer_assignments va ON va.role_id = vr.role_id
       LEFT JOIN event_registrations er ON er.registration_id = va.registration_id
       LEFT JOIN users u ON u.user_id = er.user_id
       WHERE vr.event_id = ?
       ORDER BY vr.role_name ASC, u.name ASC`,
      [eventId]
    );

    // role_id -> { volunteer_role_id, name, desc, required, people: [...] }
    const roleMap = new Map();
    let avatarIndex = 0;
    roleRows.forEach(function (r) {
      if (!roleMap.has(r.role_id)) {
        roleMap.set(r.role_id, {
          volunteer_role_id: r.role_id,
          name: r.role_name,
          desc: r.description || "",
          required: r.required_volunteers,
          people: []
        });
      }
      if (r.user_id) {
        roleMap.get(r.role_id).people.push({
          name: r.name,
          initials: initialsFromName(r.name),
          avBg: AVATAR_COLORS[avatarIndex % AVATAR_COLORS.length]
        });
        avatarIndex += 1;
      }
    });

    const roles = Array.from(roleMap.values()).map(function (role) {
      const assigned = role.people.length;
      const hasSpace = assigned < role.required;
      const remaining = role.required - assigned;
      let capBg = "#E8F7F0";
      let capFg = "#056047";
      if (!hasSpace) {
        capBg = "#FBEAE8";
        capFg = "#B0433B";
      } else if (role.required > 0 && (assigned / role.required) >= 0.8) {
        capBg = "#FFF7DF";
        capFg = "#8A5E08";
      }
      return {
        volunteer_role_id: role.volunteer_role_id,
        name: role.name,
        desc: role.desc,
        cap: assigned + " of " + role.required + " filled",
        capBg: capBg,
        capFg: capFg,
        people: role.people,
        hasSpace: hasSpace,
        spaceNote: hasSpace ? (remaining + (remaining === 1 ? " space" : " spaces") + " remaining") : ""
      };
    });

    const roleOptions = Array.from(roleMap.values()).map(function (role) {
      return { volunteer_role_id: role.volunteer_role_id, name: role.name };
    });

    const [unassignedRows] = await pool.query(
      `SELECT u.user_id, u.name
       FROM event_registrations er
       INNER JOIN users u ON u.user_id = er.user_id
       LEFT JOIN volunteer_assignments va ON va.registration_id = er.registration_id
       WHERE er.event_id = ? AND er.participation_type = 'Volunteer'
         AND er.status = 'Confirmed' AND va.assignment_id IS NULL
       ORDER BY u.name ASC`,
      [eventId]
    );
    const unassigned = unassignedRows.map(function (u, i) {
      return {
        name: u.name,
        initials: initialsFromName(u.name),
        avBg: AVATAR_COLORS[i % AVATAR_COLORS.length]
      };
    });

    const [eventOptionRows] = await pool.query(
      `SELECT event_id, event_name, start_datetime
       FROM events
       WHERE organiser_id = ? AND status != 'Draft'
       ORDER BY start_datetime DESC`,
      [organiserId]
    );
    const eventOptions = eventOptionRows.map(function (r) {
      return {
        id: r.event_id,
        event_name: r.event_name,
        dateLabel: formatDateParts(r.start_datetime).dateLabel
      };
    });

    res.render("organiser/role-assignment", organiserLocals(req.session.user, "roles", {
      pageTitle: "Role Assignment · Organiser",
      event: { id: eventRow.event_id },
      navEventId: eventRow.event_id,
      eventOptions: eventOptions,
      roles: roles,
      unassigned: unassigned,
      roleOptions: roleOptions,
      messages: takeFlash(req)
    }));
  } catch (err) {
    console.error("organiserController.roleAssignment failed:", err.message);
    res.status(500).send("We could not load role assignment for this event. Please try again shortly.");
  }
}

// POST /organiser/events
async function createEvent(req, res) {
  const organiserId = req.session.user.user_id;

  try {
    const uploadedImagePath = req.file ? toPublicImagePath(req.file) : null;
    const rawImageInput = Object.prototype.hasOwnProperty.call(req.body, "image") ? String(req.body.image || "").trim() : "";
    const imageValue = uploadedImagePath || (rawImageInput || null);

    const validated = await validateEventPayload(req.body, { imageValue: imageValue });
    if (!validated.ok) {
      return reRenderEventForm(req, res, "create", Object.assign({
        event_name: req.body.event_name || "",
        category_id: req.body.category_id || "",
        description: req.body.description || "",
        start_datetime: req.body.start_datetime || "",
        end_datetime: req.body.end_datetime || "",
        location: req.body.location || "",
        participant_capacity: req.body.participant_capacity || "",
        volunteer_capacity: req.body.volunteer_capacity || "",
        registration_deadline: req.body.registration_deadline || "",
        status: req.body.status || "Draft",
        image: imageValue || ""
      }, {}), validated.error);
    }

    const d = validated.data;
    const [result] = await pool.query(
      `INSERT INTO events (
         organiser_id, category_id, event_name, description,
         start_datetime, end_datetime, location,
         participant_capacity, volunteer_capacity, registration_deadline,
         status, image
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organiserId,
        d.category_id,
        d.event_name,
        d.description,
        d.start_datetime,
        d.end_datetime,
        d.location,
        d.participant_capacity,
        d.volunteer_capacity,
        d.registration_deadline,
        d.status,
        d.image
      ]
    );

    flash(req, "success", "Event created successfully.");
    return res.redirect("/organiser/events/" + result.insertId + "/edit");
  } catch (err) {
    console.error("organiserController.createEvent failed:", err.message);
    flash(req, "error", "We could not create that event. Please try again.");
    return res.redirect("/organiser/events/new");
  }
}

// POST /organiser/events/:id/edit
async function updateEvent(req, res) {
  const organiserId = req.session.user.user_id;
  const eventId = Number(req.params.id);

  if (!Number.isInteger(eventId) || eventId <= 0) {
    flash(req, "error", "That event could not be found.");
    return res.redirect("/organiser/events");
  }

  try {
    const [rows] = await pool.query(
      `SELECT e.event_id, e.organiser_id, e.status,
              COALESCE(pc.total, 0) AS participants_filled,
              COALESCE(vc.total, 0) AS volunteers_filled
       FROM events e
       LEFT JOIN (
         SELECT event_id, COUNT(*) AS total FROM event_registrations
         WHERE participation_type = 'Participant' AND status = 'Confirmed'
         GROUP BY event_id
       ) pc ON pc.event_id = e.event_id
       LEFT JOIN (
         SELECT event_id, COUNT(*) AS total FROM event_registrations
         WHERE participation_type = 'Volunteer' AND status = 'Confirmed'
         GROUP BY event_id
       ) vc ON vc.event_id = e.event_id
       WHERE e.event_id = ?
       LIMIT 1`,
      [eventId]
    );
    const existing = rows[0];
    if (!existing || Number(existing.organiser_id) !== Number(organiserId)) {
      return res.status(403).send("You do not have permission to edit this event.");
    }

    const participantsFilled = Number(existing.participants_filled) || 0;
    const volunteersFilled = Number(existing.volunteers_filled) || 0;
    const uploadedImagePath = req.file ? toPublicImagePath(req.file) : null;
    const rawImageInput = Object.prototype.hasOwnProperty.call(req.body, "image") ? String(req.body.image || "").trim() : "";
    const imageValue = uploadedImagePath || ((rawImageInput !== "" ? rawImageInput : null));

    const validated = await validateEventPayload(req.body, {
      participantFilled: participantsFilled,
      volunteerFilled: volunteersFilled,
      imageValue: imageValue
    });
    if (!validated.ok) {
      return reRenderEventForm(req, res, "edit", Object.assign({
        id: eventId,
        event_name: req.body.event_name || "",
        category_id: req.body.category_id || "",
        description: req.body.description || "",
        start_datetime: req.body.start_datetime || "",
        end_datetime: req.body.end_datetime || "",
        location: req.body.location || "",
        participant_capacity: req.body.participant_capacity || "",
        volunteer_capacity: req.body.volunteer_capacity || "",
        registration_deadline: req.body.registration_deadline || "",
        status: req.body.status || "Draft",
        image: imageValue || "",
        participants_filled: participantsFilled,
        volunteers_filled: volunteersFilled,
        participants: capacityMeta(participantsFilled, Number(req.body.participant_capacity) || 0),
        volunteers: capacityMeta(volunteersFilled, Number(req.body.volunteer_capacity) || 0)
      }, {}), validated.error);
    }

    const d = validated.data;
    const previousStatus = existing.status;

    await pool.query(
      `UPDATE events SET
         category_id = ?, event_name = ?, description = ?,
         start_datetime = ?, end_datetime = ?, location = ?,
         participant_capacity = ?, volunteer_capacity = ?,
         registration_deadline = ?, status = ?, image = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE event_id = ? AND organiser_id = ?`,
      [
        d.category_id,
        d.event_name,
        d.description,
        d.start_datetime,
        d.end_datetime,
        d.location,
        d.participant_capacity,
        d.volunteer_capacity,
        d.registration_deadline,
        d.status,
        d.image,
        eventId,
        organiserId
      ]
    );

    // Feature 6 — notify registrants after a successful event update (decision unchanged).
    try {
      const [regUsers] = await pool.query(
        `SELECT DISTINCT u.user_id, u.name, u.email
         FROM event_registrations r
         INNER JOIN users u ON u.user_id = r.user_id
         WHERE r.event_id = ? AND r.status IN ('Confirmed', 'Waitlisted')`,
        [eventId]
      );
      if (regUsers.length) {
        const isCancellation = d.status === "Cancelled" && previousStatus !== "Cancelled";
        if (isCancellation) {
          await notifications.notifyUsers(regUsers.map(function (r) { return r.user_id; }), {
            eventId: eventId,
            title: "Event cancelled",
            message: d.event_name + " has been cancelled by the organiser.",
            type: "EventCancellation"
          });
          for (let i = 0; i < regUsers.length; i++) {
            await notificationEmails.sendEventCancelledEmail({
              email: regUsers[i].email,
              name: regUsers[i].name,
              eventName: d.event_name
            });
          }
        } else {
          await notifications.notifyUsers(regUsers.map(function (r) { return r.user_id; }), {
            eventId: eventId,
            title: "Event updated",
            message: "Details for " + d.event_name + " have been updated. Please review the event page.",
            type: "EventUpdate"
          });
          for (let i = 0; i < regUsers.length; i++) {
            await notificationEmails.sendEventUpdatedEmail({
              email: regUsers[i].email,
              name: regUsers[i].name,
              eventName: d.event_name,
              startDatetime: d.start_datetime,
              location: d.location
            });
          }
        }
      }
    } catch (notifyErr) {
      console.error("Event update notification failed:", notifyErr.message);
    }

    flash(req, "success", "Event updated successfully.");
    return res.redirect("/organiser/events/" + eventId + "/edit");
  } catch (err) {
    console.error("organiserController.updateEvent failed:", err.message);
    flash(req, "error", "We could not update that event. Please try again.");
    return res.redirect("/organiser/events/" + eventId + "/edit");
  }
}

// POST /organiser/events/:id/delete
async function deleteEvent(req, res) {
  const organiserId = req.session.user.user_id;
  const eventId = Number(req.params.id);

  if (!Number.isInteger(eventId) || eventId <= 0) {
    flash(req, "error", "That event could not be found.");
    return res.redirect("/organiser/events");
  }

  try {
    const [rows] = await pool.query(
      "SELECT event_id, organiser_id FROM events WHERE event_id = ? LIMIT 1",
      [eventId]
    );
    const existing = rows[0];
    if (!existing) {
      flash(req, "error", "That event could not be found.");
      return res.redirect("/organiser/events");
    }
    if (Number(existing.organiser_id) !== Number(organiserId)) {
      return res.status(403).send("You do not have permission to delete this event.");
    }

    // Child rows (roles, registrations, etc.) cascade per schema.
    await pool.query(
      "DELETE FROM events WHERE event_id = ? AND organiser_id = ?",
      [eventId, organiserId]
    );
    flash(req, "success", "Event deleted successfully.");
    return res.redirect("/organiser/events");
  } catch (err) {
    console.error("organiserController.deleteEvent failed:", err.message);
    flash(req, "error", "We could not delete that event. Please try again.");
    return res.redirect("/organiser/events");
  }
}

module.exports = {
  dashboard: dashboard,
  listEvents: listEvents,
  newEventForm: newEventForm,
  editEventForm: editEventForm,
  createEvent: createEvent,
  updateEvent: updateEvent,
  deleteEvent: deleteEvent,
  manageRegistrations: manageRegistrations,
  roleAssignment: roleAssignment,
  registrationsHub: registrationsHub,
  rolesHub: rolesHub,
  attendanceHub: attendanceHub
};
