require("dotenv").config();
const pool = require("../config/database");

(async function () {
  const [rows] = await pool.query(
    `SELECT registration_id, event_id, user_id, participation_type,
            preferred_role_id, notes, status, waiting_position, cancelled_at
     FROM event_registrations
     WHERE user_id = 5
     ORDER BY registration_id`
  );
  console.table(rows);

  const [e2] = await pool.query(
    `SELECT registration_id, user_id, participation_type, status, waiting_position
     FROM event_registrations
     WHERE event_id = 2
     ORDER BY participation_type, waiting_position, registration_id`
  );
  console.log("Event 2 registrations after cancel:");
  console.table(e2);

  await pool.end();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
