/**
 * changelog.js — Structured release notes for the What's New modal.
 * Every deployment MUST add an entry here with a bumped version.
 *
 * DEPLOYMENT CHECKLIST:
 * 1. Add a new entry at the TOP of CHANGELOG array below
 * 2. Bump version in client/package.json and server/package.json
 * 3. Bump buildNumber in both package.json files
 * 4. Update CACHE_NAME in client/public/sw.js
 * 5. Commit with descriptive message
 *
 * Entry format:
 *   { version, date, title, summary, changes: [{ type, text }] }
 *   type: 'feature' | 'fix' | 'improvement' | 'data' | 'security' | 'breaking'
 */

const CHANGELOG = [
  {
    version: '0.12.1',
    date: '2026-03-16',
    title: 'Database Seed Audit & Fix, Diagnostic Endpoint',
    summary: 'Fixed broken grievance seed data (schema mismatch), added seed data for apparatus positions, fire permits, policy acknowledgments, and exam assignments. New admin diagnostic endpoint for table population audit.',
    changes: [
      { type: 'fix', text: 'Fixed inline grievance seed in db.js — was using non-existent columns (filed_by_name, resolved_by) causing silent failures' },
      { type: 'data', text: 'New seed: apparatus_positions — 17 crew positions across all 8 apparatus units with required certifications and minimum ranks' },
      { type: 'data', text: 'New seed: fi_permits — 6 fire permits (open burning, temporary occupancy, pyrotechnics, hot work, hazmat storage) with conditions' },
      { type: 'data', text: 'New seed: policy_acknowledgments — 5 department policies (harassment prevention, SCBA air management, social media, controlled substance, EVOC) with per-member acknowledgment tracking' },
      { type: 'data', text: 'New seed: exam_assignments — 10 exam assignments and 6 exam submissions across probationary and experienced members' },
      { type: 'feature', text: 'Admin database audit endpoint (GET /api/admin/db-audit) — reports row counts for all 81 tables with empty/populated/runtime status' },
      { type: 'feature', text: 'Force reseed endpoint (POST /api/admin/force-reseed) — re-runs all seed modules for tables that are empty' },
    ]
  },
  {
    version: '0.12.0',
    date: '2026-03-15',
    title: 'AI Command Center, Email-to-Module, Today\'s Crew & Full Dropdown Standardization',
    summary: 'AI-powered landing page with briefing engine, weather integration, and timeline. TV Display rebuilt as walk-in kiosk. Email-to-module filing system. Today\'s Crew per-person schedule view. All remaining member fields converted to dropdowns.',
    changes: [
      { type: 'feature', text: 'AI Briefing Bar — assembles data from 15+ DB queries, generates prioritized operational insights via Claude Haiku or GPT-4o-mini with rule-based fallback' },
      { type: 'feature', text: 'Weather integration — OpenWeatherMap API with 15-min cache, operational alerts (high wind, extreme cold, heat), 3-day forecast, simulated fallback' },
      { type: 'feature', text: 'Today\'s Timeline — merges shifts, events, training, maintenance, meetings into single chronological view with NOW tags and time-based status' },
      { type: 'feature', text: '4 Readiness Cards — staffing, apparatus, training, budget with green/amber/red status dots replacing old 8-card stat strip' },
      { type: 'feature', text: 'TV Display rebuilt as "Today" kiosk for Apple TV — dark theme, 10-foot fonts, zero interaction, auto-refresh (15s–10min), incident mode with elapsed timer' },
      { type: 'feature', text: 'Email-to-Module — paste email content, AI classifies and routes to correct module (grants, training, maintenance, etc.) with confidence scores' },
      { type: 'feature', text: 'Today\'s Crew view — per-person expandable cards showing daily schedule, role in each activity, progress rings, cert expirations' },
      { type: 'feature', text: 'TV PIN management in Station Settings — generate, regenerate, copy URL for Apple TV setup' },
      { type: 'improvement', text: 'Converted 11 remaining free-text member fields to dropdowns across 8 components (ApparatusOOS, TrainingPlans, ExposureTracking, SOGForm, PolicyAcknowledgments, PayrollTracker, SCBATracker, FireInspectionForm)' },
      { type: 'improvement', text: 'Replaced hardcoded INSPECTORS, OFFICERS, INVESTIGATORS arrays with dynamic API-driven member dropdowns in FireInspectionForm, StationLog, FireInvestigation' },
      { type: 'improvement', text: 'New backend endpoints: /api/dashboard/briefing, /api/dashboard/today, /api/weather/current, /api/email-ingest/*' },
    ],
  },
  {
    version: '0.11.0.8',
    date: '2026-03-15',
    title: 'Station Calendar Redesign & Seed Data Expansion',
    summary: 'Completely redesigned Station Calendar as the visual centerpiece, expanded seed data to 6 months, and added HR/Personnel architecture document.',
    changes: [
      { type: 'feature', text: 'Station Calendar redesigned with month-grid-first layout, crew avatar badges, staffing indicators, and visual heat gradients based on activity density' },
      { type: 'feature', text: 'Slide-out Day Detail Panel with crew cards, event timeline, and RSVP management — replaces separate day/week views' },
      { type: 'feature', text: 'CSS micro-animations: today-pulse ring, crew-badge hover scale, day-cell lift, event-pill glow' },
      { type: 'improvement', text: 'Shift seed data expanded from 1 month to 6 months (Jan–Jun 2026) with all 12 members in rotation' },
      { type: 'improvement', text: 'Event seed data expanded from 27 to 44 events across 6 months — drills, training, fundraisers, community events, and special details' },
      { type: 'improvement', text: 'Daily staffing seed expanded from 1 day to 6 months with realistic apparatus crew rotation' },
      { type: 'fix', text: 'Replaced phantom member names (Priya Sharma, Luz Hernandez, Connor Walsh) in drills, station logs, and client events data' },
      { type: 'data', text: 'Station log expanded with 3 new entries covering night shifts and additional members (Diane Tolliver, Amy Winters, Carlos Ruiz)' },
    ],
  },
  {
    version: '0.10.0.7',
    date: '2026-03-15',
    title: 'Data Integrity, Documents & Dropdowns',
    summary: 'Major data quality overhaul, document attachments everywhere, and consistent member dropdowns across the entire system.',
    changes: [
      { type: 'fix', text: 'Fixed system-wide member data mismatch — all 37+ seed files now reference the correct canonical roster (Sarah Chen, Maria Delgado, Nathan McGee, etc.)' },
      { type: 'fix', text: 'Fire Chief now shows correct certifications, training records, and volunteer hours in Member Portal' },
      { type: 'feature', text: 'Document attachments added to 23 modules — attach files, photos, SOPs, and legal documents to any record' },
      { type: 'improvement', text: 'Member dropdown selectors replace free-text inputs in 10 forms (apparatus, drills, grievances, hazmat, maintenance, investigations, equipment, cost tracking)' },
      { type: 'feature', text: 'Personal Assistant with proactive alerts, focus modes, and sidebar panel accessible from top nav' },
      { type: 'feature', text: 'Version changelog system — click the version badge to see what changed in each release' },
      { type: 'data', text: 'All 12 demo members now have proper certifications, emergency contacts, and profile details' },
    ],
  },
  {
    version: '0.9.0.6',
    date: '2026-03-14',
    title: 'Architecture Implementation Sprint',
    summary: 'Massive feature build implementing calendar architecture, dashboard enhancements, community outreach, and document systems.',
    changes: [
      { type: 'feature', text: 'Station Calendar promoted to top-level nav with unified view as default' },
      { type: 'feature', text: 'Week, Day, Agenda, and My Calendar views added to Station Calendar' },
      { type: 'feature', text: 'Community Outreach module with events, safety checklists, and attendance tracking' },
      { type: 'feature', text: 'iCal subscription system with per-member tokens' },
      { type: 'feature', text: 'RRULE recurring event support (RFC 5545)' },
      { type: 'feature', text: 'Dashboard health scorecard — color-coded status for staffing, training, apparatus, budget' },
      { type: 'feature', text: '5 new calendar feeds: mutual aid, SOG review, equipment checkout, personnel, community' },
      { type: 'improvement', text: 'Role-based dashboard visibility (chief sees all, officers see operations, firefighters see personal)' },
      { type: 'data', text: 'Expanded seed data for personnel actions, shift trades, after-action reports, and fundraising' },
    ],
  },
  {
    version: '0.8.0.5',
    date: '2026-03-13',
    title: 'Meetings, Calendar & Dashboard Foundation',
    summary: 'Core meeting minutes, linked meetings system, calendar feed architecture, and dashboard summary endpoint.',
    changes: [
      { type: 'feature', text: 'Meeting Minutes module with templates, attendance, action items, and linked records' },
      { type: 'feature', text: 'LinkedMeetings cross-module component for connecting meetings to any record' },
      { type: 'feature', text: 'Calendar feed aggregation system with 17 module feeds' },
      { type: 'feature', text: 'Dashboard summary endpoint with 15+ parallel queries' },
      { type: 'improvement', text: 'Context-sensitive help system expanded for all modules' },
    ],
  },
];

export default CHANGELOG;
