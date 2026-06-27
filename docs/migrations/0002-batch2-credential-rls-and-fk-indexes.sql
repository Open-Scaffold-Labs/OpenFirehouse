-- 0002-batch2-credential-rls-and-fk-indexes.sql
--
-- Back-ports the 2026-06-10 "batch-2" prod hardening into the tracked migration
-- system so FRESH installs converge with prod (these were applied to prod by
-- hand on 2026-06-10 and were NOT previously in db.js — reverse drift).
--
-- Fully idempotent: re-running against prod (where these already exist) is a
-- safe no-op. ENABLE ROW LEVEL SECURITY is idempotent in Postgres; every index
-- is IF NOT EXISTS.
--
-- Part A — RLS deny-all on credential tables (closes anon/PostgREST read of the
-- apiKey / api_key columns; app connects as table owner and bypasses RLS, so no
-- app behavior change). No policies = deny-all to non-owner API roles.
ALTER TABLE cad_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE radio_config    ENABLE ROW LEVEL SECURITY;

-- Part B — FK covering indexes flagged by the Supabase performance advisor.
-- Hot path first (live unit-status / dispatch join), then the rest.
CREATE INDEX IF NOT EXISTS idx_unit_statuses_apparatus ON unit_statuses(apparatus_id);
CREATE INDEX IF NOT EXISTS idx_app_assign_apparatus ON apparatus_assignments(apparatus_id);
CREATE INDEX IF NOT EXISTS idx_app_assign_member    ON apparatus_assignments(member_id);
CREATE INDEX IF NOT EXISTS idx_app_assign_position  ON apparatus_assignments(position_id);
CREATE INDEX IF NOT EXISTS idx_app_assign_shift     ON apparatus_assignments(shift_id);
CREATE INDEX IF NOT EXISTS idx_app_assign_station   ON apparatus_assignments(station_id);
CREATE INDEX IF NOT EXISTS idx_app_pos_apparatus    ON apparatus_positions(apparatus_id);
CREATE INDEX IF NOT EXISTS idx_app_pos_station      ON apparatus_positions(station_id);
CREATE INDEX IF NOT EXISTS idx_exposure_incident    ON exposure_records(incident_id);
CREATE INDEX IF NOT EXISTS idx_exposure_member      ON exposure_records(member_id);
CREATE INDEX IF NOT EXISTS idx_exposure_station     ON exposure_records(station_id);
CREATE INDEX IF NOT EXISTS idx_hazinc_created_by    ON fs_hazmat_incidents(created_by);
CREATE INDEX IF NOT EXISTS idx_hazinc_ic_user       ON fs_hazmat_incidents(ic_user_id);
CREATE INDEX IF NOT EXISTS idx_hazinc_station       ON fs_hazmat_incidents(station_id);
CREATE INDEX IF NOT EXISTS idx_hazaudit_changed_by  ON fs_hazmat_incident_audit(changed_by);
CREATE INDEX IF NOT EXISTS idx_grievances_filed_by  ON grievances(filed_by);
CREATE INDEX IF NOT EXISTS idx_inc_costs_station    ON incident_costs(station_id);
