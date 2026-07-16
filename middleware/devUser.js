const pool = require("../config/database");

function isActiveAllowedRole(role) {
  return role === "community_member" || role === "organiser" || role === "admin";
}

/**
 * Temporary development authentication fallback.
 *
 * Prefer the real session user once Feature 1 (authentication) is merged:
 *   req.session.user = { user_id, name, email, role }
 *
 * Until then, in non-production only, load an Active community_member from
 * process.env.DEV_USER_ID. Never accept user_id from the browser.
 *
 * Disable / remove this middleware fallback after authentication is live.
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
          currentUser: null,
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
          currentUser: null,
          messages: [],
          statusCode: 401,
          errorTitle: "Sign in required",
          errorMessage: "Your account could not be found. Please log in again."
        });
      }

      const user = rows[0];
      if (!isActiveAllowedRole(user.role) || user.account_status !== "Active") {
        return res.status(403).render("error", {
          layout: "public",
          activeNav: "",
          pageTitle: "Not allowed · CommunityConnect SG",
          currentUser: null,
          messages: [],
          statusCode: 403,
          errorTitle: "Not allowed",
          errorMessage: "Only active users can access this area."
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

    // Temporary development-only fallback — never enabled in production.
    if (process.env.NODE_ENV === "production") {
      return res.status(401).render("error", {
        layout: "public",
        activeNav: "",
        pageTitle: "Sign in required · CommunityConnect SG",
        currentUser: null,
        messages: [],
        statusCode: 401,
        errorTitle: "Sign in required",
        errorMessage: "Please log in as a community member to continue."
      });
    }

    const rawDevId = process.env.DEV_USER_ID;
    const devUserId = Number(rawDevId);
    if (!rawDevId || !Number.isInteger(devUserId) || devUserId <= 0) {
      return res.status(500).render("error", {
        layout: "public",
        activeNav: "",
        pageTitle: "Development setup · CommunityConnect SG",
        currentUser: null,
        messages: [],
        statusCode: 500,
        errorTitle: "DEV_USER_ID is missing or invalid",
        errorMessage: "Set DEV_USER_ID in .env to an Active community_member user_id for local registration testing. This fallback is temporary and never runs in production."
      });
    }

    const [devRows] = await pool.query(
      `SELECT user_id, name, email, role, account_status
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [devUserId]
    );

    if (!devRows.length) {
      return res.status(500).render("error", {
        layout: "public",
        activeNav: "",
        pageTitle: "Development setup · CommunityConnect SG",
        currentUser: null,
        messages: [],
        statusCode: 500,
        errorTitle: "DEV_USER_ID not found",
        errorMessage: "No user exists for DEV_USER_ID. Choose an Active community_member from the users table."
      });
    }

    const devUser = devRows[0];
    if (!isActiveAllowedRole(devUser.role) || devUser.account_status !== "Active") {
      return res.status(500).render("error", {
        layout: "public",
        activeNav: "",
        pageTitle: "Development setup · CommunityConnect SG",
        currentUser: null,
        messages: [],
        statusCode: 500,
        errorTitle: "DEV_USER_ID is not an active user",
        errorMessage: "DEV_USER_ID must point to an Active community_member, organiser, or admin account."
      });
    }

    req.session.user = {
      user_id: devUser.user_id,
      name: devUser.name,
      email: devUser.email,
      role: devUser.role,
      account_status: devUser.account_status,
      source: "dev_user"
    };

    req.currentUser = {
      user_id: devUser.user_id,
      name: devUser.name,
      email: devUser.email,
      role: devUser.role,
      account_status: devUser.account_status,
      source: "dev_user"
    };
    return next();
  } catch (err) {
    console.error("attachCurrentUser failed:", err.message);
    return res.status(500).render("error", {
      layout: "public",
      activeNav: "",
      pageTitle: "Something went wrong · CommunityConnect SG",
      currentUser: null,
      messages: [],
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not verify the current user. Please try again shortly."
    });
  }
}

async function attachAnyCurrentUser(req, res, next) {
  return attachCurrentUser(req, res, next);
}

module.exports = {
  attachCurrentUser: attachCurrentUser,
  attachAnyCurrentUser: attachAnyCurrentUser
};
