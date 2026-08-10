-- 0040 — departments.allow_rig_status (rig self-statusing toggle)
--
-- Per-department feature gate for rig-side unit statusing:
--   TRUE (default) = the rig's own crew (unit login or run-list officer seat)
--   may status ITS OWN unit from the cab; FALSE = strict dispatch-only doctrine.
-- Dispatch/command statusing is unaffected either way.
--
-- RADIO DOCTRINE IS UNCHANGED: a unit status is only ever flipped by a HUMAN —
-- dispatch/command for any unit, or (with this gate on) the rig's own crew for
-- its own unit. Never inferred: no geofence, no AVL, no AI auto-statusing.
--
-- Apply by hand (Supabase SQL editor / MCP apply_migration) AND mirrored in
-- server/src/db.js for fresh installs (initDb fast-paths on existing prod).

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS allow_rig_status BOOLEAN NOT NULL DEFAULT TRUE;
