-- 0073 — Home station + detail/move-up (Phase 2.2). Market grain (2026-07-23 pass):
-- personnel have a HOME station and can be detailed/moved-up to another house for a day.
-- A member's home is explicit (members.home_station_id); their DAILY station is the station
-- of the seat they rode (apparatus_assignments.station_id). A DETAIL is derived — seat
-- station != home station — and surfaced on the roster, never flattened.
-- D6: applied to prod by hand → verified by query → ledgered → then dependent code ships.
--
-- Additive only (nullable column + FK + index + backfill). No drops.

BEGIN;

ALTER TABLE members ADD COLUMN IF NOT EXISTS home_station_id INTEGER;

-- Backfill each member's home from their current station assignment — but ONLY when
-- station_id references a real station (guards against legacy/dev dangling station_ids;
-- a dangling ref leaves home_station_id NULL, which is valid).
UPDATE members m SET home_station_id = m.station_id
WHERE m.home_station_id IS NULL AND m.station_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM stations s WHERE s.id = m.station_id);

-- FK to stations, nullable. ON DELETE SET NULL — retiring a station never deletes members.
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_home_station_id_fkey;
ALTER TABLE members ADD CONSTRAINT members_home_station_id_fkey
  FOREIGN KEY (home_station_id) REFERENCES stations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_members_home_station ON members (home_station_id);

INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0073-member-home-station.sql', NOW());

COMMIT;
