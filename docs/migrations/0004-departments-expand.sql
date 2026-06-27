-- ============================================================================
-- 0004-departments-expand.sql
-- OpenFirehouse — Multi-tenant EXPAND phase: departments + department_id
-- ============================================================================
--
-- Phase 1 of the Multi-Tenant Department gameplan. §9 decisions resolved by
-- Dale 2026-06-12 (see docs/MULTI-TENANT-PHASE1-NOTES.md). Apply by hand via
-- server/scripts/migrate.js with the prod DATABASE_URL — NEVER on a Vercel
-- deploy. Behavior-neutral (EXPAND only). Read docs/RLS-AND-MIGRATIONS-PLAN.md.
-- NOTE: the migration runner wraps each file in its own transaction, so this
-- file must NOT contain BEGIN/COMMIT.
--
-- STRATEGY: Expand -> Migrate -> Contract (parallel-change). This is EXPAND:
-- it ADDS the department tenant key ALONGSIDE station_id and backfills it, so
-- NOTHING changes behavior. Code still reads station_id until Phase 3 flips it;
-- station_id is demoted to a physical-house tag only in Contract (Phase 7).
--
-- IDEMPOTENT: every statement is IF NOT EXISTS / guarded so re-running is safe.
-- Applied by hand via server/scripts/migrate.js (NEVER on a Vercel deploy), AND
-- mirrored into db.js initDb() so FRESH installs match (per CLAUDE.md).
--
-- OPEN DECISIONS THIS DRAFT ENCODES (confirm before applying — see the §9 memo):
--   * department_id is added to 97 tables, NOT to `users`. users is the SHARED
--     platform identity table (OpenRestaurant etc. also use it); department
--     membership lives in the NEW of_user_departments. This is the single most
--     important structural decision here.
--   * One department per station today (1 station = 1 dept), so backfill maps
--     department_id := station_id. If/when a department owns multiple stations,
--     this 1:1 backfill is replaced by a stations.department_id lookup.
--   * Landmine fixes (member number, apparatus designation) rescope uniqueness
--     to per-department. Confirm no real data violates the new constraints
--     (test data only today, so safe now).
-- ============================================================================

-- ── 1. departments: the TENANT (customer / billing unit) ───────────────────
-- Department-level columns currently misfiled on `stations` move here in
-- Contract (Phase 7). For now departments holds the canonical dept identity;
-- stations keeps its copies until code stops reading them.
CREATE TABLE IF NOT EXISTS departments (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  fdid          TEXT DEFAULT '',
  dept_type     TEXT DEFAULT '',
  plan_tier     TEXT DEFAULT '',          -- METRO / CAREER_MID / CAREER_SMALL (see §9 Q2)
  flsa_work_period      INTEGER,
  flsa_ot_threshold     NUMERIC,
  flsa_period_start     TEXT,
  ai_daily_token_budget INTEGER,
  tv_pin                TEXT,
  stripe_customer_id    TEXT DEFAULT '',
  stripe_subscription_id TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. of_user_departments: OF-owned membership (does NOT touch shared users) ─
-- Resolves a login to the department(s) it belongs to + role there. Auth (Phase
-- 2) reads THIS instead of users.station_id. UNIQUE(user_id, department_id)
-- allows a future multi-department user (regional chief / mutual aid, §9 Q3).
CREATE TABLE IF NOT EXISTS of_user_departments (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  role          TEXT DEFAULT 'member',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, department_id)
);
CREATE INDEX IF NOT EXISTS idx_of_user_departments_user ON of_user_departments(user_id);
CREATE INDEX IF NOT EXISTS idx_of_user_departments_dept ON of_user_departments(department_id);

-- ── 3. stations gets a department_id (which department owns this house) ──────
ALTER TABLE stations ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id);

-- ── 4. Backfill: one department per existing station (1 station = 1 dept) ────
-- Create a department row mirroring each station, then point the station at it.
INSERT INTO departments (id, name, fdid, dept_type, flsa_work_period, flsa_ot_threshold,
                         flsa_period_start, ai_daily_token_budget, tv_pin)
SELECT s.id, s.name, COALESCE(s.fdid,''), COALESCE(s.dept_type,''),
       s.flsa_work_period, s.flsa_ot_threshold, s.flsa_period_start,
       s.ai_daily_token_budget, s.tv_pin
FROM stations s
ON CONFLICT (id) DO NOTHING;
-- Keep the departments serial ahead of the ids we just forced in.
SELECT setval(pg_get_serial_sequence('departments','id'),
              GREATEST((SELECT MAX(id) FROM departments), 1));
