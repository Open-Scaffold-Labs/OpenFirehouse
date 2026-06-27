-- 0003-rls-enable-remaining-of-tables.sql
--
-- Enable ROW LEVEL SECURITY (deny-all: RLS on, NO policies, NO FORCE) on the
-- remaining 91 OpenFirehouse tables. Closes the public-anon-key read of private
-- data over Supabase PostgREST.
--
-- WHY THIS IS SAFE (verified 2026-06-12):
--   * All 91 tables are owned by the `postgres` role; the Express app connects
--     as `postgres` (DATABASE_URL). Postgres table OWNERS bypass RLS unless
--     FORCE ROW LEVEL SECURITY is set (it is NOT here) — so the app sees no
--     change. Proven by batch-2: enabling RLS on cad_connections/radio_config
--     did not affect the app that reads them.
--   * No policies = deny-all to the non-owner API roles (anon / authenticated)
--     reached via PostgREST. That is the whole point.
--   * The client never reads these tables directly via supabase-js
--     (no postgres_changes, no .from()); it uses Realtime Broadcast + the authed
--     Express API. So nothing client-side breaks.
--
-- BEFORE state (verified): the committed anon key could read `members` (names),
-- `incidents`, and `users` INCLUDING bcrypt `passwordHash` + usernames + roles.
--
-- SCOPE: the 93 OpenFirehouse db.js tables MINUS cad_connections + radio_config
-- (already enabled in 0002/batch-2). EXCLUDES all fs_hazmat_* tables: the 4 ERG
-- reference tables are intentionally public read; fs_hazmat_incidents +
-- fs_hazmat_incident_audit (private, station-scoped) are a separate follow-up
-- (shared fs_ prefix — coordinate, then enable).
--
-- Idempotent (ENABLE RLS on an already-enabled table is a no-op).
-- ROLLBACK: replace ENABLE with `DISABLE ROW LEVEL SECURITY` for any/all.

ALTER TABLE active_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE after_action_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE apparatus ENABLE ROW LEVEL SECURITY;
ALTER TABLE apparatus_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE apparatus_oos ENABLE ROW LEVEL SECURITY;
ALTER TABLE apparatus_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletins ENABLE ROW LEVEL SECURITY;
ALTER TABLE cad_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadets ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE correspondence ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage_outreach ENABLE ROW LEVEL SECURITY;
ALTER TABLE crr_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crr_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE cylinders ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_staffing ENABLE ROW LEVEL SECURITY;
ALTER TABLE dept_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_checkout ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exposure_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fi_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE fi_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE fi_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE fill_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fundraising_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievances ENABLE ROW LEVEL SECURITY;
ALTER TABLE hydrants ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutual_aid ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutual_aid_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfirs_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE radio_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE training ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_course_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE wellness ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_tasks ENABLE ROW LEVEL SECURITY;
