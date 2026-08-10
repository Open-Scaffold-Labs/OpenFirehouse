import { useState, useMemo } from 'react';
import {
  X, HelpCircle, BookOpen, Shield, Lightbulb,
  ChevronDown, ChevronUp, ExternalLink, Layers,
  Search, ListChecks, Link2,
} from 'lucide-react';
import { ROLES } from '../data/auth';
import { getModuleHelp, MODULE_HELP } from '../data/helpContent';

// ─── Static reference data ─────────────────────────────────────────────────

const MODULES_QUICK = [
  {
    group: 'Personnel',
    color: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900',
    items: [
      { name: 'Member Roster',     desc: 'View and manage all department members. Filter by rank, role, or status.' },
      { name: 'Duty Schedule',     desc: 'Weekly shift calendar. Assign members to shifts with roles and times.' },
      { name: 'Volunteer Hours',   desc: 'Log and track hours by member and activity type. View YTD totals.' },
      { name: 'Member Portal',     desc: 'Profile view per member — certifications, training history, hours, and incident history.' },
      { name: 'Training',          desc: 'Certification records, LOSAP compliance dashboard, and on-demand AI training modules. CE credit auto-logged on module completion.' },
      { name: 'Health & Wellness', desc: 'NFPA 1582 physicals, SCBA fit tests, exposure log, and vaccinations per member.' },
      { name: 'Cadet Program',       desc: 'Junior firefighter / explorer tracking. Age calculation, ranks, training hours, and guardian contacts.' },
      { name: 'Retention Scoring',    desc: 'Engagement scores per member computed from training, hours, and tenure. At-risk member flagging.' },
      { name: 'Personnel Actions',    desc: 'Track promotions, disciplinary actions, certifications earned, leaves of absence, and probation completions.' },
      { name: 'Daily Staffing',       desc: 'Real-time view of who is on shift. Minimum crew tracking and apparatus assignment.' },
    ],
  },
  {
    group: 'Apparatus',
    color: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900',
    items: [
      { name: 'Apparatus Tracker',   desc: 'All apparatus with status, mileage, and service info.' },
      { name: 'Maintenance Log',     desc: 'Work orders per unit. Auto-calculates total cost. Tracks priority and status.' },
      { name: 'Inspection Checks',   desc: 'Run checklists for apparatus and station. Deficiencies auto-documented.' },
      { name: 'Assignment Board',    desc: 'Per-shift crew assignments to apparatus and riding positions.' },
      { name: 'Out of Service',      desc: 'Track OOS apparatus with reasons and expected return dates.' },
      { name: 'Equipment Checkout',  desc: 'Check out radios, TICs, tools to members. Tracks condition and overdue returns.' },
    ],
  },
  {
    group: 'Operations',
    color: 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900',
    items: [
      { name: 'Incident Log',        desc: 'Log all responses with type, units, personnel, disposition, and injury count.' },
      { name: 'NFIRS / NERIS',       desc: 'NFIRS 5.0 and NERIS 1.0 report capture with format toggle, completeness tracking, and dual-format export.' },
      { name: 'Fire Inspections',    desc: 'Property inspections, violation tracking, and permit management.' },
      { name: 'Hydrant Management',  desc: 'Water supply inventory with ISO flow classification and annual test records.' },
      { name: 'Drills & Courses',    desc: 'Log department drills and certification courses. Tracks ISO training hours and attendance.' },
      { name: 'Station Daily Log',   desc: 'Shift-by-shift journal: apparatus checks, member roster, timestamped events, and visitors.' },
      { name: 'Community Risk',      desc: 'Home safety visits, detector installs, community programs, and JFS case tracking.' },
      { name: 'CAD Integration',     desc: 'Connect to county/regional CAD systems to auto-import dispatch data. Supports 7+ vendors.' },
      { name: 'Fire Investigation',  desc: 'NFPA 921 cause & origin cases — scene checklist, evidence log, referrals, narrative.' },
      { name: 'Pre-Incident Plans',  desc: '6-tab property plans: hazards, access, water supply, suppression, utilities.' },
      { name: 'Mutual Aid',          desc: 'Track aid given and received from neighboring departments.' },
      { name: 'Aid Agreements',      desc: 'Manage formal mutual aid agreements: terms, expiration dates, and renewal tracking.' },
      { name: 'After Action',        desc: 'Post-incident reviews: strengths, improvements, lessons learned, and action items.' },
      { name: 'Incident Costs',      desc: 'Calculate full incident cost: apparatus, personnel, materials. Generate invoices for billable responses.' },
      { name: 'Event Calendar',      desc: 'Monthly/list view for events. RSVP per member.' },
      { name: 'Public Dashboard',    desc: 'Read-only public view: YTD stats, unit status, recent incidents.' },
      { name: 'Response Analytics',   desc: 'Monthly response time trends with NFPA 1720 benchmarks. Color-coded turnout time performance bars.' },
    ],
  },
  {
    group: 'Administration',
    color: 'bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-900',
    items: [
      { name: 'SOG Library',       desc: 'Browse and manage SOGs/policies by category. Version tracking and review alerts.' },
      { name: 'Policy Sign-offs',  desc: 'Track member acknowledgment of policies and directives. Compliance reporting.' },
      { name: 'Meeting Minutes',   desc: 'Record meeting attendees, motions, votes, and action items with assignments.' },
      { name: 'Document Vault',    desc: 'Central repository for department documents: policies, agreements, certificates, building plans.' },
      { name: 'Grievance Tracker', desc: 'Step-based grievance workflow from filing through officer review, chief review, and resolution.' },
      { name: 'Shift Trades',      desc: 'Member-to-member shift swaps with FLSA impact tracking and officer approval.' },
      { name: 'Budget & Finance',  desc: 'Budget lines vs. actual spending. Progress bars per category. Chief only.' },
      { name: 'Grant Management',  desc: 'Track AFG, SAFER, state grants — lifecycle, deadlines, expenditures, and reporting.' },
      { name: 'Asset & Inventory', desc: 'Track equipment and supplies. Manage quantities and reorder flags.' },
      { name: 'Data Import',       desc: '7-step import wizard for CSV exports from any legacy RMS.' },
      { name: 'Fundraising',          desc: 'Campaign and donation management with progress tracking. Goal amounts, donor ledger, and stats.' },
      { name: 'Bulletin Board',       desc: 'Department-wide announcements with categories, priorities, and pinning. Replaces the station corkboard.' },
      { name: 'Reports & Export',  desc: 'Generate and export PDF reports covering 15 report types. Officer+ only.' },
    ],
  },
  {
    group: 'Career & Workforce',
    color: 'bg-teal-50 dark:bg-teal-950/50 border-teal-200 dark:border-teal-900',
    items: [
      { name: 'Timesheets',          desc: 'Period-based timesheets: regular, OT, leave, and trade hours. FLSA period integration.' },
      { name: 'FLSA 207(k)',         desc: 'FLSA overtime compliance dashboard with configurable work periods and OT thresholds.' },
      { name: 'OT Equalization',     desc: 'Fair overtime distribution tracking. Ranks members by accumulated OT hours.' },
      { name: 'Qualifications',      desc: 'Certification and license tracking with expiration alerts. NJ-specific and NFPA standards.' },
      { name: 'Exposure & Safety',   desc: 'OSHA-compliant hazardous exposure documentation linked to incidents and members.' },
      { name: 'Training Plans',      desc: 'Structured training curricula with objectives, timelines, and per-member progress tracking.' },
    ],
  },
  {
    group: 'AI & Tools',
    color: 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-900',
    items: [
      { name: 'Dashboard',          desc: 'At-a-glance overview: apparatus status, weather, active incidents, duty crew, upcoming events, and alert badges.' },
      { name: 'Notifications',      desc: 'Centralized alert center for expiring certs, overdue inspections, approaching deadlines, and system warnings.' },
      { name: 'Station Settings',   desc: 'Department configuration: station name, FDID, address, apparatus list, API keys, and feature toggles. Chief only.' },
      { name: 'Availability',       desc: 'One-tap toggle to mark yourself Available or Unavailable. Live department-wide count for coverage awareness.' },
      { name: 'AI Scheduling',      desc: 'AI-suggested duty schedules based on availability, certifications, and history.' },
      { name: 'AI Data Ingestion',  desc: 'AI-powered import wizard: paste any data format and AI maps columns, transforms, and imports to the database.' },
      { name: 'AI Incident Intel',  desc: 'AI-powered trend detection, risk scoring, and predictive analysis from incident data.' },
      { name: 'AI Training Rec.',   desc: 'Personalized training recommendations based on certification gaps and department needs.' },
      { name: 'AI Report Writer',   desc: 'Generate after-action summaries and board reports from structured data. (Incident narratives are officer-written — never AI-generated.)' },
      { name: 'AI Pre-Plan Gen.',   desc: 'Generate pre-incident plans from building data, occupancy type, and hazard information.' },
      { name: 'AI Staffing Pred.',  desc: 'Forecast staffing needs based on historical patterns, events, and leave trends.' },
      { name: 'Email Ingest',       desc: 'AI-powered email classification. Paste an email and AI routes it to the correct module for filing.' },
      { name: "Today's Crew",       desc: 'Quick-glance view of who is on duty with activity progress rings and current task highlighting.' },
      { name: 'Database Admin',     desc: 'System diagnostic tool. Audit table row counts, identify empty tables, and force-reseed demo data.' },
      { name: 'Recruitment',        desc: 'Track recruitment leads from initial interest through application, interview, background check, and onboarding.' },
      { name: 'Recall System',      desc: 'Issue department-wide recalls with urgency levels. Track member responses and ETAs in real time.' },
      { name: 'Command Board',      desc: 'Live incident command display with ICS positions, unit assignments, benchmarks, and PAR tracking.' },
      { name: 'HazMat Tracker',     desc: 'Chemical inventory, exposure logging, decon records, and SDS reference for hazardous materials incidents.' },
      { name: 'SCBA Tracker',       desc: 'Air cylinder management: serial numbers, fill records, hydro test dates, and condition tracking.' },
      { name: 'Payroll Tracker',    desc: 'Per-call stipend calculations, pay period exports, and pay rate configuration.' },
      { name: 'TV Display',         desc: 'Wall-mounted station display showing apparatus status, weather, active calls, and duty crew. PIN-protected.' },
    ],
  },
];

