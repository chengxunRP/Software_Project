require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const pool = require("./config/database");
const publicEvents = require("./lib/publicEvents");
const registrationRoutes = require("./routes/registrationRoutes");
const { takeFlash } = require("./controllers/registrationController");
const notificationController = require("./controllers/notificationController");
const organiserStatsController = require("./controllers/organiserStatsController");
const organiserAttendanceReportController = require("./controllers/organiserAttendanceReportController");
const { attachCurrentUser } = require("./middleware/devUser");

const rolesRoutes = require("./routes/roles");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET || "communityconnect-dev-session";

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax"
    }
  })
);

// TODO: Remove this before final CA2 submission! (Temporary Auth Mock)
// Must run after the session middleware above (needs req.session to exist)
// and before any protected routes below.
app.use(function (req, res, next) {
  if (!req.session.user) {
    const devUserId = Number(process.env.DEV_USER_ID || 3);
    const devUserRole = String(process.env.DEV_USER_ROLE || "community_member").toLowerCase();

    req.session.user = {
      user_id: Number.isInteger(devUserId) && devUserId > 0 ? devUserId : 3,
      name: "Tan Wei Ling",
      initials: "WL",
      avatarBg: "#D99E2B",
      role: devUserRole,
    };
  }
  next();
});

app.use(rolesRoutes);

app.use(registrationRoutes);


// Temporary sample data for frontend preview only
// Replace with MySQL results during backend implementation

const categories = [
  { category_id: 1, name: "Environment", color: "#2E7D4F", badgeBg: "#E7F2EA", badgeFg: "#1E4D33", desc: "Clean-ups, recycling drives, greening projects", eventCount: 68, status: "Active" },
  { category_id: 2, name: "Food Support", color: "#D99E2B", badgeBg: "#FBF3DF", badgeFg: "#8A5E08", desc: "Food distribution, meal packing, grocery deliveries", eventCount: 47, status: "Active" },
  { category_id: 3, name: "Elderly Support", color: "#C08FBB", badgeBg: "#F3E9F2", badgeFg: "#7A4472", desc: "Befriending, home visits, digital literacy help", eventCount: 39, status: "Active" },
  { category_id: 4, name: "Education", color: "#7FA8D9", badgeBg: "#E9EDF6", badgeFg: "#3B5384", desc: "Tutoring, reading programmes, enrichment support", eventCount: 34, status: "Active" },
  { category_id: 5, name: "Fundraising", color: "#D9A08F", badgeBg: "#FBEAE8", badgeFg: "#9C4038", desc: "Charity runs, bake sales, donation drives", eventCount: 25, status: "Active" },
  { category_id: 6, name: "Blood Donation", color: "#B9B5A8", badgeBg: "#EDEAE0", badgeFg: "#6E7266", desc: "Superseded — merged into Health & Wellness", eventCount: 0, status: "Archived" }
];

const volunteerRoles = [
  { volunteer_role_id: 1, event_id: 1, name: "Beach Sweeper", description: "Collect litter along the assigned zone", filled: 24, capacity: 28 },
  { volunteer_role_id: 2, event_id: 1, name: "Data Recorder", description: "Log litter types for the waste audit", filled: 7, capacity: 8 },
  { volunteer_role_id: 3, event_id: 1, name: "Team Lead", description: "Guide a team of 8–10 volunteers (experience required)", filled: 4, capacity: 4 }
];

function capacityMeta(filled, capacity) {
  const pct = capacity ? Math.round((filled / capacity) * 100) : 0;
  const left = capacity - filled;
  const full = left <= 0;
  return {
    filled,
    capacity,
    pct,
    left,
    full,
    capLabel: filled + " of " + capacity + " spaces filled",
    capNote: full ? "Full · waitlist open" : left + " left",
    capColor: full ? "#B0433B" : pct >= 80 ? "#D99E2B" : "#2E7D4F",
    statusLabel: full ? "Full" : "Open"
  };
}

function dualCapacityMeta(pFilled, pCap, vFilled, vCap, pWait, vWait) {
  const participants = capacityMeta(pFilled, pCap);
  const volunteers = capacityMeta(vFilled, vCap);
  const combined = capacityMeta(pFilled + vFilled, pCap + vCap);
  return {
    participant_capacity: pCap,
    volunteer_capacity: vCap,
    participants_filled: pFilled,
    volunteers_filled: vFilled,
    participants: participants,
    volunteers: volunteers,
    filled: pFilled + vFilled,
    capacity: pCap + vCap,
    pct: combined.pct,
    left: participants.left + volunteers.left,
    full: participants.full && volunteers.full,
    capLabel: "Participants " + pFilled + "/" + pCap + " · Volunteers " + vFilled + "/" + vCap,
    capNote: participants.full && volunteers.full
      ? "Both full · waitlists open"
      : (!participants.full ? participants.left + " participant spaces left" : volunteers.left + " volunteer spaces left"),
    capColor: participants.full && volunteers.full
      ? "#B0433B"
      : (participants.full || volunteers.full || combined.pct >= 80 ? "#D99E2B" : "#2E7D4F"),
    participantWaitlistCount: pWait || 0,
    volunteerWaitlistCount: vWait || 0
  };
}

