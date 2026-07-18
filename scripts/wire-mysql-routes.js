/**
 * One-off helper: strip sample data from app.js and wire MySQL controllers.
 * Run: node scripts/wire-mysql-routes.js
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "..", "app.js");
let s = fs.readFileSync(appPath, "utf8");

const inject = [
  'const memberController = require("./controllers/memberController");',
  'const organiserController = require("./controllers/organiserController");',
  'const adminController = require("./controllers/adminController");'
].join("\n") + "\n";

if (!s.includes("memberController")) {
  s = s.replace(
    'const { toViewUser } = require("./lib/userDisplay");',
    'const { toViewUser } = require("./lib/userDisplay");\n' + inject
  );
}

const startMarker = "// Temporary sample data for frontend preview only";
const endMarker = "function publicLocals(extra) {";
const start = s.indexOf(startMarker);
const end = s.indexOf(endMarker);
if (start === -1 || end === -1) {
  console.error("markers not found", { start: start, end: end });
  process.exit(1);
}

s = s.slice(0, start)
  + "// Sample preview datasets removed — pages load from MySQL via controllers.\n\n"
  + s.slice(end);

const memberBlock = `// ---------- Community member routes (MySQL) ----------
app.get("/member/dashboard", requireCommunityMember, memberController.dashboard);
app.get("/member/volunteer-hours", requireCommunityMember, memberController.volunteerHours);
app.get("/member/profile", requireCommunityMember, memberController.profile);

// Compatibility redirects from former volunteer paths`;

s = s.replace(
  /\/\/ ---------- Community member GET preview routes ----------[\s\S]*?\/\/ Compatibility redirects from former volunteer paths/,
  memberBlock
);

const organiserBlock = `// ---------- Organiser routes (MySQL) ----------
app.get("/organiser/dashboard", requireOrganiser, organiserController.dashboard);
app.get("/organiser/events", requireOrganiser, organiserController.listEvents);
app.get("/organiser/events/new", requireOrganiser, organiserController.newEventForm);
app.get("/organiser/events/:id/edit", requireOrganiser, organiserController.editEventForm);
app.get("/organiser/events/:id/registrations", requireOrganiser, organiserController.manageRegistrations);
app.get("/organiser/events/:id/roles", requireOrganiser, organiserController.roleAssignment);

`;

s = s.replace(
  /\/\/ ---------- Organiser GET preview routes ----------[\s\S]*?app\.get\("\/organiser\/events\/:id\/roles",[\s\S]*?\}\);\n/,
  organiserBlock
);

const adminBlock = `// ---------- Admin routes (MySQL) ----------
// GET /admin/users lives in routes/adminUserRoutes.js
app.get("/admin/dashboard", requireAdmin, adminController.dashboard);
app.get("/admin/categories", requireAdmin, adminController.categories);
app.get("/admin/reports", requireAdmin, adminController.reports);

`;

s = s.replace(
  /\/\/ ---------- Admin GET preview routes ----------[\s\S]*?app\.get\("\/admin\/reports"[\s\S]*?\}\);\n/,
  adminBlock
);

fs.writeFileSync(appPath, s);
console.log("Updated", appPath);
console.log("Has memberController:", s.includes("memberController.dashboard"));
console.log("Has sample categories array:", /const categories = \[/.test(s));
console.log("Has Temporary sample:", s.includes("Temporary sample data"));
