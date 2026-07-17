const assert = require("assert");
const { pickNextWaitlistedRegistration, promoteNextMatchingWaitlistedRegistration } = require("../controllers/registrationController");

const candidates = [
  { registration_id: 10, waiting_position: 2, registered_at: "2026-07-16 10:00:00" },
  { registration_id: 11, waiting_position: 1, registered_at: "2026-07-16 09:00:00" },
  { registration_id: 12, waiting_position: 1, registered_at: "2026-07-16 10:30:00" }
];

const chosen = pickNextWaitlistedRegistration(candidates);
assert.ok(chosen, "Expected a waitlisted registration to be selected");
assert.strictEqual(chosen.registration_id, 11, "Expected FIFO ordering by waiting position first");

async function runParticipantPromotionTest() {
  const connection = {
    query: async function (sql) {
      if (sql.includes("SELECT registration_id, user_id, waiting_position, registered_at")) {
        return [[
          { registration_id: 88, user_id: 5, waiting_position: 1, registered_at: "2026-07-16 11:00:00" },
          { registration_id: 89, user_id: 6, waiting_position: 2, registered_at: "2026-07-16 12:00:00" }
        ]];
      }

      if (sql.includes("UPDATE event_registrations")) {
        return [];
      }

      if (sql.includes("SELECT notification_id")) {
        return [[]];
      }

      if (sql.includes("INSERT INTO notifications")) {
        return [];
      }

      return [[]];
    }
  };

  const promoted = await promoteNextMatchingWaitlistedRegistration(connection, 71, "Participant", "Community Garden Planting");
  assert.ok(promoted, "Expected a participant waitlist registration to be promoted");
  assert.strictEqual(promoted.registration_id, 88, "Expected the earliest participant waitlisted registration to be promoted");
}

async function main() {
  await runParticipantPromotionTest();
  console.log("waitlist promotion FIFO check passed");
  console.log("participant waitlist promotion check passed");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
