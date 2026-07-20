/**
 * Feature 1 — password-reset helpers (token expiry, reset URL, reset email).
 * Does not change session, roles, or registration password policy.
 */
const crypto = require("crypto");
const { sendEmail } = require("./emailService");

function getPasswordResetExpiresMinutes() {
  const raw = Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES);
  if (!Number.isInteger(raw) || raw <= 0) {
    return 30;
  }
  return raw;
}

function normalizeAppBaseUrl() {
  const base = String(process.env.APP_BASE_URL || "http://localhost:3000").trim();
  return base.replace(/\/+$/, "");
}

function buildPasswordResetUrl(rawToken) {
  return normalizeAppBaseUrl() + "/reset-password?token=" + encodeURIComponent(rawToken);
}

function hashResetToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

function isValidRawResetToken(rawToken) {
  return /^[a-f0-9]{64}$/i.test(String(rawToken || "").trim());
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send the password-reset email. Never logs the raw token or reset URL.
 * @param {{ to: string, name?: string, resetUrl: string, expiresMinutes: number }} opts
 */
async function sendPasswordResetEmail(opts) {
  const to = String(opts.to || "").trim();
  const name = String(opts.name || "").trim() || "CommunityConnect member";
  const resetUrl = String(opts.resetUrl || "").trim();
  const expiresMinutes = Number(opts.expiresMinutes) || 30;

  const subject = "Reset your CommunityConnect password";
  const text = [
    "CommunityConnect SG",
    "",
    "Hello " + name + ",",
    "",
    "We received a request to reset your CommunityConnect password.",
    "This link expires in " + expiresMinutes + " minutes and can only be used once.",
    "",
    "Reset your password:",
    resetUrl,
    "",
    "If you did not request this email, you can ignore it. Your current password will stay the same."
  ].join("\n");

  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);
  const html = [
    "<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#23271F\">",
    "<p style=\"font-size:18px;font-weight:700;color:#2E7D4F\">CommunityConnect <span style=\"color:#1E4D33\">SG</span></p>",
    "<p>Hello " + safeName + ",</p>",
    "<p>We received a request to reset your CommunityConnect password.</p>",
    "<p>This link expires in <strong>" + expiresMinutes + " minutes</strong> and can only be used once.</p>",
    "<p style=\"margin:24px 0\">",
    "<a href=\"" + safeUrl + "\" style=\"background:#2E7D4F;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700\">Reset Password</a>",
    "</p>",
    "<p>Or copy this link into your browser:</p>",
    "<p style=\"word-break:break-all\">" + safeUrl + "</p>",
    "<p>If you did not request this email, you can ignore it. Your current password will stay the same.</p>",
    "</div>"
  ].join("");

  return sendEmail({
    to: to,
    subject: subject,
    text: text,
    html: html
  });
}

module.exports = {
  getPasswordResetExpiresMinutes: getPasswordResetExpiresMinutes,
  normalizeAppBaseUrl: normalizeAppBaseUrl,
  buildPasswordResetUrl: buildPasswordResetUrl,
  hashResetToken: hashResetToken,
  isValidRawResetToken: isValidRawResetToken,
  sendPasswordResetEmail: sendPasswordResetEmail
};
