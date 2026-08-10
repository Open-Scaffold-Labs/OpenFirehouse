-- 0041 — cad_alert_units: the dispatch archive at UNIT-RESPONSE grain
--
-- WHY
-- ---
-- `cad_alerts.units` is a comma-separated STRING ("Engine 1, Ladder 1, Rescue 1").
-- It can DISPLAY a dispatch but cannot answer questions about one:
--
--   1. Substring search is WRONG. `units LIKE '%Engine 1%'` also matches
--      "Engine 10", "Engine 11", "Engine 100" — verified on our own rows
--      (5 matches, 3 false positives). A wrong run history is not cosmetic:
--      it is ISO travel-time credit, LOSAP service points, and subpoena response.
--   2. A string has nowhere to put PER-UNIT TIME. Each rig has its own
--      dispatch/enroute/on-scene/clear clock (Engine 1 arrives 03:48, Ladder 1
--      at 03:56). NFPA 1710/1720 percentiles and ISO credit are computed from
--      exactly those. No query can recover them from a string.
--
-- This is the grain the federal standard uses (NERIS `unit_responses` carries
-- per-unit dispatch / enroute_to_scene / on_scene / unit_clear) and the grain
-- mature production CAD archives publish (one row per unit per call, with that
-- unit's own timestamps). Adopting it is meeting the bar, not exceeding it.
--
-- PROVENANCE IS NEVER DESTROYED: `cad_alerts.units` KEEPS the verbatim CAD string.
-- These rows are a parsed INDEX over it, not a replacement for it. If the parser
-- is ever wrong, the truth is still on the alert.
--
-- Apply by hand (Supabase MCP apply_migration) AND mirror into server/src/db.js
-- for fresh installs (initDb fast-paths on existing prod).

-- ── Department-configurable unit aliases ────────────────────────────────────
-- Real CAD emits BOTH "Engine 1" and "E1" for the same rig — sometimes in the
-- same department. Auto-expansion handles the unambiguous cases; this column is
-- how a human resolves the ones that aren't (e.g. a department with a Brush 14
-- AND a Battalion 14 can say which one "B14" means). A human mapping always wins
-- over an inferred one.
ALTER TABLE apparatus
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';

-- ── The join table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cad_alert_units (
  id             SERIAL PRIMARY KEY,
  department_id  INTEGER NOT NULL REFERENCES departments(id),
  station_id     INTEGER,
  cad_alert_id   INTEGER NOT NULL REFERENCES cad_alerts(id) ON DELETE CASCADE,

  -- What CAD actually said. NEVER normalized away — this is the provenance token
  -- and the only record of a mutual-aid rig that isn't in our fleet.
  unit_raw       TEXT NOT NULL,
  -- Upper-cased/whitespace-collapsed form of unit_raw, for exact (never LIKE) match.
  unit_norm      TEXT NOT NULL,
  -- Resolved to our fleet when we are CERTAIN. NULL is a legitimate, meaningful
  -- value: either mutual aid (not our rig) or ambiguous (see below).
  apparatus_id   INTEGER REFERENCES apparatus(id) ON DELETE SET NULL,
  -- TRUE when the token could denote more than one rig (e.g. "B14" → Brush 14 or
  -- Battalion 14). We refuse to guess: mis-assigning a run to the wrong apparatus
  -- is a legal-record error. Surfaced in the UI for a human to map via aliases.
  ambiguous      BOOLEAN NOT NULL DEFAULT FALSE,
  seq            INTEGER,                       -- order listed in the dispatch

  -- Per-unit timeline. Populated by HUMAN status changes (radio doctrine — never
  -- inferred, no geofence/AVL/AI). Nullable: a unit cancelled en route never
  -- arrives, and that gap is data, not an error to be filled in.
  dispatched_at  TIMESTAMPTZ,
  enroute_at     TIMESTAMPTZ,
  arrived_at     TIMESTAMPTZ,
  cleared_at     TIMESTAMPTZ,

  source         TEXT NOT NULL DEFAULT 'cad',   -- 'cad' | 'manual'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per rig per call. This is the run-count integrity constraint: a CAD that
-- lists "Engine 1, E1" must not double-count Engine 1. Partial, because NULL
-- apparatus_id (mutual aid) can legitimately repeat across different raw tokens.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cad_alert_units_apparatus
  ON cad_alert_units (cad_alert_id, apparatus_id)
  WHERE apparatus_id IS NOT NULL;

-- And the same token must never appear twice on one call.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cad_alert_units_token
  ON cad_alert_units (cad_alert_id, unit_norm);

-- "Every call Engine 1 ran, newest first" — the primary archive query.
CREATE INDEX IF NOT EXISTS idx_cad_alert_units_apparatus
  ON cad_alert_units (department_id, apparatus_id, dispatched_at DESC);
-- Same, for unresolved/mutual-aid units searched by text.
CREATE INDEX IF NOT EXISTS idx_cad_alert_units_norm
  ON cad_alert_units (department_id, unit_norm, dispatched_at DESC);
CREATE INDEX IF NOT EXISTS idx_cad_alert_units_alert
  ON cad_alert_units (cad_alert_id);

-- Keyset pagination over the archive: (dispatched_at DESC, id DESC). An archive is
-- append-only and unbounded; OFFSET degrades and can skip/duplicate rows when a new
-- call lands mid-scroll.
CREATE INDEX IF NOT EXISTS idx_cad_alerts_dept_dispatched
  ON cad_alerts (department_id, dispatched_at DESC, id DESC);

-- ── RLS (CLAUDE.md: every tenant table with department_id is RLS-on) ────────
-- Policy shape copied verbatim from cad_alerts' dept_isolation — same GUC, same
-- semantics. A buggy app-layer filter must not be able to leak another department's
-- run history.
ALTER TABLE cad_alert_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON cad_alert_units;
CREATE POLICY dept_isolation ON cad_alert_units
  FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);

GRANT SELECT, INSERT, UPDATE, DELETE ON cad_alert_units TO of_app;
GRANT USAGE, SELECT ON SEQUENCE cad_alert_units_id_seq TO of_app;
