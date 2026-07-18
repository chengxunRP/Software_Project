/**
 * Feature 6 notification email verification (mocked Resend).
 * Run: node scripts/test-feature6-email-notifications.js
 * Does not contact the real Resend API.
 */
require("dotenv").config();

const sent = [];
let failNext = false;

const emailPath = require.resolve("../services/emailService");
require.cache[emailPath] = {
  id: emailPath,
  filename: emailPath,
  loaded: true,
  exports: {
    sendEmail: async function (opts) {
      if (failNext) {
        failNext = false;
        const err = new Error("forced");
        err.code = "EMAIL_SEND_FAILED";
        throw err;
      }
      sent.push({
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html
      });
      return { id: "mock" };
    }
  }
};

delete require.cache[require.resolve("../services/notificationEmailService")];
const notificationEmails = require("../services/notificationEmailService");
const pool = require("../config/database");
const fs = require("fs");
const path = require("path");

const results = [];
function record(name, ok, detail) {
  results.push({ name: name, ok: !!ok, detail: detail || "" });
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (detail ? ": " + detail : ""));
}

(async function main() {
  sent.length = 0;
  await notificationEmails.sendRegistrationConfirmedEmail({
    email: "a@example.test",
    name: "Alice",
    eventName: "Park Day",
    startDatetime: new Date("2026-09-01T10:00:00Z"),
    location: "East Coast",
    participationType: "Participant"
  });
  record("Confirmed Participant requests one email", sent.length === 1);
  record(
    "Participant confirmed wording",
    /Participant/i.test(sent[0].text) && /Confirmed/i.test(sent[0].text) && !/Volunteer waiting list/i.test(sent[0].text)
  );

  sent.length = 0;
  await notificationEmails.sendRegistrationWaitlistedEmail({
    email: "b@example.test",
    name: "Bob",
    eventName: "Park Day",
    participationType: "Participant",
    waitingPosition: 2,
    location: "East Coast"
  });
  record("Waitlisted Participant requests one email", sent.length === 1);
  record("Waiting-list position included", /#2/.test(sent[0].text));

  sent.length = 0;
  await notificationEmails.sendRegistrationConfirmedEmail({
    email: "c@example.test",
    name: "Cara",
    eventName: "Park Day",
    participationType: "Volunteer",
    roleName: "Greeter",
    location: "East Coast"
  });
  record("Confirmed Volunteer requests one email", sent.length === 1);
  record("Volunteer confirmed includes role", /Greeter/.test(sent[0].text) && /Volunteer/i.test(sent[0].text));

  sent.length = 0;
  await notificationEmails.sendRegistrationWaitlistedEmail({
    email: "d@example.test",
    name: "Dan",
    eventName: "Park Day",
    participationType: "Volunteer",
    waitingPosition: 1
  });
  record("Waitlisted Volunteer requests one email", sent.length === 1);
  record("Volunteer waitlist wording separate", /Volunteer/i.test(sent[0].text) && /waiting-?list|Waitlisted/i.test(sent[0].text));

  sent.length = 0;
  await notificationEmails.sendWaitlistPromotionEmail({
    email: "e@example.test",
    name: "Eve",
    eventName: "Park Day",
    participationType: "Participant"
  });
  record("Participant promotion requests one email", sent.length === 1);
  record("Participant promotion wording", /Participant/i.test(sent[0].text) && /Confirmed/i.test(sent[0].text));

  sent.length = 0;
  await notificationEmails.sendWaitlistPromotionEmail({
    email: "f@example.test",
    name: "Finn",
    eventName: "Park Day",
    participationType: "Volunteer"
  });
  record("Volunteer promotion requests one email", sent.length === 1);
  record("Volunteer promotion wording", /Volunteer/i.test(sent[0].text) && /Confirmed/i.test(sent[0].text));

  // Email failure swallowed by safeSend — must not throw to caller
  sent.length = 0;
  failNext = true;
  let threw = false;
  try {
    await notificationEmails.sendRegistrationConfirmedEmail({
      email: "g@example.test",
      name: "Gail",
      eventName: "Park Day",
      participationType: "Participant"
    });
  } catch (err) {
    threw = true;
  }
  record("Email failure does not throw to caller (safeSend)", !threw && sent.length === 0);

  // No duplicate for one action
  sent.length = 0;
  await notificationEmails.sendEventUpdatedEmail({
    email: "h@example.test",
    name: "Hank",
    eventName: "Park Day",
    location: "East Coast"
  });
  await notificationEmails.sendEventCancelledEmail({
    email: "i@example.test",
    name: "Ivy",
    eventName: "Park Day"
  });
  record("Event update/cancel each request one email", sent.length === 2);

  // Read/unread must not import notification email service
  const memberSrc = fs.readFileSync(path.join(__dirname, "../controllers/memberController.js"), "utf8");
  record(
    "Read/unread changes do not send email",
    memberSrc.indexOf("notificationEmailService") === -1 &&
      memberSrc.indexOf("sendRegistration") === -1
  );

  // Registration emails happen after commit in controller (structural check)
  const regSrc = fs.readFileSync(path.join(__dirname, "../controllers/registrationController.js"), "utf8");
  const commitIdx = regSrc.indexOf("await connection.commit();");
  const emailIdx = regSrc.indexOf("sendRegistrationConfirmedEmail");
  const promoCommit = regSrc.lastIndexOf("await connection.commit();");
  const promoEmail = regSrc.indexOf("sendWaitlistPromotionEmail");
  record(
    "Registration email after commit in source",
    commitIdx !== -1 && emailIdx > commitIdx
  );
  record(
    "Promotion email after commit in source",
    promoEmail > promoCommit && promoCommit !== -1
  );

  const failed = results.filter(function (r) { return !r.ok; });
  console.log("\nSummary: " + (results.length - failed.length) + "/" + results.length + " passed");
  if (failed.length) {
    failed.forEach(function (f) { console.log("FAIL: " + f.name + " — " + f.detail); });
    process.exitCode = 1;
  } else {
    console.log("FEATURE6_EMAIL_NOTIFICATIONS_COMPLETE_AND_WORKING");
  }
  await pool.end();
})().catch(async function (err) {
  console.error(err);
  try { await pool.end(); } catch (e) { /* ignore */ }
  process.exit(1);
});
