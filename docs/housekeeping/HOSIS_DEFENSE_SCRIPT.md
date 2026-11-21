# HOSIS Housekeeping Subsystem Defense Script

**Project:** Hotel Operations and Services Information System (HOSIS) – Housekeeping Subsystem
**Group:** BSIT 3 – Alpha
**Suggested duration:** 16–20 minutes, excluding the live demonstration and questions

Replace bracketed placeholders such as `[Presenter name]` before the defense. The paragraphs under **Say:** are written to be spoken word for word. The **Understand:** notes are study notes; do not read them unless the panel asks for technical details.

---

## Opening before Slide 1

**Say:**

“Good day, respected panel members, our adviser, and everyone present. We are BSIT 3 – Alpha, and today we will present our project titled **Hotel Operations and Services Information System, Housekeeping Subsystem**, or **HOSIS Housekeeping**. Our system manages the operational work of a hotel’s Housekeeping Department, from room turnover and staff assignments to inspections, guest requests, lost-and-found items, maintenance coordination, staff accounts, and activity records.”

“During this presentation, we will explain the operational problem, the scope of our subsystem, how the system works, how the code enforces hotel rules, and how we tested the implementation. Afterward, we will demonstrate the main room turnover workflow.”

---

## Slide 1 – HOSIS Housekeeping Subsystem

**Say:**

“HOSIS means **Hotel Operations and Services Information System**. Our contribution is the Housekeeping subsystem. We designed it as a working web application rather than only a user-interface prototype. It has a React frontend, an Express REST API, a PostgreSQL database, authentication, role-based permissions, and automated integration tests.”

“The main goal is to give Housekeeping one reliable place to see room conditions, assign and monitor work, verify cleaning through inspection, respond to guests, coordinate repairs, and preserve an accountable history of changes.”

**Understand:**

- **Subsystem** means one functional module inside a larger HOSIS platform.
- **Frontend** is the interface the user sees.
- **Backend/API** processes rules and database operations.
- **Database** permanently stores records.
- Calling it a subsystem is important because the repository contains Housekeeping, while Front Office and Engineering are separate HOSIS departments.

---

## Slide 2 – Operational Context

**Say:**

“The problem we addressed is that Housekeeping work depends on information moving correctly between people and departments. A room cannot simply be marked available because someone says it was cleaned. The hotel needs evidence that the room was assigned, cleaned, inspected, and released by the correct department.”

“Without a centralized system, staff can encounter unclear room status, duplicate tasks, missed guest requests, conflicting schedules, incomplete lost-and-found records, and delayed maintenance coordination. These problems affect both hotel operations and the guest experience.”

“Our system converts these activities into controlled workflows. Every important action has a defined user, status, time, and next step.”

**If asked for a concrete example, say:**

“For example, after checkout, Front Office changes the room from OCCUPIED to DIRTY and the system creates a checkout cleaning task. A housekeeper completes the task, an inspector verifies it, and only then can Front Office release the room as AVAILABLE.”

---

## Slide 3 – Project Objectives

**Say:**

“Our first objective was to digitize the complete Housekeeping workflow defined by our department flowchart and supporting documentation.”

“Our second objective was to protect the accuracy of hotel operations through role-based access and business rules. The system does not rely only on hiding buttons. The backend checks every protected action.”

“Our third objective was to keep a traceable record. Room status changes, cleaning tasks, inspections, inventory movements, requests, claims, maintenance work, and account actions are stored in the database.”

“Our final objective was integration readiness. All Housekeeping tables use the `hk_` prefix, and the API is mounted under `/api/housekeeping`, so the subsystem can be added beside other HOSIS modules without naming conflicts.”

**Understand:**

- Hiding a frontend button is only a usability measure. Real security must exist on the server.
- An **audit trail** is a record of who performed an action, what changed, and when it happened.

---

## Slide 4 – Scope and System Users

**Say:**

“The subsystem supports several operational roles.”

“The **Supervisor** has the widest Housekeeping authority. The supervisor can create staff accounts, assign cleaning tasks, prepare schedules, reset staff passwords, manage other employees’ requests, and dispose of unclaimed items.”

“The **Housekeeper** performs assigned cleaning tasks, processes their own guest requests, reports room conditions, records lost items, and submits maintenance concerns.”

“The **Inspector** checks completed rooms. The system applies a four-eyes rule, which means the person who cleaned a room cannot approve the same room.”

“The subsystem also communicates with **Front Office** and **Engineering**. Front Office owns check-in, checkout, and final room availability. Engineering owns repair progress. The ADMIN role can pass Housekeeping authorization checks for system administration.”

“We deliberately did not create a public signup page. Hotel staff accounts are organizational accounts, so a supervisor creates an approved account and gives the employee a one-time temporary password.”

**If asked why there is no public signup, say:**