const events = [
  {
    id: 1,
    event_name: "Coastal Clean-Up at East Coast Park",
    category_id: 1,
    category: "Environment",
    description: "Join us for a Saturday morning shoreline clean-up along East Coast Park, Area C. Volunteers will work in small teams to collect and sort litter, record data for our marine waste audit, and help keep one of Singapore's favourite parks clean. Gloves, tongs and trash bags are provided — just bring a water bottle, sun protection and covered shoes. Suitable for ages 13 and up; volunteers under 16 must be accompanied by an adult.",
    start_datetime: "2026-07-25T08:00",
    end_datetime: "2026-07-25T11:00",
    when: "Sat 25/07/2026 · 08:00–11:00",
    dateLabel: "Sat 25/07/2026",
    timeLabel: "08:00–11:00",
    month: "Jul",
    day: "25",
    location: "East Coast Park, Area C",
    capacity: 40,
    filled: 34,
    registration_deadline: "2026-07-23T23:59",
    deadlineLabel: "23/07/2026, 23:59",
    status: "Published",
    organiser: "CommunityConnect SG — Green Team",
    photoLabel: "photo: beach clean-up",
    area: "East"
  },
  {
    id: 2,
    event_name: "Food Distribution Drive",
    category_id: 2,
    category: "Food Support",
    description: "Help pack and distribute food parcels to households registered with our partner organisations. Shifts include packing, labelling and handover at Bedok Community Centre.",
    start_datetime: "2026-08-01T09:00",
    end_datetime: "2026-08-01T13:00",
    when: "Sat 01/08/2026 · 09:00–13:00",
    dateLabel: "Sat 01/08/2026",
    timeLabel: "09:00–13:00",
    month: "Aug",
    day: "01",
    location: "Bedok Community Centre",
    capacity: 25,
    filled: 25,
    registration_deadline: "2026-07-30T23:59",
    deadlineLabel: "30/07/2026, 23:59",
    status: "Full",
    organiser: "CommunityConnect SG — Food Team",
    photoLabel: "photo: food packing",
    area: "East",
    waitlistCount: 6
  },
  {
    id: 3,
    event_name: "Weekend Tutoring — Primary Maths",
    category_id: 4,
    category: "Education",
    description: "Support Primary 4–6 students with maths revision in small groups. Lesson materials are provided by our partner tutors.",
    start_datetime: "2026-07-26T10:00",
    end_datetime: "2026-07-26T12:00",
    when: "Sun 26/07/2026 · 10:00–12:00",
    dateLabel: "Sun 26/07/2026",
    timeLabel: "10:00–12:00",
    month: "Jul",
    day: "26",
    location: "Tampines Community Club",
    capacity: 20,
    filled: 9,
    registration_deadline: "2026-07-24T23:59",
    deadlineLabel: "24/07/2026, 23:59",
    status: "Published",
    organiser: "CommunityConnect SG — Education Wing",
    photoLabel: "photo: tutoring session",
    area: "East"
  },
  {
    id: 4,
    event_name: "Elderly Befriending Visits",
    category_id: 3,
    category: "Elderly Support",
    description: "Spend an afternoon visiting seniors in Tampines. Volunteers pair up for home visits that include light conversation and check-ins.",
    start_datetime: "2026-07-29T14:00",
    end_datetime: "2026-07-29T17:00",
    when: "Wed 29/07/2026 · 14:00–17:00",
    dateLabel: "Wed 29/07/2026",
    timeLabel: "14:00–17:00",
    month: "Jul",
    day: "29",
    location: "Tampines Community Club",
    capacity: 18,
    filled: 14,
    registration_deadline: "2026-07-27T23:59",
    deadlineLabel: "27/07/2026, 23:59",
    status: "Published",
    organiser: "CommunityConnect SG — Care Team",
    photoLabel: "photo: befriending visit",
    area: "East"
  },
  {
    id: 5,
    event_name: "Park Clean-Up & Recycling Drive",
    category_id: 1,
    category: "Environment",
    description: "Join a morning clean-up and recycling sort at Bishan-Ang Mo Kio Park.",
    start_datetime: "2026-08-08T07:30",
    end_datetime: "2026-08-08T10:30",
    when: "Sat 08/08/2026 · 07:30–10:30",
    dateLabel: "Sat 08/08/2026",
    timeLabel: "07:30–10:30",
    month: "Aug",
    day: "08",
    location: "Bishan-Ang Mo Kio Park",
    capacity: 50,
    filled: 22,
    registration_deadline: "2026-08-06T23:59",
    deadlineLabel: "06/08/2026, 23:59",
    status: "Published",
    organiser: "CommunityConnect SG — Green Team",
    photoLabel: "photo: park clean-up",
    area: "Central"
  },
  {
    id: 6,
    event_name: "Charity Fun Run — Route Marshals",
    category_id: 5,
    category: "Fundraising",
    description: "Marshal the charity fun run route at Jurong Lake Gardens and keep runners safe along the course.",
    start_datetime: "2026-08-16T06:30",
    end_datetime: "2026-08-16T11:00",
    when: "Sun 16/08/2026 · 06:30–11:00",
    dateLabel: "Sun 16/08/2026",
    timeLabel: "06:30–11:00",
    month: "Aug",
    day: "16",
    location: "Jurong Lake Gardens",
    capacity: 45,
    filled: 41,
    registration_deadline: "2026-08-14T23:59",
    deadlineLabel: "14/08/2026, 23:59",
    status: "Published",
    organiser: "CommunityConnect SG — Events Team",
    photoLabel: "photo: fun run marshals",
    area: "West"
  },
  {
    id: 7,
    event_name: "Community Garden Planting Day",
    category_id: 1,
    category: "Environment",
    description: "Plant herbs and greens with residents at the Jurong Lake Gardens community plot.",
    start_datetime: "2026-08-15T08:00",
    end_datetime: "2026-08-15T11:00",
    when: "Sat 15/08/2026 · 08:00–11:00",
    dateLabel: "Sat 15/08/2026",
    timeLabel: "08:00–11:00",
    month: "Aug",
    day: "15",
    location: "Jurong Lake Gardens",
    capacity: 30,
    filled: 12,
    registration_deadline: "2026-08-13T23:59",
    deadlineLabel: "13/08/2026, 23:59",
    status: "Published",
    organiser: "CommunityConnect SG — Green Team",
    photoLabel: "photo: garden planting",
    area: "West"
  },
  {
    id: 8,
    event_name: "Grocery Delivery for Seniors",
    category_id: 3,
    category: "Elderly Support",
    description: "Deliver grocery packs to seniors living near Bedok Community Centre.",
    start_datetime: "2026-08-22T09:00",
    end_datetime: "2026-08-22T12:00",
    when: "Sat 22/08/2026 · 09:00–12:00",
    dateLabel: "Sat 22/08/2026",
    timeLabel: "09:00–12:00",
    month: "Aug",
    day: "22",
    location: "Bedok Community Centre",
    capacity: 16,
    filled: 16,
    registration_deadline: "2026-08-20T23:59",
    deadlineLabel: "20/08/2026, 23:59",
    status: "Full",
    organiser: "CommunityConnect SG — Care Team",
    photoLabel: "photo: grocery delivery",
    area: "East",
    waitlistCount: 4
  },
  {
    id: 9,
    event_name: "Fundraising Bake Sale Helpers",
    category_id: 5,
    category: "Fundraising",
    description: "Help run a fundraising bake sale stall and manage cash collections.",
    start_datetime: "2026-08-23T11:00",
    end_datetime: "2026-08-23T16:00",
    when: "Sun 23/08/2026 · 11:00–16:00",
    dateLabel: "Sun 23/08/2026",
    timeLabel: "11:00–16:00",
    month: "Aug",
    day: "23",
    location: "Tampines Community Club",
    capacity: 15,
    filled: 7,
    registration_deadline: "2026-08-21T23:59",
    deadlineLabel: "21/08/2026, 23:59",
    status: "Published",
    organiser: "CommunityConnect SG — Events Team",
    photoLabel: "photo: bake sale",
    area: "East"
  },
  {
    id: 10,
    event_name: "Coastal Clean-Up — September",
    category_id: 1,
    category: "Environment",
    description: "Draft event for the September shoreline clean-up at East Coast Park, Area F.",
    start_datetime: "2026-09-12T08:00",
    end_datetime: "2026-09-12T11:00",
    when: "Sat 12/09/2026 · 08:00",
    dateLabel: "Sat 12/09/2026",
    timeLabel: "08:00–11:00",
    month: "Sep",
    day: "12",
    location: "East Coast Park, Area F",
    capacity: 40,
    filled: 0,
    registration_deadline: "2026-09-10T23:59",
    deadlineLabel: "10/09/2026, 23:59",
    status: "Draft",
    organiser: "CommunityConnect SG — Green Team",
    photoLabel: "photo: beach clean-up",
    area: "East"
  },
  {
    id: 11,
    event_name: "Weekend Tutoring — Completed Session",
    category_id: 4,
    category: "Education",
    description: "Completed tutoring session used for attendance and hours previews.",
    start_datetime: "2026-07-12T10:00",
    end_datetime: "2026-07-12T12:00",
    when: "Sun 12/07/2026 · 10:00–12:00",
    dateLabel: "Sun 12/07/2026",
    timeLabel: "10:00–12:00",
    month: "Jul",
    day: "12",
    location: "Tampines Community Club",
    capacity: 20,
    filled: 20,
    registration_deadline: "2026-07-10T23:59",
    deadlineLabel: "10/07/2026, 23:59",
    status: "Completed",
    organiser: "CommunityConnect SG — Education Wing",
    photoLabel: "photo: tutoring session",
    area: "East"
  }
];

