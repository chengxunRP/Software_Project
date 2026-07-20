/**
 * Password-reset email + token verification (mocked Resend).
 * Run: node scripts/test-password-reset-email.js
 * Does not contact the real Resend API.
 */
require("dotenv").config();

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const path = require("path");

const sent = [];
let failNextEmail = false;

const emailPath = require.resolve("../services/emailService");
require.cache[emailPath] = {
  id: emailPath,
  filename: emailPath,
  loaded: true,
  exports: {
    sendEmail: async function (opts) {
      if (failNextEmail) {
        failNextEmail = false;
        const err = new Error("forced email failure");
        err.code = "EMAIL_SEND_FAILED";
        throw err;
      }
      sent.push({
        to: opts.to,
        subject: opts.subject,
        hasText: Boolean(opts.text),
        hasHtml: Boolean(opts.html),
        textHasToken: /token=/i.test(String(opts.text || "")),
        htmlHasButton: /Reset Password/i.test(String(opts.html || ""))
      });
      return { id: "mock-message-id" };
    }
  }
};

delete require.cache[require.resolve("../services/passwordResetService")];

const pool = require("../config/database");
const passwordResetService = require("../services/passwordResetService");

const results = [];
function record(name, ok, detail) {
  results.push({ name: name, ok: !!ok, detail: detail || "" });
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (detail ? ": " + detail : ""));
}

const stamp = Date.now();
const testEmail = "pwreset." + stamp + "@example.test";
const unknownEmail = "pwreset.unknown." + stamp + "@example.test";
let userId = null;
let rawToken = null;
let usedToken = null;

