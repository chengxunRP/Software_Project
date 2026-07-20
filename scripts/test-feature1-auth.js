/**
 * Feature 1 — User Account, Role and Admin Management UI tests.
 * Run: node scripts/test-feature1-auth.js
 * Requires the app listening on PORT (default 3000).
 */
require("dotenv").config();
const http = require("http");
const bcrypt = require("bcrypt");
const pool = require("../config/database");

const PORT = process.env.PORT || 3000;
const PASSWORD = "Password123!";
const results = [];

function record(name, ok, detail) {
  results.push({ name: name, ok: ok, detail: detail || "" });
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (detail ? ": " + detail : ""));
}

function jar(headers) {
  const set = headers["set-cookie"];
  if (!set) return "";
  return (Array.isArray(set) ? set : [set]).map(function (c) {
    return c.split(";")[0];
  }).join("; ");
}

function mergeCookies(existing, headers) {
  const map = {};
  String(existing || "")
    .split(";")
    .map(function (p) { return p.trim(); })
    .filter(Boolean)
    .forEach(function (pair) {
      const i = pair.indexOf("=");
      if (i > 0) map[pair.slice(0, i)] = pair.slice(i + 1);
    });
  const fresh = jar(headers);
  fresh.split(";").map(function (p) { return p.trim(); }).filter(Boolean).forEach(function (pair) {
    const i = pair.indexOf("=");
    if (i > 0) map[pair.slice(0, i)] = pair.slice(i + 1);
  });
  return Object.keys(map).map(function (k) { return k + "=" + map[k]; }).join("; ");
}

