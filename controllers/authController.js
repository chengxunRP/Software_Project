const crypto = require("crypto");
const bcrypt = require("bcrypt");
const pool = require("../config/database");
const { flash, takeFlash } = require("../lib/flash");

const BCRYPT_ROUNDS = 10;
const PASSWORD_MIN_LENGTH = 8;
const RESET_TOKEN_HOURS = 1;

function authLocals(extra) {
  return Object.assign({
    layout: "public",
    activeNav: "",
    pageTitle: "CommunityConnect SG",
    currentUser: null,
    messages: [],
    form: {}
  }, extra || {});
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Only SHA-256 hashes of reset tokens are stored — never the raw token.
function hashResetToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// ---------- Registration ----------

function showRegister(req, res) {
  res.render("register", authLocals({
    activeNav: "register",
    pageTitle: "Register · CommunityConnect SG",
    messages: takeFlash(req)
  }));
}

async function register(req, res) {
  // Form field names match the existing register.ejs: full_name, email,
  // password, confirm_password (full_name maps to the users.name column).
  const name = String(req.body.full_name || "").trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirm_password || "");

  function reRender(message) {
    // Preserve typed name/email; never re-fill passwords.
    return res.status(400).render("register", authLocals({
      activeNav: "register",
      pageTitle: "Register · CommunityConnect SG",
      messages: [{ type: "error", text: message }],
      form: { full_name: name, email: email }
    }));
  }

  if (!name || name.length < 2) {
    return reRender("Please enter your full name.");
  }
  if (!email || !isValidEmail(email)) {
    return reRender("Please enter a valid email address.");
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return reRender("Your password must be at least 8 characters long.");
  }
  if (password !== confirmPassword) {
    return reRender("The password and confirmation do not match.");
  }

  try {
    const [existing] = await pool.query(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    if (existing.length) {
      return reRender("An account with these details already exists. Please log in instead.");
    }

    // Public sign-ups are always community members — role is never taken
    // from the browser, so nobody can self-assign organiser or admin.
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await pool.query(
      `INSERT INTO users (name, email, password, role, account_status)
       VALUES (?, ?, ?, 'community_member', 'Active')`,
      [name, email, passwordHash]
    );

    flash(req, "success", "Your CommunityConnect account has been created successfully. Please log in.");
    return res.redirect("/login");
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return reRender("An account with these details already exists. Please log in instead.");
    }
    console.error("register failed:", err.message);
    return reRender("We could not create your account. Please try again.");
  }
}

// ---------- Login / logout ----------

function showLogin(req, res) {
  res.render("login", authLocals({
    activeNav: "login",
    pageTitle: "Log in · CommunityConnect SG",
    messages: takeFlash(req)
  }));
}

async function login(req, res) {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const invalidCredentials = "Unable to sign in with the details provided. Please check your information and try again.";

  function backToLogin(message, statusCode) {
    return res.status(statusCode || 401).render("login", authLocals({
      activeNav: "login",
      pageTitle: "Log in · CommunityConnect SG",
      messages: [{ type: "error", text: message }],
      form: { email: email }
    }));
  }

  if (!email || !password) {
    return backToLogin("Please complete all required fields.");
  }

  try {
    const [rows] = await pool.query(
      `SELECT user_id, name, email, password, role, account_status, created_at
       FROM users
       WHERE LOWER(email) = LOWER(?)
       LIMIT 1`,
      [email]
    );

    const user = rows[0];
    if (!user) {
      return backToLogin(invalidCredentials);
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return backToLogin(invalidCredentials);
    }

    if (user.account_status !== "Active") {
      return backToLogin(
        "Your account has been suspended. Please contact a CommunityConnect administrator."
      );
    }

    // Never store the password or hash in the session.
    req.session.regenerate(function (regenErr) {
      if (regenErr) {
        console.error("Session regenerate failed:", regenErr.message);
        return backToLogin("We could not start your session. Please try again.", 500);
      }

      req.session.user = {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role
      };
      flash(req, "success", "Welcome back! You have signed in successfully.");

      req.session.save(function (saveErr) {
        if (saveErr) {
          console.error("Session save failed:", saveErr.message);
          return backToLogin("Unable to complete sign in. Please try again.", 500);
        }

        if (user.role === "admin") {
          return res.redirect("/admin/dashboard");
        }
        if (user.role === "organiser") {
          return res.redirect("/organiser/dashboard");
        }
        return res.redirect("/member/dashboard");
      });
    });
  } catch (err) {
    console.error("Login database or unexpected error:", err.message);
    return backToLogin(
      "We could not complete sign in because of a server problem. Please try again.",
      500
    );
  }
}

