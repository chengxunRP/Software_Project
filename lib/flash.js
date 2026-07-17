/**
 * One-shot flash messages stored on the session.
 * Same shape as the flash used by controllers/registrationController.js
 * ({ type, text }) so views/partials/messages.ejs renders both.
 */
function flash(req, type, text) {
  if (req.session) {
    req.session.flash = { type: type, text: text };
  }
}

function takeFlash(req) {
  if (req.session && req.session.flash) {
    const message = req.session.flash;
    delete req.session.flash;
    return [message];
  }
  return [];
}

module.exports = { flash: flash, takeFlash: takeFlash };
