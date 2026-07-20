# Manual Testing Guide — Features 1 & 2

CommunityConnect · beginner-friendly click-by-click demonstration plan  
Based on the **current** application code (routes, EJS labels, flash messages, schema).  
Do **not** treat this file as code to run — follow the steps in Chrome.

---

# Before Testing

## How to start the server

1. Open a terminal in the project folder `C:\Software_Project` (or your clone path).
2. Run:

```text
npm start
```

3. Wait until the terminal shows something like:

```text
Connected to CommunityConnect MySQL database
CommunityConnect running at http://localhost:3000
```

4. Leave that terminal open while you test.

## Website URL

```text
http://localhost:3000
```

Use normal Chrome (Incognito is **not** required).

## How to confirm the database connection

In a **second** terminal (server still running in the first):

```text
npm run test-db
```

You should see:

```text
Database connection test succeeded.
Connected database: community_event_manager
```

plus a list of tables including `users`, `events`, `event_categories`.

You may also use MySQL Workbench / CLI against database `community_event_manager` for the verification queries below.

## Required test accounts

### A. Permanent seed accounts (already in the database)

Documented in `database/community_event_manager.sql`:

> Plain-text test password for ALL sample accounts below: **Password123!**

| Role | Display name | Email | Password |
|------|--------------|-------|----------|
| Admin | Siti Rahman | `siti.r@communityconnect.sg` | `Password123!` |
| Organiser A | Marcus Lim | `marcus.lim@example.sg` | `Password123!` |
| Community member (seed) | Tan Wei Ling | `weiling.tan@example.sg` | `Password123!` |

Use these for admin actions, Organiser A event ownership, and some “wrong-role” checks.  
Do **not** delete or suspend the admin account.

### B. Temporary accounts you create during this guide

Before you start, invent a unique stamp (example: `202607172130` for date/time).  
Replace every `TIMESTAMP` below with that stamp.

| Purpose | Full name | Email | Password |
|---------|-----------|-------|----------|
| Feature 1 member → later organiser / suspend tests | Feature 1 Test Member | `feature1.member.TIMESTAMP@example.sg` | `Feature1Test123!` |

You will **promote** Feature 1 Test Member to `organiser` with the admin UI. That promoted account is **Organiser B** for the ownership test.

### C. Temporary Feature 2 data

| Item | Value |
|------|--------|
| Category name | Feature 2 Test Category |
| Category description | Temporary category used to demonstrate category management. |
| Event name | Feature 2 Test Community Event |
| Event description | A temporary event used to demonstrate event creation, editing and deletion. |
| Location (create) | Tampines Community Club |
| Location (after edit) | Bedok Community Centre |
| Participant capacity (create) | 20 |
| Volunteer capacity (create) | 8 |
| Participant capacity (after edit) | 25 |
| Volunteer capacity (after edit) | 10 |

### Suggested future dates (adjust if your “today” is later)

Assume today is around **17 July 2026**. Use:

| Field | Value to type into `datetime-local` fields |
|-------|---------------------------------------------|
| Start date & time | `2026-08-20` and `10:00` |
| End date & time | `2026-08-20` and `12:00` |
| Registration deadline | `2026-08-19` and `18:00` |

Rules the app enforces:

- End must be **after** start.
- Registration deadline must be **before** start.

## Important records not to modify

Do **not** permanently change or delete:

- Admin `siti.r@communityconnect.sg`
- Seed organiser `marcus.lim@example.sg` (except viewing their pages)
- Existing seed events/categories unless this guide says so
- Do not change passwords of seed accounts

Only create/edit/delete the **Feature 1 / Feature 2 test** rows you create here.

## UI vs database status labels (read once)

On **Add Event / Edit Event**, status radios show:

| UI option (click this) | Stored in MySQL `events.status` |
|------------------------|----------------------------------|
| **Published** | `Open` (or `Full` only if both capacities are already filled) |
| **Draft** | `Draft` |
| **Registration closed** | `Closed` |

On **Manage Events**, a row with DB status `Open` shows badge label **Published**.

---

# Feature 1 Demonstration

## Test 1 — Register a Community Member

### Account

None (public).

### Exact Steps

1. Open `http://localhost:3000`.
2. Top right, click **Register** (or open `http://localhost:3000/register`).
3. Confirm the page heading **Create your account**.
4. Fill the form (values below).
5. Tick the checkbox: **I agree to the Terms of Use…**
6. Click the green button **Create account**.

### Values to Enter

| Field label | Value |
|-------------|--------|
| Full name | Feature 1 Test Member |
| Email address | `feature1.member.TIMESTAMP@example.sg` |
| Password | `Feature1Test123!` |
| Confirm password | `Feature1Test123!` |

