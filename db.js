// MySQL connection pool (mysql2/promise) — shared across all route files.
// Credentials come from .env locally and from Railway env vars in production.
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
// Test the database connection on startup
pool.getConnection()
    .then(connection => {
        console.log('✅ MySQL Database connected successfully!');
        connection.release(); // Always release the connection back to the pool
    })
    .catch(err => {
        console.error('❌ MySQL Connection Failed:');
        console.error(err.message);
    });