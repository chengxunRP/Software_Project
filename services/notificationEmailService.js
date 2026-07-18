/**
 * Feature 6 — email notifications paired with existing in-app notifications.
 * Call only after a successful database commit. Failures must not undo DB work.
 */
const { sendEmail } = require("./emailService");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEventWhen(startDatetime) {
  if (!startDatetime) return "";
  const d = startDatetime instanceof Date ? startDatetime : new Date(startDatetime);
  if (Number.isNaN(d.getTime())) return String(startDatetime);
  return d.toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function wrapHtml(title, bodyHtml) {
  return [
    "<div style=\"font-family:Arial,sans-serif;line-height:1.55;color:#23271F\">",
    "<p style=\"font-size:18px;font-weight:700;color:#2E7D4F\">CommunityConnect <span style=\"color:#1E4D33\">SG</span></p>",
    "<h2 style=\"font-size:18px;margin:0 0 12px\">" + escapeHtml(title) + "</h2>",
    bodyHtml,
    "</div>"
  ].join("");
}

async function safeSend(label, payload) {
  try {
    await sendEmail(payload);
  } catch (err) {
    console.error(label + " email failed:", err && err.message ? err.message : "unknown error");
  }
}

async function sendRegistrationConfirmedEmail(opts) {
  const participationType = opts.participationType === "Volunteer" ? "Volunteer" : "Participant";
  const name = String(opts.name || "Member").trim();
  const eventName = String(opts.eventName || "the event").trim();
  const when = formatEventWhen(opts.startDatetime);
  const location = String(opts.location || "").trim();
  const roleName = String(opts.roleName || "").trim();

  const subject = "Your " + participationType + " place is confirmed — " + eventName;
  const lines = [
    "Hello " + name + ",",
    "",
    "You registered as a " + participationType + " for " + eventName + ".",
    "Your registration status is Confirmed."
  ];
  if (when) lines.push("When: " + when);
  if (location) lines.push("Where: " + location);
  if (participationType === "Volunteer" && roleName) {
    lines.push("Preferred volunteer role: " + roleName);
  }
  lines.push("", "See you at the event.", "", "CommunityConnect SG");

  const bodyHtml = [
    "<p>Hello " + escapeHtml(name) + ",</p>",
    "<p>You registered as a <strong>" + escapeHtml(participationType) + "</strong> for <strong>"
      + escapeHtml(eventName) + "</strong>.</p>",
    "<p>Your registration status is <strong>Confirmed</strong>.</p>",
    when ? ("<p>When: " + escapeHtml(when) + "</p>") : "",
    location ? ("<p>Where: " + escapeHtml(location) + "</p>") : "",
    (participationType === "Volunteer" && roleName)
      ? ("<p>Preferred volunteer role: " + escapeHtml(roleName) + "</p>")
      : "",
    "<p>See you at the event.</p>"
  ].join("");

  return safeSend("Registration confirmed", {
    to: opts.email,
    subject: subject,
    text: lines.join("\n"),
    html: wrapHtml("Registration confirmed", bodyHtml)
  });
}

async function sendRegistrationWaitlistedEmail(opts) {
  const participationType = opts.participationType === "Volunteer" ? "Volunteer" : "Participant";
  const name = String(opts.name || "Member").trim();
  const eventName = String(opts.eventName || "the event").trim();
  const position = opts.waitingPosition != null ? String(opts.waitingPosition) : "";
  const when = formatEventWhen(opts.startDatetime);
  const location = String(opts.location || "").trim();

  const subject = "You are on the " + participationType + " waiting list — " + eventName;
  const lines = [
    "Hello " + name + ",",
    "",
    "You registered as a " + participationType + " for " + eventName + ".",
    "The " + participationType + " capacity is currently full, so you are Waitlisted."
  ];
  if (position) {
    lines.push("Your " + participationType + " waiting-list position is #" + position + ".");
  }
  if (when) lines.push("When: " + when);
  if (location) lines.push("Where: " + location);
  lines.push("", "We will notify you if a place becomes available.", "", "CommunityConnect SG");

  const bodyHtml = [
    "<p>Hello " + escapeHtml(name) + ",</p>",
    "<p>You registered as a <strong>" + escapeHtml(participationType) + "</strong> for <strong>"
      + escapeHtml(eventName) + "</strong>.</p>",
    "<p>The " + escapeHtml(participationType) + " capacity is currently full, so you are <strong>Waitlisted</strong>.</p>",
    position
      ? ("<p>Your " + escapeHtml(participationType) + " waiting-list position is <strong>#"
        + escapeHtml(position) + "</strong>.</p>")
      : "",
    when ? ("<p>When: " + escapeHtml(when) + "</p>") : "",
    location ? ("<p>Where: " + escapeHtml(location) + "</p>") : "",
    "<p>We will notify you if a place becomes available.</p>"
  ].join("");

  return safeSend("Registration waitlisted", {
    to: opts.email,
    subject: subject,
    text: lines.join("\n"),
    html: wrapHtml("Waiting list update", bodyHtml)
  });
}

async function sendWaitlistPromotionEmail(opts) {
  const participationType = opts.participationType === "Volunteer" ? "Volunteer" : "Participant";
  const name = String(opts.name || "Member").trim();
  const eventName = String(opts.eventName || "the event").trim();
  const when = formatEventWhen(opts.startDatetime);
  const location = String(opts.location || "").trim();

  const subject = "Promoted to Confirmed " + participationType + " — " + eventName;
  const lines = [
    "Hello " + name + ",",
    "",
    "Good news — you have been promoted from the " + participationType + " waiting list.",
    "Your " + participationType + " registration for " + eventName + " is now Confirmed.",
    "Your waiting-list position is no longer active."
  ];
  if (when) lines.push("When: " + when);
  if (location) lines.push("Where: " + location);
  lines.push("", "CommunityConnect SG");

  const bodyHtml = [
    "<p>Hello " + escapeHtml(name) + ",</p>",
    "<p>Good news — you have been promoted from the <strong>"
      + escapeHtml(participationType) + "</strong> waiting list.</p>",
    "<p>Your " + escapeHtml(participationType) + " registration for <strong>"
      + escapeHtml(eventName) + "</strong> is now <strong>Confirmed</strong>.</p>",
    "<p>Your waiting-list position is no longer active.</p>",
    when ? ("<p>When: " + escapeHtml(when) + "</p>") : "",
    location ? ("<p>Where: " + escapeHtml(location) + "</p>") : ""
  ].join("");

  return safeSend("Waitlist promotion", {
    to: opts.email,
    subject: subject,
    text: lines.join("\n"),
    html: wrapHtml("You have been promoted", bodyHtml)
  });
}

async function sendEventUpdatedEmail(opts) {
  const name = String(opts.name || "Member").trim();
  const eventName = String(opts.eventName || "the event").trim();
  const when = formatEventWhen(opts.startDatetime);
  const location = String(opts.location || "").trim();

  const subject = "Event updated — " + eventName;
  const lines = [
    "Hello " + name + ",",
    "",
    "Details for " + eventName + " have been updated. Please review the event page."
  ];
  if (when) lines.push("When: " + when);
  if (location) lines.push("Where: " + location);
  lines.push("", "CommunityConnect SG");

  const bodyHtml = [
    "<p>Hello " + escapeHtml(name) + ",</p>",
    "<p>Details for <strong>" + escapeHtml(eventName) + "</strong> have been updated. Please review the event page.</p>",
    when ? ("<p>When: " + escapeHtml(when) + "</p>") : "",
    location ? ("<p>Where: " + escapeHtml(location) + "</p>") : ""
  ].join("");

  return safeSend("Event updated", {
    to: opts.email,
    subject: subject,
    text: lines.join("\n"),
    html: wrapHtml("Event updated", bodyHtml)
  });
}

async function sendEventCancelledEmail(opts) {
  const name = String(opts.name || "Member").trim();
  const eventName = String(opts.eventName || "the event").trim();

  const subject = "Event cancelled — " + eventName;
  const text = [
    "Hello " + name + ",",
    "",
    eventName + " has been cancelled by the organiser.",
    "",
    "CommunityConnect SG"
  ].join("\n");

  const bodyHtml = [
    "<p>Hello " + escapeHtml(name) + ",</p>",
    "<p><strong>" + escapeHtml(eventName) + "</strong> has been cancelled by the organiser.</p>"
  ].join("");

  return safeSend("Event cancelled", {
    to: opts.email,
    subject: subject,
    text: text,
    html: wrapHtml("Event cancelled", bodyHtml)
  });
}

module.exports = {
  sendRegistrationConfirmedEmail: sendRegistrationConfirmedEmail,
  sendRegistrationWaitlistedEmail: sendRegistrationWaitlistedEmail,
  sendWaitlistPromotionEmail: sendWaitlistPromotionEmail,
  sendEventUpdatedEmail: sendEventUpdatedEmail,
  sendEventCancelledEmail: sendEventCancelledEmail
};
