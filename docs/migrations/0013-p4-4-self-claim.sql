-- 0013-p4-4-self-claim.sql — P4.4 secondary onboarding: department join codes +
-- the of_register_pending_member SECURITY DEFINER function (the 3rd and last
-- controlled mapping-write fn from ADR-P4-001). Dale-reviewed/greenlit 2026-06-15.
--
-- WHY DEFINER: a self-registering member has no chief authz and cannot write
-- of_user_departments under the user_id-keyed dept_isolation policy. A VALID
-- JOIN CODE is the authorization. The function runs as owner, validates the code
-- → department, and atomically creates the login (lowest role), the member
-- (unverified), and the mapping. The chief still verifies rank to grant access.
--
-- The join code is hashed BY THE CALLER (sha256 hex, in the route) and only the
-- hash is passed in + stored — no pgcrypto dependency, and the raw code is never
-- persisted. Idempotent. Mirror into db.js for fresh installs; stamp the ledger.

-- ── 1. of_department_join_codes — hashed, expiring, rotatable self-join codes ──
CREATE TABLE IF NOT EXISTS of_department_join_codes (
  id                 SERIAL PRIMARY KEY,
  department_id      INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  code_hash          TEXT NOT NULL,
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked_at         TIMESTAMPTZ,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_join_codes_hash ON of_department_join_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_join_codes_dept ON of_department_join_codes(department_id);

-- ── 2. of_register_pending_member — self-serve member registration via a code ──
-- DROP first: a return-type (OUT column) change can't go through CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.of_register_pending_member(text,text,text,text,text);
CREATE OR REPLACE FUNCTION public.of_register_pending_member(
  p_username        text,
  p_password_hash   text,
  p_name            text,
  p_join_code_hash  text,
  p_requested_rank  text
) RETURNS TABLE (new_user_id int, new_department_id int)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dept    int;
  v_station int;
  v_user    int;
  v_member_no text;
BEGIN
  IF p_username IS NULL OR length(btrim(p_username)) < 3 THEN
    RAISE EXCEPTION 'of_register_pending_member: username required (min 3 chars)';
  END IF;
  IF p_password_hash IS NULL OR length(p_password_hash) < 20 THEN
    RAISE EXCEPTION 'of_register_pending_member: password hash required';
  END IF;

  -- Resolve the department from a valid (unrevoked, unexpired) join code.
  SELECT department_id INTO v_dept
    FROM of_department_join_codes
   WHERE code_hash = p_join_code_hash
     AND revoked_at IS NULL
     AND expires_at > now()
   ORDER BY created_at DESC
   LIMIT 1;
  IF v_dept IS NULL THEN
    RAISE EXCEPTION 'of_register_pending_member: invalid or expired join code';
  END IF;

  -- Global username uniqueness (users_username_key); clean, enumeration-safe error.
  IF EXISTS (SELECT 1 FROM users WHERE username = lower(btrim(p_username))) THEN
    RAISE EXCEPTION 'of_register_pending_member: username taken' USING ERRCODE = '23505';
  END IF;

  -- Mirror station (auth anchor) = the department's lowest station id.
  SELECT min(id) INTO v_station FROM stations WHERE department_id = v_dept;
  IF v_station IS NULL THEN
    RAISE EXCEPTION 'of_register_pending_member: department % has no station', v_dept;
  END IF;

  INSERT INTO users (username, name, initials, role, "passwordHash", email, station_id)
    VALUES (lower(btrim(p_username)), btrim(p_name),
            upper(left(regexp_replace(coalesce(p_name,''), '[^A-Za-z]', '', 'g'), 2)),
            'member', p_password_hash, '', v_station)
    RETURNING id INTO v_user;

  -- Next per-department member number (M-### — matches the route's generator).
  SELECT 'M-' || lpad(((COALESCE(max((regexp_match("memberNumber", '^M-([0-9]+)$'))[1]::int), 0)) + 1)::text, 3, '0')
    INTO v_member_no
    FROM members WHERE department_id = v_dept;

  INSERT INTO members ("memberNumber", name, rank, role, status, joined, rank_verified, user_id, station_id, department_id)
    VALUES (v_member_no, btrim(p_name),
            COALESCE(NULLIF(btrim(p_requested_rank), ''), 'Firefighter'),
            'Firefighter', 'Active', to_char(now(), 'YYYY-MM-DD'),
            false, v_user, v_station, v_dept);

  INSERT INTO of_user_departments (user_id, department_id, role)
    VALUES (v_user, v_dept, 'member')
  ON CONFLICT (user_id, department_id) DO NOTHING;

  RETURN QUERY SELECT v_user, v_dept;
END;
$$;

-- ── 3. Grants: strip Supabase auto-grants (anon/authenticated/service_role +
--      PUBLIC), EXECUTE to of_app ONLY — same hardening as 0012's fns. ──────────
DO $$
DECLARE
  r text;
  f text := 'public.of_register_pending_member(text,text,text,text,text)';
BEGIN
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
END $$;

-- of_app needs table + sequence privileges on the join-codes table.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.of_department_join_codes TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.of_department_join_codes_id_seq TO of_app;
  END IF;
END $$;
