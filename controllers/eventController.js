const eventModel = require("../models/eventModel");
const categoryModel = require("../models/categoryModel");
const { takeFlash } = require("./registrationController");

const STATUS_OPTIONS = [
  { value: "Draft", label: "Draft" },
  { value: "Open", label: "Open" },
  { value: "Full", label: "Full" },
  { value: "Closed", label: "Closed" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "Completed", label: "Completed" }
];

function flash(req, type, text) {
  if (req.session) {
    req.session.flash = { type: type, text: text };
  }
}

function formatForDatetimeLocal(value) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatEventForForm(event) {
  return {
    event_id: event.event_id,
    event_name: event.event_name || "",
    description: event.description || "",
    category_id: event.category_id || "",
    location: event.location || "",
    start_datetime: formatForDatetimeLocal(event.start_datetime),
    end_datetime: formatForDatetimeLocal(event.end_datetime),
    registration_deadline: formatForDatetimeLocal(event.registration_deadline),
    participant_capacity: event.participant_capacity || "",
    volunteer_capacity: event.volunteer_capacity || "",
    status: event.status || "Draft"
  };
}

function parseInteger(value) {
  const result = Number(value);
  return Number.isInteger(result) ? result : null;
}

function buildEventPayload(body) {
  return {
    event_name: String(body.event_name || "").trim(),
    description: String(body.description || "").trim(),
    category_id: parseInteger(body.category_id),
    location: String(body.location || "").trim(),
    start_datetime: String(body.start_datetime || "").trim(),
    end_datetime: String(body.end_datetime || "").trim(),
    registration_deadline: String(body.registration_deadline || "").trim(),
    participant_capacity: parseInteger(body.participant_capacity),
    volunteer_capacity: parseInteger(body.volunteer_capacity),
    status: String(body.status || "Draft").trim()
  };
}

function validateEventPayload(payload, isEdit) {
  const errors = [];

  if (!payload.event_name) {
    errors.push("Event name is required.");
  }
  if (!payload.category_id || payload.category_id <= 0) {
    errors.push("Category is required.");
  }
  if (!payload.description) {
    errors.push("Event description is required.");
  }
  if (!payload.location) {
    errors.push("Location is required.");
  }
  if (!payload.start_datetime) {
    errors.push("Start date and time are required.");
  }
  if (!payload.end_datetime) {
    errors.push("End date and time are required.");
  }
  if (!payload.registration_deadline) {
    errors.push("Registration deadline is required.");
  }
  if (!payload.participant_capacity || payload.participant_capacity <= 0) {
    errors.push("Participant capacity must be a positive number.");
  }
  if (!payload.volunteer_capacity || payload.volunteer_capacity <= 0) {
    errors.push("Volunteer capacity must be a positive number.");
  }

  const startDate = new Date(payload.start_datetime);
  const endDate = new Date(payload.end_datetime);
  const deadlineDate = new Date(payload.registration_deadline);
  const now = new Date();

  if (payload.start_datetime && Number.isNaN(startDate.getTime())) {
    errors.push("Start date and time must be valid.");
  }
  if (payload.end_datetime && Number.isNaN(endDate.getTime())) {
    errors.push("End date and time must be valid.");
  }
  if (payload.registration_deadline && Number.isNaN(deadlineDate.getTime())) {
    errors.push("Registration deadline must be valid.");
  }

  if (!Number.isNaN(startDate.getTime()) && startDate < now) {
    errors.push("Event date cannot be in the past.");
  }
  if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(deadlineDate.getTime()) && deadlineDate > startDate) {
    errors.push("Registration deadline cannot be after the event start date.");
  }
  if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate <= startDate) {
    errors.push("End date and time must be after the start date and time.");
  }

  const allowedStatuses = STATUS_OPTIONS.map((option) => option.value);
  if (!allowedStatuses.includes(payload.status)) {
    payload.status = "Draft";
  }

  return errors;
}

function buildBaseViewOptions(req) {
  return {
    layout: "app",
    role: "organiser",
    activeNav: "events",
    pageTitle: "Manage Events · Organiser",
    currentUser: req.session.user,
    messages: takeFlash(req)
  };
}

