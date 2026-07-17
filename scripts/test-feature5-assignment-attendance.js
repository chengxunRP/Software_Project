/**
 * Feature 5 — Volunteer roles, assignment, attendance verification.
 * Creates a temporary Open event, runs UI-style HTTP + MySQL checks, cleans up.
 * Run: node scripts/test-feature5-assignment-attendance.js
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
  let roleId2 = null;
  let orgCookie = "";

  const [[organiser]] = await pool.query(
    `SELECT user_id, email FROM users
     WHERE role = 'organiser' AND account_status = 'Active'
     ORDER BY user_id ASC LIMIT 1`
  );
  if (!organiser) throw new Error("No active organiser found.");

  const [members] = await pool.query(
    `SELECT user_id, email, name FROM users
     WHERE role = 'community_member' AND account_status = 'Active'
     ORDER BY user_id ASC LIMIT 4`
  );
  if (members.length < 4) throw new Error("Need at least 4 active community_member accounts.");

  const volA = members[0];
  const volB = members[1];
  const participant = members[2];
  const waitlistedVol = members[3];

  const [[category]] = await pool.query(
    "SELECT category_id FROM event_categories ORDER BY category_id LIMIT 1"
  );

  try {
    // Temporary Open event: P=2, V=1 so one volunteer becomes Waitlisted
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
        "F5 Test Event " + stamp,
        "Feature 5 assignment/attendance verification",
        "2026-09-20 10:00:00",
        "2026-09-20 13:00:00",
        "F5 Test Venue",
        "2026-09-19 18:00:00"
      ]
    );
    eventId = ins.insertId;

    const orgLogin = await login(organiser.email, PASSWORD);
    orgCookie = orgLogin.cookie;
    record("Organiser login", orgLogin.res.status === 302 || orgLogin.res.status === 200, "status=" + orgLogin.res.status);

    // 1. Create Volunteer role
    const createRole = await request("POST", "/organiser/events/" + eventId + "/roles", {
      body: "role_name=" + encodeURIComponent("Greeter") +
        "&description=" + encodeURIComponent("Welcome guests") +
        "&required_volunteers=2",
      headers: { Cookie: orgCookie }
    });
    record("1 Create volunteer role (HTTP)", createRole.status === 302, "status=" + createRole.status);

    const [roles] = await pool.query(
      "SELECT role_id, role_name, required_volunteers FROM volunteer_roles WHERE event_id = ? AND role_name = ?",
      [eventId, "Greeter"]
    );
    roleId = roles[0] && roles[0].role_id;
    record("2 Role appears in MySQL", !!roleId, roleId ? "role_id=" + roleId : "missing");

    // Edit role
    const editRole = await request("POST", "/organiser/events/" + eventId + "/roles/" + roleId + "/edit", {
      body: "role_name=" + encodeURIComponent("Greeter Lead") +
        "&description=" + encodeURIComponent("Welcome guests at door") +
        "&required_volunteers=2",
      headers: { Cookie: orgCookie }
    });
    const [[edited]] = await pool.query(
      "SELECT role_name FROM volunteer_roles WHERE role_id = ?",
      [roleId]
    );
    record("Edit role", editRole.status === 302 && edited.role_name === "Greeter Lead", edited.role_name);

    // Registrations: confirmed volunteer (capacity 1), waitlisted volunteer, participant
    const loginA = await login(volA.email, PASSWORD);
    await register(loginA.cookie, eventId, "Volunteer", roleId);
    const loginW = await login(waitlistedVol.email, PASSWORD);
    await register(loginW.cookie, eventId, "Volunteer", roleId);
    const loginP = await login(participant.email, PASSWORD);
    await register(loginP.cookie, eventId, "Participant", null);

    // Extra confirmed volunteer via capacity bump so we can assign without waitlist conflict
    await pool.query(
      "UPDATE events SET volunteer_capacity = 2 WHERE event_id = ?",
      [eventId]
    );
    // Promote waitlisted if still waitlisted after bump — Feature 4 may auto-promote on cancel only;
    // insert second confirmed volunteer B by direct registration after capacity bump.
    const loginB = await login(volB.email, PASSWORD);
    await register(loginB.cookie, eventId, "Volunteer", roleId);

    const [[regVol]] = await pool.query(
      `SELECT registration_id, status FROM event_registrations
       WHERE event_id = ? AND user_id = ? AND participation_type = 'Volunteer'`,
      [eventId, volA.user_id]
    );
    const [[regWait]] = await pool.query(
      `SELECT registration_id, status FROM event_registrations
       WHERE event_id = ? AND user_id = ? AND participation_type = 'Volunteer'`,
      [eventId, waitlistedVol.user_id]
    );
    const [[regPart]] = await pool.query(
      `SELECT registration_id, status FROM event_registrations
       WHERE event_id = ? AND user_id = ? AND participation_type = 'Participant'`,
      [eventId, participant.user_id]
    );
    const [[regVolB]] = await pool.query(
      `SELECT registration_id, status FROM event_registrations
       WHERE event_id = ? AND user_id = ? AND participation_type = 'Volunteer'`,
      [eventId, volB.user_id]
    );

    record("Setup Confirmed Volunteer A", regVol && regVol.status === "Confirmed", regVol && regVol.status);
    record("Setup Waitlisted Volunteer", regWait && regWait.status === "Waitlisted", regWait && regWait.status);
    record("Setup Participant", regPart && regPart.status === "Confirmed", regPart && regPart.status);
    record("Setup Confirmed Volunteer B", regVolB && regVolB.status === "Confirmed", regVolB && regVolB.status);

    // 3. Assign confirmed volunteer
    const assignOk = await request("POST", "/organiser/events/" + eventId + "/roles/" + roleId + "/assign", {
      body: "registration_ids=" + encodeURIComponent(regVol.registration_id),
      headers: { Cookie: orgCookie }
    });
    const [[assignRow]] = await pool.query(
      "SELECT assignment_id, role_id FROM volunteer_assignments WHERE registration_id = ?",
      [regVol.registration_id]
    );
    record("3 Assign confirmed Volunteer", assignOk.status === 302 && !!assignRow, assignRow && ("assignment_id=" + assignRow.assignment_id));

    // 4. Assignment appears
    const volList = await request("GET", "/organiser/events/" + eventId + "/volunteers", {
      headers: { Cookie: orgCookie }
    });
    record("4 Assignment visible on volunteer list", volList.status === 200 && volList.body.indexOf(volA.name) !== -1, "HTTP " + volList.status);

    // 5. Attempt assign Participant
    const assignPart = await request("POST", "/organiser/events/" + eventId + "/roles/" + roleId + "/assign", {
      body: "registration_ids=" + encodeURIComponent(regPart.registration_id),
      headers: { Cookie: orgCookie }
    });
    const [[badPart]] = await pool.query(
      "SELECT assignment_id FROM volunteer_assignments WHERE registration_id = ?",
      [regPart.registration_id]
    );
    record("5 Reject Participant assignment", !badPart && (assignPart.status === 200 || assignPart.status === 400 || assignPart.status === 302), "status=" + assignPart.status);

    // 6. Attempt assign Waitlisted Volunteer
    const assignWait = await request("POST", "/organiser/events/" + eventId + "/roles/" + roleId + "/assign", {
      body: "registration_ids=" + encodeURIComponent(regWait.registration_id),
      headers: { Cookie: orgCookie }
    });
    const [[badWait]] = await pool.query(
      "SELECT assignment_id FROM volunteer_assignments WHERE registration_id = ?",
      [regWait.registration_id]
    );
    record("6 Reject Waitlisted Volunteer assignment", !badWait, "status=" + assignWait.status);

    // Duplicate assignment of same volunteer to another role
    const createRole2 = await request("POST", "/organiser/events/" + eventId + "/roles", {
      body: "role_name=" + encodeURIComponent("Runner") +
        "&description=" + encodeURIComponent("Errands") +
        "&required_volunteers=1",
      headers: { Cookie: orgCookie }
    });
    const [[r2]] = await pool.query(
      "SELECT role_id FROM volunteer_roles WHERE event_id = ? AND role_name = ?",
      [eventId, "Runner"]
    );
    roleId2 = r2 && r2.role_id;
    const dupAssign = await request("POST", "/organiser/events/" + eventId + "/roles/" + roleId2 + "/assign", {
      body: "registration_ids=" + encodeURIComponent(regVol.registration_id),
      headers: { Cookie: orgCookie }
    });
    const [[{ dupCount }]] = await pool.query(
      "SELECT COUNT(*) AS dupCount FROM volunteer_assignments WHERE registration_id = ?",
      [regVol.registration_id]
    );
    record("Prevent duplicate assignment", Number(dupCount) === 1, "count=" + dupCount + " http=" + dupAssign.status + " role2=" + createRole2.status);

    // 7. Check-in (Mark Attended)
    const markAttended = await request("POST", "/organiser/events/" + eventId + "/attendance", {
      body: "registration_id=" + encodeURIComponent(regVol.registration_id) +
        "&attendance_status=Attended",
      headers: { Cookie: orgCookie }
    });
    const [[attA]] = await pool.query(
      `SELECT attendance_status, check_in_time, check_out_time, volunteer_hours
       FROM attendance WHERE registration_id = ?`,
      [regVol.registration_id]
    );
    record("7 Record check-in / Mark Attended", markAttended.status === 302 && attA && attA.attendance_status === "Attended" && !!attA.check_in_time,
      attA ? (attA.attendance_status + " in=" + !!attA.check_in_time) : "missing");

    // 8. Check-out
    const checkOut = await request("POST", "/organiser/events/" + eventId + "/attendance/checkout", {
      body: "registration_id=" + encodeURIComponent(regVol.registration_id),
      headers: { Cookie: orgCookie }
    });
    const [[attOut]] = await pool.query(
      "SELECT check_out_time FROM attendance WHERE registration_id = ?",
      [regVol.registration_id]
    );
    record("8 Record check-out", checkOut.status === 302 && !!attOut.check_out_time, attOut && String(attOut.check_out_time));

    // 9 already covered by Mark Attended above
    record("9 Mark Volunteer Attended", attA && attA.attendance_status === "Attended", attA && attA.attendance_status);

    // 10. Mark another registration Absent (Participant)
    const markAbsent = await request("POST", "/organiser/events/" + eventId + "/attendance", {
      body: "registration_id=" + encodeURIComponent(regPart.registration_id) +
        "&attendance_status=Absent",
      headers: { Cookie: orgCookie }
    });
    const [[attP]] = await pool.query(
      `SELECT attendance_status, check_in_time, volunteer_hours
       FROM attendance WHERE registration_id = ?`,
      [regPart.registration_id]
    );
    record("10 Mark Participant Absent", markAbsent.status === 302 && attP && attP.attendance_status === "Absent" && !attP.check_in_time,
      attP ? (attP.attendance_status + " hours=" + attP.volunteer_hours) : "missing");
    record("Participant hours remain 0", attP && Number(attP.volunteer_hours) === 0, attP && String(attP.volunteer_hours));
    record("Volunteer hours stored as 0 (no Feature 6 calc)", attA && Number(attA.volunteer_hours) === 0, attA && String(attA.volunteer_hours));

    // 11. Duplicate attendance
    const dupAtt = await request("POST", "/organiser/events/" + eventId + "/attendance", {
      body: "registration_id=" + encodeURIComponent(regVol.registration_id) +
        "&attendance_status=Attended",
      headers: { Cookie: orgCookie }
    });
    const [[{ attCount }]] = await pool.query(
      "SELECT COUNT(*) AS attCount FROM attendance WHERE registration_id = ?",
      [regVol.registration_id]
    );
    record("11 Prevent duplicate attendance", Number(attCount) === 1 && dupAtt.status === 302, "count=" + attCount);

    // 12. Attendance page matches MySQL
    const attPage = await request("GET", "/organiser/events/" + eventId + "/attendance", {
      headers: { Cookie: orgCookie }
    });
    const pageOk = attPage.status === 200
      && attPage.body.indexOf(volA.name) !== -1
      && attPage.body.indexOf(participant.name) !== -1
      && attPage.body.indexOf("Attended") !== -1
      && attPage.body.indexOf("Absent") !== -1;
    record("12 Attendance list matches MySQL", pageOk, "HTTP " + attPage.status);

    // Safe delete: refuse while assigned
    const delBlocked = await request("POST", "/organiser/events/" + eventId + "/roles/" + roleId + "/delete", {
      headers: { Cookie: orgCookie }
    });
    const [[stillRole]] = await pool.query("SELECT role_id FROM volunteer_roles WHERE role_id = ?", [roleId]);
    record("Safe delete blocked while assigned", !!stillRole && delBlocked.status === 302, "status=" + delBlocked.status);

    // Unassign then delete empty role2
    if (roleId2) {
      await request("POST", "/organiser/events/" + eventId + "/roles/" + roleId2 + "/delete", {
        headers: { Cookie: orgCookie }
      });
      const [[gone2]] = await pool.query("SELECT role_id FROM volunteer_roles WHERE role_id = ?", [roleId2]);
      record("Delete empty role", !gone2, gone2 ? "still exists" : "deleted");
    }

  } catch (err) {
    record("Unhandled error", false, err.message);
    console.error(err);
  } finally {
    if (eventId) {
      // Cascade cleans registrations/roles/assignments/attendance via FKs where configured
      await pool.query("DELETE FROM attendance WHERE registration_id IN (SELECT registration_id FROM event_registrations WHERE event_id = ?)", [eventId]).catch(function () {});
      await pool.query("DELETE FROM volunteer_assignments WHERE role_id IN (SELECT role_id FROM volunteer_roles WHERE event_id = ?)", [eventId]).catch(function () {});
      await pool.query("DELETE FROM volunteer_roles WHERE event_id = ?", [eventId]).catch(function () {});
      await pool.query("DELETE FROM event_registrations WHERE event_id = ?", [eventId]).catch(function () {});
      await pool.query("DELETE FROM events WHERE event_id = ?", [eventId]).catch(function () {});
    }
    await pool.end();
  }

  const failed = results.filter(function (r) { return !r.ok; });
  console.log("\nFeature 5 summary: " + (results.length - failed.length) + "/" + results.length + " passed");
  if (failed.length) {
    process.exitCode = 1;
    failed.forEach(function (f) { console.log("  FAIL: " + f.name + " — " + f.detail); });
  }
})();