UPDATE stations SET department_id = id WHERE department_id IS NULL;

-- Map every existing user to the department matching their current station.
INSERT INTO of_user_departments (user_id, department_id, role)
SELECT u.id, u.station_id, COALESCE(u.role,'member')
FROM users u
WHERE u.station_id IS NOT NULL
ON CONFLICT (user_id, department_id) DO NOTHING;

-- ── 5. Add nullable department_id to every tenant table (EXPAND) ────────────
-- Added alongside station_id; backfilled from it. NOT added to `users`.
ALTER TABLE active_boards ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE active_resources ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE after_action_reports ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE apparatus ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE apparatus_assignments ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE apparatus_oos ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE apparatus_positions ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE assistant_alerts ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE assistant_feedback ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE assistant_preferences ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE budget_transactions ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE bulletins ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE cad_alerts ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE cad_connections ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE cadets ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE calendar_subscriptions ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE checklist_completions ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE community_events ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE coverage_outreach ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE crr_programs ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE crr_visits ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE cylinders ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE daily_staffing ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE dept_documents ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE drills ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE equipment_checkout ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE exam_assignments ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE exposure_records ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE fi_inspections ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE fi_properties ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE fill_stations ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE fs_hazmat_incidents ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE fundraising_campaigns ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE grants ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE hydrants ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE incident_costs ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE incident_responses ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE investigations ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE knox_access_log ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE knox_boxes ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE knox_inspections ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE meeting_minutes ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE member_availability ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE member_qualifications ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE members ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE module_completions ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE mutual_aid ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE mutual_aid_agreements ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE ng911_calls ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE ot_records ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE pay_entries ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE personnel_actions ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE policy_acknowledgments ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE pre_plans ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE radio_config ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE radio_log ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE recall_events ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE run_lists ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE scenario_completions ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE shift_swaps ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE shift_trades ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE sogs ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE station_log ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE training ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE training_course_completions ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE training_courses ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE unit_status_history ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE unit_statuses ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE vacancy_fill ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE volunteer_hours ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE wellness ADD COLUMN IF NOT EXISTS department_id INTEGER;
ALTER TABLE workflow_tasks ADD COLUMN IF NOT EXISTS department_id INTEGER;