### Expected Website Result

- Browser redirects to `/login`.
- Success message: **Your CommunityConnect account has been created successfully. Please log in.**

### Expected Database Result

- New row in `users`.
- `role = 'community_member'`
- `account_status = 'Active'`
- `password` is a bcrypt hash (starts like `$2b$`), **not** the plain password.

### Verification Query

```sql
SELECT user_id, name, email, role, account_status,
       LEFT(password, 7) AS password_prefix,
       CHAR_LENGTH(password) AS password_length
FROM users
WHERE email = 'feature1.member.TIMESTAMP@example.sg';
```

Expect: `role = community_member`, `account_status = Active`, `password_prefix = $2b$10` (or similar `$2b$`), `password_length` around 60.  
**Do not** paste the full hash into slides or chat.

### Cleanup

Delete this user at Final Cleanup (after Feature 1 & 2), or keep until promotion/suspend tests finish.

---

## Test 2 — Public registration always creates community_member

### Account

Same registration as Test 1 (already done), **or** inspect MySQL only.

### Exact Steps

1. Use the verification query from Test 1.
2. Confirm `role` is exactly `community_member`.
3. Optional extra proof: the register form has **no** role dropdown. Public users cannot choose organiser/admin in the UI.

### Values to Enter

None additional.

### Expected Website Result

Register page info banner already states organisers/admins are assigned separately.

### Expected Database Result

`role` must be `community_member` only.

### Verification Query

Same as Test 1.

### Cleanup

None extra.

---

## Test 3 — Login with correct password

### Account

Feature 1 Test Member  
Email: `feature1.member.TIMESTAMP@example.sg`  
Password: `Feature1Test123!`

### Exact Steps

1. Open `http://localhost:3000/login` (or click **Log in**).
2. Enter email and password.
3. Click **Log in**.

### Values to Enter

| Field label | Value |
|-------------|--------|
| Email address | `feature1.member.TIMESTAMP@example.sg` |
| Password | `Feature1Test123!` |

### Expected Website Result

- Redirect to `/member/dashboard`.
- Success flash: **Welcome back! You have signed in successfully.**
- Page heading area shows community member **Dashboard**.
- Top nav includes **Dashboard**, **Browse Events**, **My Registrations**, **Volunteer Hours**.
- Top right shows **Log out**.

### Expected Database Result

No change to `users` row required for proof.

### Verification Query

Optional — none required.

### Cleanup

Stay logged in for Test 5, or continue.

---

## Test 4 — Login with wrong password

### Account

Feature 1 Test Member (log out first if still signed in: click **Log out**).

### Exact Steps

1. Open `/login`.
2. Enter the correct email.
3. Enter a wrong password.
4. Click **Log in**.

### Values to Enter

| Field label | Value |
|-------------|--------|
| Email address | `feature1.member.TIMESTAMP@example.sg` |
| Password | `WrongPassword999!` |

### Expected Website Result

- Stay on the login page (HTTP **401** behaviour).
- Error message: **Unable to sign in with the details provided. Please check your information and try again.**

### Expected Database Result

No change; password hash unchanged.

### Verification Query

Optional:

```sql
SELECT account_status FROM users
WHERE email = 'feature1.member.TIMESTAMP@example.sg';
```

Still `Active`.

### Cleanup

None.

---

## Test 5 — Session remains active when moving between pages

### Account

Feature 1 Test Member (log in correctly again as in Test 3).

### Exact Steps

1. From the member dashboard, click nav **Browse Events** (`/events`).
2. Click nav **My Registrations** (`/member/registrations`).
3. Click nav **Volunteer Hours** (`/member/volunteer-hours`).
4. Click **Dashboard** again.

### Values to Enter

None.

### Expected Website Result

- Each page loads without asking you to log in again.
- Your name/initials stay visible in the top-right avatar area.
- **Log out** remains available.

### Expected Database Result

No change.

### Verification Query

None.

### Cleanup

None.

---

## Test 6 — Logout

### Account

Feature 1 Test Member (currently logged in).

### Exact Steps

1. Click **Log out** in the top-right (link goes to `/logout`).
2. Confirm you land on the login page.
3. In the address bar, try opening `http://localhost:3000/member/dashboard` again.

### Values to Enter

None.

### Expected Website Result

- After logout: `/login`.
- Manual visit to `/member/dashboard` redirects to `/login` (not signed in).
- Flash may show **Please log in to continue.** when middleware blocks access.

### Expected Database Result

No change to user row; only the browser session cookie is cleared.

### Verification Query

None.

### Cleanup

None.

---

## Test 7 — Protected member route

### Account

