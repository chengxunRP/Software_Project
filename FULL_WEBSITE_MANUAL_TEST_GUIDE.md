# CommunityConnect Full Website Manual Test Guide

Beginner-friendly, click-by-click end-to-end manual test for Features 1–6.  
Based on the **current** application code (routes, EJS labels, flash messages, schema) as of this rewrite.  
**Do not treat this file as code to run.** Follow the steps in normal Chrome.

**Do not modify application files, the schema, or `design-reference/` while using this guide.**

---

## Feature readiness (latest)

| Feature | Status | Notes |
|---|---|---|
| 1 — User Account, Role and Admin Management | **READY_FOR_MANUAL_TESTING** | Register, login, logout, role redirects, admin Users, suspend/activate |
| 2 — Event and Category Management | **READY_FOR_MANUAL_TESTING** | Admin Categories; organiser event CRUD; ownership checks |
| 3 — Event Catalogue, Search and Filtering | **READY_FOR_MANUAL_TESTING** | `/events` search, filters, sort, details from MySQL |
| 4 — Participation, Capacity and Waiting List | **READY_FOR_MANUAL_TESTING** | Join, waitlist, cancel, promotion, My Registrations |
| 5 — Volunteer Assignment and Attendance | **READY_FOR_MANUAL_TESTING** | Event pickers + Manage Events **Regs** / **Roles** / **Attend**; roles; assign; attendance + check-out |
| 6 — Notifications, Volunteer Hours and Reporting | **READY_FOR_MANUAL_TESTING** | Application Feature 6 is **COMPLETE_AND_WORKING** (notifications, hours, reports from MySQL; 19/19 automated verification previously passed) |

Removed optional UI stubs (PDF download, Export CSV, admin date-range select, Finalise attendance) are **not** missing requirements. Do not fail a test because those buttons are gone.

### Organiser navigation (current — no hardcoded event IDs)

Global organiser nav no longer points at fixed IDs such as `1`, `2`, or `11`.

| Nav label | Global route (event picker) | After choosing an event |
|---|---|---|
| Registrations | `/organiser/registrations` | `/organiser/events/EVENT_ID/registrations` |
| Volunteer Roles | `/organiser/roles` | `/organiser/events/EVENT_ID/roles` |
| Attendance | `/organiser/attendance` | `/organiser/events/EVENT_ID/attendance` |

While you are already on an event-specific page, those same nav labels use that page’s `event_id` directly.

**Manage Events** (`/organiser/events`) row actions for each event: **View**, **Edit**, **Regs**, **Roles**, **Attend**, and **Cancel** (when allowed). **Regs** / **Roles** / **Attend** always use that row’s real `event_id`.

---

# 1. Before Testing

## Start the project (PowerShell)

```powershell
cd C:\Software_Project
npm start
```

## Expected successful server messages

```text
Connected to CommunityConnect MySQL database
CommunityConnect running at http://localhost:3000
```

Leave that terminal open while testing.

## Website URL

```text
http://localhost:3000
```

Use **normal Chrome**. Incognito is **not** required.

## Database name

```text
community_event_manager
```

## Verify the database connection

In a **second** PowerShell window:

```powershell
cd C:\Software_Project
npm run test-db
```

Expected: `Database connection test succeeded.` and `Connected database: community_event_manager`.

## Required browser setup

- One Chrome window is enough.
- Switch accounts with top-right **Log out**, then **Log in**.
- If a sticky session confuses results: clear cookies for `localhost` only, then reopen `http://localhost:3000`.

## Important existing records — do not modify

| Keep safe | Why |
|---|---|
| Admin `siti.r@communityconnect.sg` | User Management and Categories |
| Seed organiser `marcus.lim@example.sg` | Organiser A for the main test event |
| Non-test seed events | Other demos may rely on them |
| `.env` secrets | Not needed for this guide — do not paste them into notes |

## Manual-test estimated duration

| Mode | Duration |
|---|---|
| Full Features 1–6 guide | **90–120 minutes** |
| Live presentation (Section 10) | **12–18 minutes** |

## Accounts overview

| Account | Role | Purpose | How to Create |
|---|---|---|---|
| Admin (seed) | `admin` | Users, Categories, Reports | Already in DB |
| Organiser A (seed) | `organiser` | Owns the test event | Already in DB |
| Organiser B (temporary) | `organiser` | Ownership denial | Register as community_member, Admin sets role to organiser |
| Member A | `community_member` | Confirmed Participant → cancels | Public **Register** |
| Member B | `community_member` | Waitlisted Participant → promoted | Public **Register** |
| Member C | `community_member` | Confirmed Volunteer → cancels | Public **Register** |
| Member D | `community_member` | Waitlisted Volunteer → promoted → assignment, attendance, hours | Public **Register** |

---

# 2. Test Data Summary

Invent a unique stamp (example: `202607172315`). Replace every `TIMESTAMP` below with that stamp.

## Passwords

| Use | Password |
|---|---|
| All new temporary accounts | `FullWebTest123!` (meets “at least 8 characters”) |
| All seed accounts | `Password123!` |

