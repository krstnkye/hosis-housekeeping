# HOSIS Housekeeping Subsystem

The Housekeeping module of HOSIS, built from the Housekeeping Department
Flowchart (`docs/Flowchart/housekeeping-department-flowchart.drawio`), the
Housekeeping ERD in our documentation, and the HOSIS Housekeeping UI Figma file.

| Layer    | Location                                         |
| -------- | ------------------------------------------------ |
| Database | `database/schema/06-housekeeping.sql`, `database/seed/06-housekeeping-seed.sql` |
| Backend  | `backend/src/modules/housekeeping/` (REST API under `/api/housekeeping`) |
| Login    | `backend/src/modules/auth/` (`POST /api/auth/login`, JWT) |
| Frontend | `frontend/src/modules/housekeeping/` |
| Tests    | `backend/test/housekeeping.test.js` |

## Running it locally

1. Create a PostgreSQL database and load the schema and sample data:

   ```bash
   createdb hosis
   psql hosis -f database/schema/06-housekeeping.sql
   psql hosis -f database/seed/06-housekeeping-seed.sql
   ```

2. Start the backend:

   ```bash
   cd backend
   cp .env.example .env      # then set DATABASE_URL and JWT_SECRET
   npm install
   npm run dev               # http://localhost:5000
   ```

3. Start the frontend (it forwards `/api` to the backend):

   ```bash
   cd frontend
   npm install
   npm run dev               # http://localhost:5173
   ```

4. Run the API tests (they use the database in `DATABASE_URL`, so use a
   freshly seeded one):

   ```bash
   cd backend
   npm test
   ```

### Sample accounts

All passwords are `password123`.

| Username        | Position    | Can do                                              |
| --------------- | ----------- | --------------------------------------------------- |
| `hk.supervisor` | Supervisor  | Everything, incl. create/assign tasks and schedules |
| `hk.inspector`  | Inspector   | Inspect rooms, plus general housekeeping functions  |
| `hk.liza`, `hk.joy`, `hk.mark` | Housekeeper | Work on their own tasks, requests, lost & found, maintenance |
| `fo.desk`       | Front Office | Is denied at the Housekeeping login                |

## Flowchart to feature map

| Flowchart step | Screen | API |
| -------------- | ------ | --- |
| Housekeeping Staff Log In / Authorized? / Access Denied | Login | `POST /api/auth/login` with `department: HOUSEKEEPING` |
| Housekeeping Dashboard / Select Function | Overview | `GET /dashboard` |
| HK-001 View Room Status | Room Status | `GET /rooms` |
| HK-002 Select Room | Room Status (right panel) | `GET /rooms/:id` |
| HK-003 Update Room Status (logged) | Room Status | `PATCH /rooms/:id/status` |
| Notify Front Office of Room Availability | Room Status, Overview | `GET /notifications` (created automatically on INSPECTED) |
| HK-004 Create / Update Task | Cleaning Tasks | `POST /tasks`, `PATCH /tasks/:id` |
| HK-005 Assign Housekeeper | Cleaning Tasks | `PATCH /tasks/:id` (`staffId`) |
| HK-006 Perform Cleaning / Cleaning Completed? | Cleaning Tasks | `POST /tasks/:id/start`, `POST /tasks/:id/complete` |
| HK-007 Inspect Room / Inspection Passed? | Inspection | `GET /inspections/queue`, `POST /inspections` |
| Mark CLEAN / INSPECTED or Return for Re-cleaning | Inspection | result `PASSED` or `FAILED` |
| HK-008 View Staff Schedule | Schedules | `GET /schedules?date=` |
| HK-009 Create / Update Schedule, Assign Workload / Shift | Schedules | `POST /schedules`, `PATCH /schedules/:id` |
| HK-010 Record Found Item, Store / Label Item | Lost & Found | `POST /lost-found` (label `LF-0001`) |
| HK-011 Search / View Records | Lost & Found | `GET /lost-found?search=` |
| Valid Claim? / HK-012 Release Item | Lost & Found | `POST /lost-found/:id/claims` |
| HK-013 Record Request, Assign / Process | Guest Requests | `POST /guest-requests`, `PATCH /guest-requests/:id` |
| HK-014 Complete Request | Guest Requests | `POST /guest-requests/:id/complete` |
| HK-015 Create Maintenance Request, Set Room OUT OF ORDER | Maintenance | `POST /maintenance` |
| Engineering Completes Repair | Maintenance | `PATCH /maintenance/:id` (`status: REPAIRED`) |
| Update Status / Create Cleaning Task | Maintenance | `POST /maintenance/:id/release` |

All API paths above are under `/api/housekeeping` and need a JWT from a
HOUSEKEEPING (or ADMIN) account.

## Business rules

* **Room status lifecycle.** Housekeeping changes DIRTY → CLEAN → INSPECTED.
  Front Office owns AVAILABLE, RESERVED and OCCUPIED, so Housekeeping cannot
  set those. A room leaves OUT_OF_ORDER only when its maintenance request is
  released. Every change is written to `hk_room_status_logs`.
* **Cleaning tasks** go PENDING → ASSIGNED → IN_PROGRESS → COMPLETED →
  INSPECTED. A failed inspection sets the task to RETURNED and the room back
  to DIRTY; the same housekeeper cleans it again. A room can only have one open
  task at a time.
* **Who can do what.** Only supervisors create and assign tasks and
  schedules. Only inspectors and supervisors record inspections. Only the
  assigned housekeeper (or a supervisor) starts and completes a task.
* **Lost & found.** An item is released only when the claimant's ID is
  verified and their description matches; otherwise the claim is saved as
  REJECTED and the item stays stored.
* **Maintenance.** Reporting can set the room OUT_OF_ORDER. When Engineering
  marks the repair REPAIRED, Housekeeping releases it: the room becomes DIRTY
  and a high-priority POST_REPAIR cleaning task is created.

## Notes for the other HOSIS groups

* Housekeeping tables use the `hk_` prefix so they never clash with other
  departments' tables.
* `06-housekeeping.sql` also creates minimal `users`, `rooms` and `guests`
  tables with `CREATE TABLE IF NOT EXISTS`, because `01-users.sql`,
  `03-guests.sql` and `04-rooms.sql` are still empty. When the owners of those
  files define the real tables (keeping the same column names), ours are
  skipped automatically.
* `backend/src/app.js` mounts each subsystem's router
  (`app.use('/api/<subsystem>', ...)`), so other groups can add theirs next to
  `/api/housekeeping`.
* The sidebar items for other departments are placeholders until their
  modules exist.

## Screenshots

`docs/housekeeping/screenshots/` has screenshots of every screen taken from the
running app with the sample data, plus the main flow
(assign → clean → fail inspection → re-clean → pass → Front Office notified,
item release, and maintenance release).