const eventCapacities = {
  1: { pF: 42, pC: 50, vF: 10, vC: 10, pW: 0, vW: 4 },
  2: { pF: 40, pC: 40, vF: 25, vC: 25, pW: 5, vW: 6 },
  3: { pF: 12, pC: 30, vF: 9, vC: 20, pW: 0, vW: 0 },
  4: { pF: 8, pC: 20, vF: 14, vC: 18, pW: 0, vW: 0 },
  5: { pF: 30, pC: 60, vF: 22, vC: 50, pW: 0, vW: 0 },
  6: { pF: 80, pC: 100, vF: 41, vC: 45, pW: 0, vW: 0 },
  7: { pF: 18, pC: 40, vF: 12, vC: 30, pW: 0, vW: 0 },
  8: { pF: 20, pC: 20, vF: 16, vC: 16, pW: 3, vW: 4 },
  9: { pF: 25, pC: 40, vF: 7, vC: 15, pW: 0, vW: 0 },
  10: { pF: 0, pC: 50, vF: 0, vC: 40, pW: 0, vW: 0 },
  11: { pF: 25, pC: 25, vF: 20, vC: 20, pW: 0, vW: 0 }
};

events.forEach(function (ev) {
  const c = eventCapacities[ev.id] || { pF: 0, pC: 20, vF: 0, vC: 10, pW: 0, vW: 0 };
  Object.assign(ev, dualCapacityMeta(c.pF, c.pC, c.vF, c.vC, c.pW, c.vW));
  const cat = categories.find(function (item) { return item.category_id === ev.category_id; });
  if (cat) {
    ev.badgeBg = cat.badgeBg;
    ev.badgeFg = cat.badgeFg;
    ev.catColor = cat.color;
  }
});

// Note: Temporary events / categories / impactStats above remain for member,
// organiser and admin preview pages only. Public routes load MySQL data.

const memberUser = {
  name: "Tan Wei Ling",
  firstName: "Wei Ling",
  initials: "WL",
  role: "Community member",
  email: "weiling.tan@example.sg",
  mobile: "9123 4567",
  joined: "14/01/2026",
  avatarBg: "#D99E2B"
};

const organiserUser = {
  name: "Marcus Lim",
  firstName: "Marcus",
  initials: "ML",
  role: "Organiser · Green Team",
  email: "marcus.lim@example.sg",
  mobile: "9812 3344",
  joined: "03/11/2025",
  avatarBg: "#7FA8D9"
};

const adminUser = {
  name: "Siti Rahman",
  firstName: "Siti",
  initials: "SR",
  role: "Administrator",
  email: "siti.r@communityconnect.sg",
  mobile: "9001 2200",
  joined: "01/09/2025",
  avatarBg: "#C08FBB"
};

const memberRegistrations = {
  Confirmed: [
    { eventId: 1, name: "Coastal Clean-Up at East Coast Park", participation_type: "Volunteer", meta: "Sat 25/07/2026 · 08:00–11:00 · East Coast Park, Area C · Role: Beach Sweeper", month: "Jul", day: "25", badge: "Confirmed", tone: "green", cancellable: true, waiting_position: null },
    { eventId: 4, name: "Elderly Befriending Visits", participation_type: "Participant", meta: "Wed 29/07/2026 · 14:00–17:00 · Tampines Community Club", month: "Jul", day: "29", badge: "Confirmed", tone: "green", cancellable: true, waiting_position: null }
  ],
  Waitlisted: [
    { eventId: 2, name: "Food Distribution Drive", participation_type: "Volunteer", meta: "Sat 01/08/2026 · 09:00–13:00 · Bedok Community Centre", month: "Aug", day: "01", badge: "Waitlist #3", tone: "amber", cancellable: true, waiting_position: 3, note: "Volunteer waitlist — position 3 of 6. We'll notify you if a space opens." },
    { eventId: 8, name: "Grocery Delivery for Seniors", participation_type: "Participant", meta: "Sat 22/08/2026 · 09:00–12:00 · Bedok Community Centre", month: "Aug", day: "22", badge: "Waitlist #2", tone: "amber", cancellable: true, waiting_position: 2, note: "Participant waitlist — position 2 of 3." }
  ],
  Cancelled: [
    { eventId: 9, name: "Fundraising Bake Sale Helpers", participation_type: "Volunteer", meta: "Sun 05/07/2026 · 11:00–16:00 · Tampines Community Club · Cancelled by you on 30/06/2026", month: "Jul", day: "05", badge: "Cancelled", tone: "grey", cancellable: false, waiting_position: null }
  ],
  Attended: [
    { eventId: 11, name: "Weekend Tutoring — Primary Maths", participation_type: "Volunteer", meta: "Sun 12/07/2026 · 10:00–12:00 · Tampines Community Club · 3.0 hours recorded", month: "Jul", day: "12", badge: "Attended", tone: "green", cancellable: false, waiting_position: null },
    { eventId: 5, name: "Park Clean-Up & Recycling Drive", participation_type: "Participant", meta: "Sat 27/06/2026 · 07:30–10:30 · Bishan-Ang Mo Kio Park", month: "Jun", day: "27", badge: "Attended", tone: "green", cancellable: false, waiting_position: null },
    { eventId: 8, name: "Grocery Delivery for Seniors", participation_type: "Volunteer", meta: "Sat 13/06/2026 · 09:00–12:00 · Bedok Community Centre · 3.5 hours recorded", month: "Jun", day: "13", badge: "Attended", tone: "green", cancellable: false, waiting_position: null }
  ]
};