async function listEvents(req, res) {
  const search = String(req.query.search || "").trim();
  const categoryId = parseInteger(req.query.category_id || req.query.category || "");
  const filters = { search: search };

  if (categoryId) {
    filters.categoryId = categoryId;
  }

  try {
    const [categories, events] = await Promise.all([
      categoryModel.getAllWithEventCounts(),
      eventModel.findEventsByOrganiser(req.session.user.user_id, filters)
    ]);

    res.render("events/index", Object.assign(buildBaseViewOptions(req), {
      pageEyebrow: "Organiser",
      pageHeading: "Manage Events",
      pageLead: "Create, edit and manage capacity for your community events.",
      pageActions: '<a href="/organiser/events/new" class="btn-cc btn-cc-primary btn-cc-sm">+ Add Event</a>',
      events: events,
      categories: categories,
      search: search,
      selectedCategoryId: categoryId || ""
    }));
  } catch (err) {
    console.error("Event list query failed:", err.message);
    res.status(500).render("error", Object.assign(buildBaseViewOptions(req), {
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load your events. Please try again shortly."
    }));
  }
}

async function showCreateEventForm(req, res) {
  try {
    const categories = await categoryModel.getAllWithEventCounts();
    res.render("events/add", Object.assign(buildBaseViewOptions(req), {
      pageEyebrow: "Organiser",
      pageHeading: "Add Event",
      pageLead: "Create a new community event and set separate participant and volunteer capacities.",
      pageActions: '<a href="/organiser/events" class="btn-cc btn-cc-secondary btn-cc-sm">Cancel</a>',
      categories: categories,
      event: formatEventForForm({ status: "Draft" }),
      statusOptions: STATUS_OPTIONS
    }));
  } catch (err) {
    console.error("Show create event failed:", err.message);
    res.status(500).render("error", Object.assign(buildBaseViewOptions(req), {
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load the event form. Please try again shortly."
    }));
  }
}

async function createEvent(req, res) {
  const payload = buildEventPayload(req.body);
  const categoriesPromise = categoryModel.getAllWithEventCounts();
  const errors = validateEventPayload(payload, false);

  try {
    const categories = await categoriesPromise;

    if (errors.length === 0) {
      const duplicate = await eventModel.duplicateEventNameOnDate(payload.event_name, payload.start_datetime);
      if (duplicate) {
        errors.push("An event with the same name is already scheduled for that date.");
      }
    }

    if (errors.length) {
      return res.render("events/add", Object.assign(buildBaseViewOptions(req), {
        pageEyebrow: "Organiser",
        pageHeading: "Add Event",
        pageLead: "Create a new community event and set separate participant and volunteer capacities.",
        pageActions: '<a href="/organiser/events" class="btn-cc btn-cc-secondary btn-cc-sm">Cancel</a>',
        categories: categories,
        event: formatEventForForm(payload),
        statusOptions: STATUS_OPTIONS,
        messages: errors.map((text) => ({ type: "error", text: text }))
      }));
    }

    await eventModel.createEvent(Object.assign({}, payload, { organiser_id: req.session.user.user_id }));
    flash(req, "success", "Event created successfully.");
    res.redirect("/organiser/events");
  } catch (err) {
    console.error("Create event failed:", err.message);
    const categories = await categoryModel.getAllWithEventCounts();
    res.render("events/add", Object.assign(buildBaseViewOptions(req), {
      pageEyebrow: "Organiser",
      pageHeading: "Add Event",
      pageLead: "Create a new community event and set separate participant and volunteer capacities.",
      pageActions: '<a href="/organiser/events" class="btn-cc btn-cc-secondary btn-cc-sm">Cancel</a>',
      categories: categories,
      event: formatEventForForm(payload),
      statusOptions: STATUS_OPTIONS,
      messages: [{ type: "error", text: "Could not save the event. Please try again." }]
    }));
  }
}

async function showEventDetails(req, res) {
  try {
    const event = await eventModel.findEventById(req.params.id, req.session.user.user_id);
    if (!event) {
      return res.status(404).render("error", Object.assign(buildBaseViewOptions(req), {
        pageTitle: "Event not found · CommunityConnect SG",
        statusCode: 404,
        errorTitle: "Event not found",
        errorMessage: "The event does not exist or you do not have permission to view it."
      }));
    }

    res.render("events/view", Object.assign(buildBaseViewOptions(req), {
      pageEyebrow: "Organiser",
      pageHeading: event.event_name,
      pageLead: event.category_name,
      pageActions: `<a href="/organiser/events/${event.event_id}/edit" class="btn-cc btn-cc-secondary btn-cc-sm">Edit</a> <button type="button" class="btn-cc btn-cc-danger btn-cc-sm" data-open-modal data-delete-event-id="${event.event_id}" data-event-name="${event.event_name}">Delete</button>`,
      event: event
    }));
  } catch (err) {
    console.error("Show event details failed:", err.message);
    res.status(500).render("error", Object.assign(buildBaseViewOptions(req), {
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load the event details. Please try again shortly."
    }));
  }
}

