// Feature 5 — Volunteer Assignment and Attendance Management
// Routes for creating volunteer roles on an event, and assigning
// confirmed volunteers to those roles.
//
// This router is mounted flatly in app.js (app.use(rolesRoutes), no path
// prefix, no mergeParams) — every route below spells out its full path
// and reads :eventId / :roleId directly from its own route pattern.
const express = require("express");
const router = express.Router();
const db = require("../config/database");
const { isOrganiser } = require("../middleware/auth");
const { toViewUser } = require("../lib/userDisplay");

// Loads a volunteer role together with its parent event, and confirms the
// logged-in organiser owns that event. Joining on both role_id AND event_id
// also stops an organiser guessing a roleId that belongs to someone else's
// event (IDOR). Returns null if the role doesn't exist or isn't theirs.
async function loadOwnedRole(eventId, roleId, organiserId) {
  const [rows] = await db.query(
    `SELECT vr.role_id, vr.role_name, vr.description, vr.required_volunteers,
            vr.event_id, ev.event_name, ev.organiser_id
     FROM volunteer_roles vr
     JOIN events ev ON ev.event_id = vr.event_id
     WHERE vr.role_id = ? AND vr.event_id = ?`,
    [roleId, eventId]
  );
  const role = rows[0];
  if (!role || Number(role.organiser_id) !== Number(organiserId)) {
    return null;
  }
  return role;
}

// Gathers everything the assign-volunteers page needs to display:
// how many spaces are filled, who already holds them, and who is still
// eligible to be assigned.
//
// "Eligible" means: a Confirmed registration for this event that does not
// already hold ANY assignment. volunteer_assignments.registration_id is
// UNIQUE in the schema — a volunteer can only be assigned to one role per
// event — so someone already assigned to a different role must NOT appear
// here (offering them would just fail with a duplicate-key error on submit).
async function loadAssignmentData(eventId, roleId) {
  const [[{ count: assignedCount }]] = await db.query(
    "SELECT COUNT(*) AS count FROM volunteer_assignments WHERE role_id = ?",
    [roleId]
  );

  const [assigned] = await db.query(
    `SELECT er.registration_id, u.user_id, u.name, u.email
     FROM volunteer_assignments va
     JOIN event_registrations er ON er.registration_id = va.registration_id
     JOIN users u ON u.user_id = er.user_id
     WHERE va.role_id = ?
     ORDER BY u.name ASC`,
    [roleId]
  );

  const [eligible] = await db.query(
    `SELECT er.registration_id, u.user_id, u.name, u.email
     FROM event_registrations er
     JOIN users u ON u.user_id = er.user_id
     LEFT JOIN volunteer_assignments va ON va.registration_id = er.registration_id
     WHERE er.event_id = ?
       AND er.participation_type = 'Volunteer'
       AND er.status = 'Confirmed'
       AND va.assignment_id IS NULL
     ORDER BY u.name ASC`,
    [eventId]
  );

  return { assignedCount: assignedCount, assigned: assigned, eligible: eligible };
}

// GET /organiser/events/:id/roles/new
// User action  -> organiser clicks "Add role" on the role-assignment page
// Route        -> loads the parent event so the form can show its name
// SQL          -> SELECT the event by id
// DB           -> community_event_manager.events
// Response     -> renders the create-role form, or 404 if the event is missing
router.get("/organiser/events/:id/roles/new", isOrganiser, async function (req, res) {
  const eventId = req.params.id;

  const [rows] = await db.query(
    "SELECT event_id, event_name, organiser_id FROM events WHERE event_id = ?",
    [eventId]
  );
  const event = rows[0];

  if (!event) {
    return res.status(404).send("Event not found.");
  }
  // Ownership check — an organiser may only manage roles on their own events.
  if (Number(event.organiser_id) !== Number(req.session.user.user_id)) {
    return res.status(403).send("You do not have permission to manage this event.");
  }

  res.render("organiser/role-form", {
    layout: "app",
    role: "organiser",
    activeNav: "roles",
    pageTitle: "Add Volunteer Role · Organiser",
    currentUser: toViewUser(req.session.user),
    navEventId: event.event_id,
    event: event,
    formMode: "create",
    role_id: null,
    role_name: "",
    description: "",
    required_volunteers: "",
    messages: [],
  });
});