function logout(req, res) {
  req.session.destroy(function (err) {
    if (err) {
      console.error("logout failed:", err.message);
    }
    res.clearCookie("communityconnect.sid");
    return res.redirect("/login");
  });
}

// ---------- Password reset ----------

function showForgotPassword(req, res) {
  res.render("forgot-password", authLocals({
    activeNav: "login",
    pageTitle: "Forgot password · CommunityConnect SG",
    messages: takeFlash(req)
  }));
}

async function requestPasswordReset(req, res) {
  const email = normalizeEmail(req.body.email);
  // Same response whether or not the account exists — do not confirm accounts.
  const genericMessage = "If an account exists for that email address, a password reset has been prepared.";

  if (!email || !isValidEmail(email)) {
    flash(req, "error", "Please enter a valid email address.");
    return res.redirect("/forgot-password");
  }

  try {
    const [rows] = await pool.query(
      "SELECT user_id, email, account_status FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    const user = rows[0];

    if (user && user.account_status === "Active") {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_HOURS * 60 * 60 * 1000);

      // Invalidate previous unused tokens so only the newest link works.
      await pool.query(
        "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL",
        [user.user_id]
      );
      await pool.query(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
        [user.user_id, tokenHash, expiresAt]
      );

      // No email service is configured for this CA2 project (per CLAUDE.md
      // stack). In development the link goes to the server console only —
      // never into the browser response.
      if (process.env.NODE_ENV !== "production") {
        console.log(
          "[password-reset] Development-only reset link for " + user.email + ": " +
          "/reset-password?token=" + rawToken
        );
      }
    }

    flash(req, "success", genericMessage + " Development note: the reset link is printed in the server console.");
    return res.redirect("/forgot-password");
  } catch (err) {
    console.error("requestPasswordReset failed:", err.message);
    flash(req, "error", "We could not start a password reset. Please try again.");
    return res.redirect("/forgot-password");
  }
}

async function findValidToken(connectionOrPool, rawToken) {
  const [rows] = await connectionOrPool.query(
    `SELECT token_id, user_id, expires_at, used_at
     FROM password_reset_tokens
     WHERE token_hash = ?
     LIMIT 1`,
    [hashResetToken(rawToken)]
  );
  const row = rows[0];
  if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
    return null;
  }
  return row;
}

async function showResetPassword(req, res) {
  const token = String(req.query.token || "").trim();
  if (!token) {
    flash(req, "error", "This password-reset link is invalid or has expired.");
    return res.redirect("/forgot-password");
  }

  try {
    const valid = await findValidToken(pool, token);
    if (!valid) {
      flash(req, "error", "This password-reset link is invalid or has expired. Please request a new one.");
      return res.redirect("/forgot-password");
    }

    res.render("reset-password", authLocals({
      activeNav: "login",
      pageTitle: "Reset password · CommunityConnect SG",
      messages: takeFlash(req),
      token: token
    }));
  } catch (err) {
    console.error("showResetPassword failed:", err.message);
    flash(req, "error", "We could not open the password-reset page. Please try again.");
    return res.redirect("/forgot-password");
  }
}

async function resetPassword(req, res) {
  const token = String(req.body.token || "").trim();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirm_password || "");

  if (!token) {
    flash(req, "error", "This password-reset link is invalid or has expired.");
    return res.redirect("/forgot-password");
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    flash(req, "error", "Your new password must be at least 8 characters long.");
    return res.redirect("/reset-password?token=" + encodeURIComponent(token));
  }
  if (password !== confirmPassword) {
    flash(req, "error", "The password and confirmation do not match.");
    return res.redirect("/reset-password?token=" + encodeURIComponent(token));
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const valid = await findValidToken(connection, token);
    if (!valid) {
      await connection.rollback();
      flash(req, "error", "This password-reset link is invalid or has expired. Please request a new one.");
      return res.redirect("/forgot-password");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await connection.query(
      "UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
      [passwordHash, valid.user_id]
    );
    // Mark this token used and invalidate any other outstanding tokens.
    await connection.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL",
      [valid.user_id]
    );

    await connection.commit();

    flash(req, "success", "Your password has been updated successfully. Please log in with your new password.");
    return res.redirect("/login");
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (e) { /* already logged below */ }
    }
    console.error("resetPassword failed:", err.message);
    flash(req, "error", "We could not reset your password. Please try again.");
    return res.redirect("/forgot-password");
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  showRegister,
  register,
  showLogin,
  login,
  logout,
  showForgotPassword,
  requestPasswordReset,
  showResetPassword,
  resetPassword
};