Logged **out** (no session).

### Exact Steps

1. Ensure you are logged out.
2. Open `http://localhost:3000/member/dashboard`.

### Values to Enter

None.

### Expected Website Result

- Redirect to `/login`.
- You do **not** see the member dashboard content.

### Expected Database Result

No change.

### Verification Query

None.

### Cleanup

None.

---

## Test 8 — Protected organiser route

### Account

Feature 1 Test Member (still `community_member` at this point) **or** seed member `weiling.tan@example.sg`.

### Exact Steps

1. Log in as the community member.
2. In the address bar, open `http://localhost:3000/organiser/dashboard`.

### Values to Enter

Login with member credentials if needed.

### Expected Website Result

- HTTP **403**.
- Error page title: **You do not have permission to access this page**
- Message: **Please sign in with an account that has the correct role, or return to your own dashboard.**
- Status code shown on page: **403**

### Expected Database Result

No change.

### Verification Query

None.

### Cleanup

Click **Log out**.

---

## Test 9 — Protected admin route

### Account

Same community member as Test 8.

### Exact Steps

1. Log in as community member.
2. Open `http://localhost:3000/admin/dashboard`.

### Values to Enter

None beyond login.

### Expected Website Result

Same **403** access-denied page as Test 8.

### Expected Database Result

No change.

### Verification Query

None.

### Cleanup

**Log out**.

---

## Test 10 — Admin User Management page

### Account

Admin: `siti.r@communityconnect.sg` / `Password123!`

### Exact Steps

1. Open `/login`.
2. Log in with the admin account.
3. Confirm redirect to `/admin/dashboard`.
4. In the top pill nav, click **Users** (or open `http://localhost:3000/admin/users`).
5. Confirm page heading **User Management**.

### Values to Enter

None required. Optional: search box **Search by name or email…** type `Feature 1 Test Member`, click **Filter**.

### Expected Website Result

- Table columns: **User**, **Email**, **Role**, **Joined**, **Status**, **Actions**.
- Your Feature 1 Test Member row appears with email `feature1.member.TIMESTAMP@example.sg`.
- Role dropdown options: **Community member**, **Organiser**, **Admin**.
- Action buttons include **Suspend**, **Reset access**, **Delete** (for Active users).

### Expected Database Result

Read-only for this test.

### Verification Query

```sql
SELECT user_id, name, email, role, account_status
FROM users
WHERE email = 'feature1.member.TIMESTAMP@example.sg';
```

### Cleanup

Stay logged in as admin for Test 11.

---

## Test 11 — Admin changes a community_member into an organiser

### Account

Admin (already logged in).

### Exact Steps

1. On **User Management**, find **Feature 1 Test Member**.
2. In that row’s **Role** dropdown, change from **Community member** to **Organiser**.
3. Click the small **Save** button next to the dropdown.

### Values to Enter / Select

| Control | Choice |
|---------|--------|
| Role dropdown | **Organiser** |
| Button | **Save** |

### Expected Website Result

- Page reloads `/admin/users`.
- Success message: **The account role has been updated.**
- That row’s role dropdown now shows **Organiser**.

### Expected Database Result

`users.role = 'organiser'` for that email.

### Verification Query

```sql
SELECT user_id, email, role, account_status
FROM users
WHERE email = 'feature1.member.TIMESTAMP@example.sg';
```

Expect `role = organiser`.

### Cleanup

Do **not** demote yet — this account is **Organiser B** for Feature 2 ownership.

---

## Test 12 — Promoted organiser logs in successfully

### Account

Feature 1 Test Member (now organiser)  
Email: `feature1.member.TIMESTAMP@example.sg`  
Password: `Feature1Test123!` (unchanged)

### Exact Steps

1. Click **Log out**.
2. Open `/login`.
3. Log in with the same email/password as registration.

### Values to Enter

| Field | Value |
|-------|--------|
| Email address | `feature1.member.TIMESTAMP@example.sg` |
| Password | `Feature1Test123!` |

### Expected Website Result

Successful login (redirect — see Test 13).

### Expected Database Result

No password change; role remains `organiser`.

### Verification Query

Optional — same role query as Test 11.

### Cleanup

None.

---

## Test 13 — Organiser is redirected to /organiser/dashboard

### Account

Same promoted organiser (continuing from Test 12).

### Exact Steps

1. Observe the URL after login.
2. Confirm the organiser dashboard loads.
3. Confirm top nav includes **Manage Events** and an **Organiser** role badge near the brand.

### Values to Enter

None.

### Expected Website Result

- URL is `http://localhost:3000/organiser/dashboard`.
- Welcome flash: **Welcome back! You have signed in successfully.**
- Page is the organiser **Dashboard** (not member dashboard).

