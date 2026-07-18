require("dotenv").config();

const pool = require("../config/database");

async function testDatabaseConnection() {
  try {
    const [connectionRows] = await pool.query("SELECT 1 AS connection_test");
    const [databaseRows] = await pool.query("SELECT DATABASE() AS database_name");
    const [tableRows] = await pool.query("SHOW TABLES");

    const databaseName = databaseRows[0] && databaseRows[0].database_name;
    const tableNames = tableRows.map(function (row) {
      return Object.values(row)[0];
    });

    console.log("Database connection test succeeded.");
    console.log("Connection check:", connectionRows[0]);
    console.log("Connected database:", databaseName);
    console.log("Tables:");
    tableNames.forEach(function (name) {
      console.log(" -", name);
    });

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("Database connection test failed.");
    console.error(err.message);
    try {
      await pool.end();
    } catch (closeErr) {
      // Ignore pool close errors after a failed connection.
    }
    process.exit(1);
  }
}

testDatabaseConnection();