“A public signup could allow unauthorized people to register as hotel staff or choose a privileged role. Supervisor-created accounts are more suitable because employment and position must already be verified.”

---

## Slide 5 – System Architecture

**Say:**

“The system follows a three-layer web architecture.”

“The first layer is the **React 19 frontend**, built with Vite. React components display the pages and respond to user actions. The shared `request` function sends HTTP requests to the API, attaches the user’s bearer token, converts the response from JSON, and raises a consistent error when the API refuses an action.”

“The second layer is the **Node.js and Express 5 backend**. Express routes receive requests, authenticate the user, validate the input, apply business rules, execute database queries, and return a response.”

“The third layer is **PostgreSQL**. It stores shared records such as users and rooms and the Housekeeping tables prefixed with `hk_`.”

“The frontend never connects directly to the database. It calls endpoints such as `GET /api/housekeeping/rooms` or `POST /api/housekeeping/tasks/:id/complete`. This separation keeps database credentials and business rules on the server.”

### Code explanation for this slide

**Say if the panel asks about the API code:**

“In the frontend, `request(method, path, body)` is our reusable API helper. The `method` tells the server what operation we want, the `path` identifies the resource, and `body` contains submitted data. It adds `Authorization: Bearer` followed by the JWT when a session exists. This prevents us from repeating the same fetch and error-handling code on every page.”

“In the Express application, `app.use('/api/housekeeping', housekeepingRoutes)` mounts the complete subsystem under one URL prefix. Each feature has its own router file, such as `tasks.routes.js`, `inspections.routes.js`, and `maintenance.routes.js`. This is a modular monolith: one backend application, but separated into feature modules.”

### HTTP methods you should know

- **GET** retrieves information without intentionally changing it.
- **POST** creates a record or performs a workflow action such as starting a task.
- **PATCH** updates selected fields of an existing record.
- **PUT** replaces or upserts a resource, such as a profile photo.
- **DELETE** removes a resource, such as the user’s own profile photo.

---

## Slide 6 – Database Design

**Say:**

“The Housekeeping schema contains **16 `hk_` tables**. We separated the data according to responsibility instead of placing everything in one large table.”

“For room operations, we have status logs, cleaning tasks, and inspections. For staff operations, we have schedules, password requests, mandatory password changes, login failures, and profile photos. For guest and hotel services, we have guest requests, lost-and-found items, item claims, lost-item photos, maintenance requests, Front Office notifications, inventory items, and inventory movements.”

“The prefix `hk_` means Housekeeping. It prevents table-name conflicts when our schema is merged into the class-wide HOSIS database.”

“We also use foreign keys so records point to valid users, rooms, tasks, and items. Constraints and backend validation protect the database from invalid statuses and incomplete data.”

### Code and SQL explanation

**Say if asked about `$1`, `$2`, and similar symbols:**

“Those are PostgreSQL parameter placeholders. We send the SQL statement separately from the values. For example, `WHERE user_id = $1` receives the user ID through an array. Parameterized queries reduce SQL-injection risk because user input is treated as data rather than executable SQL.”

**Say if asked why inventory has both item and movement tables:**

“`hk_inventory_items` stores the current quantity and reorder level. `hk_inventory_movements` stores every IN, OUT, or ADJUST action with the balance afterward. The item table answers how much stock exists now, while the movement table explains how it reached that amount.”

---

## Slide 7 – Room Status Lifecycle

**Say:**

“The room lifecycle is the central workflow of the subsystem.”

“When a guest checks out, Front Office changes the room from OCCUPIED to DIRTY. The system creates a CHECKOUT cleaning task. A supervisor assigns the task. When the assigned housekeeper starts, the task becomes IN_PROGRESS. When cleaning is completed, the task becomes COMPLETED and the room becomes CLEAN.”

“The room then enters the inspection queue. If it passes, the task becomes INSPECTED, the room becomes INSPECTED, and Front Office receives a room-ready notification. Front Office performs the final release from INSPECTED to AVAILABLE.”

“If inspection fails, the task becomes RETURNED and the room goes back to DIRTY. The same task returns to the housekeeper for correction, preserving its history.”

“The backend function `changeRoomStatus` controls these changes. It locks the room record, checks whether the transition is permitted, updates the status, and writes a log entry. The `MANUAL_TRANSITIONS` object prevents users from bypassing the workflow. For example, a DIRTY room cannot be manually changed to CLEAN.”

### Meaning of the main room-status code

**Say:**

“`lockRoom` uses `SELECT ... FOR UPDATE`. This temporarily locks that room row inside the transaction so two requests cannot safely change the same room at exactly the same time.”

“`changeRoomStatus` accepts values such as `roomId`, `newStatus`, `staffId`, and `remarks`. The `manual` flag distinguishes a user’s manual change from a controlled workflow action. Cleaning completion and inspection use `manual: false` because their routes already verified the required process.”