const memberNotifications = [
  { type: "success", text: "Your <b>Volunteer</b> place for <b>Coastal Clean-Up</b> is confirmed.", time: "Today, 09:14" },
  { type: "warning", text: "You moved up to <b>position #3</b> on the Food Distribution volunteer waiting list.", time: "Yesterday, 16:40" },
  { type: "success", text: "<b>3.0 hours</b> recorded for tutoring where you volunteered on 12/07/2026.", time: "12/07/2026, 13:05" },
  { type: "muted", text: "Reminder: Elderly Befriending Visits (Participant) starts in 3 days.", time: "11/07/2026, 08:00" }
];

const memberHoursSummary = {
  totalHours: "38.5",
  eventCount: 11,
  monthHours: "6.0",
  monthEvents: 2,
  attendanceRate: "92%",
  attended: 11,
  absent: 1
};

const memberMonthlyHours = [
  { label: "Jan", val: "4.5", h: 60, current: false },
  { label: "Feb", val: "5.0", h: 67, current: false },
  { label: "Mar", val: "7.5", h: 100, current: false },
  { label: "Apr", val: "4.0", h: 53, current: false },
  { label: "May", val: "6.0", h: 80, current: false },
  { label: "Jun", val: "5.5", h: 73, current: false },
  { label: "Jul", val: "6.0", h: 80, current: true }
];

const memberHourHistory = [
  { name: "Weekend Tutoring — Primary Maths", date: "12/07/2026", loc: "Tampines CC", status: "Attended", hours: "3.0" },
  { name: "Community Garden Planting Day", date: "04/07/2026", loc: "Jurong Lake Gardens", status: "Attended", hours: "3.0" },
  { name: "Park Clean-Up & Recycling Drive", date: "27/06/2026", loc: "Bishan-AMK Park", status: "Attended", hours: "3.0" },
  { name: "Grocery Delivery for Seniors", date: "13/06/2026", loc: "Bedok CC", status: "Attended", hours: "3.5" },
  { name: "Charity Fun Run — Route Marshals", date: "24/05/2026", loc: "Jurong Lake Gardens", status: "Absent", hours: "0.0" },
  { name: "Food Distribution Drive", date: "09/05/2026", loc: "Bedok CC", status: "Attended", hours: "4.0" },
  { name: "Elderly Befriending Visits", date: "22/04/2026", loc: "Tampines CC", status: "Attended", hours: "3.0" }
];

const organiserStats = {
  totalEvents: 24,
  completed: 18,
  upcoming: 6,
  confirmedParticipants: 286,
  confirmedVolunteers: 138,
  participantWaitlist: 22,
  volunteerWaitlist: 14,
  avgAttendance: "89%"
};

const organiserAlerts = [
  { tone: "danger", text: "Food Distribution Drive: volunteer and participant places are full (waitlists open)", link: "/organiser/events/2/registrations", linkText: "Review registrations →" },
  { tone: "warning", text: "Coastal Clean-Up: 3 Team Lead volunteer roles still unassigned", link: "/organiser/events/1/roles", linkText: "Assign roles →" },
  { tone: "warning", text: "Attendance for Weekend Tutoring (12/07) not yet finalised", link: "/organiser/events/11/attendance", linkText: "Record attendance →" }
];

const organiserAttendanceSummary = [
  { name: "Weekend Tutoring (12/07)", rate: "90%" },
  { name: "Garden Planting (04/07)", rate: "93%" },
  { name: "Park Clean-Up (27/06)", rate: "84%" }
];

const manageEventRows = [
  { id: 1, name: "Coastal Clean-Up at East Coast Park", loc: "East Coast Park, Area C", cat: "Environment", when: "25/07/2026 · 08:00", participants_filled: 42, participant_capacity: 50, volunteers_filled: 10, volunteer_capacity: 10, status: "Published", cancellable: true },
  { id: 2, name: "Food Distribution Drive", loc: "Bedok Community Centre", cat: "Food Support", when: "01/08/2026 · 09:00", participants_filled: 40, participant_capacity: 40, volunteers_filled: 25, volunteer_capacity: 25, status: "Full", cancellable: true },
  { id: 5, name: "Park Clean-Up & Recycling Drive", loc: "Bishan-Ang Mo Kio Park", cat: "Environment", when: "08/08/2026 · 07:30", participants_filled: 30, participant_capacity: 60, volunteers_filled: 22, volunteer_capacity: 50, status: "Published", cancellable: true },
  { id: 7, name: "Community Garden Planting Day", loc: "Jurong Lake Gardens", cat: "Environment", when: "15/08/2026 · 08:00", participants_filled: 18, participant_capacity: 40, volunteers_filled: 12, volunteer_capacity: 30, status: "Published", cancellable: true },
  { id: 10, name: "Coastal Clean-Up — September", loc: "East Coast Park, Area F", cat: "Environment", when: "12/09/2026 · 08:00", participants_filled: 0, participant_capacity: 50, volunteers_filled: 0, volunteer_capacity: 40, status: "Draft", cancellable: false },
  { id: 11, name: "Weekend Tutoring — Primary Maths", loc: "Tampines Community Club", cat: "Education", when: "12/07/2026 · 10:00", participants_filled: 25, participant_capacity: 25, volunteers_filled: 20, volunteer_capacity: 20, status: "Completed", cancellable: false }
];

