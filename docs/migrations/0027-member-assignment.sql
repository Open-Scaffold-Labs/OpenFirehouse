-- 0027 — Standing member assignment (career + volunteer org structure)
--
-- The backbone for "who an officer oversees." A member's standing crew is set by
-- the chief and stable until changed (NOT per-shift). Designed to serve BOTH
-- department types from one schema (research-backed: staffing model is a MEMBER
-- attribute, not a department mode):
--   • career     → assigned_unit_id + assigned_group populated; the crew is
--                  derivable as (same unit + same group); one officer per crew.
--   • volunteer  → unit/group usually NULL; oversight rolls up to the station /
--                  Training Officer / Chief (centralized). Crews self-assemble.
--
-- The career-vs-volunteer distinction REUSES the existing members.employment_type
-- column ('career' | 'volunteer' | 'part-time' | 'per-diem') — no redundant
-- member_type field. The resolver treats employment_type='career' (with a
-- standing unit+group) as the crew-oversight case; everything else is centralized.
--
-- These are chief-written record fields (members routes are requireOfficer), so a
-- member can never self-assign their own crew.

ALTER TABLE members ADD COLUMN IF NOT EXISTS assigned_unit_id INTEGER REFERENCES apparatus(id) ON DELETE SET NULL;
ALTER TABLE members ADD COLUMN IF NOT EXISTS assigned_group TEXT;

-- Hot path: resolve an officer's crew (same dept + unit + group).
CREATE INDEX IF NOT EXISTS idx_members_crew ON members (department_id, assigned_unit_id, assigned_group);

COMMENT ON COLUMN members.assigned_unit_id IS 'Standing unit/company (apparatus). NULL for volunteers/unassigned. Chief-set.';
COMMENT ON COLUMN members.assigned_group IS 'Standing platoon/group label (e.g. 1-4, A/B/C). NULL for volunteers/unassigned. Chief-set. (unit, group) -> one officer (career).';
