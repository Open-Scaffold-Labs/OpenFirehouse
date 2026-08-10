--
-- PostgreSQL database dump
--

\restrict PQ7G9ehA48uCjX592nZBNqrHCeGcd2kWsOFaSH7aDleitcqxyRLxrlkWFEft0T2

-- Dumped from database version 16.13 (Homebrew)
-- Dumped by pg_dump version 16.13 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: of_avl_connection_by_webhook_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.of_avl_connection_by_webhook_secret(p_secret_hash text) RETURNS TABLE(connection_id integer, department_id integer, vendor_id text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ SELECT id, department_id, vendor_id FROM public.avl_connections
            WHERE webhook_secret_hash = p_secret_hash AND COALESCE(status,'') NOT IN ('Inactive','disabled','revoked')
            ORDER BY id DESC LIMIT 1 $$;


--
-- Name: of_cad_connection_by_webhook_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.of_cad_connection_by_webhook_secret(p_secret_hash text) RETURNS TABLE(connection_id integer, department_id integer, station_id integer, vendor_id text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ SELECT id, department_id, station_id, "vendorId" FROM public.cad_connections
            WHERE webhook_secret_hash = p_secret_hash AND COALESCE(status,'') NOT IN ('Inactive','disabled','revoked')
            ORDER BY id DESC LIMIT 1 $$;


--
-- Name: of_link_member(integer, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.of_link_member(p_caller_user_id integer, p_target_user_id integer, p_department_id integer, p_role text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.of_user_departments
    WHERE user_id = p_caller_user_id AND department_id = p_department_id
      AND role IN ('chief', 'admin')
  ) THEN
    RAISE EXCEPTION 'of_link_member: caller % is not a chief/admin of department %',
      p_caller_user_id, p_department_id;
  END IF;
  IF p_target_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'of_link_member: target user % does not exist', p_target_user_id;
  END IF;
  INSERT INTO public.of_user_departments (user_id, department_id, role)
    VALUES (p_target_user_id, p_department_id, COALESCE(NULLIF(btrim(p_role), ''), 'member'))
  ON CONFLICT (user_id, department_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;


--
-- Name: of_provision_department(integer, text, text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.of_provision_department(p_chief_user_id integer, p_name text, p_fdid text, p_dept_type text, p_tier text, p_mirror_station_id integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_dept       int;
  v_chief_name text;
  v_member_no  text;
BEGIN
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'of_provision_department: department name is required';
  END IF;
  IF p_chief_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_chief_user_id) THEN
    RAISE EXCEPTION 'of_provision_department: chief user % does not exist', p_chief_user_id;
  END IF;

  INSERT INTO public.departments (name, fdid, dept_type, plan_tier)
    VALUES (btrim(p_name), COALESCE(p_fdid, ''), COALESCE(p_dept_type, ''), COALESCE(p_tier, ''))
    RETURNING id INTO v_dept;

  INSERT INTO public.of_user_departments (user_id, department_id, role)
    VALUES (p_chief_user_id, v_dept, 'chief')
  ON CONFLICT (user_id, department_id) DO UPDATE SET role = 'chief';

  IF NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE user_id = p_chief_user_id AND department_id = v_dept
  ) THEN
    SELECT name INTO v_chief_name FROM public.users WHERE id = p_chief_user_id;
    SELECT 'M-' || lpad(((COALESCE(max((regexp_match("memberNumber", '^M-([0-9]+)$'))[1]::int), 0)) + 1)::text, 3, '0')
      INTO v_member_no FROM public.members WHERE department_id = v_dept;
    INSERT INTO public.members
      ("memberNumber", name, rank, role, status, joined, rank_verified, user_id, station_id, department_id)
      VALUES (
        v_member_no,
        COALESCE(NULLIF(btrim(v_chief_name), ''), 'Chief'),
        'Chief', 'Chief', 'Active',
        to_char(now(), 'YYYY-MM-DD'),
        true,
        p_chief_user_id,
        COALESCE(p_mirror_station_id, (SELECT min(id) FROM public.stations WHERE department_id = v_dept)),
        v_dept
      );
  END IF;

  RETURN v_dept;
END;
$_$;


--
-- Name: of_redeem_member_invite(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.of_redeem_member_invite(p_token_hash text, p_password_hash text) RETURNS TABLE(redeemed_invite_id integer, redeemed_user_id integer, redeemed_member_id integer, redeemed_department_id integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
    DECLARE v_invite int; v_user int; v_member int; v_dept int;
    BEGIN
      IF p_password_hash IS NULL OR length(p_password_hash) < 20 THEN
        RAISE EXCEPTION 'of_redeem_member_invite: password hash required'; END IF;
      UPDATE of_member_invites SET used_at = now()
        WHERE token_hash = p_token_hash AND used_at IS NULL AND expires_at > now()
        RETURNING id, user_id, member_id, department_id INTO v_invite, v_user, v_member, v_dept;
      IF v_invite IS NULL THEN RAISE EXCEPTION 'of_redeem_member_invite: invalid, used, or expired invite'; END IF;
      UPDATE users SET "passwordHash" = p_password_hash WHERE id = v_user;
      RETURN QUERY SELECT v_invite, v_user, v_member, v_dept;
    END;
    $$;


--
-- Name: of_register_pending_member(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.of_register_pending_member(p_username text, p_password_hash text, p_name text, p_join_code_hash text, p_requested_rank text) RETURNS TABLE(new_user_id integer, new_department_id integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
    DECLARE v_dept int; v_station int; v_user int; v_member_no text;
    BEGIN
      IF p_username IS NULL OR length(btrim(p_username)) < 3 THEN
        RAISE EXCEPTION 'of_register_pending_member: username required (min 3 chars)'; END IF;
      IF p_password_hash IS NULL OR length(p_password_hash) < 20 THEN
        RAISE EXCEPTION 'of_register_pending_member: password hash required'; END IF;
      SELECT department_id INTO v_dept FROM of_department_join_codes
        WHERE code_hash = p_join_code_hash AND revoked_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1;
      IF v_dept IS NULL THEN RAISE EXCEPTION 'of_register_pending_member: invalid or expired join code'; END IF;
      IF EXISTS (SELECT 1 FROM users WHERE username = lower(btrim(p_username))) THEN
        RAISE EXCEPTION 'of_register_pending_member: username taken' USING ERRCODE = '23505'; END IF;
      SELECT min(id) INTO v_station FROM stations WHERE department_id = v_dept;
      IF v_station IS NULL THEN RAISE EXCEPTION 'of_register_pending_member: department % has no station', v_dept; END IF;
      INSERT INTO users (username, name, initials, role, "passwordHash", email, station_id)
        VALUES (lower(btrim(p_username)), btrim(p_name),
                upper(left(regexp_replace(coalesce(p_name,''), '[^A-Za-z]', '', 'g'), 2)),
                'member', p_password_hash, '', v_station)
        RETURNING id INTO v_user;
      SELECT 'M-' || lpad(((COALESCE(max((regexp_match("memberNumber", '^M-([0-9]+)$'))[1]::int), 0)) + 1)::text, 3, '0')
        INTO v_member_no FROM members WHERE department_id = v_dept;
      INSERT INTO members ("memberNumber", name, rank, role, status, joined, rank_verified, user_id, station_id, department_id)
        VALUES (v_member_no, btrim(p_name), COALESCE(NULLIF(btrim(p_requested_rank), ''), 'Firefighter'),
                'Firefighter', 'Active', to_char(now(), 'YYYY-MM-DD'), false, v_user, v_station, v_dept);
      INSERT INTO of_user_departments (user_id, department_id, role)
        VALUES (v_user, v_dept, 'member') ON CONFLICT (user_id, department_id) DO NOTHING;
      RETURN QUERY SELECT v_user, v_dept;
    END;
    $_$;


--
-- Name: of_resolve_department(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.of_resolve_department(p_user_id integer) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT department_id
  FROM public.of_user_departments
  WHERE user_id = p_user_id
  ORDER BY department_id ASC
  LIMIT 1
$$;


--
-- Name: of_station_department(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.of_station_department(p_station_id integer) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ SELECT department_id FROM public.stations WHERE id = p_station_id $$;


--
-- Name: of_sync_department_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.of_sync_department_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.department_id IS NULL THEN NEW.department_id := COALESCE((SELECT s.department_id FROM public.stations s WHERE s.id = NEW.station_id), NEW.station_id); END IF;
      RETURN NEW;
    END;
    $$;


--
-- Name: ops_prune_table(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_prune_table(p_table text, p_ts_col text, p_retain_days integer, p_batch integer DEFAULT 5000) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_total bigint := 0;
  v_deleted integer;
  v_allowlist CONSTANT text[] := ARRAY[
    'cad_alerts', 'unit_status_history', 'audit_log',
    'radio_log', 'knox_access_log', 'station_log'
  ];
BEGIN
  IF NOT (p_table = ANY (v_allowlist)) THEN
    RAISE WARNING 'ops_prune_table: % is not an allowlisted operational table, refusing', p_table;
    RETURN 0;
  END IF;
  IF p_retain_days IS NULL OR p_retain_days < 30 THEN
    RAISE WARNING 'ops_prune_table: retain_days % under 30-day floor for %, refusing', p_retain_days, p_table;
    RETURN 0;
  END IF;
  IF to_regclass('public.' || p_table) IS NULL THEN
    RAISE NOTICE 'ops_prune_table: table % not found, skipping', p_table;
    RETURN 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_ts_col
  ) THEN
    RAISE NOTICE 'ops_prune_table: column %.% not found, skipping', p_table, p_ts_col;
    RETURN 0;
  END IF;
  LOOP
    EXECUTE format(
      'WITH victims AS ('
      || ' SELECT ctid FROM %1$I'
      || ' WHERE %2$I < now() - make_interval(days => %3$L::int)'
      || ' ORDER BY %2$I LIMIT %4$L::int FOR UPDATE SKIP LOCKED)'
      || ' DELETE FROM %1$I t USING victims v WHERE t.ctid = v.ctid',
      p_table, p_ts_col, p_retain_days, p_batch);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;
    EXIT WHEN v_deleted = 0;
  END LOOP;
  RETURN v_total;
END
$_$;


--
-- Name: ops_purge_soft_deleted_incidents(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_purge_soft_deleted_incidents(p_retain_years integer) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE n bigint;
BEGIN
  IF p_retain_years IS NULL OR p_retain_years < 3 THEN
    RAISE EXCEPTION 'Refusing to purge incidents with a retention window under 3 years';
  END IF;
  DELETE FROM public.incidents
   WHERE deleted_at IS NOT NULL
     AND deleted_at < now() - make_interval(years => p_retain_years);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;


--
-- Name: ops_run_retention(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_run_retention() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT table_name, ts_column, retain_days
             FROM public.retention_policy WHERE enabled LOOP
    n := public.ops_prune_table(r.table_name, r.ts_column, r.retain_days);
    INSERT INTO public.retention_run_log (table_name, rows_deleted, retain_days)
      VALUES (r.table_name, n, r.retain_days);
  END LOOP;
END
$$;


--
-- Name: refresh_demo_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_demo_data() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  dept     int;
  off_days int;
  shifted  int := 0;
BEGIN
  -- Resolve the demo department id. ng911_calls carries a trigger-set department_id;
  -- fall back to the station, then to 1.
  BEGIN
    SELECT department_id INTO dept FROM public.ng911_calls
      WHERE station_id = 1 AND department_id IS NOT NULL LIMIT 1;
  EXCEPTION WHEN OTHERS THEN dept := NULL; END;
  IF dept IS NULL THEN
    BEGIN SELECT department_id INTO dept FROM public.stations WHERE id = 1;
    EXCEPTION WHEN OTHERS THEN dept := NULL; END;
  END IF;
  IF dept IS NULL THEN dept := 1; END IF;

  -- ── 1. department_id backfill (activity_entries filters on it; seed left NULL) ──
  BEGIN
    UPDATE public.activity_entries SET department_id = dept
      WHERE station_id = 1 AND department_id IS NULL;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- ── 2. forward-only date slides ──────────────────────────────────────────────

  -- daily_staffing.date (DATE) — Daily Staffing "today"
  BEGIN
    SELECT GREATEST(0, (CURRENT_DATE - MAX(date))::int) INTO off_days
      FROM public.daily_staffing WHERE station_id = 1;
    IF COALESCE(off_days,0) > 0 THEN
      UPDATE public.daily_staffing SET date = date + off_days WHERE station_id = 1;
      shifted := shifted + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- shifts.date (TEXT, whole-table demo) — FLSA §207(k) current work period + Duty Schedule
  BEGIN
    SELECT GREATEST(0, (CURRENT_DATE - MAX(date::date))::int) INTO off_days FROM public.shifts;
    IF COALESCE(off_days,0) > 0 THEN
      UPDATE public.shifts SET date = ((date::date) + off_days)::text;
      shifted := shifted + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- vacancy_fill.shift_date (TEXT) + expires_at + created_at — Auto Vacancy Fill
  BEGIN
    SELECT GREATEST(0, (CURRENT_DATE - MAX(shift_date::date))::int) INTO off_days
      FROM public.vacancy_fill WHERE station_id = 1;
    IF COALESCE(off_days,0) > 0 THEN
      UPDATE public.vacancy_fill SET
        shift_date = ((shift_date::date) + off_days)::text,
        expires_at = expires_at + ((off_days::text) || ' days')::interval,
        created_at = created_at + ((off_days::text) || ' days')::interval
      WHERE station_id = 1;
      shifted := shifted + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- leave_requests."startDate"/"endDate" (TEXT) + "createdAt" — Leave Requests
  BEGIN
    SELECT GREATEST(0, (CURRENT_DATE - MAX("endDate"::date))::int) INTO off_days
      FROM public.leave_requests WHERE station_id = 1;
    IF COALESCE(off_days,0) > 0 THEN
      UPDATE public.leave_requests SET
        "startDate" = (("startDate"::date) + off_days)::text,
        "endDate"   = (("endDate"::date) + off_days)::text,
        "createdAt" = "createdAt" + ((off_days::text) || ' days')::interval
      WHERE station_id = 1;
      shifted := shifted + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- recall_events.created_at/closed_at — Mass Recall
  BEGIN
    SELECT GREATEST(0, (CURRENT_DATE - MAX(created_at::date))::int) INTO off_days
      FROM public.recall_events WHERE station_id = 1;
    IF COALESCE(off_days,0) > 0 THEN
      UPDATE public.recall_events SET
        created_at = created_at + ((off_days::text) || ' days')::interval,
        closed_at  = closed_at  + ((off_days::text) || ' days')::interval
      WHERE station_id = 1;
      shifted := shifted + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- shift_swaps."createdAt"/"updatedAt" — Shift Trades/Swaps
  BEGIN
    SELECT GREATEST(0, (CURRENT_DATE - MAX("createdAt"::date))::int) INTO off_days
      FROM public.shift_swaps WHERE station_id = 1;
    IF COALESCE(off_days,0) > 0 THEN
      UPDATE public.shift_swaps SET
        "createdAt" = "createdAt" + ((off_days::text) || ' days')::interval,
        "updatedAt" = "updatedAt" + ((off_days::text) || ' days')::interval
      WHERE station_id = 1;
      shifted := shifted + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- activity_entries.date (TEXT) + created_at — Activity Logger "today"
  BEGIN
    SELECT GREATEST(0, (CURRENT_DATE - MAX(date::date))::int) INTO off_days
      FROM public.activity_entries WHERE station_id = 1;
    IF COALESCE(off_days,0) > 0 THEN
      UPDATE public.activity_entries SET
        date = ((date::date) + off_days)::text,
        created_at = created_at + ((off_days::text) || ' days')::interval
      WHERE station_id = 1;
      shifted := shifted + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- ── 3. On-Demand Modules: seed completions once (no seed script ever existed) ──
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.module_completions WHERE station_id = 1) THEN
      INSERT INTO public.module_completions
        (station_id, user_id, member_name, module_id, score, passed, completed_at)
      SELECT 1, m.id, m.name, mod.module_id,
             80 + (floor(random() * 20))::int,          -- score 80–99
             true,
             now() - (((floor(random() * 55) + 3))::text || ' days')::interval  -- completed 3–58 days ago
      FROM (SELECT id, name FROM public.members WHERE station_id = 1 ORDER BY id LIMIT 12) m
      CROSS JOIN (VALUES ('nfirs-basics'), ('losap-documentation'),
                         ('nims-ics-fundamentals'), ('hazmat-awareness')) AS mod(module_id)
      WHERE random() < 0.72   -- ~72% of member×module combos done, so the matrix looks lived-in
      ON CONFLICT (station_id, user_id, module_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN 'refresh_demo_data: department_id=' || dept || ', tables_shifted=' || shifted;
END;
$$;


--
-- Name: refresh_demo_staffing(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_demo_staffing() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  dept        int := 1;
  d           date;
  day_shift   int;
  seeded      int := 0;
BEGIN
  BEGIN SELECT department_id INTO dept FROM public.stations WHERE id = 1;
  EXCEPTION WHEN OTHERS THEN dept := 1; END;
  IF dept IS NULL THEN dept := 1; END IF;

  BEGIN
    UPDATE public.apparatus_positions SET required_certs = '["driver_operator_pumper","cdl_b"]'
      WHERE department_id = dept AND position_name = 'Driver/Engineer'
        AND required_certs NOT LIKE '%driver_operator%';
    UPDATE public.apparatus_positions SET required_certs = '["fire_officer_1"]'
      WHERE department_id = dept AND position_name = 'Officer'
        AND required_certs NOT LIKE '%fire_officer%';
    UPDATE public.apparatus_positions SET required_certs = '["firefighter_2"]'
      WHERE department_id = dept AND position_name IN ('Nozzle','Roof/Search')
        AND required_certs NOT LIKE '%firefighter_%';
    UPDATE public.apparatus_positions SET required_certs = '["firefighter_1"]'
      WHERE department_id = dept AND position_name = 'Backup/Utility'
        AND required_certs NOT LIKE '%firefighter_%';
    UPDATE public.apparatus_positions SET required_certs = '["firefighter_2","forcible_entry"]'
      WHERE department_id = dept AND position_name = 'Outside Vent/Forcible Entry'
        AND required_certs NOT LIKE '%forcible_entry%';
    UPDATE public.apparatus_positions SET required_certs = '["emt_basic","evoc"]'
      WHERE department_id = dept AND position_name = 'Driver/Attendant'
        AND required_certs NOT LIKE '%emt_basic%';
    UPDATE public.apparatus_positions SET required_certs = '["paramedic","acls","pals"]'
      WHERE department_id = dept AND position_name = 'Paramedic'
        AND required_certs NOT LIKE '%paramedic%';
    UPDATE public.apparatus_positions SET required_certs = '["tech_rescue_operations","confined_space_rescue"]'
      WHERE department_id = dept AND position_name = 'Rescue Tech'
        AND required_certs NOT LIKE '%tech_rescue%';
    UPDATE public.apparatus_positions SET required_certs = '["driver_operator_pumper"]'
      WHERE department_id = dept AND position_name = 'Pump Operator'
        AND required_certs NOT LIKE '%driver_operator%';
    UPDATE public.apparatus_positions SET required_certs = '["fire_officer_2","incident_safety_officer"]'
      WHERE department_id = dept AND position_name = 'Battalion Chief'
        AND required_certs NOT LIKE '%fire_officer_2%';
    seeded := seeded + 1;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    UPDATE public.apparatus_assignments aa
       SET position_id = p.id
      FROM public.apparatus_positions p
     WHERE aa.department_id = dept AND aa.position_id IS NULL
       AND p.department_id = dept
       AND p.apparatus_id = aa.apparatus_id
       AND p.position_name = aa.position_name;
    seeded := seeded + 1;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    INSERT INTO public.member_qualifications
      (station_id, department_id, member_id, cert_type, cert_name,
       issuing_authority, issued_date, expiry_date, status, created_at)
    SELECT DISTINCT 1, dept, s.member_id, s.code,
           initcap(replace(s.code, '_', ' ')),
           'NJ Division of Fire Safety',
           to_char(CURRENT_DATE - interval '14 months', 'YYYY-MM-DD'),
           to_char(CURRENT_DATE + interval '22 months', 'YYYY-MM-DD'),
           'active', now()
      FROM (
        SELECT aa.member_id,
               jsonb_array_elements_text(p.required_certs::jsonb) AS code
          FROM public.apparatus_assignments aa
          JOIN public.apparatus_positions p ON p.id = aa.position_id
         WHERE aa.department_id = dept AND aa.member_id IS NOT NULL
           AND NOT (aa.apparatus_id = 4 AND aa.position_name = 'Officer')
      ) s
     WHERE NOT EXISTS (
       SELECT 1 FROM public.member_qualifications q
        WHERE q.department_id = dept AND q.member_id = s.member_id
          AND q.cert_type = s.code);
    seeded := seeded + 1;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  FOR d IN SELECT generate_series(CURRENT_DATE - 1, CURRENT_DATE + 3, '1 day')::date LOOP
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM public.shifts
                      WHERE department_id = dept AND date = to_char(d,'YYYY-MM-DD')
                        AND "shiftType" = 'Day') THEN
        INSERT INTO public.shifts (station_id, department_id, date, "shiftType", "memberIds", crew, "createdAt", "updatedAt")
        VALUES (1, dept, to_char(d,'YYYY-MM-DD'), 'Day', '[]',
                '["Carlos Ruiz","Amy Winters","Kevin Marsh"]', now(), now());
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.shifts
                      WHERE department_id = dept AND date = to_char(d,'YYYY-MM-DD')
                        AND "shiftType" = 'Night') THEN
        INSERT INTO public.shifts (station_id, department_id, date, "shiftType", "memberIds", crew, "createdAt", "updatedAt")
        VALUES (1, dept, to_char(d,'YYYY-MM-DD'), 'Night', '[]',
                '["Diane Tolliver","Sarah Chen","Maria Delgado"]', now(), now());
      END IF;

      SELECT id INTO day_shift FROM public.shifts
        WHERE department_id = dept AND date = to_char(d,'YYYY-MM-DD')
          AND "shiftType" = 'Day' LIMIT 1;

      INSERT INTO public.apparatus_assignments
        (station_id, department_id, shift_id, apparatus_id, position_id, position_name, member_id, created_at)
      SELECT aa.station_id, dept, day_shift, aa.apparatus_id, aa.position_id,
             aa.position_name, aa.member_id, now()
        FROM public.apparatus_assignments aa
       WHERE aa.department_id = dept AND aa.shift_id = 1
         AND NOT EXISTS (
           SELECT 1 FROM public.apparatus_assignments x
            WHERE x.department_id = dept AND x.shift_id = day_shift
              AND x.position_id IS NOT DISTINCT FROM aa.position_id
              AND x.position_name = aa.position_name);

      IF NOT EXISTS (SELECT 1 FROM public.run_lists
                      WHERE department_id = dept AND date = to_char(d,'YYYY-MM-DD')) THEN
        INSERT INTO public.run_lists (station_id, department_id, date, payload, submitted_at)
        SELECT station_id, dept, to_char(d,'YYYY-MM-DD'),
               jsonb_set(payload, '{date}', to_jsonb(to_char(d,'YYYY-MM-DD'))), now()
          FROM public.run_lists WHERE department_id = dept
         ORDER BY date DESC LIMIT 1;
      END IF;
      seeded := seeded + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  RETURN format('refresh_demo_staffing: dept=%s, blocks_ok=%s', dept, seeded);
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: active_boards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_boards (
    station_id integer,
    incident_type text,
    address text,
    dispatched_at timestamp with time zone,
    personnel_count integer DEFAULT 0,
    units_count integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now(),
    incident_id integer,
    department_id integer NOT NULL,
    par_interval_min integer,
    last_par_at timestamp with time zone
);


--
-- Name: active_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_resources (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    incident_id integer,
    resource_type text DEFAULT 'fire'::text,
    agency text DEFAULT ''::text,
    unit_designation text NOT NULL,
    unit_type text DEFAULT ''::text,
    status text DEFAULT 'dispatched'::text,
    latitude double precision,
    longitude double precision,
    speed_mph double precision,
    heading double precision,
    eta_minutes integer,
    crew_count integer DEFAULT 0,
    crew_names text DEFAULT ''::text,
    officer_name text DEFAULT ''::text,
    radio_channel text DEFAULT ''::text,
    contact_phone text DEFAULT ''::text,
    live_share_token text,
    mutual_aid_agreement_id integer,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: active_resources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.active_resources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: active_resources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.active_resources_id_seq OWNED BY public.active_resources.id;


--
-- Name: activity_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_entries (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    entry_type text NOT NULL,
    category text DEFAULT ''::text,
    date text NOT NULL,
    shift text DEFAULT ''::text,
    entered_by text DEFAULT ''::text,
    entered_by_id integer,
    apparatus text DEFAULT ''::text,
    result text DEFAULT ''::text,
    subject text DEFAULT ''::text,
    body text DEFAULT ''::text,
    priority text DEFAULT 'normal'::text,
    visitor_name text DEFAULT ''::text,
    purpose text DEFAULT ''::text,
    time_in text DEFAULT ''::text,
    time_out text DEFAULT ''::text,
    gallons double precision,
    fuel_type text DEFAULT ''::text,
    location text DEFAULT ''::text,
    property text DEFAULT ''::text,
    hydrant_id text DEFAULT ''::text,
    event_name text DEFAULT ''::text,
    attendees integer,
    department text DEFAULT ''::text,
    incident_type text DEFAULT ''::text,
    incident_number text DEFAULT ''::text,
    course text DEFAULT ''::text,
    hours double precision,
    instructor text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: activity_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_entries_id_seq OWNED BY public.activity_entries.id;


--
-- Name: after_action_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.after_action_reports (
    id integer NOT NULL,
    station_id integer DEFAULT 1 NOT NULL,
    incident_id integer,
    incident_date date,
    incident_type text DEFAULT ''::text,
    location text DEFAULT ''::text,
    title text DEFAULT ''::text NOT NULL,
    summary text DEFAULT ''::text,
    strengths jsonb DEFAULT '[]'::jsonb,
    improvements jsonb DEFAULT '[]'::jsonb,
    action_items jsonb DEFAULT '[]'::jsonb,
    lessons_learned text DEFAULT ''::text,
    attendees jsonb DEFAULT '[]'::jsonb,
    conducted_by text DEFAULT ''::text,
    conducted_date date DEFAULT CURRENT_DATE,
    status text DEFAULT 'draft'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: after_action_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.after_action_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: after_action_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.after_action_reports_id_seq OWNED BY public.after_action_reports.id;


--
-- Name: ai_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage (
    id integer NOT NULL,
    station_id integer NOT NULL,
    used_on date DEFAULT CURRENT_DATE NOT NULL,
    action text DEFAULT ''::text,
    model text DEFAULT ''::text,
    input_tokens integer DEFAULT 0,
    output_tokens integer DEFAULT 0,
    estimated boolean DEFAULT false,
    calls integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: ai_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_usage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_usage_id_seq OWNED BY public.ai_usage.id;


--
-- Name: apparatus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apparatus (
    id integer NOT NULL,
    designation text NOT NULL,
    type text NOT NULL,
    year integer NOT NULL,
    make text DEFAULT ''::text,
    model text DEFAULT ''::text,
    status text DEFAULT 'In Service'::text,
    mileage integer DEFAULT 0,
    "lastService" text DEFAULT ''::text,
    "nextServiceDue" text DEFAULT ''::text,
    "assignedOperator" text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    vin text DEFAULT ''::text,
    department_id integer,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    neris_type text,
    neris_unit_id text,
    CONSTRAINT apparatus_neris_type_valid CHECK (((neris_type IS NULL) OR (neris_type = ANY (ARRAY['CREW_TRANS'::text, 'ENGINE_STRUCT'::text, 'ENGINE_WUI'::text, 'BOAT'::text, 'BOAT_LARGE'::text, 'LADDER_SMALL'::text, 'LADDER_QUINT'::text, 'LADDER_TALL'::text, 'QUINT_TALL'::text, 'PLATFORM'::text, 'PLATFORM_QUINT'::text, 'LADDER_TILLER'::text, 'ARFF'::text, 'FOAM'::text, 'TENDER'::text, 'CREW'::text, 'HELO_GENERAL'::text, 'HELO_FIRE'::text, 'HELO_RESCUE'::text, 'UAS_FIRE'::text, 'UAS_RECON'::text, 'AIR_TANKER'::text, 'AIR_EMS'::text, 'AIR_RECON'::text, 'ALS_AMB'::text, 'BLS_AMB'::text, 'EMS_NOTRANS'::text, 'EMS_SUPV'::text, 'MAB'::text, 'CHIEF_STAFF_COMMAND'::text, 'HAZMAT'::text, 'DECON'::text, 'POV'::text, 'RESCUE_HEAVY'::text, 'RESCUE_MEDIUM'::text, 'RESCUE_LIGHT'::text, 'RESCUE_USAR'::text, 'RESCUE_WATER'::text, 'SCBA'::text, 'AIR_LIGHT'::text, 'REHAB'::text, 'MOBILE_ICP'::text, 'MOBILE_COMMS'::text, 'DOZER'::text, 'OTHER_GROUND'::text, 'ATV_EMS'::text, 'ATV_FIRE'::text, 'INVEST'::text, 'UTIL'::text]))))
);


--
-- Name: apparatus_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apparatus_assignments (
    id integer NOT NULL,
    shift_id integer,
    apparatus_id integer,
    position_id integer,
    member_id integer NOT NULL,
    station_id integer,
    position_name text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer NOT NULL,
    date date NOT NULL,
    hours numeric(5,2),
    start_time text,
    end_time text,
    status text DEFAULT 'on_duty'::text,
    notes text DEFAULT ''::text
);


--
-- Name: apparatus_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.apparatus_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: apparatus_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.apparatus_assignments_id_seq OWNED BY public.apparatus_assignments.id;


--
-- Name: apparatus_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.apparatus_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: apparatus_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.apparatus_id_seq OWNED BY public.apparatus.id;


--
-- Name: apparatus_oos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apparatus_oos (
    id integer NOT NULL,
    station_id integer DEFAULT 1 NOT NULL,
    apparatus_id integer NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    oos_type text DEFAULT 'mechanical'::text,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    estimated_return date,
    impact_level text DEFAULT 'moderate'::text,
    coverage_plan text DEFAULT ''::text,
    reported_by text DEFAULT ''::text,
    status text DEFAULT 'active'::text,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: apparatus_oos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.apparatus_oos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: apparatus_oos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.apparatus_oos_id_seq OWNED BY public.apparatus_oos.id;


--
-- Name: apparatus_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apparatus_positions (
    id integer NOT NULL,
    apparatus_id integer NOT NULL,
    station_id integer,
    position_name text NOT NULL,
    required_certs text DEFAULT '[]'::text,
    min_rank text DEFAULT ''::text,
    sort_order integer DEFAULT 0,
    department_id integer NOT NULL
);


--
-- Name: apparatus_positions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.apparatus_positions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: apparatus_positions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.apparatus_positions_id_seq OWNED BY public.apparatus_positions.id;


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id integer NOT NULL,
    name text NOT NULL,
    category text DEFAULT ''::text,
    condition text DEFAULT 'Serviceable'::text,
    "serialNumber" text DEFAULT ''::text,
    "assignedTo" text,
    location text DEFAULT ''::text,
    "purchaseDate" text DEFAULT ''::text,
    "lastInspection" text DEFAULT ''::text,
    "nextInspectionDue" text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    quantity integer DEFAULT 1,
    department_id integer
);


--
-- Name: assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assets_id_seq OWNED BY public.assets.id;


--
-- Name: assistant_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_alerts (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    member_id integer NOT NULL,
    category text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    title text NOT NULL,
    description text,
    source_type text DEFAULT 'internal_rule'::text,
    source_ref text,
    target_module text,
    target_record_id integer,
    focus_modes jsonb DEFAULT '["on_duty", "off_duty", "officer_mode"]'::jsonb,
    viewed_at timestamp with time zone,
    acted_on boolean DEFAULT false,
    action_taken text,
    suggested_action_url text,
    suggested_action_text text,
    display_priority integer DEFAULT 100,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: assistant_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assistant_alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assistant_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assistant_alerts_id_seq OWNED BY public.assistant_alerts.id;


--
-- Name: assistant_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_feedback (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    member_id integer NOT NULL,
    alert_id integer,
    feedback text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: assistant_feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assistant_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assistant_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assistant_feedback_id_seq OWNED BY public.assistant_feedback.id;


--
-- Name: assistant_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_preferences (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    member_id integer NOT NULL,
    focus_mode text DEFAULT 'off_duty'::text,
    focus_mode_auto boolean DEFAULT true,
    alert_channels jsonb DEFAULT '{"push": false, "in_app": true, "email_daily": false}'::jsonb,
    watch_config jsonb DEFAULT '{}'::jsonb,
    email_connected boolean DEFAULT false,
    email_provider text,
    daily_digest_time time without time zone DEFAULT '06:00:00'::time without time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: assistant_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assistant_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assistant_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assistant_preferences_id_seq OWNED BY public.assistant_preferences.id;


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    module text NOT NULL,
    record_id integer,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_type text,
    file_size integer,
    extracted_text text,
    ai_extracted jsonb,
    description text DEFAULT ''::text,
    uploaded_by text,
    category text DEFAULT 'general'::text,
    is_source boolean DEFAULT false,
    access_level text DEFAULT 'all'::text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attachments_id_seq OWNED BY public.attachments.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    station_id integer DEFAULT 1 NOT NULL,
    user_id integer,
    user_name text DEFAULT ''::text,
    action text NOT NULL,
    table_name text NOT NULL,
    record_id integer,
    detail jsonb DEFAULT '{}'::jsonb,
    at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: avl_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avl_connections (
    id integer NOT NULL,
    department_id integer NOT NULL,
    name text DEFAULT 'AVL Feed'::text NOT NULL,
    vendor_id text DEFAULT 'generic'::text NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    webhook_secret_hash text,
    field_map text DEFAULT '{}'::text NOT NULL,
    last_fix_at timestamp with time zone,
    fixes_ingested integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: avl_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.avl_connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: avl_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.avl_connections_id_seq OWNED BY public.avl_connections.id;


--
-- Name: avl_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avl_devices (
    id integer NOT NULL,
    department_id integer NOT NULL,
    device_ref text NOT NULL,
    apparatus_id integer NOT NULL,
    label text DEFAULT ''::text,
    status text DEFAULT 'Active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: avl_devices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.avl_devices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: avl_devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.avl_devices_id_seq OWNED BY public.avl_devices.id;


--
-- Name: budget_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_lines (
    id integer NOT NULL,
    "lineNumber" text NOT NULL,
    "fiscalYear" integer,
    description text DEFAULT ''::text,
    category text DEFAULT ''::text,
    "budgetedAmount" real DEFAULT 0,
    status text DEFAULT 'Active'::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: budget_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.budget_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: budget_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.budget_lines_id_seq OWNED BY public.budget_lines.id;


--
-- Name: budget_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_transactions (
    id integer NOT NULL,
    "budgetLineId" integer,
    date text NOT NULL,
    "transactionType" text DEFAULT 'Purchase'::text,
    description text DEFAULT ''::text,
    amount real NOT NULL,
    "approvedBy" text DEFAULT ''::text,
    vendor text DEFAULT ''::text,
    "receiptPath" text DEFAULT ''::text,
    status text DEFAULT 'Pending'::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    type text DEFAULT 'Expense'::text,
    category text DEFAULT ''::text,
    subcategory text DEFAULT ''::text,
    "checkNumber" text DEFAULT ''::text,
    department_id integer
);


--
-- Name: budget_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.budget_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: budget_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.budget_transactions_id_seq OWNED BY public.budget_transactions.id;


--
-- Name: bug_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bug_reports (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    user_id integer,
    description text NOT NULL,
    page_route text,
    context_bundle jsonb,
    status text DEFAULT 'pending'::text,
    diagnosis jsonb,
    diagnosis_tokens jsonb,
    diagnosis_duration_ms integer,
    self_heal_status text,
    self_heal_run_id text,
    self_heal_branch text,
    self_heal_pr_url text,
    self_heal_pr_number integer,
    resolution_notes text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bug_reports_self_heal_status_check CHECK ((self_heal_status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT bug_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'diagnosed'::text, 'resolved'::text, 'failed'::text])))
);


--
-- Name: bug_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bug_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bug_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bug_reports_id_seq OWNED BY public.bug_reports.id;


--
-- Name: bulletins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulletins (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    title text NOT NULL,
    body text DEFAULT ''::text,
    category text DEFAULT 'General'::text,
    priority text DEFAULT 'normal'::text,
    pinned boolean DEFAULT false,
    author_id integer,
    author_name text DEFAULT ''::text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: bulletins_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bulletins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bulletins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bulletins_id_seq OWNED BY public.bulletins.id;


--
-- Name: cad_alert_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cad_alert_units (
    id integer NOT NULL,
    department_id integer NOT NULL,
    station_id integer,
    cad_alert_id integer NOT NULL,
    unit_raw text NOT NULL,
    unit_norm text NOT NULL,
    apparatus_id integer,
    ambiguous boolean DEFAULT false NOT NULL,
    seq integer,
    dispatched_at timestamp with time zone,
    enroute_at timestamp with time zone,
    arrived_at timestamp with time zone,
    cleared_at timestamp with time zone,
    source text DEFAULT 'cad'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cad_alert_units_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cad_alert_units_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cad_alert_units_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cad_alert_units_id_seq OWNED BY public.cad_alert_units.id;


--
-- Name: cad_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cad_alerts (
    id integer NOT NULL,
    alert_id text,
    address text DEFAULT ''::text,
    units text DEFAULT ''::text,
    description text DEFAULT ''::text,
    details text DEFAULT ''::text,
    latitude numeric,
    longitude numeric,
    dispatched_at timestamp with time zone DEFAULT now(),
    raw jsonb,
    station_id integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    cleared_at timestamp with time zone,
    department_id integer,
    disposition text,
    cleared_by integer,
    call_answered_at timestamp with time zone,
    call_arrival_at timestamp with time zone
);


--
-- Name: COLUMN cad_alerts.call_answered_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cad_alerts.call_answered_at IS 'PSAP call-answered time from the CAD webhook when carried (P2-D4). Nullable — never invented.';


--
-- Name: COLUMN cad_alerts.call_arrival_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cad_alerts.call_arrival_at IS 'PSAP call-arrival time from the CAD webhook when carried (P2-D4). Nullable — never invented.';


--
-- Name: cad_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cad_alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cad_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cad_alerts_id_seq OWNED BY public.cad_alerts.id;


--
-- Name: cad_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cad_connections (
    id integer NOT NULL,
    "vendorId" text DEFAULT ''::text,
    name text NOT NULL,
    status text DEFAULT 'Inactive'::text,
    host text DEFAULT ''::text,
    "apiKey" text DEFAULT ''::text,
    "syncInterval" text DEFAULT 'Manual only'::text,
    notes text DEFAULT ''::text,
    "incidentsImported" integer DEFAULT 0,
    "lastSync" text,
    "lastSyncResult" text DEFAULT ''::text,
    "fieldMap" text DEFAULT '{}'::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer,
    webhook_secret_hash text
);


--
-- Name: cad_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cad_connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cad_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cad_connections_id_seq OWNED BY public.cad_connections.id;


--
-- Name: cadets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cadets (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    name text NOT NULL,
    date_of_birth date,
    parent_guardian text DEFAULT ''::text,
    parent_phone text DEFAULT ''::text,
    parent_email text DEFAULT ''::text,
    school text DEFAULT ''::text,
    enrolled_date date DEFAULT CURRENT_DATE,
    status text DEFAULT 'Active'::text,
    rank text DEFAULT 'Cadet'::text,
    notes text DEFAULT ''::text,
    certifications jsonb DEFAULT '[]'::jsonb,
    training_hours numeric(8,1) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: cadets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cadets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cadets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cadets_id_seq OWNED BY public.cadets.id;


--
-- Name: calendar_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_subscriptions (
    id integer NOT NULL,
    member_id integer,
    station_id integer DEFAULT 1,
    cal_token text NOT NULL,
    tier text DEFAULT 'member'::text,
    categories jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    last_fetched_at timestamp with time zone,
    department_id integer
);


--
-- Name: calendar_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.calendar_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: calendar_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.calendar_subscriptions_id_seq OWNED BY public.calendar_subscriptions.id;


--
-- Name: checklist_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_completions (
    id integer NOT NULL,
    "templateId" integer,
    "templateName" text DEFAULT ''::text,
    apparatus text DEFAULT ''::text,
    frequency text DEFAULT ''::text,
    "completedDate" text NOT NULL,
    "completedBy" text DEFAULT ''::text,
    status text DEFAULT 'Pass'::text,
    notes text DEFAULT ''::text,
    responses jsonb DEFAULT '{}'::jsonb,
    station_id integer DEFAULT 1,
    "createdAt" timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: checklist_completions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.checklist_completions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: checklist_completions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.checklist_completions_id_seq OWNED BY public.checklist_completions.id;


--
-- Name: checklist_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_templates (
    id integer NOT NULL,
    name text NOT NULL,
    apparatus text DEFAULT ''::text,
    frequency text DEFAULT 'Daily'::text,
    "estimatedMinutes" integer DEFAULT 15,
    categories jsonb DEFAULT '[]'::jsonb,
    station_id integer DEFAULT 1,
    "createdAt" timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: checklist_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.checklist_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: checklist_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.checklist_templates_id_seq OWNED BY public.checklist_templates.id;


--
-- Name: community_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_events (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    title text NOT NULL,
    event_type text DEFAULT 'Other'::text,
    date date,
    start_time text,
    end_time text,
    location text DEFAULT ''::text,
    address text DEFAULT ''::text,
    audience_type text DEFAULT 'mixed'::text,
    audience_age_range text DEFAULT ''::text,
    estimated_attendance integer DEFAULT 0,
    actual_attendance integer,
    partner_org text DEFAULT ''::text,
    partner_contact_name text DEFAULT ''::text,
    partner_contact_phone text DEFAULT ''::text,
    partner_contact_email text DEFAULT ''::text,
    apparatus_needed jsonb DEFAULT '[]'::jsonb,
    equipment_needed jsonb DEFAULT '[]'::jsonb,
    materials_needed jsonb DEFAULT '[]'::jsonb,
    assigned_members jsonb DEFAULT '[]'::jsonb,
    lead_member_id integer,
    safety_checklist jsonb DEFAULT '[]'::jsonb,
    safety_notes text DEFAULT ''::text,
    special_accommodations text DEFAULT ''::text,
    materials_distributed jsonb DEFAULT '[]'::jsonb,
    photos_taken boolean DEFAULT false,
    media_coverage text DEFAULT ''::text,
    follow_up_notes text DEFAULT ''::text,
    follow_up_date date,
    volunteer_hours numeric(6,1) DEFAULT 0,
    detectors_installed integer DEFAULT 0,
    cpr_certifications integer DEFAULT 0,
    escape_plans_created integer DEFAULT 0,
    status text DEFAULT 'planned'::text,
    recurring text DEFAULT 'none'::text,
    recurring_notes text DEFAULT ''::text,
    description text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: community_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_events_id_seq OWNED BY public.community_events.id;


--
-- Name: correspondence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.correspondence (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    module text NOT NULL,
    record_id integer NOT NULL,
    entry_type text DEFAULT 'email'::text NOT NULL,
    from_name text DEFAULT ''::text,
    subject text DEFAULT ''::text,
    body text DEFAULT ''::text,
    file_name text DEFAULT ''::text,
    file_url text DEFAULT ''::text,
    file_size integer DEFAULT 0,
    entered_by text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: correspondence_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.correspondence_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: correspondence_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.correspondence_id_seq OWNED BY public.correspondence.id;


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id integer NOT NULL,
    "courseName" text NOT NULL,
    type text DEFAULT ''::text,
    provider text DEFAULT ''::text,
    "startDate" text,
    "endDate" text,
    location text DEFAULT ''::text,
    "certificationEarned" text DEFAULT ''::text,
    "certExpireYears" integer DEFAULT 0,
    cost integer DEFAULT 0,
    instructor text DEFAULT ''::text,
    attendees text DEFAULT '[]'::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: courses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.courses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: courses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.courses_id_seq OWNED BY public.courses.id;


--
-- Name: coverage_outreach; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coverage_outreach (
    id integer NOT NULL,
    "leaveRequestId" integer NOT NULL,
    "shiftId" integer NOT NULL,
    "memberId" integer NOT NULL,
    "memberName" text NOT NULL,
    "contactMethod" text DEFAULT 'sms'::text,
    status text DEFAULT 'Pending'::text,
    "sentAt" timestamp with time zone,
    "respondedAt" timestamp with time zone,
    response text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    station_id integer DEFAULT 1,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: coverage_outreach_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coverage_outreach_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coverage_outreach_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coverage_outreach_id_seq OWNED BY public.coverage_outreach.id;


--
-- Name: crr_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crr_programs (
    id integer NOT NULL,
    name text NOT NULL,
    coordinator text DEFAULT ''::text,
    "startDate" text,
    "endDate" text,
    budget real,
    status text DEFAULT 'Active'::text,
    description text DEFAULT ''::text,
    participants text DEFAULT '[]'::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: crr_programs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crr_programs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crr_programs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crr_programs_id_seq OWNED BY public.crr_programs.id;


--
-- Name: crr_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crr_visits (
    id integer NOT NULL,
    date text NOT NULL,
    location text DEFAULT ''::text,
    reason text DEFAULT ''::text,
    "memberPresent" text DEFAULT '[]'::text,
    "visitDuration" real DEFAULT 0,
    status text DEFAULT 'Completed'::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: crr_visits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crr_visits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crr_visits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crr_visits_id_seq OWNED BY public.crr_visits.id;


--
-- Name: cylinders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cylinders (
    id integer NOT NULL,
    "unitId" text NOT NULL,
    make text DEFAULT ''::text,
    model text DEFAULT ''::text,
    size text DEFAULT ''::text,
    material text DEFAULT ''::text,
    serial text DEFAULT ''::text,
    "manufactureYear" integer DEFAULT 0,
    "currentPressure" integer DEFAULT 0,
    "maxPressure" integer DEFAULT 4500,
    "lastHydroDate" text DEFAULT ''::text,
    "nextHydroDate" text DEFAULT ''::text,
    "lastInspectionDate" text DEFAULT ''::text,
    "nextInspectionDate" text DEFAULT ''::text,
    "assignedMember" text DEFAULT ''::text,
    "assignedUnit" text DEFAULT ''::text,
    status text DEFAULT 'In Service'::text,
    notes text DEFAULT ''::text,
    "fillLog" text DEFAULT '[]'::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: cylinders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cylinders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cylinders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cylinders_id_seq OWNED BY public.cylinders.id;


--
-- Name: daily_staffing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_staffing (
    id integer NOT NULL,
    station_id integer DEFAULT 1 NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    member_id integer NOT NULL,
    "position" text DEFAULT ''::text,
    apparatus_id integer,
    status text DEFAULT 'on_duty'::text,
    start_time text DEFAULT '08:00'::text,
    end_time text DEFAULT '08:00'::text,
    hours numeric(5,2) DEFAULT 24,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: daily_staffing_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_staffing_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_staffing_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_staffing_id_seq OWNED BY public.daily_staffing.id;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id integer NOT NULL,
    name text NOT NULL,
    fdid text DEFAULT ''::text,
    dept_type text DEFAULT ''::text,
    plan_tier text DEFAULT ''::text,
    flsa_work_period integer,
    flsa_ot_threshold numeric,
    flsa_period_start text,
    ai_daily_token_budget integer,
    tv_pin text,
    stripe_customer_id text DEFAULT ''::text,
    stripe_subscription_id text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    shift_pattern text,
    allow_rig_status boolean DEFAULT true NOT NULL,
    cad_auto_expire_hours integer,
    status_timer_config jsonb,
    par_interval_default_min integer,
    neris_id text DEFAULT ''::text,
    neris_submission_enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT departments_par_interval_default_chk CHECK (((par_interval_default_min IS NULL) OR ((par_interval_default_min >= 1) AND (par_interval_default_min <= 180))))
);


--
-- Name: COLUMN departments.par_interval_default_min; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.departments.par_interval_default_min IS 'Department SOG default for the Command Board PAR interval (minutes, 1-180). NULL = no timer until command sets one (there is no NFPA-mandated interval — never hardcode one). Pre-fills a newly activated board; command keeps the per-incident override.';


--
-- Name: departments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;


--
-- Name: dept_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dept_documents (
    id integer NOT NULL,
    station_id integer DEFAULT 1 NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    category text DEFAULT 'general'::text,
    doc_type text DEFAULT 'policy'::text,
    description text DEFAULT ''::text,
    version text DEFAULT '1.0'::text,
    effective_date date,
    review_date date,
    file_ref text DEFAULT ''::text,
    content text DEFAULT ''::text,
    tags jsonb DEFAULT '[]'::jsonb,
    uploaded_by text DEFAULT ''::text,
    status text DEFAULT 'active'::text,
    access_level text DEFAULT 'all'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: dept_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dept_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dept_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dept_documents_id_seq OWNED BY public.dept_documents.id;


--
-- Name: donations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.donations (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    campaign_id integer,
    donor_name text NOT NULL,
    donor_email text DEFAULT ''::text,
    donor_phone text DEFAULT ''::text,
    donor_address text DEFAULT ''::text,
    amount numeric(12,2) NOT NULL,
    method text DEFAULT 'Check'::text,
    reference text DEFAULT ''::text,
    receipt_sent boolean DEFAULT false,
    notes text DEFAULT ''::text,
    donated_at date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: donations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.donations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: donations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.donations_id_seq OWNED BY public.donations.id;


--
-- Name: drills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drills (
    id integer NOT NULL,
    title text NOT NULL,
    type text DEFAULT ''::text,
    date text NOT NULL,
    "startTime" text DEFAULT ''::text,
    duration integer DEFAULT 0,
    location text DEFAULT ''::text,
    instructor text DEFAULT ''::text,
    objectives text DEFAULT '[]'::text,
    attendees text DEFAULT '[]'::text,
    "isoHours" boolean DEFAULT true,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: drills_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.drills_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: drills_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.drills_id_seq OWNED BY public.drills.id;


--
-- Name: equipment_checkout; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_checkout (
    id integer NOT NULL,
    station_id integer,
    item_name text NOT NULL,
    item_type text DEFAULT 'radio'::text,
    serial_number text,
    asset_tag text,
    checked_out_by integer,
    checked_out_at timestamp with time zone DEFAULT now(),
    expected_return timestamp with time zone,
    returned_at timestamp with time zone,
    returned_to text,
    condition_out text DEFAULT 'good'::text,
    condition_in text,
    purpose text,
    notes text,
    status text DEFAULT 'checked_out'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: equipment_checkout_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equipment_checkout_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipment_checkout_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equipment_checkout_id_seq OWNED BY public.equipment_checkout.id;


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id integer NOT NULL,
    title text NOT NULL,
    type text DEFAULT 'Other'::text,
    date text NOT NULL,
    "startTime" text DEFAULT ''::text,
    "endTime" text DEFAULT ''::text,
    location text DEFAULT ''::text,
    organizer text DEFAULT ''::text,
    description text DEFAULT ''::text,
    "maxAttendees" integer,
    rsvps text DEFAULT '[]'::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    rrule text,
    recurrence_id integer,
    original_date text,
    is_cancelled boolean DEFAULT false,
    department_id integer
);


--
-- Name: events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.events_id_seq OWNED BY public.events.id;


--
-- Name: exam_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_assignments (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    exam_id integer,
    user_id integer,
    assigned_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: exam_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_assignments_id_seq OWNED BY public.exam_assignments.id;


--
-- Name: exam_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_submissions (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    exam_id integer,
    user_id integer,
    score integer DEFAULT 0,
    passed boolean DEFAULT false,
    answers jsonb DEFAULT '[]'::jsonb,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone DEFAULT now(),
    time_spent integer DEFAULT 0,
    department_id integer
);


--
-- Name: exam_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_submissions_id_seq OWNED BY public.exam_submissions.id;


--
-- Name: exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exams (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    title text NOT NULL,
    description text DEFAULT ''::text,
    category text DEFAULT 'General'::text,
    time_limit integer DEFAULT 0,
    passing_score integer DEFAULT 70,
    randomize boolean DEFAULT true,
    questions jsonb DEFAULT '[]'::jsonb,
    created_by integer,
    status text DEFAULT 'draft'::text,
    due_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: exams_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exams_id_seq OWNED BY public.exams.id;


--
-- Name: expo_push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expo_push_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    station_id integer NOT NULL,
    department_id integer NOT NULL,
    token text NOT NULL,
    device_name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: expo_push_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.expo_push_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expo_push_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.expo_push_tokens_id_seq OWNED BY public.expo_push_tokens.id;


--
-- Name: exposure_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exposure_records (
    id integer NOT NULL,
    member_id integer NOT NULL,
    station_id integer NOT NULL,
    incident_id integer,
    exposure_date text NOT NULL,
    exposure_type text NOT NULL,
    substance text DEFAULT ''::text,
    duration_minutes integer DEFAULT 0,
    ppe_worn text DEFAULT '[]'::text,
    symptoms text DEFAULT ''::text,
    medical_followup boolean DEFAULT false,
    followup_date text DEFAULT ''::text,
    followup_notes text DEFAULT ''::text,
    reported_by text DEFAULT ''::text,
    status text DEFAULT 'reported'::text,
    created_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    department_id integer
);


--
-- Name: exposure_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exposure_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exposure_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exposure_records_id_seq OWNED BY public.exposure_records.id;


--
-- Name: fi_checklist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_checklist_items (
    id integer NOT NULL,
    department_id integer NOT NULL,
    checklist_id integer NOT NULL,
    prompt text NOT NULL,
    code_ref_id integer,
    required boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fi_checklist_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_checklist_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_checklist_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_checklist_items_id_seq OWNED BY public.fi_checklist_items.id;


--
-- Name: fi_checklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_checklists (
    id integer NOT NULL,
    department_id integer NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: fi_checklists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_checklists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_checklists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_checklists_id_seq OWNED BY public.fi_checklists.id;


--
-- Name: fi_code_library; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_code_library (
    id integer NOT NULL,
    department_id integer NOT NULL,
    code text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    category text DEFAULT ''::text NOT NULL,
    code_body text DEFAULT ''::text NOT NULL,
    edition text DEFAULT ''::text NOT NULL,
    section text DEFAULT ''::text NOT NULL,
    link_url text DEFAULT ''::text NOT NULL,
    remediation_text text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: fi_code_library_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_code_library_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_code_library_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_code_library_id_seq OWNED BY public.fi_code_library.id;


--
-- Name: fi_designations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_designations (
    id integer NOT NULL,
    department_id integer NOT NULL,
    user_id integer NOT NULL,
    role text NOT NULL,
    granted_by_user_id integer,
    granted_by text DEFAULT ''::text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by text DEFAULT ''::text NOT NULL,
    CONSTRAINT fi_designations_role_check CHECK ((role = ANY (ARRAY['inspector'::text, 'prevention_admin'::text])))
);


--
-- Name: fi_designations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_designations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_designations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_designations_id_seq OWNED BY public.fi_designations.id;


--
-- Name: fi_inspection_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_inspection_answers (
    id integer NOT NULL,
    department_id integer NOT NULL,
    inspection_id integer NOT NULL,
    checklist_id integer,
    item_id integer,
    prompt text NOT NULL,
    code_snapshot text DEFAULT ''::text NOT NULL,
    answer text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    answered_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fi_inspection_answers_answer_check CHECK ((answer = ANY (ARRAY['yes'::text, 'no'::text, 'na'::text])))
);


--
-- Name: fi_inspection_answers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_inspection_answers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_inspection_answers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_inspection_answers_id_seq OWNED BY public.fi_inspection_answers.id;


--
-- Name: fi_inspection_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_inspection_types (
    id integer NOT NULL,
    department_id integer NOT NULL,
    name text NOT NULL,
    default_frequency_days integer,
    default_checklist_id integer,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: fi_inspection_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_inspection_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_inspection_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_inspection_types_id_seq OWNED BY public.fi_inspection_types.id;


--
-- Name: fi_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_inspections (
    id integer NOT NULL,
    "propertyId" integer NOT NULL,
    type text DEFAULT 'Annual Inspection'::text,
    "inspectorName" text DEFAULT ''::text,
    "scheduledDate" text,
    "completedDate" text,
    result text,
    violations text DEFAULT '[]'::text,
    "followUpDate" text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer,
    deleted_at timestamp with time zone,
    assigned_to_user_id integer,
    result_code text,
    CONSTRAINT fi_inspections_result_code_chk CHECK (((result_code IS NULL) OR (result_code = ANY (ARRAY['PASS'::text, 'FAIL'::text, 'REINSPECTION_REQUIRED'::text, 'NOT_COMPLETED'::text]))))
);


--
-- Name: fi_inspections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_inspections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_inspections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_inspections_id_seq OWNED BY public.fi_inspections.id;


--
-- Name: fi_notice_service; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_notice_service (
    id integer NOT NULL,
    department_id integer NOT NULL,
    inspection_id integer NOT NULL,
    notice_id integer,
    method text NOT NULL,
    outcome text NOT NULL,
    attempt_seq integer DEFAULT 1 NOT NULL,
    served_at timestamp with time zone DEFAULT now() NOT NULL,
    served_by_user_id integer,
    served_by text DEFAULT ''::text NOT NULL,
    servee_name text DEFAULT ''::text NOT NULL,
    servee_relationship text DEFAULT ''::text NOT NULL,
    address_used text DEFAULT ''::text NOT NULL,
    address_source text DEFAULT ''::text NOT NULL,
    posting_photo bytea,
    posting_lat double precision,
    posting_lng double precision,
    posting_accuracy_m double precision,
    posting_location_desc text DEFAULT ''::text NOT NULL,
    mail_class text DEFAULT ''::text NOT NULL,
    mail_tracking_number text DEFAULT ''::text NOT NULL,
    mail_accepted_at timestamp with time zone,
    mail_delivered_at timestamp with time zone,
    mail_returned_at timestamp with time zone,
    return_receipt_pdf bytea,
    delivery_signature bytea,
    delivered_address text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    voided_at timestamp with time zone,
    void_reason text DEFAULT ''::text NOT NULL,
    CONSTRAINT fi_notice_service_method_chk CHECK ((method = ANY (ARRAY['personal_service'::text, 'left_with_responsible_person'::text, 'posted_premises'::text, 'certified_mail'::text, 'first_class_mail'::text, 'certificate_of_mailing'::text, 'email'::text]))),
    CONSTRAINT fi_notice_service_outcome_chk CHECK ((outcome = ANY (ARRAY['served'::text, 'refused_signature'::text, 'refused_acceptance'::text, 'no_party_present'::text, 'mailed'::text, 'accepted'::text, 'delivered'::text, 'returned_undelivered'::text, 'unclaimed'::text, 'posted'::text])))
);


--
-- Name: fi_notice_service_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_notice_service_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_notice_service_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_notice_service_id_seq OWNED BY public.fi_notice_service.id;


--
-- Name: fi_notices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_notices (
    id integer NOT NULL,
    department_id integer NOT NULL,
    inspection_id integer NOT NULL,
    storage_path text DEFAULT ''::text NOT NULL,
    generated_by_user_id integer,
    generated_by text DEFAULT ''::text NOT NULL,
    sent_to text DEFAULT ''::text NOT NULL,
    sent_at timestamp with time zone,
    method text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pdf bytea,
    file_name text DEFAULT ''::text NOT NULL,
    source text DEFAULT 'server'::text NOT NULL,
    sha256 text DEFAULT ''::text NOT NULL,
    CONSTRAINT fi_notices_source_chk CHECK ((source = ANY (ARRAY['server'::text, 'device'::text])))
);


--
-- Name: fi_notices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_notices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_notices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_notices_id_seq OWNED BY public.fi_notices.id;


--
-- Name: fi_permits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_permits (
    id integer NOT NULL,
    "propertyId" integer NOT NULL,
    type text NOT NULL,
    "permitNumber" text DEFAULT ''::text,
    "issuedDate" text,
    "expiresDate" text,
    status text DEFAULT 'Active'::text,
    "issuedBy" text DEFAULT ''::text,
    fee real,
    conditions text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer,
    deleted_at timestamp with time zone
);


--
-- Name: fi_permits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_permits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_permits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_permits_id_seq OWNED BY public.fi_permits.id;


--
-- Name: fi_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_properties (
    id integer NOT NULL,
    name text NOT NULL,
    address text DEFAULT ''::text,
    "occupancyType" text DEFAULT ''::text,
    "propertyUseCode" text DEFAULT ''::text,
    "ownerName" text DEFAULT ''::text,
    "ownerPhone" text DEFAULT ''::text,
    "ownerEmail" text DEFAULT ''::text,
    "contactName" text DEFAULT ''::text,
    "contactPhone" text DEFAULT ''::text,
    "squareFootage" integer,
    stories integer DEFAULT 1,
    "occupantLoad" integer,
    sprinklered boolean DEFAULT false,
    "alarmMonitored" boolean DEFAULT false,
    "hazmatOnsite" boolean DEFAULT false,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer,
    deleted_at timestamp with time zone
);


--
-- Name: fi_properties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_properties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_properties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_properties_id_seq OWNED BY public.fi_properties.id;


--
-- Name: fi_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_settings (
    department_id integer NOT NULL,
    allow_crew_inspections boolean DEFAULT true NOT NULL,
    admin_only_commit boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notice_header text DEFAULT ''::text NOT NULL,
    notice_body text DEFAULT ''::text NOT NULL,
    notice_legalese text DEFAULT ''::text NOT NULL,
    notice_passed_body text DEFAULT ''::text NOT NULL,
    notice_footer text DEFAULT ''::text NOT NULL,
    signature_agreement_text text DEFAULT ''::text NOT NULL,
    require_inspector_signature boolean DEFAULT true NOT NULL,
    require_recipient_signature boolean DEFAULT false NOT NULL,
    refusal_advisement_text text DEFAULT ''::text NOT NULL,
    certificate_of_service_text text DEFAULT ''::text NOT NULL
);


--
-- Name: fi_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_signatures (
    id integer NOT NULL,
    department_id integer NOT NULL,
    inspection_id integer NOT NULL,
    role text NOT NULL,
    signer_name text DEFAULT ''::text NOT NULL,
    storage_path text DEFAULT ''::text NOT NULL,
    signed_at timestamp with time zone DEFAULT now() NOT NULL,
    image bytea,
    signed_by_user_id integer,
    status text DEFAULT 'signed'::text NOT NULL,
    signer_role_label text DEFAULT ''::text NOT NULL,
    refusal_reason text DEFAULT ''::text NOT NULL,
    advisements_read boolean DEFAULT false NOT NULL,
    document_sha256 text DEFAULT ''::text NOT NULL,
    consent_text text DEFAULT ''::text NOT NULL,
    device_label text DEFAULT ''::text NOT NULL,
    gps_lat double precision,
    gps_lng double precision,
    gps_accuracy_m double precision,
    CONSTRAINT fi_signatures_role_check CHECK ((role = ANY (ARRAY['occupant'::text, 'inspector'::text]))),
    CONSTRAINT fi_signatures_status_chk CHECK ((status = ANY (ARRAY['signed'::text, 'refused'::text, 'unable_no_party_present'::text, 'unable_other'::text, 'declined_by_policy'::text])))
);


--
-- Name: fi_signatures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_signatures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_signatures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_signatures_id_seq OWNED BY public.fi_signatures.id;


--
-- Name: fi_sync_ops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_sync_ops (
    id integer NOT NULL,
    department_id integer NOT NULL,
    client_id text NOT NULL,
    op text NOT NULL,
    inspection_id integer,
    result_id integer,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fi_sync_ops_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_sync_ops_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_sync_ops_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_sync_ops_id_seq OWNED BY public.fi_sync_ops.id;


--
-- Name: fi_violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fi_violations (
    id integer NOT NULL,
    department_id integer NOT NULL,
    inspection_id integer NOT NULL,
    violation_key text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    code text,
    description text,
    status text DEFAULT 'Open'::text NOT NULL,
    status_raw text,
    notes text,
    reported_date date,
    sched_recheck_date date,
    actual_recheck_date date,
    next_recheck_date date,
    repaired_date date,
    imminent_hazard boolean DEFAULT false NOT NULL,
    carried_from_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: fi_violations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fi_violations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fi_violations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fi_violations_id_seq OWNED BY public.fi_violations.id;


--
-- Name: fill_stations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fill_stations (
    id integer NOT NULL,
    name text NOT NULL,
    type text DEFAULT ''::text,
    "bankPressure" integer,
    "maxPressure" integer DEFAULT 4500,
    "lastInspectionDate" text DEFAULT ''::text,
    "nextInspectionDate" text DEFAULT ''::text,
    status text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: fill_stations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fill_stations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fill_stations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fill_stations_id_seq OWNED BY public.fill_stations.id;


--
-- Name: fs_hazmat_guides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fs_hazmat_guides (
    id integer NOT NULL,
    guide_number integer NOT NULL,
    title text NOT NULL,
    hazard_class text,
    fire_explosion text,
    health_hazards text,
    public_safety text,
    protective_clothing text,
    evacuation text,
    fire_response text,
    spill_response text,
    first_aid text,
    ppe_level text,
    special_hazards text,
    needs_proximity_suit boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fs_hazmat_guides_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fs_hazmat_guides_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fs_hazmat_guides_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fs_hazmat_guides_id_seq OWNED BY public.fs_hazmat_guides.id;


--
-- Name: fs_hazmat_incident_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fs_hazmat_incident_audit (
    id integer NOT NULL,
    incident_id integer NOT NULL,
    field_changed character varying(64) NOT NULL,
    old_value text,
    new_value text,
    changed_by integer,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    department_id integer
);


--
-- Name: fs_hazmat_incident_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fs_hazmat_incident_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fs_hazmat_incident_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fs_hazmat_incident_audit_id_seq OWNED BY public.fs_hazmat_incident_audit.id;


--
-- Name: fs_hazmat_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fs_hazmat_incidents (
    id integer NOT NULL,
    station_id integer,
    incident_number text,
    address text,
    material_name text,
    un_number character varying(10),
    guide_number integer,
    hazard_class text,
    quantity text,
    container_type text,
    release_type text,
    ppe_level text,
    isolation_zone_m integer,
    status text DEFAULT 'active'::text,
    declared_at timestamp with time zone DEFAULT now(),
    mitigated_at timestamp with time zone,
    notes text,
    crew_in_hot_zone text[],
    notifications_sent text[],
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    location_address text,
    location_lat numeric,
    location_lon numeric,
    quantity_estimate text,
    wind_direction text,
    wind_speed_mph numeric,
    temperature_f numeric,
    ic_user_id integer,
    responders_count integer,
    evacuation_distance_m integer,
    resolved_at timestamp with time zone,
    department_id integer
);


--
-- Name: fs_hazmat_incidents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fs_hazmat_incidents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fs_hazmat_incidents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fs_hazmat_incidents_id_seq OWNED BY public.fs_hazmat_incidents.id;


--
-- Name: fs_hazmat_isolation_distances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fs_hazmat_isolation_distances (
    id integer NOT NULL,
    un_number character varying(10) NOT NULL,
    name text NOT NULL,
    guide_number integer,
    small_spill_isolate_m integer,
    small_spill_day_km numeric,
    small_spill_night_km numeric,
    large_spill_isolate_m integer,
    large_spill_day_km numeric,
    large_spill_night_km numeric,
    fire_isolate_m integer,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fs_hazmat_isolation_distances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fs_hazmat_isolation_distances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fs_hazmat_isolation_distances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fs_hazmat_isolation_distances_id_seq OWNED BY public.fs_hazmat_isolation_distances.id;


--
-- Name: fs_hazmat_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fs_hazmat_materials (
    id integer NOT NULL,
    name text NOT NULL,
    un_number character varying(10),
    na_number character varying(10),
    cas_number character varying(20),
    guide_number integer,
    hazard_class character varying(10),
    hazard_division character varying(10),
    is_tih boolean DEFAULT false,
    is_water_reactive boolean DEFAULT false,
    physical_state text,
    color text,
    odor text,
    flash_point_c numeric,
    boiling_point_c numeric,
    idlh_ppm numeric,
    tlv_twa_ppm numeric,
    synonyms text[],
    created_at timestamp with time zone DEFAULT now(),
    polymerization_hazard boolean DEFAULT false,
    is_pyrophoric boolean DEFAULT false,
    stel_ppm numeric,
    ceiling_ppm numeric,
    is_carcinogen boolean DEFAULT false,
    carcinogen_class text,
    idlh_mg_m3 numeric,
    vapor_density numeric,
    vapor_pressure_mmhg numeric,
    vapor_pressure_temp_c numeric,
    specific_gravity numeric,
    melting_point_c numeric,
    autoignition_temp_c numeric,
    lel_pct numeric,
    lel_unit text,
    uel_pct numeric,
    uel_unit text,
    molecular_formula text,
    molecular_weight_g_mol numeric,
    iupac_name text,
    inchi_key text,
    smiles text,
    water_solubility text,
    incompatibilities text[],
    ghs_pictograms text[],
    ghs_signal_word text,
    ghs_hazards text[],
    enriched_at text,
    data_sources jsonb,
    pubchem_cid integer
);


--
-- Name: fs_hazmat_materials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fs_hazmat_materials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fs_hazmat_materials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fs_hazmat_materials_id_seq OWNED BY public.fs_hazmat_materials.id;


--
-- Name: fs_hazmat_table3_distances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fs_hazmat_table3_distances (
    id integer NOT NULL,
    un_number character varying(10) NOT NULL,
    container_type character varying(100) NOT NULL,
    isolate_m integer NOT NULL,
    isolate_ft integer NOT NULL,
    day_low_km text NOT NULL,
    day_mod_km text NOT NULL,
    day_high_km text NOT NULL,
    night_low_km text NOT NULL,
    night_mod_km text NOT NULL,
    night_high_km text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fs_hazmat_table3_distances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fs_hazmat_table3_distances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fs_hazmat_table3_distances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fs_hazmat_table3_distances_id_seq OWNED BY public.fs_hazmat_table3_distances.id;


--
-- Name: fs_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fs_inspections (
    id integer NOT NULL,
    station_id integer,
    propertyid integer,
    type character varying(50),
    inspectorname character varying(255),
    scheduleddate date,
    completeddate date,
    result character varying(50),
    violations jsonb DEFAULT '[]'::jsonb,
    followupdate date,
    notes text,
    createdat timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updatedat timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: fs_inspections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fs_inspections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fs_inspections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fs_inspections_id_seq OWNED BY public.fs_inspections.id;


--
-- Name: fs_permits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fs_permits (
    id integer NOT NULL,
    station_id integer,
    propertyid integer,
    type character varying(100),
    permitnumber character varying(100),
    issueddate date,
    expiresdate date,
    status character varying(50),
    issuedby character varying(255),
    fee numeric(10,2),
    conditions text,
    notes text,
    createdat timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updatedat timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: fs_permits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fs_permits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fs_permits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fs_permits_id_seq OWNED BY public.fs_permits.id;


--
-- Name: fs_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fs_properties (
    id integer NOT NULL,
    station_id integer,
    name character varying(255) NOT NULL,
    address text,
    occupancytype character varying(100),
    propertyusecode character varying(50),
    ownername character varying(255),
    ownerphone character varying(20),
    owneremail character varying(255),
    contactname character varying(255),
    contactphone character varying(20),
    squarefootage integer,
    stories integer,
    occupantload integer,
    sprinklered boolean DEFAULT false,
    alarmmonitored boolean DEFAULT false,
    hazmatonsite boolean DEFAULT false,
    notes text,
    createdat timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updatedat timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: fs_properties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fs_properties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fs_properties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fs_properties_id_seq OWNED BY public.fs_properties.id;


--
-- Name: fto_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fto_evaluations (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    member_id integer NOT NULL,
    skill_id text NOT NULL,
    skill_name text DEFAULT ''::text,
    category text DEFAULT ''::text,
    result text DEFAULT 'Not Evaluated'::text,
    evaluated_by text DEFAULT ''::text,
    evaluated_at timestamp with time zone DEFAULT now(),
    notes text DEFAULT ''::text,
    department_id integer
);


--
-- Name: fto_evaluations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fto_evaluations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fto_evaluations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fto_evaluations_id_seq OWNED BY public.fto_evaluations.id;


--
-- Name: fto_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fto_observations (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    member_id integer NOT NULL,
    category text DEFAULT 'General'::text,
    note text NOT NULL,
    observed_by text DEFAULT ''::text,
    observed_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: fto_observations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fto_observations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fto_observations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fto_observations_id_seq OWNED BY public.fto_observations.id;


--
-- Name: fundraising_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fundraising_campaigns (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    name text NOT NULL,
    description text DEFAULT ''::text,
    type text DEFAULT 'Fund Drive'::text,
    goal_amount numeric(12,2) DEFAULT 0,
    raised_amount numeric(12,2) DEFAULT 0,
    start_date date,
    end_date date,
    status text DEFAULT 'Planning'::text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: fundraising_campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fundraising_campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fundraising_campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fundraising_campaigns_id_seq OWNED BY public.fundraising_campaigns.id;


--
-- Name: grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grants (
    id integer NOT NULL,
    "grantName" text NOT NULL,
    type text DEFAULT ''::text,
    "fundingAgency" text DEFAULT ''::text,
    "programYear" integer,
    status text DEFAULT 'Planning'::text,
    "applicationDate" text,
    "awardDate" text,
    "amountRequested" real DEFAULT 0,
    "amountAwarded" real,
    "matchRequired" boolean DEFAULT false,
    "matchPercent" real DEFAULT 0,
    "matchAmount" real,
    "grantPeriodStart" text,
    "grantPeriodEnd" text,
    "reportingDeadlines" text DEFAULT '[]'::text,
    expenditures text DEFAULT '[]'::text,
    "contactName" text DEFAULT ''::text,
    "contactEmail" text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: grants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grants_id_seq OWNED BY public.grants.id;


--
-- Name: grievances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grievances (
    id integer NOT NULL,
    station_id integer DEFAULT 1 NOT NULL,
    grievance_number text DEFAULT ''::text,
    filed_by integer,
    filed_date date DEFAULT CURRENT_DATE,
    cba_article text DEFAULT ''::text,
    subject text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text,
    grievance_type text DEFAULT 'contract_violation'::text,
    current_step text DEFAULT 'step_1'::text,
    status text DEFAULT 'open'::text,
    resolution text DEFAULT ''::text,
    resolved_date date,
    assigned_to text DEFAULT ''::text,
    union_rep text DEFAULT ''::text,
    management_rep text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    timeline jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    department_id integer
);


--
-- Name: grievances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grievances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grievances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grievances_id_seq OWNED BY public.grievances.id;


--
-- Name: hydrants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hydrants (
    id integer NOT NULL,
    "hydrantNumber" text NOT NULL,
    "streetAddress" text DEFAULT ''::text,
    intersection text DEFAULT ''::text,
    city text DEFAULT ''::text,
    state text DEFAULT ''::text,
    zip text DEFAULT ''::text,
    type text DEFAULT 'Dry Barrel'::text,
    manufacturer text DEFAULT ''::text,
    model text DEFAULT ''::text,
    "yearInstalled" integer,
    "mainSize" text DEFAULT ''::text,
    "outletSize" text DEFAULT ''::text,
    "numOutlets" integer DEFAULT 2,
    status text DEFAULT 'In Service'::text,
    "staticPressure" real,
    "residualPressure" real,
    "flowRate" real,
    "lastTestDate" text,
    "nextTestDue" text,
    "testedBy" text DEFAULT ''::text,
    "lastInspectionDate" text,
    "ownedBy" text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer,
    lat real,
    lng real
);


--
-- Name: hydrants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hydrants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hydrants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hydrants_id_seq OWNED BY public.hydrants.id;


--
-- Name: identity_backfill_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identity_backfill_log (
    id bigint NOT NULL,
    run_tag text NOT NULL,
    member_id integer NOT NULL,
    user_id integer NOT NULL,
    matched_key text NOT NULL,
    ran_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: identity_backfill_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.identity_backfill_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: identity_backfill_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.identity_backfill_log_id_seq OWNED BY public.identity_backfill_log.id;


--
-- Name: incident_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incident_costs (
    id integer NOT NULL,
    station_id integer,
    incident_id integer,
    incident_number text,
    incident_date date,
    incident_type text,
    location text,
    apparatus_costs jsonb DEFAULT '[]'::jsonb,
    personnel_costs jsonb DEFAULT '[]'::jsonb,
    material_costs jsonb DEFAULT '[]'::jsonb,
    other_costs jsonb DEFAULT '[]'::jsonb,
    total_cost numeric(12,2) DEFAULT 0,
    billable boolean DEFAULT false,
    billed_to text,
    invoice_number text,
    payment_status text DEFAULT 'not_billed'::text,
    notes text,
    calculated_by text,
    status text DEFAULT 'draft'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: incident_costs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.incident_costs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: incident_costs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.incident_costs_id_seq OWNED BY public.incident_costs.id;


--
-- Name: incident_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incident_responses (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    incident_id integer,
    user_id integer,
    member_name text DEFAULT ''::text,
    status text DEFAULT 'responding'::text,
    cert_level text DEFAULT 'probationary'::text,
    responded_at timestamp with time zone DEFAULT now(),
    on_scene_at timestamp with time zone,
    cleared_at timestamp with time zone,
    department_id integer,
    apparatus_id integer,
    position_id integer,
    position_name text,
    member_id integer
);


--
-- Name: incident_responses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.incident_responses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: incident_responses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.incident_responses_id_seq OWNED BY public.incident_responses.id;


--
-- Name: incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incidents (
    id integer NOT NULL,
    "incidentNumber" text NOT NULL,
    date text NOT NULL,
    "time" text DEFAULT ''::text,
    type text NOT NULL,
    "alarmLevel" text DEFAULT 'Still'::text,
    address text DEFAULT ''::text,
    units text DEFAULT '[]'::text,
    personnel text DEFAULT '[]'::text,
    disposition text DEFAULT ''::text,
    injuries integer DEFAULT 0,
    notes text DEFAULT ''::text,
    photos text DEFAULT '[]'::text,
    "dispatchTime" text DEFAULT ''::text,
    "clearTime" text DEFAULT ''::text,
    description text DEFAULT ''::text,
    station_id integer DEFAULT 1,
    incident_date date,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    department_id integer,
    neris_fire_protection jsonb,
    neris_incident_uid text,
    neris_submission_state text DEFAULT 'not_submitted'::text NOT NULL,
    neris_incident_status text,
    neris_submission_log jsonb,
    neris_submitted_at timestamp with time zone,
    neris_status_checked_at timestamp with time zone,
    neris_incident_types jsonb,
    neris_actions jsonb,
    neris_noaction text,
    neris_fire_detail jsonb,
    neris_hazsit_detail jsonb,
    neris_medical_details jsonb,
    neris_aids jsonb,
    neris_casualty_rescues jsonb,
    neris_dispatch_times jsonb,
    neris_status text DEFAULT 'draft'::text NOT NULL,
    neris_review jsonb,
    CONSTRAINT incidents_neris_action_xor_chk CHECK ((NOT ((neris_noaction IS NOT NULL) AND (jsonb_array_length(COALESCE(neris_actions, '[]'::jsonb)) > 0)))),
    CONSTRAINT incidents_neris_actions_shape_chk CHECK (((neris_actions IS NULL) OR (jsonb_typeof(neris_actions) = 'array'::text))),
    CONSTRAINT incidents_neris_aids_chk CHECK (((neris_aids IS NULL) OR (jsonb_typeof(neris_aids) = 'array'::text))),
    CONSTRAINT incidents_neris_casualty_rescues_chk CHECK (((neris_casualty_rescues IS NULL) OR (jsonb_typeof(neris_casualty_rescues) = 'array'::text))),
    CONSTRAINT incidents_neris_dispatch_times_chk CHECK (((neris_dispatch_times IS NULL) OR (jsonb_typeof(neris_dispatch_times) = 'object'::text))),
    CONSTRAINT incidents_neris_fire_detail_chk CHECK (((neris_fire_detail IS NULL) OR (jsonb_typeof(neris_fire_detail) = 'object'::text))),
    CONSTRAINT incidents_neris_fire_protection_chk CHECK (((neris_fire_protection IS NULL) OR (jsonb_typeof(neris_fire_protection) = 'object'::text))),
    CONSTRAINT incidents_neris_hazsit_detail_chk CHECK (((neris_hazsit_detail IS NULL) OR (jsonb_typeof(neris_hazsit_detail) = 'object'::text))),
    CONSTRAINT incidents_neris_medical_details_chk CHECK (((neris_medical_details IS NULL) OR (jsonb_typeof(neris_medical_details) = 'array'::text))),
    CONSTRAINT incidents_neris_noaction_chk CHECK (((neris_noaction IS NULL) OR (neris_noaction = ANY (ARRAY['CANCELLED'::text, 'STAGED_STANDBY'::text, 'NO_INCIDENT_FOUND'::text])))),
    CONSTRAINT incidents_neris_review_chk CHECK (((neris_review IS NULL) OR (jsonb_typeof(neris_review) = 'object'::text))),
    CONSTRAINT incidents_neris_status_chk CHECK ((neris_status = ANY (ARRAY['draft'::text, 'in_review'::text, 'approved'::text]))),
    CONSTRAINT incidents_neris_submission_log_chk CHECK (((neris_submission_log IS NULL) OR (jsonb_typeof(neris_submission_log) = 'array'::text))),
    CONSTRAINT incidents_neris_submission_state_chk CHECK ((neris_submission_state = ANY (ARRAY['not_submitted'::text, 'submitted'::text, 'update_pending'::text, 'submit_failed'::text, 'refused'::text]))),
    CONSTRAINT incidents_neris_types_shape_chk CHECK (((neris_incident_types IS NULL) OR ((jsonb_typeof(neris_incident_types) = 'array'::text) AND ((jsonb_array_length(neris_incident_types) >= 1) AND (jsonb_array_length(neris_incident_types) <= 3)))))
);


--
-- Name: COLUMN incidents.neris_incident_types; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.incidents.neris_incident_types IS 'NERIS incident types: JSONB array of {value, primary}, 1-3 entries, exactly one primary. Values are verbatim ||-path strings from the live spec (D2); membership enforced server-side (constants/neris), shape enforced here (D5).';


--
-- Name: COLUMN incidents.neris_noaction; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.incidents.neris_noaction IS 'NERIS type_noaction (CANCELLED / STAGED_STANDBY / NO_INCIDENT_FOUND). Mutually exclusive with a non-empty neris_actions (XOR CHECK). The legacy free-text disposition column is display-only history and never drives a decision.';


--
-- Name: COLUMN incidents.neris_casualty_rescues; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.incidents.neris_casualty_rescues IS 'NERIS per-person casualty/rescue entries (P2-D2): JSONB array of {type: FF|NONFF, injury: INJURED_NONFATAL|INJURED_FATAL|NONE, cause?, rescue_type?}. Our capture format — the server transformer maps it into CasualtyRescuePayload unions. Value membership server-enforced; shape enforced here.';


--
-- Name: COLUMN incidents.neris_dispatch_times; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.incidents.neris_dispatch_times IS 'Officer-entered PSAP time fallbacks (P2-D4): {call_answered?, call_arrival?} ISO strings. Precedence: cad_alerts.call_answered_at/call_arrival_at win; a time nobody recorded stays a validation error — never defaulted.';


--
-- Name: COLUMN incidents.neris_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.incidents.neris_status IS 'NERIS review chain (P2-D6): draft -> in_review -> approved (revertible). Transitions via POST /api/incidents/:id/neris-status ONLY (compare-and-set, role-gated, audited). While approved, NERIS fields are PATCH-locked (409 NERIS_APPROVED_LOCKED).';


--
-- Name: COLUMN incidents.neris_review; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.incidents.neris_review IS 'Review-chain transition history (P2-D6): {submitted_by/at, reviewed_by/at, notes, history:[...]}. Route-owned — never client-writable (422 NERIS_STATUS_VIA_ROUTE).';


--
-- Name: incidents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.incidents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: incidents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.incidents_id_seq OWNED BY public.incidents.id;


--
-- Name: investigations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investigations (
    id integer NOT NULL,
    "caseNumber" text NOT NULL,
    "incidentDate" text DEFAULT ''::text,
    address text DEFAULT ''::text,
    "occupancyType" text DEFAULT ''::text,
    cause text DEFAULT 'Undetermined'::text,
    "causeDetail" text DEFAULT ''::text,
    investigator text DEFAULT ''::text,
    "startDate" text,
    "completionDate" text,
    "estimatedLoss" real,
    "actualLoss" real,
    status text DEFAULT 'Open'::text,
    narrative text DEFAULT ''::text,
    findings text DEFAULT ''::text,
    recommendations text DEFAULT ''::text,
    evidence text DEFAULT '[]'::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: investigations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.investigations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: investigations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.investigations_id_seq OWNED BY public.investigations.id;


--
-- Name: knox_access_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knox_access_log (
    id integer NOT NULL,
    knox_box_id integer NOT NULL,
    station_id integer DEFAULT 1,
    accessed_by text NOT NULL,
    access_type text DEFAULT 'key_access'::text,
    incident_number text DEFAULT ''::text,
    reason text DEFAULT ''::text,
    accessed_at timestamp with time zone DEFAULT now(),
    returned_at timestamp with time zone,
    notes text DEFAULT ''::text,
    department_id integer
);


--
-- Name: knox_access_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knox_access_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knox_access_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knox_access_log_id_seq OWNED BY public.knox_access_log.id;


--
-- Name: knox_boxes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knox_boxes (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    box_number text NOT NULL,
    box_type text DEFAULT 'wall_mount'::text,
    status text DEFAULT 'active'::text,
    address text DEFAULT ''::text,
    location_detail text DEFAULT ''::text,
    property_name text DEFAULT ''::text,
    property_type text DEFAULT ''::text,
    pre_plan_id integer,
    installed_date text,
    serial_number text DEFAULT ''::text,
    contents text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    last_inspection_date text,
    next_inspection_due text,
    inspected_by text DEFAULT ''::text,
    inspection_result text DEFAULT ''::text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: knox_boxes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knox_boxes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knox_boxes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knox_boxes_id_seq OWNED BY public.knox_boxes.id;


--
-- Name: knox_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knox_inspections (
    id integer NOT NULL,
    knox_box_id integer NOT NULL,
    station_id integer DEFAULT 1,
    inspected_by text NOT NULL,
    inspection_date text NOT NULL,
    result text DEFAULT 'pass'::text,
    box_condition text DEFAULT 'good'::text,
    lock_functional boolean DEFAULT true,
    contents_verified boolean DEFAULT true,
    weatherproofing text DEFAULT 'good'::text,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: knox_inspections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knox_inspections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knox_inspections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knox_inspections_id_seq OWNED BY public.knox_inspections.id;


--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_requests (
    id integer NOT NULL,
    "memberId" integer NOT NULL,
    "memberName" text NOT NULL,
    type text DEFAULT 'PTO'::text NOT NULL,
    "startDate" text NOT NULL,
    "endDate" text NOT NULL,
    status text DEFAULT 'Pending'::text,
    "approvedBy" text,
    "approvedAt" timestamp with time zone,
    reason text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    station_id integer DEFAULT 1,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: leave_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leave_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leave_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leave_requests_id_seq OWNED BY public.leave_requests.id;


--
-- Name: license_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.license_config (
    department_id integer NOT NULL,
    jwt text NOT NULL,
    jti text NOT NULL,
    license_id text NOT NULL,
    dept_name text,
    dept_email text,
    tier text,
    expires_at timestamp with time zone NOT NULL,
    activated_at timestamp with time zone DEFAULT now() NOT NULL,
    activated_by text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: licenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.licenses (
    license_id text NOT NULL,
    jti text NOT NULL,
    jwt text,
    product_family text DEFAULT 'openfirehouse'::text NOT NULL,
    stripe_invoice_id text NOT NULL,
    stripe_subscription_id text,
    stripe_customer_id text,
    dept_name text,
    dept_email text,
    tier text,
    member_count integer,
    station_count integer,
    annual_budget_usd bigint,
    livemode boolean DEFAULT true NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    issuer text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    revoked_at timestamp with time zone,
    revoked_reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT licenses_issuer_check CHECK ((issuer = ANY (ARRAY['stripe'::text, 'dale'::text, 'comp'::text, 'free'::text]))),
    CONSTRAINT licenses_product_family_check CHECK ((product_family = ANY (ARRAY['openfirehouse'::text, 'firehazmat'::text]))),
    CONSTRAINT licenses_revoked_consistency CHECK ((((status = 'active'::text) AND (revoked_at IS NULL)) OR (status <> 'active'::text))),
    CONSTRAINT licenses_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'refunded'::text]))),
    CONSTRAINT licenses_tier_check CHECK ((tier = ANY (ARRAY['independent'::text, 'career_small'::text, 'career_mid'::text, 'metro'::text])))
);


--
-- Name: maintenance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance (
    id integer NOT NULL,
    "apparatusId" integer DEFAULT 0,
    "apparatusName" text DEFAULT ''::text,
    type text NOT NULL,
    priority text DEFAULT 'Routine'::text,
    status text DEFAULT 'Pending'::text,
    date text NOT NULL,
    mileage integer,
    "engineHours" real,
    description text DEFAULT ''::text,
    technician text DEFAULT ''::text,
    vendor text DEFAULT ''::text,
    "laborHours" real,
    "partsCost" real,
    "laborCost" real,
    "totalCost" real,
    "workOrder" text DEFAULT ''::text,
    "nextServiceMiles" integer,
    "nextServiceDate" text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: maintenance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.maintenance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: maintenance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.maintenance_id_seq OWNED BY public.maintenance.id;


--
-- Name: mayday_event_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mayday_event_log (
    client_id uuid NOT NULL,
    mayday_id uuid NOT NULL,
    department_id integer NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id integer NOT NULL,
    kind text NOT NULL,
    payload jsonb,
    CONSTRAINT mayday_event_log_kind_check CHECK ((kind = ANY (ARRAY['checklist_item'::text, 'par_requested'::text, 'par_result'::text, 'note'::text, 'resolved'::text])))
);


--
-- Name: mayday_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mayday_events (
    client_id uuid NOT NULL,
    department_id integer NOT NULL,
    incident_id integer,
    board_key text,
    declared_at timestamp with time zone DEFAULT now() NOT NULL,
    client_recorded_at timestamp with time zone,
    declared_by_user_id integer NOT NULL,
    victim_unit text,
    nature text,
    scene_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: meeting_minutes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_minutes (
    id integer NOT NULL,
    station_id integer,
    title text NOT NULL,
    meeting_date date NOT NULL,
    meeting_type text DEFAULT 'regular'::text,
    location text,
    called_by text,
    attendees jsonb DEFAULT '[]'::jsonb,
    agenda jsonb DEFAULT '[]'::jsonb,
    motions jsonb DEFAULT '[]'::jsonb,
    action_items jsonb DEFAULT '[]'::jsonb,
    notes text,
    next_meeting date,
    recorded_by text,
    status text DEFAULT 'draft'::text,
    linked_module text,
    linked_record_id integer,
    linked_label text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: meeting_minutes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.meeting_minutes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: meeting_minutes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.meeting_minutes_id_seq OWNED BY public.meeting_minutes.id;


--
-- Name: member_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_availability (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    user_id integer NOT NULL,
    member_name text DEFAULT ''::text,
    available boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer NOT NULL
);


--
-- Name: member_availability_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.member_availability_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: member_availability_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.member_availability_id_seq OWNED BY public.member_availability.id;


--
-- Name: member_qualifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_qualifications (
    id integer NOT NULL,
    member_id integer NOT NULL,
    station_id integer NOT NULL,
    cert_type text NOT NULL,
    cert_name text NOT NULL,
    issued_date text DEFAULT ''::text,
    expiry_date text DEFAULT ''::text,
    issuing_authority text DEFAULT ''::text,
    cert_number text DEFAULT ''::text,
    status text DEFAULT 'active'::text,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: member_qualifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.member_qualifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: member_qualifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.member_qualifications_id_seq OWNED BY public.member_qualifications.id;


--
-- Name: members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.members (
    id integer NOT NULL,
    "memberNumber" text NOT NULL,
    name text NOT NULL,
    rank text NOT NULL,
    role text NOT NULL,
    status text DEFAULT 'Active'::text,
    joined text NOT NULL,
    dob text DEFAULT ''::text,
    phone text DEFAULT ''::text,
    email text DEFAULT ''::text,
    station_email text DEFAULT ''::text,
    personal_email text DEFAULT ''::text,
    address text DEFAULT ''::text,
    "emergencyContactName" text DEFAULT ''::text,
    "emergencyContactPhone" text DEFAULT ''::text,
    "emergencyContactRelation" text DEFAULT ''::text,
    certifications text DEFAULT '[]'::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    photo_url text DEFAULT ''::text,
    available boolean DEFAULT true,
    hire_date text DEFAULT ''::text,
    rank_date text DEFAULT ''::text,
    seniority_number integer DEFAULT 0,
    employment_type text DEFAULT 'volunteer'::text,
    cal_token text,
    department_id integer,
    user_id integer,
    rank_verified boolean DEFAULT false NOT NULL,
    assigned_unit_id integer,
    assigned_group text,
    personnel_id text,
    external_id text
);


--
-- Name: members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.members_id_seq OWNED BY public.members.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    from_id integer,
    from_name text DEFAULT ''::text,
    from_username text DEFAULT ''::text,
    to_username text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text,
    sent_at timestamp with time zone DEFAULT now(),
    read_at timestamp with time zone,
    department_id integer
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: module_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.module_completions (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    user_id integer,
    member_name text DEFAULT ''::text,
    module_id text NOT NULL,
    score integer DEFAULT 0,
    passed boolean DEFAULT true,
    completed_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: module_completions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.module_completions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: module_completions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.module_completions_id_seq OWNED BY public.module_completions.id;


--
-- Name: mutual_aid; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mutual_aid (
    id integer NOT NULL,
    date text NOT NULL,
    direction text DEFAULT 'Given'::text,
    "incidentType" text DEFAULT ''::text,
    status text DEFAULT 'Completed'::text,
    "partnerDepartment" text DEFAULT ''::text,
    address text DEFAULT ''::text,
    "unitsDeployed" text DEFAULT '[]'::text,
    "personnelCount" integer DEFAULT 0,
    "requestTime" text DEFAULT ''::text,
    "clearTime" text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    "incidentNumber" text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: mutual_aid_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mutual_aid_agreements (
    id integer NOT NULL,
    station_id integer DEFAULT 1 NOT NULL,
    partner_agency text DEFAULT ''::text NOT NULL,
    partner_fdid text DEFAULT ''::text,
    partner_contact text DEFAULT ''::text,
    partner_phone text DEFAULT ''::text,
    partner_email text DEFAULT ''::text,
    agreement_type text DEFAULT 'automatic'::text,
    services jsonb DEFAULT '[]'::jsonb,
    effective_date date,
    expiration_date date,
    auto_renew boolean DEFAULT true,
    distance_miles numeric(6,1) DEFAULT 0,
    response_time_min integer DEFAULT 0,
    status text DEFAULT 'active'::text,
    document_ref text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: mutual_aid_agreements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mutual_aid_agreements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mutual_aid_agreements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mutual_aid_agreements_id_seq OWNED BY public.mutual_aid_agreements.id;


--
-- Name: mutual_aid_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mutual_aid_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mutual_aid_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mutual_aid_id_seq OWNED BY public.mutual_aid.id;


--
-- Name: nfirs_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nfirs_reports (
    id integer NOT NULL,
    "incidentNumber" text,
    "reportingArea" text DEFAULT ''::text,
    "stateIncidentNumber" text DEFAULT ''::text,
    "federalIncidentNumber" text DEFAULT ''::text,
    "reportDate" text,
    "estimatedPropertyLoss" real DEFAULT 0,
    "estimatedPropertyValue" real DEFAULT 0,
    status text DEFAULT 'Draft'::text,
    "suppressionApparatus" text DEFAULT '[]'::text,
    "suppressionPersonnel" text DEFAULT '[]'::text,
    "emsApparatus" text DEFAULT '[]'::text,
    "emsPersonnel" text DEFAULT '[]'::text,
    "otherApparatus" text DEFAULT '[]'::text,
    "otherPersonnel" text DEFAULT '[]'::text,
    "civilianDeaths" integer DEFAULT 0,
    "civilianInjuries" integer DEFAULT 0,
    "fsDeaths" integer DEFAULT 0,
    "fsInjuries" integer DEFAULT 0,
    "propertyLoss" real DEFAULT 0,
    "contentsLoss" real DEFAULT 0,
    "isStructureFire" boolean DEFAULT false,
    "structureType" text DEFAULT ''::text,
    "buildingStatus" text DEFAULT ''::text,
    "storiesAboveGrade" integer DEFAULT 0,
    "storiesBelowGrade" integer DEFAULT 0,
    "mainFloorArea" integer DEFAULT 0,
    "fireOriginCode" text DEFAULT ''::text,
    "fireCauseCode" text DEFAULT ''::text,
    "contributingFactor1" text DEFAULT ''::text,
    "contributingFactor2" text DEFAULT ''::text,
    "humanFactors1" text DEFAULT ''::text,
    "humanFactors2" text DEFAULT ''::text,
    "detectorPresence" text DEFAULT ''::text,
    "detectorOperation" text DEFAULT ''::text,
    "detectorEffectiveness" text DEFAULT ''::text,
    "detectorFailureReason" text DEFAULT ''::text,
    "sprinklerPresence" text DEFAULT ''::text,
    "sprinklerOperation" text DEFAULT ''::text,
    "sprinklerFailureReason" text DEFAULT ''::text,
    "narrativeStatement" text DEFAULT ''::text,
    "preparedBy" text DEFAULT ''::text,
    "officerInCharge" text DEFAULT ''::text,
    "reviewedBy" text DEFAULT ''::text,
    "linkedIncidentId" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    latitude text DEFAULT ''::text,
    longitude text DEFAULT ''::text,
    "dispatchTime" text DEFAULT ''::text,
    "onSceneTime" text DEFAULT ''::text,
    "unitClearTime" text DEFAULT ''::text,
    "respondingUnits" text DEFAULT ''::text,
    department_id integer
);


--
-- Name: nfirs_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nfirs_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nfirs_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nfirs_reports_id_seq OWNED BY public.nfirs_reports.id;


--
-- Name: ng911_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ng911_calls (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    call_id text DEFAULT ''::text,
    call_type text DEFAULT 'fire'::text,
    priority text DEFAULT 'emergency'::text,
    caller_name text DEFAULT ''::text,
    caller_phone text DEFAULT ''::text,
    caller_latitude double precision,
    caller_longitude double precision,
    caller_accuracy_meters double precision,
    location_method text DEFAULT 'gps'::text,
    verified_address text DEFAULT ''::text,
    verified_city text DEFAULT ''::text,
    verified_state text DEFAULT ''::text,
    verified_zip text DEFAULT ''::text,
    building_name text DEFAULT ''::text,
    floor text DEFAULT ''::text,
    room text DEFAULT ''::text,
    supplemental_data jsonb DEFAULT '{}'::jsonb,
    call_narrative text DEFAULT ''::text,
    caller_text_messages jsonb DEFAULT '[]'::jsonb,
    media_urls jsonb DEFAULT '[]'::jsonb,
    psap_name text DEFAULT ''::text,
    psap_id text DEFAULT ''::text,
    ani text DEFAULT ''::text,
    ali text DEFAULT ''::text,
    esn text DEFAULT ''::text,
    incident_created boolean DEFAULT false,
    incident_id integer,
    status text DEFAULT 'new'::text,
    received_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: ng911_calls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ng911_calls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ng911_calls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ng911_calls_id_seq OWNED BY public.ng911_calls.id;


--
-- Name: of_department_join_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.of_department_join_codes (
    id integer NOT NULL,
    department_id integer NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_by_user_id integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: of_department_join_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.of_department_join_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: of_department_join_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.of_department_join_codes_id_seq OWNED BY public.of_department_join_codes.id;


--
-- Name: of_member_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.of_member_invites (
    id integer NOT NULL,
    member_id integer NOT NULL,
    user_id integer NOT NULL,
    department_id integer NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_by_user_id integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: of_member_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.of_member_invites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: of_member_invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.of_member_invites_id_seq OWNED BY public.of_member_invites.id;


--
-- Name: of_rank_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.of_rank_notifications (
    department_id integer NOT NULL,
    tier text NOT NULL,
    notif_type text NOT NULL,
    enabled boolean NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: of_schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.of_schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: of_user_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.of_user_departments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    department_id integer NOT NULL,
    role text DEFAULT 'member'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: of_user_departments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.of_user_departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: of_user_departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.of_user_departments_id_seq OWNED BY public.of_user_departments.id;


--
-- Name: ot_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_records (
    id integer NOT NULL,
    member_id integer NOT NULL,
    station_id integer,
    shift_id integer,
    ot_date text NOT NULL,
    ot_hours numeric DEFAULT 0 NOT NULL,
    ot_type text DEFAULT 'mandatory'::text,
    reason text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer NOT NULL
);


--
-- Name: ot_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ot_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ot_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ot_records_id_seq OWNED BY public.ot_records.id;


--
-- Name: par_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.par_checks (
    id integer NOT NULL,
    department_id integer NOT NULL,
    station_id integer,
    incident_id integer,
    incident_type text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    accounted integer DEFAULT 0 NOT NULL,
    missing integer DEFAULT 0 NOT NULL,
    total integer DEFAULT 0 NOT NULL,
    results jsonb,
    ran_by integer,
    ran_at timestamp with time zone DEFAULT now() NOT NULL,
    client_id uuid,
    mayday_id uuid
);


--
-- Name: par_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.par_checks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: par_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.par_checks_id_seq OWNED BY public.par_checks.id;


--
-- Name: pay_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pay_entries (
    id integer NOT NULL,
    "memberId" integer,
    "memberName" text DEFAULT ''::text,
    "payPeriodStart" text NOT NULL,
    "payPeriodEnd" text NOT NULL,
    "regularHours" real DEFAULT 0,
    "overtimeHours" real DEFAULT 0,
    "specialPay" text DEFAULT '[]'::text,
    "grossPay" real,
    "netPay" real,
    deductions text DEFAULT '[]'::text,
    "paymentDate" text,
    "paymentMethod" text DEFAULT 'Check'::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: pay_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pay_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pay_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pay_entries_id_seq OWNED BY public.pay_entries.id;


--
-- Name: personnel_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personnel_actions (
    id integer NOT NULL,
    member_id integer NOT NULL,
    station_id integer NOT NULL,
    action_type text NOT NULL,
    action_date text NOT NULL,
    description text DEFAULT ''::text,
    details jsonb DEFAULT '{}'::jsonb,
    issued_by text DEFAULT ''::text,
    status text DEFAULT 'active'::text,
    attachments text DEFAULT '[]'::text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: personnel_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.personnel_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: personnel_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.personnel_actions_id_seq OWNED BY public.personnel_actions.id;


--
-- Name: policy_acknowledgments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_acknowledgments (
    id integer NOT NULL,
    station_id integer,
    policy_title text NOT NULL,
    policy_ref text,
    policy_type text DEFAULT 'sog'::text,
    description text,
    effective_date date,
    review_date date,
    required_by jsonb DEFAULT '[]'::jsonb,
    acknowledged_by jsonb DEFAULT '[]'::jsonb,
    total_required integer DEFAULT 0,
    total_acknowledged integer DEFAULT 0,
    status text DEFAULT 'active'::text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: policy_acknowledgments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.policy_acknowledgments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: policy_acknowledgments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.policy_acknowledgments_id_seq OWNED BY public.policy_acknowledgments.id;


--
-- Name: pre_plan_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pre_plan_photos (
    id integer NOT NULL,
    plan_id integer NOT NULL,
    station_id integer NOT NULL,
    department_id integer NOT NULL,
    storage_path text NOT NULL,
    caption text DEFAULT ''::text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    mimetype text DEFAULT ''::text NOT NULL,
    size_bytes integer,
    uploaded_by text DEFAULT ''::text NOT NULL,
    taken_at timestamp with time zone,
    sort_order integer DEFAULT 0 NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pre_plan_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pre_plan_photos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pre_plan_photos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pre_plan_photos_id_seq OWNED BY public.pre_plan_photos.id;


--
-- Name: pre_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pre_plans (
    id integer NOT NULL,
    "occupancyName" text NOT NULL,
    address text DEFAULT ''::text,
    "occupancyType" text DEFAULT ''::text,
    "riskLevel" text DEFAULT 'Moderate'::text,
    "constructionType" text DEFAULT ''::text,
    "yearBuilt" integer,
    stories integer,
    "sqFootage" integer,
    "lastInspection" text,
    "lastUpdated" text,
    "lastUpdatedBy" text DEFAULT ''::text,
    contacts text DEFAULT '[]'::text,
    hazards text DEFAULT '[]'::text,
    access text DEFAULT '{}'::text,
    "waterSupply" text DEFAULT '[]'::text,
    suppression text DEFAULT '{}'::text,
    utilities text DEFAULT '{}'::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer,
    evacuation_routes text DEFAULT ''::text,
    reviewed_by text DEFAULT ''::text,
    reviewed_at timestamp with time zone,
    review_notes text DEFAULT ''::text,
    attachments text DEFAULT '[]'::text,
    "evacuationRoutes" text DEFAULT ''::text,
    "reviewedBy" text DEFAULT ''::text,
    "reviewedAt" timestamp with time zone,
    "reviewNotes" text DEFAULT ''::text,
    "tacticalSketch" text DEFAULT '[]'::text
);


--
-- Name: pre_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pre_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pre_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pre_plans_id_seq OWNED BY public.pre_plans.id;


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    user_id integer,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.push_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.push_subscriptions_id_seq OWNED BY public.push_subscriptions.id;


--
-- Name: radio_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radio_config (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    enabled boolean DEFAULT false,
    api_key text DEFAULT ''::text,
    talkgroups jsonb DEFAULT '[]'::jsonb,
    dispatch_keywords jsonb DEFAULT '[]'::jsonb,
    whisper_mode text DEFAULT 'cloud'::text,
    retention_days integer DEFAULT 30,
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: radio_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.radio_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: radio_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.radio_config_id_seq OWNED BY public.radio_config.id;


--
-- Name: radio_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radio_log (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    "timestamp" timestamp with time zone DEFAULT now(),
    talkgroup text DEFAULT ''::text,
    talkgroup_id integer,
    transcript text NOT NULL,
    confidence real DEFAULT 1.0,
    duration_sec real DEFAULT 0,
    audio_url text DEFAULT ''::text,
    is_dispatch boolean DEFAULT false,
    priority text DEFAULT 'normal'::text,
    source text DEFAULT 'sdr'::text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: radio_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.radio_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: radio_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.radio_log_id_seq OWNED BY public.radio_log.id;


--
-- Name: recall_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recall_events (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    level text DEFAULT 'additional'::text NOT NULL,
    incident_type text DEFAULT ''::text,
    location text DEFAULT ''::text,
    message text DEFAULT ''::text,
    issued_by text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    closed_at timestamp with time zone,
    department_id integer
);


--
-- Name: recall_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recall_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recall_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recall_events_id_seq OWNED BY public.recall_events.id;


--
-- Name: recall_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recall_responses (
    id integer NOT NULL,
    recall_id integer NOT NULL,
    member_id integer NOT NULL,
    member_name text NOT NULL,
    response text NOT NULL,
    eta text DEFAULT ''::text,
    responded_at timestamp with time zone DEFAULT now(),
    destination text,
    CONSTRAINT recall_responses_destination_check CHECK (((destination IS NULL) OR ((response = 'responding'::text) AND (destination = ANY (ARRAY['station'::text, 'scene'::text])))))
);


--
-- Name: recall_responses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recall_responses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recall_responses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recall_responses_id_seq OWNED BY public.recall_responses.id;


--
-- Name: recruitment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recruitment (
    id integer NOT NULL,
    name text NOT NULL,
    phone text DEFAULT ''::text,
    email text DEFAULT ''::text,
    address text DEFAULT ''::text,
    dob text,
    source text DEFAULT ''::text,
    recruiter text DEFAULT ''::text,
    stage text DEFAULT 'Prospect'::text,
    "dateAdded" text NOT NULL,
    "stageHistory" text DEFAULT '[]'::text,
    checklist text DEFAULT '{}'::text,
    notes text DEFAULT ''::text,
    "interviewDate" text DEFAULT ''::text,
    "physicalDate" text DEFAULT ''::text,
    "orientationDate" text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: recruitment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recruitment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recruitment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recruitment_id_seq OWNED BY public.recruitment.id;


--
-- Name: retention_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retention_policy (
    table_name text NOT NULL,
    ts_column text NOT NULL,
    retain_days integer NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    note text DEFAULT ''::text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT retention_policy_retain_days_check CHECK ((retain_days >= 1))
);


--
-- Name: retention_run_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retention_run_log (
    id bigint NOT NULL,
    ran_at timestamp with time zone DEFAULT now() NOT NULL,
    table_name text NOT NULL,
    rows_deleted bigint NOT NULL,
    retain_days integer NOT NULL
);


--
-- Name: retention_run_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retention_run_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retention_run_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retention_run_log_id_seq OWNED BY public.retention_run_log.id;


--
-- Name: run_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.run_lists (
    id integer NOT NULL,
    station_id integer,
    date text NOT NULL,
    payload jsonb NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    department_id integer NOT NULL,
    published_from_shift_id integer,
    source text
);


--
-- Name: run_lists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.run_lists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: run_lists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.run_lists_id_seq OWNED BY public.run_lists.id;


--
-- Name: scenario_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scenario_completions (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    user_id integer,
    member_name text DEFAULT ''::text,
    scenario_id text NOT NULL,
    score integer DEFAULT 0,
    passed boolean DEFAULT false,
    completed_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: scenario_completions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scenario_completions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scenario_completions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scenario_completions_id_seq OWNED BY public.scenario_completions.id;


--
-- Name: shift_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_patterns (
    id integer NOT NULL,
    name text NOT NULL,
    "shiftType" text NOT NULL,
    "startDate" text NOT NULL,
    "endDate" text,
    "repeatRule" text DEFAULT 'weekly'::text NOT NULL,
    "repeatDays" text DEFAULT '[]'::text,
    "memberIds" text DEFAULT '[]'::text,
    "minCrew" integer DEFAULT 3,
    "isActive" boolean DEFAULT true,
    notes text DEFAULT ''::text,
    station_id integer DEFAULT 1,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    platoon text DEFAULT ''::text,
    cycle_type text DEFAULT ''::text,
    cycle_on integer DEFAULT 0,
    cycle_off integer DEFAULT 0,
    kelly_day_interval integer DEFAULT 0,
    anchor_date text DEFAULT ''::text,
    department_id integer,
    preset_key text DEFAULT ''::text,
    cycle_pattern text DEFAULT '[]'::text
);


--
-- Name: shift_patterns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shift_patterns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shift_patterns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shift_patterns_id_seq OWNED BY public.shift_patterns.id;


--
-- Name: shift_swaps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_swaps (
    id integer NOT NULL,
    "shiftId" integer NOT NULL,
    "requesterId" integer NOT NULL,
    "requesterName" text NOT NULL,
    "coveredById" integer,
    "coveredByName" text,
    status text DEFAULT 'Open'::text,
    reason text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    station_id integer DEFAULT 1,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: shift_swaps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shift_swaps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shift_swaps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shift_swaps_id_seq OWNED BY public.shift_swaps.id;


--
-- Name: shift_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_trades (
    id integer NOT NULL,
    station_id integer,
    requesting_member_id integer NOT NULL,
    covering_member_id integer,
    original_shift_id integer NOT NULL,
    payback_shift_id integer,
    trade_date text NOT NULL,
    payback_date text DEFAULT ''::text,
    status text DEFAULT 'pending'::text,
    ot_impact_hours numeric DEFAULT 0,
    flsa_period_hours_requester numeric DEFAULT 0,
    flsa_period_hours_coverer numeric DEFAULT 0,
    notes text DEFAULT ''::text,
    approved_by text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer NOT NULL
);


--
-- Name: shift_trades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shift_trades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shift_trades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shift_trades_id_seq OWNED BY public.shift_trades.id;


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id integer NOT NULL,
    date text NOT NULL,
    "shiftType" text NOT NULL,
    crew text DEFAULT '[]'::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    "patternId" integer,
    "memberIds" text DEFAULT '[]'::text,
    "isOverride" boolean DEFAULT false,
    department_id integer
);


--
-- Name: shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shifts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shifts_id_seq OWNED BY public.shifts.id;


--
-- Name: sogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sogs (
    id integer NOT NULL,
    number text DEFAULT ''::text,
    title text NOT NULL,
    category text DEFAULT 'Operations'::text,
    status text DEFAULT 'Active'::text,
    version text DEFAULT '1.0'::text,
    "effectiveDate" text,
    "reviewDate" text,
    "lastReviewedDate" text,
    author text DEFAULT ''::text,
    "approvedBy" text DEFAULT ''::text,
    summary text DEFAULT ''::text,
    content text DEFAULT ''::text,
    tags text DEFAULT '[]'::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: sogs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sogs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sogs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sogs_id_seq OWNED BY public.sogs.id;


--
-- Name: station_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.station_log (
    id integer NOT NULL,
    date text NOT NULL,
    shift text DEFAULT 'Day'::text,
    "officerOnDuty" text DEFAULT ''::text,
    "membersOnDuty" text DEFAULT '[]'::text,
    "weatherConditions" text DEFAULT ''::text,
    "callCount" integer DEFAULT 0,
    "apparatusChecked" boolean DEFAULT false,
    "stationChecked" boolean DEFAULT false,
    events text DEFAULT '[]'::text,
    visitors text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: station_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.station_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: station_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.station_log_id_seq OWNED BY public.station_log.id;


--
-- Name: stations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stations (
    id integer NOT NULL,
    name text NOT NULL,
    fdid text DEFAULT ''::text,
    address text DEFAULT ''::text,
    city text DEFAULT ''::text,
    state text DEFAULT ''::text,
    zip text DEFAULT ''::text,
    phone text DEFAULT ''::text,
    email text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    seeded_at timestamp with time zone,
    flsa_work_period integer DEFAULT 7,
    flsa_ot_threshold numeric DEFAULT 40,
    flsa_period_start text DEFAULT ''::text,
    dept_type text DEFAULT 'volunteer'::text,
    min_staffing_block boolean DEFAULT false,
    anthropic_api_key text DEFAULT ''::text,
    tv_pin text,
    ai_daily_token_budget integer,
    department_id integer,
    neris_station_id text
);


--
-- Name: stations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stations_id_seq OWNED BY public.stations.id;


--
-- Name: timesheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timesheets (
    id integer NOT NULL,
    station_id integer DEFAULT 1 NOT NULL,
    member_id integer NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    regular_hours numeric(6,2) DEFAULT 0,
    ot_hours numeric(6,2) DEFAULT 0,
    leave_hours numeric(6,2) DEFAULT 0,
    trade_hours numeric(6,2) DEFAULT 0,
    total_hours numeric(6,2) DEFAULT 0,
    flsa_period text DEFAULT ''::text,
    status text DEFAULT 'draft'::text,
    approved_by text DEFAULT ''::text,
    approved_at timestamp with time zone,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: timesheets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.timesheets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: timesheets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.timesheets_id_seq OWNED BY public.timesheets.id;


--
-- Name: training; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training (
    id integer NOT NULL,
    "memberId" integer DEFAULT 0,
    "memberName" text DEFAULT ''::text,
    "courseName" text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'Passed'::text,
    "completedDate" text,
    "expiresDate" text,
    hours real DEFAULT 0,
    instructor text DEFAULT ''::text,
    location text DEFAULT ''::text,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    delivery_method text DEFAULT 'Classroom'::text,
    department_id integer
);


--
-- Name: training_course_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_course_completions (
    id integer NOT NULL,
    station_id integer DEFAULT 1 NOT NULL,
    course_id integer,
    user_id integer,
    member_name text DEFAULT ''::text,
    quiz_score integer DEFAULT 0,
    quiz_passed boolean DEFAULT false,
    ceu_awarded numeric(4,1) DEFAULT 0,
    attempts integer DEFAULT 1,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    certificate_id text DEFAULT ''::text,
    source text DEFAULT 'internal'::text,
    external_ref text DEFAULT ''::text,
    department_id integer
);


--
-- Name: training_course_completions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.training_course_completions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: training_course_completions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.training_course_completions_id_seq OWNED BY public.training_course_completions.id;


--
-- Name: training_courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_courses (
    id integer NOT NULL,
    station_id integer DEFAULT 1 NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text,
    video_url text DEFAULT ''::text,
    video_type text DEFAULT 'youtube'::text,
    iso_category text DEFAULT 'general-ceu'::text,
    ceu_hours numeric(4,1) DEFAULT 0,
    duration_minutes integer DEFAULT 0,
    level text DEFAULT 'awareness'::text,
    passing_score integer DEFAULT 80,
    instructor text DEFAULT ''::text,
    provider text DEFAULT ''::text,
    tags jsonb DEFAULT '[]'::jsonb,
    prerequisites jsonb DEFAULT '[]'::jsonb,
    quiz jsonb DEFAULT '[]'::jsonb,
    source text DEFAULT 'department'::text,
    external_id text DEFAULT ''::text,
    active boolean DEFAULT true,
    created_by text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: training_courses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.training_courses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: training_courses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.training_courses_id_seq OWNED BY public.training_courses.id;


--
-- Name: training_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.training_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: training_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.training_id_seq OWNED BY public.training.id;


--
-- Name: training_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_plans (
    id integer NOT NULL,
    station_id integer DEFAULT 1 NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    year integer DEFAULT EXTRACT(year FROM now()),
    description text DEFAULT ''::text,
    category text DEFAULT 'general'::text,
    target_hours numeric(6,1) DEFAULT 0,
    completed_hours numeric(6,1) DEFAULT 0,
    objectives jsonb DEFAULT '[]'::jsonb,
    schedule jsonb DEFAULT '[]'::jsonb,
    assigned_to jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'planned'::text,
    priority text DEFAULT 'normal'::text,
    created_by text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: training_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.training_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: training_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.training_plans_id_seq OWNED BY public.training_plans.id;


--
-- Name: unit_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unit_locations (
    id integer NOT NULL,
    apparatus_id integer NOT NULL,
    station_id integer NOT NULL,
    department_id integer NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    heading real,
    speed real,
    accuracy real,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: unit_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.unit_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: unit_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.unit_locations_id_seq OWNED BY public.unit_locations.id;


--
-- Name: unit_status_acks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unit_status_acks (
    id integer NOT NULL,
    department_id integer NOT NULL,
    station_id integer,
    apparatus_id integer NOT NULL,
    designation text DEFAULT ''::text NOT NULL,
    status text NOT NULL,
    status_since timestamp with time zone,
    acked_by integer,
    acked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: unit_status_acks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.unit_status_acks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: unit_status_acks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.unit_status_acks_id_seq OWNED BY public.unit_status_acks.id;


--
-- Name: unit_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unit_status_history (
    id integer NOT NULL,
    station_id integer DEFAULT 1 NOT NULL,
    apparatus_id integer,
    designation text NOT NULL,
    incident_id integer,
    status text NOT NULL,
    changed_by integer,
    changed_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: unit_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.unit_status_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: unit_status_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.unit_status_history_id_seq OWNED BY public.unit_status_history.id;


--
-- Name: unit_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unit_statuses (
    id integer NOT NULL,
    station_id integer DEFAULT 1 NOT NULL,
    apparatus_id integer,
    designation text NOT NULL,
    status text DEFAULT 'in_service'::text NOT NULL,
    incident_id integer,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: unit_statuses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.unit_statuses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: unit_statuses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.unit_statuses_id_seq OWNED BY public.unit_statuses.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    email text DEFAULT ''::text,
    name text NOT NULL,
    initials text NOT NULL,
    role text DEFAULT 'member'::text,
    "passwordHash" text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    preferences jsonb DEFAULT '{}'::jsonb,
    station_id integer DEFAULT 1,
    language character varying(5) DEFAULT 'en'::character varying,
    email_verified boolean DEFAULT false NOT NULL,
    email_verify_token_hash text,
    email_verify_sent_at timestamp with time zone,
    apparatus_id integer,
    external_id text
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vacancy_fill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vacancy_fill (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    shift_date text NOT NULL,
    shift_name text DEFAULT ''::text,
    "position" text DEFAULT ''::text,
    callout_member_id integer,
    callout_member_name text DEFAULT ''::text,
    callout_reason text DEFAULT ''::text,
    status text DEFAULT 'open'::text,
    priority text DEFAULT 'normal'::text,
    filled_by_id integer,
    filled_by_name text DEFAULT ''::text,
    filled_at timestamp with time zone,
    notifications_sent integer DEFAULT 0,
    candidates_contacted text DEFAULT '[]'::text,
    candidates_declined text DEFAULT '[]'::text,
    notes text DEFAULT ''::text,
    created_by text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    department_id integer
);


--
-- Name: vacancy_fill_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vacancy_fill_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vacancy_fill_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vacancy_fill_id_seq OWNED BY public.vacancy_fill.id;


--
-- Name: volunteer_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_hours (
    id integer NOT NULL,
    "memberId" integer NOT NULL,
    "memberName" text NOT NULL,
    date text NOT NULL,
    "activityType" text NOT NULL,
    hours real DEFAULT 0,
    description text DEFAULT ''::text,
    reference text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: volunteer_hours_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.volunteer_hours_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: volunteer_hours_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.volunteer_hours_id_seq OWNED BY public.volunteer_hours.id;


--
-- Name: weather_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weather_cache (
    lat_key numeric NOT NULL,
    lng_key numeric NOT NULL,
    payload jsonb NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_deliveries (
    id integer NOT NULL,
    subscription_id integer,
    station_id integer DEFAULT 1,
    event text NOT NULL,
    payload jsonb,
    response_status integer,
    response_body text DEFAULT ''::text,
    attempt integer DEFAULT 1,
    delivered boolean DEFAULT false,
    error text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: webhook_deliveries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.webhook_deliveries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: webhook_deliveries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.webhook_deliveries_id_seq OWNED BY public.webhook_deliveries.id;


--
-- Name: webhook_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_subscriptions (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    name text DEFAULT ''::text NOT NULL,
    url text NOT NULL,
    secret text DEFAULT ''::text,
    events jsonb DEFAULT '["*"]'::jsonb,
    headers jsonb DEFAULT '{}'::jsonb,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: webhook_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.webhook_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: webhook_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.webhook_subscriptions_id_seq OWNED BY public.webhook_subscriptions.id;


--
-- Name: wedge_department_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wedge_department_access (
    department_id integer NOT NULL,
    invite_code text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: wedge_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wedge_members (
    user_id uuid NOT NULL,
    department_id integer NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    email text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: wellness; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wellness (
    id integer NOT NULL,
    "memberId" integer NOT NULL,
    "memberName" text NOT NULL,
    "bloodType" text DEFAULT ''::text,
    "medicalRestrictions" text DEFAULT ''::text,
    "physicalDue" text,
    "scbaFitDue" text,
    physicals text DEFAULT '[]'::text,
    "scbaFitTests" text DEFAULT '[]'::text,
    vaccinations text DEFAULT '[]'::text,
    exposures text DEFAULT '[]'::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    station_id integer DEFAULT 1,
    department_id integer
);


--
-- Name: wellness_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wellness_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wellness_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wellness_id_seq OWNED BY public.wellness.id;


--
-- Name: workflow_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_tasks (
    id integer NOT NULL,
    station_id integer DEFAULT 1,
    user_id integer,
    title text NOT NULL,
    task_type text DEFAULT 'incident_report'::text NOT NULL,
    target_module text DEFAULT 'incidents'::text NOT NULL,
    target_record_id integer,
    status text DEFAULT 'active'::text NOT NULL,
    checklist jsonb DEFAULT '[]'::jsonb,
    ai_drafts jsonb DEFAULT '{}'::jsonb,
    conversation jsonb DEFAULT '[]'::jsonb,
    deadline timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    department_id integer
);


--
-- Name: workflow_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_tasks_id_seq OWNED BY public.workflow_tasks.id;


--
-- Name: active_resources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_resources ALTER COLUMN id SET DEFAULT nextval('public.active_resources_id_seq'::regclass);


--
-- Name: activity_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_entries ALTER COLUMN id SET DEFAULT nextval('public.activity_entries_id_seq'::regclass);


--
-- Name: after_action_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.after_action_reports ALTER COLUMN id SET DEFAULT nextval('public.after_action_reports_id_seq'::regclass);


--
-- Name: ai_usage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage ALTER COLUMN id SET DEFAULT nextval('public.ai_usage_id_seq'::regclass);


--
-- Name: apparatus id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus ALTER COLUMN id SET DEFAULT nextval('public.apparatus_id_seq'::regclass);


--
-- Name: apparatus_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus_assignments ALTER COLUMN id SET DEFAULT nextval('public.apparatus_assignments_id_seq'::regclass);


--
-- Name: apparatus_oos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus_oos ALTER COLUMN id SET DEFAULT nextval('public.apparatus_oos_id_seq'::regclass);


--
-- Name: apparatus_positions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus_positions ALTER COLUMN id SET DEFAULT nextval('public.apparatus_positions_id_seq'::regclass);


--
-- Name: assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets ALTER COLUMN id SET DEFAULT nextval('public.assets_id_seq'::regclass);


--
-- Name: assistant_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_alerts ALTER COLUMN id SET DEFAULT nextval('public.assistant_alerts_id_seq'::regclass);


--
-- Name: assistant_feedback id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_feedback ALTER COLUMN id SET DEFAULT nextval('public.assistant_feedback_id_seq'::regclass);


--
-- Name: assistant_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_preferences ALTER COLUMN id SET DEFAULT nextval('public.assistant_preferences_id_seq'::regclass);


--
-- Name: attachments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments ALTER COLUMN id SET DEFAULT nextval('public.attachments_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: avl_connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avl_connections ALTER COLUMN id SET DEFAULT nextval('public.avl_connections_id_seq'::regclass);


--
-- Name: avl_devices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avl_devices ALTER COLUMN id SET DEFAULT nextval('public.avl_devices_id_seq'::regclass);


--
-- Name: budget_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_lines ALTER COLUMN id SET DEFAULT nextval('public.budget_lines_id_seq'::regclass);


--
-- Name: budget_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_transactions ALTER COLUMN id SET DEFAULT nextval('public.budget_transactions_id_seq'::regclass);


--
-- Name: bug_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bug_reports ALTER COLUMN id SET DEFAULT nextval('public.bug_reports_id_seq'::regclass);


--
-- Name: bulletins id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulletins ALTER COLUMN id SET DEFAULT nextval('public.bulletins_id_seq'::regclass);


--
-- Name: cad_alert_units id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cad_alert_units ALTER COLUMN id SET DEFAULT nextval('public.cad_alert_units_id_seq'::regclass);


--
-- Name: cad_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cad_alerts ALTER COLUMN id SET DEFAULT nextval('public.cad_alerts_id_seq'::regclass);


--
-- Name: cad_connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cad_connections ALTER COLUMN id SET DEFAULT nextval('public.cad_connections_id_seq'::regclass);


--
-- Name: cadets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadets ALTER COLUMN id SET DEFAULT nextval('public.cadets_id_seq'::regclass);


--
-- Name: calendar_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.calendar_subscriptions_id_seq'::regclass);


--
-- Name: checklist_completions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_completions ALTER COLUMN id SET DEFAULT nextval('public.checklist_completions_id_seq'::regclass);


--
-- Name: checklist_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_templates ALTER COLUMN id SET DEFAULT nextval('public.checklist_templates_id_seq'::regclass);


--
-- Name: community_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_events ALTER COLUMN id SET DEFAULT nextval('public.community_events_id_seq'::regclass);


--
-- Name: correspondence id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correspondence ALTER COLUMN id SET DEFAULT nextval('public.correspondence_id_seq'::regclass);


--
-- Name: courses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses ALTER COLUMN id SET DEFAULT nextval('public.courses_id_seq'::regclass);


--
-- Name: coverage_outreach id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_outreach ALTER COLUMN id SET DEFAULT nextval('public.coverage_outreach_id_seq'::regclass);


--
-- Name: crr_programs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crr_programs ALTER COLUMN id SET DEFAULT nextval('public.crr_programs_id_seq'::regclass);


--
-- Name: crr_visits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crr_visits ALTER COLUMN id SET DEFAULT nextval('public.crr_visits_id_seq'::regclass);


--
-- Name: cylinders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cylinders ALTER COLUMN id SET DEFAULT nextval('public.cylinders_id_seq'::regclass);


--
-- Name: daily_staffing id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_staffing ALTER COLUMN id SET DEFAULT nextval('public.daily_staffing_id_seq'::regclass);


--
-- Name: departments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);


--
-- Name: dept_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dept_documents ALTER COLUMN id SET DEFAULT nextval('public.dept_documents_id_seq'::regclass);


--
-- Name: donations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donations ALTER COLUMN id SET DEFAULT nextval('public.donations_id_seq'::regclass);


--
-- Name: drills id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drills ALTER COLUMN id SET DEFAULT nextval('public.drills_id_seq'::regclass);


--
-- Name: equipment_checkout id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_checkout ALTER COLUMN id SET DEFAULT nextval('public.equipment_checkout_id_seq'::regclass);


--
-- Name: events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events ALTER COLUMN id SET DEFAULT nextval('public.events_id_seq'::regclass);


--
-- Name: exam_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_assignments ALTER COLUMN id SET DEFAULT nextval('public.exam_assignments_id_seq'::regclass);


--
-- Name: exam_submissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_submissions ALTER COLUMN id SET DEFAULT nextval('public.exam_submissions_id_seq'::regclass);


--
-- Name: exams id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams ALTER COLUMN id SET DEFAULT nextval('public.exams_id_seq'::regclass);


--
-- Name: expo_push_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expo_push_tokens ALTER COLUMN id SET DEFAULT nextval('public.expo_push_tokens_id_seq'::regclass);


--
-- Name: exposure_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exposure_records ALTER COLUMN id SET DEFAULT nextval('public.exposure_records_id_seq'::regclass);


--
-- Name: fi_checklist_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_checklist_items ALTER COLUMN id SET DEFAULT nextval('public.fi_checklist_items_id_seq'::regclass);


--
-- Name: fi_checklists id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_checklists ALTER COLUMN id SET DEFAULT nextval('public.fi_checklists_id_seq'::regclass);


--
-- Name: fi_code_library id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_code_library ALTER COLUMN id SET DEFAULT nextval('public.fi_code_library_id_seq'::regclass);


--
-- Name: fi_designations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_designations ALTER COLUMN id SET DEFAULT nextval('public.fi_designations_id_seq'::regclass);


--
-- Name: fi_inspection_answers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_inspection_answers ALTER COLUMN id SET DEFAULT nextval('public.fi_inspection_answers_id_seq'::regclass);


--
-- Name: fi_inspection_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_inspection_types ALTER COLUMN id SET DEFAULT nextval('public.fi_inspection_types_id_seq'::regclass);


--
-- Name: fi_inspections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_inspections ALTER COLUMN id SET DEFAULT nextval('public.fi_inspections_id_seq'::regclass);


--
-- Name: fi_notice_service id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_notice_service ALTER COLUMN id SET DEFAULT nextval('public.fi_notice_service_id_seq'::regclass);


--
-- Name: fi_notices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_notices ALTER COLUMN id SET DEFAULT nextval('public.fi_notices_id_seq'::regclass);


--
-- Name: fi_permits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_permits ALTER COLUMN id SET DEFAULT nextval('public.fi_permits_id_seq'::regclass);


--
-- Name: fi_properties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_properties ALTER COLUMN id SET DEFAULT nextval('public.fi_properties_id_seq'::regclass);


--
-- Name: fi_signatures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_signatures ALTER COLUMN id SET DEFAULT nextval('public.fi_signatures_id_seq'::regclass);


--
-- Name: fi_sync_ops id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_sync_ops ALTER COLUMN id SET DEFAULT nextval('public.fi_sync_ops_id_seq'::regclass);


--
-- Name: fi_violations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_violations ALTER COLUMN id SET DEFAULT nextval('public.fi_violations_id_seq'::regclass);


--
-- Name: fill_stations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fill_stations ALTER COLUMN id SET DEFAULT nextval('public.fill_stations_id_seq'::regclass);


--
-- Name: fs_hazmat_guides id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_guides ALTER COLUMN id SET DEFAULT nextval('public.fs_hazmat_guides_id_seq'::regclass);


--
-- Name: fs_hazmat_incident_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_incident_audit ALTER COLUMN id SET DEFAULT nextval('public.fs_hazmat_incident_audit_id_seq'::regclass);


--
-- Name: fs_hazmat_incidents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_incidents ALTER COLUMN id SET DEFAULT nextval('public.fs_hazmat_incidents_id_seq'::regclass);


--
-- Name: fs_hazmat_isolation_distances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_isolation_distances ALTER COLUMN id SET DEFAULT nextval('public.fs_hazmat_isolation_distances_id_seq'::regclass);


--
-- Name: fs_hazmat_materials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_materials ALTER COLUMN id SET DEFAULT nextval('public.fs_hazmat_materials_id_seq'::regclass);


--
-- Name: fs_hazmat_table3_distances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_table3_distances ALTER COLUMN id SET DEFAULT nextval('public.fs_hazmat_table3_distances_id_seq'::regclass);


--
-- Name: fs_inspections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_inspections ALTER COLUMN id SET DEFAULT nextval('public.fs_inspections_id_seq'::regclass);


--
-- Name: fs_permits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_permits ALTER COLUMN id SET DEFAULT nextval('public.fs_permits_id_seq'::regclass);


--
-- Name: fs_properties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_properties ALTER COLUMN id SET DEFAULT nextval('public.fs_properties_id_seq'::regclass);


--
-- Name: fto_evaluations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fto_evaluations ALTER COLUMN id SET DEFAULT nextval('public.fto_evaluations_id_seq'::regclass);


--
-- Name: fto_observations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fto_observations ALTER COLUMN id SET DEFAULT nextval('public.fto_observations_id_seq'::regclass);


--
-- Name: fundraising_campaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraising_campaigns ALTER COLUMN id SET DEFAULT nextval('public.fundraising_campaigns_id_seq'::regclass);


--
-- Name: grants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grants ALTER COLUMN id SET DEFAULT nextval('public.grants_id_seq'::regclass);


--
-- Name: grievances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grievances ALTER COLUMN id SET DEFAULT nextval('public.grievances_id_seq'::regclass);


--
-- Name: hydrants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hydrants ALTER COLUMN id SET DEFAULT nextval('public.hydrants_id_seq'::regclass);


--
-- Name: identity_backfill_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_backfill_log ALTER COLUMN id SET DEFAULT nextval('public.identity_backfill_log_id_seq'::regclass);


--
-- Name: incident_costs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_costs ALTER COLUMN id SET DEFAULT nextval('public.incident_costs_id_seq'::regclass);


--
-- Name: incident_responses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_responses ALTER COLUMN id SET DEFAULT nextval('public.incident_responses_id_seq'::regclass);


--
-- Name: incidents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents ALTER COLUMN id SET DEFAULT nextval('public.incidents_id_seq'::regclass);


--
-- Name: investigations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investigations ALTER COLUMN id SET DEFAULT nextval('public.investigations_id_seq'::regclass);


--
-- Name: knox_access_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knox_access_log ALTER COLUMN id SET DEFAULT nextval('public.knox_access_log_id_seq'::regclass);


--
-- Name: knox_boxes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knox_boxes ALTER COLUMN id SET DEFAULT nextval('public.knox_boxes_id_seq'::regclass);


--
-- Name: knox_inspections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knox_inspections ALTER COLUMN id SET DEFAULT nextval('public.knox_inspections_id_seq'::regclass);


--
-- Name: leave_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests ALTER COLUMN id SET DEFAULT nextval('public.leave_requests_id_seq'::regclass);


--
-- Name: maintenance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance ALTER COLUMN id SET DEFAULT nextval('public.maintenance_id_seq'::regclass);


--
-- Name: meeting_minutes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_minutes ALTER COLUMN id SET DEFAULT nextval('public.meeting_minutes_id_seq'::regclass);


--
-- Name: member_availability id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_availability ALTER COLUMN id SET DEFAULT nextval('public.member_availability_id_seq'::regclass);


--
-- Name: member_qualifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_qualifications ALTER COLUMN id SET DEFAULT nextval('public.member_qualifications_id_seq'::regclass);


--
-- Name: members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members ALTER COLUMN id SET DEFAULT nextval('public.members_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: module_completions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_completions ALTER COLUMN id SET DEFAULT nextval('public.module_completions_id_seq'::regclass);


--
-- Name: mutual_aid id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mutual_aid ALTER COLUMN id SET DEFAULT nextval('public.mutual_aid_id_seq'::regclass);


--
-- Name: mutual_aid_agreements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mutual_aid_agreements ALTER COLUMN id SET DEFAULT nextval('public.mutual_aid_agreements_id_seq'::regclass);


--
-- Name: nfirs_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfirs_reports ALTER COLUMN id SET DEFAULT nextval('public.nfirs_reports_id_seq'::regclass);


--
-- Name: ng911_calls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ng911_calls ALTER COLUMN id SET DEFAULT nextval('public.ng911_calls_id_seq'::regclass);


--
-- Name: of_department_join_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_department_join_codes ALTER COLUMN id SET DEFAULT nextval('public.of_department_join_codes_id_seq'::regclass);


--
-- Name: of_member_invites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_member_invites ALTER COLUMN id SET DEFAULT nextval('public.of_member_invites_id_seq'::regclass);


--
-- Name: of_user_departments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_user_departments ALTER COLUMN id SET DEFAULT nextval('public.of_user_departments_id_seq'::regclass);


--
-- Name: ot_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_records ALTER COLUMN id SET DEFAULT nextval('public.ot_records_id_seq'::regclass);


--
-- Name: par_checks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.par_checks ALTER COLUMN id SET DEFAULT nextval('public.par_checks_id_seq'::regclass);


--
-- Name: pay_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_entries ALTER COLUMN id SET DEFAULT nextval('public.pay_entries_id_seq'::regclass);


--
-- Name: personnel_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel_actions ALTER COLUMN id SET DEFAULT nextval('public.personnel_actions_id_seq'::regclass);


--
-- Name: policy_acknowledgments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_acknowledgments ALTER COLUMN id SET DEFAULT nextval('public.policy_acknowledgments_id_seq'::regclass);


--
-- Name: pre_plan_photos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_plan_photos ALTER COLUMN id SET DEFAULT nextval('public.pre_plan_photos_id_seq'::regclass);


--
-- Name: pre_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_plans ALTER COLUMN id SET DEFAULT nextval('public.pre_plans_id_seq'::regclass);


--
-- Name: push_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.push_subscriptions_id_seq'::regclass);


--
-- Name: radio_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_config ALTER COLUMN id SET DEFAULT nextval('public.radio_config_id_seq'::regclass);


--
-- Name: radio_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_log ALTER COLUMN id SET DEFAULT nextval('public.radio_log_id_seq'::regclass);


--
-- Name: recall_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_events ALTER COLUMN id SET DEFAULT nextval('public.recall_events_id_seq'::regclass);


--
-- Name: recall_responses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_responses ALTER COLUMN id SET DEFAULT nextval('public.recall_responses_id_seq'::regclass);


--
-- Name: recruitment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment ALTER COLUMN id SET DEFAULT nextval('public.recruitment_id_seq'::regclass);


--
-- Name: retention_run_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_run_log ALTER COLUMN id SET DEFAULT nextval('public.retention_run_log_id_seq'::regclass);


--
-- Name: run_lists id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_lists ALTER COLUMN id SET DEFAULT nextval('public.run_lists_id_seq'::regclass);


--
-- Name: scenario_completions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenario_completions ALTER COLUMN id SET DEFAULT nextval('public.scenario_completions_id_seq'::regclass);


--
-- Name: shift_patterns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_patterns ALTER COLUMN id SET DEFAULT nextval('public.shift_patterns_id_seq'::regclass);


--
-- Name: shift_swaps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_swaps ALTER COLUMN id SET DEFAULT nextval('public.shift_swaps_id_seq'::regclass);


--
-- Name: shift_trades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_trades ALTER COLUMN id SET DEFAULT nextval('public.shift_trades_id_seq'::regclass);


--
-- Name: shifts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts ALTER COLUMN id SET DEFAULT nextval('public.shifts_id_seq'::regclass);


--
-- Name: sogs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sogs ALTER COLUMN id SET DEFAULT nextval('public.sogs_id_seq'::regclass);


--
-- Name: station_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_log ALTER COLUMN id SET DEFAULT nextval('public.station_log_id_seq'::regclass);


--
-- Name: stations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations ALTER COLUMN id SET DEFAULT nextval('public.stations_id_seq'::regclass);


--
-- Name: timesheets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheets ALTER COLUMN id SET DEFAULT nextval('public.timesheets_id_seq'::regclass);


--
-- Name: training id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training ALTER COLUMN id SET DEFAULT nextval('public.training_id_seq'::regclass);


--
-- Name: training_course_completions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_course_completions ALTER COLUMN id SET DEFAULT nextval('public.training_course_completions_id_seq'::regclass);


--
-- Name: training_courses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_courses ALTER COLUMN id SET DEFAULT nextval('public.training_courses_id_seq'::regclass);


--
-- Name: training_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plans ALTER COLUMN id SET DEFAULT nextval('public.training_plans_id_seq'::regclass);


--
-- Name: unit_locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_locations ALTER COLUMN id SET DEFAULT nextval('public.unit_locations_id_seq'::regclass);


--
-- Name: unit_status_acks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_status_acks ALTER COLUMN id SET DEFAULT nextval('public.unit_status_acks_id_seq'::regclass);


--
-- Name: unit_status_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_status_history ALTER COLUMN id SET DEFAULT nextval('public.unit_status_history_id_seq'::regclass);


--
-- Name: unit_statuses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_statuses ALTER COLUMN id SET DEFAULT nextval('public.unit_statuses_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vacancy_fill id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_fill ALTER COLUMN id SET DEFAULT nextval('public.vacancy_fill_id_seq'::regclass);


--
-- Name: volunteer_hours id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_hours ALTER COLUMN id SET DEFAULT nextval('public.volunteer_hours_id_seq'::regclass);


--
-- Name: webhook_deliveries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries ALTER COLUMN id SET DEFAULT nextval('public.webhook_deliveries_id_seq'::regclass);


--
-- Name: webhook_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.webhook_subscriptions_id_seq'::regclass);


--
-- Name: wellness id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wellness ALTER COLUMN id SET DEFAULT nextval('public.wellness_id_seq'::regclass);


--
-- Name: workflow_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_tasks ALTER COLUMN id SET DEFAULT nextval('public.workflow_tasks_id_seq'::regclass);


--
-- Name: active_boards active_boards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_boards
    ADD CONSTRAINT active_boards_pkey PRIMARY KEY (department_id);


--
-- Name: active_resources active_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_resources
    ADD CONSTRAINT active_resources_pkey PRIMARY KEY (id);


--
-- Name: activity_entries activity_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_entries
    ADD CONSTRAINT activity_entries_pkey PRIMARY KEY (id);


--
-- Name: after_action_reports after_action_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.after_action_reports
    ADD CONSTRAINT after_action_reports_pkey PRIMARY KEY (id);


--
-- Name: ai_usage ai_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (id);


--
-- Name: apparatus_assignments apparatus_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus_assignments
    ADD CONSTRAINT apparatus_assignments_pkey PRIMARY KEY (id);


--
-- Name: apparatus_oos apparatus_oos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus_oos
    ADD CONSTRAINT apparatus_oos_pkey PRIMARY KEY (id);


--
-- Name: apparatus apparatus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus
    ADD CONSTRAINT apparatus_pkey PRIMARY KEY (id);


--
-- Name: apparatus_positions apparatus_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus_positions
    ADD CONSTRAINT apparatus_positions_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: assistant_alerts assistant_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_alerts
    ADD CONSTRAINT assistant_alerts_pkey PRIMARY KEY (id);


--
-- Name: assistant_feedback assistant_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_feedback
    ADD CONSTRAINT assistant_feedback_pkey PRIMARY KEY (id);


--
-- Name: assistant_preferences assistant_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_preferences
    ADD CONSTRAINT assistant_preferences_pkey PRIMARY KEY (id);


--
-- Name: assistant_preferences assistant_preferences_station_id_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_preferences
    ADD CONSTRAINT assistant_preferences_station_id_member_id_key UNIQUE (station_id, member_id);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: avl_connections avl_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avl_connections
    ADD CONSTRAINT avl_connections_pkey PRIMARY KEY (id);


--
-- Name: avl_devices avl_devices_department_id_device_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avl_devices
    ADD CONSTRAINT avl_devices_department_id_device_ref_key UNIQUE (department_id, device_ref);


--
-- Name: avl_devices avl_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avl_devices
    ADD CONSTRAINT avl_devices_pkey PRIMARY KEY (id);


--
-- Name: budget_lines budget_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_lines
    ADD CONSTRAINT budget_lines_pkey PRIMARY KEY (id);


--
-- Name: budget_transactions budget_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_transactions
    ADD CONSTRAINT budget_transactions_pkey PRIMARY KEY (id);


--
-- Name: bug_reports bug_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bug_reports
    ADD CONSTRAINT bug_reports_pkey PRIMARY KEY (id);


--
-- Name: bulletins bulletins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulletins
    ADD CONSTRAINT bulletins_pkey PRIMARY KEY (id);


--
-- Name: cad_alert_units cad_alert_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cad_alert_units
    ADD CONSTRAINT cad_alert_units_pkey PRIMARY KEY (id);


--
-- Name: cad_alerts cad_alerts_alert_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cad_alerts
    ADD CONSTRAINT cad_alerts_alert_id_key UNIQUE (alert_id);


--
-- Name: cad_alerts cad_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cad_alerts
    ADD CONSTRAINT cad_alerts_pkey PRIMARY KEY (id);


--
-- Name: cad_connections cad_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cad_connections
    ADD CONSTRAINT cad_connections_pkey PRIMARY KEY (id);


--
-- Name: cadets cadets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadets
    ADD CONSTRAINT cadets_pkey PRIMARY KEY (id);


--
-- Name: calendar_subscriptions calendar_subscriptions_cal_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_subscriptions
    ADD CONSTRAINT calendar_subscriptions_cal_token_key UNIQUE (cal_token);


--
-- Name: calendar_subscriptions calendar_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_subscriptions
    ADD CONSTRAINT calendar_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: checklist_completions checklist_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_completions
    ADD CONSTRAINT checklist_completions_pkey PRIMARY KEY (id);


--
-- Name: checklist_templates checklist_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_pkey PRIMARY KEY (id);


--
-- Name: community_events community_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_events
    ADD CONSTRAINT community_events_pkey PRIMARY KEY (id);


--
-- Name: correspondence correspondence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correspondence
    ADD CONSTRAINT correspondence_pkey PRIMARY KEY (id);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: coverage_outreach coverage_outreach_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_outreach
    ADD CONSTRAINT coverage_outreach_pkey PRIMARY KEY (id);


--
-- Name: crr_programs crr_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crr_programs
    ADD CONSTRAINT crr_programs_pkey PRIMARY KEY (id);


--
-- Name: crr_visits crr_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crr_visits
    ADD CONSTRAINT crr_visits_pkey PRIMARY KEY (id);


--
-- Name: cylinders cylinders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cylinders
    ADD CONSTRAINT cylinders_pkey PRIMARY KEY (id);


--
-- Name: daily_staffing daily_staffing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_staffing
    ADD CONSTRAINT daily_staffing_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: dept_documents dept_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dept_documents
    ADD CONSTRAINT dept_documents_pkey PRIMARY KEY (id);


--
-- Name: donations donations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_pkey PRIMARY KEY (id);


--
-- Name: drills drills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drills
    ADD CONSTRAINT drills_pkey PRIMARY KEY (id);


--
-- Name: equipment_checkout equipment_checkout_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_checkout
    ADD CONSTRAINT equipment_checkout_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: exam_assignments exam_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_assignments
    ADD CONSTRAINT exam_assignments_pkey PRIMARY KEY (id);


--
-- Name: exam_assignments exam_assignments_station_id_exam_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_assignments
    ADD CONSTRAINT exam_assignments_station_id_exam_id_user_id_key UNIQUE (station_id, exam_id, user_id);


--
-- Name: exam_submissions exam_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_submissions
    ADD CONSTRAINT exam_submissions_pkey PRIMARY KEY (id);


--
-- Name: exam_submissions exam_submissions_station_id_exam_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_submissions
    ADD CONSTRAINT exam_submissions_station_id_exam_id_user_id_key UNIQUE (station_id, exam_id, user_id);


--
-- Name: exams exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_pkey PRIMARY KEY (id);


--
-- Name: expo_push_tokens expo_push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expo_push_tokens
    ADD CONSTRAINT expo_push_tokens_pkey PRIMARY KEY (id);


--
-- Name: expo_push_tokens expo_push_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expo_push_tokens
    ADD CONSTRAINT expo_push_tokens_token_key UNIQUE (token);


--
-- Name: exposure_records exposure_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exposure_records
    ADD CONSTRAINT exposure_records_pkey PRIMARY KEY (id);


--
-- Name: fi_checklist_items fi_checklist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_checklist_items
    ADD CONSTRAINT fi_checklist_items_pkey PRIMARY KEY (id);


--
-- Name: fi_checklists fi_checklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_checklists
    ADD CONSTRAINT fi_checklists_pkey PRIMARY KEY (id);


--
-- Name: fi_code_library fi_code_library_department_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_code_library
    ADD CONSTRAINT fi_code_library_department_id_code_key UNIQUE (department_id, code);


--
-- Name: fi_code_library fi_code_library_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_code_library
    ADD CONSTRAINT fi_code_library_pkey PRIMARY KEY (id);


--
-- Name: fi_designations fi_designations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_designations
    ADD CONSTRAINT fi_designations_pkey PRIMARY KEY (id);


--
-- Name: fi_inspection_answers fi_inspection_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_inspection_answers
    ADD CONSTRAINT fi_inspection_answers_pkey PRIMARY KEY (id);


--
-- Name: fi_inspection_types fi_inspection_types_department_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_inspection_types
    ADD CONSTRAINT fi_inspection_types_department_id_name_key UNIQUE (department_id, name);


--
-- Name: fi_inspection_types fi_inspection_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_inspection_types
    ADD CONSTRAINT fi_inspection_types_pkey PRIMARY KEY (id);


--
-- Name: fi_inspections fi_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_inspections
    ADD CONSTRAINT fi_inspections_pkey PRIMARY KEY (id);


--
-- Name: fi_notice_service fi_notice_service_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_notice_service
    ADD CONSTRAINT fi_notice_service_pkey PRIMARY KEY (id);


--
-- Name: fi_notices fi_notices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_notices
    ADD CONSTRAINT fi_notices_pkey PRIMARY KEY (id);


--
-- Name: fi_permits fi_permits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_permits
    ADD CONSTRAINT fi_permits_pkey PRIMARY KEY (id);


--
-- Name: fi_properties fi_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_properties
    ADD CONSTRAINT fi_properties_pkey PRIMARY KEY (id);


--
-- Name: fi_settings fi_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_settings
    ADD CONSTRAINT fi_settings_pkey PRIMARY KEY (department_id);


--
-- Name: fi_signatures fi_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_signatures
    ADD CONSTRAINT fi_signatures_pkey PRIMARY KEY (id);


--
-- Name: fi_sync_ops fi_sync_ops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_sync_ops
    ADD CONSTRAINT fi_sync_ops_pkey PRIMARY KEY (id);


--
-- Name: fi_violations fi_violations_inspection_id_violation_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_violations
    ADD CONSTRAINT fi_violations_inspection_id_violation_key_key UNIQUE (inspection_id, violation_key);


--
-- Name: fi_violations fi_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_violations
    ADD CONSTRAINT fi_violations_pkey PRIMARY KEY (id);


--
-- Name: fill_stations fill_stations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fill_stations
    ADD CONSTRAINT fill_stations_pkey PRIMARY KEY (id);


--
-- Name: fs_hazmat_guides fs_hazmat_guides_guide_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_guides
    ADD CONSTRAINT fs_hazmat_guides_guide_number_key UNIQUE (guide_number);


--
-- Name: fs_hazmat_guides fs_hazmat_guides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_guides
    ADD CONSTRAINT fs_hazmat_guides_pkey PRIMARY KEY (id);


--
-- Name: fs_hazmat_incident_audit fs_hazmat_incident_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_incident_audit
    ADD CONSTRAINT fs_hazmat_incident_audit_pkey PRIMARY KEY (id);


--
-- Name: fs_hazmat_incidents fs_hazmat_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_incidents
    ADD CONSTRAINT fs_hazmat_incidents_pkey PRIMARY KEY (id);


--
-- Name: fs_hazmat_isolation_distances fs_hazmat_isolation_distances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_isolation_distances
    ADD CONSTRAINT fs_hazmat_isolation_distances_pkey PRIMARY KEY (id);


--
-- Name: fs_hazmat_materials fs_hazmat_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_materials
    ADD CONSTRAINT fs_hazmat_materials_pkey PRIMARY KEY (id);


--
-- Name: fs_hazmat_table3_distances fs_hazmat_table3_distances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_table3_distances
    ADD CONSTRAINT fs_hazmat_table3_distances_pkey PRIMARY KEY (id);


--
-- Name: fs_hazmat_table3_distances fs_hazmat_table3_distances_un_number_container_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_table3_distances
    ADD CONSTRAINT fs_hazmat_table3_distances_un_number_container_type_key UNIQUE (un_number, container_type);


--
-- Name: fs_inspections fs_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_inspections
    ADD CONSTRAINT fs_inspections_pkey PRIMARY KEY (id);


--
-- Name: fs_permits fs_permits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_permits
    ADD CONSTRAINT fs_permits_pkey PRIMARY KEY (id);


--
-- Name: fs_properties fs_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_properties
    ADD CONSTRAINT fs_properties_pkey PRIMARY KEY (id);


--
-- Name: fto_evaluations fto_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fto_evaluations
    ADD CONSTRAINT fto_evaluations_pkey PRIMARY KEY (id);


--
-- Name: fto_evaluations fto_evaluations_station_id_member_id_skill_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fto_evaluations
    ADD CONSTRAINT fto_evaluations_station_id_member_id_skill_id_key UNIQUE (station_id, member_id, skill_id);


--
-- Name: fto_observations fto_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fto_observations
    ADD CONSTRAINT fto_observations_pkey PRIMARY KEY (id);


--
-- Name: fundraising_campaigns fundraising_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fundraising_campaigns
    ADD CONSTRAINT fundraising_campaigns_pkey PRIMARY KEY (id);


--
-- Name: grants grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grants
    ADD CONSTRAINT grants_pkey PRIMARY KEY (id);


--
-- Name: grievances grievances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grievances
    ADD CONSTRAINT grievances_pkey PRIMARY KEY (id);


--
-- Name: hydrants hydrants_hydrantNumber_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hydrants
    ADD CONSTRAINT "hydrants_hydrantNumber_key" UNIQUE ("hydrantNumber");


--
-- Name: hydrants hydrants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hydrants
    ADD CONSTRAINT hydrants_pkey PRIMARY KEY (id);


--
-- Name: identity_backfill_log identity_backfill_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_backfill_log
    ADD CONSTRAINT identity_backfill_log_pkey PRIMARY KEY (id);


--
-- Name: incident_costs incident_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_costs
    ADD CONSTRAINT incident_costs_pkey PRIMARY KEY (id);


--
-- Name: incident_responses incident_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_responses
    ADD CONSTRAINT incident_responses_pkey PRIMARY KEY (id);


--
-- Name: incident_responses incident_responses_station_id_incident_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_responses
    ADD CONSTRAINT incident_responses_station_id_incident_id_user_id_key UNIQUE (station_id, incident_id, user_id);


--
-- Name: incidents incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);


--
-- Name: investigations investigations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investigations
    ADD CONSTRAINT investigations_pkey PRIMARY KEY (id);


--
-- Name: knox_access_log knox_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knox_access_log
    ADD CONSTRAINT knox_access_log_pkey PRIMARY KEY (id);


--
-- Name: knox_boxes knox_boxes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knox_boxes
    ADD CONSTRAINT knox_boxes_pkey PRIMARY KEY (id);


--
-- Name: knox_inspections knox_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knox_inspections
    ADD CONSTRAINT knox_inspections_pkey PRIMARY KEY (id);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: license_config license_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_config
    ADD CONSTRAINT license_config_pkey PRIMARY KEY (department_id);


--
-- Name: licenses licenses_jti_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_jti_key UNIQUE (jti);


--
-- Name: licenses licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_pkey PRIMARY KEY (license_id);


--
-- Name: licenses licenses_stripe_invoice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_stripe_invoice_id_key UNIQUE (stripe_invoice_id);


--
-- Name: maintenance maintenance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance
    ADD CONSTRAINT maintenance_pkey PRIMARY KEY (id);


--
-- Name: mayday_event_log mayday_event_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mayday_event_log
    ADD CONSTRAINT mayday_event_log_pkey PRIMARY KEY (client_id);


--
-- Name: mayday_events mayday_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mayday_events
    ADD CONSTRAINT mayday_events_pkey PRIMARY KEY (client_id);


--
-- Name: meeting_minutes meeting_minutes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_minutes
    ADD CONSTRAINT meeting_minutes_pkey PRIMARY KEY (id);


--
-- Name: member_availability member_availability_department_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_availability
    ADD CONSTRAINT member_availability_department_id_user_id_key UNIQUE (department_id, user_id);


--
-- Name: member_availability member_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_availability
    ADD CONSTRAINT member_availability_pkey PRIMARY KEY (id);


--
-- Name: member_qualifications member_qualifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_qualifications
    ADD CONSTRAINT member_qualifications_pkey PRIMARY KEY (id);


--
-- Name: members members_cal_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_cal_token_key UNIQUE (cal_token);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: module_completions module_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_completions
    ADD CONSTRAINT module_completions_pkey PRIMARY KEY (id);


--
-- Name: module_completions module_completions_station_id_user_id_module_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_completions
    ADD CONSTRAINT module_completions_station_id_user_id_module_id_key UNIQUE (station_id, user_id, module_id);


--
-- Name: mutual_aid_agreements mutual_aid_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mutual_aid_agreements
    ADD CONSTRAINT mutual_aid_agreements_pkey PRIMARY KEY (id);


--
-- Name: mutual_aid mutual_aid_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mutual_aid
    ADD CONSTRAINT mutual_aid_pkey PRIMARY KEY (id);


--
-- Name: nfirs_reports nfirs_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfirs_reports
    ADD CONSTRAINT nfirs_reports_pkey PRIMARY KEY (id);


--
-- Name: ng911_calls ng911_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ng911_calls
    ADD CONSTRAINT ng911_calls_pkey PRIMARY KEY (id);


--
-- Name: of_department_join_codes of_department_join_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_department_join_codes
    ADD CONSTRAINT of_department_join_codes_pkey PRIMARY KEY (id);


--
-- Name: of_member_invites of_member_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_member_invites
    ADD CONSTRAINT of_member_invites_pkey PRIMARY KEY (id);


--
-- Name: of_rank_notifications of_rank_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_rank_notifications
    ADD CONSTRAINT of_rank_notifications_pkey PRIMARY KEY (department_id, tier, notif_type);


--
-- Name: of_schema_migrations of_schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_schema_migrations
    ADD CONSTRAINT of_schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: of_user_departments of_user_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_user_departments
    ADD CONSTRAINT of_user_departments_pkey PRIMARY KEY (id);


--
-- Name: of_user_departments of_user_departments_user_id_department_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_user_departments
    ADD CONSTRAINT of_user_departments_user_id_department_id_key UNIQUE (user_id, department_id);


--
-- Name: ot_records ot_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_records
    ADD CONSTRAINT ot_records_pkey PRIMARY KEY (id);


--
-- Name: par_checks par_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.par_checks
    ADD CONSTRAINT par_checks_pkey PRIMARY KEY (id);


--
-- Name: pay_entries pay_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_entries
    ADD CONSTRAINT pay_entries_pkey PRIMARY KEY (id);


--
-- Name: personnel_actions personnel_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel_actions
    ADD CONSTRAINT personnel_actions_pkey PRIMARY KEY (id);


--
-- Name: policy_acknowledgments policy_acknowledgments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_acknowledgments
    ADD CONSTRAINT policy_acknowledgments_pkey PRIMARY KEY (id);


--
-- Name: pre_plan_photos pre_plan_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_plan_photos
    ADD CONSTRAINT pre_plan_photos_pkey PRIMARY KEY (id);


--
-- Name: pre_plan_photos pre_plan_photos_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_plan_photos
    ADD CONSTRAINT pre_plan_photos_storage_path_key UNIQUE (storage_path);


--
-- Name: pre_plans pre_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_plans
    ADD CONSTRAINT pre_plans_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: radio_config radio_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_config
    ADD CONSTRAINT radio_config_pkey PRIMARY KEY (id);


--
-- Name: radio_config radio_config_station_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_config
    ADD CONSTRAINT radio_config_station_id_key UNIQUE (station_id);


--
-- Name: radio_log radio_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_log
    ADD CONSTRAINT radio_log_pkey PRIMARY KEY (id);


--
-- Name: recall_events recall_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_events
    ADD CONSTRAINT recall_events_pkey PRIMARY KEY (id);


--
-- Name: recall_responses recall_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_responses
    ADD CONSTRAINT recall_responses_pkey PRIMARY KEY (id);


--
-- Name: recall_responses recall_responses_recall_id_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_responses
    ADD CONSTRAINT recall_responses_recall_id_member_id_key UNIQUE (recall_id, member_id);


--
-- Name: recruitment recruitment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruitment
    ADD CONSTRAINT recruitment_pkey PRIMARY KEY (id);


--
-- Name: retention_policy retention_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_policy
    ADD CONSTRAINT retention_policy_pkey PRIMARY KEY (table_name);


--
-- Name: retention_run_log retention_run_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_run_log
    ADD CONSTRAINT retention_run_log_pkey PRIMARY KEY (id);


--
-- Name: run_lists run_lists_department_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_lists
    ADD CONSTRAINT run_lists_department_id_date_key UNIQUE (department_id, date);


--
-- Name: run_lists run_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_lists
    ADD CONSTRAINT run_lists_pkey PRIMARY KEY (id);


--
-- Name: scenario_completions scenario_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenario_completions
    ADD CONSTRAINT scenario_completions_pkey PRIMARY KEY (id);


--
-- Name: scenario_completions scenario_completions_station_id_user_id_scenario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenario_completions
    ADD CONSTRAINT scenario_completions_station_id_user_id_scenario_id_key UNIQUE (station_id, user_id, scenario_id);


--
-- Name: shift_patterns shift_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_patterns
    ADD CONSTRAINT shift_patterns_pkey PRIMARY KEY (id);


--
-- Name: shift_swaps shift_swaps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_swaps
    ADD CONSTRAINT shift_swaps_pkey PRIMARY KEY (id);


--
-- Name: shift_trades shift_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_trades
    ADD CONSTRAINT shift_trades_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: sogs sogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sogs
    ADD CONSTRAINT sogs_pkey PRIMARY KEY (id);


--
-- Name: station_log station_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_log
    ADD CONSTRAINT station_log_pkey PRIMARY KEY (id);


--
-- Name: stations stations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_pkey PRIMARY KEY (id);


--
-- Name: timesheets timesheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheets
    ADD CONSTRAINT timesheets_pkey PRIMARY KEY (id);


--
-- Name: training_course_completions training_course_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_course_completions
    ADD CONSTRAINT training_course_completions_pkey PRIMARY KEY (id);


--
-- Name: training_course_completions training_course_completions_station_id_course_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_course_completions
    ADD CONSTRAINT training_course_completions_station_id_course_id_user_id_key UNIQUE (station_id, course_id, user_id);


--
-- Name: training_courses training_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_courses
    ADD CONSTRAINT training_courses_pkey PRIMARY KEY (id);


--
-- Name: training training_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training
    ADD CONSTRAINT training_pkey PRIMARY KEY (id);


--
-- Name: training_plans training_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plans
    ADD CONSTRAINT training_plans_pkey PRIMARY KEY (id);


--
-- Name: unit_locations unit_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_locations
    ADD CONSTRAINT unit_locations_pkey PRIMARY KEY (id);


--
-- Name: unit_status_acks unit_status_acks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_status_acks
    ADD CONSTRAINT unit_status_acks_pkey PRIMARY KEY (id);


--
-- Name: unit_status_history unit_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_status_history
    ADD CONSTRAINT unit_status_history_pkey PRIMARY KEY (id);


--
-- Name: unit_statuses unit_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_statuses
    ADD CONSTRAINT unit_statuses_pkey PRIMARY KEY (id);


--
-- Name: unit_statuses unit_statuses_station_id_apparatus_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_statuses
    ADD CONSTRAINT unit_statuses_station_id_apparatus_id_key UNIQUE (station_id, apparatus_id);


--
-- Name: fi_sync_ops uq_fi_sync_ops_client; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_sync_ops
    ADD CONSTRAINT uq_fi_sync_ops_client UNIQUE (department_id, client_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: vacancy_fill vacancy_fill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vacancy_fill
    ADD CONSTRAINT vacancy_fill_pkey PRIMARY KEY (id);


--
-- Name: volunteer_hours volunteer_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_hours
    ADD CONSTRAINT volunteer_hours_pkey PRIMARY KEY (id);


--
-- Name: weather_cache weather_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_cache
    ADD CONSTRAINT weather_cache_pkey PRIMARY KEY (lat_key, lng_key);


--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: webhook_subscriptions webhook_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_subscriptions
    ADD CONSTRAINT webhook_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: wedge_department_access wedge_department_access_invite_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wedge_department_access
    ADD CONSTRAINT wedge_department_access_invite_code_key UNIQUE (invite_code);


--
-- Name: wedge_department_access wedge_department_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wedge_department_access
    ADD CONSTRAINT wedge_department_access_pkey PRIMARY KEY (department_id);


--
-- Name: wedge_members wedge_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wedge_members
    ADD CONSTRAINT wedge_members_pkey PRIMARY KEY (user_id, department_id);


--
-- Name: wellness wellness_memberId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wellness
    ADD CONSTRAINT "wellness_memberId_key" UNIQUE ("memberId");


--
-- Name: wellness wellness_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wellness
    ADD CONSTRAINT wellness_pkey PRIMARY KEY (id);


--
-- Name: workflow_tasks workflow_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_tasks
    ADD CONSTRAINT workflow_tasks_pkey PRIMARY KEY (id);


--
-- Name: idx_active_boards_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_active_boards_department ON public.active_boards USING btree (department_id);


--
-- Name: idx_active_resources_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_active_resources_department ON public.active_resources USING btree (department_id);


--
-- Name: idx_activity_entries_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_entries_department ON public.activity_entries USING btree (department_id);


--
-- Name: idx_after_action_reports_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_after_action_reports_department ON public.after_action_reports USING btree (department_id);


--
-- Name: idx_ai_usage_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_department ON public.ai_usage USING btree (department_id);


--
-- Name: idx_ai_usage_dept_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_dept_date ON public.ai_usage USING btree (department_id, used_on);


--
-- Name: idx_ai_usage_station_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_station_date ON public.ai_usage USING btree (station_id, used_on);


--
-- Name: idx_app_assign_apparatus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_assign_apparatus ON public.apparatus_assignments USING btree (apparatus_id);


--
-- Name: idx_app_assign_dept_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_assign_dept_date ON public.apparatus_assignments USING btree (department_id, date);


--
-- Name: idx_app_assign_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_assign_member ON public.apparatus_assignments USING btree (member_id);


--
-- Name: idx_app_assign_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_assign_position ON public.apparatus_assignments USING btree (position_id);


--
-- Name: idx_app_assign_shift; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_assign_shift ON public.apparatus_assignments USING btree (shift_id);


--
-- Name: idx_app_assign_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_assign_station ON public.apparatus_assignments USING btree (station_id);


--
-- Name: idx_app_pos_apparatus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_pos_apparatus ON public.apparatus_positions USING btree (apparatus_id);


--
-- Name: idx_app_pos_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_pos_station ON public.apparatus_positions USING btree (station_id);


--
-- Name: idx_apparatus_assignments_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apparatus_assignments_department ON public.apparatus_assignments USING btree (department_id);


--
-- Name: idx_apparatus_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apparatus_department ON public.apparatus USING btree (department_id);


--
-- Name: idx_apparatus_dept_designation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_apparatus_dept_designation ON public.apparatus USING btree (department_id, designation);


--
-- Name: idx_apparatus_neris_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apparatus_neris_type ON public.apparatus USING btree (department_id, neris_type);


--
-- Name: idx_apparatus_oos_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apparatus_oos_department ON public.apparatus_oos USING btree (department_id);


--
-- Name: idx_apparatus_positions_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apparatus_positions_department ON public.apparatus_positions USING btree (department_id);


--
-- Name: idx_assets_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_department ON public.assets USING btree (department_id);


--
-- Name: idx_assistant_alerts_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_alerts_category ON public.assistant_alerts USING btree (category, member_id);


--
-- Name: idx_assistant_alerts_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_alerts_department ON public.assistant_alerts USING btree (department_id);


--
-- Name: idx_assistant_alerts_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_alerts_member ON public.assistant_alerts USING btree (member_id, viewed_at);


--
-- Name: idx_assistant_feedback_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_feedback_department ON public.assistant_feedback USING btree (department_id);


--
-- Name: idx_assistant_feedback_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_feedback_member ON public.assistant_feedback USING btree (member_id);


--
-- Name: idx_assistant_preferences_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_preferences_department ON public.assistant_preferences USING btree (department_id);


--
-- Name: idx_assistant_preferences_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_preferences_member ON public.assistant_preferences USING btree (member_id);


--
-- Name: idx_attachments_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attachments_department ON public.attachments USING btree (department_id);


--
-- Name: idx_attachments_module_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attachments_module_record ON public.attachments USING btree (module, record_id);


--
-- Name: idx_audit_log_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_department ON public.audit_log USING btree (department_id);


--
-- Name: idx_audit_log_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_record ON public.audit_log USING btree (table_name, record_id);


--
-- Name: idx_audit_log_station_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_station_at ON public.audit_log USING btree (station_id, at DESC);


--
-- Name: idx_avl_connections_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avl_connections_dept ON public.avl_connections USING btree (department_id);


--
-- Name: idx_avl_connections_secret; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avl_connections_secret ON public.avl_connections USING btree (webhook_secret_hash);


--
-- Name: idx_avl_devices_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avl_devices_dept ON public.avl_devices USING btree (department_id);


--
-- Name: idx_budget_lines_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budget_lines_department ON public.budget_lines USING btree (department_id);


--
-- Name: idx_budget_transactions_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budget_transactions_department ON public.budget_transactions USING btree (department_id);


--
-- Name: idx_bug_reports_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bug_reports_created ON public.bug_reports USING btree (created_at DESC);


--
-- Name: idx_bug_reports_self_heal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bug_reports_self_heal ON public.bug_reports USING btree (self_heal_status);


--
-- Name: idx_bug_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bug_reports_status ON public.bug_reports USING btree (status);


--
-- Name: idx_bug_reports_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bug_reports_user ON public.bug_reports USING btree (user_id);


--
-- Name: idx_bulletins_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulletins_department ON public.bulletins USING btree (department_id);


--
-- Name: idx_cad_alert_units_alert; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cad_alert_units_alert ON public.cad_alert_units USING btree (cad_alert_id);


--
-- Name: idx_cad_alert_units_apparatus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cad_alert_units_apparatus ON public.cad_alert_units USING btree (department_id, apparatus_id, dispatched_at DESC);


--
-- Name: idx_cad_alert_units_norm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cad_alert_units_norm ON public.cad_alert_units USING btree (department_id, unit_norm, dispatched_at DESC);


--
-- Name: idx_cad_alerts_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cad_alerts_department ON public.cad_alerts USING btree (department_id);


--
-- Name: idx_cad_alerts_dept_dispatched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cad_alerts_dept_dispatched ON public.cad_alerts USING btree (department_id, dispatched_at DESC, id DESC);


--
-- Name: idx_cad_alerts_station_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cad_alerts_station_ts ON public.cad_alerts USING btree (station_id, dispatched_at DESC);


--
-- Name: idx_cad_connections_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cad_connections_department ON public.cad_connections USING btree (department_id);


--
-- Name: idx_cad_connections_webhook_secret; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cad_connections_webhook_secret ON public.cad_connections USING btree (webhook_secret_hash);


--
-- Name: idx_cadets_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadets_department ON public.cadets USING btree (department_id);


--
-- Name: idx_calendar_subscriptions_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_subscriptions_department ON public.calendar_subscriptions USING btree (department_id);


--
-- Name: idx_calendar_subscriptions_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_subscriptions_member ON public.calendar_subscriptions USING btree (member_id);


--
-- Name: idx_calendar_subscriptions_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_subscriptions_token ON public.calendar_subscriptions USING btree (cal_token);


--
-- Name: idx_checklist_completions_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklist_completions_department ON public.checklist_completions USING btree (department_id);


--
-- Name: idx_checklist_templates_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklist_templates_department ON public.checklist_templates USING btree (department_id);


--
-- Name: idx_community_events_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_events_department ON public.community_events USING btree (department_id);


--
-- Name: idx_correspondence_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_correspondence_department ON public.correspondence USING btree (department_id);


--
-- Name: idx_correspondence_module_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_correspondence_module_record ON public.correspondence USING btree (module, record_id);


--
-- Name: idx_courses_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_department ON public.courses USING btree (department_id);


--
-- Name: idx_coverage_outreach_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coverage_outreach_department ON public.coverage_outreach USING btree (department_id);


--
-- Name: idx_crr_programs_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crr_programs_department ON public.crr_programs USING btree (department_id);


--
-- Name: idx_crr_visits_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crr_visits_department ON public.crr_visits USING btree (department_id);


--
-- Name: idx_cylinders_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cylinders_department ON public.cylinders USING btree (department_id);


--
-- Name: idx_daily_staffing_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_staffing_department ON public.daily_staffing USING btree (department_id);


--
-- Name: idx_dept_documents_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dept_documents_department ON public.dept_documents USING btree (department_id);


--
-- Name: idx_donations_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_donations_department ON public.donations USING btree (department_id);


--
-- Name: idx_drills_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drills_department ON public.drills USING btree (department_id);


--
-- Name: idx_equipment_checkout_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_checkout_department ON public.equipment_checkout USING btree (department_id);


--
-- Name: idx_events_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_department ON public.events USING btree (department_id);


--
-- Name: idx_exam_assignments_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_assignments_department ON public.exam_assignments USING btree (department_id);


--
-- Name: idx_exam_submissions_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_submissions_department ON public.exam_submissions USING btree (department_id);


--
-- Name: idx_exams_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exams_department ON public.exams USING btree (department_id);


--
-- Name: idx_expo_push_tokens_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expo_push_tokens_dept ON public.expo_push_tokens USING btree (department_id);


--
-- Name: idx_exposure_incident; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exposure_incident ON public.exposure_records USING btree (incident_id);


--
-- Name: idx_exposure_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exposure_member ON public.exposure_records USING btree (member_id);


--
-- Name: idx_exposure_records_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exposure_records_department ON public.exposure_records USING btree (department_id);


--
-- Name: idx_exposure_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exposure_station ON public.exposure_records USING btree (station_id);


--
-- Name: idx_fi_answers_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_answers_dept ON public.fi_inspection_answers USING btree (department_id);


--
-- Name: idx_fi_answers_insp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_answers_insp ON public.fi_inspection_answers USING btree (inspection_id);


--
-- Name: idx_fi_checklist_items_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_checklist_items_dept ON public.fi_checklist_items USING btree (department_id);


--
-- Name: idx_fi_checklist_items_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_checklist_items_list ON public.fi_checklist_items USING btree (checklist_id);


--
-- Name: idx_fi_checklists_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_checklists_dept ON public.fi_checklists USING btree (department_id);


--
-- Name: idx_fi_code_library_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_code_library_dept ON public.fi_code_library USING btree (department_id);


--
-- Name: idx_fi_designations_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_designations_dept ON public.fi_designations USING btree (department_id);


--
-- Name: idx_fi_designations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_designations_user ON public.fi_designations USING btree (department_id, user_id) WHERE (revoked_at IS NULL);


--
-- Name: idx_fi_inspection_types_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_inspection_types_dept ON public.fi_inspection_types USING btree (department_id);


--
-- Name: idx_fi_inspections_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_inspections_assignee ON public.fi_inspections USING btree (department_id, assigned_to_user_id) WHERE ((deleted_at IS NULL) AND ("completedDate" IS NULL));


--
-- Name: idx_fi_inspections_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_inspections_department ON public.fi_inspections USING btree (department_id);


--
-- Name: idx_fi_inspections_dept_result_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_inspections_dept_result_code ON public.fi_inspections USING btree (department_id, result_code);


--
-- Name: idx_fi_notice_service_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_notice_service_dept ON public.fi_notice_service USING btree (department_id);


--
-- Name: idx_fi_notice_service_inspection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_notice_service_inspection ON public.fi_notice_service USING btree (department_id, inspection_id) WHERE (voided_at IS NULL);


--
-- Name: idx_fi_notices_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_notices_dept ON public.fi_notices USING btree (department_id);


--
-- Name: idx_fi_notices_insp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_notices_insp ON public.fi_notices USING btree (inspection_id);


--
-- Name: idx_fi_permits_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_permits_department ON public.fi_permits USING btree (department_id);


--
-- Name: idx_fi_properties_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_properties_department ON public.fi_properties USING btree (department_id);


--
-- Name: idx_fi_signatures_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_signatures_dept ON public.fi_signatures USING btree (department_id);


--
-- Name: idx_fi_signatures_insp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_signatures_insp ON public.fi_signatures USING btree (inspection_id);


--
-- Name: idx_fi_sync_ops_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_sync_ops_dept ON public.fi_sync_ops USING btree (department_id);


--
-- Name: idx_fi_violations_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_violations_dept ON public.fi_violations USING btree (department_id);


--
-- Name: idx_fi_violations_dept_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_violations_dept_status ON public.fi_violations USING btree (department_id, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_fill_stations_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fill_stations_department ON public.fill_stations USING btree (department_id);


--
-- Name: idx_fs_hazmat_materials_cas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fs_hazmat_materials_cas ON public.fs_hazmat_materials USING btree (cas_number);


--
-- Name: idx_fs_hazmat_materials_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fs_hazmat_materials_class ON public.fs_hazmat_materials USING btree (hazard_class);


--
-- Name: idx_fs_hazmat_materials_guide; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fs_hazmat_materials_guide ON public.fs_hazmat_materials USING btree (guide_number);


--
-- Name: idx_fs_hazmat_materials_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fs_hazmat_materials_name ON public.fs_hazmat_materials USING gin (to_tsvector('english'::regconfig, name));


--
-- Name: idx_fs_hazmat_materials_un; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fs_hazmat_materials_un ON public.fs_hazmat_materials USING btree (un_number);


--
-- Name: idx_fto_evaluations_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fto_evaluations_department ON public.fto_evaluations USING btree (department_id);


--
-- Name: idx_fto_observations_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fto_observations_department ON public.fto_observations USING btree (department_id);


--
-- Name: idx_fundraising_campaigns_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fundraising_campaigns_department ON public.fundraising_campaigns USING btree (department_id);


--
-- Name: idx_grants_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grants_department ON public.grants USING btree (department_id);


--
-- Name: idx_grievances_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grievances_department ON public.grievances USING btree (department_id);


--
-- Name: idx_grievances_filed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grievances_filed_by ON public.grievances USING btree (filed_by);


--
-- Name: idx_hazaudit_changed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hazaudit_changed_by ON public.fs_hazmat_incident_audit USING btree (changed_by);


--
-- Name: idx_hazaudit_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hazaudit_department ON public.fs_hazmat_incident_audit USING btree (department_id);


--
-- Name: idx_hazinc_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hazinc_created_by ON public.fs_hazmat_incidents USING btree (created_by);


--
-- Name: idx_hazinc_ic_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hazinc_ic_user ON public.fs_hazmat_incidents USING btree (ic_user_id);


--
-- Name: idx_hazinc_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hazinc_station ON public.fs_hazmat_incidents USING btree (station_id);


--
-- Name: idx_hazmat_audit_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hazmat_audit_changed_at ON public.fs_hazmat_incident_audit USING btree (changed_at);


--
-- Name: idx_hazmat_audit_incident; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hazmat_audit_incident ON public.fs_hazmat_incident_audit USING btree (incident_id);


--
-- Name: idx_hazmat_iso_un_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_hazmat_iso_un_number ON public.fs_hazmat_isolation_distances USING btree (un_number);


--
-- Name: idx_hydrants_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hydrants_department ON public.hydrants USING btree (department_id);


--
-- Name: idx_inc_costs_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inc_costs_station ON public.incident_costs USING btree (station_id);


--
-- Name: idx_incident_costs_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incident_costs_department ON public.incident_costs USING btree (department_id);


--
-- Name: idx_incident_responses_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incident_responses_department ON public.incident_responses USING btree (department_id);


--
-- Name: idx_incident_responses_incident_apparatus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incident_responses_incident_apparatus ON public.incident_responses USING btree (incident_id, apparatus_id);


--
-- Name: idx_incident_responses_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incident_responses_member ON public.incident_responses USING btree (member_id) WHERE (member_id IS NOT NULL);


--
-- Name: idx_incidents_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidents_department ON public.incidents USING btree (department_id);


--
-- Name: idx_incidents_neris_sweep; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidents_neris_sweep ON public.incidents USING btree (department_id) WHERE ((neris_submission_state = ANY (ARRAY['submit_failed'::text, 'update_pending'::text])) OR ((neris_incident_uid IS NOT NULL) AND (neris_incident_status = ANY (ARRAY['SUBMITTED'::text, 'PENDING_APPROVAL'::text, 'PENDING_INCIDENT_DATA'::text]))));


--
-- Name: idx_incidents_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidents_station ON public.incidents USING btree (station_id);


--
-- Name: idx_incidents_station_number_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_incidents_station_number_active ON public.incidents USING btree (station_id, "incidentNumber") WHERE (deleted_at IS NULL);


--
-- Name: idx_investigations_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_investigations_department ON public.investigations USING btree (department_id);


--
-- Name: idx_join_codes_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_join_codes_dept ON public.of_department_join_codes USING btree (department_id);


--
-- Name: idx_join_codes_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_join_codes_hash ON public.of_department_join_codes USING btree (code_hash);


--
-- Name: idx_knox_access_log_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knox_access_log_department ON public.knox_access_log USING btree (department_id);


--
-- Name: idx_knox_boxes_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knox_boxes_department ON public.knox_boxes USING btree (department_id);


--
-- Name: idx_knox_inspections_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knox_inspections_department ON public.knox_inspections USING btree (department_id);


--
-- Name: idx_leave_requests_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_requests_department ON public.leave_requests USING btree (department_id);


--
-- Name: idx_maintenance_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maintenance_department ON public.maintenance USING btree (department_id);


--
-- Name: idx_mayday_event_log_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mayday_event_log_department ON public.mayday_event_log USING btree (department_id);


--
-- Name: idx_mayday_event_log_mayday_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mayday_event_log_mayday_at ON public.mayday_event_log USING btree (mayday_id, at);


--
-- Name: idx_mayday_events_dept_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mayday_events_dept_time ON public.mayday_events USING btree (department_id, declared_at DESC);


--
-- Name: idx_meeting_minutes_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_minutes_department ON public.meeting_minutes USING btree (department_id);


--
-- Name: idx_member_availability_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_availability_department ON public.member_availability USING btree (department_id);


--
-- Name: idx_member_invites_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_invites_member ON public.of_member_invites USING btree (member_id);


--
-- Name: idx_member_invites_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_invites_token ON public.of_member_invites USING btree (token_hash);


--
-- Name: idx_member_qualifications_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_qualifications_department ON public.member_qualifications USING btree (department_id);


--
-- Name: idx_members_crew; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_members_crew ON public.members USING btree (department_id, assigned_unit_id, assigned_group);


--
-- Name: idx_members_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_members_department ON public.members USING btree (department_id);


--
-- Name: idx_members_dept_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_members_dept_number ON public.members USING btree (department_id, "memberNumber");


--
-- Name: idx_members_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_members_external_id ON public.members USING btree (department_id, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: idx_members_personnel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_members_personnel_id ON public.members USING btree (department_id, personnel_id) WHERE (personnel_id IS NOT NULL);


--
-- Name: idx_members_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_members_station ON public.members USING btree (station_id);


--
-- Name: idx_members_user_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_members_user_dept ON public.members USING btree (user_id, department_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_members_user_id ON public.members USING btree (user_id);


--
-- Name: idx_messages_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_department ON public.messages USING btree (department_id);


--
-- Name: idx_module_completions_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_module_completions_department ON public.module_completions USING btree (department_id);


--
-- Name: idx_mutual_aid_agreements_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mutual_aid_agreements_department ON public.mutual_aid_agreements USING btree (department_id);


--
-- Name: idx_mutual_aid_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mutual_aid_department ON public.mutual_aid USING btree (department_id);


--
-- Name: idx_nfirs_reports_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nfirs_reports_department ON public.nfirs_reports USING btree (department_id);


--
-- Name: idx_ng911_calls_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ng911_calls_department ON public.ng911_calls USING btree (department_id);


--
-- Name: idx_of_member_invites_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_of_member_invites_department ON public.of_member_invites USING btree (department_id);


--
-- Name: idx_of_user_departments_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_of_user_departments_dept ON public.of_user_departments USING btree (department_id);


--
-- Name: idx_of_user_departments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_of_user_departments_user ON public.of_user_departments USING btree (user_id);


--
-- Name: idx_ot_records_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_records_department ON public.ot_records USING btree (department_id);


--
-- Name: idx_par_checks_dept_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_par_checks_dept_time ON public.par_checks USING btree (department_id, ran_at DESC);


--
-- Name: idx_pay_entries_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pay_entries_department ON public.pay_entries USING btree (department_id);


--
-- Name: idx_personnel_actions_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personnel_actions_department ON public.personnel_actions USING btree (department_id);


--
-- Name: idx_policy_acknowledgments_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_policy_acknowledgments_department ON public.policy_acknowledgments USING btree (department_id);


--
-- Name: idx_pre_plan_photos_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_plan_photos_dept ON public.pre_plan_photos USING btree (department_id);


--
-- Name: idx_pre_plan_photos_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_plan_photos_plan ON public.pre_plan_photos USING btree (plan_id, sort_order, id);


--
-- Name: idx_pre_plans_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_plans_department ON public.pre_plans USING btree (department_id);


--
-- Name: idx_push_subscriptions_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_department ON public.push_subscriptions USING btree (department_id);


--
-- Name: idx_radio_config_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_radio_config_department ON public.radio_config USING btree (department_id);


--
-- Name: idx_radio_log_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_radio_log_department ON public.radio_log USING btree (department_id);


--
-- Name: idx_radio_log_station_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_radio_log_station_ts ON public.radio_log USING btree (station_id, "timestamp" DESC);


--
-- Name: idx_recall_events_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recall_events_department ON public.recall_events USING btree (department_id);


--
-- Name: idx_recruitment_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruitment_department ON public.recruitment USING btree (department_id);


--
-- Name: idx_run_lists_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_run_lists_department ON public.run_lists USING btree (department_id);


--
-- Name: idx_scenario_completions_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scenario_completions_department ON public.scenario_completions USING btree (department_id);


--
-- Name: idx_shift_patterns_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shift_patterns_department ON public.shift_patterns USING btree (department_id);


--
-- Name: idx_shift_swaps_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shift_swaps_department ON public.shift_swaps USING btree (department_id);


--
-- Name: idx_shift_trades_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shift_trades_department ON public.shift_trades USING btree (department_id);


--
-- Name: idx_shifts_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shifts_department ON public.shifts USING btree (department_id);


--
-- Name: idx_sogs_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sogs_department ON public.sogs USING btree (department_id);


--
-- Name: idx_station_log_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_station_log_department ON public.station_log USING btree (department_id);


--
-- Name: idx_stations_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stations_department ON public.stations USING btree (department_id);


--
-- Name: idx_t3_un; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t3_un ON public.fs_hazmat_table3_distances USING btree (un_number);


--
-- Name: idx_timesheets_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timesheets_department ON public.timesheets USING btree (department_id);


--
-- Name: idx_training_course_completions_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_course_completions_department ON public.training_course_completions USING btree (department_id);


--
-- Name: idx_training_courses_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_courses_department ON public.training_courses USING btree (department_id);


--
-- Name: idx_training_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_department ON public.training USING btree (department_id);


--
-- Name: idx_training_plans_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_plans_department ON public.training_plans USING btree (department_id);


--
-- Name: idx_unit_locations_apparatus; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unit_locations_apparatus ON public.unit_locations USING btree (apparatus_id);


--
-- Name: idx_unit_locations_dept_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unit_locations_dept_updated ON public.unit_locations USING btree (department_id, updated_at DESC);


--
-- Name: idx_unit_status_acks_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unit_status_acks_unit ON public.unit_status_acks USING btree (department_id, apparatus_id, acked_at DESC);


--
-- Name: idx_unit_status_history_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unit_status_history_department ON public.unit_status_history USING btree (department_id);


--
-- Name: idx_unit_status_history_station_incident; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unit_status_history_station_incident ON public.unit_status_history USING btree (station_id, incident_id);


--
-- Name: idx_unit_statuses_apparatus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unit_statuses_apparatus ON public.unit_statuses USING btree (apparatus_id);


--
-- Name: idx_unit_statuses_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unit_statuses_department ON public.unit_statuses USING btree (department_id);


--
-- Name: idx_users_apparatus_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_apparatus_unit ON public.users USING btree (apparatus_id) WHERE (apparatus_id IS NOT NULL);


--
-- Name: idx_users_email_verify_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email_verify_token ON public.users USING btree (email_verify_token_hash);


--
-- Name: idx_users_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_external_id ON public.users USING btree (external_id) WHERE (external_id IS NOT NULL);


--
-- Name: idx_vacancy_fill_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vacancy_fill_department ON public.vacancy_fill USING btree (department_id);


--
-- Name: idx_volunteer_hours_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_volunteer_hours_department ON public.volunteer_hours USING btree (department_id);


--
-- Name: idx_webhook_del_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_del_sub ON public.webhook_deliveries USING btree (subscription_id, created_at DESC);


--
-- Name: idx_webhook_deliveries_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_deliveries_department ON public.webhook_deliveries USING btree (department_id);


--
-- Name: idx_webhook_subscriptions_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_subscriptions_department ON public.webhook_subscriptions USING btree (department_id);


--
-- Name: idx_wedge_members_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wedge_members_department ON public.wedge_members USING btree (department_id);


--
-- Name: idx_wellness_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wellness_department ON public.wellness USING btree (department_id);


--
-- Name: idx_workflow_tasks_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_tasks_department ON public.workflow_tasks USING btree (department_id);


--
-- Name: idx_workflow_tasks_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_tasks_station ON public.workflow_tasks USING btree (station_id, status);


--
-- Name: idx_workflow_tasks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_tasks_user ON public.workflow_tasks USING btree (user_id, status);


--
-- Name: licenses_active_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX licenses_active_status_idx ON public.licenses USING btree (status) WHERE (status = 'active'::text);


--
-- Name: licenses_dept_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX licenses_dept_email_idx ON public.licenses USING btree (dept_email);


--
-- Name: licenses_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX licenses_expires_at_idx ON public.licenses USING btree (expires_at) WHERE (status = 'active'::text);


--
-- Name: licenses_stripe_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX licenses_stripe_customer_idx ON public.licenses USING btree (stripe_customer_id);


--
-- Name: uq_apparatus_assignments_seat; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_apparatus_assignments_seat ON public.apparatus_assignments USING btree (department_id, date, apparatus_id, position_name);


--
-- Name: uq_cad_alert_units_apparatus; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_cad_alert_units_apparatus ON public.cad_alert_units USING btree (cad_alert_id, apparatus_id) WHERE (apparatus_id IS NOT NULL);


--
-- Name: uq_cad_alert_units_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_cad_alert_units_token ON public.cad_alert_units USING btree (cad_alert_id, unit_norm);


--
-- Name: uq_fi_designations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_fi_designations_active ON public.fi_designations USING btree (department_id, user_id, role) WHERE (revoked_at IS NULL);


--
-- Name: uq_par_checks_dept_client; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_par_checks_dept_client ON public.par_checks USING btree (department_id, client_id) WHERE (client_id IS NOT NULL);


--
-- Name: active_boards trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.active_boards FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: active_resources trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.active_resources FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: activity_entries trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.activity_entries FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: after_action_reports trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.after_action_reports FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: ai_usage trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.ai_usage FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: apparatus trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.apparatus FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: apparatus_assignments trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.apparatus_assignments FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: apparatus_oos trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.apparatus_oos FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: apparatus_positions trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.apparatus_positions FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: assets trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: assistant_alerts trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.assistant_alerts FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: assistant_feedback trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.assistant_feedback FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: assistant_preferences trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.assistant_preferences FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: attachments trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: audit_log trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: budget_lines trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.budget_lines FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: budget_transactions trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.budget_transactions FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: bulletins trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.bulletins FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: cad_alert_units trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.cad_alert_units FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: cad_alerts trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.cad_alerts FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: cad_connections trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.cad_connections FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: cadets trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.cadets FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: calendar_subscriptions trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.calendar_subscriptions FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: checklist_completions trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.checklist_completions FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: checklist_templates trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.checklist_templates FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: community_events trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.community_events FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: correspondence trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.correspondence FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: courses trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: coverage_outreach trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.coverage_outreach FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: crr_programs trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.crr_programs FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: crr_visits trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.crr_visits FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: cylinders trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.cylinders FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: daily_staffing trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.daily_staffing FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: dept_documents trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.dept_documents FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: donations trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.donations FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: drills trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.drills FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: equipment_checkout trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.equipment_checkout FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: events trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: exam_assignments trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.exam_assignments FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: exam_submissions trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.exam_submissions FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: exams trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: expo_push_tokens trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.expo_push_tokens FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: exposure_records trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.exposure_records FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: fi_inspections trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fi_inspections FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: fi_permits trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fi_permits FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: fi_properties trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fi_properties FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: fill_stations trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fill_stations FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: fs_hazmat_incidents trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fs_hazmat_incidents FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: fto_evaluations trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fto_evaluations FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: fto_observations trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fto_observations FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: fundraising_campaigns trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fundraising_campaigns FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: grants trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.grants FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: grievances trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.grievances FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: hydrants trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.hydrants FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: incident_costs trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.incident_costs FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: incident_responses trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.incident_responses FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: incidents trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: investigations trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.investigations FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: knox_access_log trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.knox_access_log FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: knox_boxes trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.knox_boxes FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: knox_inspections trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.knox_inspections FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: leave_requests trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: maintenance trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.maintenance FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: meeting_minutes trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.meeting_minutes FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: member_availability trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.member_availability FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: member_qualifications trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.member_qualifications FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: members trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: messages trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: module_completions trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.module_completions FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: mutual_aid trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.mutual_aid FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: mutual_aid_agreements trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.mutual_aid_agreements FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: nfirs_reports trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.nfirs_reports FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: ng911_calls trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.ng911_calls FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: ot_records trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.ot_records FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: par_checks trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.par_checks FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: pay_entries trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.pay_entries FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: personnel_actions trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.personnel_actions FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: policy_acknowledgments trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.policy_acknowledgments FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: pre_plan_photos trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.pre_plan_photos FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: pre_plans trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.pre_plans FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: push_subscriptions trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: radio_config trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.radio_config FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: radio_log trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.radio_log FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: recall_events trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.recall_events FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: recruitment trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.recruitment FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: run_lists trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.run_lists FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: scenario_completions trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.scenario_completions FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: shift_patterns trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.shift_patterns FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: shift_swaps trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.shift_swaps FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: shift_trades trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.shift_trades FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: shifts trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: sogs trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.sogs FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: station_log trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.station_log FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: timesheets trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.timesheets FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: training trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.training FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: training_course_completions trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.training_course_completions FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: training_courses trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.training_courses FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: training_plans trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.training_plans FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: unit_locations trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.unit_locations FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: unit_status_acks trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.unit_status_acks FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: unit_status_history trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.unit_status_history FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: unit_statuses trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.unit_statuses FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: vacancy_fill trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.vacancy_fill FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: volunteer_hours trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.volunteer_hours FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: webhook_deliveries trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.webhook_deliveries FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: webhook_subscriptions trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.webhook_subscriptions FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: wellness trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.wellness FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: workflow_tasks trg_sync_department_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.workflow_tasks FOR EACH ROW EXECUTE FUNCTION public.of_sync_department_id();


--
-- Name: active_boards active_boards_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_boards
    ADD CONSTRAINT active_boards_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: apparatus_assignments apparatus_assignments_apparatus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus_assignments
    ADD CONSTRAINT apparatus_assignments_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES public.apparatus(id) ON DELETE CASCADE;


--
-- Name: apparatus_assignments apparatus_assignments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus_assignments
    ADD CONSTRAINT apparatus_assignments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: apparatus_assignments apparatus_assignments_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus_assignments
    ADD CONSTRAINT apparatus_assignments_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: apparatus_assignments apparatus_assignments_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus_assignments
    ADD CONSTRAINT apparatus_assignments_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.apparatus_positions(id) ON DELETE SET NULL;


--
-- Name: apparatus_assignments apparatus_assignments_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus_assignments
    ADD CONSTRAINT apparatus_assignments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE CASCADE;


--
-- Name: apparatus_positions apparatus_positions_apparatus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus_positions
    ADD CONSTRAINT apparatus_positions_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES public.apparatus(id) ON DELETE CASCADE;


--
-- Name: apparatus_positions apparatus_positions_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apparatus_positions
    ADD CONSTRAINT apparatus_positions_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: assistant_feedback assistant_feedback_alert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_feedback
    ADD CONSTRAINT assistant_feedback_alert_id_fkey FOREIGN KEY (alert_id) REFERENCES public.assistant_alerts(id) ON DELETE CASCADE;


--
-- Name: bug_reports bug_reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bug_reports
    ADD CONSTRAINT bug_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: cad_alert_units cad_alert_units_apparatus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cad_alert_units
    ADD CONSTRAINT cad_alert_units_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES public.apparatus(id) ON DELETE SET NULL;


--
-- Name: cad_alert_units cad_alert_units_cad_alert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cad_alert_units
    ADD CONSTRAINT cad_alert_units_cad_alert_id_fkey FOREIGN KEY (cad_alert_id) REFERENCES public.cad_alerts(id) ON DELETE CASCADE;


--
-- Name: cad_alert_units cad_alert_units_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cad_alert_units
    ADD CONSTRAINT cad_alert_units_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: calendar_subscriptions calendar_subscriptions_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_subscriptions
    ADD CONSTRAINT calendar_subscriptions_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: checklist_completions checklist_completions_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_completions
    ADD CONSTRAINT "checklist_completions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public.checklist_templates(id) ON DELETE CASCADE;


--
-- Name: daily_staffing daily_staffing_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_staffing
    ADD CONSTRAINT daily_staffing_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: donations donations_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.fundraising_campaigns(id) ON DELETE SET NULL;


--
-- Name: equipment_checkout equipment_checkout_checked_out_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_checkout
    ADD CONSTRAINT equipment_checkout_checked_out_by_fkey FOREIGN KEY (checked_out_by) REFERENCES public.members(id);


--
-- Name: equipment_checkout equipment_checkout_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_checkout
    ADD CONSTRAINT equipment_checkout_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id);


--
-- Name: exam_assignments exam_assignments_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_assignments
    ADD CONSTRAINT exam_assignments_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--
-- Name: exam_submissions exam_submissions_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_submissions
    ADD CONSTRAINT exam_submissions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--
-- Name: expo_push_tokens expo_push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expo_push_tokens
    ADD CONSTRAINT expo_push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: exposure_records exposure_records_incident_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exposure_records
    ADD CONSTRAINT exposure_records_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE SET NULL;


--
-- Name: exposure_records exposure_records_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exposure_records
    ADD CONSTRAINT exposure_records_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE RESTRICT;


--
-- Name: exposure_records exposure_records_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exposure_records
    ADD CONSTRAINT exposure_records_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: fi_checklist_items fi_checklist_items_checklist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_checklist_items
    ADD CONSTRAINT fi_checklist_items_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.fi_checklists(id) ON DELETE CASCADE;


--
-- Name: fi_checklist_items fi_checklist_items_code_ref_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_checklist_items
    ADD CONSTRAINT fi_checklist_items_code_ref_id_fkey FOREIGN KEY (code_ref_id) REFERENCES public.fi_code_library(id) ON DELETE SET NULL;


--
-- Name: fi_inspection_answers fi_inspection_answers_checklist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_inspection_answers
    ADD CONSTRAINT fi_inspection_answers_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.fi_checklists(id) ON DELETE SET NULL;


--
-- Name: fi_inspection_answers fi_inspection_answers_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_inspection_answers
    ADD CONSTRAINT fi_inspection_answers_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.fi_inspections(id) ON DELETE RESTRICT;


--
-- Name: fi_inspection_answers fi_inspection_answers_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_inspection_answers
    ADD CONSTRAINT fi_inspection_answers_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.fi_checklist_items(id) ON DELETE SET NULL;


--
-- Name: fi_inspection_types fi_inspection_types_default_checklist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_inspection_types
    ADD CONSTRAINT fi_inspection_types_default_checklist_id_fkey FOREIGN KEY (default_checklist_id) REFERENCES public.fi_checklists(id) ON DELETE SET NULL;


--
-- Name: fi_notice_service fi_notice_service_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_notice_service
    ADD CONSTRAINT fi_notice_service_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.fi_inspections(id) ON DELETE RESTRICT;


--
-- Name: fi_notice_service fi_notice_service_notice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_notice_service
    ADD CONSTRAINT fi_notice_service_notice_id_fkey FOREIGN KEY (notice_id) REFERENCES public.fi_notices(id) ON DELETE RESTRICT;


--
-- Name: fi_notices fi_notices_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_notices
    ADD CONSTRAINT fi_notices_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.fi_inspections(id) ON DELETE RESTRICT;


--
-- Name: fi_signatures fi_signatures_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_signatures
    ADD CONSTRAINT fi_signatures_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.fi_inspections(id) ON DELETE RESTRICT;


--
-- Name: fi_violations fi_violations_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fi_violations
    ADD CONSTRAINT fi_violations_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.fi_inspections(id) ON DELETE RESTRICT;


--
-- Name: fs_hazmat_incident_audit fs_hazmat_incident_audit_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_incident_audit
    ADD CONSTRAINT fs_hazmat_incident_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- Name: fs_hazmat_incident_audit fs_hazmat_incident_audit_incident_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_incident_audit
    ADD CONSTRAINT fs_hazmat_incident_audit_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.fs_hazmat_incidents(id) ON DELETE CASCADE;


--
-- Name: fs_hazmat_incidents fs_hazmat_incidents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_incidents
    ADD CONSTRAINT fs_hazmat_incidents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: fs_hazmat_incidents fs_hazmat_incidents_ic_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_incidents
    ADD CONSTRAINT fs_hazmat_incidents_ic_user_id_fkey FOREIGN KEY (ic_user_id) REFERENCES public.users(id);


--
-- Name: fs_hazmat_incidents fs_hazmat_incidents_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_hazmat_incidents
    ADD CONSTRAINT fs_hazmat_incidents_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id);


--
-- Name: fs_inspections fs_inspections_propertyid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_inspections
    ADD CONSTRAINT fs_inspections_propertyid_fkey FOREIGN KEY (propertyid) REFERENCES public.fs_properties(id);


--
-- Name: fs_permits fs_permits_propertyid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fs_permits
    ADD CONSTRAINT fs_permits_propertyid_fkey FOREIGN KEY (propertyid) REFERENCES public.fs_properties(id);


--
-- Name: grievances grievances_filed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grievances
    ADD CONSTRAINT grievances_filed_by_fkey FOREIGN KEY (filed_by) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: incident_costs incident_costs_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_costs
    ADD CONSTRAINT incident_costs_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id);


--
-- Name: incident_responses incident_responses_apparatus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_responses
    ADD CONSTRAINT incident_responses_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES public.apparatus(id) ON DELETE SET NULL;


--
-- Name: incident_responses incident_responses_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_responses
    ADD CONSTRAINT incident_responses_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE RESTRICT;


--
-- Name: incident_responses incident_responses_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_responses
    ADD CONSTRAINT incident_responses_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.apparatus_positions(id) ON DELETE SET NULL;


--
-- Name: knox_access_log knox_access_log_knox_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knox_access_log
    ADD CONSTRAINT knox_access_log_knox_box_id_fkey FOREIGN KEY (knox_box_id) REFERENCES public.knox_boxes(id) ON DELETE CASCADE;


--
-- Name: knox_inspections knox_inspections_knox_box_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knox_inspections
    ADD CONSTRAINT knox_inspections_knox_box_id_fkey FOREIGN KEY (knox_box_id) REFERENCES public.knox_boxes(id) ON DELETE CASCADE;


--
-- Name: license_config license_config_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_config
    ADD CONSTRAINT license_config_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: mayday_event_log mayday_event_log_mayday_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mayday_event_log
    ADD CONSTRAINT mayday_event_log_mayday_id_fkey FOREIGN KEY (mayday_id) REFERENCES public.mayday_events(client_id);


--
-- Name: meeting_minutes meeting_minutes_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_minutes
    ADD CONSTRAINT meeting_minutes_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id);


--
-- Name: member_qualifications member_qualifications_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_qualifications
    ADD CONSTRAINT member_qualifications_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: member_qualifications member_qualifications_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_qualifications
    ADD CONSTRAINT member_qualifications_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: members members_assigned_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_assigned_unit_id_fkey FOREIGN KEY (assigned_unit_id) REFERENCES public.apparatus(id) ON DELETE SET NULL;


--
-- Name: members members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: of_department_join_codes of_department_join_codes_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_department_join_codes
    ADD CONSTRAINT of_department_join_codes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: of_department_join_codes of_department_join_codes_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_department_join_codes
    ADD CONSTRAINT of_department_join_codes_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: of_member_invites of_member_invites_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_member_invites
    ADD CONSTRAINT of_member_invites_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: of_member_invites of_member_invites_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_member_invites
    ADD CONSTRAINT of_member_invites_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: of_member_invites of_member_invites_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_member_invites
    ADD CONSTRAINT of_member_invites_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: of_member_invites of_member_invites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_member_invites
    ADD CONSTRAINT of_member_invites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: of_user_departments of_user_departments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_user_departments
    ADD CONSTRAINT of_user_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: of_user_departments of_user_departments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.of_user_departments
    ADD CONSTRAINT of_user_departments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ot_records ot_records_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_records
    ADD CONSTRAINT ot_records_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: ot_records ot_records_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_records
    ADD CONSTRAINT ot_records_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: ot_records ot_records_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_records
    ADD CONSTRAINT ot_records_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;


--
-- Name: personnel_actions personnel_actions_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel_actions
    ADD CONSTRAINT personnel_actions_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE RESTRICT;


--
-- Name: personnel_actions personnel_actions_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel_actions
    ADD CONSTRAINT personnel_actions_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: policy_acknowledgments policy_acknowledgments_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_acknowledgments
    ADD CONSTRAINT policy_acknowledgments_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id);


--
-- Name: pre_plan_photos pre_plan_photos_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_plan_photos
    ADD CONSTRAINT pre_plan_photos_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.pre_plans(id) ON DELETE CASCADE;


--
-- Name: recall_responses recall_responses_recall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_responses
    ADD CONSTRAINT recall_responses_recall_id_fkey FOREIGN KEY (recall_id) REFERENCES public.recall_events(id) ON DELETE CASCADE;


--
-- Name: run_lists run_lists_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_lists
    ADD CONSTRAINT run_lists_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: shift_trades shift_trades_covering_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_trades
    ADD CONSTRAINT shift_trades_covering_member_id_fkey FOREIGN KEY (covering_member_id) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: shift_trades shift_trades_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_trades
    ADD CONSTRAINT shift_trades_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: shift_trades shift_trades_original_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_trades
    ADD CONSTRAINT shift_trades_original_shift_id_fkey FOREIGN KEY (original_shift_id) REFERENCES public.shifts(id) ON DELETE CASCADE;


--
-- Name: shift_trades shift_trades_payback_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_trades
    ADD CONSTRAINT shift_trades_payback_shift_id_fkey FOREIGN KEY (payback_shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;


--
-- Name: shift_trades shift_trades_requesting_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_trades
    ADD CONSTRAINT shift_trades_requesting_member_id_fkey FOREIGN KEY (requesting_member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: stations stations_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: timesheets timesheets_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheets
    ADD CONSTRAINT timesheets_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: training_course_completions training_course_completions_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_course_completions
    ADD CONSTRAINT training_course_completions_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.training_courses(id) ON DELETE SET NULL;


--
-- Name: unit_locations unit_locations_apparatus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_locations
    ADD CONSTRAINT unit_locations_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES public.apparatus(id) ON DELETE CASCADE;


--
-- Name: unit_status_acks unit_status_acks_apparatus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_status_acks
    ADD CONSTRAINT unit_status_acks_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES public.apparatus(id) ON DELETE CASCADE;


--
-- Name: unit_statuses unit_statuses_apparatus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_statuses
    ADD CONSTRAINT unit_statuses_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES public.apparatus(id) ON DELETE CASCADE;


--
-- Name: users users_apparatus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES public.apparatus(id) ON DELETE SET NULL;


--
-- Name: webhook_deliveries webhook_deliveries_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.webhook_subscriptions(id) ON DELETE CASCADE;


--
-- Name: active_boards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.active_boards ENABLE ROW LEVEL SECURITY;

--
-- Name: active_resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.active_resources ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: after_action_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.after_action_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: bug_reports app_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_full_access ON public.bug_reports TO of_app USING (true) WITH CHECK (true);


--
-- Name: departments app_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_full_access ON public.departments TO of_app USING (true) WITH CHECK (true);


--
-- Name: fs_hazmat_guides app_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_full_access ON public.fs_hazmat_guides TO of_app USING (true) WITH CHECK (true);


--
-- Name: fs_hazmat_isolation_distances app_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_full_access ON public.fs_hazmat_isolation_distances TO of_app USING (true) WITH CHECK (true);


--
-- Name: fs_hazmat_materials app_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_full_access ON public.fs_hazmat_materials TO of_app USING (true) WITH CHECK (true);


--
-- Name: fs_hazmat_table3_distances app_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_full_access ON public.fs_hazmat_table3_distances TO of_app USING (true) WITH CHECK (true);


--
-- Name: licenses app_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_full_access ON public.licenses TO of_app USING (true) WITH CHECK (true);


--
-- Name: of_rank_notifications app_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_full_access ON public.of_rank_notifications TO of_app USING (true) WITH CHECK (true);


--
-- Name: of_schema_migrations app_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_full_access ON public.of_schema_migrations TO of_app USING (true) WITH CHECK (true);


--
-- Name: stations app_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_full_access ON public.stations TO of_app USING (true) WITH CHECK (true);


--
-- Name: users app_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_full_access ON public.users TO of_app USING (true) WITH CHECK (true);


--
-- Name: weather_cache app_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_full_access ON public.weather_cache TO of_app USING (true) WITH CHECK (true);


--
-- Name: apparatus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.apparatus ENABLE ROW LEVEL SECURITY;

--
-- Name: apparatus_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.apparatus_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: apparatus_oos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.apparatus_oos ENABLE ROW LEVEL SECURITY;

--
-- Name: apparatus_positions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.apparatus_positions ENABLE ROW LEVEL SECURITY;

--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: avl_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avl_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: avl_devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avl_devices ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.budget_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: bug_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: bulletins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bulletins ENABLE ROW LEVEL SECURITY;

--
-- Name: cad_alert_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cad_alert_units ENABLE ROW LEVEL SECURITY;

--
-- Name: cad_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cad_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: cad_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cad_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: cadets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cadets ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: checklist_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checklist_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: checklist_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: community_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;

--
-- Name: correspondence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.correspondence ENABLE ROW LEVEL SECURITY;

--
-- Name: courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

--
-- Name: coverage_outreach; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coverage_outreach ENABLE ROW LEVEL SECURITY;

--
-- Name: crr_programs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crr_programs ENABLE ROW LEVEL SECURITY;

--
-- Name: crr_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crr_visits ENABLE ROW LEVEL SECURITY;

--
-- Name: cylinders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cylinders ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_staffing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_staffing ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: dept_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dept_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: active_boards dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.active_boards USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: active_resources dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.active_resources USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: activity_entries dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.activity_entries USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: after_action_reports dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.after_action_reports USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: ai_usage dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.ai_usage USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: apparatus dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.apparatus USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: apparatus_assignments dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.apparatus_assignments USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: apparatus_oos dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.apparatus_oos USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: apparatus_positions dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.apparatus_positions USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: assets dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.assets USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: assistant_alerts dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.assistant_alerts USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: assistant_feedback dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.assistant_feedback USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: assistant_preferences dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.assistant_preferences USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: attachments dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.attachments USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: audit_log dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.audit_log USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: avl_connections dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.avl_connections USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: avl_devices dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.avl_devices USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: budget_lines dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.budget_lines USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: budget_transactions dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.budget_transactions USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: bulletins dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.bulletins USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: cad_alert_units dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.cad_alert_units USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: cad_alerts dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.cad_alerts USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: cad_connections dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.cad_connections USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: cadets dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.cadets USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: calendar_subscriptions dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.calendar_subscriptions USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: checklist_completions dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.checklist_completions USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: checklist_templates dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.checklist_templates USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: community_events dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.community_events USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: correspondence dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.correspondence USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: courses dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.courses USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: coverage_outreach dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.coverage_outreach USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: crr_programs dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.crr_programs USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: crr_visits dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.crr_visits USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: cylinders dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.cylinders USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: daily_staffing dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.daily_staffing USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: dept_documents dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.dept_documents USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: donations dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.donations USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: drills dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.drills USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: equipment_checkout dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.equipment_checkout USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: events dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.events USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: exam_assignments dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.exam_assignments USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: exam_submissions dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.exam_submissions USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: exams dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.exams USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: expo_push_tokens dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.expo_push_tokens USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: exposure_records dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.exposure_records USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_checklist_items dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_checklist_items USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_checklists dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_checklists USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_code_library dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_code_library USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_designations dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_designations USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_inspection_answers dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_inspection_answers USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_inspection_types dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_inspection_types USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_inspections dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_inspections USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_notice_service dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_notice_service USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_notices dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_notices USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_permits dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_permits USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_properties dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_properties USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_settings dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_settings USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_signatures dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_signatures USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_sync_ops dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_sync_ops USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fi_violations dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fi_violations USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fill_stations dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fill_stations USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fs_hazmat_incident_audit dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fs_hazmat_incident_audit USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fs_hazmat_incidents dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fs_hazmat_incidents USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fto_evaluations dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fto_evaluations USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fto_observations dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fto_observations USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: fundraising_campaigns dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.fundraising_campaigns USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: grants dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.grants USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: grievances dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.grievances USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: hydrants dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.hydrants USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: incident_costs dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.incident_costs USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: incident_responses dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.incident_responses USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: incidents dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.incidents USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: investigations dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.investigations USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: knox_access_log dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.knox_access_log USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: knox_boxes dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.knox_boxes USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: knox_inspections dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.knox_inspections USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: leave_requests dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.leave_requests USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: license_config dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.license_config USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: maintenance dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.maintenance USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: mayday_event_log dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.mayday_event_log USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: mayday_events dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.mayday_events USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: meeting_minutes dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.meeting_minutes USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: member_availability dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.member_availability USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: member_qualifications dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.member_qualifications USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: members dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.members USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: messages dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.messages USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: module_completions dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.module_completions USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: mutual_aid dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.mutual_aid USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: mutual_aid_agreements dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.mutual_aid_agreements USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: nfirs_reports dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.nfirs_reports USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: ng911_calls dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.ng911_calls USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: of_department_join_codes dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.of_department_join_codes USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: of_member_invites dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.of_member_invites USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: of_user_departments dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.of_user_departments USING ((user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::integer)) WITH CHECK ((user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::integer));


--
-- Name: ot_records dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.ot_records USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: par_checks dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.par_checks USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: pay_entries dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.pay_entries USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: personnel_actions dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.personnel_actions USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: policy_acknowledgments dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.policy_acknowledgments USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: pre_plan_photos dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.pre_plan_photos USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: pre_plans dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.pre_plans USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: push_subscriptions dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.push_subscriptions USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: radio_config dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.radio_config USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: radio_log dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.radio_log USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: recall_events dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.recall_events USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: recall_responses dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.recall_responses USING ((recall_id IN ( SELECT recall_events.id
   FROM public.recall_events
  WHERE (recall_events.department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)))) WITH CHECK ((recall_id IN ( SELECT recall_events.id
   FROM public.recall_events
  WHERE (recall_events.department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer))));


--
-- Name: recruitment dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.recruitment USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: run_lists dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.run_lists USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: scenario_completions dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.scenario_completions USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: shift_patterns dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.shift_patterns USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: shift_swaps dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.shift_swaps USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: shift_trades dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.shift_trades USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: shifts dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.shifts USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: sogs dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.sogs USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: station_log dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.station_log USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: timesheets dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.timesheets USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: training dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.training USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: training_course_completions dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.training_course_completions USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: training_courses dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.training_courses USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: training_plans dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.training_plans USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: unit_locations dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.unit_locations USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: unit_status_acks dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.unit_status_acks USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: unit_status_history dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.unit_status_history USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: unit_statuses dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.unit_statuses USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: vacancy_fill dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.vacancy_fill USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: volunteer_hours dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.volunteer_hours USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: webhook_deliveries dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.webhook_deliveries USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: webhook_subscriptions dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.webhook_subscriptions USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: wellness dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.wellness USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: workflow_tasks dept_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_isolation ON public.workflow_tasks USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));


--
-- Name: donations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

--
-- Name: drills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.drills ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_checkout; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment_checkout ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exam_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: exams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

--
-- Name: expo_push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expo_push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: exposure_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exposure_records ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_checklist_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_checklist_items ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_checklists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_checklists ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_code_library; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_code_library ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_designations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_designations ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_inspection_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_inspection_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_inspection_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_inspection_types ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_inspections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_inspections ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_notice_service; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_notice_service ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_notices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_notices ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_permits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_permits ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_properties ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_signatures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_signatures ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_sync_ops; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_sync_ops ENABLE ROW LEVEL SECURITY;

--
-- Name: fi_violations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fi_violations ENABLE ROW LEVEL SECURITY;

--
-- Name: fill_stations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fill_stations ENABLE ROW LEVEL SECURITY;

--
-- Name: fs_hazmat_guides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fs_hazmat_guides ENABLE ROW LEVEL SECURITY;

--
-- Name: fs_hazmat_incident_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fs_hazmat_incident_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: fs_hazmat_incidents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fs_hazmat_incidents ENABLE ROW LEVEL SECURITY;

--
-- Name: fs_hazmat_isolation_distances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fs_hazmat_isolation_distances ENABLE ROW LEVEL SECURITY;

--
-- Name: fs_hazmat_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fs_hazmat_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: fs_hazmat_table3_distances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fs_hazmat_table3_distances ENABLE ROW LEVEL SECURITY;

--
-- Name: fto_evaluations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fto_evaluations ENABLE ROW LEVEL SECURITY;

--
-- Name: fto_observations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fto_observations ENABLE ROW LEVEL SECURITY;

--
-- Name: fundraising_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fundraising_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grants ENABLE ROW LEVEL SECURITY;

--
-- Name: grievances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grievances ENABLE ROW LEVEL SECURITY;

--
-- Name: hydrants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hydrants ENABLE ROW LEVEL SECURITY;

--
-- Name: incident_costs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incident_costs ENABLE ROW LEVEL SECURITY;

--
-- Name: incident_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incident_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: incidents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

--
-- Name: investigations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;

--
-- Name: knox_access_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knox_access_log ENABLE ROW LEVEL SECURITY;

--
-- Name: knox_boxes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knox_boxes ENABLE ROW LEVEL SECURITY;

--
-- Name: knox_inspections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knox_inspections ENABLE ROW LEVEL SECURITY;

--
-- Name: leave_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: license_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.license_config ENABLE ROW LEVEL SECURITY;

--
-- Name: licenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

--
-- Name: maintenance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.maintenance ENABLE ROW LEVEL SECURITY;

--
-- Name: mayday_event_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mayday_event_log ENABLE ROW LEVEL SECURITY;

--
-- Name: mayday_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mayday_events ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_minutes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;

--
-- Name: member_availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: member_qualifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_qualifications ENABLE ROW LEVEL SECURITY;

--
-- Name: members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: module_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.module_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: mutual_aid; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mutual_aid ENABLE ROW LEVEL SECURITY;

--
-- Name: mutual_aid_agreements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mutual_aid_agreements ENABLE ROW LEVEL SECURITY;

--
-- Name: nfirs_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nfirs_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: ng911_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ng911_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: of_department_join_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.of_department_join_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: of_member_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.of_member_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: of_rank_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.of_rank_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: apparatus of_readonly_read_apparatus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY of_readonly_read_apparatus ON public.apparatus FOR SELECT TO of_readonly USING (true);


--
-- Name: departments of_readonly_read_departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY of_readonly_read_departments ON public.departments FOR SELECT TO of_readonly USING (true);


--
-- Name: incidents of_readonly_read_incidents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY of_readonly_read_incidents ON public.incidents FOR SELECT TO of_readonly USING (true);


--
-- Name: licenses of_readonly_read_licenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY of_readonly_read_licenses ON public.licenses FOR SELECT TO of_readonly USING (true);


--
-- Name: members of_readonly_read_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY of_readonly_read_members ON public.members FOR SELECT TO of_readonly USING (true);


--
-- Name: stations of_readonly_read_stations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY of_readonly_read_stations ON public.stations FOR SELECT TO of_readonly USING (true);


--
-- Name: unit_statuses of_readonly_read_unit_statuses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY of_readonly_read_unit_statuses ON public.unit_statuses FOR SELECT TO of_readonly USING (true);


--
-- Name: of_schema_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.of_schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: of_user_departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.of_user_departments ENABLE ROW LEVEL SECURITY;

--
-- Name: ot_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ot_records ENABLE ROW LEVEL SECURITY;

--
-- Name: par_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.par_checks ENABLE ROW LEVEL SECURITY;

--
-- Name: pay_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pay_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.personnel_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: policy_acknowledgments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.policy_acknowledgments ENABLE ROW LEVEL SECURITY;

--
-- Name: pre_plan_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pre_plan_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: pre_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pre_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: radio_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.radio_config ENABLE ROW LEVEL SECURITY;

--
-- Name: radio_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.radio_log ENABLE ROW LEVEL SECURITY;

--
-- Name: recall_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recall_events ENABLE ROW LEVEL SECURITY;

--
-- Name: recall_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recall_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: recruitment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recruitment ENABLE ROW LEVEL SECURITY;

--
-- Name: retention_policy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.retention_policy ENABLE ROW LEVEL SECURITY;

--
-- Name: retention_run_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.retention_run_log ENABLE ROW LEVEL SECURITY;

--
-- Name: run_lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.run_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: scenario_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scenario_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: shift_patterns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shift_patterns ENABLE ROW LEVEL SECURITY;

--
-- Name: shift_swaps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shift_swaps ENABLE ROW LEVEL SECURITY;

--
-- Name: shift_trades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shift_trades ENABLE ROW LEVEL SECURITY;

--
-- Name: shifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

--
-- Name: sogs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sogs ENABLE ROW LEVEL SECURITY;

--
-- Name: station_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.station_log ENABLE ROW LEVEL SECURITY;

--
-- Name: stations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

--
-- Name: timesheets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;

--
-- Name: training; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training ENABLE ROW LEVEL SECURITY;

--
-- Name: training_course_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_course_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: training_courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;

--
-- Name: training_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: unit_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unit_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: unit_status_acks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unit_status_acks ENABLE ROW LEVEL SECURITY;

--
-- Name: unit_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unit_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: unit_statuses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unit_statuses ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: vacancy_fill; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vacancy_fill ENABLE ROW LEVEL SECURITY;

--
-- Name: volunteer_hours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.volunteer_hours ENABLE ROW LEVEL SECURITY;

--
-- Name: weather_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: wellness; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wellness ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: FUNCTION of_avl_connection_by_webhook_secret(p_secret_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.of_avl_connection_by_webhook_secret(p_secret_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.of_avl_connection_by_webhook_secret(p_secret_hash text) TO of_app;


--
-- Name: FUNCTION of_cad_connection_by_webhook_secret(p_secret_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.of_cad_connection_by_webhook_secret(p_secret_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.of_cad_connection_by_webhook_secret(p_secret_hash text) TO of_app;


--
-- Name: FUNCTION of_redeem_member_invite(p_token_hash text, p_password_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.of_redeem_member_invite(p_token_hash text, p_password_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.of_redeem_member_invite(p_token_hash text, p_password_hash text) TO of_app;


--
-- Name: FUNCTION of_register_pending_member(p_username text, p_password_hash text, p_name text, p_join_code_hash text, p_requested_rank text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.of_register_pending_member(p_username text, p_password_hash text, p_name text, p_join_code_hash text, p_requested_rank text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.of_register_pending_member(p_username text, p_password_hash text, p_name text, p_join_code_hash text, p_requested_rank text) TO of_app;


--
-- Name: FUNCTION of_station_department(p_station_id integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.of_station_department(p_station_id integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.of_station_department(p_station_id integer) TO of_app;


--
-- Name: TABLE avl_connections; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.avl_connections TO of_app;


--
-- Name: SEQUENCE avl_connections_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.avl_connections_id_seq TO of_app;


--
-- Name: TABLE avl_devices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.avl_devices TO of_app;


--
-- Name: SEQUENCE avl_devices_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.avl_devices_id_seq TO of_app;


--
-- Name: TABLE of_department_join_codes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.of_department_join_codes TO of_app;


--
-- Name: SEQUENCE of_department_join_codes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.of_department_join_codes_id_seq TO of_app;


--
-- Name: TABLE of_member_invites; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.of_member_invites TO of_app;


--
-- Name: SEQUENCE of_member_invites_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.of_member_invites_id_seq TO of_app;


--
-- PostgreSQL database dump complete
--

\unrestrict PQ7G9ehA48uCjX592nZBNqrHCeGcd2kWsOFaSH7aDleitcqxyRLxrlkWFEft0T2

