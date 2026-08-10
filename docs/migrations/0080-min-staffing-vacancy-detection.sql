-- 0080 — Min-staffing rules + unified vacancy detection (Phase 1.4).
-- Spec: docs/PHASE1-VACANCY-SPEC-2026-07-25.md §2. Claim-by-stub 2026-07-25 (head verified 0079).
--
-- Market pass (2026-07-25, competitors generic per the standing rule): minimums at three
-- layerable grains (per-shift count / per-apparatus seats / per-rank-or-cert counts), each
-- optionally time-windowed + date-bounded; a FIRST-CLASS vacancy record (position context,
-- required quals, time range inherited from the absence, cause, fill priority, lifecycle
-- open→offering→filled|cancelled|expired); event-driven minting in the same transaction as
-- the causing write (nobody infers vacancies from telemetry; nobody hard-blocks command).
-- Matt's ruling 2026-07-25: full parity — "we need to do everything they can do."
--
-- Unification: this is THE object the coverage islands collapse into. The 1.2 leave path
-- stops minting shift_swaps and mints vacancies; routes/vacancyFill.js retires (rows
-- backfilled below, table kept read-only until a later cleanup); coverage_outreach gains
-- vacancy_id so the offer ledger (1.5's hiring engine writes it) anchors on the vacancy.
--
-- Records classification (spec §5): vacancies = operational record with grievance exposure —
-- lifecycle transitions are engine-owned (one door) + audited via audit_log; rows are never
-- hard-deleted (cancelled/expired are terminal statuses) → of_app gets NO DELETE.
-- min_staffing_rules = config with grievance exposure ("what was the rule that date" —
-- effective dating + audit answer it) → deactivate, never hard-delete → NO DELETE.
--
-- Tenancy: department_id from the JWT. RLS dept_isolation on both new tables, matching the
-- ~100 other tenant tables. No new public/unauthenticated or SECURITY DEFINER surface.
--
-- D6: applied to prod by hand (Supabase MCP) → verified live by query → ledgered in
-- of_schema_migrations → THEN dependent code ships. Additive only; no drops, no data loss.

BEGIN;

-- ── min_staffing_rules — layered minimums at three grains, time-windowed, date-bounded ──
-- 0075's departments.min_staffing_per_shift stays as the zero-config umbrella: it is
-- evaluated as an implicit shift_count rule when a department has no active explicit one,
-- so unconfigured departments behave exactly as today.
CREATE TABLE IF NOT EXISTS public.min_staffing_rules (
  id             SERIAL PRIMARY KEY,
  department_id  INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  station_id     INTEGER,                              -- NULL = department-wide
  name           TEXT NOT NULL,
  rule_type      TEXT NOT NULL
                   CONSTRAINT msr_rule_type_chk
                   CHECK (rule_type IN ('shift_count','rank_count','cert_count','apparatus_seats')),
  target         TEXT,                                 -- canonical rank (rank_count) / cert code
                                                       -- (cert_count) / apparatus id as text
                                                       -- (apparatus_seats) / NULL (shift_count)
  min_count      INTEGER NOT NULL
                   CONSTRAINT msr_min_count_chk CHECK (min_count >= 0),
  shift_type     TEXT,                                 -- NULL = all shift types
  time_start     TIME,                                 -- NULL/NULL = whole tour; window may span
  time_end       TIME,                                 --   midnight (start > end), engine-handled
  days_of_week   TEXT,                                 -- JSON array of 0-6 (Sun=0); NULL = all days
  effective_from DATE,                                 -- NULL = always (date-bounded temp rules)
  effective_to   DATE,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_msr_dept_active ON public.min_staffing_rules(department_id, active);

ALTER TABLE public.min_staffing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.min_staffing_rules;
CREATE POLICY dept_isolation ON public.min_staffing_rules FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);

-- ── vacancies — THE unified first-class open-coverage record ──
-- Status transitions are engine-owned (one door — the fi-suite lesson); no raw status PATCH.
-- cause = the semantic reason; cause_kind/cause_id = the minting record (INTEGER id only —
-- audit_log discipline, lesson #14 applies to every record-id column we add).
CREATE TABLE IF NOT EXISTS public.vacancies (
  id                  SERIAL PRIMARY KEY,
  department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  station_id          INTEGER,
  shift_date          DATE NOT NULL,
  shift_id            INTEGER,                          -- shifts.id (loose ref, house style)
  apparatus_id        INTEGER,                          -- apparatus.id (loose ref)
  position_id         INTEGER,                          -- apparatus_positions.id (loose ref)
  position_name       TEXT NOT NULL DEFAULT '',
  required_rank       TEXT NOT NULL DEFAULT '',
  required_certs      TEXT NOT NULL DEFAULT '[]',       -- JSON array of canonical cert codes
  start_ts            TIMESTAMPTZ,                      -- absence ∩ shift; NULL = whole tour
  end_ts              TIMESTAMPTZ,
  hours               NUMERIC,                          -- derived duration (partial-shift parity)
  cause               TEXT NOT NULL
                        CONSTRAINT vacancies_cause_chk
                        CHECK (cause IN ('leave','sick_callout','trade_fallout','open_slot','manual')),
  cause_kind          TEXT,                             -- e.g. 'leave_request','vacancy_fill'
  cause_id            INTEGER,                          -- the minting record's INTEGER id
  priority            INTEGER NOT NULL DEFAULT 2
                        CONSTRAINT vacancies_priority_chk CHECK (priority BETWEEN 1 AND 3),
  status              TEXT NOT NULL DEFAULT 'open'
                        CONSTRAINT vacancies_status_chk
                        CHECK (status IN ('open','offering','filled','cancelled','expired')),
  filled_by_member_id INTEGER,
  filled_at           TIMESTAMPTZ,
  fill_method         TEXT
                        CONSTRAINT vacancies_fill_method_chk
                        CHECK (fill_method IS NULL OR fill_method IN ('accepted_offer','assigned')),
  cancelled_reason    TEXT,
  created_by_user_id  INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vacancies_dept_status_date
  ON public.vacancies(department_id, status, shift_date);
-- Mint idempotency: a given causing record mints AT MOST ONE live vacancy per
-- (date, position). Re-approving / re-evaluating never double-mints; manual creates
-- (cause_id NULL) are unconstrained. Race-proof at the DB, not just the engine.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vacancies_live_cause
  ON public.vacancies(department_id, cause_kind, cause_id, shift_date, position_name)
  WHERE status IN ('open','offering') AND cause_id IS NOT NULL;

ALTER TABLE public.vacancies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.vacancies;
CREATE POLICY dept_isolation ON public.vacancies FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);

COMMENT ON TABLE public.vacancies IS
  'Unified first-class open-coverage record (Phase 1.4): minted event-driven by the causing '
  'schedule transaction (leave approval, call-out, trade fallout) or command-created manually. '
  'Lifecycle open→offering→filled|cancelled|expired, engine-owned transitions only, audited '
  'via audit_log, never hard-deleted. Time range = absence ∩ shift (partial-shift parity). '
  'The 1.5 hiring engine consumes it and writes the offer sequence to coverage_outreach.';

-- ── coverage_outreach — re-anchor the offer ledger on the unified vacancy ──
ALTER TABLE public.coverage_outreach
  ADD COLUMN IF NOT EXISTS vacancy_id INTEGER REFERENCES public.vacancies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_coverage_outreach_vacancy ON public.coverage_outreach(vacancy_id);

-- ── departments — per-department vacancy posture (both market postures exist) ──
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS vacancy_split_allowed BOOLEAN NOT NULL DEFAULT FALSE;  -- opt-in, market norm
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS vacancy_auto_open BOOLEAN NOT NULL DEFAULT TRUE;       -- high-end default

-- ── Backfill: legacy vacancy_fill rows → vacancies (status-mapped, guarded date cast) ──
-- vacancy_fill.shift_date is free-text; only ISO rows migrate (pre-launch data is seed-only —
-- anything unparseable is surfaced by the count check in the D6 verify, not silently coerced).
INSERT INTO public.vacancies
  (department_id, station_id, shift_date, position_name, cause, cause_kind, cause_id,
   priority, status, filled_by_member_id, filled_at, created_at, updated_at)
SELECT vf.department_id, vf.station_id, vf.shift_date::date, COALESCE(vf.position, ''),
       'manual', 'vacancy_fill', vf.id,
       CASE WHEN vf.priority = 'high' THEN 1 ELSE 2 END,
       CASE vf.status WHEN 'notifying' THEN 'offering'
                      WHEN 'filled'    THEN 'filled'
                      WHEN 'expired'   THEN 'expired'
                      WHEN 'cancelled' THEN 'cancelled'
                      ELSE 'open' END,
       vf.filled_by_id, vf.filled_at, vf.created_at, vf.updated_at
FROM public.vacancy_fill vf
WHERE vf.department_id IS NOT NULL
  AND vf.shift_date ~ '^\d{4}-\d{2}-\d{2}$'
  AND NOT EXISTS (SELECT 1 FROM public.vacancies v
                  WHERE v.cause_kind = 'vacancy_fill' AND v.cause_id = vf.id);

-- ── Role grants (guarded so the file also runs on a local dev DB without these roles) ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
    -- Both surfaces: no DELETE (vacancies terminal-status only; rules deactivate).
    GRANT SELECT, INSERT, UPDATE ON public.min_staffing_rules TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.min_staffing_rules_id_seq TO of_app;
    GRANT SELECT, INSERT, UPDATE ON public.vacancies TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.vacancies_id_seq TO of_app;
  END IF;
END $$;

-- Supabase default privileges auto-grant DELETE on new tables (the 0046/0059/0076 lesson) —
-- revoke it so "never hard-deleted" is physical, not conventional. PUBLIC always exists.
DO $$
  DECLARE r text;
BEGIN
  REVOKE DELETE ON public.min_staffing_rules FROM PUBLIC;
  REVOKE DELETE ON public.vacancies FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE DELETE ON public.min_staffing_rules FROM %I', r);
      EXECUTE format('REVOKE DELETE ON public.vacancies FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- Stamp the ledger (of_schema_migrations stays 1:1 with the files).
INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0080-min-staffing-vacancy-detection.sql', NOW());

COMMIT;
