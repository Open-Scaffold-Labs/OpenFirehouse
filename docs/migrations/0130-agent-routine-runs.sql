-- 0130-agent-routine-runs.sql
-- First OpenFirehouse routine: weekday morning shift brief.
--
-- Routines are scheduled watches on the same POST /api/agent/invoke plug
-- Ask and the department-local MCP already use. They are not a second
-- product. Reads only. AI never authors legal narrative; the brief never
-- clears units and never auto-Accepts.
--
-- Also widens of_cron_runs.job_name so the weekday morning-brief cron
-- can record a liveness row (same closed-set rule as 0128).
--
-- ADDITIVE. One new tenant table. Existing of_cron_runs CHECK replaced
-- with a wider closed set. No other table touched.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_routine_runs (
  id             BIGSERIAL PRIMARY KEY,
  department_id  INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  routine_name   TEXT NOT NULL
                   CHECK (routine_name IN ('morning_shift_brief')),
  trigger_kind   TEXT NOT NULL
                   CHECK (trigger_kind IN ('manual','scheduled')),
  silent         BOOLEAN NOT NULL DEFAULT false,
  fingerprint    TEXT NOT NULL DEFAULT '',
  digest         TEXT NOT NULL DEFAULT '',
  facts          JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id       INTEGER,
  actor_name     TEXT DEFAULT '',
  actor_role     TEXT DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_routine_runs_dept_created
  ON public.agent_routine_runs (department_id, created_at DESC);

ALTER TABLE public.agent_routine_runs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'agent_routine_runs' AND policyname = 'dept_isolation'
  ) THEN
    CREATE POLICY dept_isolation ON public.agent_routine_runs
      USING (department_id = NULLIF(current_setting('app.department_id', true), '')::int)
      WITH CHECK (department_id = NULLIF(current_setting('app.department_id', true), '')::int);
  END IF;
END $$;

-- Widen the 0128 closed set. CREATE TABLE IF NOT EXISTS cannot rewrite a
-- CHECK on an existing of_cron_runs, so drop the job_name check(s) and
-- put one named constraint back.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'of_cron_runs'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%job_name%'
  LOOP
    EXECUTE format('ALTER TABLE public.of_cron_runs DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
  ALTER TABLE public.of_cron_runs
    ADD CONSTRAINT of_cron_runs_job_name_check
    CHECK (job_name IN ('reconcile','retention','neris_sweep',
                        'report_delivery','permit_expiry','morning_brief'));
END $$;

COMMIT;
