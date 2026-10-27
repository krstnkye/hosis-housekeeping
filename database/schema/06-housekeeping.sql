-- =====================================================================
-- HOSIS - Housekeeping Subsystem Schema
-- Owner: Housekeeping group (BSIT 3 - Alpha)
--
-- Implements the Housekeeping ERD (11 entities) from the subsystem
-- documentation. Tables owned by Housekeeping use the "hk_" prefix so
-- they never collide with tables from other departments.
--
-- STAFF, ROOM and GUEST are shared HOSIS entities. Their real
-- definitions belong in 01-users.sql, 04-rooms.sql and 03-guests.sql.
-- Until those files are filled in, the minimal versions below let the
-- Housekeeping module run on its own. They use IF NOT EXISTS, so when
-- the shared files create the tables first these are skipped.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Shared tables (minimal, see note above)
-- ---------------------------------------------------------------------

-- STAFF: HOSIS user accounts. Housekeeping staff have role HOUSEKEEPING
-- and a position of HOUSEKEEPER, INSPECTOR or SUPERVISOR.
CREATE TABLE IF NOT EXISTS users (
    user_id           SERIAL PRIMARY KEY,
    first_name        VARCHAR(50)  NOT NULL,
    last_name         VARCHAR(50)  NOT NULL,
    username          VARCHAR(50)  NOT NULL UNIQUE,
    password_hash     VARCHAR(255) NOT NULL,
    role              VARCHAR(30)  NOT NULL
        CHECK (role IN ('ADMIN', 'FRONT_OFFICE', 'HOUSEKEEPING', 'HR',
                        'FINANCE', 'SALES_MARKETING', 'ENGINEERING')),
    position          VARCHAR(30),
    employment_status VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ROOM: one central rooms table shared by every department.
CREATE TABLE IF NOT EXISTS rooms (
    room_id      SERIAL PRIMARY KEY,
    room_number  VARCHAR(10) NOT NULL UNIQUE,
    room_type    VARCHAR(30) NOT NULL,
    floor_number INT         NOT NULL,
    room_status  VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (room_status IN ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'DIRTY',
                               'CLEAN', 'INSPECTED', 'OUT_OF_ORDER')),
    updated_at   TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- GUEST: only the fields Housekeeping needs (name and contact).
CREATE TABLE IF NOT EXISTS guests (
    guest_id       SERIAL PRIMARY KEY,
    first_name     VARCHAR(50) NOT NULL,
    last_name      VARCHAR(50) NOT NULL,
    contact_number VARCHAR(20)
);

-- ---------------------------------------------------------------------
-- Housekeeping tables
-- ---------------------------------------------------------------------

-- ROOM_STATUS_LOG: every room status change, who made it and when (HK-003).
CREATE TABLE IF NOT EXISTS hk_room_status_logs (
    log_id          SERIAL PRIMARY KEY,
    room_id         INT         NOT NULL REFERENCES rooms(room_id),
    staff_id        INT         REFERENCES users(user_id),
    previous_status VARCHAR(20) NOT NULL,
    new_status      VARCHAR(20) NOT NULL,
    remarks         VARCHAR(255),
    changed_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- CLEANING_TASK: a cleaning assignment for a room (HK-004 to HK-006).
CREATE TABLE IF NOT EXISTS hk_cleaning_tasks (
    task_id         SERIAL PRIMARY KEY,
    room_id         INT         NOT NULL REFERENCES rooms(room_id),
    staff_id        INT         REFERENCES users(user_id),
    task_type       VARCHAR(30) NOT NULL
        CHECK (task_type IN ('CHECKOUT', 'STAYOVER', 'DEEP_CLEAN', 'TOUCH_UP', 'POST_REPAIR')),
    priority        VARCHAR(10) NOT NULL DEFAULT 'NORMAL'
        CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    task_status     VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (task_status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED',
                               'INSPECTED', 'RETURNED')),
    notes           VARCHAR(255),
    assigned_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
    due_time        TIME,
    start_time      TIMESTAMP,
    completion_time TIMESTAMP,
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- INSPECTION: result of inspecting a cleaning task. A task can be
-- inspected again after it is returned for re-cleaning (HK-007).
CREATE TABLE IF NOT EXISTS hk_inspections (
    inspection_id     SERIAL PRIMARY KEY,
    task_id           INT         NOT NULL REFERENCES hk_cleaning_tasks(task_id),
    inspected_by      INT         NOT NULL REFERENCES users(user_id),
    inspection_result VARCHAR(10) NOT NULL CHECK (inspection_result IN ('PASSED', 'FAILED')),
    checklist         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    remarks           VARCHAR(255),
    inspected_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- SCHEDULE: shift and work area entries for staff (HK-008, HK-009).
CREATE TABLE IF NOT EXISTS hk_schedules (
    schedule_id   SERIAL PRIMARY KEY,
    staff_id      INT         NOT NULL REFERENCES users(user_id),
    shift_date    DATE        NOT NULL,
    shift         VARCHAR(20) NOT NULL CHECK (shift IN ('MORNING', 'AFTERNOON', 'NIGHT')),
    start_time    TIME        NOT NULL,
    end_time      TIME        NOT NULL,
    assigned_area VARCHAR(100) NOT NULL,
    notes         VARCHAR(255),
    UNIQUE (staff_id, shift_date, shift)
);

-- GUEST_REQUEST: housekeeping requests from guests (HK-013, HK-014).
CREATE TABLE IF NOT EXISTS hk_guest_requests (
    request_id       SERIAL PRIMARY KEY,
    guest_id         INT          REFERENCES guests(guest_id),
    room_id          INT          NOT NULL REFERENCES rooms(room_id),
    staff_id         INT          REFERENCES users(user_id),
    request_type     VARCHAR(30)  NOT NULL
        CHECK (request_type IN ('TOWELS', 'AMENITIES', 'EXTRA_BED', 'CLEANING', 'LAUNDRY', 'OTHER')),
    priority         VARCHAR(10)  NOT NULL DEFAULT 'NORMAL'
        CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    request_details  VARCHAR(255) NOT NULL,
    request_status   VARCHAR(20)  NOT NULL DEFAULT 'OPEN'
        CHECK (request_status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED')),
    completion_notes VARCHAR(255),
    requested_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMP
);

-- LOST_FOUND_ITEM: items found in rooms, stored under a label (HK-010, HK-011).
CREATE TABLE IF NOT EXISTS hk_lost_found_items (
    item_id          SERIAL PRIMARY KEY,
    room_id          INT          REFERENCES rooms(room_id),
    found_by         INT          NOT NULL REFERENCES users(user_id),
    item_description VARCHAR(255) NOT NULL,
    found_location   VARCHAR(100) NOT NULL,
    storage_label    VARCHAR(30)  NOT NULL UNIQUE,
    storage_location VARCHAR(100) NOT NULL,
    item_status      VARCHAR(20)  NOT NULL DEFAULT 'STORED'
        CHECK (item_status IN ('STORED', 'RELEASED', 'DISPOSED')),
    found_at         TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ITEM_CLAIM: claims on found items. An item is released only for a
-- VALID claim; rejected claims stay on record (HK-012).
CREATE TABLE IF NOT EXISTS hk_item_claims (
    claim_id           SERIAL PRIMARY KEY,
    item_id            INT          NOT NULL REFERENCES hk_lost_found_items(item_id),
    guest_id           INT          REFERENCES guests(guest_id),
    claimant_name      VARCHAR(100) NOT NULL,
    claimant_contact   VARCHAR(100) NOT NULL,
    id_verified        BOOLEAN      NOT NULL DEFAULT FALSE,
    description_match  BOOLEAN      NOT NULL DEFAULT FALSE,
    processed_by       INT          NOT NULL REFERENCES users(user_id),
    claim_status       VARCHAR(10)  NOT NULL CHECK (claim_status IN ('VALID', 'REJECTED')),
    claimed_at         TIMESTAMP    NOT NULL DEFAULT NOW(),
    released_at        TIMESTAMP
);

-- MAINTENANCE_REQUEST: room issues reported to Engineering (HK-015).
CREATE TABLE IF NOT EXISTS hk_maintenance_requests (
    request_id        SERIAL PRIMARY KEY,
    room_id           INT          NOT NULL REFERENCES rooms(room_id),
    reported_by       INT          NOT NULL REFERENCES users(user_id),
    issue_category    VARCHAR(30)  NOT NULL
        CHECK (issue_category IN ('PLUMBING', 'ELECTRICAL', 'AIRCON', 'FURNITURE',
                                  'APPLIANCE', 'OTHER')),
    issue_description VARCHAR(255) NOT NULL,
    priority          VARCHAR(10)  NOT NULL DEFAULT 'NORMAL'
        CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    status            VARCHAR(20)  NOT NULL DEFAULT 'REPORTED'
        CHECK (status IN ('REPORTED', 'IN_PROGRESS', 'REPAIRED', 'CLOSED')),
    room_set_ooo      BOOLEAN      NOT NULL DEFAULT FALSE,
    reported_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    resolved_at       TIMESTAMP
);

-- Front Office notifications raised by Housekeeping, e.g. when a room
-- passes inspection and is ready to be released (flowchart:
-- "Notify Front Office of Room Availability").
CREATE TABLE IF NOT EXISTS hk_front_office_notifications (
    notification_id SERIAL PRIMARY KEY,
    room_id         INT          NOT NULL REFERENCES rooms(room_id),
    message         VARCHAR(255) NOT NULL,
    created_by      INT          REFERENCES users(user_id),
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hk_tasks_status   ON hk_cleaning_tasks (task_status);
CREATE INDEX IF NOT EXISTS idx_hk_tasks_staff    ON hk_cleaning_tasks (staff_id);
CREATE INDEX IF NOT EXISTS idx_hk_logs_room      ON hk_room_status_logs (room_id);
CREATE INDEX IF NOT EXISTS idx_hk_schedules_date ON hk_schedules (shift_date);
CREATE INDEX IF NOT EXISTS idx_hk_requests_state ON hk_guest_requests (request_status);