## Temporary accounts

| Label | Full name | Email | Password |
|---|---|---|---|
| Organiser B source | Full Web Organiser B | `fullweb.orgb.TIMESTAMP@example.sg` | `FullWebTest123!` |
| Member A | Full Web Member A | `fullweb.a.TIMESTAMP@example.sg` | `FullWebTest123!` |
| Member B | Full Web Member B | `fullweb.b.TIMESTAMP@example.sg` | `FullWebTest123!` |
| Member C | Full Web Member C | `fullweb.c.TIMESTAMP@example.sg` | `FullWebTest123!` |
| Member D | Full Web Member D | `fullweb.d.TIMESTAMP@example.sg` | `FullWebTest123!` |

## Seed accounts

| Label | Name | Email | Password |
|---|---|---|---|
| Admin | Siti Rahman | `siti.r@communityconnect.sg` | `Password123!` |
| Organiser A | Marcus Lim | `marcus.lim@example.sg` | `Password123!` |

## Category

| Field | Value |
|---|---|
| Category name | `Full Website Test Category` |
| Description | `Temporary category used for the CommunityConnect full website test.` |

## Event (example future dates — adjust if you test after these dates)

These example values assume testing around **17 July 2026**. If you test later, pick any future set that still satisfies the rules below.

| Field | Example value |
|---|---|
| Event name | `Full Website Community Day` |
| Description | `A temporary community event used to test registration, waiting lists, volunteer assignment, attendance, notifications and reporting.` |
| Location | `Tampines Community Club` |
| Participant capacity | `1` |
| Volunteer capacity | `1` |
| Registration deadline | `2026-08-06T18:00` |
| Start date & time | `2026-08-07T10:00` |
| End date & time | `2026-08-07T13:00` |
| UI Event status | **Published** |
| MySQL `events.status` | **`Open`** |

### Date rules (must always hold)

1. Registration deadline is **in the future** relative to “now”.
2. Registration deadline is **before** event start.
3. Event start is **after** registration deadline.
4. Event end is **after** event start.
5. Catalogue date filter **Next 30 days** should still include the event when you run Feature 3.

### UI status ↔ MySQL status

| Form radio label | Form value | MySQL `events.status` |
|---|---|---|
| Published | `Published` | `Open` (or `Full` if both capacities are already filled) |
| Draft | `Draft` | `Draft` |
| Registration closed | `Registration closed` | `Closed` |

On **Manage Events**, MySQL `Open` displays as badge **Published**.  
Catalogue `/events` lists only MySQL **`Open`** or **`Full`**.

## Volunteer role (Feature 5)

| Field | Value |
|---|---|
| Role name | `Registration Helper` |
| Description | `Help welcome attendees and manage the registration counter.` |
| Volunteers needed | `1` |

## Expected registration statuses after Feature 4 (before cancellations)

| Member | participation_type | status | waiting_position |
|---|---|---|---|
| A | Participant | Confirmed | NULL |
| B | Participant | Waitlisted | 1 |
| C | Volunteer | Confirmed | NULL |
| D | Volunteer | Waitlisted | 1 |

After promotions: **B** Confirmed Participant; **D** Confirmed Volunteer (used for Features 5–6).

Write down during the test:

- `EVENT_ID` = ________
- Member D `registration_id` = ________

---

# 3. Feature 1 — User Account, Role and Admin Management

**Status: READY_FOR_MANUAL_TESTING**

---

## Test 1.1 — Public Registration

### Account Used
New visitor. Create Organiser B source first, then Members A–D the same way.

### Starting URL
`http://localhost:3000/register`

### Exact Steps
1. Open Register.
2. Fill fields in order.
3. Tick the terms checkbox.
4. Click **Create account**.

### Exact Values (Member A example)

| Label | Value |
|---|---|
| Full name | `Full Web Member A` |
| Email address | `fullweb.a.TIMESTAMP@example.sg` |
| Password | `FullWebTest123!` |
| Confirm password | `FullWebTest123!` |

### Expected Website Result
Redirect to `/login` with:  
**Your CommunityConnect account has been created successfully. Please log in.**

### Expected Database Result
`role = 'community_member'`, `account_status = 'Active'`

### Verification Query

```sql
SELECT user_id, name, email, role, account_status
FROM users
WHERE email = 'fullweb.a.TIMESTAMP@example.sg';
```

### Pass Condition
Row exists. Repeat for B, C, D and `fullweb.orgb.TIMESTAMP@example.sg`.

---

## Test 1.2 — Correct and Incorrect Login

### Starting URL
`http://localhost:3000/login`

### Wrong password
1. Email: Member A email  
2. Password: `WrongPass999!`  
3. Click **Log in**  
→ **Unable to sign in with the details provided. Please check your information and try again.**

### Correct password
1. Correct email + `FullWebTest123!`  
2. Click **Log in**  
→ **Welcome back! You have signed in successfully.**  
→ Redirect **`/member/dashboard`**

### Role redirects