### Expected Database Result

No change.

### Verification Query

None.

### Cleanup

**Log out** before Tests 14–15 if needed. Complete Tests 16–19 (suspend/reactivate) on this account **before** Feature 2 ownership, then leave the account **Active** as organiser for Organiser B.

---

## Test 14 — Community member is blocked from organiser pages

### Account

Seed community member: `weiling.tan@example.sg` / `Password123!`

### Exact Steps

1. Log out if needed.
2. Log in as Tan Wei Ling.
3. Open `http://localhost:3000/organiser/events`.

### Values to Enter

Seed member login.

### Expected Website Result

**403** access-denied page (same as Test 8).

### Expected Database Result

No change.

### Verification Query

None.

### Cleanup

**Log out**.

---

## Test 15 — Organiser is blocked from admin pages

### Account

Organiser A seed: `marcus.lim@example.sg` / `Password123!`  
(or Feature 1 Test Organiser if already promoted and Active)

### Exact Steps

1. Log in as organiser.
2. Open `http://localhost:3000/admin/dashboard`.
3. Also try `http://localhost:3000/admin/users`.

### Values to Enter

Organiser login.

### Expected Website Result

Both URLs show the **403** access-denied page.

### Expected Database Result

No change.

### Verification Query

None.

### Cleanup

**Log out**.

---

## Test 16 — Admin suspends a user

### Account

Admin: `siti.r@communityconnect.sg` / `Password123!`  
Target: Feature 1 Test Member / organiser (`feature1.member.TIMESTAMP@example.sg`)

### Exact Steps

1. Log in as admin → **Users**.
2. Find Feature 1 Test Member.
3. Click **Suspend**.
4. In the browser confirm dialog: **Suspend Feature 1 Test Member's account?** click **OK**.

### Values to Enter

None (confirm dialog only).

### Expected Website Result

- Success message: **The account has been suspended.**
- Status badge shows **Suspended**.
- Actions show **Activate** instead of Suspend.

### Expected Database Result

`account_status = 'Suspended'`.

### Verification Query

```sql
SELECT email, role, account_status
FROM users
WHERE email = 'feature1.member.TIMESTAMP@example.sg';
```

### Cleanup

Continue to Test 17–18 (reactivate afterward).

---

## Test 17 — Suspended user cannot log in

### Account

Feature 1 Test Member (Suspended).

### Exact Steps

1. **Log out** as admin.
2. Open `/login`.
3. Try logging in with Feature 1 Test Member email and `Feature1Test123!`.

### Values to Enter

Correct email + correct password (account is suspended).

### Expected Website Result

- Login fails (HTTP **401** behaviour).
- Error: **Your account has been suspended. Please contact a CommunityConnect administrator.**

### Expected Database Result

Still `Suspended`.

### Verification Query

Same as Test 16.

### Cleanup

None until Reactivate.

---

## Test 18 — Admin reactivates the user

### Account

Admin.

### Exact Steps

1. Log in as admin → **Users**.
2. Find the suspended Feature 1 Test Member.
3. Click **Activate**.

### Values to Enter

None.

### Expected Website Result

- Success: **The account has been activated.**
- Status badge **Active**.

### Expected Database Result

`account_status = 'Active'`.

### Verification Query

```sql
SELECT email, account_status FROM users
WHERE email = 'feature1.member.TIMESTAMP@example.sg';
```

### Cleanup

None.

---

## Test 19 — Reactivated user can log in again

### Account

Feature 1 Test Member (Active organiser).

### Exact Steps

1. Log out.
2. Log in with `feature1.member.TIMESTAMP@example.sg` / `Feature1Test123!`.

### Values to Enter

Same as Test 12.

### Expected Website Result

Redirect to `/organiser/dashboard` (because role is still organiser after Test 11).

### Expected Database Result

`Active` + `organiser`.

### Verification Query

Optional.

### Cleanup

**Log out.** Keep this account as **Organiser B** for Feature 2 ownership.

---

## Test 20 — Public registration cannot create an admin or organiser account

### Account

None (public).

### Exact Steps

1. Open `/register`.
2. Confirm there is **no** role dropdown — only Full name, Email, Password, Confirm password, terms, **Create account**.
3. Optional: register a disposable second account with name **Feature 1 Role Attack** and email `feature1.attack.TIMESTAMP@example.sg`.
4. Verify in MySQL that any new public registration is `community_member`.

### Values to Enter

(If creating the disposable account)

| Field | Value |
|-------|--------|
| Full name | Feature 1 Role Attack |
| Email | `feature1.attack.TIMESTAMP@example.sg` |
| Password / Confirm | `Feature1Test123!` |

