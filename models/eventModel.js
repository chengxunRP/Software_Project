const pool = require("../config/database");

async function findEventsByOrganiser(organiserId, filters) {
  const params = [organiserId];
  let whereSql = "WHERE e.organiser_id = ?";

  if (filters && filters.search) {
    whereSql += " AND (e.event_name LIKE ? OR e.location LIKE ? OR e.description LIKE ? )";
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }

  if (filters && filters.categoryId) {
    whereSql += " AND e.category_id = ?";
    params.push(filters.categoryId);
  }

  const sql = `
    SELECT
      e.event_id,
      e.event_name,
      e.start_datetime,
      e.end_datetime,
      e.location,
      e.participant_capacity,
      e.volunteer_capacity,
      e.registration_deadline,
      e.status,
      c.category_id,
      c.category_name AS category_name,
      COALESCE(SUM(CASE WHEN r.participation_type = 'Participant' AND r.status = 'Confirmed' THEN 1 ELSE 0 END), 0) AS participants_filled,
      COALESCE(SUM(CASE WHEN r.participation_type = 'Volunteer' AND r.status = 'Confirmed' THEN 1 ELSE 0 END), 0) AS volunteers_filled
    FROM events e
    JOIN event_categories c ON c.category_id = e.category_id
    LEFT JOIN event_registrations r ON r.event_id = e.event_id
    ${whereSql}
    GROUP BY
      e.event_id,
      e.event_name,
      e.start_datetime,
      e.end_datetime,
      e.location,
      e.participant_capacity,
      e.volunteer_capacity,
      e.registration_deadline,
      e.status,
      c.category_id,
      c.category_name
    ORDER BY e.start_datetime DESC
  `;

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function findEventById(eventId, organiserId) {
  const params = [eventId];
  let organiserClause = "";

  if (organiserId !== undefined && organiserId !== null) {
    organiserClause = "AND e.organiser_id = ?";
    params.push(organiserId);
  }

  const sql = `
    SELECT
      e.event_id,
      e.event_name,
      e.description,
      e.start_datetime,
      e.end_datetime,
      e.location,
      e.participant_capacity,
      e.volunteer_capacity,
      e.registration_deadline,
      e.status,
      e.category_id,
      c.category_name AS category_name,
      COALESCE(SUM(CASE WHEN r.participation_type = 'Participant' AND r.status = 'Confirmed' THEN 1 ELSE 0 END), 0) AS participants_filled,
      COALESCE(SUM(CASE WHEN r.participation_type = 'Volunteer' AND r.status = 'Confirmed' THEN 1 ELSE 0 END), 0) AS volunteers_filled,
      COALESCE(SUM(CASE WHEN r.participation_type = 'Participant' AND r.status = 'Waitlisted' THEN 1 ELSE 0 END), 0) AS participant_waitlist_count,
      COALESCE(SUM(CASE WHEN r.participation_type = 'Volunteer' AND r.status = 'Waitlisted' THEN 1 ELSE 0 END), 0) AS volunteer_waitlist_count
    FROM events e
    JOIN event_categories c ON c.category_id = e.category_id
    LEFT JOIN event_registrations r ON r.event_id = e.event_id
    WHERE e.event_id = ?
    ${organiserClause}
    GROUP BY
      e.event_id,
      e.event_name,
      e.description,
      e.start_datetime,
      e.end_datetime,
      e.location,
      e.participant_capacity,
      e.volunteer_capacity,
      e.registration_deadline,
      e.status,
      e.category_id,
      c.category_name
    LIMIT 1
  `;

  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
}

async function createEvent(data) {
  const sql = `
    INSERT INTO events (
      organiser_id,
      category_id,
      event_name,
      description,
      start_datetime,
      end_datetime,
      location,
      participant_capacity,
      volunteer_capacity,
      registration_deadline,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const [result] = await pool.query(sql, [
    data.organiser_id,
    data.category_id,
    data.event_name,
    data.description,
    data.start_datetime,
    data.end_datetime,
    data.location,
    data.participant_capacity,
    data.volunteer_capacity,
    data.registration_deadline,
    data.status
  ]);
  return result.insertId;
}

async function updateEvent(eventId, organiserId, data) {
  const sql = `
    UPDATE events SET
      category_id = ?,
      event_name = ?,
      description = ?,
      start_datetime = ?,
      end_datetime = ?,
      location = ?,
      participant_capacity = ?,
      volunteer_capacity = ?,
      registration_deadline = ?,
      status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE event_id = ? AND organiser_id = ?
  `;
  const [result] = await pool.query(sql, [
    data.category_id,
    data.event_name,
    data.description,
    data.start_datetime,
    data.end_datetime,
    data.location,
    data.participant_capacity,
    data.volunteer_capacity,
    data.registration_deadline,
    data.status,
    eventId,
    organiserId
  ]);
  return result.affectedRows;
}

async function deleteEvent(eventId, organiserId) {
  const sql = "DELETE FROM events WHERE event_id = ? AND organiser_id = ?";
  const [result] = await pool.query(sql, [eventId, organiserId]);
  return result.affectedRows;
}

async function duplicateEventNameOnDate(eventName, startDatetime, excludeEventId) {
  const params = [eventName, startDatetime];
  let sql = `
    SELECT COUNT(*) AS total
    FROM events
    WHERE event_name = ?
      AND DATE(start_datetime) = DATE(?)
  `;

  if (excludeEventId && Number.isInteger(Number(excludeEventId))) {
    sql += " AND event_id <> ?";
    params.push(excludeEventId);
  }

  const [rows] = await pool.query(sql, params);
  return Number(rows[0].total) > 0;
}

module.exports = {
  findEventsByOrganiser,
  findEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  duplicateEventNameOnDate
};