const ROLE_TABLE = [
  { module: 'Dashboard',           chief: true,  officer: true,  member: true  },
  { module: 'Member Roster',       chief: true,  officer: true,  member: true  },
  { module: 'Duty Schedule',       chief: true,  officer: true,  member: true  },
  { module: 'Volunteer Hours',     chief: true,  officer: true,  member: true  },
  { module: 'Member Portal',       chief: true,  officer: true,  member: true  },
  { module: 'Training',            chief: true,  officer: true,  member: true  },
  { module: 'Health & Wellness',   chief: true,  officer: true,  member: true  },
  { module: 'Apparatus Tracker',   chief: true,  officer: true,  member: true  },
  { module: 'Maintenance Log',     chief: true,  officer: true,  member: true  },
  { module: 'Inspection Checks',   chief: true,  officer: true,  member: true  },
  { module: 'Incident Log',        chief: true,  officer: true,  member: true  },
  { module: 'NFIRS / NERIS',       chief: true,  officer: true,  member: false },
  { module: 'Fire Inspections',    chief: true,  officer: true,  member: false },
  { module: 'Hydrant Management',  chief: true,  officer: true,  member: false },
  { module: 'Drills & Courses',    chief: true,  officer: true,  member: true  },
  { module: 'Station Daily Log',   chief: true,  officer: true,  member: false },
  { module: 'Community Risk',      chief: true,  officer: true,  member: true  },
  { module: 'CAD Integration',     chief: true,  officer: true,  member: false },
  { module: 'Fire Investigation',  chief: true,  officer: true,  member: false },
  { module: 'Grant Management',    chief: true,  officer: true,  member: false },
  { module: 'Pre-Incident Plans',  chief: true,  officer: true,  member: true  },
  { module: 'Mutual Aid',          chief: true,  officer: true,  member: false },
  { module: 'Event Calendar',      chief: true,  officer: true,  member: true  },
  { module: 'Public Dashboard',    chief: true,  officer: true,  member: true  },
  { module: 'SOG Library',         chief: true,  officer: true,  member: true  },
  { module: 'Budget & Finance',    chief: true,  officer: false, member: false },
  { module: 'Asset & Inventory',   chief: true,  officer: true,  member: false },
  { module: 'Data Import',         chief: true,  officer: true,  member: false },
  { module: 'Reports & Export',    chief: true,  officer: true,  member: false },
  { module: 'AI Scheduling',       chief: true,  officer: true,  member: false },
  { module: 'Cadet Program',       chief: true,  officer: true,  member: false },
  { module: 'Retention Scoring',   chief: true,  officer: true,  member: false },
  { module: 'Response Analytics',  chief: true,  officer: true,  member: true  },
  { module: 'Fundraising',         chief: true,  officer: true,  member: false },
  { module: 'Bulletin Board',      chief: true,  officer: true,  member: true  },
  { module: 'Recruitment',         chief: true,  officer: true,  member: false },
  { module: 'Recall System',       chief: true,  officer: true,  member: true  },
  { module: 'Command Board',       chief: true,  officer: true,  member: true  },
  { module: 'HazMat Tracker',      chief: true,  officer: true,  member: false },
  { module: 'SCBA Tracker',        chief: true,  officer: true,  member: false },
  { module: 'Payroll Tracker',     chief: true,  officer: false, member: false },
  { module: 'TV Display',          chief: true,  officer: true,  member: true  },
  { module: 'Availability',        chief: true,  officer: true,  member: true  },
  { module: 'Notifications',       chief: true,  officer: true,  member: true  },
  { module: 'Station Settings',    chief: true,  officer: false, member: false },
  // ── Career & Full-Service ──
  { module: 'Daily Staffing',       chief: true,  officer: true,  member: false },
  { module: 'Personnel Actions',    chief: true,  officer: true,  member: false },
  { module: 'Training Plans',       chief: true,  officer: true,  member: false },
  { module: 'Qualifications',       chief: true,  officer: true,  member: false },
  { module: 'Exposure & Safety',    chief: true,  officer: true,  member: false },
  { module: 'Assignment Board',     chief: true,  officer: true,  member: false },
  { module: 'Apparatus OOS',        chief: true,  officer: true,  member: false },
  { module: 'Equipment Checkout',   chief: true,  officer: true,  member: true  },
  { module: 'Aid Agreements',       chief: true,  officer: true,  member: false },
  { module: 'After Action',         chief: true,  officer: true,  member: false },
  { module: 'Incident Costs',       chief: true,  officer: true,  member: false },
  { module: 'Timesheets',           chief: true,  officer: false, member: false },
  { module: 'FLSA 207(k)',          chief: true,  officer: false, member: false },
  { module: 'OT Equalization',      chief: true,  officer: false, member: false },
  { module: 'Policy Sign-offs',     chief: true,  officer: true,  member: true  },
  { module: 'Meeting Minutes',      chief: true,  officer: true,  member: false },
  { module: 'Document Vault',       chief: true,  officer: true,  member: false },
  { module: 'Grievance Tracker',    chief: true,  officer: true,  member: false },
  { module: 'Shift Trades',         chief: true,  officer: true,  member: true  },
  // ── AI Modules ──
  { module: 'AI Data Ingestion',    chief: true,  officer: false, member: false },
  { module: 'AI Incident Intel',    chief: true,  officer: true,  member: false },
  { module: 'AI Training Rec.',     chief: true,  officer: true,  member: false },
  { module: 'AI Report Writer',     chief: true,  officer: true,  member: false },
  { module: 'AI Pre-Plan Gen.',     chief: true,  officer: true,  member: false },
  { module: 'AI Staffing Pred.',    chief: true,  officer: true,  member: false },
  { module: 'Email Ingest',        chief: true,  officer: true,  member: false },
  { module: "Today's Crew",        chief: true,  officer: true,  member: true  },
  { module: 'Database Admin',      chief: true,  officer: false, member: false },
  { module: 'Community Outreach',  chief: true,  officer: true,  member: true  },
];

