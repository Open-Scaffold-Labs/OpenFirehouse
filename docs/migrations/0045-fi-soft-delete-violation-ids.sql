-- 0045 — fi_* legal-record hardening (Prevention Core Phase 0, 2026-07-12)
--
-- 1. Soft-delete columns on the three fire-inspection tables (same doctrine as
--    incidents/exposure_records: inspection records are legal records — never
--    hard-delete). Reads now filter deleted_at IS NULL; DELETE routes flip the flag.
-- 2. Stable violation ids: every violation element inside fi_inspections.violations
--    (JSON array in a TEXT column) gets an `id` if it lacks one. CRITICAL: existing
--    elements get their CURRENT ARRAY POSITION as a string id — NOT a UUID — because
--    violation photos are stored under index-keyed paths
--    ({dept}/{inspectionId}/{violationId}/…) and re-keying would orphan the evidence.
--    New violations get UUIDs at the API write chokepoint from now on.
--
-- Prod sizing before this migration (2026-07-12): 5 inspections, 1 department,
-- 6 violation elements (2 Pending / 2 Open / 2 Corrected), all 6 missing ids.
--
-- Apply by hand (Supabase SQL editor / MCP apply_migration) AND it is mirrored in
-- db.js CREATE TABLE for fresh installs. Idempotent.

ALTER TABLE fi_properties  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE fi_inspections ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE fi_permits     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Backfill violation ids (position-as-string, zero-based to match photo folders).
UPDATE fi_inspections SET violations = sub.new_violations
FROM (
  SELECT fi.id,
         jsonb_agg(
           CASE WHEN t.elem ? 'id' THEN t.elem
                ELSE t.elem || jsonb_build_object('id', (t.ord - 1)::text)
           END ORDER BY t.ord
         )::text AS new_violations
  FROM fi_inspections fi,
       LATERAL jsonb_array_elements(fi.violations::jsonb) WITH ORDINALITY AS t(elem, ord)
  GROUP BY fi.id
) sub
WHERE fi_inspections.id = sub.id
  AND fi_inspections.violations IS NOT NULL
  AND fi_inspections.violations <> '[]';
