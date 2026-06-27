-- 0022-unit-status-model.sql  (canonical unit-status doctrine)
--
-- Matt (captain) redefined the live unit-status (apparatus dispatch) set to match
-- real department doctrine. SEVEN statuses; THREE are dispatchable:
--
--   in_service      ✅ dispatchable — ready, in quarters
--   on_the_air      ✅ dispatchable — in service, in-district, out of quarters
--                                     (driver training, district familiarization)
--   returning       ✅ dispatchable — left scene, heading back, still available
--   dispatched      ❌ committed
--   enroute         ❌ committed
--   on_scene        ❌ committed
--   out_of_service  ❌ not dispatchable — fuel / training / aerial check
--
-- This REPLACES the legacy 8-status set: `available` → `in_service` (rename);
-- `staging` + `committed` are DROPPED (remapped to `on_scene`); `on_the_air` is new.
-- This is the live dispatch board (unit_statuses) only — NOT the rig's mechanical
-- apparatus.status / apparatus_oos, which keep their own In/Out of Service values.
-- App-layer validation lives in db.js UNIT_STATUS_VALUES; there is no DB CHECK
-- constraint, so this migration only flips the default + remaps existing rows.
--
-- Idempotent. Apply to prod via Supabase MCP + mirror in db.js (CREATE TABLE
-- default already flipped) + stamp the ledger.

ALTER TABLE public.unit_statuses ALTER COLUMN status SET DEFAULT 'in_service';

-- Live board: rename available→in_service; drop staging/committed → on_scene.
UPDATE public.unit_statuses SET status = 'in_service' WHERE status = 'available';
UPDATE public.unit_statuses SET status = 'on_scene'   WHERE status IN ('staging', 'committed');

-- History is append-only audit. Only the cosmetic available→in_service relabel is
-- required (the NERIS clear_at filter keys on the back-in-quarters status); staging/
-- committed history rows are left as historical fact (they affect no read filter).
UPDATE public.unit_status_history SET status = 'in_service' WHERE status = 'available';