manageEventRows.forEach(function (row) {
  Object.assign(row, dualCapacityMeta(row.participants_filled, row.participant_capacity, row.volunteers_filled, row.volunteer_capacity));
});

const confirmedParticipants = [
  { name: "Mei Ling Ho", initials: "MH", contact: "meiling.ho@example.sg · 9011 2200", date: "18/07/2026", avBg: "#7FA8D9", participation_type: "Participant" },
  { name: "Farhan Ismail", initials: "FI", contact: "farhan.i@example.sg · 9333 1100", date: "19/07/2026", avBg: "#C08FBB", participation_type: "Participant" },
  { name: "Grace Chua", initials: "GC", contact: "grace.chua@example.sg · 9555 0099", date: "20/07/2026", avBg: "#8FBF9A", participation_type: "Participant" }
];

const confirmedVolunteers = [
  { name: "Nurul Aisyah", initials: "NA", contact: "nurul.a@example.sg · 9122 1188", date: "18/07/2026", avBg: "#C08FBB", participation_type: "Volunteer" },
  { name: "David Ong", initials: "DO", contact: "david.ong@example.sg · 9788 0021", date: "19/07/2026", avBg: "#7FA8D9", participation_type: "Volunteer" },
  { name: "Priya Nair", initials: "PN", contact: "priya.n@example.sg · 9011 4455", date: "20/07/2026", avBg: "#D99E2B", participation_type: "Volunteer" },
  { name: "Rajesh Kumar", initials: "RK", contact: "rajesh.k@example.sg · 9333 6701", date: "21/07/2026", avBg: "#8FBF9A", participation_type: "Volunteer" },
  { name: "Aisha Abdullah", initials: "AA", contact: "aisha.a@example.sg · 9555 2010", date: "22/07/2026", avBg: "#D9A08F", participation_type: "Volunteer" }
];

const participantWaitlist = [
  { pos: 1, name: "Ethan Wong", initials: "EW", contact: "ethan.w@example.sg", date: "23/07/2026", avBg: "#D9A08F", participation_type: "Participant" },
  { pos: 2, name: "Siti Aminah", initials: "SA", contact: "siti.a@example.sg", date: "24/07/2026", avBg: "#B9C98F", participation_type: "Participant" }
];

const volunteerWaitlist = [
  { pos: 1, name: "Tan Wei Ling", initials: "WL", contact: "weiling.tan@example.sg", date: "23/07/2026", avBg: "#D99E2B", participation_type: "Volunteer" },
  { pos: 2, name: "Jason Teo", initials: "JT", contact: "jason.teo@example.sg", date: "23/07/2026", avBg: "#B9C98F", participation_type: "Volunteer" },
  { pos: 3, name: "Lucas Tan", initials: "LT", contact: "lucas.t@example.sg", date: "24/07/2026", avBg: "#7FA8D9", participation_type: "Volunteer" }
];

const roleAssignmentData = {
  roles: [
    {
      name: "Beach Sweeper",
      desc: "Collect litter along the assigned zone",
      cap: "24 of 28 filled",
      capBg: "#E7F2EA",
      capFg: "#1E4D33",
      people: [
        { name: "Nurul Aisyah", initials: "NA", avBg: "#C08FBB" },
        { name: "David Ong", initials: "DO", avBg: "#7FA8D9" }
      ],
      hasSpace: true,
      spaceNote: "4 spaces remaining"
    },
    {
      name: "Data Recorder",
      desc: "Log litter types for the waste audit",
      cap: "7 of 8 filled",
      capBg: "#FBF3DF",
      capFg: "#8A5E08",
      people: [
        { name: "Priya Nair", initials: "PN", avBg: "#D99E2B" }
      ],
      hasSpace: true,
      spaceNote: "1 space remaining"
    },
    {
      name: "Team Lead",
      desc: "Guide a team of 8–10 volunteers",
      cap: "4 of 4 filled",
      capBg: "#FBEAE8",
      capFg: "#B0433B",
      people: [
        { name: "Rajesh Kumar", initials: "RK", avBg: "#8FBF9A" },
        { name: "Aisha Abdullah", initials: "AA", avBg: "#D9A08F" }
      ],
      hasSpace: false,
      spaceNote: ""
    }
  ],
  unassigned: [
    { name: "Mei Ling Ho", initials: "MH", avBg: "#7FA8D9" },
    { name: "Farhan Ismail", initials: "FI", avBg: "#C08FBB" },
    { name: "Grace Chua", initials: "GC", avBg: "#8FBF9A" },
    { name: "Ethan Wong", initials: "EW", avBg: "#D9A08F" },
    { name: "Siti Aminah", initials: "SA", avBg: "#B9C98F" },
    { name: "Lucas Tan", initials: "LT", avBg: "#D99E2B" }
  ]
};

const attendanceRows = [
  { name: "Nurul Aisyah", initials: "NA", participation_type: "Volunteer", role: "Tutor — Group A", status: "Attended", avBg: "#D99E2B" },
  { name: "David Ong", initials: "DO", participation_type: "Volunteer", role: "Tutor — Group A", status: "Attended", avBg: "#7FA8D9" },
  { name: "Priya Nair", initials: "PN", participation_type: "Volunteer", role: "Tutor — Group B", status: "Attended", avBg: "#C08FBB" },
  { name: "Rajesh Kumar", initials: "RK", participation_type: "Volunteer", role: "Tutor — Group B", status: "Absent", avBg: "#8FBF9A" },
  { name: "Mei Ling Ho", initials: "MH", participation_type: "Participant", role: "—", status: "Attended", avBg: "#B9C98F" },
  { name: "Farhan Ismail", initials: "FI", participation_type: "Participant", role: "—", status: "Pending", avBg: "#7FA8D9" },
  { name: "Aisha Abdullah", initials: "AA", participation_type: "Volunteer", role: "Helper", status: "Attended", avBg: "#D9A08F" },
  { name: "Ethan Wong", initials: "EW", participation_type: "Participant", role: "—", status: "Pending", avBg: "#C08FBB" }
];

const adminStats = {
  totalUsers: "1,318",
  usersDelta: "+46 this month",
  events2026: "213",
  eventsNote: "31 upcoming · 182 completed",
  registrations2026: "5,872",
  registrationsNote: "312 currently waitlisted",
  hours2026: "12,450",
  hoursDelta: "+1,204 this month"
};

