-- 0129-agent-approvals.sql
-- Department-local MCP approval queue.
--
-- First age-of-agents slice: an agent process on a self-hosted one-department
-- install can call a small set of fire verbs. Legal-record / life-safety writes
-- (NERIS submit, outbound notify, unit clear/release) land here instead of
-- writing the record. A chief or officer accepts or rejects on the existing
-- Dashboard — not a new admin console.
--
-- ADDITIVE. One new tenant table. No existing table touched.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id                 BIGSERIAL PRIMARY KEY,
  department_id      INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  verb               TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','approved','rejected')),
  payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary            TEXT NOT NULL DEFAULT '',
  requested_by       INTEGER,
  requested_by_name  TEXT DEFAULT '',
  requested_by_role  TEXT DEFAULT '',
  resolved_by        INTEGER,
  resolved_by_name   TEXT,
  resolved_at        TIMESTAMPTZ,
  resolve_note       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_dept_status
  ON public.agent_approvals (department_id, status, created_at DESC);

ALTER TABLE public.agent_approvals ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'agent_approvals' AND policyname = 'dept_isolation'
  ) THEN
    CREATE POLICY dept_isolation ON public.agent_approvals
      USING (department_id = NULLIF(current_setting('app.department_id', true), '')::int)
      WITH CHECK (department_id = NULLIF(current_setting('app.department_id', true), '')::int);
  END IF;
END $$;

COMMIT;
