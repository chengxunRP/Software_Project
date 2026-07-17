const pool = require('../config/database');

(async () => {
  const userId = 3;
  const sql = `
    SELECT
      er.registration_id,
      er.event_id,
      er.status AS registration_status,
      e.event_name,
      e.start_datetime,
      e.end_datetime,
      e.location,
      u.name AS organiser_name,
      ec.category_name,
      COALESCE(a.attendance_status, er.status) AS attendance_status,
      COALESCE(a.volunteer_hours, 0) AS volunteer_hours
    FROM event_registrations er
    JOIN events e ON e.event_id = er.event_id
    JOIN users u ON u.user_id = e.organiser_id
    LEFT JOIN event_categories ec ON ec.category_id = e.category_id
    LEFT JOIN attendance a ON a.registration_id = er.registration_id
    WHERE er.user_id = ?
      AND er.participation_type = 'Volunteer'
    ORDER BY e.end_datetime DESC, e.start_datetime DESC, er.registration_id DESC
  `;

  const [rows] = await pool.query(sql, [userId]);
  console.log(JSON.stringify(rows, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