“Every successful change is inserted into `hk_room_status_logs`, which gives us the audit trail.”

---

## Slide 8 – Cleaning Tasks and Inspection

**Say:**

“The cleaning task module controls assignment and execution.”

“Only a supervisor can create or assign a cleaning task because the route uses `requirePosition('SUPERVISOR')`. The assigned housekeeper, or a supervisor when necessary, can start and complete the work. The helper function `canWorkOn` checks that relationship.”

“When the start endpoint runs, it accepts only tasks in ASSIGNED or RETURNED status and changes them to IN_PROGRESS. When the complete endpoint runs, it accepts only an IN_PROGRESS task. It records the completion time and normally changes the room to CLEAN.”

“Inspection is a separate route available to inspectors and supervisors. It only accepts a COMPLETED task. It rejects self-inspection by comparing the task’s `staff_id` with the logged-in user’s ID.”

“A PASSED result closes the task as INSPECTED and changes the room to INSPECTED. A FAILED result requires remarks, returns the task, and changes the room to DIRTY. Requiring remarks tells the housekeeper exactly what must be corrected.”

### Why `db.withTransaction` matters

**Say if asked:**

“A transaction groups related database commands as one unit. During inspection, we insert the inspection, update the task, change the room, and create any required notification. If one step fails, the transaction rolls back the entire operation. This prevents partial data, such as a passed inspection record while the room still says DIRTY.”

### Special case: occupied-room cleaning

**Say if asked about stayover tasks:**

“For STAYOVER or touch-up work in an occupied or reserved room, the room remains under Front Office control. Cleaning and inspection are recorded, but the system does not mark the room available for sale. The `FRONT_OFFICE_HELD` check protects that rule.”

---

## Slide 9 – Schedules, Guest Requests, and Inventory

**Say:**

“The scheduling module allows the supervisor to assign shifts and work areas. The backend prevents past schedules and overlapping shifts. It also checks overnight shifts, so a shift ending the next morning cannot overlap another shift on that morning.”

“The guest-request module records services such as towels or amenities for a room. A housekeeper can take an unassigned request for themselves and complete their own request. Supervisors and inspectors may assign or manage requests for other staff. This prevents one employee from taking over or closing someone else’s work without authority.”

“If a request needs stock, it links to an inventory item and quantity. The approve-stock action locks both the request and inventory record, verifies that enough stock remains, subtracts the quantity, writes an OUT movement, and records the approval time.”

“The system rejects a second approval, so the same request cannot deduct stock twice. It also rejects any movement that would make the balance negative.”

### Meaning of the inventory code

**Say:**

“The calculation `balance = item.quantity - current.quantity_requested` determines the new stock. The database then updates the item and inserts a movement with `balance_after`. Both commands run in one transaction. The `stock_approved_at` field acts as an idempotency guard because once it has a value, the system refuses another deduction.”

**If asked what idempotency means, say:**

“In this context, it means repeating the approval request will not repeat the stock deduction.”

---

## Slide 10 – Lost and Found and Maintenance

**Say:**

“The Lost and Found feature records the item description, where it was discovered, where it is stored, and its status. Each item receives a label such as `LF-0001`. Staff can attach up to three JPEG, PNG, or WebP photos, and the interface can generate a printable QR storage label.”

“A claim is approved only when the claimant’s description matches and their identification is verified. The system stores the ID type and only the last four characters of the ID number. A rejected claim remains recorded while the item stays stored. Only a supervisor can dispose of an item, and a reason is mandatory.”

“For maintenance, Housekeeping records the issue and sends it to Engineering. If appropriate, the room becomes OUT_OF_ORDER so it cannot continue through the cleaning and inspection workflow.”

“Only Engineering can mark the repair as REPAIRED. Housekeeping then releases the maintenance request. The room changes from OUT_OF_ORDER to DIRTY and receives a high-priority POST_REPAIR cleaning task. If an open cleaning task already exists, the system reopens it instead of creating a duplicate.”

### Why Engineering owns the repair status

**Say if asked:**

“This is separation of duties. Housekeeping can report and prioritize the issue, but the department that performs the repair confirms its completion. The maintenance PATCH route explicitly refuses a `status` field from Housekeeping.”

---

## Slide 11 – Accounts and Security

**Say:**

“Our authentication uses JSON Web Tokens, or JWT, and bcrypt password hashing.”

“During login, the server finds the account by username or email and uses `bcrypt.compare` to check the submitted password against the stored hash. A password hash is a one-way representation, so the database does not store the original password.”

“After successful login, `jwt.sign` creates a token containing the user ID, role, position, and a password-version fingerprint. Protected requests send this token in the Authorization header.”

“The `authenticate` middleware verifies the token and reloads the account from the database on every request. This means a deactivated employee, changed role, or changed password takes effect immediately instead of waiting for the token to expire.”

