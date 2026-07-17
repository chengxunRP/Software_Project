/**
 * Verify MySQL-backed pages against live database values.
 * Run with server already listening on PORT (default 3000):
 *   node scripts/verify-mysql-pages.js
 */
require("dotenv").config();
const http = require("http");
const pool = require("../config/database");

const PORT = process.env.PORT || 3000;
const BASE = "http://127.0.0.1:" + PORT;

function request(path, opts) {
  return new Promise(function (resolve, reject) {
    const url = new URL(path, BASE);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: (opts && opts.method) || "GET",
        headers: opts && opts.headers,
        timeout: 15000
      },
      function (res) {
        const chunks = [];
        res.on("data", function (c) { chunks.push(c); });
        res.on("end", function () {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("error", reject);
    if (opts && opts.body) req.write(opts.body);
    req.end();
  });
}

function cookieJar(setCookie) {
  if (!setCookie) return "";
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  return list.map(function (c) { return c.split(";")[0]; }).join("; ");
}

async function login(email, password) {
  const page = await request("/login");
  const cookies = cookieJar(page.headers["set-cookie"]);
  const body = "email=" + encodeURIComponent(email) + "&password=" + encodeURIComponent(password);
  const res = await request("/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
      Cookie: cookies
    },
    body: body
  });
  const next = cookieJar(res.headers["set-cookie"]) || cookies;
  return { status: res.status, location: res.headers.location, cookies: next };
}

function assertContains(html, needle, label) {
  if (!html.includes(needle)) {
    throw new Error(label + " — expected HTML to include: " + needle);
  }
}

