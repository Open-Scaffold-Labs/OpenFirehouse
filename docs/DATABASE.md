# OpenFirehouse data dictionary

_Auto-generated from `server/src/db.js`. Regenerate with `node server/scripts/generate-db-docs.js`._

89 tables. This document is the single source of truth for the database schema; if it disagrees with `db.js`, `db.js` wins. The generator runs in seconds — regenerate after any schema change.

## Tables by domain

**Identity & access** — [`cadets`](#cadets), [`members`](#members), [`push_subscriptions`](#push_subscriptions), [`recruitment`](#recruitment), [`users`](#users)

**Operations & dispatch** — [`cad_alerts`](#cad_alerts), [`cad_connections`](#cad_connections), [`incident_costs`](#incident_costs), [`incident_responses`](#incident_responses), [`incidents`](#incidents), [`mutual_aid`](#mutual_aid), [`mutual_aid_agreements`](#mutual_aid_agreements), [`nfirs_reports`](#nfirs_reports), [`recall_events`](#recall_events), [`recall_responses`](#recall_responses), [`run_lists`](#run_lists), [`station_log`](#station_log)

**Apparatus & equipment** — [`apparatus`](#apparatus), [`apparatus_assignments`](#apparatus_assignments), [`apparatus_oos`](#apparatus_oos), [`apparatus_positions`](#apparatus_positions), [`assets`](#assets), [`cylinders`](#cylinders), [`equipment_checkout`](#equipment_checkout), [`fill_stations`](#fill_stations), [`maintenance`](#maintenance)

**Pre-plans & inspections** — [`coverage_outreach`](#coverage_outreach), [`crr_programs`](#crr_programs), [`crr_visits`](#crr_visits), [`fi_inspections`](#fi_inspections), [`fi_permits`](#fi_permits), [`fi_properties`](#fi_properties), [`hydrants`](#hydrants), [`investigations`](#investigations), [`pre_plans`](#pre_plans)

**Personnel records** — [`daily_staffing`](#daily_staffing), [`exposure_records`](#exposure_records), [`leave_requests`](#leave_requests), [`member_availability`](#member_availability), [`member_qualifications`](#member_qualifications), [`ot_records`](#ot_records), [`pay_entries`](#pay_entries), [`personnel_actions`](#personnel_actions), [`shift_patterns`](#shift_patterns), [`shift_swaps`](#shift_swaps), [`shift_trades`](#shift_trades), [`shifts`](#shifts), [`timesheets`](#timesheets), [`volunteer_hours`](#volunteer_hours)

**Training & certification** — [`checklist_completions`](#checklist_completions), [`checklist_templates`](#checklist_templates), [`courses`](#courses), [`drills`](#drills), [`exam_assignments`](#exam_assignments), [`exam_submissions`](#exam_submissions), [`exams`](#exams), [`module_completions`](#module_completions), [`scenario_completions`](#scenario_completions), [`training`](#training), [`training_course_completions`](#training_course_completions), [`training_courses`](#training_courses), [`training_plans`](#training_plans)

**Policies & compliance** — [`after_action_reports`](#after_action_reports), [`dept_documents`](#dept_documents), [`grievances`](#grievances), [`policy_acknowledgments`](#policy_acknowledgments), [`sogs`](#sogs), [`wellness`](#wellness)

**Finance & administration** — [`budget_lines`](#budget_lines), [`budget_transactions`](#budget_transactions), [`bulletins`](#bulletins), [`community_events`](#community_events), [`correspondence`](#correspondence), [`donations`](#donations), [`events`](#events), [`fundraising_campaigns`](#fundraising_campaigns), [`grants`](#grants), [`meeting_minutes`](#meeting_minutes), [`messages`](#messages)

**Radio & assistant** — [`active_boards`](#active_boards), [`assistant_alerts`](#assistant_alerts), [`assistant_feedback`](#assistant_feedback), [`assistant_preferences`](#assistant_preferences), [`radio_config`](#radio_config), [`radio_log`](#radio_log), [`workflow_tasks`](#workflow_tasks)

**Reference & system** — [`attachments`](#attachments), [`calendar_subscriptions`](#calendar_subscriptions), [`stations`](#stations)

---

## `active_boards`

Active boards table (Command Board incident tracking)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `station_id` | `INTEGER` | **primary key** REFERENCES stations(id) ON DELETE CASCADE |
| `incident_type` | `TEXT` |  |
| `address` | `TEXT` |  |
| `dispatched_at` | `TIMESTAMPTZ` |  |
| `personnel_count` | `INTEGER` | default 0 |
| `units_count` | `INTEGER` | default 0 |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `after_action_reports`

Incident after-action reports

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | **not null** default 1 |
| `incident_id` | `INTEGER` |  |
| `incident_date` | `DATE` |  |
| `incident_type` | `TEXT` | default '' |
| `location` | `TEXT` | default '' |
| `title` | `TEXT` | **not null** default '' |
| `summary` | `TEXT` | default '' |
| `strengths` | `JSONB` | default '[]' |
| `improvements` | `JSONB` | default '[]' |
| `action_items` | `JSONB` | default '[]' |
| `lessons_learned` | `TEXT` | default '' |
| `attendees` | `JSONB` | default '[]' |
| `conducted_by` | `TEXT` | default '' |
| `conducted_date` | `DATE` | default CURRENT_DATE |
| `status` | `TEXT` | default 'draft' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `apparatus`

Apparatus table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `designation` | `TEXT` | **not null** **unique** |
| `type` | `TEXT` | **not null** |
| `year` | `INTEGER` | **not null** |
| `make` | `TEXT` | default '' |
| `model` | `TEXT` | default '' |
| `status` | `TEXT` | default 'In Service' |
| `mileage` | `INTEGER` | default 0 |
| `lastService` | `TEXT` | default '' |
| `nextServiceDue` | `TEXT` | default '' |
| `assignedOperator` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `apparatus_assignments`

Daily apparatus assignments — who is assigned to what apparatus/position per shift

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `shift_id` | `INTEGER` | **not null** REFERENCES shifts(id) ON DELETE CASCADE |
| `apparatus_id` | `INTEGER` | **not null** REFERENCES apparatus(id) ON DELETE CASCADE |
| `position_id` | `INTEGER` | REFERENCES apparatus_positions(id) ON DELETE SET NULL |
| `member_id` | `INTEGER` | **not null** REFERENCES members(id) ON DELETE CASCADE |
| `station_id` | `INTEGER` | **not null** REFERENCES stations(id) ON DELETE CASCADE |
| `position_name` | `TEXT` | default '' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `apparatus_oos`

Apparatus out-of-service tracking

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | **not null** default 1 |
| `apparatus_id` | `INTEGER` | **not null** |
| `reason` | `TEXT` | **not null** default '' |
| `oos_type` | `TEXT` | default 'mechanical' |
| `start_date` | `DATE` | **not null** default CURRENT_DATE |
| `end_date` | `DATE` |  |
| `estimated_return` | `DATE` |  |
| `impact_level` | `TEXT` | default 'moderate' |
| `coverage_plan` | `TEXT` | default '' |
| `reported_by` | `TEXT` | default '' |
| `status` | `TEXT` | default 'active' |
| `notes` | `TEXT` | default '' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `apparatus_positions`

Apparatus position requirements — what certs are needed for each apparatus position

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `apparatus_id` | `INTEGER` | **not null** REFERENCES apparatus(id) ON DELETE CASCADE |
| `station_id` | `INTEGER` | **not null** REFERENCES stations(id) ON DELETE CASCADE |
| `position_name` | `TEXT` | **not null** |
| `required_certs` | `TEXT` | default '[]' |
| `min_rank` | `TEXT` | default '' |
| `sort_order` | `INTEGER` | default 0 |

## `assets`

Assets table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `name` | `TEXT` | **not null** |
| `category` | `TEXT` | default '' |
| `condition` | `TEXT` | default 'Serviceable' |
| `serialNumber` | `TEXT` | default '' |
| `assignedTo` | `TEXT` |  |
| `location` | `TEXT` | default '' |
| `purchaseDate` | `TEXT` | default '' |
| `lastInspection` | `TEXT` | default '' |
| `nextInspectionDue` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `assistant_alerts`

── Personal Assistant: Alerts ──────────────────────────────────────────────

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `member_id` | `INTEGER` | **not null** |
| `category` | `TEXT` | **not null** |
| `severity` | `TEXT` | **not null** default 'info' |
| `title` | `TEXT` | **not null** |
| `description` | `TEXT` |  |
| `source_type` | `TEXT` | default 'internal_rule' |
| `source_ref` | `TEXT` |  |
| `target_module` | `TEXT` |  |
| `target_record_id` | `INTEGER` |  |
| `focus_modes` | `JSONB` | default '["on_duty","off_duty","officer_mode"]' |
| `viewed_at` | `TIMESTAMPTZ` |  |
| `acted_on` | `BOOLEAN` | default false |
| `action_taken` | `TEXT` |  |
| `suggested_action_url` | `TEXT` |  |
| `suggested_action_text` | `TEXT` |  |
| `display_priority` | `INTEGER` | default 100 |
| `expires_at` | `TIMESTAMPTZ` |  |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `assistant_feedback`

── Personal Assistant: Feedback ────────────────────────────────────────────

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `member_id` | `INTEGER` | **not null** |
| `alert_id` | `INTEGER` | REFERENCES assistant_alerts(id) ON DELETE CASCADE |
| `feedback` | `TEXT` | **not null** |
| `reason` | `TEXT` |  |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `assistant_preferences`

── Personal Assistant: Preferences ─────────────────────────────────────────

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `member_id` | `INTEGER` | **not null** |
| `focus_mode` | `TEXT` | default 'off_duty' |
| `focus_mode_auto` | `BOOLEAN` | default true |
| `alert_channels` | `JSONB` | default '{"in_app": true, "email_daily": false, "push": false}' |
| `watch_config` | `JSONB` | default '{}' |
| `email_connected` | `BOOLEAN` | default false |
| `email_provider` | `TEXT` |  |
| `daily_digest_time` | `TIME` | default '06:00' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

**Table constraints:**

- `UNIQUE(station_id, member_id)`

## `attachments`

Attachments table (document attachment system for cross-module use)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `module` | `TEXT` | **not null** |
| `record_id` | `INTEGER` |  |
| `file_name` | `TEXT` | **not null** |
| `file_url` | `TEXT` | **not null** |
| `file_type` | `TEXT` |  |
| `file_size` | `INTEGER` |  |
| `extracted_text` | `TEXT` |  |
| `ai_extracted` | `JSONB` |  |
| `description` | `TEXT` | default '' |
| `uploaded_by` | `TEXT` |  |
| `category` | `TEXT` | default 'general' |
| `is_source` | `BOOLEAN` | default false |
| `access_level` | `TEXT` | default 'all' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `budget_lines`

Budget Lines table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `lineNumber` | `TEXT` | **not null** |
| `fiscalYear` | `INTEGER` |  |
| `description` | `TEXT` | default '' |
| `category` | `TEXT` | default '' |
| `budgetedAmount` | `REAL` | default 0 |
| `status` | `TEXT` | default 'Active' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `budget_transactions`

Budget Transactions table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `budgetLineId` | `INTEGER` |  |
| `date` | `TEXT` | **not null** |
| `transactionType` | `TEXT` | default 'Purchase' |
| `description` | `TEXT` | default '' |
| `amount` | `REAL` | **not null** |
| `approvedBy` | `TEXT` | default '' |
| `vendor` | `TEXT` | default '' |
| `receiptPath` | `TEXT` | default '' |
| `status` | `TEXT` | default 'Pending' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `bulletins`

Department bulletin board / announcements

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `title` | `TEXT` | **not null** |
| `body` | `TEXT` | default '' |
| `category` | `TEXT` | default 'General' |
| `priority` | `TEXT` | default 'normal' |
| `pinned` | `BOOLEAN` | default false |
| `author_id` | `INTEGER` |  |
| `author_name` | `TEXT` | default '' |
| `expires_at` | `TIMESTAMPTZ` |  |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `cad_alerts`

Recall responses table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `alert_id` | `TEXT` | **unique** |
| `address` | `TEXT` | default '' |
| `units` | `TEXT` | default '' |
| `description` | `TEXT` | default '' |
| `details` | `TEXT` | default '' |
| `latitude` | `NUMERIC` |  |
| `longitude` | `NUMERIC` |  |
| `dispatched_at` | `TIMESTAMPTZ` | default NOW() |
| `raw` | `JSONB` |  |
| `station_id` | `INTEGER` | default 1 |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `cad_connections`

CAD Connections table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `vendorId` | `TEXT` | default '' |
| `name` | `TEXT` | **not null** |
| `status` | `TEXT` | default 'Inactive' |
| `host` | `TEXT` | default '' |
| `apiKey` | `TEXT` | default '' |
| `syncInterval` | `TEXT` | default 'Manual only' |
| `notes` | `TEXT` | default '' |
| `incidentsImported` | `INTEGER` | default 0 |
| `lastSync` | `TEXT` |  |
| `lastSyncResult` | `TEXT` | default '' |
| `fieldMap` | `TEXT` | default '{}' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `cadets`

Junior / Cadet program members

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `name` | `TEXT` | **not null** |
| `date_of_birth` | `DATE` |  |
| `parent_guardian` | `TEXT` | default '' |
| `parent_phone` | `TEXT` | default '' |
| `parent_email` | `TEXT` | default '' |
| `school` | `TEXT` | default '' |
| `enrolled_date` | `DATE` | default CURRENT_DATE |
| `status` | `TEXT` | default 'Active' |
| `rank` | `TEXT` | default 'Cadet' |
| `notes` | `TEXT` | default '' |
| `certifications` | `JSONB` | default '[]' |
| `training_hours` | `NUMERIC(8,1)` | default 0 |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `calendar_subscriptions`

iCal / Google Calendar subscription tokens — allows members to subscribe from their phones

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `member_id` | `INTEGER` | REFERENCES members(id) ON DELETE CASCADE |
| `station_id` | `INTEGER` | default 1 |
| `cal_token` | `TEXT` | **unique** **not null** |
| `tier` | `TEXT` | default 'member' |
| `categories` | `JSONB` | default '[]' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `last_fetched_at` | `TIMESTAMPTZ` |  |

## `checklist_completions`

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `templateId` | `INTEGER` | REFERENCES checklist_templates(id) ON DELETE CASCADE |
| `templateName` | `TEXT` | default '' |
| `apparatus` | `TEXT` | default '' |
| `frequency` | `TEXT` | default '' |
| `completedDate` | `TEXT` | **not null** |
| `completedBy` | `TEXT` | default '' |
| `status` | `TEXT` | default 'Pass' |
| `notes` | `TEXT` | default '' |
| `responses` | `JSONB` | default '{}' |
| `station_id` | `INTEGER` | default 1 |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |

## `checklist_templates`

Checklist templates and completions

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `name` | `TEXT` | **not null** |
| `apparatus` | `TEXT` | default '' |
| `frequency` | `TEXT` | default 'Daily' |
| `estimatedMinutes` | `INTEGER` | default 15 |
| `categories` | `JSONB` | default '[]' |
| `station_id` | `INTEGER` | default 1 |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |

## `community_events`

Community outreach events

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `title` | `TEXT` | **not null** |
| `event_type` | `TEXT` | default 'Other' |
| `date` | `DATE` |  |
| `start_time` | `TEXT` |  |
| `end_time` | `TEXT` |  |
| `location` | `TEXT` | default '' |
| `address` | `TEXT` | default '' |
| `audience_type` | `TEXT` | default 'mixed' |
| `audience_age_range` | `TEXT` | default '' |
| `estimated_attendance` | `INTEGER` | default 0 |
| `actual_attendance` | `INTEGER` |  |
| `partner_org` | `TEXT` | default '' |
| `partner_contact_name` | `TEXT` | default '' |
| `partner_contact_phone` | `TEXT` | default '' |
| `partner_contact_email` | `TEXT` | default '' |
| `apparatus_needed` | `JSONB` | default '[]' |
| `equipment_needed` | `JSONB` | default '[]' |
| `materials_needed` | `JSONB` | default '[]' |
| `assigned_members` | `JSONB` | default '[]' |
| `lead_member_id` | `INTEGER` |  |
| `safety_checklist` | `JSONB` | default '[]' |
| `safety_notes` | `TEXT` | default '' |
| `special_accommodations` | `TEXT` | default '' |
| `materials_distributed` | `JSONB` | default '[]' |
| `photos_taken` | `BOOLEAN` | default false |
| `media_coverage` | `TEXT` | default '' |
| `follow_up_notes` | `TEXT` | default '' |
| `follow_up_date` | `DATE` |  |
| `volunteer_hours` | `NUMERIC(6,1)` | default 0 |
| `detectors_installed` | `INTEGER` | default 0 |
| `cpr_certifications` | `INTEGER` | default 0 |
| `escape_plans_created` | `INTEGER` | default 0 |
| `status` | `TEXT` | default 'planned' |
| `recurring` | `TEXT` | default 'none' |
| `recurring_notes` | `TEXT` | default '' |
| `description` | `TEXT` | default '' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `correspondence`

── Correspondence Log — universal across modules ─────────────────────────

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `module` | `TEXT` | **not null** |
| `record_id` | `INTEGER` | **not null** |
| `entry_type` | `TEXT` | **not null** default 'email' |
| `from_name` | `TEXT` | default '' |
| `subject` | `TEXT` | default '' |
| `body` | `TEXT` | default '' |
| `file_name` | `TEXT` | default '' |
| `file_url` | `TEXT` | default '' |
| `file_size` | `INTEGER` | default 0 |
| `entered_by` | `TEXT` | default '' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `courses`

Courses table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `courseName` | `TEXT` | **not null** |
| `type` | `TEXT` | default '' |
| `provider` | `TEXT` | default '' |
| `startDate` | `TEXT` |  |
| `endDate` | `TEXT` |  |
| `location` | `TEXT` | default '' |
| `certificationEarned` | `TEXT` | default '' |
| `certExpireYears` | `INTEGER` | default 0 |
| `cost` | `INTEGER` | default 0 |
| `instructor` | `TEXT` | default '' |
| `attendees` | `TEXT` | default '[]' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `coverage_outreach`

Coverage Outreach tracking

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `leaveRequestId` | `INTEGER` | **not null** |
| `shiftId` | `INTEGER` | **not null** |
| `memberId` | `INTEGER` | **not null** |
| `memberName` | `TEXT` | **not null** |
| `contactMethod` | `TEXT` | default 'sms' |
| `status` | `TEXT` | default 'Pending' |
| `sentAt` | `TIMESTAMPTZ` |  |
| `respondedAt` | `TIMESTAMPTZ` |  |
| `response` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `station_id` | `INTEGER` | default 1 |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `crr_programs`

CRR Programs table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `name` | `TEXT` | **not null** |
| `coordinator` | `TEXT` | default '' |
| `startDate` | `TEXT` |  |
| `endDate` | `TEXT` |  |
| `budget` | `REAL` |  |
| `status` | `TEXT` | default 'Active' |
| `description` | `TEXT` | default '' |
| `participants` | `TEXT` | default '[]' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `crr_visits`

CRR Visits table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `date` | `TEXT` | **not null** |
| `location` | `TEXT` | default '' |
| `reason` | `TEXT` | default '' |
| `memberPresent` | `TEXT` | default '[]' |
| `visitDuration` | `REAL` | default 0 |
| `status` | `TEXT` | default 'Completed' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `cylinders`

SCBA Cylinders table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `unitId` | `TEXT` | **not null** |
| `make` | `TEXT` | default '' |
| `model` | `TEXT` | default '' |
| `size` | `TEXT` | default '' |
| `material` | `TEXT` | default '' |
| `serial` | `TEXT` | default '' |
| `manufactureYear` | `INTEGER` | default 0 |
| `currentPressure` | `INTEGER` | default 0 |
| `maxPressure` | `INTEGER` | default 4500 |
| `lastHydroDate` | `TEXT` | default '' |
| `nextHydroDate` | `TEXT` | default '' |
| `lastInspectionDate` | `TEXT` | default '' |
| `nextInspectionDate` | `TEXT` | default '' |
| `assignedMember` | `TEXT` | default '' |
| `assignedUnit` | `TEXT` | default '' |
| `status` | `TEXT` | default 'In Service' |
| `notes` | `TEXT` | default '' |
| `fillLog` | `TEXT` | default '[]' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `daily_staffing`

Daily staffing entries — track who's on duty each day by position

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | **not null** default 1 |
| `date` | `DATE` | **not null** default CURRENT_DATE |
| `member_id` | `INTEGER` | **not null** REFERENCES members(id) ON DELETE CASCADE |
| `position` | `TEXT` | default '' |
| `apparatus_id` | `INTEGER` |  |
| `status` | `TEXT` | default 'on_duty' |
| `start_time` | `TEXT` | default '08:00' |
| `end_time` | `TEXT` | default '08:00' |
| `hours` | `NUMERIC(5,2)` | default 24 |
| `notes` | `TEXT` | default '' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `dept_documents`

Department document vault

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | **not null** default 1 |
| `title` | `TEXT` | **not null** default '' |
| `category` | `TEXT` | default 'general' |
| `doc_type` | `TEXT` | default 'policy' |
| `description` | `TEXT` | default '' |
| `version` | `TEXT` | default '1.0' |
| `effective_date` | `DATE` |  |
| `review_date` | `DATE` |  |
| `file_ref` | `TEXT` | default '' |
| `content` | `TEXT` | default '' |
| `tags` | `JSONB` | default '[]' |
| `uploaded_by` | `TEXT` | default '' |
| `status` | `TEXT` | default 'active' |
| `access_level` | `TEXT` | default 'all' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `donations`

Fundraising donations

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `campaign_id` | `INTEGER` | REFERENCES fundraising_campaigns(id) ON DELETE SET NULL |
| `donor_name` | `TEXT` | **not null** |
| `donor_email` | `TEXT` | default '' |
| `donor_phone` | `TEXT` | default '' |
| `donor_address` | `TEXT` | default '' |
| `amount` | `NUMERIC(12,2)` | **not null** |
| `method` | `TEXT` | default 'Check' |
| `reference` | `TEXT` | default '' |
| `receipt_sent` | `BOOLEAN` | default false |
| `notes` | `TEXT` | default '' |
| `donated_at` | `DATE` | default CURRENT_DATE |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `drills`

Drills table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `title` | `TEXT` | **not null** |
| `type` | `TEXT` | default '' |
| `date` | `TEXT` | **not null** |
| `startTime` | `TEXT` | default '' |
| `duration` | `INTEGER` | default 0 |
| `location` | `TEXT` | default '' |
| `instructor` | `TEXT` | default '' |
| `objectives` | `TEXT` | default '[]' |
| `attendees` | `TEXT` | default '[]' |
| `isoHours` | `BOOLEAN` | default TRUE |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `equipment_checkout`

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | REFERENCES stations(id) |
| `item_name` | `TEXT` | **not null** |
| `item_type` | `TEXT` | default 'radio' |
| `serial_number` | `TEXT` |  |
| `asset_tag` | `TEXT` |  |
| `expected_return` | `TIMESTAMPTZ` |  |
| `returned_at` | `TIMESTAMPTZ` |  |
| `returned_to` | `TEXT` |  |
| `condition_out` | `TEXT` | default 'good' |
| `condition_in` | `TEXT` |  |
| `purpose` | `TEXT` |  |
| `notes` | `TEXT` |  |
| `status` | `TEXT` | default 'checked_out' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

**Table constraints:**

- `checked_out_by  INTEGER REFERENCES members(id)`
- `checked_out_at  TIMESTAMPTZ DEFAULT NOW()`

## `events`

Events table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `title` | `TEXT` | **not null** |
| `type` | `TEXT` | default 'Other' |
| `date` | `TEXT` | **not null** |
| `startTime` | `TEXT` | default '' |
| `endTime` | `TEXT` | default '' |
| `location` | `TEXT` | default '' |
| `organizer` | `TEXT` | default '' |
| `description` | `TEXT` | default '' |
| `maxAttendees` | `INTEGER` |  |
| `rsvps` | `TEXT` | default '[]' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `exam_assignments`

Exam assignments (which members must take which exams)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `exam_id` | `INTEGER` | REFERENCES exams(id) ON DELETE CASCADE |
| `user_id` | `INTEGER` |  |
| `assigned_at` | `TIMESTAMPTZ` | default NOW() |

**Table constraints:**

- `UNIQUE (station_id, exam_id, user_id)`

## `exam_submissions`

Exam submissions (completed attempts)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `exam_id` | `INTEGER` | REFERENCES exams(id) ON DELETE CASCADE |
| `user_id` | `INTEGER` |  |
| `score` | `INTEGER` | default 0 |
| `passed` | `BOOLEAN` | default false |
| `answers` | `JSONB` | default '[]' |
| `started_at` | `TIMESTAMPTZ` | default NOW() |
| `completed_at` | `TIMESTAMPTZ` | default NOW() |
| `time_spent` | `INTEGER` | default 0 |

**Table constraints:**

- `UNIQUE (station_id, exam_id, user_id)`

## `exams`

Exam definitions (created by officers/chiefs)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `title` | `TEXT` | **not null** |
| `description` | `TEXT` | default '' |
| `category` | `TEXT` | default 'General' |
| `time_limit` | `INTEGER` | default 0 |
| `passing_score` | `INTEGER` | default 70 |
| `randomize` | `BOOLEAN` | default true |
| `questions` | `JSONB` | default '[]' |
| `created_by` | `INTEGER` |  |
| `status` | `TEXT` | default 'draft' |
| `due_date` | `DATE` |  |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `exposure_records`

Exposure & safety records — OSHA-required tracking

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `member_id` | `INTEGER` | **not null** REFERENCES members(id) ON DELETE CASCADE |
| `station_id` | `INTEGER` | **not null** REFERENCES stations(id) ON DELETE CASCADE |
| `incident_id` | `INTEGER` | REFERENCES incidents(id) ON DELETE SET NULL |
| `exposure_date` | `TEXT` | **not null** |
| `exposure_type` | `TEXT` | **not null** |
| `substance` | `TEXT` | default '' |
| `duration_minutes` | `INTEGER` | default 0 |
| `ppe_worn` | `TEXT` | default '[]' |
| `symptoms` | `TEXT` | default '' |
| `medical_followup` | `BOOLEAN` | default FALSE |
| `followup_date` | `TEXT` | default '' |
| `followup_notes` | `TEXT` | default '' |
| `reported_by` | `TEXT` | default '' |
| `status` | `TEXT` | default 'reported' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `fi_inspections`

Fire Inspections table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `propertyId` | `INTEGER` | **not null** |
| `type` | `TEXT` | default 'Annual Inspection' |
| `inspectorName` | `TEXT` | default '' |
| `scheduledDate` | `TEXT` |  |
| `completedDate` | `TEXT` |  |
| `result` | `TEXT` |  |
| `violations` | `TEXT` | default '[]' |
| `followUpDate` | `TEXT` |  |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `fi_permits`

Fire Permits table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `propertyId` | `INTEGER` | **not null** |
| `type` | `TEXT` | **not null** |
| `permitNumber` | `TEXT` | default '' |
| `issuedDate` | `TEXT` |  |
| `expiresDate` | `TEXT` |  |
| `status` | `TEXT` | default 'Active' |
| `issuedBy` | `TEXT` | default '' |
| `fee` | `REAL` |  |
| `conditions` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `fi_properties`

Fire Inspection Properties table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `name` | `TEXT` | **not null** |
| `address` | `TEXT` | default '' |
| `occupancyType` | `TEXT` | default '' |
| `propertyUseCode` | `TEXT` | default '' |
| `ownerName` | `TEXT` | default '' |
| `ownerPhone` | `TEXT` | default '' |
| `ownerEmail` | `TEXT` | default '' |
| `contactName` | `TEXT` | default '' |
| `contactPhone` | `TEXT` | default '' |
| `squareFootage` | `INTEGER` |  |
| `stories` | `INTEGER` | default 1 |
| `occupantLoad` | `INTEGER` |  |
| `sprinklered` | `BOOLEAN` | default FALSE |
| `alarmMonitored` | `BOOLEAN` | default FALSE |
| `hazmatOnsite` | `BOOLEAN` | default FALSE |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `fill_stations`

Fill Stations table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `name` | `TEXT` | **not null** |
| `type` | `TEXT` | default '' |
| `bankPressure` | `INTEGER` |  |
| `maxPressure` | `INTEGER` | default 4500 |
| `lastInspectionDate` | `TEXT` | default '' |
| `nextInspectionDate` | `TEXT` | default '' |
| `status` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `fundraising_campaigns`

Fundraising campaigns / fund drives

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `name` | `TEXT` | **not null** |
| `description` | `TEXT` | default '' |
| `type` | `TEXT` | default 'Fund Drive' |
| `goal_amount` | `NUMERIC(12,2)` | default 0 |
| `raised_amount` | `NUMERIC(12,2)` | default 0 |
| `start_date` | `DATE` |  |
| `end_date` | `DATE` |  |
| `status` | `TEXT` | default 'Planning' |
| `created_by` | `INTEGER` |  |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `grants`

Grants table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `grantName` | `TEXT` | **not null** |
| `type` | `TEXT` | default '' |
| `fundingAgency` | `TEXT` | default '' |
| `programYear` | `INTEGER` |  |
| `status` | `TEXT` | default 'Planning' |
| `applicationDate` | `TEXT` |  |
| `awardDate` | `TEXT` |  |
| `amountRequested` | `REAL` | default 0 |
| `amountAwarded` | `REAL` |  |
| `matchRequired` | `BOOLEAN` | default FALSE |
| `matchPercent` | `REAL` | default 0 |
| `matchAmount` | `REAL` |  |
| `grantPeriodStart` | `TEXT` |  |
| `grantPeriodEnd` | `TEXT` |  |
| `reportingDeadlines` | `TEXT` | default '[]' |
| `expenditures` | `TEXT` | default '[]' |
| `contactName` | `TEXT` | default '' |
| `contactEmail` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `grievances`

Union grievance tracking

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | **not null** default 1 |
| `grievance_number` | `TEXT` | default '' |
| `filed_by` | `INTEGER` | REFERENCES members(id) ON DELETE SET NULL |
| `filed_date` | `DATE` | default CURRENT_DATE |
| `cba_article` | `TEXT` | default '' |
| `subject` | `TEXT` | **not null** default '' |
| `description` | `TEXT` | default '' |
| `grievance_type` | `TEXT` | default 'contract_violation' |
| `current_step` | `TEXT` | default 'step_1' |
| `status` | `TEXT` | default 'open' |
| `resolution` | `TEXT` | default '' |
| `resolved_date` | `DATE` |  |
| `assigned_to` | `TEXT` | default '' |
| `union_rep` | `TEXT` | default '' |
| `management_rep` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `timeline` | `JSONB` | default '[]' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `hydrants`

Hydrants table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `hydrantNumber` | `TEXT` | **not null** **unique** |
| `streetAddress` | `TEXT` | default '' |
| `intersection` | `TEXT` | default '' |
| `city` | `TEXT` | default '' |
| `state` | `TEXT` | default '' |
| `zip` | `TEXT` | default '' |
| `type` | `TEXT` | default 'Dry Barrel' |
| `manufacturer` | `TEXT` | default '' |
| `model` | `TEXT` | default '' |
| `yearInstalled` | `INTEGER` |  |
| `mainSize` | `TEXT` | default '' |
| `outletSize` | `TEXT` | default '' |
| `numOutlets` | `INTEGER` | default 2 |
| `status` | `TEXT` | default 'In Service' |
| `staticPressure` | `REAL` |  |
| `residualPressure` | `REAL` |  |
| `flowRate` | `REAL` |  |
| `lastTestDate` | `TEXT` |  |
| `nextTestDue` | `TEXT` |  |
| `testedBy` | `TEXT` | default '' |
| `lastInspectionDate` | `TEXT` |  |
| `ownedBy` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `incident_costs`

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | REFERENCES stations(id) |
| `incident_id` | `INTEGER` |  |
| `incident_number` | `TEXT` |  |
| `incident_date` | `DATE` |  |
| `incident_type` | `TEXT` |  |
| `location` | `TEXT` |  |
| `apparatus_costs` | `JSONB` | default '[]' |
| `personnel_costs` | `JSONB` | default '[]' |
| `material_costs` | `JSONB` | default '[]' |
| `other_costs` | `JSONB` | default '[]' |
| `total_cost` | `NUMERIC(12,2)` | default 0 |
| `billable` | `BOOLEAN` | default FALSE |
| `billed_to` | `TEXT` |  |
| `invoice_number` | `TEXT` |  |
| `payment_status` | `TEXT` | default 'not_billed' |
| `notes` | `TEXT` |  |
| `calculated_by` | `TEXT` |  |
| `status` | `TEXT` | default 'draft' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `incident_responses`

Incident responses — who's responding to what (Phase 6)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `incident_id` | `INTEGER` |  |
| `user_id` | `INTEGER` |  |
| `member_name` | `TEXT` | default '' |
| `status` | `TEXT` | default 'responding' |
| `cert_level` | `TEXT` | default 'probationary' |
| `responded_at` | `TIMESTAMPTZ` | default NOW() |
| `on_scene_at` | `TIMESTAMPTZ` |  |
| `cleared_at` | `TIMESTAMPTZ` |  |

**Table constraints:**

- `UNIQUE (station_id, incident_id, user_id)`

## `incidents`

Incidents table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `incidentNumber` | `TEXT` | **not null** **unique** |
| `date` | `TEXT` | **not null** |
| `time` | `TEXT` | default '' |
| `type` | `TEXT` | **not null** |
| `alarmLevel` | `TEXT` | default 'Still' |
| `address` | `TEXT` | default '' |
| `units` | `TEXT` | default '[]' |
| `personnel` | `TEXT` | default '[]' |
| `disposition` | `TEXT` | default '' |
| `injuries` | `INTEGER` | default 0 |
| `notes` | `TEXT` | default '' |
| `photos` | `TEXT` | default '[]' |
| `dispatchTime` | `TEXT` | default '' |
| `clearTime` | `TEXT` | default '' |
| `description` | `TEXT` | default '' |
| `station_id` | `INTEGER` | default 1 |
| `incident_date` | `DATE` |  |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `investigations`

Investigations table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `caseNumber` | `TEXT` | **not null** |
| `incidentDate` | `TEXT` | default '' |
| `address` | `TEXT` | default '' |
| `occupancyType` | `TEXT` | default '' |
| `cause` | `TEXT` | default 'Undetermined' |
| `causeDetail` | `TEXT` | default '' |
| `investigator` | `TEXT` | default '' |
| `startDate` | `TEXT` |  |
| `completionDate` | `TEXT` |  |
| `estimatedLoss` | `REAL` |  |
| `actualLoss` | `REAL` |  |
| `status` | `TEXT` | default 'Open' |
| `narrative` | `TEXT` | default '' |
| `findings` | `TEXT` | default '' |
| `recommendations` | `TEXT` | default '' |
| `evidence` | `TEXT` | default '[]' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `leave_requests`

Leave requests (PTO, sick, swap coverage)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `memberId` | `INTEGER` | **not null** |
| `memberName` | `TEXT` | **not null** |
| `type` | `TEXT` | **not null** default 'PTO' |
| `startDate` | `TEXT` | **not null** |
| `endDate` | `TEXT` | **not null** |
| `status` | `TEXT` | default 'Pending' |
| `approvedBy` | `TEXT` |  |
| `approvedAt` | `TIMESTAMPTZ` |  |
| `reason` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `station_id` | `INTEGER` | default 1 |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `maintenance`

Maintenance table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `apparatusId` | `INTEGER` | default 0 |
| `apparatusName` | `TEXT` | default '' |
| `type` | `TEXT` | **not null** |
| `priority` | `TEXT` | default 'Routine' |
| `status` | `TEXT` | default 'Pending' |
| `date` | `TEXT` | **not null** |
| `mileage` | `INTEGER` |  |
| `engineHours` | `REAL` |  |
| `description` | `TEXT` | default '' |
| `technician` | `TEXT` | default '' |
| `vendor` | `TEXT` | default '' |
| `laborHours` | `REAL` |  |
| `partsCost` | `REAL` |  |
| `laborCost` | `REAL` |  |
| `totalCost` | `REAL` |  |
| `workOrder` | `TEXT` | default '' |
| `nextServiceMiles` | `INTEGER` |  |
| `nextServiceDate` | `TEXT` |  |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `meeting_minutes`

── Phase 6: Communication & Accountability ────────────────────────────

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | REFERENCES stations(id) |
| `title` | `TEXT` | **not null** |
| `meeting_date` | `DATE` | **not null** |
| `meeting_type` | `TEXT` | default 'regular' |
| `location` | `TEXT` |  |
| `called_by` | `TEXT` |  |
| `attendees` | `JSONB` | default '[]' |
| `agenda` | `JSONB` | default '[]' |
| `motions` | `JSONB` | default '[]' |
| `action_items` | `JSONB` | default '[]' |
| `notes` | `TEXT` |  |
| `next_meeting` | `DATE` |  |
| `recorded_by` | `TEXT` |  |
| `status` | `TEXT` | default 'draft' |
| `linked_module` | `TEXT` |  |
| `linked_record_id` | `INTEGER` |  |
| `linked_label` | `TEXT` |  |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `member_availability`

Real-time member availability

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `user_id` | `INTEGER` | **not null** |
| `member_name` | `TEXT` | default '' |
| `available` | `BOOLEAN` | default false |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

**Table constraints:**

- `UNIQUE (station_id, user_id)`

## `member_qualifications`

Qualifications / Certifications table — proper tracking with expirations

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `member_id` | `INTEGER` | **not null** REFERENCES members(id) ON DELETE CASCADE |
| `station_id` | `INTEGER` | **not null** REFERENCES stations(id) ON DELETE CASCADE |
| `cert_type` | `TEXT` | **not null** |
| `cert_name` | `TEXT` | **not null** |
| `issued_date` | `TEXT` | default '' |
| `expiry_date` | `TEXT` | default '' |
| `issuing_authority` | `TEXT` | default '' |
| `cert_number` | `TEXT` | default '' |
| `status` | `TEXT` | default 'active' |
| `notes` | `TEXT` | default '' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `members`

Members table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `memberNumber` | `TEXT` | **not null** **unique** |
| `name` | `TEXT` | **not null** |
| `rank` | `TEXT` | **not null** |
| `role` | `TEXT` | **not null** |
| `status` | `TEXT` | default 'Active' |
| `joined` | `TEXT` | **not null** |
| `dob` | `TEXT` | default '' |
| `phone` | `TEXT` | default '' |
| `email` | `TEXT` | default '' |
| `station_email` | `TEXT` | default '' |
| `personal_email` | `TEXT` | default '' |
| `address` | `TEXT` | default '' |
| `emergencyContactName` | `TEXT` | default '' |
| `emergencyContactPhone` | `TEXT` | default '' |
| `emergencyContactRelation` | `TEXT` | default '' |
| `certifications` | `TEXT` | default '[]' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |
| `station_id` | `INTEGER` | _(added via ALTER TABLE)_ DEFAULT 1; ALTER TABLE apparatus ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE incidents ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE training ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE training ADD COLUMN IF NOT EXISTS delivery_method TEXT DEFAULT 'Classroom'; ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE shifts ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE shifts ADD COLUMN IF NOT EXISTS "patternId" INTEGER; ALTER TABLE shifts ADD COLUMN IF NOT EXISTS "memberIds" TEXT DEFAULT '[]'; ALTER TABLE shifts ADD COLUMN IF NOT EXISTS "isOverride" BOOLEAN DEFAULT FALSE; ALTER TABLE station_log ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE fi_properties ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE fi_inspections ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE hydrants ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE volunteer_hours ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE grants ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE mutual_aid ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE sogs ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE wellness ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE events ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE events ADD COLUMN IF NOT EXISTS rrule TEXT; ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_id INTEGER; ALTER TABLE events ADD COLUMN IF NOT EXISTS original_date TEXT; ALTER TABLE events ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false; ALTER TABLE pre_plans ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE drills ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE courses ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE assets ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE assets ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1; ALTER TABLE members ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT ''; ALTER TABLE incidents ADD COLUMN IF NOT EXISTS "dispatchTime" TEXT DEFAULT ''; ALTER TABLE incidents ADD COLUMN IF NOT EXISTS "clearTime" TEXT DEFAULT ''; ALTER TABLE apparatus ADD COLUMN IF NOT EXISTS vin TEXT DEFAULT ''; ALTER TABLE cylinders ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE fill_stations ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE cad_connections ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE investigations ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE pay_entries ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE crr_visits ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE crr_programs ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE budget_transactions ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE budget_transactions ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Expense'; ALTER TABLE budget_transactions ADD COLUMN IF NOT EXISTS category TEXT DEFAULT ''; ALTER TABLE budget_transactions ADD COLUMN IF NOT EXISTS subcategory TEXT DEFAULT ''; ALTER TABLE budget_transactions ADD COLUMN IF NOT EXISTS "checkNumber" TEXT DEFAULT ''; ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS latitude TEXT DEFAULT ''; ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS longitude TEXT DEFAULT ''; ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS "dispatchTime" TEXT DEFAULT ''; ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS "onSceneTime" TEXT DEFAULT ''; ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS "unitClearTime" TEXT DEFAULT ''; ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS "respondingUnits" TEXT DEFAULT ''; ALTER TABLE users ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1; ALTER TABLE members ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT TRUE; ALTER TABLE incidents ADD COLUMN IF NOT EXISTS photos TEXT DEFAULT '[]'; -- Phase 1: Career-Ready Foundation ALTER TABLE members ADD COLUMN IF NOT EXISTS hire_date TEXT DEFAULT ''; ALTER TABLE members ADD COLUMN IF NOT EXISTS rank_date TEXT DEFAULT ''; ALTER TABLE members ADD COLUMN IF NOT EXISTS seniority_number INTEGER DEFAULT 0; ALTER TABLE members ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'volunteer'; ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS platoon TEXT DEFAULT ''; ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS cycle_type TEXT DEFAULT ''; ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS cycle_on INTEGER DEFAULT 0; ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS cycle_off INTEGER DEFAULT 0; ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS kelly_day_interval INTEGER DEFAULT 0; ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS anchor_date TEXT DEFAULT ''; -- FLSA config on stations ALTER TABLE stations ADD COLUMN IF NOT EXISTS flsa_work_period INTEGER DEFAULT 7; ALTER TABLE stations ADD COLUMN IF NOT EXISTS flsa_ot_threshold NUMERIC DEFAULT 40; ALTER TABLE stations ADD COLUMN IF NOT EXISTS flsa_period_start TEXT DEFAULT ''; ALTER TABLE stations ADD COLUMN IF NOT EXISTS dept_type TEXT DEFAULT 'volunteer'; ALTER TABLE stations ADD COLUMN IF NOT EXISTS min_staffing_block BOOLEAN DEFAULT FALSE; EXCEPTION WHEN OTHERS THEN NULL; END $$ |
| `cal_token` | `TEXT` | _(added via ALTER TABLE)_ UNIQUE |

## `messages`

Member-to-member direct messages (email-style)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `from_id` | `INTEGER` |  |
| `from_name` | `TEXT` | default '' |
| `from_username` | `TEXT` | default '' |
| `to_username` | `TEXT` | **not null** |
| `subject` | `TEXT` | **not null** default '' |
| `body` | `TEXT` | default '' |
| `sent_at` | `TIMESTAMPTZ` | default NOW() |
| `read_at` | `TIMESTAMPTZ` |  |

## `module_completions`

On-demand training module completions (Phase 4)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `user_id` | `INTEGER` |  |
| `member_name` | `TEXT` | default '' |
| `module_id` | `TEXT` | **not null** |
| `score` | `INTEGER` | default 0 |
| `passed` | `BOOLEAN` | default TRUE |
| `completed_at` | `TIMESTAMPTZ` | default NOW() |

**Table constraints:**

- `UNIQUE (station_id, user_id, module_id)`

## `mutual_aid`

Mutual Aid table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `date` | `TEXT` | **not null** |
| `direction` | `TEXT` | default 'Given' |
| `incidentType` | `TEXT` | default '' |
| `status` | `TEXT` | default 'Completed' |
| `partnerDepartment` | `TEXT` | default '' |
| `address` | `TEXT` | default '' |
| `unitsDeployed` | `TEXT` | default '[]' |
| `personnelCount` | `INTEGER` | default 0 |
| `requestTime` | `TEXT` | default '' |
| `clearTime` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `incidentNumber` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `mutual_aid_agreements`

Mutual aid agreements (formal agreements, not incident-level mutual aid)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | **not null** default 1 |
| `partner_agency` | `TEXT` | **not null** default '' |
| `partner_fdid` | `TEXT` | default '' |
| `partner_contact` | `TEXT` | default '' |
| `partner_phone` | `TEXT` | default '' |
| `partner_email` | `TEXT` | default '' |
| `agreement_type` | `TEXT` | default 'automatic' |
| `services` | `JSONB` | default '[]' |
| `effective_date` | `DATE` |  |
| `expiration_date` | `DATE` |  |
| `auto_renew` | `BOOLEAN` | default true |
| `distance_miles` | `NUMERIC(6,1)` | default 0 |
| `response_time_min` | `INTEGER` | default 0 |
| `status` | `TEXT` | default 'active' |
| `document_ref` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `nfirs_reports`

NFIRS Reports table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `incidentNumber` | `TEXT` |  |
| `reportingArea` | `TEXT` | default '' |
| `stateIncidentNumber` | `TEXT` | default '' |
| `federalIncidentNumber` | `TEXT` | default '' |
| `reportDate` | `TEXT` |  |
| `estimatedPropertyLoss` | `REAL` | default 0 |
| `estimatedPropertyValue` | `REAL` | default 0 |
| `status` | `TEXT` | default 'Draft' |
| `suppressionApparatus` | `TEXT` | default '[]' |
| `suppressionPersonnel` | `TEXT` | default '[]' |
| `emsApparatus` | `TEXT` | default '[]' |
| `emsPersonnel` | `TEXT` | default '[]' |
| `otherApparatus` | `TEXT` | default '[]' |
| `otherPersonnel` | `TEXT` | default '[]' |
| `civilianDeaths` | `INTEGER` | default 0 |
| `civilianInjuries` | `INTEGER` | default 0 |
| `fsDeaths` | `INTEGER` | default 0 |
| `fsInjuries` | `INTEGER` | default 0 |
| `propertyLoss` | `REAL` | default 0 |
| `contentsLoss` | `REAL` | default 0 |
| `isStructureFire` | `BOOLEAN` | default FALSE |
| `structureType` | `TEXT` | default '' |
| `buildingStatus` | `TEXT` | default '' |
| `storiesAboveGrade` | `INTEGER` | default 0 |
| `storiesBelowGrade` | `INTEGER` | default 0 |
| `mainFloorArea` | `INTEGER` | default 0 |
| `fireOriginCode` | `TEXT` | default '' |
| `fireCauseCode` | `TEXT` | default '' |
| `contributingFactor1` | `TEXT` | default '' |
| `contributingFactor2` | `TEXT` | default '' |
| `humanFactors1` | `TEXT` | default '' |
| `humanFactors2` | `TEXT` | default '' |
| `detectorPresence` | `TEXT` | default '' |
| `detectorOperation` | `TEXT` | default '' |
| `detectorEffectiveness` | `TEXT` | default '' |
| `detectorFailureReason` | `TEXT` | default '' |
| `sprinklerPresence` | `TEXT` | default '' |
| `sprinklerOperation` | `TEXT` | default '' |
| `sprinklerFailureReason` | `TEXT` | default '' |
| `narrativeStatement` | `TEXT` | default '' |
| `preparedBy` | `TEXT` | default '' |
| `officerInCharge` | `TEXT` | default '' |
| `reviewedBy` | `TEXT` | default '' |
| `linkedIncidentId` | `INTEGER` |  |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `ot_records`

Overtime equalization — track OT hours per member for fair distribution

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `member_id` | `INTEGER` | **not null** REFERENCES members(id) ON DELETE CASCADE |
| `station_id` | `INTEGER` | **not null** REFERENCES stations(id) ON DELETE CASCADE |
| `shift_id` | `INTEGER` | REFERENCES shifts(id) ON DELETE SET NULL |
| `ot_date` | `TEXT` | **not null** |
| `ot_hours` | `NUMERIC` | **not null** default 0 |
| `ot_type` | `TEXT` | default 'mandatory' |
| `reason` | `TEXT` | default '' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `pay_entries`

Pay Entries table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `memberId` | `INTEGER` |  |
| `memberName` | `TEXT` | default '' |
| `payPeriodStart` | `TEXT` | **not null** |
| `payPeriodEnd` | `TEXT` | **not null** |
| `regularHours` | `REAL` | default 0 |
| `overtimeHours` | `REAL` | default 0 |
| `specialPay` | `TEXT` | default '[]' |
| `grossPay` | `REAL` |  |
| `netPay` | `REAL` |  |
| `deductions` | `TEXT` | default '[]' |
| `paymentDate` | `TEXT` |  |
| `paymentMethod` | `TEXT` | default 'Check' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `personnel_actions`

Personnel actions — promotions, disciplinary, commendations, reviews

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `member_id` | `INTEGER` | **not null** REFERENCES members(id) ON DELETE CASCADE |
| `station_id` | `INTEGER` | **not null** REFERENCES stations(id) ON DELETE CASCADE |
| `action_type` | `TEXT` | **not null** |
| `action_date` | `TEXT` | **not null** |
| `description` | `TEXT` | default '' |
| `details` | `JSONB` | default '{}' |
| `issued_by` | `TEXT` | default '' |
| `status` | `TEXT` | default 'active' |
| `attachments` | `TEXT` | default '[]' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `policy_acknowledgments`

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | REFERENCES stations(id) |
| `policy_title` | `TEXT` | **not null** |
| `policy_ref` | `TEXT` |  |
| `policy_type` | `TEXT` | default 'sog' |
| `description` | `TEXT` |  |
| `effective_date` | `DATE` |  |
| `review_date` | `DATE` |  |
| `required_by` | `JSONB` | default '[]' |
| `acknowledged_by` | `JSONB` | default '[]' |
| `total_required` | `INTEGER` | default 0 |
| `total_acknowledged` | `INTEGER` | default 0 |
| `status` | `TEXT` | default 'active' |
| `created_by` | `TEXT` |  |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `pre_plans`

Pre-Incident Plans table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `occupancyName` | `TEXT` | **not null** |
| `address` | `TEXT` | default '' |
| `occupancyType` | `TEXT` | default '' |
| `riskLevel` | `TEXT` | default 'Moderate' |
| `constructionType` | `TEXT` | default '' |
| `yearBuilt` | `INTEGER` |  |
| `stories` | `INTEGER` |  |
| `sqFootage` | `INTEGER` |  |
| `lastInspection` | `TEXT` |  |
| `lastUpdated` | `TEXT` |  |
| `lastUpdatedBy` | `TEXT` | default '' |
| `contacts` | `TEXT` | default '[]' |
| `hazards` | `TEXT` | default '[]' |
| `access` | `TEXT` | default '{}' |
| `waterSupply` | `TEXT` | default '[]' |
| `suppression` | `TEXT` | default '{}' |
| `utilities` | `TEXT` | default '{}' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `push_subscriptions`

Push notification subscriptions

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `user_id` | `INTEGER` |  |
| `endpoint` | `TEXT` | **unique** **not null** |
| `p256dh` | `TEXT` | **not null** |
| `auth` | `TEXT` | **not null** |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `radio_config`

Radio configuration — per-station talkgroup mappings and settings

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 **unique** |
| `enabled` | `BOOLEAN` | default false |
| `api_key` | `TEXT` | default '' |
| `talkgroups` | `JSONB` | default '[]' |
| `dispatch_keywords` | `JSONB` | default '[]' |
| `whisper_mode` | `TEXT` | default 'cloud' |
| `retention_days` | `INTEGER` | default 30 |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `radio_log`

Radio log — every transcribed radio transmission

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `timestamp` | `TIMESTAMPTZ` | default NOW() |
| `talkgroup` | `TEXT` | default '' |
| `talkgroup_id` | `INTEGER` |  |
| `transcript` | `TEXT` | **not null** |
| `confidence` | `REAL` | default 1.0 |
| `duration_sec` | `REAL` | default 0 |
| `audio_url` | `TEXT` | default '' |
| `is_dispatch` | `BOOLEAN` | default false |
| `priority` | `TEXT` | default 'normal' |
| `source` | `TEXT` | default 'sdr' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `recall_events`

Recall events table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `level` | `TEXT` | **not null** default 'additional' |
| `incident_type` | `TEXT` | default '' |
| `location` | `TEXT` | default '' |
| `message` | `TEXT` | default '' |
| `issued_by` | `TEXT` | **not null** |
| `status` | `TEXT` | **not null** default 'active' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `closed_at` | `TIMESTAMPTZ` |  |

## `recall_responses`

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `recall_id` | `INTEGER` | **not null** REFERENCES recall_events(id) ON DELETE CASCADE |
| `member_id` | `INTEGER` | **not null** |
| `member_name` | `TEXT` | **not null** |
| `response` | `TEXT` | **not null** |
| `eta` | `TEXT` | default '' |
| `responded_at` | `TIMESTAMPTZ` | default NOW() |

**Table constraints:**

- `UNIQUE(recall_id, member_id)`

## `recruitment`

Recruitment table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `name` | `TEXT` | **not null** |
| `phone` | `TEXT` | default '' |
| `email` | `TEXT` | default '' |
| `address` | `TEXT` | default '' |
| `dob` | `TEXT` |  |
| `source` | `TEXT` | default '' |
| `recruiter` | `TEXT` | default '' |
| `stage` | `TEXT` | default 'Prospect' |
| `dateAdded` | `TEXT` | **not null** |
| `stageHistory` | `TEXT` | default '[]' |
| `notes` | `TEXT` | default '' |
| `interviewDate` | `TEXT` | default '' |
| `physicalDate` | `TEXT` | default '' |
| `orientationDate` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

**Table constraints:**

- `checklist TEXT DEFAULT '{}'`

## `run_lists`

Run lists — submitted daily run list snapshots, used to sync TV display

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | **not null** REFERENCES stations(id) ON DELETE CASCADE |
| `date` | `TEXT` | **not null** |
| `payload` | `JSONB` | **not null** |
| `submitted_at` | `TIMESTAMPTZ` | **not null** default NOW() |

**Table constraints:**

- `UNIQUE(station_id, date)`

## `scenario_completions`

Scenario-based learning completions (Phase 5)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `user_id` | `INTEGER` |  |
| `member_name` | `TEXT` | default '' |
| `scenario_id` | `TEXT` | **not null** |
| `score` | `INTEGER` | default 0 |
| `passed` | `BOOLEAN` | default FALSE |
| `completed_at` | `TIMESTAMPTZ` | default NOW() |

**Table constraints:**

- `UNIQUE (station_id, user_id, scenario_id)`

## `shift_patterns`

Shift patterns (recurring templates)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `name` | `TEXT` | **not null** |
| `shiftType` | `TEXT` | **not null** |
| `startDate` | `TEXT` | **not null** |
| `endDate` | `TEXT` |  |
| `repeatRule` | `TEXT` | **not null** default 'weekly' |
| `repeatDays` | `TEXT` | default '[]' |
| `memberIds` | `TEXT` | default '[]' |
| `minCrew` | `INTEGER` | default 3 |
| `isActive` | `BOOLEAN` | default TRUE |
| `notes` | `TEXT` | default '' |
| `station_id` | `INTEGER` | default 1 |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `shift_swaps`

Shift swap requests

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `shiftId` | `INTEGER` | **not null** |
| `requesterId` | `INTEGER` | **not null** |
| `requesterName` | `TEXT` | **not null** |
| `coveredById` | `INTEGER` |  |
| `coveredByName` | `TEXT` |  |
| `status` | `TEXT` | default 'Open' |
| `reason` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `station_id` | `INTEGER` | default 1 |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `shift_trades`

Shift trades — formalized trades with FLSA impact tracking

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | **not null** REFERENCES stations(id) ON DELETE CASCADE |
| `requesting_member_id` | `INTEGER` | **not null** REFERENCES members(id) ON DELETE CASCADE |
| `covering_member_id` | `INTEGER` | REFERENCES members(id) ON DELETE SET NULL |
| `original_shift_id` | `INTEGER` | **not null** REFERENCES shifts(id) ON DELETE CASCADE |
| `payback_shift_id` | `INTEGER` | REFERENCES shifts(id) ON DELETE SET NULL |
| `trade_date` | `TEXT` | **not null** |
| `payback_date` | `TEXT` | default '' |
| `status` | `TEXT` | default 'pending' |
| `ot_impact_hours` | `NUMERIC` | default 0 |
| `flsa_period_hours_requester` | `NUMERIC` | default 0 |
| `flsa_period_hours_coverer` | `NUMERIC` | default 0 |
| `notes` | `TEXT` | default '' |
| `approved_by` | `TEXT` | default '' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `shifts`

Shifts table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `date` | `TEXT` | **not null** |
| `shiftType` | `TEXT` | **not null** |
| `crew` | `TEXT` | default '[]' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `sogs`

SOGs table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `number` | `TEXT` | default '' |
| `title` | `TEXT` | **not null** |
| `category` | `TEXT` | default 'Operations' |
| `status` | `TEXT` | default 'Active' |
| `version` | `TEXT` | default '1.0' |
| `effectiveDate` | `TEXT` |  |
| `reviewDate` | `TEXT` |  |
| `lastReviewedDate` | `TEXT` |  |
| `author` | `TEXT` | default '' |
| `approvedBy` | `TEXT` | default '' |
| `summary` | `TEXT` | default '' |
| `content` | `TEXT` | default '' |
| `tags` | `TEXT` | default '[]' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `station_log`

Station Log table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `date` | `TEXT` | **not null** |
| `shift` | `TEXT` | default 'Day' |
| `officerOnDuty` | `TEXT` | default '' |
| `membersOnDuty` | `TEXT` | default '[]' |
| `weatherConditions` | `TEXT` | default '' |
| `callCount` | `INTEGER` | default 0 |
| `apparatusChecked` | `BOOLEAN` | default FALSE |
| `stationChecked` | `BOOLEAN` | default FALSE |
| `events` | `TEXT` | default '[]' |
| `visitors` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `stations`

Stations table (multi-tenancy)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `name` | `TEXT` | **not null** |
| `fdid` | `TEXT` | default '' |
| `address` | `TEXT` | default '' |
| `city` | `TEXT` | default '' |
| `state` | `TEXT` | default '' |
| `zip` | `TEXT` | default '' |
| `phone` | `TEXT` | default '' |
| `email` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `seeded_at` | `TIMESTAMPTZ` | _(added via ALTER TABLE)_ DEFAULT NULL |
| `anthropic_api_key` | `TEXT` | _(added via ALTER TABLE)_ DEFAULT ''"); // TV PIN — generated once per station, used to authenticate the wall TV display (no JWT needed) await pool.query('ALTER TABLE stations ADD COLUMN IF NOT EXISTS tv_pin TEXT'); await pool.query( |

## `timesheets`

Timesheets / payroll periods

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | **not null** default 1 |
| `member_id` | `INTEGER` | **not null** REFERENCES members(id) ON DELETE CASCADE |
| `period_start` | `DATE` | **not null** |
| `period_end` | `DATE` | **not null** |
| `regular_hours` | `NUMERIC(6,2)` | default 0 |
| `ot_hours` | `NUMERIC(6,2)` | default 0 |
| `leave_hours` | `NUMERIC(6,2)` | default 0 |
| `trade_hours` | `NUMERIC(6,2)` | default 0 |
| `total_hours` | `NUMERIC(6,2)` | default 0 |
| `flsa_period` | `TEXT` | default '' |
| `status` | `TEXT` | default 'draft' |
| `approved_by` | `TEXT` | default '' |
| `approved_at` | `TIMESTAMPTZ` |  |
| `notes` | `TEXT` | default '' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |

## `training`

Training table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `memberId` | `INTEGER` | default 0 |
| `memberName` | `TEXT` | default '' |
| `courseName` | `TEXT` | **not null** |
| `type` | `TEXT` | **not null** |
| `status` | `TEXT` | default 'Passed' |
| `completedDate` | `TEXT` |  |
| `expiresDate` | `TEXT` |  |
| `hours` | `REAL` | default 0 |
| `instructor` | `TEXT` | default '' |
| `location` | `TEXT` | default '' |
| `notes` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `training_course_completions`

Video course completion records (Phase 7 — Training Hub)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | **not null** default 1 |
| `course_id` | `INTEGER` | REFERENCES training_courses(id) ON DELETE SET NULL |
| `user_id` | `INTEGER` |  |
| `member_name` | `TEXT` | default '' |
| `quiz_score` | `INTEGER` | default 0 |
| `quiz_passed` | `BOOLEAN` | default FALSE |
| `ceu_awarded` | `NUMERIC(4,1)` | default 0 |
| `attempts` | `INTEGER` | default 1 |
| `started_at` | `TIMESTAMPTZ` | default NOW() |
| `completed_at` | `TIMESTAMPTZ` |  |
| `certificate_id` | `TEXT` | default '' |
| `source` | `TEXT` | default 'internal' |
| `external_ref` | `TEXT` | default '' |

**Table constraints:**

- `UNIQUE (station_id, course_id, user_id)`

## `training_courses`

Department-created video training courses (Phase 7 — Training Hub)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | **not null** default 1 |
| `title` | `TEXT` | **not null** |
| `description` | `TEXT` | default '' |
| `video_url` | `TEXT` | default '' |
| `video_type` | `TEXT` | default 'youtube' |
| `iso_category` | `TEXT` | default 'general-ceu' |
| `ceu_hours` | `NUMERIC(4,1)` | default 0 |
| `duration_minutes` | `INTEGER` | default 0 |
| `level` | `TEXT` | default 'awareness' |
| `passing_score` | `INTEGER` | default 80 |
| `instructor` | `TEXT` | default '' |
| `provider` | `TEXT` | default '' |
| `tags` | `JSONB` | default '[]' |
| `prerequisites` | `JSONB` | default '[]' |
| `quiz` | `JSONB` | default '[]' |
| `source` | `TEXT` | default 'department' |
| `external_id` | `TEXT` | default '' |
| `active` | `BOOLEAN` | default TRUE |
| `created_by` | `TEXT` | default '' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `training_plans`

Annual training plans / programs

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | **not null** default 1 |
| `title` | `TEXT` | **not null** default '' |
| `year` | `INTEGER` | default EXTRACT(YEAR FROM NOW()) |
| `description` | `TEXT` | default '' |
| `category` | `TEXT` | default 'general' |
| `target_hours` | `NUMERIC(6,1)` | default 0 |
| `completed_hours` | `NUMERIC(6,1)` | default 0 |
| `objectives` | `JSONB` | default '[]' |
| `schedule` | `JSONB` | default '[]' |
| `assigned_to` | `JSONB` | default '[]' |
| `status` | `TEXT` | default 'planned' |
| `priority` | `TEXT` | default 'normal' |
| `created_by` | `TEXT` | default '' |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

## `users`

Users table (auth)

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `username` | `TEXT` | **not null** **unique** |
| `email` | `TEXT` | default '' |
| `name` | `TEXT` | **not null** |
| `initials` | `TEXT` | **not null** |
| `role` | `TEXT` | default 'member' |
| `passwordHash` | `TEXT` | **not null** |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `preferences` | `JSONB` | _(added via ALTER TABLE)_ DEFAULT '{}' |

## `volunteer_hours`

Volunteer Hours table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `memberId` | `INTEGER` | **not null** |
| `memberName` | `TEXT` | **not null** |
| `date` | `TEXT` | **not null** |
| `activityType` | `TEXT` | **not null** |
| `hours` | `REAL` | default 0 |
| `description` | `TEXT` | default '' |
| `reference` | `TEXT` | default '' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `wellness`

Wellness table

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `memberId` | `INTEGER` | **not null** **unique** |
| `memberName` | `TEXT` | **not null** |
| `bloodType` | `TEXT` | default '' |
| `medicalRestrictions` | `TEXT` | default '' |
| `physicalDue` | `TEXT` |  |
| `scbaFitDue` | `TEXT` |  |
| `physicals` | `TEXT` | default '[]' |
| `scbaFitTests` | `TEXT` | default '[]' |
| `vaccinations` | `TEXT` | default '[]' |
| `exposures` | `TEXT` | default '[]' |
| `createdAt` | `TIMESTAMPTZ` | default NOW() |
| `updatedAt` | `TIMESTAMPTZ` | default NOW() |

## `workflow_tasks`

── Workflow Tasks — AI orchestration task tracking ────────────────────────

| Column | Type | Default / notes |
| ------ | ---- | --------------- |
| `id` | `SERIAL` | **primary key** |
| `station_id` | `INTEGER` | default 1 |
| `user_id` | `INTEGER` |  |
| `title` | `TEXT` | **not null** |
| `task_type` | `TEXT` | **not null** default 'incident_report' |
| `target_module` | `TEXT` | **not null** default 'incidents' |
| `target_record_id` | `INTEGER` |  |
| `status` | `TEXT` | **not null** default 'active' |
| `ai_drafts` | `JSONB` | default '{}' |
| `conversation` | `JSONB` | default '[]' |
| `deadline` | `TIMESTAMPTZ` |  |
| `completed_at` | `TIMESTAMPTZ` |  |
| `created_at` | `TIMESTAMPTZ` | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | default NOW() |

**Table constraints:**

- `checklist JSONB DEFAULT '[]'`


---

_Last generated: 2026-06-01_
