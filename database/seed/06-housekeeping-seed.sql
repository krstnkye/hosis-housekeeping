-- =====================================================================
-- HOSIS - Housekeeping sample data (for development, demo and tests ONLY)
--
-- WARNING: this file first EMPTIES every hk_ table, then reloads the demo
-- data, so it can be run again at any time to reset the demo. Never run it
-- on a database that holds real hotel records. The automated tests run it
-- before every test run.
--
-- All accounts use the password: password123
-- Staff can sign in with their email or username.
--   hk.supervisor  Housekeeping supervisor (can assign tasks and schedules),
--                  email maria.santos@grandhorizon.ph
--   hk.inspector   Housekeeping inspector  (can inspect rooms)
--   hk.liza / hk.joy / hk.mark  Housekeepers
--   fo.desk        Front Office account (denied at the Housekeeping login;
--                  used to test the Front Office integration endpoints)
--   eng.tech       Engineering account (used to test the Engineering
--                  maintenance endpoints)
-- Dates are relative to CURRENT_DATE so the demo always looks current.
-- =====================================================================

TRUNCATE hk_inventory_movements, hk_inventory_items, hk_password_must_change,
         hk_password_resets, hk_login_failures, hk_lost_found_photos,
         hk_front_office_notifications, hk_maintenance_requests, hk_item_claims,
         hk_lost_found_items, hk_guest_requests, hk_schedules, hk_inspections,
         hk_cleaning_tasks, hk_room_status_logs
RESTART IDENTITY;

INSERT INTO users (first_name, last_name, username, email, password_hash, role, position) VALUES
    ('Maria', 'Santos',    'hk.supervisor', 'maria.santos@grandhorizon.ph', '$2b$10$UTSyYL.ukW1io4s4jPa4AeYIkmYga4KccIEkw6MnZ/zlUKRUNv4o6', 'HOUSEKEEPING', 'SUPERVISOR'),
    ('Ana',   'Reyes',     'hk.inspector',  'ana.reyes@grandhorizon.ph', '$2b$10$UTSyYL.ukW1io4s4jPa4AeYIkmYga4KccIEkw6MnZ/zlUKRUNv4o6', 'HOUSEKEEPING', 'INSPECTOR'),
    ('Liza',  'Cruz',      'hk.liza',       'liza.cruz@grandhorizon.ph', '$2b$10$UTSyYL.ukW1io4s4jPa4AeYIkmYga4KccIEkw6MnZ/zlUKRUNv4o6', 'HOUSEKEEPING', 'HOUSEKEEPER'),
    ('Joy',   'Dela Cruz', 'hk.joy',        'joy.delacruz@grandhorizon.ph', '$2b$10$UTSyYL.ukW1io4s4jPa4AeYIkmYga4KccIEkw6MnZ/zlUKRUNv4o6', 'HOUSEKEEPING', 'HOUSEKEEPER'),
    ('Mark',  'Tan',       'hk.mark',       'mark.tan@grandhorizon.ph', '$2b$10$UTSyYL.ukW1io4s4jPa4AeYIkmYga4KccIEkw6MnZ/zlUKRUNv4o6', 'HOUSEKEEPING', 'HOUSEKEEPER'),
    ('Paolo', 'Garcia',    'fo.desk',       'paolo.garcia@grandhorizon.ph', '$2b$10$UTSyYL.ukW1io4s4jPa4AeYIkmYga4KccIEkw6MnZ/zlUKRUNv4o6', 'FRONT_OFFICE', NULL),
    ('Rafael', 'Navarro',  'eng.tech',      'rafael.navarro@grandhorizon.ph', '$2b$10$UTSyYL.ukW1io4s4jPa4AeYIkmYga4KccIEkw6MnZ/zlUKRUNv4o6', 'ENGINEERING', 'TECHNICIAN')
ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, employment_status = 'ACTIVE';