### Expected Website Result

Account created → redirect to login with success message (same as Test 1). No way in the UI to choose Admin/Organiser.

### Expected Database Result

`role = 'community_member'` for public sign-ups. For the UI demo, absence of a role field + MySQL role is enough.

### Verification Query

```sql
SELECT email, role FROM users
WHERE email LIKE 'feature1.%TIMESTAMP%@example.sg';
```

All should be `community_member` except the one you deliberately promoted in Test 11 (`organiser`).

### Cleanup

Delete disposable attack account in Final Cleanup if created.

---

# Feature 2 Demonstration

## Test 1 — Create a Category

### Account

Admin: `siti.r@communityconnect.sg` / `Password123!`

### Exact Steps

1. Log in as admin.
2. Click nav **Categories** (or open `http://localhost:3000/admin/categories`).
3. Page heading: **Event Category Management**.
4. On the right sticky panel **Add new category**, fill the fields.
5. Click **Add category**.

### Values to Enter

| Field label | Value |
|-------------|--------|
| Category name | Feature 2 Test Category |
| Description | Temporary category used to demonstrate category management. |

(Badge colour swatches are display-only; colours are not stored in MySQL.)

### Expected Website Result

- Success: **Category created successfully.**
- Table row appears with name **Feature 2 Test Category**, Events count **0**, Status **Active**.

### Expected Database Result

New row in `event_categories`.

### Verification Query

```sql
SELECT category_id, category_name, description
FROM event_categories
WHERE category_name = 'Feature 2 Test Category';
```

Write down `category_id` (you will need it).

### Cleanup

Delete at end of Feature 2 (after the test event is gone).

---

## Test 2 — Category appears on the website

### Account

Admin (same session).

### Exact Steps

1. Stay on `/admin/categories`.
2. Confirm the new row is visible in the left table (Category / Description / Events / Status / Actions).

### Values to Enter

None.

### Expected Website Result

Row visible after create redirect.

### Expected Database Result

Same as Test 1.

### Verification Query

Optional repeat of Test 1 query.

### Cleanup

None.

---

## Test 3 — Category appears in event_categories

Covered by Test 1 verification query.

### Account

N/A (MySQL).

### Exact Steps

Run the SQL in Test 1.

### Values to Enter

N/A.

### Expected Website Result

N/A.

### Expected Database Result

One matching row.

### Verification Query

See Test 1.

### Cleanup

None.

---

## Test 4 — Admin edits the category

### Account

Admin.

### Exact Steps

1. On the category row, click **Edit** (links to `/admin/categories?edit=CATEGORY_ID`).
2. Right panel title changes to **Edit category**.
3. Change description (see values).
4. Click **Save changes**.

### Values to Enter

| Field | Value |
|-------|--------|
| Category name | Feature 2 Test Category |
| Description | Temporary category used to demonstrate category management. (edited) |

### Expected Website Result

- Success: **Category updated successfully.**
- Table shows updated description.
- Form returns to **Add new category** mode.

### Expected Database Result

`description` updated.

### Verification Query

```sql
SELECT category_id, category_name, description
FROM event_categories
WHERE category_name = 'Feature 2 Test Category';
```

### Cleanup

None.

---

## Test 5 — Edited category matches MySQL

### Account

N/A.

### Exact Steps

Compare the website table description to the SQL result from Test 4.

### Values to Enter

None.

### Expected Website Result

Matches MySQL `description`.

### Expected Database Result

Matches website.

### Verification Query

Same as Test 4.

### Cleanup

None.

---

## Test 6 — Admin attempts to delete a category used by an event

### Account

Admin.

### Exact Steps

1. First complete **Event Tests 1–14** below so Feature 2 Test Event exists and uses this category (Events count becomes ≥ 1).
2. Return to **Categories**.
3. On **Feature 2 Test Category**, the **Delete** button is **disabled** when Events > 0 (title: Cannot delete: category has linked events).
4. That is the UI protection. The server would also return flash: **This category is used by existing events and cannot be deleted.** if a delete were posted while events still reference the category.

### Values to Enter

None.

### Expected Website Result

Cannot delete while in use (disabled button).

### Expected Database Result

Category row still present.

### Verification Query

```sql
SELECT c.category_name, COUNT(e.event_id) AS event_count
FROM event_categories c
LEFT JOIN events e ON e.category_id = c.category_id
WHERE c.category_name = 'Feature 2 Test Category'
GROUP BY c.category_id, c.category_name;
```

`event_count` ≥ 1 while the test event exists.

### Cleanup

Delete event first (Event Test 25), then category.

---

## Test 7 — System safely blocks deletion

