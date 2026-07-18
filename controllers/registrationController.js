const pool = require("../config/database");
const notifications = require("../lib/notifications");
const notificationEmails = require("../services/notificationEmailService");

const ALLOWED_PARTICIPATION_TYPES = ["Participant", "Volunteer"];
const NOTES_MAX_LENGTH = 500;

function flash(req, type, text) {
  if (!req.session) {
    req._flashFallback = { type: type, text: text };
    return;
  }
  req.session.flash = { type: type, text: text };
}

function takeFlash(req) {
  if (req.session && req.session.flash) {
    const message = req.session.flash;
    delete req.session.flash;
    return [message];
  }
  if (req._flashFallback) {
    const message = req._flashFallback;
    delete req._flashFallback;
    return [message];
  }
  return [];
}

function initialsFromName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "CM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function firstNameFromName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[0] : "Member";
}

function memberViewUser(user) {
  return {
    name: user.name,
    firstName: firstNameFromName(user.name),
    initials: initialsFromName(user.name),
    role: "Community member",
    email: user.email,
    avatarBg: "#D99E2B"
  };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateChip(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return { month: "", day: "", when: "", dateLabel: "" };
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    month: months[d.getMonth()],
    day: pad2(d.getDate()),
    dateLabel: weekdays[d.getDay()] + " " + pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear(),
    timePart: pad2(d.getHours()) + ":" + pad2(d.getMinutes())
  };
}

function statusTone(status) {
  if (status === "Waitlisted") return "amber";
  if (status === "Cancelled") return "grey";
  return "green";
}

function statusBadge(status, waitingPosition) {
  if (status === "Waitlisted" && waitingPosition) {
    return "Waitlist #" + waitingPosition;
  }
  return status;
}

function badgeColors(tone) {
  if (tone === "amber") return { badgeBg: "#FBF3DF", badgeFg: "#8A5E08" };
  if (tone === "grey") return { badgeBg: "#EDEAE0", badgeFg: "#6E7266" };
  return { badgeBg: "#E7F2EA", badgeFg: "#1E4D33" };
}

function capacityForType(eventRow, participationType) {
  if (participationType === "Volunteer") {
    return Number(eventRow.volunteer_capacity) || 0;
  }
  return Number(eventRow.participant_capacity) || 0;
}