const adminMonthlyRegs = [
  { label: "Jan", val: "620", h: 56, current: false },
  { label: "Feb", val: "710", h: 64, current: false },
  { label: "Mar", val: "890", h: 80, current: false },
  { label: "Apr", val: "764", h: 69, current: false },
  { label: "May", val: "902", h: 82, current: false },
  { label: "Jun", val: "880", h: 80, current: false },
  { label: "Jul", val: "1,106", h: 100, current: true }
];

const adminUserRoles = [
  { label: "Community members", count: "1,240", pct: 94, color: "#2E7D4F" },
  { label: "Organisers", count: "72", pct: 6, color: "#D99E2B" },
  { label: "Admins", count: "6", pct: 2, color: "#7FA8D9" }
];

const adminHoursByCat = [
  { label: "Environment", val: "412 h", color: "#2E7D4F" },
  { label: "Food Support", val: "318 h", color: "#D99E2B" },
  { label: "Elderly Support", val: "226 h", color: "#C08FBB" },
  { label: "Education", val: "158 h", color: "#7FA8D9" },
  { label: "Fundraising", val: "90 h", color: "#D9A08F" }
];

const adminUsers = [
  { name: "Tan Wei Ling", email: "weiling.tan@example.sg", role: "Community member", joined: "14/01/2026", status: "Active", initials: "WL", avBg: "#D99E2B" },
  { name: "Marcus Lim", email: "marcus.lim@example.sg", role: "Organiser", joined: "03/11/2025", status: "Active", initials: "ML", avBg: "#7FA8D9" },
  { name: "Nurul Aisyah", email: "nurul.a@example.sg", role: "Community member", joined: "22/02/2026", status: "Active", initials: "NA", avBg: "#C08FBB" },
  { name: "Grace Chua", email: "grace.chua@example.sg", role: "Organiser", joined: "12/07/2026", status: "Pending", initials: "GC", avBg: "#8FBF9A" },
  { name: "Rajesh Kumar", email: "rajesh.k@example.sg", role: "Community member", joined: "08/03/2026", status: "Active", initials: "RK", avBg: "#D9A08F" },
  { name: "Jason Teo", email: "jason.teo@example.sg", role: "Community member", joined: "19/05/2026", status: "Suspended", initials: "JT", avBg: "#B9C98F" },
  { name: "Siti Rahman", email: "siti.r@communityconnect.sg", role: "Admin", joined: "01/09/2025", status: "Active", initials: "SR", avBg: "#C08FBB" }
];

const reportKpis = {
  eventsCompleted: "182",
  avgFillRate: "87%",
  avgAttendance: "89%",
  cancellationRate: "6.4%"
};

const reportByCategory = [
  { name: "Environment", color: "#2E7D4F", events: "68", regs: "2,140", att: "1,910", hours: "4,820", fill: "91%" },
  { name: "Food Support", color: "#D99E2B", events: "47", regs: "1,420", att: "1,260", hours: "3,110", fill: "88%" },
  { name: "Elderly Support", color: "#C08FBB", events: "39", regs: "980", att: "870", hours: "2,240", fill: "84%" },
  { name: "Education", color: "#7FA8D9", events: "34", regs: "860", att: "790", hours: "1,580", fill: "86%" },
  { name: "Fundraising", color: "#D9A08F", events: "25", regs: "472", att: "410", hours: "700", fill: "79%" }
];

const topEvents = [
  { rank: 1, name: "Coastal Clean-Up at East Coast Park", date: "25/07/2026", attendees: "38" },
  { rank: 2, name: "Charity Fun Run — Route Marshals", date: "16/08/2026", attendees: "41" },
  { rank: 3, name: "Food Distribution Drive", date: "01/08/2026", attendees: "25" },
  { rank: 4, name: "Park Clean-Up & Recycling Drive", date: "08/08/2026", attendees: "44" },
  { rank: 5, name: "Community Garden Planting Day", date: "15/08/2026", attendees: "28" }
];

function findEvent(id) {
  return events.find(function (ev) { return String(ev.id) === String(id); });
}

function withTone(row) {
  const tones = {
    green: { badgeBg: "#E7F2EA", badgeFg: "#1E4D33", dateBg: "#E7F2EA", dateFg: "#1E4D33" },
    amber: { badgeBg: "#FBF3DF", badgeFg: "#8A5E08", dateBg: "#FBF3DF", dateFg: "#8A5E08" },
    grey: { badgeBg: "#EDEAE0", badgeFg: "#6E7266", dateBg: "#EDEAE0", dateFg: "#6E7266" }
  };
  return Object.assign({}, row, tones[row.tone] || tones.green);
}

function publicLocals(extra) {
  return Object.assign({
    layout: "public",
    activeNav: "",
    pageTitle: "CommunityConnect SG",
    currentUser: null,
    messages: []
  }, extra || {});
}

function appLocals(role, user, activeNav, extra) {
  return Object.assign({
    layout: "app",
    role: role,
    activeNav: activeNav,
    pageTitle: "CommunityConnect",
    currentUser: user,
    messages: []
  }, extra || {});
}

// ---------- Public GET routes (MySQL-backed) ----------

app.get("/", async function (req, res) {
  try {
    const [impactStats, featuredEvents] = await Promise.all([
      publicEvents.getLandingStats(),
      publicEvents.getFeaturedEvents(3)
    ]);

    res.render("index", publicLocals({
      activeNav: "home",
      pageTitle: "CommunityConnect SG",
      impactStats: impactStats,
      featuredEvents: featuredEvents,
      heroBadge: "Serving neighbourhoods across Singapore"
    }));
  } catch (err) {
    console.error("Landing page query failed:", err.message);
    res.status(500).render("error", publicLocals({
      activeNav: "home",
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load the latest community events. Please try again shortly."
    }));
  }
});

app.get("/login", function (req, res) {
  res.render("login", publicLocals({
    activeNav: "login",
    pageTitle: "Log in · CommunityConnect SG"
  }));
});

app.get("/register", function (req, res) {
  res.render("register", publicLocals({
    activeNav: "register",
    pageTitle: "Register · CommunityConnect SG"
  }));
});

