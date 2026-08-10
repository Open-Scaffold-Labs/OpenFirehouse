-- 0082 — Phase 2.1 apparatus-checks rebuild (versioned templates + finalized check records).
-- Spec: docs/PHASE2-CHECKS-SPEC-2026-07-25.md §1. Claim-by-stub 2026-07-25 (head verified
-- 0081 in files AND the prod of_schema_migrations ledger).
--
-- Market bar (phase spec §1a): configurable versioned templates, per-compartment items,
-- item-level pass/fail/na, who-signed under real identity, history, server-side
-- passed-with-open-defect guard (result_code is DERIVED — no client door). Ceilings held:
-- no unit_statuses coupling, no crew hard gates, no cron (due state computed on view).
--
-- Records classification: apparatus_checks = a compliance record → soft-delete only
-- (column-level UPDATE grant on deleted_at ONLY — results are physically immutable),
-- items append-only, template versions physically immutable snapshots (no UPDATE grant).
-- Old checklist_templates/checklist_completions stay untouched (additive, F13);
-- prod verified 2026-07-25: completions = 0 rows (nothing to migrate), templates = 2
-- (migrated below into template + version 1).
--
-- D6: applied to prod by hand (Supabase MCP) → ledgered → four live probes (wrong-dept RLS
-- read as of_app → 0 rows · CHECK violation · UNIQUE(template_id,version) duplicate ·
-- deployed statement shapes in txn+ROLLBACK) → THEN dependent code ships.

BEGIN;

