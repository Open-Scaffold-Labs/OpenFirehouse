// ─── Per-module help content ───────────────────────────────────────────────────
// Each entry maps a page ID to rich reference documentation.
// Structure: { id, name, group, overview, features, sections[], tips[] }
// sections types: 'text' | 'fields' | 'indicators' | 'tips'

export const MODULE_HELP = {

  // ── Dashboard ──────────────────────────────────────────────────────────────
  dashboard: {
    name: 'Dashboard',
    group: 'General',
    overview: 'The Dashboard is your at-a-glance command center. It aggregates live counts and status indicators from across the platform so you can assess department health without drilling into individual modules.',
    features: [
      'YTD incident count and breakdown by type',
      'Apparatus status board — green / amber / red at a glance',
      'Member certification and wellness alert counts',
      'Upcoming events and recent activity feed',
      'Budget utilization summary (chief view)',
      'Live weather widget — current conditions, wind speed/direction/gusts, fire weather and ice road warnings',
      'Live incident ticker — pulsing red banner when an incident is active on the Command Board',
      'TV Mode / Duty Board — full-screen wall display showing live clock, on-duty roster, apparatus status, and active incident',
    ],
    sections: [
      {
        title: 'Stat Cards',
        type: 'text',
        content: 'The top row of cards pulls live totals from the active data set. Clicking a card navigates directly to the corresponding module with the relevant filter pre-applied.',
      },
      {
        title: 'Apparatus Status Board',
        type: 'indicators',
        items: [
          { label: 'Green — In Service', desc: 'Unit is fully operational and available for response.' },
          { label: 'Amber — Maintenance', desc: 'Unit is temporarily out for scheduled or corrective maintenance.' },
          { label: 'Red — Out of Service', desc: 'Unit is non-operational. Contact the apparatus officer.' },
        ],
      },
      {
        title: 'Alert Banner',
        type: 'text',
        content: 'Critical and Warning alerts surface at the top of the dashboard before any other content. Info-level notices do not appear here — check the Notifications module for the full list.',
      },
      {
        title: 'Weather Widget',
        type: 'text',
        content: 'Live weather for your station location, pulled automatically from Open-Meteo every 10 minutes. Shows temperature, feels-like, humidity, and a featured wind section with speed, compass direction, gusts, and a color-coded intensity label (Calm → Light → Moderate → Strong → Dangerous). A Fire Weather Warning appears when temps exceed 85°F with humidity below 30% and winds above 15 mph. An Ice/Road Warning appears when temps are at or below freezing with active precipitation. Requires City and State to be set in Station Settings.',
      },
      {
        title: 'Live Incident Ticker',
        type: 'text',
        content: 'When Dispatch & Command has an active incident, a pulsing red banner appears at the top of the Dashboard showing the incident type, address, and time since dispatch. Updates automatically every 20 seconds. Clicking the ticker navigates to Dispatch & Command.',
      },
      {
        title: 'TV Mode / Duty Board',
        type: 'text',
        content: 'Tap the TV Mode button on the Dashboard to launch a full-screen dark display designed for station wall monitors. Shows a live clock, on-duty member roster, apparatus status grid, the weather widget, and a large active incident banner when one is open. Refreshes automatically every 30 seconds. Press Escape or tap Exit TV Mode to return.',
      },
    ],
    tips: [
      'The dashboard reflects the data in the current session. Refresh your browser to pull the latest changes made by other officers.',
      'Stat cards are role-filtered — members see a simplified view; chiefs see the full financial snapshot.',
      'The weather widget requires City and State to be configured in Station Settings — wind and weather will not appear until those fields are filled in.',
      'TV Mode is optimized for 1080p wall-mounted displays. Keep a dedicated browser tab in TV Mode at the station for a live situational awareness board.',
    ],
    howTo: [
      { step: 'Check YTD stats', detail: 'The stat cards at the top of the dashboard show total incidents, apparatus status, and member alerts. Click any card to drill into that module.' },
      { step: 'Review apparatus status', detail: 'Scan the status board in the middle — green units are in service, amber are in maintenance, red are OOS. Click a card to see maintenance details.' },
      { step: 'Check alerts', detail: 'Read the alert banner at the top. Critical and Warning alerts appear before the content — click one to jump directly to the record.' },
      { step: 'See upcoming events', detail: 'Scroll to the bottom-right panel showing events this week. Click an event to open the Event Calendar.' },
      { step: 'Review recent activity', detail: 'The activity feed shows the last 5-10 actions across the system — who logged incidents, who edited members, recent training completions.' },
    ],
    related: ['Incident Log', 'Apparatus Tracker', 'Notifications', 'Member Roster'],
  },

  // ── Member Roster ──────────────────────────────────────────────────────────
  roster: {
    name: 'Member Roster',
    group: 'Personnel',
    overview: 'The Member Roster is the authoritative record of everyone in your department. Every other personnel module — training, wellness, hours, scheduling — links back to records created here. Click any row to expand a full contact panel.',
    features: [
      'Searchable, filterable list of all active, inactive, and probationary members',
      'Search by name, rank, badge number, phone, or email',
      'Expandable row contact panel — phone, email, address, DOB, badge #, and emergency contact',
      'Status badges: Active / Probationary / LOA / Inactive',
      'Quick-link to each member\'s full portal page',
      'Officer+ required to add or edit members; members can view the roster',
      'Availability toggle — members can mark themselves available or unavailable for response; summary count shown above the roster',
    ],
    sections: [
      {
        title: 'Member Status',
        type: 'indicators',
        items: [
          { label: 'Active', desc: 'Fully operational member available for duty and response.' },
          { label: 'Probationary', desc: 'New member within their probationary period. May have restricted access depending on department policy.' },
          { label: 'LOA', desc: 'On approved Leave of Absence. Still appears in the roster; excluded from scheduling.' },
          { label: 'Inactive', desc: 'No longer active. Record retained for history; no access to the system.' },
        ],
      },
      {
        title: 'Key Fields',
        type: 'fields',
        items: [
          { name: 'Member Number / Badge #', desc: 'Department-assigned badge or member number. Shown in the contact panel and searchable.' },
          { name: 'Rank', desc: 'Operational rank (e.g., Firefighter I, Lieutenant, Captain, Chief). Drives scheduling role defaults.' },
          { name: 'System Role', desc: 'Access level: Member, Officer, or Chief. Independent from operational rank.' },
          { name: 'Phone & Email', desc: 'Shown as clickable links in the table. Phone opens your dialer; email opens your mail client.' },
          { name: 'Address', desc: 'Home address. Stored in the Contact tab; visible in the expanded row.' },
          { name: 'Date of Birth', desc: 'Stored in the Contact tab for personnel records and NFIRS reporting.' },
          { name: 'Certifications', desc: 'Summary list — full detail is in the Training module.' },
          { name: 'Emergency Contact', desc: 'Name, relationship, and phone. Visible to officers and chief only in the expanded row.' },
        ],
      },
      {
        title: 'Add / Edit Member Form',
        type: 'text',
        content: 'The member form is organized into three tabs. Basic Info: name, badge number, DOB, rank, role, status, join date, and certifications. Contact: phone, email, and address. Emergency: emergency contact name, phone, and relationship. Use Next / Back to navigate between tabs. Validation errors jump you to the tab containing the problem field.',
      },
    ],
    tips: [
      'Click any row in the roster table to expand the full contact and emergency contact panel without leaving the list.',
      'The search bar matches against name, rank, badge number, phone number, and email — so you can find a member by partial phone number or email domain.',
      'Deactivating a member (setting status to Inactive) removes them from scheduling and shift assignment without deleting their historical records.',
    ],
    howTo: [
      { step: 'Search for a member', detail: 'Use the search bar at the top and type a name, badge number, phone, or email. Results appear instantly below.' },
      { step: 'Expand member details', detail: 'Click any row in the table to expand the full contact panel — phone, email, address, DOB, badge #, and emergency contact all appear inline.' },
      { step: 'Add a new member', detail: 'Click the + New Member button in the top right. Fill the Basic Info tab first with name, badge #, rank, and role. The form has three tabs — use Next/Back to navigate.' },
      { step: 'Edit a member', detail: 'Click a row to expand it, then click the Edit icon (pencil) to open the form. Validation will flag any missing required fields.' },
      { step: 'Change member status', detail: 'Set Status to Active, Probationary, LOA, or Inactive. Inactive members are hidden from scheduling but their records are retained.' },
    ],
    related: ['Member Portal', 'Duty Schedule', 'Training', 'Health & Wellness'],
  },

  // ── Duty Schedule ──────────────────────────────────────────────────────────
  schedule: {
    name: 'Duty Schedule',
    group: 'Personnel',
    overview: 'The Duty Schedule is a full-featured scheduling system with three tabs: Calendar, Patterns, and Leave. The monthly calendar shows shift coverage with color-coded days. Recurring shift patterns auto-generate schedules so officers don\'t have to create 1,000+ shifts a year by hand. The leave system tracks PTO, sick, and other time-off requests with an approve/deny workflow, and the rules engine flags conflicts in real time.',
    features: [
      'Monthly calendar view with per-day coverage color coding (Good / Understaffed / Below minimum / None)',
      'Four shift types: Day (0600–1800), Night (1800–0600), Duty Officer (24-hr), and 24-Hour (0800–0800)',
      'Recurring shift patterns — define a template once and auto-generate shifts daily, weekly, biweekly, or on a platoon rotation cycle',
      'Platoon scheduling — 24/48 and 48/96 on/off rotations with Kelly Day support for career departments',
      'PTO and leave management — submit, approve, and deny leave requests (PTO, Sick, Personal, Training, LODD, Military)',
      'Shift swap requests — members request coverage and peers claim open swaps',
      'Coverage Workbench — officer tool to find available members, send SMS/email/call outreach, and track responses',
      'Real-time scheduling rules engine with conflict detection in the shift form',
      'Leave indicators on calendar cells and the day detail panel',
      'Stat cards: Days Covered, Understaffed Days, No Coverage',
      'Click any calendar day to view shifts, assigned crew, and members on leave',
    ],
    sections: [
      {
        title: 'Shift Types',
        type: 'fields',
        items: [
          { name: 'Day', desc: '0600–1800. Standard daytime shift for suppression and EMS coverage.' },
          { name: 'Night', desc: '1800–0600. Overnight shift. Extra crew added on weekends by default seed.' },
          { name: 'Duty Officer', desc: '24-hour officer-in-charge shift covering command responsibilities.' },
          { name: '24-Hour', desc: '0800–0800. Full 24-hour shift for departments that run 24-on schedules.' },
        ],
      },
      {
        title: 'Coverage Indicators',
        type: 'indicators',
        items: [
          { label: 'Green (Good)', desc: 'Total crew across all shifts meets or exceeds 2× minimum crew (6+ members).' },
          { label: 'Amber (OK)', desc: 'Total crew meets minimum (3+) but is below the 2× threshold.' },
          { label: 'Red (Low)', desc: 'Total crew is below minimum. Immediate attention needed.' },
          { label: 'Gray (None)', desc: 'No shifts or no crew assigned for the day.' },
        ],
      },
      {
        title: 'Recurring Patterns (Patterns Tab)',
        type: 'text',
        content: 'Recurring Patterns eliminate the need to create every shift manually. Create a pattern by giving it a name, choosing a shift type, setting a repeat rule (daily, weekly, or biweekly), selecting which days of the week it applies, and assigning default crew members. Patterns have a start date and optional end date. Click "Generate Next 30 Days" to expand all active patterns into actual shift records. The expansion engine automatically skips dates where a manual override already exists and removes crew members who are on approved leave during that period.',
      },
      {
        title: 'Leave & Time Off (Leave Tab)',
        type: 'text',
        content: 'The Leave tab manages all time-off requests. Submit a request by selecting a member, leave type (PTO, Sick, Personal, Training, LODD, Military, or Other), and date range. Officers can approve or deny pending requests directly from the list. Approved leave is shown on the calendar as orange indicators and in the day detail panel. The scheduling rules engine will flag any attempt to assign a member to a shift while they are on approved leave.',
      },
      {
        title: 'Shift Swaps',
        type: 'text',
        content: 'When a member cannot make a shift, they can open a swap request. The request shows which shift needs coverage, and other members can claim it. Officers then approve or deny the claim. Swap statuses progress from Open → Claimed → Approved (or Denied/Cancelled).',
      },
      {
        title: 'Coverage Workbench (Coverage Tab)',
        type: 'text',
        content: 'The Coverage Workbench is the officer\'s tool for filling shifts when a leave request comes in. Access it from the Coverage tab or by clicking "Coverage" on any pending leave request in the Leave tab. The workbench shows all affected shifts with their crew counts, and for each shift lists every available member — anyone not already on shift, not on leave, and not on an overlapping shift that day. One-tap buttons let you send a pre-written text message (SMS), call, or email each member. The system auto-generates personalized outreach messages with shift details. Track each member\'s response status (Sent → Accepted / Declined / No Response) and assign accepted members directly to the shift. The dashboard view shows all pending leave requests at once with outreach progress stats.',
      },
      {
        title: 'Platoon / Career Scheduling',
        type: 'text',
        content: 'Career and combination departments can use Platoon Cycle patterns instead of weekly/biweekly repeats. Choose "Platoon Cycle" as the repeat rule when creating a pattern, then select the cycle type (24/48, 48/96, or custom on/off days), assign a platoon letter (A/B/C/D), and set an anchor date. The engine calculates which days each platoon is on or off duty based on the cycle length and anchor. Kelly Day support automatically skips every Nth on-duty day to reduce average weekly hours below FLSA overtime thresholds. Each platoon gets its own pattern — create one for A Platoon, another for B, etc., with staggered anchor dates.',
      },
      {
        title: 'Minimum Staffing Hard-Block',
        type: 'text',
        content: 'Career departments can enable "Minimum Staffing Hard-Block" in Station Settings. When active, the scheduling rules engine treats below-minimum crew counts as errors (blocking) rather than warnings. This prevents saving any shift that doesn\'t meet the configured minimum staffing level — a requirement for ISO grading and FLSA compliance. The minimum crew number is configurable per station.',
      },
      {
        title: 'Scheduling Rules Engine',
        type: 'text',
        content: 'The rules engine runs in real time as you create or edit shifts and displays warnings and errors directly in the shift form. It checks for: duplicate shift types on the same day, below-minimum crew count, double-booked members on overlapping shifts, members on approved leave, missing officer assignment, and fatigue risk from 3+ consecutive scheduled days. Errors (red) block situations like scheduling someone on leave. Warnings (amber) are advisory — they don\'t prevent saving but flag potential problems. When hard-block mode is enabled, minimum crew violations also become blocking errors.',
      },
      {
        title: 'Creating & Editing Shifts',
        type: 'text',
        content: 'Click any date on the calendar to open the day detail panel, then click "+ Add Shift." Select the shift type and check off crew members from the active roster. The rules engine validates your choices in real time — watch for amber warnings and red errors below the crew list. Click "Add Shift" to save. To edit an existing shift, click the pencil icon next to it in the detail panel.',
      },
    ],
    tips: [
      'Set up recurring patterns first, then use "Generate Next 30 Days" to fill your schedule. Only manually create shifts for exceptions and overrides.',
      'Approve leave requests promptly — approved leave is automatically excluded when patterns are expanded, so the earlier you approve, the more accurate your generated schedule will be.',
      'Watch the stat cards at the top of the calendar. If "Understaffed Days" or "No Coverage" is climbing, you may need to recruit more volunteers or adjust patterns.',
      'The rules engine warns about fatigue when a member is scheduled 3+ consecutive days. Volunteer departments should be especially careful about burnout.',
      'Use the Duty Officer shift type for the ranking officer on duty. The rules engine will warn if a non-officer shift has no one with officer rank assigned.',
      'When a leave request comes in, use the Coverage Workbench to contact available members right away — the earlier you reach out, the more likely you are to fill the gap.',
    ],
    howTo: [
      { step: 'View the monthly calendar', detail: 'The Calendar tab shows the current month with color-coded coverage for each day. Click any day to see its shifts and crew in the detail panel on the right. Use the arrows to navigate between months.' },
      { step: 'Create a recurring pattern', detail: 'Switch to the Patterns tab and click "+ New Pattern." Give it a name (e.g., "Engine 1 — Weekday Day Shift"), select the shift type, choose a repeat rule (daily, weekly, or biweekly), pick the active days, and assign default crew members. Set the start date and optionally an end date.' },
      { step: 'Generate shifts from patterns', detail: 'On the Patterns tab, click "Generate Next 30 Days." The system creates individual shift records for each applicable date, respecting overrides and leave. Shifts appear immediately on the Calendar tab.' },
      { step: 'Submit a leave request', detail: 'Switch to the Leave tab and click "+ New Request." Select the member, leave type, date range, and reason. The request enters Pending status until an officer approves or denies it.' },
      { step: 'Approve or deny leave', detail: 'On the Leave tab, pending requests show green (approve) and red (deny) action buttons. Click to change the status. Approved leave immediately appears on the calendar and affects pattern expansion.' },
      { step: 'Add a one-off shift', detail: 'On the Calendar tab, click any date to open the detail panel, then click "+ Add Shift." Choose the shift type, assign crew, review any warnings from the rules engine, and save.' },
      { step: 'Request a shift swap', detail: 'If you cannot make a shift, open a swap request from the shift detail. Other members can claim the open swap, and an officer approves the trade.' },
      { step: 'Use the Coverage Workbench', detail: 'When a leave request comes in, click "Coverage" next to it in the Leave tab, or switch to the Coverage tab to see all pending requests. For each affected shift, the workbench lists available members with one-tap SMS, call, and email buttons. Messages are pre-written with shift details. After contacting members, mark their responses. When someone accepts, click "Assign to Shift" to add them to the crew automatically.' },
    ],
    related: ['Member Roster', 'AI Scheduling', 'Event Calendar', 'Volunteer Hours'],
  },

  // ── Volunteer Hours ────────────────────────────────────────────────────────
  hours: {
    name: 'Volunteer Hours',
    group: 'Personnel',
    overview: 'Volunteer Hours tracks time contributed by each member across activity categories. Totals feed into annual reports and can support stipend or length-of-service award calculations.',
    features: [
      'Log hours by member, date, activity type, and notes',
      'YTD totals per member and per category',
      'Filter by date range, member, or activity type',
      'Sortable summary table for quick ranking',
      'All members can log their own hours; officers can log for others',
    ],
    sections: [
      {
        title: 'Activity Categories',
        type: 'fields',
        items: [
          { name: 'Emergency Response', desc: 'Time on structure fires, MVAs, rescues, and other emergency calls.' },
          { name: 'Training', desc: 'Drills, courses, certification renewals.' },
          { name: 'Maintenance', desc: 'Apparatus maintenance, equipment checks, station upkeep.' },
          { name: 'Administrative', desc: 'Meetings, planning, records work.' },
          { name: 'Community / Public Ed', desc: 'Fire prevention events, school visits, public demonstrations.' },
          { name: 'Other', desc: 'Anything that doesn\'t fit another category.' },
        ],
      },
      {
        title: 'YTD Summary',
        type: 'text',
        content: 'The summary row at the top shows total hours for each active member year-to-date. The "Annual Report" in Reports & Export pulls directly from these totals.',
      },
      {
        title: 'Logging Hours',
        type: 'text',
        content: 'Click + New Entry to log hours. Select the member, pick an activity category (Emergency Response, Training, Maintenance, Administrative, Community, or Other), enter the number of hours, and add a date and notes. Members can log their own hours; officers can log for others. Hours are immediately added to the member\'s YTD total.',
      },
      {
        title: 'Category-Based Reporting',
        type: 'text',
        content: 'Use the Filter by Category dropdown to view totals by activity type. The summary view at the top breaks down totals by category — useful for grant reporting and demonstrating your department\'s training and community engagement.',
      },
    ],
    tips: [
      'Hours linked to an Incident Log entry are auto-tagged as Emergency Response — you don\'t need to log them separately.',
      'The department fiscal year start date is set in Station Settings and affects YTD calculations.',
    ],
    howTo: [
      { step: 'Click + New Entry', detail: 'Open the hours entry form from the top right of the Volunteer Hours view.' },
      { step: 'Select the member', detail: 'Type their name or badge number — autocomplete will show active members. Inactive members appear below.' },
      { step: 'Pick an activity category', detail: 'Choose Emergency Response, Training, Maintenance, Administrative, Community / Public Ed, or Other.' },
      { step: 'Enter hours and date', detail: 'Type the number of hours (decimals are OK — 1.5 = 1.5 hours) and select the date the activity occurred.' },
      { step: 'Save the entry', detail: 'Click Save. The entry appears immediately in the table and updates the member\'s YTD total.' },
    ],
    related: ['Member Roster', 'Event Calendar', 'Drills & Courses', 'Reports & Export'],
  },

  // ── Member Portal ──────────────────────────────────────────────────────────
  portal: {
    name: 'Member Portal',
    group: 'Personnel',
    overview: 'The Member Portal is a consolidated view of a single member\'s complete record — certifications, training history, hours, incident participation, and wellness status — all in one place.',
    features: [
      'Select any member from a dropdown to view their full profile',
      'Certification status with expiration dates and alert flags',
      'Training history: courses completed, scores, and dates',
      'Incident response history: calls attended and roles assigned',
      'Hours breakdown by category for the current year',
      'Wellness status summary (physicals, SCBA fit, vaccinations)',
    ],
    sections: [
      {
        title: 'Certification Status',
        type: 'indicators',
        items: [
          { label: 'Current (green)', desc: 'Certification is valid and not approaching expiration.' },
          { label: 'Due Soon (amber)', desc: 'Certification expires within 90 days. Renewal should be in progress.' },
          { label: 'Expired (red)', desc: 'Certification has lapsed. Member may be restricted from certain activities per department policy.' },
        ],
      },
      {
        title: 'Access Rules',
        type: 'text',
        content: 'Members can only view their own portal. Officers can view any member\'s portal. Chiefs can view all records and see the financial/compensation summary if applicable.',
      },
      {
        title: 'Portal Tabs',
        type: 'fields',
        items: [
          { name: 'Certifications', desc: 'All active certifications with issue and expiration dates. Color-coded: green (current), amber (due soon), red (expired).' },
          { name: 'Training History', desc: 'List of all completed courses and drills with dates, instructors, and scores if applicable.' },
          { name: 'Incident Response', desc: 'All incidents this member was assigned to, showing role (IC, Driver, FF, EMS) and dates.' },
          { name: 'Hours Breakdown', desc: 'YTD hours totals by activity category — Emergency Response, Training, Maintenance, Community, etc.' },
          { name: 'Wellness Status', desc: 'Physical exam status (current/overdue), SCBA fit test status, and vaccination records.' },
        ],
      },
    ],
    tips: [
      'The Member Portal is the fastest way to prepare for a promotion board or annual review — all relevant data is on a single screen.',
      'Certification expiration alerts in the Notifications module link directly to the affected member\'s portal.',
    ],
    howTo: [
      { step: 'Select a member', detail: 'Use the member dropdown at the top of the portal. Start typing a name and select from the list. Members can only view themselves; officers can select any member.' },
      { step: 'Review certifications', detail: 'The Certifications tab shows all active certs with expiration dates. Green = current, amber = due within 90 days, red = expired.' },
      { step: 'Check training history', detail: 'The Training History tab shows every course and drill completed with dates and scores. Scroll to see the full history.' },
      { step: 'View incident assignments', detail: 'The Incidents tab lists all emergency responses this member participated in. Click an incident to view full details in the Incident Log.' },
      { step: 'See wellness status', detail: 'The Wellness tab shows physical exam dates, SCBA fit test status, and any vaccination records on file.' },
    ],
    related: ['Member Roster', 'Training', 'Health & Wellness', 'Incident Log'],
  },

  // ── Training ───────────────────────────────────────────────────────────────
  training: {
    name: 'Training Management',
    group: 'Personnel',
    overview: 'Training is a five-tab module covering the full learn-practice-certify pipeline: individual certification records, department-wide LOSAP compliance, self-paced AI-powered learning modules, interactive fire scenarios, and formal certification exams. It is the central hub for meeting NJ\'s 275–400+ hour certification requirements and ensuring every member\'s LOSAP pension contributions qualify each year.',
    features: [
      'Records tab: per-member certification tracking with issue/expiry dates and 90-day alerts',
      'Compliance & LOSAP tab: real-time dashboard showing each member\'s training hours vs. the 50-point annual threshold',
      'On-Demand Modules tab: self-paced training (NFIRS, LOSAP, NIMS/ICS, HazMat Awareness) with scored quizzes',
      'Scenarios tab: 32 interactive fire scenarios across 7 categories (Foundational → Expert difficulty)',
      'Exams tab: officer-created certification exams with timed question banks, auto-grading, and PDF certificate generation',
      'AI Q&A panel inside each module — ask questions about slide content without leaving the player',
      'Passing a module, scenario, or exam auto-creates a training record and credits hours immediately',
      'CSV export of compliance data for year-end LOSAP administrator submission',
    ],
    sections: [
      {
        title: 'The Five Tabs',
        type: 'fields',
        items: [
          { name: 'Records', desc: 'Full log of every course, certification, and drill completion. Add entries manually or they appear automatically when a module, scenario, or exam is passed.' },
          { name: 'Compliance & LOSAP', desc: 'Member-by-member view of training hours year-to-date vs. the 50-point threshold. Color-coded status: met / on-track / at-risk. Includes CSV export for state submission.' },
          { name: 'On-Demand Modules', desc: 'Catalog of self-paced training modules with slide content, scored quizzes, and inline AI Q&A. Completing a module earns CE credit hours and a training record.' },
          { name: 'Scenarios', desc: '32 interactive decision-tree scenarios across 7 categories. Play the role of an officer responding to realistic NJ incidents. Four difficulty tiers from Foundational to Expert. Earn 1.0 CE hour per completion.' },
          { name: 'Exams', desc: 'Formal certification exams created by officers/chiefs. Timed, randomized question banks with auto-grading. Passing generates a training record and a downloadable PDF certificate.' },
        ],
      },
      {
        title: 'Certification Types (Records Tab)',
        type: 'fields',
        items: [
          { name: 'Firefighter I / II', desc: 'NFPA 1001 structural firefighting — 160–200 hours, NJ State Fire Academy.' },
          { name: 'EMT / Paramedic', desc: 'State EMS certifications with NJ-specific renewal requirements.' },
          { name: 'HazMat Awareness / Ops', desc: 'NFPA 472 / OSHA 29 CFR 1910.120 hazardous materials response levels.' },
          { name: 'Apparatus Operator', desc: 'NFPA 1002 driver/operator certification.' },
          { name: 'Incident Command (ICS)', desc: 'IS-100, IS-200, IS-700, IS-800 — required for FEMA grant eligibility.' },
          { name: 'Continuing Education', desc: 'CE records created automatically when an On-Demand Module is passed.' },
        ],
      },
      {
        title: 'LOSAP Compliance Dashboard',
        type: 'indicators',
        items: [
          { label: 'Met (green)', desc: '50+ training hours logged for the calendar year — member qualifies.' },
          { label: 'On Track (amber)', desc: 'Under 50 hours but pace suggests they will qualify by year-end.' },
          { label: 'At Risk (red)', desc: 'Significantly behind pace — chief should follow up before year-end cutoff.' },
          { label: 'Export CSV', desc: 'One-click export of all members\' training hours for LOSAP administrator submission.' },
        ],
      },
      {
        title: 'On-Demand Modules',
        type: 'fields',
        items: [
          { name: 'NFIRS Coding Essentials', desc: '20 min · 0.5 CE hrs · Covers incident type, property use, and action taken codes for 90% of NJ calls.' },
          { name: 'LOSAP Points & Documentation', desc: '15 min · 0.5 CE hrs · How points are earned, what qualifies, and how OpenFirehouse tracks it.' },
          { name: 'NIMS/ICS Fundamentals', desc: '20 min · 0.5 CE hrs · Span of control, ICS structure, required FEMA courses.' },
          { name: 'HazMat Awareness Level', desc: '20 min · 0.5 CE hrs · DOT placard classes, ERG use, isolation distances, awareness-level actions.' },
        ],
      },
      {
        title: 'Expiration Alert Timeline',
        type: 'indicators',
        items: [
          { label: '90+ days remaining (green)', desc: 'Current — no action needed.' },
          { label: '31–90 days remaining (amber)', desc: 'Due Soon — begin renewal process.' },
          { label: '0–30 days remaining (red)', desc: 'Critical — renewal is urgent.' },
          { label: 'Expired (dark red)', desc: 'Lapsed — member may be restricted from operations per department policy.' },
        ],
      },
    ],
    tips: [
      'Passing any On-Demand Module automatically creates a Continuing Education record — no manual entry needed. Hours count toward LOSAP immediately.',
      'Run the Compliance & LOSAP export by November 1 each year so members still at risk have time to make up hours before the LOSAP deadline.',
      'Drill attendance is recorded in Drills & Courses and feeds into training hours. Log drills promptly — they count 1 LOSAP point per hour (up to 20/year).',
      'Use the Ask AI button inside any On-Demand Module to get instant answers about slide content without leaving the player.',
      'Officers can filter the Compliance tab by "At Risk" to quickly identify who needs follow-up before year-end.',
    ],
    howTo: [
      { step: 'Open a training module', detail: 'Go to Training → On-Demand Modules tab. Click Start Module on any card. Use the dot nav at the bottom to move between slides.' },
      { step: 'Take the quiz', detail: 'After the last slide, click Take Quiz. Select an answer and click Check Answer to see the explanation. Complete all questions to see your score.' },
      { step: 'Earn CE credit', detail: 'Pass the quiz (score ≥ passing threshold shown on the card) and a Continuing Education record is automatically created in your Records tab.' },
      { step: 'Check LOSAP status', detail: 'Go to Training → Compliance & LOSAP tab. Each member shows their year-to-date training hours and a color-coded status vs. the 50-point threshold.' },
      { step: 'Export for LOSAP submission', detail: 'In the Compliance & LOSAP tab, click Export CSV. The file includes all members\' training hours for the calendar year — ready for your LOSAP administrator.' },
      { step: 'Add a manual certification record', detail: 'In the Records tab, click + New Record. Select the member, certification type, issue date, and expiration date. The system alerts at 90 days before expiry.' },
      { step: 'Run a training scenario', detail: 'Go to Training → Scenarios tab. Pick a category and difficulty, then click Start. Read the scene, choose a response, and get immediate feedback. Complete all scenes to earn a grade and 1.0 CE hour.' },
      { step: 'Create a certification exam (officers/chiefs)', detail: 'Go to Training → Exams tab → Create New Exam. Add questions with four answer choices each, set a time limit and passing score, then publish and assign to members.' },
      { step: 'Take an exam', detail: 'Go to Training → Exams tab. Your assigned exams appear under My Assignments. Click Take Exam, answer all questions within the time limit, then submit. Your score appears immediately.' },
      { step: 'Download a certificate', detail: 'After passing an exam, go to Training → Exams → My Results and click Download Certificate (PDF). The PDF includes your name, score, department seal, and date — ready for state submission.' },
    ],
    related: ['Member Roster', 'Member Portal', 'Drills & Courses', 'Notifications'],
  },

  // ── Health & Wellness ──────────────────────────────────────────────────────
  wellness: {
    name: 'Health & Wellness',
    group: 'Personnel',
    overview: 'Health & Wellness tracks NFPA 1582 compliance for the department — annual physicals, SCBA fit tests, exposure events, and vaccinations. It\'s the module that keeps your medical readiness documented and your liability exposure low.',
    features: [
      'Per-member physical status with physician and date of last exam',
      'SCBA fit test records with mask model and fit factor result',
      'Exposure log: chemical, biological, carcinogen, and LODD-related events',
      'Vaccination records: flu, Hep B, tetanus, and department-configured others',
      'Automatic alerts at 90 days before physical or fit test expiry',
      'Chief-only access to full medical detail; members see their own record only',
    ],
    sections: [
      {
        title: 'NFPA 1582 Status',
        type: 'indicators',
        items: [
          { label: 'Current (green)', desc: 'Physical completed within the required interval per NFPA 1582 age-based schedule.' },
          { label: 'Due Soon (amber)', desc: 'Physical due within 90 days. Schedule with the department physician.' },
          { label: 'Overdue (red)', desc: 'Physical is past due. Member may be restricted from interior operations per department policy.' },
        ],
      },
      {
        title: 'Key Fields',
        type: 'fields',
        items: [
          { name: 'Physical Date', desc: 'Date of the most recent NFPA 1582 annual physical.' },
          { name: 'Examining Physician', desc: 'Name and contact of the examining physician.' },
          { name: 'Clearance Status', desc: 'Full Duty / Limited Duty / Not Cleared. Drives the member\'s operational status badge.' },
          { name: 'SCBA Fit Test Date', desc: 'Annual quantitative or qualitative fit test date.' },
          { name: 'Mask Model / Size', desc: 'Recorded to ensure the correct mask is assigned at the station.' },
          { name: 'Exposure Type', desc: 'Category of exposure: carcinogen, chemical, biological, radiation, or critical stress.' },
        ],
      },
      {
        title: 'Recording Physicals & Fit Tests',
        type: 'text',
        content: 'Click + New Exam to log a physical or fit test. Select the member, choose Exam Type (Annual Physical, SCBA Fit Test, or Vaccination). Enter the exam date, the examining facility/physician, and any clearance notes. If the member is cleared with limitations, set Clearance to Limited Duty — the system will surface this in their status badge and in the Notifications module.',
      },
      {
        title: 'Exposure Event Documentation',
        type: 'text',
        content: 'Click + New Exposure to log occupational exposures. Every documented exposure is critical for cancer presumption claims. Log the date, type (carcinogen, chemical, biological, radiation, or stress-related), location, and detailed description. Even minor exposures should be recorded — the cumulative record is valuable evidence.',
      },
    ],
    tips: [
      'The exposure log is especially important for cancer presumption documentation. Log every significant exposure event, even minor ones.',
      'SCBA fit tests and physicals have separate 90-day alert windows — both show in the Notifications module independently.',
    ],
    howTo: [
      { step: 'Open Health & Wellness', detail: 'Navigate to the Personnel section and click Health & Wellness to see all members\' wellness statuses.' },
      { step: 'Log a physical exam', detail: 'Click + New Exam and select a member. Choose "Annual Physical" as the exam type, enter the exam date, physician name, and clearance status (Full/Limited/Not Cleared).' },
      { step: 'Log a SCBA fit test', detail: 'Click + New Exam, select the member, choose "SCBA Fit Test". Enter the test date, mask model/size, and fit factor score.' },
      { step: 'Document exposures', detail: 'Click + New Exposure to log occupational exposures. Select member, type (carcinogen/chemical/biological/radiation/stress), location, and full description.' },
      { step: 'Check alerts', detail: 'The Notifications module will flag physicals and fit tests due within 90 days. Address amber alerts promptly to avoid overdue status.' },
    ],
    related: ['Member Roster', 'Member Portal', 'Notifications', 'Training'],
  },

  // ── Apparatus Tracker ──────────────────────────────────────────────────────
  apparatus: {
    name: 'Apparatus Tracker',
    group: 'Apparatus',
    overview: 'The Apparatus Tracker is the master record for every piece of rolling stock in the department — engines, tankers, rescues, command units, and support vehicles. Status, mileage, and next service information are visible at a glance.',
    features: [
      'Card-based view: one card per unit with status, type, year, and mileage',
      'Real-time status: In Service / Maintenance / Out of Service',
      'Next service date and mileage threshold tracking',
      'Expandable detail: full specs, VIN, insurance, purchase info',
      'Linked to Maintenance Log — recent work orders appear in detail view',
      'Schematic view — large color-coded status cards for a quick visual sweep of all units at a glance',
    ],
    sections: [
      {
        title: 'Unit Status',
        type: 'indicators',
        items: [
          { label: 'In Service (green)', desc: 'Unit is fully operational and available for immediate response.' },
          { label: 'Maintenance (amber)', desc: 'Unit is temporarily out for scheduled or corrective maintenance. Expected return date shown.' },
          { label: 'Out of Service (red)', desc: 'Unit is non-operational with no current return date. Notify mutual aid partners if front-line coverage is affected.' },
        ],
      },
      {
        title: 'Key Fields',
        type: 'fields',
        items: [
          { name: 'Unit Designator', desc: 'Radio / dispatch name (e.g., Engine 1, Tanker 2).' },
          { name: 'Year / Make / Model', desc: 'Manufacturer information for parts and warranty lookups.' },
          { name: 'VIN', desc: 'Vehicle identification number for insurance and state registration.' },
          { name: 'Pump Capacity (GPM)', desc: 'For engines and tankers — rated pumping capacity in gallons per minute.' },
          { name: 'Tank Capacity (Gal)', desc: 'Onboard water or foam tank size.' },
          { name: 'Next Service Date / Miles', desc: 'Whichever threshold comes first triggers an alert in Notifications.' },
        ],
      },
      {
        title: 'Unit Life Cycle & Replacement Planning',
        type: 'text',
        content: 'Each apparatus record includes useful life, acquisition cost, and current book value. The system tracks this data for capital planning and fleet turnover budgeting. When a unit approaches end-of-life (typical: 15–20 years, 150k+ miles), officers can flag it for replacement planning in the Budget module.',
      },
      {
        title: 'Status Transitions & Alerts',
        type: 'text',
        content: 'When you change a unit\'s status to Out of Service, the system immediately creates a Critical alert in Notifications. If the OOS apparatus is front-line, a banner reminds you to notify mutual aid partners. Update pre-incident plans for your district to reflect the coverage change. The status badge in the apparatus card shows the current state at a glance.' },
    ],
    tips: [
      'When you change a unit\'s status to Out of Service, the system automatically creates a high-priority alert in the Notifications module.',
      'Mileage is updated manually — log it each time a work order is created in the Maintenance Log.',
    ],
    howTo: [
      { step: 'View the apparatus fleet', detail: 'The Apparatus Tracker shows all units as cards. Each card displays status (green/amber/red), unit name, type, year, and mileage.' },
      { step: 'Click a unit card to expand', detail: 'See full details: VIN, pump/tank capacity, next service date, and linked maintenance records.' },
      { step: 'Change unit status', detail: 'Click the status pill (green/amber/red) to toggle between In Service, Maintenance, or Out of Service. OOS status triggers a Critical alert.' },
      { step: 'Update mileage', detail: 'Click Edit Unit, scroll to Mileage, and enter the current odometer reading. Update it each time you log maintenance to track service intervals.' },
      { step: 'Plan maintenance', detail: 'The Next Service Date field drives service alerts. If a unit is approaching the date or mileage threshold, open the Maintenance Log and create a work order.' },
    ],
    related: ['Maintenance Log', 'Inspection Checklists', 'Pre-Incident Plans', 'Notifications'],
  },

  // ── Maintenance Log ────────────────────────────────────────────────────────
  maintenance: {
    name: 'Maintenance Log',
    group: 'Apparatus',
    overview: 'The Maintenance Log tracks all work orders for every apparatus in the department — preventive, corrective, and emergency. It automatically calculates total cost per job and flags priority items.',
    features: [
      'Work orders linked to specific apparatus units',
      'Auto-calculated total cost: parts cost + labor cost',
      'Priority levels: Routine / Urgent / Emergency',
      'Status tracking: Open / In Progress / Completed',
      'Service history per unit — expandable rows with full detail',
      'Next service date and mileage fields auto-populate the Apparatus Tracker',
    ],
    sections: [
      {
        title: 'Priority Levels',
        type: 'indicators',
        items: [
          { label: 'Routine (gray)', desc: 'Scheduled preventive maintenance. Can be planned in advance.' },
          { label: 'Urgent (amber)', desc: 'Issue affects unit reliability. Address within days, not weeks.' },
          { label: 'Emergency (red)', desc: 'Unit is unsafe to operate. Take out of service immediately and notify the officer on duty.' },
        ],
      },
      {
        title: 'Key Fields',
        type: 'fields',
        items: [
          { name: 'Work Order #', desc: 'Auto-generated sequential number for reference and vendor invoicing.' },
          { name: 'Reported By', desc: 'Member who identified and reported the issue.' },
          { name: 'Technician / Vendor', desc: 'Who performed the repair — internal mechanic or external shop.' },
          { name: 'Parts Cost', desc: 'Cost of parts and materials for the job.' },
          { name: 'Labor Cost', desc: 'Cost of labor, whether internal or invoiced.' },
          { name: 'Total Cost', desc: 'Automatically calculated: Parts + Labor. Feeds into the Budget module if linked.' },
          { name: 'Mileage at Service', desc: 'Odometer reading at time of service — updates the Apparatus Tracker.' },
        ],
      },
      {
        title: 'Service History & Trending',
        type: 'text',
        content: 'The Maintenance Log builds a complete service history for each apparatus. Review the history to spot patterns — if Engine 3 has had three pump seal failures in the past year, it may be a sign of systemic wear. Use this data for fleet replacement planning and warranty claims.',
      },
      {
        title: 'Linking to Budget & Apparatus Tracker',
        type: 'text',
        content: 'Work orders can be linked to budget line items so costs are automatically deducted from the Budget & Finance module. The mileage logged in a work order automatically updates the Apparatus Tracker\'s current mileage. An Emergency priority work order automatically sets the apparatus status to Out of Service and triggers a Critical alert.',
      },
    ],
    tips: [
      'Tag work orders with the correct apparatus unit — this builds the historical maintenance record that\'s essential for fleet replacement planning and ISO documentation.',
      'Emergency priority work orders automatically set the linked apparatus status to Out of Service.',
    ],
    howTo: [
      { step: 'Click + New Work Order', detail: 'Open the work order form from the top right of Maintenance Log.' },
      { step: 'Select the apparatus unit', detail: 'Choose which unit (Engine 1, Tanker 2, etc.) the work order is for. This links the record to that unit\'s history.' },
      { step: 'Describe the issue', detail: 'Type a brief description of the problem: "Engine 1 pump pressure low" or "Tanker 2 back door hinge cracked".' },
      { step: 'Set priority', detail: 'Choose Routine (scheduled), Urgent (days), or Emergency (immediately). Emergency status auto-sets the unit to Out of Service.' },
      { step: 'Log parts and labor costs', detail: 'Enter parts cost and labor hours (with hourly rate). Total cost auto-calculates. Log mileage at service time.' },
    ],
    related: ['Apparatus Tracker', 'Budget & Finance', 'Inspection Checklists', 'Notifications'],
  },

  // ── Inspection Checklists ──────────────────────────────────────────────────
  checklists: {
    name: 'Inspection Checklists',
    group: 'Apparatus',
    overview: 'Inspection Checklists runs structured pass/fail inspections for apparatus and station equipment. Failing an item automatically opens a deficiency notes field and creates a record in the history log.',
    features: [
      'Pre-built checklists for engines, tankers, rescues, and station equipment',
      'Pass / Fail per checklist item with mandatory notes on failure',
      'Deficiency auto-documented with timestamp, inspector, and notes',
      'Full inspection history with expandable detail per run',
      'Officer can mark deficiencies resolved once corrected',
      'Checklist results available in PDF via Reports & Export',
    ],
    sections: [
      {
        title: 'Checklist Item Results',
        type: 'indicators',
        items: [
          { label: 'Pass (green)', desc: 'Item checked, in proper condition, no action required.' },
          { label: 'Fail (red)', desc: 'Item out of compliance. Notes are required. A deficiency record is created automatically.' },
          { label: 'N/A (gray)', desc: 'Item not applicable to this unit or inspection type.' },
        ],
      },
      {
        title: 'Deficiency Workflow',
        type: 'text',
        content: 'When an item is marked Fail, the system requires you to enter deficiency notes before you can complete the inspection. The deficiency remains open in the history until an officer marks it Resolved. Open deficiencies are surfaced in the Notifications module.',
      },
      {
        title: 'Creating & Running Checklists',
        type: 'text',
        content: 'Select a pre-built checklist for the equipment you are inspecting (Engine, Tanker, Rescue, Station Equipment, etc.). Go through each item and mark Pass, Fail, or N/A. If you mark Fail, a notes field appears — explain the issue and when it will be resolved. When finished, click Complete Inspection. The timestamp and your name are auto-recorded.',
      },
      {
        title: 'Using Inspection History',
        type: 'text',
        content: 'The history view shows all past inspections for a unit, sorted by date. Click any past inspection to see what was found and how issues were resolved. This historical record is valuable for tracking recurring defects and demonstrating due diligence to ISO auditors.',
      },
    ],
    tips: [
      'Daily apparatus checks should be run at the start of every shift — the timestamp and inspector name are auto-recorded.',
      'Unresolved deficiencies are counted in the Dashboard apparatus alert summary.',
    ],
    howTo: [
      { step: 'Click + New Inspection', detail: 'Choose the equipment type (Engine, Tanker, Rescue, or Station Equipment) and select which specific unit to inspect.' },
      { step: 'Select the appropriate checklist', detail: 'The system will offer pre-built checklists for that equipment type. Each checklist is tailored to specific equipment.' },
      { step: 'Go through each item', detail: 'For each checklist item, mark Pass (green), Fail (red), or N/A (gray). If you mark Fail, a notes field appears.' },
      { step: 'Add deficiency notes', detail: 'Explain the defect and when you expect it to be corrected. Required for Fail items. Deficiencies remain open until an officer marks Resolved.' },
      { step: 'Complete the inspection', detail: 'Click Complete Inspection. The system records the timestamp, inspector name, and results. Open deficiencies surface in Notifications.' },
    ],
    related: ['Apparatus Tracker', 'Maintenance Log', 'Notifications', 'Station Daily Log'],
  },

  // ── Incident Log ──────────────────────────────────────────────────────────
  incidents: {
    name: 'Incident Log',
    group: 'Operations',
    overview: 'The Incident Log is the primary operational record for all emergency responses. Every call your department runs should be logged here — it feeds the dashboard, annual reports, mutual aid tracking, and the NFIRS module.',
    features: [
      'Log all response types: fire, EMS, rescue, hazmat, service call, and more',
      'Track units dispatched, personnel assigned, and roles',
      'Disposition and outcome fields for each incident',
      'Injury and fatality counts (civilian and firefighter)',
      'Expandable rows with full narrative and resource detail',
      'Linked to NFIRS — create a NFIRS report from any incident record',
    ],
    sections: [
      {
        title: 'Incident Types',
        type: 'fields',
        items: [
          { name: 'Structure Fire', desc: 'Residential, commercial, or industrial building fire.' },
          { name: 'Vehicle Fire', desc: 'Automobile, truck, boat, or machinery fire.' },
          { name: 'Wildland Fire', desc: 'Grass, brush, or forest fire.' },
          { name: 'EMS / Medical', desc: 'Emergency medical response, whether fire-based EMS or support.' },
          { name: 'MVA', desc: 'Motor vehicle accident — with or without extrication.' },
          { name: 'Hazmat', desc: 'Hazardous materials release or exposure incident.' },
          { name: 'Technical Rescue', desc: 'Confined space, high angle, water, or collapse rescue.' },
          { name: 'Public Assist / Service', desc: 'Non-emergency response: lockout, water removal, good intent.' },
        ],
      },
      {
        title: 'Disposition Codes',
        type: 'fields',
        items: [
          { name: 'Controlled / Extinguished', desc: 'Fire suppressed, incident stabilized.' },
          { name: 'Patient Transported', desc: 'EMS patient transported to hospital.' },
          { name: 'Cancelled En Route', desc: 'Dispatch cancelled before arrival.' },
          { name: 'No Action Required', desc: 'Units arrived, no intervention needed.' },
          { name: 'Referred to Other Agency', desc: 'Handled by law enforcement, utilities, or other department.' },
        ],
      },
      {
        title: 'Logging Incidents & Assignments',
        type: 'text',
        content: 'Click + New Incident to open the entry form. Fill in the date, type (Structure Fire, EMS, MVA, etc.), address, units dispatched, and personnel assigned to roles (IC, Driver, FF, EMS). Add a brief narrative in the Notes field — this feeds directly into the NFIRS module if you create a report from this incident.' },
      {
        title: 'Linking to NFIRS & Mutual Aid',
        type: 'text',
        content: 'Every incident can be linked to an NFIRS report (create one from the expanded incident detail). If mutual aid was involved, flag it here and log the aid given/received separately in the Mutual Aid module. Incident counts automatically feed into the Dashboard YTD stats.' },
    ],
    tips: [
      'Log incidents in the Incident Log first, then create the NFIRS report from the linked button in the expanded detail — this avoids duplicate data entry.',
      'Injury counts here and in NFIRS should match. Discrepancies will appear in the Annual Report cross-reference.',
    ],
    howTo: [
      { step: 'Click + New Incident', detail: 'Open the incident entry form from the top right of the Incident Log view.' },
      { step: 'Enter basic info', detail: 'Set the date, time, incident type (Structure Fire, EMS, MVA, etc.), and street address.' },
      { step: 'Assign units and personnel', detail: 'Click Add Unit to log which apparatus responded. Then click Add Personnel to assign members to roles: IC (Incident Commander), Driver, Firefighter, or EMS.' },
      { step: 'Set disposition', detail: 'Choose how the incident concluded: Controlled/Extinguished, Patient Transported, Cancelled En Route, No Action, or Referred.' },
      { step: 'Create NFIRS report (optional)', detail: 'Once the incident is saved, click Create NFIRS Report from the expanded detail. The basic incident data pre-fills Module 1 fields.' },
    ],
    related: ['NFIRS / NERIS Reports', 'Mutual Aid', 'Pre-Incident Plans', 'Dashboard'],
  },

  // ── Pre-Incident Plans ─────────────────────────────────────────────────────
  preplans: {
    name: 'Pre-Incident Plans',
    group: 'Operations',
    overview: 'Pre-Incident Plans (pre-plans) are detailed property dossiers that crews review before responding to high-risk locations. A well-maintained pre-plan library is one of the most effective firefighter safety tools available.',
    features: [
      '6-tab property plans: Overview, Hazards, Access, Water Supply, Suppression, Utilities',
      'Risk level color coding: Low / Moderate / High / Extreme',
      'Floor plan and photo attachment fields',
      'Knox box / key vault locations and access codes (officer-only)',
      'Occupant contact information for after-hours emergencies',
      'Last-reviewed date and reviewing officer recorded on each plan',
    ],
    sections: [
      {
        title: 'Risk Levels',
        type: 'indicators',
        items: [
          { label: 'Low (green)', desc: 'Standard residential or low-occupancy property. No special hazards.' },
          { label: 'Moderate (amber)', desc: 'Light commercial, multi-family, or properties with notable hazards.' },
          { label: 'High (orange)', desc: 'Large commercial, industrial, or properties with significant life safety or structural concerns.' },
          { label: 'Extreme (red)', desc: 'High-hazard occupancy: bulk chemical storage, large assembly, critical infrastructure.' },
        ],
      },
      {
        title: 'Plan Tabs',
        type: 'fields',
        items: [
          { name: 'Overview', desc: 'Property address, type, construction class, year built, occupancy load.' },
          { name: 'Hazards', desc: 'Flammable materials, electrical hazards, structural concerns, HazMat, LODD risk factors.' },
          { name: 'Access', desc: 'Driveway/gate access, address visibility, locked areas, key vault location.' },
          { name: 'Water Supply', desc: 'Nearest hydrant, static source, dry hydrant location, flow test data.' },
          { name: 'Suppression', desc: 'Standpipe/sprinkler FDC location, system type, zone map.' },
          { name: 'Utilities', desc: 'Gas shutoff, electric panel, elevator machine room, HVAC.' },
        ],
      },
      {
        title: 'Creating & Updating Pre-Plans',
        type: 'text',
        content: 'Click + New Pre-Plan and enter the property address. Assign a risk level (Low/Moderate/High/Extreme). Fill each tab with property details — start with Overview (basic info) and Hazards (what\'s dangerous). The water supply and suppression tabs should reference your Hydrant Management data. Attach photos of the building exterior, parking areas, and entrances.' },
      {
        title: 'Review Cycle & Officer Sign-Off',
        type: 'text',
        content: 'Each pre-plan shows "Last Reviewed" with the reviewing officer\'s name. The system flags plans older than 12 months for annual review. When a plan is reviewed, click Review This Plan to update the review date and assign the reviewing officer. This creates an audit trail for ISO documentation.' },
    ],
    tips: [
      'Prioritize pre-plans for Extreme and High risk properties first. Even a partial pre-plan is better than none.',
      'Set a calendar reminder to review pre-plans annually — the "Last Reviewed" date is visible in the plan list and flags plans older than 12 months.',
    ],
    howTo: [
      { step: 'Click + New Pre-Plan', detail: 'Open the new pre-plan form. Enter the property address and set the risk level (Low / Moderate / High / Extreme).' },
      { step: 'Fill the Overview tab', detail: 'Property type, construction class, year built, occupancy load, and contact info for after-hours emergencies.' },
      { step: 'Document hazards', detail: 'List any flammable materials, electrical hazards, structural concerns, or LODD risk factors. Be specific: "Propane tanks in rear yard" is better than "hazardous materials".' },
      { step: 'Describe access & utilities', detail: 'Note driveway width, gate codes, key vault locations, gas shutoff location, and main electrical panel. Include photos if possible.' },
      { step: 'Attach photos', detail: 'Upload images of building exterior, entrances, parking, and any unique features. Crews will see these on the way to a call.' },
    ],
    related: ['Incident Log', 'Hydrant Management', 'Fire Inspections', 'Apparatus Tracker'],
  },

  // ── Mutual Aid ────────────────────────────────────────────────────────────
  mutualaid: {
    name: 'Mutual Aid',
    group: 'Operations',
    overview: 'The Mutual Aid module tracks aid given to and received from neighboring departments. Keeping this log accurate matters for reimbursement agreements, ISO documentation, and regional planning.',
    features: [
      'Log aid given: which department, what apparatus, how many personnel, incident date',
      'Log aid received: incoming units, incident they responded to',
      'YTD summary: total events, units dispatched, personnel hours',
      'Filter by department, date range, or direction (given/received)',
      'Officer+ required to log; members cannot view mutual aid records',
    ],
    sections: [
      {
        title: 'Aid Direction',
        type: 'indicators',
        items: [
          { label: 'Aid Given (blue)', desc: 'Your department sent units to assist another department\'s incident.' },
          { label: 'Aid Received (green)', desc: 'Another department sent units to assist your incident.' },
        ],
      },
      {
        title: 'Key Fields',
        type: 'fields',
        items: [
          { name: 'Partner Department', desc: 'Name and county/state of the requesting or assisting department.' },
          { name: 'Incident Date', desc: 'Date of the mutual aid response.' },
          { name: 'Apparatus Sent / Received', desc: 'Unit designators and types.' },
          { name: 'Personnel Count', desc: 'Number of personnel involved in the mutual aid response.' },
          { name: 'Duration (hours)', desc: 'Time on scene — important for cost reimbursement calculations.' },
          { name: 'Reimbursable', desc: 'Flag if this response is subject to automatic aid or reimbursement agreement.' },
        ],
      },
      {
        title: 'Recording Mutual Aid Events',
        type: 'text',
        content: 'Click + New Aid Record to log a mutual aid response. Select whether you are giving or receiving aid. Enter the partner department, incident date, units/apparatus sent or received, personnel count, and time on scene. Flag if the response falls under an automatic aid agreement or reimbursement contract.' },
      {
        title: 'YTD Summary & Reporting',
        type: 'text',
        content: 'The YTD Summary panel at the top shows total events, units dispatched, and personnel hours (events × personnel count × hours per event). This data feeds directly into the Annual Report for ISO Section 4 documentation. For reimbursable aid given, use the YTD totals to justify cost recovery bills to partner departments.' },
    ],
    tips: [
      'Log mutual aid within 24 hours of the event while details are fresh — unit designators and personnel counts are easy to forget.',
      'The YTD summary exports directly into the Annual Report for ISO Section 4 documentation.',
    ],
    howTo: [
      { step: 'Click + New Aid Record', detail: 'Open the mutual aid entry form from the top right of the Mutual Aid view.' },
      { step: 'Select direction', detail: 'Choose Aid Given (you sent units to help another department) or Aid Received (another department sent units to help you).' },
      { step: 'Enter incident details', detail: 'Partner department name, incident date, units sent/received (e.g., Engine 1, Tanker 2), personnel count, and time on scene.' },
      { step: 'Flag reimbursable aid', detail: 'If the response falls under an automatic aid agreement or is reimbursable, check the Reimbursable flag. Use this to track billable aid.' },
      { step: 'Save the record', detail: 'Click Save. The YTD summary at the top updates immediately.' },
    ],
    related: ['Incident Log', 'Apparatus Tracker', 'Budget & Finance', 'Reports & Export'],
  },

  // ── Event Calendar ────────────────────────────────────────────────────────
  calendar: {
    name: 'Event Calendar',
    group: 'Operations',
    overview: 'The Event Calendar manages department events — drills, fundraisers, community events, meetings, and training sessions. Members can RSVP and officers can see attendance at a glance. Unified views (Week, Day, Agenda, My Calendar) let you tailor how you see the schedule, iCal subscription integrates events into personal calendars, and attachment support connects documents and photos to every event.',
    features: [
      'Multiple calendar views: Month, Week, Day, Agenda, and My Calendar',
      'Event types: Drill, Meeting, Training, Fundraiser, Community, Other',
      'Per-member RSVP: Going / Not Going / Maybe',
      'Attendance count and response breakdown per event',
      'Past events are automatically locked (read-only)',
      'All members can view and RSVP; officers can create and edit events',
      'iCal subscription — export your department calendar to personal calendar apps (Apple Calendar, Google Calendar, Outlook, etc.)',
      'Attachment support — link documents, photos, pre-plans, SOGs, or training materials to events',
    ],
    sections: [
      {
        title: 'Event Types',
        type: 'indicators',
        items: [
          { label: 'Drill (red)', desc: 'Operational training drill. Hours auto-credited to Volunteer Hours as Training.' },
          { label: 'Meeting (blue)', desc: 'Department, committee, or officer meeting.' },
          { label: 'Training (purple)', desc: 'Formal course or certification session.' },
          { label: 'Fundraiser (amber)', desc: 'Department fundraising event.' },
          { label: 'Community (green)', desc: 'Public education, open house, or community engagement event.' },
        ],
      },
      {
        title: 'RSVP Status',
        type: 'fields',
        items: [
          { name: 'Going', desc: 'Member has confirmed attendance.' },
          { name: 'Not Going', desc: 'Member has declined — no follow-up needed if not a mandatory drill.' },
          { name: 'Maybe', desc: 'Member is tentative — check closer to the date.' },
          { name: 'No Response', desc: 'Member has not yet responded. Shown as a count in the event detail.' },
        ],
      },
      {
        title: 'Calendar Views',
        type: 'text',
        content: 'Choose your preferred calendar display from the view toggles at the top. Month view shows all events in a traditional calendar grid. Week view displays a 7-day schedule with hourly time slots. Day view focuses on a single day\'s schedule. Agenda view lists upcoming events chronologically. My Calendar shows only events you\'re invited to or have RSVPed. Each view is fully interactive — click an event to open its detail panel.' },
      {
        title: 'Creating Events & Managing Attendance',
        type: 'text',
        content: 'Click + New Event to create an event. Set the type (Drill, Meeting, Training, Fundraiser, or Community), date, time, location, and description. Optionally invite specific members or leave it open for all to RSVP. The event appears on the calendar and in all members\' views. You can attach documents, training materials, or photos to the event — all attendees can download them.' },
      {
        title: 'Post-Event: Hours & Training Credit',
        type: 'text',
        content: 'Once a Drill or Training event is complete, click Mark as Complete. If it\'s a drill, the system offers to auto-credit all attendees in the Volunteer Hours module for the event duration. This saves manual hour-logging and ensures training hours are captured for ISO reports.' },
      {
        title: 'iCal Subscription',
        type: 'text',
        content: 'Subscribe to your department calendar using iCal. Click the Subscribe icon at the top of the calendar to get your unique iCal link. Copy this link into Apple Calendar, Google Calendar, Outlook, or any calendar app that supports iCal. You\'ll automatically see all department events on your personal calendar, and the subscription syncs every hour. Perfect for members who want events on their phone or computer without switching tabs.' },
      {
        title: 'Event Attachments',
        type: 'text',
        content: 'When creating or editing an event, use the Attachments section to link documents. Common examples: pre-incident plans for drill locations, SOGs for fire safety drills, training handouts for educational events, photos from past events as examples, or agendas for meetings. All team members can download attachments, ensuring everyone has access to the documents they need.' },
    ],
    tips: [
      'Drill events are linked to Training — marking a drill as complete automatically offers to credit attendee hours.',
      'Officers can send a Notification to all No-Response members 48 hours before a mandatory event.',
      'Subscribe to your department calendar using iCal — events will automatically sync to your personal calendar (Apple, Google, Outlook) every hour.',
      'Attach documents to events like drills and training — all attendees can download them before or during the event.',
      'The Week, Day, and Agenda views are optimized for mobile devices — use them on your phone to see your personal schedule.',
    ],
    howTo: [
      { step: 'Click + New Event', detail: 'Open the event creation form from the top right of the Event Calendar.' },
      { step: 'Set event type', detail: 'Choose Drill (training), Meeting, Training (formal course), Fundraiser, or Community Event.' },
      { step: 'Set date, time, and location', detail: 'Enter the date, start/end time, and where the event will be held. Location is visible to all members.' },
      { step: 'Add description & invite members', detail: 'Describe the event purpose. Optionally select members to invite; otherwise leave open for all to see and RSVP.' },
      { step: 'After the event, mark complete', detail: 'Click Mark as Complete. If it\'s a drill, you will be offered to auto-credit all attendees in Volunteer Hours for the event duration.' },
    ],
    related: ['Volunteer Hours', 'Drills & Courses', 'Training', 'Member Roster'],
  },

  // ── Public Dashboard ───────────────────────────────────────────────────────
  public: {
    name: 'Public Dashboard',
    group: 'Operations',
    overview: 'The Public Dashboard is a read-only display intended for a station lobby screen, community website, or open house. It shows YTD response statistics and unit status without exposing private member or financial data.',
    features: [
      'YTD incident count, by type, with comparison to prior year',
      'Apparatus status board (In Service / Maintenance / OOS)',
      'Recent incidents with sanitized addresses (street name only, no house numbers)',
      'Auto-refreshes on a configurable interval',
      'No login required — designed to be embedded or displayed publicly',
      'Chief controls which data categories are shown in Station Settings',
    ],
    sections: [
      {
        title: 'Privacy Sanitization',
        type: 'text',
        content: 'The Public Dashboard automatically strips house numbers from all incident addresses. Street names and cross-streets are shown, but specific address numbers are removed to protect residents\' privacy. This behavior cannot be disabled — it is always active on the public view.',
      },
      {
        title: 'What\'s Hidden on the Public View',
        type: 'fields',
        items: [
          { name: 'Member names and contacts', desc: 'No personnel data is exposed on the public view.' },
          { name: 'Financial data', desc: 'Budget and expense information is never shown publicly.' },
          { name: 'Full incident addresses', desc: 'House numbers are always stripped.' },
          { name: 'Health & wellness records', desc: 'No medical information is ever shown publicly.' },
          { name: 'SOGs and pre-plans', desc: 'Operational documents are for internal use only.' },
        ],
      },
      {
        title: 'Configuring Public View Settings',
        type: 'text',
        content: 'Go to Station Settings (Chief only) and find the Public Dashboard section. Toggle which categories appear on the public view: YTD incident counts, apparatus status, recent incidents list. Set the auto-refresh interval (typically 5 minutes). The public view will automatically hide member names, financial data, and full addresses regardless of these settings.' },
      {
        title: 'Embedding on Your Website',
        type: 'text',
        content: 'The Public Dashboard is designed to be embedded on your department\'s website or displayed on a lobby screen. Copy the public URL from Station Settings and embed it as an iframe or direct link. It requires no login and will auto-refresh, showing your community current response statistics and apparatus status.' },
    ],
    tips: [
      'Consider embedding the Public Dashboard URL on your department\'s website — it keeps your community informed without requiring any manual updates.',
      'The refresh interval (default: 5 minutes) is configurable in Station Settings.',
    ],
    howTo: [
      { step: 'Access the Public Dashboard', detail: 'Navigate to Public Dashboard from the main menu. You see a read-only view of what the public sees.' },
      { step: 'Review what\'s visible', detail: 'The public view shows YTD incident stats, apparatus status board, and recent calls. No member names, financial data, or house numbers are ever shown.' },
      { step: 'Configure settings', detail: 'Go to Station Settings (Chief only) and select Public Dashboard section. Toggle which data categories appear.' },
      { step: 'Copy the public URL', detail: 'The public URL is displayed in Station Settings. Share it with your community or embed it on your website.' },
      { step: 'The view auto-refreshes', detail: 'The public view refreshes every 5 minutes (or your configured interval) to show current data.' },
    ],
    related: ['Dashboard', 'Station Settings', 'Incident Log', 'Apparatus Tracker'],
  },

  // ── NFIRS / NERIS Reports ──────────────────────────────────────────────────
  nfirs: {
    name: 'NFIRS / NERIS Reports',
    group: 'Operations',
    overview: 'The NFIRS / NERIS module captures and validates all fields required by NFIRS 5.0 and the new NERIS 1.0 standard. Reports can be exported in either format — NFIRS JSON for your state\'s submission client, or NERIS-wrapped JSON for the new National Emergency Response Information System. A format toggle and transition banner keep your department informed as the USFA completes the migration from NFIRS to NERIS. Officer-level access required.',
    features: [
      'Full NFIRS 5.0 Module 1 (Basic) field set for all incident types',
      'Module 3 (Structure Fire) fields for residential and commercial fires',
      'Completeness bar on every report — shows percentage of required fields filled',
      'Draft → Complete → Submitted status workflow',
      'JSON export per report or bulk export for all reports',
      'Incident type, property use, and action codes from official NFIRS code tables',
      'Full NERIS 1.0 export with 35-field core incident schema, GPS coordinates, unit response times, and NERIS ID generation',
      'NERIS validation card — shows completeness percentage, errors, and warnings per report',
      'Format toggle — switch between NFIRS 5.0 and NERIS export with one click',
      'NERIS transition banner with status and guidance',
      'NERIS Ready stat card — shows how many reports meet NERIS field requirements',
      'Server-side NERIS export endpoints for bulk and single-report exports',
      'Enhanced NERIS fields in the report form: GPS coordinates, dispatch/on-scene/clear times, responding units',
      'NJ State Validation — one-click validation against NJ OFIRS requirements (FDID format, required fields, 30-day deadline, fatality expedited reporting)',
    ],
    sections: [
      {
        title: 'Report Status',
        type: 'indicators',
        items: [
          { label: 'Draft (amber)', desc: 'Report is in progress. Missing required fields are reflected in the completeness bar.' },
          { label: 'Complete (blue)', desc: 'All required fields are filled. Report is ready for review and export.' },
          { label: 'Submitted (green)', desc: 'Report has been exported and submitted to the state NFIRS system.' },
        ],
      },
      {
        title: 'Completeness Bar',
        type: 'indicators',
        items: [
          { label: '100% (green)', desc: 'All required fields are filled for the applicable modules.' },
          { label: '70–99% (amber)', desc: 'Most fields complete — a few required fields are missing.' },
          { label: 'Below 70% (red)', desc: 'Significant gaps remain. Review Module 1 fields carefully.' },
        ],
      },
      {
        title: 'Module 1 — Basic (Required for All Incidents)',
        type: 'fields',
        items: [
          { name: 'FDID', desc: 'Fire Department Identification number assigned by your state fire marshal. Required for USFA submission.' },
          { name: 'Incident Number', desc: 'Your department\'s unique incident number — must match your CAD or run log.' },
          { name: 'Exposure Number', desc: 'Typically 000 for the primary incident. Non-zero for subsequent exposures from the same fire.' },
          { name: 'Incident Type Code', desc: 'NFIRS 5.0 type code (e.g., 111 = Building Fire, 321 = EMS call). Selected from the official code table.' },
          { name: 'Aid Code', desc: 'Whether aid was given, received, or this was a mutual aid incident.' },
          { name: 'Property Use Code', desc: 'NFIRS property use code for the affected structure or location.' },
          { name: 'Actions Taken', desc: 'Up to 3 action codes describing what units did on scene.' },
          { name: 'Resources', desc: 'Suppression, EMS, and other apparatus and personnel counts.' },
        ],
      },
      {
        title: 'Module 3 — Structure Fire (Required When Applicable)',
        type: 'fields',
        items: [
          { name: 'Structure Type', desc: 'Enclosed building, open structure, vehicle storage, etc.' },
          { name: 'Fire Origin', desc: 'Room or area where the fire began (e.g., bedroom, kitchen, attic).' },
          { name: 'Fire Cause', desc: 'Intentional, unintentional, failure of equipment, or undetermined.' },
          { name: 'Detector Presence / Operation', desc: 'Whether a smoke or heat detector was present and whether it operated.' },
          { name: 'Sprinkler Presence / Operation', desc: 'Whether a sprinkler system was present and whether it operated.' },
        ],
      },
      {
        title: 'Submission Process',
        type: 'text',
        content: 'OpenFirehouse does not connect directly to the USFA NFIRS system — that requires a registered FDID and state-certified submission software. Export your completed reports as JSON and import them into your state\'s NFIRS client, or use NERIS when it becomes available in your state. The JSON export format is structured to facilitate this transfer.',
      },
      {
        title: 'NERIS Transition',
        type: 'text',
        content: 'The USFA transitioned from NFIRS 5.0 to NERIS (National Emergency Response Information System) in January 2026. The NERIS format toggle at the top of the module lets you switch between legacy NFIRS and NERIS 1.0 export formats. NERIS exports use a full 35-field core incident schema including: NERIS ID (auto-generated from FDID + incident number + date), department metadata, GPS coordinates, incident classification mapped from NFIRS type codes, unit response times (dispatch, on-scene, clear), personnel and apparatus counts, and property/location details parsed from the civic address. A validation card shows completeness percentage, specific errors, and warnings for each report before export. All existing NFIRS reports are forward-compatible — the transformer maps legacy fields automatically.',
      },
      {
        title: 'NJ State Validation',
        type: 'text',
        content: 'The NJ State Validation section at the bottom of the report form checks your report against NJ Office of Fire Safety (OFIRS) requirements. Click "Validate for NJ Submission" to run the check. It verifies: FDID is in NJ format (NJxx-xxx), required fields are filled, structure fire reports have property use/origin/cause/detector/sprinkler fields, casualty reports are flagged for 24-hour expedited submission, and reports older than 30 days are warned about the NJ submission deadline. Errors must be fixed before submission; warnings are advisory.',
      },
      {
        title: 'Creating NFIRS Reports from Incidents',
        type: 'text',
        content: 'Go to the Incident Log, find an incident, and click Create NFIRS Report from the expanded detail. Module 1 basic fields (incident type, disposition, resources) pre-fill from the incident record. For structure fires, Module 3 fields (origin, cause, detector operation) are required — the completeness bar will show red until these are filled. Review every field against the official NFIRS code tables before export.' },
    ],
    tips: [
      'Link each NFIRS report to its corresponding Incident Log entry using the Linked Incident ID field — this creates a clear audit trail and avoids duplicate data entry.',
      'Structure fire reports require Module 3 fields — the completeness bar will stay below 100% until those are filled, even if all Module 1 fields are complete.',
      'Your FDID is set in Station Settings. Verify it with your state fire marshal before exporting reports for submission.',
      'Use the NERIS format toggle to export reports in the new standard. NERIS exports include department ID and geo-location metadata that NFIRS does not.',
      'The NERIS Ready stat card counts reports that have all required fields filled. Work toward getting all reports to 100% completeness before switching to NERIS-only exports.',
    ],
    howTo: [
      { step: 'Open an incident', detail: 'Go to Incident Log, click an incident row to expand it, and click Create NFIRS Report.' },
      { step: 'Module 1 fills automatically', detail: 'Incident type, units, personnel counts, and disposition pre-fill from the incident record. Review and edit as needed.' },
      { step: 'For structure fires, complete Module 3', detail: 'If the incident type is a structure fire, the Completeness Bar will flag missing Module 3 fields (origin, cause, sprinkler operation, etc.).' },
      { step: 'Review all fields', detail: 'Check every field against the official NFIRS 5.0 code tables. Do not guess at codes — inaccurate NFIRS submissions can delay state processing.' },
      { step: 'Export to JSON', detail: 'Once 100% complete, click Export as JSON. Import the file into your state\'s NFIRS submission client.' },
    ],
    related: ['Incident Log', 'Fire Investigation', 'Station Settings', 'Reports & Export'],
  },

  // ── ISO Grading Report ─────────────────────────────────────────────────────
  iso: {
    name: 'ISO Grading Report',
    group: 'Administration',
    overview: 'The ISO Grading Report provides an estimated Public Protection Classification (PPC) score based on data already in OpenFirehouse. It aggregates training hours, apparatus readiness, hydrant inspections, response times, and community risk reduction activities into the four major ISO/FSRS sections. Use it as a self-assessment tool to prepare for your department\'s next ISO evaluation.',
    features: [
      'Overall PPC score (Class 1–10) with section breakdown',
      'Four weighted sections: Emergency Communications (10%), Fire Company/Personnel (50%), Water Supply (40%), Community Risk Reduction (5.5%)',
      'Per-section metrics with target comparisons and color coding',
      'Member training hours summary with ISO credit targets (120h general, 240h officers)',
      'Year selector — review current year or compare against previous years',
      'JSON export for archival and reporting to city/county officials',
      'Improvement recommendations per section',
    ],
    sections: [
      {
        title: 'PPC Classification',
        type: 'indicators',
        items: [
          { label: 'Class 1 (90–100)', desc: 'Exceptional — meets or exceeds all ISO criteria.' },
          { label: 'Class 3–4 (60–79)', desc: 'Good — most career departments fall in this range.' },
          { label: 'Class 5–7 (30–59)', desc: 'Average — typical for well-run volunteer departments.' },
          { label: 'Class 8–10 (0–29)', desc: 'Below average — significant improvement areas exist.' },
        ],
      },
      {
        title: 'Data Sources',
        type: 'text',
        content: 'The ISO report pulls data from: Members (training hours, certifications), Apparatus (in-service count, pump test status), Maintenance (scheduled vs. overdue), Incidents (response times, volume), Hydrants (flow tests, inspection status), Pre-Plans (coverage of commercial properties), Fire Inspections (occupancy coverage), Drills (frequency and participation), and Community Risk Reduction visits.',
      },
    ],
    tips: [
      'Run the ISO report quarterly to track your department\'s progress toward a better PPC classification.',
      'Focus on the section with the lowest percentage first — that\'s where the biggest score improvement is available.',
      'Training hours are the single biggest factor in the Fire Company/Personnel section. Encourage members to log all training, including outside courses.',
      'Hydrant inspections and flow tests directly impact the Water Supply score. Schedule annual hydrant inspections to keep this section strong.',
    ],
    howTo: [
      { step: 'Open ISO Grading Report', detail: 'Navigate to Administration → ISO Grading Report in the sidebar.' },
      { step: 'Review overall score', detail: 'The hero card shows your estimated PPC classification and overall weighted score out of 100.' },
      { step: 'Expand section details', detail: 'Click any section card to see individual metrics, target comparisons, and improvement recommendations.' },
      { step: 'Export for records', detail: 'Click Export to download the report as JSON for archival or sharing with officials.' },
    ],
    related: ['Training Management', 'Apparatus Tracker', 'Hydrant Management', 'Fire Inspections', 'Station Settings'],
  },

  // ── Fire Inspections ───────────────────────────────────────────────────────
  inspections: {
    name: 'Fire Inspections & Permits',
    group: 'Operations',
    overview: 'Fire Inspections manages the inspection lifecycle for properties in your jurisdiction — annual inspections, follow-up visits, violation tracking, and permit issuance. Tier II and HazMat properties are flagged automatically.',
    features: [
      'Property registry with occupancy type, building details, and hazmat flags',
      'Inspection records per property: type, result, violations found',
      'Violation tracking with code, status, and resolution dates',
      'Permit management: occupancy, special event, hazmat, fire alarm, and more',
      'Alerts for open violations, expired permits, and permits due within 90 days',
      'Officer+ access required for all inspection and permit functions',
    ],
    sections: [
      {
        title: 'Inspection Results',
        type: 'indicators',
        items: [
          { label: 'Passed (green)', desc: 'No violations found. Property is compliant.' },
          { label: 'Passed w/ Conditions (amber)', desc: 'Minor issues noted. Follow-up recommended but property may operate.' },
          { label: 'Failed (red)', desc: 'Violations found that must be corrected. Follow-up inspection required.' },
          { label: 'Incomplete (gray)', desc: 'Inspection was started but not completed — reschedule.' },
        ],
      },
      {
        title: 'Property Flags',
        type: 'indicators',
        items: [
          { label: 'HazMat / Tier II (red badge)', desc: 'Property stores or uses hazardous materials at reportable quantities. Requires SARA Title III Tier II reporting.' },
          { label: 'No Sprinkler System (amber badge)', desc: 'Building lacks a suppression system — noted for pre-plan and firefighting strategy purposes.' },
        ],
      },
      {
        title: 'Permit Types',
        type: 'fields',
        items: [
          { name: 'Occupancy Permit', desc: 'Initial permit for a new occupant or change of use.' },
          { name: 'Special Event Permit', desc: 'Temporary permit for an event that exceeds normal occupancy or involves open flame.' },
          { name: 'HazMat Storage Permit', desc: 'Required for facilities storing hazardous materials above threshold quantities.' },
          { name: 'Fire Alarm / Suppression', desc: 'Installation, modification, or testing of fire alarm or suppression systems.' },
          { name: 'Tent / Temporary Structure', desc: 'Permit for large temporary structures used for events.' },
        ],
      },
      {
        title: 'Violation Codes',
        type: 'text',
        content: 'Violations are categorized by system: Egress (E-codes), Fire Protection (FP-codes), Combustibles (C-codes), Electrical (EL-codes), Administrative (A-codes), and HazMat (HM-codes). Each code maps to a standard fire code section for easy documentation and citation.',
      },
      {
        title: 'Planning Inspections & Follow-Ups',
        type: 'text',
        content: 'The dashboard shows statistics on open violations, expired permits, and permits due within 90 days. Use these to prioritize your inspection schedule. Schedule follow-up visits 30 days after finding violations — the system reminds you if follow-ups are overdue.' },
      {
        title: 'Inspections for Tier II & HazMat Properties',
        type: 'text',
        content: 'Properties that store hazardous materials above reportable thresholds are automatically flagged as Tier II / HazMat. These require annual inspection and SARA Title III Tier II reporting. The property registry highlights these properties in red for easy identification.' },
    ],
    tips: [
      'The dashboard stat cards show open violations and expiring permits at a glance — review these before planning your weekly inspection schedule.',
      'Permit expiration alerts appear in Notifications 90 days before the expiry date. Don\'t wait for the alert — proactive renewal is faster for both you and the property owner.',
    ],
    howTo: [
      { step: 'Click + New Inspection', detail: 'Open a new inspection from the top right. Select the property and inspection type (Annual, Follow-up, Special Permit, etc.).' },
      { step: 'Document property basics', detail: 'Confirm address, occupancy type, square footage, and occupant contact info. The system pre-fills if this property has been inspected before.' },
      { step: 'Log violations', detail: 'Check off violations found (or note none if the property passed). For each violation, select the code, assign a deadline for correction, and add notes.' },
      { step: 'Flag Tier II properties', detail: 'If the property stores hazardous materials above reportable thresholds, the system flags it automatically. Ensure annual inspection compliance.' },
      { step: 'Schedule follow-up', detail: 'Set a follow-up inspection date 30 days out. Click Complete. The follow-up reminder will appear in your schedule.' },
    ],
    related: ['Pre-Incident Plans', 'Hydrant Management', 'Notifications', 'Community Risk Reduction'],
  },

  // ── SOG Library ────────────────────────────────────────────────────────────
  sogs: {
    name: 'SOG Library',
    group: 'Administration',
    overview: 'The SOG Library is the central repository for all department Standard Operating Guidelines, policies, and procedures. Every member can read SOGs; only officers and chiefs can create, edit, or retire them.',
    features: [
      'Category-based organization: Operations, Safety, Administrative, EMS, Training, and more',
      'Version tracking: version number, effective date, review date, approving officer',
      'Full-text search across all SOG titles and content',
      'Tag system for cross-category linking (e.g., "mayday", "haz-mat", "accountability")',
      '90-day review alert: SOGs approaching review date are flagged',
      'Retired SOGs are archived — hidden from active view but retained for reference',
    ],
    sections: [
      {
        title: 'SOG Status',
        type: 'indicators',
        items: [
          { label: 'Active (green)', desc: 'Current, approved SOG. This is the version members should follow.' },
          { label: 'Due Soon (amber)', desc: 'Review date is within 90 days. Assign a reviewing officer.' },
          { label: 'Overdue (red)', desc: 'Review date has passed without a completed review. Escalate to the chief.' },
          { label: 'Draft (gray)', desc: 'SOG is being written or revised. Not yet visible to members.' },
          { label: 'Retired (dark gray)', desc: 'SOG is no longer in effect. Viewable by officers for historical reference.' },
        ],
      },
      {
        title: 'Key Fields',
        type: 'fields',
        items: [
          { name: 'SOG Number', desc: 'Your department\'s internal numbering convention (e.g., OPS-001, ADMIN-012).' },
          { name: 'Version', desc: 'Semantic version number (e.g., 1.0, 2.3). Increment minor for edits, major for rewrites.' },
          { name: 'Effective Date', desc: 'Date the current version took effect.' },
          { name: 'Review Date', desc: 'Scheduled next review — typically 1–3 years from effective date.' },
          { name: 'Approving Officer', desc: 'Chief or designated officer who approved the current version.' },
          { name: 'Category / Tags', desc: 'Classification for filtering and cross-reference searching.' },
        ],
      },
      {
        title: 'Creating & Updating SOGs',
        type: 'text',
        content: 'Click + New SOG to create a new procedure. Assign a SOG number (e.g., OPS-015), category (Operations, Safety, Administrative, EMS, Training), and version (start with 1.0). Set an effective date and next review date (usually 1–3 years out). Write the SOG content, add tags for cross-referencing, and submit for approval.' },
      {
        title: 'Version Control & History',
        type: 'text',
        content: 'When you update a SOG, increment the version number (1.0 → 1.1 for minor edits, 1.0 → 2.0 for major rewrites). The previous version is automatically archived in the history view — officers can reference old versions if needed. The effective date updates to today and the review date extends forward.' },
    ],
    tips: [
      'When updating a SOG, increment the version number before publishing. The previous version is automatically retained in the history view.',
      'Use tags liberally — a Mayday SOG tagged with "RIT", "accountability", and "rapid intervention" shows up in searches for any of those terms.',
    ],
    howTo: [
      { step: 'Click + New SOG', detail: 'Open the SOG creation form from the top right. Enter a SOG number and category (Operations, Safety, Admin, EMS, Training).' },
      { step: 'Set dates and approval', detail: 'Set the effective date (usually today), next review date (1–3 years out), and who is approving this version.' },
      { step: 'Write the content', detail: 'Compose the procedure in the Content field. Be detailed and specific — procedures are referenced on emergency calls.' },
      { step: 'Add tags', detail: 'Tag the SOG for cross-referencing. A Mayday SOG tagged "RIT", "accountability", "rapid-intervention" is searchable by all those terms.' },
      { step: 'Submit for approval', detail: 'Click Submit. Once approved by a chief or officer, the SOG becomes active. The previous version is automatically archived.' },
    ],
    related: ['Member Roster', 'Station Settings', 'Training', 'Notifications'],
  },

  // ── Budget & Finance ───────────────────────────────────────────────────────
  budget: {
    name: 'Budget & Finance',
    group: 'Administration',
    overview: 'The Budget & Finance module tracks the department\'s budget lines against actual expenditures. Only the Chief has access. Progress bars give an at-a-glance view of spending by category, with amber and red warning thresholds.',
    features: [
      'Budget line creation: amount budgeted, category, fiscal year',
      'Transaction ledger: log individual expenditures against budget lines',
      'Progress bar per category: green → amber at 70% → red at 90%',
      'Filter transactions by type: Equipment, Maintenance, Training, Administrative, Other',
      'YTD totals and remaining balance per line item',
      'Chief-only access for all financial data',
    ],
    sections: [
      {
        title: 'Budget Progress Colors',
        type: 'indicators',
        items: [
          { label: 'Green (0–69% used)', desc: 'Spending is within comfortable range for the period.' },
          { label: 'Amber (70–89% used)', desc: 'Approaching budget limit. Review upcoming expenditures.' },
          { label: 'Red (90–100%+ used)', desc: 'At or over budget. No additional expenditures without chief authorization or budget amendment.' },
        ],
      },
      {
        title: 'Key Fields',
        type: 'fields',
        items: [
          { name: 'Budget Line', desc: 'Named budget category (e.g., Apparatus Fuel, Training & Certifications, PPE).' },
          { name: 'Budgeted Amount', desc: 'Total approved amount for this line in the current fiscal year.' },
          { name: 'Transaction Date', desc: 'Date the expenditure occurred.' },
          { name: 'Vendor / Description', desc: 'Payee name and brief description of the purchase.' },
          { name: 'Amount', desc: 'Dollar amount of the transaction — deducted from the budget line balance.' },
          { name: 'Type', desc: 'Transaction category: Equipment, Maintenance, Training, Administrative, or Other.' },
        ],
      },
      {
        title: 'Creating Budget Lines & Logging Transactions',
        type: 'text',
        content: 'Click + New Budget Line to add a category for the fiscal year. Set the name (e.g., "Apparatus Fuel & Maintenance") and total budgeted amount. Then click + New Transaction to log individual expenditures against that line. Each transaction shows a progress bar: green (0–69%), amber (70–89%), or red (90%+).' },
      {
        title: 'Monitoring Budget Utilization',
        type: 'text',
        content: 'The progress bar for each budget line gives a clear visual of spending. When a line reaches 70%, it turns amber as a warning. At 90%, it turns red and requires chief approval for additional spending. The system can automatically create a Warning alert at 70% and a Critical alert at 90%.' },
    ],
    tips: [
      'Link maintenance work orders to budget line items — the total cost calculated in the Maintenance Log can be logged as a single transaction here.',
      'The fiscal year start date is set in Station Settings. All YTD calculations use this date, not the calendar year.',
    ],
    howTo: [
      { step: 'Click + New Budget Line', detail: 'Create a named budget category for the fiscal year with a total budgeted amount.' },
      { step: 'Log transactions', detail: 'Click + New Transaction to log individual expenditures. Specify vendor, date, amount, and transaction type (Equipment, Maintenance, Training, etc.).' },
      { step: 'Watch the progress bars', detail: 'Each budget line has a progress bar: green (safe), amber (70%+ — approaching limit), red (90%+ — at limit).' },
      { step: 'Link to maintenance work orders', detail: 'When a maintenance work order is completed, log its total cost as a transaction against the Maintenance budget line.' },
      { step: 'Review remaining balance', detail: 'The balance shows how much is left to spend. Red lines require chief approval before additional expenditures.' },
    ],
    related: ['Maintenance Log', 'Grant Management', 'Station Settings', 'Payroll & Stipends'],
  },

  // ── Asset & Inventory ──────────────────────────────────────────────────────
  assets: {
    name: 'Asset & Inventory',
    group: 'Administration',
    overview: 'Asset & Inventory tracks all department equipment, supplies, and gear — from SCBA bottles to office supplies. Reorder flags alert officers when stock falls below minimum threshold.',
    features: [
      'Item registry: name, category, quantity, location, and min/max thresholds',
      'Reorder flag: auto-triggered when quantity drops below minimum',
      'Check-in / check-out log for assigned equipment',
      'Category filter: PPE, Rescue Tools, EMS Supplies, Station Supplies, and more',
      'Officer+ required to add or edit items and log transactions',
      'Asset value tracking for insurance and replacement planning',
    ],
    sections: [
      {
        title: 'Reorder Status',
        type: 'indicators',
        items: [
          { label: 'Adequate (green)', desc: 'Quantity is at or above the minimum threshold.' },
          { label: 'Low (amber)', desc: 'Quantity has dropped below minimum. Order should be initiated.' },
          { label: 'Critical (red)', desc: 'Quantity is at zero or significantly below minimum. Immediate reorder required.' },
        ],
      },
      {
        title: 'Key Fields',
        type: 'fields',
        items: [
          { name: 'Item Name / SKU', desc: 'Descriptive name and optional part number or SKU for ordering.' },
          { name: 'Category', desc: 'Equipment classification for filtering and reporting.' },
          { name: 'Location', desc: 'Where the item is stored — station, apparatus, or member-assigned.' },
          { name: 'Quantity on Hand', desc: 'Current stock count.' },
          { name: 'Minimum Quantity', desc: 'Reorder trigger threshold.' },
          { name: 'Unit Value', desc: 'Per-unit replacement cost — used for insurance and budget planning.' },
        ],
      },
      {
        title: 'Adding Items & Setting Reorder Thresholds',
        type: 'text',
        content: 'Click + New Item to add an asset or supply to the inventory. Enter the item name/SKU, category (PPE, Rescue Tools, EMS Supplies, etc.), location (station, apparatus, member), current quantity, and minimum quantity. When quantity falls below the minimum, a Low or Critical alert surfaces in Notifications.' },
      {
        title: 'Check-In / Check-Out & Tracking',
        type: 'text',
        content: 'For assigned equipment (hand tools, SCBA bottles, etc.), use the Check In/Out log to track who has what. This creates an audit trail for custody of specialized equipment. Updates to quantity on hand trigger automatic reorder alerts when stock drops below the minimum threshold.' },
    ],
    tips: [
      'Set minimum quantities conservatively — you want a reorder alert before you\'re out, not when you\'re already out.',
      'SCBA bottles and air pack components should be tracked individually with serial numbers for NFPA compliance documentation.',
    ],
    howTo: [
      { step: 'Click + New Item', detail: 'Open the item creation form and enter a descriptive name, SKU, and category (PPE, Rescue, EMS, Station Supplies).' },
      { step: 'Set location & quantity', detail: 'Select where the item is stored (station, apparatus, or member-assigned) and enter the current quantity on hand.' },
      { step: 'Set minimum threshold', detail: 'Enter the minimum quantity needed before a reorder alert fires. Be conservative — trigger the alert before stock runs out.' },
      { step: 'Set unit value', detail: 'Enter the per-unit cost for insurance and budget planning purposes.' },
      { step: 'Monitor reorder alerts', detail: 'When quantity drops below minimum, a Low (amber) or Critical (red) alert appears in Notifications. Click to review and reorder.' },
    ],
    related: ['Maintenance Log', 'Budget & Finance', 'Notifications', 'Station Settings'],
  },

  // ── Reports & Export ───────────────────────────────────────────────────────
  reports: {
    name: 'Reports & Export',
    group: 'Administration',
    overview: 'Reports & Export has two sections: Bulletin Board & Station Prints — print-ready documents formatted for posting at the station — and Data Reports & Exports — CSV and PDF data exports for grant applications, ISO documentation, state reporting, and board presentations. Officer+ access required.',
    features: [
      'Member Contact Directory — portrait, sorted by rank, marked Confidential',
      'Monthly Duty Schedule — landscape calendar grid with shift colors and crew names',
      'Community Events Calendar — next 6 weeks, color-coded by event type',
      'Apparatus Status Board — landscape fleet overview, overdue service flagged',
      'Six data exports (CSV + PDF): Member Roster, Apparatus, Incidents, Training, Mutual Aid, Schedule',
      'Date range filter for all time-sensitive data exports',
    ],
    sections: [
      {
        title: 'Bulletin Board Prints',
        type: 'fields',
        items: [
          { name: 'Member Contact Directory', desc: 'Portrait layout. All members sorted by rank with phone, email, and badge number. Stamped "Confidential — Internal Use Only." Opens in a print preview tab.' },
          { name: 'Monthly Duty Schedule', desc: 'Landscape calendar grid. Use the month picker (‹ ›) to select a month before printing. Shift types are color-coded; today\'s date is highlighted.' },
          { name: 'Community Events Calendar', desc: 'Portrait layout. Shows all events in the next 6 weeks with type pills, time, and location. Suitable for public bulletin board posting.' },
          { name: 'Apparatus Status Board', desc: 'Landscape layout. All fleet units with status badges, mileage, last service, and next service due. Units with overdue service are flagged in red.' },
        ],
      },
      {
        title: 'Data Exports — Available Reports',
        type: 'fields',
        items: [
          { name: 'Member Roster', desc: 'All personnel with rank, role, status, badge number, phone, email, and certifications.' },
          { name: 'Apparatus Status', desc: 'Full fleet with service history, mileage, and operational status.' },
          { name: 'Incident Log', desc: 'All incidents with units, personnel, alarm levels, and dispositions.' },
          { name: 'Training', desc: 'Completions, certifications, expiry dates, and hours logged.' },
          { name: 'Mutual Aid Log', desc: 'Aid given and received with partner departments and personnel counts.' },
          { name: 'Duty Schedule', desc: 'All scheduled shifts with crew assignments and coverage.' },
        ],
      },
      {
        title: 'Export Formats',
        type: 'text',
        content: 'CSV files open in Excel, Google Sheets, or Numbers. PDF files are formatted landscape reports with your station name, department, and date — ready to print or email. Bulletin Board prints open in a new browser tab and use your browser\'s built-in print dialog. For best color fidelity, enable "Background graphics" in the print dialog.',
      },
    ],
    tips: [
      'For the best-looking bulletin board prints, use "Print background graphics" in your browser\'s print dialog — otherwise the colored headers and status pills will not print.',
      'Grant applications often ask for a specific date range. Use the date filter to scope the Incident Log or Training module to a fiscal year or grant period before exporting.',
      'The Member Contact Directory is marked Confidential. Post it in the officer\'s office or crew room — not in publicly accessible areas.',
    ],
    howTo: [
      { step: 'Navigate to Reports & Export', detail: 'Go to the Administration section and click Reports & Export. Two tabs: Bulletin Board Prints and Data Exports.' },
      { step: 'Generate bulletin board prints', detail: 'Click a print name: Member Contact Directory, Monthly Duty Schedule, Community Events Calendar, or Apparatus Status Board. Each opens a print preview.' },
      { step: 'Use the month picker', detail: 'For the Duty Schedule, use the month picker (< >) before printing to select which month to display.' },
      { step: 'Export data as CSV/PDF', detail: 'Go to the Data Exports tab. Select a report (Member Roster, Apparatus, Incidents, Training, Mutual Aid, Schedule) and click Export.' },
      { step: 'Filter by date range', detail: 'For time-sensitive exports, set a date range before exporting (e.g., fiscal year, grant period, or calendar year). Click Export, then open/save the file.' },
    ],
    related: ['Incident Log', 'Training', 'Member Roster', 'Budget & Finance'],
  },

  // ── AI Scheduling ──────────────────────────────────────────────────────────
  ai: {
    name: 'AI Scheduling',
    group: 'Tools',
    overview: 'AI Scheduling uses member availability, certification levels, and historical response patterns to suggest balanced duty rosters. Officers review and adjust suggestions before committing them to the Duty Schedule. Officer+ access required.',
    features: [
      'Generates weekly roster suggestions based on member data',
      'Balances IC coverage, driver certification, and minimum staffing requirements',
      'Considers member availability flags and LOA status',
      'Highlights scheduling gaps and conflicts in the suggested roster',
      'One-click transfer to the Duty Schedule for officer review and editing',
      'Suggestions are advisory — nothing is committed without officer approval',
    ],
    sections: [
      {
        title: 'How Suggestions Are Generated',
        type: 'text',
        content: 'The scheduler considers: active member list (excluding LOA/Inactive), certification level per member (IC-qualified, driver-certified, FF, EMS), any manually flagged unavailability dates, and historical call volume by day of week to weight shift importance. The result is a draft roster that meets minimum staffing across all roles.',
      },
      {
        title: 'Suggestion Confidence Indicators',
        type: 'indicators',
        items: [
          { label: 'High confidence (green)', desc: 'All required roles are covered with qualified, available members.' },
          { label: 'Medium confidence (amber)', desc: 'All roles covered but with limited depth — a callout could leave a gap.' },
          { label: 'Low confidence (red)', desc: 'At least one required role is understaffed. Manual review and adjustment required before publishing.' },
        ],
      },
      {
        title: 'Running the Scheduler & Reviewing Suggestions',
        type: 'text',
        content: 'Click Generate Roster to start the AI scheduler. Select the week to schedule (defaults to next week). The scheduler analyzes member availability, certifications, and call volume patterns, then generates a complete suggested roster. A confidence badge (green/amber/red) indicates how well the schedule fills all required roles.' },
      {
        title: 'Adjusting & Publishing Suggestions',
        type: 'text',
        content: 'Review the suggested roster and make manual adjustments as needed — drag members between shifts or swap roles. Once you are satisfied, click Copy to Duty Schedule. The suggestions are pasted into the Duty Schedule module as draft shifts, where you can further refine or publish them directly.' },
    ],
    tips: [
      'Keep member availability flags current in the Member Roster — stale availability data produces poor suggestions.',
      'AI suggestions work best as a starting point, not a finished product. Officers should always review and adjust before publishing.',
    ],
    howTo: [
      { step: 'Click Generate Roster', detail: 'Open the AI Scheduling view and click Generate Roster to start the scheduler.' },
      { step: 'Select the week', detail: 'Choose which week to schedule (defaults to next week). The scheduler will generate a full 7-day roster.' },
      { step: 'Review confidence', detail: 'Look at the confidence badge (green/amber/red) — it shows whether all required roles are adequately covered.' },
      { step: 'Review role coverage', detail: 'Scan the suggested roster for any red roles (understaffed). Identify gaps and adjust if needed.' },
      { step: 'Make adjustments', detail: 'Drag members between shifts or manually swap roles. Once satisfied, click Copy to Duty Schedule.' },
    ],
    related: ['Duty Schedule', 'Member Roster', 'Training', 'Event Calendar'],
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  alerts: {
    name: 'Notifications',
    group: 'General',
    overview: 'The Notifications module is the central alert center for the department. It surfaces time-sensitive items from every other module so nothing falls through the cracks.',
    features: [
      'Three severity levels: Critical, Warning, and Info',
      'Click any alert to navigate directly to the affected record',
      'Badge count in the header shows Critical + Warning only',
      'Mark individual alerts as acknowledged or dismiss Info notices',
      'Alerts auto-generated by: expiring certs, overdue physicals, OOS apparatus, budget thresholds, open violations, and more',
    ],
    sections: [
      {
        title: 'Alert Severity',
        type: 'indicators',
        items: [
          { label: 'Critical (red)', desc: 'Requires immediate action. Examples: apparatus OOS with no backup, expired cert for interior operations, budget line at 100%.' },
          { label: 'Warning (amber)', desc: 'Requires attention within days. Examples: cert expiring within 30 days, permit expiring within 90 days, low inventory item.' },
          { label: 'Info (blue)', desc: 'Informational — no action required but worth reviewing. Examples: upcoming events, scheduled maintenance, new SOG published.' },
        ],
      },
      {
        title: 'Alert Sources',
        type: 'fields',
        items: [
          { name: 'Training', desc: 'Certification expiring within 90 days (Warning) or expired (Critical).' },
          { name: 'Health & Wellness', desc: 'Physical or SCBA fit test due soon or overdue.' },
          { name: 'Apparatus Tracker', desc: 'Unit changed to Out of Service status.' },
          { name: 'Maintenance Log', desc: 'Emergency priority work order opened.' },
          { name: 'Budget & Finance', desc: 'Budget line reaches 70% (Warning) or 90% (Critical) utilization.' },
          { name: 'Fire Inspections', desc: 'Open violation unresolved past follow-up date, or permit expiring.' },
          { name: 'SOG Library', desc: 'SOG review date within 90 days.' },
          { name: 'Inspection Checklists', desc: 'Open deficiency not resolved within 7 days.' },
        ],
      },
    ],
    tips: [
      'The badge count only shows Critical and Warning — if the badge reads 0, check the Info tab for informational notices.',
      'Clicking an alert takes you directly to the specific record. You don\'t need to navigate to the module separately.',
    ],
    howTo: [
      { step: 'Check the notification badge', detail: 'The bell icon in the header shows a count of Critical and Warning alerts only. Click to open the Notifications module.' },
      { step: 'Review alert severity', detail: 'Critical (red) alerts require immediate action. Warning (amber) alerts need attention within days. Info (blue) are informational only.' },
      { step: 'Click an alert', detail: 'Any alert name is a clickable link. Click it to jump directly to the affected record — no need to navigate manually.' },
      { step: 'Mark alerts acknowledged', detail: 'Click the checkmark icon next to an alert to mark it acknowledged. It will stay in the list but appears dimmed.' },
      { step: 'Dismiss info notices', detail: 'Info notices can be dismissed by clicking the X. Critical and Warning alerts cannot be dismissed — only acknowledged.' },
    ],
    related: ['Dashboard', 'Station Settings', 'Training', 'Health & Wellness'],
  },

  // ── Station Settings ───────────────────────────────────────────────────────
  settings: {
    name: 'Station Settings',
    group: 'General',
    overview: 'Station Settings is the administrative configuration panel for the department\'s OpenFirehouse installation. Only the Chief has access. Changes here affect system-wide behavior, including TV display setup for all supported devices.',
    features: [
      'Department name, address, and contact information',
      'FDID configuration for NFIRS reporting',
      'Fiscal year start date (affects all YTD calculations)',
      'Public Dashboard display settings',
      'Alert threshold customization',
      'TV Display setup with PIN-based access for 7 device types: Apple TV, Raspberry Pi, Fire TV Stick, Chromecast, Smart TV browser, old laptop/PC, and wireless display adapters',
      'Career & staffing configuration (career vs. volunteer, FLSA settings)',
      'System version and build information',
    ],
    sections: [
      {
        title: 'Key Configuration Items',
        type: 'fields',
        items: [
          { name: 'Department Name', desc: 'Appears in all report headers and the Public Dashboard.' },
          { name: 'FDID', desc: 'Fire Department ID assigned by your state. Required for NFIRS reports.' },
          { name: 'Fiscal Year Start', desc: 'Month and day the department\'s fiscal year begins. Affects Budget, Hours, and all YTD calculations.' },
          { name: 'Public Dashboard Refresh', desc: 'How often the public view auto-refreshes (default: 5 minutes).' },
          { name: 'Physical Due Interval', desc: 'How frequently NFPA 1582 physicals are required (typically 1 year for most age groups, 2 years for others).' },
          { name: 'Minimum Staffing', desc: 'Minimum number of members required per shift before a Warning alert fires.' },
        ],
      },
      {
        title: 'TV Display Setup',
        type: 'text',
        content: 'The TV Display section generates a unique PIN and URL for your station\'s wall-mounted TV. Open this URL on any device with a web browser — it shows live crew status, apparatus readiness, today\'s schedule, weather, AI briefing insights, and readiness scores. When an incident goes active on the Command Board, the display automatically switches to Incident Mode with address, elapsed time, and wind conditions. The display requires zero interaction and auto-refreshes all data. Detailed setup guides for every supported device type are included directly in the settings panel.',
      },
      {
        title: 'Supported TV Devices',
        type: 'fields',
        items: [
          { name: 'Raspberry Pi (Recommended)', desc: '$35–$80. Best for dedicated 24/7 station displays. Runs Chromium in kiosk mode, auto-boots after power outages, silent operation. Ideal for firehouses.' },
          { name: 'Amazon Fire TV Stick', desc: '$30–$50. Easy plug-and-play. Use Amazon Silk Browser or install Fully Kiosk Browser ($7.90) for 24/7 reliability with auto-restart and screen dimming.' },
          { name: 'Apple TV', desc: '$129–$199. Best for Apple-ecosystem stations. Open the TV URL in Safari, use Guided Access to lock it in place. Set sleep to Never.' },
          { name: 'Chromecast with Google TV', desc: '$30–$50. Sideload a browser (TV Bro or Chrome) for direct display, or cast a Chrome tab from a station computer.' },
          { name: 'Smart TV Built-in Browser', desc: 'Free — no extra hardware. Works on Samsung, LG, Sony, Vizio, Hisense, TCL (2018+). Adequate for shift-based viewing but may not be reliable for 24/7 use.' },
          { name: 'Old Laptop or Mini PC', desc: 'Free if you have one. Run Chrome in kiosk mode (--kiosk flag), set to auto-login and auto-start. Connect via HDMI. Works on Windows, Mac, or Linux.' },
          { name: 'Wireless Display Adapter (Miracast/AirPlay)', desc: '$20–$40. Mirror from a phone, tablet, or computer to any HDMI TV. Best for temporary displays at training, open houses, or events — not for 24/7 use.' },
        ],
      },
    ],
    tips: [
      'Set your FDID before creating NFIRS reports — it\'s required on every report and is not retroactively applied to existing records.',
      'The fiscal year start date should match your municipality\'s fiscal calendar, not the calendar year, unless your department operates on a January–December budget.',
      'For TV displays: the Raspberry Pi is the best value — $35 for a dedicated, silent, auto-recovering station display. Many fire departments across the country use them.',
      'Keep your TV PIN private. Anyone with the PIN and URL can see the display (but cannot modify any data or access the main app).',
      'If your TV display freezes or goes blank, check the device\'s sleep/screensaver settings first. Most issues are caused by the device going to sleep.',
      'The TV display supports both Standby mode (daily operations) and Incident mode (auto-triggered by Command Board). No manual switching needed.',
    ],
    howTo: [
      { step: 'Open Station Settings (Chief only)', detail: 'Navigate to Station Settings. Only the Chief can modify these settings — they affect system-wide behavior.' },
      { step: 'Set department basics', detail: 'Enter your department name, address, phone, and email. These appear in report headers and on the Public Dashboard.' },
      { step: 'Configure FDID', detail: 'Enter your Fire Department ID assigned by your state. This is required for NFIRS reports and should be set before creating any NFIRS submissions.' },
      { step: 'Set fiscal year', detail: 'Choose the month and day your department\'s fiscal year begins. All YTD calculations and budget periods use this date, not the calendar year.' },
      { step: 'Configure alerts & thresholds', detail: 'Set minimum staffing requirements (for shift alerts), physical exam interval (NFPA 1582), and budget alert thresholds (70% and 90%).' },
      { step: 'Set up TV Display', detail: 'Scroll to the TV Display Setup section. Copy the TV URL (includes your unique PIN). Open this URL on your chosen device — see the setup guide for each device type. The display starts working immediately.' },
      { step: 'Regenerate TV PIN if compromised', detail: 'Click "New PIN" to generate a fresh PIN. This immediately invalidates the old URL — update the bookmark on your TV device.' },
    ],
    related: ['Budget & Finance', 'Dashboard', 'Notifications', 'Member Roster', 'Dispatch & Command'],
  },

  // ── Hydrant Management ─────────────────────────────────────────────────────
  hydrants: {
    name: 'Hydrant Management',
    group: 'Operations',
    overview: 'Hydrant Management is your department\'s water supply inventory — every hydrant, dry hydrant, and static source in the district, with flow test records, ISO classification, and maintenance status. Accurate hydrant data is one of the highest-impact factors in your ISO rating.',
    features: [
      'Complete hydrant registry: location, type, specifications, and ownership',
      'ISO flow classification based on tested GPM at 20 PSI residual',
      'Annual flow test records: static pressure, residual pressure, and GPM',
      'Status tracking: In Service, Out of Service, Needs Inspection',
      'Test overdue alerts — flags hydrants past their annual test due date',
      'Dry hydrant and static water source support',
      'OOS warning banner with mutual aid notification reminder',
      'Officer+ access required',
    ],
    sections: [
      {
        title: 'ISO Flow Classes',
        type: 'indicators',
        items: [
          { label: 'Class AA (blue) — ≥ 1,500 GPM', desc: 'Highest flow capacity. Ideal for commercial and industrial districts.' },
          { label: 'Class A (green) — 1,000–1,499 GPM', desc: 'Strong residential and light commercial supply.' },
          { label: 'Class B (amber) — 500–999 GPM', desc: 'Adequate for residential areas. May limit suppression options on larger fires.' },
          { label: 'Class C (red) — 250–499 GPM', desc: 'Marginal supply. Note in pre-incident plans for affected properties.' },
          { label: 'Unrated (gray) — < 250 GPM or untested', desc: 'Hydrant has not been flow tested or is below minimum usable threshold.' },
        ],
      },
      {
        title: 'Flow Test Fields',
        type: 'fields',
        items: [
          { name: 'Static Pressure (PSI)', desc: 'System pressure with no water flowing — baseline reading.' },
          { name: 'Residual Pressure (PSI)', desc: 'System pressure while flowing at test rate. ISO uses 20 PSI residual as the standard.' },
          { name: 'Flow Rate (GPM)', desc: 'Measured gallons per minute at 20 PSI residual. Drives the ISO class assignment.' },
          { name: 'Tested By', desc: 'Inspector or officer who conducted the flow test.' },
          { name: 'Next Test Due', desc: 'Annual test schedule date. Overdue hydrants are flagged in red in the list and on the Dashboard.' },
        ],
      },
      {
        title: 'Hydrant Status',
        type: 'indicators',
        items: [
          { label: 'In Service (green)', desc: 'Fully operational. Available for suppression operations.' },
          { label: 'Needs Inspection (amber)', desc: 'Annual inspection or flow test is overdue. Schedule immediately.' },
          { label: 'Out of Service (red)', desc: 'Non-operational. Notify mutual aid partners and update pre-incident plans for the affected area.' },
        ],
      },
      {
        title: 'Adding Hydrants & Flow Test Records',
        type: 'text',
        content: 'Click + New Hydrant to register a hydrant or dry hydrant in your district. Enter the address/location, type (pressurized hydrant, dry hydrant, or static source), and initial status. Add a flow test record with static pressure, residual pressure at 20 PSI, and measured GPM. The system automatically assigns an ISO class (AA/A/B/C/Unrated) based on the GPM.' },
      {
        title: 'Flow Testing & ISO Rating Impact',
        type: 'text',
        content: 'ISO water supply is one of the highest-weighted factors in the Fire Suppression Rating Schedule. Hydrants with current, documented flow tests drive your ISO rating upward. Outdated or missing flow tests count against you. Schedule annual flow tests and enter results immediately — this is the single best investment in your ISO score.' },
    ],
    tips: [
      'Annual flow testing is the single most important input for ISO water supply scoring. Keep test dates current — outdated tests count against your rating.',
      'When a hydrant goes Out of Service, the system displays a banner reminding you to notify mutual aid. Update the pre-incident plan for every property within 1,000 feet.',
      'Dry hydrants should be included in the registry and flow-tested annually like pressurized hydrants. Note GPS coordinates in the Notes field for responding units.',
    ],
    howTo: [
      { step: 'Click + New Hydrant', detail: 'Open the hydrant registry form and enter the address or location (e.g., Main St @ Oak Ave).' },
      { step: 'Enter hydrant specs', detail: 'Set type (pressurized, dry hydrant, static source), any ID number painted on it, and owning agency (city, county, private).' },
      { step: 'Log a flow test', detail: 'Enter test date, static pressure (PSI), residual pressure (typically 20 PSI), and measured GPM at that residual. The ISO class auto-calculates.' },
      { step: 'Track test schedule', detail: 'Annual tests are required. The system flags overdue hydrants in amber (due soon) and red (overdue). Schedule proactively.' },
      { step: 'Note for responders', detail: 'For dry hydrants or static sources, add GPS coordinates and access instructions in the Notes field so crews can locate them during emergencies.' },
    ],
    related: ['Pre-Incident Plans', 'Fire Inspections', 'Incident Log', 'Notifications'],
  },

  // ── Drills & Courses ───────────────────────────────────────────────────────
  drills: {
    name: 'Drills & Courses',
    group: 'Operations',
    overview: 'Drills & Courses tracks all department training activity — from hands-on operational drills to formal certification courses. The ISO credit tracking, attendance rosters, and certification records in this module feed directly into annual reports and accreditation documentation.',
    features: [
      'Drills tab: log department-run drills with type, objectives, duration, and attendance',
      'Courses tab: log formal certification courses with provider, cost, and pass/fail results',
      'Attendance roster per drill with per-member pass/fail and optional score',
      'ISO training hour tracking — drills flagged for ISO credit are counted toward the YTD total',
      'Course enrollment and outcome tracking linked to member training records',
      'YTD stats: total drills, ISO hours, courses, and active member count',
      'All roles can view; officers can log and edit',
    ],
    sections: [
      {
        title: 'Drill vs. Course — When to Use Each',
        type: 'fields',
        items: [
          { name: 'Drill', desc: 'Department-run operational training event. Led by your own officers or a visiting instructor. Typically held at your station or training grounds. Examples: live fire, vehicle extrication, Mayday/RIT, water supply.' },
          { name: 'Course', desc: 'Formal external training leading to a certification or credential. Offered by a state fire academy, FEMA, or regional training consortium. Results in a certification that appears in the Training module.' },
        ],
      },
      {
        title: 'ISO Training Hour Credit',
        type: 'text',
        content: 'ISO evaluates training activity under Section 5 of the Fire Suppression Rating Schedule. Drills marked "Count toward ISO training hours" are included in the annual YTD total shown on the stats bar. The ISO target is typically 20 training hours per member per year. Use the Annual Report in Reports & Export to generate the ISO-formatted training summary.',
      },
      {
        title: 'Drill Types',
        type: 'fields',
        items: [
          { name: 'Structural Fire', desc: 'Attack, search, ventilation, and overhaul evolutions.' },
          { name: 'Vehicle Extrication', desc: 'Power tool operations, stabilization, and patient packaging.' },
          { name: 'Mayday / RIT', desc: 'Mayday radio procedures, LUNAR reporting, RIT pack deployment, drag rescue.' },
          { name: 'Water Supply', desc: 'Hydrant operations, tanker shuttle, drafting from static sources.' },
          { name: 'HazMat', desc: 'Awareness and operations level response procedures.' },
          { name: 'Driver/Operator', desc: 'Apparatus operation, pump operations, aerial if applicable.' },
          { name: 'Accountability / ICS', desc: 'Incident command structure, PAR, accountability systems.' },
        ],
      },
      {
        title: 'Attendance Results',
        type: 'indicators',
        items: [
          { label: 'Pass (green)', desc: 'Member attended and demonstrated competency in the drill objectives.' },
          { label: 'Fail (red)', desc: 'Member attended but did not meet the standard. Follow-up required.' },
          { label: 'Excused (blue)', desc: 'Member was absent for an approved reason. May need a makeup session.' },
          { label: 'Incomplete (gray)', desc: 'Member was present but did not complete all evolutions. Schedule a makeup.' },
        ],
      },
      {
        title: 'Logging Drills & ISO Training Hour Credit',
        type: 'text',
        content: 'Click + New Drill and select the drill type (Structural Fire, Vehicle Extrication, Mayday/RIT, Water Supply, HazMat, Driver/Operator, or Accountability/ICS). Enter the date, duration, objectives (specific skills trained), and whether to count it toward ISO training hours. Add attendees and mark each as Pass/Fail/Excused/Incomplete.' },
      {
        title: 'Creating Training Certifications from Courses',
        type: 'text',
        content: 'For formal courses (external providers, state academy, etc.), use the Courses tab instead. Log the course name, provider, completion date, and any certifications earned (Firefighter I/II, EMT, etc.). These certifications appear in the Training module and on member portals.' },
    ],
    tips: [
      'Log drills within 24 hours while attendance and results are fresh. It takes 2 minutes — the ISO documentation it generates is worth hours of paperwork later.',
      'Use the Objectives field to document what was trained on, not just the drill type. ISO auditors look for specificity: "Primary search in zero-visibility using TIC" is more defensible than "Structural fire drill."',
      'Course records with certifications earned are separate from drills — log them in the Courses tab so the certification shows up in that member\'s Training records.',
    ],
    howTo: [
      { step: 'Click + New Drill (or + New Course)', detail: 'Choose the Drills tab to log a department drill, or Courses tab to log external training.' },
      { step: 'For drills: select type & duration', detail: 'Pick the drill type (Structural Fire, Extrication, Mayday, etc.), date, and how many minutes it lasted.' },
      { step: 'Document objectives', detail: 'Describe specifically what was trained. "Primary search in zero-visibility with TIC" is better than "Structural fire drill" for ISO documentation.' },
      { step: 'Flag for ISO hours (optional)', detail: 'Check "Count toward ISO training hours" if this drill qualifies. The YTD total will include it.' },
      { step: 'Add attendees & results', detail: 'Click + Add Member for each attendee and mark them Pass/Fail/Excused/Incomplete. Save the drill.' },
    ],
    related: ['Training', 'Volunteer Hours', 'Member Portal', 'Event Calendar'],
  },

  // ── Station Daily Log ──────────────────────────────────────────────────────
  stationlog: {
    name: 'Station Daily Log',
    group: 'Operations',
    overview: 'The Station Daily Log is your shift-by-shift journal — a permanent record of who was at the station, what they did, and what condition the apparatus and station were in when each shift started and ended. ISO auditors and grant reviewers may request these records, and they\'re invaluable in the event of a liability claim.',
    features: [
      'Shift journal with timestamped event entries',
      'Apparatus status and station condition check tracking',
      'Member on-duty roster per shift',
      'Visitor log with name and purpose',
      'Officer-in-charge designation per entry',
    ],
    sections: [
      {
        title: 'Log Entry Fields',
        type: 'fields',
        items: [
          { name: 'Date', desc: 'The calendar date of the shift. One entry per shift per day is the norm.' },
          { name: 'Shift', desc: 'Day, Evening, or Night shift — or a custom label if your department uses A/B/C rotation.' },
          { name: 'Officer in Charge', desc: 'The ranked member responsible for the station that shift. This person signs off on the log.' },
          { name: 'Weather', desc: 'Brief notation of conditions at the start of shift — relevant for response planning and documentation.' },
          { name: 'Calls', desc: 'Number of emergency calls responded to during the shift. Cross-reference against Incident Log entries.' },
          { name: 'Apparatus Check', desc: 'Toggle on if all assigned apparatus were checked and found serviceable at shift start.' },
          { name: 'Station Check', desc: 'Toggle on if station housekeeping, safety systems, and facilities were verified.' },
        ],
      },
      {
        title: 'Event Log',
        type: 'text',
        content: 'Each shift log can contain multiple timestamped event entries — the equivalent of a traditional station journal. Common events include: station drills, equipment maintenance performed, visitors, station duties completed, apparatus defects noted, and any out-of-the-ordinary occurrences. Log entries with specific times create a defensible activity record.',
      },
      {
        title: 'Member Roster',
        type: 'text',
        content: 'Tag members who were on duty or checked in during the shift. This is separate from the Duty Schedule (which shows who is assigned) — the station log reflects who actually showed up. This information feeds volunteer hours tracking and ISO activity records.',
      },
      {
        title: 'Visitors',
        type: 'text',
        content: 'Record any non-member visitors — inspectors, contractors, mutual aid personnel, civic groups, or media. Include the visitor\'s name and purpose. This is required by some departments\' liability insurance and is good practice for all stations.',
      },
      {
        title: 'Creating Daily Log Entries',
        type: 'text',
        content: 'Click + New Shift Log at the start of each shift. Enter the date, shift name (Day/Evening/Night or A/B/C), and officer in charge. Check apparatus and station condition boxes if applicable. Throughout the shift, click + New Event to log timestamped entries: apparatus maintenance, training, visitors, drills, unusual occurrences.' },
      {
        title: 'Shift Sign-Off & Historical Record',
        type: 'text',
        content: 'At the end of the shift, the incoming officer or line officer reviews and signs off on the log. Once signed, the log is locked from editing but remains visible for historical reference. This creates a defensible activity record for ISO audits and liability claims.' },
    ],
    tips: [
      'Complete the log before the off-going officer leaves the station. A log filled out hours later is less defensible than one timestamped at shift end.',
      'Even on quiet nights, log the apparatus and station checks. "No calls, all apparatus checked, station secured" is a legitimate — and important — entry.',
      'Use the event log for defects: "Engine 1 wiper fluid low — topped off" or "Bay 3 overhead door slow — reported to maintenance." This creates a paper trail that protects the department.',
    ],
    howTo: [
      { step: 'Click + New Shift Log', detail: 'Open the shift log form at the start of a shift. Enter date, shift name, and officer in charge.' },
      { step: 'Log apparatus & station checks', detail: 'At shift start, confirm all assigned apparatus were checked and found serviceable. Check the boxes to document this.' },
      { step: 'Add timestamped events', detail: 'Throughout the shift, click + New Event to log maintenance performed, drills run, visitors, unusual occurrences, etc. Time and your name auto-fill.' },
      { step: 'Record calls', detail: 'Count the number of emergency calls responded to during the shift. Cross-reference with your incident log.' },
      { step: 'Sign off at shift end', detail: 'Before leaving, have the outgoing officer sign the log. Once signed, it\'s locked from editing and becomes a permanent record.' },
    ],
    related: ['Incident Log', 'Inspection Checklists', 'Maintenance Log', 'Event Calendar'],
  },

  // ── Grant Management ───────────────────────────────────────────────────────
  grants: {
    name: 'Grant Management',
    group: 'Administration',
    overview: 'Grant Management tracks the full lifecycle of every grant your department applies for and receives — from planning and application through award, spending, and closeout. Federal grants like AFG require meticulous documentation; this module keeps it organized and sends you reminders before reporting deadlines.',
    features: [
      'Full lifecycle tracking: Planning → Submitted → Awarded → Active → Closed',
      'Financial tracking with award amount, spent, and remaining',
      'Reporting deadline calendar with overdue / due-soon alerts',
      'Expenditure log with line-item detail',
      'Status filter pills for quick views by stage',
      'Upcoming deadlines banner (next 90 days)',
    ],
    sections: [
      {
        title: 'Grant Statuses',
        type: 'indicators',
        items: [
          { label: 'Planning', desc: 'You are preparing the application but have not yet submitted. Use this to capture the grant details early so nothing is forgotten.' },
          { label: 'Submitted', desc: 'Application has been submitted and you are awaiting a decision. Note the submission date for your records.' },
          { label: 'Awarded', desc: 'Grant has been approved but the grant period has not started yet or funds have not arrived.' },
          { label: 'Active', desc: 'Grant period is underway. You are actively spending down the award and submitting progress reports.' },
          { label: 'Closed', desc: 'Grant period is complete and all reporting obligations have been fulfilled.' },
          { label: 'Denied', desc: 'Application was not approved. Keep the record for future reference and to track reapplication.' },
        ],
      },
      {
        title: 'Common Grant Types',
        type: 'indicators',
        items: [
          { label: 'AFG (Assistance to Firefighters)', desc: 'FEMA-administered federal grant. Annual competition. Covers equipment, PPE, training, and vehicles. 5% match for departments with ≤20 paid staff.' },
          { label: 'SAFER', desc: 'FEMA grant focused on hiring or retaining firefighters. Volunteer departments can use it for recruitment and retention programs.' },
          { label: 'State Fire Marshal', desc: 'State-administered grants that vary widely by state. Often easier to win than federal grants and may have lower match requirements.' },
          { label: 'FEMA BRIC', desc: 'Building Resilient Infrastructure and Communities — for hazard mitigation projects.' },
          { label: 'Foundation / Private', desc: 'Local community foundations, corporate sponsors, and fire service foundations (NFFF, NVFC, etc.).' },
        ],
      },
      {
        title: 'Reporting Deadlines',
        type: 'text',
        content: 'AFG and most federal grants require periodic progress reports (often quarterly) and a final report. Missing a reporting deadline can trigger a grant suspension or require repayment. Log every required reporting date as soon as you receive your grant award documents. OpenFirehouse will flag deadlines within 30 days as "Due Soon" and overdue deadlines in red.',
      },
      {
        title: 'Expenditure Tracking',
        type: 'text',
        content: 'Log each purchase made against the grant as a separate expenditure with the date, description, and amount. Keep copies of invoices and receipts — federal grants can be audited for up to 3 years after closeout. The spending bar in each grant card gives you an at-a-glance view of budget utilization.',
      },
      {
        title: 'Creating Grant Records & Tracking Lifecycle',
        type: 'text',
        content: 'Click + New Grant to start a record. Set the grant name, funding source (AFG, SAFER, State Fire Marshal, Foundation, etc.), application deadline, and match requirement. Move the grant through stages: Planning → Submitted → Awarded → Active → Closed. Log reporting deadlines and flag deadlines within 30 days as "Due Soon" in Notifications.' },
      {
        title: 'Managing Spending & Compliance',
        type: 'text',
        content: 'Once a grant is Active, log every expenditure with date, description, and amount. The spending bar shows utilization. Keep copies of all invoices and receipts — federal audits can occur up to 3 years after grant closeout. When the grant period ends, move it to Closed and mark all reporting obligations complete.' },
    ],
    tips: [
      'Start the Planning record the moment you identify a grant to pursue — even before you begin writing. Capturing the application deadline, match requirement, and key contacts early prevents last-minute scrambles.',
      'AFG applications open in the fall each year. The FEMA BPOG (Peer Review Panel Overview) is publicly available and shows you exactly how reviewers score applications — read it before you write.',
      'Never spend grant funds on anything not explicitly approved in your grant agreement. When in doubt, call your program officer before you buy. It\'s a 2-minute call that can prevent a repayment demand.',
    ],
    howTo: [
      { step: 'Click + New Grant', detail: 'Open the grant creation form. Enter grant name, funding source, award amount (if known), and application deadline.' },
      { step: 'Track the lifecycle', detail: 'Move the grant through stages: Planning (preparing), Submitted (applied), Awarded (approved but funds not yet available), Active (spending down), Closed (finished).' },
      { step: 'Log reporting deadlines', detail: 'As soon as you receive grant award documents, enter any required reporting deadlines. Federal grants typically need quarterly progress reports.' },
      { step: 'Log expenditures', detail: 'As you spend grant money, click + New Expenditure. Enter date, description, and amount. Keep receipts and invoices organized.' },
      { step: 'Watch the spending bar', detail: 'The progress bar shows budget utilization. Do not exceed the award amount without prior approval from the program officer.' },
    ],
    related: ['Budget & Finance', 'Station Settings', 'Reports & Export', 'Notifications'],
  },

  // ── Community Risk Reduction ───────────────────────────────────────────────
  crr: {
    name: 'Community Risk Reduction',
    group: 'Operations',
    overview: 'Community Risk Reduction (CRR) documents your department\'s prevention and life-safety outreach activities — home safety visits, detector installations, juvenile fire setter interventions, school programs, and community education events. NFPA 1300 provides a framework for CRR programs, and solid records help justify programs to elected officials and grant reviewers.',
    features: [
      'Home Safety Visit log with risk-level classification (Low / Moderate / High / Critical)',
      'Smoke and CO detector installation tracking by address',
      'Hazard documentation with outcome recording',
      'Follow-up visit scheduling and reminder banner',
      'Community Programs log with attendee counts and topics',
      'Juvenile Fire Setter (JFS) case tracking with outcome and follow-up',
    ],
    sections: [
      {
        title: 'Risk Levels',
        type: 'indicators',
        items: [
          { label: 'Low (green)', desc: 'No significant hazards found. Detectors functional. Resident knowledgeable about fire safety.' },
          { label: 'Moderate (amber)', desc: 'Minor hazards noted or corrected. Detectors installed or replaced. Resident education provided.' },
          { label: 'High (orange)', desc: 'Significant hazards present. Multiple interventions made. Follow-up scheduled.' },
          { label: 'Critical (red)', desc: 'Immediate life-safety risk. Hazards documented, referrals made, follow-up required within 30 days.' },
        ],
      },
      {
        title: 'Home Safety Visit Outcomes',
        type: 'indicators',
        items: [
          { label: 'Detector Installed', desc: 'A new smoke or CO detector was installed during the visit.' },
          { label: 'Detector Replaced', desc: 'An old or expired detector was replaced with a new unit.' },
          { label: 'Detector Declined', desc: 'Resident declined installation. Document the reason if provided.' },
          { label: 'Hazard Corrected', desc: 'A fire or life-safety hazard was identified and corrected on site.' },
          { label: 'Referral Made', desc: 'Resident was referred to another agency (housing authority, social services, utility company, etc.).' },
          { label: 'Follow-Up Scheduled', desc: 'A return visit was scheduled — log the follow-up date so you get a reminder.' },
        ],
      },
      {
        title: 'Juvenile Fire Setter (JFS) Program',
        type: 'text',
        content: 'The JFS tab on programs allows you to flag a case as a juvenile fire setter intervention. NFPA has a published JFS curriculum for fire departments. Always conduct JFS sessions with a guardian present and document outcomes carefully. Cases may be referred by schools, juvenile courts, or law enforcement. Mark these records carefully — they may be subject to different privacy rules than standard CRR records.',
      },
      {
        title: 'Community Programs',
        type: 'fields',
        items: [
          { name: 'Type', desc: 'Classify the program: School/Youth Education, Fire Extinguisher Class, Community Event, Senior Outreach, Station Tour, etc.' },
          { name: 'Attendees / People Reached', desc: 'Count everyone who received your message — students in a class, attendees at a fair, viewers of a social media post.' },
          { name: 'Topics Covered', desc: 'List each topic discussed. Specificity helps with grant reporting: "Stop Drop Roll, Escape Planning, Smoke Alarm Awareness" is better than "general fire safety."' },
          { name: 'Outcome', desc: 'Summarize what was accomplished: detectors distributed, visits scheduled, participants who completed a hands-on evolution, etc.' },
        ],
      },
      {
        title: 'Logging Home Safety Visits',
        type: 'text',
        content: 'Click + New Home Visit and select or enter an address. Assign a risk level (Low/Moderate/High/Critical) based on hazards found. Log outcomes: detectors installed/replaced/declined, hazards corrected, referrals made. For High and Critical visits, schedule a follow-up date — the system will remind you.' },
      {
        title: 'Tracking Community Outreach Programs',
        type: 'text',
        content: 'Click + New Community Program to log school visits, open houses, fire extinguisher training, public education events, etc. Enter program type, attendee count, and topics covered. The summary at the top shows YTD totals — useful for grant applications and demonstrating prevention impact.' },
    ],
    tips: [
      'Document every visit even when nothing alarming is found. A "Low" risk home visit with functioning detectors and a knowledgeable resident is a successful outcome — it proves the program is reaching people who don\'t need intervention, which is the whole point.',
      'The Follow-Up Date field triggers the banner on the CRR home screen. Use it liberally for High and Critical visits — a 90-day check-in is reasonable for most high-risk properties.',
      'Grant reviewers love CRR data. "Our department conducted 47 home safety visits, installed 62 detectors, and reached 312 community members through outreach events" is a powerful statement that quantifies your department\'s prevention work.',
    ],
    howTo: [
      { step: 'Click + New Home Visit', detail: 'Enter or search for the property address. Assign a risk level based on hazards observed.' },
      { step: 'Log outcomes', detail: 'Check boxes for outcomes: detector installed, replaced, declined; hazard corrected; referral made. Enter detailed notes.' },
      { step: 'Schedule follow-ups', detail: 'For High and Critical risk homes, set a follow-up date. The system reminds you when it\'s due.' },
      { step: 'Log community programs', detail: 'Click + New Community Program to record school visits, station tours, fire extinguisher classes, open houses, etc.' },
      { step: 'Track impact', detail: 'The YTD summary shows total visits, detectors installed, and community members reached. Use this data in grant applications.' },
    ],
    related: ['Fire Inspections', 'Pre-Incident Plans', 'Grant Management', 'Notifications'],
  },

  // ── CAD Integration ────────────────────────────────────────────────────────
  cad: {
    name: 'CAD Integration',
    group: 'Operations',
    overview: 'CAD Integration connects OpenFirehouse to your county or regional Computer-Aided Dispatch system so incoming calls are automatically imported into the Incident Log. Adapters available for Active911, CentralSquare, Motorola PremierOne, Tyler Technologies, and others. For systems not listed, a generic CSV import path is available.',
    features: [
      'Multi-vendor support — connect to 7+ CAD/RMS platforms',
      'Configurable sync intervals (every 15 min to daily)',
      'Import log with per-sync record counts and error tracking',
      'Field mapping — translate CAD field names to OpenFirehouse incident fields',
      'Connection status monitoring (Active / Inactive / Error / Testing)',
    ],
    sections: [
      {
        title: 'Connection Status',
        type: 'indicators',
        items: [
          { label: 'Active (green)', desc: 'Connection is live and syncing on schedule.' },
          { label: 'Inactive (gray)', desc: 'Connection is configured but not currently syncing. Enable it when ready.' },
          { label: 'Error (red)', desc: 'Last sync failed. Check host/endpoint, API key validity, and network access.' },
          { label: 'Testing (amber)', desc: 'Connection is in test mode — verifying credentials and reachability.' },
        ],
      },
      {
        title: 'Supported Vendors',
        type: 'text',
        content: 'Use the Supported Vendors tab to browse all CAD/RMS systems OpenFirehouse can connect to. Each entry lists the authentication method, integration features, and documentation URL. Contact your county dispatch center or IT department to obtain API credentials. Most CAD vendors require a formal request and may charge a data feed fee.',
      },
      {
        title: 'Field Mapping',
        type: 'text',
        content: 'Each CAD system uses different field names for the same data. The Field Mapping tab shows the OpenFirehouse incident model fields alongside common CAD field name variations. Mapping is configured per connection during setup. For CSV imports, you will be prompted to map columns during the upload wizard.',
      },
      {
        title: 'Sync Intervals',
        type: 'fields',
        items: [
          { name: 'Every 15 minutes', desc: 'Best for active dispatch centers — near real-time import of new calls.' },
          { name: 'Hourly / Daily', desc: 'Appropriate for lower-volume departments or batch end-of-day imports.' },
          { name: 'Manual only', desc: 'Trigger syncs manually from the connection detail page. Useful for testing.' },
        ],
      },
      {
        title: 'Setting Up CAD Connections',
        type: 'text',
        content: 'Click + New Connection and select your CAD vendor from the list (Active911, CentralSquare, Motorola PremierOne, Tyler, etc.). Provide the API endpoint and API key/token. Select field mapping (often auto-detected), and set sync interval (every 15 minutes, hourly, daily, or manual). Click Test Connection to verify credentials and reachability before enabling.' },
      {
        title: 'CSV Import Fallback',
        type: 'text',
        content: 'If your CAD does not have an API or you lack access, use the Generic CSV import option. Export a run report (RMS data) as CSV from your CAD system and upload it manually. Field mapping is configured per import, and the wizard walks you through it. This is slower than automated syncing but still much faster than manual entry.' },
    ],
    tips: [
      'Work with your county IT or dispatch center to get API access. Most counties have an existing data sharing agreement process — OpenFirehouse uses read-only API access so there is no write risk to the CAD system.',
      'For small departments with no CAD API access, the Generic CSV option lets you export a run report from any system and import it manually. This still saves significant time over manual data entry.',
      'Always test your connection with a small date range before enabling scheduled syncs.',
    ],
    howTo: [
      { step: 'Click + New Connection', detail: 'Select your CAD vendor from the Supported Vendors list. Contact your county IT or dispatch center for API credentials.' },
      { step: 'Enter API credentials', detail: 'Paste the API endpoint and authentication token/key. Most vendors have documentation showing where to find these.' },
      { step: 'Configure field mapping', detail: 'The system shows your CAD fields and maps them to OpenFirehouse incident fields. Auto-mapping usually gets most fields right — review and adjust as needed.' },
      { step: 'Set sync interval', detail: 'Choose how often to sync: every 15 minutes (best for active departments), hourly, daily, or manual only.' },
      { step: 'Test & enable', detail: 'Click Test Connection to verify the credentials work. Start with a test date range (e.g., 1 week), then expand to all data.' },
    ],
    related: ['Incident Log', 'Data Import & Conversion', 'Dashboard', 'Reports & Export'],
  },

  // ── Fire Investigation ──────────────────────────────────────────────────────
  fireinvestigation: {
    name: 'Fire Investigation',
    group: 'Operations',
    overview: 'Fire Investigation tracks cause and origin determinations following NFPA 921 (Guide for Fire and Explosion Investigations). Each case captures cause classification, area of origin, scene documentation checklist, evidence log, investigator narrative, and referral status. Cases can be linked to law enforcement or the state fire marshal.',
    features: [
      'NFPA 921-aligned cause classifications: Accidental, Natural, Incendiary, Undetermined',
      'Scene documentation checklist (10-item NFPA-based checklist)',
      'Evidence log with type, description, and date',
      'Referral tracking — law enforcement and state fire marshal',
      'Case status workflow from Open through Closed',
      'Injury, fatality, and estimated loss tracking',
    ],
    sections: [
      {
        title: 'Cause Classifications (NFPA 921)',
        type: 'indicators',
        items: [
          { label: 'Accidental (blue)', desc: 'Fire cause is unintentional and does not involve human negligence or malicious intent.' },
          { label: 'Natural (green)', desc: 'Fire initiated by a natural event such as lightning. No human involvement.' },
          { label: 'Incendiary (red)', desc: 'Fire was deliberately set. Requires law enforcement notification and careful documentation.' },
          { label: 'Undetermined (gray)', desc: 'Available evidence is insufficient to determine cause with a reasonable degree of certainty.' },
        ],
      },
      {
        title: 'Case Status Workflow',
        type: 'indicators',
        items: [
          { label: 'Open', desc: 'Case is active — scene secured, investigation beginning.' },
          { label: 'Active — Evidence Collection', desc: 'Scene work in progress. Samples collected, photos taken, interviews scheduled.' },
          { label: 'Active — Lab Analysis', desc: 'Samples submitted to lab. Awaiting results before final determination.' },
          { label: 'Referred to Law Enforcement', desc: 'Incendiary determination or suspected arson. Case handed to sheriff or police.' },
          { label: 'Referred to State FM', desc: 'Referred to the State Fire Marshal for jurisdiction, assistance, or required reporting.' },
          { label: 'Closed — No Charges / Prosecution / Unfounded', desc: 'Case resolved — no further action, prosecution initiated, or investigation unfounded.' },
        ],
      },
      {
        title: 'Scene Checklist',
        type: 'text',
        content: 'The 10-item scene checklist tracks completion of standard NFPA 921 scene documentation steps: exterior and interior photography, area of origin identification, burn pattern documentation, electrical systems inspection, utility shutoffs, witness interviews, debris collection, accelerant screening, and scene release. Complete as many items as the scene allows before releasing to the owner or insurer.',
      },
      {
        title: 'Evidence Log',
        type: 'fields',
        items: [
          { name: 'Photograph', desc: 'Document all photo sets with a description (e.g., "42 photos, south exterior V-pattern").' },
          { name: 'Physical Sample / Debris', desc: 'Log each sample collected, its origin location, and the lab it was sent to.' },
          { name: 'Accelerant Sample', desc: 'Soil, liquid, or residue samples for GC/MS analysis. Note chain of custody.' },
          { name: 'Electrical Component', desc: 'Breaker panels, wiring, appliances retained for forensic examination.' },
          { name: 'Witness Statement', desc: 'Record who was interviewed and a brief summary. Full statements stored in your investigation file.' },
          { name: 'Video / Surveillance', desc: 'Log the source and coverage period of any footage obtained.' },
        ],
      },
      {
        title: 'Creating & Managing Investigation Cases',
        type: 'text',
        content: 'Click + New Case when initiating an investigation. Link the case to the incident number, set the cause classification (Accidental/Natural/Incendiary/Undetermined), and record the area of origin (room/location where fire started). Complete the 10-item scene checklist and log all evidence and photographs.' },
      {
        title: 'Case Workflow & Notifications',
        type: 'text',
        content: 'Move cases through the workflow: Open → Evidence Collection → Lab Analysis → Referred to Law Enforcement/State FM → Closed. Incendiary determinations trigger mandatory notifications — your state fire marshal may require 24-hour notification. The case detail page tracks all referrals and dispositions.' },
    ],
    tips: [
      'Under NFPA 921, "undetermined" is a valid and appropriate classification when evidence is genuinely insufficient. Do not assign "accidental" simply because you cannot prove incendiary — that is not the standard.',
      'Incendiary fires trigger mandatory notifications in most states. Check your state fire marshal requirements — many require notification within 24 hours of an incendiary determination.',
      'Photograph the area of origin before moving any debris. The burn pattern is your most important physical evidence and cannot be recreated after the scene is disturbed.',
    ],
    howTo: [
      { step: 'Click + New Case', detail: 'Open a fire investigation case. Link to the incident number, set the cause classification (Accidental/Natural/Incendiary/Undetermined).' },
      { step: 'Document area of origin', detail: 'Record the room or location where the fire started (e.g., kitchen, bedroom, attic). This is your most important finding.' },
      { step: 'Complete scene checklist', detail: 'Check off the 10-item NFPA 921 scene documentation steps: photos, origin identification, burn patterns, electrical inspection, utility shutoffs, witness interviews, debris, accelerant screening, and scene release.' },
      { step: 'Log evidence', detail: 'Document all photographs, physical samples, accelerant samples, electrical components, witness statements, and video footage. Note chain of custody for physical evidence.' },
      { step: 'Refer if incendiary', detail: 'If the cause is incendiary, notify law enforcement and your state fire marshal per state requirements (often within 24 hours). Move the case to "Referred to Law Enforcement" status.' },
    ],
    related: ['Incident Log', 'NFIRS / NERIS Reports', 'Station Settings', 'Notifications'],
  },

  // ── Data Import & Conversion ───────────────────────────────────────────────
  dataimport: {
    name: 'Data Import & Conversion',
    group: 'Administration',
    overview: 'The Data Import wizard brings existing records into OpenFirehouse from any legacy RMS via CSV export. A 7-step wizard handles field auto-mapping, validation, and an import log — no manual re-entry.',
    features: [
      '5 record types: Members, Incidents, Training, Apparatus, Assets',
      'Auto field mapping with templates for the most common legacy RMS export formats',
      'Row-level validation — errors skip, warnings pass with a flag',
      'Import log tracks every session\'s import with status and record counts',
      'Sample data for each record type to walk through without a real file',
    ],
    sections: [
      {
        title: 'Import Wizard Steps',
        type: 'indicators',
        items: [
          { label: '1 — Record Type', desc: 'Choose what you are importing: Members, Incidents, Training records, Apparatus, or Assets.' },
          { label: '2 — Source System', desc: 'Pick your previous RMS or generic CSV. Drives auto field mapping.' },
          { label: '3 — Upload', desc: 'Upload a CSV file or load sample data. Excel must be saved as CSV first.' },
          { label: '4 — Field Mapping', desc: 'Map CSV columns to OpenFirehouse fields. Auto-mapping fills in most columns.' },
          { label: '5 — Validate', desc: 'Row-level check. Errors skip. Warnings import with a flag.' },
          { label: '6 — Preview', desc: 'Final summary — records to import vs. skipped.' },
          { label: '7 — Done', desc: 'Navigate to the target module to review imported records.' },
        ],
      },
      {
        title: 'CSV Export by System',
        type: 'fields',
        items: [

          { name: 'Firehouse', desc: 'Reports → Utilities → Export to File → CSV.' },
          { name: 'ImageTrend Elite', desc: 'Administration → Data Exports → CSV.' },
          { name: 'TargetSolutions / Vector', desc: 'Reporting → Completion Reports → Export CSV.' },
          { name: 'Spreadsheet', desc: 'File → Download → CSV (Comma delimited). UTF-8 preferred.' },
        ],
      },
      {
        title: 'Running the 7-Step Wizard',
        type: 'text',
        content: 'Click + Start Import to launch the wizard. Step 1: Choose record type (Members, Incidents, Training, Apparatus, Assets). Step 2: Select source system (auto-mapping will fill most fields). Step 3: Upload CSV. Step 4: Review & adjust field mapping if needed. Step 5: Validate (errors skip, warnings pass with flags). Step 6: Preview final count. Step 7: Import and navigate to review.' },
      {
        title: 'Using Sample Data & Testing',
        type: 'text',
        content: 'Each record type has sample data available to walk through the wizard without a real file. Use the sample data to understand field mapping, then export your actual data from your old system and re-run with the real file. Always test with 5–10 rows first before importing thousands of records.' },
    ],
    tips: [
      'Always test with 5–10 rows before importing your full data set.',
      'For Excel, use File > Save As > CSV before uploading — Excel .xlsx files are not directly supported.',
      'Rows with errors are skipped but logged — fix them in your source file and re-import.',
    ],
    howTo: [
      { step: 'Click + Start Import', detail: 'Open the 7-step import wizard from the Data Import & Conversion view.' },
      { step: 'Select record type', detail: 'Choose what you are importing: Members, Incidents, Training, Apparatus, or Assets.' },
      { step: 'Choose source system', detail: 'Pick your old system or a generic CSV export. Auto-mapping fills in most fields.' },
      { step: 'Upload your CSV', detail: 'Upload a CSV export from your old system. For Excel, save as CSV first (.xlsx is not supported).' },
      { step: 'Review field mapping', detail: 'The wizard shows your CSV columns and maps them to OpenFirehouse fields. Adjust if needed, then click Validate.' },
    ],
    related: ['Member Roster', 'Incident Log', 'Training', 'Apparatus Tracker'],
  },

  // ── Recruitment & Onboarding ──────────────────────────────────────────────
  recruitment: {
    name: 'Recruitment & Onboarding',
    group: 'Personnel',
    overview: 'Track every prospect from first contact through probationary membership. The pipeline view gives officers a live count at each stage, while individual records capture contact details, interview and physical dates, onboarding checklist progress, and full stage history.',
    features: [
      'Visual pipeline bar showing counts at each stage',
      'Per-prospect expandable records with contact info, dates, and history',
      'Nine-item onboarding checklist with progress bar',
      'Automatic stage history logging with timestamps',
      'Search and filter by stage, name, recruiter, source, or email',
      'Add/Edit Prospect modal with three-tab form',
    ],
    sections: [
      {
        title: 'Pipeline Stages',
        type: 'indicators',
        items: [
          { label: 'Prospect', desc: 'Initial contact made — no application on file yet.' },
          { label: 'Applied', desc: 'Formal application received and under review.' },
          { label: 'Background Check', desc: 'Submitted to county or third-party screener.' },
          { label: 'Interview', desc: 'Scheduled or completed panel interview with officers.' },
          { label: 'Physical / Medical', desc: 'NFPA 1582 physical examination scheduled or completed.' },
          { label: 'Orientation', desc: 'Attending multi-session department orientation program.' },
          { label: 'Probationary Member', desc: 'Sworn in; serving probationary period before full membership.' },
          { label: 'Withdrawn', desc: 'Candidate withdrew voluntarily. Record retained for future reapplication.' },
          { label: 'Declined', desc: 'Candidate did not meet requirements or was not selected.' },
        ],
      },
      {
        title: 'Onboarding Checklist',
        type: 'fields',
        items: [
          { name: 'Application Submitted', desc: 'Formal application on file.' },
          { name: 'Background Check Cleared', desc: 'County / state screening passed.' },
          { name: 'References Verified', desc: 'At least two references contacted.' },
          { name: 'Interview Completed', desc: 'Panel interview conducted.' },
          { name: 'Physical / Medical Cleared', desc: 'NFPA 1582 medical exam passed.' },
          { name: 'Orientation Completed', desc: 'All orientation sessions attended.' },
          { name: 'Gear / ID Issued', desc: 'Turnout gear fitted and member ID card issued.' },
          { name: 'SCBA Fit Test Completed', desc: 'Annual OSHA-required fit test passed.' },
          { name: 'Added to Member Roster', desc: 'Record created in Member Roster module.' },
        ],
      },
      {
        title: 'Add Prospect Form — Tabs',
        type: 'fields',
        items: [
          { name: 'Basic Info', desc: 'Name, DOB, date added, referral source, assigned recruiter/mentor, and general notes.' },
          { name: 'Contact', desc: 'Phone, email, and mailing address (visible to officers and chief only).' },
          { name: 'Progress', desc: 'Current stage (auto-logs history), interview/physical/orientation dates, onboarding checklist.' },
        ],
      },
      {
        title: 'Creating Prospect Records',
        type: 'text',
        content: 'Click + Add Prospect to create a new prospect record. Enter name, DOB, contact info, and referral source (walk-in, existing member, event, etc.). Assign a recruiter/mentor who will guide them through. The form has three tabs: Basic Info (name, status), Contact (phone, email, address), and Progress (stage, dates, onboarding checklist).' },
      {
        title: 'Pipeline Tracking & Onboarding Completion',
        type: 'text',
        content: 'The top of the module shows a pipeline bar with counts at each stage: Prospect, Applied, Background Check, Interview, Physical, Orientation, Probationary, Withdrawn, Declined. The 9-item onboarding checklist tracks: Application submitted, Background cleared, References verified, Interview completed, Physical cleared, Orientation completed, Gear issued, SCBA fit test, Added to Roster.' },
    ],
    tips: [
      'Changing a prospect\'s stage in the form automatically appends an entry to their stage history with today\'s date.',
      'The Recruiter field autocompletes from the Member Roster — type a few letters to find the right officer.',
      'Use the "Withdrawn" stage rather than deleting records. Candidates occasionally return and the history is valuable.',
      'Filter by "All Active" to exclude Withdrawn and Declined prospects from your working view.',
    ],
    howTo: [
      { step: 'Click + Add Prospect', detail: 'Open the prospect creation form. Enter name, DOB, contact phone/email, and how they heard about the department.' },
      { step: 'Assign a recruiter', detail: 'Select an officer to mentor this candidate through the process. Type their name to autocomplete from the Member Roster.' },
      { step: 'Move through stages', detail: 'As the prospect progresses, update their stage: Applied → Background Check → Interview → Physical → Orientation → Probationary. Stage history auto-logs with dates.' },
      { step: 'Complete onboarding checklist', detail: 'Check off items as they are completed: Application, Background, References, Interview, Physical, Orientation, Gear, SCBA Fit Test, Added to Roster.' },
      { step: 'View pipeline progress', detail: 'The pipeline bar at the top shows counts at each stage. Use this to see how many prospects are in each phase and identify bottlenecks.' },
    ],
    related: ['Member Roster', 'Training', 'Health & Wellness', 'Event Calendar'],
  },

  // ── SCBA / Air Management ──────────────────────────────────────────────────
  scba: {
    name: 'SCBA / Air Management',
    group: 'Apparatus',
    overview: 'Track every SCBA cylinder\'s inspection schedule, hydrostatic test due dates, fill history, and current status. Ensures compliance with NFPA 1852 and OSHA 1910.134 requirements. Overdue cylinders surface automatically with red badges.',
    features: [
      'Per-cylinder records with status, PSI, and due-date tracking',
      'Automatic overdue detection for annual inspection and hydrostatic tests',
      'Fill log per cylinder — date, pre/post PSI, filled-by, and fill station',
      'Pressure visualization bar (green/amber/red)',
      'Fill station inventory and status board',
      'Search and filter by unit ID, serial, assigned member, or apparatus',
    ],
    sections: [
      {
        title: 'Cylinder Statuses',
        type: 'indicators',
        items: [
          { label: 'In Service', desc: 'Cylinder is fully operational and ready for response.' },
          { label: 'Out of Service', desc: 'Cylinder has been removed from service — do not use for response.' },
          { label: 'In Repair', desc: 'Cylinder is at the shop or awaiting parts.' },
          { label: 'Retired', desc: 'Cylinder has been permanently removed from inventory.' },
        ],
      },
      {
        title: 'Cylinder Record Fields',
        type: 'fields',
        items: [
          { name: 'Unit ID', desc: 'Departmental ID (e.g., CYL-001). Used on gear tags and in fill logs.' },
          { name: 'Serial #', desc: 'Manufacturer\'s serial number — required for hydrostatic test records.' },
          { name: 'Make / Size / Material', desc: 'Manufacturer, rated capacity (SCF), and cylinder construction type.' },
          { name: 'Rated PSI', desc: 'Maximum operating pressure (typically 4500 psi for SCBA cylinders).' },
          { name: 'Current PSI', desc: 'Pressure as of the last recorded fill.' },
          { name: 'Mfg. Date', desc: 'Manufacture date — used to calculate end-of-service-life (15 years for composite).' },
          { name: 'Last Hydro', desc: 'Date of the most recent hydrostatic pressure test. Retesting required every 5 years per NFPA 1852.' },
          { name: 'Last Annual Inspection', desc: 'Date of most recent annual inspection by a certified technician. Required by OSHA annually.' },
          { name: 'Assigned To', desc: 'Member name or apparatus to which this cylinder is currently assigned.' },
        ],
      },
      {
        title: 'Date Badge Colors',
        type: 'indicators',
        items: [
          { label: 'Red — OVERDUE', desc: 'The inspection or hydrostatic test date has already passed.' },
          { label: 'Amber — Due Soon', desc: 'Due date is within 90 days.' },
          { label: 'Gray — Current', desc: 'More than 90 days remaining.' },
        ],
      },
      {
        title: 'Adding Cylinders & Logging Maintenance',
        type: 'text',
        content: 'Click + New Cylinder to register an SCBA cylinder. Enter the Unit ID (internal tag), manufacturer serial number, make/model, rated PSI, and manufacture date. Set last annual inspection date and last hydrostatic test date. Assign to a member or apparatus. Log every fill event with pre/post PSI readings.' },
      {
        title: 'Hydrostatic Test & Inspection Scheduling',
        type: 'text',
        content: 'Annual inspections are required by OSHA. Hydrostatic tests are required every 5 years for composite cylinders, 3 years for steel (per NFPA 1852). The system flags cylinders approaching or past these dates in amber (due soon) or red (overdue). Schedule tests proactively — overdue cylinders cannot be used for response.' },
    ],
    tips: [
      'NFPA 1852 requires hydrostatic testing every 5 years for composite cylinders and every 3 years for steel. OpenFirehouse defaults to 5 years — adjust per your AHJ.',
      'OSHA 1910.134 requires annual inspection of all SCBA equipment by a qualified technician.',
      'Log every fill event — it creates an audit trail and helps identify cylinders with unexplained pressure loss.',
      'Cylinders manufactured more than 15 years ago should be evaluated for retirement regardless of inspection status.',
    ],
    howTo: [
      { step: 'Click + New Cylinder', detail: 'Register a new SCBA cylinder with unit ID, manufacturer serial #, make/model, and rated PSI.' },
      { step: 'Set inspection dates', detail: 'Enter last annual inspection date and last hydrostatic test date. The system calculates when each is due.' },
      { step: 'Assign to member or apparatus', detail: 'Select the firefighter or apparatus this cylinder is assigned to for accountability.' },
      { step: 'Log fill events', detail: 'Click + New Fill each time the cylinder is filled. Record pre-fill and post-fill PSI, date, and who filled it.' },
      { step: 'Monitor due dates', detail: 'Check the list regularly for amber (due soon) or red (overdue) badges. Schedule inspections and hydrostatic tests before they\'re past due.' },
    ],
    related: ['Health & Wellness', 'Apparatus Tracker', 'Maintenance Log', 'Training'],
  },

  // ── Payroll & Stipends ─────────────────────────────────────────────────────
  payroll: {
    name: 'Payroll & Stipends',
    group: 'Administration',
    overview: 'Record and track all member compensation including per-call pay, meeting attendance stipends, training pay, annual stipends, and special assignments. Organized by quarterly pay periods with full member summary views and pending-approval workflow.',
    features: [
      'Quarterly pay period management with Open / Closed status',
      'Ledger tab: filterable line-item view of all entries in the current period',
      'Members tab: per-member YTD summary with type breakdown and entry history',
      'Pay Periods tab: period-over-period totals with quick navigation',
      'Pending / Approved / Paid workflow for each entry',
      'Add/Edit Entry modal with auto-filled rate defaults per pay type',
    ],
    sections: [
      {
        title: 'Pay Types',
        type: 'fields',
        items: [
          { name: 'Per-Call', desc: 'Paid for each emergency response. Default rate: $25.00/call.' },
          { name: 'Meeting Attendance', desc: 'Paid for attending general or officer meetings. Default: $15.00.' },
          { name: 'Training / Drill', desc: 'Paid for attending scheduled drills or training sessions. Default: $20.00.' },
          { name: 'Annual Stipend', desc: 'Annual lump-sum by rank: Chief $2,400 · Officer $1,200 · Member $600.' },
          { name: 'Administrative', desc: 'Paid for administrative duties (records, recruiting). Default: $15.00.' },
          { name: 'Special Assignment', desc: 'Paid for conference attendance, mutual aid details, or special duties. Default: $30.00.' },
        ],
      },
      {
        title: 'Entry Statuses',
        type: 'indicators',
        items: [
          { label: 'Pending', desc: 'Entry recorded but not yet reviewed by an approving officer.' },
          { label: 'Approved', desc: 'Entry reviewed and approved — awaiting disbursement.' },
          { label: 'Paid', desc: 'Funds have been disbursed to the member.' },
        ],
      },
      {
        title: 'Pay Entry Form Fields',
        type: 'fields',
        items: [
          { name: 'Member', desc: 'Autocompletes from the Member Roster.' },
          { name: 'Pay Type', desc: 'Selecting a type auto-fills the default rate in the Amount field.' },
          { name: 'Amount', desc: 'Override the default rate if the actual amount differs (e.g., multi-hour training).' },
          { name: 'Date', desc: 'Date of the activity (call date, meeting date, etc.).' },
          { name: 'Pay Period', desc: 'Quarterly period this entry belongs to.' },
          { name: 'Description', desc: 'Brief description: incident address, meeting name, drill title, etc.' },
          { name: 'Approved By', desc: 'Officer who reviewed and approved the entry.' },
        ],
      },
      {
        title: 'Setting Up Pay Periods & Default Rates',
        type: 'text',
        content: 'The system defaults to quarterly pay periods (Q1, Q2, Q3, Q4). Click Pay Periods to view all periods and toggle between Open and Closed. Edit default rates for each pay type: Per-Call ($25), Meeting ($15), Training ($20), Annual Stipend (by rank), etc. These defaults auto-fill in the entry form.' },
      {
        title: 'Tracking & Approving Pay Entries',
        type: 'text',
        content: 'Entries start as Pending. Click the entry to mark it Approved by an officer. The Members tab shows YTD totals per member across all periods — useful for annual stipend planning and reporting. Once a period is Closed, entries can no longer be added or edited.' },
    ],
    tips: [
      'Add per-call entries immediately after an incident while the call roster is fresh in your mind.',
      'Annual stipends are typically added as a single Paid entry at year-end (Q4 period).',
      'The Members tab shows all-time totals across every pay period — useful for annual reporting.',
      'Use the Pay Periods tab to verify a closed quarter is fully reconciled before processing disbursements.',
      'This module tracks pay records only — actual payroll processing and tax withholding must be handled through your payroll provider or treasurer.',
    ],
    howTo: [
      { step: 'Click + New Entry (or + New Period if needed)', detail: 'Enter a new pay entry or create a new pay period (usually quarterly: Q1, Q2, Q3, Q4).' },
      { step: 'Select member and pay type', detail: 'Type the member name to autocomplete. Choose pay type: Per-Call, Meeting, Training, Annual Stipend, Administrative, or Special Assignment.' },
      { step: 'Set amount and date', detail: 'The amount auto-fills based on the default rate for that pay type. Override if needed (e.g., 2-hour training = $40). Set the activity date.' },
      { step: 'Add description', detail: 'Brief note: incident address, meeting name, drill title, or special assignment description.' },
      { step: 'Submit for approval', detail: 'Save the entry as Pending. An officer reviews and marks it Approved. Once approved, it\'s ready for disbursement.' },
    ],
    related: ['Member Roster', 'Budget & Finance', 'Volunteer Hours', 'Station Settings'],
  },

  // ── Recall / All-Call ─────────────────────────────────────────────────────
  recall: {
    name: 'Recall / All-Call',
    group: 'Operations',
    overview: 'The Recall System lets an officer or chief immediately notify every off-duty member when an incident needs more hands. A single tap sends a push notification to every device with the app installed — no phone tree, no radio calls. Members receive the alert, open the app, and respond with their availability and ETA in seconds.',
    features: [
      'Three recall levels: Standby Alert, Request for Additional Resources, Full Department Recall',
      'Push notification blast to all subscribed members — sent the moment the recall is issued',
      'Per-member response tracking: Responding / Not Available + optional ETA',
      'Live response board — see who\'s coming, who\'s out, and who hasn\'t responded',
      'Recall history with full response logs for after-action review',
      'Officers and Chiefs can close a recall when enough resources have arrived',
      'Deep-link from push notification directly to the respond screen',
      'Recall button in the Dispatch & Command header for single-screen incident management',
    ],
    sections: [
      {
        title: 'Recall Levels',
        type: 'indicators',
        items: [
          { label: 'Standby Alert', desc: 'Low urgency — members are asked to be available but not to respond yet. Used for developing situations.' },
          { label: 'Request for Additional Resources', desc: 'Moderate urgency — specific additional apparatus or personnel are needed. The standard level for a working second-alarm or major medical.' },
          { label: 'Full Department Recall', desc: 'High urgency — all available members are asked to respond immediately. Used for major incidents, mass casualty events, or department-wide mutual aid.' },
        ],
      },
      {
        title: 'Issue Recall Form Fields',
        type: 'fields',
        items: [
          { name: 'Recall Level', desc: 'Dropdown — Standby Alert, Request for Additional Resources, or Full Department Recall.' },
          { name: 'Incident Type', desc: 'Dropdown — the type of emergency driving the recall (Structure Fire, Hazmat, MCI, etc.).' },
          { name: 'Location / Address', desc: 'Optional — the incident address. Appears on members\' lock screens in the notification.' },
          { name: 'Additional Message', desc: 'Optional — any extra context: "Need two engine crews — Stage at Oak Ave."' },
        ],
      },
      {
        title: 'Response Board',
        type: 'text',
        content: 'Once a recall is active, the response board refreshes every 10 seconds. Responding members appear in green with their ETA. Not Available members appear in grey. The raw count of responders vs. total is always visible at a glance.',
      },
      {
        title: 'How Members Respond',
        type: 'text',
        content: 'Tapping a recall push notification opens the app directly to that recall. The member sees a full-screen card with incident details and two buttons: Responding (green) and Not Available (grey), plus an optional ETA dropdown. Their response appears on the IC\'s board immediately.',
      },
    ],
    tips: [
      'Push notifications only reach members who have opened the app at least once and allowed notifications. Remind members to enable notifications.',
      'Use Standby Alert early in a developing situation — it gets members checking their phones without pulling everyone away unnecessarily.',
      'Always include the address — members can start driving while still reading the notification.',
      'The Dispatch & Command has a Recall button in the header so the IC can issue an all-call without leaving the incident screen.',
      'The response history is useful for after-action reviews — you can see exactly how long it took the department to mobilize.',
    ],
    howTo: [
      { step: 'Open Recall System from the sidebar', detail: 'Found in the Operations group. Or tap the Recall button in the Dispatch & Command header.' },
      { step: 'Tap Issue Recall', detail: 'Opens the Issue Recall modal. Officers and Chiefs only.' },
      { step: 'Select recall level and incident type', detail: 'Choose the urgency level and incident type. Both appear in the push notification.' },
      { step: 'Add location and optional message', detail: 'The address appears on members\' lock screens. Add staging instructions or resource requests in the message field.' },
      { step: 'Tap Issue Recall', detail: 'Push notification immediately sent to all subscribed devices. Response board goes live.' },
      { step: 'Monitor responses', detail: 'Watch the response board. Green = Responding (with ETA). Grey = Not Available. Auto-refreshes every 10 seconds.' },
      { step: 'Close the recall', detail: 'Tap Close Recall when you have sufficient resources. Full response log is preserved in history.' },
    ],
    related: ['Dispatch & Command', 'Notifications & Alerts', 'Member Roster', 'Hazmat Management'],
  },

  // ── Dispatch & Command ──────────────────────────────────────────────────────────
  command: {
    name: 'Dispatch & Command',
    group: 'Operations',
    overview: 'Dispatch & Command is a unified tab combining Live Dispatch monitoring and the Incident Command Board. The Live Dispatch sub-tab shows incoming CAD alerts in real time — when a call comes in, one tap activates the incident and switches to the Command Board sub-tab automatically. The board starts an elapsed timer and guides the Incident Commander through a structured, dropdown-driven workflow — no typing under pressure. Everything from apparatus assignments to personnel accountability to ICS roles is managed here in real time.',
    features: [
      'Two sub-tabs in one screen: Live Dispatch (incoming CAD alerts) and Command Board (active incident management)',
      'Auto-activation: when a dispatch alert is accepted, the incident starts and the board sub-tab opens automatically',
      'Unit status workflow: Dispatched → En Route → On Scene → Staging / Committed / Available → Returning',
      'Units auto-populate as "Dispatched" on activation — En Route requires radio confirmation from the unit to dispatch before status is updated',
      'Elapsed timer — counts from incident activation in HH:MM:SS',
      'Per-type milestone timeline — each incident type has its own set of relevant milestones to stamp with elapsed time',
      'Apparatus section — add units by dropdown from the apparatus roster or pre-plan address list',
      'ICS Roles — assign members to IC, Safety, Operations, Staging, and other ICS positions via dropdown',
      'Personnel Accountability — full roster tracking with PAR (Personnel Accountability Report) check modal',
      'PAR countdown timer — configurable interval (10/15/20/30 min) with color-coded countdown; pulses red when overdue',
      'Live wind banner — station wind speed, direction, and gusts displayed on the setup screen and in the active incident header',
      'Radio / Comms Log — log radio traffic by channel and sender; entries are saved to the incident record',
      'HazMat ICS sections — Operations, Planning, Logistics, and Finance appear automatically for Hazmat and Gas Leak incidents',
      'Voice-dictated incident notes — tap the mic on any notes field to speak your running narrative',
      'Auto-generated incident number — formatted YYYY-NNNN, no manual entry required',
      'Command board access: Dispatch, Fire Chief, Deputy Chief, and Battalion Chief can all edit the board',
    ],
    sections: [
      {
        title: 'Setup Screen',
        type: 'fields',
        items: [
          { name: 'Incident Type', desc: 'Dropdown — selects the incident type and determines which milestone set is shown on the live board (Structure Fire, Medical, Hazmat, etc.).' },
          { name: 'Location', desc: 'Dropdown — populated from pre-incident plan addresses so the IC selects a known address rather than typing. Free-text available for unknown addresses.' },
          { name: 'Incident Commander', desc: 'Dropdown — populated from the member roster.' },
          { name: 'Incident Number', desc: 'Auto-generated in YYYY-NNNN format. Cannot be edited.' },
        ],
      },
      {
        title: 'Milestone Timeline',
        type: 'text',
        content: 'Each incident type has a curated set of milestone stamps. Tap a milestone to stamp it with the current elapsed time — the stamp is permanent once set. Milestones appear in operational order (Dispatched → En Route → On Scene → type-specific milestones → Cleared). Note: units on the board begin in "Dispatched" status — only update to "En Route" after the unit confirms with dispatch on the radio. For Hazmat and Gas Leak incidents, milestones include Hot Zone Est., Decon Active, and Mitigated.',
      },
      {
        title: 'Apparatus Section',
        type: 'text',
        content: 'Tap Add Unit to assign apparatus by unit ID (dropdown). Each unit shows its arrival time (stamped when added) and assigned role. Units already assigned are filtered from the add dropdown.',
      },
      {
        title: 'ICS Roles Section',
        type: 'text',
        content: 'Assign members to ICS command positions: IC (auto-filled from setup), Safety Officer, Operations, Planning, Logistics, Finance, Staging, and Rehab. Each role uses a dropdown from the active member roster. A member can hold multiple roles if needed.',
      },
      {
        title: 'Personnel Accountability',
        type: 'text',
        content: 'Track every person on scene. Add members via dropdown — already-added personnel are filtered from the list. Run a PAR Check at any time: the PAR modal shows all on-scene personnel and lets you confirm all are accounted for.',
      },
      {
        title: 'PAR Countdown Timer',
        type: 'text',
        content: 'Set a PAR interval (10, 15, 20, or 30 minutes) from the dropdown in the incident header. A countdown timer appears and turns orange in the final 2 minutes, then pulses red when a PAR is overdue. Completing a PAR check resets the timer automatically.',
      },
      {
        title: 'Live Wind',
        type: 'text',
        content: 'Wind conditions are shown in two places: a full banner on the setup screen (before activating an incident) and a compact badge in the active incident header. Displays speed, compass direction (N/NE/SE, etc.), and gusts when present. Color-coded green through red by intensity. Wind over 25 mph triggers a caution note about fire behavior and aerial operations. Requires City and State in Station Settings.',
      },
      {
        title: 'Radio / Comms Log',
        type: 'text',
        content: 'Log radio traffic during the incident. Each entry captures channel (Command, Attack, Rescue, EMS, etc.), sender name, and message text. Entries are timestamped automatically and listed newest-first. The full comms log is included when the incident is saved to the Incident Log.',
      },
      {
        title: 'HazMat ICS Sections',
        type: 'text',
        content: 'For Hazmat and Gas Leak incidents, four additional command sections appear below the standard board: Operations (entry team, decon, zone management), Planning (situation status, material ID, ERG guide), Logistics (specialized equipment, CHEMTREC), and Finance (cost tracking, contractor billing). Each section has a voice-dictated narrative field.',
      },
      {
        title: 'Incident Status',
        type: 'indicators',
        items: [
              { label: 'Active', desc: 'Timer is running. All sections are editable by Dispatch, Fire Chief, Deputy Chief, or Battalion Chief. The Live badge appears in the sidebar nav.' },
          { label: 'Closed', desc: 'Incident has been closed via the Close Incident modal. Timer is stopped. Record is read-only.' },
        ],
      },
    ],
    tips: [
      'Complete the setup screen quickly — only incident type, location, and IC are required to activate the board. You can fill in apparatus and personnel as units arrive.',
      'Stamp milestones as they happen, not retroactively — the elapsed time is what matters for post-incident review.',
      'Use the voice mic on the incident notes field to dictate a running narrative hands-free while managing the scene.',
      'Run a PAR check any time you lose track of who is on scene — the board filters out personnel who are already accounted for.',
      'For Hazmat incidents, the four ICS sections (Ops/Plan/Log/Finance) mirror the NIMS command structure your hazmat team already uses.',
    ],
    howTo: [
      { step: 'Tap Dispatch & Command in the sidebar', detail: 'The tab opens on the Live Dispatch sub-tab by default. The sidebar shows a red LIVE badge once an incident is activated.' },
      { step: 'Monitor incoming CAD alerts on the Live Dispatch sub-tab', detail: 'Dispatch alerts appear in real time. Review the call details — incident type, address, and dispatched units.' },
      { step: 'Accept the dispatch to activate the incident', detail: 'Accepting the call creates the incident, populates dispatched units as "Dispatched" status on the board, and automatically switches to the Command Board sub-tab.' },
      { step: 'Fill in setup fields if needed', detail: 'Confirm incident type, location, and Incident Commander on the setup screen. The incident number is auto-assigned.' },
      { step: 'Tap Activate Incident', detail: 'The board goes live. The elapsed timer starts. The milestone timeline for your incident type appears at the top.' },
      { step: 'Update unit status via radio confirmation', detail: 'Units start as "Dispatched." Only move a unit to "En Route" after it confirms with dispatch on the radio.' },
      { step: 'Stamp milestones as they occur', detail: 'Tap each milestone button the moment it happens — En Route, On Scene, etc. The elapsed time is recorded permanently.' },
      { step: 'Add apparatus and personnel', detail: 'Use the Add Unit and Add Personnel dropdowns as units arrive. Each gets an arrival time stamp.' },
      { step: 'Assign ICS roles', detail: 'Tap Assign Role in the ICS section to assign members to command positions by dropdown.' },
      { step: 'Dictate running narrative', detail: 'Tap the mic button on the Incident Notes field and speak your narrative. Tap again to stop.' },
      { step: 'Run PAR checks', detail: 'Tap PAR Check at any time to confirm all on-scene personnel are accounted for.' },
      { step: 'Close the incident', detail: 'Tap Close Incident, select disposition, and confirm. The timer stops and the record is locked.' },
    ],
    related: ['Incident Log', 'Hazmat Management', 'Pre-Incident Plans', 'Member Roster', 'CAD Integration'],
  },

  // ── HazMat Management ─────────────────────────────────────────────────────
  hazmat: {
    name: 'Hazmat Management',
    group: 'Operations',
    overview: 'The Hazmat Management module provides a full-screen view of all active and historical hazmat incidents, with integrated ICS command structure tracking. Rather than a standalone tracker, hazmat data is tied directly to incident records — so the Operations, Planning, Logistics, and Finance sections in a Hazmat response are part of the incident record, not a separate silo.',
    features: [
      'Incident list filterable by status (Active, Mitigated, Closed) and substance type',
      'Integrated ICS four-section structure: Operations, Planning, Logistics, Finance',
      'Voice-dictated narrative fields in every ICS section',
      'Links to the corresponding Incident Log entry',
      'Material identification, ERG guide number, and zone status tracking',
      'Contractor and cost tracking in the Finance section',
      'Specialized resource tracking (CHEMTREC, county hazmat team) in Logistics',
    ],
    sections: [
      {
        title: 'Four ICS Command Sections',
        type: 'fields',
        items: [
          { name: 'Operations', desc: 'Tactical hazmat actions — entry team roster, hot/warm/cold zone boundaries, decon type, and operational narrative. This is where you track what the entry team is physically doing.' },
          { name: 'Planning', desc: 'Situation status and documentation — material identified, UN number, ERG guide number, wind direction/speed, and a voice-dictated planning narrative. Used to track the evolving picture.' },
          { name: 'Logistics', desc: 'Equipment and specialized resources — equipment requested (SCBA, decon trailer, absorbent), specialized team contact (CHEMTREC 1-800-424-9300, county hazmat), and logistics narrative.' },
          { name: 'Finance', desc: 'Cost documentation for hazmat response — contractor name, estimated cost, billing authorization, and finance narrative. Captures data needed for reimbursement or billing to responsible party.' },
        ],
      },
      {
        title: 'Incident Status',
        type: 'indicators',
        items: [
          { label: 'Active', desc: 'Hazmat incident is ongoing. Operations section is live.' },
          { label: 'Mitigated', desc: 'Hazmat condition is controlled; scene is still active for cleanup or monitoring.' },
          { label: 'Closed', desc: 'Incident fully resolved, all sections completed.' },
        ],
      },
      {
        title: 'Voice Dictation',
        type: 'text',
        content: 'Every ICS section narrative field has a floating mic button. Tap to start dictation — interim text appears in italic red below the field. Tap again to stop and finalize. Works on Chrome, Edge, Android Chrome, and iOS Safari 14.5+. The mic button is hidden automatically on Firefox, where it is not supported.',
      },
    ],
    tips: [
      'Start the Planning section as soon as the material is identified — ERG guide number and UN number are critical for entry team briefing and CHEMTREC calls.',
      'CHEMTREC 24-hour emergency line: 1-800-424-9300. Log the call time and specialist name in the Logistics narrative.',
      'The Finance section captures data for billing the responsible party — even if you are unsure whether billing will happen, document contractor name and estimated cost while on scene.',
      'Use the Operations narrative to document each entry team activation: team members, entry time, exit time, air remaining on reentry.',
      'Hazmat incidents automatically show the full ICS four-section structure on the Dispatch & Command — you can manage them from either place.',
    ],
    howTo: [
      { step: 'Open Hazmat Management from the sidebar', detail: 'Found in the Operations group. Shows a list of all hazmat incidents with status badges.' },
      { step: 'Tap + New Hazmat Incident or open from Dispatch & Command', detail: 'For a live incident, the Dispatch & Command activates the four ICS sections automatically when Hazmat or Gas Leak is selected as the incident type.' },
      { step: 'Fill in Operations section', detail: 'Enter entry team members, zone setup, and decon method. Tap the mic to dictate your operational narrative.' },
      { step: 'Fill in Planning section', detail: 'Document the material: UN number, ERG guide, wind conditions. Update as the situation evolves.' },
      { step: 'Fill in Logistics section', detail: 'Log equipment requests and specialized resources. Note CHEMTREC contact and any county hazmat team activation.' },
      { step: 'Fill in Finance section', detail: 'Document contractor involvement and estimated costs for potential reimbursement or billing.' },
      { step: 'Update status as incident progresses', detail: 'Change from Active → Mitigated → Closed as conditions change.' },
    ],
    related: ['Dispatch & Command', 'Incident Log', 'Pre-Incident Plans', 'Fire Inspections'],
  },

  // ─── Phase 5: Scenario-Based Learning ─────────────────────────────────────
  'scenarios': {
    name: 'Scenario-Based Learning',
    group: 'Personnel',
    overview: 'Interactive decision-tree training scenarios where members navigate realistic NJ incident command situations. Each scenario presents a multi-scene story — at each decision point, you choose from 4 options and receive immediate feedback explaining why your choice was right, partially right, or wrong. Scenarios earn CE credit hours on completion.',
    tips: [
      'Scenarios cover every incident type: structural fires, HazMat, EMS, MVA, technical rescue, brush fires, and more.',
      'Correct answers are shuffled randomly each time — you can\'t memorize positions.',
      'Expert-tier scenarios require 70% to pass and feature cascading failures and ethical dilemmas.',
      'Each completed scenario earns 1.0 CE hour regardless of score, but only passing scores count toward your compliance dashboard.',
      'After completing a scenario, use the AI Instructor Debrief to get personalized feedback on your specific decisions.',
      'Your best score for each scenario is saved — retaking a scenario updates your grade and completion badge.',
    ],
    howTo: [
      { step: 'Go to Training → Scenarios tab', detail: 'The fourth tab in the Training module. Shows the full scenario catalog with filters by category and difficulty.' },
      { step: 'Pick a scenario', detail: 'Browse by category (Structural Firefighting, HazMat, EMS, etc.) or difficulty level (Foundational, Intermediate, Advanced, Expert). Each card shows estimated time and your best grade if you\'ve completed it.' },
      { step: 'Read the dispatch and setup', detail: 'Before the first decision, you\'ll get a dispatch notification, a situation narrative, and key details about the incident. Take your time — this information is critical to good decisions.' },
      { step: 'Make your decisions', detail: 'Each scene presents a situation and 4 choices. Select one to lock it in, then the outcome is revealed with a detailed explanation. Best = 2 pts, Acceptable = 1 pt, Poor = 0 pts.' },
      { step: 'Review your debrief', detail: 'After all scenes, you see your total score, grade, decision log, key lessons, and references. Click Generate My Debrief for AI-powered personalized feedback.' },
      { step: 'CE hours are credited automatically', detail: 'A training record is created when you complete a scenario. The hours appear in your Records tab and count toward LOSAP compliance.' },
    ],
    related: ['Training', 'Drills & Courses', 'Live Incident Response'],
  },

  // ─── Phase 6: Live Incident Response / AI Guidance ──────────────────────────
  'incident-response': {
    name: 'Live Incident Response',
    group: 'Operations',
    overview: 'When a dispatch comes in, tap "I\'m Responding" to log your response and optionally receive an AI-generated mission brief tailored to your NJ certification level. The system determines whether you\'re authorized for interior operations, command, or exterior-only based on your training records, then generates role-specific guidance, hazard alerts, approach instructions, and an interactive checklist. This is OpenFirehouse\'s signature mobile feature — designed to put critical, personalized tactical information in every firefighter\'s hand while they\'re en route.',
    features: [
      { label: '"I\'m Responding" Button', desc: 'One-tap response logging from the CAD alert banner, Dashboard incident strip, or Command Board header. Instantly notifies command that you\'re en route.' },
      { label: 'AI Mission Brief', desc: 'Personalized tactical guidance generated in seconds based on your certification level, the incident type, and the dispatch address. Includes role assignment, hazards, approach plan, and cert-level restrictions.' },
      { label: 'Standard Response Mode', desc: 'Opt out of AI guidance and still log your response with a basic universal checklist. AI is always optional, never forced.' },
      { label: 'Cert-Level Detection', desc: 'Automatic determination of your authorization level from training records: Probationary → Firefighter I → Firefighter II → Officer → HazMat Ops → EMT. The AI brief never tells you to do something above your cert.' },
      { label: 'Response Status Workflow', desc: 'Three-stage status tracking: EN ROUTE → ON SCENE → CLEARED. Each transition syncs to the server in real time so command always knows who\'s where.' },
      { label: 'Interactive Checklist', desc: 'Task-by-task arrival checklist with progress bar. Check items off as you complete them — great for accountability and not missing steps under stress.' },
      { label: 'Live AI Q&A', desc: 'Ask the AI questions about the specific incident while on scene: "What PPE do I need?", "Where should I stage?", "Water supply options?", "Nearest hydrant?" Answers are scoped to the incident and your cert level.' },
      { label: 'Do NOT Warnings', desc: 'Cert-level restriction callouts in the mission brief. For example, a Probationary member will see "Do NOT enter the IDLH atmosphere" and "Do NOT operate attack lines without a qualified partner."' },
    ],
    sections: [
      {
        title: 'AI Mission Brief Structure',
        type: 'fields',
        items: [
          { field: 'Your Mission', note: 'Role assignment based on cert level — e.g., "You are authorized for interior structural firefighting" or "You are assigned to exterior support operations only."' },
          { field: 'Key Hazards', note: 'Incident-specific hazard alerts: smoke conditions, collapse risk, chemical exposure, traffic hazards, weather factors, and utility status.' },
          { field: 'On Arrival', note: 'Step-by-step approach instructions: staging location, PPE donning, size-up checklist, radio check-in protocol, and initial assignment.' },
          { field: 'Do NOT', note: 'Hard restrictions based on your certification. These are non-negotiable safety boundaries — the AI will never suggest actions above your authorization.' },
          { field: 'Action Checklist', note: 'Interactive task list customized to the incident type and your role. Items auto-populate based on the dispatch — structure fire gets different tasks than an MVA or EMS call.' },
        ],
      },
      {
        title: 'Response Status Stages',
        type: 'fields',
        items: [
          { field: 'EN ROUTE', note: 'Set automatically when you tap "I\'m Responding." Command sees you on the responder list. Your mission brief generates during this phase.' },
          { field: 'ON SCENE', note: 'Tap "I\'m On Scene" when you arrive. Activates the full guidance view with checklist and Q&A panel. Timestamp is logged for response-time analytics.' },
          { field: 'CLEARED', note: 'Tap "Clear From Incident" when you\'re done. Logs your total on-scene time and closes the guidance overlay. Data feeds into Response Analytics.' },
        ],
      },
      {
        title: 'Cert-Level Authorization Matrix',
        type: 'text',
        body: 'Your certification level determines what the AI will and won\'t recommend. Probationary members get exterior-only guidance. FF I members can perform interior operations with a partner. FF II members get full interior authorization. Officers receive command-focused briefings. HazMat Ops-certified members get hazmat-specific protocols. EMT-certified members see medical assessment steps. The system always errs on the side of safety — if your certs are ambiguous, it defaults to the lower authorization.',
      },
      {
        title: 'Mobile-First Design',
        type: 'text',
        body: 'Live Incident Response is designed for one-handed phone use while riding the apparatus or walking to the scene. Large tap targets, high-contrast text, minimal scrolling, and no tiny buttons. The mission brief is structured so you can glance at the key points in seconds. The checklist uses oversized checkboxes. The Q&A input is always visible at the bottom of the screen.',
      },
    ],
    tips: [
      'The "I\'m Responding" button appears in three places: the CAD alert banner, the Dashboard active incident strip, and the Command Board header.',
      'You choose whether to use AI guidance or just log a standard response — AI is optional, not forced.',
      'Your cert level is determined automatically from your training records (Probationary → FF1 → FF2 → Officer → HazMat Ops → EMT).',
      'The AI brief is specifically scoped to what you\'re authorized to do under NJ regulations — it will never tell you to do something above your cert level.',
      'The interactive checklist tracks your progress through arrival tasks. Check items off as you complete them.',
      'Use the live AI Q&A to ask questions about the specific incident — "What PPE do I need?", "Where should I stage?", "Water supply options?"',
      'Response status progresses: EN ROUTE → ON SCENE → CLEARED. Each status change syncs to the server so command knows who\'s responding.',
      'If you lose cell signal on scene, the mission brief stays visible — it was already generated and rendered locally.',
      'Command Board operators can see all responding members and their current status in real time.',
      'Your response times (dispatch → en route → on scene → cleared) feed directly into Response Analytics for NFPA 1720 benchmarking.',
    ],
    howTo: [
      { step: 'Tap "I\'m Responding" when a dispatch arrives', detail: 'Green button appears on the CAD alert banner at the top of the screen, on the Dashboard incident strip, or in the Command Board header.' },
      { step: 'Choose AI Mission Brief or Standard Response', detail: 'AI Mission Brief generates personalized guidance for your cert level. Standard Response just logs you as responding with a basic checklist.' },
      { step: 'Review your mission brief (if AI selected)', detail: 'Sections: Your Mission (role assignment), Key Hazards, On Arrival (approach steps), Do NOT (cert-level restrictions), and an Action Checklist.' },
      { step: 'Tap "I\'m On Scene" when you arrive', detail: 'Updates your status to ON SCENE and activates the full guidance view with checklist and AI Q&A.' },
      { step: 'Work through your checklist and ask AI questions as needed', detail: 'Check off items as you complete them. The progress bar tracks completion. Use the Ask AI panel for incident-specific questions.' },
      { step: 'Ask the AI a question', detail: 'Tap the input field at the bottom. Type a question like "What PPE for this incident?" or "Nearest hydrant location?" The AI responds with incident-specific and cert-appropriate answers.' },
      { step: 'Tap "Clear From Incident" when done', detail: 'Logs your cleared status, records your total on-scene time, and closes the guidance overlay. Your data feeds into department analytics.' },
    ],
    related: ['Dispatch & Command', 'CAD Integration', 'Training', 'Scenarios', 'Response Analytics'],
  },

  // ─── Customize My View / Preferences ────────────────────────────────────────
  'preferences': {
    name: 'Customize My View',
    group: 'General',
    overview: 'Personalize which dashboard widgets and sidebar navigation items appear when you log in. Hide modules you don\'t use and focus on what matters to your role. Preferences save to your account and sync across devices.',
    tips: [
      'Access Customize My View from the account dropdown in the top-right corner of the screen.',
      'Two tabs: Dashboard lets you toggle the 6 dashboard widget sections. Navigation lets you toggle sidebar menu items by group.',
      'Some items are locked and cannot be hidden: Dashboard, Command Center, Notifications, and Settings.',
      'Your preferences apply instantly — the sidebar and dashboard update as soon as you toggle a switch.',
      'Hidden widgets show a small reminder chip on the Dashboard so you don\'t forget they exist.',
      'Preferences save to both your browser (for instant loading) and the server (for sync across devices).',
    ],
    howTo: [
      { step: 'Click your name/avatar in the top-right header', detail: 'Opens the user account dropdown menu.' },
      { step: 'Select "Customize My View"', detail: 'Opens the preferences panel as a slide-over on the right side of the screen.' },
      { step: 'Toggle dashboard widgets on/off', detail: 'The Dashboard tab shows 6 widget sections (Stats, Alerts, Shifts, Active Incidents, Training, Quick Actions). Toggle any off to hide them.' },
      { step: 'Toggle navigation items on/off', detail: 'The Navigation tab shows all sidebar menu items grouped by section. Toggle off items you don\'t need.' },
      { step: 'Click Save Preferences', detail: 'Saves to both your browser and the server. Changes apply immediately.' },
    ],
    related: ['Dashboard', 'Station Settings'],
  },

  // ── Bulletin Board ──────────────────────────────────────────────────────────
  bulletins: {
    name: 'Bulletin Board',
    group: 'Administration',
    overview: 'The Department Bulletin Board is the central communication hub for non-emergency announcements, updates, and department-wide notices. Officers and chiefs can post bulletins with priority levels, categories, and pin important messages to the top. All members can view bulletins — it replaces the physical corkboard in the station.',
    features: [
      'Post department-wide announcements with title, content, category, and priority',
      'Category organization: General, Training, Operations, Safety, Administrative, Social',
      'Priority levels: Normal, Important, Urgent — with color-coded badges',
      'Pin important bulletins to the top of the board regardless of date',
      'Edit and delete own posts; chiefs can manage all posts',
      'Chronological feed with newest posts first (pinned posts always on top)',
      'Post count and category breakdown in the header stats',
    ],
    sections: [
      {
        title: 'Bulletin Categories',
        type: 'indicators',
        items: [
          { label: 'General', desc: 'Broad department news, schedule changes, facility updates, and miscellaneous announcements.' },
          { label: 'Training', desc: 'Upcoming training opportunities, course registrations, certification reminders, and training schedule changes.' },
          { label: 'Operations', desc: 'Operational changes, mutual aid updates, district coverage modifications, and response protocol updates.' },
          { label: 'Safety', desc: 'Safety bulletins, NIOSH alerts, exposure notifications, equipment recalls, and safety stand-downs.' },
          { label: 'Administrative', desc: 'Meeting minutes, election notices, policy updates, budget announcements, and administrative deadlines.' },
          { label: 'Social', desc: 'Department social events, birthdays, fundraiser announcements, and community involvement.' },
        ],
      },
      {
        title: 'Priority Levels',
        type: 'indicators',
        items: [
          { label: 'Normal (gray)', desc: 'Standard priority. Appears in the normal chronological feed.' },
          { label: 'Important (amber)', desc: 'Highlighted with an amber badge. Should be read promptly but is not time-critical.' },
          { label: 'Urgent (red)', desc: 'Red badge with emphasis styling. Used for time-sensitive items requiring immediate attention from all members.' },
        ],
      },
      {
        title: 'Creating & Managing Bulletins',
        type: 'text',
        content: 'Click + New Bulletin to compose a post. Enter a title, select a category (General, Training, Operations, Safety, Administrative, Social) and priority (Normal, Important, Urgent). Write the bulletin content in the text area. Toggle Pin to top if this should remain at the top of the board regardless of when it was posted. Officers and chiefs can create bulletins; all members can view them.',
      },
      {
        title: 'Pinning & Archiving',
        type: 'text',
        content: 'Pinned bulletins always appear at the top of the board, above the chronological feed. Use pinning sparingly — if everything is pinned, nothing stands out. Unpin bulletins when they are no longer current. Old bulletins remain visible in the feed indefinitely unless deleted by the author or a chief.',
      },
    ],
    tips: [
      'Use the Urgent priority sparingly — reserve it for safety bulletins, operational changes effective immediately, or time-critical deadlines. If everything is urgent, members stop paying attention.',
      'Pin the current month\'s meeting minutes and next drill schedule at the top of the board. Unpin last month\'s when you post the new ones.',
      'The Social category is great for building department culture — birthday announcements, family day info, and appreciation posts keep morale up.',
      'Safety bulletins should reference the source: "Per NIOSH Alert 2025-03..." or "Per Chief\'s standing order effective..."',
    ],
    howTo: [
      { step: 'Click + New Bulletin', detail: 'Open the bulletin creation form. Officers and chiefs only.' },
      { step: 'Set title and category', detail: 'Enter a clear, descriptive title. Select the category: General, Training, Operations, Safety, Administrative, or Social.' },
      { step: 'Set priority', detail: 'Choose Normal (standard), Important (amber badge), or Urgent (red badge). Use Urgent sparingly.' },
      { step: 'Write the content', detail: 'Compose the bulletin text. Be specific and actionable — "Next drill is Tuesday 7 PM, Topic: Water Supply" is better than "Drill next week."' },
      { step: 'Pin if needed', detail: 'Toggle Pin to keep this at the top of the board. Unpin when no longer current.' },
    ],
    related: ['Notifications', 'Event Calendar', 'SOG Library', 'Station Settings'],
  },

  // ── Fundraising Tracker ─────────────────────────────────────────────────────
  fundraising: {
    name: 'Fundraising',
    group: 'Administration',
    overview: 'The Fundraising Tracker manages your department\'s fundraising campaigns and individual donations. Track campaign goals, monitor progress with visual progress bars, and log every donation with donor details. Essential for volunteer departments that depend on community support — and for the transparency your donors deserve.',
    features: [
      'Campaign management with goal amount, start/end dates, and status tracking',
      'Visual progress bars showing raised vs. goal for each campaign',
      'Individual donation logging with donor name, amount, date, and payment method',
      'Campaign statuses: Planning, Active, Completed, Cancelled',
      'Two-tab interface: Campaigns overview and Donations ledger',
      'Stats dashboard: total raised, campaign count, average donation, donor count',
      'Auto-updates campaign totals when donations are logged',
      'Officer+ access required for campaign and donation management',
    ],
    sections: [
      {
        title: 'Campaign Statuses',
        type: 'indicators',
        items: [
          { label: 'Planning', desc: 'Campaign is being designed but not yet accepting donations. Use this phase to set goals and prepare materials.' },
          { label: 'Active', desc: 'Campaign is live and accepting donations. Progress bar shows raised vs. goal in real time.' },
          { label: 'Completed', desc: 'Campaign has ended. Total raised is final. Records retained for reporting and tax documentation.' },
          { label: 'Cancelled', desc: 'Campaign was cancelled before completion. Records retained for audit trail.' },
        ],
      },
      {
        title: 'Donation Fields',
        type: 'fields',
        items: [
          { name: 'Donor Name', desc: 'Individual or organization name. Use "Anonymous" for donors who prefer privacy.' },
          { name: 'Amount', desc: 'Dollar amount of the donation. Auto-added to the linked campaign total.' },
          { name: 'Date', desc: 'Date the donation was received. Important for tax year documentation.' },
          { name: 'Payment Method', desc: 'Cash, Check, Credit Card, Online, or Other. Useful for reconciliation.' },
          { name: 'Campaign', desc: 'Which campaign this donation supports. Selecting a campaign auto-updates its progress bar.' },
          { name: 'Notes', desc: 'Optional notes — donor contact info, dedication instructions, or thank-you letter status.' },
        ],
      },
      {
        title: 'Creating Campaigns & Logging Donations',
        type: 'text',
        content: 'Click + New Campaign to create a fundraising campaign. Set a name, description, goal amount, and start/end dates. The campaign starts in Planning status — change to Active when you begin accepting donations. Then click + New Donation to log individual contributions against that campaign. Each donation auto-updates the campaign\'s progress bar.',
      },
      {
        title: 'Reporting & Transparency',
        type: 'text',
        content: 'The stats dashboard at the top shows total funds raised across all campaigns, number of donors, and average donation size. Use this data for annual reports to your governing body and to demonstrate financial transparency to your community. Campaign records with donation details provide the documentation needed for 501(c)(3) tax reporting.',
      },
    ],
    tips: [
      'Set realistic campaign goals based on your department\'s historical fundraising. A "90% funded" progress bar motivates donors more than "15% funded" because the goal was unrealistic.',
      'Log every donation immediately — even small cash contributions. The complete ledger is essential for financial audits and tax documentation.',
      'Use the Notes field to track thank-you letter status: "Thank-you sent 3/15" helps ensure every donor gets acknowledged.',
      'The Completed status locks the campaign total. Close campaigns promptly once the drive ends so the final number is accurate.',
    ],
    howTo: [
      { step: 'Click + New Campaign', detail: 'Create a fundraising campaign with name, description, goal amount, and start/end dates.' },
      { step: 'Set the campaign to Active', detail: 'Change status from Planning to Active when you start accepting donations. The progress bar appears.' },
      { step: 'Log donations', detail: 'Click + New Donation. Enter donor name, amount, date, payment method, and link to a campaign. The campaign total updates automatically.' },
      { step: 'Monitor progress', detail: 'Watch the progress bar fill as donations come in. The stats dashboard shows department-wide totals.' },
      { step: 'Complete the campaign', detail: 'When the drive ends, change status to Completed. The final total is locked and the campaign moves to the completed view.' },
    ],
    related: ['Budget & Finance', 'Event Calendar', 'Bulletin Board', 'Reports & Export'],
  },

  // ── Cadet Program ───────────────────────────────────────────────────────────
  cadets: {
    name: 'Cadet Program',
    group: 'Personnel',
    overview: 'The Junior Firefighter / Cadet Program module tracks youth members aged 14–17 participating in your department\'s cadet or explorer program. Manage enrollment, rank progression, training hours, and guardian contacts. NJ law (N.J.S.A. 40A:14-95) permits junior members with restrictions — this module ensures those restrictions are documented and followed.',
    features: [
      'Cadet roster with age calculation, rank, status, and training hours',
      'Age auto-calculated from date of birth — flags cadets approaching 18',
      'Rank progression: Cadet Recruit → Cadet → Senior Cadet → Junior Lieutenant',
      'Training hour logging with running total per cadet',
      'Guardian/parent contact information per cadet',
      'Status tracking: Active, Inactive, Graduated (aged out or moved to regular membership)',
      'Officer+ access required for all cadet management functions',
    ],
    sections: [
      {
        title: 'Cadet Ranks',
        type: 'indicators',
        items: [
          { label: 'Cadet Recruit', desc: 'New cadet in orientation phase. Observation only — cannot participate in live operations.' },
          { label: 'Cadet', desc: 'Active cadet who has completed orientation. May participate in supervised training evolutions per department policy.' },
          { label: 'Senior Cadet', desc: 'Experienced cadet with significant training hours. May serve as a cadet mentor or crew leader during drills.' },
          { label: 'Junior Lieutenant', desc: 'Highest cadet rank. Assists officers with cadet program coordination and drill planning.' },
        ],
      },
      {
        title: 'Cadet Record Fields',
        type: 'fields',
        items: [
          { name: 'Name', desc: 'Full legal name of the cadet.' },
          { name: 'Date of Birth', desc: 'Used to auto-calculate age. System flags cadets within 6 months of turning 18 for transition planning.' },
          { name: 'Age', desc: 'Auto-calculated. NJ cadet programs typically require ages 14–17. Must be 18 to join as a regular member.' },
          { name: 'Rank', desc: 'Current cadet rank: Recruit, Cadet, Senior Cadet, or Junior Lieutenant.' },
          { name: 'Status', desc: 'Active (participating), Inactive (on leave), or Graduated (aged out or transitioned to regular membership).' },
          { name: 'Training Hours', desc: 'Running total of training hours logged for this cadet. Tracked separately from regular member hours.' },
          { name: 'Join Date', desc: 'Date the cadet enrolled in the program.' },
          { name: 'Guardian Name & Phone', desc: 'Parent/guardian contact information. Required for all cadets under 18.' },
        ],
      },
      {
        title: 'NJ Cadet Program Regulations',
        type: 'text',
        content: 'Under NJ law, junior members may participate in training activities appropriate to their age under direct supervision of an adult member. Junior members cannot respond to emergency incidents, enter hazardous environments, or operate apparatus. Departments should maintain a written junior member policy (see SOG Library) that documents age requirements, permitted activities, supervision ratios, and transition procedures at age 18.',
      },
      {
        title: 'Adding Cadets & Tracking Progress',
        type: 'text',
        content: 'Click + New Cadet to enroll a youth member. Enter their name, DOB (age auto-calculates), guardian contact info, and initial rank (typically Cadet Recruit). Log training hours as the cadet participates in drills and instruction. Advance their rank as they meet program milestones. When a cadet turns 18, change their status to Graduated and consider transitioning them to the regular Member Roster.',
      },
    ],
    tips: [
      'Always keep guardian contact information current. Parents must be reachable during all cadet activities.',
      'Track training hours separately from regular member hours. Cadet hours do not count toward LOSAP or department training minimums.',
      'When a cadet turns 18, proactively reach out about transitioning to regular membership. This is your recruitment pipeline — don\'t let trained cadets walk away.',
      'Create a Cadet Program SOG in the SOG Library that documents your department\'s specific age requirements, permitted activities, and supervision ratios.',
      'Consider awarding certificates at each rank advancement — it builds engagement and gives families something to celebrate.',
    ],
    howTo: [
      { step: 'Click + New Cadet', detail: 'Open the cadet enrollment form. Enter name, date of birth, guardian name/phone, and initial rank.' },
      { step: 'Age auto-calculates', detail: 'The system computes the cadet\'s age from DOB and flags those approaching 18 for transition planning.' },
      { step: 'Log training hours', detail: 'After each drill or training session, update the cadet\'s training hours. The running total appears on their record.' },
      { step: 'Advance rank', detail: 'When a cadet meets program milestones, edit their record and change rank: Recruit → Cadet → Senior Cadet → Junior Lieutenant.' },
      { step: 'Graduate at 18', detail: 'When a cadet turns 18, change status to Graduated. Offer transition to regular membership and add them to the Member Roster.' },
    ],
    related: ['Member Roster', 'Training', 'Recruitment & Onboarding', 'Drills & Courses'],
  },

  // ── Response Analytics ──────────────────────────────────────────────────────
  analytics: {
    name: 'Response Analytics',
    group: 'Operations',
    overview: 'Response Analytics visualizes your department\'s response time performance with monthly trend analysis. The module pulls data from the Incident Log to compute average turnout times (dispatch-to-arrival) and displays them as color-coded monthly bars against NFPA 1720 benchmarks for volunteer fire departments. Use this to identify trends, justify staffing decisions, and demonstrate improvement to your governing body.',
    features: [
      'Monthly average turnout time computed from incident records',
      'Color-coded performance bars: green (under 6 min), amber (6–9 min), red (over 9 min)',
      'NFPA 1720 benchmark reference for volunteer departments',
      'Trend visualization showing performance direction over time',
      'YTD average and best/worst month summary stats',
      'Auto-refreshes from incident data — no manual entry required',
    ],
    sections: [
      {
        title: 'NFPA 1720 Benchmarks (Volunteer Departments)',
        type: 'indicators',
        items: [
          { label: 'Urban (green) — under 6 minutes', desc: 'Target for departments in urban response zones (≥1,000 people/sq mi). 90% of calls should meet this standard.' },
          { label: 'Suburban (amber) — 6 to 9 minutes', desc: 'Target for departments in suburban zones (500–1,000 people/sq mi). Most NJ volunteer departments fall in this range.' },
          { label: 'Rural (red) — over 9 minutes', desc: 'Target for rural zones (<500 people/sq mi). Longer times expected due to distance, but still a benchmark to improve against.' },
        ],
      },
      {
        title: 'Performance Bar Colors',
        type: 'indicators',
        items: [
          { label: 'Green bar', desc: 'Monthly average is under 6 minutes — excellent performance meeting NFPA 1720 urban benchmark.' },
          { label: 'Amber bar', desc: 'Monthly average is 6–9 minutes — acceptable for suburban but improvement possible.' },
          { label: 'Red bar', desc: 'Monthly average exceeds 9 minutes — review station coverage, member availability, and response patterns.' },
        ],
      },
      {
        title: 'How Turnout Time Is Calculated',
        type: 'text',
        content: 'Turnout time is measured from dispatch time to first-unit arrival time for each incident in the Incident Log. Only incidents with both times recorded are included. The monthly average is the arithmetic mean of all qualifying incidents in that month. Incidents with missing dispatch or arrival times are excluded from the calculation.',
      },
      {
        title: 'Using Analytics for Improvement',
        type: 'text',
        content: 'Look for seasonal patterns: response times often increase in winter (weather delays) and summer (vacation staffing). If a specific month shows a spike, check incident details for outliers (e.g., a mutual aid call 20 miles away). Present trend data to your governing body to justify staffing requests, station improvements, or member incentive programs.',
      },
    ],
    tips: [
      'NFPA 1720 is the standard for volunteer departments — don\'t compare yourself to NFPA 1710 (career department) benchmarks. Volunteer response times are measured differently.',
      'A single long-distance mutual aid call can skew a month\'s average significantly. Look at the underlying incident data if a month looks unusually bad.',
      'This module is powerful for grant applications. "Our average turnout time improved from 8.2 to 6.7 minutes over 12 months" is a compelling metric for AFG and SAFER reviewers.',
      'Consider sharing quarterly analytics summaries with your governing body via the Bulletin Board — it demonstrates accountability and professionalism.',
    ],
    howTo: [
      { step: 'Navigate to Response Analytics', detail: 'Found in the Operations group in the sidebar. The dashboard loads automatically from your incident data.' },
      { step: 'Review monthly bars', detail: 'Each bar represents one month\'s average turnout time. Green = under 6 min, amber = 6–9 min, red = over 9 min.' },
      { step: 'Check summary stats', detail: 'The header shows YTD average, best month, and worst month. Use these for reports and presentations.' },
      { step: 'Identify trends', detail: 'Look at the direction of bars over time. Are you improving, stable, or declining? Seasonal patterns are normal.' },
      { step: 'Investigate spikes', detail: 'If a month shows red, check the Incident Log for that period. Look for outliers like long-distance mutual aid or severe weather.' },
    ],
    related: ['Incident Log', 'Dashboard', 'Reports & Export', 'Member Roster'],
  },

  // ── Retention Scoring ──────────────────────────────────────────────────────
  retention: {
    name: 'Retention Scoring',
    group: 'Personnel',
    overview: 'Retention Scoring computes an engagement score for every active member based on training activity, volunteer hours, tenure, and participation patterns. Members at risk of disengagement are flagged with suggested retention actions. This is a proactive tool — by the time a member formally resigns, the opportunity to retain them has usually passed.',
    features: [
      'Per-member engagement score (0–100) computed from multiple data sources',
      'Score factors: recent training records, volunteer hours, tenure length, probationary status',
      'Color-coded risk levels: Engaged (green), Moderate (amber), At Risk (red)',
      'Suggested retention actions for at-risk and moderate members',
      'Department-wide summary: average score, at-risk count, engaged percentage',
      'Fully client-side — no additional data entry required, scores computed from existing records',
    ],
    sections: [
      {
        title: 'Engagement Score Components',
        type: 'fields',
        items: [
          { name: 'Training Activity (40%)', desc: 'Based on recent training records — certifications earned, modules completed, exams passed, drills attended. Members with no training in 90+ days score lower.' },
          { name: 'Volunteer Hours (30%)', desc: 'Based on hours logged in the current year across all categories. More hours = higher score.' },
          { name: 'Tenure (20%)', desc: 'Length of service. Longer tenure contributes positively, but diminishing returns after 10+ years prevent the score from being dominated by seniority alone.' },
          { name: 'Probationary Status (10%)', desc: 'New probationary members receive a slight boost to account for their naturally lower hours and training. This prevents new members from being incorrectly flagged as at-risk.' },
        ],
      },
      {
        title: 'Risk Levels',
        type: 'indicators',
        items: [
          { label: 'Engaged (green) — 70–100', desc: 'Member is actively participating. No retention concern.' },
          { label: 'Moderate (amber) — 40–69', desc: 'Participation has declined or is below average. Proactive outreach recommended.' },
          { label: 'At Risk (red) — 0–39', desc: 'Member shows signs of disengagement. Direct officer intervention recommended before the member decides to leave.' },
        ],
      },
      {
        title: 'Suggested Retention Actions',
        type: 'text',
        content: 'For Moderate members: schedule a one-on-one conversation, offer training opportunities aligned to their interests, invite them to social events. For At Risk members: have the chief or a trusted officer reach out directly, ask about barriers to participation (schedule conflicts, family obligations, burnout), and discuss what would make them want to stay. Document all retention conversations.',
      },
      {
        title: 'How Scores Are Calculated',
        type: 'text',
        content: 'Scores are computed entirely on the client side from existing data in the Training Management, Volunteer Hours, and Member Roster modules. No additional data entry is needed. Scores update in real time as new records are added. The algorithm weights recent activity more heavily than historical — a member who was very active last year but has gone silent for 3 months will see their score decline.',
      },
    ],
    tips: [
      'Check Retention Scoring monthly at your officers meeting. Catching a declining member early is far more effective than a last-ditch effort after they\'ve already disengaged.',
      'Don\'t treat scores as absolute truth. A member with a "Moderate" score who just had a baby or started a new job may be temporarily less active — context matters.',
      'The biggest retention factor in volunteer fire service is feeling valued. A phone call asking "How are you doing? We miss you at drills" is often all it takes.',
      'Track retention outcomes informally: "Talked to Smith on 3/15, he\'s dealing with a work schedule change. Offered Tuesday night drills instead." The Bulletin Board or Station Log can document this.',
      'New probationary members get a scoring boost so they aren\'t falsely flagged. Monitor their actual engagement separately during the probationary period.',
    ],
    howTo: [
      { step: 'Navigate to Retention Scoring', detail: 'Found in the Personnel group in the sidebar. Scores load automatically from existing department data.' },
      { step: 'Review the summary', detail: 'The header shows department-wide average score, number of at-risk members, and percentage who are engaged.' },
      { step: 'Identify at-risk members', detail: 'Members with red scores (0–39) need immediate attention. Amber (40–69) members should be monitored and receive proactive outreach.' },
      { step: 'Review suggested actions', detail: 'Each at-risk and moderate member shows suggested retention actions. Use these as starting points for officer outreach.' },
      { step: 'Take action and follow up', detail: 'Reach out to flagged members. Document conversations. Revisit scores monthly to track whether engagement is improving.' },
    ],
    related: ['Member Roster', 'Training', 'Volunteer Hours', 'Recruitment & Onboarding'],
  },

  // ── Real-Time Availability ──────────────────────────────────────────────────
  availability: {
    name: 'Real-Time Availability',
    group: 'Personnel',
    overview: 'The Real-Time Availability widget lets members toggle their response availability status — Available or Unavailable — with a single tap. The department-wide availability count gives officers and chiefs an instant picture of how many members are ready to respond right now. The widget auto-refreshes every 30 seconds to stay current.',
    features: [
      'One-tap toggle: Available (green) or Unavailable (gray)',
      'Department-wide count of available members in real time',
      'Auto-refreshes every 30 seconds — no manual reload needed',
      'Per-member availability list showing who is available and when they last updated',
      'Compact mode for Dashboard embedding — shows count only',
      'Full mode as a standalone page — shows the complete member list',
    ],
    sections: [
      {
        title: 'Availability Statuses',
        type: 'indicators',
        items: [
          { label: 'Available (green)', desc: 'Member is ready and able to respond to a call right now.' },
          { label: 'Unavailable (gray)', desc: 'Member is not available — at work, out of district, sleeping, or otherwise unable to respond.' },
        ],
      },
      {
        title: 'How It Works',
        type: 'text',
        content: 'Each member\'s availability is stored as a simple on/off toggle tied to their user account. When you toggle to Available, your name appears green on the availability board and the department count goes up. When you toggle to Unavailable, you drop from the count. The system polls the server every 30 seconds to keep the list current across all devices.',
      },
      {
        title: 'Dashboard Widget vs. Full Page',
        type: 'text',
        content: 'The compact widget on the Dashboard shows just the total count of available members and your own toggle. The full page (under Personnel) shows the complete list of all members with their current status and last-updated timestamp. Both update automatically.',
      },
    ],
    tips: [
      'Toggle your availability when you wake up and before you go to bed — it takes one tap and gives your officers accurate coverage data.',
      'Officers: check the availability count before issuing a recall. If you already have 8 members available, a Standby Alert may be sufficient instead of a Full Department Recall.',
      'Availability is separate from the Duty Schedule. The schedule shows who is assigned; availability shows who can actually respond right now.',
      'The 30-second auto-refresh means the count is always nearly real-time. No need to manually reload the page.',
    ],
    howTo: [
      { step: 'Find the availability toggle', detail: 'The toggle appears on the Dashboard (compact mode) or navigate to the full Availability page under Personnel.' },
      { step: 'Tap Available or Unavailable', detail: 'Green = you\'re ready to respond. Gray = you\'re not available. Your status updates across all devices immediately.' },
      { step: 'Check department coverage', detail: 'The count at the top shows how many members are currently available. Officers use this to assess coverage.' },
      { step: 'View the full list', detail: 'On the full Availability page, see every member\'s status and when they last updated. Useful for officers planning coverage.' },
    ],
    related: ['Dashboard', 'Duty Schedule', 'Recall / All-Call', 'Member Roster'],
  },

  // ── Career & Full-Service Modules ──────────────────────────────────────────

  'daily-staffing': {
    name: 'Daily Staffing Board',
    group: 'Operations',
    overview: 'Real-time view of who is on shift today. Displays minimum crew requirements, apparatus assignments, and coverage gaps. Drag-and-drop member assignment for shift commanders.',
    features: [
      'Real-time shift roster with minimum crew indicators (green/amber/red)',
      'Drag-and-drop member assignment to apparatus positions',
      'Quick Fill auto-assignment based on qualifications and availability',
      'Date picker to view past or future shift days',
      'Coverage gap alerts when staffing falls below configured thresholds',
      'Direct integration with AI Staffing Predictor for trend analysis',
    ],
    tips: [
      'The minimum crew indicator turns red when staffing drops below the configured threshold.',
      'Use the Quick Fill button to auto-assign available members to open slots based on qualifications.',
      'Daily staffing data feeds directly into the AI Staffing Predictor for trend analysis.',
    ],
    howTo: [
      { step: 'View today\'s staffing', detail: 'The board loads with the current date\'s shift automatically. Use the date picker to view past or future days.' },
      { step: 'Assign members to positions', detail: 'Drag members from the available pool to apparatus positions, or use the dropdown selectors.' },
      { step: 'Check coverage status', detail: 'The header shows green/amber/red based on whether minimum crew requirements are met per apparatus.' },
    ],
    related: ['Duty Schedule', 'Shift Trades', 'Apparatus Assignments', 'Availability'],
  },

  'personnel-actions': {
    name: 'Personnel Actions',
    group: 'Personnel',
    overview: 'Track all formal personnel actions: promotions, disciplinary actions, certifications earned, leaves of absence, probation completions, and more. Each action is linked to a specific member with full audit trail.',
    features: [
      'Full action type library: promotions, discipline, certifications, LOA, probation, transfers',
      'Permanent audit trail — actions cannot be deleted, only superseded',
      'JSONB details field for extended documentation',
      'Filter by member, action type, date range, or status',
      'Link to originating member record for cross-reference',
    ],
    tips: [
      'All personnel actions are permanently recorded and cannot be deleted — only marked as superseded.',
      'Use the details field (JSONB) for extended notes that don\'t fit in the description.',
      'Filter by action type to quickly find all promotions, all disciplinary actions, etc.',
    ],
    howTo: [
      { step: 'Create a new action', detail: 'Click New Action, select the member, choose the action type, set the date, and provide a description.' },
      { step: 'View member history', detail: 'Filter by member name to see their complete personnel action timeline.' },
      { step: 'Track status', detail: 'Actions can be active, superseded, or rescinded. Update status as situations change.' },
    ],
    related: ['Member Roster', 'Member Portal', 'Grievance Tracker'],
  },

  'training-plans': {
    name: 'Training Plans',
    group: 'Training',
    overview: 'Create and manage structured training curricula for individuals or groups. Define learning objectives, required courses, drills, and timelines. Track completion progress per plan.',
    features: [
      'Structured curricula with learning objectives, courses, drills, and timelines',
      'Per-member progress tracking with completion percentages',
      'Probationary onboarding checklists for new members',
      'Auto-link to qualification requirements for seamless tracking',
      'AI Training Recommender integration for personalized plan generation',
      'Overdue item flagging with red status indicators',
    ],
    tips: [
      'Assign training plans to probationary members as part of their onboarding checklist.',
      'Link plans to specific qualification requirements so completion auto-updates the member\'s qualifications.',
      'Use the AI Training Recommender to generate personalized training plans based on gap analysis.',
    ],
    howTo: [
      { step: 'Create a plan', detail: 'Click New Plan, name it, set a target completion date, and add training items (courses, drills, certifications).' },
      { step: 'Assign to members', detail: 'Select which members or groups need to complete this plan. Each member gets their own progress tracker.' },
      { step: 'Monitor progress', detail: 'The dashboard shows completion percentage per member. Overdue items are flagged in red.' },
    ],
    related: ['Training Management', 'Drills & Courses', 'Qualifications', 'AI Training Recommender'],
  },

  qualifications: {
    name: 'Qualifications Manager',
    group: 'Training',
    overview: 'Track certifications, licenses, and qualifications for all members. Monitors expiration dates and sends automatic alerts when renewals are approaching. Supports NJ-specific certifications and NFPA standards.',
    features: [
      'Certification and license tracking with issue and expiration dates',
      'Automated alerts at 90, 60, and 30 days before expiration',
      'Bulk-assign required qualifications by rank or role',
      'NJ-specific certification types and NFPA standard support',
      'Exportable qualification matrix for ISO audits and state reporting',
      'Integration with Training Plans for auto-completion tracking',
    ],
    tips: [
      'Expiration alerts fire 90 days, 60 days, and 30 days before a qualification expires.',
      'Bulk-assign required qualifications to all members of a specific rank or role.',
      'Export qualification matrices for ISO audits and state reporting.',
    ],
    howTo: [
      { step: 'Add a qualification', detail: 'Click Add Qualification, select the member, choose the qualification type, set issue and expiration dates.' },
      { step: 'View expiring soon', detail: 'The dashboard highlights qualifications expiring within 90 days in amber and within 30 days in red.' },
      { step: 'Generate compliance report', detail: 'Use the Export button to generate a qualification matrix showing all members vs. all required certifications.' },
    ],
    related: ['Training Management', 'Member Portal', 'Health & Wellness', 'ISO Grading Report'],
  },

  'exposure-tracking': {
    name: 'Exposure & Safety Records',
    group: 'Personnel',
    overview: 'OSHA-compliant hazardous exposure documentation. Track chemical, biological, thermal, and radiological exposures per member per incident. Supports long-term occupational health monitoring.',
    features: [
      'Chemical, biological, thermal, and radiological exposure types',
      'Per-member, per-incident exposure logging with substance and duration details',
      'PPE documentation for each exposure event',
      'Longitudinal health monitoring integration with Health & Wellness',
      'Bulk entry for multi-responder incidents',
      'OSHA-compliant export for annual reporting',
    ],
    tips: [
      'Every exposure record links to the originating incident for full traceability.',
      'Exposure data feeds into the member\'s Health & Wellness profile for longitudinal tracking.',
      'Use the bulk-entry feature after major incidents to quickly log exposures for all responders.',
    ],
    howTo: [
      { step: 'Log an exposure', detail: 'Click New Record, select the member, choose exposure type, link to the incident, and document the substance, duration, and PPE worn.' },
      { step: 'Review member history', detail: 'Filter by member to see their complete exposure history across all incidents.' },
      { step: 'Generate OSHA reports', detail: 'Export exposure records in OSHA-compliant format for annual reporting.' },
    ],
    related: ['Health & Wellness', 'Incident Log', 'HazMat Tracker'],
  },

  assignboard: {
    name: 'Apparatus Assignment Board',
    group: 'Operations',
    overview: 'Per-shift crew assignment board. Assign members to specific apparatus and riding positions for each shift. Ensures minimum staffing per unit and tracks position qualifications.',
    features: [
      'Per-apparatus riding position assignments (officer, driver, firefighter)',
      'Color-coded qualification indicators per position',
      'Drag-and-drop member assignment from available pool',
      'Syncs with Daily Staffing for real-time consistency',
      'Printable assignment board for apparatus bay posting',
      'Shift pattern selector for multi-day planning',
    ],
    tips: [
      'Color-coded positions show whether the assigned member holds the required qualifications.',
      'The board syncs with Daily Staffing so changes propagate immediately.',
      'Print the assignment board for posting in the apparatus bay.',
    ],
    howTo: [
      { step: 'Select a shift', detail: 'Choose the shift date and shift pattern from the top bar.' },
      { step: 'Assign members', detail: 'Drag members from the available pool to apparatus positions (officer, driver, firefighter, etc.).' },
      { step: 'Verify compliance', detail: 'Green checkmarks indicate the member is qualified for the position. Yellow warnings indicate missing certifications.' },
    ],
    related: ['Daily Staffing', 'Duty Schedule', 'Apparatus Tracker', 'Qualifications'],
  },

  'apparatus-oos': {
    name: 'Apparatus Out-of-Service',
    group: 'Apparatus',
    overview: 'Track apparatus that are temporarily out of service due to maintenance, damage, or other reasons. Includes expected return dates, impact on staffing, and notification to officers.',
    features: [
      'OOS status tracking with reason codes and expected return dates',
      'Automatic Dashboard and TV Display status updates',
      'Overdue return-to-service alerts',
      'Daily Staffing position adjustment based on OOS apparatus',
      'Full OOS history log with durations and reasons',
    ],
    tips: [
      'OOS entries automatically update the apparatus status on the Dashboard and TV Display.',
      'Set expected return dates so the system can alert you when a unit is overdue for return to service.',
      'The Daily Staffing Board adjusts available positions based on OOS apparatus.',
    ],
    howTo: [
      { step: 'Mark apparatus OOS', detail: 'Click New OOS Entry, select the apparatus, provide the reason, and set an expected return date.' },
      { step: 'Return to service', detail: 'Click the Return to Service button on the entry. This restores the apparatus status and clears the OOS flag.' },
      { step: 'View history', detail: 'The log shows all current and past OOS entries with durations and reasons.' },
    ],
    related: ['Apparatus Tracker', 'Maintenance Log', 'Daily Staffing'],
  },

  'equipment-checkout': {
    name: 'Equipment Checkout',
    group: 'Apparatus',
    overview: 'Track equipment checked out to members: radios, thermal imagers, gas detectors, tools, and other portable equipment. Manages expected return dates, condition tracking, and overdue alerts.',
    features: [
      'Checkout/return tracking for radios, TICs, gas detectors, tools, and more',
      'Expected return dates with automatic overdue flagging',
      'Condition tracking at both checkout and return',
      'Barcode/serial number equipment identification',
      'Notification integration for overdue items',
    ],
    tips: [
      'Overdue items are flagged automatically and appear in the Notifications module.',
      'Condition is tracked at checkout and return to catch equipment damage early.',
      'Use the barcode/serial number field for positive equipment identification.',
    ],
    howTo: [
      { step: 'Check out equipment', detail: 'Click New Checkout, select the item, enter the purpose, and set an expected return date.' },
      { step: 'Return equipment', detail: 'Find the checkout entry and click Return. Note the condition on return.' },
      { step: 'View overdue items', detail: 'The Overdue filter shows all items past their expected return date.' },
    ],
    related: ['Asset & Inventory', 'Apparatus Tracker', 'Notifications'],
  },

  'aid-agreements': {
    name: 'Mutual Aid Agreements',
    group: 'Operations',
    overview: 'Manage formal mutual aid agreements with neighboring departments. Track agreement terms, effective dates, renewal schedules, and authorized personnel. Distinct from the Mutual Aid Log which tracks actual aid events.',
    features: [
      'Agreement management with partner departments, terms, and effective dates',
      'Automatic renewal reminders 90 days before expiration',
      'Link to Mutual Aid Log entries for compliance tracking',
      'Document Vault integration for signed agreement storage',
      'Current and expired agreement history with full terms',
    ],
    tips: [
      'Set renewal reminders so agreements don\'t lapse unexpectedly.',
      'Link agreements to mutual aid log entries for compliance tracking.',
      'Store signed agreement documents in the Document Vault with a reference link.',
    ],
    howTo: [
      { step: 'Create an agreement', detail: 'Click New Agreement, enter the partner department, terms, effective date, and expiration date.' },
      { step: 'Track renewals', detail: 'Expiring agreements appear in the Notifications module 90 days before expiration.' },
      { step: 'View history', detail: 'See all current and expired agreements with full terms and renewal history.' },
    ],
    related: ['Mutual Aid Log', 'Document Vault', 'Incident Log'],
  },

  'after-action': {
    name: 'After Action Reports',
    group: 'Operations',
    overview: 'Structured post-incident reviews covering what went well, what needs improvement, and action items. Links to the originating incident for full context. Supports the continuous improvement cycle.',
    features: [
      'Structured review with strengths, areas for improvement, and lessons learned',
      'Action items with assignable members and due dates',
      'Link to originating incident record for full context',
      'AI Report Writer integration for draft generation',
      'Action item completion tracking dashboard',
    ],
    tips: [
      'Complete after-action reports within 72 hours while details are fresh.',
      'Assign action items to specific members with due dates for accountability.',
      'The AI Report Writer can draft an initial after-action report from incident data.',
    ],
    howTo: [
      { step: 'Create a report', detail: 'Click New Report, link to the incident, and fill in the strengths, areas for improvement, and lessons learned sections.' },
      { step: 'Add action items', detail: 'Create specific, assignable action items with responsible members and due dates.' },
      { step: 'Track completion', detail: 'Action items show completion status. Mark them done as improvements are implemented.' },
    ],
    related: ['Incident Log', 'AI Report Writer', 'Training Plans'],
  },

  'incident-costs': {
    name: 'Incident Cost Tracking',
    group: 'Operations',
    overview: 'Calculate and track the full cost of incident responses: apparatus hours, personnel time, materials consumed, and other expenses. Generate invoices for billable incidents (hazmat, motor vehicle, etc.).',
    features: [
      'Itemized cost tracking: apparatus hours, personnel time, materials, other expenses',
      'Standard rate tables for consistent billing',
      'Invoice generation for billable incidents (hazmat, MVA, etc.)',
      'Insurance claim and township reimbursement export',
      'Automatic incident record linking for date, type, and location pre-fill',
      'Payment status tracking for sent, received, and paid invoices',
    ],
    tips: [
      'Use standard rate tables for apparatus and personnel to ensure consistent billing.',
      'Export cost summaries for insurance claims and township reimbursement requests.',
      'Link to the incident record for automatic pre-fill of date, type, and location.',
    ],
    howTo: [
      { step: 'Create a cost record', detail: 'Click New Cost Record, link to the incident, and itemize apparatus costs, personnel costs, materials, and other expenses.' },
      { step: 'Generate an invoice', detail: 'For billable incidents, click Generate Invoice to create a formatted document with all cost breakdowns.' },
      { step: 'Track payment', detail: 'Update the payment status as invoices are sent, received, or paid.' },
    ],
    related: ['Incident Log', 'Budget & Finance', 'Reports & Export'],
  },

  timesheets: {
    name: 'Timesheets',
    group: 'Career & Workforce',
    overview: 'Period-based timesheet management for career and combination departments. Tracks regular hours, overtime, leave, and trade hours per member per pay period. Integrates with FLSA 207(k) compliance calculations.',
    features: [
      'Period-based timesheets with configurable pay period dates',
      'Hour categories: regular, overtime, leave, and trade hours',
      'Auto-calculated total hours from all components',
      'FLSA period linking for 207(k) OT threshold tracking',
      'Draft → Submitted → Approved workflow',
      'Payroll-ready export for all approved timesheets in a period',
    ],
    tips: [
      'Timesheets auto-calculate total hours from regular + OT + leave + trade components.',
      'The FLSA period field links each timesheet to the correct 207(k) work period for OT threshold calculation.',
      'Draft timesheets can be edited freely; submitted timesheets require officer approval to modify.',
    ],
    howTo: [
      { step: 'Create a timesheet', detail: 'Click New Timesheet, select the member and pay period dates. Enter hours by category.' },
      { step: 'Submit for approval', detail: 'Change status from Draft to Submitted. The approving officer will review and approve or return for corrections.' },
      { step: 'Export for payroll', detail: 'Use the Export button to generate payroll-ready data for all approved timesheets in a period.' },
    ],
    related: ['FLSA Overtime', 'Payroll & Stipends', 'OT Equalization', 'Duty Schedule'],
  },

  flsa: {
    name: 'FLSA 207(k) Overtime',
    group: 'Career & Workforce',
    overview: 'FLSA Section 207(k) compliance dashboard for fire departments. Configure work periods (7/14/21/28 days), set OT thresholds per period length, and track hours against FLSA limits. Ensures legal compliance for career departments.',
    features: [
      'Configurable work periods: 7, 14, 21, or 28 days',
      'Automatic OT threshold calculation per period length (53/106/159/212 hours)',
      'Per-member hours tracking against FLSA limits',
      'Exception flagging for members approaching or exceeding OT thresholds',
      'Station Settings integration for department-wide work period configuration',
      'Compliance dashboard with visual indicators',
    ],
    tips: [
      'The 207(k) exemption allows work periods up to 28 days instead of the standard 40-hour week.',
      'OT thresholds vary by work period length: 53 hours for 7 days, 106 for 14, 159 for 21, 212 for 28.',
      'Configure your work period in Station Settings. All timesheets and OT calculations reference this setting.',
    ],
    howTo: [
      { step: 'Configure work period', detail: 'Go to Station Settings and set the FLSA work period length (7, 14, 21, or 28 days).' },
      { step: 'View compliance', detail: 'The dashboard shows each member\'s hours against the OT threshold for the current period.' },
      { step: 'Review exceptions', detail: 'Members approaching or exceeding the OT threshold are flagged for review.' },
    ],
    related: ['Timesheets', 'OT Equalization', 'Payroll & Stipends', 'Station Settings'],
  },

  'ot-equalization': {
    name: 'OT Equalization',
    group: 'Career & Workforce',
    overview: 'Fair overtime distribution tracking. Monitors OT hours per member to ensure equitable assignment. Ranks members by total OT hours so the next overtime assignment goes to the member with the fewest hours.',
    features: [
      'Member ranking by accumulated OT hours (lowest to highest)',
      'Automatic feed from OT Records module',
      'Next-in-line indicator for fair OT assignment',
      'Fiscal year / contract period counter reset',
      'Union reporting export for contract compliance',
    ],
    tips: [
      'The equalization board ranks members from fewest to most OT hours — assign from the top.',
      'OT records feed automatically from the OT Records module.',
      'Reset the equalization counter at the start of each fiscal year or contract period.',
    ],
    howTo: [
      { step: 'View the board', detail: 'Members are listed in order of accumulated OT hours, lowest first. The next person in line for OT is at the top.' },
      { step: 'Record OT', detail: 'When overtime is worked, log it in OT Records. The equalization board updates automatically.' },
      { step: 'Export for union reporting', detail: 'Export the equalization data for contract compliance documentation.' },
    ],
    related: ['Timesheets', 'FLSA Overtime', 'Duty Schedule'],
  },

  'policy-acks': {
    name: 'Policy Sign-offs',
    group: 'Administration',
    overview: 'Track member acknowledgment of department policies, SOGs, and directives. Publish policies and track who has read and signed off. Essential for compliance and liability documentation.',
    features: [
      'Publish policies with targeted sign-off requirements',
      'Automated notifications when new policies require acknowledgment',
      'Timestamped sign-off recording for audit trail',
      'Completion percentage dashboard per policy',
      'Outstanding acknowledgment tracking with member list',
      'Export sign-off reports for audits',
    ],
    tips: [
      'Members receive a notification when a new policy requires their sign-off.',
      'Unsigned policies are highlighted in the member\'s portal and in Notifications.',
      'Export sign-off reports for audits showing who signed, when, and any outstanding acknowledgments.',
    ],
    howTo: [
      { step: 'Publish a policy', detail: 'Officers: create a new policy acknowledgment request, attach the document, and select which members need to sign.' },
      { step: 'Sign a policy', detail: 'Members: open the policy, read it, and click Acknowledge to record your sign-off with timestamp.' },
      { step: 'Track compliance', detail: 'The dashboard shows completion percentage and lists members who haven\'t yet acknowledged.' },
    ],
    related: ['SOG Library', 'Document Vault', 'Notifications', 'Member Portal'],
  },

  'meeting-minutes': {
    name: 'Meeting Minutes',
    group: 'Administration',
    overview: 'Record and manage department meeting minutes. Capture attendees, agenda items, motions with votes, action items with assignments, and general notes. Supports regular, special, and emergency meeting types.',
    features: [
      'Meeting types: regular, special, and emergency',
      'Attendee tracking from member roster',
      'Motion recording with mover, seconder, and vote results',
      'Action items with assignable members and due dates',
      'Template feature for recurring meeting agendas',
      'Cross-reference links to incidents, training, and budget records',
    ],
    tips: [
      'Link meeting minutes to related incident records, training events, or budget decisions for cross-reference.',
      'Action items from meetings can be assigned to specific members with due dates.',
      'Use the template feature to pre-populate recurring meeting agendas.',
    ],
    howTo: [
      { step: 'Create minutes', detail: 'Click New Minutes, set the meeting date, type, and location. Add attendees from the member roster.' },
      { step: 'Record motions', detail: 'Add each motion with who moved, who seconded, and the vote result.' },
      { step: 'Assign action items', detail: 'Create action items with responsible members and due dates. These appear in the assigned member\'s notifications.' },
    ],
    related: ['Member Roster', 'Document Vault', 'Bulletin Board'],
  },

  'doc-vault': {
    name: 'Document Vault',
    group: 'Administration',
    overview: 'Central repository for department documents: policies, agreements, insurance certificates, apparatus titles, building plans, and any other files. Organized by category with search and version tracking.',
    features: [
      'Category-organized document repository',
      'Version tracking with superseded document history',
      'Full-text search across all stored documents',
      'Cross-module document linking (apparatus, mutual aid, etc.)',
      'Upload with title, description, and category tagging',
    ],
    tips: [
      'Upload the latest version of each document and mark the previous version as superseded.',
      'Use categories consistently so documents are easy to find during audits.',
      'Link documents to relevant modules (e.g., insurance certs to apparatus, agreements to mutual aid).',
    ],
    howTo: [
      { step: 'Upload a document', detail: 'Click Upload, select the file, choose a category, add a title and description.' },
      { step: 'Search for documents', detail: 'Use the search bar or category filter to find specific documents quickly.' },
      { step: 'Manage versions', detail: 'Upload a new version of an existing document. The system maintains the version history.' },
    ],
    related: ['SOG Library', 'Policy Sign-offs', 'Mutual Aid Agreements'],
  },

  grievances: {
    name: 'Grievance Tracker',
    group: 'Administration',
    overview: 'Step-based grievance workflow from filing through resolution. Supports multiple grievance types (working conditions, training, scheduling, disciplinary, etc.) with a formal review process at each step.',
    features: [
      'Multi-step workflow: Filing → Officer Review → Chief Review → Resolution',
      'Grievance types: working conditions, training, scheduling, disciplinary, and more',
      'Permanent action and note logging for legal documentation',
      'Status tracking: active, superseded, rescinded',
      'Resolution recording with date and detailed notes',
    ],
    tips: [
      'Each grievance moves through defined steps: Filing, Officer Review, Chief Review, Resolution.',
      'All actions and notes are permanently logged for legal documentation.',
      'Keep resolution notes detailed — they become the official record if the grievance escalates.',
    ],
    howTo: [
      { step: 'File a grievance', detail: 'Click New Grievance, select the filing member, choose the type, and provide the subject and description.' },
      { step: 'Advance through steps', detail: 'Update the current step as the grievance moves through the review process. Add notes at each step.' },
      { step: 'Resolve', detail: 'Enter the resolution details, set the resolved date, and mark the grievance as resolved.' },
    ],
    related: ['Personnel Actions', 'Member Roster', 'Meeting Minutes'],
  },

  'shift-trades': {
    name: 'Shift Trades',
    group: 'Operations',
    overview: 'Member-to-member shift trade management. Request, approve, and track shift swaps with payback scheduling. Includes FLSA impact tracking to ensure trades don\'t push members over OT thresholds.',
    features: [
      'Trade request and approval workflow',
      'Dual acknowledgment — both requesting and covering members must confirm',
      'FLSA impact calculator showing period hours for both members',
      'Payback date scheduling and completion tracking',
      'Officer review with staffing impact analysis',
      'Full trade history and status log',
    ],
    tips: [
      'Both the requesting and covering member must acknowledge the trade before officer approval.',
      'The FLSA impact calculator shows how the trade affects both members\' period hours.',
      'Payback dates should be set at the time of the trade to ensure accountability.',
    ],
    howTo: [
      { step: 'Request a trade', detail: 'Click New Trade, select the shift you want covered, choose the covering member, and propose a payback date.' },
      { step: 'Approve/deny', detail: 'Officers review pending trades and approve or deny based on staffing impact and FLSA considerations.' },
      { step: 'Track payback', detail: 'The system tracks whether payback shifts have been completed.' },
    ],
    related: ['Duty Schedule', 'Daily Staffing', 'FLSA Overtime', 'Timesheets'],
  },

  // ── AI Modules ────────────────────────────────────────────────────────────

  'data-ingest': {
    name: 'AI Data Ingestion',
    group: 'AI & Tools',
    overview: 'AI-powered data migration tool that accepts any data format — CSV, JSON, freeform text, messy spreadsheet data — and uses AI to detect the format, map columns to the target schema, transform the data, and import it into the correct database table. 6-step wizard interface.',
    features: [
      '6-step wizard: Select Target → Provide Data → AI Analysis → Column Mapping → Transform → Import',
      'Accepts CSV, JSON, freeform text, and messy spreadsheet data',
      'AI-powered format detection and column mapping with confidence indicators',
      'Source description input for better AI understanding of abbreviations',
      'Supports Members, Incidents, Training, Apparatus, Hydrants, and Qualifications tables',
      'Preview transformed data before final import',
    ],
    tips: [
      'Paste data directly or upload a file — the AI handles format detection automatically.',
      'Provide a source description (e.g., "export from our old Firehouse Software") to help the AI understand abbreviations and column naming conventions.',
      'Review the column mapping carefully before transforming — the AI shows confidence levels for each mapping.',
      'Supports importing into: Members, Incidents, Training, Apparatus, Hydrants, and Qualifications tables.',
    ],
    howTo: [
      { step: 'Select target', detail: 'Choose which data type you\'re importing (Members, Incidents, Training, etc.).' },
      { step: 'Provide data', detail: 'Paste your data or upload a file. Add a description of the data source for better AI accuracy.' },
      { step: 'Review AI analysis', detail: 'The AI proposes column mappings with confidence indicators. Adjust any incorrect mappings using the dropdowns.' },
      { step: 'Transform and import', detail: 'Click Transform to convert the data, preview the results, then Import to write to the database.' },
    ],
    related: ['Data Import', 'Member Roster', 'Incident Log', 'Training Management'],
  },

  'incident-intel': {
    name: 'AI Incident Intelligence',
    group: 'AI & Tools',
    overview: 'AI-powered post-incident analysis. Identifies trends, risk patterns, and operational insights from your incident data. Generates area risk scores, response time analysis, and predictive hotspot mapping.',
    features: [
      'Trend identification from historical incident data',
      'Area risk scoring and predictive hotspot mapping',
      'Response time analysis and benchmarking',
      'Date range selection for focused analysis',
      'Exportable insights for board and township presentations',
      'Recommendations for resource allocation and pre-plan updates',
    ],
    tips: [
      'The more complete your incident records, the more accurate the AI analysis becomes.',
      'Run monthly intelligence reports to track emerging trends in your response area.',
      'Use the risk scoring data to inform pre-plan updates and resource allocation decisions.',
    ],
    howTo: [
      { step: 'Generate analysis', detail: 'Select a date range and click Analyze. The AI processes all incidents in the period.' },
      { step: 'Review insights', detail: 'The dashboard shows trend charts, risk scores, and specific recommendations.' },
      { step: 'Export findings', detail: 'Export the analysis for presentations to the board or township council.' },
    ],
    related: ['Incident Log', 'Response Analytics', 'Pre-Incident Plans', 'AI Report Writer'],
  },

  'training-ai': {
    name: 'AI Training Recommender',
    group: 'AI & Tools',
    overview: 'Personalized training recommendations based on each member\'s certification gaps, career goals, department needs, and upcoming qualification expirations. Suggests specific courses, drills, and learning paths.',
    features: [
      'Gap analysis across qualifications, training history, and department requirements',
      'Priority ranking: expiring certifications and required-but-missing qualifications first',
      'Per-member or department-wide analysis',
      'Direct conversion of recommendations to Training Plans',
      'Suggested courses, drills, and learning paths with rationale',
    ],
    tips: [
      'The AI cross-references qualifications, training history, and department requirements to find gaps.',
      'Recommendations prioritize expiring certifications and required-but-missing qualifications.',
      'Generated training plans can be saved directly to the Training Plans module.',
    ],
    howTo: [
      { step: 'Select a member', detail: 'Choose a member to analyze, or select "All Members" for a department-wide gap analysis.' },
      { step: 'Review recommendations', detail: 'The AI lists recommended training with priority levels and rationale for each.' },
      { step: 'Create a plan', detail: 'Click "Create Training Plan" to convert recommendations into an actionable plan with deadlines.' },
    ],
    related: ['Training Management', 'Qualifications', 'Training Plans', 'Drills & Courses'],
  },

  'report-writer': {
    name: 'AI Report Writer',
    group: 'AI & Tools',
    overview: 'Automated report generation from structured data. Creates after-action summaries, board presentations, and annual reports. Generates professional prose from database records. Note: incident narratives are NOT AI-generated — the officer writes those directly in the incident record.',
    features: [
      'Report types: after-action summary, board report, annual report',
      'AI-generated professional prose from database records',
      'Multi-incident combination into single summary reports',
      'Audience-tailored output formatting (board, township, internal)',
      'Export as PDF or Word document',
    ],
    tips: [
      'Select the report type first — the AI tailors its output format to the audience (board, township, internal).',
      'Review and edit the generated text before finalizing — AI provides a strong first draft, not a final product.',
      'The AI can combine data from multiple incidents into a single summary report.',
    ],
    howTo: [
      { step: 'Choose report type', detail: 'Select from after-action summary, board report, annual report, etc. (Incident narratives are officer-written, not AI-generated.)' },
      { step: 'Select data source', detail: 'Pick the incident(s), date range, or module data that should be included.' },
      { step: 'Generate and edit', detail: 'Click Generate. Review the AI-written report, make edits, and export as PDF or Word.' },
    ],
    related: ['Incident Log', 'After Action Reports', 'Reports & Export'],
  },

  'preplan-ai': {
    name: 'AI Pre-Plan Generator',
    group: 'AI & Tools',
    overview: 'Generate pre-incident plans from building data, occupancy type, and hazard information. The AI creates structured plans covering hazards, access points, water supply, suppression strategy, utilities, and special considerations.',
    features: [
      'Multi-tab pre-plan generation: hazards, access, water supply, suppression, utilities, special considerations',
      'Building data input: address, occupancy type, construction class, square footage',
      'Known hazard documentation and integration',
      'Direct save to Pre-Incident Plans module',
      'Photo and diagram attachment support',
    ],
    tips: [
      'Provide as much building data as possible — occupancy type, construction class, square footage, and known hazards.',
      'The AI generates a starting framework; always do an on-site walk-through to verify and supplement.',
      'Generated plans integrate directly into the Pre-Incident Plans module.',
    ],
    howTo: [
      { step: 'Enter building info', detail: 'Provide the address, occupancy type, construction details, and any known hazards.' },
      { step: 'Generate the plan', detail: 'Click Generate. The AI creates a multi-tab pre-plan covering all standard categories.' },
      { step: 'Review and save', detail: 'Edit the generated plan, add photos or diagrams, and save to the Pre-Incident Plans module.' },
    ],
    related: ['Pre-Incident Plans', 'Fire Inspections', 'Hydrant Management'],
  },

  'community-outreach': {
    name: 'Community Outreach',
    group: 'Prevention & Community',
    overview: 'The Community Outreach module tracks your department\'s prevention and engagement activities — public education events, station tours, school presentations, open houses, and community partnerships. Manage outreach campaigns, measure reach, document outcomes, and generate reports demonstrating your department\'s community impact.',
    features: [
      'Outreach campaign management with description, location, target audience, and dates',
      'Activity types: Public Education, School Program, Station Tour, Community Event, Open House, Health Screening, Demonstration, Other',
      'Attendee tracking with demographic data (age group, organization/school, contact info)',
      'Attendance count, age ranges, and organization affiliations',
      'Activity outcomes: materials distributed, leads collected, partnerships formed, media coverage',
      'Staff member assignment and tracking',
      'Photo and document attachments per activity',
      'Campaign status: Planning, Active, Completed, Cancelled',
      'YTD metrics dashboard: total activities, people reached, materials distributed, new partnerships',
      'Filterable activity log and reporting',
      'Officer+ access required for campaign and activity management',
    ],
    sections: [
      {
        title: 'Activity Types',
        type: 'indicators',
        items: [
          { label: 'Public Education', desc: 'General fire safety education delivered to community members (fire prevention week events, block parties, health fairs, etc.).' },
          { label: 'School Program', desc: 'Educational presentation or demonstration at a school — kindergarten fire safety, middle school hazard awareness, high school STEM connections.' },
          { label: 'Station Tour', desc: 'Visitors touring your fire station — school groups, scout troops, corporate teams, civic organizations.' },
          { label: 'Community Event', desc: 'Your department\'s participation in a community event — booth at a county fair, vendor at a health expo, parade, etc.' },
          { label: 'Open House', desc: 'Departmental open house event — public invited to meet staff, tour apparatus, learn about services.' },
          { label: 'Health Screening', desc: 'Blood pressure, blood sugar, or other health screenings provided by your department at community locations.' },
          { label: 'Demonstration', desc: 'Live demonstration of equipment or techniques — vehicle extrication demo, fire behavior demo, smoke behavior demo.' },
        ],
      },
      {
        title: 'Campaign Statuses',
        type: 'indicators',
        items: [
          { label: 'Planning', desc: 'Campaign is being designed. Set goals, draft materials, and confirm partnerships.' },
          { label: 'Active', desc: 'Campaign is underway. Log activities and track attendance and outcomes.' },
          { label: 'Completed', desc: 'Campaign has ended. Final attendance and outcome metrics are recorded.' },
          { label: 'Cancelled', desc: 'Campaign was cancelled. Records retained for audit trail.' },
        ],
      },
      {
        title: 'Key Fields',
        type: 'fields',
        items: [
          { name: 'Campaign Name', desc: 'Title of the outreach campaign — e.g., "Fire Prevention Week 2024", "School Safety Tour Program".' },
          { name: 'Activity Type', desc: 'Classify the specific activity: Public Education, School Program, Station Tour, Open House, etc.' },
          { name: 'Target Audience', desc: 'Who you\'re reaching: K–5 students, teens, seniors, families, businesses, civic groups, etc.' },
          { name: 'Location', desc: 'Where the activity took place — school name, community center, your station, county fair, etc.' },
          { name: 'Attendees / People Reached', desc: 'Count of participants. For presentations, count students or audience members.' },
          { name: 'Age Groups', desc: 'Breakdown of attendees: under 12, 12–18, 18–65, 65+. Useful for targeting future campaigns.' },
          { name: 'Staff Assigned', desc: 'Which firefighters/officers participated in the activity.' },
          { name: 'Outcomes', desc: 'What was accomplished: materials distributed, leads collected, partnerships formed, media coverage generated.' },
          { name: 'Materials Distributed', desc: 'Count of handouts, stickers, magnets, home safety kits, or other materials given to attendees.' },
          { name: 'New Partnerships', desc: 'Any new community partnerships or ongoing collaborations formed from the activity.' },
        ],
      },
      {
        title: 'Creating a Campaign & Logging Activities',
        type: 'text',
        content: 'Click + New Campaign to start a campaign. Enter a name (e.g., "Fire Prevention Week"), description, target audience, and status (Planning → Active when ready). Set a start and end date. The campaign stays in Planning until you activate it. Once Active, click + New Activity to log each outreach event. Select the activity type, location, attendee count, staff assigned, and outcomes. Upload photos or materials documents if available. Each activity auto-updates the campaign\'s YTD totals.' },
      {
        title: 'Measuring Impact & Reporting',
        type: 'text',
        content: 'The YTD metrics dashboard shows total activities conducted, people reached, materials distributed, and new partnerships formed. Use this data in grant applications, annual reports to your governing body, and social media posts celebrating your community impact. "This year we reached 2,847 community members through 34 educational activities" is a powerful statement that quantifies your department\'s prevention mission.' },
      {
        title: 'Partnerships & Follow-Up',
        type: 'text',
        content: 'The Partnerships field tracks schools, community centers, businesses, and organizations you partner with on outreach. Once a partnership is formed, you can schedule follow-up activities or recurring programs. Link multiple activities to the same partnership to show your ongoing community commitment. Export your partner list for annual reporting and grant applications.' },
    ],
    tips: [
      'Every activity, no matter how small, adds to your impact story. A 15-minute station tour with a scout troop counts — log it and track the attendance.',
      'Take photos at every event and attach them to the activity record. Visual documentation helps with annual reports and demonstrates your community presence.',
      'Document new partnerships carefully — "Formed ongoing partnership with Lincoln Elementary for annual fire safety assembly" shows sustained community commitment that grant reviewers value.',
      'Grant reviewers love quantified impact: "47 activities, 3,200 people reached, 500 materials distributed, 12 new partnerships." Build your numbers throughout the year.',
      'Export your YTD metrics in October to prepare for annual reports and budget justification to your governing body.',
    ],
    howTo: [
      { step: 'Click + New Campaign', detail: 'Create an outreach campaign with name, description, target audience, start/end dates, and status (Planning/Active).' },
      { step: 'Set status to Active', detail: 'Change status from Planning to Active when the campaign begins. Activities can only be logged to Active campaigns.' },
      { step: 'Log an activity', detail: 'Click + New Activity. Select the activity type, location, attendee count, age groups, staff assigned, and outcomes. Attach photos or materials if available.' },
      { step: 'Track your impact', detail: 'The YTD metrics dashboard auto-updates as you log activities — watch your reach grow (people reached, materials distributed, partnerships formed).' },
      { step: 'Monitor partnerships', detail: 'Note partnerships formed in the Outcomes field. Use the Partnerships section to manage ongoing relationships and schedule follow-up activities.' },
      { step: 'Export metrics for reporting', detail: 'Use the Export button to download your YTD activity report for grant applications, annual reports, and budget justification.' },
    ],
    related: ['CRR (Community Risk Reduction)', 'Event Calendar', 'Grant Management', 'Media & Public Info', 'Analytics'],
  },

  'staffing-ai': {
    name: 'AI Staffing Predictor',
    group: 'AI & Tools',
    overview: 'Forecast staffing needs based on historical response patterns, seasonal trends, scheduled events, leave patterns, and community activity. Helps officers plan coverage proactively.',
    features: [
      'Forecast staffing by day, week, or month',
      'Historical pattern analysis using 6+ months of data',
      'Seasonal trend and special event integration',
      'Expected availability per day with confidence intervals',
      'Low-staffing period flagging for proactive coverage',
      'Mutual aid and overtime pre-scheduling recommendations',
    ],
    tips: [
      'The AI improves its predictions as more historical data accumulates — accuracy increases after 6+ months of data.',
      'Factor predictions into your scheduling decisions, especially for holiday periods and special events.',
      'The system flags predicted low-staffing periods so you can arrange callbacks or mutual aid coverage in advance.',
    ],
    howTo: [
      { step: 'Select forecast period', detail: 'Choose the date range you want to forecast (next week, next month, etc.).' },
      { step: 'Review predictions', detail: 'The AI shows expected availability per day with confidence intervals.' },
      { step: 'Plan accordingly', detail: 'Use the predictions to pre-schedule overtime, arrange mutual aid, or adjust shift patterns.' },
    ],
    related: ['Daily Staffing', 'Duty Schedule', 'Availability', 'Response Analytics'],
  },

  // ── After Action Reports ───────────────────────────────────────────────────
  'after-action': {
    name: 'After Action Reports',
    group: 'Incident Operations',
    overview: 'After Action Reports capture the lessons learned from significant incidents or exercises. Each report documents what went well, areas for improvement, and assigns concrete action items with deadlines to drive continuous improvement across the department.',
    features: [
      'Structured strength / improvement / action-item format',
      'Dynamic lists — add or remove strengths, improvements, and action items inline',
      'Action items assigned to specific members with due dates and status tracking',
      'Link to the originating incident record for full context',
      'Attach photos, documents, or supplemental materials',
      'Cross-link to Meeting Minutes for formal discussion documentation',
      'Search, filter, and download reports',
      'Color-coded sections — green for strengths, amber for improvements, blue for action items',
    ],
    sections: [
      {
        title: 'Report Structure',
        type: 'text',
        content: 'Each after-action report has three core sections: What Went Well (strengths), Areas for Improvement, and Action Items. Strengths and improvements are free-text lists, while action items include an assignee, due date, and status so follow-through can be tracked.',
      },
      {
        title: 'Status Indicators',
        type: 'indicators',
        items: [
          { label: 'Open', desc: 'Report is in progress — action items may still be pending.' },
          { label: 'Closed', desc: 'All action items are resolved and the review is complete.' },
        ],
      },
    ],
    tips: [
      'Complete after-action reports within 72 hours while details are fresh.',
      'Assign every action item to a named member with a realistic due date — unassigned items rarely get done.',
      'Link the report to the incident and to the follow-up meeting minutes so the full chain is traceable.',
      'Review open action items at your next regular meeting to ensure accountability.',
    ],
    howTo: [
      { step: 'Create a new report', detail: 'Click + New Report, fill in the incident details, and begin documenting strengths.' },
      { step: 'Add strengths & improvements', detail: 'Use the + buttons in each section to add items. Be specific — "good initial attack" is better than "went well."' },
      { step: 'Assign action items', detail: 'Add each corrective action, assign it to a member, set a due date, and mark initial status as open.' },
      { step: 'Finalize & share', detail: 'Once the review is complete, save the report and share it at the next meeting. Link the meeting minutes record back to this report.' },
    ],
    related: ['Incident Log', 'Meeting Minutes', 'Training', 'Drills & Courses'],
  },

  // ── Mutual Aid Agreements ─────────────────────────────────────────────────
  'aid-agreements': {
    name: 'Mutual Aid Agreements',
    group: 'Incident Operations',
    overview: 'Manage and monitor mutual aid agreements with neighboring agencies. Track coverage scope, financial terms, dispatch protocols, compliance status, and signatory details — all in one place so nothing falls through the cracks before a renewal deadline.',
    features: [
      'Full agreement lifecycle — draft, active, expiring, expired, suspended',
      'Multi-tab detail view: Overview, Coverage & Scope, Dispatch, Financial, Compliance, Meetings',
      'Signatory tracking for both parties with name, title, and authority',
      'Auto-calculated days-until-expiration countdown',
      'Auto-renew flagging with configurable renewal-term months',
      'Coverage scope: resource types and incident type activations',
      'Dispatch details: radio channels and dispatch protocols',
      'Financial terms: reimbursement models and payment terms',
      'Compliance status monitoring with color-coded badges',
      'Linked meetings and attachments per agreement',
    ],
    sections: [
      {
        title: 'Agreement Status',
        type: 'indicators',
        items: [
          { label: 'Active (green)', desc: 'Agreement is current and enforceable.' },
          { label: 'Expiring Soon (amber)', desc: 'Agreement expires within 90 days — action needed.' },
          { label: 'Expired (red)', desc: 'Agreement has lapsed. Coverage is no longer guaranteed.' },
          { label: 'Draft (gray)', desc: 'Agreement is being drafted and is not yet active.' },
          { label: 'Under Review (blue)', desc: 'Agreement is being reviewed or renegotiated.' },
          { label: 'Suspended (orange)', desc: 'Agreement is temporarily suspended.' },
        ],
      },
      {
        title: 'Compliance Status',
        type: 'indicators',
        items: [
          { label: 'Compliant', desc: 'All terms are being met by both parties.' },
          { label: 'Review Needed', desc: 'One or more terms require review or verification.' },
          { label: 'Renewal Required', desc: 'Agreement must be renewed to maintain compliance.' },
          { label: 'Non-Compliant', desc: 'Terms are not being met — corrective action required.' },
        ],
      },
    ],
    tips: [
      'Set a calendar reminder 90 days before each expiration to begin renewal conversations.',
      'Attach a signed PDF of the original agreement so it is always accessible during an incident.',
      'Review agreements annually even if auto-renew is enabled — terms may need updating.',
      'Link meeting minutes from renewal discussions for an audit trail.',
    ],
    howTo: [
      { step: 'Add an agreement', detail: 'Click + New Agreement and enter the partner agency details, effective/expiration dates, and coverage scope.' },
      { step: 'Fill in tabs', detail: 'Complete the Coverage, Dispatch, Financial, and Compliance tabs for a comprehensive record.' },
      { step: 'Track compliance', detail: 'Update the compliance status as conditions change. The dashboard flags agreements that need attention.' },
      { step: 'Renew', detail: 'When an agreement is expiring, edit the dates, update terms, and re-sign. Attach the new document.' },
    ],
    related: ['Mutual Aid', 'Incident Log', 'Meeting Minutes', 'Document Vault'],
  },

  // ── Apparatus Out of Service ──────────────────────────────────────────────
  'apparatus-oos': {
    name: 'Apparatus Out of Service Tracker',
    group: 'Apparatus & Equipment',
    overview: 'Track every out-of-service event for your apparatus fleet. Document the reason, estimated return, impact level, and coverage plan so the duty officer always knows which units are down and what backup is in place.',
    features: [
      'Log OOS events with reason, type, and estimated return date',
      'Impact-level assessment — low, moderate, high, critical',
      'Coverage plan field to document how the gap is being covered',
      'Color-coded impact badges for quick visual scanning',
      'Status filtering to see active OOS events vs. resolved',
      'Expandable detail cards for each OOS record',
      'Links to the Apparatus Tracker for full unit history',
    ],
    sections: [
      {
        title: 'Impact Levels',
        type: 'indicators',
        items: [
          { label: 'Low (blue)', desc: 'Minimal operational impact — backup units readily available.' },
          { label: 'Moderate (amber)', desc: 'Some response capability affected — coverage plan in place.' },
          { label: 'High (orange)', desc: 'Significant gap in response capability — mutual aid may be needed.' },
          { label: 'Critical (red)', desc: 'Major unit down with no immediate replacement — mutual aid activated.' },
        ],
      },
    ],
    tips: [
      'Always fill in the coverage plan so the next duty officer knows the backup arrangement.',
      'Update the estimated return date as maintenance progresses to keep the board accurate.',
      'Critical-impact OOS events should trigger a notification to the chief and mutual aid partners.',
    ],
    howTo: [
      { step: 'Log an OOS event', detail: 'Click + New OOS, select the apparatus, fill in the reason and type, and set the estimated return date.' },
      { step: 'Set impact level', detail: 'Assess how the loss of this unit affects response capability and select the appropriate impact level.' },
      { step: 'Document coverage', detail: 'In the Coverage Plan field, note which unit or mutual aid partner is providing backup.' },
      { step: 'Resolve', detail: 'When the unit returns to service, update the record and change the status to resolved.' },
    ],
    related: ['Apparatus Tracker', 'Maintenance Log', 'Mutual Aid Agreements', 'Daily Staffing'],
  },

  // ── Daily Staffing Board ──────────────────────────────────────────────────
  'daily-staffing': {
    name: 'Daily Staffing Board',
    group: 'Staffing & Personnel',
    overview: 'The Daily Staffing Board shows who is assigned to which apparatus and in what position for any given day. Navigate by date to review past or future staffing, add manual assignments, and ensure minimum staffing requirements are met.',
    features: [
      'Day-by-day date navigation with left / right arrows',
      'Apparatus-based assignment grid',
      'Position assignments: Officer, Driver, Firefighter, EMT, Paramedic, Tillerman, Acting Officer, Acting Driver, Callback, Holdover',
      'Available members roster showing who is unassigned',
      'Source tracking — distinguish manual entries from schedule-generated assignments',
      'Add and remove individual assignments',
      'Download staffing report',
    ],
    sections: [
      {
        title: 'Positions',
        type: 'fields',
        items: [
          { label: 'Officer', desc: 'Officer in command of the apparatus for the shift.' },
          { label: 'Driver/Engineer', desc: 'Pump operator or driver assigned to the unit.' },
          { label: 'Firefighter', desc: 'Standard crew member assigned to the unit.' },
          { label: 'Acting Officer / Acting Driver', desc: 'Member temporarily filling a higher role for the day.' },
          { label: 'Callback / Holdover', desc: 'Member called back or held over to fill a staffing gap.' },
        ],
      },
    ],
    tips: [
      'Review tomorrow\'s staffing board before end of shift to catch gaps early.',
      'Use the "Available" list to quickly see who can fill an open seat.',
      'Acting assignments count toward the member\'s OT equalization hours if applicable.',
    ],
    howTo: [
      { step: 'Navigate to a date', detail: 'Use the arrow buttons to move forward or backward by day.' },
      { step: 'Add an assignment', detail: 'Click + on an apparatus card, select a member and position, set start/end times.' },
      { step: 'Remove an assignment', detail: 'Click the X on an existing assignment to remove it from the board.' },
    ],
    related: ['Duty Schedule', 'Apparatus Tracker', 'Availability', 'OT Equalization'],
  },

  // ── Email Ingest ──────────────────────────────────────────────────────────
  'email-ingest': {
    name: 'Email Ingest',
    group: 'AI & Tools',
    overview: 'Email Ingest uses AI to automatically classify and route emails into the correct Open Firehouse module. Paste an email, and the system identifies whether it belongs in Grants, Training, Maintenance, Mutual Aid Agreements, or any other module — then files it with one click.',
    features: [
      'AI-powered email classification across 12+ target modules',
      'Confidence-level badges: high (green), medium (amber), low (red)',
      'Step-based workflow: paste email, select modules, confirm filing',
      'Recent filings list for audit trail',
      'Supports subject line and sender extraction',
      'Module-specific icons and color coding',
      'Copy email content to clipboard',
    ],
    sections: [
      {
        title: 'Supported Target Modules',
        type: 'text',
        content: 'Emails can be filed into: Aid Agreements, Grants, Training, Maintenance, Incidents, Budget, Document Vault, SOGs, Personnel Actions, Inspections, Hazmat, and Meeting Minutes. The AI suggests the best match, and you confirm before filing.',
      },
      {
        title: 'Confidence Levels',
        type: 'indicators',
        items: [
          { label: 'High (green)', desc: 'AI is confident in the classification — review and file.' },
          { label: 'Medium (amber)', desc: 'Likely match but review the suggestion before filing.' },
          { label: 'Low (red)', desc: 'AI is uncertain — manually select the correct module.' },
        ],
      },
    ],
    tips: [
      'Include the full email body for the best AI classification accuracy — subject line alone may not be enough.',
      'Check the confidence badge before filing. Medium and low confidence suggestions should be verified.',
      'Use Email Ingest for documents received by email that need to live in a specific module — contracts, grant letters, inspection reports, etc.',
    ],
    howTo: [
      { step: 'Paste the email', detail: 'Copy the email content (body, subject, sender) and paste it into the text area.' },
      { step: 'Review AI suggestion', detail: 'The AI identifies the target module and shows a confidence level. Verify the suggestion is correct.' },
      { step: 'File it', detail: 'Click File to route the email content into the selected module. It appears in that module\'s records.' },
    ],
    related: ['Document Vault', 'Grant Management', 'Mutual Aid Agreements', 'AI Data Ingestion'],
  },

  // ── Equipment Checkout ────────────────────────────────────────────────────
  'equipment-checkout': {
    name: 'Equipment Checkout',
    group: 'Apparatus & Equipment',
    overview: 'Track who has what equipment checked out, when it is due back, and what condition it is in. Equipment Checkout creates accountability for radios, keys, thermal imagers, gas meters, PPE sets, and any other item that leaves the station.',
    features: [
      'Checkout and return workflow with condition tracking',
      'Item types: radios, pagers, keys, access cards, laptops, tablets, cameras, thermal imagers, gas meters, AEDs, PPE, SCBA, hand/power tools, vehicles',
      'Condition assessment on checkout and return (new, excellent, good, fair, poor, damaged)',
      'Overdue item detection and highlighting',
      'Serial number and asset tag fields for positive identification',
      'Active vs. all-items view toggle',
      'Expected return date tracking',
      'Purpose field to document why the item was checked out',
    ],
    sections: [
      {
        title: 'Status Indicators',
        type: 'indicators',
        items: [
          { label: 'Checked Out (amber)', desc: 'Item is currently with a member.' },
          { label: 'Returned (green)', desc: 'Item has been returned and accounted for.' },
          { label: 'Lost / Damaged (red)', desc: 'Item was not returned or came back damaged.' },
        ],
      },
      {
        title: 'Condition Tracking',
        type: 'text',
        content: 'Condition is recorded at both checkout and return. If an item comes back in worse condition than it left, the difference is flagged so the officer can follow up.',
      },
    ],
    tips: [
      'Always record the serial number or asset tag — it eliminates ambiguity when multiple identical items exist.',
      'Set a realistic expected return date so overdue items surface automatically.',
      'Use the "Active" filter to quickly see everything currently checked out.',
      'Log a return even if the item was damaged — the condition-in field documents the issue.',
    ],
    howTo: [
      { step: 'Check out an item', detail: 'Click + Checkout, select the item type, enter the serial number, select the member, and set an expected return date.' },
      { step: 'Return an item', detail: 'Find the active checkout, click Return, select who received it back, and assess the condition on return.' },
      { step: 'Track overdue items', detail: 'Items past their expected return date are highlighted. Follow up with the member to locate the equipment.' },
    ],
    related: ['Asset Inventory', 'SCBA Tracker', 'Apparatus Tracker', 'Member Roster'],
  },

  // ── Exposure Tracking ─────────────────────────────────────────────────────
  'exposure-tracking': {
    name: 'Exposure Tracking',
    group: 'Training & Readiness',
    overview: 'Document and track every occupational exposure — smoke inhalation, chemical contact, bloodborne pathogens, noise, and more. Each record captures the substance, duration, PPE worn, symptoms, and follow-up status to protect member health and support workers\' compensation claims.',
    features: [
      'Exposure types: smoke inhalation, chemical, bloodborne pathogen, noise, radiation, biological, asbestos, diesel exhaust, other',
      'PPE worn at time of exposure — multi-select toggle buttons',
      'Symptom documentation',
      'Medical follow-up tracking with conditional date field',
      'Link to originating incident',
      'Duration (minutes) for cumulative exposure tracking',
      'Records and summary views',
      'Filter by member or exposure type',
    ],
    sections: [
      {
        title: 'Status Indicators',
        type: 'indicators',
        items: [
          { label: 'Reported', desc: 'Exposure has been documented but not yet reviewed.' },
          { label: 'Under Review', desc: 'Safety officer is evaluating the exposure.' },
          { label: 'Cleared', desc: 'Member has been cleared by medical evaluation.' },
          { label: 'Follow-Up Required', desc: 'Additional medical monitoring or testing is needed.' },
        ],
      },
    ],
    tips: [
      'Document exposures immediately after the incident — details fade fast.',
      'Always note the PPE worn. It matters for both medical evaluation and potential claims.',
      'Flag exposures that require medical follow-up and track the follow-up date to ensure it happens.',
      'Use the summary view to monitor cumulative exposure trends across the department.',
    ],
    howTo: [
      { step: 'Report an exposure', detail: 'Click + New Exposure, select the member, incident, exposure type, substance, and duration.' },
      { step: 'Document PPE', detail: 'Toggle the PPE items that were worn at the time of exposure.' },
      { step: 'Note symptoms', detail: 'Record any symptoms observed or reported, even if they seem minor.' },
      { step: 'Schedule follow-up', detail: 'If medical follow-up is needed, check the box and set the follow-up date.' },
    ],
    related: ['Health & Wellness', 'Incident Log', 'SCBA Tracker', 'Member Roster'],
  },

  // ── Incident Cost Tracker ─────────────────────────────────────────────────
  'incident-costs': {
    name: 'Incident Cost Tracker',
    group: 'Finance & Compliance',
    overview: 'Calculate and track the full cost of an incident across four categories: apparatus, personnel, materials, and other. Use it to support cost-recovery billing, grant reimbursement documentation, and budget analysis.',
    features: [
      'Four cost categories: Apparatus, Personnel, Materials, Other',
      'Dynamic line items — add or remove cost lines within each category',
      'Auto-calculation: quantity x rate = cost per line',
      'Per-category subtotals and grand total',
      'Billable incident flagging with "billed to" field',
      'Payment status tracking: Not Billed, Billed, Partial, Paid, Waived, Collections',
      'Link to originating incident record',
      'Assigned calculator (member who computed the costs)',
    ],
    sections: [
      {
        title: 'Cost Categories',
        type: 'fields',
        items: [
          { label: 'Apparatus Costs', desc: 'Engine hours, mileage, wear-and-tear charges per unit deployed.' },
          { label: 'Personnel Costs', desc: 'Firefighter hours, overtime, callback pay for responding members.' },
          { label: 'Material Costs', desc: 'Foam, absorbent, hose, medical supplies consumed during the incident.' },
          { label: 'Other Costs', desc: 'Mutual aid charges, rehab, decontamination, third-party services.' },
        ],
      },
      {
        title: 'Payment Status',
        type: 'indicators',
        items: [
          { label: 'Not Billed (gray)', desc: 'Costs calculated but invoice has not been sent.' },
          { label: 'Billed (blue)', desc: 'Invoice sent to responsible party.' },
          { label: 'Partial (amber)', desc: 'Some payment received, balance outstanding.' },
          { label: 'Paid (green)', desc: 'Full payment received.' },
          { label: 'Waived (purple)', desc: 'Costs were waived — no billing.' },
          { label: 'Collections (red)', desc: 'Payment overdue and referred to collections.' },
        ],
      },
    ],
    tips: [
      'Complete cost tracking within a week of the incident while resource usage is still clear.',
      'Include mutual aid charges — partner agencies may bill for their apparatus and personnel time.',
      'Use the payment status field to track cost-recovery progress through billing, partial payment, and final collection.',
      'Attach the invoice or billing documentation for a complete audit trail.',
    ],
    howTo: [
      { step: 'Create a cost record', detail: 'Click + New Cost Record, link it to an incident, and enter the basic details.' },
      { step: 'Add line items', detail: 'In each cost category, click + to add lines. Enter description, quantity, and rate — the cost calculates automatically.' },
      { step: 'Mark billable', detail: 'If the incident is billable (e.g., hazmat cleanup, false alarm fee), check Billable and enter the billed-to party.' },
      { step: 'Track payment', detail: 'Update the payment status as invoices are sent and payments received.' },
    ],
    related: ['Incident Log', 'Budget & Finance', 'Mutual Aid', 'Reports & Export'],
  },

  // ── Meeting Minutes ───────────────────────────────────────────────────────
  'meeting-minutes': {
    name: 'Meeting Minutes',
    group: 'Department Admin',
    overview: 'Record, transcribe, and manage meeting minutes for every type of department meeting — regular, special, emergency, committee, budget, training, and more. Use the built-in voice recorder with AI transcription to capture meetings live, or enter minutes manually.',
    features: [
      'AI-powered voice recording with live transcription',
      'AI Summarize — converts raw transcript into structured minutes with agenda, motions, action items, and attendees',
      'Pre-recording setup flow: select meeting type, attendees, and optional module link before recording',
      'Ten meeting types: regular, special, emergency, executive, committee, training, budget, planning, annual, other',
      'Attendee multi-select with active member filtering and select-all',
      'Motion tracking: text, moved by, seconded by, result (passed / failed / tabled)',
      'Action item tracking: task, assigned to, due date, status',
      'Cross-module linking to 22 modules (incidents, training, grievances, budget, etc.)',
      'Status workflow: draft → approved → final',
      'Linked meetings and attachments',
    ],
    sections: [
      {
        title: 'Recording Workflow',
        type: 'text',
        content: 'Click Record Meeting to open the recorder. Optionally fill in meeting setup details first (type, attendees, linked module). Press Start Recording and speak — the transcript populates in real time. When done, click AI Summarize to have the AI parse the transcript into structured minutes with agenda items, motions, action items, and key decisions.',
      },
      {
        title: 'Meeting Status',
        type: 'indicators',
        items: [
          { label: 'Draft (yellow)', desc: 'Minutes are being prepared or reviewed.' },
          { label: 'Approved (green)', desc: 'Minutes have been reviewed and approved by the body.' },
          { label: 'Final (blue)', desc: 'Minutes are locked and archived.' },
          { label: 'Recording (red)', desc: 'A live recording session is in progress.' },
        ],
      },
      {
        title: 'Cross-Module Linking',
        type: 'text',
        content: 'Link meeting minutes to any related record in the system — an incident, a grievance, a grant, a mutual aid agreement, and more. The linked record appears as a badge on the minutes, and the target module shows a back-link to the meeting.',
      },
    ],
    tips: [
      'Use the pre-recording setup to select attendees and meeting type before you start recording — the AI uses this context for better summaries.',
      'The AI Summarize feature requires an API key (OpenAI or Anthropic) configured on the server.',
      'Review AI-generated minutes before approving — the AI captures the gist but may miss nuance.',
      'Link meeting minutes to the relevant module record for a complete paper trail.',
      'Mark minutes as Approved only after the body has formally voted to accept them.',
    ],
    howTo: [
      { step: 'Start a new meeting', detail: 'Click + New Meeting or Record Meeting. For AI recording, use Record Meeting and optionally fill in the setup form first.' },
      { step: 'Record the meeting', detail: 'Press Start Recording and speak. The transcript builds in real time. Press Stop when done.' },
      { step: 'AI Summarize', detail: 'Click AI Summarize to convert the raw transcript into structured minutes. Review the generated agenda, motions, and action items.' },
      { step: 'Edit and finalize', detail: 'Make any corrections, add missing details, then save. Change status to Approved once the body accepts the minutes.' },
    ],
    related: ['After Action Reports', 'SOG Library', 'Grievance Tracker', 'Grant Management'],
  },

  // ── OT Equalization Board ─────────────────────────────────────────────────
  'ot-equalization': {
    name: 'OT Equalization Board',
    group: 'Finance & Compliance',
    overview: 'Track overtime hours across all members to ensure fair and equitable distribution. The board view shows year-to-date OT totals side by side, making it easy to identify imbalances and assign the next callback to the member with the fewest hours.',
    features: [
      'Annual OT equalization board — all members at a glance',
      'OT logging with 8 type categories: callback, holdover, coverage, special event, training, mandatory, voluntary, other',
      'Dual view: board (side-by-side totals) and log (detailed entries)',
      'FLSA overtime impact calculation panel',
      'Year-based filtering',
      'Filter by OT type',
      'Export OT data as JSON',
    ],
    sections: [
      {
        title: 'OT Types',
        type: 'fields',
        items: [
          { label: 'Callback', desc: 'Member called back to duty from off-shift.' },
          { label: 'Holdover', desc: 'Member held past end of scheduled shift.' },
          { label: 'Coverage', desc: 'Filling a vacancy due to leave or absence.' },
          { label: 'Special Event', desc: 'Overtime for a planned event (parade, open house, etc.).' },
          { label: 'Training', desc: 'OT hours for training attendance beyond regular duty.' },
          { label: 'Mandatory', desc: 'Required overtime ordered by command staff.' },
          { label: 'Voluntary', desc: 'Member volunteered for additional hours.' },
        ],
      },
    ],
    tips: [
      'When assigning callbacks, check the board and offer to the member with the lowest YTD total first.',
      'Log OT entries promptly — delayed entries make the board inaccurate for equalization decisions.',
      'Review the FLSA impact panel before approving overtime to avoid unexpected threshold crossings.',
      'Export data at year-end for payroll reconciliation and labor compliance documentation.',
    ],
    howTo: [
      { step: 'View the board', detail: 'Select the year and switch to Board view to see all members\' YTD overtime totals ranked side by side.' },
      { step: 'Log OT hours', detail: 'Click + Log OT, select the member, date, hours, OT type, and reason.' },
      { step: 'Check FLSA impact', detail: 'Open the FLSA panel to see how the logged hours affect work-period thresholds.' },
      { step: 'Export', detail: 'Click Export to download OT data for payroll or compliance reporting.' },
    ],
    related: ['Payroll Tracker', 'Timesheets', 'FLSA Overtime', 'Duty Schedule'],
  },

  // ── Personnel Actions ─────────────────────────────────────────────────────
  'personnel-actions': {
    name: 'Personnel Actions',
    group: 'Staffing & Personnel',
    overview: 'Document every formal personnel action — promotions, commendations, disciplinary warnings, suspensions, certifications, leaves of absence, and more. Each record creates an auditable trail with dates, descriptions, and the issuing authority.',
    features: [
      '21+ action types: promotion, demotion, commendation, verbal warning, written warning, suspension, termination, resignation, transfer, leave of absence, return to duty, certification, decertification, probation start/end, and more',
      'Color-coded action type badges for quick scanning',
      'Icon system: stars for promotions, alert triangles for warnings, awards for commendations',
      'Status tracking: active, resolved, appealed, expunged',
      'Issued By field with name and title',
      'Linked meetings for hearing or review documentation',
      'Attachments for supporting documents',
      'Chronological personnel history per member',
    ],
    sections: [
      {
        title: 'Action Categories',
        type: 'text',
        content: 'Actions fall into broad categories: positive (promotion, commendation, certification), corrective (warnings, suspension, probation), and administrative (transfer, leave, return to duty, resignation). Each type has a distinct color and icon for easy identification.',
      },
      {
        title: 'Status Indicators',
        type: 'indicators',
        items: [
          { label: 'Active', desc: 'Action is current and in effect.' },
          { label: 'Resolved', desc: 'Action has been completed or the corrective period has ended.' },
          { label: 'Appealed', desc: 'Member has formally appealed the action.' },
          { label: 'Expunged', desc: 'Action has been removed from the active record per agreement or policy.' },
        ],
      },
    ],
    tips: [
      'Always attach supporting documentation — written statements, witness accounts, or policy references.',
      'Link the personnel action to a meeting minutes record if the action was discussed at a formal meeting or hearing.',
      'Use the status field to track appeals and resolutions so the record reflects the final outcome.',
      'Positive actions (commendations, promotions) belong here too — build a complete picture, not just a disciplinary file.',
    ],
    howTo: [
      { step: 'Create a personnel action', detail: 'Click + New Action, select the member, action type, date, and provide a detailed description.' },
      { step: 'Assign authority', detail: 'Enter the Issued By name and title — this is the person taking the action.' },
      { step: 'Attach documentation', detail: 'Upload any supporting files: letters, signed forms, policy references.' },
      { step: 'Track resolution', detail: 'Update the status as the action progresses through any appeal or resolution process.' },
    ],
    related: ['Member Roster', 'Grievance Tracker', 'Meeting Minutes', 'Qualifications'],
  },

  // ── Policy Acknowledgments ────────────────────────────────────────────────
  'policy-acks': {
    name: 'Policy Sign-offs',
    group: 'Department Admin',
    overview: 'Publish policies, SOGs, directives, and safety bulletins, then track which members have acknowledged them. See at a glance who has signed off and who still needs to — ensuring compliance across the department.',
    features: [
      '10 policy types: SOG, SOP, Policy, Directive, Memo, Safety Bulletin, Training Requirement, Equipment Notice, Code of Conduct, Other',
      'Required-member multi-select with "Select All" option',
      'Per-member acknowledgment tracking with timestamp',
      'Effective date and review date for policy lifecycle',
      'Policy reference field (e.g., SOG-100, SB-2026-01)',
      'Completion progress: total required vs. total acknowledged',
      'Bulk acknowledgment support',
      'Policy statistics dashboard',
    ],
    sections: [
      {
        title: 'How Acknowledgments Work',
        type: 'text',
        content: 'When you publish a policy, you select which members are required to acknowledge it. Each member sees the policy in their portal and signs off. The dashboard shows a progress bar — once all required members have acknowledged, the policy is fully compliant.',
      },
    ],
    tips: [
      'Set a realistic review date and revisit the policy before it lapses.',
      'Use the Safety Bulletin type for time-sensitive notices that need fast acknowledgment.',
      'Check the progress bar regularly — follow up with members who haven\'t acknowledged within a reasonable timeframe.',
      'Attach the full policy document so members can read it before signing off.',
    ],
    howTo: [
      { step: 'Create a policy', detail: 'Click + New Policy, enter the title, reference code, type, description, and effective date.' },
      { step: 'Select required members', detail: 'Use the member multi-select (or Select All) to specify who must acknowledge.' },
      { step: 'Publish', detail: 'Save the policy. Required members will see it in their portal.' },
      { step: 'Monitor compliance', detail: 'Check the acknowledgment progress. Follow up with members who haven\'t signed off.' },
    ],
    related: ['SOG Library', 'Member Portal', 'Meeting Minutes', 'Document Vault'],
  },

  // ── Shift Trade Manager ───────────────────────────────────────────────────
  'shift-trades': {
    name: 'Shift Trade Manager',
    group: 'Department Admin',
    overview: 'Manage shift trade requests between members. The requesting member identifies the shift they need covered and the covering member who will work it. The system tracks approval status, payback shifts, and FLSA overtime impacts.',
    features: [
      'Trade request workflow: submit, approve, reject, complete',
      'Requesting and covering member selection with self-trade prevention',
      'Original shift and payback shift linking',
      'Trade date and payback date tracking',
      'FLSA impact panel — calculates whether a trade triggers overtime thresholds',
      'Crew size display for shift selection',
      'Notes/reason field for documentation',
      'Linked meetings and attachments',
    ],
    sections: [
      {
        title: 'Trade Status',
        type: 'indicators',
        items: [
          { label: 'Pending (amber)', desc: 'Trade has been submitted and awaits officer approval.' },
          { label: 'Approved (green)', desc: 'Trade has been approved — members are cleared to swap.' },
          { label: 'Rejected (red)', desc: 'Trade was denied — original assignment stands.' },
          { label: 'Completed (blue)', desc: 'Both shifts have been worked as traded.' },
        ],
      },
    ],
    tips: [
      'Check the FLSA impact panel before approving — some trades push members over the OT threshold.',
      'Require a payback shift whenever possible to keep hours balanced.',
      'Submit trade requests at least 48 hours in advance for officer review.',
    ],
    howTo: [
      { step: 'Request a trade', detail: 'Click + New Trade, select who needs off, who is covering, and which shift is being traded.' },
      { step: 'Set payback', detail: 'Optionally select the payback shift where the covering member will be repaid.' },
      { step: 'Approve/reject', detail: 'Officers review the request and FLSA impact, then approve or reject.' },
      { step: 'Mark complete', detail: 'After both shifts are worked, mark the trade as completed.' },
    ],
    related: ['Duty Schedule', 'Daily Staffing', 'FLSA Overtime', 'OT Equalization'],
  },

  // ── Today's Crew ──────────────────────────────────────────────────────────
  'todays-crew': {
    name: "Today's Crew",
    group: 'Staffing & Personnel',
    overview: "Today's Crew is a quick-glance view of who is on duty right now and what activities they are engaged in. Each member shows a progress ring of completed vs. remaining activities, with the current activity highlighted.",
    features: [
      'Live on-duty roster with rank-based color-coded avatars',
      'Progress ring showing completed / total activities per member',
      'Activity badges with time display',
      'Current activity highlighting (within 1-hour window)',
      'Time status indicators: past, current, upcoming',
      'Expandable member detail cards',
      'Rank-specific avatar colors: chief, captain, lieutenant, firefighter, driver, EMT, paramedic',
    ],
    tips: [
      "Check Today's Crew at the start of shift to see who is on duty and what's planned.",
      'The progress ring fills as activities are completed — a full ring means everything is done.',
      'Tap a member card to see their full activity schedule for the day.',
    ],
    howTo: [
      { step: 'View the crew', detail: "Open Today's Crew to see all on-duty members with their rank and current activity." },
      { step: 'Check progress', detail: 'The ring around each avatar shows how many activities have been completed vs. remaining.' },
      { step: 'See activity details', detail: 'Expand a member card to see their full daily schedule with time slots and status.' },
    ],
    related: ['Daily Staffing', 'Duty Schedule', 'Member Roster', 'Dashboard'],
  },

  // ── Training Plans ────────────────────────────────────────────────────────
  'training-plans': {
    name: 'Training Plans',
    group: 'Training & Readiness',
    overview: 'Build and manage structured training plans that organize courses, drills, and certifications into a cohesive program. Assign plans to members or groups, set timelines, and track completion progress across the department.',
    features: [
      'Multi-step training plan builder',
      'Assign plans to individual members or groups',
      'Timeline and milestone tracking',
      'Progress tracking per member per plan',
      'Link to training records, drills, and certification requirements',
      'Plan templates for common programs (probationary, officer development, etc.)',
    ],
    tips: [
      'Build a standard probationary training plan and reuse it for every new member.',
      'Set realistic milestones — training plans that are too aggressive lead to shortcuts.',
      'Review plan progress at monthly officer meetings to keep members on track.',
    ],
    howTo: [
      { step: 'Create a plan', detail: 'Click + New Plan, name it, set the timeline, and add the training requirements (courses, drills, certifications).' },
      { step: 'Assign members', detail: 'Select which members are enrolled in the plan.' },
      { step: 'Track progress', detail: 'As members complete requirements, their progress updates automatically from linked training records.' },
    ],
    related: ['Training', 'Drills & Courses', 'Qualifications', 'Cadet Program'],
  },

  // ── Data Ingest (AI) ─────────────────────────────────────────────────────
  'data-ingest': {
    name: 'AI Data Ingestion',
    group: 'AI & Tools',
    overview: 'A multi-step wizard for importing bulk data from external systems into Open Firehouse. Upload CSV files, map fields to the target module, validate the data, preview the import, and execute — all in a guided workflow.',
    features: [
      '7-step import wizard: Record Type, Source System, Upload, Field Mapping, Validate, Preview, Complete',
      'Supported record types: members, incidents, training, apparatus, assets',
      'CSV file upload and parsing',
      'Auto-mapping of source fields to target columns',
      'Manual field mapping adjustment',
      'Validation summary with error and warning counts',
      'Preview before final import',
      'Import progress tracking and logging',
    ],
    sections: [
      {
        title: 'Import Steps',
        type: 'text',
        content: 'Step 1: Select what you are importing (members, incidents, etc.). Step 2: Choose the source system. Step 3: Upload your CSV file. Step 4: Map source columns to Open Firehouse fields. Step 5: Validate the data for errors. Step 6: Preview the records. Step 7: Execute the import.',
      },
    ],
    tips: [
      'Clean your CSV before uploading — remove blank rows, fix encoding issues, and standardize date formats.',
      'Use the validation step seriously. Fixing data issues before import is far easier than correcting them after.',
      'Start with a small test file (10-20 records) to verify your field mapping before importing the full dataset.',
    ],
    howTo: [
      { step: 'Start an import', detail: 'Click + New Import and select the record type you are importing.' },
      { step: 'Upload CSV', detail: 'Drag and drop or select your CSV file. The system parses the columns automatically.' },
      { step: 'Map fields', detail: 'Review the auto-mapped fields and adjust any that were not matched correctly.' },
      { step: 'Validate and import', detail: 'Run validation, review the preview, and click Import to execute.' },
    ],
    related: ['Email Ingest', 'Data Import', 'Reports & Export', 'Asset Inventory'],
  },

  // ── Document Vault ────────────────────────────────────────────────────────
  'doc-vault': {
    name: 'Document Vault',
    group: 'Department Admin',
    overview: 'A central repository for all department documents — policies, procedures, SOGs, contracts, collective bargaining agreements, insurance documents, and training materials. Tag, categorize, and control access so the right people can find the right document instantly.',
    features: [
      'Document categories: policy, procedure, SOG, contract, CBA, insurance, mutual aid, training',
      'Version control with revision tracking',
      'Access levels: all members, officers only, chief only',
      'Tag system for flexible searchability',
      'Full-text search by title or content',
      'Filter by category',
      'Document metadata: effective date, review date, uploaded by',
      'Expandable document list with content preview',
    ],
    sections: [
      {
        title: 'Access Levels',
        type: 'indicators',
        items: [
          { label: 'All Members', desc: 'Visible to everyone in the department.' },
          { label: 'Officers Only', desc: 'Restricted to members with officer rank or above.' },
          { label: 'Chief Only', desc: 'Restricted to the chief and designated administrators.' },
        ],
      },
    ],
    tips: [
      'Use consistent tags across documents so related items surface together in search.',
      'Set review dates on policies and contracts to ensure timely updates.',
      'Upload the signed PDF of every contract and agreement — the vault is the single source of truth.',
      'Use version numbers to track document revisions over time.',
    ],
    howTo: [
      { step: 'Add a document', detail: 'Click + New Document, enter the title, category, version, description, and set the access level.' },
      { step: 'Tag and categorize', detail: 'Add comma-separated tags and select the appropriate category for easy filtering.' },
      { step: 'Control access', detail: 'Set the access level to determine who can view the document.' },
      { step: 'Search and filter', detail: 'Use the search bar to find documents by title or content. Filter by category to narrow results.' },
    ],
    related: ['SOG Library', 'Policy Sign-offs', 'Mutual Aid Agreements', 'Grant Management'],
  },

  // ── Database Admin ────────────────────────────────────────────────────────
  'db-admin': {
    name: 'Database Admin',
    group: 'AI & Tools',
    overview: 'A diagnostic tool for system administrators. The Database Admin page audits all database tables, shows row counts, identifies empty tables, and provides a force-reseed button to repopulate demo data. Use it to verify data integrity and troubleshoot seeding issues.',
    features: [
      'Full table audit with row counts',
      'Status indicators: populated, empty, runtime OK, error',
      'Summary statistics: total tables, populated, empty, runtime, total rows',
      'Force Reseed button to repopulate all seed data',
      'Reseed results display with per-module status (OK or FAILED)',
      'Table status grouping by category',
    ],
    sections: [
      {
        title: 'Table Status Indicators',
        type: 'indicators',
        items: [
          { label: 'Populated (green)', desc: 'Table has data — row count shown.' },
          { label: 'Empty (red)', desc: 'Table exists but has zero rows.' },
          { label: 'Runtime OK (blue)', desc: 'Runtime or system table — no seed data expected.' },
          { label: 'Error (orange)', desc: 'Table could not be queried — possible schema issue.' },
        ],
      },
    ],
    tips: [
      'Run a table audit after any deployment to verify all seeds ran successfully.',
      'Use Force Reseed to repopulate empty tables without affecting existing data — seeds skip tables that already have rows.',
      'Check the reseed results for any FAILED modules and review server logs for the specific error.',
    ],
    howTo: [
      { step: 'Audit tables', detail: 'Open Database Admin to see all tables with their row counts and status.' },
      { step: 'Identify gaps', detail: 'Look for tables marked Empty — these may need seeding or may indicate a failed migration.' },
      { step: 'Force reseed', detail: 'Click Force Reseed to run all seed files. Review the results for any failures.' },
    ],
    related: ['Station Settings', 'Data Import'],
  },

  // ── Radio Log ──────────────────────────────────────────────────────────────
  'radio-log': {
    title: 'Radio Log',
    description: 'Live and historical radio communications captured from your station\'s radio system.',
    sections: [
      {
        heading: 'What is the Radio Log?',
        type: 'text',
        body: 'The Radio Log captures every radio transmission on your monitored frequencies, transcribes it using AI (OpenAI Whisper), and displays it in a searchable, filterable timeline. Radio traffic also appears live on The Board, the Command Board during incidents, and the TV Display ticker.',
      },
      {
        heading: 'Radio Feed Locations',
        type: 'fields',
        items: [
          { label: 'The Board', description: 'Scrolling feed of all radio traffic between the Crew Board and River Timeline. Shows talkgroup badges, timestamps, and priority indicators.' },
          { label: 'Command Board', description: 'Live radio panel integrated into the incident control screen. All tactical and dispatch traffic visible during active incidents.' },
          { label: 'TV Display', description: 'Ticker bar at the bottom of the wall display showing the last 5 radio transmissions. Updates via WebSocket in real time.' },
          { label: 'Radio Log Page', description: 'Full searchable history of all radio transmissions with talkgroup filtering, keyword search, and date range filtering.' },
        ],
      },
      {
        heading: 'Talkgroup Colors',
        type: 'indicators',
        items: [
          { label: 'Fire Dispatch', color: 'red', description: 'Primary dispatch channel — dispatch alerts and status updates.' },
          { label: 'Fireground Tac', color: 'orange', description: 'Tactical channels used during active incidents.' },
          { label: 'EMS', color: 'green', description: 'Emergency Medical Services channel.' },
          { label: 'Mutual Aid', color: 'purple', description: 'Inter-department mutual aid communications.' },
          { label: 'Command', color: 'blue', description: 'Command-level communications.' },
        ],
      },
    ],
    tips: [
      'Use the Simulate button to test radio features before connecting real hardware.',
      'Radio transmissions are stored for 30 days by default. Adjust retention in radio config.',
      'Low-confidence transcriptions appear in lighter text with a percentage indicator.',
      'Dispatch calls are auto-detected by AI and highlighted with a red badge.',
      'The WebSocket connection shows a green "Live" indicator when connected.',
    ],
    howTo: [
      { step: 'Test with simulated data', detail: 'Click the Simulate button on the Radio Log page or The Board to inject sample radio messages.' },
      { step: 'View live feed', detail: 'Open The Board to see radio traffic in the Radio Feed zone. During an incident, the Command Board shows radio alongside unit tracking.' },
      { step: 'Search history', detail: 'Open the Radio Log page and use the search bar to find specific transmissions by keyword or talkgroup.' },
      { step: 'Connect hardware', detail: 'Set up an RTL-SDR + Raspberry Pi at the station. Configure talkgroups in Station Settings > Radio Integration.' },
    ],
    related: ['Command Board', 'The Board', 'TV Display', 'Station Settings'],
  },

};
export function getModuleHelp(pageId) {
  return MODULE_HELP[pageId] ?? null;
}