“The `authorize` and `requirePosition` middleware functions enforce permissions. `authorize` checks a broad HOSIS role, while `requirePosition` checks a Housekeeping position such as SUPERVISOR or INSPECTOR.”

“After five incorrect passwords for the same account and address, login is locked for 15 minutes. Failures are stored in `hk_login_failures`, so restarting the server does not erase the lockout.”

### Staff account creation

**Say:**

“The supervisor creates a staff account through `POST /api/housekeeping/password-resets/staff`. The server validates the name, username, email, and position, generates a temporary password such as `Hk-7Q4M-2XPA`, hashes it with bcrypt, creates the user, and adds a row to `hk_password_must_change`.”

“The temporary password is returned once for the supervisor to give to the employee. It is not stored as plain text. When the employee signs in, `requirePasswordChanged` blocks the other Housekeeping routes until the employee chooses a new password.”

### Profile and profile-photo functions

**Say:**

“Each authenticated user can update their first name, last name, and email through `PATCH /api/auth/account`. Protected employment fields such as username, department, position, and active status remain administrator-owned.”

“For identification, each user can add or replace their own photo through `PUT /api/auth/account/photo`, retrieve it through GET, and remove it through DELETE. The upload accepts only JPEG, PNG, or WebP and limits the file to two megabytes.”

“The SQL uses `INSERT ... ON CONFLICT (user_id) DO UPDATE`. This means the first upload creates the photo row, while a later upload updates the same user’s row rather than creating duplicates.”

---

## Slide 12 – Interface and Mobile Layout

**Say:**

“The interface adapts to the logged-in user. Supervisors see management pages and wider operational statistics, while housekeepers receive a focused dashboard for their own tasks, guest requests, schedule, and notifications.”

“The sidebar organizes the workflow by function: Dashboard, Room Status, Cleaning Tasks, Inspection, Schedules, Lost and Found, Guest Requests, Maintenance, Staff Accounts, My Record, and Account.”

“The application uses shared React components for layout, modals, icons, calendars, date pickers, charts, notifications, and export controls. This gives the pages consistent behavior and reduces duplicate code.”

“Lists quietly refresh every 30 seconds while the browser tab is visible. This allows staff viewing the same operational page to see recent changes without manually reloading continuously.”

“The Account page allows users to maintain their profile and photo, while still protecting employment-controlled fields.”

### React explanation if asked

**Say:**

“A React component is a reusable JavaScript function that returns part of the interface. State stores changing values, and effects handle operations such as loading data. Instead of reloading the whole website after every action, React updates the affected part of the page.”

---

## Slide 13 – Verification and Testing

**Say:**

“We verified the subsystem with **35 backend integration tests**. These tests call the API and check both successful workflows and rejected invalid actions.”

“The tests cover login, authorization, room transitions, task assignment, task execution, inspection, schedules, guest requests, lost and found, photos, maintenance, inventory, Front Office coordination, staff-account creation, temporary passwords, profile editing, profile photos, lockout, session invalidation, and input validation.”

“Examples of negative tests include preventing a DIRTY room from being marked CLEAN manually, preventing self-inspection, rejecting overlapping schedules, refusing insufficient inventory, denying non-supervisors from creating accounts, and ending a session immediately after account deactivation.”

“We also verified the frontend production build and lint checks. Testing is important because the system’s value depends not only on what valid users can do, but also on what invalid or unauthorized actions the system refuses.”

### Explain one test if the panel asks

**Say:**

“For the self-inspection test, the test creates a task, assigns it to a supervisor, starts and completes it, then attempts to let the same supervisor inspect it. The expected response is HTTP 409. A different inspector then submits PASSED and receives a successful 201 response. This proves the four-eyes rule is enforced by the backend.”

### HTTP response codes you should know

- **200 OK:** a request succeeded.
- **201 Created:** the server created a new record.
- **204 No Content:** deletion succeeded without a response body.
- **400 Bad Request:** input is missing or invalid.
- **401 Unauthorized:** the user is not logged in or the session is invalid.
- **403 Forbidden:** the user is logged in but lacks permission.
- **404 Not Found:** the requested record does not exist.
- **409 Conflict:** the request conflicts with the current workflow state.
- **429 Too Many Requests:** login is temporarily locked after repeated failures.

---

## Slide 14 – Current Limitations and Integration Plan

**Say:**

“We want to state the project boundaries honestly.”

“First, this repository contains the Housekeeping subsystem, not the complete class-wide HOSIS platform. The shared users, rooms, and guests tables in standalone mode are only provided so this subsystem can run independently.”

“Second, the repository includes temporary Front Office stand-in endpoints so we can demonstrate check-in, checkout, and room release. In the combined system, the real Front Office module should own those operations.”

