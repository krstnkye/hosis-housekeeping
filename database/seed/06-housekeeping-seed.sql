-- =====================================================================
-- HOSIS - Housekeeping sample data (for development and demo only)
--
-- All accounts use the password: password123
--   hk.supervisor  Housekeeping supervisor (can assign tasks and schedules)
--   hk.inspector   Housekeeping inspector  (can inspect rooms)
--   hk.liza / hk.joy / hk.mark  Housekeepers
--   fo.desk        Front Office account, used to show "Access denied"
-- Dates are relative to CURRENT_DATE so the demo always looks current.
-- =====================================================================

INSERT INTO users (first_name, last_name, username, password_hash, role, position) VALUES
    ('Maria', 'Santos',    'hk.supervisor', '$2b$10$UTSyYL.ukW1io4s4jPa4AeYIkmYga4KccIEkw6MnZ/zlUKRUNv4o6', 'HOUSEKEEPING', 'SUPERVISOR'),
    ('Ana',   'Reyes',     'hk.inspector',  '$2b$10$UTSyYL.ukW1io4s4jPa4AeYIkmYga4KccIEkw6MnZ/zlUKRUNv4o6', 'HOUSEKEEPING', 'INSPECTOR'),
    ('Liza',  'Cruz',      'hk.liza',       '$2b$10$UTSyYL.ukW1io4s4jPa4AeYIkmYga4KccIEkw6MnZ/zlUKRUNv4o6', 'HOUSEKEEPING', 'HOUSEKEEPER'),
    ('Joy',   'Dela Cruz', 'hk.joy',        '$2b$10$UTSyYL.ukW1io4s4jPa4AeYIkmYga4KccIEkw6MnZ/zlUKRUNv4o6', 'HOUSEKEEPING', 'HOUSEKEEPER'),
    ('Mark',  'Tan',       'hk.mark',       '$2b$10$UTSyYL.ukW1io4s4jPa4AeYIkmYga4KccIEkw6MnZ/zlUKRUNv4o6', 'HOUSEKEEPING', 'HOUSEKEEPER'),
    ('Paolo', 'Garcia',    'fo.desk',       '$2b$10$UTSyYL.ukW1io4s4jPa4AeYIkmYga4KccIEkw6MnZ/zlUKRUNv4o6', 'FRONT_OFFICE', NULL)
ON CONFLICT (username) DO NOTHING;

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
ON CONFLICT (room_number) DO NOTHING;

INSERT INTO guests (first_name, last_name, contact_number) VALUES
    ('Carlos', 'Mendoza', '0917-555-0101'),
    ('Grace',  'Lim',     '0918-555-0202'),
    ('Ramon',  'Bautista','0919-555-0303');

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
JOIN guests g ON g.first_name = q.guest_name
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
