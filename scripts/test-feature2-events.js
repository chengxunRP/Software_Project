/**
 * Feature 2 — Event and Category Management UI tests.
 * Run: node scripts/test-feature2-events.js
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

function encode(obj) {
  return Object.keys(obj).map(function (k) {
    return encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]);
  }).join("&");
}

function futureLocal(daysAhead, hour) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  const pad = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

(async function main() {
  const stamp = Date.now();
  const catName = "Feature2 Cat " + stamp;
  const eventName = "Feature2 Event " + stamp;
  let categoryId = null;
  let eventId = null;
  let secondOrganiserId = null;
  let secondOrganiserEmail = null;

  const [[admin]] = await pool.query(
    "SELECT email FROM users WHERE role = 'admin' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
  );
  const [[organiser]] = await pool.query(
    "SELECT user_id, email FROM users WHERE role = 'organiser' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
  );

  // 1. Login as organiser
  const oLogin = await login(organiser.email, PASSWORD);
  record("1. Log in as organiser", oLogin.res.status === 302 && oLogin.res.location === "/organiser/dashboard", oLogin.res.location);

  // 2. Create category as admin
  const aLogin = await login(admin.email, PASSWORD);
  const createCat = await request("POST", "/admin/categories", {
    body: encode({ category_name: catName, description: "Feature 2 test category" }),
    headers: { Cookie: aLogin.cookie }
  });
  const [[cat]] = await pool.query(
    "SELECT category_id, category_name FROM event_categories WHERE category_name = ? LIMIT 1",
    [catName]
  );
  categoryId = cat && cat.category_id;
  record("2. Create test category", createCat.status === 302 && Boolean(categoryId), "category_id=" + categoryId);
  await logout(aLogin.cookie);

  // 3. Create event with dual capacities
  const start = futureLocal(14, 10);
  const end = futureLocal(14, 12);
  const deadline = futureLocal(13, 18);
  const createEv = await request("POST", "/organiser/events", {
    body: encode({
      event_name: eventName,
      category_id: categoryId,
      description: "Feature 2 automated test event with dual capacities.",
      location: "Test Community Hall",
      start_datetime: start,
      end_datetime: end,
      registration_deadline: deadline,
      participant_capacity: 20,
      volunteer_capacity: 8,
      status: "Published"
    }),
    headers: { Cookie: oLogin.cookie }
  });
  const [[ev]] = await pool.query(
    "SELECT event_id, organiser_id, participant_capacity, volunteer_capacity, status, location FROM events WHERE event_name = ? LIMIT 1",
    [eventName]
  );
  eventId = ev && ev.event_id;
  record(
    "3. Create event with Participant + Volunteer capacities",
    createEv.status === 302 && ev && Number(ev.participant_capacity) === 20 && Number(ev.volunteer_capacity) === 8 && ev.status === "Open",
    "event_id=" + eventId + " status=" + (ev && ev.status) + " location=" + createEv.location
  );

  // 4. Confirm in MySQL
  record(
    "4. Event appears in MySQL owned by organiser",
    ev && Number(ev.organiser_id) === Number(organiser.user_id),
    "organiser_id=" + (ev && ev.organiser_id)
  );

  // 5. Appears in Manage Events
  const list = await request("GET", "/organiser/events", { headers: { Cookie: oLogin.cookie } });
  record("5. Event appears in Manage Events", list.status === 200 && list.body.includes(eventName), "status=" + list.status);

  // 6–7. Edit location, capacity, status
  const edit = await request("POST", "/organiser/events/" + eventId + "/edit", {
    body: encode({
      event_name: eventName,
      category_id: categoryId,
      description: "Feature 2 automated test event with dual capacities.",
      location: "Updated Test Hall",
      start_datetime: start,
      end_datetime: end,
      registration_deadline: deadline,
      participant_capacity: 25,
      volunteer_capacity: 10,
      status: "Draft"
    }),
    headers: { Cookie: oLogin.cookie }
  });
  const [[ev2]] = await pool.query(
    "SELECT location, participant_capacity, volunteer_capacity, status FROM events WHERE event_id = ?",
    [eventId]
  );
  record(
    "6–7. Edit location/capacity/status persisted",
    edit.status === 302 &&
      ev2.location === "Updated Test Hall" &&
      Number(ev2.participant_capacity) === 25 &&
      Number(ev2.volunteer_capacity) === 10 &&
      ev2.status === "Draft",
    JSON.stringify(ev2)
  );

  const editPage = await request("GET", "/organiser/events/" + eventId + "/edit", {
    headers: { Cookie: oLogin.cookie }
  });
  record(
    "Refresh edit form shows changes",
    editPage.status === 200 && editPage.body.includes("Updated Test Hall") && editPage.body.includes('value="25"'),
    "status=" + editPage.status
  );

  // View public event page
  const view = await request("GET", "/events/" + eventId);
  record("View event page", view.status === 200 && view.body.includes(eventName), "status=" + view.status);

  // 8. Another organiser cannot edit
  // Promote a community_member temporarily
  const [[member]] = await pool.query(
    "SELECT user_id, email FROM users WHERE role = 'community_member' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
  );
  secondOrganiserId = member.user_id;
  secondOrganiserEmail = member.email;
  await pool.query("UPDATE users SET role = 'organiser' WHERE user_id = ?", [secondOrganiserId]);
  const o2 = await login(secondOrganiserEmail, PASSWORD);
  const steal = await request("POST", "/organiser/events/" + eventId + "/edit", {
    body: encode({
      event_name: "Hijacked",
      category_id: categoryId,
      description: "should fail",
      location: "Nowhere",
      start_datetime: start,
      end_datetime: end,
      registration_deadline: deadline,
      participant_capacity: 1,
      volunteer_capacity: 1,
      status: "Published"
    }),
    headers: { Cookie: o2.cookie }
  });
  const getSteal = await request("GET", "/organiser/events/" + eventId + "/edit", {
    headers: { Cookie: o2.cookie }
  });
  const [[still]] = await pool.query("SELECT event_name FROM events WHERE event_id = ?", [eventId]);
  record(
    "8. Other organiser cannot edit",
    (steal.status === 403 || getSteal.status === 404 || getSteal.status === 403) && still.event_name === eventName,
    "post=" + steal.status + " get=" + getSteal.status + " name=" + still.event_name
  );
  await logout(o2.cookie);
  await pool.query("UPDATE users SET role = 'community_member' WHERE user_id = ?", [secondOrganiserId]);

  // 9. Delete event
  const del = await request("POST", "/organiser/events/" + eventId + "/delete", {
    headers: { Cookie: oLogin.cookie }
  });
  const [[gone]] = await pool.query("SELECT event_id FROM events WHERE event_id = ?", [eventId]);
  record("9. Delete test event", del.status === 302 && !gone, "status=" + del.status);
  await logout(oLogin.cookie);

  // Edit category then delete safely
  const aLogin2 = await login(admin.email, PASSWORD);
  const updCat = await request("POST", "/admin/categories/" + categoryId + "/edit", {
    body: encode({ category_name: catName + " Updated", description: "Updated desc" }),
    headers: { Cookie: aLogin2.cookie }
  });
  const [[cat2]] = await pool.query(
    "SELECT category_name, description FROM event_categories WHERE category_id = ?",
    [categoryId]
  );
  record(
    "Edit category",
    updCat.status === 302 && cat2.category_name === catName + " Updated",
    cat2.category_name
  );

  // Unsafe delete: use an existing category with events
  const [[used]] = await pool.query(
    `SELECT c.category_id FROM event_categories c
     INNER JOIN events e ON e.category_id = c.category_id
     LIMIT 1`
  );
  if (used) {
    const unsafe = await request("POST", "/admin/categories/" + used.category_id + "/delete", {
      headers: { Cookie: aLogin2.cookie }
    });
    const [[stillUsed]] = await pool.query(
      "SELECT category_id FROM event_categories WHERE category_id = ?",
      [used.category_id]
    );
    record("Delete category blocked when in use", unsafe.status === 302 && Boolean(stillUsed), "kept=" + Boolean(stillUsed));
  }

  const delCat = await request("POST", "/admin/categories/" + categoryId + "/delete", {
    headers: { Cookie: aLogin2.cookie }
  });
  const [[catGone]] = await pool.query(
    "SELECT category_id FROM event_categories WHERE category_id = ?",
    [categoryId]
  );
  record("10. Delete test category safely", delCat.status === 302 && !catGone, "status=" + delCat.status);
  await logout(aLogin2.cookie);

  const failed = results.filter(function (r) { return !r.ok; });
  console.log("\nSummary: " + (results.length - failed.length) + "/" + results.length + " passed");
  if (failed.length) {
    failed.forEach(function (f) { console.log("FAIL: " + f.name + " — " + f.detail); });
    process.exitCode = 1;
  } else {
    console.log("FEATURE2_EVENT_CATEGORY_COMPLETE_AND_WORKING");
  }
  await pool.end();
})().catch(async function (err) {
  console.error(err);
  try { await pool.end(); } catch (e) { /* ignore */ }
  process.exit(1);
});
