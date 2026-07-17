-- =============================================================================
-- CommunityConnect — Main database schema
-- Database: community_event_manager
--
-- Application type: Community Event Participation and Volunteer Manager
--
-- Account roles (permanent): community_member | organiser | admin
-- Participation types (per registration): Participant | Volunteer
--
-- This script is safe to re-run during initial development:
--   1. Creates the database if missing (utf8mb4)
--   2. Disables foreign-key checks, drops tables in reverse dependency order
--   3. Re-enables foreign-key checks
--   4. Creates tables with InnoDB + utf8mb4 in valid dependency order
--   5. Inserts sample development records in valid dependency order
--
-- Run this script FIRST (MySQL Workbench root/admin connection), then run
-- database/local_user_setup.sql to create the local application user.
--
-- Contains no real production secrets. Sample passwords are bcrypt hashes of
-- a documented test password only — change before any public deployment.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS community_event_manager
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE community_event_manager;

-- -----------------------------------------------------------------------------
-- Drop tables in reverse foreign-key dependency order
-- -----------------------------------------------------------------------------
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS volunteer_assignments;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS event_registrations;
DROP TABLE IF EXISTS volunteer_roles;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS event_categories;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- Table: users
-- Stores account credentials and permanent account roles.
-- Permanent roles: community_member | organiser | admin
-- Do NOT use Participant or Volunteer as permanent account roles.
-- Participation type is stored per event registration (see event_registrations).
-- password stores bcrypt hashes only — never plain text.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM(
    'community_member',
    'organiser',
    'admin'
  ) NOT NULL DEFAULT 'community_member',
  account_status ENUM('Active', 'Suspended') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: password_reset_tokens (Feature 1 — authentication)
