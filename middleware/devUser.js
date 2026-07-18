const pool = require("../config/database");
const { flash } = require("../lib/flash");

/**
 * Attach the logged-in community member for registration routes.
 *
 * Prefer the real session user (Feature 1 authentication).
 * Never accept user_id from the URL, query string or form.
 *
 * The former DEV_USER_ID anonymous fallback is disabled for normal routes so
 * a visitor cannot register as another database user. Automated tests must
 * log in via /login and send the session cookie.
 */
async function attachCurrentUser(req, res, next) {
  try {
    if (req.session && req.session.user && req.session.user.user_id) {
      const sessionUserId = Number(req.session.user.user_id);
      if (!Number.isInteger(sessionUserId) || sessionUserId <= 0) {
        return res.status(401).render("error", {
          layout: "public",
          activeNav: "",
          pageTitle: "Sign in required · CommunityConnect SG",
          currentUser: req.session.user || null,
          messages: [],
          statusCode: 401,
          errorTitle: "Sign in required",
          errorMessage: "Your session is invalid. Please log in again."
        });
      }

      const [rows] = await pool.query(
        `SELECT user_id, name, email, role, account_status
         FROM users
         WHERE user_id = ?
         LIMIT 1`,
        [sessionUserId]
      );

      if (!rows.length) {
        return res.status(401).render("error", {
          layout: "public",
          activeNav: "",
          pageTitle: "Sign in required · CommunityConnect SG",
          currentUser: req.session.user || null,
          messages: [],
          statusCode: 401,
          errorTitle: "Sign in required",
          errorMessage: "Your account could not be found. Please log in again."
        });
      }

      const user = rows[0];
      if (user.role !== "community_member" || user.account_status !== "Active") {
        return res.status(403).render("error", {
          layout: "public",
          activeNav: "",
          pageTitle: "Not allowed · CommunityConnect SG",
          currentUser: req.session.user || null,
          messages: [],
          statusCode: 403,
          errorTitle: "Not allowed",
          errorMessage: "Only active community members can manage event registrations."
        });
      }

      req.currentUser = {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        account_status: user.account_status,
        source: "session"
      };
      return next();
    }

    // No session — require login. Do not fall back to DEV_USER_ID.
    flash(req, "error", "Please log in as a community member to continue.");
    return res.redirect("/login");
  } catch (err) {
    console.error("attachCurrentUser failed:", err.message);
    return res.status(500).render("error", {
      layout: "public",
      activeNav: "",
      pageTitle: "Something went wrong · CommunityConnect SG",
      currentUser: req.session.user || null,
      messages: [],
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not verify the current user. Please try again shortly."
    });
  }
}

module.exports = {
  attachCurrentUser: attachCurrentUser
};
