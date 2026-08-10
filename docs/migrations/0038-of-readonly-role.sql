-- 0038-of-readonly-role.sql — purpose-built read-only role for the
-- OpenFirehouse operator console (the Limitless Stack Hub /openfirehouse).
--
-- ═══ CANONICAL MERGE (2026-07-07) ═══
-- Two 0038s were written in parallel on 2026-07-06: Dale's reconstruction
-- (db0329c, `0038-of-readonly-operator-role.sql` — idempotent structure,
-- NOLOGIN + out-of-band password cutover, self-verifying DO blocks) and the
-- session's audited draft (ec5930f — live-schema-verified column lists,
-- 3-agent security audit outcomes). This file is the merge, per Matt:
-- **Dale's structure, the audited grant list.** The other file is deleted.
-- Deltas vs Dale's reconstruction, each traceable to the audit or to a
-- console query that runs against these exact columns:
--   • `licenses` RESTORED as a granted table (his 7-table list dropped it;
--     the console's license/tier KPIs read it). Columns exclude jwt/jti/
--     dept_email/stripe_customer_id/annual_budget/metadata.
--   • `of_user_departments` REMOVED (his (d)): roster counts come from
--     members.department_id — no need to expose the login↔department
--     mapping table at all. Smaller surface wins.
--   • department_id ADDED to members / incidents / apparatus / unit_statuses
--     (the console groups every count by department; his lists omitted it).
--   • incidents: deleted_at ADDED (console MUST filter soft-deleted rows —
--     without the grant the filter itself errors); alarmLevel / disposition /
--     injuries REMOVED (audit: record-adjacent content, not fleet metadata).
--   • apparatus: station_id + "createdAt" ADDED (per-dept counts + trend).
--   • unit_statuses: incident_id stays fenced (Dale's call — Phase 1 never
--     reads it).
--   • Self-check 4c FIXED: his version caught non-SELECT privileges but
--     missed a whole-table SELECT (table-level grants live in
--     role_table_grants; column grants in role_column_grants — the invariant
--     is ZERO rows in role_table_grants).
--   • Kept from the audited draft: the DEFINER-EXECUTE sweep and the
--     grant-drift enumeration queries (the recurring SOC 2 access-review
--     artifact), plus the extended must-fail test list.
--
-- DESIGN (from the review brief, `limitless-stack-hub/docs/OF-READONLY-ROLE-BRIEF.md`):
--   • Answers fleet-health questions ONLY: departments / stations / members
--     counts, incident volume, license (tier) status, unit availability.
--   • Phase 1 is ZERO-PII. No person names, DOB, phone, email, address,
--     emergency contacts, certifications, incident narrative/personnel, and
--     no Stripe billing correlation keys. Members are countable, never
--     identifiable. Member NAMES arrive only with the audited Phase-2
--     drill-in migration (grant + consumer + per-access audit in one change).
--   • LOGIN deferred (NOLOGIN until the out-of-band password cutover),
--     NOBYPASSRLS, connection-limited, statement-timeout'd, read-only txns.
--   • Column-scoped SELECT on exactly 7 tables. No writes, no other tables,
--     no sequences, no functions, no default privileges (fail-closed).
--
-- WHY A DEDICATED ROLE (see 0007-app-role.sql): BYPASSRLS is absolute. A role
-- that can bypass RLS overrides even FORCE ROW LEVEL SECURITY. `of_readonly`
-- is NOBYPASSRLS so it is subject to RLS the moment RLS is on + a policy
-- exists — and because the tenant policies key off a per-request GUC the
-- console never sets, `of_readonly` needs its OWN permissive SELECT policy
-- per table (USING (true)) or every read returns zero rows.
--
-- APPLY ORDER: prod ONLY (Supabase SQL editor on abvcmaknsyqmahspmasu).
--   • OPS role, NOT app schema — do NOT mirror into db.js/initDb.
--   • The LOGIN password is set OUT OF BAND at cutover and never committed.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Role — NOLOGIN so no credential lands in the repo; idempotent re-apply
--    converges attributes.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_readonly') THEN
    CREATE ROLE of_readonly
      NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION
      CONNECTION LIMIT 10;
  ELSE
    ALTER ROLE of_readonly
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION
      CONNECTION LIMIT 10;
  END IF;
END $$;

-- Read-only + bounded by construction (belt beyond the SELECT-only grants).
ALTER ROLE of_readonly SET default_transaction_read_only = on;
ALTER ROLE of_readonly SET statement_timeout = '10s';
ALTER ROLE of_readonly SET idle_in_transaction_session_timeout = '15s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fail closed: strip any pre-existing grants, hand back only schema USAGE.
--    No ALL-TABLES grant, no sequences, no functions, no default privileges —
--    a table added tomorrow is invisible until explicitly listed here.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON SCHEMA public FROM of_readonly;
GRANT USAGE ON SCHEMA public TO of_readonly;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Per-table permissive SELECT policy + column-scoped SELECT grant.
--    REVOKE-then-GRANT makes each column list authoritative on re-apply.
--    USING (true) is deliberate fleet-wide read — the console is cross-tenant;
--    PII is fenced at the COLUMN layer, not the row layer.
-- ─────────────────────────────────────────────────────────────────────────────

-- (a) departments — counts, grouping, plan status. Org name (not a person),
--     public FDID, plan_tier. Stripe keys + tv_pin + ai budget fenced out.
DROP POLICY IF EXISTS of_readonly_read_departments ON public.departments;
CREATE POLICY of_readonly_read_departments ON public.departments
  FOR SELECT TO of_readonly USING (true);
REVOKE ALL ON public.departments FROM of_readonly;
GRANT SELECT (id, name, fdid, dept_type, plan_tier, shift_pattern, created_at)
  ON public.departments TO of_readonly;

-- (b) stations — station counts per dept + where (city/state). Street address,
--     zip, phone, email, anthropic_api_key, tv_pin fenced out.
DROP POLICY IF EXISTS of_readonly_read_stations ON public.stations;
CREATE POLICY of_readonly_read_stations ON public.stations
  FOR SELECT TO of_readonly USING (true);
REVOKE ALL ON public.stations FROM of_readonly;
GRANT SELECT (id, name, fdid, city, state, department_id, "createdAt")
  ON public.stations TO of_readonly;

-- (c) members — COUNT + status/rank/role breakdown per department ONLY.
--     Every PII column (name, dob, phone, 3× email, address, emergency
--     contacts, certifications, memberNumber, cal_token, photo_url) fenced.
--     department_id/station_id are the grouping keys the console requires.
DROP POLICY IF EXISTS of_readonly_read_members ON public.members;
CREATE POLICY of_readonly_read_members ON public.members
  FOR SELECT TO of_readonly USING (true);
REVOKE ALL ON public.members FROM of_readonly;
GRANT SELECT (id, status, rank, role, department_id, station_id, "createdAt")
  ON public.members TO of_readonly;

-- (d) licenses — entitlement/billing STATUS only (the console's license KPIs).
--     jwt, jti, dept_email, stripe ids, annual_budget_usd, metadata fenced out.
--     Dept grouping uses dept_name/license_id — never a billing key.
DROP POLICY IF EXISTS of_readonly_read_licenses ON public.licenses;
CREATE POLICY of_readonly_read_licenses ON public.licenses
  FOR SELECT TO of_readonly USING (true);
REVOKE ALL ON public.licenses FROM of_readonly;
GRANT SELECT (license_id, dept_name, tier, member_count, station_count,
              livemode, issued_at, expires_at, status, revoked_at)
  ON public.licenses TO of_readonly;

-- (e) incidents — volume metadata per department. deleted_at is granted so the
--     console can (must) filter soft-deleted rows. Free-text + record content
--     (address, notes, description, personnel, units, photos, disposition,
--     injuries, alarmLevel, times) fenced out.
DROP POLICY IF EXISTS of_readonly_read_incidents ON public.incidents;
CREATE POLICY of_readonly_read_incidents ON public.incidents
  FOR SELECT TO of_readonly USING (true);
REVOKE ALL ON public.incidents FROM of_readonly;
GRANT SELECT (id, type, station_id, department_id, incident_date, "createdAt",
              deleted_at)
  ON public.incidents TO of_readonly;

-- (f) apparatus — fleet inventory + status per department. assignedOperator
--     (person), vin, mileage, service dates, free-text notes fenced out.
DROP POLICY IF EXISTS of_readonly_read_apparatus ON public.apparatus;
CREATE POLICY of_readonly_read_apparatus ON public.apparatus
  FOR SELECT TO of_readonly USING (true);
REVOKE ALL ON public.apparatus FROM of_readonly;
GRANT SELECT (id, designation, type, status, station_id, department_id,
              "createdAt")
  ON public.apparatus TO of_readonly;

-- (g) unit_statuses — live availability distribution per department.
--     updated_by (member id) and incident_id fenced out (Phase 1 never reads
--     them).
DROP POLICY IF EXISTS of_readonly_read_unit_statuses ON public.unit_statuses;
CREATE POLICY of_readonly_read_unit_statuses ON public.unit_statuses
  FOR SELECT TO of_readonly USING (true);
REVOKE ALL ON public.unit_statuses FROM of_readonly;
GRANT SELECT (id, station_id, apparatus_id, designation, status,
              department_id, updated_at)
  ON public.unit_statuses TO of_readonly;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Verification (runs at apply time; RAISES if config is wrong).
-- ─────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  t     TEXT;
  gap   TEXT := '';
  tbls  TEXT[] := ARRAY['departments','stations','members','licenses',
                        'incidents','apparatus','unit_statuses'];
BEGIN
  -- 4a. Security-critical role attributes. (rolcanlogin intentionally NOT
  --     asserted — it flips true at the out-of-band password cutover.)
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'of_readonly'
      AND rolbypassrls  = false      -- MUST be subject to RLS
      AND rolsuper      = false
      AND rolcreaterole = false
      AND rolcreatedb   = false
      AND rolconnlimit  = 10
  ) THEN
    RAISE EXCEPTION 'of_readonly role attributes are wrong (want NOBYPASSRLS NOSUPERUSER connlimit=10)';
  END IF;

  -- 4b. Every granted table MUST have RLS enabled — if RLS were off, a future
  --     restrictive policy would silently not apply (fail-open on drift).
  FOREACH t IN ARRAY tbls LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity = true
    ) THEN
      gap := gap || t || ' ';
    END IF;
  END LOOP;
  IF gap <> '' THEN
    RAISE EXCEPTION 'RLS is NOT enabled on granted table(s): % — do not apply of_readonly against an RLS-off table', gap;
  END IF;

  -- 4c. Fail-closed grant shape. TWO invariants (fixed in the merge):
  --     table-LEVEL grants live in role_table_grants; column grants live in
  --     role_column_grants. of_readonly must have ZERO table-level grants of
  --     ANY kind — a whole-table SELECT would defeat the PII column fence,
  --     and any non-SELECT privilege violates read-only.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'of_readonly'
  ) THEN
    RAISE EXCEPTION 'of_readonly holds a TABLE-level grant — only column-scoped SELECT is permitted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_column_grants
    WHERE grantee = 'of_readonly' AND privilege_type <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'of_readonly holds a non-SELECT column privilege — read-only invariant violated';
  END IF;

  RAISE NOTICE 'of_readonly verification passed: NOBYPASSRLS, connlimit=10, RLS on all 7 granted tables, column-scoped SELECT only.';