const TIPS = [
  { tip: 'Press Escape to close any open form or modal.' },
  { tip: 'Click anywhere on a table row to expand its full detail — no need to find a specific button.' },
  { tip: 'Collapse sidebar groups you don\'t use to keep navigation tidy. Preferences are remembered for the session.' },
  { tip: 'All search bars filter live as you type.' },
  { tip: 'The Public Dashboard auto-strips house numbers from addresses for privacy.' },
  { tip: 'When running an Inspection Checklist, failing an item automatically opens a deficiency notes field.' },
  { tip: 'In the Maintenance Log, total cost auto-calculates from parts cost + labor cost.' },
  { tip: 'SCBA fit test and physical due dates in Health & Wellness are flagged automatically 90 days before expiry.' },
  { tip: 'Budget progress bars turn amber at 70% used and red at 90%.' },
  { tip: 'SOGs with a review date within 90 days show a "Due Soon" badge on their card.' },
  { tip: 'Notifications badge counts only Critical and Warning alerts — Info notices don\'t add to the badge.' },
  { tip: 'Click any alert in the Notifications module to jump directly to the affected record.' },
  { tip: 'Passing an On-Demand Module auto-creates a CE training record — no manual entry needed. Hours count toward LOSAP immediately.' },
  { tip: 'Run the Compliance & LOSAP export by November 1 so members at risk still have time to earn more hours before the LOSAP deadline.' },
  { tip: 'Use the Ask AI button inside any training module to get instant answers about slide content without leaving the player.' },
  { tip: 'Link each NFIRS report to its Incident Log entry to avoid duplicate data entry.' },
  { tip: 'Fire Inspection permits show days-remaining warnings when within 90 days of expiry.' },
  { tip: 'Toggle your Availability status daily — it takes one tap and gives officers an accurate real-time coverage picture.' },
  { tip: 'Check Retention Scoring monthly at your officers meeting to catch declining engagement early.' },
  { tip: 'The Bulletin Board replaces the station corkboard — pin important notices and unpin when they\'re stale.' },
  { tip: 'Response Analytics auto-computes from your Incident Log. The more complete your incident records, the more accurate the analysis.' },
  { tip: 'Log every fundraising donation immediately — the complete ledger is essential for financial audits and 501(c)(3) reporting.' },
  { tip: 'The AI Mission Brief stays on your screen even if you lose cell signal — it renders locally once generated.' },
  { tip: 'Use the Command Board on a tablet during active incidents for a live ICS overview with unit tracking and PAR checks.' },
  { tip: 'The TV Display at /tv?pin=XXXX bypasses login entirely — perfect for a wall-mounted station monitor.' },
  { tip: 'HazMat exposure records are permanent and linked to members\' Health & Wellness profiles for long-term occupational health tracking.' },
  { tip: 'SCBA cylinder hydrostatic test reminders fire automatically 90 days before the due date — no manual tracking needed.' },
  // ── Career & Full-Service tips ──
  { tip: 'Timesheets auto-calculate total hours from regular + OT + leave + trade components. No manual math needed.' },
  { tip: 'The FLSA 207(k) dashboard shows real-time OT threshold tracking. Check it before approving overtime assignments.' },
  { tip: 'OT Equalization ranks members from fewest to most OT hours — always assign from the top for fair distribution.' },
  { tip: 'Daily Staffing turns red when you drop below minimum crew. Use it every morning to verify coverage before accepting assignments.' },
  { tip: 'Personnel Actions create a permanent audit trail. Use them for promotions, discipline, and certifications — never just verbal changes.' },
  { tip: 'Shift Trades track FLSA impact. The system warns you if a trade would push either member over their OT threshold.' },
  { tip: 'Meeting Minutes action items appear in the assigned member\'s Notifications — they won\'t miss a follow-up.' },
  { tip: 'Qualification expiration alerts fire at 90, 60, and 30 days. Plan renewals early to avoid gaps in compliance.' },
  { tip: 'The AI Data Ingestion wizard accepts any data format — even messy copy-paste from old spreadsheets. Let the AI figure out the columns.' },
  { tip: 'AI-powered modules require an OPENAI_API_KEY or ANTHROPIC_API_KEY set in Station Settings. Without one, AI features show an error.' },
  { tip: 'After Action reports are most valuable within 72 hours of an incident. Don\'t wait for the monthly meeting.' },
  { tip: 'Equipment Checkout tracks condition at both checkout and return — catch damage early before it becomes a safety issue.' },
  { tip: 'Policy Sign-offs create an audit trail proving every member acknowledged the policy. Essential for liability protection.' },
  { tip: 'The Grievance Tracker moves through formal steps: Filing, Officer Review, Chief Review, Resolution. Follow the process for legal compliance.' },
];

