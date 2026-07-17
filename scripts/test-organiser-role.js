/**
 * Organiser-specific Feature 1 verification.
 * Run: node scripts/test-organiser-role.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const http = require("http");
const pool = require("../config/database");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = "Password123!";
const results = [];

function record(name, ok, detail) {
  results.push({ name: name, ok: !!ok, detail: detail || "" });
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
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: pathName,
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

async function login(email, password) {
  const page = await request("GET", "/login");
  let cookie = jar(page.headers);
  const res = await request("POST", "/login", {
    body:
      "email=" + encodeURIComponent(email) +
      "&password=" + encodeURIComponent(password),
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
  const email = "organiser.verify." + stamp + "@example.sg";
  const name = "Organiser Verify " + stamp;
  const password = "OrgVerify123!";
  let userId = null;

  // Create community_member via public registration
  const regPage = await request("GET", "/register");
  let cookie = jar(regPage.headers);
  const reg = await request("POST", "/register", {
    body:
      "full_name=" + encodeURIComponent(name) +
      "&email=" + encodeURIComponent(email) +
      "&password=" + encodeURIComponent(password) +
      "&confirm_password=" + encodeURIComponent(password) +
      "&terms=on",
    headers: { Cookie: cookie }
  });
  record("Setup: register community_member", reg.status === 302, "location=" + reg.location);

  const [[created]] = await pool.query(
    "SELECT user_id, role FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  userId = created && created.user_id;
  record(
    "Setup: user starts as community_member",
    created && created.role === "community_member",
    "user_id=" + userId + " role=" + (created && created.role)
  );

  // Admin login
  const [[admin]] = await pool.query(
    "SELECT email FROM users WHERE role = 'admin' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
  );
  const aLogin = await login(admin.email, ADMIN_PASSWORD);
  record(
    "Admin login",
    aLogin.res.status === 302 && aLogin.res.location === "/admin/dashboard",
    aLogin.res.location
  );

  // 1 + 10: Admin role update via UI route (parameterised + allow-list in source)
  const roleSrc = fs.readFileSync(
    path.join(__dirname, "..", "controllers", "adminUserController.js"),
    "utf8"
  );
  const hasAllowList = /ALLOWED_ROLES\s*=\s*\[[^\]]*['\"]organiser['\"]/.test(roleSrc);
  const hasParamUpdate =
    /UPDATE users SET role = \?[\s\S]*WHERE user_id = \?/.test(roleSrc) &&
    /\[newRole,\s*userId\]/.test(roleSrc);
  record(
    "10. Role update uses allow-list + parameterised SQL",
    hasAllowList && hasParamUpdate,
    "allowList=" + hasAllowList + " paramSql=" + hasParamUpdate
  );

  const promote = await request("POST", "/admin/users/" + userId + "/role", {
    body: "role=organiser",
    headers: { Cookie: aLogin.cookie }
  });
  record(
    "1. Admin can change community_member → organiser via UI route",
    promote.status === 302 && promote.location.indexOf("/admin/users") !== -1,
    "status=" + promote.status + " location=" + promote.location
  );

  // Reject invalid role (allow-list)
  const badRole = await request("POST", "/admin/users/" + userId + "/role", {
    body: "role=superadmin",
    headers: { Cookie: aLogin.cookie }
  });
  const [[stillOrg]] = await pool.query(
    "SELECT role FROM users WHERE user_id = ?",
    [userId]
  );
  record(
    "Invalid role rejected; organiser retained",
    badRole.status === 302 && stillOrg.role === "organiser",
    "db role=" + stillOrg.role
  );

  // 2. users.role updated
  const [[dbRole]] = await pool.query(
    "SELECT role, email, account_status FROM users WHERE user_id = ?",
    [userId]
  );
  record(
    "2. users.role = 'organiser'",
    dbRole.role === "organiser",
    "role=" + dbRole.role
  );

  await logout(aLogin.cookie);

  // 3–5. Organiser login + routes
  const oLogin = await login(email, password);
  record(
    "3. Organiser login with normal email/password",
    oLogin.res.status === 302,
    "status=" + oLogin.res.status
  );
  record(
    "4. Redirect to /organiser/dashboard",
    oLogin.res.location === "/organiser/dashboard",
    "location=" + oLogin.res.location
  );

  const dash = await request("GET", "/organiser/dashboard", {
    headers: { Cookie: oLogin.cookie }
  });
  const events = await request("GET", "/organiser/events", {
    headers: { Cookie: oLogin.cookie }
  });
  record(
    "5. Organiser can access /organiser/dashboard",
    dash.status === 200,
    "status=" + dash.status
  );
  record(
    "5. Organiser can access /organiser/events",
    events.status === 200,
    "status=" + events.status
  );

  // 7. Organiser cannot access admin
  const orgAdmin = await request("GET", "/admin/dashboard", {
    headers: { Cookie: oLogin.cookie }
  });
  record(
    "7. Organiser cannot access /admin/dashboard",
    orgAdmin.status === 403,
    "status=" + orgAdmin.status
  );
  await logout(oLogin.cookie);

  // 6. community_member cannot access organiser routes
  const [[member]] = await pool.query(
    "SELECT email FROM users WHERE role = 'community_member' AND account_status = 'Active' ORDER BY user_id LIMIT 1"
  );
  const mLogin = await login(member.email, ADMIN_PASSWORD);
  const memberOrgDash = await request("GET", "/organiser/dashboard", {
    headers: { Cookie: mLogin.cookie }
  });
  const memberOrgEvents = await request("GET", "/organiser/events", {
    headers: { Cookie: mLogin.cookie }
  });
  record(
    "6. community_member denied /organiser/dashboard",
    memberOrgDash.status === 403,
    "status=" + memberOrgDash.status
  );
  record(
    "6. community_member denied /organiser/events",
    memberOrgEvents.status === 403,
    "status=" + memberOrgEvents.status
  );
  await logout(mLogin.cookie);

  // 8. Suspended organiser cannot log in
  const aLogin2 = await login(admin.email, ADMIN_PASSWORD);
  await request("POST", "/admin/users/" + userId + "/status", {
    body: "account_status=Suspended",
    headers: { Cookie: aLogin2.cookie }
  });
  const [[suspended]] = await pool.query(
    "SELECT account_status FROM users WHERE user_id = ?",
    [userId]
  );
  const suspendedLogin = await login(email, password);
  record(
    "8. Suspended organiser cannot log in",
    suspended.account_status === "Suspended" &&
      (suspendedLogin.res.status === 401 || /suspended/i.test(suspendedLogin.res.body)),
    "status=" + suspendedLogin.res.status + " db=" + suspended.account_status
  );

  // Restore Active for cleanup clarity (then delete)
  await request("POST", "/admin/users/" + userId + "/status", {
    body: "account_status=Active",
    headers: { Cookie: aLogin2.cookie }
  });
  await logout(aLogin2.cookie);

  // 9. Public registration cannot create organiser
  const attackEmail = "organiser.attack." + stamp + "@example.sg";
  const reg2Page = await request("GET", "/register");
  cookie = jar(reg2Page.headers);
  await request("POST", "/register", {
    body:
      "full_name=" + encodeURIComponent("Attack Org") +
      "&email=" + encodeURIComponent(attackEmail) +
      "&password=" + encodeURIComponent(password) +
      "&confirm_password=" + encodeURIComponent(password) +
      "&terms=on&role=organiser",
    headers: { Cookie: cookie }
  });
  const [[attackUser]] = await pool.query(
    "SELECT role FROM users WHERE email = ? LIMIT 1",
    [attackEmail]
  );
  record(
    "9. Public registration cannot create organiser",
    attackUser && attackUser.role === "community_member",
    "role=" + (attackUser && attackUser.role)
  );

  // Cleanup
  await pool.query("DELETE FROM users WHERE email IN (?, ?)", [email, attackEmail]);
  record("Cleanup", true, "removed test accounts");

  const failed = results.filter(function (r) { return !r.ok; });
  console.log("\nOrganiser test account used: " + email + " (user_id=" + userId + ")");
  console.log("Summary: " + (results.length - failed.length) + "/" + results.length + " passed");
  if (failed.length) {
    failed.forEach(function (f) {
      console.log("FAIL detail: " + f.name + " — " + f.detail);
    });
    process.exitCode = 1;
  } else {
    console.log("ORGANISER_ROLE_COMPLETE_AND_WORKING");
  }
  await pool.end();
})().catch(async function (err) {
  console.error(err);
  try { await pool.end(); } catch (e) { /* ignore */ }
  process.exit(1);
});