| Account | Expected redirect |
|---|---|
| Admin | `/admin/dashboard` |
| Organiser A | `/organiser/dashboard` |
| Member | `/member/dashboard` |

While logged in as a member, open **Browse Events** then **My Registrations** — session must remain active.

---

## Test 1.3 — Logout

1. Click **Log out**.
2. Open `http://localhost:3000/member/dashboard`.

### Expected
Redirect to `/login` with **Please log in to continue.**

---

## Test 1.4 — Admin User Management (promote Organiser B)

### Account Used
Admin `siti.r@communityconnect.sg` / `Password123!`

### Exact Steps
1. Nav **Users** → `/admin/users` (heading **User Management**).
2. Search `fullweb.orgb.TIMESTAMP` → **Filter**.
3. Role dropdown → **organiser** → **Save**.

### Expected
**The account role has been updated.**

```sql
SELECT email, role, account_status
FROM users
WHERE email = 'fullweb.orgb.TIMESTAMP@example.sg';
-- role = 'organiser'
```

Log out → log in as Organiser B → land on `/organiser/dashboard`.

---

## Test 1.5 — Role Protection

| Attempt | Expected (current middleware) |
|---|---|
| Member opens `/organiser/dashboard` | HTTP **403** error page: **You do not have permission to access this page** |
| Member opens `/admin/users` | Same 403 page |
| Organiser A opens `/admin/users` | Same 403 page |
| Admin opens `/admin/users` | User Management loads |

Some organiser attendance/role routes may return plain text: **You do not have permission to view this page.**

---

## Test 1.6 — Suspend and Reactivate

Prefer a spare temporary member, or Member A if you reactivate before Feature 4.

1. Admin → **Users** → **Suspend** → **The account has been suspended.**
2. Login with correct password → **Your account has been suspended. Please contact a CommunityConnect administrator.**
3. Admin → **Activate** → **The account has been activated.**
4. Member can log in again.

```sql
SELECT email, account_status FROM users WHERE email = '…';
```

---

# 4. Feature 2 — Event and Category Management

**Status: READY_FOR_MANUAL_TESTING**

---

## Test 2.1 — Create Category

### Account Used
Admin

1. Nav **Categories** → `/admin/categories` (**Event Category Management**).
2. **Category name \***: `Full Website Test Category`
3. **Description**: temporary description from Section 2.
4. Click **Add category** → **Category created successfully.**

```sql
SELECT category_id, category_name FROM event_categories
WHERE category_name = 'Full Website Test Category';
```

---

## Test 2.2 — Edit Category

1. **Edit** on the test category.
2. Change description (append `(edited)`).
3. **Save changes** → **Category updated successfully.**

---

## Test 2.3 — Create Event

### Account Used
Organiser A `marcus.lim@example.sg`

1. **Manage Events** → `/organiser/events`
2. **+ Add Event** → `/organiser/events/new`
3. Fill fields in **on-screen order**:

| # | Label | Value |
|---|---|---|
| 1 | Event name \* | `Full Website Community Day` |
| 2 | Category \* | `Full Website Test Category` |
| 3 | Location \* | `Tampines Community Club` |
| 4 | Description \* | (Section 2 text) |
| 5 | Start date & time \* | `2026-08-07T10:00` (or your adjusted future start) |
| 6 | End date & time \* | `2026-08-07T13:00` |
| 7 | Participant capacity \* | `1` |
| 8 | Volunteer capacity \* | `1` |
| 9 | Registration deadline \* | `2026-08-06T18:00` |
| 10 | Event status | **Published** |

No image upload field exists on the current form.

4. Click **Save event** → **Event created successfully.**  
5. Event appears on Manage Events with badge **Published**.

```sql
SELECT event_id, event_name, status, participant_capacity, volunteer_capacity, organiser_id
FROM events
WHERE event_name = 'Full Website Community Day';
-- status = 'Open'
```

Record **EVENT_ID**.

### Confirm Manage Events actions for this row

You should see: **View** · **Edit** · **Regs** · **Roles** · **Attend** · **Cancel** (if cancellable).

---

## Test 2.4 — Edit Event

1. **Edit** → `/organiser/events/EVENT_ID/edit`
2. Change Location briefly, save → **Event updated successfully.**
3. Restore Location to `Tampines Community Club`, capacities `1`/`1`, status **Published**, save again.

---

## Test 2.5 — Organiser Ownership

1. Note **EVENT_ID**.
2. Log out Organiser A.
3. Log in Organiser B.
4. Open: `http://localhost:3000/organiser/events/EVENT_ID/edit`

### Expected
**You do not have permission to edit this event.**

Event `organiser_id` remains Organiser A.

---

## Test 2.6 — Used Category Deletion Protection

Admin → **Categories** → test category **Delete** is blocked while the event exists.  
If delete is attempted: **This category is used by existing events and cannot be deleted.**

**Do not delete the test event yet.**

---

# 5. Feature 3 — Event Catalogue, Search and Filtering

**Status: READY_FOR_MANUAL_TESTING**

---

## Test 3.1 — Display Event Catalogue

Member A → **Browse Events** → `/events`  
Confirm **Full Website Community Day** appears.