“Third, Engineering API integration exists for viewing requests and updating repair status, but this repository does not contain the complete Engineering user interface.”

“Fourth, forgot-password handling uses supervisor approval and an in-person temporary password because the project does not include an email service.”

“Finally, inventory is integrated into guest requests and exposed through the API, but there is no separate inventory page because the supplied Housekeeping interface design did not include one.”

“Our integration plan is to mount this router beside the other subsystem routers, apply only the `hk_` database schema in the combined database, and replace the stand-in endpoints with the final Front Office and Engineering modules.”

**Important defense technique:** Do not apologize for these boundaries. Explain them as deliberate scope and integration decisions.

---

## Slide 15 – Data Flow Diagram: Context Level

**Say:**

“This context-level Data Flow Diagram shows the Housekeeping subsystem as one central process and identifies the external actors that exchange information with it.”

“On the left, Housekeeping staff send task updates and receive assignments. Supervisors and inspectors send schedules and inspection results and receive the inspection queue. On the right, Front Office sends checkout and guest information and receives room-readiness updates. Engineering receives maintenance requests and returns repair status.”

“The important point is that this diagram shows the boundary of our subsystem. Housekeeping does not replace Front Office or Engineering. It exchanges only the operational data needed for room turnover and service coordination.”

**Understand:**

- A context-level DFD treats the entire subsystem as one process.
- The rectangles around the system are external entities or actors.
- The labeled arrows represent data entering or leaving the subsystem; they do not represent screen navigation.
- The diagram supports our integration design because each department keeps its own responsibilities.

### If asked how the DFD appears in the code

**Say:**

“The data flows are implemented through API requests and database records. For example, Front Office checkout creates a room-status change and cleaning task, while a passed inspection creates a room-ready notification. Engineering receives maintenance records and returns an updated repair status through protected endpoints.”

---

## Slide 16 – Detailed Data Flow Diagrams

**Say:**

“This slide expands the context diagram into four important internal processes.”

“The first diagram is Login and Authorization. The user submits a username or email and password. The backend reads the staff and authentication records, validates the credentials and role, and returns either an authenticated session or an error.”

“The second diagram is Room Status and Cleaning Tasks. Housekeeping staff submit task actions and status updates. The process reads and writes the ROOM, ROOM_STATUS_LOG, and CLEANING_TASK records, then returns assignments and the current room condition.”

“The third diagram is Inspection and Re-cleaning. An inspector submits PASSED or FAILED. The process records the inspection and updates the task and room. A failed result returns the same task for correction, while a passed result moves the room toward Front Office release.”

“The fourth diagram covers Lost and Found and Guest Requests. Authorized staff record service details, and the process stores or retrieves the corresponding request, item, and claim records.”

“Together, these diagrams show that the interface does not directly manipulate the database. Every data change passes through a controlled backend process.”

### If asked about the difference between a DFD and a flowchart

**Say:**

“A DFD emphasizes what information moves between actors, processes, and data stores. A flowchart emphasizes the order of actions and decisions. We use both because they explain different aspects of the same system.”

---

## Slide 17 – Entity-Relationship Diagram

**Say:**

“The Entity-Relationship Diagram presents the core operational data structure of the subsystem.”

“The three central shared entities are STAFF, ROOM, and GUEST. We reference these existing HOSIS entities instead of duplicating them. The Housekeeping-owned entities include ROOM_STATUS_LOG, CLEANING_TASK, INSPECTION, SCHEDULE, GUEST_REQUEST, LOST_FOUND_ITEM, ITEM_CLAIM, and MAINTENANCE_REQUEST.”

“The primary key, marked PK, uniquely identifies a record. A foreign key, marked FK, connects that record to another table. For example, CLEANING_TASK contains room_id and staff_id, connecting one cleaning assignment to a valid room and assigned employee.”

“A room can have many status logs, cleaning tasks, guest requests, maintenance requests, and lost items over time. A cleaning task can have more than one inspection because a failed room may be corrected and inspected again. A lost item may receive a claim, and a guest may create several service requests.”

“These relationships prevent disconnected data. The database cannot accept an inspection for a cleaning task that does not exist because the foreign-key relationship protects referential integrity.”

**Understand:**

- PK means primary key and uniquely identifies a row.
- FK means foreign key and connects related tables.
- One-to-many means one parent record may be associated with several child records.
- The ERD explains data structure, while workflow rules are additionally enforced by backend code and database constraints.
- Supporting security, inventory, and photo tables exist in the implemented schema even though this diagram focuses on the main operational entities.

---

## Slide 18 – Housekeeping Department Flowchart

**Say:**

“This flowchart shows the complete operational sequence that guided the implementation.”

“The process starts when Housekeeping staff log in. The authorization decision either denies access or opens the correct dashboard. The user then selects a function: managing room status, cleaning tasks, schedules, lost and found, guest requests, or maintenance.”