async function main() {
  const report = [];

  // --- Homepage stats ---
  const [[members]] = await pool.query(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'community_member' AND account_status = 'Active'"
  );
  const [[organisers]] = await pool.query(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'organiser' AND account_status = 'Active'"
  );
  const [[eventsTotal]] = await pool.query("SELECT COUNT(*) AS total FROM events");
  const [[hours]] = await pool.query(`
    SELECT COALESCE(SUM(a.volunteer_hours), 0) AS total
    FROM attendance a
    INNER JOIN event_registrations r ON r.registration_id = a.registration_id
    WHERE r.participation_type = 'Volunteer' AND a.attendance_status = 'Attended'
  `);

  const home = await request("/");
  if (home.status !== 200) throw new Error("GET / status " + home.status);

  const memberStr = Number(members.total).toLocaleString("en-SG");
  const organiserStr = Number(organisers.total).toLocaleString("en-SG");
  const eventsStr = Number(eventsTotal.total).toLocaleString("en-SG");
  const hoursNum = Number(hours.total);
  const hoursStr = Number.isInteger(hoursNum)
    ? hoursNum.toLocaleString("en-SG")
    : hoursNum.toLocaleString("en-SG", { maximumFractionDigits: 2 });

  assertContains(home.body, memberStr, "Homepage active members");
  assertContains(home.body, organiserStr, "Homepage active organisers");
  assertContains(home.body, eventsStr, "Homepage events hosted");
  assertContains(home.body, hoursStr, "Homepage volunteer hours");

  report.push({
    page: "GET /",
    mysql: {
      activeMembers: members.total,
      activeOrganisers: organisers.total,
      eventsHosted: eventsTotal.total,
      volunteerHours: hours.total
    },
    displayed: { members: memberStr, organisers: organiserStr, events: eventsStr, hours: hoursStr },
    ok: true
  });

  // --- Event catalogue ---
  const eventsPage = await request("/events");
  if (eventsPage.status !== 200) throw new Error("GET /events status " + eventsPage.status);
  const [[catalogueCount]] = await pool.query(
    "SELECT COUNT(*) AS total FROM events WHERE status IN ('Open', 'Full', 'Closed', 'Completed')"
  );
  // Count cards by event-card class or similar - check publicEvents filter
  report.push({
    page: "GET /events",
    mysqlEventsTotal: eventsTotal.total,
    mysqlCatalogueStatuses: catalogueCount.total,
    httpStatus: eventsPage.status,
    ok: true
  });

  // --- Sample event detail ---
  const [[anyEvent]] = await pool.query(
    "SELECT event_id, event_name FROM events ORDER BY event_id ASC LIMIT 1"
  );
  if (anyEvent) {
    const detail = await request("/events/" + anyEvent.event_id);
    if (detail.status !== 200) throw new Error("GET /events/:id status " + detail.status);
    assertContains(detail.body, anyEvent.event_name, "Event details name");
    report.push({
      page: "GET /events/" + anyEvent.event_id,
      mysqlName: anyEvent.event_name,
      ok: true
    });
  }

  const missing = await request("/events/999999");
  report.push({
    page: "GET /events/999999",
    status: missing.status,
    ok: missing.status === 404
  });

  // --- Logins ---
  const [[memberUser]] = await pool.query(
    "SELECT email FROM users WHERE role = 'community_member' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
  );
  const [[organiserUser]] = await pool.query(
    "SELECT user_id, email FROM users WHERE role = 'organiser' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
  );
  const [[adminUser]] = await pool.query(
    "SELECT email FROM users WHERE role = 'admin' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
  );

  // Use known seed passwords from schema comments if present
  const passwords = {
    member: process.env.VERIFY_MEMBER_PASSWORD || "Password123!",
    organiser: process.env.VERIFY_ORGANISER_PASSWORD || "Password123!",
    admin: process.env.VERIFY_ADMIN_PASSWORD || "Password123!"
  };

  async function checkAuthed(role, email, password, paths) {
    const session = await login(email, password);
    if (session.status !== 302) {
      report.push({ role: role, email: email, loginStatus: session.status, ok: false, note: "login failed" });
      return null;
    }
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      const res = await request(p, { headers: { Cookie: session.cookies } });
      report.push({
        role: role,
        page: p,
        status: res.status,
        ok: res.status === 200,
        bodyHasSampleComment: /Temporary sample|Preview only — no backend/.test(res.body) === false
          ? "no sample markers"
          : "FOUND SAMPLE MARKERS"
      });
      if (res.status !== 200) {
        console.error("FAIL", role, p, res.status, res.body.slice(0, 200));
      }
    }
    return session;
  }

  if (memberUser) {
    const mSession = await checkAuthed("member", memberUser.email, passwords.member, [
      "/member/dashboard",
      "/member/registrations",
      "/member/volunteer-hours",
      "/member/profile"
    ]);
    if (mSession) {
      const [[mRow]] = await pool.query(
        "SELECT user_id FROM users WHERE email = ? LIMIT 1",
        [memberUser.email]
      );
      const [[mHours]] = await pool.query(
        `SELECT COALESCE(SUM(a.volunteer_hours), 0) AS total
         FROM attendance a
         INNER JOIN event_registrations r ON r.registration_id = a.registration_id
         WHERE r.user_id = ? AND r.participation_type = 'Volunteer' AND a.attendance_status = 'Attended'`,
        [mRow.user_id]
      );
      const dash = await request("/member/dashboard", { headers: { Cookie: mSession.cookies } });
      const hoursDisp = Number.isInteger(Number(mHours.total))
        ? Number(mHours.total).toLocaleString("en-SG")
        : Number(mHours.total).toLocaleString("en-SG", { maximumFractionDigits: 2 });
      report.push({
        page: "member dashboard hours",
        mysqlHours: mHours.total,
        displayedIncludes: dash.body.includes(hoursDisp),
        ok: dash.body.includes(hoursDisp)
      });
    }
  }

  if (organiserUser) {
    const oSession = await checkAuthed("organiser", organiserUser.email, passwords.organiser, [
      "/organiser/dashboard",
      "/organiser/events"
    ]);
    if (oSession) {
      const [[oCount]] = await pool.query(
        "SELECT COUNT(*) AS total FROM events WHERE organiser_id = ?",
        [organiserUser.user_id]
      );
      const [[ev]] = await pool.query(
        "SELECT event_id FROM events WHERE organiser_id = ? ORDER BY event_id LIMIT 1",
        [organiserUser.user_id]
      );
      if (ev) {
        await checkAuthed("organiser", organiserUser.email, passwords.organiser, [
          "/organiser/events/" + ev.event_id + "/edit",
          "/organiser/events/" + ev.event_id + "/registrations",
          "/organiser/events/" + ev.event_id + "/roles",
          "/organiser/events/" + ev.event_id + "/attendance"
        ]);
      }
      report.push({ organiserOwnedEvents: oCount.total });
    }
  }

  if (adminUser) {
    await checkAuthed("admin", adminUser.email, passwords.admin, [
      "/admin/dashboard",
      "/admin/users",
      "/admin/categories",
      "/admin/reports"
    ]);
  }

  console.log(JSON.stringify(report, null, 2));
  const failed = report.filter(function (r) { return r.ok === false; });
  if (failed.length) {
    console.error("FAILED checks:", failed.length);
    process.exit(1);
  }
  console.log("All checks passed.");
  await pool.end();
}

main().catch(async function (err) {
  console.error(err);
  try { await pool.end(); } catch (e) { /* ignore */ }
  process.exit(1);
});
