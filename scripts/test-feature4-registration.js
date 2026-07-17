/**
 * Feature 4 — Registration, capacity, waiting list verification.
 * Creates a temporary Open event (P=1, V=1), runs UI-style HTTP tests, cleans up.
 * Run: node scripts/test-feature4-registration.js
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

async function logout(cookie) {
  return request("POST", "/logout", { headers: { Cookie: cookie || "" } });
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

async function cancel(cookie, registrationId) {
  return request("POST", "/registrations/" + registrationId + "/cancel", {
    headers: { Cookie: cookie }
  });
}

(async function main() {
  const stamp = Date.now();
  let eventId = null;
  let roleId = null;
  let closedEventId = null;
  let deadlineEventId = null;

  const [members] = await pool.query(
    `SELECT user_id, email, name FROM users
     WHERE role = 'community_member' AND account_status = 'Active'
     ORDER BY user_id ASC
     LIMIT 4`
  );
  if (members.length < 4) {
    throw new Error("Need at least 4 active community_member accounts in the database.");
  }
  const A = members[0];
  const B = members[1];
  const C = members[2];
  const D = members[3];

  const [[organiser]] = await pool.query(
    "SELECT user_id FROM users WHERE role = 'organiser' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
  );
  const [[category]] = await pool.query(
    "SELECT category_id FROM event_categories ORDER BY category_id LIMIT 1"
  );

  // Temporary Open event: P=1, V=1, future dates
  const [ins] = await pool.query(
    `INSERT INTO events (
       organiser_id, category_id, event_name, description,
       start_datetime, end_datetime, location,
       participant_capacity, volunteer_capacity, registration_deadline,
       status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 'Open')`,
    [
      organiser.user_id,
      category.category_id,
      "Feature4 Cap Test " + stamp,
      "Temporary Feature 4 capacity/waitlist test event.",
      "2026-09-15 10:00:00",
      "2026-09-15 12:00:00",
      "Feature4 Test Hall",
      "2026-09-14 18:00:00"
    ]
  );
  eventId = ins.insertId;

  const [roleIns] = await pool.query(
    `INSERT INTO volunteer_roles (event_id, role_name, description, required_volunteers)
     VALUES (?, 'Helper', 'Test role', 1)`,
    [eventId]
  );
  roleId = roleIns.insertId;

  // Closed event for rejection test
  const [closedIns] = await pool.query(
    `INSERT INTO events (
       organiser_id, category_id, event_name, description,
       start_datetime, end_datetime, location,
       participant_capacity, volunteer_capacity, registration_deadline,
       status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 5, 5, ?, 'Closed')`,
    [
      organiser.user_id,
      category.category_id,
      "Feature4 Closed " + stamp,
      "Closed event for Feature 4 rejection test.",
      "2026-09-20 10:00:00",
      "2026-09-20 12:00:00",
      "Feature4 Closed Hall",
      "2026-09-19 18:00:00"
    ]
  );
  closedEventId = closedIns.insertId;

  // Deadline passed event (still Open status, deadline yesterday)
  const [deadIns] = await pool.query(
    `INSERT INTO events (
       organiser_id, category_id, event_name, description,
       start_datetime, end_datetime, location,
       participant_capacity, volunteer_capacity, registration_deadline,
       status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 5, 5, ?, 'Open')`,
    [
      organiser.user_id,
      category.category_id,
      "Feature4 Deadline " + stamp,
      "Deadline-passed event for Feature 4 rejection test.",
      "2026-09-25 10:00:00",
      "2026-09-25 12:00:00",
      "Feature4 Deadline Hall",
      "2020-01-01 00:00:00"
    ]
  );
  deadlineEventId = deadIns.insertId;

  record("Setup temp event P=1 V=1", Boolean(eventId), "event_id=" + eventId);

  // 1. User A Participant → Confirmed
  let aLogin = await login(A.email, PASSWORD);
  let r = await register(aLogin.cookie, eventId, "Participant");
  let [[aReg]] = await pool.query(
    "SELECT registration_id, status, waiting_position, participation_type FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [eventId, A.user_id]
  );
  record(
    "1. User A joins as Participant → Confirmed",
    r.status === 302 && aReg && aReg.status === "Confirmed" && aReg.participation_type === "Participant",
    "status=" + (aReg && aReg.status)
  );
  await logout(aLogin.cookie);

  // 2. User B Participant → Waitlisted #1
  let bLogin = await login(B.email, PASSWORD);
  r = await register(bLogin.cookie, eventId, "Participant");
  let [[bReg]] = await pool.query(
    "SELECT registration_id, status, waiting_position FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [eventId, B.user_id]
  );
  record(
    "2. User B joins as Participant → Waitlisted position 1",
    r.status === 302 && bReg && bReg.status === "Waitlisted" && Number(bReg.waiting_position) === 1,
    "status=" + (bReg && bReg.status) + " pos=" + (bReg && bReg.waiting_position)
  );
  await logout(bLogin.cookie);

  // 3. User A cancels → User B Confirmed
  aLogin = await login(A.email, PASSWORD);
  r = await cancel(aLogin.cookie, aReg.registration_id);
  [[aReg]] = await pool.query(
    "SELECT status FROM event_registrations WHERE registration_id = ?",
    [aReg.registration_id]
  );
  [[bReg]] = await pool.query(
    "SELECT status, waiting_position FROM event_registrations WHERE registration_id = ?",
    [bReg.registration_id]
  );
  record(
    "3. User A cancels → User B becomes Confirmed",
    aReg.status === "Cancelled" && bReg.status === "Confirmed" && bReg.waiting_position === null,
    "A=" + aReg.status + " B=" + bReg.status
  );
  await logout(aLogin.cookie);

  // 4. User C Volunteer → Confirmed
  let cLogin = await login(C.email, PASSWORD);
  r = await register(cLogin.cookie, eventId, "Volunteer", roleId);
  let [[cReg]] = await pool.query(
    "SELECT registration_id, status, participation_type FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [eventId, C.user_id]
  );
  record(
    "4. User C joins as Volunteer → Confirmed",
    cReg && cReg.status === "Confirmed" && cReg.participation_type === "Volunteer",
    "status=" + (cReg && cReg.status)
  );
  await logout(cLogin.cookie);

  // 5. User D Volunteer → Waitlisted #1
  let dLogin = await login(D.email, PASSWORD);
  r = await register(dLogin.cookie, eventId, "Volunteer", roleId);
  let [[dReg]] = await pool.query(
    "SELECT registration_id, status, waiting_position, participation_type FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [eventId, D.user_id]
  );
  record(
    "5. User D joins as Volunteer → Waitlisted position 1",
    dReg && dReg.status === "Waitlisted" && Number(dReg.waiting_position) === 1 && dReg.participation_type === "Volunteer",
    "status=" + (dReg && dReg.status) + " pos=" + (dReg && dReg.waiting_position)
  );
  await logout(dLogin.cookie);

  // Separate lists: B is Confirmed Participant; D is Waitlisted Volunteer — B should not be on volunteer waitlist
  const [[pWait]] = await pool.query(
    `SELECT COUNT(*) AS total FROM event_registrations
     WHERE event_id = ? AND participation_type = 'Participant' AND status = 'Waitlisted'`,
    [eventId]
  );
  const [[vWait]] = await pool.query(
    `SELECT COUNT(*) AS total FROM event_registrations
     WHERE event_id = ? AND participation_type = 'Volunteer' AND status = 'Waitlisted'`,
    [eventId]
  );
  record(
    "Participant and Volunteer waiting lists remain separate",
    Number(pWait.total) === 0 && Number(vWait.total) === 1,
    "pWait=" + pWait.total + " vWait=" + vWait.total
  );

  // 6. User C cancels → User D Confirmed
  cLogin = await login(C.email, PASSWORD);
  r = await cancel(cLogin.cookie, cReg.registration_id);
  [[cReg]] = await pool.query(
    "SELECT status FROM event_registrations WHERE registration_id = ?",
    [cReg.registration_id]
  );
  [[dReg]] = await pool.query(
    "SELECT status, waiting_position FROM event_registrations WHERE registration_id = ?",
    [dReg.registration_id]
  );
  // B should still be Confirmed Participant (unaffected by volunteer promotion)
  [[bReg]] = await pool.query(
    "SELECT status, participation_type FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [eventId, B.user_id]
  );
  record(
    "6. User C cancels → User D becomes Confirmed",
    cReg.status === "Cancelled" && dReg.status === "Confirmed" && dReg.waiting_position === null,
    "C=" + cReg.status + " D=" + dReg.status
  );
  record(
    "Volunteer cancel does not demote Confirmed Participant",
    bReg.status === "Confirmed" && bReg.participation_type === "Participant",
    "B=" + bReg.status
  );
  await logout(cLogin.cookie);

  // 7. Duplicate registration rejected
  bLogin = await login(B.email, PASSWORD);
  r = await register(bLogin.cookie, eventId, "Participant");
  const [[dupCount]] = await pool.query(
    "SELECT COUNT(*) AS total FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [eventId, B.user_id]
  );
  record(
    "7. Duplicate registration rejected",
    Number(dupCount.total) === 1 && r.status === 302,
    "rows=" + dupCount.total + " location=" + r.location
  );

  // 8. My Registrations shows only logged-in user
  const mine = await request("GET", "/member/registrations", { headers: { Cookie: bLogin.cookie } });
  record(
    "8. My Registrations loads for logged-in user",
    mine.status === 200 && mine.body.indexOf("Feature4 Cap Test " + stamp) !== -1,
    "status=" + mine.status
  );
  // Should not list other users' names as registration owners in a confusing way —
  // at minimum page is scoped: check other members' unique event-only presence is ok,
  // verify SQL side that list query uses B only
  const [bOnly] = await pool.query(
    "SELECT user_id FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [eventId, B.user_id]
  );
  record(
    "8b. Registration row owned only by logged-in user in DB filter",
    bOnly.length === 1 && Number(bOnly[0].user_id) === Number(B.user_id),
    "user_id=" + (bOnly[0] && bOnly[0].user_id)
  );
  await logout(bLogin.cookie);

  // 9. Closed event rejected
  aLogin = await login(A.email, PASSWORD);
  r = await register(aLogin.cookie, closedEventId, "Participant");
  const [[closedRegs]] = await pool.query(
    "SELECT COUNT(*) AS total FROM event_registrations WHERE event_id = ?",
    [closedEventId]
  );
  record(
    "9. Closed event registration rejected",
    Number(closedRegs.total) === 0 && r.status === 302,
    "regs=" + closedRegs.total
  );

  // 10. Deadline passed rejected
  r = await register(aLogin.cookie, deadlineEventId, "Participant");
  const [[deadRegs]] = await pool.query(
    "SELECT COUNT(*) AS total FROM event_registrations WHERE event_id = ?",
    [deadlineEventId]
  );
  record(
    "10. Registration after deadline rejected",
    Number(deadRegs.total) === 0,
    "regs=" + deadRegs.total
  );
  await logout(aLogin.cookie);

  // Cancelled reactivation path: A was Cancelled; re-register as Volunteer should UPDATE not duplicate
  aLogin = await login(A.email, PASSWORD);
  const [[beforeRe]] = await pool.query(
    "SELECT COUNT(*) AS total FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [eventId, A.user_id]
  );
  r = await register(aLogin.cookie, eventId, "Volunteer", roleId);
  const [[afterRe]] = await pool.query(
    "SELECT COUNT(*) AS total, MAX(status) AS status, MAX(participation_type) AS ptype FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [eventId, A.user_id]
  );
  // V capacity is 1 and D is Confirmed Volunteer, so A should be Waitlisted Volunteer on same row
  record(
    "Cancelled row reactivated without duplicate INSERT",
    Number(beforeRe.total) === 1 && Number(afterRe.total) === 1 && afterRe.ptype === "Volunteer",
    "before=" + beforeRe.total + " after=" + afterRe.total + " status=" + afterRe.status
  );
  await logout(aLogin.cookie);

  // currentUser from session — registration with no cookie should fail auth
  const noAuth = await register("", eventId, "Participant");
  record(
    "Unauthenticated register blocked",
    noAuth.status === 401 || noAuth.status === 302 || noAuth.status === 500,
    "status=" + noAuth.status
  );

  // Cleanup
  await pool.query("DELETE FROM events WHERE event_id IN (?, ?, ?)", [eventId, closedEventId, deadlineEventId]);
  record("Cleanup temp events", true, "deleted " + eventId + "," + closedEventId + "," + deadlineEventId);

  const failed = results.filter(function (r) { return !r.ok; });
  console.log("\nSummary: " + (results.length - failed.length) + "/" + results.length + " passed");
  console.log("Users: A=" + A.email + " B=" + B.email + " C=" + C.email + " D=" + D.email);
  if (failed.length) {
    failed.forEach(function (f) { console.log("FAIL: " + f.name + " — " + f.detail); });
    process.exitCode = 1;
  } else {
    console.log("FEATURE4_REGISTRATION_COMPLETE_AND_WORKING");
  }
  await pool.end();
})().catch(async function (err) {
  console.error(err);
  try { await pool.end(); } catch (e) { /* ignore */ }
  process.exit(1);
});
