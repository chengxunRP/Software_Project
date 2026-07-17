/**
 * Event-details status + registration panel verification (MySQL-backed).
 * Run with server up: node scripts/test-event-details-registration.js
 */
require("dotenv").config();
const http = require("http");
const pool = require("../config/database");

const PORT = process.env.PORT || 3000;
const PASSWORD = "Password123!";
const results = [];
const createdEventIds = [];
const createdUserIds = [];

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
      timeout: 30000
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

async function createMember(label) {
  const email = "edetails_" + label + "_" + Date.now() + "@example.test";
  const bcrypt = require("bcrypt");
  const hash = await bcrypt.hash(PASSWORD, 10);
  const [result] = await pool.query(
    `INSERT INTO users (name, email, password, role, account_status)
     VALUES (?, ?, ?, 'community_member', 'Active')`,
    ["ED " + label, email, hash]
  );
  createdUserIds.push(result.insertId);
  return { user_id: result.insertId, email: email };
}

async function createEvent(opts) {
  const [[org]] = await pool.query(
    "SELECT user_id FROM users WHERE role = 'organiser' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
  );
  const [[cat]] = await pool.query(
    "SELECT category_id FROM event_categories ORDER BY category_id LIMIT 1"
  );
  const start = opts.start || "DATE_ADD(NOW(), INTERVAL 14 DAY)";
  const end = opts.end || "DATE_ADD(NOW(), INTERVAL 14 DAY) + INTERVAL 2 HOUR";
  const deadline = opts.deadline || "DATE_ADD(NOW(), INTERVAL 7 DAY)";
  const [result] = await pool.query(
    `INSERT INTO events (
       organiser_id, category_id, event_name, description, location,
       start_datetime, end_datetime, registration_deadline,
       participant_capacity, volunteer_capacity, status
     ) VALUES (
       ?, ?, ?, ?, 'East Coast Park',
       ${start}, ${end}, ${deadline},
       ?, ?, ?
     )`,
    [
      org.user_id,
      cat.category_id,
      opts.name,
      opts.description || "Event-details integration test event.",
      opts.participant_capacity || 10,
      opts.volunteer_capacity || 10,
      opts.status || "Open"
    ]
  );
  createdEventIds.push(result.insertId);
  return result.insertId;
}

async function addRole(eventId, name) {
  const [result] = await pool.query(
    `INSERT INTO volunteer_roles (event_id, role_name, description, required_volunteers)
     VALUES (?, ?, 'Test role', 5)`,
    [eventId, name]
  );
  return result.insertId;
}

