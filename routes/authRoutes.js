// Feature 1 — public authentication routes (register, login, logout,
// password reset). Role enforcement for protected areas lives in
// middleware/auth.js and is applied where routes are defined.
const express = require("express");
const authController = require("../controllers/authController");
const { redirectIfLoggedIn } = require("../middleware/auth");

const router = express.Router();

router.get("/register", redirectIfLoggedIn, authController.showRegister);
router.post("/register", redirectIfLoggedIn, authController.register);

router.get("/login", redirectIfLoggedIn, authController.showLogin);
router.post("/login", redirectIfLoggedIn, authController.login);

// GET kept alongside POST because the existing navbar "Log out" is a link.
router.post("/logout", authController.logout);
router.get("/logout", authController.logout);

router.get("/forgot-password", redirectIfLoggedIn, authController.showForgotPassword);
router.post("/forgot-password", redirectIfLoggedIn, authController.requestPasswordReset);

router.get("/reset-password", redirectIfLoggedIn, authController.showResetPassword);
router.post("/reset-password", redirectIfLoggedIn, authController.resetPassword);

module.exports = router;
