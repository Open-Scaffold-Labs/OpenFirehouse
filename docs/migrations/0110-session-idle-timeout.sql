-- 0110-session-idle-timeout.sql
-- Phase 5 (HARDEN THE TAIL) — session + idle timeout, admin-configurable.
--
-- MARKET BAR (competitor-shipping inventory, 2026-07-26): 7 of 12 fire/EMS RMS
-- products ship a session/idle timeout; the two strongest implementations expose
-- SEPARATE web and mobile idle windows plus a max-session-hours cap. We shipped
-- neither: ACCESS_TTL and REFRESH_TTL were both a hardcoded '7d' with no idle
-- window and no administrative control, so a shared apparatus iPad held a
-- seven-day credential.
--
-- WHY THE DEFAULTS ARE 7 DAYS (deliberate, not an oversight):
-- these defaults reproduce EXACTLY the behaviour that shipped before this
-- migration, so applying it changes nothing for anyone until a chief opts in.
-- Silently shortening a live session lifetime is how you log a captain out in
-- the middle of an incident. The capability is what the market bar asks for;
-- the value is the department's to choose.
--
-- Bounds rationale: 5 minutes is the shortest window that is usable on a
-- touch device; 10080 minutes (7 days) is the current behaviour and the ceiling.
-- session_max_hours is an ABSOLUTE cap on a rolling session — even a
-- continuously-active client must re-authenticate once it is reached.

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS session_idle_minutes_web    INTEGER NOT NULL DEFAULT 10080,
  ADD COLUMN IF NOT EXISTS session_idle_minutes_mobile INTEGER NOT NULL DEFAULT 10080,
  ADD COLUMN IF NOT EXISTS session_max_hours           INTEGER NOT NULL DEFAULT 168;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS; guard by name so the file is
-- idempotent and safe to re-run against a partially-migrated database.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_session_idle_web_ck') THEN
    ALTER TABLE departments ADD CONSTRAINT departments_session_idle_web_ck
      CHECK (session_idle_minutes_web BETWEEN 5 AND 10080);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_session_idle_mobile_ck') THEN
    ALTER TABLE departments ADD CONSTRAINT departments_session_idle_mobile_ck
      CHECK (session_idle_minutes_mobile BETWEEN 5 AND 10080);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_session_max_hours_ck') THEN
    ALTER TABLE departments ADD CONSTRAINT departments_session_max_hours_ck
      CHECK (session_max_hours BETWEEN 1 AND 168);
  END IF;
END $$;

COMMENT ON COLUMN departments.session_idle_minutes_web IS
  'Idle timeout for browser sessions, in minutes. Rolling: each authenticated refresh restarts the window. Default 10080 (7d) = pre-0110 behaviour.';
COMMENT ON COLUMN departments.session_idle_minutes_mobile IS
  'Idle timeout for native app sessions (iPad command + companion phone), in minutes. Default 10080 (7d) = pre-0110 behaviour.';
COMMENT ON COLUMN departments.session_max_hours IS
  'Absolute cap on one session regardless of activity. Re-authentication is required once reached. Default 168 (7d) = pre-0110 behaviour.';