-- Backfill department_id := station_id (valid while 1 station = 1 department).
UPDATE active_boards SET department_id = station_id WHERE department_id IS NULL;
UPDATE active_resources SET department_id = station_id WHERE department_id IS NULL;
UPDATE after_action_reports SET department_id = station_id WHERE department_id IS NULL;
UPDATE ai_usage SET department_id = station_id WHERE department_id IS NULL;
UPDATE apparatus SET department_id = station_id WHERE department_id IS NULL;
UPDATE apparatus_assignments SET department_id = station_id WHERE department_id IS NULL;
UPDATE apparatus_oos SET department_id = station_id WHERE department_id IS NULL;
UPDATE apparatus_positions SET department_id = station_id WHERE department_id IS NULL;
UPDATE assets SET department_id = station_id WHERE department_id IS NULL;
UPDATE assistant_alerts SET department_id = station_id WHERE department_id IS NULL;
UPDATE assistant_feedback SET department_id = station_id WHERE department_id IS NULL;
UPDATE assistant_preferences SET department_id = station_id WHERE department_id IS NULL;
UPDATE attachments SET department_id = station_id WHERE department_id IS NULL;
UPDATE audit_log SET department_id = station_id WHERE department_id IS NULL;
UPDATE budget_lines SET department_id = station_id WHERE department_id IS NULL;
UPDATE budget_transactions SET department_id = station_id WHERE department_id IS NULL;
UPDATE bulletins SET department_id = station_id WHERE department_id IS NULL;
UPDATE cad_alerts SET department_id = station_id WHERE department_id IS NULL;
UPDATE cad_connections SET department_id = station_id WHERE department_id IS NULL;
UPDATE cadets SET department_id = station_id WHERE department_id IS NULL;
UPDATE calendar_subscriptions SET department_id = station_id WHERE department_id IS NULL;
UPDATE checklist_completions SET department_id = station_id WHERE department_id IS NULL;
UPDATE checklist_templates SET department_id = station_id WHERE department_id IS NULL;
UPDATE community_events SET department_id = station_id WHERE department_id IS NULL;
UPDATE correspondence SET department_id = station_id WHERE department_id IS NULL;
UPDATE courses SET department_id = station_id WHERE department_id IS NULL;
UPDATE coverage_outreach SET department_id = station_id WHERE department_id IS NULL;
UPDATE crr_programs SET department_id = station_id WHERE department_id IS NULL;
UPDATE crr_visits SET department_id = station_id WHERE department_id IS NULL;
UPDATE cylinders SET department_id = station_id WHERE department_id IS NULL;
UPDATE daily_staffing SET department_id = station_id WHERE department_id IS NULL;
UPDATE dept_documents SET department_id = station_id WHERE department_id IS NULL;
UPDATE donations SET department_id = station_id WHERE department_id IS NULL;
UPDATE drills SET department_id = station_id WHERE department_id IS NULL;
UPDATE equipment_checkout SET department_id = station_id WHERE department_id IS NULL;
UPDATE events SET department_id = station_id WHERE department_id IS NULL;
UPDATE exam_assignments SET department_id = station_id WHERE department_id IS NULL;
UPDATE exam_submissions SET department_id = station_id WHERE department_id IS NULL;
UPDATE exams SET department_id = station_id WHERE department_id IS NULL;
UPDATE exposure_records SET department_id = station_id WHERE department_id IS NULL;
UPDATE fi_inspections SET department_id = station_id WHERE department_id IS NULL;
UPDATE fi_permits SET department_id = station_id WHERE department_id IS NULL;
UPDATE fi_properties SET department_id = station_id WHERE department_id IS NULL;
UPDATE fill_stations SET department_id = station_id WHERE department_id IS NULL;
UPDATE fs_hazmat_incidents SET department_id = station_id WHERE department_id IS NULL;
UPDATE fundraising_campaigns SET department_id = station_id WHERE department_id IS NULL;
UPDATE grants SET department_id = station_id WHERE department_id IS NULL;
UPDATE grievances SET department_id = station_id WHERE department_id IS NULL;
UPDATE hydrants SET department_id = station_id WHERE department_id IS NULL;
UPDATE incident_costs SET department_id = station_id WHERE department_id IS NULL;
UPDATE incident_responses SET department_id = station_id WHERE department_id IS NULL;
UPDATE incidents SET department_id = station_id WHERE department_id IS NULL;
UPDATE investigations SET department_id = station_id WHERE department_id IS NULL;
UPDATE knox_access_log SET department_id = station_id WHERE department_id IS NULL;
UPDATE knox_boxes SET department_id = station_id WHERE department_id IS NULL;
UPDATE knox_inspections SET department_id = station_id WHERE department_id IS NULL;
UPDATE leave_requests SET department_id = station_id WHERE department_id IS NULL;
UPDATE maintenance SET department_id = station_id WHERE department_id IS NULL;
UPDATE meeting_minutes SET department_id = station_id WHERE department_id IS NULL;
UPDATE member_availability SET department_id = station_id WHERE department_id IS NULL;
UPDATE member_qualifications SET department_id = station_id WHERE department_id IS NULL;
UPDATE members SET department_id = station_id WHERE department_id IS NULL;
UPDATE messages SET department_id = station_id WHERE department_id IS NULL;
UPDATE module_completions SET department_id = station_id WHERE department_id IS NULL;
UPDATE mutual_aid SET department_id = station_id WHERE department_id IS NULL;
UPDATE mutual_aid_agreements SET department_id = station_id WHERE department_id IS NULL;
UPDATE nfirs_reports SET department_id = station_id WHERE department_id IS NULL;
UPDATE ng911_calls SET department_id = station_id WHERE department_id IS NULL;
UPDATE ot_records SET department_id = station_id WHERE department_id IS NULL;
UPDATE pay_entries SET department_id = station_id WHERE department_id IS NULL;
UPDATE personnel_actions SET department_id = station_id WHERE department_id IS NULL;
UPDATE policy_acknowledgments SET department_id = station_id WHERE department_id IS NULL;
UPDATE pre_plans SET department_id = station_id WHERE department_id IS NULL;
UPDATE push_subscriptions SET department_id = station_id WHERE department_id IS NULL;
UPDATE radio_config SET department_id = station_id WHERE department_id IS NULL;
UPDATE radio_log SET department_id = station_id WHERE department_id IS NULL;
UPDATE recall_events SET department_id = station_id WHERE department_id IS NULL;
UPDATE recruitment SET department_id = station_id WHERE department_id IS NULL;
UPDATE run_lists SET department_id = station_id WHERE department_id IS NULL;
UPDATE scenario_completions SET department_id = station_id WHERE department_id IS NULL;
UPDATE shift_patterns SET department_id = station_id WHERE department_id IS NULL;
UPDATE shift_swaps SET department_id = station_id WHERE department_id IS NULL;
UPDATE shift_trades SET department_id = station_id WHERE department_id IS NULL;
UPDATE shifts SET department_id = station_id WHERE department_id IS NULL;
UPDATE sogs SET department_id = station_id WHERE department_id IS NULL;
UPDATE station_log SET department_id = station_id WHERE department_id IS NULL;
UPDATE timesheets SET department_id = station_id WHERE department_id IS NULL;
UPDATE training SET department_id = station_id WHERE department_id IS NULL;
UPDATE training_course_completions SET department_id = station_id WHERE department_id IS NULL;
UPDATE training_courses SET department_id = station_id WHERE department_id IS NULL;
UPDATE training_plans SET department_id = station_id WHERE department_id IS NULL;
UPDATE unit_status_history SET department_id = station_id WHERE department_id IS NULL;
UPDATE unit_statuses SET department_id = station_id WHERE department_id IS NULL;
UPDATE vacancy_fill SET department_id = station_id WHERE department_id IS NULL;
UPDATE volunteer_hours SET department_id = station_id WHERE department_id IS NULL;
UPDATE wellness SET department_id = station_id WHERE department_id IS NULL;
UPDATE workflow_tasks SET department_id = station_id WHERE department_id IS NULL;

