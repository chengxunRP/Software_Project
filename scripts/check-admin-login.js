/**
 * Diagnose admin login against the same MySQL pool the app uses.
 * Usage: npm run check-admin
 * Never prints DB_PASSWORD or SESSION_SECRET.
 */
require("dotenv").config();

const bcrypt = require("bcrypt");
const pool = require("../config/database");

const ADMIN_EMAIL = "admin@communityconnect.sg";
const ADMIN_PASSWORD = "Admin@123";

async function main() {
  let failed = false;

  console.log("DB_HOST:", process.env.DB_HOST || "(not set)");
  console.log("DB_NAME:", process.env.DB_NAME || "(not set)");
  console.log("DB_USER:", process.env.DB_USER || "(not set)");

  try {
    const [rows] = await pool.query(
      `SELECT user_id, name, email, password, role, account_status
       FROM users
       WHERE LOWER(email) = LOWER(?)`,
      [ADMIN_EMAIL]
    );

    const user = rows[0] || null;
    const found = Boolean(user);
    console.log("Admin found:", found);

    if (!found) {
      failed = true;
    } else {
      const hash = String(user.password || "");
      console.log("Stored email:", user.email);
      console.log("Role:", user.role);
      console.log("Account status:", user.account_status);
      console.log("Hash prefix only:", hash.slice(0, 7));
      console.log("Hash length:", hash.length);

      const matches = await bcrypt.compare(ADMIN_PASSWORD, hash);
      console.log("Password matches:", matches);

      if (!matches) {
        failed = true;
      }
      if (user.role !== "admin") {
        console.log("FAIL: role is not admin");
        failed = true;
      }
      if (user.account_status !== "Active") {
        console.log("FAIL: account_status is not Active");
        failed = true;
      }
    }
  } catch (err) {
    console.error("check-admin failed:", err.message);
    failed = true;
  } finally {
    try {
      await pool.end();
    } catch (endErr) {
      console.error("pool.end failed:", endErr.message);
      failed = true;
    }
  }

  if (failed) {
    process.exit(1);
  }
}

main();
