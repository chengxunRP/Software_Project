require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const pool = require("./config/database");
const publicEvents = require("./lib/publicEvents");
const registrationRoutes = require("./routes/registrationRoutes");
const { takeFlash } = require("./controllers/registrationController");

const rolesRoutes = require("./routes/roles");
const authRoutes = require("./routes/authRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const {
  isOrganiser,
  requireCommunityMember,
  requireOrganiser,
  requireAdmin
} = require("./middleware/auth");
const { toViewUser } = require("./lib/userDisplay");
const memberController = require("./controllers/memberController");
const organiserController = require("./controllers/organiserController");
const adminController = require("./controllers/adminController");
const { upload } = require("./lib/eventImageUpload");


const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

if (!process.env.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET is not set. Add it to your .env file, then restart the server " +
    "(dotenv only reads .env once, at startup — editing it while the server is still running has no effect)."
  );
}

// Render terminates HTTPS at the reverse proxy. Trust X-Forwarded-* so
// express-session can set Secure cookies correctly in production.
if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(
  session({
    name: "communityconnect.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

console.log("NODE_ENV:", process.env.NODE_ENV || "(unset)");
console.log("Trust proxy enabled:", isProduction);
console.log("Secure session cookies:", isProduction);

// Feature 1 — authentication (register / login / logout / password reset)
app.use(authRoutes);
// Feature 1 — admin user account management (all routes require admin role)
app.use(adminUserRoutes);

app.use(rolesRoutes);
app.use(registrationRoutes);

// Unread notification badge for community members (MySQL).
app.use(async function (req, res, next) {
  res.locals.unreadNotificationCount = 0;
  try {
    const user = req.session && req.session.user;
    if (user && user.role === "community_member" && user.user_id) {
      const [[row]] = await pool.query(
        "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0",
        [user.user_id]
      );
      res.locals.unreadNotificationCount = Number(row.total) || 0;
    }
  } catch (err) {
    console.error("Unread notification count failed:", err.message);
  }
  next();
});

// Sample preview datasets removed — pages load from MySQL via controllers.

<<<<<<< HEAD
function publicLocals(req, extra) {
=======
const SESSION_ROLE_TO_NAV_ROLE = {
  community_member: "member",
  organiser: "organiser",
  admin: "admin"
};

// Public marketing pages (/, /events, /events/:id) keep the "public" layout
// even for a signed-in user — but must still show their avatar/logout instead
// of Log in/Register, and link the bell/avatar to the right dashboard.
function publicLocals(req, extra) {
  const sessionUser = req && req.session && req.session.user;
>>>>>>> design/travel-photo-theme
  return Object.assign({
    layout: "public",
    activeNav: "",
    pageTitle: "CommunityConnect SG",
<<<<<<< HEAD
    currentUser: req.session.user || null,
=======
    currentUser: sessionUser ? toViewUser(sessionUser) : null,
    role: sessionUser ? (SESSION_ROLE_TO_NAV_ROLE[sessionUser.role] || null) : null,
>>>>>>> design/travel-photo-theme
    messages: []
  }, extra || {});
}

function appLocals(role, user, activeNav, extra) {
  return Object.assign({
    layout: "app",
    role: role,
    activeNav: activeNav,
    pageTitle: "CommunityConnect",
    currentUser: user,
    messages: []
  }, extra || {});
}

// ---------- Public GET routes (MySQL-backed) ----------

app.get("/", async function (req, res) {
  try {
    const [impactStats, featuredEvents] = await Promise.all([
      publicEvents.getLandingStats(),
      publicEvents.getFeaturedEvents(3)
    ]);

    res.render("index", publicLocals(req, {
      activeNav: "home",
      pageTitle: "CommunityConnect SG",
      impactStats: impactStats,
      featuredEvents: featuredEvents,
      heroBadge: "Serving neighbourhoods across Singapore"
    }));
  } catch (err) {
    console.error("Landing page query failed:", err.message);
    res.status(500).render("error", publicLocals(req, {
      activeNav: "home",
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load the latest community events. Please try again shortly."
    }));
  }
});

// GET /login and GET /register are served by routes/authRoutes.js (Feature 1).

app.get("/events", async function (req, res) {
  try {
    const search = (req.query.search || req.query.q || "").trim();
    const category = (req.query.category || req.query.category_id || "").trim();
    const date = (req.query.date || "").trim();
    const location = (req.query.location || "").trim();
    const availability = (req.query.availability || "").trim();
    const sort = (req.query.sort || "date").trim().toLowerCase();

    const filters = {
      search: search,
      category: category,
      date: date,
      location: location,
      availability: availability,
      sort: sort === "popularity" ? "popularity" : "date"
    };

    const hasFilters = Boolean(
      search
      || category
      || (date && date !== "Any date")
      || (location && location !== "All areas")
      || (availability && availability !== "All events")
    );

    const [catalogue, dbCategories, totalEventsInDatabase] = await Promise.all([
      publicEvents.getCatalogueEvents(filters),
      publicEvents.getPublicCategories(),
      publicEvents.countEvents()
    ]);

    res.render("events", publicLocals(req, {
      activeNav: "events",
      pageTitle: "Event Catalogue · CommunityConnect SG",
      events: catalogue.events,
      categories: dbCategories,
      filters: filters,
      hasFilters: hasFilters,
      totalEventsInDatabase: totalEventsInDatabase
    }));
  } catch (err) {
    console.error("Event catalogue query failed:", err.message);
    res.status(500).render("error", publicLocals(req, {
      activeNav: "events",
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load the event catalogue. Please try again shortly."
    }));
  }
});

/**
 * Decide whether the join form may show. Uses raw MySQL datetimes + status ENUM.
 * Full still allows waiting-list registration.
 */
function registrationPanelState(event, currentRegistration) {
  const now = new Date();
  const status = event.status;
  const deadline = event.registration_deadline
    ? new Date(event.registration_deadline)
    : null;
  const start = event.start_datetime ? new Date(event.start_datetime) : null;
  const eventStarted = !!(start && start.getTime() <= now.getTime());

  const activeStatuses = { Confirmed: true, Waitlisted: true, Attended: true, Absent: true };
  const hasBlockingRegistration = !!(
    currentRegistration && activeStatuses[currentRegistration.status]
  );

  let canRegister = false;
  let registrationUnavailableReason = null;

  if (hasBlockingRegistration) {
    registrationUnavailableReason = null;
  } else if (status === "Cancelled") {
    registrationUnavailableReason = "Event cancelled";
  } else if (status === "Completed") {
    registrationUnavailableReason = "Event completed";
  } else if (status === "Closed") {
    registrationUnavailableReason = "Registration closed";
  } else if (status !== "Open" && status !== "Full") {
    registrationUnavailableReason = "Registration closed";
  } else if (deadline && deadline.getTime() < now.getTime()) {
    registrationUnavailableReason = "Registration deadline has passed";
  } else if (eventStarted) {
    registrationUnavailableReason = "Event has started";
  } else {
    canRegister = true;
  }

  const canCancelRegistration = !!(
    currentRegistration
    && (currentRegistration.status === "Confirmed" || currentRegistration.status === "Waitlisted")
    && !eventStarted
  );

  return {
    canRegister: canRegister,
    registrationUnavailableReason: registrationUnavailableReason,
    canCancelRegistration: canCancelRegistration,
    eventStarted: eventStarted
  };
}

app.get("/events/:id", async function (req, res) {
  try {
    const event = await publicEvents.getEventById(req.params.id);
    if (!event) {
      return res.status(404).render("error", publicLocals(req, {
        activeNav: "events",
        pageTitle: "Event not found · CommunityConnect SG",
        statusCode: 404,
        errorTitle: "Event not found",
        errorMessage: "This event does not exist or is no longer available."
      }));
    }

    const roles = await publicEvents.getVolunteerRolesForEvent(event.event_id);

    // Only community_member session identity — never URL/query/form user_id.
    let currentRegistration = null;
    const sessionUser = req.session && req.session.user;
    if (
      sessionUser
      && sessionUser.role === "community_member"
      && sessionUser.user_id
    ) {
      const memberId = Number(sessionUser.user_id);
      if (Number.isInteger(memberId) && memberId > 0) {
        const [regRows] = await pool.query(
          `SELECT
             r.registration_id,
             r.participation_type,
             r.status,
             r.waiting_position,
             r.preferred_role_id,
             vr.role_name AS volunteer_role_name
           FROM event_registrations r
           LEFT JOIN volunteer_roles vr ON vr.role_id = r.preferred_role_id
           WHERE r.event_id = ?
             AND r.user_id = ?
           LIMIT 1`,
          [event.event_id, memberId]
        );
        if (regRows.length) {
          currentRegistration = regRows[0];
        }
      }
    }

    const panel = registrationPanelState(event, currentRegistration);

    res.render("event-details", publicLocals(req, {
      activeNav: "events",
      pageTitle: event.event_name + " · CommunityConnect SG",
      event: event,
      roles: roles,
      currentRegistration: currentRegistration,
      canRegister: panel.canRegister,
      registrationUnavailableReason: panel.registrationUnavailableReason,
      canCancelRegistration: panel.canCancelRegistration,
      messages: takeFlash(req)
    }));
  } catch (err) {
    console.error("Event details query failed:", err.message);
    res.status(500).render("error", publicLocals(req, {
      activeNav: "events",
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load this event. Please try again shortly."
    }));
  }
});

// ---------- Community member routes (MySQL) ----------
app.get("/member/dashboard", requireCommunityMember, memberController.dashboard);
app.get("/member/volunteer-hours", requireCommunityMember, memberController.volunteerHours);
app.get("/member/volunteer-history", requireCommunityMember, memberController.volunteerHistory);
app.get("/member/profile", requireCommunityMember, memberController.profile);
app.post("/member/notifications/:id/read", requireCommunityMember, memberController.markNotificationRead);
app.post("/member/notifications/read-all", requireCommunityMember, memberController.markAllNotificationsRead);

// Compatibility redirects from former volunteer paths
app.get("/volunteer/dashboard", function (req, res) { res.redirect("/member/dashboard"); });
app.get("/volunteer/registrations", function (req, res) { res.redirect("/member/registrations"); });
app.get("/volunteer/hours", function (req, res) { res.redirect("/member/volunteer-hours"); });
app.get("/volunteer/profile", function (req, res) { res.redirect("/member/profile"); });

// ---------- Organiser routes (MySQL) ----------
app.get("/organiser/dashboard", requireOrganiser, organiserController.dashboard);
app.get("/organiser/events", requireOrganiser, organiserController.listEvents);
app.get("/organiser/registrations", requireOrganiser, organiserController.registrationsHub);
app.get("/organiser/roles", requireOrganiser, organiserController.rolesHub);
app.get("/organiser/attendance", requireOrganiser, organiserController.attendanceHub);
app.get("/organiser/events/new", requireOrganiser, organiserController.newEventForm);
app.post("/organiser/events", requireOrganiser, upload.single("event_image"), organiserController.createEvent);
app.get("/organiser/events/:id/edit", requireOrganiser, organiserController.editEventForm);
app.post("/organiser/events/:id/edit", requireOrganiser, upload.single("event_image"), organiserController.updateEvent);
app.post("/organiser/events/:id/delete", requireOrganiser, organiserController.deleteEvent);
app.get("/organiser/events/:id/registrations", requireOrganiser, organiserController.manageRegistrations);
app.get("/organiser/events/:id/roles", requireOrganiser, organiserController.roleAssignment);

// GET /organiser/events/:id/attendance
// User action  -> organiser opens the Attendance page for one event
// Route        -> confirms ownership, then loads every eligible registration
// SQL          -> event_registrations LEFT JOIN volunteer_assignments/volunteer_roles
//                 (to show which role a Volunteer holds) LEFT JOIN attendance
//                 (registration_id) so a registration with no attendance row yet
//                 shows as "Pending" instead of being excluded
// DB           -> events, event_registrations, users, volunteer_assignments,
//                 volunteer_roles, attendance
// Response     -> renders the attendance page with real data (no attendance
//                 marking yet — POST /organiser/events/:id/attendance is next step)
const AVATAR_COLORS = ["#7FA8D9", "#F4B83F", "#C08FBB", "#8FBF9A", "#D9A08F", "#B9C98F"];

app.get("/organiser/events/:id/attendance", isOrganiser, async function (req, res) {
  const eventId = req.params.id;

  try {
  const [eventRows] = await pool.query(
    "SELECT event_id, event_name, organiser_id FROM events WHERE event_id = ?",
    [eventId]
  );
  const event = eventRows[0];

  if (!event) {
    return res.status(404).send("Event not found.");
  }
  if (Number(event.organiser_id) !== Number(req.session.user.user_id)) {
    return res.status(403).send("You do not have permission to manage this event.");
  }

  // Only registrations that actually held (or hold) a place are attendance-eligible.
  // Waitlisted/Cancelled registrations never had a place to check in for.
  const [regRows] = await pool.query(
    `SELECT er.registration_id, u.name, er.participation_type,
            vr.role_name, a.attendance_status, a.check_in_time, a.check_out_time
     FROM event_registrations er
     JOIN users u ON u.user_id = er.user_id
     LEFT JOIN volunteer_assignments va ON va.registration_id = er.registration_id
     LEFT JOIN volunteer_roles vr ON vr.role_id = va.role_id
     LEFT JOIN attendance a ON a.registration_id = er.registration_id
     WHERE er.event_id = ? AND er.status IN ('Confirmed', 'Attended', 'Absent')
     ORDER BY u.name ASC`,
    [eventId]
  );

  const rows = regRows.map(function (r, i) {
    const initials = r.name.split(" ").map(function (part) { return part[0]; }).join("").slice(0, 2).toUpperCase();
    return {
      registration_id: r.registration_id,
      name: r.name,
      initials: initials,
      avBg: AVATAR_COLORS[i % AVATAR_COLORS.length],
      participation_type: r.participation_type,
      role: r.role_name || "—",
      status: r.attendance_status || "Pending",
      check_in_time: r.check_in_time,
      check_out_time: r.check_out_time,
      canCheckOut: r.attendance_status === "Attended" && r.check_in_time && !r.check_out_time
    };
  });

  const attendedCount = rows.filter(function (r) { return r.status === "Attended"; }).length;
  const absentCount = rows.filter(function (r) { return r.status === "Absent"; }).length;
  const pendingCount = rows.filter(function (r) { return r.status === "Pending"; }).length;

  const [eventOptionRows] = await pool.query(
    `SELECT event_id, event_name, start_datetime
     FROM events
     WHERE organiser_id = ?
     ORDER BY start_datetime DESC`,
    [req.session.user.user_id]
  );
  const eventOptions = eventOptionRows.map(function (row) {
    const d = row.start_datetime instanceof Date ? row.start_datetime : new Date(row.start_datetime);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const dateLabel = Number.isNaN(d.getTime())
      ? ""
      : day + "/" + month + "/" + d.getFullYear();
    return {
      id: row.event_id,
      event_id: row.event_id,
      event_name: row.event_name,
      dateLabel: dateLabel
    };
  });

  res.render("organiser/attendance", {
    layout: "app",
    role: "organiser",
    activeNav: "attendance",
    pageTitle: "Attendance · Organiser",
    currentUser: toViewUser(req.session.user),
    navEventId: event.event_id,
    event: {
      id: event.event_id,
      event_id: event.event_id,
      event_name: event.event_name
    },
    eventOptions: eventOptions,
    rows: rows,
    summary: {
      registered: rows.length,
      attended: attendedCount,
      absent: absentCount,
      pending: pendingCount
    },
    messages: takeFlash(req)
  });
  } catch (err) {
    console.error("Attendance page query failed:", err.message);
    return res.status(500).send("We could not load attendance. Please try again shortly.");
  }
});

// POST /organiser/events/:id/attendance
// User action  -> organiser clicks "Mark Attended" / "Mark Absent" on a row
// Route        -> confirms ownership, validates registration belongs to event,
//                 blocks duplicates, then INSERT attendance
//                 (Attended sets check_in_time; Absent leaves check-in null;
//                  volunteer_hours always starts at 0 — hour totals are Feature 6)
// SQL          -> SELECT registration + existing attendance; INSERT attendance
// DB           -> events, event_registrations, attendance
app.post("/organiser/events/:id/attendance", isOrganiser, async function (req, res) {
  const eventId = req.params.id;
  const attendancePath = "/organiser/events/" + eventId + "/attendance";

  const [eventRows] = await pool.query(
    "SELECT event_id, organiser_id FROM events WHERE event_id = ?",
    [eventId]
  );
  const event = eventRows[0];

  if (!event) {
    return res.status(404).send("Event not found.");
  }
  if (Number(event.organiser_id) !== Number(req.session.user.user_id)) {
    return res.status(403).send("You do not have permission to manage this event.");
  }

  const registration_id = parseInt(req.body.registration_id, 10);
  const attendance_status = req.body.attendance_status;

  if (!Number.isInteger(registration_id) || registration_id < 1) {
    req.session.flash = { type: "error", text: "Select a valid registration." };
    return res.redirect(attendancePath);
  }
  if (attendance_status !== "Attended" && attendance_status !== "Absent") {
    req.session.flash = { type: "error", text: "Attendance status must be Attended or Absent." };
    return res.redirect(attendancePath);
  }

  // Registration must belong to this event and be attendance-eligible.
  const [regRows] = await pool.query(
    `SELECT registration_id, participation_type, status
     FROM event_registrations
     WHERE registration_id = ? AND event_id = ?
       AND status IN ('Confirmed', 'Attended', 'Absent')
     LIMIT 1`,
    [registration_id, eventId]
  );
  if (!regRows[0]) {
    req.session.flash = { type: "error", text: "That registration is not eligible for attendance on this event." };
    return res.redirect(attendancePath);
  }

  const [existingRows] = await pool.query(
    "SELECT attendance_id FROM attendance WHERE registration_id = ?",
    [registration_id]
  );

  if (existingRows.length > 0) {
    req.session.flash = { type: "error", text: "Attendance has already been recorded for this registration." };
    return res.redirect(attendancePath);
  }

  // Participant hours must remain 0. Volunteer hour aggregation is Feature 6 —
  // store 0 here so Feature 5 does not invent contribution totals.
  const checkInSql = attendance_status === "Attended" ? "NOW()" : "NULL";
  await pool.query(
    `INSERT INTO attendance
       (registration_id, attendance_status, check_in_time, check_out_time, volunteer_hours, recorded_by, recorded_at)
     VALUES (?, ?, ${checkInSql}, NULL, 0, ?, NOW())`,
    [registration_id, attendance_status, req.session.user.user_id]
  );

  res.redirect(attendancePath);
});

// POST /organiser/events/:id/attendance/checkout
// User action  -> organiser clicks "Check out" after a check-in (Attended)
// Route        -> ownership + registration-in-event checks; requires existing
//                 Attended row with check_in_time and no check_out_time yet
// SQL          -> UPDATE attendance SET check_out_time = NOW()
// DB           -> attendance, event_registrations, events
app.post("/organiser/events/:id/attendance/checkout", isOrganiser, async function (req, res) {
  const eventId = req.params.id;
  const attendancePath = "/organiser/events/" + eventId + "/attendance";

  const [eventRows] = await pool.query(
    "SELECT event_id, organiser_id FROM events WHERE event_id = ?",
    [eventId]
  );
  const event = eventRows[0];

  if (!event) {
    return res.status(404).send("Event not found.");
  }
  if (Number(event.organiser_id) !== Number(req.session.user.user_id)) {
    return res.status(403).send("You do not have permission to manage this event.");
  }

  const registration_id = parseInt(req.body.registration_id, 10);
  if (!Number.isInteger(registration_id) || registration_id < 1) {
    req.session.flash = { type: "error", text: "Select a valid registration." };
    return res.redirect(attendancePath);
  }

  const [rows] = await pool.query(
    `SELECT a.attendance_id, a.attendance_status, a.check_in_time, a.check_out_time
     FROM attendance a
     INNER JOIN event_registrations er ON er.registration_id = a.registration_id
     WHERE a.registration_id = ? AND er.event_id = ?
     LIMIT 1`,
    [registration_id, eventId]
  );
  const record = rows[0];

  if (!record) {
    req.session.flash = { type: "error", text: "Record attendance (check-in) before check-out." };
    return res.redirect(attendancePath);
  }
  if (record.attendance_status !== "Attended" || !record.check_in_time) {
    req.session.flash = { type: "error", text: "Check-out is only allowed after an Attended check-in." };
    return res.redirect(attendancePath);
  }
  if (record.check_out_time) {
    req.session.flash = { type: "error", text: "Check-out has already been recorded for this registration." };
    return res.redirect(attendancePath);
  }

  // Feature 6 — on check-out, store Volunteer hours from check-in duration.
  // Participant hours remain 0. Does not change attendance status decisions.
  const [result] = await pool.query(
    `UPDATE attendance a
     INNER JOIN event_registrations er ON er.registration_id = a.registration_id
     SET a.check_out_time = NOW(),
         a.volunteer_hours = CASE
           WHEN er.participation_type = 'Volunteer' AND a.attendance_status = 'Attended'
           THEN ROUND(GREATEST(TIMESTAMPDIFF(MINUTE, a.check_in_time, NOW()), 0) / 60, 2)
           ELSE 0
         END
     WHERE a.attendance_id = ?
       AND a.check_out_time IS NULL
       AND a.check_in_time IS NOT NULL
       AND NOW() >= a.check_in_time`,
    [record.attendance_id]
  );

  if (!result.affectedRows) {
    req.session.flash = { type: "error", text: "Check-out could not be recorded (check-out cannot precede check-in)." };
    return res.redirect(attendancePath);
  }

  res.redirect(attendancePath);
});

// POST /organiser/events/:id/attendance/undo
// User action  -> organiser clicks "Undo" next to a recorded attendance row
// Route        -> confirms ownership, then deletes the attendance record so
//                 the registration reverts to "Pending" (no attendance row)
// SQL          -> DELETE attendance row joined to this event's registrations
// DB           -> attendance, event_registrations, events
app.post("/organiser/events/:id/attendance/undo", isOrganiser, async function (req, res) {
  const eventId = req.params.id;
  const attendancePath = "/organiser/events/" + eventId + "/attendance";

  const [eventRows] = await pool.query(
    "SELECT event_id, organiser_id FROM events WHERE event_id = ?",
    [eventId]
  );
  const event = eventRows[0];

  if (!event) {
    return res.status(404).send("Event not found.");
  }
  if (Number(event.organiser_id) !== Number(req.session.user.user_id)) {
    return res.status(403).send("You do not have permission to manage this event.");
  }

  const registration_id = parseInt(req.body.registration_id, 10);
  if (!Number.isInteger(registration_id) || registration_id < 1) {
    req.session.flash = { type: "error", text: "Select a valid registration." };
    return res.redirect(attendancePath);
  }

  await pool.query(
    `DELETE a FROM attendance a
     INNER JOIN event_registrations er ON er.registration_id = a.registration_id
     WHERE a.registration_id = ? AND er.event_id = ?`,
    [registration_id, eventId]
  );

  res.redirect(attendancePath);
});

// ---------- Admin routes (MySQL) ----------
// GET /admin/users lives in routes/adminUserRoutes.js
app.get("/admin/dashboard", requireAdmin, adminController.dashboard);
app.get("/admin/categories", requireAdmin, adminController.categories);
app.post("/admin/categories", requireAdmin, adminController.createCategory);
app.post("/admin/categories/:id/edit", requireAdmin, adminController.updateCategory);
app.post("/admin/categories/:id/delete", requireAdmin, adminController.deleteCategory);
app.get("/admin/reports", requireAdmin, adminController.reports);

async function startServer() {
  try {
    await pool.query("SELECT 1 AS connection_test");
    console.log("Connected to CommunityConnect MySQL database");

    app.listen(PORT, function () {
      console.log("CommunityConnect running at http://localhost:" + PORT);
    });
  } catch (err) {
    console.error("Database connection failed. CommunityConnect could not start.");
    console.error(err.message);
    process.exit(1);
  }
}

startServer();