END $verify$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Record in the migration ledger.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.of_schema_migrations (filename)
VALUES ('0038-of-readonly-role.sql')
ON CONFLICT (filename) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════════
-- PASSWORD CUTOVER — run manually, ONCE, in the Supabase SQL editor. NEVER
-- commit the real password; store it only as the Hub's OF_DATABASE_URL
-- (Vercel, Sensitive):
--
--   ALTER ROLE of_readonly LOGIN PASSWORD '<generated-strong-secret>';
--
-- Rotate:       ALTER ROLE of_readonly PASSWORD '<new-secret>';
-- Kill switch:  ALTER ROLE of_readonly NOLOGIN;
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Post-apply read tests — run in a NEW session AS of_readonly (SET ROLE
--    of_readonly, or connect with its credential). Paste outputs into the
--    session record (DoD evidence). ──
--   SELECT count(*) FROM departments;                              -- ✓ works
--   SELECT plan_tier FROM departments LIMIT 1;                     -- ✓ works
--   SELECT department_id, count(*) FROM members GROUP BY 1;        -- ✓ members/dept
--   SELECT count(*) FROM incidents WHERE deleted_at IS NULL;       -- ✓ works
--   SELECT count(*) FROM licenses WHERE livemode IS TRUE;          -- ✓ works
--   SELECT name FROM members LIMIT 1;                 -- ✗ permission denied (column)
--   SELECT * FROM members LIMIT 1;                    -- ✗ * touches fenced PII columns
--   SELECT jwt FROM licenses LIMIT 1;                 -- ✗ permission denied (column)
--   SELECT stripe_customer_id FROM licenses LIMIT 1;  -- ✗ permission denied (column)
--   SELECT notes FROM incidents LIMIT 1;              -- ✗ permission denied (column)
--   SELECT anthropic_api_key FROM stations LIMIT 1;   -- ✗ permission denied (column)
--   SELECT 1 FROM users LIMIT 1;                      -- ✗ permission denied (table)
--   SELECT 1 FROM of_member_invites LIMIT 1;          -- ✗ permission denied (table)
--   SELECT 1 FROM exposure_records LIMIT 1;           -- ✗ permission denied (table)
--   SELECT count(*) FROM cad_connections;             -- ✗ permission denied (table)
--   INSERT INTO departments(name) VALUES ('x');       -- ✗ read-only / no privilege
--   RESET ROLE;
--
-- ── DEFINER-function sweep (run as owner) — Postgres grants EXECUTE on new
--    functions to PUBLIC by default; prove of_readonly can't call any
--    SECURITY DEFINER function: ──
--   SELECT p.proname FROM pg_proc p
--   WHERE p.prosecdef AND has_function_privilege('of_readonly', p.oid, 'EXECUTE');
--   -- Expect: zero rows. Any row → REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC;
--
-- ── GRANT-DRIFT ENUMERATION (run as owner, at apply AND on a recurring review
--    cadence — the SOC 2 recurring-access-review artifact; output must match
--    this file exactly): ──
--   SELECT table_name, column_name, privilege_type
--     FROM information_schema.role_column_grants
--    WHERE grantee = 'of_readonly' ORDER BY table_name, column_name;
--   SELECT schemaname, tablename, policyname, cmd
--     FROM pg_policies
--    WHERE 'of_readonly' = ANY(roles) ORDER BY tablename;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS of_readonly_read_departments   ON public.departments;
-- DROP POLICY IF EXISTS of_readonly_read_stations      ON public.stations;
-- DROP POLICY IF EXISTS of_readonly_read_members       ON public.members;
-- DROP POLICY IF EXISTS of_readonly_read_licenses      ON public.licenses;
-- DROP POLICY IF EXISTS of_readonly_read_incidents     ON public.incidents;
-- DROP POLICY IF EXISTS of_readonly_read_apparatus     ON public.apparatus;
-- DROP POLICY IF EXISTS of_readonly_read_unit_statuses ON public.unit_statuses;
-- REVOKE ALL ON public.departments, public.stations, public.members,
--   public.licenses, public.incidents, public.apparatus,
--   public.unit_statuses FROM of_readonly;
-- REVOKE USAGE ON SCHEMA public FROM of_readonly;
-- DROP ROLE IF EXISTS of_readonly;
-- DELETE FROM public.of_schema_migrations WHERE filename = '0038-of-readonly-role.sql';
