# CLAUDE.md — CommunityConnect

Project instruction file for Claude and all AI tooling used in this repository.
Read this file **before** implementing, changing or generating any code.

---

## 1. Project Overview

**CommunityConnect** is a **Community Event and Volunteer Manager** — a database-driven web application built for the **C237 Software Application Development CA2**.

CommunityConnect helps community organisations create events, recruit volunteers, control event capacity, manage waiting lists, assign volunteer duties, record attendance and track completed volunteer hours.

The application must:

- Solve a genuine community-event management problem
- Support user accounts
- Support authentication and authorisation
- Have at least two user roles
- Support CRUD (Create, Read, Update, Delete)
- Support search, filtering, sorting or categorisation
- Use substantial JavaScript and MySQL interaction
- Be publicly deployed using Railway
- Use an online Railway MySQL database

---

## 2. Technology Stack

### Required technologies

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Web framework | Express |
| Templating | EJS |
| Database | MySQL |
| Database driver | mysql2 |
| Sessions | express-session |
| Password hashing | bcrypt |
| Configuration | dotenv |
| CSS framework | Bootstrap 5 |
| Markup / styling | HTML, CSS |
| Client scripting | Vanilla JavaScript |

### Do NOT use

- React
- Next.js
- TypeScript
- Tailwind CSS
- Sequelize
- Prisma
- MongoDB
- Full website templates
- Hardcoded final features

The code must remain **understandable at C237 student level**. Prefer clear, explicit code over clever abstractions.

---

## 3. User Roles

### Volunteer

- Register and log in
- Browse events
- Search and filter events
- View event details
- Register for events
- Join waiting lists
- Cancel valid registrations
- View personal registrations
- View completed volunteer hours

### Organiser

- Create, view, edit and cancel events
- Set event capacity
- Manage registrations
- Manage waiting lists
- Assign volunteer roles
- Record attendance
- View event statistics

### Admin

- Manage users
- Manage organisers
- Manage event categories
- View all events
- View system records and reports

**Role permissions must be checked using server-side Express middleware.** Client-side checks (hiding buttons, disabling links) are presentation only and never sufficient.

---

## 4. Six Main Team Features

| # | Feature | Main Responsibility | Expected JavaScript Work | Expected Database Interaction | Main Planned Tables |
|---|---|---|---|---|---|
| 1 | User Account, Role and Admin Management | Registration, login, logout, sessions, role enforcement, admin user administration | bcrypt hashing, session handling, auth/role middleware, form validation | INSERT/SELECT/UPDATE users; role lookups on every protected request | `users` |
| 2 | Event and Category Management | Organiser CRUD for events; admin CRUD for categories; event status control | Event forms, date/capacity validation, status transitions, ownership checks | Full CRUD on events and categories with organiser ownership enforced | `events`, `event_categories` |
| 3 | Event Catalogue, Search and Filtering | Public/volunteer event browsing with search, filter, sort and categorisation | Building filtered queries from query strings, catalogue rendering, pagination logic | SELECT with WHERE/LIKE/ORDER BY across events and categories | `events`, `event_categories` |
| 4 | Event Registration, Capacity and Waiting List Management — **Cheng Xun** | Volunteer registration, capacity enforcement, waiting lists, cancellation and promotion | Capacity counting, duplicate checks, waitlist position calculation, promotion logic | INSERT/UPDATE/SELECT on registrations; COUNT vs capacity; ordered waitlist queries | `event_registrations`, `events` |
| 5 | Volunteer Assignment and Attendance Management | Defining event volunteer roles, assigning volunteers, recording attendance | Assignment forms, attendance marking UI logic, validation of assignable volunteers | CRUD on roles/assignments; attendance INSERT/UPDATE linked to registrations | `volunteer_roles`, `volunteer_assignments`, `attendance` |
| 6 | Notifications, Volunteer Hours and Reporting | User notifications, completed volunteer-hour totals, organiser/admin reports | Notification creation on key actions, hour aggregation, report rendering | INSERT notifications; SUM/GROUP BY queries over attendance and events | `notifications`, `attendance`, `events` |

Features 1–3 and 5–6 are unassigned in this file; only Cheng Xun's assignment (Feature 4) is currently recorded in the project.

---

## 5. Cheng Xun's Feature

**Feature name: Event Registration, Capacity and Waiting List Management**

### Responsibilities

- Allow a logged-in volunteer to register for an event
- Prevent duplicate registration
- Validate that the event exists
- Prevent registration for Draft, Closed, Cancelled or Completed events
- Count confirmed registrations
- Compare confirmed registrations with event capacity
- Create a **Confirmed** registration when space exists
- Create a **Waitlisted** registration when the event is full
- Calculate waiting-list position
- Display the logged-in volunteer's registrations
- Allow cancellation of a valid registration
- Promote the earliest waitlisted volunteer when a confirmed volunteer cancels
- Update waiting-list positions after promotion or cancellation

### Cheng Xun does NOT own

