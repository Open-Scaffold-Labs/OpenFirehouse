-- 0104-tenant-scoped-unique-keys.sql
-- Phase 4 · 2026-07-26 · CROSS-TENANT COLLISION FIX (Matt: "yes fix this")
--
-- THE DEFECT ─────────────────────────────────────────────────────────────────
-- Two tenant tables carry a GLOBAL unique key on a value that every department
-- namespaces for itself. The second department to use the same value gets 23505
-- and CANNOT CREATE THE ROW. Live-verified 2026-07-26 via pg_get_constraintdef:
--
--   cad_alerts   UNIQUE (alert_id)        -- the CAD dispatch/run number
--   hydrants     UNIQUE ("hydrantNumber") -- e.g. H-001, H-002, DH-001 on prod today
--
-- CAD run numbers are commonly sequential per agency (2026-000123). Hydrants are
-- numbered from 1 by every municipality on earth. Prod's own hydrant numbers are
-- literally H-001..H-006 + DH-001. So: department B onboards, tries to add ITS
-- hydrant H-001, and is refused because department A already has one. For
-- cad_alerts it is worse than a refusal — it is a DROPPED DISPATCH, caused by
-- another tenant's data.
--
-- Neither has fired yet only because prod has a single real department and every
-- cad_alerts row is synthetic (20 demo-<epoch> + 10 test artifacts; no real CAD
-- has ever connected). LATENT, NOT ABSENT. It fires on the second paying customer.
--
-- THE PRECEDENT ──────────────────────────────────────────────────────────────
-- OF has already fixed exactly this defect class once, for incidents (db.js:2028):
--   "The old global UNIQUE on incidentNumber wrongly blocked two departments from
--    sharing a number AND blocked reuse after a soft-delete."
-- That fix dropped the global constraint and created a scoped unique index. This
-- migration applies the same pattern to the two tables that still have it.
--
-- SWEEP ──────────────────────────────────────────────────────────────────────
-- All 23 unique keys on tables carrying department_id were audited. The other 21
-- are CORRECT and are deliberately left alone:
--   * parent-scoped (tenancy inherited through a dept-scoped FK): cad_alert_units,
--     check_template_versions, fi_violations, hiring_list_members, hiring_offers,
--     inventory_stock, work_orders, wellness, unit_locations
--   * globally-unique BY DESIGN (secrets, device tokens, storage paths, invite
--     codes): members.cal_token, calendar_subscriptions.cal_token,
--     expo_push_tokens.token, push_subscriptions.endpoint,
--     station_displays.device_token_hash, wedge_department_access.invite_code,
--     pre_plan_photos.storage_path
--   * scan_tag on apparatus / tracked_assets / inventory_items /
--     inventory_locations (0086): OF-MINTED ('ofh' || md5(random())), so global
--     uniqueness is intentional and required — a scanned QR must resolve to
--     exactly one row. NOT a defect. Left alone.
--
-- SAFETY ─────────────────────────────────────────────────────────────────────
-- Verified before writing: 0 rows with a NULL department_id in either table, and
-- 0 duplicate (department_id, key) pairs — so both new indexes validate cleanly.
-- NULLS NOT DISTINCT (PG15+; prod is 17) so a NULL department_id cannot open a
-- dedupe hole in the ON CONFLICT path that depends on this key.
--
-- ⚠️ COUPLED CODE CHANGE — db.js cadAlertCreate does
--        ON CONFLICT (alert_id) DO NOTHING
--    which resolves against the OLD constraint. After this migration it must read
--        ON CONFLICT (department_id, alert_id) DO NOTHING
--    or every CAD insert fails 42P10 ("no unique or exclusion constraint matching").
--    D6 order: this migration lands on prod FIRST, then that code ships.

BEGIN;

-- ── cad_alerts: the CAD dispatch/run number is unique PER DEPARTMENT ─────────
ALTER TABLE public.cad_alerts DROP CONSTRAINT IF EXISTS cad_alerts_alert_id_key;
DROP INDEX IF EXISTS public.cad_alerts_alert_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cad_alerts_dept_alert
  ON public.cad_alerts (department_id, alert_id) NULLS NOT DISTINCT;

COMMENT ON INDEX public.uq_cad_alerts_dept_alert IS
  'CAD run numbers are namespaced per department (0104). The old global '
  'UNIQUE (alert_id) refused a second department the same run number — a dropped '
  'dispatch caused by another tenant. Same defect class as the incidentNumber fix.';

-- ── hydrants: hydrant numbers are unique PER DEPARTMENT ─────────────────────
ALTER TABLE public.hydrants DROP CONSTRAINT IF EXISTS "hydrants_hydrantNumber_key";
DROP INDEX IF EXISTS public."hydrants_hydrantNumber_key";

CREATE UNIQUE INDEX IF NOT EXISTS uq_hydrants_dept_number
  ON public.hydrants (department_id, "hydrantNumber") NULLS NOT DISTINCT;

COMMENT ON INDEX public.uq_hydrants_dept_number IS
  'Hydrant numbers are namespaced per department (0104). Every municipality '
  'numbers from 1 — prod today holds H-001..H-006 and DH-001. The old global '
  'UNIQUE would have refused the second department its own H-001.';

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0104-tenant-scoped-unique-keys.sql')
ON CONFLICT DO NOTHING;

COMMIT;
