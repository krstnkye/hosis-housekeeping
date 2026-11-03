-- =====================================================================
-- HOSIS - minimal shared tables for running Housekeeping STANDALONE only
--
-- Do NOT load this file in the combined HOSIS database. There, the real
-- tables come from 01-users.sql, 03-guests.sql and 04-rooms.sql, which
-- are owned by other groups. These definitions only contain the columns
-- Housekeeping uses, so the module can run and be tested on its own.
--
-- Load order (standalone):
--   1. database/standalone/00-shared-tables.sql
--   2. database/schema/06-housekeeping.sql
--   3. database/seed/06-housekeeping-seed.sql   (demo data)
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
    email             VARCHAR(100) UNIQUE,
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

