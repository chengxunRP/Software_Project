require("dotenv").config();
const http = require("http");
const pool = require("../config/database");

function get(path, cookie) {
  return new Promise(function (resolve, reject) {
    http.get(
      {
        hostname: "127.0.0.1",
        port: 3000,
        path: path,
        headers: cookie ? { Cookie: cookie } : {}
      },
      function (res) {
        let d = "";
        res.on("data", function (c) { d += c; });
        res.on("end", function () {
          resolve({ status: res.statusCode, headers: res.headers, body: d });
        });
      }
    ).on("error", reject);
  });
}

function post(path, body, cookie) {
  return new Promise(function (resolve, reject) {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 3000,
        path: path,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          Cookie: cookie || ""
        }
      },
      function (res) {
        let d = "";
        res.on("data", function (c) { d += c; });
        res.on("end", function () {
          resolve({ status: res.statusCode, headers: res.headers, body: d });
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function jar(headers) {
  const set = headers["set-cookie"];
  if (!set) return "";
  return (Array.isArray(set) ? set : [set]).map(function (c) {
    return c.split(";")[0];
  }).join("; ");
}

async function login(email) {
  const page = await get("/login");
  let cookie = jar(page.headers);
  const res = await post(
    "/login",
    "email=" + encodeURIComponent(email) + "&password=" + encodeURIComponent("Password123!"),
    cookie
  );
  cookie = jar(res.headers) || cookie;
  return cookie;
}

function countEventCards(html) {
  return (html.match(/class="event-card"/g) || []).length;
}

(async function () {
  const [[m]] = await pool.query(
    "SELECT COUNT(*) AS t FROM users WHERE role = 'community_member' AND account_status = 'Active'"
  );
  const [[o]] = await pool.query(
    "SELECT COUNT(*) AS t FROM users WHERE role = 'organiser' AND account_status = 'Active'"
  );
  const [[e]] = await pool.query("SELECT COUNT(*) AS t FROM events");
  const [[h]] = await pool.query(`
    SELECT COALESCE(SUM(a.volunteer_hours), 0) AS t
    FROM attendance a
    JOIN event_registrations r ON r.registration_id = a.registration_id
    WHERE r.participation_type = 'Volunteer' AND a.attendance_status = 'Attended'
  `);

  const home = await get("/");
  const cat = await get("/events");

  const [[org]] = await pool.query(
    "SELECT user_id, email FROM users WHERE role = 'organiser' AND account_status = 'Active' LIMIT 1"
  );
  const oCookie = await login(org.email);
  const [[oStats]] = await pool.query(
    "SELECT COUNT(*) AS total FROM events WHERE organiser_id = ?",
    [org.user_id]
  );
  const [[cp]] = await pool.query(`
    SELECT COUNT(*) AS t FROM event_registrations r
    JOIN events e ON e.event_id = r.event_id
    WHERE e.organiser_id = ? AND r.participation_type = 'Participant' AND r.status = 'Confirmed'
  `, [org.user_id]);
  const [[cv]] = await pool.query(`
    SELECT COUNT(*) AS t FROM event_registrations r
    JOIN events e ON e.event_id = r.event_id
    WHERE e.organiser_id = ? AND r.participation_type = 'Volunteer' AND r.status = 'Confirmed'
  `, [org.user_id]);
  const od = await get("/organiser/dashboard", oCookie);
  const oe = await get("/organiser/events", oCookie);
  const manageRows = (oe.body.match(/table-cc-row/g) || []).length;

  const [[adm]] = await pool.query("SELECT email FROM users WHERE role = 'admin' LIMIT 1");
  const aCookie = await login(adm.email);
  const [[users]] = await pool.query("SELECT COUNT(*) AS t FROM users");
  const [[cats]] = await pool.query("SELECT COUNT(*) AS t FROM event_categories");
  const [[regs]] = await pool.query("SELECT COUNT(*) AS t FROM event_registrations");
  const ad = await get("/admin/dashboard", aCookie);
  const au = await get("/admin/users", aCookie);
  const ac = await get("/admin/categories", aCookie);

  const [[mh]] = await pool.query(`
    SELECT r.user_id, u.email, COALESCE(SUM(a.volunteer_hours), 0) AS hours,
           COUNT(*) AS attended
    FROM attendance a
    JOIN event_registrations r ON r.registration_id = a.registration_id
    JOIN users u ON u.user_id = r.user_id
    WHERE r.participation_type = 'Volunteer' AND a.attendance_status = 'Attended'
    GROUP BY r.user_id, u.email
    ORDER BY hours DESC
    LIMIT 1
  `);

  let memberReport = null;
  if (mh) {
    const mCookie = await login(mh.email);
    const vh = await get("/member/volunteer-hours", mCookie);
    const md = await get("/member/dashboard", mCookie);
    const [[nCount]] = await pool.query(
      "SELECT COUNT(*) AS t FROM notifications WHERE user_id = ?",
      [mh.user_id]
    );
    const hoursNum = Number(mh.hours);
    const hoursLabel = Number.isInteger(hoursNum)
      ? String(hoursNum)
      : hoursNum.toLocaleString("en-SG", { maximumFractionDigits: 2 });
    memberReport = {
      email: mh.email,
      mysqlHours: hoursNum,
      mysqlAttended: mh.attended,
      mysqlNotifications: nCount.t,
      hoursPageShows: vh.body.includes(hoursLabel),
      dashboardShowsHours: md.body.includes(hoursLabel)
    };
  }

  const out = {
    homepage: {
      mysql: { members: m.t, organisers: o.t, events: e.t, hours: Number(h.t) },
      featuredCards: countEventCards(home.body),
      statsVisible: {
        members: home.body.includes(String(m.t)),
        organisers: home.body.includes(String(o.t)),
        events: home.body.includes(String(e.t)),
        hours: home.body.includes(String(Number(h.t)))
      }
    },
    catalogue: {
      mysqlTotal: e.t,
      cards: countEventCards(cat.body),
      match: e.t === countEventCards(cat.body)
    },
    organiser: {
      mysqlEvents: oStats.total,
      mysqlConfirmedP: cp.t,
      mysqlConfirmedV: cv.t,
      manageEventRows: manageRows,
      dashShowsEventCount: od.body.includes(String(oStats.total)),
      dashShowsP: od.body.includes(String(cp.t)),
      dashShowsV: od.body.includes(String(cv.t))
    },
    admin: {
      mysqlUsers: users.t,
      mysqlCategories: cats.t,
      mysqlRegs: regs.t,
      dashShowsUsers: ad.body.includes(String(users.t)),
      userRowsApprox: (au.body.match(/table-cc-row/g) || []).length,
      categoryRowsApprox: (ac.body.match(/table-cc-row/g) || []).length
    },
    memberReport: memberReport
  };

  console.log(JSON.stringify(out, null, 2));
  await pool.end();
})().catch(async function (err) {
  console.error(err);
  try { await pool.end(); } catch (e) { /* ignore */ }
  process.exit(1);
});
