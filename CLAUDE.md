# CLAUDE.md — CommunityConnect

Project instruction file for Claude and all AI tooling used in this repository.
Read this file **before** implementing, changing or generating any code.

Before changing code, also inspect **Sources of Truth** (later in this file), especially `design-reference/` for visuals and `database/community_event_manager.sql` for schema. **Report conflicts before changing files.**

**Strict rule:** No AI tool or teammate may redesign, restyle, or visually change any existing CommunityConnect page unless the team explicitly approves a design change. See **Strict Frontend Design Preservation Rules** and **Rules for AI Coding Assistants** below.

---

## 1. Project Overview

**CommunityConnect** is a **Community Event Participation and Volunteer Manager** — a database-driven web application built for the **C237 Software Application Development CA2**.

CommunityConnect helps community organisations create events for ordinary community participants and volunteers, control separate participant and volunteer capacities, manage waiting lists, assign volunteer duties, record attendance and track volunteer hours earned when a community member volunteers.

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

## 3. User Roles (account roles)

Permanent account roles:

- `community_member`
- `organiser`
- `admin`

Do **not** use Participant or Volunteer as permanent account roles. A community member chooses a **participation type per event registration** (`Participant` or `Volunteer`). The same person may join one event as a Participant and another as a Volunteer.

### Community member

- Register and log in
- Browse events
- Join an event as a Participant
- Join an event as a Volunteer
- Cancel valid registrations
- Join participant or volunteer waiting lists
- View personal registrations
- View volunteer hours earned from events where they volunteered

### Organiser

- Create and manage events
- Set separate participant and volunteer capacities
- Manage participants
- Manage volunteers
- Assign volunteer duties
- Record attendance
- View participant and volunteer statistics

### Admin

- Manage users, organisers, categories and system reports

**Role permissions must be checked using server-side Express middleware.** Client-side checks (hiding buttons, disabling links) are presentation only and never sufficient.

---

## 4. Six Main Team Features

| # | Feature | Main Responsibility | Expected JavaScript Work | Expected Database Interaction | Main Planned Tables |
|---|---|---|---|---|---|
| 1 | User Account, Role and Admin Management | Registration, login, logout, sessions, role enforcement, admin user administration | bcrypt hashing, session handling, auth/role middleware, form validation | INSERT/SELECT/UPDATE users; role lookups on every protected request | `users` |
| 2 | Event and Category Management | Organiser CRUD for events; admin CRUD for categories; event status control | Event forms, date/capacity validation, status transitions, ownership checks | Full CRUD on events and categories with organiser ownership enforced | `events`, `event_categories` |
| 3 | Event Catalogue, Search and Filtering | Public/community-member event browsing with search, filter, sort and categorisation | Building filtered queries from query strings, catalogue rendering, pagination logic | SELECT with WHERE/LIKE/ORDER BY across events and categories | `events`, `event_categories` |
| 4 | Event Participation, Volunteer Registration, Capacity and Waiting List Management — **Cheng Xun** | Participant/volunteer registration, separate capacity checks, waiting lists, cancellation and promotion | Capacity counting per participation type, duplicate checks, waitlist position calculation, promotion logic | INSERT/UPDATE/SELECT on registrations; COUNT vs participant/volunteer capacity; ordered waitlist queries | `event_registrations`, `events` |
| 5 | Volunteer Assignment and Attendance Management | Defining event volunteer roles, assigning Volunteer registrations, recording attendance | Assignment forms, attendance marking UI logic, validation of assignable volunteers | CRUD on roles/assignments; attendance INSERT/UPDATE linked to registrations | `volunteer_roles`, `volunteer_assignments`, `attendance` |
| 6 | Notifications, Volunteer Hours and Reporting | User notifications, completed volunteer-hour totals, organiser/admin reports | Notification creation on key actions, hour aggregation, report rendering | INSERT notifications; SUM/GROUP BY queries over attendance and events | `notifications`, `attendance`, `events` |

Features 1–3 and 5–6 are unassigned in this file; only Cheng Xun's assignment (Feature 4) is currently recorded in the project.

---

## 5. Cheng Xun's Feature

**Feature name: Event Participation, Volunteer Registration, Capacity and Waiting List Management**

### Responsibilities

