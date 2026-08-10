-- 0051 — Prevention Core Phase 3: field-ops substrate (2026-07-13)
--
--   fi_inspections.assigned_to_user_id — the robust assignment link for the
--     "My Inspections" queue + workload rebalancing (same identity doctrine as
--     members.user_id: the durable link is the user id; "inspectorName" stays
--     the display/fallback). Nullable — unassigned inspections are legal.
--   fi_signatures.image / signed_by_user_id — on-screen signature capture
--     (occupant signs FIRST under the department's agreement text, then the
--     inspector — incumbent-verified order). PNG bytes live IN the row (BYTEA),
--     exactly the fi_notices.pdf precedent: a signature is part of the legal
--     record — atomic with it, RLS-covered, same backup story, append-only.
--
-- No new tables — fi_inspections + fi_signatures already carry dept_isolation
-- RLS + department indexes. Idempotent; applied by hand (local rehearsal, then
-- prod via Supabase MCP); db.js fresh-install mirror updated in the same commit.

ALTER TABLE fi_inspections ADD COLUMN IF NOT EXISTS assigned_to_user_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_fi_inspections_assignee
  ON fi_inspections (department_id, assigned_to_user_id)
  WHERE deleted_at IS NULL AND "completedDate" IS NULL;

ALTER TABLE fi_signatures ADD COLUMN IF NOT EXISTS image BYTEA;
ALTER TABLE fi_signatures ADD COLUMN IF NOT EXISTS signed_by_user_id INTEGER;