function request(method, path, opts) {
  opts = opts || {};
  return new Promise(function (resolve, reject) {
    const body = opts.body || "";
    const headers = Object.assign({}, opts.headers || {});
    if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: path,
        method: method,
        headers: headers,
        timeout: 20000
      },
      function (res) {
        let data = "";
        res.on("data", function (c) { data += c; });
        res.on("end", function () {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
            location: res.headers.location || ""
          });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getLoginCookie() {
  const page = await request("GET", "/login");
  return jar(page.headers);
}

async function login(email, password) {
  let cookie = await getLoginCookie();
  const body =
    "email=" + encodeURIComponent(email) +
    "&password=" + encodeURIComponent(password);
  const res = await request("POST", "/login", {
    body: body,
    headers: { Cookie: cookie }
  });
  cookie = mergeCookies(cookie, res.headers);
  return { res: res, cookie: cookie };
}

async function logout(cookie) {
  return request("POST", "/logout", { headers: { Cookie: cookie || "" } });
}

(async function main() {
  const stamp = Date.now();
  const testEmail = "feature1.test." + stamp + "@example.sg";
  const testName = "Feature1 Test " + stamp;
  const testPassword = "TestPass123!";

  // 0. Pages load
  const regGet = await request("GET", "/register");
  record("GET /register", regGet.status === 200, "status=" + regGet.status);

  const loginGet = await request("GET", "/login");
  record("GET /login", loginGet.status === 200, "status=" + loginGet.status);

  // 1–3. Register + MySQL + bcrypt
  let cookie = jar(regGet.headers);
  const regBody =
    "full_name=" + encodeURIComponent(testName) +
    "&email=" + encodeURIComponent(testEmail) +
    "&password=" + encodeURIComponent(testPassword) +
    "&confirm_password=" + encodeURIComponent(testPassword) +
    "&terms=on";
  // Attempt self-assign role via body (must be ignored)
  const regBodyAttack = regBody + "&role=admin";
  const regPost = await request("POST", "/register", {
    body: regBodyAttack,
    headers: { Cookie: cookie }
  });
  record(
    "1. Register new community member",
    regPost.status === 302 && regPost.location === "/login",
    "status=" + regPost.status + " location=" + regPost.location
  );

  const [dbRows] = await pool.query(
    "SELECT user_id, name, email, password, role, account_status FROM users WHERE email = ? LIMIT 1",
    [testEmail]
  );
  const created = dbRows[0];
  record(
    "2. User appears in MySQL as community_member",
    Boolean(created) &&
      created.role === "community_member" &&
      created.account_status === "Active" &&
      created.name === testName,
    created
      ? "user_id=" + created.user_id + " role=" + created.role
      : "not found"
  );

  const isBcrypt = created && /^\$2[aby]\$/.test(created.password);
  const hashMatches = created && (await bcrypt.compare(testPassword, created.password));
  record(
    "3. Password stored as bcrypt hash",
    Boolean(isBcrypt && hashMatches && created.password !== testPassword),
    isBcrypt ? "bcrypt prefix ok, compare=" + hashMatches : "not bcrypt"
  );

  // 4. Correct password login
  const goodLogin = await login(testEmail, testPassword);
  record(
    "4. Login with correct password",
    goodLogin.res.status === 302 && goodLogin.res.location === "/member/dashboard",
    "status=" + goodLogin.res.status + " location=" + goodLogin.res.location
  );

  // Session must not contain password (can only infer via protected access working)
  const memberDash = await request("GET", "/member/dashboard", {
    headers: { Cookie: goodLogin.cookie }
  });
  record(
    "Session reaches member dashboard",
    memberDash.status === 200,
    "status=" + memberDash.status
  );
  await logout(goodLogin.cookie);

  // 5. Incorrect password
  const badLogin = await login(testEmail, "WrongPassword!!");
  record(
    "5. Incorrect password rejected",
    badLogin.res.status === 401 ||
      (badLogin.res.status === 200 && /Unable to sign in|check your information/i.test(badLogin.res.body)),
    "status=" + badLogin.res.status
  );

  // Seed role logins
  const [[memberSeed]] = await pool.query(
    "SELECT email FROM users WHERE role = 'community_member' AND account_status = 'Active' AND email != ? ORDER BY user_id LIMIT 1",
    [testEmail]
  );
  const [[organiserSeed]] = await pool.query(
    "SELECT email FROM users WHERE role = 'organiser' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
  );
  const [[adminSeed]] = await pool.query(
    "SELECT email, user_id FROM users WHERE role = 'admin' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
  );

  // 7–9. Role redirects
  const mLogin = await login(memberSeed.email, PASSWORD);
  record(
    "7. community_member → /member/dashboard",
    mLogin.res.status === 302 && mLogin.res.location === "/member/dashboard",
    mLogin.res.location
  );

  // 10. Member cannot open admin dashboard
  const memberAdmin = await request("GET", "/admin/dashboard", {
    headers: { Cookie: mLogin.cookie }
  });
  record(
    "10. community_member blocked from /admin/dashboard",
    memberAdmin.status === 403,
    "status=" + memberAdmin.status
  );

  const memberOrg = await request("GET", "/organiser/dashboard", {
    headers: { Cookie: mLogin.cookie }
  });
  record(
    "community_member blocked from /organiser/dashboard",
    memberOrg.status === 403,
    "status=" + memberOrg.status
  );
  await logout(mLogin.cookie);

  const oLogin = await login(organiserSeed.email, PASSWORD);
  record(
    "8. organiser → /organiser/dashboard",
    oLogin.res.status === 302 && oLogin.res.location === "/organiser/dashboard",
    oLogin.res.location
  );
  const orgAdmin = await request("GET", "/admin/dashboard", {
    headers: { Cookie: oLogin.cookie }
  });
  record(
    "organiser blocked from /admin/dashboard",
    orgAdmin.status === 403,
    "status=" + orgAdmin.status
  );
  await logout(oLogin.cookie);

  const aLogin = await login(adminSeed.email, PASSWORD);
  record(
    "9. admin → /admin/dashboard",
    aLogin.res.status === 302 && aLogin.res.location === "/admin/dashboard",
    aLogin.res.location
  );

  const usersPage = await request("GET", "/admin/users", {
    headers: { Cookie: aLogin.cookie }
  });
  record(
    "Admin user list loads",
    usersPage.status === 200 && usersPage.body.includes(testEmail),
    "status=" + usersPage.status + " lists test user=" + usersPage.body.includes(testEmail)
  );

  // 12. Suspend + reactivate via admin management
  const suspend = await request("POST", "/admin/users/" + created.user_id + "/status", {
    body: "account_status=Suspended",
    headers: { Cookie: aLogin.cookie }
  });
  const [[afterSuspend]] = await pool.query(
    "SELECT account_status FROM users WHERE user_id = ?",
    [created.user_id]
  );
  record(
    "12a. Suspend user through admin",
    suspend.status === 302 && afterSuspend.account_status === "Suspended",
    "db=" + afterSuspend.account_status
  );

  // 6. Suspended login blocked
  const suspendedLogin = await login(testEmail, testPassword);
  record(
    "6. Suspended account cannot log in",
    suspendedLogin.res.status === 401 ||
      /suspended/i.test(suspendedLogin.res.body),
    "status=" + suspendedLogin.res.status
  );

  const reactivate = await request("POST", "/admin/users/" + created.user_id + "/status", {
    body: "account_status=Active",
    headers: { Cookie: aLogin.cookie }
  });
  const [[afterActive]] = await pool.query(
    "SELECT account_status FROM users WHERE user_id = ?",
    [created.user_id]
  );
  record(
    "12b. Reactivate user through admin",
    reactivate.status === 302 && afterActive.account_status === "Active",
    "db=" + afterActive.account_status
  );

  const reLogin = await login(testEmail, testPassword);
  record(
    "Reactivated user can log in",
    reLogin.res.status === 302 && reLogin.res.location === "/member/dashboard",
    reLogin.res.location
  );

  // 11. Logout clears access
  await logout(reLogin.cookie);
  const afterLogout = await request("GET", "/member/dashboard", {
    headers: { Cookie: reLogin.cookie }
  });
  record(
    "11. After logout, protected page inaccessible",
    afterLogout.status === 302 && afterLogout.location === "/login",
    "status=" + afterLogout.status + " location=" + afterLogout.location
  );

  // Cleanup test user
  await pool.query("DELETE FROM users WHERE user_id = ?", [created.user_id]);
  record("Cleanup test user", true, "deleted user_id=" + created.user_id);

  const failed = results.filter(function (r) { return !r.ok; });
  console.log("\nSummary: " + (results.length - failed.length) + "/" + results.length + " passed");
  if (failed.length) {
    console.log("Failed:");
    failed.forEach(function (f) { console.log(" - " + f.name + ": " + f.detail); });
    process.exitCode = 1;
  } else {
    console.log("FEATURE_STATUS=COMPLETE_AND_WORKING");
  }
  await pool.end();
})().catch(async function (err) {
  console.error(err);
  try { await pool.end(); } catch (e) { /* ignore */ }
  process.exit(1);
});