```sql
SELECT event_id, event_name, status FROM events
WHERE event_name = 'Full Website Community Day' AND status IN ('Open', 'Full');
```

---

## Test 3.2 — Event Details

Click **View Details** → `/events/EVENT_ID`  
Compare name, category, date/time, location, capacities, and About text with MySQL.

---

## Test 3.3 — Search

1. **Search** field: `Full Website Community Day`
2. **Apply** → event listed
3. Search `ZZZNoSuchEvent999` → **Apply** → no match
4. **Clear filters**

---

## Test 3.4 — Filters (controls that exist)

| Label | Option example | Then |
|---|---|---|
| Category | `Full Website Test Category` | **Apply** |
| Date | `Next 30 days` | **Apply** (event must fall inside this window) |
| Location | `East` | **Apply** |
| Availability | `Participant spaces available` | **Apply** |

Also try Volunteer / Waiting list availability after Feature 4 fills places.

---

## Test 3.5 — Sorting

| Sort by | Confirm |
|---|---|
| Date (soonest) | Soonest `start_datetime` first |
| Popularity | Higher interest earlier |

Select → **Apply**.

---

# 6. Feature 4 — Event Participation, Capacity and Waiting List

**Status: READY_FOR_MANUAL_TESTING**

Capacities remain **1** Participant and **1** Volunteer. Order: A → B → C → D.

---

## Test 4.1 — Confirmed Participant (Member A)

1. Log in Member A → open event details.
2. Leave **🙋 Join as Participant** selected.
3. Click **Join as Participant**.

### Expected
**Registration confirmed.**

```sql
-- Participant / Confirmed / waiting_position NULL
```

---

## Test 4.2 — Waitlisted Participant (Member B)

### Expected
**Participant capacity is full. You are on the participant waiting list at position 1.**

---

## Test 4.3 — Confirmed Volunteer (Member C)

1. Select **🤝 Volunteer for This Event**.
2. **Volunteer role** optional (may be empty before Feature 5).
3. Submit join.

### Expected
**Registration confirmed.**

---

## Test 4.4 — Waitlisted Volunteer (Member D)

### Expected
**Volunteer capacity is full. You are on the volunteer waiting list at position 1.**

---

## Test 4.5 — Separate lists proof

```sql
SELECT u.name, er.participation_type, er.status, er.waiting_position
FROM event_registrations er
JOIN users u ON u.user_id = er.user_id
WHERE er.event_id = EVENT_ID
  AND er.status IN ('Confirmed', 'Waitlisted')
ORDER BY er.participation_type, er.status, er.waiting_position;
```

Expect one Confirmed + one Waitlisted for each participation type.

---

## Test 4.6 — Duplicate Registration Prevention

Member A retries join → **You are already confirmed for this event.**

---

## Test 4.7 — My Registrations

Each of A–D → **My Registrations** (`/member/registrations`)  
Tabs: **Confirmed**, **Waitlisted**, **Cancelled**, **Attended**  
Only that member’s rows appear.

---

## Test 4.8 — Participant Cancellation and Promotion

1. Member A → **Cancel** → **Yes, cancel registration**
2. Flash: **Your registration has been cancelled.**
3. Member B becomes **Confirmed**; Volunteer rows unchanged.
4. Member B gets notification title **Promoted from waiting list** (Feature 6).

---

## Test 4.9 — Volunteer Cancellation and Promotion

1. Member C cancels Volunteer place.
2. Member D becomes **Confirmed** Volunteer.
3. Participant rows unchanged (except A already cancelled).

**Member D is the confirmed Volunteer for Features 5 and 6.**

```sql
SELECT er.registration_id, u.email, er.participation_type, er.status
FROM event_registrations er
JOIN users u ON u.user_id = er.user_id
WHERE er.event_id = EVENT_ID
  AND u.email = 'fullweb.d.TIMESTAMP@example.sg';
```

Record Member D’s `registration_id`.

---

# 7. Feature 5 — Volunteer Assignment and Attendance

**Status: READY_FOR_MANUAL_TESTING**

Use Organiser A and Member D.

---

## Organiser navigation to this event (use either path)

### Path A — Manage Events (recommended for this guide)

1. Log in as Organiser A.
2. Nav **Manage Events**.
3. Find **Full Website Community Day**.
4. Click **Regs** → `/organiser/events/EVENT_ID/registrations`
5. Click **Roles** → `/organiser/events/EVENT_ID/roles`
6. Click **Attend** → `/organiser/events/EVENT_ID/attendance`

### Path B — Global nav event pickers

| Step | Action |
|---|---|
| Account | Organiser A |
| Click nav | **Registrations** / **Volunteer Roles** / **Attendance** |
| Route | `/organiser/registrations` or `/organiser/roles` or `/organiser/attendance` |
| Page heading | **Registrations** / **Volunteer Roles** / **Attendance** |
| Panel | **Select an event** |
| Event row | **Full Website Community Day** (name + date · location) |
| Button | **Open registrations** / **Open roles** / **Open attendance** |
| Destination | `/organiser/events/EVENT_ID/registrations` (or `/roles`, `/attendance`) |
| Expected | Event-specific page loads for **that** `EVENT_ID` only |

