-- 0101-response-benchmarks.sql
-- Phase 4 · 4.1d · 2026-07-26 · spec docs/PHASE4-ANALYTICS-SPEC-2026-07-26.md
--
-- (a) PER-DEPARTMENT BENCHMARK TARGETS ───────────────────────────────────────
-- CFAI's model is AGENCY-SET benchmarks: every accredited department publishes a
-- BASELINE (what we actually do), a BENCHMARK (what we adopted as our target),
-- and the GAP between them -- CFAI lists the gap as its own data point (2D.6),
-- and the report template's last column is literally "Target (Agency
-- Benchmark)". NFPA permits an AHJ to modify the prescribed goals after a
-- community risk assessment.
--
-- Without somewhere to store a department's own target we can only ever render
-- the baseline column, and the report is structurally incomplete. Matt's ruling
-- R3, 2026-07-26: match the market -- targets are department-configurable.
--
-- The NFPA defaults live in server/src/constants/responseMetrics.js and are NOT
-- copied in here. A department row OVERRIDES a default; absence means "use the
-- standard". Seeding every department with a copy of the standard would turn a
-- future NFPA correction into 500 stale rows nobody knows to update.
--
-- (b) TOUR CHANGEOVER FALLBACK ──────────────────────────────────────────────
-- apparatus_assignments already carries a per-assignment window (verified live:
-- 516 rows 08:00-17:00, 312 rows 07:00-19:00, 99 with none). Per-assignment
-- stays AUTHORITATIVE -- two tour shapes coexist in one department, which is
-- exactly why a per-department constant cannot be the primary. These columns are
-- the fallback for the rows carrying no window of their own, and for departments
-- that never set one. Matt's ruling R10: his department changes over at 0800.
--
-- SAFETY ────────────────────────────────────────────────────────────────────
-- Additive only. New tenant table gets RLS + dept_isolation, matching every
-- other tenant table. Department-scoped unique key from the start -- 0104 this
-- same session had to undo two GLOBAL unique keys that would have refused a
-- second department its own CAD run number and its own hydrant H-001.

BEGIN;

-- ── (a) benchmarks ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.response_benchmarks (
  id             SERIAL PRIMARY KEY,
  department_id  INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  -- The objective key from constants/responseMetrics.js (e.g. 'turnout_fire').
  -- Deliberately NOT a CHECK constraint against a hardcoded list: the closed set
  -- lives in the server constants and is validated there, and a CHECK here would
  -- have to be migrated every time the standard is renumbered (1710 -> 1750).
  objective_key  TEXT    NOT NULL,
  -- The department's ADOPTED target. Both nullable so a department can adopt a
  -- different time while keeping the standard's fraction, or vice versa.
  target_seconds INTEGER,
  target_fraction NUMERIC(4,3),
  -- Why they adopted something other than the standard. CFAI expects an agency
  -- to be able to explain its benchmark; a target with no rationale is the kind
  -- of thing an accreditation team asks about.
  rationale      TEXT,
  adopted_on     DATE,
  updated_by     INTEGER,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT response_benchmarks_seconds_sane
    CHECK (target_seconds IS NULL OR (target_seconds > 0 AND target_seconds <= 86400)),
  CONSTRAINT response_benchmarks_fraction_sane
    CHECK (target_fraction IS NULL OR (target_fraction > 0 AND target_fraction <= 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_response_benchmarks_dept_objective
  ON public.response_benchmarks (department_id, objective_key);

ALTER TABLE public.response_benchmarks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'response_benchmarks' AND policyname = 'dept_isolation') THEN
    -- NULLIF is load-bearing and copied verbatim from the 108 existing
    -- dept_isolation policies: with the GUC unset, current_setting(...,true)
    -- returns '' and ''::integer THROWS 22P02. Without the guard this policy
    -- turns every un-scoped query into an error instead of an empty result.
    CREATE POLICY dept_isolation ON public.response_benchmarks
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.response_benchmarks TO of_app;
GRANT USAGE, SELECT ON SEQUENCE public.response_benchmarks_id_seq TO of_app;

COMMENT ON TABLE public.response_benchmarks IS
  'Per-department ADOPTED response-time targets (0101). CFAI requires an agency '
  'benchmark alongside the measured baseline, plus the gap between them (2D.6); '
  'without this the report can only ever render the baseline column. A row '
  'OVERRIDES the NFPA default in constants/responseMetrics.js — absence means '
  'use the standard. Defaults are deliberately NOT seeded here.';

-- ── (b) tour changeover fallback ────────────────────────────────────────────
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS tour_start_time TEXT;
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS tour_length_hours NUMERIC(4,2);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_tour_start_format') THEN
    ALTER TABLE public.departments ADD CONSTRAINT departments_tour_start_format
      CHECK (tour_start_time IS NULL OR tour_start_time ~ '^[0-9]{1,2}:[0-9]{2}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_tour_length_sane') THEN
    ALTER TABLE public.departments ADD CONSTRAINT departments_tour_length_sane
      CHECK (tour_length_hours IS NULL OR (tour_length_hours > 0 AND tour_length_hours <= 24));
  END IF;
END $$;

COMMENT ON COLUMN public.departments.tour_start_time IS
  'Tour changeover, HH:MM (0101). FALLBACK ONLY — apparatus_assignments carries '
  'a per-assignment window and that stays authoritative, because two tour shapes '
  '(08:00-17:00 and 07:00-19:00) coexist in one department today. Used for '
  'assignments with no window of their own. NULL means not captured — never '
  'guessed. A calendar-day join is always wrong: tours cross midnight.';

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0101-response-benchmarks.sql')
ON CONFLICT DO NOTHING;

COMMIT;
