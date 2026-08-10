-- 0114-cs-pin-throttle-and-device-grant-tidy.sql
-- Dale's 2026-07-27 security review of 2.7 (CS chain of custody) + 2.3 (station
-- display pairing). Both modules were SIGNED OFF; these are the non-blocking
-- hardenings he queued. Two independent changes, shipped together because they
-- are one review response.
--
-- ─── A · CS PIN throttle (Dale item 1) ──────────────────────────────────────
-- "Per-user lockout or throttle on CS_AUTH_FAILED — a 4-digit PIN on a shared
--  tablet is 10,000 guesses; an audited brute force is still a brute force."
--
-- PIN_RE is /^\d{4,8}$/, so the WEAKEST permitted PIN is 4 digits = 10,000
-- combinations. Today `verifyCsPin` audits every failure and 403s, with no
-- attempt ceiling of any kind.
--
-- WHY PER-USER AND NOT AN express-rate-limit MIDDLEWARE:
-- server/src/index.js carries an explicit standing doctrine —
--   "clients poll — never rate-limit a firehouse during operations. This only
--    exists to stop scripted abuse; auth brute-force is covered by authLimiter."
-- An IP limiter would punish the STATION: one firehouse behind one NAT address,
-- several medics on shared tablets, all sharing a bucket. The credential under
-- attack is a specific user's PIN, so the counter belongs on that user.
--
-- WHY THROTTLE AND NOT LOCKOUT:
-- This gates the controlled-substance RECORD. A hard lock that needs an admin to
-- clear is a 3am failure mode — the drug still gets administered, the record is
-- what stops, and that pushes a crew to paper. So: a self-clearing cooldown that
-- always expires on its own. No admin unlock path, because no admin unlock is
-- needed.
--
-- Two columns on `users` rather than a new table: the state is per-user, tiny,
-- and read on the same row the PIN hash already lives on (0087 put cs_pin_hash
-- there). A new table would add a join to the hot path for no benefit.
-- Serverless-safe by construction — the state is in Postgres, not process memory,
-- so it holds across Vercel instances.

ALTER TABLE users ADD COLUMN IF NOT EXISTS cs_pin_fail_count  INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cs_pin_locked_until TIMESTAMPTZ;

COMMENT ON COLUMN users.cs_pin_fail_count IS
  'Consecutive CS PIN verification failures. Reset to 0 on success or once a cooldown expires. 0114.';
COMMENT ON COLUMN users.cs_pin_locked_until IS
  'CS PIN cooldown expiry. NULL = not throttled. Always self-clears; there is deliberately no admin unlock. 0114.';

-- of_app must be able to maintain the counter. Column-scoped, matching the 0087
-- doctrine of granting UPDATE only on the columns a door actually needs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    EXECUTE 'GRANT UPDATE (cs_pin_fail_count, cs_pin_locked_until) ON users TO of_app';
  END IF;
END $$;

-- ─── B · station_displays grant tidy (Dale item 4) ──────────────────────────
-- "Optional tidy: trim service_role's TRUNCATE/DELETE on station_displays for
--  symmetry with the cs_* sweep."
--
-- Verified on prod before writing this (information_schema.role_table_grants):
--   of_app       DELETE, INSERT, SELECT, UPDATE
--   service_role DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   postgres     (owner — untouched)
--
-- DELIBERATELY NOT TOUCHED: of_app's DELETE. Device revocation is a real
-- product verb (0074 ships "registered, revocable per-device") and that door
-- needs it. Dale asked about service_role only. Removing of_app's DELETE would
-- break revocation — that grant is design, not drift.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE TRUNCATE, DELETE ON station_displays FROM service_role';
  END IF;
END $$;
