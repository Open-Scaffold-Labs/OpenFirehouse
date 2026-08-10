-- 0044-cad-call-lifecycle.sql  (call-close lifecycle parity — 2026-07-12)
--
-- Three additive columns completing the call-close capability set the public
-- CAD functional standard (LEITSC) describes and mature platforms ship:
--
--   cad_alerts.disposition — how the call resolved, recorded at clear time.
--     App-validated vocabulary (routes/cad.js DISPOSITIONS — no CHECK
--     constraint, UNIT_STATUS_VALUES convention). Manual codes are set by the
--     dispatcher in the clear prompt (optional — never blocks a clear);
--     'cad_closed' and 'auto_expired' are SYSTEM codes set only by the close
--     ingestion / expiry paths. Cleared for a reopen.
--
--   cad_alerts.cleared_by — the user id that cleared the call (NULL for
--     system paths: CAD close event, auto-expiry). The per-action attribution
--     the standard's audit clauses expect.
--
--   departments.cad_auto_expire_hours — opt-in backstop for CAD feeds that
--     never send a close event (most volunteer-market feeds are initial-
--     dispatch-only): uncleared calls older than N hours are closed with
--     disposition 'auto_expired'. NULL (default) = OFF. Closes the CALL only —
--     unit statuses are NEVER touched by expiry (radio doctrine; the orphan
--     flag covers any still-committed units).
--
-- Idempotent. Apply to prod by hand (Supabase MCP) + mirror in db.js + stamp
-- of_schema_migrations. No RLS changes (columns on already-covered tables).

ALTER TABLE public.cad_alerts  ADD COLUMN IF NOT EXISTS disposition TEXT;
ALTER TABLE public.cad_alerts  ADD COLUMN IF NOT EXISTS cleared_by  INTEGER;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS cad_auto_expire_hours INTEGER;
