-- 0046-status-timers.sql  (unit status timers + dispatcher acknowledgment — 2026-07-12)
--
-- The last mandatory-flavor clause of the public CAD functional standard
-- (LEITSC §1.7.3) OF was missing: maintain elapsed time per status, alert the
-- dispatcher past an agency-defined threshold, RECORD the dispatcher's
-- acknowledgment, and let the ack automatically reset the timer.
--
--   departments.status_timer_config — per-status thresholds in MINUTES
--     (JSONB, e.g. {"dispatched":10,"enroute":10,"on_scene":30}); 0 = timer
--     off for that status; NULL column = built-in defaults
--     (utils/statusTimers.js DEFAULT_THRESHOLDS). Overdue state is computed
--     AT READ TIME from unit_statuses.updated_at — no scheduler to miss
--     (serverless-native; exceeds the desktop-CAD per-workstation model).
--
--   unit_status_acks — APPEND-ONLY record of each dispatcher "status check"
--     acknowledgment: which unit, which status stint (status_since =
--     unit_statuses.updated_at at ack time), who, when. An ack whose acked_at
--     is newer than the unit's current updated_at resets that unit's timer
--     basis; a status CHANGE resets it naturally (new updated_at). Radio
--     doctrine intact: the timer alerts a HUMAN, the human confirms over the
--     radio, the ack is the human's recorded action — nothing auto-flips.
--
-- Dept-scoped + RLS (dept_isolation) like every OF tenant table. Idempotent.
-- Apply to prod by hand (Supabase MCP) + mirror in db.js + stamp the ledger.

ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS status_timer_config JSONB;

CREATE TABLE IF NOT EXISTS public.unit_status_acks (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  station_id    INTEGER,
  apparatus_id  INTEGER NOT NULL REFERENCES public.apparatus(id) ON DELETE CASCADE,
  designation   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL,
  status_since  TIMESTAMPTZ,
  acked_by      INTEGER,
  acked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot read: latest ack per unit for the board's overdue computation.
CREATE INDEX IF NOT EXISTS idx_unit_status_acks_unit
  ON public.unit_status_acks (department_id, apparatus_id, acked_at DESC);

-- Department-isolation RLS (0006 uniform policy; 0023/0043 pattern).
ALTER TABLE public.unit_status_acks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.unit_status_acks;
CREATE POLICY dept_isolation ON public.unit_status_acks FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);
GRANT SELECT, INSERT ON public.unit_status_acks TO of_app; -- append-only: no UPDATE/DELETE grant
GRANT USAGE, SELECT ON SEQUENCE public.unit_status_acks_id_seq TO of_app;
-- Supabase default privileges auto-grant UPDATE/DELETE — revoke explicitly
-- (same mandatory-REVOKE lesson as public fns; verified live on apply).
REVOKE UPDATE, DELETE ON public.unit_status_acks FROM of_app, anon, authenticated, service_role, PUBLIC;
