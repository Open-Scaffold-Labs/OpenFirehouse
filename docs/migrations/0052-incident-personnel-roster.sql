-- 0052-incident-personnel-roster.sql  (persist the Command Board's on-scene roster — 2026-07-13)
--
-- STATUS: NOT APPLIED to any database. Written 2026-07-13, held pending Matt's decision on
-- whether to complete the Command Board durability work. NOTE the ledger has since gone
-- 0051 → 0053 → 0054 (a parallel session took those numbers), so this lands OUT OF ORDER
-- if applied. That is fine but must be deliberate — do not apply it by accident.
--
-- 0048 gave the PAR a spine ("an accountability record that vanishes on reload is worse
-- than none") — but it persisted only the COUNTDOWN and the completed PAR snapshots. The
-- roster the PAR is run AGAINST — incident.personnel: who is on scene, their assignment,
-- their status, when they were last accounted for — still lives entirely in one browser
-- tab's React state. `PUT /api/active-board` sends `personnel_count`, an INTEGER. Nothing
-- else. So a tab reload / crash / laptop sleep mid-incident LOSES the IC's accountability
-- roster, and it has to be re-keyed by hand during a working fire.
--
--   incident_personnel — the LIVE working roster for the department's current active board.
--     Mutable by design (the IC adds, re-statuses, and removes people all incident long) —
--     this is working state, NOT the evidence. The append-only accountability EVIDENCE
--     remains `par_checks` (0048), which snapshots names + accounted-state at each completed
--     PAR, and `incidents.personnel` at incident save.
--
-- Cleared with the board (DELETE /api/active-board), matching the React state it replaces.
-- Keyed on station_id to sit alongside `active_boards` (whose PK is station_id) and carries
-- department_id for RLS — mirroring `par_checks` exactly.
--
-- ⚠️ KNOWN INCOMPLETE (2026-07-13). This is HALF the fix, and the smaller half:
--   1. CommandBoard.jsx NEVER READS /api/active-board — it only ever PUTs. So a reload does
--      not just lose the roster, it loses the WHOLE BOARD (units, ICS roles, comms log,
--      rehab log, timeline) and drops the IC back to the "Set up a live incident" screen.
--      Persisting the roster alone gives you rows nothing renders.
--   2. Market research (2026-07-13) established that the incident TIMELINE is a legal record
--      — competitors export it as the NFIRS narrative, and one freezes the whole board the
--      instant a MAYDAY is declared. So durability needs an APPEND-ONLY `board_events` table
--      alongside this mutable roster. That table does not exist yet.
-- Completing board durability means: this + board_events + board rehydration on mount.

CREATE TABLE IF NOT EXISTS public.incident_personnel (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  station_id    INTEGER,
  name          TEXT NOT NULL,
  assignment    TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'On Scene',
  last_par_at   TIMESTAMPTZ,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incident_personnel_dept ON public.incident_personnel (department_id, added_at);

ALTER TABLE public.incident_personnel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.incident_personnel;
CREATE POLICY dept_isolation ON public.incident_personnel FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);

-- Working state, so of_app KEEPS update/delete here (unlike the append-only par_checks in
-- 0048). Supabase default privileges auto-grant to anon / authenticated / service_role —
-- revoke those explicitly (0046 lesson).
REVOKE ALL ON public.incident_personnel FROM anon, authenticated, service_role, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incident_personnel TO of_app;
GRANT USAGE, SELECT ON SEQUENCE public.incident_personnel_id_seq TO of_app;
REVOKE ALL ON SEQUENCE public.incident_personnel_id_seq FROM anon, authenticated, service_role, PUBLIC;
