-- OpenFirehouse schema baseline — generated from prod (YOUR_PROJECT_REF) via catalog extraction.
-- Structure only (no data). Roles/grants + the anon lockdown (0031) are applied as a SEPARATE step.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===== SEQUENCES =====
CREATE SEQUENCE IF NOT EXISTS public.active_resources_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.activity_entries_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.after_action_reports_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.ai_usage_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.apparatus_assignments_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.apparatus_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.apparatus_oos_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.apparatus_positions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.assets_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.assistant_alerts_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.assistant_feedback_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.assistant_preferences_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.attachments_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.audit_log_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.budget_lines_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.budget_transactions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.bug_reports_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.bulletins_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.cad_alerts_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.cad_connections_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.cadets_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.calendar_subscriptions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.checklist_completions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.checklist_templates_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.community_events_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.correspondence_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.courses_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.coverage_outreach_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.crr_programs_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.crr_visits_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.cylinders_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.daily_staffing_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.departments_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.dept_documents_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.donations_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.drills_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.equipment_checkout_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.events_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.exam_assignments_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.exam_submissions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.exams_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.expo_push_tokens_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.exposure_records_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.fi_inspections_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.fi_permits_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.fi_properties_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.fill_stations_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.fs_hazmat_guides_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.fs_hazmat_incident_audit_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.fs_hazmat_incidents_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.fs_hazmat_isolation_distances_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.fs_hazmat_materials_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.fs_hazmat_table3_distances_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.fto_evaluations_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.fto_observations_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.fundraising_campaigns_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.grants_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.grievances_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.hydrants_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.incident_costs_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.incident_responses_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.incidents_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.investigations_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.knox_access_log_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.knox_boxes_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.knox_inspections_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.leave_requests_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.maintenance_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.meeting_minutes_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.member_availability_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.member_qualifications_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.members_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.messages_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.module_completions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.mutual_aid_agreements_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.mutual_aid_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.nfirs_reports_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.ng911_calls_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.of_department_join_codes_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.of_member_invites_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.of_user_departments_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.ot_records_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.pay_entries_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.personnel_actions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.policy_acknowledgments_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.pre_plans_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.push_subscriptions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.radio_config_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.radio_log_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.recall_events_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.recall_responses_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.recruitment_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.run_lists_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.scenario_completions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.shift_patterns_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.shift_swaps_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.shift_trades_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.shifts_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.sogs_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.station_log_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.stations_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.timesheets_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.training_course_completions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.training_courses_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.training_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.training_plans_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.unit_locations_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.unit_status_history_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.unit_statuses_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.users_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.vacancy_fill_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.volunteer_hours_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.webhook_deliveries_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.webhook_subscriptions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.wellness_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.workflow_tasks_id_seq;

