/**
 * Feature 6 — Notifications, Volunteer Hours and Reporting verification.
 * Run: node scripts/test-feature6-notifications-hours-reports.js
 * Requires: server on PORT (default 3000), seed users with Password123!
 */
require("dotenv").config();
const http = require("http");
const pool = require("../config/database");

const PORT = process.env.PORT || 3000;
const PASSWORD = "Password123!";
const results = [];

function record(name, ok, detail) {
  results.push({ name: name, ok: !!ok, detail: detail || "" });
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (detail ? ": " + detail : ""));
}

function jar(headers) {
  const set = headers["set-cookie"];
  if (!set) return "";
  return (Array.isArray(set) ? set : [set]).map(function (c) { return c.split(";")[0]; }).join("; ");
}

function mergeCookies(existing, headers) {
  const map = {};
  String(existing || "").split(";").map(function (p) { return p.trim(); }).filter(Boolean).forEach(function (pair) {
    const i = pair.indexOf("=");
    if (i > 0) map[pair.slice(0, i)] = pair.slice(i + 1);
  });
  jar(headers).split(";").map(function (p) { return p.trim(); }).filter(Boolean).forEach(function (pair) {
    const i = pair.indexOf("=");
    if (i > 0) map[pair.slice(0, i)] = pair.slice(i + 1);
  });
  return Object.keys(map).map(function (k) { return k + "=" + map[k]; }).join("; ");
}

