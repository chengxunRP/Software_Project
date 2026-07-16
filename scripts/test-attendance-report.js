const assert = require("assert");
const { buildAttendanceReportRows, buildAttendanceReportCsv } = require("../controllers/organiserAttendanceReportController");

const sampleRows = [
  {
    event_id: 3,
    event_name: "Community Food Distribution",
    start_datetime: "2026-09-05T09:00:00.000Z",
    status: "Open",
    registered_volunteers: 4,
    attended_count: 2,
    absent_count: 1,
    volunteer_hours: "3.00",
    waitlisted_volunteers: 1
  },
  {
    event_id: 1,
    event_name: "East Coast Park Clean-Up",
    start_datetime: "2026-08-15T08:00:00.000Z",
    status: "Open",
    registered_volunteers: 3,
    attended_count: 3,
    absent_count: 0,
    volunteer_hours: "6.00",
    waitlisted_volunteers: 0
  }
];

const rows = buildAttendanceReportRows(sampleRows, { sortBy: "attendance_percentage", sortOrder: "desc" });
assert.strictEqual(rows[0].event_name, "East Coast Park Clean-Up");
assert.strictEqual(rows[0].attendance_percentage, 100);
assert.strictEqual(rows[1].attendance_percentage, 50);
assert.strictEqual(rows[0].volunteer_hours_earned, 6);

const csv = buildAttendanceReportCsv(rows);
assert.ok(csv.includes("event_name,event_date"));
assert.ok(csv.includes("East Coast Park Clean-Up"));

console.log("Attendance report helper checks passed.");