“The main room-turnover branch moves from a room-status update to task creation, staff assignment, cleaning, and inspection. If cleaning is incomplete, the task remains in progress. If inspection fails, the task returns for re-cleaning. If inspection passes, the room is marked inspected and Front Office is notified.”

“The other branches preserve the same controlled pattern. Schedules are created for verified staff. Lost items are recorded, labeled, stored, and released only after a valid claim. Guest requests are assigned and completed. Maintenance issues place the room out of order when necessary and return it to cleaning after repair.”

“The flowchart was not treated as decoration. We converted its process steps and decision points into API routes, status values, permission checks, transactions, and database records.”

### Flowchart symbols to explain if asked

- The rounded terminal represents START or END.
- A rectangle represents a process or action.
- A diamond represents a decision with different outcomes.
- A parallelogram represents user input or system output.
- Arrows show the direction of the operational sequence.

### If asked how the flowchart becomes code

**Say:**

“Each major branch maps to a backend module and database tables. Each decision becomes validation. For example, the Inspection Passed decision is implemented by checking the inspection result. PASSED updates the task and room to INSPECTED, while FAILED requires remarks and returns the task and room for correction.”

---

## Slide 19 – Development Gantt Chart

**Say:**

“The Gantt chart shows how we organized the subsystem development across six working weeks.”

“Weeks one and two focused on scope and requirements. During weeks two and three, we prepared the ERD, data dictionary, DFDs, flowchart, and architecture. UI wireframes were developed during weeks three and four.”

“Frontend and API development and database implementation were concentrated in weeks four and five. Integration testing continued through weeks five and six. Documentation and presentation preparation overlapped the later development stages so they could be updated as the implementation was verified.”

“Some activities overlap because the project was iterative. For example, database design informed API development, while testing revealed cases that required revisions to validation and documentation.”

“The Gantt chart helped us track dependencies, divide work, and make sure analysis, development, testing, and documentation were all completed rather than leaving verification until the final day.”

### If asked why a Gantt chart is useful

**Say:**

“A Gantt chart shows activities against time. It helps the team identify which work can happen in parallel, which tasks depend on earlier outputs, and whether progress is following the project schedule.”

---

## Slide 20 – Demonstration and Closing

**Say before the live demonstration:**

“For the demonstration, we will show the main operational cycle rather than opening every page.”

“First, we will sign in as a supervisor and show room status and task assignment. Second, we will sign in as the assigned housekeeper to start and complete the task. Third, we will use an inspector account to record the inspection. We will show both the failed path, which returns the room for re-cleaning, and the passed path, which notifies Front Office. Finally, we will show account management and the user’s profile-photo option.”

**Say after the demonstration:**

“To conclude, HOSIS Housekeeping converts the department flowchart into a controlled and traceable working system. It coordinates room turnover, cleaning, inspection, schedules, guest services, lost items, maintenance, inventory, and staff access while enforcing the responsibilities of each role.”

“The main contribution is not only the number of pages. It is the set of connected business rules that keeps room status, task status, permissions, and department responsibilities consistent.”

“Thank you. We are now ready for your questions.”

---

# Live Demonstration Script

Use this if the panel asks for a working-system demonstration.

## Demo Step 1 – Supervisor login

**Say:**

“I am signing in with the Housekeeping Supervisor account. The login request includes the HOUSEKEEPING department, so accounts from other departments cannot use this login page.”

“The dashboard summarizes dirty rooms, rooms out of order, open tasks, rooms awaiting inspection, guest requests, stored lost items, open maintenance issues, and low stock.”

## Demo Step 2 – Create or assign a task

**Say:**

“On Cleaning Tasks, the supervisor selects a room, task type, priority, due time, and housekeeper. The backend checks that the room exists, is not out of order, and does not already have another open cleaning task.”

## Demo Step 3 – Housekeeper starts and completes work

**Say:**

“After switching to the assigned housekeeper, the task appears on the staff dashboard. Start changes the task to IN_PROGRESS. Complete records the completion time and changes a turnover room to CLEAN. The room is not available yet because it still requires an independent inspection.”

## Demo Step 4 – Failed inspection

**Say:**

“The inspector submits FAILED and enters the reason. The system changes the task to RETURNED and the room to DIRTY. The reason tells the housekeeper what must be corrected.”

## Demo Step 5 – Re-clean and pass

**Say:**

“The assigned housekeeper starts the returned task, completes it again, and the inspector submits PASSED. The task becomes INSPECTED, the room becomes INSPECTED, and Front Office receives a room-ready notification.”

## Demo Step 6 – Front Office release

**Say:**

“Front Office owns the final commercial room status. Its release action changes the room from INSPECTED to AVAILABLE. This division prevents Housekeeping from placing a room on sale by itself.”

## Demo Step 7 – Staff account and profile

**Say:**