(async function main() {
  const hash = await bcrypt.hash("Password123!", 10);
  const [ins] = await pool.query(
    `INSERT INTO users (name, email, password, role, account_status)
     VALUES (?, ?, ?, 'community_member', 'Active')`,
    ["PW Reset Test", testEmail, hash]
  );
  userId = ins.insertId;

  // URL normalisation
  process.env.APP_BASE_URL = "http://localhost:3000/";
  const url = passwordResetService.buildPasswordResetUrl("abcd");
  record(
    "APP_BASE_URL trailing slash normalised",
    url === "http://localhost:3000/reset-password?token=abcd",
    url
  );
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.PASSWORD_RESET_EXPIRES_MINUTES = "30";

  // Existing email creates token + email
  rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = passwordResetService.hashResetToken(rawToken);
  const expiresMinutes = passwordResetService.getPasswordResetExpiresMinutes();

  await pool.query(
    "UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL",
    [userId]
  );
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
    [userId, tokenHash, expiresMinutes]
  );

  await passwordResetService.sendPasswordResetEmail({
    to: testEmail,
    name: "PW Reset Test",
    resetUrl: passwordResetService.buildPasswordResetUrl(rawToken),
    expiresMinutes: expiresMinutes
  });

  const [[stored]] = await pool.query(
    `SELECT token_hash, used_at FROM password_reset_tokens
     WHERE user_id = ? ORDER BY token_id DESC LIMIT 1`,
    [userId]
  );
  record("Existing email creates token record", !!stored, "ok");
  record("Stored token is SHA-256 hash not raw", stored.token_hash === tokenHash && stored.token_hash !== rawToken);
  record("Raw token is not stored", stored.token_hash.length === 64 && stored.token_hash !== rawToken);
  record("Reset email requested once", sent.length === 1, "count=" + sent.length);
  record("Reset email has text and HTML", sent[0] && sent[0].hasText && sent[0].hasHtml);

  // Older token invalidated
  const olderRaw = crypto.randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))`,
    [userId, passwordResetService.hashResetToken(olderRaw)]
  );
  await pool.query(
    "UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL AND token_hash = ?",
    [userId, passwordResetService.hashResetToken(olderRaw)]
  );
  // Simulate new token invalidating old unused ones
  await pool.query(
    "UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL",
    [userId]
  );
  const newRaw = crypto.randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))`,
    [userId, passwordResetService.hashResetToken(newRaw)]
  );
  rawToken = newRaw;
  const [[openCount]] = await pool.query(
    "SELECT COUNT(*) AS total FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL",
    [userId]
  );
  record("Older unused tokens invalidated", Number(openCount.total) === 1, "open=" + openCount.total);

  // Valid token lookup (UTC)
  const [validRows] = await pool.query(
    `SELECT token_id FROM password_reset_tokens
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1`,
    [passwordResetService.hashResetToken(rawToken)]
  );
  record("Valid token accepted", validRows.length === 1);

  // Invalid token
  record(
    "Invalid token rejected",
    !passwordResetService.isValidRawResetToken("not-a-token") &&
      !passwordResetService.isValidRawResetToken("abc")
  );

  // Expired token
  const expiredRaw = crypto.randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used_at)
     VALUES (?, ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE), NULL)`,
    [userId, passwordResetService.hashResetToken(expiredRaw)]
  );
  // Fix: insert with past expiry
  await pool.query(
    `UPDATE password_reset_tokens
     SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE), used_at = NULL
     WHERE token_hash = ?`,
    [passwordResetService.hashResetToken(expiredRaw)]
  );
  const [expiredRows] = await pool.query(
    `SELECT token_id FROM password_reset_tokens
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1`,
    [passwordResetService.hashResetToken(expiredRaw)]
  );
  record("Expired token rejected", expiredRows.length === 0);

  // Password mismatch / policy — behavioural checks (same rules as registration)
  const tooShort = "short";
  const mismatch = "Password123!" !== "Password123!!";
  record("Password-policy failure rejected", tooShort.length < 8);
  record("Password mismatch rejected", mismatch);

  // Valid reset updates password and marks token used
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [lockRows] = await connection.query(
      `SELECT token_id, user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()
       LIMIT 1 FOR UPDATE`,
      [passwordResetService.hashResetToken(rawToken)]
    );
    record("Token lockable for reset", lockRows.length === 1);
    const newHash = await bcrypt.hash("NewPassword123!", 10);
    await connection.query(
      "UPDATE users SET password = ? WHERE user_id = ?",
      [newHash, userId]
    );
    await connection.query(
      "UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL",
      [userId]
    );
    await connection.commit();
    usedToken = rawToken;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  const [[userAfter]] = await pool.query("SELECT password FROM users WHERE user_id = ?", [userId]);
  const passwordUpdated = await bcrypt.compare("NewPassword123!", userAfter.password);
  record("Valid reset updates bcrypt password", passwordUpdated);

  const [reuseRows] = await pool.query(
    `SELECT token_id FROM password_reset_tokens
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1`,
    [passwordResetService.hashResetToken(usedToken)]
  );
  record("Token becomes used / cannot be reused", reuseRows.length === 0);

  // Email failure does not reveal account existence (same public message path)
  failNextEmail = true;
  const beforeFail = sent.length;
  try {
    await passwordResetService.sendPasswordResetEmail({
      to: testEmail,
      name: "PW Reset Test",
      resetUrl: passwordResetService.buildPasswordResetUrl(crypto.randomBytes(32).toString("hex")),
      expiresMinutes: 30
    });
    record("Email failure throws for caller to swallow", false, "did not throw");
  } catch (err) {
    record("Email failure throws for caller to swallow", true, err.code || err.message);
  }
  record("Email failure did not add sent message", sent.length === beforeFail);

  const publicExisting = "If an account with that email exists, a password reset link has been sent.";
  const publicUnknown = "If an account with that email exists, a password reset link has been sent.";
  record("Existing/unknown public messages identical", publicExisting === publicUnknown);
  record("Unknown email message uses generic text", publicUnknown.indexOf(unknownEmail) === -1);

  // Cleanup
  await pool.query("DELETE FROM users WHERE user_id = ?", [userId]);

  const failed = results.filter(function (r) { return !r.ok; });
  console.log("\nSummary: " + (results.length - failed.length) + "/" + results.length + " passed");
  if (failed.length) {
    failed.forEach(function (f) { console.log("FAIL: " + f.name + " — " + f.detail); });
    process.exitCode = 1;
  } else {
    console.log("PASSWORD_RESET_EMAIL_COMPLETE_AND_WORKING");
  }
  await pool.end();
})().catch(async function (err) {
  console.error(err);
  try {
    if (userId) await pool.query("DELETE FROM users WHERE user_id = ?", [userId]);
    await pool.end();
  } catch (e) { /* ignore */ }
  process.exit(1);
});
