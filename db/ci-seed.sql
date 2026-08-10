-- CI base tenant: many DB-backed tests assume department id=1 (+ its station) exists.
-- In dev the app's boot seeds create it; CI's fresh DB has no boot-seed step, so seed it here.
INSERT INTO departments (id, name) VALUES (1, 'CI Base Department') ON CONFLICT (id) DO NOTHING;
INSERT INTO stations (id, department_id, name) VALUES (1, 1, 'CI Base Station') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('departments','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM departments),1));
SELECT setval(pg_get_serial_sequence('stations','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM stations),1));
-- A chief with a station: the FI suites (completion back-door, code-library import, mailroom, reassign) require one.
INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
VALUES ('ci_chief', 'CI Chief', 'CC', 'chief', 'ci-not-a-real-hash', 1) ON CONFLICT (username) DO NOTHING;
