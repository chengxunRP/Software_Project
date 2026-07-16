const assert = require("assert");
const { pickNextWaitlistedRegistration } = require("../controllers/registrationController");

const candidates = [
  { registration_id: 10, waiting_position: 2, registered_at: "2026-07-16 10:00:00" },
  { registration_id: 11, waiting_position: 1, registered_at: "2026-07-16 09:00:00" },
  { registration_id: 12, waiting_position: 1, registered_at: "2026-07-16 10:30:00" }
];

const chosen = pickNextWaitlistedRegistration(candidates);
assert.ok(chosen, "Expected a waitlisted registration to be selected");
assert.strictEqual(chosen.registration_id, 11, "Expected FIFO ordering by waiting position first");

console.log("waitlist promotion FIFO check passed");