Covered together with Test 6 (disabled Delete + server-side check).

### Account

Admin.

### Exact Steps

Same as Test 6.

### Values to Enter

None.

### Expected Website Result

Category remains listed.

### Expected Database Result

Row not deleted.

### Verification Query

Same as Test 6.

### Cleanup

None.

---

## Test 8 — Admin deletes an unused test category

### Account

Admin — **only after** the test event is deleted (see Event Test 25–26).

### Exact Steps

1. Confirm Events count for Feature 2 Test Category is **0**.
2. Click **Delete**.
3. Confirm the browser dialog **Delete category Feature 2 Test Category?**
4. Click OK.

### Values to Enter

None.

### Expected Website Result

- Success: **Category deleted successfully.**
- Row disappears.

### Expected Database Result

No row with that name.

### Verification Query

```sql
SELECT category_id FROM event_categories
WHERE category_name = 'Feature 2 Test Category';
```

Expect **0 rows**.

### Cleanup

Done for category.

---

# Feature 2 — Event Management

## Test 1 — Organiser opens Manage Events

### Account

Organiser A: `marcus.lim@example.sg` / `Password123!`

### Exact Steps

1. Log in as Marcus.
2. Click nav **Manage Events** (or open `http://localhost:3000/organiser/events`).
3. Confirm page heading **Manage Events**.

### Values to Enter

None.

### Expected Website Result

Event table (or empty state). Button **+ Add Event** in the header.

### Expected Database Result

N/A.

### Verification Query

None.

### Cleanup

None.

---

## Test 2 — Organiser opens the Add Event page

### Account

Organiser A (Marcus).

### Exact Steps

1. Click **+ Add Event** (goes to `/organiser/events/new`).
2. Confirm heading **Add Event**.

### Values to Enter

None yet.

### Expected Website Result

Form sections **Event details**, **Schedule & capacity**, **Event status**.

### Expected Database Result

No insert yet.

### Verification Query

None.

### Cleanup

None.

---

## Tests 3–14 — Create the test event (fill form and save)

### Account

Organiser A (Marcus).

### Exact Steps

1. On **Add Event**, fill every field using the values table below.
2. Under **Event status**, select the radio **Published**  
   (note: “Visible in the catalogue, open for registration”).
3. Click header button **Save event** (submits the form).

### Values to Enter

| Field label on page | Value |
|---------------------|--------|
| Event name | Feature 2 Test Community Event |
| Category | **Feature 2 Test Category** |
| Location | Tampines Community Club |
| Description | A temporary event used to demonstrate event creation, editing and deletion. |
| Start date & time | 2026-08-20 10:00 |
| End date & time | 2026-08-20 12:00 |
| Participant capacity | 20 |
| Volunteer capacity | 8 |
| Registration deadline | 2026-08-19 18:00 |
| Event status (radio) | **Published** |

### Expected Website Result

- Redirect to edit URL like `/organiser/events/EVENT_ID/edit`.
- Success: **Event created successfully.**
- Write down the **EVENT_ID** from the browser address bar.

### Expected Database Result

| Column | Expected |
|--------|----------|
| `event_name` | Feature 2 Test Community Event |
| `location` | Tampines Community Club |
| `participant_capacity` | 20 |
| `volunteer_capacity` | 8 |
| `status` | **`Open`** (because UI **Published** maps to DB `Open`) |
| `organiser_id` | Marcus’s `user_id` (seed organiser) |
| `category_id` | Feature 2 Test Category id |

### Verification Query

```sql
SELECT event_id, organiser_id, category_id, event_name, location,
       participant_capacity, volunteer_capacity, status,
       start_datetime, end_datetime, registration_deadline
FROM events
WHERE event_name = 'Feature 2 Test Community Event';
```

### Cleanup

Delete in Event Test 25 after ownership test.

---

## Test 15 — Confirm the event appears in Manage Events

### Account

Organiser A.

### Exact Steps

1. Click **← Manage Events** or nav **Manage Events**.
2. Find row **Feature 2 Test Community Event**.

### Values to Enter

None.

### Expected Website Result

- Location under the name: Tampines Community Club.
- Capacity shows **P 0/20** and **V 0/8** (if no registrations).
- Status badge **Published** (UI label for DB `Open`).
- Actions: **View**, **Edit**, **Cancel**.

### Expected Database Result

Matches Test 3–14 query.

### Verification Query

Optional.

### Cleanup

None.

---

## Test 16 — Confirm the event appears in MySQL

### Account

N/A.

### Exact Steps

Run the verification query from Tests 3–14. Record `event_id`.

### Values to Enter

N/A.

### Expected Website Result

N/A.

### Expected Database Result

One row; `status = 'Open'`.

