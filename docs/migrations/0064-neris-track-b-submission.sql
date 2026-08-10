-- 0064 — NERIS Track B: submit-on-approval storage (2026-07-20)
-- docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md, Track B build.
--
-- TWO STATUS AXES, deliberately separate:
--   neris_submission_state  — OUR local submission lifecycle. Small stable set →
--                             CHECK'd (D5-eligible).
--   neris_incident_status   — NERIS's own record status, stored VERBATIM (D2).
--                             NO CHECK: it is externally sourced — a value NERIS
--                             adds in a future rev must never break ingestion.
--                             Code validates + logs unknowns; storage accepts.
-- All submission fields are SERVER-OWNED: never client-writable, written only by
-- the ONE submit engine (utils/nerisSubmit.js) and the sweep cron.

-- ── incidents: the submission axis ─────────────────────────────────────────
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_incident_uid TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_submission_state TEXT NOT NULL DEFAULT 'not_submitted';
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_incident_status TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_submission_log JSONB;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_submitted_at TIMESTAMPTZ;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS neris_status_checked_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_submission_state_chk' AND conrelid='public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_submission_state_chk
      CHECK (neris_submission_state IN ('not_submitted','submitted','update_pending','submit_failed','refused'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_submission_log_chk' AND conrelid='public.incidents'::regclass) THEN
    ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_submission_log_chk
      CHECK (neris_submission_log IS NULL OR jsonb_typeof(neris_submission_log) = 'array');
  END IF;
END $$;

-- The sweep's read path: records needing a retry, or holding a non-terminal
-- NERIS status that wants a staleness-gated poll.
CREATE INDEX IF NOT EXISTS idx_incidents_neris_sweep ON public.incidents (department_id)
  WHERE neris_submission_state IN ('submit_failed','update_pending')
     OR (neris_incident_uid IS NOT NULL
         AND neris_incident_status IN ('SUBMITTED','PENDING_APPROVAL','PENDING_INCIDENT_DATA'));

-- ── departments: the enrollment surface (market pattern: entity id + toggle,
--    default OFF — nothing submits nationally unless a chief turns it on) ───
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS neris_id TEXT DEFAULT '';
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS neris_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE;