While on an event page, nav items stay on the same event.

---

## Test 5.1 — Create Volunteer Role

1. Open roles for the test event (**Roles** or **Open roles**).
2. Click **+ Add role**.
3. Enter:

| Label | Value |
|---|---|
| Role name \* | `Registration Helper` |
| Description | `Help welcome attendees and manage the registration counter.` |
| Volunteers needed \* | `1` |

4. Click **Save role**.

```sql
SELECT role_id, role_name, required_volunteers
FROM volunteer_roles
WHERE event_id = EVENT_ID AND role_name = 'Registration Helper';
```

---

## Test 5.2 — Assign Confirmed Volunteer

1. On the role card click **Assign**.
2. Tick **Full Web Member D**.
3. Click **Assign selected volunteers**.

```sql
SELECT va.assignment_id, u.name, vr.role_name
FROM volunteer_assignments va
JOIN event_registrations er ON er.registration_id = va.registration_id
JOIN users u ON u.user_id = er.user_id
JOIN volunteer_roles vr ON vr.role_id = va.role_id
WHERE vr.event_id = EVENT_ID;
```

---

## Test 5.3 — Invalid Assignment Protection

| Case | UI expectation |
|---|---|
| Participant | Member B does **not** appear in assign checkboxes |
| Waitlisted Volunteer | Waitlisted users do **not** appear |
| Duplicate | Member D no longer appears once assigned |

Do **not** Unassign Member D after a successful Test 5.2.

---

## Test 5.4 — Volunteer List

From Role Assignment click **View volunteers** → `/organiser/events/EVENT_ID/volunteers`  
Confirm Member D and **Registration Helper**.

---

## Test 5.5 — Attendance, elapsed time, check-out, hours

### How hours become non-zero (current app)

1. **Mark Attended** inserts attendance with `check_in_time = NOW()`, `volunteer_hours = 0`.
2. **Check out** sets `check_out_time = NOW()` and calculates:

```text
volunteer_hours = ROUND(minutes between check_in and now / 60, 2)
```

only for `participation_type = 'Volunteer'` and `attendance_status = 'Attended'`.  
There is **no** manual hours field. EJS does **not** hardcode hours.

### Exact Steps

1. Open Attendance for the test event (**Attend** or **Open attendance**).
2. Find **Full Web Member D** (Pending).
3. Click **Mark Attended**.
4. Prepare realistic elapsed time (choose one):

#### Option A — wait in real time
Wait several minutes, then continue.

#### Option B — local demo helper (recommended for ~4 hours)

**What `scripts/prepare-demo-volunteer-hours.js` actually does**

| Question | Answer |
|---|---|
| Changes `check_in_time`? | **Yes** — sets it to `NOW() - hoursAgo` |
| Changes `check_out_time`? | **No** |
| Changes `volunteer_hours` directly? | **No** — still `0` until UI Check out |
| When to run | **After** Mark Attended (attendance row must exist) |
| Why Check out is still required | The app calculates and stores hours only on the checkout POST |
| Meaning of `4` | Hours ago for backdating `check_in_time` (default 4 if omitted) |
| Server | Keep `npm start` running; run the helper in a **second** terminal |

**Find registration_id**

```sql
SELECT
    er.registration_id,
    u.email,
    er.participation_type,
    er.status,
    a.attendance_status,
    a.check_in_time,
    a.check_out_time,
    a.volunteer_hours
FROM event_registrations er
JOIN users u ON u.user_id = er.user_id
LEFT JOIN attendance a ON a.registration_id = er.registration_id
WHERE er.event_id = EVENT_ID
  AND u.email = 'fullweb.d.TIMESTAMP@example.sg';
```

**Run (test registration only)**

```powershell
cd C:\Software_Project
node scripts/prepare-demo-volunteer-hours.js REGISTRATION_ID 4
```

**Success output (example)**

```text
Prepared demo check-in for registration_id=…
  event: Full Website Community Day
  email: fullweb.d.…
  check_in_time set to ~4 hour(s) ago
Next: open Attendance UI and click Check out. Hours are calculated by the app from MySQL timestamps.
```

Also appends a DEMO note into `attendance.notes`.  
This helper is for **local demonstration preparation only**. The live site remains database-driven.

5. Return to Attendance (refresh if needed).
6. Click **Check out**.
7. Confirm MySQL shows `check_out_time` set and `volunteer_hours` ≈ **4.00** (small timing variance is normal).

```sql
-- Re-run the SELECT above; expect Attended, both timestamps, volunteer_hours ≈ 4
```

---

## Test 5.6 — Duplicate Attendance Prevention

Further Mark Attended for Member D is not offered (or returns):  
**Attendance has already been recorded for this registration.**

---

## Test 5.7 — Absent Record

Mark **Full Web Member B** **Mark Absent**.  
Expect `volunteer_hours = 0`, no check-in. Do not change Member D’s attended row.

---