INSERT INTO rooms (room_number, room_type, floor_number, room_status) VALUES
    ('101', 'Standard', 1, 'AVAILABLE'),
    ('102', 'Standard', 1, 'OCCUPIED'),
    ('103', 'Standard', 1, 'DIRTY'),
    ('104', 'Standard', 1, 'CLEAN'),
    ('201', 'Deluxe',   2, 'DIRTY'),
    ('202', 'Deluxe',   2, 'OCCUPIED'),
    ('203', 'Deluxe',   2, 'INSPECTED'),
    ('204', 'Deluxe',   2, 'DIRTY'),
    ('205', 'Deluxe',   2, 'CLEAN'),
    ('301', 'Suite',    3, 'OCCUPIED'),
    ('302', 'Suite',    3, 'OUT_OF_ORDER'),
    ('303', 'Suite',    3, 'RESERVED')
ON CONFLICT (room_number) DO UPDATE SET room_status = EXCLUDED.room_status, updated_at = NOW();

INSERT INTO guests (first_name, last_name, contact_number)
SELECT g.first_name, g.last_name, g.contact_number
FROM (VALUES
    ('Carlos', 'Mendoza', '0917-555-0101'),
    ('Grace',  'Lim',     '0918-555-0202'),
    ('Ramon',  'Bautista','0919-555-0303')
) AS g(first_name, last_name, contact_number)
WHERE NOT EXISTS (
    SELECT 1 FROM guests x WHERE x.first_name = g.first_name AND x.last_name = g.last_name
);

-- Cleaning tasks in different stages of the flowchart.
INSERT INTO hk_cleaning_tasks (room_id, staff_id, task_type, priority, task_status, notes, due_time, start_time, completion_time)
SELECT r.room_id, u.user_id, t.task_type, t.priority, t.task_status, t.notes, t.due_time::time,
       CASE WHEN t.task_status IN ('IN_PROGRESS', 'COMPLETED') THEN NOW() - INTERVAL '50 minutes' END,
       CASE WHEN t.task_status = 'COMPLETED' THEN NOW() - INTERVAL '10 minutes' END
FROM (VALUES
    ('201', 'hk.liza', 'CHECKOUT',   'HIGH',   'IN_PROGRESS', 'Guest checked out early, VIP arrival at 2 PM', '12:00'),
    ('103', 'hk.joy',  'CHECKOUT',   'NORMAL', 'ASSIGNED',    NULL,                                           '13:00'),
    ('204', NULL,      'CHECKOUT',   'NORMAL', 'PENDING',     NULL,                                           '15:00'),
    ('104', 'hk.mark', 'STAYOVER',   'NORMAL', 'COMPLETED',   'Extra pillows requested',                      '11:00'),
    ('205', 'hk.liza', 'DEEP_CLEAN', 'HIGH',   'COMPLETED',   'Quarterly deep clean',                         '10:00')
) AS t(room_number, username, task_type, priority, task_status, notes, due_time)
JOIN rooms r ON r.room_number = t.room_number
LEFT JOIN users u ON u.username = t.username;

-- Finished work from the past week (Reports page history).
INSERT INTO hk_cleaning_tasks (room_id, staff_id, task_type, priority, task_status, notes, assigned_date, start_time, completion_time, created_at)
SELECT r.room_id, u.user_id, h.task_type, 'NORMAL', 'INSPECTED', NULL, CURRENT_DATE - h.days_ago,
       (CURRENT_DATE - h.days_ago) + TIME '09:00', (CURRENT_DATE - h.days_ago) + TIME '09:45',
       (CURRENT_DATE - h.days_ago) + TIME '08:00'
FROM (VALUES
    ('101', 'hk.liza', 'CHECKOUT',   1), ('203', 'hk.joy',  'STAYOVER',   1),
    ('303', 'hk.mark', 'CHECKOUT',   2), ('102', 'hk.liza', 'STAYOVER',   3),
    ('202', 'hk.joy',  'DEEP_CLEAN', 4), ('301', 'hk.mark', 'CHECKOUT',   5),
    ('104', 'hk.liza', 'TOUCH_UP',   6)
) AS h(room_number, username, task_type, days_ago)
JOIN rooms r ON r.room_number = h.room_number
JOIN users u ON u.username = h.username;