### Verification Query

Same as Tests 3–14.

### Cleanup

None.

---

## Tests 17–22 — Edit the event

### Account

Organiser A (Marcus).

### Exact Steps

1. On Manage Events, click **Edit** for the test event  
   (URL: `http://localhost:3000/organiser/events/EVENT_ID/edit`).
2. Change the fields below.
3. Under Event status, select **Draft**.
4. Click **Save event**.

### Values to Enter

| Field | New value |
|-------|-----------|
| Location | Bedok Community Centre |
| Participant capacity | 25 |
| Volunteer capacity | 10 |
| Event status | **Draft** |

Leave name, category, description, and datetimes as created (or unchanged).

### Expected Website Result

- Success: **Event updated successfully.**
- Stay on edit page; fields show new values.
- Status radio **Draft** selected.

### Expected Database Result

| Column | Expected |
|--------|----------|
| `location` | Bedok Community Centre |
| `participant_capacity` | 25 |
| `volunteer_capacity` | 10 |
| `status` | **`Draft`** |

### Verification Query

```sql
SELECT event_id, location, participant_capacity, volunteer_capacity, status
FROM events
WHERE event_name = 'Feature 2 Test Community Event';
```

### Cleanup

None.

---

## Test 23 — Confirm the website and MySQL match

### Account

Organiser A.

### Exact Steps

1. Refresh the edit page.
2. Open Manage Events and check the row.
3. Compare with the SQL result.

### Values to Enter

None.

### Expected Website Result

Location **Bedok Community Centre**; capacities 25 / 10; status badge **Draft**.

### Expected Database Result

Identical values.

### Verification Query

Same as Tests 17–22.

### Cleanup

None.

---

## Test 24 — Confirm another organiser cannot edit the event (ownership)

### Account

- Organiser A: Marcus (owner) — already created the event; note `EVENT_ID`.
- Organiser B: Feature 1 Test Member promoted earlier  
  `feature1.member.TIMESTAMP@example.sg` / `Feature1Test123!`

### Exact Steps

1. **Log out** as Marcus.
2. **Log in** as Organiser B.
3. In the address bar, open exactly:

```text
http://localhost:3000/organiser/events/EVENT_ID/edit
```

(Replace `EVENT_ID` with the number from the create step.)

4. Observe the result.
5. Optionally open Manage Events as Organiser B — the test event should **not** appear in their list (they only see their own events).

### Values to Enter

Organiser B login only.

### Expected Website Result

- Edit URL: **404** plain text **Event not found.**  
  (Ownership check treats other organisers’ events as not found.)
- Manage Events for Organiser B does not list Feature 2 Test Community Event.

### Expected Database Result

Event unchanged (still owned by Marcus; still Bedok / 25 / 10 / Draft).

### Verification Query

```sql
SELECT event_id, organiser_id, event_name, location, status
FROM events
WHERE event_name = 'Feature 2 Test Community Event';
```

`organiser_id` still Marcus’s id; location still Bedok Community Centre.

### Cleanup

Log out Organiser B. Log back in as Marcus for delete.

---

## Test 25 — Delete the test event

### Account

Organiser A (Marcus).

### Exact Steps

1. Open **Manage Events**.
2. On **Feature 2 Test Community Event**, click **Cancel**.
3. Modal title: **Cancel this event?**
4. Click **Yes, cancel event** (this POSTs to `/organiser/events/EVENT_ID/delete`).

### Values to Enter

None.

### Expected Website Result

- Redirect to Manage Events.
- Success: **Event deleted successfully.**
- Row gone.

### Expected Database Result

Event row removed (child registrations/roles cascade if any).

### Verification Query

```sql
SELECT event_id FROM events
WHERE event_name = 'Feature 2 Test Community Event';
```

Expect **0 rows**.

### Cleanup

Proceed to delete unused category (Feature 2 Category Test 8).

---

## Test 26 — Confirm removed from website and MySQL

### Account

Organiser A + MySQL.

### Exact Steps

1. Confirm Manage Events has no Feature 2 Test Community Event.
2. Run the SQL from Test 25.
3. Optional: open `/events/EVENT_ID` — should be not found / error.

### Values to Enter

None.

### Expected Website Result

Event absent from organiser list and public details.

### Expected Database Result

0 rows.

### Verification Query

Same as Test 25.

### Cleanup

Delete category (Feature 2 Category Test 8).

---

## Test 27 — Delete the now-unused test category

Follow **Feature 2 Category Test 8** exactly.

---

# Recommended Presentation Order

**Target live demo: about 8–12 minutes**

