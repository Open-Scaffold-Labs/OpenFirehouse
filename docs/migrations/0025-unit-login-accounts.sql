-- 0025 — Unit login accounts (apparatus-authenticated in-cab sessions)
--
-- Adds the "unit login": a dedicated account, role='unit', bound to one
-- apparatus. It rides the EXISTING users/auth/tenancy rails (a unit account is
-- just a users row), so member/officer auth is UNCHANGED. A unit session is
-- operational + rig-scoped (dispatch/size-up, map, GPS reporting, unit status,
-- apparatus/equipment/inventory/inspection/maintenance/fuel checks, pre-plans,
-- hydrants, hazmat, field tools) and FAILS CLOSED on records/admin via the
-- existing role gates (requireOfficer/requireRole reject role='unit').
--
-- Why a real account (not a new principal): requireAuth resolves a real users
-- row, real station, real department, and gives the unit a real req.user.id so
-- actor logging (unit-status changes) attributes to the rig terminal. The web
-- client and OpenFirehouse Mobile both authenticate the SAME way -> in sync.
--
-- `users.role` has no CHECK constraint, so 'unit' needs no constraint change.
-- This migration only adds the apparatus binding.

ALTER TABLE users ADD COLUMN IF NOT EXISTS apparatus_id INTEGER REFERENCES apparatus(id) ON DELETE SET NULL;

-- At most one unit login per apparatus (NULL apparatus_id = ordinary member/officer).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apparatus_unit
  ON users (apparatus_id)
  WHERE apparatus_id IS NOT NULL;

COMMENT ON COLUMN users.apparatus_id IS
  'Non-NULL only for unit-login accounts (role=unit): the apparatus this in-cab session is bound to. Drives GPS reporting + the operational/rig-scoped nav. Member/officer accounts leave this NULL.';