- Register community members as **Participants** or **Volunteers** for an event
- Prevent duplicate event registration
- Validate that the event exists
- Prevent registration for Draft, Closed, Cancelled or Completed events
- Check **participant capacity** separately from **volunteer capacity**
- Create a **Confirmed** registration when space exists for that participation type
- Add users to the appropriate **participant** or **volunteer** waiting list when full
- Calculate waiting-list position for the chosen participation type
- Display participation type and waiting-list position on the member's registrations
- Allow cancellation of a valid registration
- Promote the earliest matching waitlisted person when a confirmed place opens (same participation type)
- Update waiting-list positions after promotion or cancellation

### Cheng Xun does NOT own

- Event creation or editing (Feature 2)
- Event search and filtering (Feature 3)
- User authentication (Feature 1)
- Attendance recording (Feature 5)
- Volunteer-hour calculation (Feature 6)
- Admin user management (Feature 1)

Cheng Xun's code may **read** data owned by other features (e.g. event status and participant/volunteer capacities) but must not implement or modify their logic.

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

### Example: event registration (Participant or Volunteer)

1. **User action** — a logged-in community member chooses **Join as Participant** or **Volunteer for This Event** on the event details page.
2. **EJS form** — the form POSTs to `/registrations` with `event_id`, `participation_type`, optional `volunteer_role_id` (Volunteer only) and `notes`. Never send `user_id` from the form.
3. **Express route** — `app.post('/registrations', requireCommunityMember, ...)` receives the request.
4. **Server-side validation** — the route confirms the event exists, is `Open`, the member has no existing active registration for that event, and `participation_type` is valid.
5. **Parameterised SQL query** — count confirmed registrations for that `event_id` **and** `participation_type`, compare against `participant_capacity` or `volunteer_capacity`, then `INSERT` a `Confirmed` or `Waitlisted` row with position when waitlisted.
6. **MySQL database** — the registration row is stored.
7. **Query result** — the insert result and waitlist position (if any) are returned.
8. **Express response** — the route redirects with a success message.
9. **EJS page** — "My Registrations" shows participation type, status and waiting-list position.

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
| `users.user_id` | `event_registrations.user_id` | A community member owns each registration |
| `event_categories.category_id` | `events.category_id` | Each event belongs to a category |
| `events.event_id` | `event_registrations.event_id` | Registrations belong to an event |
| `events.event_id` | `volunteer_roles.event_id` | Volunteer roles are defined per event |
| `event_registrations.registration_id` | `attendance.registration_id` | Attendance is recorded against a registration |

### Participation and capacity (approved requirement)

- Events use **separate** capacities: `participant_capacity` and `volunteer_capacity` (not a single general `capacity` in new forms).
- Each registration stores `participation_type`: `Participant` or `Volunteer`.
- Account role remains `community_member` (or organiser/admin) — participation type is **not** an account role.

Do not invent final columns beyond what is necessary for planning. **The SQL schema file is the column source of truth** — all code, EJS forms and queries must match it exactly. If the schema still lags the approved participant/volunteer model (dual capacities, `participation_type`, account role `community_member`), update the SQL with the team **before** inventing columns in application code. See **Sources of Truth**.

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

### Participation types (per registration)

- `Participant`
- `Volunteer`

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

### Community member

Routes and views (preview):

- `GET /member/dashboard` → `views/member/dashboard.ejs`
- `GET /member/registrations` → `views/member/my-registrations.ejs` (participation type, status, waitlist position, cancel)
- `GET /member/volunteer-hours` → `views/member/volunteer-hours.ejs` (hours earned when they volunteered)
- `GET /member/profile` → `views/member/profile.ejs`

Dashboard shows upcoming Participant and Volunteer places, both waiting lists, completed volunteer hours, and recent notifications.

### Organiser

- Organiser dashboard
- Create event
- Edit event
- Manage events
- Manage registrations (Participants and Volunteers separately)
- Manage waiting lists (participant and volunteer)
- Assign volunteer roles (Volunteer registrations only)
- Record attendance

### Admin

- Admin dashboard
- User management
- Category management
- Event oversight
- System reporting

---

## 11. UI Design Requirements

The exported Claude Design prototype in `design-reference/` is the **visual source of truth**. Do not invent a new look. Implementation must follow the sections below: **Approved Claude Design Reference**, **Participant and Volunteer Design Requirements**, **Frontend Preservation Rules**, **Strict Frontend Design Preservation Rules**, and **Rules for AI Coding Assistants**.

High-level requirements remain:

- Professional and welcoming community-service appearance
- Responsive desktop, tablet and mobile design (one EJS codebase — no separate mobile pages)
- Consistent navigation via shared partials
- Cards, tables, badges, capacity bars and waiting-list indicators from the design system
- Accessible colour contrast (WCAG AA as documented in the prototype)
- Success / warning / error messages and confirmation modals for destructive actions
- No bare default-Bootstrap look and no full internet website templates

---

## Approved Claude Design Reference

All frontend implementation must follow the exported prototype inside `design-reference/`.

Canonical path:

`design-reference/CommunityConnect Visual Prototype/uploads/CommunityConnect Visual Prototype/`

### Authority of prototype files

| File | Role |
|---|---|
| `Design System.dc.html` | Source of truth for colours, typography, spacing, buttons, forms, cards, tables, badges, messages, capacity bars, waiting-list patterns and navigation components |
| `Mobile Views.dc.html` | Source of truth for responsive behaviour (public hamburger sheet, signed-in bottom tab bar, sticky mobile CTAs, same palette/type/components as desktop) |
| Screen `.dc.html` files (Landing, Events, Event Details, Volunteer Dashboard, My Registrations, My Hours, Organiser/Admin screens, etc.) | Source of truth for page layouts and component arrangement |
| `support.js` | Prototype helper only — not application runtime |

**Do not modify `design-reference/`.** Treat it as read-only reference.

### Rules for AI tools and teammates

- The existing visual direction must **not** be replaced with a new design without team approval.
- Future backend work must **preserve** the current frontend structure and styling (`views/`, `public/css/style.css`, `public/js/main.js`, shared partials).
- AI tools must **not** regenerate or redesign the full website.
- Backend implementation should **connect existing EJS pages to MySQL**, not replace those pages.
- Existing form actions, input `name` attributes and routes may be adjusted **only** when required for working backend logic.
- Any such adjustment must **preserve the approved appearance** (layout, colours, typography, spacing and components).

### Approved visual direction

Follow these traits exactly as shown in the prototype and Design System:

- **CommunityConnect SG** branding (green “C” mark; wordmark with green **SG**)
- Warm **green and earthy-neutral** palette (primary `#2E7D4F`, deep `#1E4D33`, amber `#D99E2B`, error/full `#B0433B`, warm background `#F6F4EF`, borders `#E6E2D8`)
- **Dark navigation areas** where shown: charcoal sidebar `#1E2B22`, dark impact strip / mobile tab bar `#1E2B22`
- Clean geometric sans-serif typography — **Figtree** (weights 400–800)
- Comfortable spacing without excessive empty space (prototype scale: 4 / 8 / 12 / 16 / 20 / 24 / 32)
- Rounded cards and controls (typical card radius ~14px; buttons/inputs ~10px)
- Subtle shadows (e.g. `0 1px 2px rgba(35,39,31,0.05)`)
- Clear status badges (Confirmed, Waitlist #n, Full, Attended, Absent, Cancelled, Completed, Pending)
- Capacity indicators (filled / remaining bars; green → amber → red)
- Participant and volunteer waiting-list indicators (amber waitlist badges, position notes, “Join Waiting List” treatment when a capacity is full)
- Responsive desktop and mobile layouts from one design system
- Accessible colour contrast
- Professional and welcoming community-service appearance

### Prototype screens (do not invent alternate page sets)

Public: Landing, Login, Register, Events, Event Details  
Member area (prototype labelled Volunteer; app routes use `/member/*`): Volunteer Dashboard, My Registrations, My Hours  
Organiser: Organiser Dashboard, Manage Events, Event Form, Manage Registrations, Role Assignment, Attendance  
Admin: Admin Dashboard, User Management, Categories, Reports  
Plus: Design System, Mobile Views

Shared implementation already mirrors this via `views/partials/` (`header`, `navbar`, `sidebar`, `footer`, `messages`) and `public/css/style.css` CSS variables.

---

## Participant and Volunteer Design Requirements

Approved product rules that UI and backend must honour:

- A **community member** can join each event as either **Participant** or **Volunteer**.
- Participant and Volunteer are **event participation types**, not permanent account roles.
- Permanent account roles remain: `community_member`, `organiser`, `admin`.
- **Event details** must show:
  - **Join as Participant**
  - **Volunteer for This Event**
- Event pages must show **separate** participant and volunteer capacities (and separate full / waiting-list states).
- Registration UI must show or hide **volunteer-role selection** based on `participation_type` (show/enable for Volunteer; hide/disable for Participant).
- Registration form fields (preview and future POST): `event_id`, `participation_type`, `volunteer_role_id` (Volunteer only), `notes` — never `user_id` from the form.
- **My Registrations** must display participation type (plus status, waitlist position and cancel where valid).
- **Organiser** pages must separate participants, volunteers, and their waiting lists, with separate capacity summaries.
- Volunteer-role assignment applies only to **Volunteer** registrations.
- **Volunteer-hours** information applies only to **Volunteer** participation (hours earned when the member volunteered).
- Existing approved styling must be **preserved** when these elements are added or when wireframes lag the approved requirements (extend the Design System language; do not invent a new theme).

Example copy pattern for capacities:

- Participants: 42 of 50 confirmed
- Volunteers: 10 of 10 confirmed — waiting list available

---

## Frontend Preservation Rules

- Do not delete or rename existing EJS pages without team approval.
- Do not replace shared CSS (`public/css/style.css`) with a new design system.
- Do not move styling into individual EJS files unless unavoidable.
- Do not create separate mobile EJS pages — responsive behaviour belongs in shared CSS / the same templates (see `Mobile Views.dc.html`).
- Do not remove reusable partials (`views/partials/`).
- Do not replace Bootstrap 5, EJS or vanilla JavaScript with another framework.
- Do not modify unrelated pages while implementing one backend feature.
- Do not hardcode final database records in EJS or `app.js` as if they were production data.
- Replace preview sample data with MySQL results gradually.
- Preserve existing empty states, alerts, cards, tables and responsive behaviour.

Temporary sample data in `app.js` is for frontend preview only and must be phased out as routes gain real queries.

---

# Strict Frontend Design Preservation Rules

No AI tool or teammate may redesign, restyle, or visually change any existing CommunityConnect page unless the team **explicitly approves** a design change.

1. The current CommunityConnect website design is approved and must be preserved.

2. When implementing backend features, database queries, routes, controllers, authentication, validation or business logic, do not redesign any page.

3. Do not change:
   - Page layout
   - Colours
   - Fonts
   - Spacing
   - Card styles
   - Button styles
   - Navigation appearance
   - Sidebar appearance
   - Tables
   - Forms
   - Status badges
   - Images
   - Responsive layouts
   - Dashboard arrangement

4. Do not replace an existing page with a newly generated design.

5. Do not create an alternative visual theme.

6. Do not modify `public/css/style.css` for feature implementation unless a small CSS change is strictly necessary for displaying new functional data.

7. Any necessary CSS change must:
   - Match the existing design system
   - Be limited to the assigned feature
   - Not affect unrelated pages
   - Not change the overall visual theme

8. Do not change shared visual partials unless the assigned feature requires functional content to be displayed.

   Shared visual partials include:
   - Navbar
   - Header
   - Sidebar
   - Footer
   - Message components

9. Do not remove or rename existing CSS classes without checking where they are used.

10. Do not add inline styling that overrides the approved design.

11. Do not modify files inside `design-reference/`.

12. `design-reference/` remains the visual source of truth.

13. Feature work should connect existing EJS pages to routes and MySQL data instead of recreating the pages.

14. Preserve:
   - Existing EJS structure
   - Existing form actions
   - Existing form input names
   - Existing route paths
   - Existing EJS variables
   - Existing database-driven content

15. Do not replace real MySQL data with sample or hardcoded data when changing frontend files.

16. When an assigned feature requires a new element, such as a button, form field, table column, badge or message:
   - Add only the required element
   - Follow the existing visual style
   - Do not redesign the rest of the page

17. A developer must obtain team approval before making any major visual change.

18. Examples of major visual changes that require approval:
   - Changing the colour palette
   - Moving major page sections
   - Replacing the navigation
   - Rebuilding dashboards
   - Changing card layouts
   - Changing typography
   - Replacing images
   - Changing desktop or mobile layouts
   - Applying a new theme

19. If an AI tool believes a design change is necessary, it must report the suggestion first and wait for approval before editing.

20. When the user asks for backend or feature implementation, assume:
   - Existing design must remain unchanged
   - Only functional code should be added
   - Unrelated frontend files must not be edited

---

# Rules for AI Coding Assistants

Before editing files, the AI assistant must:

1. Read `CLAUDE.md` completely.
2. Identify the assigned feature.
3. Identify the minimum files required.
4. Avoid modifying unrelated files.
5. Preserve the existing website design.
6. Report any proposed design change before applying it.

The AI assistant must **not** make visual improvements automatically.

Phrases such as:

- “Improve the page”
- “Make it more modern”
- “Clean up the UI”
- “Enhance the layout”
- “Make the design consistent”

must **not** be interpreted as permission to redesign the application unless the user explicitly requests a design change.

**Final rule:** When there is a conflict between feature functionality and frontend design, preserve the existing design and report the conflict before changing the page structure.

---

## Sources of Truth

Use this order when deciding what to implement:

1. **`database/community_event_manager.sql`**  
   Source of truth for tables, columns, relationships and status values **once they match the approved requirements**. Code, EJS `name` attributes and queries must match the schema spelling and casing.

2. **`CLAUDE.md`** (this file)  
   Source of truth for project rules, feature ownership, CA2 / Git / Railway constraints, account roles, participation types and implementation constraints.

3. **`design-reference/`**  
   Source of truth for visual appearance and responsive layouts. Never edit this folder to “fix” a mismatch — report the conflict and preserve visuals while extending content.

4. **Existing EJS routes and forms**  
   Must remain compatible with the database and the agreed feature flow. Prefer connecting current pages over rebuilding screens.

**Conflicts must be reported before files are changed.** Known areas to watch (report and resolve with the team; do not silently invent schema or redesign):

- Prototype screens use volunteer-centric labels and a **single** capacity / “Register for this event” flow; approved requirements add **Participant + Volunteer** participation and dual capacities without abandoning the Design System look.
- Prototype sidebar / screens say “Volunteer”; application account role and routes use **community member** / `/member/*`.
- If the SQL schema still uses legacy names (for example a single `capacity` or account role `volunteer`), align the schema with the approved `community_member` + `participation_type` + dual-capacity model via a team-communicated database change — do not invent columns in application code ahead of the SQL file.

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
- The public application must be tested using Community member, Organiser and Admin accounts
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
- Do not allow AI to invent database fields — the SQL schema is the source of truth for columns
- AI must inspect **CLAUDE.md**, **`database/community_event_manager.sql`**, and **`design-reference/`** (especially Design System and Mobile Views) before implementing logic or UI changes
- Do not ask AI to regenerate the whole application after feature development begins
- Do not ask AI to redesign the website or replace `public/css/style.css` — preserve the approved Claude Design
- Backend work must wire existing EJS pages to MySQL rather than rebuilding pages from scratch
- Report conflicts between Sources of Truth before changing files
- Follow **Strict Frontend Design Preservation Rules** and **Rules for AI Coding Assistants** — no redesign, restyle, or visual change without explicit team approval

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

- Valid Participant registration succeeds
- Valid Volunteer registration succeeds
- Duplicate registration for the same event is rejected
- Open event accepts registrations
- Full participant capacity produces a Participant waitlist registration
- Full volunteer capacity produces a Volunteer waitlist registration
- Waiting-list insertion assigns the correct position for that participation type
- Registration cancellation works
- Waiting-list promotion occurs for the earliest matching waitlisted person (same participation type)
- Closed event registration is rejected
- Cancelled event registration is rejected
- Personal registrations display participation type correctly
- A user cannot cancel another user's registration

### Deployment

- Railway service starts
- Railway MySQL connects
- Public URL works
- Environment variables exist in Railway
- Static files load
- All account roles (community_member, organiser, admin) can log in on the deployed site
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
- Approved Claude Design prototype in `design-reference/` (read-only visual source of truth)
- Frontend EJS / CSS / JS preview aligned to the prototype, extended for Participant and Volunteer participation types (community-member area under `/member/*`)

### In progress

- CLAUDE.md (project rules, design preservation, participation model)
- Database schema alignment with dual capacities and `community_member` (report SQL vs requirements conflicts before coding against outdated columns)

### Not started

- Authentication
- Event CRUD (wired to MySQL)
- Event search
- Event registration backend (Cheng Xun — Feature 4)
- Attendance
- Reporting
- Railway deployment

---

## 20. Final Project Information

| Item | Value |
|---|---|
| Project name | CommunityConnect |
| Application type | Community Event Participation and Volunteer Manager |
| Server entry file | `app.js` |
| Database name | `community_event_manager` |
| Deployment platform | Railway |
| Default branch | `main` |
| Cheng Xun's branch | `feature/event-registration` |
| Account roles | `community_member`, `organiser`, `admin` |
| Participation types | `Participant`, `Volunteer` (per registration) |