-- ── check_templates — per-dept template head (soft delete; versions carry the items) ──
CREATE TABLE IF NOT EXISTS public.check_templates (
  id                  SERIAL PRIMARY KEY,
  department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  station_id          INTEGER,
  name                TEXT NOT NULL,
  apparatus_id        INTEGER REFERENCES public.apparatus(id) ON DELETE SET NULL, -- NULL = every active rig
  frequency           TEXT NOT NULL DEFAULT 'daily'
                        CONSTRAINT check_templates_frequency_chk
                        CHECK (frequency IN ('daily','weekly','monthly')),
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  current_version_id  INTEGER,            -- FK added after versions table exists
  created_by_user_id  INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_check_templates_department ON public.check_templates(department_id);

-- ── check_template_versions — IMMUTABLE item snapshots (edit = mint next version) ──
CREATE TABLE IF NOT EXISTS public.check_template_versions (
  id                  SERIAL PRIMARY KEY,
  template_id         INTEGER NOT NULL REFERENCES public.check_templates(id) ON DELETE RESTRICT,
  department_id       INTEGER NOT NULL,
  version             INTEGER NOT NULL,
  items               JSONB NOT NULL,      -- [{ key, section, label }]
  created_by_user_id  INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_template_versions_unique UNIQUE (template_id, version)
);
CREATE INDEX IF NOT EXISTS idx_check_template_versions_department ON public.check_template_versions(department_id);

ALTER TABLE public.check_templates
  DROP CONSTRAINT IF EXISTS check_templates_current_version_fk;
ALTER TABLE public.check_templates
  ADD CONSTRAINT check_templates_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.check_template_versions(id) ON DELETE SET NULL;

-- ── apparatus_checks — the finalized compliance record ──
CREATE TABLE IF NOT EXISTS public.apparatus_checks (
  id                   SERIAL PRIMARY KEY,
  department_id        INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  station_id           INTEGER,
  template_id          INTEGER NOT NULL REFERENCES public.check_templates(id) ON DELETE RESTRICT,
  template_version_id  INTEGER NOT NULL REFERENCES public.check_template_versions(id) ON DELETE RESTRICT,
  apparatus_id         INTEGER REFERENCES public.apparatus(id) ON DELETE SET NULL,
  apparatus_name       TEXT NOT NULL DEFAULT '',   -- display snapshot; identity is apparatus_id
  frequency            TEXT NOT NULL DEFAULT 'daily',
  check_date           DATE NOT NULL,              -- tz-safe local day, server-derived
  completed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- server-authoritative
  completed_by_user_id INTEGER NOT NULL,
  completed_by_name    TEXT NOT NULL DEFAULT '',   -- display snapshot; identity is the user id
  result_code          TEXT NOT NULL
                         CONSTRAINT apparatus_checks_result_chk
                         CHECK (result_code IN ('PASS','DEFECTS_FOUND')),  -- server-DERIVED, never client input
  item_count           INTEGER NOT NULL DEFAULT 0,
  failed_count         INTEGER NOT NULL DEFAULT 0,
  notes                TEXT NOT NULL DEFAULT '',
  deleted_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_apparatus_checks_department ON public.apparatus_checks(department_id);
CREATE INDEX IF NOT EXISTS idx_apparatus_checks_tpl_app_date
  ON public.apparatus_checks(template_id, apparatus_id, check_date DESC);

-- ── apparatus_check_items — item outcomes (append-only part of the record) ──
CREATE TABLE IF NOT EXISTS public.apparatus_check_items (
  id             SERIAL PRIMARY KEY,
  check_id       INTEGER NOT NULL REFERENCES public.apparatus_checks(id) ON DELETE CASCADE,
  department_id  INTEGER NOT NULL,
  item_key       TEXT NOT NULL,
  section        TEXT NOT NULL DEFAULT '',
  label          TEXT NOT NULL,
  outcome        TEXT NOT NULL
                   CONSTRAINT apparatus_check_items_outcome_chk
                   CHECK (outcome IN ('pass','fail','na')),
  note           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_apparatus_check_items_check ON public.apparatus_check_items(check_id);
CREATE INDEX IF NOT EXISTS idx_apparatus_check_items_department ON public.apparatus_check_items(department_id);

-- ── RLS dept_isolation on all four ──
DO $$
  DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['check_templates','check_template_versions','apparatus_checks','apparatus_check_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
    EXECUTE format($p$CREATE POLICY dept_isolation ON public.%I FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)$p$, t);
  END LOOP;
END $$;

COMMENT ON TABLE public.check_template_versions IS
  'Immutable item snapshots (Phase 2.1). Editing a template''s items mints the next version; '
  'completions reference the version they rendered (409 STALE_TEMPLATE_VERSION otherwise). '
  'No UPDATE grant — a snapshot is physically un-rewritable.';
COMMENT ON TABLE public.apparatus_checks IS
  'Finalized apparatus-check compliance records (Phase 2.1). result_code is server-DERIVED '
  '(any failed item ⇒ DEFECTS_FOUND) — the passed-with-open-defect guard has no client door. '
  'Soft-delete only: of_app''s UPDATE grant is column-scoped to deleted_at.';

-- ── Role grants (guarded for local dev DBs without these roles) ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.check_templates TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.check_templates_id_seq TO of_app;
    GRANT SELECT, INSERT ON public.check_template_versions TO of_app;             -- immutable snapshots
    GRANT USAGE, SELECT ON SEQUENCE public.check_template_versions_id_seq TO of_app;
    GRANT SELECT, INSERT ON public.apparatus_checks TO of_app;
    GRANT UPDATE (deleted_at) ON public.apparatus_checks TO of_app;               -- soft delete ONLY
    GRANT USAGE, SELECT ON SEQUENCE public.apparatus_checks_id_seq TO of_app;
    GRANT SELECT, INSERT ON public.apparatus_check_items TO of_app;               -- append-only
    GRANT USAGE, SELECT ON SEQUENCE public.apparatus_check_items_id_seq TO of_app;
  END IF;
END $$;

-- Supabase default privileges auto-grant U/D on new tables (the 0046/0059/0076 lesson) —
-- revoke so records are physically un-rewritable / un-deletable.
DO $$
  DECLARE r text;
BEGIN
  REVOKE UPDATE, DELETE ON public.check_template_versions, public.apparatus_check_items FROM PUBLIC;
  REVOKE UPDATE, DELETE ON public.apparatus_checks FROM PUBLIC;
  REVOKE DELETE ON public.check_templates FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON public.check_template_versions, public.apparatus_check_items FROM %I', r);
      -- UPDATE must be stripped per-role, not just from PUBLIC: default privileges
      -- auto-granted of_app a TABLE-level UPDATE that would have let result_code be
      -- rewritten (caught live by D6 probe 2b before code shipped, 2026-07-25).
      EXECUTE format('REVOKE UPDATE, DELETE ON public.apparatus_checks FROM %I', r);
      EXECUTE format('REVOKE DELETE ON public.check_templates FROM %I', r);
    END IF;
  END LOOP;
  -- Re-apply the two allowed writes after the sweep (of_app only):
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
    GRANT UPDATE (deleted_at) ON public.apparatus_checks TO of_app;
  END IF;
END $$;

-- ── Data migration: old checklist_templates → new model (prod: 2 rows; completions: 0) ──
-- Old shape: categories = [{ name, items: [{ id, type, description }] }]; frequency
-- title-case; apparatus = display string (matched to apparatus.designation best-effort).
DO $$
  DECLARE
    old_row  RECORD;
    new_tpl  INTEGER;
    new_ver  INTEGER;
    app_id   INTEGER;
    new_items JSONB;
  BEGIN
    FOR old_row IN SELECT * FROM public.checklist_templates LOOP
      -- Skip if already migrated (idempotent re-run guard).
      IF EXISTS (SELECT 1 FROM public.check_templates ct
                  WHERE ct.department_id = old_row.department_id AND ct.name = old_row.name) THEN
        CONTINUE;
      END IF;
      SELECT a.id INTO app_id FROM public.apparatus a
       WHERE a.department_id = old_row.department_id
         AND LOWER(a.designation) = LOWER(COALESCE(old_row.apparatus, ''))
       LIMIT 1;
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'key',     itm->>'id',
               'section', cat->>'name',
               'label',   itm->>'description')), '[]'::jsonb)
        INTO new_items
        FROM jsonb_array_elements(old_row.categories) AS cat,
             jsonb_array_elements(cat->'items') AS itm;
      IF new_items = '[]'::jsonb THEN CONTINUE; END IF;  -- surfaced, not defaulted: empty templates don't migrate
      INSERT INTO public.check_templates
             (department_id, station_id, name, apparatus_id, frequency, active)
      VALUES (old_row.department_id, old_row.station_id, old_row.name, app_id,
              CASE LOWER(COALESCE(old_row.frequency, 'daily'))
                WHEN 'weekly' THEN 'weekly' WHEN 'monthly' THEN 'monthly' ELSE 'daily' END,
              TRUE)
      RETURNING id INTO new_tpl;
      INSERT INTO public.check_template_versions (template_id, department_id, version, items)
      VALUES (new_tpl, old_row.department_id, 1, new_items)
      RETURNING id INTO new_ver;
      UPDATE public.check_templates SET current_version_id = new_ver WHERE id = new_tpl;
    END LOOP;
  END $$;

-- Stamp the ledger (of_schema_migrations stays 1:1 with the files).
INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0082-checks-rebuild.sql', NOW());

COMMIT;
