/**
 * Local session/login cookie verification (no secrets printed).
 * Usage: node scripts/verify-session-login.js
 */
require("dotenv").config();
const http = require("http");

const PORT = process.env.PORT || 3000;
const PASSWORD = "Password123!";

function jar(headers) {
  const set = headers["set-cookie"];
  if (!set) return [];
  return (Array.isArray(set) ? set : [set]);
}

function cookieHeader(setCookies) {
  return setCookies.map(function (c) { return c.split(";")[0]; }).join("; ");
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
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          location: res.headers.location || "",
          setCookie: jar(res.headers)
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

(async function main() {
  const pool = require("../config/database");
  const [[member]] = await pool.query(
    `SELECT email, role FROM users
     WHERE role = 'community_member' AND account_status = 'Active'
     ORDER BY user_id LIMIT 1`
  );
  if (!member) {
    throw new Error("No active community_member found for login test.");
  }

  const loginPage = await request("GET", "/login");
  const startCookies = cookieHeader(loginPage.setCookie);

  const login = await request("POST", "/login", {
    body: "email=" + encodeURIComponent(member.email) + "&password=" + encodeURIComponent(PASSWORD),
    headers: { Cookie: startCookies }
  });

  const sessionCookies = login.setCookie.filter(function (c) {
    return c.indexOf("communityconnect.sid=") === 0;
  });
  const cookieLine = sessionCookies[0] || "";
  const hasSid = sessionCookies.length > 0;
  const redirectOk = login.status === 302 && login.location === "/member/dashboard";

  console.log("POST /login status:", login.status);
  console.log("Redirect location:", login.location || "(none)");
  console.log("Set-Cookie communityconnect.sid present:", hasSid);
  console.log("Cookie HttpOnly:", /httponly/i.test(cookieLine));
  console.log("Cookie SameSite=Lax:", /samesite=lax/i.test(cookieLine));
  // Local NODE_ENV is usually development, so Secure may be absent — that is expected.
  console.log("Cookie Secure flag:", /;\s*secure/i.test(cookieLine));

  const dashCookies = cookieHeader(login.setCookie.length ? login.setCookie : loginPage.setCookie);
  // Prefer the new session cookie from login response
  const followCookie = hasSid ? cookieHeader(sessionCookies) : dashCookies;

  const dash = await request("GET", "/member/dashboard", {
    headers: { Cookie: followCookie }
  });

  console.log("GET /member/dashboard status:", dash.status);
  console.log("Dashboard stayed logged in:", dash.status === 200 && dash.body.indexOf("/login") === -1 || (dash.status === 200 && /Community member|dashboard/i.test(dash.body)));
  console.log("Dashboard redirected to login:", dash.status === 302 && dash.location === "/login");

  const logout = await request("POST", "/logout", {
    headers: { Cookie: followCookie }
  });
  console.log("POST /logout status:", logout.status, "loc:", logout.location);

  await pool.end();
  if (!(redirectOk && hasSid && dash.status === 200)) {
    process.exitCode = 1;
  } else {
    console.log("SESSION_LOGIN_LOCAL_OK");
  }
})().catch(async function (err) {
  console.error(err.message);
  try {
    const pool = require("../config/database");
    await pool.end();
  } catch (e) { /* ignore */ }
  process.exit(1);
});