“The supervisor can create a verified staff account and receives a one-time temporary password. The new user must change it before accessing the operational pages.”

“On the Account page, the user can update their name, email, and profile photo. The photo helps staff identify one another, while position and employment status remain controlled by management.”

---

# Technical Code Cheat Sheet

## `request(method, path, body)`

**Meaning:** Shared frontend function for calling the backend.
**Use:** Adds JSON headers, attaches the JWT, sends the body, parses the response, and handles errors consistently.

## `authenticate(req, res, next)`

**Meaning:** Express middleware that proves the request has a valid session.
**Use:** Verifies the JWT, reloads the account, rejects inactive users, and rejects tokens created before a password change.

## `authorize(...roles)`

**Meaning:** Creates middleware for broad system roles.
**Use:** Allows HOUSEKEEPING or ADMIN where required.

## `requirePosition(...positions)`

**Meaning:** Creates middleware for positions within Housekeeping.
**Use:** Restricts actions such as task creation to SUPERVISOR or inspection to INSPECTOR and SUPERVISOR.

## `requirePasswordChanged`

**Meaning:** Temporary-password gate.
**Use:** Stops a newly created or reset account from using the system before choosing a private password.

## `passwordVersion(passwordHash)`

**Meaning:** Creates a short fingerprint of the current stored password hash.
**Use:** Places the fingerprint in the JWT so old tokens stop working after a password change.

## `temporaryPassword()`

**Meaning:** Generates a readable random password using cryptographic random bytes.
**Use:** Creates the one-time password provided by the supervisor. Similar characters such as zero and O are excluded to reduce confusion.

## `changeRoomStatus(...)`

**Meaning:** Central service for valid room-state changes.
**Use:** Locks the room, validates the transition, updates it, writes a status log, and creates a Front Office notice when appropriate.

## `lockRoom(client, roomId)`

**Meaning:** Reads a room with a database row lock.
**Use:** Prevents two concurrent workflow actions from changing the same room inconsistently.

## `canWorkOn(user, task)`

**Meaning:** Checks whether the current user owns the task or has supervisor authority.
**Use:** Protects task start and completion.

## `db.withTransaction(async client => ...)`

**Meaning:** Executes related SQL commands atomically.
**Use:** Either all commands succeed or all are rolled back.

## `INSERT ... ON CONFLICT ... DO UPDATE`

**Meaning:** PostgreSQL upsert.
**Use:** Adds the first profile photo and replaces the same user’s photo on later uploads.

## `SELECT ... FOR UPDATE`

**Meaning:** Reads and locks selected database rows until the transaction finishes.
**Use:** Protects room status, tasks, requests, and stock from conflicting simultaneous changes.

---

# Likely Panel Questions and Strong Answers

## 1. What makes your system different from a basic CRUD application?

“CRUD operations exist, but the main value is the connected workflow. A room cannot jump freely between statuses. Task completion, inspection, maintenance, stock approval, and department handoffs each enforce rules and update several related records atomically.”

## 2. Why did you use React?

“React supports reusable components and state-based updates. It lets operational pages update specific interface sections after API responses without reloading the full website. Shared layout, modal, calendar, notification, and export components also reduce duplication.”

## 3. Why did you use Express?

“Express provides a clear routing and middleware model for a REST API. We use middleware for authentication and permissions and separate router files by Housekeeping feature.”

## 4. Why PostgreSQL?

“The project contains strongly related data such as rooms, users, tasks, inspections, and requests. PostgreSQL provides foreign keys, constraints, transactions, row locking, and parameterized queries, which support data consistency.”

## 5. How do you prevent SQL injection?

“We use parameterized queries. User values are passed separately through placeholders such as `$1` and `$2`, so they are treated as data rather than SQL commands. We also validate types, allowed values, and maximum lengths before queries.”

## 6. How do you protect passwords?

“Passwords are hashed using bcrypt with a cost factor of 10. Login uses `bcrypt.compare`. We never need to decrypt the password because bcrypt comparison verifies it against the hash.”

## 7. What is JWT and why did you use it?

“JWT is a signed token that carries session claims. The client sends it with protected requests. The server verifies the signature and then reloads the account to make deactivation, role changes, and password changes effective immediately.”

## 8. Where is the JWT stored?

“If Remember Me is selected, it is stored in localStorage. Otherwise, it is stored in sessionStorage for the current browser tab. The API helper retrieves it and places it in the Authorization header.”

## 9. Why reload the account when the JWT already has the role?

“A JWT claim represents the account when the token was created. Reloading the account prevents an inactive employee or an outdated role from remaining effective until token expiration.”

## 10. What is the purpose of the password-version fingerprint?

“The fingerprint represents the current password hash. If the password changes, the fingerprint in an older token no longer matches, so the server rejects the old session immediately.”

