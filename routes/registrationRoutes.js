const express = require("express");
const pool = require("../config/database");
const { attachCurrentUser, attachAnyCurrentUser } = require("../middleware/devUser");
const registrationController = require("../controllers/registrationController");
const notificationController = require("../controllers/notificationController");
const volunteerHistoryController = require("../controllers/volunteerHistoryController");
const organiserStatsController = require("../controllers/organiserStatsController");

const router = express.Router();

router.post(
  "/registrations",
  attachCurrentUser,
  registrationController.registerForEvent
);

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

router.get(
  "/member/volunteer-history",
  attachCurrentUser,
  volunteerHistoryController.renderVolunteerHistoryPage
);

router.get(
  "/api/member/volunteer-history",
  attachCurrentUser,
  volunteerHistoryController.apiVolunteerHistory
);

router.get(
  "/api/organiser/dashboard-stats",
  attachAnyCurrentUser,
  organiserStatsController.apiOrganiserDashboardStats
);

router.post(
  "/registrations/:id/cancel",
  attachCurrentUser,
  registrationController.cancelRegistration
);

router.get(
  "/api/notifications",
  attachCurrentUser,
  async function (req, res) {
    try {
      const rows = await notificationController.listNotifications(pool, req.currentUser.user_id, {
        limit: 10,
        offset: 0,
        includeRead: false
      });
      res.json(rows);
    } catch (err) {
      console.error("list notifications failed:", err.message);
      res.status(500).json({ error: "Unable to load notifications." });
    }
  }
);

router.post(
  "/api/notifications/read",
  attachCurrentUser,
  async function (req, res) {
    try {
      const notificationIds = Array.isArray(req.body.notification_ids) ? req.body.notification_ids : [];
      const updatedCount = await notificationController.markNotificationsRead(pool, req.currentUser.user_id, notificationIds);
      res.json({ updated: updatedCount });
    } catch (err) {
      console.error("mark notifications read failed:", err.message);
      res.status(500).json({ error: "Unable to update notifications." });
    }
  }
);

module.exports = router;
