const mysql = require("mysql2/promise");

const useSSL =
  String(process.env.DB_SSL || "")
    .trim()
    .toLowerCase() === "true";

const poolOptions = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

if (useSSL) {
  poolOptions.ssl = {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true
  };
}

console.log("Database SSL enabled:", useSSL);
console.log("Database SSL option present:", Boolean(poolOptions.ssl));

const pool = mysql.createPool(poolOptions);

module.exports = pool;
