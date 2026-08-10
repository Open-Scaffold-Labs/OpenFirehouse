-- 0074 — Station-display DEVICE PAIRING (Phase 2.3). Market grain (2026-07-23 pass,
-- unanimous): a wall display binds to ONE station via a single-use pairing code/QR and
-- then renders only that station's data; identity is set at PAIRING time, never inferred.
-- This upgrades the shared per-station TV PIN to a registered, revocable per-device model.
--
-- SECURITY: the display's pair + ongoing resolve are PUBLIC/unauthenticated (no app
-- department GUC), so they run through SECURITY DEFINER fns authorized by a hashed secret
-- (the exact of_redeem_member_invite pattern, 0016) — search_path-locked, EXECUTE revoked
-- from anon/authenticated/service_role/PUBLIC, granted to of_app ONLY. Chief-side create/
-- list/revoke run authenticated with the dept GUC (dept_isolation policy passes).
-- ⚠️ Public-auth / DEFINER surface — flagged for Dale's security review per repo CLAUDE.md.
-- D6: applied to prod by hand → verified by query → ledgered → then dependent code ships.

BEGIN;

CREATE TABLE IF NOT EXISTS station_displays (
  id SERIAL PRIMARY KEY,
  department_id      INTEGER NOT NULL,
  station_id         INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  label              TEXT DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'pending',   -- pending | active | revoked
  pairing_code_hash  TEXT,                              -- single-use; cleared on redeem
  pairing_expires_at TIMESTAMPTZ,
  device_token_hash  TEXT UNIQUE,                       -- persistent device credential (set on redeem)
  paired_at          TIMESTAMPTZ,
  last_seen_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_station_displays_dept         ON station_displays(department_id);
CREATE INDEX IF NOT EXISTS idx_station_displays_device_token ON station_displays(device_token_hash);

-- department FK (idempotent by name), matching the other tenant tables.
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='station_displays_department_id_fkey') THEN
    ALTER TABLE station_displays ADD CONSTRAINT station_displays_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
  END IF;
END $do$;

-- ── DEFINER fn 1: redeem a pairing code → activate the device, mint its token binding ──
-- Atomic single-use claim (race-safe in one statement). Authorized by the code hash, not a
-- dept GUC — which is why it must be DEFINER. Returns the binding the display needs.
DROP FUNCTION IF EXISTS public.of_redeem_station_pairing(text, text);
CREATE OR REPLACE FUNCTION public.of_redeem_station_pairing(
  p_code_hash         text,
  p_device_token_hash text
) RETURNS TABLE (display_id int, dept_id int, stn_id int, display_label text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id int; v_dept int; v_stn int; v_label text;
BEGIN
  IF p_device_token_hash IS NULL OR length(p_device_token_hash) < 32 THEN
    RAISE EXCEPTION 'of_redeem_station_pairing: device token hash required';
  END IF;
  UPDATE station_displays
     SET status = 'active', device_token_hash = p_device_token_hash,
         paired_at = now(), last_seen_at = now(), pairing_code_hash = NULL, pairing_expires_at = NULL
   WHERE pairing_code_hash = p_code_hash
     AND status = 'pending'
     AND pairing_expires_at > now()
  RETURNING id, department_id, station_id, label
    INTO v_id, v_dept, v_stn, v_label;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'of_redeem_station_pairing: invalid, used, or expired pairing code';
  END IF;
  RETURN QUERY SELECT v_id, v_dept, v_stn, v_label;
END;
$$;

-- ── DEFINER fn 2: resolve an active device token → its (dept, station); touch last_seen ──
DROP FUNCTION IF EXISTS public.of_resolve_station_display(text);
CREATE OR REPLACE FUNCTION public.of_resolve_station_display(p_device_token_hash text)
RETURNS TABLE (display_id int, dept_id int, stn_id int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id int; v_dept int; v_stn int;
BEGIN
  IF p_device_token_hash IS NULL OR length(p_device_token_hash) < 32 THEN
    RETURN;  -- no token → no binding (caller falls back to PIN)
  END IF;
  UPDATE station_displays
     SET last_seen_at = now()
   WHERE device_token_hash = p_device_token_hash AND status = 'active'
  RETURNING id, department_id, station_id INTO v_id, v_dept, v_stn;
  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, v_dept, v_stn;
  END IF;
END;
$$;

-- ── Grants: strip Supabase auto-grants (anon/authenticated/service_role + PUBLIC),
--    EXECUTE to of_app ONLY. Same hardening as 0012/0013/0016. ──
DO $$
DECLARE r text; fns text[] := ARRAY[
  'public.of_redeem_station_pairing(text,text)',
  'public.of_resolve_station_display(text)'];
  f text;
BEGIN
  FOREACH f IN ARRAY fns LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
      FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
          EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r);
        END IF;
      END LOOP;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO of_app', f);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── RLS + dept_isolation (chief-side create/list/revoke run with the dept GUC). ──
ALTER TABLE public.station_displays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.station_displays;
CREATE POLICY dept_isolation ON public.station_displays FOR ALL
  USING      (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);

INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0074-station-display-pairing.sql', NOW());

COMMIT;