INSERT INTO hk_inspections (task_id, inspected_by, inspection_result, checklist, remarks, inspected_at)
SELECT t.task_id, u.user_id, 'PASSED', '{}'::jsonb, NULL, t.completion_time + INTERVAL '20 minutes'
FROM hk_cleaning_tasks t, users u
WHERE t.task_status = 'INSPECTED' AND u.username = 'hk.inspector';

-- One of those rooms failed its first inspection before passing.
INSERT INTO hk_inspections (task_id, inspected_by, inspection_result, checklist, remarks, inspected_at)
SELECT t.task_id, u.user_id, 'FAILED', '{}'::jsonb, 'Bathroom mirror streaked', t.completion_time - INTERVAL '10 minutes'
FROM hk_cleaning_tasks t JOIN rooms r ON r.room_id = t.room_id, users u
WHERE t.task_status = 'INSPECTED' AND r.room_number = '303' AND u.username = 'hk.inspector';

INSERT INTO hk_schedules (staff_id, shift_date, shift, start_time, end_time, assigned_area)
SELECT u.user_id, CURRENT_DATE + s.day_offset, s.shift, s.start_time::time, s.end_time::time, s.area
FROM (VALUES
    ('hk.supervisor', 0, 'MORNING',   '06:00', '14:00', 'All floors'),
    ('hk.inspector',  0, 'MORNING',   '07:00', '15:00', 'Floors 1-3'),
    ('hk.liza',       0, 'MORNING',   '06:00', '14:00', 'Floor 2'),
    ('hk.joy',        0, 'MORNING',   '06:00', '14:00', 'Floor 1'),
    ('hk.mark',       0, 'AFTERNOON', '14:00', '22:00', 'Floor 3'),
    ('hk.liza',       1, 'MORNING',   '06:00', '14:00', 'Floor 2'),
    ('hk.joy',        1, 'AFTERNOON', '14:00', '22:00', 'Floor 1')
) AS s(username, day_offset, shift, start_time, end_time, area)
JOIN users u ON u.username = s.username
ON CONFLICT DO NOTHING;

INSERT INTO hk_guest_requests (guest_id, room_id, staff_id, request_type, priority, request_details, request_status)
SELECT g.guest_id, r.room_id, u.user_id, q.request_type, q.priority, q.details, q.status
FROM (VALUES
    ('Carlos', '102', 'hk.joy', 'TOWELS',    'NORMAL', 'Two extra bath towels',            'IN_PROGRESS'),
    ('Grace',  '202', NULL,     'AMENITIES', 'NORMAL', 'Toothbrush kit and slippers',      'OPEN'),
    ('Ramon',  '301', NULL,     'EXTRA_BED', 'HIGH',   'Rollaway bed for a child tonight', 'OPEN')
) AS q(guest_name, room_number, username, request_type, priority, details, status)
JOIN (SELECT DISTINCT ON (first_name) guest_id, first_name FROM guests ORDER BY first_name, guest_id) g ON g.first_name = q.guest_name
JOIN rooms r ON r.room_number = q.room_number
LEFT JOIN users u ON u.username = q.username;

INSERT INTO hk_lost_found_items (room_id, found_by, item_description, found_location, storage_label, storage_location, found_at)
SELECT r.room_id, u.user_id, i.description, i.location, i.label, i.storage, NOW() - i.age::interval
FROM (VALUES
    ('201', 'hk.liza', 'Black leather wallet with ID cards', 'Under the bed',      'LF-0001', 'Cabinet A - Shelf 1', '2 hours'),
    ('104', 'hk.mark', 'Silver wristwatch',                  'Bathroom counter',   'LF-0002', 'Safe box 1',          '1 day'),
    ('103', 'hk.joy',  'Blue umbrella',                      'Closet',             'LF-0003', 'Cabinet B - Shelf 2', '3 days')
) AS i(room_number, username, description, location, label, storage, age)
JOIN rooms r ON r.room_number = i.room_number
JOIN users u ON u.username = i.username
ON CONFLICT (storage_label) DO NOTHING;