const FAQ = [
  {
    q: "Why can't I see the Budget & Finance module?",
    a: "Budget & Finance is restricted to Chief role only. If you need access, ask your chief to update your system role in Station Settings.",
  },
  {
    q: "Why can't I see some modules at all?",
    a: "Module visibility is controlled by your role — Member, Officer, or Chief. Members have the most restricted view. Check the Roles & Access tab to see exactly what each role can access.",
  },
  {
    q: "I added a member but they don't show up in the schedule or hours log. Why?",
    a: "Make sure the member's status is set to Active in the Member Roster. Inactive and LOA members are excluded from scheduling and some filters.",
  },
  {
    q: "How do I link an NFIRS report to an incident?",
    a: "Open the NFIRS form and use the Linked Incident field to search for the incident number. This pulls address, date, and unit data automatically so you don't have to re-enter it.",
  },
  {
    q: "My certification alert keeps showing after I updated the date. How do I clear it?",
    a: "Open Training → Records tab and edit the certification entry directly — make sure to save. Notifications refreshes its alerts from live data each time you navigate to it.",
  },
  {
    q: "How does LOSAP tracking work in OpenFirehouse?",
    a: "Go to Training → Compliance & LOSAP tab. Every training record logged for the current calendar year counts toward each member's LOSAP hour total. The dashboard shows every member's progress against the 50-point annual threshold in real time. When a member completes an On-Demand Module and passes the quiz, CE hours are credited automatically. Use the Export CSV button to generate the training report for your LOSAP administrator.",
  },
  {
    q: "How do I launch an On-Demand training module?",
    a: "Go to Training → On-Demand Modules tab. Click Start Module on any card. Step through the slides using the navigation at the bottom, then click Take Quiz. If you pass, a Continuing Education record is automatically created in your Records tab and your LOSAP hours are updated.",
  },
  {
    q: "Do On-Demand Modules count toward LOSAP points?",
    a: "Yes — each module is worth 0.5 CE hours. Passing the quiz automatically creates a Continuing Education training record, which feeds directly into the Compliance & LOSAP dashboard. Training hours from modules count toward the 20-point annual cap from training (1 point per hour).",
  },
  {
    q: "Can I retake a module if I fail the quiz?",
    a: "Yes. From the completion screen, click Retry to go back through the slides and retake the quiz. Your most recent score is saved, so retaking and passing will update your record to Passed and credit the CE hours.",
  },
  {
    q: "What is the AI assistant inside the training modules?",
    a: "Every On-Demand Module has an Ask AI button in the top-right of the player. It opens a chat panel where you can ask questions about the slide content, clarify quiz explanations, or get deeper information on topics covered. The AI is connected to OpenFirehouse's knowledge of NFIRS codes, LOSAP rules, and NJ certifications. Requires an Anthropic API key configured in Station Settings.",
  },
  {
    q: "How do I import data from our old system?",
    a: "Go to Data Import and upload a CSV export from your previous RMS. The 7-step wizard walks you through field mapping and validation before any data is written.",
  },
  {
    q: "Can members see each other's health and wellness records?",
    a: "No. Members can only see their own record. Officers see limited summary info. Full medical detail — clearance status, physician notes — is Chief-only.",
  },
  {
    q: "Why did my apparatus get set to Out of Service after I created a maintenance record?",
    a: "Emergency-priority work orders automatically set the linked apparatus to Out of Service. Change the priority to Routine or Urgent, or manually update the status in Apparatus Tracker.",
  },
  {
    q: "How do the training scenarios work?",
    a: "Go to Training → Scenarios tab. Each scenario is a multi-scene decision tree where you play the role of an officer responding to a realistic NJ incident. You make a command decision at each scene, get immediate feedback, and earn a grade at the end. Scenarios earn 1.0 CE hour on completion. There are 32 scenarios across 7 categories, from Foundational to Expert difficulty.",
  },
  {
    q: "What is the Expert difficulty tier in scenarios?",
    a: "Expert scenarios feature cascading failures, simultaneous priorities, and ethical dilemmas with no perfect answer. The passing threshold is 70% instead of 60%. The 1-point answer is what a competent officer would pick — the 2-point answer requires expert-level reasoning. These are designed to challenge even 30-year veterans.",
  },
  {
    q: "How does the 'I'm Responding' feature work?",
    a: "When a dispatch comes in, tap the green 'I'm Responding' button on the CAD alert banner, Dashboard, or Command Board. You'll choose between AI Mission Brief (personalized guidance based on your cert level) or Standard Response (just logs you as responding). The system determines your NJ certification level from your training records and generates role-specific guidance.",
  },
  {
    q: "Can I turn off AI guidance when responding to an incident?",
    a: "Yes. When you tap 'I'm Responding,' you'll see two options: AI Mission Brief or Standard Response. Standard Response logs your response status and gives you a basic checklist without making any AI calls.",
  },
  {
    q: "How do I customize which modules appear on my dashboard?",
    a: "Click your name in the top-right corner and select 'Customize My View.' You can toggle dashboard widgets (Stats, Alerts, Shifts, etc.) and sidebar navigation items on or off. Your preferences save to both your browser and the server so they sync across devices.",
  },

  // ── Exams (Phase 7) ─────────────────────────────────────────────────────
  {
    q: "How do the Certification Exams work?",
    a: "Go to Training → Exams tab. Officers and chiefs can create timed, proctored-feel exams with multiple-choice question banks, set a passing score (default 70%), and assign exams to specific members or the whole department with a due date. Members see their assignments and take the exam in a full-screen player with a countdown timer. Results are scored automatically and a training record is created on pass.",
  },
  {
    q: "Can I download a certificate after passing an exam?",
    a: "Yes. In the Exams tab under 'My Results,' any passed exam shows a 'Download Certificate (PDF)' button. It generates a professional certificate with your department seal, name, exam title, score, and date — ready to print or submit to the state.",
  },
  {
    q: "How do I create and assign an exam as an officer?",
    a: "Go to Training → Exams → Create New Exam. Add a title, category, time limit, passing score, and build your question bank (question text, four choices, mark the correct answer). Save as Draft or Published. Then use the Assign button to select which members need to take it, and optionally set a due date.",
  },

  // ── Incident Response (expanded) ─────────────────────────────────────────
  {
    q: "What does the AI Mission Brief contain and how is it generated?",
    a: "The Mission Brief has five sections: Your Mission (role assignment based on cert level), Key Hazards (incident-specific risks), On Arrival (step-by-step approach instructions), Do NOT (hard restrictions for your cert level), and Action Checklist (interactive task list). It's generated in seconds using your training records, the incident type, and the dispatch address.",
  },
  {
    q: "Can I use Live Incident Response without cell service?",
    a: "The mission brief is generated and rendered before you lose signal. Once it's on your screen, it stays visible even offline. However, the AI Q&A feature requires an active connection since it makes real-time API calls. Your status updates (EN ROUTE, ON SCENE, CLEARED) will queue and sync when you regain signal.",
  },
  {
    q: "What if my cert level looks wrong in the mission brief?",
    a: "Your cert level is determined from Training Management. If it's incorrect, ask an officer to update your certifications in Training → Records. The system uses the highest active certification: Probationary < FF I < FF II < Officer < HazMat Ops. EMT is tracked separately. Changes take effect on your next response.",
  },

  // ── Apparatus (expanded) ───────────────────────────────────────────────
  {
    q: "How do I mark an apparatus as out of service?",
    a: "Go to Apparatus Tracker, click the unit, and change its status to Out of Service. You can also create a Maintenance Log work order with Emergency priority — this automatically sets the apparatus to OOS. The Dashboard and TV Display update immediately to reflect the change.",
  },
  {
    q: "How do I track mileage and pump hours on apparatus?",
    a: "In Apparatus Tracker, each unit has mileage and pump hour fields. Update these during daily apparatus checks or after incidents. The Inspection Checklists module includes prompts to record current readings, and the system alerts you when service intervals are approaching.",
  },

  // ── HazMat (expanded) ─────────────────────────────────────────────────
  {
    q: "How do I log a HazMat exposure for a member?",
    a: "Go to HazMat Tracker and click Log Exposure. Select the member, chemical/substance, exposure type (inhalation, skin contact, ingestion), duration, and PPE worn. Link it to the incident if applicable. Exposure records are permanent and feed into the member's Health & Wellness history for long-term tracking.",
  },
  {
    q: "How do I manage the chemical inventory in HazMat Tracker?",
    a: "The HazMat Tracker includes a chemical inventory with name, UN number, hazard class, quantity, storage location, and SDS reference. Add chemicals your station stores or commonly encounters. During incidents, responders can search the inventory for quick hazard reference and isolation distances.",
  },

  // ── Budget (expanded) ─────────────────────────────────────────────────
  {
    q: "How do budget progress bars and warnings work?",
    a: "Each budget line shows a progress bar of actual spending vs. allocated amount. Bars turn amber at 70% spent and red at 90%. This gives chiefs early warning before a category is overspent. Grant-funded lines can be tagged separately so grant expenditures don't muddy the general operating budget.",
  },

  // ── Duty Schedule ────────────────────────────────────────────────────────
  {
    q: "How does the Duty Schedule work?",
    a: "The Duty Schedule lets officers assign members to shifts on a calendar. Members can view the schedule and toggle their availability status. The AI Scheduler can auto-fill slots based on member availability and qualifications. The schedule feeds into the Dashboard and TV Display so everyone knows who's on duty.",
  },

  // ── CAD Integration ──────────────────────────────────────────────────────
  {
    q: "How do I set up CAD integration?",
    a: "Go to the CAD Integration page and enter your dispatch provider details (Active911 webhook URL or I Am Responding credentials). Once connected, incoming dispatches automatically appear as alert banners across the app and populate the Incident Command Board in real time.",
  },

  // ── Fire Investigation ───────────────────────────────────────────────────
  {
    q: "How do I start a fire investigation case?",
    a: "Go to Fire Investigation and click New Case. Link it to an existing incident, add the investigation type (accidental, suspicious, undetermined), and begin logging evidence, interview notes, photos, and narrative. Only officers and chiefs can create and view investigation cases.",
  },

  // ── Pre-Incident Plans ───────────────────────────────────────────────────
  {
    q: "What are Pre-Incident Plans and how do I use them?",
    a: "Pre-Plans are detailed tactical documents for high-risk properties in your response area. Go to Pre-Incident Plans to create a plan with building details, hazards, access points, water supply info, and tactical notes. During a live incident, responders can pull up the pre-plan for that address to make better decisions.",
  },

  // ── Mutual Aid ───────────────────────────────────────────────────────────
  {
    q: "How does the Mutual Aid Tracker work?",
    a: "The Mutual Aid module logs all mutual aid given and received with neighboring departments. Track dates, incident types, units dispatched, and hours. This data feeds into your annual reporting and helps justify future mutual aid agreements.",
  },

  // ── Hydrant Management ───────────────────────────────────────────────────
  {
    q: "How do I log hydrant inspections and flow tests?",
    a: "Go to Hydrant Management, find or add a hydrant by location, and click it to log a flow test or inspection. Record static pressure, residual pressure, GPM flow, and condition notes. The system tracks ISO compliance and highlights hydrants overdue for testing.",
  },

  // ── Station Log ──────────────────────────────────────────────────────────
  {
    q: "What goes in the Station Daily Log?",
    a: "The Station Daily Log is a shift-by-shift journal for recording who was in the station, notable events, equipment issues, visitors, and anything the next crew needs to know. Think of it as the firehouse logbook — digitized. Entries are timestamped and tied to your user account.",
  },

  // ── Reports & Export ─────────────────────────────────────────────────────
  {
    q: "What reports can I generate and export?",
    a: "Go to Reports & Export to generate department-wide summaries for incidents, training, apparatus, LOSAP compliance, and more. Reports can be exported as PDF or CSV. The date range filter lets you pull monthly, quarterly, or annual reports. Chiefs see all reports; officers see operational reports; members see their own records.",
  },

  // ── Recall / All-Call ────────────────────────────────────────────────────
  {
    q: "How do I issue a Recall or All-Call?",
    a: "Officers and chiefs can issue a Recall from the Incident Command Board by clicking the Recall button. Set the urgency level (Standby, Report, Emergency), incident type, and message. All members receive the alert and can respond with their status and ETA. Track responses in real time on the Command Board.",
  },

  // ── Grants ───────────────────────────────────────────────────────────────
  {
    q: "How do I track grant applications in OpenFirehouse?",
    a: "Go to Grants and click New Grant. Enter the grant name, agency, amount, deadline, and status (Researching, Applied, Awarded, Denied, Closed). Track milestones and expenditures as you go. The Budget module can link grant funds to specific line items for accountability.",
  },

  // ── SCBA / Air Management ────────────────────────────────────────────────
  {
    q: "How does SCBA and cylinder tracking work?",
    a: "The SCBA module tracks individual air cylinders by serial number, including hydrostatic test dates, fill records, and condition status. Set up your fill station details, log each fill with PSI readings, and the system alerts you when cylinders are due for hydro testing or out of service.",
  },

  // ── Community Risk Reduction ─────────────────────────────────────────────
  {
    q: "What is Community Risk Reduction (CRR)?",
    a: "CRR tracks your department's community outreach — home safety visits, smoke detector installations, school programs, and public education events. Log visits with addresses and outcomes. This data supports your ISO rating and demonstrates community engagement to your governing body.",
  },

  // ── Volunteer Hours / Payroll ────────────────────────────────────────────
  {
    q: "How are volunteer hours and stipends tracked?",
    a: "The Volunteer Hours module logs time spent on calls, training, meetings, and station duties. Hours feed into LOSAP calculations automatically. For departments that offer per-call stipends, the Payroll module calculates amounts based on your pay rate table and generates exportable pay reports.",
  },

  // ── Bulletin Board ─────────────────────────────────────────────────────────
  {
    q: "How do I post to the Bulletin Board?",
    a: "Officers and chiefs can post bulletins by clicking + New Bulletin. Select a category (General, Training, Operations, Safety, Administrative, Social), set priority (Normal, Important, Urgent), write your message, and optionally pin it to the top. All members can view bulletins.",
  },

  // ── Fundraising ────────────────────────────────────────────────────────────
  {
    q: "How do I track fundraising campaigns and donations?",
    a: "Go to Fundraising under Administration. Create campaigns with goal amounts and dates, then log individual donations against each campaign. Progress bars show raised vs. goal in real time. The stats dashboard shows total raised, donor count, and average donation across all campaigns.",
  },

  // ── Cadet Program ──────────────────────────────────────────────────────────
  {
    q: "How do I manage the Junior Firefighter / Cadet Program?",
    a: "Go to Cadet Program under Personnel. Add cadets with name, DOB (age auto-calculates), guardian contact info, and rank. Log training hours as they participate in drills. Advance ranks as they meet milestones. When a cadet turns 18, graduate them and consider transitioning to regular membership via the Member Roster.",
  },

  // ── Response Analytics ─────────────────────────────────────────────────────
  {
    q: "How does Response Analytics work?",
    a: "Response Analytics automatically computes monthly average turnout times from your Incident Log data. Bars are color-coded: green (under 6 min), amber (6–9 min), red (over 9 min) based on NFPA 1720 benchmarks for volunteer departments. No manual entry needed — just keep your incident times accurate.",
  },

  // ── Retention Scoring ──────────────────────────────────────────────────────
  {
    q: "What is Retention Scoring and how does it work?",
    a: "Retention Scoring computes an engagement score (0–100) for every member using training activity (40%), volunteer hours (30%), tenure (20%), and probationary status (10%). Members scoring below 40 are flagged At Risk with suggested retention actions. Scores compute automatically from existing data — no additional entry needed. Check monthly to catch declining engagement early.",
  },

  // ── Real-Time Availability ─────────────────────────────────────────────────
  {
    q: "How does the Real-Time Availability toggle work?",
    a: "Toggle your status to Available (green) or Unavailable (gray) with one tap. The department-wide count shows how many members are ready to respond right now. The widget auto-refreshes every 30 seconds. Officers use this to assess coverage before issuing recalls. Your availability is separate from the Duty Schedule — the schedule shows who's assigned, availability shows who can actually respond.",
  },

  // ── NERIS ──────────────────────────────────────────────────────────────────
  {
    q: "What is NERIS and how does it relate to NFIRS?",
    a: "NERIS (National Emergency Response Information System) is the USFA's replacement for NFIRS 5.0. The transition began in early 2026. OpenFirehouse supports both formats — use the format toggle on the NFIRS/NERIS Reports page to switch between NFIRS 5.0 and NERIS exports. NERIS exports include additional metadata like department ID and geo-location fields. All existing NFIRS reports are forward-compatible with NERIS.",
  },

  // ── Career & Full-Service ─────────────────────────────────────────────────
  {
    q: "How do Timesheets work for career departments?",
    a: "Go to Timesheets (Chief only). Create timesheets per member per pay period. Enter regular hours, OT, leave, and trade hours. Total auto-calculates. Each timesheet links to a FLSA period for 207(k) compliance. Workflow: Draft → Submitted → Approved. Export approved timesheets for payroll processing.",
  },
  {
    q: "What is FLSA 207(k) and why does it matter?",
    a: "Section 207(k) of the Fair Labor Standards Act provides a special overtime exemption for fire departments. Instead of the standard 40-hour week, departments can use 7/14/21/28-day work periods with higher OT thresholds (e.g., 53 hours for 7 days, 212 hours for 28 days). Configure your work period in Station Settings. The FLSA dashboard tracks hours against the threshold automatically.",
  },
  {
    q: "How does OT Equalization work?",
    a: "OT Equalization ensures fair overtime distribution. The board ranks all members by total accumulated OT hours, lowest first. When overtime is available, assign the member at the top of the list. The system updates automatically as OT records are logged. Reset the counter at the start of each fiscal year or contract period.",
  },
  {
    q: "How do I manage shift trades between members?",
    a: "Go to Shift Trades. A member requests a trade by selecting their original shift, choosing a covering member, and proposing a payback date. The system calculates FLSA impact for both members. An officer approves or denies based on staffing and OT considerations. Both the trade and payback are tracked to completion.",
  },
  {
    q: "How do I use the AI Data Ingestion module?",
    a: "Go to AI Data Ingestion (Chief only). It's a 6-step wizard: 1) Select target table (Members, Incidents, Training, etc.), 2) Paste or upload data in any format, 3) AI analyzes and proposes column mappings, 4) Review and adjust mappings, 5) Transform data, 6) Import to database. The AI handles messy formats, abbreviations, and date variations automatically.",
  },
  {
    q: "What AI features are available and what do they need to work?",
    a: "There are 9 AI modules: Scheduling, Response Analytics, Incident Intelligence, Training Recommender, Report Writer, Pre-Plan Generator, Staffing Predictor, Data Ingestion, and the Assistant Widget. All require either an OPENAI_API_KEY or ANTHROPIC_API_KEY set on the server. The system tries OpenAI first, then falls back to Anthropic. Without either key, AI features show an error.",
  },
  {
    q: "How do Meeting Minutes work?",
    a: "Go to Meeting Minutes (Officers+). Create minutes for regular, special, or emergency meetings. Record attendees (from member roster), agenda items with presenters, motions with movers/seconders/vote results, action items with assignments and due dates, and general notes. Action items notify the assigned member automatically.",
  },
  {
    q: "How do Policy Sign-offs work?",
    a: "Officers publish a policy for acknowledgment, selecting which members must sign. Members see a notification and can read the policy and click Acknowledge to record their sign-off with a timestamp. The compliance dashboard shows who has and hasn't signed. Export sign-off reports for audits.",
  },
  {
    q: "How do I file or manage a Grievance?",
    a: "Go to Grievance Tracker (Officers+). Create a grievance with the filing member, type, subject, and description. The grievance moves through steps: Filing → Officer Review → Chief Review → Resolution. Add notes at each step. All actions are permanently recorded for legal documentation.",
  },
  {
    q: "What are Personnel Actions?",
    a: "Personnel Actions are formal records of member status changes: promotions, disciplinary warnings, certifications earned, probation completions, leaves of absence, etc. Each action is linked to a specific member with a date, description, and issuing authority. These create a permanent audit trail for HR compliance.",
  },
  {
    q: "How do I track equipment checked out to members?",
    a: "Go to Equipment Checkout. Check out items (radios, TICs, gas detectors, tools) by selecting the item, member, purpose, and expected return date. Condition is noted at checkout. On return, record condition again. Overdue items are flagged automatically in Notifications.",
  },
];