# 8. Feature 6 — Notifications, Volunteer Hours and Reporting

**Status: READY_FOR_MANUAL_TESTING** (application Feature 6: **COMPLETE_AND_WORKING**)

Do **not** look for Download PDF, Export CSV, date-range selector, or Finalise attendance — those inert controls were removed on purpose.

---

## Test 6.1 — Registration / waitlist / promotion notifications

### Triggers in current code

| Trigger | `notification_type` |
|---|---|
| Confirmed registration | `Registration` |
| Waitlisted registration | `WaitingList` |
| Promotion after cancel | `Promotion` |
| Event updated | `EventUpdate` |
| Event cancelled (status) | `EventCancellation` |

### Exact Steps
1. Member B → **Dashboard** → **Recent notifications**  
   Expect waiting-list and/or **Promoted from waiting list**.
2. Member D → same section for Registration / WaitingList / Promotion as applicable.

---

## Test 6.2 — Read and Unread State

1. Unread rows show **Unread** and bold text.
2. Click **Mark read** on one row, or **Mark all read**.

```sql
SELECT notification_id, title, is_read
FROM notifications
WHERE user_id = (SELECT user_id FROM users WHERE email = 'fullweb.d.TIMESTAMP@example.sg')
ORDER BY created_at DESC
LIMIT 10;
```

`is_read` becomes `1`; unread badge count drops.

---

## Test 6.3 — Volunteer Contribution History

Member D → **Volunteer Hours** → `/member/volunteer-hours`  
Heading: **My Volunteer Hours**  
**Event history** shows **Full Website Community Day**, date, location, **Attended**, hours.

---

## Test 6.4 — Total Volunteer Hours

Compare **Total completed hours** with:

```sql
SELECT COALESCE(SUM(a.volunteer_hours), 0) AS total_hours
FROM attendance a
INNER JOIN event_registrations r ON r.registration_id = a.registration_id
WHERE r.user_id = (SELECT user_id FROM users WHERE email = 'fullweb.d.TIMESTAMP@example.sg')
  AND r.participation_type = 'Volunteer'
  AND a.attendance_status = 'Attended';
```

---

## Test 6.5 — Monthly Chart

**Monthly contribution — YYYY** bar for the event’s start month must match:

```sql
SELECT COALESCE(SUM(a.volunteer_hours), 0) AS month_hours
FROM attendance a
INNER JOIN event_registrations r ON r.registration_id = a.registration_id
INNER JOIN events e ON e.event_id = r.event_id
WHERE r.user_id = (SELECT user_id FROM users WHERE email = 'fullweb.d.TIMESTAMP@example.sg')
  AND r.participation_type = 'Volunteer'
  AND a.attendance_status = 'Attended'
  AND YEAR(e.start_datetime) = YEAR( /* event start */ )
  AND MONTH(e.start_datetime) = MONTH( /* event start */ );
```

Use the values produced in **this** test (for example ≈ 4.0 after the demo helper), not a fixed guess.

---

## Test 6.6 — Organiser statistics

There is no separate `/organiser/reports` route. Use **Organiser Dashboard**.

1. Organiser A → **Dashboard**
2. Check cards: **Total events**, **Confirmed participants**, **Confirmed volunteers**, **Waiting lists** (note may include vol. hrs / avg attendance)
3. Chart: **Registrations per month — YYYY**
4. Compare volunteer hours total with organiser-scoped MySQL SUM (Section 11)

---

## Test 6.7 — Admin reports

Admin → **Reports** → `/admin/reports`  
Heading: **System Reports**  
KPIs: **Events completed**, **Avg. fill rate**, **Avg. attendance rate**, **Cancellation rate**  
Plus **Performance by category** and **Most-attended events**.

All values come from MySQL aggregates — not fixed JavaScript arrays.

---

## Test 6.8 — No fake / hardcoded data

1. Change a **test** notification message in MySQL for Member D → refresh Dashboard → text updates.
2. After hours exist, confirm Volunteer Hours totals track `attendance.volunteer_hours`.
3. Confirm organiser/admin charts change when your test registrations/hours change.

---

# 9. Complete End-to-End Result

Logical order (must match this guide):

1. Register temporary accounts  
2. Admin promotes Organiser B  
3. Authentication and permissions  
4. Admin creates category  
5. Organiser A creates event  
6. Organiser ownership with Organiser B  
7. Member catalogue search/filter  
8. Member A Confirmed Participant  
9. Member B Waitlisted Participant  
10. Member C Confirmed Volunteer  
11. Member D Waitlisted Volunteer  
12. A cancels → B promoted  
13. C cancels → D promoted  
14. Organiser creates Registration Helper  
15. Organiser assigns Member D  
16. Attendance + check-out (hours)  
17. Member D notifications + Volunteer Hours  
18. Organiser dashboard + Admin reports  
19. Clean up only temporary records  

