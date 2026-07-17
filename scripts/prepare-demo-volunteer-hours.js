/**
 * Development helper — prepare a clearly labelled test attendance row so
 * check-out can demonstrate realistic Volunteer hours from MySQL.
 *
 * Does NOT insert fake hours into EJS. Hours are still calculated by the
 * live check-out route from check_in_time → NOW().
 *
 * Usage:
 *   node scripts/prepare-demo-volunteer-hours.js <registration_id> [hoursAgo]
 *
 * Example (after Mark Attended on a Confirmed Volunteer registration):
 *   node scripts/prepare-demo-volunteer-hours.js 42 4
 *
 * Then click Check out in the Attendance UI. volunteer_hours ≈ 4.00.
 */
require("dotenv").config();
const pool = require("../config/database");

(async function main() {
  const registrationId = parseInt(process.argv[2], 10);
  const hoursAgo = Number(process.argv[3]) || 4;

  if (!Number.isInteger(registrationId) || registrationId < 1) {
    console.error("Usage: node scripts/prepare-demo-volunteer-hours.js <registration_id> [hoursAgo]");
    process.exit(1);
  }

  const [[row]] = await pool.query(
    `SELECT a.attendance_id, a.attendance_status, a.check_in_time, a.check_out_time,
            a.volunteer_hours, er.participation_type, er.status AS reg_status,
            e.event_name, u.email
     FROM attendance a
     INNER JOIN event_registrations er ON er.registration_id = a.registration_id
     INNER JOIN events e ON e.event_id = er.event_id
     INNER JOIN users u ON u.user_id = er.user_id
     WHERE a.registration_id = ?
     LIMIT 1`,
    [registrationId]
  );

  if (!row) {
    console.error("No attendance row for registration_id=" + registrationId + ". Mark Attended in the UI first.");
    process.exit(1);
  }
  if (row.participation_type !== "Volunteer") {
    console.error("Registration is not a Volunteer — hours would remain 0.");
    process.exit(1);
  }
  if (row.attendance_status !== "Attended") {
    console.error("attendance_status must be Attended (found " + row.attendance_status + ").");
    process.exit(1);
  }
  if (row.check_out_time) {
    console.error("Already checked out. volunteer_hours=" + row.volunteer_hours);
    process.exit(1);
  }

  const minutes = Math.round(hoursAgo * 60);
  await pool.query(
    `UPDATE attendance
     SET check_in_time = DATE_SUB(NOW(), INTERVAL ? MINUTE),
         notes = CONCAT(COALESCE(notes, ''), CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE ' | ' END,
                        'DEMO: check_in backdated for Volunteer-hours demonstration')
     WHERE attendance_id = ?`,
    [minutes, row.attendance_id]
  );

  console.log("Prepared demo check-in for registration_id=" + registrationId);
  console.log("  event: " + row.event_name);
  console.log("  email: " + row.email);
  console.log("  check_in_time set to ~" + hoursAgo + " hour(s) ago");
  console.log("Next: open Attendance UI and click Check out. Hours are calculated by the app from MySQL timestamps.");
  await pool.end();
})().catch(function (err) {
  console.error(err.message);
  process.exit(1);
});
