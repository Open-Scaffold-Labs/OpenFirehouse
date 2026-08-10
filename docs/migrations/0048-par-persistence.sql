-- 0048-par-persistence.sql  (PAR spine: persist + sync the Command Board's PAR — 2026-07-12)
--
-- The Command Board already SHIPS a complete PAR interaction (interval
-- selector, countdown, PAR OVERDUE, Run PAR modal w/ per-person check-in,
-- timeline entries) — but it lives entirely in one browser tab's React state.
-- An accountability record that vanishes on reload is worse than none. This
-- migration gives it a spine; the UI is reused, not rebuilt (audit 2026-07-12).
--
--   active_boards.par_interval_min — the incident's PAR interval (minutes,
--     NULL = no PAR timer). Set by command from the board.
--   active_boards.last_par_at      — when the last PAR completed; the
--     countdown basis is COALESCE(last_par_at, dispatched_at) + interval,
--     computed at read time on every surface (0046 model — no scheduler).
--
--   par_checks — APPEND-ONLY record of every PAR: counts, per-person results,
--     who ran it, when. Accountability records get the same append-only
--     discipline as unit_status_acks (fireground PAR history is evidence).
--
-- Dept-scoped + RLS. Idempotent. Apply by hand + mirror db.js + stamp ledger.

ALTER TABLE public.active_boards ADD COLUMN IF NOT EXISTS par_interval_min INTEGER;
ALTER TABLE public.active_boards ADD COLUMN IF NOT EXISTS last_par_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.par_checks (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  station_id    INTEGER,
  incident_id   INTEGER,
  incident_type TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  accounted     INTEGER NOT NULL DEFAULT 0,
  missing       INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  results       JSONB,                      -- per-person: [{name, accounted}]
  ran_by        INTEGER,
  ran_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_par_checks_dept_time ON public.par_checks (department_id, ran_at DESC);

ALTER TABLE public.par_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.par_checks;
CREATE POLICY dept_isolation ON public.par_checks FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);
GRANT SELECT, INSERT ON public.par_checks TO of_app;
GRANT USAGE, SELECT ON SEQUENCE public.par_checks_id_seq TO of_app;
-- Supabase default privileges auto-grant UPDATE/DELETE — revoke (0046 lesson).
REVOKE UPDATE, DELETE ON public.par_checks FROM of_app, anon, authenticated, service_role, PUBLIC;