-- One-time, time-limited password reset tokens.
-- Stores SHA-256 hashes of raw tokens only — never the raw token itself.
-- -----------------------------------------------------------------------------
CREATE TABLE password_reset_tokens (
  token_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_password_reset_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_password_reset_user_id (user_id),
  INDEX idx_password_reset_token_hash (token_hash),
  INDEX idx_password_reset_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: event_categories
-- Admin-managed categories used to classify community events.
-- -----------------------------------------------------------------------------
CREATE TABLE event_categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: events
-- Organiser-owned community events with SEPARATE participant and volunteer
-- capacities. Do not use a single general "capacity" column.
-- Participant confirmed places are counted against participant_capacity.
-- Volunteer confirmed places are counted against volunteer_capacity.
-- Status values match CLAUDE.md / project standards exactly.
-- -----------------------------------------------------------------------------
CREATE TABLE events (
  event_id INT AUTO_INCREMENT PRIMARY KEY,
  organiser_id INT NOT NULL,
  category_id INT NOT NULL,
  event_name VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  location VARCHAR(255) NOT NULL,
  participant_capacity INT NOT NULL,
  volunteer_capacity INT NOT NULL,
  registration_deadline DATETIME NOT NULL,
  status ENUM('Draft', 'Open', 'Full', 'Closed', 'Cancelled', 'Completed') NOT NULL DEFAULT 'Draft',
  image VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_events_organiser
    FOREIGN KEY (organiser_id) REFERENCES users(user_id),
  CONSTRAINT fk_events_category
    FOREIGN KEY (category_id) REFERENCES event_categories(category_id),
  CONSTRAINT chk_events_participant_capacity
    CHECK (participant_capacity > 0),
  CONSTRAINT chk_events_volunteer_capacity
    CHECK (volunteer_capacity > 0),
  INDEX idx_events_organiser_id (organiser_id),
  INDEX idx_events_category_id (category_id),
  INDEX idx_events_status (status),
  INDEX idx_events_start_datetime (start_datetime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: volunteer_roles
-- Roles defined for a specific event (e.g. Beach Sweeper, Team Lead).
-- Applies ONLY to registrations where participation_type = 'Volunteer'.
-- Participant registrations must not be assigned volunteer roles.
-- Unique (event_id, role_name) prevents duplicate role names per event.
-- -----------------------------------------------------------------------------
CREATE TABLE volunteer_roles (
  role_id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  role_name VARCHAR(100) NOT NULL,
  description TEXT,
  required_volunteers INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_volunteer_roles_event
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
  CONSTRAINT uq_volunteer_roles_event_name UNIQUE (event_id, role_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: event_registrations
-- Community members join an event as Participant OR Volunteer (per registration).
--
-- participation_type:
--   'Participant' — ordinary community participant
--   'Volunteer'   — assisting at the event
--
-- preferred_role_id:
--   - NULL for Participant registrations (normally required by app rules)
--   - May reference volunteer_roles for Volunteer registrations
--   - Backend enforces these rules; column stays nullable at schema level
--
-- waiting_position:
--   - Belongs to the waiting list matching participation_type
--   - Participant waitlist and Volunteer waitlist are counted separately
--   - NULL for Confirmed / Cancelled / Attended / Absent rows
--
-- Capacity counting (application logic):
--   - Confirmed Participants count against events.participant_capacity
--   - Confirmed Volunteers count against events.volunteer_capacity
--
-- Unique (event_id, user_id): one registration per community member per event
-- (they choose either Participant or Volunteer for that event — not both).
-- -----------------------------------------------------------------------------
CREATE TABLE event_registrations (
  registration_id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  participation_type ENUM(
    'Participant',
    'Volunteer'
  ) NOT NULL,
  preferred_role_id INT NULL,
  notes VARCHAR(500),
  status ENUM('Confirmed', 'Waitlisted', 'Cancelled', 'Attended', 'Absent') NOT NULL DEFAULT 'Confirmed',
  waiting_position INT NULL,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_registrations_event
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
  CONSTRAINT fk_registrations_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_registrations_preferred_role
    FOREIGN KEY (preferred_role_id) REFERENCES volunteer_roles(role_id) ON DELETE SET NULL,
  CONSTRAINT uq_registrations_event_user UNIQUE (event_id, user_id),
  INDEX idx_registrations_event_id (event_id),
  INDEX idx_registrations_user_id (user_id),
  INDEX idx_registrations_status (status),
  INDEX idx_registrations_participation_type (participation_type),
  INDEX idx_registrations_waiting_position (waiting_position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: volunteer_assignments
-- Links a registration to a volunteer role for an event.
-- Applies ONLY to registrations where participation_type = 'Volunteer'.
-- Do not create assignments for Participant registrations.
-- One assignment per registration (registration_id UNIQUE).
-- Backend validation will enforce Volunteer-only assignment later.
-- -----------------------------------------------------------------------------
CREATE TABLE volunteer_assignments (
  assignment_id INT AUTO_INCREMENT PRIMARY KEY,
  registration_id INT NOT NULL UNIQUE,
  role_id INT NOT NULL,
  assigned_by INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assignments_registration
    FOREIGN KEY (registration_id) REFERENCES event_registrations(registration_id) ON DELETE CASCADE,
  CONSTRAINT fk_assignments_role
    FOREIGN KEY (role_id) REFERENCES volunteer_roles(role_id) ON DELETE CASCADE,
  CONSTRAINT fk_assignments_assigned_by
    FOREIGN KEY (assigned_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: attendance
-- Check-in / check-out for a registration.
-- Attendance may be recorded for BOTH Participants and Volunteers.
--
-- volunteer_hours:
--   - Earned only when participation_type = 'Volunteer'
--   - Must normally remain 0 for Participant registrations
--   - Backend validation will enforce this later
--
-- One attendance record per registration (registration_id UNIQUE).
-- -----------------------------------------------------------------------------
CREATE TABLE attendance (
  attendance_id INT AUTO_INCREMENT PRIMARY KEY,
  registration_id INT NOT NULL UNIQUE,
  attendance_status ENUM('Attended', 'Absent') NOT NULL,
  check_in_time DATETIME NULL,
  check_out_time DATETIME NULL,
  volunteer_hours DECIMAL(5,2) NOT NULL DEFAULT 0,
  recorded_by INT NOT NULL,
  notes TEXT,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attendance_registration
    FOREIGN KEY (registration_id) REFERENCES event_registrations(registration_id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_recorded_by
    FOREIGN KEY (recorded_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: notifications
-- In-app notifications for users (registration, waitlist, event updates, etc.).
-- -----------------------------------------------------------------------------
CREATE TABLE notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  event_id INT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  notification_type ENUM(
    'Registration',
    'WaitingList',
    'Promotion',
    'EventUpdate',
    'EventCancellation',
    'Attendance',
    'General'
  ) NOT NULL DEFAULT 'General',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_event
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE SET NULL,
  INDEX idx_notifications_user_id (user_id),
  INDEX idx_notifications_event_id (event_id),
  INDEX idx_notifications_is_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Sample development records
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Test accounts
-- Plain-text test password for ALL sample accounts below: Password123!
-- Stored values are bcrypt hashes only (cost factor 10).
-- PRODUCTION: change every account password — do not reuse these hashes.
-- Roles: admin, organiser, community_member (not Participant/Volunteer).
-- -----------------------------------------------------------------------------

INSERT INTO users (name, email, password, role, account_status) VALUES
  (
    'Siti Rahman',
    'siti.r@communityconnect.sg',
    '$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG',
    'admin',
    'Active'
  ),
  (
    'Marcus Lim',
    'marcus.lim@example.sg',
    '$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG',
    'organiser',
    'Active'
  ),
  (
    'Tan Wei Ling',
    'weiling.tan@example.sg',
    '$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG',
    'community_member',
    'Active'
  ),
  (
    'Nurul Aisyah',
    'nurul.a@example.sg',
    '$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG',
    'community_member',
    'Active'
  ),
  (
    'David Ong',
    'david.ong@example.sg',
    '$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG',
    'community_member',
    'Active'
  ),
  (
    'Priya Nair',
    'priya.n@example.sg',
    '$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG',
    'community_member',
    'Active'
  ),
  (
    'Rajesh Kumar',
    'rajesh.k@example.sg',
    '$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG',
    'community_member',
    'Active'
  ),
  (
    'Mei Ling Ho',
    'meiling.ho@example.sg',
    '$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG',
    'community_member',
    'Active'
  );

-- -----------------------------------------------------------------------------
-- Event categories (4)
-- -----------------------------------------------------------------------------
INSERT INTO event_categories (category_name, description) VALUES
  ('Environment', 'Clean-ups, recycling drives and greening projects across Singapore'),
  ('Food Support', 'Food packing, distribution and grocery delivery for families in need'),
  ('Elderly Support', 'Befriending visits, home check-ins and digital literacy help for seniors'),
  ('Education', 'Tutoring, reading programmes and enrichment support for students');

-- -----------------------------------------------------------------------------
-- Community events — separate participant_capacity and volunteer_capacity
-- organiser_id = 2 (Marcus Lim)
-- -----------------------------------------------------------------------------
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
  status,
  image
) VALUES
  (
    2,
    1,
    'East Coast Park Clean-Up',
    'Join a Saturday morning shoreline clean-up along East Coast Park. Community members may attend as participants or assist as volunteers with litter collection and a simple marine waste audit. Gloves, tongs and bags are provided.',
    '2026-08-15 08:00:00',
    '2026-08-15 11:00:00',
    'East Coast Park, Area C',
    30,
    12,
    '2026-08-13 23:59:00',
    'Open',
    NULL
  ),
  (
    2,
    3,
    'Elderly Wellness and Social Day',
    'An afternoon of conversation, light activities and companionship for seniors in Tampines. Participants join the social programme; volunteers assist with facilitation and check-ins.',
    '2026-08-22 14:00:00',
    '2026-08-22 17:00:00',
    'Tampines Community Club',
    50,
    10,
    '2026-08-20 23:59:00',
    'Open',
    NULL
  ),
  (
    2,
    2,
    'Community Food Distribution',
    'Pack and distribute food parcels to households registered with our partner organisations at Bedok Community Centre. Participants collect support; volunteers help with packing and handover.',
    '2026-09-05 09:00:00',
    '2026-09-05 13:00:00',
    'Bedok Community Centre',
    80,
    20,
    '2026-09-03 23:59:00',
    'Open',
    NULL
  ),
  (
    2,
    4,
    'Youth Tutoring Programme',
    'Support Primary 4–6 students with maths revision in small groups at Tampines. Participants are students and caregivers; volunteers tutor and assist in rooms.',
    '2026-09-13 10:00:00',
    '2026-09-13 12:00:00',
    'Tampines Community Club',
    25,
    15,
    '2026-09-11 23:59:00',
    'Open',
    NULL
  ),
  (
    2,
    1,
    'Jurong Lake Gardens Conservation Day',
    'Plant herbs and greens with residents at the Jurong Lake Gardens community plot and help with light park conservation tasks.',
    '2026-09-19 08:00:00',
    '2026-09-19 11:00:00',
    'Jurong Lake Gardens',
    40,
    20,
    '2026-09-17 23:59:00',
    'Draft',
    NULL
  );

-- -----------------------------------------------------------------------------
-- Volunteer roles (apply only to Volunteer participation_type registrations)
-- role_id values after insert: 1–11 in insertion order
-- -----------------------------------------------------------------------------
INSERT INTO volunteer_roles (event_id, role_name, description, required_volunteers) VALUES
  (1, 'Beach Sweeper', 'Collect litter along the assigned shoreline zone', 6),
  (1, 'Data Recorder', 'Log litter types for the marine waste audit', 4),
  (1, 'Team Lead', 'Guide a team of volunteers (prior experience preferred)', 2),
  (2, 'Befriender', 'Support seniors during activities and conversation', 7),
  (2, 'Coordinator', 'Help with briefing, seating and debrief', 3),
  (3, 'Packing Helper', 'Pack and label food parcels for distribution', 12),
  (3, 'Handover Helper', 'Assist families during parcel collection', 8),
  (4, 'Tutor — Group A', 'Support Primary 4–5 maths revision', 8),
  (4, 'Tutor — Group B', 'Support Primary 6 maths revision', 7),
  (5, 'Garden Planter', 'Plant and water community garden plots', 12),
  (5, 'Conservation Helper', 'Assist with light park conservation tasks', 8);

-- -----------------------------------------------------------------------------
-- Sample event registrations (Feature 4 preview data)
-- Includes Confirmed / Waitlisted × Participant / Volunteer examples.
-- Participant preferred_role_id = NULL
-- Volunteer preferred_role_id references a valid volunteer_roles.role_id
-- waiting_position is scoped to the matching participation_type waitlist
-- Unique (event_id, user_id) — one place per member per event
-- -----------------------------------------------------------------------------
INSERT INTO event_registrations (
  event_id,
  user_id,
  participation_type,
  preferred_role_id,
  notes,
  status,
  waiting_position,
  cancelled_at
) VALUES
  -- Confirmed Participant (East Coast Park Clean-Up) — user_id 3 Tan Wei Ling
  (
    1,
    3,
    'Participant',
    NULL,
    'Attending with family members',
    'Confirmed',
    NULL,
    NULL
  ),
  -- Confirmed Volunteer (East Coast Park Clean-Up) — user_id 4 Nurul Aisyah
  -- preferred_role_id 1 = Beach Sweeper on event 1
  (
    1,
    4,
    'Volunteer',
    1,
    'Happy to bring sunscreen for the team',
    'Confirmed',
    NULL,
    NULL
  ),
  -- Confirmed Volunteer (Elderly Wellness) — user_id 5 David Ong
  -- preferred_role_id 4 = Befriender on event 2
  (
    2,
    5,
    'Volunteer',
    4,
    NULL,
    'Confirmed',
    NULL,
    NULL
  ),
  -- Confirmed Participant (Elderly Wellness) — user_id 8 Mei Ling Ho
  (
    2,
    8,
    'Participant',
    NULL,
    'Prefers morning check-in help if available',
    'Confirmed',
    NULL,
    NULL
  ),
  -- Waitlisted Participant (Community Food Distribution) — user_id 6 Priya Nair
  -- Participant waiting list position 1 for event 3
  (
    3,
    6,
    'Participant',
    NULL,
    'Can collect for two households if places open',
    'Waitlisted',
    1,
    NULL
  ),
  -- Waitlisted Volunteer (Community Food Distribution) — user_id 7 Rajesh Kumar
  -- Volunteer waiting list position 1 for event 3
  -- preferred_role_id 6 = Packing Helper on event 3
  (
    3,
    7,
    'Volunteer',
    6,
    'Available for the full morning shift',
    'Waitlisted',
    1,
    NULL
  ),
  -- Confirmed Participant (Community Food Distribution) — user_id 3 Wei Ling
  -- same member may join another event; type can differ per event
  (
    3,
    3,
    'Participant',
    NULL,
    NULL,
    'Confirmed',
    NULL,
    NULL
  ),
  -- Confirmed Volunteer (Youth Tutoring) — user_id 4 Nurul
  -- preferred_role_id 8 = Tutor — Group A on event 4
  (
    4,
    4,
    'Volunteer',
    8,
    NULL,
    'Confirmed',
    NULL,
    NULL
  );

-- -----------------------------------------------------------------------------
-- Sample volunteer assignments (Volunteer participation_type only)
-- registration_id 2 = Nurul Confirmed Volunteer on East Coast (role Beach Sweeper)
-- registration_id 3 = David Confirmed Volunteer on Elderly Wellness (role Befriender)
-- registration_id 8 = Nurul Confirmed Volunteer on Youth Tutoring (role Tutor Group A)
-- assigned_by = 2 (organiser Marcus Lim)
-- -----------------------------------------------------------------------------
INSERT INTO volunteer_assignments (registration_id, role_id, assigned_by) VALUES
  (2, 1, 2),
  (3, 4, 2),
  (8, 8, 2);

-- -----------------------------------------------------------------------------
-- Sample attendance notes
-- Participants may have attendance with volunteer_hours = 0
-- Volunteers may earn volunteer_hours when attendance_status = Attended
-- -----------------------------------------------------------------------------
INSERT INTO attendance (
  registration_id,
  attendance_status,
  check_in_time,
  check_out_time,
  volunteer_hours,
  recorded_by,
  notes
) VALUES
  -- Structure demo: Volunteer attendance with hours
  (
    2,
    'Attended',
    '2026-08-15 08:05:00',
    '2026-08-15 11:00:00',
    3.00,
    2,
    'Volunteer hours recorded for Beach Sweeper duty'
  ),
  -- Structure demo: Participant attendance — volunteer_hours remains 0
  (
    1,
    'Attended',
    '2026-08-15 08:10:00',
    '2026-08-15 11:00:00',
    0.00,
    2,
    'Participant attendance — volunteer_hours remains 0'
  );

-- -----------------------------------------------------------------------------
-- Sample notifications
-- -----------------------------------------------------------------------------
INSERT INTO notifications (user_id, event_id, title, message, notification_type, is_read) VALUES
  (
    3,
    1,
    'Participant place confirmed',
    'Your Participant place for East Coast Park Clean-Up is confirmed.',
    'Registration',
    FALSE
  ),
  (
    4,
    1,
    'Volunteer place confirmed',
    'Your Volunteer place for East Coast Park Clean-Up is confirmed (Beach Sweeper).',
    'Registration',
    FALSE
  ),
  (
    6,
    3,
    'Participant waiting list',
    'You are #1 on the Participant waiting list for Community Food Distribution.',
    'WaitingList',
    FALSE
  ),
  (
    7,
    3,
    'Volunteer waiting list',
    'You are #1 on the Volunteer waiting list for Community Food Distribution.',
    'WaitingList',
    FALSE
  );
