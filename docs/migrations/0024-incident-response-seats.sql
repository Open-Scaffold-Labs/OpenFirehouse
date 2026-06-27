-- 0024-incident-response-seats.sql  (Phase E: responder seat declaration)
--
-- Adds optional apparatus + seat declaration to a volunteer's incident response,
-- so the qualification-weighted staffing board can place responders on a specific
-- rig/position the way responder apps in use do (responder-declared, not guessed).
--
--   apparatus_id   — the rig the responder is staffing (FK apparatus, SET NULL)
--   position_id    — the seat on that rig (FK apparatus_positions, SET NULL)
--   position_name  — denormalized seat label (survives a positions reseed)
--
-- All NULLABLE: a plain "responding" with no seat is still valid (the responder
-- may not have picked a rig yet). incident_responses already has the
-- dept_isolation RLS policy + of_sync_department_id trigger + of_app grants, so
-- adding columns needs no new policy/grant. Idempotent. Apply to prod via
-- Supabase MCP + mirror in db.js + stamp the ledger.

ALTER TABLE public.incident_responses
  ADD COLUMN IF NOT EXISTS apparatus_id  INTEGER REFERENCES public.apparatus(id)            ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position_id   INTEGER REFERENCES public.apparatus_positions(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position_name TEXT;

-- Hot read for the staffing board: responders on a given rig for an incident.
CREATE INDEX IF NOT EXISTS idx_incident_responses_incident_apparatus
  ON public.incident_responses(incident_id, apparatus_id);

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0024-incident-response-seats.sql')
ON CONFLICT (filename) DO NOTHING;