INSERT INTO hk_maintenance_requests (room_id, reported_by, issue_category, issue_description, priority, status, room_set_ooo)
SELECT r.room_id, u.user_id, 'AIRCON', 'Aircon not cooling and leaking water onto the carpet', 'HIGH', 'IN_PROGRESS', TRUE
FROM rooms r, users u
WHERE r.room_number = '302' AND u.username = 'hk.liza';

-- Recent room status changes (shown under Recent activity on the Inspection page).
INSERT INTO hk_room_status_logs (room_id, staff_id, previous_status, new_status, remarks, changed_at)
SELECT r.room_id, u.user_id, l.prev, l.next, l.remarks, NOW() - l.age::interval
FROM (VALUES
    ('203', 'hk.inspector', 'CLEAN',     'INSPECTED',    'Inspection passed',              '3 hours'),
    ('302', 'hk.liza',      'AVAILABLE', 'OUT_OF_ORDER', 'Maintenance request #1: AIRCON', '3 hours'),
    ('205', 'hk.liza',      'DIRTY',     'CLEAN',        'Cleaning task completed',        '10 minutes'),
    ('104', 'hk.mark',      'DIRTY',     'CLEAN',        'Cleaning task completed',        '10 minutes')
) AS l(room_number, username, prev, next, remarks, age)
JOIN rooms r ON r.room_number = l.room_number
JOIN users u ON u.username = l.username;

-- Linen, amenity and cleaning-supply stock (Inventory page).
INSERT INTO hk_inventory_items (item_name, category, unit, quantity, reorder_level, storage_area) VALUES
    ('Bath towel',          'LINEN',           'pcs',     120, 60, 'Linen room - Floor 1'),
    ('Hand towel',          'LINEN',           'pcs',      45, 50, 'Linen room - Floor 1'),
    ('Bed sheet (queen)',   'LINEN',           'pcs',      80, 40, 'Linen room - Floor 2'),
    ('Pillowcase',          'LINEN',           'pcs',     150, 60, 'Linen room - Floor 2'),
    ('Shampoo 30 ml',       'AMENITY',         'bottles', 200, 80, 'Supply room'),
    ('Toothbrush kit',      'AMENITY',         'kits',     30, 40, 'Supply room'),
    ('Slippers',            'AMENITY',         'pairs',    90, 40, 'Supply room'),
    ('All-purpose cleaner', 'CLEANING_SUPPLY', 'liters',   18, 10, 'Janitor closet'),
    ('Disinfectant spray',  'CLEANING_SUPPLY', 'cans',      6, 12, 'Janitor closet'),
    ('Trash bags',          'CLEANING_SUPPLY', 'rolls',    25, 10, 'Janitor closet');

INSERT INTO hk_inventory_movements (inv_item_id, movement_type, quantity, balance_after, room_id, remarks, staff_id, moved_at)
SELECT i.inv_item_id, m.kind, m.qty, i.quantity, r.room_id, m.remarks, u.user_id, NOW() - m.age::interval
FROM (VALUES
    ('Bath towel',         'OUT', 4,  '205', 'hk.liza',       'Room turnover',            '40 minutes'),
    ('Toothbrush kit',     'OUT', 2,  '102', 'hk.joy',        'Guest request',            '2 hours'),
    ('Disinfectant spray', 'OUT', 2,  NULL,  'hk.mark',       'Floor 2 bathrooms',        '5 hours'),
    ('Bath towel',         'IN',  60, NULL,  'hk.supervisor', 'Laundry return',           '1 day')
) AS m(item_name, kind, qty, room_number, username, remarks, age)
JOIN hk_inventory_items i ON i.item_name = m.item_name
JOIN users u ON u.username = m.username
LEFT JOIN rooms r ON r.room_number = m.room_number;

-- A forgot-password request waiting for the supervisor.
INSERT INTO hk_password_resets (user_id, requested_at)
SELECT user_id, NOW() - INTERVAL '30 minutes' FROM users WHERE username = 'hk.mark';
