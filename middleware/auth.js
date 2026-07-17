// Server-side role checks. Client-side hiding of buttons/links is never
// sufficient on its own — every protected route must also check here.
//
// NOTE: Feature 1 (login) has not been implemented yet, so req.session.user
// will always be undefined until that lands. Until then, these middleware
// functions will correctly block every request with a redirect to /login.

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
  if (!req.session.user) {
    return res.redirect("/login");
  }
  if (req.session.user.role !== "admin") {
    return res.status(403).send("You do not have permission to view this page.");
  }
  next();
}

module.exports = { isLoggedIn, isOrganiser, isAdmin };