// ─── Subcomponents ─────────────────────────────────────────────────────────

function Check({ yes }) {
  return yes
    ? <span className="text-green-600 dark:text-green-400 font-bold text-sm">✓</span>
    : <span className="text-gray-300 dark:text-gray-600 text-sm">—</span>;
}

function ModuleGroup({ group, color, items }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border ${color} overflow-hidden`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/50 transition-colors"
      >
        <span className="flex-1 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">{group}</span>
        <span className="text-xs text-gray-400">{items.length} modules</span>
        {open ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2 bg-white/40">
          {items.map((item) => (
            <div key={item.name} className="py-1.5 border-t border-white/60">
              <p className="text-xs font-bold text-gray-800 dark:text-gray-100">{item.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IndicatorList({ items }) {
  if (!items || !Array.isArray(items)) return null;
  return (
    <div className="space-y-2 mt-2">
      {items.map((item) => (
        <div key={item.label} className="flex gap-3">
          <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-44 flex-shrink-0">{item.label}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{item.desc}</span>
        </div>
      ))}
    </div>
  );
}

function FieldList({ items }) {
  if (!items || !Array.isArray(items)) return null;
  return (
    <div className="space-y-2 mt-2">
      {items.map((item) => (
        <div key={item.name} className="py-1.5 border-b border-gray-50 last:border-b-0">
          <span className="text-xs font-bold text-gray-800 dark:text-gray-100">{item.name}</span>
          <span className="text-xs text-gray-400 ml-2 leading-relaxed">{item.desc}</span>
        </div>
      ))}
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-snug">{q}</span>
        {open
          ? <ChevronUp size={12} className="text-gray-400 flex-shrink-0" />
          : <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-3 bg-blue-50/40 dark:bg-blue-950/40">
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

// ─── Search helpers ─────────────────────────────────────────────────────────

function buildSearchIndex() {
  const results = [];
  for (const [key, mod] of Object.entries(MODULE_HELP)) {
    const text = [
      mod.name,
      mod.group,
      mod.overview,
      ...(mod.features || []),
      ...(mod.tips || []),
      ...(mod.howTo || []).map((h) => `${h.step} ${h.detail}`),
      ...(mod.sections || []).flatMap((s) =>
        s.type === 'text'
          ? [s.content || '']
          : (s.items || []).map((i) => `${i.label || i.name || ''} ${i.desc || ''}`),
      ),
    ].join(' ').toLowerCase();
    results.push({ key, name: mod.name, group: mod.group, text });
  }
  return results;
}

const SEARCH_INDEX = buildSearchIndex();

// ─── Module detail renderer ─────────────────────────────────────────────────

function ModuleDetailView({ help, onNavigate }) {
  const [openSection, setOpenSection] = useState(null);

  return (
    <div className="space-y-4">

      {/* Overview */}
      <div className="bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-xl p-4">
        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-0.5">{help.name || help.title}</p>
        {help.group && <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-2">{help.group}</p>}
        {help.access && !help.group && <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-2">{help.access}</p>}
        <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{help.overview}</p>
      </div>

      {/* How To — numbered task steps */}
      {help.howTo && help.howTo.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ListChecks size={13} className="text-red-600 dark:text-red-400" />
            <p className="text-xs font-bold text-gray-700 dark:text-gray-300">How To Use This Module</p>
          </div>
          <ol className="space-y-2">
            {help.howTo.map((h, i) => (
              <li key={i} className="flex gap-3 bg-gray-50 dark:bg-gray-950 rounded-xl px-3 py-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-red-700 text-white text-[10px] font-black flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <p className="text-xs font-bold text-gray-800 dark:text-gray-100">{h.step}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">{h.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Key features */}
      {help.features && help.features.length > 0 && (
      <div>
        <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Key Capabilities</p>
        <ul className="space-y-1.5">
          {help.features.map((f, i) => (
            <li key={i} className="flex gap-2 text-xs text-gray-600 dark:text-gray-300">
              <span className="text-red-500 font-bold flex-shrink-0 mt-0.5">›</span>
              <span className="leading-relaxed">{f}</span>
            </li>
          ))}
        </ul>
      </div>
      )}

      {/* Collapsible reference sections */}
      {help.sections && help.sections.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Reference</p>
          {help.sections.map((section, idx) => {
            const isOpen = openSection === idx;
            return (
              <div key={idx} className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => setOpenSection(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{section.title}</span>
                  {isOpen
                    ? <ChevronUp size={12} className="text-gray-400 flex-shrink-0" />
                    : <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 bg-gray-50/50 dark:bg-gray-950/50">
                    {section.type === 'text' && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mt-1">{section.content}</p>
                    )}
                    {section.type === 'indicators' && <IndicatorList items={section.items} />}
                    {section.type === 'fields' && <FieldList items={section.items} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pro tips */}
      {help.tips && help.tips.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Pro Tips</p>
          <div className="space-y-2">
            {help.tips.map((tip, i) => (
              <div key={i} className="flex gap-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-100 dark:border-amber-900 rounded-xl px-3 py-2.5">
                <Lightbulb size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Modules */}
      {help.related && help.related.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link2 size={13} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Related Modules</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {help.related.map((name) => (
              <button
                key={name}
                onClick={() => onNavigate?.(name)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-700 dark:hover:text-red-300 transition-colors"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Search Results ─────────────────────────────────────────────────────────

function SearchResults({ query, onSelect }) {
  const results = useMemo(() => {
    if (!query || query.trim().length < 2) return [];
    const q = query.toLowerCase().trim();
    return SEARCH_INDEX.filter((r) => r.text.includes(q)).slice(0, 12);
  }, [query]);

  if (!query || query.trim().length < 2) {
    return (
      <div className="text-center py-10 text-gray-400">
        <Search size={24} className="mx-auto mb-2 opacity-40" />
        <p className="text-xs">Type at least 2 characters to search all modules, fields, and tips</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p className="text-xs">No results for <strong>"{query}"</strong></p>
        <p className="text-xs mt-1">Try a different term or browse All Modules</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">{results.length} module{results.length !== 1 ? 's' : ''} match "{query}"</p>
      {results.map((r) => (
        <button
          key={r.key}
          onClick={() => onSelect(r.key)}
          className="w-full text-left flex items-center gap-3 bg-gray-50 dark:bg-gray-950 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-xl px-4 py-3 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-800 dark:text-gray-100">{r.name}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{r.group}</p>
          </div>
          <ExternalLink size={11} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </button>
      ))}
    </div>
  );
}

// ─── Map display names → helpContent keys (for Related navigation) ──────────
const NAME_TO_KEY = Object.fromEntries(
  Object.entries(MODULE_HELP).map(([k, v]) => [v.name, k]),
);

// ─── Main Panel ────────────────────────────────────────────────────────────

export default function HelpPanel({ user, currentPage, onClose }) {
  const moduleHelp = getModuleHelp(currentPage);
  const defaultTab = moduleHelp ? 'module' : 'faq';

  const [tab, setTab]             = useState(defaultTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedKey, setPinnedKey]     = useState(null);

  const pinnedHelp  = pinnedKey ? MODULE_HELP[pinnedKey] : null;
  const displayHelp = pinnedHelp || moduleHelp;

  function handleRelatedNav(moduleName) {
    const key = NAME_TO_KEY[moduleName];
    if (key) { setPinnedKey(key); setTab('module'); }
  }

  function handleSearchSelect(key) {
    setPinnedKey(key);
    setTab('module');
    setSearchQuery('');
  }

  const TABS = [
    ...(displayHelp ? [{ id: 'module', label: pinnedKey ? MODULE_HELP[pinnedKey]?.name : 'This Module', icon: Layers }] : []),
    { id: 'search',  label: 'Search',         icon: Search              },
    { id: 'start',   label: 'Getting Started', icon: HelpCircle          },
    { id: 'faq',     label: 'FAQ',             icon: ListChecks          },
    { id: 'modules', label: 'All Modules',     icon: BookOpen            },
    { id: 'roles',   label: 'Roles & Access',  icon: Shield              },
    { id: 'tips',    label: 'Tips',            icon: Lightbulb           },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-red-700">
          <HelpCircle size={18} className="text-white" />
          <div className="flex-1">
            <h2 className="text-base font-bold text-white">
              {displayHelp ? displayHelp.name : <><span className="text-white">OPEN</span><span className="text-red-200">FIREHOUSE</span> Help</>}
            </h2>
            <p className="text-xs text-red-200">
              {displayHelp ? `${displayHelp.group} · Reference Guide` : `User Manual · v${__APP_VERSION__}`}
            </p>
          </div>
          {pinnedKey && (
            <button
              onClick={() => setPinnedKey(null)}
              className="text-red-200 hover:text-white text-[10px] font-semibold mr-2"
            >
              ← Back
            </button>
          )}
          <button onClick={onClose}
            aria-label="Close help panel"
            className="p-1.5 text-red-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-shrink-0 flex flex-col items-center gap-1 py-2.5 px-3 text-[10px] font-semibold transition-colors border-b-2 ${
                tab === id
                  ? 'border-red-600 text-red-700 dark:text-red-300 bg-white dark:bg-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── This Module ── */}
          {tab === 'module' && displayHelp && (
            <ModuleDetailView help={displayHelp} onNavigate={handleRelatedNav} />
          )}

          {/* ── Search ── */}
          {tab === 'search' && (
            <div className="space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search modules, fields, tips"
                  placeholder="Search modules, fields, tips…"
                  className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-red-300 focus:border-transparent dark:bg-gray-900 dark:text-gray-100"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-600 hover:text-gray-500"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <SearchResults query={searchQuery} onSelect={handleSearchSelect} />
            </div>
          )}

          {/* ── Getting Started ── */}
          {tab === 'start' && (
            <div className="space-y-4 text-sm">
              <div className="bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-xl p-4">
                <p className="font-bold mb-1"><span className="text-gray-800 dark:text-gray-100">Welcome to </span><span className="text-gray-900 dark:text-gray-100">OPEN</span><span className="text-red-600 dark:text-red-400">FIREHOUSE</span></p>
                <p className="text-red-700 dark:text-red-300 text-xs leading-relaxed">
                  Free, open-source management software for volunteer fire departments.
                  Use the left sidebar to navigate between modules. Your role controls which modules are visible.
                </p>
              </div>

              <div className="flex gap-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3">
                <Layers size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-0.5">Help is context-sensitive</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    When you're in any module, the <strong>This Module</strong> tab opens automatically with
                    numbered step-by-step instructions, field explanations, and pro tips for exactly where you are.
                    Use the <strong>Search</strong> tab to find answers instantly across all 40+ modules.
                  </p>
                </div>
              </div>

              <div>
                <p className="font-bold text-gray-800 dark:text-gray-100 mb-2">Demo Login Accounts</p>
                <div className="space-y-2">
                  {[
                    { name: 'Chief Sarah Chen',  title: 'Fire Chief',              role: 'chief',   un: 'chief'   },
                    { name: 'Maria Delgado',     title: 'Captain / Training Off.', role: 'officer', un: 'officer' },
                    { name: 'Nathan McGee',      title: 'Firefighter I',           role: 'member',  un: 'member'  },
                  ].map((u) => {
                    const r = ROLES[u.role];
                    return (
                      <div key={u.un} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-950 rounded-xl px-3 py-2.5">
                        <div className={`h-8 w-8 rounded-lg text-xs font-black flex items-center justify-center flex-shrink-0 ${r.bg} ${r.color}`}>
                          {u.name.split(' ').slice(-2).map((n) => n[0]).join('')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800 dark:text-gray-100">{u.name}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">{u.title}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-mono text-gray-600 dark:text-gray-300">user: <strong>{u.un}</strong></p>
                          <p className="text-[10px] font-mono text-gray-600 dark:text-gray-300">pw: <strong>1234</strong></p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">Or use <strong>Quick Demo Login</strong> on the login screen.</p>
              </div>

              {/* ── Top 5 Features ── */}
              <div>
                <p className="font-bold text-gray-800 dark:text-gray-100 mb-2">Top 5 Features</p>
                <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">1.</span><div><strong>Live Incident Response</strong> — Tap "I'm Responding" to get an AI-generated mission brief tailored to your NJ certification level, with hazard alerts, approach instructions, and an interactive checklist. Your phone becomes your tactical assistant.</div></li>
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">2.</span><div><strong>On-Demand Training</strong> — 10+ interactive training modules with quizzes that auto-credit CE hours toward LOSAP. Train on NFIRS coding, HazMat awareness, ICS, and more — from your phone or station computer.</div></li>
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">3.</span><div><strong>Incident Command Board</strong> — Real-time ICS command display with unit tracking, PAR checks, benchmarks, and recalls. Works on the station TV or an officer's tablet.</div></li>
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">4.</span><div><strong>LOSAP Compliance Dashboard</strong> — Every member's progress toward the 50-point LOSAP threshold, updated in real time from training, hours, and incidents.</div></li>
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">5.</span><div><strong>AI Assistant</strong> — Ask questions about NFIRS codes, NJ regulations, LOSAP rules, and any module feature. Available from the floating chat widget on every page.</div></li>
                </ul>
              </div>

              {/* ── Quick Start by Role ── */}
              <div>
                <p className="font-bold text-gray-800 dark:text-gray-100 mb-2">Quick Start by Role</p>
                <div className="space-y-2">
                  <div className="bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
                    <p className="text-xs font-bold text-red-800 dark:text-red-300 mb-0.5">Chief</p>
                    <p className="text-[11px] text-red-700 dark:text-red-300 leading-relaxed">Start with Station Settings to configure your department. Then check Budget, Grants, and Reports. Review Retention Scoring monthly. Set up CAD Integration for automatic dispatch alerts.</p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-100 dark:border-amber-900 rounded-lg px-3 py-2">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-0.5">Officer</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">Review the Duty Schedule and assign shifts. Post Bulletins for department news. Run Drills and log training. Use the Command Board during incidents. Check LOSAP Compliance before year-end.</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 rounded-lg px-3 py-2">
                    <p className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-0.5">Member</p>
                    <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">Toggle your Availability status daily. Complete On-Demand training modules for CE credit. Log Volunteer Hours after each shift. Use "I'm Responding" during dispatches for AI guidance on scene.</p>
                  </div>
                </div>
              </div>

              {/* ── Mobile & Responsive ── */}
              <div className="flex gap-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3">
                <Shield size={14} className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-green-800 dark:text-green-300 mb-0.5">Mobile-ready for the field</p>
                  <p className="text-xs text-green-700 dark:text-green-300 leading-relaxed">
                    OpenFirehouse is fully responsive. Use it on your phone while responding, on a tablet at the command post,
                    or on the station computer. Key features like Incident Response, Availability, and the Dashboard are
                    optimized for one-handed mobile use with large tap targets and high contrast.
                  </p>
                </div>
              </div>

              <div>
                <p className="font-bold text-gray-800 dark:text-gray-100 mb-2">Navigation</p>
                <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">›</span> The left sidebar has five collapsible groups — click a header to expand or collapse it.</li>
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">›</span> Dashboard, Notifications, and Station Settings are always visible at the top and bottom.</li>
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">›</span> Modules your role can't access are hidden automatically.</li>
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">›</span> The bell icon shows a count of Critical + Warning alerts only.</li>
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">›</span> Click the arrow icon (→) at the bottom of the sidebar to log out.</li>
                </ul>
              </div>

              <div>
                <p className="font-bold text-gray-800 dark:text-gray-100 mb-2">Common Actions</p>
                <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">›</span><div><strong>Add a record:</strong> red button in the top-right of each module.</div></li>
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">›</span><div><strong>Expand a row:</strong> click anywhere on it to see full detail.</div></li>
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">›</span><div><strong>Edit:</strong> pencil icon on the row or in the expanded panel.</div></li>
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">›</span><div><strong>Delete:</strong> trash icon — always confirms before deleting.</div></li>
                  <li className="flex gap-2"><span className="text-red-600 dark:text-red-400 font-bold">›</span><div><strong>Close a form:</strong> Cancel button, click the backdrop, or press Escape.</div></li>
                </ul>
              </div>

            </div>
          )}

          {/* ── FAQ ── */}
          {tab === 'faq' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <ListChecks size={15} className="text-red-600 dark:text-red-400" />
                <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">Frequently Asked Questions</p>
              </div>
              <p className="text-xs text-gray-400">Click any question to expand the answer.</p>
              <div className="space-y-2">
                {FAQ.map((item, i) => <FaqItem key={i} q={item.q} a={item.a} />)}
              </div>
            </div>
          )}

          {/* ── All Modules ── */}
          {tab === 'modules' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Click a group to expand module descriptions.</p>
              {MODULES_QUICK.map((g) => (
                <ModuleGroup key={g.group} {...g} />
              ))}
            </div>
          )}

          {/* ── Roles & Access ── */}
          {tab === 'roles' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(ROLES).map(([key, r]) => (
                  <div key={key} className={`rounded-xl border p-3 text-center ${r.bg} border-current`}>
                    <p className={`text-xs font-black ${r.color}`}>{r.label}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {key === 'chief'   ? 'Full access' :
                       key === 'officer' ? 'Operational access' :
                       'Day-to-day access'}
                    </p>
                    {user?.role === key && (
                      <span className="text-[9px] font-bold bg-white dark:bg-gray-900 rounded-full px-1.5 py-0.5 mt-1 inline-block text-gray-700 dark:text-gray-300">
                        Your Role
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700">
                      <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Module</th>
                      <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-center">Chief</th>
                      <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-center">Officer</th>
                      <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-center">Member</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ROLE_TABLE.map((row) => (
                      <tr key={row.module} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{row.module}</td>
                        <td className="px-3 py-1.5 text-center"><Check yes={row.chief} /></td>
                        <td className="px-3 py-1.5 text-center"><Check yes={row.officer} /></td>
                        <td className="px-3 py-1.5 text-center"><Check yes={row.member} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Tips ── */}
          {tab === 'tips' && (
            <div className="space-y-2">
              {TIPS.map((t, i) => (
                <div key={i} className="flex gap-3 bg-gray-50 dark:bg-gray-950 rounded-xl px-4 py-3">
                  <Lightbulb size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{t.tip}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 flex items-center justify-between">
          <p className="text-[10px]"><span className="text-gray-500 dark:text-gray-400 font-semibold">OPEN</span><span className="text-red-600 dark:text-red-400 font-semibold">FIREHOUSE</span> <span className="text-gray-500 dark:text-gray-400">v{__APP_VERSION__} · Open Source</span></p>
          <button
            onClick={() => { setTab('search'); setSearchQuery(''); }}
            className="flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-semibold"
          >
            <Search size={10} /> Search Help
          </button>
        </div>
      </div>
    </>
  );
}