| Feature | Main Action Tested | Expected Final Result | Passed |
|---|---|---|---|
| 1 | Register / login / roles / suspend | community_member accounts; organiser promotion; 403 on wrong role | ☐ |
| 2 | Category + event CRUD + ownership | Test category/event in MySQL; Organiser B blocked | ☐ |
| 3 | Catalogue search/filter/sort | Test event visible and filterable | ☐ |
| 4 | Dual capacity + waitlist + promotion | B and D promoted after cancels | ☐ |
| 5 | Role assign + attendance | Assignment + Attended + check-out hours | ☐ |
| 6 | Notifications + hours + reports | MySQL-backed notifications/hours/stats | ☐ |

---

# 10. Recommended Live Presentation Sequence

**Target: 12–18 minutes.** Skip most negative tests. Do not demo removed PDF/CSV/Finalise controls.

| # | Account | Page / action | Say | Expected |
|---|---|---|---|---|
| 1 | Admin | **Users** → **Save** role | “Admin promotes organisers; Participant/Volunteer are not account roles.” | Role updated |
| 2 | Admin / Organiser A | Category + **Save event** **Published** | “UI Published stores MySQL Open.” | Event on Manage Events |
| 3 | Member | **Browse Events** → **Apply** search | “Catalogue is MySQL-backed.” | Test event listed |
| 4 | Members A then B | Join as Participant twice | “Participant capacity is separate.” | Confirmed then waitlist |
| 5 | Members C then D | Volunteer join twice | “Volunteer capacity is separate.” | Confirmed then waitlist |
| 6 | Member A | **Cancel** → **Yes, cancel registration** | “Cancel promotes the earliest waitlisted Participant.” | B confirmed |
| 7 | Member C | Cancel Volunteer | “Same for Volunteers.” | D confirmed |
| 8 | Organiser A | Manage Events → **Roles** → **+ Add role** → **Assign** | “Only confirmed Volunteers appear.” | D assigned |
| 9 | Organiser A | **Attend** → **Mark Attended** → helper optional → **Check out** | “Hours come from check-in/out timestamps.” | Hours in MySQL |
| 10 | Member D | **Dashboard** / **Volunteer Hours** | “Notifications and hours match MySQL.” | Unread + totals |
| 11 | Organiser A / Admin | Dashboard / **Reports** | “Reports aggregate real data.” | Stats match queries |

---

# 11. MySQL Verification Queries

Replace `TIMESTAMP`, `EVENT_ID`, and emails as needed. Do **not** select password hashes for demos.

### Users

```sql
SELECT user_id, name, email, role, account_status
FROM users
WHERE email LIKE 'fullweb.%TIMESTAMP%@example.sg'
ORDER BY email;
```

### Categories / events / registrations

```sql
SELECT * FROM event_categories WHERE category_name = 'Full Website Test Category';

SELECT event_id, organiser_id, event_name, status,
       participant_capacity, volunteer_capacity, location
FROM events WHERE event_name = 'Full Website Community Day';

SELECT u.email, er.participation_type, er.status, er.waiting_position
FROM event_registrations er
JOIN users u ON u.user_id = er.user_id
WHERE er.event_id = EVENT_ID
ORDER BY er.participation_type, er.status;
```

### Roles / assignments / attendance / notifications

```sql
SELECT * FROM volunteer_roles WHERE event_id = EVENT_ID;

SELECT va.*, u.name, vr.role_name
FROM volunteer_assignments va
JOIN event_registrations er ON er.registration_id = va.registration_id
JOIN users u ON u.user_id = er.user_id
JOIN volunteer_roles vr ON vr.role_id = va.role_id
WHERE vr.event_id = EVENT_ID;

SELECT
    er.registration_id,
    u.email,
    er.participation_type,
    er.status,
    a.attendance_status,
    a.check_in_time,
    a.check_out_time,
    a.volunteer_hours
FROM event_registrations er
JOIN users u ON u.user_id = er.user_id
LEFT JOIN attendance a ON a.registration_id = er.registration_id
WHERE er.event_id = EVENT_ID
  AND u.email = 'fullweb.d.TIMESTAMP@example.sg';

SELECT u.email, n.notification_type, n.title, n.is_read, n.created_at
FROM notifications n
JOIN users u ON u.user_id = n.user_id
WHERE n.event_id = EVENT_ID
ORDER BY n.created_at DESC;
```

### Volunteer-hour totals

```sql
SELECT COALESCE(SUM(a.volunteer_hours), 0) AS total_hours
FROM attendance a
INNER JOIN event_registrations r ON r.registration_id = a.registration_id
WHERE r.user_id = (SELECT user_id FROM users WHERE email = 'fullweb.d.TIMESTAMP@example.sg')
  AND r.participation_type = 'Volunteer'
  AND a.attendance_status = 'Attended';
```

### Organiser report hours

```sql
SELECT COALESCE(SUM(a.volunteer_hours), 0) AS hours
FROM attendance a
JOIN event_registrations r ON r.registration_id = a.registration_id
JOIN events e ON e.event_id = r.event_id
WHERE e.organiser_id = (SELECT user_id FROM users WHERE email = 'marcus.lim@example.sg')
  AND r.participation_type = 'Volunteer'
  AND a.attendance_status = 'Attended';
```