async function showEditEventForm(req, res) {
  try {
    const [categories, event] = await Promise.all([
      categoryModel.getAllWithEventCounts(),
      eventModel.findEventById(req.params.id, req.session.user.user_id)
    ]);
    if (!event) {
      return res.status(404).render("error", Object.assign(buildBaseViewOptions(req), {
        pageTitle: "Event not found · CommunityConnect SG",
        statusCode: 404,
        errorTitle: "Event not found",
        errorMessage: "The event does not exist or you do not have permission to edit it."
      }));
    }

    res.render("events/edit", Object.assign(buildBaseViewOptions(req), {
      pageEyebrow: "Organiser",
      pageHeading: "Edit Event",
      pageLead: "Update event details, schedule and separate participant and volunteer capacities.",
      pageActions: '<a href="/organiser/events" class="btn-cc btn-cc-secondary btn-cc-sm">Cancel</a>',
      categories: categories,
      event: formatEventForForm(event),
      statusOptions: STATUS_OPTIONS
    }));
  } catch (err) {
    console.error("Show edit event failed:", err.message);
    res.status(500).render("error", Object.assign(buildBaseViewOptions(req), {
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load the edit form. Please try again shortly."
    }));
  }
}

async function updateEvent(req, res) {
  const payload = buildEventPayload(req.body);
  const categoriesPromise = categoryModel.getAllWithEventCounts();
  const errors = validateEventPayload(payload, true);

  try {
    const categories = await categoriesPromise;
    const event = await eventModel.findEventById(req.params.id, req.session.user.user_id);
    if (!event) {
      return res.status(404).render("error", Object.assign(buildBaseViewOptions(req), {
        pageTitle: "Event not found · CommunityConnect SG",
        statusCode: 404,
        errorTitle: "Event not found",
        errorMessage: "The event does not exist or you do not have permission to edit it."
      }));
    }

    if (errors.length === 0) {
      const duplicate = await eventModel.duplicateEventNameOnDate(payload.event_name, payload.start_datetime, req.params.id);
      if (duplicate) {
        errors.push("An event with the same name is already scheduled for that date.");
      }
    }

    if (errors.length) {
      return res.render("events/edit", Object.assign(buildBaseViewOptions(req), {
        pageEyebrow: "Organiser",
        pageHeading: "Edit Event",
        pageLead: "Update event details, schedule and separate participant and volunteer capacities.",
        pageActions: '<a href="/organiser/events" class="btn-cc btn-cc-secondary btn-cc-sm">Cancel</a>',
        categories: categories,
        event: formatEventForForm(Object.assign({}, payload, { event_id: req.params.id })),
        statusOptions: STATUS_OPTIONS,
        messages: errors.map((text) => ({ type: "error", text: text }))
      }));
    }

    await eventModel.updateEvent(req.params.id, req.session.user.user_id, payload);
    flash(req, "success", "Event updated successfully.");
    res.redirect("/organiser/events");
  } catch (err) {
    console.error("Update event failed:", err.message);
    const categories = await categoriesPromise;
    res.render("events/edit", Object.assign(buildBaseViewOptions(req), {
      pageEyebrow: "Organiser",
      pageHeading: "Edit Event",
      pageLead: "Update event details, schedule and separate participant and volunteer capacities.",
      pageActions: '<a href="/organiser/events" class="btn-cc btn-cc-secondary btn-cc-sm">Cancel</a>',
      categories: categories,
      event: formatEventForForm(Object.assign({}, payload, { event_id: req.params.id })),
      statusOptions: STATUS_OPTIONS,
      messages: [{ type: "error", text: "Could not save the event. Please try again." }]
    }));
  }
}

async function deleteEvent(req, res) {
  try {
    const deleted = await eventModel.deleteEvent(req.params.id, req.session.user.user_id);
    if (!deleted) {
      flash(req, "error", "Event not found or you do not have permission to delete it.");
      return res.redirect("/organiser/events");
    }
    flash(req, "success", "Event deleted successfully.");
    res.redirect("/organiser/events");
  } catch (err) {
    console.error("Delete event failed:", err.message);
    flash(req, "error", "We could not delete the event. Please try again.");
    res.redirect("/organiser/events");
  }
}

module.exports = {
  listEvents,
  showCreateEventForm,
  createEvent,
  showEventDetails,
  showEditEventForm,
  updateEvent,
  deleteEvent
};