- Event creation or editing (Feature 2)
- Event search and filtering (Feature 3)
- User authentication (Feature 1)
- Attendance recording (Feature 5)
- Volunteer-hour calculation (Feature 6)
- Admin user management (Feature 1)

Cheng Xun's code may **read** data owned by other features (e.g. event status and capacity) but must not implement or modify their logic.

---

## 6. Application Flow

Every feature follows the same request flow:

```text
User action
  → EJS form
  → Express route
  → server-side validation
  → parameterised SQL query
  → MySQL database
  → query result
  → Express response
  → EJS page
```

### Example: event registration

1. **User action** — a logged-in volunteer clicks "Register" on an event details page.
2. **EJS form** — the form POSTs to `/registrations` with a hidden `event_id`.
3. **Express route** — `app.post('/registrations', requireVolunteer, ...)` receives the request.
4. **Server-side validation** — the route confirms the event exists, is `Open`, and the volunteer has no existing active registration.
5. **Parameterised SQL query** — `SELECT COUNT(*) FROM event_registrations WHERE event_id = ? AND status = 'Confirmed'` compares against event capacity, then an `INSERT` creates a `Confirmed` or `Waitlisted` registration.
6. **MySQL database** — the registration row is stored.
7. **Query result** — the insert result and waitlist position (if any) are returned.
8. **Express response** — the route redirects with a success message.
9. **EJS page** — "My Registrations" shows the new registration with its status badge.

---

## 7. Planned Database Tables

Planned tables (columns to be finalised in the SQL schema):

- `users`
- `event_categories`
- `events`
- `event_registrations`
- `volunteer_roles`
- `volunteer_assignments`
- `attendance`
- `notifications`

### Expected relationships

| Parent | Child | Meaning |
|---|---|---|
| `users.user_id` | `event_registrations.user_id` | A user (volunteer) owns each registration |
| `event_categories.category_id` | `events.category_id` | Each event belongs to a category |
| `events.event_id` | `event_registrations.event_id` | Registrations belong to an event |
| `events.event_id` | `volunteer_roles.event_id` | Volunteer roles are defined per event |
| `event_registrations.registration_id` | `attendance.registration_id` | Attendance is recorded against a registration |

Do not invent final columns beyond what is necessary for planning. **Once the SQL schema is created, it becomes the source of truth** — all code, EJS forms and queries must match it exactly.

---

## 8. Planned Status Values

### Event statuses

- `Draft`
- `Open`
- `Full`
- `Closed`
- `Cancelled`
- `Completed`

### Registration statuses

- `Confirmed`
- `Waitlisted`
- `Cancelled`
- `Attended`
- `Absent`

Final code, EJS forms and SQL queries must use **exactly** the values defined in the final SQL schema — same spelling, same casing.

---

## 9. Naming Conventions

- Database columns use `snake_case`
- JavaScript variables use `camelCase` where appropriate
- EJS input `name` attributes must match `req.body` properties
- SQL column names must match the schema
- Routes use lowercase paths
- Use plural resource routes where appropriate (e.g. `/events`, `/registrations`)
- Always use parameterised SQL queries (`?` placeholders)
- **Never accept `user_id` from a hidden form input**
- Obtain the logged-in user's identity from `req.session.user`

### Example — the name chain must match end to end

HTML (EJS form):

```html
<input type="hidden" name="event_id">
```

Express route:

```js
const { event_id } = req.body;
```

Database schema:

```sql
event_id INT NOT NULL
```

---

## 10. Planned Pages

### Public

- Landing page
- Login page
- Registration page
- Event catalogue
- Event details

### Volunteer

- Volunteer dashboard
- My registrations
- Waiting-list status
- Volunteer-hours history
- Profile

### Organiser

- Organiser dashboard
- Create event
- Edit event
- Manage events
- Manage registrations
- Manage waiting list
- Assign volunteer roles
- Record attendance

### Admin

- Admin dashboard
- User management
- Category management
- Event oversight
- System reporting

---

## 11. UI Design Requirements

- Professional and welcoming community-service appearance
- Responsive desktop, tablet and mobile design
- Consistent navigation across all pages
- Modern cards and tables
- Accessible colour contrast
- Readable typography
- Clear buttons and forms
- Status badges (event and registration statuses)
- Capacity indicators (e.g. "18 / 25 places filled")
- Waiting-list indicators (e.g. "You are #3 on the waiting list")
- Empty states (e.g. "You have no registrations yet")
- Loading states where useful
- Success and error messages
- Confirmation modal for destructive actions (cancel event, cancel registration, delete user)
- No basic default-Bootstrap appearance — customise colours, spacing and components
- No excessive empty space
- No full internet website template

---

## 12. Security Requirements

