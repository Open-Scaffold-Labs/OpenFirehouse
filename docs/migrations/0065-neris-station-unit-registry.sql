-- 0065 — NERIS station/unit registration ids (2026-07-20)
-- docs/NERIS-BULLETPROOF-BUILD-2026-07-16.md, SR build.
--
-- The NERIS-issued ids for stations and units registered from OF (the market's
-- join-key pattern: store the returned id locally so every subsequent sync
-- addresses the SAME national object instead of re-creating it — dual writers
-- are the documented "duplicate or mismatched unit IDs" failure mode).
-- SERVER-OWNED: written only by utils/nerisRegistry.js; never client-writable.

ALTER TABLE public.stations  ADD COLUMN IF NOT EXISTS neris_station_id TEXT;
ALTER TABLE public.apparatus ADD COLUMN IF NOT EXISTS neris_unit_id    TEXT;