async function countConfirmed(connection, eventId, participationType) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM event_registrations
     WHERE event_id = ?
       AND participation_type = ?
       AND status = 'Confirmed'`,
    [eventId, participationType]
  );
  return Number(rows[0].total) || 0;
}

async function nextWaitingPosition(connection, eventId, participationType) {
  const [rows] = await connection.query(
    `SELECT COALESCE(MAX(waiting_position), 0) + 1 AS next_position
     FROM event_registrations
     WHERE event_id = ?
       AND participation_type = ?
       AND status = 'Waitlisted'`,
    [eventId, participationType]
  );
  return Number(rows[0].next_position) || 1;
}

/**
 * Recalculate waiting positions for one event + participation type.
 * Must run inside an open transaction on the provided connection.
 */
async function recalculateWaitingPositions(connection, eventId, participationType) {
  const [rows] = await connection.query(
    `SELECT registration_id
     FROM event_registrations
     WHERE event_id = ?
       AND participation_type = ?
       AND status = 'Waitlisted'
     ORDER BY
       waiting_position ASC,
       registered_at ASC,
       registration_id ASC
     FOR UPDATE`,
    [eventId, participationType]
  );

  for (let i = 0; i < rows.length; i += 1) {
    await connection.query(
      `UPDATE event_registrations
       SET waiting_position = ?, updated_at = CURRENT_TIMESTAMP
       WHERE registration_id = ?`,
      [i + 1, rows[i].registration_id]
    );
  }
}

async function validateVolunteerRole(connection, eventId, volunteerRoleId) {
  if (volunteerRoleId === null || volunteerRoleId === undefined || volunteerRoleId === "") {
    return { ok: true, preferredRoleId: null };
  }

  const roleId = Number(volunteerRoleId);
  if (!Number.isInteger(roleId) || roleId <= 0) {
    return { ok: false, message: "Please choose a valid volunteer role for this event." };
  }

  const [rows] = await connection.query(
    `SELECT role_id
     FROM volunteer_roles
     WHERE role_id = ? AND event_id = ?
     LIMIT 1`,
    [roleId, eventId]
  );

  if (!rows.length) {
    return { ok: false, message: "That volunteer role does not belong to this event." };
  }

  return { ok: true, preferredRoleId: roleId };
}

function registrationResultMessage(participationType, status, waitingPosition, reactivated) {
  const prefix = reactivated
    ? "Your cancelled registration has been reactivated. "
    : "";

  if (status === "Confirmed") {
    return prefix + "Registration confirmed.";
  }

  if (participationType === "Volunteer") {
    return prefix
      + "Volunteer capacity is full. You are on the volunteer waiting list at position "
      + waitingPosition
      + ".";
  }

  return prefix
    + "Participant capacity is full. You are on the participant waiting list at position "
    + waitingPosition
    + ".";
}

async function registerForEvent(req, res) {
  const user = req.currentUser;
  const eventId = Number(req.params.id);
  let participationType = String(req.body.participation_type || "").trim();
  let notes = String(req.body.notes || "").trim();
  const volunteerRoleIdRaw = req.body.volunteer_role_id;

  if (!Number.isInteger(eventId) || eventId <= 0) {
    flash(req, "error", "That event could not be found.");
    return res.redirect("/events");
  }

  if (ALLOWED_PARTICIPATION_TYPES.indexOf(participationType) === -1) {
    flash(req, "error", "Please choose Participant or Volunteer.");
    return res.redirect("/events/" + eventId);
  }

  if (notes.length > NOTES_MAX_LENGTH) {
    notes = notes.slice(0, NOTES_MAX_LENGTH);
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [eventRows] = await connection.query(
      `SELECT event_id, event_name, location, participant_capacity, volunteer_capacity,
              registration_deadline, start_datetime, status
       FROM events
       WHERE event_id = ?
       FOR UPDATE`,
      [eventId]
    );

    if (!eventRows.length) {
      await connection.rollback();
      flash(req, "error", "That event could not be found.");
      return res.redirect("/events");
    }

    const eventRow = eventRows[0];
    const now = new Date();

    if (eventRow.status !== "Open" && eventRow.status !== "Full") {
      await connection.rollback();
      flash(req, "error", "Registration for this event has closed.");
      return res.redirect("/events/" + eventId);
    }

    if (eventRow.registration_deadline && new Date(eventRow.registration_deadline) < now) {
      await connection.rollback();
      flash(req, "error", "Registration for this event has closed.");
      return res.redirect("/events/" + eventId);
    }

    if (eventRow.start_datetime && new Date(eventRow.start_datetime) <= now) {
      await connection.rollback();
      flash(req, "error", "Registration for this event has closed.");
      return res.redirect("/events/" + eventId);
    }

    let preferredRoleId = null;
    if (participationType === "Participant") {
      preferredRoleId = null;
    } else {
      const roleCheck = await validateVolunteerRole(connection, eventId, volunteerRoleIdRaw);
      if (!roleCheck.ok) {
        await connection.rollback();
        flash(req, "error", roleCheck.message);
        return res.redirect("/events/" + eventId);
      }
      preferredRoleId = roleCheck.preferredRoleId;
    }

    const [existingRows] = await connection.query(
      `SELECT registration_id, status, participation_type, waiting_position
       FROM event_registrations
       WHERE event_id = ? AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [eventId, user.user_id]
    );

    const existing = existingRows[0] || null;

    if (existing) {
      if (existing.status === "Confirmed") {
        await connection.rollback();
        flash(req, "error", "You are already confirmed for this event.");
        return res.redirect("/member/registrations");
      }
      if (existing.status === "Waitlisted") {
        await connection.rollback();
        flash(req, "error", "You are already on the waiting list for this event.");
        return res.redirect("/member/registrations");
      }
      if (existing.status === "Attended" || existing.status === "Absent") {
        await connection.rollback();
        flash(req, "error", "You already have a completed registration record for this event.");
        return res.redirect("/member/registrations");
      }
    }

    const confirmedCount = await countConfirmed(connection, eventId, participationType);
    const capacity = capacityForType(eventRow, participationType);
    const hasSpace = confirmedCount < capacity;

    let newStatus = "Confirmed";
    let waitingPosition = null;
    if (!hasSpace) {
      newStatus = "Waitlisted";
      waitingPosition = await nextWaitingPosition(connection, eventId, participationType);
    }

    let reactivated = false;

    if (existing && existing.status === "Cancelled") {
      reactivated = true;
      await connection.query(
        `UPDATE event_registrations
         SET participation_type = ?,
             preferred_role_id = ?,
             notes = ?,
             status = ?,
             waiting_position = ?,
             cancelled_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE registration_id = ?`,
        [
          participationType,
          preferredRoleId,
          notes || null,
          newStatus,
          waitingPosition,
          existing.registration_id
        ]
      );
    } else {
      await connection.query(
        `INSERT INTO event_registrations (
           event_id,
           user_id,
           participation_type,
           preferred_role_id,
           notes,
           status,
           waiting_position
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          user.user_id,
          participationType,
          preferredRoleId,
          notes || null,
          newStatus,
          waitingPosition
        ]
      );
    }

    await connection.commit();

    // Feature 6 — notify after successful registration (does not change capacity decision).
    try {
      const eventName = eventRow.event_name || "the event";
      let roleName = null;
      if (participationType === "Volunteer" && preferredRoleId) {
        const [[roleRow]] = await pool.query(
          "SELECT role_name FROM volunteer_roles WHERE role_id = ? LIMIT 1",
          [preferredRoleId]
        );
        roleName = roleRow ? roleRow.role_name : null;
      }

      if (newStatus === "Confirmed") {
        await notifications.createNotification({
          userId: user.user_id,
          eventId: eventId,
          title: participationType + " place confirmed",
          message: "Your " + participationType + " place for " + eventName + " is confirmed.",
          type: "Registration"
        });
        await notificationEmails.sendRegistrationConfirmedEmail({
          email: user.email,
          name: user.name,
          eventName: eventName,
          startDatetime: eventRow.start_datetime,
          location: eventRow.location,
          participationType: participationType,
          roleName: roleName
        });
      } else if (newStatus === "Waitlisted") {
        await notifications.createNotification({
          userId: user.user_id,
          eventId: eventId,
          title: participationType + " waiting list",
          message: "You are #" + waitingPosition + " on the " + participationType
            + " waiting list for " + eventName + ".",
          type: "WaitingList"
        });
        await notificationEmails.sendRegistrationWaitlistedEmail({
          email: user.email,
          name: user.name,
          eventName: eventName,
          startDatetime: eventRow.start_datetime,
          location: eventRow.location,
          participationType: participationType,
          waitingPosition: waitingPosition
        });
      }
    } catch (notifyErr) {
      console.error("Registration notification failed:", notifyErr.message);
    }

    flash(
      req,
      newStatus === "Confirmed" ? "success" : "warning",
      registrationResultMessage(participationType, newStatus, waitingPosition, reactivated)
    );
    return res.redirect("/member/registrations");
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("Registration rollback failed:", rollbackErr.message);
      }
    }
    console.error("registerForEvent failed:", err.message);
    flash(req, "error", "We could not complete your registration. Please try again.");
    return res.redirect("/events/" + eventId);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function listMyRegistrations(req, res) {
  const user = req.currentUser;
  const tab = req.query.tab || "Confirmed";
  const tabs = ["Confirmed", "Waitlisted", "Cancelled", "Attended"];
  const activeTab = tabs.indexOf(tab) !== -1 ? tab : "Confirmed";

  try {
    const [allRows] = await pool.query(
      `SELECT
         r.registration_id,
         r.event_id,
         r.participation_type,
         r.preferred_role_id,
         r.notes,
         r.status,
         r.waiting_position,
         r.registered_at,
         e.event_name,
         e.start_datetime,
         e.end_datetime,
         e.location,
         c.category_name,
         vr.role_name AS volunteer_role_name
       FROM event_registrations r
       INNER JOIN events e ON e.event_id = r.event_id
       INNER JOIN event_categories c ON c.category_id = e.category_id
       LEFT JOIN volunteer_roles vr ON vr.role_id = r.preferred_role_id
       WHERE r.user_id = ?
       ORDER BY e.start_datetime ASC, r.registered_at ASC`,
      [user.user_id]
    );

    const now = new Date();
    const tabCounts = {
      Confirmed: 0,
      Waitlisted: 0,
      Cancelled: 0,
      Attended: 0
    };

    const formatted = allRows.map(function (row) {
      if (row.status === "Attended" || row.status === "Absent") {
        tabCounts.Attended += 1;
      } else if (Object.prototype.hasOwnProperty.call(tabCounts, row.status)) {
        tabCounts[row.status] += 1;
      }

      const start = formatDateChip(row.start_datetime);
      const end = formatDateChip(row.end_datetime);
      const tone = statusTone(row.status);
      const colors = badgeColors(tone);
      const eventStarted = row.start_datetime && new Date(row.start_datetime) <= now;
      const cancellable = (row.status === "Confirmed" || row.status === "Waitlisted") && !eventStarted;

      let meta = start.dateLabel
        + " · "
        + start.timePart
        + "–"
        + end.timePart
        + " · "
        + row.location
        + " · "
        + row.category_name;

      if (row.participation_type === "Volunteer" && row.volunteer_role_name) {
        meta += " · Role: " + row.volunteer_role_name;
      }

      const registeredChip = formatDateChip(row.registered_at);
      const registeredLabel = registeredChip.dateLabel
        ? registeredChip.dateLabel + " " + registeredChip.timePart
        : "";

      return Object.assign({
        registration_id: row.registration_id,
        eventId: row.event_id,
        name: row.event_name,
        participation_type: row.participation_type,
        meta: meta,
        month: start.month,
        day: start.day,
        badge: statusBadge(row.status, row.waiting_position),
        tone: tone,
        cancellable: cancellable,
        waiting_position: row.waiting_position,
        note: row.notes || "",
        registered_at: row.registered_at,
        registered_label: registeredLabel,
        status: row.status,
        volunteer_role_name: row.volunteer_role_name || null
      }, colors);
    });

    let rows;
    if (activeTab === "Attended") {
      rows = formatted.filter(function (r) {
        return r.status === "Attended" || r.status === "Absent";
      });
    } else {
      rows = formatted.filter(function (r) {
        return r.status === activeTab;
      });
    }

    res.render("member/my-registrations", {
      layout: "app",
      role: "member",
      activeNav: "registrations",
      pageTitle: "My Registrations · Community member",
      currentUser: memberViewUser(user),
      tabs: tabs,
      activeTab: activeTab,
      tabCounts: tabCounts,
      rows: rows,
      messages: takeFlash(req)
    });
  } catch (err) {
    console.error("listMyRegistrations failed:", err.message);
    res.status(500).render("error", {
      layout: "public",
      activeNav: "",
      pageTitle: "Something went wrong · CommunityConnect SG",
      currentUser: null,
      messages: [],
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load your registrations. Please try again shortly."
    });
  }
}

async function cancelRegistration(req, res) {
  const user = req.currentUser;
  const registrationId = Number(req.params.id);

  if (!Number.isInteger(registrationId) || registrationId <= 0) {
    flash(req, "error", "You are not allowed to cancel this registration.");
    return res.redirect("/member/registrations");
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT
         r.registration_id,
         r.event_id,
         r.user_id,
         r.participation_type,
         r.status,
         e.start_datetime
       FROM event_registrations r
       INNER JOIN events e ON e.event_id = r.event_id
       WHERE r.registration_id = ?
       LIMIT 1
       FOR UPDATE`,
      [registrationId]
    );

    if (!rows.length) {
      await connection.rollback();
      flash(req, "error", "You are not allowed to cancel this registration.");
      return res.redirect("/member/registrations");
    }

    const registration = rows[0];

    if (Number(registration.user_id) !== Number(user.user_id)) {
      await connection.rollback();
      flash(req, "error", "You are not allowed to cancel this registration.");
      return res.redirect("/member/registrations");
    }

    if (registration.status === "Cancelled") {
      await connection.rollback();
      flash(req, "error", "You are not allowed to cancel this registration.");
      return res.redirect("/member/registrations");
    }

    if (registration.status === "Attended" || registration.status === "Absent") {
      await connection.rollback();
      flash(req, "error", "You are not allowed to cancel this registration.");
      return res.redirect("/member/registrations");
    }

    if (registration.start_datetime && new Date(registration.start_datetime) <= new Date()) {
      await connection.rollback();
      flash(req, "error", "You are not allowed to cancel this registration.");
      return res.redirect("/member/registrations");
    }

    const wasConfirmed = registration.status === "Confirmed";
    const participationType = registration.participation_type;
    const eventId = registration.event_id;
    let promotionPayload = null;

    await connection.query(
      `UPDATE event_registrations
       SET status = 'Cancelled',
           cancelled_at = NOW(),
           waiting_position = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE registration_id = ?`,
      [registrationId]
    );

    if (wasConfirmed) {
      const [waitlisted] = await connection.query(
        `SELECT registration_id, user_id
         FROM event_registrations
         WHERE event_id = ?
           AND participation_type = ?
           AND status = 'Waitlisted'
         ORDER BY
           waiting_position ASC,
           registered_at ASC,
           registration_id ASC
         LIMIT 1
         FOR UPDATE`,
        [eventId, participationType]
      );

      if (waitlisted.length) {
        await connection.query(
          `UPDATE event_registrations
           SET status = 'Confirmed',
               waiting_position = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE registration_id = ?`,
          [waitlisted[0].registration_id]
        );

        // Feature 6 — notify the promoted member (promotion decision unchanged).
        try {
          const [[eventInfo]] = await connection.query(
            `SELECT event_name, start_datetime, location
             FROM events WHERE event_id = ? LIMIT 1`,
            [eventId]
          );
          const [[promotedUser]] = await connection.query(
            `SELECT name, email FROM users WHERE user_id = ? LIMIT 1`,
            [waitlisted[0].user_id]
          );
          const eventName = (eventInfo && eventInfo.event_name) || "the event";
          await notifications.createNotification({
            userId: waitlisted[0].user_id,
            eventId: eventId,
            title: "Promoted from waiting list",
            message: "A " + participationType + " place opened for " + eventName
              + ". Your registration is now confirmed.",
            type: "Promotion",
            connection: connection
          });
          if (promotedUser && promotedUser.email) {
            promotionPayload = {
              email: promotedUser.email,
              name: promotedUser.name,
              eventName: eventName,
              startDatetime: eventInfo && eventInfo.start_datetime,
              location: eventInfo && eventInfo.location,
              participationType: participationType
            };
          }
        } catch (notifyErr) {
          console.error("Promotion notification failed:", notifyErr.message);
        }
      }
    }

    await recalculateWaitingPositions(connection, eventId, participationType);
    await connection.commit();

    if (promotionPayload) {
      try {
        await notificationEmails.sendWaitlistPromotionEmail(promotionPayload);
      } catch (mailErr) {
        console.error("Promotion email failed:", mailErr && mailErr.message
          ? mailErr.message
          : "unknown error");
      }
    }

    flash(req, "success", "Your registration has been cancelled.");
    return res.redirect("/member/registrations");
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("Cancellation rollback failed:", rollbackErr.message);
      }
    }
    console.error("cancelRegistration failed:", err.message);
    flash(req, "error", "We could not cancel your registration. Please try again.");
    return res.redirect("/member/registrations");
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  registerForEvent: registerForEvent,
  listMyRegistrations: listMyRegistrations,
  cancelRegistration: cancelRegistration,
  recalculateWaitingPositions: recalculateWaitingPositions,
  takeFlash: takeFlash
};