- Hash passwords with **bcrypt** — never store plain-text passwords
- Use **express-session** for login sessions
- Store credentials in `.env`
- **Never commit `.env`**
- Commit `.env.example` with placeholder values
- Use parameterised SQL queries everywhere — no string-concatenated SQL
- Validate all input on the server, even if the browser also validates
- Enforce record ownership (a user may only modify their own records)
- Enforce user roles with server-side middleware
- Do not expose raw SQL errors to users — show friendly error messages
- Do not trust hidden form values for user identity — use `req.session.user`
- Use a strong, random `SESSION_SECRET`

---

## 13. Environment Variables

| Variable | Purpose |
|---|---|
| `DB_HOST` | MySQL host |
| `DB_PORT` | MySQL port |
| `DB_USER` | MySQL username |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | Database name (`community_event_manager`) |
| `SESSION_SECRET` | Secret for express-session |
| `PORT` | Port the Express server listens on |

- **Local development** uses a local MySQL database via `.env`.
- **Production** uses Railway environment variables and Railway MySQL credentials — no `.env` file is deployed.

---

## 14. Railway Deployment

The final public deployment will use **Railway**.

### Required production structure

```text
GitHub main branch
  → Railway Node.js/Express service
  → Railway MySQL service
  → public Railway domain
```

### Deployment requirements

- `package.json` must have a `start` script
- `app.js` must use `process.env.PORT`
- Railway variables must store database credentials
- `SESSION_SECRET` must be configured in Railway
- The SQL schema must be imported into Railway MySQL
- The deployed application must not depend on localhost
- The public application must be tested using Volunteer, Organiser and Admin accounts
- Railway deployment should track the stable `main` branch

### Required code

```js
const PORT = process.env.PORT || 3000;
```

Expected `package.json` script:

```json
"scripts": {
    "start": "node app.js"
}
```

---

## 15. Git Workflow

### Branches

```text
main
  → stable, reviewed project

design-branch
  → initial Claude-designed frontend
```

Feature branches:

- `feature/user-auth`
- `feature/event-management`
- `feature/event-search`
- `feature/event-registration`
- `feature/attendance`
- `feature/volunteer-reporting`

### Workflow

1. Pull latest `main`
2. Create feature branch
3. Work and test
4. Commit
5. Push
6. Create pull request into `main`
7. Review and test
8. Merge

### Rules

- Nobody pushes directly to `main`
- Do not use `git push --force`
- Do not modify another member's feature without discussion
- Database changes must be communicated to the whole team
- Pull requests must be tested before merging

---

## 16. AI Usage Rules

- Claude and Cursor are **learning and development aids**, not replacements for understanding
- Every student must understand their code
- AI-generated code must be reviewed, tested and adapted
- Do not accept large unexplained code changes
- Do not allow AI to invent database fields — the SQL schema is the source of truth
- AI must inspect **CLAUDE.md and the SQL schema** before implementing logic
- Do not ask AI to regenerate the whole application after feature development begins

---

## 17. Testing Requirements

### General

- Application starts successfully
- MySQL connects
- All EJS pages render
- Navigation works
- No terminal errors
- No browser console errors

### Authentication

- Register a new account
- Login with correct credentials
- Incorrect password is rejected
- Logout ends the session
- Protected pages redirect unauthenticated users
- Role restrictions block the wrong role

### Event registration (Cheng Xun's feature)

- Valid event registration succeeds
- Duplicate registration is rejected
- Open event accepts registrations
- Full event produces a waitlisted registration
- Waiting-list insertion assigns the correct position
- Registration cancellation works
- Waiting-list promotion occurs when a confirmed volunteer cancels
- Closed event registration is rejected
- Cancelled event registration is rejected
- Personal registrations display correctly
- A user cannot cancel another user's registration

### Deployment

- Railway service starts
- Railway MySQL connects
- Public URL works
- Environment variables exist in Railway
- Static files load
- All roles can log in on the deployed site
- Database records persist after redeployment

---

## 18. CA2 Requirements

- Every student must write JavaScript
- Every student must own substantial database-connected work
- Authentication and authorisation are required
- At least two roles are required
- CRUD is required
- Search, filtering, sorting or categorisation is required
- Cosmetic changes alone are not meaningful enhancements
- Hardcoded features do not receive marks
- Students must be able to explain the full flow: user action → route → SQL → database → response
- `app.js` should be developed collaboratively

### Final submission requires

- Project ZIP **without** `node_modules`
- MySQL SQL file
- Team Development Journal
- Publicly deployed application
- Online MySQL database
- Updated GitHub repository

---

## 19. Current Project Status

### Completed

- Initial project planning

### In progress

- CLAUDE.md
- Claude UI design

### Not started

- Database schema
- Authentication
- Event CRUD
- Event search
- Event registration
- Attendance
- Reporting
- Railway deployment

---

## 20. Final Project Information

| Item | Value |
|---|---|
| Project name | CommunityConnect |
| Application type | Community Event and Volunteer Manager |
| Server entry file | `app.js` |
| Database name | `community_event_manager` |
| Deployment platform | Railway |
| Default branch | `main` |
| Cheng Xun's branch | `feature/event-registration` |