1. **Start server** + open `http://localhost:3000` (30 sec).
2. **Register** Feature 1 Test Member → show login success message (1 min).
3. **MySQL** show role `community_member` + bcrypt prefix (45 sec).
4. **Wrong password** once (30 sec).
5. **Correct login** → member dashboard → click My Registrations → **Log out** → reopen `/member/dashboard` (blocked) (1.5 min).
6. **Admin login** → **Users** → promote member to **Organiser** → MySQL `role` (1.5 min).
7. **Promoted user login** → lands on `/organiser/dashboard` (45 sec).
8. **As seed member**, open `/organiser/dashboard` → 403; **as Marcus**, open `/admin/dashboard` → 403 (1 min).
9. **Suspend / fail login / Activate / login again** on Feature 1 Test account (1.5 min).
10. **Admin → Categories** create Feature 2 Test Category (45 sec).
11. **Marcus → Manage Events → Add Event** create Feature 2 Test Community Event with P20/V8, status **Published** → MySQL shows `Open` (2 min).
12. **Edit** location + capacities + **Draft** → refresh + MySQL (1 min).
13. **Organiser B** opens Marcus’s edit URL → Event not found; MySQL unchanged (45 sec).
14. **Marcus deletes** event → **Admin deletes** unused category → Final Cleanup checklist (1 min).

Skip repeating every intermediate verification query live; keep 3–4 SQL checks for the markers.

---

# Final Cleanup

## Remove temporary users

```sql
SELECT user_id, name, email, role, account_status
FROM users
WHERE email LIKE 'feature1.%@example.sg';
```

If the Feature 1 Test Member was left as organiser and owns **no** events:

```sql
DELETE FROM users
WHERE email = 'feature1.member.TIMESTAMP@example.sg';
```

Also delete any disposable:

```sql
DELETE FROM users
WHERE email = 'feature1.attack.TIMESTAMP@example.sg';
```

**Do not** delete `siti.r@communityconnect.sg`, `marcus.lim@example.sg`, or other seed users.

## Remove temporary events (if any left)

```sql
SELECT event_id, event_name FROM events
WHERE event_name = 'Feature 2 Test Community Event';

DELETE FROM events
WHERE event_name = 'Feature 2 Test Community Event';
```

## Remove temporary categories

```sql
SELECT category_id, category_name FROM event_categories
WHERE category_name = 'Feature 2 Test Category';

DELETE FROM event_categories
WHERE category_name = 'Feature 2 Test Category'
  AND category_id NOT IN (SELECT category_id FROM events);
```

(If delete fails, an event still references it — delete that event first.)

## Confirm clean state

```sql
SELECT COUNT(*) AS leftover_users
FROM users
WHERE email LIKE 'feature1.%@example.sg';

SELECT COUNT(*) AS leftover_events
FROM events
WHERE event_name = 'Feature 2 Test Community Event';

SELECT COUNT(*) AS leftover_categories
FROM event_categories
WHERE category_name = 'Feature 2 Test Category';
```

All three counts should be **0**.

Restore any seed account you accidentally suspended:

```sql
UPDATE users
SET account_status = 'Active'
WHERE email IN (
  'siti.r@communityconnect.sg',
  'marcus.lim@example.sg',
  'weiling.tan@example.sg'
);
```

---

# Final Checklist

- [ ] Registration works
- [ ] Login works (correct password)
- [ ] Wrong password is rejected
- [ ] Session stays active across pages
- [ ] Logout clears access to protected pages
- [ ] Role protection works (member ↛ organiser/admin; organiser ↛ admin)
- [ ] Admin User Management works
- [ ] Role promotion to organiser works
- [ ] Promoted organiser redirects to `/organiser/dashboard`
- [ ] Suspension works
- [ ] Suspended login blocked
- [ ] Reactivation works
- [ ] Public registration cannot choose admin/organiser
- [ ] Category CRUD works
- [ ] Used category cannot be deleted unsafely
- [ ] Event CRUD works
- [ ] Separate Participant and Volunteer capacities are saved
- [ ] UI **Published** maps to MySQL **Open**
- [ ] Organiser ownership works
- [ ] Website values match MySQL
- [ ] Temporary Feature 1 / Feature 2 test data removed

---

# Notes for the demonstrator

1. Replace every `TIMESTAMP` and `EVENT_ID` / `CATEGORY_ID` with your real values as you go.
2. Never display full password hashes on screen shares.
3. Never read aloud `.env` secrets (`DB_PASSWORD`, `SESSION_SECRET`).
4. The Manage Events **Cancel** button deletes the event permanently in the current app (success message: **Event deleted successfully.**).
5. Category actions use **Delete** (when Events = 0). Badge colour swatches on the category form are visual only and are not saved to MySQL.
