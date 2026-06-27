-- 0006-dept-rls-policies.sql
-- Phase B of P5 — per-department RLS POLICIES (no FORCE; enforcement comes from
-- the app connecting as the non-owner of_app role, see 0007-app-role.sql).
--
-- What it does: every OF tenant table gets a `dept_isolation` policy keyed on the
-- app.department_id GUC that Phase A sets per request (middleware/dbTransaction.js
-- + db.runWithDepartment). Special/shared tables get bespoke policies (below).
--
-- CRITICAL GUARDS (2026-06-14 audit):
--   * NULLIF(current_setting('app.department_id', true), '')::int — a reused pooled
--     connection reverts a custom GUC to '' (not unset) after COMMIT; a bare
--     ''::int THROWS instead of failing closed. NULLIF maps '' -> NULL -> 0 rows.
--   * Target ONLY tables with a department_id column; fence foreign-app prefixes.
--     NEVER target "all RLS-enabled" / "all public" tables.
--   * Generated from information_schema + to_regclass-guarded so it runs correctly
--     on BOTH local (100 dept tables incl. lazy ones; no licenses table) and prod
--     (97 dept tables; licenses present). Fully idempotent.
--
-- Rollback: DROP POLICY per table (policies hold no data); leave RLS enabled.

-- ── Uniform department policy (all tenant tables with department_id) ──────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema
     AND tb.table_name  = c.table_name
     AND tb.table_type  = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name  = 'department_id'
      AND c.table_name NOT IN ('of_user_departments', 'stations')   -- special-cased below
      AND c.table_name !~ '^(ods_|odh_|oia_|ola_|or_|lsh_)'         -- never policy foreign apps
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY dept_isolation ON public.%I '
      'USING (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int) '
      'WITH CHECK (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int)',
      t);
  END LOOP;
END $$;

-- ── Special-case + shared tables (each existence-guarded) ─────────────────────
DO $$
DECLARE t text;
BEGIN
  -- of_user_departments: BOOTSTRAP. Read during auth to DETERMINE the user's
  -- department, i.e. BEFORE app.department_id can be set. Policy by USER, else
  -- every login fails closed.
  IF to_regclass('public.of_user_departments') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.of_user_departments ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS dept_isolation ON public.of_user_departments';
    EXECUTE 'CREATE POLICY dept_isolation ON public.of_user_departments '
            'USING (user_id = NULLIF(current_setting(''app.user_id'', true), '''')::int) '
            'WITH CHECK (user_id = NULLIF(current_setting(''app.user_id'', true), '''')::int)';
  END IF;

  -- stations: credential-bootstrap lookup (findStationByPin scans by PIN before
  -- any GUC). Must be readable pre-context -> PERMISSIVE for now. Phase-C harden:
  -- move credential resolution behind a SECURITY DEFINER fn, then dept-scope this
  -- (it holds anthropic_api_key / tv_pin).
  IF to_regclass('public.stations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS dept_isolation ON public.stations';
    EXECUTE 'DROP POLICY IF EXISTS bootstrap_read ON public.stations';
    EXECUTE 'CREATE POLICY bootstrap_read ON public.stations USING (true) WITH CHECK (true)';
  END IF;

  -- Shared, non-tenant-scoped tables (no department_id; isolation is app-layer).
  -- users = shared identity read during auth pre-GUC; licenses/license_config =
  -- Stripe licensing keyed by license id. Permissive so the non-owner role can
  -- read them. (licenses/license_config are prod-only; guarded.)
  FOREACH t IN ARRAY ARRAY['users','licenses','license_config'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS shared_access ON public.%I', t);
      EXECUTE format('CREATE POLICY shared_access ON public.%I USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;

  -- recall_responses: child of recall_events (no own department_id) -> scope via
  -- the parent so it inherits the recall's department.
  IF to_regclass('public.recall_responses') IS NOT NULL
     AND to_regclass('public.recall_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.recall_responses ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS dept_isolation ON public.recall_responses';
    EXECUTE 'CREATE POLICY dept_isolation ON public.recall_responses '
            'USING (recall_id IN (SELECT id FROM public.recall_events '
            'WHERE department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int)) '
            'WITH CHECK (recall_id IN (SELECT id FROM public.recall_events '
            'WHERE department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int))';
  END IF;
END $$;

-- NO FORCE: the app connects as the NON-OWNER of_app role (0007), which is subject
-- to RLS as soon as RLS is enabled + a policy exists. FORCE only subjects the
-- OWNER, and the owner (postgres) has BYPASSRLS, so FORCE could never enforce.
-- Phase C validates cross-department denial via SET ROLE of_app.
