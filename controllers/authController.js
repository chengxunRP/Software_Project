const bcrypt = require("bcrypt");
const pool = require("../config/database");

function setFlash(req, type, text) {
  if (!req.session) {
    return;
  }
  req.session.flash = { type: type, text: text };
}

function getUserSessionPayload(user) {
  return {
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role,
    account_status: user.account_status
  };
}

async function login(req, res) {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!email || !password) {
    setFlash(req, "error", "Please enter your email and password.");
    return res.redirect("/login");
  }

  try {
    const [rows] = await pool.query(
      `SELECT user_id, name, email, password, role, account_status
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      setFlash(req, "error", "We could not find an account with that email.");
      return res.redirect("/login");
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      setFlash(req, "error", "The password you entered is incorrect.");
      return res.redirect("/login");
    }

    if (user.account_status !== "Active") {
      setFlash(req, "error", "This account is not active.");
      return res.redirect("/login");
    }

    req.session.user = getUserSessionPayload(user);
    setFlash(req, "success", "Signed in successfully.");
    return res.redirect("/member/dashboard");
  } catch (err) {
    console.error("Login failed:", err.message);
    setFlash(req, "error", "We could not sign you in right now. Please try again.");
    return res.redirect("/login");
  }
}

async function register(req, res) {
  const name = String(req.body.full_name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirm_password || "");

  if (!name || !email || !password) {
    setFlash(req, "error", "Please complete all required fields.");
    return res.redirect("/register");
  }

  if (password.length < 8) {
    setFlash(req, "error", "Password must be at least 8 characters long.");
    return res.redirect("/register");
  }

  if (password !== confirmPassword) {
    setFlash(req, "error", "Passwords do not match.");
    return res.redirect("/register");
  }

  try {
    const [existing] = await pool.query(
      `SELECT user_id FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (existing.length) {
      setFlash(req, "error", "An account with that email already exists.");
      return res.redirect("/register");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (name, email, password, role, account_status)
       VALUES (?, ?, ?, 'community_member', 'Active')`,
      [name, email, hashedPassword]
    );

    const [createdRows] = await pool.query(
      `SELECT user_id, name, email, role, account_status FROM users WHERE user_id = ? LIMIT 1`,
      [result.insertId]
    );

    req.session.user = getUserSessionPayload(createdRows[0]);
    setFlash(req, "success", "Your account is ready. You can now browse events and manage your registrations.");
    return res.redirect("/member/dashboard");
  } catch (err) {
    console.error("Registration failed:", err.message);
    setFlash(req, "error", "We could not create your account right now. Please try again.");
    return res.redirect("/register");
  }
}

async function logout(req, res) {
  req.session.destroy(function (err) {
    if (err) {
      console.error("Logout failed:", err.message);
    }
    res.redirect("/login");
  });
}

module.exports = {
  login,
  register,
  logout
};
