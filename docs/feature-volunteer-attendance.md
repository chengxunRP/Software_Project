# Volunteer Assignment & Attendance Management

**Feature area:** Feature 5 — Volunteer Assignment and Attendance Management
**Scope covered in this document:** the attendance-recording slice of Feature 5 (role creation and volunteer-assignment are documented separately)

---

## Overview

This feature lets an **organiser** record attendance for confirmed **Participants** and **Volunteers** at one of their events. It was built incrementally in three stages: wiring the attendance page to real data, building the backend route that records a check-in decision, and hardening that route against duplicate submissions while cleaning up the UI.

The end-to-end flow: organiser opens `/organiser/events/:id/attendance` → sees every eligible registration with its live status → clicks **Mark Attended** or **Mark Absent** → the server verifies ownership, checks for an existing record, inserts into `attendance`, and redirects back with the updated state.

---

## Created / Implemented

- **`POST /organiser/events/:id/attendance`** — new route that records an attendance decision.
  - Secured with `isOrganiser` middleware, plus an explicit ownership check (`event.organiser_id === req.session.user.user_id`) so an organiser can only record attendance for their own events.
  - Runs a `SELECT` against `attendance` for the submitted `registration_id` **before** inserting, to detect a record that already exists.
  - On a fresh submission, runs:
    ```sql
    INSERT INTO attendance (registration_id, attendance_status, check_in_time, recorded_by, recorded_at)
    VALUES (?, ?, NOW(), ?, NOW())
    ```
    with `recorded_by` taken from `req.session.user.user_id` — never from the form.
  - On a duplicate, skips the insert entirely and redirects back gracefully instead of erroring.

- **Duplicate-submission handling via session flash** — reused the existing `req.session.flash` / `takeFlash()` pattern already established elsewhere in the app (`controllers/registrationController.js`) so the "Attendance has already been recorded for this volunteer" message survives the redirect and renders through the same `messages` partial every other page already uses.

---

## Changed / Updated

- **`GET /organiser/events/:id/attendance`** — upgraded from fully hardcoded preview data to a real query:
  ```sql
  SELECT er.registration_id, u.name, er.participation_type, vr.role_name, a.attendance_status
  FROM event_registrations er
  JOIN users u ON u.user_id = er.user_id
  LEFT JOIN volunteer_assignments va ON va.registration_id = er.registration_id
  LEFT JOIN volunteer_roles vr ON vr.role_id = va.role_id
  LEFT JOIN attendance a ON a.registration_id = er.registration_id
  WHERE er.event_id = ? AND er.status IN ('Confirmed', 'Attended', 'Absent')
  ```
  The `LEFT JOIN` on `attendance` is what makes a registration with no attendance row yet correctly show as **Pending** instead of being silently excluded. Also now passes `messages: takeFlash(req)` so duplicate-submission errors actually surface.

- **`views/organiser/attendance.ejs`**:
  - Replaced the old client-side-only JS toggle (`data-attendance-toggle`, pure visual preview, submitted nowhere) with two real `<form method="POST">` elements per row, posting `registration_id` and `attendance_status` to the new backend route — styled with the existing design system (`btn-cc-primary` for Attended, `btn-cc-danger` for Absent).
  - Added conditional rendering: the two action buttons now only appear when a row's status is `Pending`. Once a registration has been checked in, the buttons disappear entirely and the existing status badge is left as the single source of truth for that row.

- **`database/local_user_setup.sql`** — resolved a merge conflict between two branches that had each set a different `DB_PASSWORD` value for the local `communityconnect_user` account. The resolution kept the `caching_sha2_password` authentication plugin (already present on both sides) and replaced a hardcoded real-looking password with the safe `CHANGE_TO_YOUR_OWN_PASSWORD` placeholder, so no real credential is committed to the repository.

---

## Fixed

- **Merge conflict in `database/local_user_setup.sql`** — see above; resolved so the committed script never contains a real password.
- **Dead/non-functional attendance buttons** — the previous "Mark Attended"/"Mark Absent" controls were pure client-side JS toggles with `preventDefault()` and no server round-trip at all. They now genuinely persist to the database.
- **Unhandled duplicate-attendance crash** — submitting attendance twice for the same registration previously hit the database's `UNIQUE` constraint on `attendance.registration_id` and produced a raw `500` error page. The new `SELECT`-before-`INSERT` check catches this case and redirects with a friendly message instead.
- **Redundant double-badge UI** — an earlier iteration of the conditional rendering replaced the buttons with a *second* status badge when already checked in, duplicating the badge already shown elsewhere in the row. Simplified so the button area renders nothing once a status is set, leaving exactly one badge per row.
