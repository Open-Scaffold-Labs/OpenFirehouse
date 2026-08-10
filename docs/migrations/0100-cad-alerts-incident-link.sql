-- 0100-cad-alerts-incident-link.sql
-- Phase 4 / ANALYTICS · 2026-07-26 · spec docs/PHASE4-ANALYTICS-SPEC-2026-07-26.md §4.3
--
-- WHY ─────────────────────────────────────────────────────────────────────────
-- cad/pipeline.js processStatusUpdate (built 2026-07-14, "arrival parity") links a
-- CAD unit-status event to its call with:
--     SELECT incident_id FROM cad_alerts WHERE alert_id = $1 AND station_id = $2
-- That column does not exist. Verified 2026-07-26 against prod:
--     ERROR 42703: column "incident_id" does not exist
-- absent from prod, from every migration 0000-0099, and from db.js DDL. The query
-- throws on every call, inside `catch (_) { /* incident link is optional */ }`, so
-- incidentId is ALWAYS null -- silently, since 2026-07-14. 163 of 175
-- unit_status_history rows carry no incident_id, so no per-call turnout or travel
-- time can be computed for them. Failure mode F3 (schema/code split) wearing F11
-- (a check that cannot fail).
--
-- The only code that would ever have CREATED the column is
-- utils/cadPipeline.js linkAlertToIncident, which does a runtime
-- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` inside its own swallowing catch.
-- That module is DEAD CODE -- `processCadAlert` has no caller anywhere in
-- server/src or client/src (verified 2026-07-26). So the ALTER never ran.
-- Runtime DDL from application code is not a migration; this file is.
--
-- WHAT ────────────────────────────────────────────────────────────────────────
-- Additive only. One nullable column + FK + partial index. No data rewritten.
-- cad_alerts holds 30 rows on prod, all with no incident link, so the FK validates
-- trivially and the column starts fully NULL.
--
-- NOT DONE HERE, deliberately: incidents.cad_alert_id and incidents.source are
-- also missing on prod, but their only writer is the same dead module. Adding
-- columns to serve uncalled code is scope we have not earned. The dead module is
-- flagged for triage instead.

BEGIN;

ALTER TABLE public.cad_alerts
  ADD COLUMN IF NOT EXISTS incident_id INTEGER;

-- RESTRICT, matching the 0016 precedent for FKs pointing at legal records:
-- incidents is the subpoenable record and is soft-deleted (deleted_at), so this
-- never fires in normal operation -- it exists so a hard delete cannot silently
-- orphan a call's attribution.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cad_alerts_incident_id_fkey') THEN
    ALTER TABLE public.cad_alerts
      ADD CONSTRAINT cad_alerts_incident_id_fkey
      FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Partial: the column is NULL for every call that was never linked to a saved
-- incident, which is the majority. Reverse lookup (incident -> its call) is the
-- analytics read path.
CREATE INDEX IF NOT EXISTS idx_cad_alerts_incident
  ON public.cad_alerts (incident_id)
  WHERE incident_id IS NOT NULL;

COMMENT ON COLUMN public.cad_alerts.incident_id IS
  'The saved incident this call was linked to (Phase 4, 0100). Written ONLY by '
  'POST /api/active-board/link-incident, when a human on the Command Board attaches '
  'the active call to an incident record. NULL means the call was never linked -- '
  'never guessed, never inferred from timing. Read by cad/pipeline.js '
  'processStatusUpdate to attribute CAD-fed unit-status events to a call, and by '
  'the Phase 4 response-time reports.';

-- NO BACKFILL. The 30 existing prod alerts predate any stored link, and the only
-- way to attach them now would be to match on timing -- which is exactly the
-- cross-attribution guess this migration exists to eliminate. They stay NULL and
-- their incidents report `not_captured`. An honest gap beats an invented fact.

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0100-cad-alerts-incident-link.sql')
ON CONFLICT DO NOTHING;

COMMIT;