function request(method, pathName, opts) {
  opts = opts || {};
  return new Promise(function (resolve, reject) {
    const body = opts.body || "";
    const headers = Object.assign({}, opts.headers || {});
    if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: pathName,
      method: method,
      headers: headers,
      timeout: 20000
    }, function (res) {
      let data = "";
      res.on("data", function (c) { data += c; });
      res.on("end", function () {
        resolve({ status: res.statusCode, headers: res.headers, body: data, location: res.headers.location || "" });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function login(email, password) {
  const page = await request("GET", "/login");
  let cookie = jar(page.headers);
  const res = await request("POST", "/login", {
    body: "email=" + encodeURIComponent(email) + "&password=" + encodeURIComponent(password),
    headers: { Cookie: cookie }
  });
  cookie = mergeCookies(cookie, res.headers);
  return { res: res, cookie: cookie };
}

async function register(cookie, eventId, participationType, roleId) {
  let body = "participation_type=" + encodeURIComponent(participationType) + "&notes=";
  if (participationType === "Volunteer" && roleId) {
    body += "&volunteer_role_id=" + encodeURIComponent(roleId);
  } else {
    body += "&volunteer_role_id=";
  }
  return request("POST", "/events/" + eventId + "/register", {
    body: body,
    headers: { Cookie: cookie }
  });
}

(async function main() {
  const stamp = Date.now();
  let eventId = null;
  let roleId = null;
  let orgCookie = "";

  const [[organiser]] = await pool.query(
    `SELECT user_id, email FROM users
     WHERE role = 'organiser' AND account_status = 'Active'
     ORDER BY user_id ASC LIMIT 1`
  );
  const [[category]] = await pool.query(
    "SELECT category_id FROM event_categories ORDER BY category_id LIMIT 1"
  );
  const [members] = await pool.query(
    `SELECT user_id, email, name FROM users
     WHERE role = 'community_member' AND account_status = 'Active'
     ORDER BY user_id ASC LIMIT 3`
  );
  if (!organiser || !category || members.length < 3) {
    throw new Error("Need organiser, category and 3 community members.");
  }

  const volA = members[0];
  const volB = members[1];
  const participant = members[2];

  try {
    const [ins] = await pool.query(
      `INSERT INTO events (
         organiser_id, category_id, event_name, description,
         start_datetime, end_datetime, location,
         participant_capacity, volunteer_capacity, registration_deadline,
         status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 2, 1, ?, 'Open')`,
      [
        organiser.user_id,
        category.category_id,
        "F6 Test Event " + stamp,
        "Feature 6 notifications/hours/reports verification",
        "2026-10-01 10:00:00",
        "2026-10-01 13:00:00",
        "F6 Test Venue",
        "2026-09-30 18:00:00"
      ]
    );
    eventId = ins.insertId;

    const [roleIns] = await pool.query(
      `INSERT INTO volunteer_roles (event_id, role_name, description, required_volunteers)
       VALUES (?, 'Helper', 'F6 test role', 2)`,
      [eventId]
    );
    roleId = roleIns.insertId;

    const orgLogin = await login(organiser.email, PASSWORD);
    orgCookie = orgLogin.cookie;

    // 1–2 Registration confirmed → notification
    const loginA = await login(volA.email, PASSWORD);
    const regA = await register(loginA.cookie, eventId, "Volunteer", roleId);
    const [[regVol]] = await pool.query(
      `SELECT registration_id, status FROM event_registrations
       WHERE event_id = ? AND user_id = ? AND participation_type = 'Volunteer'`,
      [eventId, volA.user_id]
    );
    record("1 Create registration", regA.status === 302 && regVol && regVol.status === "Confirmed", regVol && regVol.status);

    const [[notifReg]] = await pool.query(
      `SELECT notification_id, notification_type, is_read, title
       FROM notifications
       WHERE user_id = ? AND event_id = ? AND notification_type = 'Registration'
       ORDER BY notification_id DESC LIMIT 1`,
      [volA.user_id, eventId]
    );
    record("2 Registration notification appears", !!notifReg && notifReg.is_read === 0, notifReg && notifReg.title);

    // 3 Waitlisted registration
    const loginB = await login(volB.email, PASSWORD);
    await register(loginB.cookie, eventId, "Volunteer", roleId);
    const [[regWait]] = await pool.query(
      `SELECT registration_id, status FROM event_registrations
       WHERE event_id = ? AND user_id = ?`,
      [eventId, volB.user_id]
    );
    record("3 Waitlisted registration", regWait && regWait.status === "Waitlisted", regWait && regWait.status);

    const [[notifWait]] = await pool.query(
      `SELECT notification_id, notification_type FROM notifications
       WHERE user_id = ? AND event_id = ? AND notification_type = 'WaitingList'
       ORDER BY notification_id DESC LIMIT 1`,
      [volB.user_id, eventId]
    );
    record("Waitlist notification", !!notifWait, notifWait && notifWait.notification_type);

    // 4–5 Promotion via cancel of Confirmed volunteer A
    const cancelA = await request("POST", "/registrations/" + regVol.registration_id + "/cancel", {
      headers: { Cookie: loginA.cookie }
    });
    const [[promoted]] = await pool.query(
      "SELECT status FROM event_registrations WHERE registration_id = ?",
      [regWait.registration_id]
    );
    record("4 Trigger promotion", cancelA.status === 302 && promoted && promoted.status === "Confirmed", promoted && promoted.status);

    const [[notifPromo]] = await pool.query(
      `SELECT notification_id, notification_type, is_read FROM notifications
       WHERE user_id = ? AND event_id = ? AND notification_type = 'Promotion'
       ORDER BY notification_id DESC LIMIT 1`,
      [volB.user_id, eventId]
    );
    record("5 Promotion notification appears", !!notifPromo && notifPromo.is_read === 0, notifPromo && notifPromo.notification_type);

    // Re-register A after capacity free (A cancelled, B promoted — capacity full again with B)
    // Bump capacity so A can register again as Confirmed Volunteer for hours test
    await pool.query("UPDATE events SET volunteer_capacity = 2 WHERE event_id = ?", [eventId]);
    await register(loginA.cookie, eventId, "Volunteer", roleId);
    const [[regVol2]] = await pool.query(
      `SELECT registration_id, status FROM event_registrations
       WHERE event_id = ? AND user_id = ? AND status = 'Confirmed' AND participation_type = 'Volunteer'`,
      [eventId, volA.user_id]
    );
    record("Re-confirm Volunteer A for hours", !!regVol2, regVol2 && regVol2.status);

    // 6 Mark notification read
    const dashBefore = await request("GET", "/member/dashboard", { headers: { Cookie: loginB.cookie } });
    record("Display personal notifications", dashBefore.status === 200 && dashBefore.body.indexOf("Promoted") !== -1, "HTTP " + dashBefore.status);

    const markRead = await request("POST", "/member/notifications/" + notifPromo.notification_id + "/read", {
      headers: { Cookie: loginB.cookie }
    });
    const [[afterRead]] = await pool.query(
      "SELECT is_read FROM notifications WHERE notification_id = ?",
      [notifPromo.notification_id]
    );
    record("6 Mark notification read", markRead.status === 302 && Number(afterRead.is_read) === 1, "is_read=" + afterRead.is_read);

    // 7 Check-in + check-out for Volunteer A
    // Force check_in slightly in the past so TIMESTAMPDIFF yields measurable hours
    await request("POST", "/organiser/events/" + eventId + "/attendance", {
      body: "registration_id=" + encodeURIComponent(regVol2.registration_id) + "&attendance_status=Attended",
      headers: { Cookie: orgCookie }
    });
    await pool.query(
      "UPDATE attendance SET check_in_time = DATE_SUB(NOW(), INTERVAL 90 MINUTE) WHERE registration_id = ?",
      [regVol2.registration_id]
    );
    const checkout = await request("POST", "/organiser/events/" + eventId + "/attendance/checkout", {
      body: "registration_id=" + encodeURIComponent(regVol2.registration_id),
      headers: { Cookie: orgCookie }
    });
    const [[attRow]] = await pool.query(
      `SELECT attendance_status, check_in_time, check_out_time, volunteer_hours
       FROM attendance WHERE registration_id = ?`,
      [regVol2.registration_id]
    );
    record("7 Attended check-in/out with hours", checkout.status === 302 && attRow && Number(attRow.volunteer_hours) > 0,
      attRow && ("hours=" + attRow.volunteer_hours));

    // Participant absent must not add hours
    const loginP = await login(participant.email, PASSWORD);
    await register(loginP.cookie, eventId, "Participant", null);
    const [[regPart]] = await pool.query(
      `SELECT registration_id FROM event_registrations
       WHERE event_id = ? AND user_id = ? AND participation_type = 'Participant'`,
      [eventId, participant.user_id]
    );
    await request("POST", "/organiser/events/" + eventId + "/attendance", {
      body: "registration_id=" + encodeURIComponent(regPart.registration_id) + "&attendance_status=Absent",
      headers: { Cookie: orgCookie }
    });
    const [[attPart]] = await pool.query(
      "SELECT volunteer_hours, attendance_status FROM attendance WHERE registration_id = ?",
      [regPart.registration_id]
    );
    record("Participant hours remain 0", attPart && Number(attPart.volunteer_hours) === 0, attPart && String(attPart.volunteer_hours));

    // 8–11 Volunteer Hours page
    const hoursPage = await request("GET", "/member/volunteer-hours", { headers: { Cookie: loginA.cookie } });
    record("8 Open Volunteer Hours", hoursPage.status === 200, "HTTP " + hoursPage.status);

    const [[sumDb]] = await pool.query(
      `SELECT COALESCE(SUM(a.volunteer_hours), 0) AS total
       FROM attendance a
       INNER JOIN event_registrations r ON r.registration_id = a.registration_id
       WHERE r.user_id = ? AND r.participation_type = 'Volunteer' AND a.attendance_status = 'Attended'`,
      [volA.user_id]
    );
    const totalStr = Number(sumDb.total).toFixed(1);
    record("9 Total hours match attendance", hoursPage.body.indexOf(totalStr) !== -1, "expected " + totalStr);

    record("10 Contribution history matches MySQL",
      hoursPage.body.indexOf("F6 Test Event") !== -1 && hoursPage.body.indexOf("Attended") !== -1,
      "event + status present");

    const [[monthDb]] = await pool.query(
      `SELECT COALESCE(SUM(a.volunteer_hours), 0) AS total
       FROM attendance a
       INNER JOIN event_registrations r ON r.registration_id = a.registration_id
       INNER JOIN events e ON e.event_id = r.event_id
       WHERE r.user_id = ? AND r.participation_type = 'Volunteer' AND a.attendance_status = 'Attended'
         AND YEAR(e.start_datetime) = YEAR(CURDATE()) AND MONTH(e.start_datetime) = MONTH(CURDATE())`,
      [volA.user_id]
    );
    // Monthly chart uses event start month — F6 event is in October, so Oct bar may be non-zero
    const [[octDb]] = await pool.query(
      `SELECT COALESCE(SUM(a.volunteer_hours), 0) AS total
       FROM attendance a
       INNER JOIN event_registrations r ON r.registration_id = a.registration_id
       INNER JOIN events e ON e.event_id = r.event_id
       WHERE r.user_id = ? AND r.participation_type = 'Volunteer' AND a.attendance_status = 'Attended'
         AND YEAR(e.start_datetime) = 2026 AND MONTH(e.start_datetime) = 10`,
      [volA.user_id]
    );
    const octStr = Number(octDb.total).toFixed(1);
    record("11 Monthly chart matches MySQL", hoursPage.body.indexOf(octStr) !== -1 || Number(octDb.total) === 0, "Oct hours=" + octStr);

    // 12–14 Organiser reports (dashboard) + admin reports
    const orgDash = await request("GET", "/organiser/dashboard", { headers: { Cookie: orgCookie } });
    const [[orgHours]] = await pool.query(
      `SELECT COALESCE(SUM(a.volunteer_hours), 0) AS total
       FROM attendance a
       INNER JOIN event_registrations r ON r.registration_id = a.registration_id
       INNER JOIN events e ON e.event_id = r.event_id
       WHERE e.organiser_id = ? AND r.participation_type = 'Volunteer' AND a.attendance_status = 'Attended'`,
      [organiser.user_id]
    );
    const orgHoursStr = Number(orgHours.total).toFixed(1);
    record("12 Open organiser reports/dashboard", orgDash.status === 200, "HTTP " + orgDash.status);
    record("13 Organiser totals match MySQL",
      orgDash.body.indexOf(orgHoursStr) !== -1 && orgDash.body.indexOf("Registrations per month") !== -1,
      "hours=" + orgHoursStr);

    const [[admin]] = await pool.query(
      `SELECT email FROM users WHERE role = 'admin' AND account_status = 'Active' ORDER BY user_id LIMIT 1`
    );
    const adminLogin = await login(admin.email, PASSWORD);
    const adminReports = await request("GET", "/admin/reports", { headers: { Cookie: adminLogin.cookie } });
    const adminDash = await request("GET", "/admin/dashboard", { headers: { Cookie: adminLogin.cookie } });
    const noFake = adminDash.body.indexOf("[12, 18, 24") === -1
      && adminReports.body.indexOf("const chartData") === -1;
    record("14 No fake chart values / admin reports load",
      adminReports.status === 200 && adminDash.status === 200 && noFake,
      "reports=" + adminReports.status + " dash=" + adminDash.status);

    // Event update notification
    const editPage = await request("GET", "/organiser/events/" + eventId + "/edit", { headers: { Cookie: orgCookie } });
    // Minimal update via SQL status stay Open + notification path through controller is better;
    // call update with required fields from a form-style POST if we can scrape — instead notify via direct service already tested.
    // Use organiser update with known fields:
    await request("POST", "/organiser/events/" + eventId + "/edit", {
      body: [
        "event_name=" + encodeURIComponent("F6 Test Event Updated " + stamp),
        "description=" + encodeURIComponent("Updated description"),
        "category_id=" + encodeURIComponent(category.category_id),
        "location=" + encodeURIComponent("F6 Test Venue"),
        "start_datetime=" + encodeURIComponent("2026-10-01T10:00"),
        "end_datetime=" + encodeURIComponent("2026-10-01T13:00"),
        "registration_deadline=" + encodeURIComponent("2026-09-30T18:00"),
        "participant_capacity=2",
        "volunteer_capacity=2",
        "status=Published"
      ].join("&"),
      headers: { Cookie: orgCookie }
    });
    const [[notifUpdate]] = await pool.query(
      `SELECT notification_id FROM notifications
       WHERE event_id = ? AND notification_type = 'EventUpdate'
       ORDER BY notification_id DESC LIMIT 1`,
      [eventId]
    );
    record("Event update notification", !!notifUpdate, notifUpdate ? "id=" + notifUpdate.notification_id : "missing");

  } catch (err) {
    record("Unhandled error", false, err.message);
    console.error(err);
  } finally {
    if (eventId) {
      await pool.query("DELETE FROM notifications WHERE event_id = ?", [eventId]).catch(function () {});
      await pool.query("DELETE FROM attendance WHERE registration_id IN (SELECT registration_id FROM event_registrations WHERE event_id = ?)", [eventId]).catch(function () {});
      await pool.query("DELETE FROM volunteer_assignments WHERE role_id IN (SELECT role_id FROM volunteer_roles WHERE event_id = ?)", [eventId]).catch(function () {});
      await pool.query("DELETE FROM volunteer_roles WHERE event_id = ?", [eventId]).catch(function () {});
      await pool.query("DELETE FROM event_registrations WHERE event_id = ?", [eventId]).catch(function () {});
      await pool.query("DELETE FROM events WHERE event_id = ?", [eventId]).catch(function () {});
    }
    await pool.end();
  }

  const failed = results.filter(function (r) { return !r.ok; });
  console.log("\nFeature 6 summary: " + (results.length - failed.length) + "/" + results.length + " passed");
  if (failed.length) {
    process.exitCode = 1;
    failed.forEach(function (f) { console.log("  FAIL: " + f.name + " — " + f.detail); });
  }
})();
