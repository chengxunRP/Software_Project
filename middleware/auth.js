// Server-side role checks. Client-side hiding of buttons/links is never
// sufficient on its own — every protected route must also check here.
//
// Account roles (users.role ENUM): community_member | organiser | admin
// req.session.user is set by the login controller (Feature 1) and contains
// only { user_id, name, email, role, account_status, joined } — never a password.

const { flash } = require("../lib/flash");
const { dashboardPathForRole } = require("../lib/userDisplay");

function isLoggedIn(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

function isOrganiser(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  if (req.session.user.role !== "organiser") {
    return res.status(403).send("You do not have permission to view this page.");
  }
  next();
}

function isAdmin(req, res, next) {
  return requireAdmin(req, res, next);
}

// Renders the shared error page with a friendly access-denied message.
function accessDenied(req, res) {
  return res.status(403).render("error", {
    layout: "public",
    activeNav: "",
    pageTitle: "Access denied · CommunityConnect SG",
    currentUser: null,
    messages: [],
    statusCode: 403,
    errorTitle: "You do not have permission to access this page",
    errorMessage: "Please sign in with an account that has the correct role, or return to your own dashboard."
  });
}

/** Builds middleware that requires login plus one of the allowed roles. */
function requireRole(allowedRoles) {
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return function (req, res, next) {
    if (!req.session.user) {
      flash(req, "error", "Please log in to continue.");
      return res.redirect("/login");
    }
    if (allowed.indexOf(req.session.user.role) === -1) {
      return accessDenied(req, res);
    }
    next();
  };
}

const requireCommunityMember = requireRole("community_member");
const requireOrganiser = requireRole("organiser");
const requireAdmin = requireRole("admin");

/** Sends already-signed-in users to their dashboard instead of auth pages. */
function redirectIfLoggedIn(req, res, next) {
  if (req.session.user && req.session.user.role) {
    return res.redirect(dashboardPathForRole(req.session.user.role));
  }
  next();
}

module.exports = {
  isLoggedIn,
  isOrganiser,
  isAdmin,
  requireRole,
  requireCommunityMember,
  requireOrganiser,
  requireAdmin,
  redirectIfLoggedIn
};