-- Index department_id on the hot read paths (mirror the station_id indexes).
CREATE INDEX IF NOT EXISTS idx_incidents_department ON incidents(department_id);
CREATE INDEX IF NOT EXISTS idx_members_department ON members(department_id);
CREATE INDEX IF NOT EXISTS idx_cad_alerts_department ON cad_alerts(department_id);
CREATE INDEX IF NOT EXISTS idx_unit_status_history_department ON unit_status_history(department_id);
CREATE INDEX IF NOT EXISTS idx_apparatus_department ON apparatus(department_id);
CREATE INDEX IF NOT EXISTS idx_exposure_records_department ON exposure_records(department_id);

-- ── 6. Landmine fixes (gameplan §6) — rescope uniqueness to per-department ───
-- memberNumber was GLOBALLY unique; two departments must each be able to run
-- M-001. Same for apparatus.designation ("Engine 1" in two departments).
-- Mirrors the incidentNumber per-station partial-unique fix already shipped.
ALTER TABLE members  DROP CONSTRAINT IF EXISTS "members_memberNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_dept_number
  ON members (department_id, "memberNumber");
ALTER TABLE apparatus DROP CONSTRAINT IF EXISTS apparatus_designation_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_apparatus_dept_designation
  ON apparatus (department_id, designation);

-- NOTE (code, not SQL): routes/members.js nextMemberNumber() must take a
-- departmentId and scope its MAX() query to it (currently global). Apply with
-- the Phase 3 query migration; called out here so it isn't forgotten.

-- ── 7. fs_hazmat_incident_audit (§9 Q5 — Dale, 2026-06-12) ───────────────────
-- The audit table has NO station_id (it FKs to its parent incident), so it is
-- NOT in the station_id-derived list above. Decision: it gets its own
-- department_id for the same isolation guarantee, backfilled from the parent
-- fs_hazmat_incidents row. (Guarded: the table is created by ensureHazmatTables
-- in index.js, not initDb, so it may not exist on a bare schema — wrap so this
-- migration still succeeds if so.)
DO $$ BEGIN
  IF to_regclass('public.fs_hazmat_incident_audit') IS NOT NULL THEN
    ALTER TABLE fs_hazmat_incident_audit ADD COLUMN IF NOT EXISTS department_id INTEGER;
    UPDATE fs_hazmat_incident_audit a
      SET department_id = i.department_id
      FROM fs_hazmat_incidents i
      WHERE a.incident_id = i.id AND a.department_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_hazaudit_department ON fs_hazmat_incident_audit(department_id);
  END IF;
END $$;

-- ── BACKOUT ─────────────────────────────────────────────────────────────────
-- All test data today, so backout = revert code + drop the additions:
--   DROP INDEX IF EXISTS idx_members_dept_number, idx_apparatus_dept_designation;
--   ALTER TABLE members ADD CONSTRAINT "members_memberNumber_key" UNIQUE ("memberNumber");
--   ALTER TABLE apparatus ADD CONSTRAINT apparatus_designation_key UNIQUE (designation);
--   ALTER TABLE <each table> DROP COLUMN IF EXISTS department_id;
--   ALTER TABLE stations DROP COLUMN IF EXISTS department_id;
--   DROP TABLE IF EXISTS of_user_departments; DROP TABLE IF EXISTS departments;
