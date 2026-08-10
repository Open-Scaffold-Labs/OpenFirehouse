-- 0068-scheduling-calendar-consolidation.sql
-- Phase 1.1b (HARDEN THE TAIL): additive schema for the scheduling calendar core
-- + the run-store consolidation (apparatus_assignments = store of record,
-- run_lists = a DERIVED published snapshot).
--
-- Verified against PROD (abvcmaknsyqmahspmasu) 2026-07-22 BEFORE writing (D6):
--   * shift_patterns ALREADY carries platoon/cycle_type/cycle_on/cycle_off/
--     kelly_day_interval/anchor_date — so 24/48, 48/96, 24/72, 4-on-4-off and
--     Kelly are already expressible as two integers + a skip interval. What is
--     NOT expressible that way is the 2-2-3 / Pitman / DuPont class (an arbitrary
--     on/off day-state sequence) — hence cycle_pattern below. preset_key records
--     the named pattern a department chose so the UI shows "24/48", not raw cycles.
--   * run_lists has NO published_from_shift_id / source — the snapshot is still
--     independently client-authored. These two columns turn it into a DERIVED,
--     provenance-stamped published record (the consolidation).
--   * All four scheduling tables are RLS-on with dept_isolation; these are ADDITIVE
--     columns on EXISTING tenant tables, so no new table / no new policy is needed.
-- Data-preserving and additive throughout (F13). No destructive change.

-- ── shift_patterns: generalized cycle + named preset ────────────────────────
ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS preset_key    TEXT DEFAULT '';
ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS cycle_pattern TEXT DEFAULT '[]';
-- cycle_pattern: JSON array of 1/0 day-states indexed by (daysSinceAnchor % len).
-- Empty '[]' = fall back to the existing cycle_on/cycle_off (+ kelly) simple path,
-- so every pattern that works today keeps working unchanged.

-- ── run_lists: derived-snapshot provenance ──────────────────────────────────
ALTER TABLE run_lists ADD COLUMN IF NOT EXISTS published_from_shift_id INTEGER;
ALTER TABLE run_lists ADD COLUMN IF NOT EXISTS source TEXT;
-- published_from_shift_id: the shift whose apparatus_assignments were serialized
-- into this snapshot. NULL for legacy (pre-consolidation, client-authored) rows
-- and for any manual/dateless snapshot. Deliberately NOT a FK — the
-- active_boards.station_id FK trap (multi-house time bomb) is the lesson; the
-- app-layer department scope is authoritative.
-- source: 'published' (derived from live assignments) | 'import' (importer) |
-- 'legacy' (the pre-1.1b client-authored snapshots, marked below so the read-only
-- historical UX can tell old postings from new derived ones).
UPDATE run_lists SET source = 'legacy' WHERE source IS NULL;