// POST /organiser/events/:id/roles
// User action  -> organiser submits the create-role form
// Route        -> validates the input on the server
// SQL          -> INSERT the new row into volunteer_roles (parameterised query)
// DB           -> community_event_manager.volunteer_roles
// Response     -> redirect back to the role-assignment page on success,
//                 or re-render the form with error messages on failure
router.post("/organiser/events/:id/roles", isOrganiser, async function (req, res) {
  const eventId = req.params.id;
  const role_name = (req.body.role_name || "").trim();
  const description = (req.body.description || "").trim();
  const required_volunteers = parseInt(req.body.required_volunteers, 10);

  const [eventRows] = await db.query(
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

  // Server-side validation — never trust the browser alone.
  const errors = [];
  if (!role_name) {
    errors.push("Role name is required.");
  } else if (role_name.length > 100) {
    errors.push("Role name must be 100 characters or fewer.");
  }
  if (!Number.isInteger(required_volunteers) || required_volunteers < 1) {
    errors.push("Required volunteers must be a whole number of 1 or more.");
  }

  if (errors.length) {
    return res.render("organiser/role-form", {
      layout: "app",
      role: "organiser",
      activeNav: "roles",
      pageTitle: "Add Volunteer Role · Organiser",
      currentUser: toViewUser(req.session.user),
      navEventId: event.event_id,
      event: event,
      formMode: "create",
      role_id: null,
      role_name: role_name,
      description: description,
      required_volunteers: req.body.required_volunteers,
      messages: errors.map(function (text) { return { type: "error", text: text }; }),
    });
  }

  try {
    await db.query(
      "INSERT INTO volunteer_roles (event_id, role_name, description, required_volunteers) VALUES (?, ?, ?, ?)",
      [eventId, role_name, description || null, required_volunteers]
    );
  } catch (err) {
    // ER_DUP_ENTRY -> the (event_id, role_name) unique constraint was hit.
    const friendlyMessage = err.code === "ER_DUP_ENTRY"
      ? "A role with that name already exists for this event."
      : "Something went wrong while saving the role. Please try again.";

    return res.render("organiser/role-form", {
      layout: "app",
      role: "organiser",
      activeNav: "roles",
      pageTitle: "Add Volunteer Role · Organiser",
      currentUser: toViewUser(req.session.user),
      navEventId: event.event_id,
      event: event,
      formMode: "create",
      role_id: null,
      role_name: role_name,
      description: description,
      required_volunteers: req.body.required_volunteers,
      messages: [{ type: "error", text: friendlyMessage }],
    });
  }

  res.redirect("/organiser/events/" + eventId + "/roles");
});

// GET /organiser/events/:eventId/volunteers
// User action  -> organiser clicks an event to see everyone registered as a Volunteer
// Route        -> confirms the organiser owns the event, then loads every Volunteer
//                 registration for it together with their assigned role (if any)
// SQL          -> SELECT joining event_registrations, users, volunteer_assignments
//                 and volunteer_roles, filtered to participation_type = 'Volunteer'
// DB           -> event_registrations, users, volunteer_assignments, volunteer_roles
// Response     -> renders the volunteer list, or an empty state if none are registered
router.get("/organiser/events/:eventId/volunteers", isOrganiser, async function (req, res) {
  const eventId = req.params.eventId;

  const [eventRows] = await db.query(
    "SELECT event_id, event_name, organiser_id FROM events WHERE event_id = ?",
    [eventId]
  );
  const event = eventRows[0];

  if (!event) {
    return res.status(404).send("Event not found.");
  }
  if (Number(event.organiser_id) !== Number(req.session.user.user_id)) {
    return res.status(403).send("You do not have permission to view this event.");
  }

  const [volunteers] = await db.query(
    `SELECT er.registration_id,
            u.name AS volunteer_name,
            u.email,
            er.status AS registration_status,
            vr.role_name AS assigned_role_name
     FROM event_registrations er
     JOIN users u ON u.user_id = er.user_id
     LEFT JOIN volunteer_assignments va ON va.registration_id = er.registration_id
     LEFT JOIN volunteer_roles vr ON vr.role_id = va.role_id
     WHERE er.event_id = ? AND er.participation_type = 'Volunteer'
     ORDER BY u.name ASC`,
    [eventId]
  );

  res.render("organiser/volunteer-list", {
    layout: "app",
    role: "organiser",
    activeNav: "roles",
    pageTitle: "Event Volunteers · Organiser",
    currentUser: toViewUser(req.session.user),
    navEventId: event.event_id,
    event: event,
    volunteers: volunteers,
    messages: [],
  });
});

// GET /organiser/events/:eventId/roles/:roleId/assign
// User action  -> organiser opens the "Assign volunteers" page for one role
// Route        -> confirms ownership, then loads role + assigned + eligible lists
// SQL          -> SELECT joins across volunteer_roles/events, volunteer_assignments,
//                 event_registrations and users
// DB           -> volunteer_roles, volunteer_assignments, event_registrations, users
// Response     -> renders the assign-volunteers form
router.get("/organiser/events/:eventId/roles/:roleId/assign", isOrganiser, async function (req, res) {
  const eventId = req.params.eventId;
  const roleId = req.params.roleId;

  const volunteerRole = await loadOwnedRole(eventId, roleId, req.session.user.user_id);
  if (!volunteerRole) {
    return res.status(404).send("Role not found.");
  }

  const data = await loadAssignmentData(eventId, roleId);

  res.render("organiser/assign-volunteers", {
    layout: "app",
    role: "organiser",
    activeNav: "roles",
    pageTitle: "Assign Volunteers · Organiser",
    currentUser: toViewUser(req.session.user),
    navEventId: Number(eventId),
    volunteerRole: volunteerRole,
    assignedCount: data.assignedCount,
    assigned: data.assigned,
    eligible: data.eligible,
    messages: [],
  });
});

// POST /organiser/events/:eventId/roles/:roleId/assign
// User action  -> organiser ticks one or more eligible volunteers and submits
// Route        -> re-validates ownership, capacity and eligibility on the server
// SQL          -> INSERT into volunteer_assignments inside a transaction
// DB           -> volunteer_assignments
// Response     -> redirect back to the same page on success (updated counts show
//                 automatically), or re-render with an error message on failure
router.post("/organiser/events/:eventId/roles/:roleId/assign", isOrganiser, async function (req, res) {
  const eventId = req.params.eventId;
  const roleId = req.params.roleId;
  const organiserId = req.session.user.user_id;

  const volunteerRole = await loadOwnedRole(eventId, roleId, organiserId);
  if (!volunteerRole) {
    return res.status(404).send("Role not found.");
  }

  // A single checked checkbox submits as a plain string, not an array —
  // normalise so the rest of the code can always treat this as a list.
  let selectedIds = req.body.registration_ids;
  if (!selectedIds) {
    selectedIds = [];
  } else if (!Array.isArray(selectedIds)) {
    selectedIds = [selectedIds];
  }

  async function renderWithError(message) {
    const data = await loadAssignmentData(eventId, roleId);
    res.render("organiser/assign-volunteers", {
      layout: "app",
      role: "organiser",
      activeNav: "roles",
      pageTitle: "Assign Volunteers · Organiser",
      currentUser: toViewUser(req.session.user),
      navEventId: Number(eventId),
      volunteerRole: volunteerRole,
      assignedCount: data.assignedCount,
      assigned: data.assigned,
      eligible: data.eligible,
      messages: [{ type: "error", text: message }],
    });
  }

  if (selectedIds.length === 0) {
    return renderWithError("Select at least one volunteer to assign.");
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the current assignment rows for this role so two organisers
    // assigning at the same time can't both fill the last remaining space.
    const [[{ count: assignedCount }]] = await conn.query(
      "SELECT COUNT(*) AS count FROM volunteer_assignments WHERE role_id = ? FOR UPDATE",
      [roleId]
    );

    // Re-check eligibility server-side rather than trusting the submitted
    // checkboxes: must belong to this event, be Confirmed, and hold no
    // assignment yet (volunteer_assignments.registration_id is UNIQUE).
    const [validRows] = await conn.query(
      `SELECT er.registration_id
       FROM event_registrations er
       LEFT JOIN volunteer_assignments va ON va.registration_id = er.registration_id
       WHERE er.event_id = ?
         AND er.participation_type = 'Volunteer'
         AND er.status = 'Confirmed'
         AND va.assignment_id IS NULL
         AND er.registration_id IN (?)`,
      [eventId, selectedIds]
    );
    const validIds = validRows.map(function (r) { return r.registration_id; });

    if (validIds.length === 0) {
      await conn.rollback();
      return renderWithError("The selected volunteer(s) are no longer eligible for this role.");
    }

    if (assignedCount + validIds.length > volunteerRole.required_volunteers) {
      await conn.rollback();
      return renderWithError(
        "Only " + (volunteerRole.required_volunteers - assignedCount) + " space(s) left in this role."
      );
    }

    for (const registrationId of validIds) {
      await conn.query(
        "INSERT INTO volunteer_assignments (registration_id, role_id, assigned_by) VALUES (?, ?, ?)",
        [registrationId, roleId, organiserId]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error("Error assigning volunteers:", err);
    return renderWithError("Something went wrong while assigning volunteers. Please try again.");
  } finally {
    conn.release();
  }

  res.redirect("/organiser/events/" + eventId + "/roles/" + roleId + "/assign");
});

// POST /organiser/events/:eventId/roles/:roleId/unassign
// Removes one assignment so a role can be edited/deleted safely, or a volunteer
// reassigned. Ownership via session + loadOwnedRole (no organiser_id form field).
router.post("/organiser/events/:eventId/roles/:roleId/unassign", isOrganiser, async function (req, res) {
  const eventId = req.params.eventId;
  const roleId = req.params.roleId;
  const volunteerRole = await loadOwnedRole(eventId, roleId, req.session.user.user_id);
  if (!volunteerRole) {
    return res.status(404).send("Role not found.");
  }

  const registration_id = parseInt(req.body.registration_id, 10);
  if (!Number.isInteger(registration_id) || registration_id < 1) {
    req.session.flash = { type: "error", text: "Select a valid volunteer to unassign." };
    return res.redirect("/organiser/events/" + eventId + "/roles/" + roleId + "/assign");
  }

  const [result] = await db.query(
    `DELETE va FROM volunteer_assignments va
     INNER JOIN event_registrations er ON er.registration_id = va.registration_id
     WHERE va.role_id = ? AND va.registration_id = ? AND er.event_id = ?`,
    [roleId, registration_id, eventId]
  );

  if (!result.affectedRows) {
    req.session.flash = { type: "error", text: "That volunteer is not assigned to this role." };
  }

  res.redirect("/organiser/events/" + eventId + "/roles/" + roleId + "/assign");
});

// GET /organiser/events/:eventId/roles/:roleId/edit
router.get("/organiser/events/:eventId/roles/:roleId/edit", isOrganiser, async function (req, res) {
  const eventId = req.params.eventId;
  const roleId = req.params.roleId;
  const volunteerRole = await loadOwnedRole(eventId, roleId, req.session.user.user_id);
  if (!volunteerRole) {
    return res.status(404).send("Role not found.");
  }

  res.render("organiser/role-form", {
    layout: "app",
    role: "organiser",
    activeNav: "roles",
    pageTitle: "Edit Volunteer Role · Organiser",
    currentUser: toViewUser(req.session.user),
    navEventId: Number(eventId),
    event: {
      event_id: volunteerRole.event_id,
      event_name: volunteerRole.event_name
    },
    formMode: "edit",
    role_id: volunteerRole.role_id,
    role_name: volunteerRole.role_name,
    description: volunteerRole.description || "",
    required_volunteers: volunteerRole.required_volunteers,
    messages: []
  });
});

// POST /organiser/events/:eventId/roles/:roleId/edit
router.post("/organiser/events/:eventId/roles/:roleId/edit", isOrganiser, async function (req, res) {
  const eventId = req.params.eventId;
  const roleId = req.params.roleId;
  const volunteerRole = await loadOwnedRole(eventId, roleId, req.session.user.user_id);
  if (!volunteerRole) {
    return res.status(404).send("Role not found.");
  }

  const role_name = (req.body.role_name || "").trim();
  const description = (req.body.description || "").trim();
  const required_volunteers = parseInt(req.body.required_volunteers, 10);

  const errors = [];
  if (!role_name) {
    errors.push("Role name is required.");
  } else if (role_name.length > 100) {
    errors.push("Role name must be 100 characters or fewer.");
  }
  if (!Number.isInteger(required_volunteers) || required_volunteers < 1) {
    errors.push("Required volunteers must be a whole number of 1 or more.");
  }

  const [[{ assignedCount }]] = await db.query(
    "SELECT COUNT(*) AS assignedCount FROM volunteer_assignments WHERE role_id = ?",
    [roleId]
  );
  if (Number.isInteger(required_volunteers) && required_volunteers < Number(assignedCount)) {
    errors.push("Volunteers needed cannot be below the " + assignedCount + " already assigned.");
  }

  function renderEdit(messages) {
    return res.status(400).render("organiser/role-form", {
      layout: "app",
      role: "organiser",
      activeNav: "roles",
      pageTitle: "Edit Volunteer Role · Organiser",
      currentUser: toViewUser(req.session.user),
      navEventId: Number(eventId),
      event: {
        event_id: volunteerRole.event_id,
        event_name: volunteerRole.event_name
      },
      formMode: "edit",
      role_id: volunteerRole.role_id,
      role_name: role_name,
      description: description,
      required_volunteers: req.body.required_volunteers,
      messages: messages
    });
  }

  if (errors.length) {
    return renderEdit(errors.map(function (text) { return { type: "error", text: text }; }));
  }

  try {
    await db.query(
      `UPDATE volunteer_roles
       SET role_name = ?, description = ?, required_volunteers = ?
       WHERE role_id = ? AND event_id = ?`,
      [role_name, description || null, required_volunteers, roleId, eventId]
    );
  } catch (err) {
    const friendlyMessage = err.code === "ER_DUP_ENTRY"
      ? "A role with that name already exists for this event."
      : "Something went wrong while saving the role. Please try again.";
    return renderEdit([{ type: "error", text: friendlyMessage }]);
  }

  res.redirect("/organiser/events/" + eventId + "/roles");
});

// POST /organiser/events/:eventId/roles/:roleId/delete
router.post("/organiser/events/:eventId/roles/:roleId/delete", isOrganiser, async function (req, res) {
  const eventId = req.params.eventId;
  const roleId = req.params.roleId;
  const volunteerRole = await loadOwnedRole(eventId, roleId, req.session.user.user_id);
  if (!volunteerRole) {
    return res.status(404).send("Role not found.");
  }

  const [[{ assignedCount }]] = await db.query(
    "SELECT COUNT(*) AS assignedCount FROM volunteer_assignments WHERE role_id = ?",
    [roleId]
  );

  // Safe delete: refuse while volunteers are still assigned (avoid silent CASCADE surprise).
  if (Number(assignedCount) > 0) {
    req.session.flash = {
      type: "error",
      text: "This role still has " + assignedCount + " assigned volunteer(s). Unassign them before deleting the role."
    };
    return res.redirect("/organiser/events/" + eventId + "/roles");
  }

  await db.query(
    "DELETE FROM volunteer_roles WHERE role_id = ? AND event_id = ?",
    [roleId, eventId]
  );

  res.redirect("/organiser/events/" + eventId + "/roles");
});

module.exports = router;