app.get("/events", async function (req, res) {
  try {
    const search = (req.query.search || req.query.q || "").trim();
    const category = (req.query.category || req.query.category_id || "").trim();
    const date = (req.query.date || "").trim();
    const location = (req.query.location || "").trim();
    const availability = (req.query.availability || "").trim();

    const filters = {
      search: search,
      category: category,
      date: date,
      location: location,
      availability: availability
    };

    const hasFilters = Boolean(
      search
      || category
      || (date && date !== "Any date")
      || (location && location !== "All areas")
      || (availability && availability !== "All events")
    );

    const [catalogue, dbCategories, totalEventsInDatabase] = await Promise.all([
      publicEvents.getCatalogueEvents(filters),
      publicEvents.getPublicCategories(),
      publicEvents.countEvents()
    ]);

    res.render("events", publicLocals({
      activeNav: "events",
      pageTitle: "Event Catalogue · CommunityConnect SG",
      events: catalogue.events,
      categories: dbCategories,
      filters: filters,
      hasFilters: hasFilters,
      totalEventsInDatabase: totalEventsInDatabase
    }));
  } catch (err) {
    console.error("Event catalogue query failed:", err.message);
    res.status(500).render("error", publicLocals({
      activeNav: "events",
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load the event catalogue. Please try again shortly."
    }));
  }
});

app.get("/events/:id", async function (req, res) {
  try {
    const event = await publicEvents.getEventById(req.params.id);
    if (!event) {
      return res.status(404).render("error", publicLocals({
        activeNav: "events",
        pageTitle: "Event not found · CommunityConnect SG",
        statusCode: 404,
        errorTitle: "Event not found",
        errorMessage: "This event does not exist or is no longer available."
      }));
    }

    const roles = await publicEvents.getVolunteerRolesForEvent(event.event_id);
    res.render("event-details", publicLocals({
      activeNav: "events",
      pageTitle: event.event_name + " · CommunityConnect SG",
      event: event,
      roles: roles,
      messages: takeFlash(req)
    }));
  } catch (err) {
    console.error("Event details query failed:", err.message);
    res.status(500).render("error", publicLocals({
      activeNav: "events",
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load this event. Please try again shortly."
    }));
  }
});

// ---------- Community member GET preview routes ----------

app.get("/member/dashboard", attachCurrentUser, async function (req, res) {
  try {
    const asParticipant = memberRegistrations.Confirmed
      .filter(function (r) { return r.participation_type === "Participant"; })
      .map(withTone);
    const asVolunteer = memberRegistrations.Confirmed
      .filter(function (r) { return r.participation_type === "Volunteer"; })
      .map(withTone);
    const participantWaitlist = memberRegistrations.Waitlisted
      .filter(function (r) { return r.participation_type === "Participant"; })
      .map(withTone);
    const volunteerWaitlistRows = memberRegistrations.Waitlisted
      .filter(function (r) { return r.participation_type === "Volunteer"; })
      .map(withTone);
    const recommended = [events[4], events[6]];

    const userId = req.currentUser && req.currentUser.user_id ? req.currentUser.user_id : (req.session.user && req.session.user.user_id ? req.session.user.user_id : 3);
    const notifications = await notificationController.listNotifications(pool, userId, {
      limit: 8,
      offset: 0,
      includeRead: true
    });

    const normalizedNotifications = notifications.map(function (notification) {
      return {
        id: notification.notification_id,
        type: notification.notification_type.toLowerCase(),
        text: notification.message,
        time: new Date(notification.created_at).toLocaleString("en-SG", {
          dateStyle: "medium",
          timeStyle: "short"
        })
      };
    });

    res.render("member/dashboard", appLocals("member", memberUser, "dashboard", {
      pageTitle: "Dashboard · Community member",
      asParticipant: asParticipant,
      asVolunteer: asVolunteer,
      participantWaitlist: participantWaitlist,
      volunteerWaitlist: volunteerWaitlistRows,
      recommended: recommended,
      notifications: normalizedNotifications,
      unreadCount: normalizedNotifications.length,
      stats: {
        participantUpcoming: asParticipant.length,
        volunteerUpcoming: asVolunteer.length,
        participantWaitlist: participantWaitlist.length,
        volunteerWaitlist: volunteerWaitlistRows.length,
        hours: memberHoursSummary.totalHours,
        hoursNote: "Across " + memberHoursSummary.eventCount + " volunteer events since Jan 2026"
      }
    }));
  } catch (err) {
    console.error("member dashboard notification load failed:", err.message);
    res.status(500).render("error", publicLocals({
      activeNav: "dashboard",
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load your dashboard notifications. Please try again shortly."
    }));
  }
});

app.get("/member/volunteer-hours", function (req, res) {
  res.render("member/volunteer-hours", appLocals("member", memberUser, "hours", {
    pageTitle: "Volunteer Hours · Community member",
    summary: memberHoursSummary,
    months: memberMonthlyHours,
    history: memberHourHistory
  }));
});

app.get("/member/profile", function (req, res) {
  res.render("member/profile", appLocals("member", memberUser, "profile", {
    pageTitle: "My Profile · Community member",
    profile: memberUser,
    hours: memberHoursSummary.totalHours,
    attendedEvents: memberHoursSummary.eventCount
  }));
});

// Compatibility redirects from former volunteer paths
app.get("/volunteer/dashboard", function (req, res) { res.redirect("/member/dashboard"); });
app.get("/volunteer/registrations", function (req, res) { res.redirect("/member/registrations"); });
app.get("/volunteer/hours", function (req, res) { res.redirect("/member/volunteer-hours"); });
app.get("/volunteer/profile", function (req, res) { res.redirect("/member/profile"); });

// ---------- Organiser GET preview routes ----------

app.get("/organiser/dashboard", async function (req, res) {
  try {
    await organiserStatsController.renderOrganiserDashboard(req, res);
  } catch (error) {
    console.error("organiser dashboard route failed:", error.message);
    res.status(500).render("error", publicLocals({
      activeNav: "dashboard",
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load your organiser dashboard. Please try again shortly."
    }));
  }
});

app.get("/api/organiser/dashboard-stats", attachCurrentUser, async function (req, res) {
  try {
    if (req.currentUser && req.currentUser.role !== "organiser") {
      return res.status(403).json({ error: "Only organisers can view this dashboard statistics API." });
    }

    const statsData = await organiserStatsController.getOrganiserDashboardData(req.currentUser.user_id);
    return res.json(statsData.stats);
  } catch (error) {
    console.error("organiser dashboard API failed:", error.message);
    return res.status(500).json({ error: "Unable to load organiser statistics." });
  }
});

app.get("/organiser/events", function (req, res) {
  res.render("organiser/manage-events", appLocals("organiser", organiserUser, "events", {
    pageTitle: "Manage Events · Organiser",
    rows: manageEventRows,
    categories: categories.filter(function (c) { return c.status === "Active"; })
  }));
});