-- ===== TABLES =====
CREATE TABLE IF NOT EXISTS public.active_boards (
  station_id integer NOT NULL,
  incident_type text,
  address text,
  dispatched_at timestamp with time zone,
  personnel_count integer DEFAULT 0,
  units_count integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  incident_id integer,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.active_resources (
  id integer NOT NULL DEFAULT nextval('active_resources_id_seq'::regclass),
  station_id integer DEFAULT 1,
  incident_id integer,
  resource_type text DEFAULT 'fire'::text,
  agency text DEFAULT ''::text,
  unit_designation text NOT NULL,
  unit_type text DEFAULT ''::text,
  status text DEFAULT 'dispatched'::text,
  latitude double precision,
  longitude double precision,
  speed_mph double precision,
  heading double precision,
  eta_minutes integer,
  crew_count integer DEFAULT 0,
  crew_names text DEFAULT ''::text,
  officer_name text DEFAULT ''::text,
  radio_channel text DEFAULT ''::text,
  contact_phone text DEFAULT ''::text,
  live_share_token text,
  mutual_aid_agreement_id integer,
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.activity_entries (
  id integer NOT NULL DEFAULT nextval('activity_entries_id_seq'::regclass),
  station_id integer DEFAULT 1,
  entry_type text NOT NULL,
  category text DEFAULT ''::text,
  date text NOT NULL,
  shift text DEFAULT ''::text,
  entered_by text DEFAULT ''::text,
  entered_by_id integer,
  apparatus text DEFAULT ''::text,
  result text DEFAULT ''::text,
  subject text DEFAULT ''::text,
  body text DEFAULT ''::text,
  priority text DEFAULT 'normal'::text,
  visitor_name text DEFAULT ''::text,
  purpose text DEFAULT ''::text,
  time_in text DEFAULT ''::text,
  time_out text DEFAULT ''::text,
  gallons double precision,
  fuel_type text DEFAULT ''::text,
  location text DEFAULT ''::text,
  property text DEFAULT ''::text,
  hydrant_id text DEFAULT ''::text,
  event_name text DEFAULT ''::text,
  attendees integer,
  department text DEFAULT ''::text,
  incident_type text DEFAULT ''::text,
  incident_number text DEFAULT ''::text,
  course text DEFAULT ''::text,
  hours double precision,
  instructor text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.after_action_reports (
  id integer NOT NULL DEFAULT nextval('after_action_reports_id_seq'::regclass),
  station_id integer NOT NULL DEFAULT 1,
  incident_id integer,
  incident_date date,
  incident_type text DEFAULT ''::text,
  location text DEFAULT ''::text,
  title text NOT NULL DEFAULT ''::text,
  summary text DEFAULT ''::text,
  strengths jsonb DEFAULT '[]'::jsonb,
  improvements jsonb DEFAULT '[]'::jsonb,
  action_items jsonb DEFAULT '[]'::jsonb,
  lessons_learned text DEFAULT ''::text,
  attendees jsonb DEFAULT '[]'::jsonb,
  conducted_by text DEFAULT ''::text,
  conducted_date date DEFAULT CURRENT_DATE,
  status text DEFAULT 'draft'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id integer NOT NULL DEFAULT nextval('ai_usage_id_seq'::regclass),
  station_id integer NOT NULL,
  used_on date NOT NULL DEFAULT CURRENT_DATE,
  action text DEFAULT ''::text,
  model text DEFAULT ''::text,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  estimated boolean DEFAULT false,
  calls integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.apparatus (
  id integer NOT NULL DEFAULT nextval('apparatus_id_seq'::regclass),
  designation text NOT NULL,
  type text NOT NULL,
  year integer NOT NULL,
  make text DEFAULT ''::text,
  model text DEFAULT ''::text,
  status text DEFAULT 'In Service'::text,
  mileage integer DEFAULT 0,
  "lastService" text DEFAULT ''::text,
  "nextServiceDue" text DEFAULT ''::text,
  "assignedOperator" text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  vin text DEFAULT ''::text,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.apparatus_assignments (
  id integer NOT NULL DEFAULT nextval('apparatus_assignments_id_seq'::regclass),
  shift_id integer NOT NULL,
  apparatus_id integer NOT NULL,
  position_id integer,
  member_id integer NOT NULL,
  station_id integer NOT NULL,
  position_name text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.apparatus_oos (
  id integer NOT NULL DEFAULT nextval('apparatus_oos_id_seq'::regclass),
  station_id integer NOT NULL DEFAULT 1,
  apparatus_id integer NOT NULL,
  reason text NOT NULL DEFAULT ''::text,
  oos_type text DEFAULT 'mechanical'::text,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  estimated_return date,
  impact_level text DEFAULT 'moderate'::text,
  coverage_plan text DEFAULT ''::text,
  reported_by text DEFAULT ''::text,
  status text DEFAULT 'active'::text,
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.apparatus_positions (
  id integer NOT NULL DEFAULT nextval('apparatus_positions_id_seq'::regclass),
  apparatus_id integer NOT NULL,
  station_id integer NOT NULL,
  position_name text NOT NULL,
  required_certs text DEFAULT '[]'::text,
  min_rank text DEFAULT ''::text,
  sort_order integer DEFAULT 0,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.assets (
  id integer NOT NULL DEFAULT nextval('assets_id_seq'::regclass),
  name text NOT NULL,
  category text DEFAULT ''::text,
  condition text DEFAULT 'Serviceable'::text,
  "serialNumber" text DEFAULT ''::text,
  "assignedTo" text,
  location text DEFAULT ''::text,
  "purchaseDate" text DEFAULT ''::text,
  "lastInspection" text DEFAULT ''::text,
  "nextInspectionDue" text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  quantity integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.assistant_alerts (
  id integer NOT NULL DEFAULT nextval('assistant_alerts_id_seq'::regclass),
  station_id integer DEFAULT 1,
  member_id integer NOT NULL,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'info'::text,
  title text NOT NULL,
  description text,
  source_type text DEFAULT 'internal_rule'::text,
  source_ref text,
  target_module text,
  target_record_id integer,
  focus_modes jsonb DEFAULT '["on_duty", "off_duty", "officer_mode"]'::jsonb,
  viewed_at timestamp with time zone,
  acted_on boolean DEFAULT false,
  action_taken text,
  suggested_action_url text,
  suggested_action_text text,
  display_priority integer DEFAULT 100,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.assistant_feedback (
  id integer NOT NULL DEFAULT nextval('assistant_feedback_id_seq'::regclass),
  station_id integer DEFAULT 1,
  member_id integer NOT NULL,
  alert_id integer,
  feedback text NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.assistant_preferences (
  id integer NOT NULL DEFAULT nextval('assistant_preferences_id_seq'::regclass),
  station_id integer DEFAULT 1,
  member_id integer NOT NULL,
  focus_mode text DEFAULT 'off_duty'::text,
  focus_mode_auto boolean DEFAULT true,
  alert_channels jsonb DEFAULT '{"push": false, "in_app": true, "email_daily": false}'::jsonb,
  watch_config jsonb DEFAULT '{}'::jsonb,
  email_connected boolean DEFAULT false,
  email_provider text,
  daily_digest_time time without time zone DEFAULT '06:00:00'::time without time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.attachments (
  id integer NOT NULL DEFAULT nextval('attachments_id_seq'::regclass),
  station_id integer DEFAULT 1,
  module text NOT NULL,
  record_id integer,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size integer,
  extracted_text text,
  ai_extracted jsonb,
  description text DEFAULT ''::text,
  uploaded_by text,
  category text DEFAULT 'general'::text,
  is_source boolean DEFAULT false,
  access_level text DEFAULT 'all'::text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id integer NOT NULL DEFAULT nextval('audit_log_id_seq'::regclass),
  station_id integer NOT NULL DEFAULT 1,
  user_id integer,
  user_name text DEFAULT ''::text,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id integer,
  detail jsonb DEFAULT '{}'::jsonb,
  at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.budget_lines (
  id integer NOT NULL DEFAULT nextval('budget_lines_id_seq'::regclass),
  "lineNumber" text NOT NULL,
  "fiscalYear" integer,
  description text DEFAULT ''::text,
  category text DEFAULT ''::text,
  "budgetedAmount" real DEFAULT 0,
  status text DEFAULT 'Active'::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.budget_transactions (
  id integer NOT NULL DEFAULT nextval('budget_transactions_id_seq'::regclass),
  "budgetLineId" integer,
  date text NOT NULL,
  "transactionType" text DEFAULT 'Purchase'::text,
  description text DEFAULT ''::text,
  amount real NOT NULL,
  "approvedBy" text DEFAULT ''::text,
  vendor text DEFAULT ''::text,
  "receiptPath" text DEFAULT ''::text,
  status text DEFAULT 'Pending'::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  type text DEFAULT 'Expense'::text,
  category text DEFAULT ''::text,
  subcategory text DEFAULT ''::text,
  "checkNumber" text DEFAULT ''::text,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id integer NOT NULL DEFAULT nextval('bug_reports_id_seq'::regclass),
  created_at timestamp with time zone DEFAULT now(),
  user_id integer,
  description text NOT NULL,
  page_route text,
  context_bundle jsonb,
  status text DEFAULT 'pending'::text,
  diagnosis jsonb,
  diagnosis_tokens jsonb,
  diagnosis_duration_ms integer,
  self_heal_status text,
  self_heal_run_id text,
  self_heal_branch text,
  self_heal_pr_url text,
  self_heal_pr_number integer,
  resolution_notes text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bulletins (
  id integer NOT NULL DEFAULT nextval('bulletins_id_seq'::regclass),
  station_id integer DEFAULT 1,
  title text NOT NULL,
  body text DEFAULT ''::text,
  category text DEFAULT 'General'::text,
  priority text DEFAULT 'normal'::text,
  pinned boolean DEFAULT false,
  author_id integer,
  author_name text DEFAULT ''::text,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.cad_alerts (
  id integer NOT NULL DEFAULT nextval('cad_alerts_id_seq'::regclass),
  alert_id text,
  address text DEFAULT ''::text,
  units text DEFAULT ''::text,
  description text DEFAULT ''::text,
  details text DEFAULT ''::text,
  latitude numeric,
  longitude numeric,
  dispatched_at timestamp with time zone DEFAULT now(),
  raw jsonb,
  station_id integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  cleared_at timestamp with time zone,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.cad_connections (
  id integer NOT NULL DEFAULT nextval('cad_connections_id_seq'::regclass),
  "vendorId" text DEFAULT ''::text,
  name text NOT NULL,
  status text DEFAULT 'Inactive'::text,
  host text DEFAULT ''::text,
  "apiKey" text DEFAULT ''::text,
  "syncInterval" text DEFAULT 'Manual only'::text,
  notes text DEFAULT ''::text,
  "incidentsImported" integer DEFAULT 0,
  "lastSync" text,
  "lastSyncResult" text DEFAULT ''::text,
  "fieldMap" text DEFAULT '{}'::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer,
  webhook_secret_hash text
);

CREATE TABLE IF NOT EXISTS public.cadets (
  id integer NOT NULL DEFAULT nextval('cadets_id_seq'::regclass),
  station_id integer DEFAULT 1,
  name text NOT NULL,
  date_of_birth date,
  parent_guardian text DEFAULT ''::text,
  parent_phone text DEFAULT ''::text,
  parent_email text DEFAULT ''::text,
  school text DEFAULT ''::text,
  enrolled_date date DEFAULT CURRENT_DATE,
  status text DEFAULT 'Active'::text,
  rank text DEFAULT 'Cadet'::text,
  notes text DEFAULT ''::text,
  certifications jsonb DEFAULT '[]'::jsonb,
  training_hours numeric(8,1) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.calendar_subscriptions (
  id integer NOT NULL DEFAULT nextval('calendar_subscriptions_id_seq'::regclass),
  member_id integer,
  station_id integer DEFAULT 1,
  cal_token text NOT NULL,
  tier text DEFAULT 'member'::text,
  categories jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  last_fetched_at timestamp with time zone,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.checklist_completions (
  id integer NOT NULL DEFAULT nextval('checklist_completions_id_seq'::regclass),
  "templateId" integer,
  "templateName" text DEFAULT ''::text,
  apparatus text DEFAULT ''::text,
  frequency text DEFAULT ''::text,
  "completedDate" text NOT NULL,
  "completedBy" text DEFAULT ''::text,
  status text DEFAULT 'Pass'::text,
  notes text DEFAULT ''::text,
  responses jsonb DEFAULT '{}'::jsonb,
  station_id integer DEFAULT 1,
  "createdAt" timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id integer NOT NULL DEFAULT nextval('checklist_templates_id_seq'::regclass),
  name text NOT NULL,
  apparatus text DEFAULT ''::text,
  frequency text DEFAULT 'Daily'::text,
  "estimatedMinutes" integer DEFAULT 15,
  categories jsonb DEFAULT '[]'::jsonb,
  station_id integer DEFAULT 1,
  "createdAt" timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.community_events (
  id integer NOT NULL DEFAULT nextval('community_events_id_seq'::regclass),
  station_id integer DEFAULT 1,
  title text NOT NULL,
  event_type text DEFAULT 'Other'::text,
  date date,
  start_time text,
  end_time text,
  location text DEFAULT ''::text,
  address text DEFAULT ''::text,
  audience_type text DEFAULT 'mixed'::text,
  audience_age_range text DEFAULT ''::text,
  estimated_attendance integer DEFAULT 0,
  actual_attendance integer,
  partner_org text DEFAULT ''::text,
  partner_contact_name text DEFAULT ''::text,
  partner_contact_phone text DEFAULT ''::text,
  partner_contact_email text DEFAULT ''::text,
  apparatus_needed jsonb DEFAULT '[]'::jsonb,
  equipment_needed jsonb DEFAULT '[]'::jsonb,
  materials_needed jsonb DEFAULT '[]'::jsonb,
  assigned_members jsonb DEFAULT '[]'::jsonb,
  lead_member_id integer,
  safety_checklist jsonb DEFAULT '[]'::jsonb,
  safety_notes text DEFAULT ''::text,
  special_accommodations text DEFAULT ''::text,
  materials_distributed jsonb DEFAULT '[]'::jsonb,
  photos_taken boolean DEFAULT false,
  media_coverage text DEFAULT ''::text,
  follow_up_notes text DEFAULT ''::text,
  follow_up_date date,
  volunteer_hours numeric(6,1) DEFAULT 0,
  detectors_installed integer DEFAULT 0,
  cpr_certifications integer DEFAULT 0,
  escape_plans_created integer DEFAULT 0,
  status text DEFAULT 'planned'::text,
  recurring text DEFAULT 'none'::text,
  recurring_notes text DEFAULT ''::text,
  description text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.correspondence (
  id integer NOT NULL DEFAULT nextval('correspondence_id_seq'::regclass),
  station_id integer DEFAULT 1,
  module text NOT NULL,
  record_id integer NOT NULL,
  entry_type text NOT NULL DEFAULT 'email'::text,
  from_name text DEFAULT ''::text,
  subject text DEFAULT ''::text,
  body text DEFAULT ''::text,
  file_name text DEFAULT ''::text,
  file_url text DEFAULT ''::text,
  file_size integer DEFAULT 0,
  entered_by text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.courses (
  id integer NOT NULL DEFAULT nextval('courses_id_seq'::regclass),
  "courseName" text NOT NULL,
  type text DEFAULT ''::text,
  provider text DEFAULT ''::text,
  "startDate" text,
  "endDate" text,
  location text DEFAULT ''::text,
  "certificationEarned" text DEFAULT ''::text,
  "certExpireYears" integer DEFAULT 0,
  cost integer DEFAULT 0,
  instructor text DEFAULT ''::text,
  attendees text DEFAULT '[]'::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.coverage_outreach (
  id integer NOT NULL DEFAULT nextval('coverage_outreach_id_seq'::regclass),
  "leaveRequestId" integer NOT NULL,
  "shiftId" integer NOT NULL,
  "memberId" integer NOT NULL,
  "memberName" text NOT NULL,
  "contactMethod" text DEFAULT 'sms'::text,
  status text DEFAULT 'Pending'::text,
  "sentAt" timestamp with time zone,
  "respondedAt" timestamp with time zone,
  response text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  station_id integer DEFAULT 1,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.crr_programs (
  id integer NOT NULL DEFAULT nextval('crr_programs_id_seq'::regclass),
  name text NOT NULL,
  coordinator text DEFAULT ''::text,
  "startDate" text,
  "endDate" text,
  budget real,
  status text DEFAULT 'Active'::text,
  description text DEFAULT ''::text,
  participants text DEFAULT '[]'::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.crr_visits (
  id integer NOT NULL DEFAULT nextval('crr_visits_id_seq'::regclass),
  date text NOT NULL,
  location text DEFAULT ''::text,
  reason text DEFAULT ''::text,
  "memberPresent" text DEFAULT '[]'::text,
  "visitDuration" real DEFAULT 0,
  status text DEFAULT 'Completed'::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.cylinders (
  id integer NOT NULL DEFAULT nextval('cylinders_id_seq'::regclass),
  "unitId" text NOT NULL,
  make text DEFAULT ''::text,
  model text DEFAULT ''::text,
  size text DEFAULT ''::text,
  material text DEFAULT ''::text,
  serial text DEFAULT ''::text,
  "manufactureYear" integer DEFAULT 0,
  "currentPressure" integer DEFAULT 0,
  "maxPressure" integer DEFAULT 4500,
  "lastHydroDate" text DEFAULT ''::text,
  "nextHydroDate" text DEFAULT ''::text,
  "lastInspectionDate" text DEFAULT ''::text,
  "nextInspectionDate" text DEFAULT ''::text,
  "assignedMember" text DEFAULT ''::text,
  "assignedUnit" text DEFAULT ''::text,
  status text DEFAULT 'In Service'::text,
  notes text DEFAULT ''::text,
  "fillLog" text DEFAULT '[]'::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.daily_staffing (
  id integer NOT NULL DEFAULT nextval('daily_staffing_id_seq'::regclass),
  station_id integer NOT NULL DEFAULT 1,
  date date NOT NULL DEFAULT CURRENT_DATE,
  member_id integer NOT NULL,
  "position" text DEFAULT ''::text,
  apparatus_id integer,
  status text DEFAULT 'on_duty'::text,
  start_time text DEFAULT '08:00'::text,
  end_time text DEFAULT '08:00'::text,
  hours numeric(5,2) DEFAULT 24,
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.departments (
  id integer NOT NULL DEFAULT nextval('departments_id_seq'::regclass),
  name text NOT NULL,
  fdid text DEFAULT ''::text,
  dept_type text DEFAULT ''::text,
  plan_tier text DEFAULT ''::text,
  flsa_work_period integer,
  flsa_ot_threshold numeric,
  flsa_period_start text,
  ai_daily_token_budget integer,
  tv_pin text,
  stripe_customer_id text DEFAULT ''::text,
  stripe_subscription_id text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  shift_pattern text
);

CREATE TABLE IF NOT EXISTS public.dept_documents (
  id integer NOT NULL DEFAULT nextval('dept_documents_id_seq'::regclass),
  station_id integer NOT NULL DEFAULT 1,
  title text NOT NULL DEFAULT ''::text,
  category text DEFAULT 'general'::text,
  doc_type text DEFAULT 'policy'::text,
  description text DEFAULT ''::text,
  version text DEFAULT '1.0'::text,
  effective_date date,
  review_date date,
  file_ref text DEFAULT ''::text,
  content text DEFAULT ''::text,
  tags jsonb DEFAULT '[]'::jsonb,
  uploaded_by text DEFAULT ''::text,
  status text DEFAULT 'active'::text,
  access_level text DEFAULT 'all'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.donations (
  id integer NOT NULL DEFAULT nextval('donations_id_seq'::regclass),
  station_id integer DEFAULT 1,
  campaign_id integer,
  donor_name text NOT NULL,
  donor_email text DEFAULT ''::text,
  donor_phone text DEFAULT ''::text,
  donor_address text DEFAULT ''::text,
  amount numeric(12,2) NOT NULL,
  method text DEFAULT 'Check'::text,
  reference text DEFAULT ''::text,
  receipt_sent boolean DEFAULT false,
  notes text DEFAULT ''::text,
  donated_at date DEFAULT CURRENT_DATE,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.drills (
  id integer NOT NULL DEFAULT nextval('drills_id_seq'::regclass),
  title text NOT NULL,
  type text DEFAULT ''::text,
  date text NOT NULL,
  "startTime" text DEFAULT ''::text,
  duration integer DEFAULT 0,
  location text DEFAULT ''::text,
  instructor text DEFAULT ''::text,
  objectives text DEFAULT '[]'::text,
  attendees text DEFAULT '[]'::text,
  "isoHours" boolean DEFAULT true,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.equipment_checkout (
  id integer NOT NULL DEFAULT nextval('equipment_checkout_id_seq'::regclass),
  station_id integer,
  item_name text NOT NULL,
  item_type text DEFAULT 'radio'::text,
  serial_number text,
  asset_tag text,
  checked_out_by integer,
  checked_out_at timestamp with time zone DEFAULT now(),
  expected_return timestamp with time zone,
  returned_at timestamp with time zone,
  returned_to text,
  condition_out text DEFAULT 'good'::text,
  condition_in text,
  purpose text,
  notes text,
  status text DEFAULT 'checked_out'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.events (
  id integer NOT NULL DEFAULT nextval('events_id_seq'::regclass),
  title text NOT NULL,
  type text DEFAULT 'Other'::text,
  date text NOT NULL,
  "startTime" text DEFAULT ''::text,
  "endTime" text DEFAULT ''::text,
  location text DEFAULT ''::text,
  organizer text DEFAULT ''::text,
  description text DEFAULT ''::text,
  "maxAttendees" integer,
  rsvps text DEFAULT '[]'::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  rrule text,
  recurrence_id integer,
  original_date text,
  is_cancelled boolean DEFAULT false,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.exam_assignments (
  id integer NOT NULL DEFAULT nextval('exam_assignments_id_seq'::regclass),
  station_id integer DEFAULT 1,
  exam_id integer,
  user_id integer,
  assigned_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.exam_submissions (
  id integer NOT NULL DEFAULT nextval('exam_submissions_id_seq'::regclass),
  station_id integer DEFAULT 1,
  exam_id integer,
  user_id integer,
  score integer DEFAULT 0,
  passed boolean DEFAULT false,
  answers jsonb DEFAULT '[]'::jsonb,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone DEFAULT now(),
  time_spent integer DEFAULT 0,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.exams (
  id integer NOT NULL DEFAULT nextval('exams_id_seq'::regclass),
  station_id integer DEFAULT 1,
  title text NOT NULL,
  description text DEFAULT ''::text,
  category text DEFAULT 'General'::text,
  time_limit integer DEFAULT 0,
  passing_score integer DEFAULT 70,
  randomize boolean DEFAULT true,
  questions jsonb DEFAULT '[]'::jsonb,
  created_by integer,
  status text DEFAULT 'draft'::text,
  due_date date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.expo_push_tokens (
  id integer NOT NULL DEFAULT nextval('expo_push_tokens_id_seq'::regclass),
  user_id integer NOT NULL,
  station_id integer NOT NULL,
  department_id integer NOT NULL,
  token text NOT NULL,
  device_name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exposure_records (
  id integer NOT NULL DEFAULT nextval('exposure_records_id_seq'::regclass),
  member_id integer NOT NULL,
  station_id integer NOT NULL,
  incident_id integer,
  exposure_date text NOT NULL,
  exposure_type text NOT NULL,
  substance text DEFAULT ''::text,
  duration_minutes integer DEFAULT 0,
  ppe_worn text DEFAULT '[]'::text,
  symptoms text DEFAULT ''::text,
  medical_followup boolean DEFAULT false,
  followup_date text DEFAULT ''::text,
  followup_notes text DEFAULT ''::text,
  reported_by text DEFAULT ''::text,
  status text DEFAULT 'reported'::text,
  created_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.fi_inspections (
  id integer NOT NULL DEFAULT nextval('fi_inspections_id_seq'::regclass),
  "propertyId" integer NOT NULL,
  type text DEFAULT 'Annual Inspection'::text,
  "inspectorName" text DEFAULT ''::text,
  "scheduledDate" text,
  "completedDate" text,
  result text,
  violations text DEFAULT '[]'::text,
  "followUpDate" text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.fi_permits (
  id integer NOT NULL DEFAULT nextval('fi_permits_id_seq'::regclass),
  "propertyId" integer NOT NULL,
  type text NOT NULL,
  "permitNumber" text DEFAULT ''::text,
  "issuedDate" text,
  "expiresDate" text,
  status text DEFAULT 'Active'::text,
  "issuedBy" text DEFAULT ''::text,
  fee real,
  conditions text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.fi_properties (
  id integer NOT NULL DEFAULT nextval('fi_properties_id_seq'::regclass),
  name text NOT NULL,
  address text DEFAULT ''::text,
  "occupancyType" text DEFAULT ''::text,
  "propertyUseCode" text DEFAULT ''::text,
  "ownerName" text DEFAULT ''::text,
  "ownerPhone" text DEFAULT ''::text,
  "ownerEmail" text DEFAULT ''::text,
  "contactName" text DEFAULT ''::text,
  "contactPhone" text DEFAULT ''::text,
  "squareFootage" integer,
  stories integer DEFAULT 1,
  "occupantLoad" integer,
  sprinklered boolean DEFAULT false,
  "alarmMonitored" boolean DEFAULT false,
  "hazmatOnsite" boolean DEFAULT false,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.fill_stations (
  id integer NOT NULL DEFAULT nextval('fill_stations_id_seq'::regclass),
  name text NOT NULL,
  type text DEFAULT ''::text,
  "bankPressure" integer,
  "maxPressure" integer DEFAULT 4500,
  "lastInspectionDate" text DEFAULT ''::text,
  "nextInspectionDate" text DEFAULT ''::text,
  status text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.fs_hazmat_guides (
  id integer NOT NULL DEFAULT nextval('fs_hazmat_guides_id_seq'::regclass),
  guide_number integer NOT NULL,
  title text NOT NULL,
  hazard_class text,
  fire_explosion text,
  health_hazards text,
  public_safety text,
  protective_clothing text,
  evacuation text,
  fire_response text,
  spill_response text,
  first_aid text,
  ppe_level text,
  special_hazards text,
  needs_proximity_suit boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fs_hazmat_incident_audit (
  id integer NOT NULL DEFAULT nextval('fs_hazmat_incident_audit_id_seq'::regclass),
  incident_id integer NOT NULL,
  field_changed character varying(64) NOT NULL,
  old_value text,
  new_value text,
  changed_by integer,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.fs_hazmat_incidents (
  id integer NOT NULL DEFAULT nextval('fs_hazmat_incidents_id_seq'::regclass),
  station_id integer,
  incident_number text,
  address text,
  material_name text,
  un_number character varying(10),
  guide_number integer,
  hazard_class text,
  quantity text,
  container_type text,
  release_type text,
  ppe_level text,
  isolation_zone_m integer,
  status text DEFAULT 'active'::text,
  declared_at timestamp with time zone DEFAULT now(),
  mitigated_at timestamp with time zone,
  notes text,
  crew_in_hot_zone text[],
  notifications_sent text[],
  created_by integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  location_address text,
  location_lat numeric,
  location_lon numeric,
  quantity_estimate text,
  wind_direction text,
  wind_speed_mph numeric,
  temperature_f numeric,
  ic_user_id integer,
  responders_count integer,
  evacuation_distance_m integer,
  resolved_at timestamp with time zone,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.fs_hazmat_isolation_distances (
  id integer NOT NULL DEFAULT nextval('fs_hazmat_isolation_distances_id_seq'::regclass),
  un_number character varying(10) NOT NULL,
  name text NOT NULL,
  guide_number integer,
  small_spill_isolate_m integer,
  small_spill_day_km numeric,
  small_spill_night_km numeric,
  large_spill_isolate_m integer,
  large_spill_day_km numeric,
  large_spill_night_km numeric,
  fire_isolate_m integer,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fs_hazmat_materials (
  id integer NOT NULL DEFAULT nextval('fs_hazmat_materials_id_seq'::regclass),
  name text NOT NULL,
  un_number character varying(10),
  na_number character varying(10),
  cas_number character varying(20),
  guide_number integer,
  hazard_class character varying(10),
  hazard_division character varying(10),
  is_tih boolean DEFAULT false,
  is_water_reactive boolean DEFAULT false,
  physical_state text,
  color text,
  odor text,
  flash_point_c numeric,
  boiling_point_c numeric,
  idlh_ppm numeric,
  tlv_twa_ppm numeric,
  synonyms text[],
  created_at timestamp with time zone DEFAULT now(),
  polymerization_hazard boolean DEFAULT false,
  is_pyrophoric boolean DEFAULT false,
  stel_ppm numeric,
  ceiling_ppm numeric,
  is_carcinogen boolean DEFAULT false,
  carcinogen_class text,
  idlh_mg_m3 numeric,
  vapor_density numeric,
  vapor_pressure_mmhg numeric,
  vapor_pressure_temp_c numeric,
  specific_gravity numeric,
  melting_point_c numeric,
  autoignition_temp_c numeric,
  lel_pct numeric,
  lel_unit text,
  uel_pct numeric,
  uel_unit text,
  molecular_formula text,
  molecular_weight_g_mol numeric,
  iupac_name text,
  inchi_key text,
  smiles text,
  water_solubility text,
  incompatibilities text[],
  ghs_pictograms text[],
  ghs_signal_word text,
  ghs_hazards text[],
  enriched_at text,
  data_sources jsonb,
  pubchem_cid integer
);

CREATE TABLE IF NOT EXISTS public.fs_hazmat_table3_distances (
  id integer NOT NULL DEFAULT nextval('fs_hazmat_table3_distances_id_seq'::regclass),
  un_number character varying(10) NOT NULL,
  container_type character varying(100) NOT NULL,
  isolate_m integer NOT NULL,
  isolate_ft integer NOT NULL,
  day_low_km text NOT NULL,
  day_mod_km text NOT NULL,
  day_high_km text NOT NULL,
  night_low_km text NOT NULL,
  night_mod_km text NOT NULL,
  night_high_km text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fto_evaluations (
  id integer NOT NULL DEFAULT nextval('fto_evaluations_id_seq'::regclass),
  station_id integer DEFAULT 1,
  member_id integer NOT NULL,
  skill_id text NOT NULL,
  skill_name text DEFAULT ''::text,
  category text DEFAULT ''::text,
  result text DEFAULT 'Not Evaluated'::text,
  evaluated_by text DEFAULT ''::text,
  evaluated_at timestamp with time zone DEFAULT now(),
  notes text DEFAULT ''::text,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.fto_observations (
  id integer NOT NULL DEFAULT nextval('fto_observations_id_seq'::regclass),
  station_id integer DEFAULT 1,
  member_id integer NOT NULL,
  category text DEFAULT 'General'::text,
  note text NOT NULL,
  observed_by text DEFAULT ''::text,
  observed_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.fundraising_campaigns (
  id integer NOT NULL DEFAULT nextval('fundraising_campaigns_id_seq'::regclass),
  station_id integer DEFAULT 1,
  name text NOT NULL,
  description text DEFAULT ''::text,
  type text DEFAULT 'Fund Drive'::text,
  goal_amount numeric(12,2) DEFAULT 0,
  raised_amount numeric(12,2) DEFAULT 0,
  start_date date,
  end_date date,
  status text DEFAULT 'Planning'::text,
  created_by integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.grants (
  id integer NOT NULL DEFAULT nextval('grants_id_seq'::regclass),
  "grantName" text NOT NULL,
  type text DEFAULT ''::text,
  "fundingAgency" text DEFAULT ''::text,
  "programYear" integer,
  status text DEFAULT 'Planning'::text,
  "applicationDate" text,
  "awardDate" text,
  "amountRequested" real DEFAULT 0,
  "amountAwarded" real,
  "matchRequired" boolean DEFAULT false,
  "matchPercent" real DEFAULT 0,
  "matchAmount" real,
  "grantPeriodStart" text,
  "grantPeriodEnd" text,
  "reportingDeadlines" text DEFAULT '[]'::text,
  expenditures text DEFAULT '[]'::text,
  "contactName" text DEFAULT ''::text,
  "contactEmail" text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.grievances (
  id integer NOT NULL DEFAULT nextval('grievances_id_seq'::regclass),
  station_id integer NOT NULL DEFAULT 1,
  grievance_number text DEFAULT ''::text,
  filed_by integer,
  filed_date date DEFAULT CURRENT_DATE,
  cba_article text DEFAULT ''::text,
  subject text NOT NULL DEFAULT ''::text,
  description text DEFAULT ''::text,
  grievance_type text DEFAULT 'contract_violation'::text,
  current_step text DEFAULT 'step_1'::text,
  status text DEFAULT 'open'::text,
  resolution text DEFAULT ''::text,
  resolved_date date,
  assigned_to text DEFAULT ''::text,
  union_rep text DEFAULT ''::text,
  management_rep text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  timeline jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.hydrants (
  id integer NOT NULL DEFAULT nextval('hydrants_id_seq'::regclass),
  "hydrantNumber" text NOT NULL,
  "streetAddress" text DEFAULT ''::text,
  intersection text DEFAULT ''::text,
  city text DEFAULT ''::text,
  state text DEFAULT ''::text,
  zip text DEFAULT ''::text,
  type text DEFAULT 'Dry Barrel'::text,
  manufacturer text DEFAULT ''::text,
  model text DEFAULT ''::text,
  "yearInstalled" integer,
  "mainSize" text DEFAULT ''::text,
  "outletSize" text DEFAULT ''::text,
  "numOutlets" integer DEFAULT 2,
  status text DEFAULT 'In Service'::text,
  "staticPressure" real,
  "residualPressure" real,
  "flowRate" real,
  "lastTestDate" text,
  "nextTestDue" text,
  "testedBy" text DEFAULT ''::text,
  "lastInspectionDate" text,
  "ownedBy" text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer,
  lat real,
  lng real
);

CREATE TABLE IF NOT EXISTS public.incident_costs (
  id integer NOT NULL DEFAULT nextval('incident_costs_id_seq'::regclass),
  station_id integer,
  incident_id integer,
  incident_number text,
  incident_date date,
  incident_type text,
  location text,
  apparatus_costs jsonb DEFAULT '[]'::jsonb,
  personnel_costs jsonb DEFAULT '[]'::jsonb,
  material_costs jsonb DEFAULT '[]'::jsonb,
  other_costs jsonb DEFAULT '[]'::jsonb,
  total_cost numeric(12,2) DEFAULT 0,
  billable boolean DEFAULT false,
  billed_to text,
  invoice_number text,
  payment_status text DEFAULT 'not_billed'::text,
  notes text,
  calculated_by text,
  status text DEFAULT 'draft'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.incident_responses (
  id integer NOT NULL DEFAULT nextval('incident_responses_id_seq'::regclass),
  station_id integer DEFAULT 1,
  incident_id integer,
  user_id integer,
  member_name text DEFAULT ''::text,
  status text DEFAULT 'responding'::text,
  cert_level text DEFAULT 'probationary'::text,
  responded_at timestamp with time zone DEFAULT now(),
  on_scene_at timestamp with time zone,
  cleared_at timestamp with time zone,
  department_id integer,
  apparatus_id integer,
  position_id integer,
  position_name text,
  member_id integer
);

CREATE TABLE IF NOT EXISTS public.incidents (
  id integer NOT NULL DEFAULT nextval('incidents_id_seq'::regclass),
  "incidentNumber" text NOT NULL,
  date text NOT NULL,
  "time" text DEFAULT ''::text,
  type text NOT NULL,
  "alarmLevel" text DEFAULT 'Still'::text,
  address text DEFAULT ''::text,
  units text DEFAULT '[]'::text,
  personnel text DEFAULT '[]'::text,
  disposition text DEFAULT ''::text,
  injuries integer DEFAULT 0,
  notes text DEFAULT ''::text,
  photos text DEFAULT '[]'::text,
  "dispatchTime" text DEFAULT ''::text,
  "clearTime" text DEFAULT ''::text,
  description text DEFAULT ''::text,
  station_id integer DEFAULT 1,
  incident_date date,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.investigations (
  id integer NOT NULL DEFAULT nextval('investigations_id_seq'::regclass),
  "caseNumber" text NOT NULL,
  "incidentDate" text DEFAULT ''::text,
  address text DEFAULT ''::text,
  "occupancyType" text DEFAULT ''::text,
  cause text DEFAULT 'Undetermined'::text,
  "causeDetail" text DEFAULT ''::text,
  investigator text DEFAULT ''::text,
  "startDate" text,
  "completionDate" text,
  "estimatedLoss" real,
  "actualLoss" real,
  status text DEFAULT 'Open'::text,
  narrative text DEFAULT ''::text,
  findings text DEFAULT ''::text,
  recommendations text DEFAULT ''::text,
  evidence text DEFAULT '[]'::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.knox_access_log (
  id integer NOT NULL DEFAULT nextval('knox_access_log_id_seq'::regclass),
  knox_box_id integer NOT NULL,
  station_id integer DEFAULT 1,
  accessed_by text NOT NULL,
  access_type text DEFAULT 'key_access'::text,
  incident_number text DEFAULT ''::text,
  reason text DEFAULT ''::text,
  accessed_at timestamp with time zone DEFAULT now(),
  returned_at timestamp with time zone,
  notes text DEFAULT ''::text,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.knox_boxes (
  id integer NOT NULL DEFAULT nextval('knox_boxes_id_seq'::regclass),
  station_id integer DEFAULT 1,
  box_number text NOT NULL,
  box_type text DEFAULT 'wall_mount'::text,
  status text DEFAULT 'active'::text,
  address text DEFAULT ''::text,
  location_detail text DEFAULT ''::text,
  property_name text DEFAULT ''::text,
  property_type text DEFAULT ''::text,
  pre_plan_id integer,
  installed_date text,
  serial_number text DEFAULT ''::text,
  contents text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  last_inspection_date text,
  next_inspection_due text,
  inspected_by text DEFAULT ''::text,
  inspection_result text DEFAULT ''::text,
  latitude double precision,
  longitude double precision,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.knox_inspections (
  id integer NOT NULL DEFAULT nextval('knox_inspections_id_seq'::regclass),
  knox_box_id integer NOT NULL,
  station_id integer DEFAULT 1,
  inspected_by text NOT NULL,
  inspection_date text NOT NULL,
  result text DEFAULT 'pass'::text,
  box_condition text DEFAULT 'good'::text,
  lock_functional boolean DEFAULT true,
  contents_verified boolean DEFAULT true,
  weatherproofing text DEFAULT 'good'::text,
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id integer NOT NULL DEFAULT nextval('leave_requests_id_seq'::regclass),
  "memberId" integer NOT NULL,
  "memberName" text NOT NULL,
  type text NOT NULL DEFAULT 'PTO'::text,
  "startDate" text NOT NULL,
  "endDate" text NOT NULL,
  status text DEFAULT 'Pending'::text,
  "approvedBy" text,
  "approvedAt" timestamp with time zone,
  reason text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  station_id integer DEFAULT 1,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.license_config (
  department_id integer NOT NULL,
  jwt text NOT NULL,
  jti text NOT NULL,
  license_id text NOT NULL,
  dept_name text,
  dept_email text,
  tier text,
  expires_at timestamp with time zone NOT NULL,
  activated_at timestamp with time zone NOT NULL DEFAULT now(),
  activated_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.licenses (
  license_id text NOT NULL,
  jti text NOT NULL,
  jwt text,
  product_family text NOT NULL DEFAULT 'openfirehouse'::text,
  stripe_invoice_id text NOT NULL,
  stripe_subscription_id text,
  stripe_customer_id text,
  dept_name text,
  dept_email text,
  tier text,
  member_count integer,
  station_count integer,
  annual_budget_usd bigint,
  livemode boolean NOT NULL DEFAULT true,
  issued_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  issuer text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  revoked_at timestamp with time zone,
  revoked_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.maintenance (
  id integer NOT NULL DEFAULT nextval('maintenance_id_seq'::regclass),
  "apparatusId" integer DEFAULT 0,
  "apparatusName" text DEFAULT ''::text,
  type text NOT NULL,
  priority text DEFAULT 'Routine'::text,
  status text DEFAULT 'Pending'::text,
  date text NOT NULL,
  mileage integer,
  "engineHours" real,
  description text DEFAULT ''::text,
  technician text DEFAULT ''::text,
  vendor text DEFAULT ''::text,
  "laborHours" real,
  "partsCost" real,
  "laborCost" real,
  "totalCost" real,
  "workOrder" text DEFAULT ''::text,
  "nextServiceMiles" integer,
  "nextServiceDate" text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.meeting_minutes (
  id integer NOT NULL DEFAULT nextval('meeting_minutes_id_seq'::regclass),
  station_id integer,
  title text NOT NULL,
  meeting_date date NOT NULL,
  meeting_type text DEFAULT 'regular'::text,
  location text,
  called_by text,
  attendees jsonb DEFAULT '[]'::jsonb,
  agenda jsonb DEFAULT '[]'::jsonb,
  motions jsonb DEFAULT '[]'::jsonb,
  action_items jsonb DEFAULT '[]'::jsonb,
  notes text,
  next_meeting date,
  recorded_by text,
  status text DEFAULT 'draft'::text,
  linked_module text,
  linked_record_id integer,
  linked_label text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.member_availability (
  id integer NOT NULL DEFAULT nextval('member_availability_id_seq'::regclass),
  station_id integer DEFAULT 1,
  user_id integer NOT NULL,
  member_name text DEFAULT ''::text,
  available boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.member_qualifications (
  id integer NOT NULL DEFAULT nextval('member_qualifications_id_seq'::regclass),
  member_id integer NOT NULL,
  station_id integer NOT NULL,
  cert_type text NOT NULL,
  cert_name text NOT NULL,
  issued_date text DEFAULT ''::text,
  expiry_date text DEFAULT ''::text,
  issuing_authority text DEFAULT ''::text,
  cert_number text DEFAULT ''::text,
  status text DEFAULT 'active'::text,
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.members (
  id integer NOT NULL DEFAULT nextval('members_id_seq'::regclass),
  "memberNumber" text NOT NULL,
  name text NOT NULL,
  rank text NOT NULL,
  role text NOT NULL,
  status text DEFAULT 'Active'::text,
  joined text NOT NULL,
  dob text DEFAULT ''::text,
  phone text DEFAULT ''::text,
  email text DEFAULT ''::text,
  station_email text DEFAULT ''::text,
  personal_email text DEFAULT ''::text,
  address text DEFAULT ''::text,
  "emergencyContactName" text DEFAULT ''::text,
  "emergencyContactPhone" text DEFAULT ''::text,
  "emergencyContactRelation" text DEFAULT ''::text,
  certifications text DEFAULT '[]'::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  photo_url text DEFAULT ''::text,
  available boolean DEFAULT true,
  hire_date text DEFAULT ''::text,
  rank_date text DEFAULT ''::text,
  seniority_number integer DEFAULT 0,
  employment_type text DEFAULT 'volunteer'::text,
  cal_token text,
  department_id integer,
  user_id integer,
  rank_verified boolean NOT NULL DEFAULT false,
  assigned_unit_id integer,
  assigned_group text,
  personnel_id text,
  external_id text
);

CREATE TABLE IF NOT EXISTS public.messages (
  id integer NOT NULL DEFAULT nextval('messages_id_seq'::regclass),
  station_id integer DEFAULT 1,
  from_id integer,
  from_name text DEFAULT ''::text,
  from_username text DEFAULT ''::text,
  to_username text NOT NULL,
  subject text NOT NULL DEFAULT ''::text,
  body text DEFAULT ''::text,
  sent_at timestamp with time zone DEFAULT now(),
  read_at timestamp with time zone,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.module_completions (
  id integer NOT NULL DEFAULT nextval('module_completions_id_seq'::regclass),
  station_id integer DEFAULT 1,
  user_id integer,
  member_name text DEFAULT ''::text,
  module_id text NOT NULL,
  score integer DEFAULT 0,
  passed boolean DEFAULT true,
  completed_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.mutual_aid (
  id integer NOT NULL DEFAULT nextval('mutual_aid_id_seq'::regclass),
  date text NOT NULL,
  direction text DEFAULT 'Given'::text,
  "incidentType" text DEFAULT ''::text,
  status text DEFAULT 'Completed'::text,
  "partnerDepartment" text DEFAULT ''::text,
  address text DEFAULT ''::text,
  "unitsDeployed" text DEFAULT '[]'::text,
  "personnelCount" integer DEFAULT 0,
  "requestTime" text DEFAULT ''::text,
  "clearTime" text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  "incidentNumber" text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.mutual_aid_agreements (
  id integer NOT NULL DEFAULT nextval('mutual_aid_agreements_id_seq'::regclass),
  station_id integer NOT NULL DEFAULT 1,
  partner_agency text NOT NULL DEFAULT ''::text,
  partner_fdid text DEFAULT ''::text,
  partner_contact text DEFAULT ''::text,
  partner_phone text DEFAULT ''::text,
  partner_email text DEFAULT ''::text,
  agreement_type text DEFAULT 'automatic'::text,
  services jsonb DEFAULT '[]'::jsonb,
  effective_date date,
  expiration_date date,
  auto_renew boolean DEFAULT true,
  distance_miles numeric(6,1) DEFAULT 0,
  response_time_min integer DEFAULT 0,
  status text DEFAULT 'active'::text,
  document_ref text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.nfirs_reports (
  id integer NOT NULL DEFAULT nextval('nfirs_reports_id_seq'::regclass),
  "incidentNumber" text,
  "reportingArea" text DEFAULT ''::text,
  "stateIncidentNumber" text DEFAULT ''::text,
  "federalIncidentNumber" text DEFAULT ''::text,
  "reportDate" text,
  "estimatedPropertyLoss" real DEFAULT 0,
  "estimatedPropertyValue" real DEFAULT 0,
  status text DEFAULT 'Draft'::text,
  "suppressionApparatus" text DEFAULT '[]'::text,
  "suppressionPersonnel" text DEFAULT '[]'::text,
  "emsApparatus" text DEFAULT '[]'::text,
  "emsPersonnel" text DEFAULT '[]'::text,
  "otherApparatus" text DEFAULT '[]'::text,
  "otherPersonnel" text DEFAULT '[]'::text,
  "civilianDeaths" integer DEFAULT 0,
  "civilianInjuries" integer DEFAULT 0,
  "fsDeaths" integer DEFAULT 0,
  "fsInjuries" integer DEFAULT 0,
  "propertyLoss" real DEFAULT 0,
  "contentsLoss" real DEFAULT 0,
  "isStructureFire" boolean DEFAULT false,
  "structureType" text DEFAULT ''::text,
  "buildingStatus" text DEFAULT ''::text,
  "storiesAboveGrade" integer DEFAULT 0,
  "storiesBelowGrade" integer DEFAULT 0,
  "mainFloorArea" integer DEFAULT 0,
  "fireOriginCode" text DEFAULT ''::text,
  "fireCauseCode" text DEFAULT ''::text,
  "contributingFactor1" text DEFAULT ''::text,
  "contributingFactor2" text DEFAULT ''::text,
  "humanFactors1" text DEFAULT ''::text,
  "humanFactors2" text DEFAULT ''::text,
  "detectorPresence" text DEFAULT ''::text,
  "detectorOperation" text DEFAULT ''::text,
  "detectorEffectiveness" text DEFAULT ''::text,
  "detectorFailureReason" text DEFAULT ''::text,
  "sprinklerPresence" text DEFAULT ''::text,
  "sprinklerOperation" text DEFAULT ''::text,
  "sprinklerFailureReason" text DEFAULT ''::text,
  "narrativeStatement" text DEFAULT ''::text,
  "preparedBy" text DEFAULT ''::text,
  "officerInCharge" text DEFAULT ''::text,
  "reviewedBy" text DEFAULT ''::text,
  "linkedIncidentId" integer,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  latitude text DEFAULT ''::text,
  longitude text DEFAULT ''::text,
  "dispatchTime" text DEFAULT ''::text,
  "onSceneTime" text DEFAULT ''::text,
  "unitClearTime" text DEFAULT ''::text,
  "respondingUnits" text DEFAULT ''::text,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.ng911_calls (
  id integer NOT NULL DEFAULT nextval('ng911_calls_id_seq'::regclass),
  station_id integer DEFAULT 1,
  call_id text DEFAULT ''::text,
  call_type text DEFAULT 'fire'::text,
  priority text DEFAULT 'emergency'::text,
  caller_name text DEFAULT ''::text,
  caller_phone text DEFAULT ''::text,
  caller_latitude double precision,
  caller_longitude double precision,
  caller_accuracy_meters double precision,
  location_method text DEFAULT 'gps'::text,
  verified_address text DEFAULT ''::text,
  verified_city text DEFAULT ''::text,
  verified_state text DEFAULT ''::text,
  verified_zip text DEFAULT ''::text,
  building_name text DEFAULT ''::text,
  floor text DEFAULT ''::text,
  room text DEFAULT ''::text,
  supplemental_data jsonb DEFAULT '{}'::jsonb,
  call_narrative text DEFAULT ''::text,
  caller_text_messages jsonb DEFAULT '[]'::jsonb,
  media_urls jsonb DEFAULT '[]'::jsonb,
  psap_name text DEFAULT ''::text,
  psap_id text DEFAULT ''::text,
  ani text DEFAULT ''::text,
  ali text DEFAULT ''::text,
  esn text DEFAULT ''::text,
  incident_created boolean DEFAULT false,
  incident_id integer,
  status text DEFAULT 'new'::text,
  received_at timestamp with time zone DEFAULT now(),
  processed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.of_department_join_codes (
  id integer NOT NULL DEFAULT nextval('of_department_join_codes_id_seq'::regclass),
  department_id integer NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone,
  created_by_user_id integer,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.of_member_invites (
  id integer NOT NULL DEFAULT nextval('of_member_invites_id_seq'::regclass),
  member_id integer NOT NULL,
  user_id integer NOT NULL,
  department_id integer NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_by_user_id integer,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.of_rank_notifications (
  department_id integer NOT NULL,
  tier text NOT NULL,
  notif_type text NOT NULL,
  enabled boolean NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.of_schema_migrations (
  filename text NOT NULL,
  applied_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.of_user_departments (
  id integer NOT NULL DEFAULT nextval('of_user_departments_id_seq'::regclass),
  user_id integer NOT NULL,
  department_id integer NOT NULL,
  role text DEFAULT 'member'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ot_records (
  id integer NOT NULL DEFAULT nextval('ot_records_id_seq'::regclass),
  member_id integer NOT NULL,
  station_id integer NOT NULL,
  shift_id integer,
  ot_date text NOT NULL,
  ot_hours numeric NOT NULL DEFAULT 0,
  ot_type text DEFAULT 'mandatory'::text,
  reason text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.pay_entries (
  id integer NOT NULL DEFAULT nextval('pay_entries_id_seq'::regclass),
  "memberId" integer,
  "memberName" text DEFAULT ''::text,
  "payPeriodStart" text NOT NULL,
  "payPeriodEnd" text NOT NULL,
  "regularHours" real DEFAULT 0,
  "overtimeHours" real DEFAULT 0,
  "specialPay" text DEFAULT '[]'::text,
  "grossPay" real,
  "netPay" real,
  deductions text DEFAULT '[]'::text,
  "paymentDate" text,
  "paymentMethod" text DEFAULT 'Check'::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.personnel_actions (
  id integer NOT NULL DEFAULT nextval('personnel_actions_id_seq'::regclass),
  member_id integer NOT NULL,
  station_id integer NOT NULL,
  action_type text NOT NULL,
  action_date text NOT NULL,
  description text DEFAULT ''::text,
  details jsonb DEFAULT '{}'::jsonb,
  issued_by text DEFAULT ''::text,
  status text DEFAULT 'active'::text,
  attachments text DEFAULT '[]'::text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.policy_acknowledgments (
  id integer NOT NULL DEFAULT nextval('policy_acknowledgments_id_seq'::regclass),
  station_id integer,
  policy_title text NOT NULL,
  policy_ref text,
  policy_type text DEFAULT 'sog'::text,
  description text,
  effective_date date,
  review_date date,
  required_by jsonb DEFAULT '[]'::jsonb,
  acknowledged_by jsonb DEFAULT '[]'::jsonb,
  total_required integer DEFAULT 0,
  total_acknowledged integer DEFAULT 0,
  status text DEFAULT 'active'::text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.pre_plans (
  id integer NOT NULL DEFAULT nextval('pre_plans_id_seq'::regclass),
  "occupancyName" text NOT NULL,
  address text DEFAULT ''::text,
  "occupancyType" text DEFAULT ''::text,
  "riskLevel" text DEFAULT 'Moderate'::text,
  "constructionType" text DEFAULT ''::text,
  "yearBuilt" integer,
  stories integer,
  "sqFootage" integer,
  "lastInspection" text,
  "lastUpdated" text,
  "lastUpdatedBy" text DEFAULT ''::text,
  contacts text DEFAULT '[]'::text,
  hazards text DEFAULT '[]'::text,
  access text DEFAULT '{}'::text,
  "waterSupply" text DEFAULT '[]'::text,
  suppression text DEFAULT '{}'::text,
  utilities text DEFAULT '{}'::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer,
  evacuation_routes text DEFAULT ''::text,
  reviewed_by text DEFAULT ''::text,
  reviewed_at timestamp with time zone,
  review_notes text DEFAULT ''::text,
  attachments text DEFAULT '[]'::text,
  "evacuationRoutes" text DEFAULT ''::text,
  "reviewedBy" text DEFAULT ''::text,
  "reviewedAt" timestamp with time zone,
  "reviewNotes" text DEFAULT ''::text
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id integer NOT NULL DEFAULT nextval('push_subscriptions_id_seq'::regclass),
  station_id integer DEFAULT 1,
  user_id integer,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.radio_config (
  id integer NOT NULL DEFAULT nextval('radio_config_id_seq'::regclass),
  station_id integer DEFAULT 1,
  enabled boolean DEFAULT false,
  api_key text DEFAULT ''::text,
  talkgroups jsonb DEFAULT '[]'::jsonb,
  dispatch_keywords jsonb DEFAULT '[]'::jsonb,
  whisper_mode text DEFAULT 'cloud'::text,
  retention_days integer DEFAULT 30,
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.radio_log (
  id integer NOT NULL DEFAULT nextval('radio_log_id_seq'::regclass),
  station_id integer DEFAULT 1,
  "timestamp" timestamp with time zone DEFAULT now(),
  talkgroup text DEFAULT ''::text,
  talkgroup_id integer,
  transcript text NOT NULL,
  confidence real DEFAULT 1.0,
  duration_sec real DEFAULT 0,
  audio_url text DEFAULT ''::text,
  is_dispatch boolean DEFAULT false,
  priority text DEFAULT 'normal'::text,
  source text DEFAULT 'sdr'::text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.recall_events (
  id integer NOT NULL DEFAULT nextval('recall_events_id_seq'::regclass),
  station_id integer DEFAULT 1,
  level text NOT NULL DEFAULT 'additional'::text,
  incident_type text DEFAULT ''::text,
  location text DEFAULT ''::text,
  message text DEFAULT ''::text,
  issued_by text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.recall_responses (
  id integer NOT NULL DEFAULT nextval('recall_responses_id_seq'::regclass),
  recall_id integer NOT NULL,
  member_id integer NOT NULL,
  member_name text NOT NULL,
  response text NOT NULL,
  eta text DEFAULT ''::text,
  responded_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment (
  id integer NOT NULL DEFAULT nextval('recruitment_id_seq'::regclass),
  name text NOT NULL,
  phone text DEFAULT ''::text,
  email text DEFAULT ''::text,
  address text DEFAULT ''::text,
  dob text,
  source text DEFAULT ''::text,
  recruiter text DEFAULT ''::text,
  stage text DEFAULT 'Prospect'::text,
  "dateAdded" text NOT NULL,
  "stageHistory" text DEFAULT '[]'::text,
  checklist text DEFAULT '{}'::text,
  notes text DEFAULT ''::text,
  "interviewDate" text DEFAULT ''::text,
  "physicalDate" text DEFAULT ''::text,
  "orientationDate" text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.run_lists (
  id integer NOT NULL DEFAULT nextval('run_lists_id_seq'::regclass),
  station_id integer NOT NULL,
  date text NOT NULL,
  payload jsonb NOT NULL,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.scenario_completions (
  id integer NOT NULL DEFAULT nextval('scenario_completions_id_seq'::regclass),
  station_id integer DEFAULT 1,
  user_id integer,
  member_name text DEFAULT ''::text,
  scenario_id text NOT NULL,
  score integer DEFAULT 0,
  passed boolean DEFAULT false,
  completed_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.shift_patterns (
  id integer NOT NULL DEFAULT nextval('shift_patterns_id_seq'::regclass),
  name text NOT NULL,
  "shiftType" text NOT NULL,
  "startDate" text NOT NULL,
  "endDate" text,
  "repeatRule" text NOT NULL DEFAULT 'weekly'::text,
  "repeatDays" text DEFAULT '[]'::text,
  "memberIds" text DEFAULT '[]'::text,
  "minCrew" integer DEFAULT 3,
  "isActive" boolean DEFAULT true,
  notes text DEFAULT ''::text,
  station_id integer DEFAULT 1,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  platoon text DEFAULT ''::text,
  cycle_type text DEFAULT ''::text,
  cycle_on integer DEFAULT 0,
  cycle_off integer DEFAULT 0,
  kelly_day_interval integer DEFAULT 0,
  anchor_date text DEFAULT ''::text,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.shift_swaps (
  id integer NOT NULL DEFAULT nextval('shift_swaps_id_seq'::regclass),
  "shiftId" integer NOT NULL,
  "requesterId" integer NOT NULL,
  "requesterName" text NOT NULL,
  "coveredById" integer,
  "coveredByName" text,
  status text DEFAULT 'Open'::text,
  reason text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  station_id integer DEFAULT 1,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.shift_trades (
  id integer NOT NULL DEFAULT nextval('shift_trades_id_seq'::regclass),
  station_id integer NOT NULL,
  requesting_member_id integer NOT NULL,
  covering_member_id integer,
  original_shift_id integer NOT NULL,
  payback_shift_id integer,
  trade_date text NOT NULL,
  payback_date text DEFAULT ''::text,
  status text DEFAULT 'pending'::text,
  ot_impact_hours numeric DEFAULT 0,
  flsa_period_hours_requester numeric DEFAULT 0,
  flsa_period_hours_coverer numeric DEFAULT 0,
  notes text DEFAULT ''::text,
  approved_by text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.shifts (
  id integer NOT NULL DEFAULT nextval('shifts_id_seq'::regclass),
  date text NOT NULL,
  "shiftType" text NOT NULL,
  crew text DEFAULT '[]'::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  "patternId" integer,
  "memberIds" text DEFAULT '[]'::text,
  "isOverride" boolean DEFAULT false,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.sogs (
  id integer NOT NULL DEFAULT nextval('sogs_id_seq'::regclass),
  number text DEFAULT ''::text,
  title text NOT NULL,
  category text DEFAULT 'Operations'::text,
  status text DEFAULT 'Active'::text,
  version text DEFAULT '1.0'::text,
  "effectiveDate" text,
  "reviewDate" text,
  "lastReviewedDate" text,
  author text DEFAULT ''::text,
  "approvedBy" text DEFAULT ''::text,
  summary text DEFAULT ''::text,
  content text DEFAULT ''::text,
  tags text DEFAULT '[]'::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.station_log (
  id integer NOT NULL DEFAULT nextval('station_log_id_seq'::regclass),
  date text NOT NULL,
  shift text DEFAULT 'Day'::text,
  "officerOnDuty" text DEFAULT ''::text,
  "membersOnDuty" text DEFAULT '[]'::text,
  "weatherConditions" text DEFAULT ''::text,
  "callCount" integer DEFAULT 0,
  "apparatusChecked" boolean DEFAULT false,
  "stationChecked" boolean DEFAULT false,
  events text DEFAULT '[]'::text,
  visitors text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.stations (
  id integer NOT NULL DEFAULT nextval('stations_id_seq'::regclass),
  name text NOT NULL,
  fdid text DEFAULT ''::text,
  address text DEFAULT ''::text,
  city text DEFAULT ''::text,
  state text DEFAULT ''::text,
  zip text DEFAULT ''::text,
  phone text DEFAULT ''::text,
  email text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  seeded_at timestamp with time zone,
  flsa_work_period integer DEFAULT 7,
  flsa_ot_threshold numeric DEFAULT 40,
  flsa_period_start text DEFAULT ''::text,
  dept_type text DEFAULT 'volunteer'::text,
  min_staffing_block boolean DEFAULT false,
  anthropic_api_key text DEFAULT ''::text,
  tv_pin text,
  ai_daily_token_budget integer,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.timesheets (
  id integer NOT NULL DEFAULT nextval('timesheets_id_seq'::regclass),
  station_id integer NOT NULL DEFAULT 1,
  member_id integer NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  regular_hours numeric(6,2) DEFAULT 0,
  ot_hours numeric(6,2) DEFAULT 0,
  leave_hours numeric(6,2) DEFAULT 0,
  trade_hours numeric(6,2) DEFAULT 0,
  total_hours numeric(6,2) DEFAULT 0,
  flsa_period text DEFAULT ''::text,
  status text DEFAULT 'draft'::text,
  approved_by text DEFAULT ''::text,
  approved_at timestamp with time zone,
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.training (
  id integer NOT NULL DEFAULT nextval('training_id_seq'::regclass),
  "memberId" integer DEFAULT 0,
  "memberName" text DEFAULT ''::text,
  "courseName" text NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'Passed'::text,
  "completedDate" text,
  "expiresDate" text,
  hours real DEFAULT 0,
  instructor text DEFAULT ''::text,
  location text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  delivery_method text DEFAULT 'Classroom'::text,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.training_course_completions (
  id integer NOT NULL DEFAULT nextval('training_course_completions_id_seq'::regclass),
  station_id integer NOT NULL DEFAULT 1,
  course_id integer,
  user_id integer,
  member_name text DEFAULT ''::text,
  quiz_score integer DEFAULT 0,
  quiz_passed boolean DEFAULT false,
  ceu_awarded numeric(4,1) DEFAULT 0,
  attempts integer DEFAULT 1,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  certificate_id text DEFAULT ''::text,
  source text DEFAULT 'internal'::text,
  external_ref text DEFAULT ''::text,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.training_courses (
  id integer NOT NULL DEFAULT nextval('training_courses_id_seq'::regclass),
  station_id integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  description text DEFAULT ''::text,
  video_url text DEFAULT ''::text,
  video_type text DEFAULT 'youtube'::text,
  iso_category text DEFAULT 'general-ceu'::text,
  ceu_hours numeric(4,1) DEFAULT 0,
  duration_minutes integer DEFAULT 0,
  level text DEFAULT 'awareness'::text,
  passing_score integer DEFAULT 80,
  instructor text DEFAULT ''::text,
  provider text DEFAULT ''::text,
  tags jsonb DEFAULT '[]'::jsonb,
  prerequisites jsonb DEFAULT '[]'::jsonb,
  quiz jsonb DEFAULT '[]'::jsonb,
  source text DEFAULT 'department'::text,
  external_id text DEFAULT ''::text,
  active boolean DEFAULT true,
  created_by text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.training_plans (
  id integer NOT NULL DEFAULT nextval('training_plans_id_seq'::regclass),
  station_id integer NOT NULL DEFAULT 1,
  title text NOT NULL DEFAULT ''::text,
  year integer DEFAULT EXTRACT(year FROM now()),
  description text DEFAULT ''::text,
  category text DEFAULT 'general'::text,
  target_hours numeric(6,1) DEFAULT 0,
  completed_hours numeric(6,1) DEFAULT 0,
  objectives jsonb DEFAULT '[]'::jsonb,
  schedule jsonb DEFAULT '[]'::jsonb,
  assigned_to jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'planned'::text,
  priority text DEFAULT 'normal'::text,
  created_by text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.unit_locations (
  id integer NOT NULL DEFAULT nextval('unit_locations_id_seq'::regclass),
  apparatus_id integer NOT NULL,
  station_id integer NOT NULL,
  department_id integer NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  heading real,
  speed real,
  accuracy real,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.unit_status_history (
  id integer NOT NULL DEFAULT nextval('unit_status_history_id_seq'::regclass),
  station_id integer NOT NULL DEFAULT 1,
  apparatus_id integer,
  designation text NOT NULL,
  incident_id integer,
  status text NOT NULL,
  changed_by integer,
  changed_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.unit_statuses (
  id integer NOT NULL DEFAULT nextval('unit_statuses_id_seq'::regclass),
  station_id integer NOT NULL DEFAULT 1,
  apparatus_id integer,
  designation text NOT NULL,
  status text NOT NULL DEFAULT 'in_service'::text,
  incident_id integer,
  updated_by integer,
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.users (
  id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  username text NOT NULL,
  email text DEFAULT ''::text,
  name text NOT NULL,
  initials text NOT NULL,
  role text DEFAULT 'member'::text,
  "passwordHash" text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now(),
  preferences jsonb DEFAULT '{}'::jsonb,
  station_id integer DEFAULT 1,
  language character varying(5) DEFAULT 'en'::character varying,
  email_verified boolean NOT NULL DEFAULT false,
  email_verify_token_hash text,
  email_verify_sent_at timestamp with time zone,
  apparatus_id integer,
  external_id text
);

CREATE TABLE IF NOT EXISTS public.vacancy_fill (
  id integer NOT NULL DEFAULT nextval('vacancy_fill_id_seq'::regclass),
  station_id integer DEFAULT 1,
  shift_date text NOT NULL,
  shift_name text DEFAULT ''::text,
  "position" text DEFAULT ''::text,
  callout_member_id integer,
  callout_member_name text DEFAULT ''::text,
  callout_reason text DEFAULT ''::text,
  status text DEFAULT 'open'::text,
  priority text DEFAULT 'normal'::text,
  filled_by_id integer,
  filled_by_name text DEFAULT ''::text,
  filled_at timestamp with time zone,
  notifications_sent integer DEFAULT 0,
  candidates_contacted text DEFAULT '[]'::text,
  candidates_declined text DEFAULT '[]'::text,
  notes text DEFAULT ''::text,
  created_by text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.volunteer_hours (
  id integer NOT NULL DEFAULT nextval('volunteer_hours_id_seq'::regclass),
  "memberId" integer NOT NULL,
  "memberName" text NOT NULL,
  date text NOT NULL,
  "activityType" text NOT NULL,
  hours real DEFAULT 0,
  description text DEFAULT ''::text,
  reference text DEFAULT ''::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.weather_cache (
  lat_key numeric NOT NULL,
  lng_key numeric NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id integer NOT NULL DEFAULT nextval('webhook_deliveries_id_seq'::regclass),
  subscription_id integer,
  station_id integer DEFAULT 1,
  event text NOT NULL,
  payload jsonb,
  response_status integer,
  response_body text DEFAULT ''::text,
  attempt integer DEFAULT 1,
  delivered boolean DEFAULT false,
  error text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
  id integer NOT NULL DEFAULT nextval('webhook_subscriptions_id_seq'::regclass),
  station_id integer DEFAULT 1,
  name text NOT NULL DEFAULT ''::text,
  url text NOT NULL,
  secret text DEFAULT ''::text,
  events jsonb DEFAULT '["*"]'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb,
  enabled boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.wellness (
  id integer NOT NULL DEFAULT nextval('wellness_id_seq'::regclass),
  "memberId" integer NOT NULL,
  "memberName" text NOT NULL,
  "bloodType" text DEFAULT ''::text,
  "medicalRestrictions" text DEFAULT ''::text,
  "physicalDue" text,
  "scbaFitDue" text,
  physicals text DEFAULT '[]'::text,
  "scbaFitTests" text DEFAULT '[]'::text,
  vaccinations text DEFAULT '[]'::text,
  exposures text DEFAULT '[]'::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  station_id integer DEFAULT 1,
  department_id integer
);

CREATE TABLE IF NOT EXISTS public.workflow_tasks (
  id integer NOT NULL DEFAULT nextval('workflow_tasks_id_seq'::regclass),
  station_id integer DEFAULT 1,
  user_id integer,
  title text NOT NULL,
  task_type text NOT NULL DEFAULT 'incident_report'::text,
  target_module text NOT NULL DEFAULT 'incidents'::text,
  target_record_id integer,
  status text NOT NULL DEFAULT 'active'::text,
  checklist jsonb DEFAULT '[]'::jsonb,
  ai_drafts jsonb DEFAULT '{}'::jsonb,
  conversation jsonb DEFAULT '[]'::jsonb,
  deadline timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  department_id integer
);

-- ===== CONSTRAINTS =====
ALTER TABLE public.active_boards ADD CONSTRAINT active_boards_pkey PRIMARY KEY (station_id);
ALTER TABLE public.active_resources ADD CONSTRAINT active_resources_pkey PRIMARY KEY (id);
ALTER TABLE public.activity_entries ADD CONSTRAINT activity_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.after_action_reports ADD CONSTRAINT after_action_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (id);
ALTER TABLE public.apparatus ADD CONSTRAINT apparatus_pkey PRIMARY KEY (id);
ALTER TABLE public.apparatus_assignments ADD CONSTRAINT apparatus_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.apparatus_oos ADD CONSTRAINT apparatus_oos_pkey PRIMARY KEY (id);
ALTER TABLE public.apparatus_positions ADD CONSTRAINT apparatus_positions_pkey PRIMARY KEY (id);
ALTER TABLE public.assets ADD CONSTRAINT assets_pkey PRIMARY KEY (id);
ALTER TABLE public.assistant_alerts ADD CONSTRAINT assistant_alerts_pkey PRIMARY KEY (id);
ALTER TABLE public.assistant_feedback ADD CONSTRAINT assistant_feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.assistant_preferences ADD CONSTRAINT assistant_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.attachments ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.budget_lines ADD CONSTRAINT budget_lines_pkey PRIMARY KEY (id);
ALTER TABLE public.budget_transactions ADD CONSTRAINT budget_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.bulletins ADD CONSTRAINT bulletins_pkey PRIMARY KEY (id);
ALTER TABLE public.cad_alerts ADD CONSTRAINT cad_alerts_pkey PRIMARY KEY (id);
ALTER TABLE public.cad_connections ADD CONSTRAINT cad_connections_pkey PRIMARY KEY (id);
ALTER TABLE public.cadets ADD CONSTRAINT cadets_pkey PRIMARY KEY (id);
ALTER TABLE public.calendar_subscriptions ADD CONSTRAINT calendar_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.checklist_completions ADD CONSTRAINT checklist_completions_pkey PRIMARY KEY (id);
ALTER TABLE public.checklist_templates ADD CONSTRAINT checklist_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.community_events ADD CONSTRAINT community_events_pkey PRIMARY KEY (id);
ALTER TABLE public.correspondence ADD CONSTRAINT correspondence_pkey PRIMARY KEY (id);
ALTER TABLE public.courses ADD CONSTRAINT courses_pkey PRIMARY KEY (id);
ALTER TABLE public.coverage_outreach ADD CONSTRAINT coverage_outreach_pkey PRIMARY KEY (id);
ALTER TABLE public.crr_programs ADD CONSTRAINT crr_programs_pkey PRIMARY KEY (id);
ALTER TABLE public.crr_visits ADD CONSTRAINT crr_visits_pkey PRIMARY KEY (id);
ALTER TABLE public.cylinders ADD CONSTRAINT cylinders_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_staffing ADD CONSTRAINT daily_staffing_pkey PRIMARY KEY (id);
ALTER TABLE public.departments ADD CONSTRAINT departments_pkey PRIMARY KEY (id);
ALTER TABLE public.dept_documents ADD CONSTRAINT dept_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.donations ADD CONSTRAINT donations_pkey PRIMARY KEY (id);
ALTER TABLE public.drills ADD CONSTRAINT drills_pkey PRIMARY KEY (id);
ALTER TABLE public.equipment_checkout ADD CONSTRAINT equipment_checkout_pkey PRIMARY KEY (id);
ALTER TABLE public.events ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE public.exam_assignments ADD CONSTRAINT exam_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.exam_submissions ADD CONSTRAINT exam_submissions_pkey PRIMARY KEY (id);
ALTER TABLE public.exams ADD CONSTRAINT exams_pkey PRIMARY KEY (id);
ALTER TABLE public.expo_push_tokens ADD CONSTRAINT expo_push_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.exposure_records ADD CONSTRAINT exposure_records_pkey PRIMARY KEY (id);
ALTER TABLE public.fi_inspections ADD CONSTRAINT fi_inspections_pkey PRIMARY KEY (id);
ALTER TABLE public.fi_permits ADD CONSTRAINT fi_permits_pkey PRIMARY KEY (id);
ALTER TABLE public.fi_properties ADD CONSTRAINT fi_properties_pkey PRIMARY KEY (id);
ALTER TABLE public.fill_stations ADD CONSTRAINT fill_stations_pkey PRIMARY KEY (id);
ALTER TABLE public.fs_hazmat_guides ADD CONSTRAINT fs_hazmat_guides_pkey PRIMARY KEY (id);
ALTER TABLE public.fs_hazmat_incident_audit ADD CONSTRAINT fs_hazmat_incident_audit_pkey PRIMARY KEY (id);
ALTER TABLE public.fs_hazmat_incidents ADD CONSTRAINT fs_hazmat_incidents_pkey PRIMARY KEY (id);
ALTER TABLE public.fs_hazmat_isolation_distances ADD CONSTRAINT fs_hazmat_isolation_distances_pkey PRIMARY KEY (id);
ALTER TABLE public.fs_hazmat_materials ADD CONSTRAINT fs_hazmat_materials_pkey PRIMARY KEY (id);
ALTER TABLE public.fs_hazmat_table3_distances ADD CONSTRAINT fs_hazmat_table3_distances_pkey PRIMARY KEY (id);
ALTER TABLE public.fto_evaluations ADD CONSTRAINT fto_evaluations_pkey PRIMARY KEY (id);
ALTER TABLE public.fto_observations ADD CONSTRAINT fto_observations_pkey PRIMARY KEY (id);
ALTER TABLE public.fundraising_campaigns ADD CONSTRAINT fundraising_campaigns_pkey PRIMARY KEY (id);
ALTER TABLE public.grants ADD CONSTRAINT grants_pkey PRIMARY KEY (id);
ALTER TABLE public.grievances ADD CONSTRAINT grievances_pkey PRIMARY KEY (id);
ALTER TABLE public.hydrants ADD CONSTRAINT hydrants_pkey PRIMARY KEY (id);
ALTER TABLE public.incident_costs ADD CONSTRAINT incident_costs_pkey PRIMARY KEY (id);
ALTER TABLE public.incident_responses ADD CONSTRAINT incident_responses_pkey PRIMARY KEY (id);
ALTER TABLE public.incidents ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);
ALTER TABLE public.investigations ADD CONSTRAINT investigations_pkey PRIMARY KEY (id);
ALTER TABLE public.knox_access_log ADD CONSTRAINT knox_access_log_pkey PRIMARY KEY (id);
ALTER TABLE public.knox_boxes ADD CONSTRAINT knox_boxes_pkey PRIMARY KEY (id);
ALTER TABLE public.knox_inspections ADD CONSTRAINT knox_inspections_pkey PRIMARY KEY (id);
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.license_config ADD CONSTRAINT license_config_pkey PRIMARY KEY (department_id);
ALTER TABLE public.licenses ADD CONSTRAINT licenses_pkey PRIMARY KEY (license_id);
ALTER TABLE public.maintenance ADD CONSTRAINT maintenance_pkey PRIMARY KEY (id);
ALTER TABLE public.meeting_minutes ADD CONSTRAINT meeting_minutes_pkey PRIMARY KEY (id);
ALTER TABLE public.member_availability ADD CONSTRAINT member_availability_pkey PRIMARY KEY (id);
ALTER TABLE public.member_qualifications ADD CONSTRAINT member_qualifications_pkey PRIMARY KEY (id);
ALTER TABLE public.members ADD CONSTRAINT members_pkey PRIMARY KEY (id);
ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE public.module_completions ADD CONSTRAINT module_completions_pkey PRIMARY KEY (id);
ALTER TABLE public.mutual_aid ADD CONSTRAINT mutual_aid_pkey PRIMARY KEY (id);
ALTER TABLE public.mutual_aid_agreements ADD CONSTRAINT mutual_aid_agreements_pkey PRIMARY KEY (id);
ALTER TABLE public.nfirs_reports ADD CONSTRAINT nfirs_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.ng911_calls ADD CONSTRAINT ng911_calls_pkey PRIMARY KEY (id);
ALTER TABLE public.of_department_join_codes ADD CONSTRAINT of_department_join_codes_pkey PRIMARY KEY (id);
ALTER TABLE public.of_member_invites ADD CONSTRAINT of_member_invites_pkey PRIMARY KEY (id);
ALTER TABLE public.of_rank_notifications ADD CONSTRAINT of_rank_notifications_pkey PRIMARY KEY (department_id, tier, notif_type);
ALTER TABLE public.of_schema_migrations ADD CONSTRAINT of_schema_migrations_pkey PRIMARY KEY (filename);
ALTER TABLE public.of_user_departments ADD CONSTRAINT of_user_departments_pkey PRIMARY KEY (id);
ALTER TABLE public.ot_records ADD CONSTRAINT ot_records_pkey PRIMARY KEY (id);
ALTER TABLE public.pay_entries ADD CONSTRAINT pay_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.personnel_actions ADD CONSTRAINT personnel_actions_pkey PRIMARY KEY (id);
ALTER TABLE public.policy_acknowledgments ADD CONSTRAINT policy_acknowledgments_pkey PRIMARY KEY (id);
ALTER TABLE public.pre_plans ADD CONSTRAINT pre_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.radio_config ADD CONSTRAINT radio_config_pkey PRIMARY KEY (id);
ALTER TABLE public.radio_log ADD CONSTRAINT radio_log_pkey PRIMARY KEY (id);
ALTER TABLE public.recall_events ADD CONSTRAINT recall_events_pkey PRIMARY KEY (id);
ALTER TABLE public.recall_responses ADD CONSTRAINT recall_responses_pkey PRIMARY KEY (id);
ALTER TABLE public.recruitment ADD CONSTRAINT recruitment_pkey PRIMARY KEY (id);
ALTER TABLE public.run_lists ADD CONSTRAINT run_lists_pkey PRIMARY KEY (id);
ALTER TABLE public.scenario_completions ADD CONSTRAINT scenario_completions_pkey PRIMARY KEY (id);
ALTER TABLE public.shift_patterns ADD CONSTRAINT shift_patterns_pkey PRIMARY KEY (id);
ALTER TABLE public.shift_swaps ADD CONSTRAINT shift_swaps_pkey PRIMARY KEY (id);
ALTER TABLE public.shift_trades ADD CONSTRAINT shift_trades_pkey PRIMARY KEY (id);
ALTER TABLE public.shifts ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);
ALTER TABLE public.sogs ADD CONSTRAINT sogs_pkey PRIMARY KEY (id);
ALTER TABLE public.station_log ADD CONSTRAINT station_log_pkey PRIMARY KEY (id);
ALTER TABLE public.stations ADD CONSTRAINT stations_pkey PRIMARY KEY (id);
ALTER TABLE public.timesheets ADD CONSTRAINT timesheets_pkey PRIMARY KEY (id);
ALTER TABLE public.training ADD CONSTRAINT training_pkey PRIMARY KEY (id);
ALTER TABLE public.training_course_completions ADD CONSTRAINT training_course_completions_pkey PRIMARY KEY (id);
ALTER TABLE public.training_courses ADD CONSTRAINT training_courses_pkey PRIMARY KEY (id);
ALTER TABLE public.training_plans ADD CONSTRAINT training_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.unit_locations ADD CONSTRAINT unit_locations_pkey PRIMARY KEY (id);
ALTER TABLE public.unit_status_history ADD CONSTRAINT unit_status_history_pkey PRIMARY KEY (id);
ALTER TABLE public.unit_statuses ADD CONSTRAINT unit_statuses_pkey PRIMARY KEY (id);
ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.vacancy_fill ADD CONSTRAINT vacancy_fill_pkey PRIMARY KEY (id);
ALTER TABLE public.volunteer_hours ADD CONSTRAINT volunteer_hours_pkey PRIMARY KEY (id);
ALTER TABLE public.weather_cache ADD CONSTRAINT weather_cache_pkey PRIMARY KEY (lat_key, lng_key);
ALTER TABLE public.webhook_deliveries ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE public.webhook_subscriptions ADD CONSTRAINT webhook_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.wellness ADD CONSTRAINT wellness_pkey PRIMARY KEY (id);
ALTER TABLE public.workflow_tasks ADD CONSTRAINT workflow_tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.assistant_preferences ADD CONSTRAINT assistant_preferences_station_id_member_id_key UNIQUE (station_id, member_id);
ALTER TABLE public.cad_alerts ADD CONSTRAINT cad_alerts_alert_id_key UNIQUE (alert_id);
ALTER TABLE public.calendar_subscriptions ADD CONSTRAINT calendar_subscriptions_cal_token_key UNIQUE (cal_token);
ALTER TABLE public.exam_assignments ADD CONSTRAINT exam_assignments_station_id_exam_id_user_id_key UNIQUE (station_id, exam_id, user_id);
ALTER TABLE public.exam_submissions ADD CONSTRAINT exam_submissions_station_id_exam_id_user_id_key UNIQUE (station_id, exam_id, user_id);
ALTER TABLE public.expo_push_tokens ADD CONSTRAINT expo_push_tokens_token_key UNIQUE (token);
ALTER TABLE public.fs_hazmat_guides ADD CONSTRAINT fs_hazmat_guides_guide_number_key UNIQUE (guide_number);
ALTER TABLE public.fs_hazmat_table3_distances ADD CONSTRAINT fs_hazmat_table3_distances_un_number_container_type_key UNIQUE (un_number, container_type);
ALTER TABLE public.fto_evaluations ADD CONSTRAINT fto_evaluations_station_id_member_id_skill_id_key UNIQUE (station_id, member_id, skill_id);
ALTER TABLE public.hydrants ADD CONSTRAINT "hydrants_hydrantNumber_key" UNIQUE ("hydrantNumber");
ALTER TABLE public.incident_responses ADD CONSTRAINT incident_responses_station_id_incident_id_user_id_key UNIQUE (station_id, incident_id, user_id);
ALTER TABLE public.licenses ADD CONSTRAINT licenses_jti_key UNIQUE (jti);
ALTER TABLE public.licenses ADD CONSTRAINT licenses_stripe_invoice_id_key UNIQUE (stripe_invoice_id);
ALTER TABLE public.member_availability ADD CONSTRAINT member_availability_station_id_user_id_key UNIQUE (station_id, user_id);
ALTER TABLE public.members ADD CONSTRAINT members_cal_token_key UNIQUE (cal_token);
ALTER TABLE public.module_completions ADD CONSTRAINT module_completions_station_id_user_id_module_id_key UNIQUE (station_id, user_id, module_id);
ALTER TABLE public.of_user_departments ADD CONSTRAINT of_user_departments_user_id_department_id_key UNIQUE (user_id, department_id);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE public.radio_config ADD CONSTRAINT radio_config_station_id_key UNIQUE (station_id);
ALTER TABLE public.recall_responses ADD CONSTRAINT recall_responses_recall_id_member_id_key UNIQUE (recall_id, member_id);
ALTER TABLE public.run_lists ADD CONSTRAINT run_lists_station_id_date_key UNIQUE (station_id, date);
ALTER TABLE public.scenario_completions ADD CONSTRAINT scenario_completions_station_id_user_id_scenario_id_key UNIQUE (station_id, user_id, scenario_id);
ALTER TABLE public.training_course_completions ADD CONSTRAINT training_course_completions_station_id_course_id_user_id_key UNIQUE (station_id, course_id, user_id);
ALTER TABLE public.unit_statuses ADD CONSTRAINT unit_statuses_station_id_apparatus_id_key UNIQUE (station_id, apparatus_id);
ALTER TABLE public.users ADD CONSTRAINT users_username_key UNIQUE (username);
ALTER TABLE public.wellness ADD CONSTRAINT "wellness_memberId_key" UNIQUE ("memberId");
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'diagnosed'::text, 'resolved'::text, 'failed'::text])));
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_self_heal_status_check CHECK ((self_heal_status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text])));
ALTER TABLE public.licenses ADD CONSTRAINT licenses_product_family_check CHECK ((product_family = ANY (ARRAY['openfirehouse'::text, 'firehazmat'::text])));
ALTER TABLE public.licenses ADD CONSTRAINT licenses_tier_check CHECK ((tier = ANY (ARRAY['independent'::text, 'career_small'::text, 'career_mid'::text, 'metro'::text])));
ALTER TABLE public.licenses ADD CONSTRAINT licenses_revoked_consistency CHECK ((((status = 'active'::text) AND (revoked_at IS NULL)) OR (status <> 'active'::text)));
ALTER TABLE public.licenses ADD CONSTRAINT licenses_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'refunded'::text])));
ALTER TABLE public.licenses ADD CONSTRAINT licenses_issuer_check CHECK ((issuer = ANY (ARRAY['stripe'::text, 'dale'::text, 'comp'::text, 'free'::text])));
ALTER TABLE public.active_boards ADD CONSTRAINT active_boards_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
ALTER TABLE public.apparatus_assignments ADD CONSTRAINT apparatus_assignments_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES apparatus(id) ON DELETE CASCADE;
ALTER TABLE public.apparatus_assignments ADD CONSTRAINT apparatus_assignments_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.apparatus_assignments ADD CONSTRAINT apparatus_assignments_position_id_fkey FOREIGN KEY (position_id) REFERENCES apparatus_positions(id) ON DELETE SET NULL;
ALTER TABLE public.apparatus_assignments ADD CONSTRAINT apparatus_assignments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE;
ALTER TABLE public.apparatus_assignments ADD CONSTRAINT apparatus_assignments_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
ALTER TABLE public.apparatus_positions ADD CONSTRAINT apparatus_positions_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
ALTER TABLE public.apparatus_positions ADD CONSTRAINT apparatus_positions_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES apparatus(id) ON DELETE CASCADE;
ALTER TABLE public.assistant_feedback ADD CONSTRAINT assistant_feedback_alert_id_fkey FOREIGN KEY (alert_id) REFERENCES assistant_alerts(id) ON DELETE CASCADE;
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public.calendar_subscriptions ADD CONSTRAINT calendar_subscriptions_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.checklist_completions ADD CONSTRAINT "checklist_completions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES checklist_templates(id) ON DELETE CASCADE;
ALTER TABLE public.daily_staffing ADD CONSTRAINT daily_staffing_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.donations ADD CONSTRAINT donations_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES fundraising_campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.equipment_checkout ADD CONSTRAINT equipment_checkout_checked_out_by_fkey FOREIGN KEY (checked_out_by) REFERENCES members(id);
ALTER TABLE public.equipment_checkout ADD CONSTRAINT equipment_checkout_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id);
ALTER TABLE public.exam_assignments ADD CONSTRAINT exam_assignments_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE;
ALTER TABLE public.exam_submissions ADD CONSTRAINT exam_submissions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE;
ALTER TABLE public.expo_push_tokens ADD CONSTRAINT expo_push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.exposure_records ADD CONSTRAINT exposure_records_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;
ALTER TABLE public.exposure_records ADD CONSTRAINT exposure_records_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
ALTER TABLE public.exposure_records ADD CONSTRAINT exposure_records_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL;
ALTER TABLE public.fs_hazmat_incident_audit ADD CONSTRAINT fs_hazmat_incident_audit_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES fs_hazmat_incidents(id) ON DELETE CASCADE;
ALTER TABLE public.fs_hazmat_incident_audit ADD CONSTRAINT fs_hazmat_incident_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id);
ALTER TABLE public.fs_hazmat_incidents ADD CONSTRAINT fs_hazmat_incidents_ic_user_id_fkey FOREIGN KEY (ic_user_id) REFERENCES users(id);
ALTER TABLE public.fs_hazmat_incidents ADD CONSTRAINT fs_hazmat_incidents_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id);
ALTER TABLE public.fs_hazmat_incidents ADD CONSTRAINT fs_hazmat_incidents_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public.grievances ADD CONSTRAINT grievances_filed_by_fkey FOREIGN KEY (filed_by) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.incident_costs ADD CONSTRAINT incident_costs_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id);
ALTER TABLE public.incident_responses ADD CONSTRAINT incident_responses_position_id_fkey FOREIGN KEY (position_id) REFERENCES apparatus_positions(id) ON DELETE SET NULL;
ALTER TABLE public.incident_responses ADD CONSTRAINT incident_responses_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;
ALTER TABLE public.incident_responses ADD CONSTRAINT incident_responses_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES apparatus(id) ON DELETE SET NULL;
ALTER TABLE public.knox_access_log ADD CONSTRAINT knox_access_log_knox_box_id_fkey FOREIGN KEY (knox_box_id) REFERENCES knox_boxes(id) ON DELETE CASCADE;
ALTER TABLE public.knox_inspections ADD CONSTRAINT knox_inspections_knox_box_id_fkey FOREIGN KEY (knox_box_id) REFERENCES knox_boxes(id) ON DELETE CASCADE;
ALTER TABLE public.license_config ADD CONSTRAINT license_config_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE public.meeting_minutes ADD CONSTRAINT meeting_minutes_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id);
ALTER TABLE public.member_qualifications ADD CONSTRAINT member_qualifications_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
ALTER TABLE public.member_qualifications ADD CONSTRAINT member_qualifications_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.members ADD CONSTRAINT members_assigned_unit_id_fkey FOREIGN KEY (assigned_unit_id) REFERENCES apparatus(id) ON DELETE SET NULL;
ALTER TABLE public.members ADD CONSTRAINT members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.of_department_join_codes ADD CONSTRAINT of_department_join_codes_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE public.of_department_join_codes ADD CONSTRAINT of_department_join_codes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.of_member_invites ADD CONSTRAINT of_member_invites_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.of_member_invites ADD CONSTRAINT of_member_invites_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.of_member_invites ADD CONSTRAINT of_member_invites_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.of_member_invites ADD CONSTRAINT of_member_invites_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE public.of_user_departments ADD CONSTRAINT of_user_departments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.of_user_departments ADD CONSTRAINT of_user_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE public.ot_records ADD CONSTRAINT ot_records_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
ALTER TABLE public.ot_records ADD CONSTRAINT ot_records_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.ot_records ADD CONSTRAINT ot_records_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;
ALTER TABLE public.personnel_actions ADD CONSTRAINT personnel_actions_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
ALTER TABLE public.personnel_actions ADD CONSTRAINT personnel_actions_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;
ALTER TABLE public.policy_acknowledgments ADD CONSTRAINT policy_acknowledgments_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id);
ALTER TABLE public.recall_responses ADD CONSTRAINT recall_responses_recall_id_fkey FOREIGN KEY (recall_id) REFERENCES recall_events(id) ON DELETE CASCADE;
ALTER TABLE public.run_lists ADD CONSTRAINT run_lists_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
ALTER TABLE public.shift_trades ADD CONSTRAINT shift_trades_covering_member_id_fkey FOREIGN KEY (covering_member_id) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.shift_trades ADD CONSTRAINT shift_trades_payback_shift_id_fkey FOREIGN KEY (payback_shift_id) REFERENCES shifts(id) ON DELETE SET NULL;
ALTER TABLE public.shift_trades ADD CONSTRAINT shift_trades_requesting_member_id_fkey FOREIGN KEY (requesting_member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.shift_trades ADD CONSTRAINT shift_trades_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
ALTER TABLE public.shift_trades ADD CONSTRAINT shift_trades_original_shift_id_fkey FOREIGN KEY (original_shift_id) REFERENCES shifts(id) ON DELETE CASCADE;
ALTER TABLE public.stations ADD CONSTRAINT stations_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id);
ALTER TABLE public.timesheets ADD CONSTRAINT timesheets_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.training_course_completions ADD CONSTRAINT training_course_completions_course_id_fkey FOREIGN KEY (course_id) REFERENCES training_courses(id) ON DELETE SET NULL;
ALTER TABLE public.unit_locations ADD CONSTRAINT unit_locations_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES apparatus(id) ON DELETE CASCADE;
ALTER TABLE public.unit_statuses ADD CONSTRAINT unit_statuses_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES apparatus(id) ON DELETE CASCADE;
ALTER TABLE public.users ADD CONSTRAINT users_apparatus_id_fkey FOREIGN KEY (apparatus_id) REFERENCES apparatus(id) ON DELETE SET NULL;
ALTER TABLE public.webhook_deliveries ADD CONSTRAINT webhook_deliveries_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES webhook_subscriptions(id) ON DELETE CASCADE;

-- ===== FUNCTIONS =====
CREATE OR REPLACE FUNCTION public.of_resolve_department(p_user_id integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT department_id
  FROM public.of_user_departments
  WHERE user_id = p_user_id
  ORDER BY department_id ASC
  LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.of_cad_connection_by_webhook_secret(p_secret_hash text)
 RETURNS TABLE(connection_id integer, department_id integer, station_id integer, vendor_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT id, department_id, station_id, "vendorId"
  FROM public.cad_connections
  WHERE webhook_secret_hash = p_secret_hash
    AND COALESCE(status, '') NOT IN ('Inactive', 'disabled', 'revoked')
  ORDER BY id DESC
  LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.of_link_member(p_caller_user_id integer, p_target_user_id integer, p_department_id integer, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.of_user_departments
    WHERE user_id = p_caller_user_id AND department_id = p_department_id
      AND role IN ('chief', 'admin')
  ) THEN
    RAISE EXCEPTION 'of_link_member: caller % is not a chief/admin of department %',
      p_caller_user_id, p_department_id;
  END IF;
  IF p_target_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'of_link_member: target user % does not exist', p_target_user_id;
  END IF;
  INSERT INTO public.of_user_departments (user_id, department_id, role)
    VALUES (p_target_user_id, p_department_id, COALESCE(NULLIF(btrim(p_role), ''), 'member'))
  ON CONFLICT (user_id, department_id) DO UPDATE SET role = EXCLUDED.role;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.of_redeem_member_invite(p_token_hash text, p_password_hash text)
 RETURNS TABLE(redeemed_invite_id integer, redeemed_user_id integer, redeemed_member_id integer, redeemed_department_id integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite  int;
  v_user    int;
  v_member  int;
  v_dept    int;
BEGIN
  IF p_password_hash IS NULL OR length(p_password_hash) < 20 THEN
    RAISE EXCEPTION 'of_redeem_member_invite: password hash required';
  END IF;
  UPDATE of_member_invites
     SET used_at = now()
   WHERE token_hash = p_token_hash
     AND used_at IS NULL
     AND expires_at > now()
  RETURNING id, user_id, member_id, department_id
    INTO v_invite, v_user, v_member, v_dept;
  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'of_redeem_member_invite: invalid, used, or expired invite';
  END IF;
  UPDATE users SET "passwordHash" = p_password_hash WHERE id = v_user;
  RETURN QUERY SELECT v_invite, v_user, v_member, v_dept;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.of_register_pending_member(p_username text, p_password_hash text, p_name text, p_join_code_hash text, p_requested_rank text)
 RETURNS TABLE(new_user_id integer, new_department_id integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dept    int;
  v_station int;
  v_user    int;
  v_member_no text;
BEGIN
  IF p_username IS NULL OR length(btrim(p_username)) < 3 THEN
    RAISE EXCEPTION 'of_register_pending_member: username required (min 3 chars)';
  END IF;
  IF p_password_hash IS NULL OR length(p_password_hash) < 20 THEN
    RAISE EXCEPTION 'of_register_pending_member: password hash required';
  END IF;

  SELECT department_id INTO v_dept
    FROM of_department_join_codes
   WHERE code_hash = p_join_code_hash
     AND revoked_at IS NULL
     AND expires_at > now()
   ORDER BY created_at DESC
   LIMIT 1;
  IF v_dept IS NULL THEN
    RAISE EXCEPTION 'of_register_pending_member: invalid or expired join code';
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE username = lower(btrim(p_username))) THEN
    RAISE EXCEPTION 'of_register_pending_member: username taken' USING ERRCODE = '23505';
  END IF;

  SELECT min(id) INTO v_station FROM stations WHERE department_id = v_dept;
  IF v_station IS NULL THEN
    RAISE EXCEPTION 'of_register_pending_member: department % has no station', v_dept;
  END IF;

  INSERT INTO users (username, name, initials, role, "passwordHash", email, station_id)
    VALUES (lower(btrim(p_username)), btrim(p_name),
            upper(left(regexp_replace(coalesce(p_name,''), '[^A-Za-z]', '', 'g'), 2)),
            'member', p_password_hash, '', v_station)
    RETURNING id INTO v_user;

  SELECT 'M-' || lpad(((COALESCE(max((regexp_match("memberNumber", '^M-([0-9]+)$'))[1]::int), 0)) + 1)::text, 3, '0')
    INTO v_member_no
    FROM members WHERE department_id = v_dept;

  INSERT INTO members ("memberNumber", name, rank, role, status, joined, rank_verified, user_id, station_id, department_id)
    VALUES (v_member_no, btrim(p_name),
            COALESCE(NULLIF(btrim(p_requested_rank), ''), 'Firefighter'),
            'Firefighter', 'Active', to_char(now(), 'YYYY-MM-DD'),
            false, v_user, v_station, v_dept);

  INSERT INTO of_user_departments (user_id, department_id, role)
    VALUES (v_user, v_dept, 'member')
  ON CONFLICT (user_id, department_id) DO NOTHING;

  RETURN QUERY SELECT v_user, v_dept;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.of_station_department(p_station_id integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT department_id FROM public.stations WHERE id = p_station_id $function$
;

CREATE OR REPLACE FUNCTION public.of_sync_department_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.department_id IS NULL THEN
    NEW.department_id := COALESCE(
      (SELECT s.department_id FROM public.stations s WHERE s.id = NEW.station_id),
      NEW.station_id
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.of_provision_department(p_chief_user_id integer, p_name text, p_fdid text, p_dept_type text, p_tier text, p_mirror_station_id integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dept       int;
  v_chief_name text;
  v_member_no  text;
BEGIN
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'of_provision_department: department name is required';
  END IF;
  IF p_chief_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_chief_user_id) THEN
    RAISE EXCEPTION 'of_provision_department: chief user % does not exist', p_chief_user_id;
  END IF;

  INSERT INTO public.departments (name, fdid, dept_type, plan_tier)
    VALUES (btrim(p_name), COALESCE(p_fdid, ''), COALESCE(p_dept_type, ''), COALESCE(p_tier, ''))
    RETURNING id INTO v_dept;

  INSERT INTO public.of_user_departments (user_id, department_id, role)
    VALUES (p_chief_user_id, v_dept, 'chief')
  ON CONFLICT (user_id, department_id) DO UPDATE SET role = 'chief';

  IF NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE user_id = p_chief_user_id AND department_id = v_dept
  ) THEN
    SELECT name INTO v_chief_name FROM public.users WHERE id = p_chief_user_id;
    SELECT 'M-' || lpad(((COALESCE(max((regexp_match("memberNumber", '^M-([0-9]+)$'))[1]::int), 0)) + 1)::text, 3, '0')
      INTO v_member_no FROM public.members WHERE department_id = v_dept;
    INSERT INTO public.members
      ("memberNumber", name, rank, role, status, joined, rank_verified, user_id, station_id, department_id)
      VALUES (
        v_member_no,
        COALESCE(NULLIF(btrim(v_chief_name), ''), 'Chief'),
        'Chief', 'Chief', 'Active',
        to_char(now(), 'YYYY-MM-DD'),
        true,
        p_chief_user_id,
        COALESCE(p_mirror_station_id, (SELECT min(id) FROM public.stations WHERE department_id = v_dept)),
        v_dept
      );
  END IF;

  RETURN v_dept;
END;
$function$
;

-- ===== INDEXES =====
CREATE INDEX idx_investigations_department ON public.investigations USING btree (department_id);
CREATE INDEX idx_shifts_department ON public.shifts USING btree (department_id);
CREATE INDEX idx_calendar_subscriptions_member ON public.calendar_subscriptions USING btree (member_id);
CREATE INDEX idx_member_invites_member ON public.of_member_invites USING btree (member_id);
CREATE INDEX idx_apparatus_oos_department ON public.apparatus_oos USING btree (department_id);
CREATE INDEX idx_unit_status_history_station_incident ON public.unit_status_history USING btree (station_id, incident_id);
CREATE INDEX idx_activity_entries_department ON public.activity_entries USING btree (department_id);
CREATE INDEX idx_personnel_actions_department ON public.personnel_actions USING btree (department_id);
CREATE INDEX idx_fill_stations_department ON public.fill_stations USING btree (department_id);
CREATE INDEX idx_shift_swaps_department ON public.shift_swaps USING btree (department_id);
CREATE INDEX idx_assistant_feedback_department ON public.assistant_feedback USING btree (department_id);
CREATE INDEX idx_incidents_department ON public.incidents USING btree (department_id);
CREATE UNIQUE INDEX idx_members_user_dept ON public.members USING btree (user_id, department_id) WHERE (user_id IS NOT NULL);
CREATE INDEX idx_incident_responses_member ON public.incident_responses USING btree (member_id) WHERE (member_id IS NOT NULL);
CREATE INDEX idx_cad_connections_department ON public.cad_connections USING btree (department_id);
CREATE INDEX idx_app_assign_position ON public.apparatus_assignments USING btree (position_id);
CREATE INDEX idx_bug_reports_created ON public.bug_reports USING btree (created_at DESC);
CREATE INDEX idx_correspondence_module_record ON public.correspondence USING btree (module, record_id);
CREATE INDEX idx_vacancy_fill_department ON public.vacancy_fill USING btree (department_id);
CREATE INDEX idx_wellness_department ON public.wellness USING btree (department_id);
CREATE INDEX idx_exam_assignments_department ON public.exam_assignments USING btree (department_id);
CREATE INDEX idx_correspondence_department ON public.correspondence USING btree (department_id);
CREATE INDEX idx_hazinc_ic_user ON public.fs_hazmat_incidents USING btree (ic_user_id);
CREATE INDEX idx_recruitment_department ON public.recruitment USING btree (department_id);
CREATE INDEX idx_training_courses_department ON public.training_courses USING btree (department_id);
CREATE INDEX idx_assistant_feedback_member ON public.assistant_feedback USING btree (member_id);
CREATE INDEX idx_shift_patterns_department ON public.shift_patterns USING btree (department_id);
CREATE INDEX idx_ai_usage_department ON public.ai_usage USING btree (department_id);
CREATE INDEX idx_radio_config_department ON public.radio_config USING btree (department_id);
CREATE INDEX idx_knox_inspections_department ON public.knox_inspections USING btree (department_id);
CREATE INDEX idx_fto_evaluations_department ON public.fto_evaluations USING btree (department_id);
CREATE INDEX idx_checklist_completions_department ON public.checklist_completions USING btree (department_id);
CREATE INDEX idx_fs_hazmat_materials_name ON public.fs_hazmat_materials USING gin (to_tsvector('english'::regconfig, name));
CREATE INDEX idx_shift_trades_department ON public.shift_trades USING btree (department_id);
CREATE INDEX idx_maintenance_department ON public.maintenance USING btree (department_id);
CREATE INDEX idx_cadets_department ON public.cadets USING btree (department_id);
CREATE INDEX idx_assets_department ON public.assets USING btree (department_id);
CREATE INDEX idx_active_resources_department ON public.active_resources USING btree (department_id);
CREATE INDEX idx_radio_log_department ON public.radio_log USING btree (department_id);
CREATE INDEX idx_of_member_invites_department ON public.of_member_invites USING btree (department_id);
CREATE INDEX idx_knox_access_log_department ON public.knox_access_log USING btree (department_id);
CREATE INDEX idx_cad_connections_webhook_secret ON public.cad_connections USING btree (webhook_secret_hash);
CREATE INDEX licenses_active_status_idx ON public.licenses USING btree (status) WHERE (status = 'active'::text);
CREATE INDEX idx_dept_documents_department ON public.dept_documents USING btree (department_id);
CREATE INDEX idx_knox_boxes_department ON public.knox_boxes USING btree (department_id);
CREATE INDEX idx_members_personnel_id ON public.members USING btree (department_id, personnel_id) WHERE (personnel_id IS NOT NULL);
CREATE INDEX idx_exposure_incident ON public.exposure_records USING btree (incident_id);
CREATE INDEX idx_join_codes_hash ON public.of_department_join_codes USING btree (code_hash);
CREATE INDEX idx_community_events_department ON public.community_events USING btree (department_id);
CREATE INDEX idx_assistant_alerts_member ON public.assistant_alerts USING btree (member_id, viewed_at);
CREATE INDEX idx_training_course_completions_department ON public.training_course_completions USING btree (department_id);
CREATE UNIQUE INDEX idx_apparatus_dept_designation ON public.apparatus USING btree (department_id, designation);
CREATE INDEX idx_workflow_tasks_department ON public.workflow_tasks USING btree (department_id);
CREATE INDEX idx_fi_inspections_department ON public.fi_inspections USING btree (department_id);
CREATE INDEX idx_webhook_subscriptions_department ON public.webhook_subscriptions USING btree (department_id);
CREATE INDEX idx_hazaudit_changed_by ON public.fs_hazmat_incident_audit USING btree (changed_by);
CREATE INDEX idx_incident_responses_incident_apparatus ON public.incident_responses USING btree (incident_id, apparatus_id);
CREATE INDEX idx_app_assign_member ON public.apparatus_assignments USING btree (member_id);
CREATE INDEX idx_recall_events_department ON public.recall_events USING btree (department_id);
CREATE INDEX idx_stations_department ON public.stations USING btree (department_id);
CREATE INDEX idx_leave_requests_department ON public.leave_requests USING btree (department_id);
CREATE INDEX idx_member_invites_token ON public.of_member_invites USING btree (token_hash);
CREATE INDEX idx_member_qualifications_department ON public.member_qualifications USING btree (department_id);
CREATE INDEX idx_budget_transactions_department ON public.budget_transactions USING btree (department_id);
CREATE INDEX idx_workflow_tasks_station ON public.workflow_tasks USING btree (station_id, status);
CREATE INDEX idx_audit_log_record ON public.audit_log USING btree (table_name, record_id);
CREATE INDEX idx_grievances_filed_by ON public.grievances USING btree (filed_by);
CREATE INDEX idx_module_completions_department ON public.module_completions USING btree (department_id);
CREATE INDEX idx_fi_permits_department ON public.fi_permits USING btree (department_id);
CREATE UNIQUE INDEX idx_users_apparatus_unit ON public.users USING btree (apparatus_id) WHERE (apparatus_id IS NOT NULL);
CREATE INDEX idx_crr_programs_department ON public.crr_programs USING btree (department_id);
CREATE INDEX idx_training_department ON public.training USING btree (department_id);
CREATE INDEX idx_active_boards_department ON public.active_boards USING btree (department_id);
CREATE INDEX idx_hazinc_station ON public.fs_hazmat_incidents USING btree (station_id);
CREATE INDEX idx_pre_plans_department ON public.pre_plans USING btree (department_id);
CREATE INDEX idx_fs_hazmat_materials_class ON public.fs_hazmat_materials USING btree (hazard_class);
CREATE INDEX idx_users_email_verify_token ON public.users USING btree (email_verify_token_hash);
CREATE INDEX idx_attachments_department ON public.attachments USING btree (department_id);
CREATE INDEX idx_policy_acknowledgments_department ON public.policy_acknowledgments USING btree (department_id);
CREATE INDEX idx_volunteer_hours_department ON public.volunteer_hours USING btree (department_id);
CREATE INDEX idx_cad_alerts_station_ts ON public.cad_alerts USING btree (station_id, dispatched_at DESC);
CREATE INDEX idx_assistant_alerts_category ON public.assistant_alerts USING btree (category, member_id);
CREATE INDEX idx_incidents_station ON public.incidents USING btree (station_id);
CREATE INDEX idx_equipment_checkout_department ON public.equipment_checkout USING btree (department_id);
CREATE INDEX idx_app_assign_shift ON public.apparatus_assignments USING btree (shift_id);
CREATE INDEX idx_exposure_member ON public.exposure_records USING btree (member_id);
CREATE INDEX idx_inc_costs_station ON public.incident_costs USING btree (station_id);
CREATE INDEX idx_radio_log_station_ts ON public.radio_log USING btree (station_id, "timestamp" DESC);
CREATE INDEX idx_incident_responses_department ON public.incident_responses USING btree (department_id);
CREATE INDEX idx_webhook_deliveries_department ON public.webhook_deliveries USING btree (department_id);
CREATE INDEX idx_sogs_department ON public.sogs USING btree (department_id);
CREATE INDEX idx_donations_department ON public.donations USING btree (department_id);
CREATE INDEX idx_unit_status_history_department ON public.unit_status_history USING btree (department_id);
CREATE INDEX idx_app_pos_station ON public.apparatus_positions USING btree (station_id);
CREATE INDEX licenses_dept_email_idx ON public.licenses USING btree (dept_email);
CREATE INDEX idx_assistant_preferences_member ON public.assistant_preferences USING btree (member_id);
CREATE INDEX idx_fs_hazmat_materials_guide ON public.fs_hazmat_materials USING btree (guide_number);
CREATE INDEX idx_bulletins_department ON public.bulletins USING btree (department_id);
CREATE INDEX idx_messages_department ON public.messages USING btree (department_id);
CREATE INDEX idx_webhook_del_sub ON public.webhook_deliveries USING btree (subscription_id, created_at DESC);
CREATE INDEX idx_audit_log_department ON public.audit_log USING btree (department_id);
CREATE UNIQUE INDEX idx_members_dept_number ON public.members USING btree (department_id, "memberNumber");
CREATE INDEX idx_scenario_completions_department ON public.scenario_completions USING btree (department_id);
CREATE INDEX idx_cad_alerts_department ON public.cad_alerts USING btree (department_id);
CREATE INDEX idx_exposure_records_department ON public.exposure_records USING btree (department_id);
CREATE INDEX idx_workflow_tasks_user ON public.workflow_tasks USING btree (user_id, status);
CREATE INDEX idx_nfirs_reports_department ON public.nfirs_reports USING btree (department_id);
CREATE INDEX idx_calendar_subscriptions_department ON public.calendar_subscriptions USING btree (department_id);
CREATE INDEX idx_fs_hazmat_materials_un ON public.fs_hazmat_materials USING btree (un_number);
CREATE INDEX idx_unit_statuses_apparatus ON public.unit_statuses USING btree (apparatus_id);
CREATE INDEX licenses_stripe_customer_idx ON public.licenses USING btree (stripe_customer_id);
CREATE INDEX idx_hazmat_audit_changed_at ON public.fs_hazmat_incident_audit USING btree (changed_at);
CREATE INDEX idx_grievances_department ON public.grievances USING btree (department_id);
CREATE INDEX idx_bug_reports_self_heal ON public.bug_reports USING btree (self_heal_status);
CREATE INDEX idx_exam_submissions_department ON public.exam_submissions USING btree (department_id);
CREATE INDEX idx_of_user_departments_user ON public.of_user_departments USING btree (user_id);
CREATE INDEX idx_exposure_station ON public.exposure_records USING btree (station_id);
CREATE INDEX idx_fundraising_campaigns_department ON public.fundraising_campaigns USING btree (department_id);
CREATE INDEX idx_bug_reports_user ON public.bug_reports USING btree (user_id);
CREATE INDEX idx_members_department ON public.members USING btree (department_id);
CREATE INDEX idx_fi_properties_department ON public.fi_properties USING btree (department_id);
CREATE INDEX idx_after_action_reports_department ON public.after_action_reports USING btree (department_id);
CREATE INDEX idx_assistant_preferences_department ON public.assistant_preferences USING btree (department_id);
CREATE INDEX idx_hazmat_audit_incident ON public.fs_hazmat_incident_audit USING btree (incident_id);
CREATE INDEX idx_timesheets_department ON public.timesheets USING btree (department_id);
CREATE INDEX idx_events_department ON public.events USING btree (department_id);
CREATE INDEX idx_t3_un ON public.fs_hazmat_table3_distances USING btree (un_number);
CREATE INDEX idx_mutual_aid_agreements_department ON public.mutual_aid_agreements USING btree (department_id);
CREATE INDEX idx_station_log_department ON public.station_log USING btree (department_id);
CREATE UNIQUE INDEX idx_hazmat_iso_un_number ON public.fs_hazmat_isolation_distances USING btree (un_number);
CREATE INDEX idx_unit_locations_dept_updated ON public.unit_locations USING btree (department_id, updated_at DESC);
CREATE INDEX idx_bug_reports_status ON public.bug_reports USING btree (status);
CREATE INDEX idx_members_station ON public.members USING btree (station_id);
CREATE INDEX idx_push_subscriptions_department ON public.push_subscriptions USING btree (department_id);
CREATE INDEX idx_fs_hazmat_materials_cas ON public.fs_hazmat_materials USING btree (cas_number);
CREATE INDEX idx_member_availability_department ON public.member_availability USING btree (department_id);
CREATE INDEX idx_members_user_id ON public.members USING btree (user_id);
CREATE INDEX idx_hazinc_created_by ON public.fs_hazmat_incidents USING btree (created_by);
CREATE INDEX idx_daily_staffing_department ON public.daily_staffing USING btree (department_id);
CREATE INDEX idx_crr_visits_department ON public.crr_visits USING btree (department_id);
CREATE INDEX idx_cylinders_department ON public.cylinders USING btree (department_id);
CREATE INDEX idx_exams_department ON public.exams USING btree (department_id);
CREATE INDEX idx_assistant_alerts_department ON public.assistant_alerts USING btree (department_id);
CREATE INDEX idx_expo_push_tokens_dept ON public.expo_push_tokens USING btree (department_id);
CREATE INDEX idx_apparatus_positions_department ON public.apparatus_positions USING btree (department_id);
CREATE INDEX idx_fto_observations_department ON public.fto_observations USING btree (department_id);
CREATE INDEX idx_of_user_departments_dept ON public.of_user_departments USING btree (department_id);
CREATE UNIQUE INDEX idx_unit_locations_apparatus ON public.unit_locations USING btree (apparatus_id);
CREATE INDEX idx_ot_records_department ON public.ot_records USING btree (department_id);
CREATE INDEX idx_meeting_minutes_department ON public.meeting_minutes USING btree (department_id);
CREATE INDEX idx_pay_entries_department ON public.pay_entries USING btree (department_id);
CREATE INDEX idx_hydrants_department ON public.hydrants USING btree (department_id);
CREATE INDEX idx_apparatus_assignments_department ON public.apparatus_assignments USING btree (department_id);
CREATE UNIQUE INDEX idx_members_external_id ON public.members USING btree (department_id, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX idx_drills_department ON public.drills USING btree (department_id);
CREATE INDEX idx_attachments_module_record ON public.attachments USING btree (module, record_id);
CREATE INDEX idx_calendar_subscriptions_token ON public.calendar_subscriptions USING btree (cal_token);
CREATE INDEX idx_coverage_outreach_department ON public.coverage_outreach USING btree (department_id);
CREATE INDEX idx_app_assign_station ON public.apparatus_assignments USING btree (station_id);
CREATE INDEX licenses_expires_at_idx ON public.licenses USING btree (expires_at) WHERE (status = 'active'::text);
CREATE UNIQUE INDEX idx_incidents_station_number_active ON public.incidents USING btree (station_id, "incidentNumber") WHERE (deleted_at IS NULL);
CREATE INDEX idx_hazaudit_department ON public.fs_hazmat_incident_audit USING btree (department_id);
CREATE INDEX idx_mutual_aid_department ON public.mutual_aid USING btree (department_id);
CREATE INDEX idx_app_pos_apparatus ON public.apparatus_positions USING btree (apparatus_id);
CREATE INDEX idx_courses_department ON public.courses USING btree (department_id);
CREATE INDEX idx_apparatus_department ON public.apparatus USING btree (department_id);
CREATE INDEX idx_join_codes_dept ON public.of_department_join_codes USING btree (department_id);
CREATE INDEX idx_audit_log_station_at ON public.audit_log USING btree (station_id, at DESC);
CREATE INDEX idx_training_plans_department ON public.training_plans USING btree (department_id);
CREATE INDEX idx_unit_statuses_department ON public.unit_statuses USING btree (department_id);
CREATE INDEX idx_checklist_templates_department ON public.checklist_templates USING btree (department_id);
CREATE INDEX idx_ai_usage_station_date ON public.ai_usage USING btree (station_id, used_on);
CREATE INDEX idx_grants_department ON public.grants USING btree (department_id);
CREATE INDEX idx_app_assign_apparatus ON public.apparatus_assignments USING btree (apparatus_id);
CREATE INDEX idx_budget_lines_department ON public.budget_lines USING btree (department_id);
CREATE UNIQUE INDEX idx_users_external_id ON public.users USING btree (external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX idx_incident_costs_department ON public.incident_costs USING btree (department_id);
CREATE INDEX idx_ng911_calls_department ON public.ng911_calls USING btree (department_id);
CREATE INDEX idx_members_crew ON public.members USING btree (department_id, assigned_unit_id, assigned_group);
CREATE INDEX idx_run_lists_department ON public.run_lists USING btree (department_id);

-- ===== TRIGGERS =====
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.active_boards FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.after_action_reports FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.ai_usage FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.apparatus FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.apparatus_assignments FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.apparatus_oos FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.apparatus_positions FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.assistant_alerts FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.assistant_feedback FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.assistant_preferences FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.attachments FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.budget_lines FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.budget_transactions FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.bulletins FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.cad_alerts FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.cad_connections FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.cadets FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.calendar_subscriptions FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.checklist_completions FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.checklist_templates FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.community_events FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.correspondence FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.coverage_outreach FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.crr_programs FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.crr_visits FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.cylinders FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.daily_staffing FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.dept_documents FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.donations FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.drills FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.equipment_checkout FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.exam_assignments FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.exam_submissions FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.exposure_records FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fi_inspections FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fi_permits FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fi_properties FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fill_stations FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fs_hazmat_incidents FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fundraising_campaigns FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.grants FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.grievances FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.hydrants FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.incident_costs FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.incident_responses FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.investigations FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.knox_access_log FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.knox_boxes FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.knox_inspections FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.maintenance FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.meeting_minutes FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.member_availability FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.member_qualifications FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.module_completions FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.mutual_aid FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.mutual_aid_agreements FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.nfirs_reports FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.ot_records FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.pay_entries FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.personnel_actions FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.policy_acknowledgments FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.pre_plans FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.radio_config FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.radio_log FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.recall_events FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.recruitment FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.run_lists FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.scenario_completions FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.shift_patterns FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.shift_swaps FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.shift_trades FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.sogs FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.station_log FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.timesheets FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.training FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.training_course_completions FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.training_courses FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.training_plans FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.unit_status_history FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.unit_statuses FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.volunteer_hours FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.wellness FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.workflow_tasks FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.active_resources FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fto_evaluations FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.fto_observations FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.ng911_calls FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.vacancy_fill FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.activity_entries FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.webhook_subscriptions FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();
CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON public.webhook_deliveries FOR EACH ROW EXECUTE FUNCTION of_sync_department_id();

-- ===== RLS ENABLE =====
ALTER TABLE public.active_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.after_action_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apparatus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apparatus_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apparatus_oos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apparatus_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cad_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cad_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correspondence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_outreach ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crr_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crr_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cylinders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_staffing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dept_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_checkout ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expo_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exposure_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fi_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fi_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fi_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fill_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fs_hazmat_incident_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fs_hazmat_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fto_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fto_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fundraising_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grievances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hydrants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knox_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knox_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knox_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutual_aid ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutual_aid_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfirs_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ng911_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_department_join_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_member_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_user_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radio_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radio_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recall_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recall_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_course_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacancy_fill ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_tasks ENABLE ROW LEVEL SECURITY;

-- ===== POLICIES =====
CREATE POLICY dept_isolation ON public.active_boards AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.active_resources AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.activity_entries AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.after_action_reports AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.ai_usage AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.apparatus AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.apparatus_assignments AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.apparatus_oos AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.apparatus_positions AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.assets AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.assistant_alerts AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.assistant_feedback AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.assistant_preferences AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.attachments AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.audit_log AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.budget_lines AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.budget_transactions AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.bulletins AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.cad_alerts AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.cad_connections AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.cadets AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.calendar_subscriptions AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.checklist_completions AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.checklist_templates AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.community_events AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.correspondence AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.courses AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.coverage_outreach AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.crr_programs AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.crr_visits AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.cylinders AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.daily_staffing AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.dept_documents AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.donations AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.drills AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.equipment_checkout AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.events AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.exam_assignments AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.exam_submissions AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.exams AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.expo_push_tokens AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.exposure_records AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.fi_inspections AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.fi_permits AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.fi_properties AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.fill_stations AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.fs_hazmat_incident_audit AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.fs_hazmat_incidents AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.fto_evaluations AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.fto_observations AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.fundraising_campaigns AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.grants AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.grievances AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.hydrants AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.incident_costs AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.incident_responses AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.incidents AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.investigations AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.knox_access_log AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.knox_boxes AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.knox_inspections AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.leave_requests AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.license_config AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY shared_access ON public.licenses AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY dept_isolation ON public.maintenance AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.meeting_minutes AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.member_availability AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.member_qualifications AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.members AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.messages AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.module_completions AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.mutual_aid AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.mutual_aid_agreements AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.nfirs_reports AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.ng911_calls AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.of_department_join_codes AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.of_member_invites AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.of_user_departments AS PERMISSIVE FOR ALL TO public USING ((user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::integer)) WITH CHECK ((user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.ot_records AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.pay_entries AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.personnel_actions AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.policy_acknowledgments AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.pre_plans AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.push_subscriptions AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.radio_config AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.radio_log AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.recall_events AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.recall_responses AS PERMISSIVE FOR ALL TO public USING ((recall_id IN ( SELECT recall_events.id
   FROM recall_events
  WHERE (recall_events.department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)))) WITH CHECK ((recall_id IN ( SELECT recall_events.id
   FROM recall_events
  WHERE (recall_events.department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer))));
CREATE POLICY dept_isolation ON public.recruitment AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.run_lists AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.scenario_completions AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.shift_patterns AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.shift_swaps AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.shift_trades AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.shifts AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.sogs AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.station_log AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY bootstrap_read ON public.stations AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY dept_isolation ON public.timesheets AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.training AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.training_course_completions AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.training_courses AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.training_plans AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.unit_locations AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.unit_status_history AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.unit_statuses AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY shared_access ON public.users AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY dept_isolation ON public.vacancy_fill AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.volunteer_hours AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.webhook_deliveries AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.webhook_subscriptions AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.wellness AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));
CREATE POLICY dept_isolation ON public.workflow_tasks AS PERMISSIVE FOR ALL TO public USING ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer)) WITH CHECK ((department_id = (NULLIF(current_setting('app.department_id'::text, true), ''::text))::integer));

-- ============================================================================
-- Sequence ownership (ALTER SEQUENCE ... OWNED BY).
-- A real pg_dump emits these; the original catalog-extraction generator did
-- not, which left pg_get_serial_sequence() returning NULL on baseline-loaded
-- DBs. That silently no-op'd applyDepartmentExpand()'s reconciliation setval,
-- breaking the FIRST self-serve signup (departments_pkey collision, mislabeled
-- USERNAME_TAKEN). Restored from prod's catalog (116 owned sequences).
-- ============================================================================
ALTER SEQUENCE public.active_resources_id_seq OWNED BY public.active_resources.id;
ALTER SEQUENCE public.activity_entries_id_seq OWNED BY public.activity_entries.id;
ALTER SEQUENCE public.after_action_reports_id_seq OWNED BY public.after_action_reports.id;
ALTER SEQUENCE public.ai_usage_id_seq OWNED BY public.ai_usage.id;
ALTER SEQUENCE public.apparatus_assignments_id_seq OWNED BY public.apparatus_assignments.id;
ALTER SEQUENCE public.apparatus_id_seq OWNED BY public.apparatus.id;
ALTER SEQUENCE public.apparatus_oos_id_seq OWNED BY public.apparatus_oos.id;
ALTER SEQUENCE public.apparatus_positions_id_seq OWNED BY public.apparatus_positions.id;
ALTER SEQUENCE public.assets_id_seq OWNED BY public.assets.id;
ALTER SEQUENCE public.assistant_alerts_id_seq OWNED BY public.assistant_alerts.id;
ALTER SEQUENCE public.assistant_feedback_id_seq OWNED BY public.assistant_feedback.id;
ALTER SEQUENCE public.assistant_preferences_id_seq OWNED BY public.assistant_preferences.id;
ALTER SEQUENCE public.attachments_id_seq OWNED BY public.attachments.id;
ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;
ALTER SEQUENCE public.budget_lines_id_seq OWNED BY public.budget_lines.id;
ALTER SEQUENCE public.budget_transactions_id_seq OWNED BY public.budget_transactions.id;
ALTER SEQUENCE public.bug_reports_id_seq OWNED BY public.bug_reports.id;
ALTER SEQUENCE public.bulletins_id_seq OWNED BY public.bulletins.id;
ALTER SEQUENCE public.cad_alerts_id_seq OWNED BY public.cad_alerts.id;
ALTER SEQUENCE public.cad_connections_id_seq OWNED BY public.cad_connections.id;
ALTER SEQUENCE public.cadets_id_seq OWNED BY public.cadets.id;
ALTER SEQUENCE public.calendar_subscriptions_id_seq OWNED BY public.calendar_subscriptions.id;
ALTER SEQUENCE public.checklist_completions_id_seq OWNED BY public.checklist_completions.id;
ALTER SEQUENCE public.checklist_templates_id_seq OWNED BY public.checklist_templates.id;
ALTER SEQUENCE public.community_events_id_seq OWNED BY public.community_events.id;
ALTER SEQUENCE public.correspondence_id_seq OWNED BY public.correspondence.id;
ALTER SEQUENCE public.courses_id_seq OWNED BY public.courses.id;
ALTER SEQUENCE public.coverage_outreach_id_seq OWNED BY public.coverage_outreach.id;
ALTER SEQUENCE public.crr_programs_id_seq OWNED BY public.crr_programs.id;
ALTER SEQUENCE public.crr_visits_id_seq OWNED BY public.crr_visits.id;
ALTER SEQUENCE public.cylinders_id_seq OWNED BY public.cylinders.id;
ALTER SEQUENCE public.daily_staffing_id_seq OWNED BY public.daily_staffing.id;
ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;
ALTER SEQUENCE public.dept_documents_id_seq OWNED BY public.dept_documents.id;
ALTER SEQUENCE public.donations_id_seq OWNED BY public.donations.id;
ALTER SEQUENCE public.drills_id_seq OWNED BY public.drills.id;
ALTER SEQUENCE public.equipment_checkout_id_seq OWNED BY public.equipment_checkout.id;
ALTER SEQUENCE public.events_id_seq OWNED BY public.events.id;
ALTER SEQUENCE public.exam_assignments_id_seq OWNED BY public.exam_assignments.id;
ALTER SEQUENCE public.exam_submissions_id_seq OWNED BY public.exam_submissions.id;
ALTER SEQUENCE public.exams_id_seq OWNED BY public.exams.id;
ALTER SEQUENCE public.expo_push_tokens_id_seq OWNED BY public.expo_push_tokens.id;
ALTER SEQUENCE public.exposure_records_id_seq OWNED BY public.exposure_records.id;
ALTER SEQUENCE public.fi_inspections_id_seq OWNED BY public.fi_inspections.id;
ALTER SEQUENCE public.fi_permits_id_seq OWNED BY public.fi_permits.id;
ALTER SEQUENCE public.fi_properties_id_seq OWNED BY public.fi_properties.id;
ALTER SEQUENCE public.fill_stations_id_seq OWNED BY public.fill_stations.id;
ALTER SEQUENCE public.fs_hazmat_guides_id_seq OWNED BY public.fs_hazmat_guides.id;
ALTER SEQUENCE public.fs_hazmat_incident_audit_id_seq OWNED BY public.fs_hazmat_incident_audit.id;
ALTER SEQUENCE public.fs_hazmat_incidents_id_seq OWNED BY public.fs_hazmat_incidents.id;
ALTER SEQUENCE public.fs_hazmat_isolation_distances_id_seq OWNED BY public.fs_hazmat_isolation_distances.id;
ALTER SEQUENCE public.fs_hazmat_materials_id_seq OWNED BY public.fs_hazmat_materials.id;
ALTER SEQUENCE public.fs_hazmat_table3_distances_id_seq OWNED BY public.fs_hazmat_table3_distances.id;
ALTER SEQUENCE public.fto_evaluations_id_seq OWNED BY public.fto_evaluations.id;
ALTER SEQUENCE public.fto_observations_id_seq OWNED BY public.fto_observations.id;
ALTER SEQUENCE public.fundraising_campaigns_id_seq OWNED BY public.fundraising_campaigns.id;
ALTER SEQUENCE public.grants_id_seq OWNED BY public.grants.id;
ALTER SEQUENCE public.grievances_id_seq OWNED BY public.grievances.id;
ALTER SEQUENCE public.hydrants_id_seq OWNED BY public.hydrants.id;
ALTER SEQUENCE public.incident_costs_id_seq OWNED BY public.incident_costs.id;
ALTER SEQUENCE public.incident_responses_id_seq OWNED BY public.incident_responses.id;
ALTER SEQUENCE public.incidents_id_seq OWNED BY public.incidents.id;
ALTER SEQUENCE public.investigations_id_seq OWNED BY public.investigations.id;
ALTER SEQUENCE public.knox_access_log_id_seq OWNED BY public.knox_access_log.id;
ALTER SEQUENCE public.knox_boxes_id_seq OWNED BY public.knox_boxes.id;
ALTER SEQUENCE public.knox_inspections_id_seq OWNED BY public.knox_inspections.id;
ALTER SEQUENCE public.leave_requests_id_seq OWNED BY public.leave_requests.id;
ALTER SEQUENCE public.maintenance_id_seq OWNED BY public.maintenance.id;
ALTER SEQUENCE public.meeting_minutes_id_seq OWNED BY public.meeting_minutes.id;
ALTER SEQUENCE public.member_availability_id_seq OWNED BY public.member_availability.id;
ALTER SEQUENCE public.member_qualifications_id_seq OWNED BY public.member_qualifications.id;
ALTER SEQUENCE public.members_id_seq OWNED BY public.members.id;
ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;
ALTER SEQUENCE public.module_completions_id_seq OWNED BY public.module_completions.id;
ALTER SEQUENCE public.mutual_aid_agreements_id_seq OWNED BY public.mutual_aid_agreements.id;
ALTER SEQUENCE public.mutual_aid_id_seq OWNED BY public.mutual_aid.id;
ALTER SEQUENCE public.nfirs_reports_id_seq OWNED BY public.nfirs_reports.id;
ALTER SEQUENCE public.ng911_calls_id_seq OWNED BY public.ng911_calls.id;
ALTER SEQUENCE public.of_department_join_codes_id_seq OWNED BY public.of_department_join_codes.id;
ALTER SEQUENCE public.of_member_invites_id_seq OWNED BY public.of_member_invites.id;
ALTER SEQUENCE public.of_user_departments_id_seq OWNED BY public.of_user_departments.id;
ALTER SEQUENCE public.ot_records_id_seq OWNED BY public.ot_records.id;
ALTER SEQUENCE public.pay_entries_id_seq OWNED BY public.pay_entries.id;
ALTER SEQUENCE public.personnel_actions_id_seq OWNED BY public.personnel_actions.id;
ALTER SEQUENCE public.policy_acknowledgments_id_seq OWNED BY public.policy_acknowledgments.id;
ALTER SEQUENCE public.pre_plans_id_seq OWNED BY public.pre_plans.id;
ALTER SEQUENCE public.push_subscriptions_id_seq OWNED BY public.push_subscriptions.id;
ALTER SEQUENCE public.radio_config_id_seq OWNED BY public.radio_config.id;
ALTER SEQUENCE public.radio_log_id_seq OWNED BY public.radio_log.id;
ALTER SEQUENCE public.recall_events_id_seq OWNED BY public.recall_events.id;
ALTER SEQUENCE public.recall_responses_id_seq OWNED BY public.recall_responses.id;
ALTER SEQUENCE public.recruitment_id_seq OWNED BY public.recruitment.id;
ALTER SEQUENCE public.run_lists_id_seq OWNED BY public.run_lists.id;
ALTER SEQUENCE public.scenario_completions_id_seq OWNED BY public.scenario_completions.id;
ALTER SEQUENCE public.shift_patterns_id_seq OWNED BY public.shift_patterns.id;
ALTER SEQUENCE public.shift_swaps_id_seq OWNED BY public.shift_swaps.id;
ALTER SEQUENCE public.shift_trades_id_seq OWNED BY public.shift_trades.id;
ALTER SEQUENCE public.shifts_id_seq OWNED BY public.shifts.id;
ALTER SEQUENCE public.sogs_id_seq OWNED BY public.sogs.id;
ALTER SEQUENCE public.station_log_id_seq OWNED BY public.station_log.id;
ALTER SEQUENCE public.stations_id_seq OWNED BY public.stations.id;
ALTER SEQUENCE public.timesheets_id_seq OWNED BY public.timesheets.id;
ALTER SEQUENCE public.training_course_completions_id_seq OWNED BY public.training_course_completions.id;
ALTER SEQUENCE public.training_courses_id_seq OWNED BY public.training_courses.id;
ALTER SEQUENCE public.training_id_seq OWNED BY public.training.id;
ALTER SEQUENCE public.training_plans_id_seq OWNED BY public.training_plans.id;
ALTER SEQUENCE public.unit_locations_id_seq OWNED BY public.unit_locations.id;
ALTER SEQUENCE public.unit_status_history_id_seq OWNED BY public.unit_status_history.id;
ALTER SEQUENCE public.unit_statuses_id_seq OWNED BY public.unit_statuses.id;
ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;
ALTER SEQUENCE public.vacancy_fill_id_seq OWNED BY public.vacancy_fill.id;
ALTER SEQUENCE public.volunteer_hours_id_seq OWNED BY public.volunteer_hours.id;
ALTER SEQUENCE public.webhook_deliveries_id_seq OWNED BY public.webhook_deliveries.id;
ALTER SEQUENCE public.webhook_subscriptions_id_seq OWNED BY public.webhook_subscriptions.id;
ALTER SEQUENCE public.wellness_id_seq OWNED BY public.wellness.id;
ALTER SEQUENCE public.workflow_tasks_id_seq OWNED BY public.workflow_tasks.id;
