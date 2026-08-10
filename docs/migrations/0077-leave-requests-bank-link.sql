-- 0077 — Link leave_requests to a leave bank + carry the hours (Phase 1.2b).
--
-- 1.2b wires leave APPROVAL to the 0076 bank ledger: approving a request posts a
-- `usage` debit against a bank (reducing the member's available balance the moment
-- it's approved — so a future-dated approval already reduces "available-to-request",
-- the market bar), and cancelling/denying an approved request posts a compensating
-- `reversal` (never edits the original debit). To do that a request must name WHICH
-- bank and HOW MANY hours. Two additive, nullable columns on the existing legacy
-- `leave_requests` table:
--   * leave_type_id — the bank this leave draws from (FK → leave_types; SET NULL if a
--     bank type is ever removed, though the app only deactivates them). NULL on legacy /
--     unspecified requests → the approval path skips the ledger entirely (no fabricated
--     movement), preserving today's behavior.
--   * hours — the quantity to debit. Explicit for now. Auto-deriving it from the member's
--     SCHEDULED shift hours in the window (the market bar — 24h shift → 24h, per-dept
--     "≥ half-shift rounds up" rule) is deferred: it depends on the run/shift store that
--     is mid-consolidation. Until then hours is entered, never a flat hours-per-day guess.
--
-- Additive + nullable → no backfill, no data loss, no RLS change (leave_requests RLS is
-- already configured). D6: applied to prod by hand (Supabase MCP) → verified live → ledgered
-- → THEN the dependent code (leaveRequests.js approval→ledger wiring + db.js mirror) ships.
-- Head verified 0076 against docs/migrations/ + the prod of_schema_migrations ledger; 0077 free.

BEGIN;

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS leave_type_id INTEGER
    REFERENCES public.leave_types(id) ON DELETE SET NULL;

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS hours NUMERIC;

CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_type
  ON public.leave_requests(leave_type_id) WHERE leave_type_id IS NOT NULL;

INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0077-leave-requests-bank-link.sql', NOW());

COMMIT;