(async function main() {
  const memberA = await createMember("a");
  const memberB = await createMember("b");
  const memberC = await createMember("c");

  const openId = await createEvent({ name: "ED Open Joinable " + Date.now(), status: "Open", participant_capacity: 2, volunteer_capacity: 2 });
  const roleId = await addRole(openId, "Helper");

  const closedId = await createEvent({ name: "ED Closed " + Date.now(), status: "Closed" });
  const cancelledId = await createEvent({ name: "ED Cancelled " + Date.now(), status: "Cancelled" });
  const completedId = await createEvent({ name: "ED Completed " + Date.now(), status: "Completed" });
  const draftId = await createEvent({ name: "ED Draft " + Date.now(), status: "Draft" });
  const pastDeadlineId = await createEvent({
    name: "ED Past Deadline " + Date.now(),
    status: "Open",
    deadline: "DATE_SUB(NOW(), INTERVAL 1 DAY)",
    start: "DATE_ADD(NOW(), INTERVAL 10 DAY)",
    end: "DATE_ADD(NOW(), INTERVAL 10 DAY) + INTERVAL 2 HOUR"
  });
  const startedId = await createEvent({
    name: "ED Started " + Date.now(),
    status: "Open",
    deadline: "DATE_SUB(NOW(), INTERVAL 2 DAY)",
    start: "DATE_SUB(NOW(), INTERVAL 1 HOUR)",
    end: "DATE_ADD(NOW(), INTERVAL 1 HOUR)"
  });
  const fullPId = await createEvent({
    name: "ED Full Participants " + Date.now(),
    status: "Full",
    participant_capacity: 1,
    volunteer_capacity: 5
  });
  const fullVId = await createEvent({
    name: "ED Full Volunteers " + Date.now(),
    status: "Full",
    participant_capacity: 5,
    volunteer_capacity: 1
  });
  const fullVRole = await addRole(fullVId, "OnlyVol");

  // Fill participant capacity on fullPId
  await pool.query(
    `INSERT INTO event_registrations (event_id, user_id, participation_type, status)
     VALUES (?, ?, 'Participant', 'Confirmed')`,
    [fullPId, memberC.user_id]
  );
  // Fill volunteer capacity on fullVId
  await pool.query(
    `INSERT INTO event_registrations (event_id, user_id, participation_type, preferred_role_id, status)
     VALUES (?, ?, 'Volunteer', ?, 'Confirmed')`,
    [fullVId, memberC.user_id, fullVRole]
  );

  // 1. Open event, future deadline, no registration
  let aLogin = await login(memberA.email, PASSWORD);
  let page = await request("GET", "/events/" + openId, { headers: { Cookie: aLogin.cookie } });
  record(
    "1. Open event shows status + join form",
    page.status === 200
      && /Open for registration/.test(page.body)
      && /registrationForm/.test(page.body)
      && /Join as Participant/.test(page.body),
    "status=" + page.status
  );

  // Register A as Confirmed Participant
  let reg = await request("POST", "/events/" + openId + "/register", {
    body: "participation_type=Participant&notes=&volunteer_role_id=",
    headers: { Cookie: aLogin.cookie }
  });
  record("1b. Register Participant", reg.status === 302, "status=" + reg.status + " loc=" + reg.location);

  // 2. Existing Confirmed Participant
  page = await request("GET", "/events/" + openId, { headers: { Cookie: aLogin.cookie } });
  record(
    "2. Confirmed Participant — join hidden, Cancel visible",
    page.status === 200
      && /Your registration/.test(page.body)
      && /Confirmed/.test(page.body)
      && !/id="registrationForm"/.test(page.body)
      && /Cancel registration/.test(page.body)
      && /data-cancel-registration-id=/.test(page.body),
    "ok"
  );
  await logout(aLogin.cookie);

  // Waitlist volunteer B
  let bLogin = await login(memberB.email, PASSWORD);
  await request("POST", "/events/" + openId + "/register", {
    body: "participation_type=Volunteer&notes=&volunteer_role_id=" + encodeURIComponent(roleId),
    headers: { Cookie: bLogin.cookie }
  });
  // Force waitlist by filling volunteer slots then re-register? Capacity is 2 — need third volunteer for waitlist.
  // Simpler: set B waitlisted directly after insert, or fill capacity first.
  await pool.query(
    `UPDATE event_registrations
     SET status = 'Waitlisted', waiting_position = 1
     WHERE event_id = ? AND user_id = ?`,
    [openId, memberB.user_id]
  );
  page = await request("GET", "/events/" + openId, { headers: { Cookie: bLogin.cookie } });
  record(
    "3. Waitlisted Volunteer — position + Cancel",
    /Your registration/.test(page.body)
      && /Waitlisted/.test(page.body)
      && /Waiting-list position/.test(page.body)
      && /#1/.test(page.body)
      && /Cancel registration/.test(page.body)
      && /Helper/.test(page.body),
    "ok"
  );

  // 4. Cancel from event details (promotion path still via existing controller)
  const [[bReg]] = await pool.query(
    "SELECT registration_id FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [openId, memberB.user_id]
  );
  const cancelRes = await request("POST", "/registrations/" + bReg.registration_id + "/cancel", {
    headers: { Cookie: bLogin.cookie }
  });
  const [[bAfter]] = await pool.query(
    "SELECT status FROM event_registrations WHERE registration_id = ?",
    [bReg.registration_id]
  );
  record(
    "4. Cancel from event-details route still works",
    (cancelRes.status === 302 || cancelRes.status === 200) && bAfter.status === "Cancelled",
    "status=" + cancelRes.status + " reg=" + bAfter.status
  );
  await logout(bLogin.cookie);

  // 5. Full Participant capacity, Volunteer space
  aLogin = await login(memberA.email, PASSWORD);
  page = await request("GET", "/events/" + fullPId, { headers: { Cookie: aLogin.cookie } });
  record(
    "5. Full P / Volunteer space — join form + waitlist copy",
    /Full — waiting list available/.test(page.body)
      && /id="registrationForm"/.test(page.body)
      && /participant waiting list/i.test(page.body)
      && /volunteer spaces remaining/i.test(page.body),
    "ok"
  );

  // 6. Full Volunteer capacity, Participant space
  page = await request("GET", "/events/" + fullVId, { headers: { Cookie: aLogin.cookie } });
  record(
    "6. Full V / Participant space — join form + waitlist copy",
    /Full — waiting list available/.test(page.body)
      && /id="registrationForm"/.test(page.body)
      && /volunteer waiting list/i.test(page.body)
      && /participant spaces remaining/i.test(page.body),
    "ok"
  );

  // 7. Closed
  page = await request("GET", "/events/" + closedId, { headers: { Cookie: aLogin.cookie } });
  record(
    "7. Closed — visible, no join",
    page.status === 200
      && /Registration closed/.test(page.body)
      && !/id="registrationForm"/.test(page.body),
    "status=" + page.status
  );

  // 8. Draft absent from catalogue + details 404
  const catalogue = await request("GET", "/events");
  const draftDetail = await request("GET", "/events/" + draftId);
  record(
    "8. Draft hidden from catalogue and public details",
    catalogue.body.indexOf("ED Draft ") === -1 && draftDetail.status === 404,
    "detailStatus=" + draftDetail.status
  );

  // 9. Cancelled — no join
  page = await request("GET", "/events/" + cancelledId);
  record(
    "9. Cancelled — no join form",
    page.status === 200 && /Event cancelled/.test(page.body) && !/id="registrationForm"/.test(page.body),
    "status=" + page.status
  );

  // 10. Completed — no join
  page = await request("GET", "/events/" + completedId);
  record(
    "10. Completed — no join form",
    page.status === 200 && /Event completed/.test(page.body) && !/id="registrationForm"/.test(page.body),
    "status=" + page.status
  );

  // 11. Deadline passed
  page = await request("GET", "/events/" + pastDeadlineId, { headers: { Cookie: aLogin.cookie } });
  record(
    "11. Deadline passed — no join + reason",
    !/id="registrationForm"/.test(page.body)
      && /Registration deadline has passed/.test(page.body),
    "ok"
  );

  // 12. Event started
  page = await request("GET", "/events/" + startedId, { headers: { Cookie: aLogin.cookie } });
  record(
    "12. Event started — no join + reason",
    !/id="registrationForm"/.test(page.body)
      && (/Event has started/.test(page.body) || /Registration deadline has passed/.test(page.body)),
    "ok"
  );
  await logout(aLogin.cookie);

  // 13. Anonymous cannot register via DEV_USER_ID
  const anon = await request("POST", "/events/" + openId + "/register", {
    body: "participation_type=Participant&notes=&volunteer_role_id="
  });
  record(
    "13. Anonymous register blocked (no DEV_USER_ID)",
    anon.status === 302 && String(anon.location).indexOf("/login") !== -1,
    "status=" + anon.status + " loc=" + anon.location
  );
  const anonPage = await request("GET", "/events/" + openId);
  record(
    "13b. Anonymous details — null registration, may view",
    anonPage.status === 200
      && /Open for registration/.test(anonPage.body)
      && /id="registrationForm"/.test(anonPage.body)
      && !/Your registration/.test(anonPage.body),
    "ok"
  );

  // 14. My Registrations cancellation still works
  aLogin = await login(memberA.email, PASSWORD);
  const mine = await request("GET", "/member/registrations", { headers: { Cookie: aLogin.cookie } });
  const [[aReg]] = await pool.query(
    "SELECT registration_id, status FROM event_registrations WHERE event_id = ? AND user_id = ?",
    [openId, memberA.user_id]
  );
  const cancelMine = await request("POST", "/registrations/" + aReg.registration_id + "/cancel", {
    headers: { Cookie: aLogin.cookie }
  });
  const [[aAfter]] = await pool.query(
    "SELECT status FROM event_registrations WHERE registration_id = ?",
    [aReg.registration_id]
  );
  record(
    "14. My Registrations cancellation still works",
    mine.status === 200 && aAfter.status === "Cancelled" && (cancelMine.status === 302 || cancelMine.status === 200),
    "mine=" + mine.status + " after=" + aAfter.status
  );
  await logout(aLogin.cookie);

  // Cleanup
  if (createdEventIds.length) {
    await pool.query(
      "DELETE FROM events WHERE event_id IN (" + createdEventIds.map(function () { return "?"; }).join(",") + ")",
      createdEventIds
    );
  }
  if (createdUserIds.length) {
    await pool.query(
      "DELETE FROM users WHERE user_id IN (" + createdUserIds.map(function () { return "?"; }).join(",") + ")",
      createdUserIds
    );
  }
  record("Cleanup temp rows", true, "events=" + createdEventIds.join(",") + " users=" + createdUserIds.join(","));

  const failed = results.filter(function (r) { return !r.ok; });
  console.log("\nSummary: " + (results.length - failed.length) + "/" + results.length + " passed");
  if (failed.length) {
    failed.forEach(function (f) { console.log("FAIL: " + f.name + " — " + f.detail); });
    process.exitCode = 1;
  } else {
    console.log("EVENT_DETAILS_REGISTRATION_COMPLETE_AND_WORKING");
  }
  await pool.end();
})().catch(async function (err) {
  console.error(err);
  try {
    if (createdEventIds.length) {
      await pool.query(
        "DELETE FROM events WHERE event_id IN (" + createdEventIds.map(function () { return "?"; }).join(",") + ")",
        createdEventIds
      );
    }
    if (createdUserIds.length) {
      await pool.query(
        "DELETE FROM users WHERE user_id IN (" + createdUserIds.map(function () { return "?"; }).join(",") + ")",
        createdUserIds
      );
    }
    await pool.end();
  } catch (e) { /* ignore */ }
  process.exit(1);
});
