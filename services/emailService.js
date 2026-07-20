/**
 * Shared Resend email sender.
 * Resend is created only when sendEmail is called — missing env must not
 * prevent the website from starting.
 */
const { Resend } = require("resend");

/**
 * @param {{ to: string, subject: string, text: string, html: string }} opts
 * @returns {Promise<{ id?: string }>}
 */
async function sendEmail(opts) {
  const to = String((opts && opts.to) || "").trim();
  const subject = String((opts && opts.subject) || "").trim();
  const text = String((opts && opts.text) || "");
  const html = String((opts && opts.html) || "");

  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.EMAIL_FROM || "").trim();

  if (!apiKey || !from) {
    const err = new Error("Email is not configured (RESEND_API_KEY or EMAIL_FROM missing).");
    err.code = "EMAIL_NOT_CONFIGURED";
    console.error("sendEmail failed: email configuration is incomplete.");
    throw err;
  }

  if (!to || !subject || (!text && !html)) {
    const err = new Error("Email requires to, subject, and text or html content.");
    err.code = "EMAIL_INVALID_ARGS";
    console.error("sendEmail failed: invalid arguments.");
    throw err;
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: from,
      to: [to],
      subject: subject,
      text: text,
      html: html || undefined
    });

    if (result && result.error) {
      console.error("sendEmail failed: provider rejected the message.");
      const err = new Error("Email provider rejected the message.");
      err.code = "EMAIL_PROVIDER_ERROR";
      throw err;
    }

    const id = result && result.data && result.data.id
      ? String(result.data.id)
      : undefined;
    console.log("sendEmail succeeded" + (id ? (" messageId=" + id) : ""));
    return { id: id };
  } catch (err) {
    if (err && err.code === "EMAIL_NOT_CONFIGURED") throw err;
    if (err && err.code === "EMAIL_INVALID_ARGS") throw err;
    if (err && err.code === "EMAIL_PROVIDER_ERROR") throw err;
    console.error("sendEmail failed: provider or network error.");
    const wrapped = new Error("Email could not be sent.");
    wrapped.code = "EMAIL_SEND_FAILED";
    throw wrapped;
  }
}

module.exports = {
  sendEmail: sendEmail
};