## 11. Why can’t a housekeeper mark a DIRTY room CLEAN manually?

“CLEAN must prove that the cleaning-task workflow was completed. Allowing a manual change would bypass assignment, timestamps, responsibility, and inspection readiness.”

## 12. Why can’t Housekeeping mark a room AVAILABLE?

“AVAILABLE means the hotel can sell or assign the room. Front Office owns that commercial status. Housekeeping can certify the room as INSPECTED, then Front Office releases it.”

## 13. How do you prevent duplicate cleaning tasks?

“The create-task workflow checks for another task on the room whose status is not INSPECTED. Maintenance release also reopens an existing open task instead of creating a second task.”

## 14. What happens when an inspection fails?

“The system requires remarks, stores the inspection, changes the task to RETURNED, and changes a turnover room to DIRTY. The assigned housekeeper then re-cleans the same task.”

## 15. Why can’t the cleaner inspect their own room?

“Independent verification reduces bias and mistakes. The backend compares the cleaner’s user ID with the inspector’s ID and returns HTTP 409 if they match.”

## 16. What is a transaction?

“A transaction treats several database commands as one operation. If any command fails, all related changes roll back. We use it when a workflow changes multiple records, such as inspection or stock approval.”

## 17. What problem does `FOR UPDATE` solve?

“It protects against concurrency. For example, two people cannot approve the same stock request at the same moment using the same original quantity.”

## 18. Why did you choose supervisor-created accounts instead of signup with approval?

“Both models could work, but supervisor-created accounts better match hotel employment. The supervisor already knows the verified employee, assigns the correct position, and gives a one-time password. It also reduces fake pending registrations and role-selection risk.”

## 19. Can ordinary users edit their accounts?

“Yes. They can update their first name, last name, email, password, and profile photo. They cannot change protected employment fields such as username, department, position, active status, or role.”

## 20. How are profile photos stored and validated?

“The client sends a base64 data URL. The backend accepts only JPEG, PNG, or WebP, decodes it to binary, limits it to two megabytes, and upserts it into `hk_staff_profile_photos` using the user ID as the unique key.”

## 21. How does the system avoid deducting guest-request stock twice?

“It locks the request, checks `stock_approved_at`, and rejects approval if that field already has a value. The deduction, movement record, and approval timestamp are stored in one transaction.”

## 22. Why is there no separate inventory page?

“The approved Housekeeping interface design includes inventory in the Guest Request details rather than a standalone inventory page. We implemented stock management in that workflow and exposed complete inventory endpoints for future integration.”

## 23. What happens if the server restarts after repeated failed logins?

“The lockout survives because failures are stored in `hk_login_failures` rather than only in server memory.”

## 24. How did you test the system?

“The backend has 35 integration tests that make HTTP requests and verify database-backed behavior. We test valid workflows and negative cases such as permission denial, invalid transitions, concurrency-related conflicts, and input validation.”

## 25. What are the system’s present limitations?

“The repository contains only Housekeeping. Front Office has temporary stand-in endpoints, Engineering lacks a complete interface in this repository, password recovery does not send email, and inventory has API support but no separate page. These boundaries are documented for class-wide integration.”

## 26. If you had more time, what would you improve?

“We would complete integration with the final Front Office and Engineering modules, add production email or another verified recovery channel, move uploaded media to managed object storage for larger deployments, and add end-to-end browser tests alongside the API tests.”

## 27. Is storing images in PostgreSQL scalable?

“It is acceptable for this project because images are limited to two megabytes and the implementation is self-contained. For a larger production deployment, we would store files in managed object storage and keep only secure references and metadata in PostgreSQL.”

## 28. What is the most important function in the system?

“`changeRoomStatus` is one of the most important because many workflows depend on room state. Centralizing status validation and logging prevents different routes from implementing contradictory rules.”

## 29. What part best proves that you understand the hotel process?

“The separation of room ownership across departments. Housekeeping controls cleaning and inspection evidence, Engineering controls repair completion, and Front Office controls occupancy and availability. The code enforces those boundaries instead of treating room status as a simple editable field.”

## 30. What did your group learn?

“We learned that a working information system requires more than screens and database tables. We had to convert the flowchart into status rules, permissions, transactions, validation, audit records, interdepartmental responsibilities, and tests that prove invalid actions are rejected.”

---

# Final Delivery Reminders

1. Do not read every bullet on the slide. Face the panel and use the slide only as a visual guide.
2. Speak in terms of **we designed**, **our backend checks**, and **our tests verify**.
3. When showing code, first explain the business rule, then point to the function that enforces it.
4. Never claim the repository contains a complete Front Office or Engineering module.
5. If you do not remember an exact line, explain the logic: input, validation, database action, and response.
6. During the demo, use prepared sample accounts and test the full sequence before the defense.
7. Keep a backup of the screenshots in case the local database or server cannot start.
