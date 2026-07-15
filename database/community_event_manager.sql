-- =============================================================================
-- CommunityConnect — Main database schema
-- Database: community_event_manager
--
-- This script is safe to re-run during initial development:
--   1. Creates the database if missing
--   2. Drops child tables first (foreign-key safe order)
--   3. Recreates all tables with InnoDB + utf8mb4
--   4. Inserts sample development records
--
-- Run this script FIRST (MySQL Workbench root/admin connection), then run
-- database/local_user_setup.sql to create the local application user.
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
DROP TABLE IF EXISTS event_registrations;
DROP TABLE IF EXISTS volunteer_roles;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS event_categories;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- Table: users
-- Stores account credentials and roles (volunteer / organiser / admin).
-- password stores bcrypt hashes only — never plain text.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('volunteer', 'organiser', 'admin') NOT NULL DEFAULT 'volunteer',
  account_status ENUM('Active', 'Suspended') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
-- Organiser-owned community events with capacity and status control.
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
  capacity INT NOT NULL,
  registration_deadline DATETIME NOT NULL,
  status ENUM('Draft', 'Open', 'Full', 'Closed', 'Cancelled', 'Completed') NOT NULL DEFAULT 'Draft',
  image VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_events_organiser
    FOREIGN KEY (organiser_id) REFERENCES users(user_id),
  CONSTRAINT fk_events_category
    FOREIGN KEY (category_id) REFERENCES event_categories(category_id),
  INDEX idx_events_organiser_id (organiser_id),
  INDEX idx_events_category_id (category_id),
  INDEX idx_events_status (status),
  INDEX idx_events_start_datetime (start_datetime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: volunteer_roles
-- Roles defined for a specific event (e.g. Beach Sweeper, Team Lead).
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
-- Volunteer sign-ups, waiting list and cancellation tracking.
-- Unique (event_id, user_id) prevents duplicate registration records.
-- waiting_position is NULL for Confirmed / Cancelled / Attended / Absent rows.
-- -----------------------------------------------------------------------------
CREATE TABLE event_registrations (
  registration_id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  user_id INT NOT NULL,
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
  INDEX idx_registrations_waiting_position (waiting_position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: volunteer_assignments
-- Links a confirmed registration to a volunteer role for an event.
-- One assignment per registration (registration_id UNIQUE).
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
-- Check-in / check-out and volunteer hours for a registration.
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
-- Replace production passwords before any public deployment.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Test accounts
-- Plain-text test password for ALL sample accounts below: Password123!
-- Stored values are bcrypt hashes only (cost factor 10).
-- PRODUCTION: change every account password — do not reuse these hashes.
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
    'volunteer',
    'Active'
  ),
  (
    'Nurul Aisyah',
    'nurul.a@example.sg',
    '$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG',
    'volunteer',
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
-- Community events (5) — Singapore locations, future dates, organiser_id = 2
-- -----------------------------------------------------------------------------
INSERT INTO events (
  organiser_id,
  category_id,
  event_name,
  description,
  start_datetime,
  end_datetime,
  location,
  capacity,
  registration_deadline,
  status,
  image
) VALUES
  (
    2,
    1,
    'East Coast Park Clean-Up',
    'Join a Saturday morning shoreline clean-up along East Coast Park. Volunteers collect and sort litter and help with a simple marine waste audit. Gloves, tongs and bags are provided.',
    '2026-08-15 08:00:00',
    '2026-08-15 11:00:00',
    'East Coast Park, Area C',
    40,
    '2026-08-13 23:59:00',
    'Open',
    NULL
  ),
  (
    2,
    3,
    'Elderly Befriending Visit',
    'Spend an afternoon visiting seniors in Tampines. Volunteers pair up for home visits that include conversation and light check-ins. Suitable for ages 16 and above.',
    '2026-08-22 14:00:00',
    '2026-08-22 17:00:00',
    'Tampines Community Club',
    18,
    '2026-08-20 23:59:00',
    'Open',
    NULL
  ),
  (
    2,
    2,
    'Community Food Distribution',
    'Help pack and distribute food parcels to households registered with our partner organisations at Bedok Community Centre.',
    '2026-09-05 09:00:00',
    '2026-09-05 13:00:00',
    'Bedok Community Centre',
    25,
    '2026-09-03 23:59:00',
    'Open',
    NULL
  ),
  (
    2,
    4,
    'Youth Tutoring Programme',
    'Support Primary 4–6 students with maths revision in small groups at Tampines. Lesson materials are provided by partner tutors.',
    '2026-09-13 10:00:00',
    '2026-09-13 12:00:00',
    'Tampines Community Club',
    20,
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
    30,
    '2026-09-17 23:59:00',
    'Draft',
    NULL
  );

-- -----------------------------------------------------------------------------
-- Volunteer roles (several roles across the sample events)
-- No sample event_registrations / assignments / attendance yet — those are
-- created during Feature 4–5 development.
-- -----------------------------------------------------------------------------
INSERT INTO volunteer_roles (event_id, role_name, description, required_volunteers) VALUES
  (1, 'Beach Sweeper', 'Collect litter along the assigned shoreline zone', 28),
  (1, 'Data Recorder', 'Log litter types for the marine waste audit', 8),
  (1, 'Team Lead', 'Guide a team of 8–10 volunteers (prior experience preferred)', 4),
  (2, 'Befriender', 'Visit seniors in pairs and provide companionship', 14),
  (2, 'Coordinator', 'Help with briefing, route assignment and debrief', 4),
  (3, 'Packing Helper', 'Pack and label food parcels for distribution', 15),
  (3, 'Handover Helper', 'Assist families during parcel collection', 10),
  (4, 'Tutor — Group A', 'Support Primary 4–5 maths revision', 10),
  (4, 'Tutor — Group B', 'Support Primary 6 maths revision', 10),
  (5, 'Garden Planter', 'Plant and water community garden plots', 20),
  (5, 'Conservation Helper', 'Assist with light park conservation tasks', 10);