app.get("/organiser/events/new", function (req, res) {
  res.render("organiser/event-form", appLocals("organiser", organiserUser, "events", {
    pageTitle: "Add Event · Organiser",
    formMode: "create",
    event: {
      event_name: "",
      category_id: 1,
      description: "",
      start_datetime: "",
      end_datetime: "",
      location: "",
      participant_capacity: "",
      volunteer_capacity: "",
      registration_deadline: "",
      status: "Draft"
    },
    categories: categories.filter(function (c) { return c.status === "Active"; }),
    messages: []
  }));
});

app.get("/organiser/events/:id/edit", function (req, res) {
  const event = findEvent(req.params.id) || events[0];
  res.render("organiser/event-form", appLocals("organiser", organiserUser, "events", {
    pageTitle: "Edit Event · Organiser",
    formMode: "edit",
    event: event,
    categories: categories.filter(function (c) { return c.status === "Active"; }),
    messages: [{
      type: "warning",
      text: "This event has " + event.participants_filled + " confirmed participants and " + event.volunteers_filled + " confirmed volunteers. Reducing a capacity below its confirmed count will move the most recent matching registrations to that waiting list."
    }]
  }));
});

app.get("/organiser/events/:id/registrations", function (req, res) {
  const event = findEvent(req.params.id) || events[1];
  res.render("organiser/manage-registrations", appLocals("organiser", organiserUser, "registrations", {
    pageTitle: "Manage Registrations · Organiser",
    event: event,
    eventOptions: manageEventRows.filter(function (r) { return r.status !== "Draft"; }),
    confirmedParticipants: confirmedParticipants,
    confirmedVolunteers: confirmedVolunteers,
    participantWaitlist: participantWaitlist,
    volunteerWaitlist: volunteerWaitlist,
    summary: {
      participant_capacity: event.participant_capacity,
      volunteer_capacity: event.volunteer_capacity,
      confirmedParticipants: event.participants_filled,
      confirmedVolunteers: event.volunteers_filled,
      participantWaitlist: event.participantWaitlistCount || participantWaitlist.length,
      volunteerWaitlist: event.volunteerWaitlistCount || volunteerWaitlist.length,
      cancellations: 3
    },
    messages: (event.participants.full || event.volunteers.full) ? [{
      type: "warning",
      text: "One or both capacities are full. If a confirmed registration cancels, the earliest matching waitlisted person is offered the space automatically."
    }] : []
  }));
});

app.get("/organiser/events/:id/roles", function (req, res) {
  const event = findEvent(req.params.id) || events[0];
  res.render("organiser/role-assignment", appLocals("organiser", organiserUser, "roles", {
    pageTitle: "Role Assignment · Organiser",
    event: event,
    eventOptions: [events[0], events[1]],
    roles: roleAssignmentData.roles,
    unassigned: roleAssignmentData.unassigned,
    roleOptions: volunteerRoles,
    messages: [{
      type: "warning",
      text: "6 confirmed volunteers have not been assigned a role yet. All volunteers must have a role before event day."
    }]
  }));
});

app.get("/organiser/events/:id/attendance", function (req, res) {
  const event = findEvent(req.params.id) || events[10];
  const attendedCount = attendanceRows.filter(function (r) { return r.status === "Attended"; }).length;
  const absentCount = attendanceRows.filter(function (r) { return r.status === "Absent"; }).length;
  const pendingCount = attendanceRows.filter(function (r) { return r.status === "Pending"; }).length;
  res.render("organiser/attendance", appLocals("organiser", organiserUser, "attendance", {
    pageTitle: "Attendance · Organiser",
    event: event,
    eventOptions: [events[10], events[6]],
    rows: attendanceRows,
    summary: {
      registered: 20,
      attended: attendedCount,
      absent: absentCount,
      pending: pendingCount
    },
    messages: [{
      type: "success",
      text: "Marking a volunteer as <b>Attended</b> records 2.0 hours (event duration) to their volunteer record automatically."
    }]
  }));
});

app.get("/organiser/reports/attendance", attachCurrentUser, async function (req, res) {
  try {
    await organiserAttendanceReportController.renderAttendanceReportPage(req, res);
  } catch (error) {
    console.error("attendance report route failed:", error.message);
    res.status(500).render("error", publicLocals({
      activeNav: "attendance-reports",
      pageTitle: "Something went wrong · CommunityConnect SG",
      statusCode: 500,
      errorTitle: "Something went wrong",
      errorMessage: "We could not load the attendance report. Please try again shortly."
    }));
  }
});

app.get("/organiser/reports/export", attachCurrentUser, async function (req, res) {
  try {
    await organiserAttendanceReportController.exportAttendanceReportCsv(req, res);
  } catch (error) {
    console.error("attendance report export route failed:", error.message);
    res.status(500).send("Unable to export attendance report.");
  }
});

// ---------- Admin GET preview routes ----------

app.get("/admin/dashboard", function (req, res) {
  res.render("admin/dashboard", appLocals("admin", adminUser, "dashboard", {
    pageTitle: "Admin Dashboard",
    stats: adminStats,
    months: adminMonthlyRegs,
    userRoles: adminUserRoles,
    hoursByCat: adminHoursByCat,
    asOf: "15/07/2026, 14:00"
  }));
});

app.get("/admin/users", function (req, res) {
  res.render("admin/users", appLocals("admin", adminUser, "users", {
    pageTitle: "User Management · Admin",
    users: adminUsers
  }));
});

app.get("/admin/categories", function (req, res) {
  res.render("admin/categories", appLocals("admin", adminUser, "categories", {
    pageTitle: "Event Categories · Admin",
    categories: categories
  }));
});

app.get("/admin/reports", function (req, res) {
  res.render("admin/reports", appLocals("admin", adminUser, "reports", {
    pageTitle: "System Reports · Admin",
    kpis: reportKpis,
    byCategory: reportByCategory,
    topEvents: topEvents
  }));
});

async function startServer() {
  try {
    await pool.query("SELECT 1 AS connection_test");
    console.log("Connected to CommunityConnect MySQL database");

    app.listen(PORT, function () {
      console.log("CommunityConnect running at http://localhost:" + PORT);
    });
  } catch (err) {
    console.error("Database connection failed. CommunityConnect could not start.");
    console.error(err.message);
    process.exit(1);
  }
}

startServer();
