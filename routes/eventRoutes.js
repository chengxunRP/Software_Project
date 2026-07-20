const express = require("express");
const router = express.Router();
const { isOrganiser } = require("../middleware/auth");
const eventController = require("../controllers/eventController");

router.get("/organiser/events", isOrganiser, eventController.listEvents);
router.get("/organiser/events/new", isOrganiser, eventController.showCreateEventForm);
router.post("/organiser/events", isOrganiser, eventController.createEvent);
router.get("/organiser/events/:id", isOrganiser, eventController.showEventDetails);
router.get("/organiser/events/:id/edit", isOrganiser, eventController.showEditEventForm);
router.post("/organiser/events/:id/edit", isOrganiser, eventController.updateEvent);
router.post("/organiser/events/:id/delete", isOrganiser, eventController.deleteEvent);

module.exports = router;
