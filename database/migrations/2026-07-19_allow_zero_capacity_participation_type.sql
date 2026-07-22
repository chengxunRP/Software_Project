-- =============================================================================
-- Migration: allow a participation type to be disabled on an event
-- =============================================================================
--
-- Context
-- -------
-- Each event needs to support Participants only, Volunteers only, or both.
-- A capacity of 0 on either column now means "this participation type is
-- disabled for this event." Every event must still accept at least one type,
-- so both capacities being 0 at the same time must remain rejected.
--
-- Existing constraints being replaced (confirmed against the live database
-- via information_schema.CHECK_CONSTRAINTS before writing this migration —
-- names were not guessed):
--   chk_events_participant_capacity  CHECK ((`participant_capacity` > 0))
--   chk_events_volunteer_capacity    CHECK ((`volunteer_capacity` > 0))
--
-- This migration does not touch the events table's columns, indexes,
-- foreign keys, or any other table. It only replaces the two CHECK
-- constraints above with a set that allows 0 on either column while still
-- rejecting negative values and rejecting both-zero. Safe for Azure MySQL
-- 8.0.44 (ALTER TABLE ... DROP CHECK / ADD CONSTRAINT ... CHECK requires
-- MySQL 8.0.16+, confirmed via SELECT VERSION() before running this).
--
-- Run order: pre-flight check -> drop old constraints -> add new
-- constraints -> verification queries.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Pre-flight check — must return 0 rows before continuing.
--    Confirms no existing event would violate the new rule (negative value,
--    or both capacities already 0).
-- -----------------------------------------------------------------------------
SELECT event_id, event_name, participant_capacity, volunteer_capacity
FROM events
WHERE participant_capacity < 0
   OR volunteer_capacity < 0
   OR (participant_capacity = 0 AND volunteer_capacity = 0);

-- -----------------------------------------------------------------------------
-- 2. Drop the old strictly-positive constraints (exact names from the live DB).
-- -----------------------------------------------------------------------------
ALTER TABLE events DROP CHECK chk_events_participant_capacity;
ALTER TABLE events DROP CHECK chk_events_volunteer_capacity;

-- -----------------------------------------------------------------------------
-- 3. Add the new rule:
--      participant_capacity >= 0
--      volunteer_capacity   >= 0
--      participant_capacity > 0 OR volunteer_capacity > 0
-- -----------------------------------------------------------------------------
ALTER TABLE events
  ADD CONSTRAINT chk_events_participant_capacity_nonneg CHECK (participant_capacity >= 0);

ALTER TABLE events
  ADD CONSTRAINT chk_events_volunteer_capacity_nonneg CHECK (volunteer_capacity >= 0);

ALTER TABLE events
  ADD CONSTRAINT chk_events_capacity_not_both_zero
    CHECK (participant_capacity > 0 OR volunteer_capacity > 0);

-- -----------------------------------------------------------------------------
-- 4. Verification queries — run after migrating.
-- -----------------------------------------------------------------------------

-- 4a. Confirm the new constraints exist with the expected clauses.
SELECT tc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
FROM information_schema.TABLE_CONSTRAINTS tc
JOIN information_schema.CHECK_CONSTRAINTS cc
  ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
WHERE tc.TABLE_SCHEMA = DATABASE() AND tc.TABLE_NAME = 'events' AND tc.CONSTRAINT_TYPE = 'CHECK';

-- 4b. Confirm all existing event data is intact (row count unchanged from
--     before the migration; compare manually against the pre-flight count).
SELECT COUNT(*) AS total_events FROM events;

-- 4c. Confirm a 0/positive combination is now accepted (uncomment to test
--     manually; wrapped in a transaction so it never leaves test data behind).
-- START TRANSACTION;
-- INSERT INTO events (
--   organiser_id, category_id, event_name, description,
--   start_datetime, end_datetime, location,
--   participant_capacity, volunteer_capacity, registration_deadline, status
-- ) VALUES (
--   (SELECT user_id FROM users WHERE role = 'organiser' LIMIT 1),
--   (SELECT category_id FROM event_categories LIMIT 1),
--   'Migration verification (rollback)', 'test',
--   NOW() + INTERVAL 1 DAY, NOW() + INTERVAL 1 DAY + INTERVAL 1 HOUR,
--   'test', 0, 5, NOW(), 'Draft'
-- );
-- ROLLBACK;

-- 4d. Confirm both-zero is now rejected (expected to raise
--     ER_CHECK_CONSTRAINT_VIOLATED — uncomment to test manually).
-- START TRANSACTION;
-- INSERT INTO events (
--   organiser_id, category_id, event_name, description,
--   start_datetime, end_datetime, location,
--   participant_capacity, volunteer_capacity, registration_deadline, status
-- ) VALUES (
--   (SELECT user_id FROM users WHERE role = 'organiser' LIMIT 1),
--   (SELECT category_id FROM event_categories LIMIT 1),
--   'Migration verification (should fail)', 'test',
--   NOW() + INTERVAL 1 DAY, NOW() + INTERVAL 1 DAY + INTERVAL 1 HOUR,
--   'test', 0, 0, NOW(), 'Draft'
-- );
-- ROLLBACK;
