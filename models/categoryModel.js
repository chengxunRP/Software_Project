const pool = require("../config/database");

async function getAllWithEventCounts() {
  const sql = `
    SELECT
      c.category_id,
      c.category_name AS name,
      c.description,
      COUNT(e.event_id) AS event_count
    FROM event_categories c
    LEFT JOIN events e ON e.category_id = c.category_id
    GROUP BY
      c.category_id,
      c.category_name,
      c.description
    ORDER BY c.category_name ASC
  `;
  const [rows] = await pool.query(sql);
  return rows;
}

async function getById(categoryId) {
  const [rows] = await pool.query(
    `SELECT category_id, category_name AS name, description
     FROM event_categories
     WHERE category_id = ?
     LIMIT 1`,
    [categoryId]
  );
  return rows[0] || null;
}

async function existsWithName(categoryName, excludeCategoryId) {
  const params = [categoryName];
  let sql = `SELECT COUNT(*) AS total FROM event_categories WHERE category_name = ?`;
  if (excludeCategoryId && Number.isInteger(Number(excludeCategoryId))) {
    sql += " AND category_id <> ?";
    params.push(excludeCategoryId);
  }
  const [rows] = await pool.query(sql, params);
  return Number(rows[0].total) > 0;
}

async function createCategory(data) {
  const sql = `
    INSERT INTO event_categories (category_name, description)
    VALUES (?, ?)
  `;
  const [result] = await pool.query(sql, [data.name, data.description || null]);
  return result.insertId;
}

async function updateCategory(categoryId, data) {
  const sql = `
    UPDATE event_categories
    SET category_name = ?, description = ?
    WHERE category_id = ?
  `;
  const [result] = await pool.query(sql, [data.name, data.description || null, categoryId]);
  return result.affectedRows;
}

async function deleteCategory(categoryId) {
  const sql = `DELETE FROM event_categories WHERE category_id = ?`;
  const [result] = await pool.query(sql, [categoryId]);
  return result.affectedRows;
}

async function getAssignedEventCount(categoryId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM events WHERE category_id = ?`,
    [categoryId]
  );
  return Number(rows[0].total);
}

module.exports = {
  getAllWithEventCounts,
  getById,
  existsWithName,
  createCategory,
  updateCategory,
  deleteCategory,
  getAssignedEventCount
};
