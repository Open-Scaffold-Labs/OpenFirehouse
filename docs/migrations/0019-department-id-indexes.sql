-- 0019-department-id-indexes.sql (P7 perf pass — non-destructive)
-- Every tenant table is now filtered by `department_id` on every read — both by
-- the app-layer scope AND the RLS `dept_isolation` policy (USING department_id =
-- current_setting('app.department_id')). A leading index on `department_id` lets
-- both the query planner and the RLS check do an index scan instead of a seq scan
-- once a table holds more than one department's rows. The 2026-06-10 pass added
-- composite indexes on the four hottest paths (cad_alerts, incidents,
-- unit_status_history, members); this completes the coverage for every remaining
-- OF tenant table that had a `department_id` column but no leading index on it.
--
-- Safe: additive + idempotent (CREATE INDEX IF NOT EXISTS); on the current
-- near-empty prod the build is instant. Excludes FireHazmat's `fs_hazmat_*`
-- tables (separate domain). db.js mirrors this as a self-healing loop so fresh
-- installs AND any future tenant table are covered automatically.
-- Composite/covering-index tuning per hot query pattern is future perf work.

CREATE INDEX IF NOT EXISTS idx_active_boards_department ON public.active_boards(department_id);
CREATE INDEX IF NOT EXISTS idx_active_resources_department ON public.active_resources(department_id);
CREATE INDEX IF NOT EXISTS idx_activity_entries_department ON public.activity_entries(department_id);
CREATE INDEX IF NOT EXISTS idx_after_action_reports_department ON public.after_action_reports(department_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_department ON public.ai_usage(department_id);
CREATE INDEX IF NOT EXISTS idx_apparatus_assignments_department ON public.apparatus_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_apparatus_oos_department ON public.apparatus_oos(department_id);
CREATE INDEX IF NOT EXISTS idx_apparatus_positions_department ON public.apparatus_positions(department_id);
CREATE INDEX IF NOT EXISTS idx_assets_department ON public.assets(department_id);
CREATE INDEX IF NOT EXISTS idx_assistant_alerts_department ON public.assistant_alerts(department_id);
CREATE INDEX IF NOT EXISTS idx_assistant_feedback_department ON public.assistant_feedback(department_id);
CREATE INDEX IF NOT EXISTS idx_assistant_preferences_department ON public.assistant_preferences(department_id);
CREATE INDEX IF NOT EXISTS idx_attachments_department ON public.attachments(department_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_department ON public.audit_log(department_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_department ON public.budget_lines(department_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_department ON public.budget_transactions(department_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_department ON public.bulletins(department_id);
CREATE INDEX IF NOT EXISTS idx_cad_connections_department ON public.cad_connections(department_id);
CREATE INDEX IF NOT EXISTS idx_cadets_department ON public.cadets(department_id);
CREATE INDEX IF NOT EXISTS idx_calendar_subscriptions_department ON public.calendar_subscriptions(department_id);
CREATE INDEX IF NOT EXISTS idx_checklist_completions_department ON public.checklist_completions(department_id);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_department ON public.checklist_templates(department_id);
CREATE INDEX IF NOT EXISTS idx_community_events_department ON public.community_events(department_id);
CREATE INDEX IF NOT EXISTS idx_correspondence_department ON public.correspondence(department_id);
CREATE INDEX IF NOT EXISTS idx_courses_department ON public.courses(department_id);
CREATE INDEX IF NOT EXISTS idx_coverage_outreach_department ON public.coverage_outreach(department_id);
CREATE INDEX IF NOT EXISTS idx_crr_programs_department ON public.crr_programs(department_id);
CREATE INDEX IF NOT EXISTS idx_crr_visits_department ON public.crr_visits(department_id);
CREATE INDEX IF NOT EXISTS idx_cylinders_department ON public.cylinders(department_id);
CREATE INDEX IF NOT EXISTS idx_daily_staffing_department ON public.daily_staffing(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_documents_department ON public.dept_documents(department_id);
CREATE INDEX IF NOT EXISTS idx_donations_department ON public.donations(department_id);
CREATE INDEX IF NOT EXISTS idx_drills_department ON public.drills(department_id);
CREATE INDEX IF NOT EXISTS idx_equipment_checkout_department ON public.equipment_checkout(department_id);
CREATE INDEX IF NOT EXISTS idx_events_department ON public.events(department_id);
CREATE INDEX IF NOT EXISTS idx_exam_assignments_department ON public.exam_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_department ON public.exam_submissions(department_id);
CREATE INDEX IF NOT EXISTS idx_exams_department ON public.exams(department_id);
CREATE INDEX IF NOT EXISTS idx_fi_inspections_department ON public.fi_inspections(department_id);
CREATE INDEX IF NOT EXISTS idx_fi_permits_department ON public.fi_permits(department_id);
CREATE INDEX IF NOT EXISTS idx_fi_properties_department ON public.fi_properties(department_id);
CREATE INDEX IF NOT EXISTS idx_fill_stations_department ON public.fill_stations(department_id);
CREATE INDEX IF NOT EXISTS idx_fto_evaluations_department ON public.fto_evaluations(department_id);
CREATE INDEX IF NOT EXISTS idx_fto_observations_department ON public.fto_observations(department_id);
CREATE INDEX IF NOT EXISTS idx_fundraising_campaigns_department ON public.fundraising_campaigns(department_id);
CREATE INDEX IF NOT EXISTS idx_grants_department ON public.grants(department_id);
CREATE INDEX IF NOT EXISTS idx_grievances_department ON public.grievances(department_id);
CREATE INDEX IF NOT EXISTS idx_hydrants_department ON public.hydrants(department_id);
CREATE INDEX IF NOT EXISTS idx_incident_costs_department ON public.incident_costs(department_id);
CREATE INDEX IF NOT EXISTS idx_incident_responses_department ON public.incident_responses(department_id);
CREATE INDEX IF NOT EXISTS idx_investigations_department ON public.investigations(department_id);
CREATE INDEX IF NOT EXISTS idx_knox_access_log_department ON public.knox_access_log(department_id);
CREATE INDEX IF NOT EXISTS idx_knox_boxes_department ON public.knox_boxes(department_id);
CREATE INDEX IF NOT EXISTS idx_knox_inspections_department ON public.knox_inspections(department_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_department ON public.leave_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_department ON public.maintenance(department_id);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_department ON public.meeting_minutes(department_id);
CREATE INDEX IF NOT EXISTS idx_member_availability_department ON public.member_availability(department_id);
CREATE INDEX IF NOT EXISTS idx_member_qualifications_department ON public.member_qualifications(department_id);
CREATE INDEX IF NOT EXISTS idx_messages_department ON public.messages(department_id);
CREATE INDEX IF NOT EXISTS idx_module_completions_department ON public.module_completions(department_id);
CREATE INDEX IF NOT EXISTS idx_mutual_aid_department ON public.mutual_aid(department_id);
CREATE INDEX IF NOT EXISTS idx_mutual_aid_agreements_department ON public.mutual_aid_agreements(department_id);
CREATE INDEX IF NOT EXISTS idx_nfirs_reports_department ON public.nfirs_reports(department_id);
CREATE INDEX IF NOT EXISTS idx_ng911_calls_department ON public.ng911_calls(department_id);
CREATE INDEX IF NOT EXISTS idx_of_member_invites_department ON public.of_member_invites(department_id);
CREATE INDEX IF NOT EXISTS idx_ot_records_department ON public.ot_records(department_id);
CREATE INDEX IF NOT EXISTS idx_pay_entries_department ON public.pay_entries(department_id);
CREATE INDEX IF NOT EXISTS idx_personnel_actions_department ON public.personnel_actions(department_id);
CREATE INDEX IF NOT EXISTS idx_policy_acknowledgments_department ON public.policy_acknowledgments(department_id);
CREATE INDEX IF NOT EXISTS idx_pre_plans_department ON public.pre_plans(department_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_department ON public.push_subscriptions(department_id);
CREATE INDEX IF NOT EXISTS idx_radio_config_department ON public.radio_config(department_id);
CREATE INDEX IF NOT EXISTS idx_radio_log_department ON public.radio_log(department_id);
CREATE INDEX IF NOT EXISTS idx_recall_events_department ON public.recall_events(department_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_department ON public.recruitment(department_id);
CREATE INDEX IF NOT EXISTS idx_run_lists_department ON public.run_lists(department_id);
CREATE INDEX IF NOT EXISTS idx_scenario_completions_department ON public.scenario_completions(department_id);
CREATE INDEX IF NOT EXISTS idx_shift_patterns_department ON public.shift_patterns(department_id);
CREATE INDEX IF NOT EXISTS idx_shift_swaps_department ON public.shift_swaps(department_id);
CREATE INDEX IF NOT EXISTS idx_shift_trades_department ON public.shift_trades(department_id);
CREATE INDEX IF NOT EXISTS idx_shifts_department ON public.shifts(department_id);
CREATE INDEX IF NOT EXISTS idx_sogs_department ON public.sogs(department_id);
CREATE INDEX IF NOT EXISTS idx_station_log_department ON public.station_log(department_id);
CREATE INDEX IF NOT EXISTS idx_stations_department ON public.stations(department_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_department ON public.timesheets(department_id);
CREATE INDEX IF NOT EXISTS idx_training_department ON public.training(department_id);
CREATE INDEX IF NOT EXISTS idx_training_course_completions_department ON public.training_course_completions(department_id);
CREATE INDEX IF NOT EXISTS idx_training_courses_department ON public.training_courses(department_id);
CREATE INDEX IF NOT EXISTS idx_training_plans_department ON public.training_plans(department_id);
CREATE INDEX IF NOT EXISTS idx_unit_statuses_department ON public.unit_statuses(department_id);
CREATE INDEX IF NOT EXISTS idx_vacancy_fill_department ON public.vacancy_fill(department_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_hours_department ON public.volunteer_hours(department_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_department ON public.webhook_deliveries(department_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_department ON public.webhook_subscriptions(department_id);
CREATE INDEX IF NOT EXISTS idx_wellness_department ON public.wellness(department_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_department ON public.workflow_tasks(department_id);
