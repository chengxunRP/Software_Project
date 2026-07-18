/**
 * Quick check: organiser nav hubs work for a newly created event (any event_id).
 * Run: node scripts/verify-organiser-nav-hubs.js
 */
require("dotenv").config();
const http = require("http");
const pool = require("../config/database");

const PORT = process.env.PORT || 3000;
const PASSWORD = "Password123!";

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
      hostname: "127.0.0.1", port: PORT, path: pathName, method: method, headers: headers, timeout: 15000
    }, function (res) {
      let data = "";
      res.on("data", function (c) { data += c; });
      res.on("end", function () {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

(async function () {
  const stamp = Date.now();
  const [[organiser]] = await pool.query(
    "SELECT user_id, email FROM users WHERE role = 'organiser' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
  );
  const [[category]] = await pool.query("SELECT category_id FROM event_categories ORDER BY category_id LIMIT 1");
  const [ins] = await pool.query(
    `INSERT INTO events (
       organiser_id, category_id, event_name, description,
       start_datetime, end_datetime, location,
       participant_capacity, volunteer_capacity, registration_deadline, status
     ) VALUES (?, ?, ?, ?, '2026-11-01 10:00:00', '2026-11-01 12:00:00', 'Nav Hub Venue', 5, 5, '2026-10-31 18:00:00', 'Open')`,
    [organiser.user_id, category.category_id, "Nav Hub Test " + stamp, "Temporary nav hub verification event"]
  );
  const eventId = ins.insertId;
  let failed = 0;
  function ok(name, pass, detail) {
    console.log((pass ? "PASS" : "FAIL") + " — " + name + (detail ? ": " + detail : ""));
    if (!pass) failed += 1;
  }

  try {
    ok("New event_id is not 1/2/11", [1, 2, 11].indexOf(Number(eventId)) === -1, "event_id=" + eventId);

    const page = await request("GET", "/login");
    let cookie = jar(page.headers);
    const login = await request("POST", "/login", {
      body: "email=" + encodeURIComponent(organiser.email) + "&password=" + encodeURIComponent(PASSWORD),
      headers: { Cookie: cookie }
    });
    cookie = mergeCookies(cookie, login.headers);

    const hubs = [
      ["/organiser/registrations", "/organiser/events/" + eventId + "/registrations"],
      ["/organiser/roles", "/organiser/events/" + eventId + "/roles"],
      ["/organiser/attendance", "/organiser/events/" + eventId + "/attendance"]
    ];
    for (let i = 0; i < hubs.length; i++) {
      const hub = await request("GET", hubs[i][0], { headers: { Cookie: cookie } });
      ok("Hub " + hubs[i][0] + " lists new event", hub.status === 200 && hub.body.indexOf(hubs[i][1]) !== -1, "status=" + hub.status);
      const dest = await request("GET", hubs[i][1], { headers: { Cookie: cookie } });
      ok("Open " + hubs[i][1], dest.status === 200, "status=" + dest.status);
      if (hubs[i][0] === "/organiser/attendance") {
        ok("No Finalise attendance button", dest.body.indexOf("Finalise attendance") === -1, "");
      }
    }

    const volunteers = await request("GET", "/organiser/events/" + eventId + "/volunteers", { headers: { Cookie: cookie } });
    ok("Volunteer list reachable", volunteers.status === 200, "status=" + volunteers.status);

    const manage = await request("GET", "/organiser/events", { headers: { Cookie: cookie } });
    ok("Manage Events has Regs/Roles/Attend links for new event",
      manage.status === 200
        && manage.body.indexOf("/organiser/events/" + eventId + "/registrations") !== -1
        && manage.body.indexOf("/organiser/events/" + eventId + "/roles") !== -1
        && manage.body.indexOf("/organiser/events/" + eventId + "/attendance") !== -1,
      "status=" + manage.status);

    const [[admin]] = await pool.query(
      "SELECT email FROM users WHERE role = 'admin' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
    );
    const adminPage = await request("GET", "/login");
    let adminCookie = jar(adminPage.headers);
    const adminLogin = await request("POST", "/login", {
      body: "email=" + encodeURIComponent(admin.email) + "&password=" + encodeURIComponent(PASSWORD),
      headers: { Cookie: adminCookie }
    });
    adminCookie = mergeCookies(adminCookie, adminLogin.headers);
    const reports = await request("GET", "/admin/reports", { headers: { Cookie: adminCookie } });
    ok("Admin reports has no Export CSV / date-range stub",
      reports.status === 200
        && reports.body.indexOf("Export CSV") === -1
        && reports.body.indexOf("Last 30 days") === -1,
      "status=" + reports.status);
  } finally {
    await pool.query("DELETE FROM events WHERE event_id = ?", [eventId]);
    await pool.end();
  }

  console.log(failed ? "\nNav hub summary: FAILED " + failed : "\nNav hub summary: all passed");
  process.exitCode = failed ? 1 : 0;
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
