const express = require("express");
const { attachCurrentUser } = require("../middleware/devUser");
const registrationController = require("../controllers/registrationController");

const router = express.Router();

router.post(
  "/events/:id/register",
  attachCurrentUser,
  registrationController.registerForEvent
);

router.get(
  "/member/registrations",
  attachCurrentUser,
  registrationController.listMyRegistrations
);

router.post(
  "/registrations/:id/cancel",
  attachCurrentUser,
  registrationController.cancelRegistration
);

module.exports = router;