---

# 12. Troubleshooting

### Login fails
Browser credentials / Suspended status; terminal still shows server running; MySQL `account_status`.  
Files: `controllers/authController.js`

### Wrong role dashboard
Check `users.role`. Files: `controllers/authController.js`

### Test event missing from catalogue
Must be `Open`/`Full`; deadline/start valid; filters not excluding it.  
Files: `lib/publicEvents.js`

### Cannot reach Registrations / Roles / Attendance for a new event
Use **Manage Events** → **Regs** / **Roles** / **Attend**, or global nav pickers then **Open …**.  
Files: `views/partials/navbar.ejs`, `controllers/organiserController.js` hubs, `views/organiser/select-event.ejs`

### Registration Waitlisted unexpectedly
Capacity already full for that participation type.

### Promotion does not happen
Only cancelling a **Confirmed** place promotes the earliest same-type Waitlisted.  
Files: `controllers/registrationController.js`

### Confirmed Volunteer missing from assign list
Must be Volunteer + Confirmed + not already assigned.  
Files: `routes/roles.js`

### Volunteer hours remain 0
Must **Check out** after **Mark Attended**; Volunteer only; short durations round to `0.00` — use the demo helper or wait longer.  
Files: `app.js` checkout; `scripts/prepare-demo-volunteer-hours.js`

### Notification missing
Confirm row in `notifications` for that `user_id` / `event_id`.  
Files: `lib/notifications.js`

### Reports mismatch
Organiser dashboard is scoped to that organiser; admin reports are system-wide.  
Files: `controllers/organiserController.js`, `controllers/adminController.js`

---

# 13. Final Cleanup

Clean **only** labelled full-website test data.

### UI order where possible
1. Unassign Member D → delete role **Registration Helper** (if empty).
2. Manage Events → **Cancel** test event → **Yes, cancel event** (hard delete in current code; cascades related rows per schema).
3. Admin → delete unused **Full Website Test Category**.
4. Admin → optional delete/suspend temporary users.

### Attendance has no UI delete
If the event is deleted via Manage Events, related attendance should cascade. Otherwise use targeted SQL for known `EVENT_ID` only.

### Targeted SQL (known test IDs only)

```sql
DELETE FROM notifications WHERE event_id = EVENT_ID;
-- If event still exists and you need manual cleanup:
DELETE a FROM attendance a
JOIN event_registrations er ON er.registration_id = a.registration_id
WHERE er.event_id = EVENT_ID;
DELETE va FROM volunteer_assignments va
JOIN volunteer_roles vr ON vr.role_id = va.role_id
WHERE vr.event_id = EVENT_ID;
DELETE FROM volunteer_roles WHERE event_id = EVENT_ID;
DELETE FROM event_registrations WHERE event_id = EVENT_ID;
DELETE FROM events WHERE event_id = EVENT_ID AND event_name = 'Full Website Community Day';
DELETE FROM event_categories WHERE category_name = 'Full Website Test Category';
DELETE FROM users WHERE email LIKE 'fullweb.%TIMESTAMP%@example.sg';
```

### Verify gone

```sql
SELECT * FROM events WHERE event_name = 'Full Website Community Day';
SELECT * FROM event_categories WHERE category_name = 'Full Website Test Category';
SELECT * FROM users WHERE email LIKE 'fullweb.%TIMESTAMP%@example.sg';
```

Keep screenshots and query results for evidence before cleanup.  
**Never** run unfiltered `DELETE FROM users` / `DELETE FROM events`.

---

# 14. Final Checklist

- [ ] Public registration creates community_member
- [ ] Correct password login works
- [ ] Wrong password is rejected
- [ ] Role-based access works
- [ ] Suspend/reactivate works
- [ ] Category CRUD works
- [ ] Event CRUD works
- [ ] Organiser ownership works
- [ ] Catalogue displays MySQL events
- [ ] Search works
- [ ] Filters work
- [ ] Sorting works
- [ ] Participant registration works
- [ ] Volunteer registration works
- [ ] Participant capacity is separate
- [ ] Volunteer capacity is separate
- [ ] Duplicate registration is blocked
- [ ] Waiting-list positions work
- [ ] Participant promotion works
- [ ] Volunteer promotion works
- [ ] My Registrations works
- [ ] Global organiser event pickers work (Registrations / Roles / Attendance)
- [ ] Manage Events Regs / Roles / Attend use the correct event_id
- [ ] Volunteer role creation works
- [ ] Assignment restrictions work
- [ ] Attendance Mark Attended / Check out works
- [ ] Duplicate attendance is blocked
- [ ] Notifications work
- [ ] Demo helper only backdates check_in; Check out stores hours
- [ ] Volunteer hours match MySQL
- [ ] Contribution history works
- [ ] Organiser dashboard / Admin reports match MySQL
- [ ] No database-driven page uses fake data

---

*End of guide. Rechecked against current CommunityConnect routes, views, controllers, middleware, schema, and `scripts/prepare-demo-volunteer-hours.js`. Only this documentation file is intended to change when refreshing the guide.*
