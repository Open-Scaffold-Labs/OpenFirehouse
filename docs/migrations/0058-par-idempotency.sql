-- 0058-par-idempotency.sql
--
-- Make a completed PAR a REPLAYABLE, append-only legal record.
--
-- THE BUG (Matt, working fire officer, 2026-07-14): "nobody is going to re-run a
-- PAR because it doesn't work on the app. If it doesn't work it shouldn't be a
-- feature — either fix it or remove it, but definitely don't make an error
-- message the answer."
--
-- He was right. The old POST /api/active-board/par:
--   • 404'd without a LIVE board (it UPDATE'd active_boards and returned null if
--     the row was gone), so a PAR could not be recorded once the call closed;
--   • stamped ran_at = NOW(), so a late write recorded the WRONG time;
--   • had no idempotency key, so a retried write would DOUBLE-record.
-- Net: a PAR that failed on a dead network could not be queued and replayed — the
-- board just showed "PAR was not saved, re-run it," which nobody does on a
-- fireground. The write has to accept a LATE, server-authoritative record, exactly
-- like the CAD unit-status ingestion and the FI sync spine.
--
-- This is the same idempotency contract the FI sync spine uses (migration 0054):
-- a client-minted UUID is THE key. A replay of the same client_id is answered as a
-- duplicate and treated as SUCCESS. It is the only thing between a retried PAR and
-- a double-recorded one.
--
-- ADDITIVE + SAFE: one nullable column + one PARTIAL unique index. Existing rows
-- (client_id IS NULL) are untouched and unaffected. Zero-downtime.
--
-- APPEND-ONLY posture unchanged: par_checks keeps GRANT SELECT, INSERT only; the
-- 0046-lesson REVOKE of UPDATE/DELETE stands. Idempotency is enforced by the
-- unique index + ON CONFLICT DO NOTHING, never by an UPDATE.
--
-- NUMBERING: 0057 (par-anchor) is the previous file; 0058 was free at write time.
-- STATUS: apply to local, then to prod (Matt's gate), then mirror into db.js. A PAR
-- record is a legal document; the code that writes client_id must not deploy to
-- prod before this column exists there.

ALTER TABLE public.par_checks
  ADD COLUMN IF NOT EXISTS client_id UUID;

-- One PAR per (department, client_id). Partial so the millions of legacy rows with
-- NULL client_id are exempt — only client-minted replayable PARs are deduped.
CREATE UNIQUE INDEX IF NOT EXISTS uq_par_checks_dept_client
  ON public.par_checks (department_id, client_id)
  WHERE client_id IS NOT NULL;

COMMENT ON COLUMN public.par_checks.client_id IS
  'Client-minted idempotency key (UUID). A replayed PAR carrying the same '
  '(department_id, client_id) is a duplicate and is treated as success — this is '
  'what lets a PAR queued during a network outage land AFTER the call closes '
  'without double-recording. NULL for legacy rows written before 0058.';

-- Stamp the ledger (matches 0057; the runner also stamps, but a hand-applied
-- prod migration must record itself so of_schema_migrations stays 1:1 with files).
INSERT INTO public.of_schema_migrations (filename)
VALUES ('0058-par-idempotency.sql')
ON CONFLICT DO NOTHING;
