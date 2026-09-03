# OpenFirehouse User Manual
**Version 2.0**

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard](#dashboard)
3. [Personnel](#personnel)
4. [Apparatus](#apparatus)
5. [Operations](#operations)
6. [Career & Workforce Management](#career--workforce-management)
7. [Administration](#administration)
8. [Reports & Export](#reports--export)
9. [AI-Powered Modules](#ai-powered-modules)
10. [Tools](#tools)
11. [Notifications & Alerts](#notifications--alerts)
12. [Station Settings](#station-settings)
13. [AI Assistant](#ai-assistant)
14. [Fire Dictation Widget](#fire-dictation-widget)
15. [Correspondence Log](#correspondence-log)
16. [TV Display](#tv-display)
17. [Role-Based Access Reference](#role-based-access-reference)
18. [Tips & Shortcuts](#tips--shortcuts)

---

## Getting Started

OpenFirehouse is a comprehensive, modern management platform for volunteer, career, and combination fire departments. It runs entirely in your web browser — no installation or special software required. All data syncs instantly to a shared server database, so records are always current and available to authorized users across your station.

### Logging In

When you first open OpenFirehouse, you'll see the login screen. You can use demo accounts to explore the system:

| Username | Password | Role | Access Level |
|----------|----------|------|--------------|
| chief    | 1234     | Fire Chief | Full access to all modules |
| officer  | 1234     | Captain / Training Officer | Full operational & personnel access |
| member   | 1234     | Firefighter I | Day-to-day operational access |

You can also click **Quick Demo Login** to select a role card directly without typing credentials. This is the fastest way to explore different permission levels.

Your session stays active for up to 7 days. If you close your browser, OpenFirehouse will log you back in automatically when you return.

### Navigation

The left sidebar contains all modules, organized into five collapsible groups:
- **Personnel** — Member roster, recruitment, scheduling, training, wellness
- **Apparatus** — Apparatus tracker, maintenance, inspections, SCBA
- **Operations** — Incidents, reports, inspections, pre-plans, CAD, drills, events
- **Administration** — SOGs, budget, grants, fundraising, payroll, assets, imports
- **Tools** — AI Scheduling

Dashboard, Notifications, Station Settings, and Logout are always visible at the top and bottom of the sidebar.

### Role-Based Access

OpenFirehouse enforces role-based permissions. Modules and features you don't have access to are hidden from your sidebar and blocked if accessed directly.

**Chief / Fire Chief**
- Full access to all modules including Budget & Finance, Station Settings, and administration
- Can create, edit, and delete records in any module
- Can configure station-wide settings

**Officer / Captain**
- Full access to operational and personnel modules
- Cannot access Budget & Finance, Station Settings, or Payroll
- Can create and edit most records; Chief approval required for some features

**Member / Firefighter**
- Access to day-to-day operational modules (incidents, schedules, drills)
- Can view own certifications, training, hours, and health records
- Read-only access to apparatus and incident data
- Cannot access administration or sensitive modules

**Visibility Reference:**

For the complete page-by-page access matrix, see [Role-Based Access Reference](#role-based-access-reference) at the end of this manual.

---

## Dashboard

The Dashboard is your command center. It provides a real-time snapshot of station activity, outstanding items requiring action, and quick access to frequent tasks.

### Features

**Live Statistics Row**
- Active members on duty
- Apparatus in service (out of total fleet)
- Incidents this month (year-to-date in parentheses)
- Total training hours this month

**Apparatus Status Board**
- Color-coded grid showing all apparatus with current status
- Green = In Service | Amber = Maintenance | Red = Out of Service | Blue = Reserve
- Click any unit to jump to its Apparatus Tracker detail

**Active Alert Ticker**
- Critical and Warning alerts only (Info alerts not shown)
- Includes apparatus OOS, overdue inspections, expiring certifications, health flags
- Click any alert to jump directly to the affected record

**Duty Crew Display**
- Active members assigned to the current shift
- Shows rank and assignment type

**Weather Widget**
- Current conditions and temperature
- Wind speed and direction (critical for fire behavior and logistics)
- Forecast for next 24 hours

**Upcoming Events Calendar**
- Next 5 department events (drills, meetings, training)
- Click any event to open Event Calendar

**Recent Incidents**
- Last 5 incidents logged with type, address, units, and time
- Click any incident to open Incident Log detail

**Quick Action Cards**
- One-tap shortcuts to Log Incident, Add Training Hours, Start Inspection, View Schedule

### TV Mode

Click the **TV** button to switch Dashboard to TV Mode — a simplified, full-screen display optimized for wall-mounted station monitors. Cycles through sections automatically.

---

## Personnel

### Member Roster

The central hub for all department members. Search, filter, and manage your roster.

**Features**
- Searchable table of all members with name, rank, role, status, and join date
- Filter by status (Active, Inactive, On Leave, Probationary), rank, or role
- Expand any row to view contact information and certification panel
- Add, edit, or delete members

**Adding a Member**
1. Click **Add Member** (top right)
2. Enter name, date of birth (auto-calculates age), rank, role, status, and join date
3. Select applicable certifications (auto-linked to Health & Wellness)
4. Click Save

**Editing or Deleting**
- Click the pencil icon to edit | Click the trash icon to delete
- Confirm deletion (cannot be undone)

---

### Recruitment & Onboarding

Track prospective members from initial contact through probationary completion.

**Pipeline Stages**
1. Interested — Initial inquiry
2. Applied — Formal application received
3. Interview — Interview scheduled and completed
4. Background Check — Background investigation in progress or complete
5. Onboarding — New hire orientation and equipment issue
6. Probationary — Active probationary period (typical: 6 months)

**Managing the Pipeline**
- Drag applicants between stage columns to update status
- Click any applicant card to view full record: contact history, notes, start date, mentor assignment
- Applicants move to Probationary automatically when hired

**Adding an Applicant**
1. Click **Add Prospect**
2. Enter name, contact info, source of inquiry, and initial notes
3. Applicant starts in "Interested" stage
4. Update stage as applicant progresses

---

### Duty Schedule

Weekly shift calendar with drag-and-drop assignment and AI scheduling assistance.

**Features**
- 7-day calendar view with shift blocks
- Navigate weeks with arrow buttons or jump to a specific week
- Drag members between shifts to reassign
- Color-coded shifts by type (Response, Training, Administrative, Standby)
- AI Scheduler can auto-fill based on availability and certifications

**Adding a Shift**
1. Click any day cell or **Add Shift** button
2. Select member, date, start/end time, shift type
3. Optionally link to an event or drill
4. Click Save

**Using AI Scheduler**
1. Click **Auto-Fill Week** or **Auto-Fill Month**
2. Set parameters: minimum crew, required certifications, exclude unavailable members
3. Review suggested schedule
4. Accept or manually adjust before publishing

---

### Volunteer Hours

Log and track volunteer hours by type. Feeds LOSAP eligibility dashboard and retention scoring.

**Activity Types**
- Emergency Response — Active emergency incident
- Training — Formal training classes, certifications, scenarios
- Maintenance — Station maintenance, equipment upkeep
- Administrative — Committee work, mentoring, recruiting
- Community — Community risk reduction, public education
- Other — Specify in notes

**Logging Hours**
1. Click **Log Hours**
2. Select member, activity type, date
3. Enter hours (minimum 0.25, maximum 24 per entry)
4. Optionally enter description and incident/reference number
5. Click Save

**YTD Summary**
- Each member's total hours by type
- Visual progress bars toward annual targets
- Used by LOSAP dashboard and Retention Scoring

---

### Member Portal

A consolidated profile view for each member showing all relevant records in one place.

**What's Included**
- **Profile Card** — Name, rank, status, years of service, incident count, member ID
- **Certifications** — Current certifications with status and expiry dates (amber = due soon, red = overdue)
- **Training History** — All completed training with dates and CE credits
- **Volunteer Hours** — YTD total by activity type with progress bars
- **Incident Participation** — Incidents member responded to (FF count, most recent)
- **Health & Wellness** — Physical status, SCBA fit test status, exposure count (members see own record only)
- **Availability** — Current status and last updated time

**Accessing Member Portal**
1. Click **Personnel > Member Portal** (or click member card from Roster)
2. Select a member from the grid or search
3. View all consolidated data on one page

---

### Training

The comprehensive training hub with five sub-tabs: Records, Compliance & LOSAP, On-Demand Modules, Scenarios, and Exams.

#### Training Records Tab

Centralized certification tracking for all members.

**Features**
- Searchable list of all training records by member
- Filter by certification type, status, expiry status
- Expandable rows showing member name, cert type, completion date, expiry, provider
- Status indicators: Current (green), Due Soon (amber, 90 days), Overdue (red)

**Adding a Training Record**
1. Click **Add Record**
2. Select member and certification type from dropdown
3. Enter completion date and expiry date (auto-calculated for standard certs)
4. Optionally add provider name, cost, CE credits
5. Click Save

**Expiry Alerts**
- 90-day warning badge (amber) appears in roster and module
- Overdue certs (red) appear in Notifications
- Certified trainers can bulk-enroll members in renewal courses

#### Compliance & LOSAP Tab

Dashboard showing collective training compliance and LOSAP eligibility.

**Displays**
- 50-point LOSAP threshold progress for each member
- YTD training hours toward annual minimum
- Completion rates by certification type
- Color-coded indicators: Green (on track) → Amber (at risk) → Red (non-compliant)
- Bulk action buttons for renewing expiring certifications

#### On-Demand Modules Tab

10+ self-directed, interactive training courses. Each awards 0.5 continuing education credit upon completion with passing quiz.

**Available Modules** (examples)
- Hazmat Level 1 Awareness
- NFPA 1582 & Health & Wellness
- Incident Command System (ICS) Refresher
- Driver/Operator Safety
- Communication & Dispatch
- Radio Protocols
- Active Shooter Response
- High-Angle Rescue
- Water Rescue Fundamentals
- Building Construction

**Taking a Module**
1. Click module title
2. Read content and study materials
3. Complete embedded interactive activities
4. Pass final quiz (70% minimum)
5. Certificate with CE credit issued automatically
6. Record appears in member's Training tab instantly

#### Scenarios Tab

32 decision-tree scenarios across 7 categories. Expert-tier interactive training.

**Categories**
- Structure Fires (7 scenarios)
- Vehicle Fires (4 scenarios)
- Rescue Operations (5 scenarios)
- Hazmat & Technical (5 scenarios)
- EMS & Medical (4 scenarios)
- Command & Leadership (4 scenarios)
- Community Risk Reduction (3 scenarios)

**Running a Scenario**
1. Select a scenario by category
2. Read incident brief and initial conditions
3. Make tactical decisions at each decision point
4. Receive feedback on choices (correct/suboptimal/critical error)
5. Complete debrief with learning objectives
6. Submit for record (doesn't count as required training, Expert training only)

#### Exams Tab

Officer-created timed exams with PDF certificate issuance.

**Features**
- Exam pool organized by subject (ICS, Hazmat, Apparatus, Operations, etc.)
- Set time limits, passing score, passing score, and question randomization
- Members take exams on schedule; results tracked with score and date
- Passing members receive PDF certificate with officer signature

**Creating an Exam**
1. Click **Create Exam**
2. Enter title, subject, time limit (15–120 minutes), passing score (50–100%)
3. Add questions from question bank or create new ones
4. Set availability (members can retake or one attempt only)
5. Publish

**Taking an Exam**
1. Open assigned exam from your module
2. Answer all questions within time limit
3. Submit for grading
4. View score immediately; download certificate if passed

---

### Health & Wellness

NFPA 1582 compliance tracking: annual physicals, SCBA fit tests, exposure events, and vaccinations.

**Privacy & Access**
- Members see only their own record (all details)
- Officers see summary dashboard (status badges only)
- Chiefs see full details for all members (with privacy banner)

**Member Detail View** (4 collapsible sections)

**NFPA 1582 Physicals**
- Annual or biennial exam history
- Provider name and facility
- Pass/Concern/Fail result
- Medical restrictions if applicable
- 90-day expiry warning (amber badge)
- Overdue flag (red badge)

**SCBA Fit Tests**
- Fit test history by date
- Mask model used (assigned or optional)
- Pass/Fail result and technician notes
- 90-day reminder for next due date
- Mandatory for all SCBA users

**Vaccinations**
- Immunization records (Flu, COVID, Hepatitis B, Tetanus, etc.)
- Vaccination date and provider
- Status badges: Current, Expired, Up for renewal

**Exposure Log**
- Incidents member responded to with exposure potential
- Exposure type (Smoke, Chemical, Pathogen, Thermal, Bloodborne, Other)
- Incident number (linked to Incident Log)
- Decontamination performed? (Y/N)
- Medical evaluation performed? (Y/N)
- Notes on exposure details

**Logging an Exposure**
1. Open member detail
2. Expand Exposure Log
3. Click **Log Exposure**
4. Select incident, exposure type, date
5. Note decontamination and medical evaluation
6. Save

**Alerts & Notifications**
- Physicals due within 90 days trigger Notifications
- Failed physicals show member as unavailable
- Overdue SCBA fit tests block apparatus assignment
- Bloodborne pathogen exposures auto-generate a health alert

---

### Cadet Program

Junior firefighter (ages 14–17) tracking and progression.

**Features**
- Name, date of birth (age auto-calculated), guardian contact info
- Rank progression: Cadet → Senior Cadet → Junior Officer
- Training hour tracking toward rank advancement (50 hours per rank)
- Monthly activity log
- Graduation workflow when member turns 18

**Adding a Cadet**
1. Click **Add Cadet**
2. Enter name, DOB, guardian name, email, phone
3. Select starting rank (typically Cadet)
4. Click Save

**Tracking Progress**
- Training hours log for each cadet (auto-linked to Training module)
- Rank advancement checklist (50-hour thresholds)
- Attendance record at drills and training events
- Click **Promote** to advance rank when requirements met

**Graduation Workflow**
- When cadet turns 18, click **Initiate Graduation**
- Converts to regular member with prior rank preserved
- Career history note automatically added

---

### Retention Scoring

Automated engagement score (0–100) combining four factors:
- **Training hours** (40%) — Annual training volume
- **Volunteer hours** (30%) — Total emergency + volunteer response
- **Tenure** (20%) — Years of service
- **Probation status** (10%) — Completed probation = full points

**Rolling Window:** 90-day evaluation window with automatic recalculation.

**At-Risk Flag**
- Scores below 40 trigger an "At Risk" badge in Member Roster
- Chiefs receive at-risk notification
- Recommended follow-up: training offer, mentoring, scheduling conversation

**Viewing Retention Scores**
- **Member Roster:** Click filter button to show At-Risk members only
- **Member Portal:** Retention score displayed on profile card
- **Dashboard:** Quick summary of high-risk members in alert ticker

---

### Real-Time Availability

One-tap toggle for members to indicate availability. 30-second auto-refresh. Department-wide headcount.

**How It Works**
- Click **Availability** in sidebar or Dashboard card
- Show yourself as Available or Unavailable with one tap
- Status syncs instantly to all connected users
- Department-wide headcount displays: "8 members available" / "14 members signed out"
- Color indicators: Green = available | Amber = limited (on-scene, training) | Red = unavailable

**Use Cases**
- Mark unavailable when off-duty or away
- Officers check availability before calling in recalls
- Scheduling algorithm uses real-time availability data
- Live incident response uses availability to suggest respondents

---

## Apparatus

### Apparatus Tracker

Inventory and status tracking for all department apparatus.

**Features**
- Searchable grid with unit designation, type, year, make, model, mileage, status
- Status indicators: Green (In Service) | Amber (Maintenance) | Red (Out of Service) | Blue (Reserve)
- Click any apparatus card to open detail with full specs and maintenance history
- Mileage/pump hour tracking with service interval warnings

**Status Definitions**
- **In Service** — Ready for dispatch
- **Maintenance** — Scheduled maintenance, expected back in service within 7 days
- **Out of Service** — Non-operational, cannot be used. Generates Critical alert
- **Reserve** — Backup unit, available if needed

**Adding Apparatus**
1. Click **Add Apparatus**
2. Enter unit designation (e.g., "Engine 1"), type (Engine, Tanker, Rescue, etc.), year, make, model
3. Enter current mileage and pump hours (if applicable)
4. Set status and click Save

**Editing Status**
- Click apparatus card, change status dropdown, click Save
- Changing to "Out of Service" generates Critical alert
- Changing from "Out of Service" clears alert

---

### Maintenance Log

Work orders per apparatus with priority tracking and cost management.

**Features**
- Select apparatus to view its maintenance history
- Priority levels: Routine (gray) | Urgent (amber) | Emergency (red)
- Status workflow: Pending → In Progress → Completed (or Deferred)
- Auto-calculated total cost: parts + labor
- Next service mile/date tracking with overdue warnings

**Adding a Work Order**
1. Click **Add Record**
2. Select apparatus, date, work type (e.g., "Engine oil change", "Pump inspection")
3. Set priority (Routine/Urgent/Emergency)
4. Enter parts cost and labor cost (total auto-calculates)
5. Set next service miles/date
6. Click Save

**Workflow**
- Open work orders (Pending/In Progress) highlighted in amber
- Completed orders show completion date and actual cost
- Deferred orders retain for future reference
- Chief can view total maintenance costs by unit or time period

**Emergency Priority**
- "Emergency" priority automatically sets apparatus to "Out of Service"
- Clears when work order marked "Completed"

---

### Inspection Checklists

Pass/fail apparatus and station inspections with deficiency tracking.

**Features**
- Template library with pre-built checklists (Apparatus Inspection, Station Facility, etc.)
- Color-coded due status: Green (Current) | Amber (Due) | Red (Overdue)
- Failing any item auto-opens notes field for deficiency details
- Progress bar at top turns red if any failures detected
- Completed inspections permanently recorded

**Running an Inspection**
1. Click **Start Inspection** on any template
2. Select apparatus or station
3. Navigate collapsible item categories
4. Toggle each item Pass (green) or Fail (red)
5. For failed items, deficiency notes auto-appear — fill in details of issue
6. Progress bar shows completion status
7. Click **Complete Inspection** when done
8. Record permanently archived with timestamp and inspector name

**Managing Deficiencies**
- Failed items link to Maintenance Log (auto-open work order if Critical finding)
- Deficiency notes appear in apparatus Maintenance Log
- Track deficiency resolution in follow-up inspections

---

### SCBA / Air Management

Per-cylinder tracking by serial number with hydrostatic test dates, fill records, and condition status.

**Features**
- SCBA unit list with serial number, manufacturer, model, assigned member, last inspection date
- Hydrostatic test due dates with 90-day reminder badge
- Fill record history with dates and technician
- Condition status: Green (Certified) | Amber (Inspection Due) | Red (Failed/Out of Service)

**Adding an SCBA Unit**
1. Click **Add Unit**
2. Enter unit ID/serial number, manufacturer, model, year manufactured
3. Enter cylinder specifications (size, type, max pressure)
4. Set initial inspection date and next hydrostatic test due date
5. Optionally assign to a member (can reassign later)
6. Click Save

**Logging Service**
1. Click wrench icon on any unit
2. Select service type: Inspection | Fill Record | Hydrostatic Test
3. Enter date, technician name, and results
4. For failed inspections, status auto-changes to Red (Out of Service)
5. Click Save

**Alerts & Compliance**
- Overdue hydrostatic tests (typically 3-year cycle) trigger Warning alerts
- Failed units marked Red automatically
- 90-day reminder (amber badge) for upcoming tests
- Never Dispatch list available for officers before call-outs

---

## Operations

### Incident Log

Central record of all emergency responses, call-outs, and mutual aid.

**Features**
- Chronological table with incident number, date, time, type, alarm level, address, units, personnel, disposition
- Click any incident row to expand full detail view
- Photos and video attachable
- Voice-dictated narrative field (mobile-friendly)
- Disposition tracking: Incident Resolved | Still Active | No Incident Found | Mutual Aid Assist | Training

**Adding an Incident**
1. Click **Log Incident**
2. Enter incident number (auto-assigned if blank), date, time
3. Select incident type from dropdown (Structure Fire, Vehicle Fire, Rescue, EMS, Hazmat, etc.)
4. Enter alarm level (Box, Still, Second, etc.), address
5. Select units and personnel who responded
6. Enter disposition, injury count (if any), damage estimate
7. Optionally record narrative (can be voice-dictated on mobile)
8. Attach photos/video if available
9. Click Save

**Incident Types**
- Structure Fire
- Vehicle Fire
- Brush/Wildland Fire
- Vehicle Accident
- Technical Rescue
- Water Rescue
- Medical/EMS
- Hazmat
- Gas Leak
- Public Assist
- False Alarm
- Mutual Aid
- Other

**Auto-Linking**
- Incident automatically linked to Health & Wellness exposure log if selected
- Apparatus mileage/pump hours auto-incremented
- Personnel response counted toward hours (if logged)

---

### NFIRS / NERIS Reports

Dual-format incident reporting: NFIRS 5.0 (U.S. standard) and NERIS 1.0 (New Jersey transition format).

**Features**
- Format toggle: Switch between NFIRS and NERIS mode
- NERIS transition banner showing migration timeline
- Completeness tracking shows % of required fields filled
- Draft/Complete/Submitted workflow
- Export as JSON for submission to state

**NFIRS (National Fire Incident Reporting System) 5.0**
- Basic module (all incidents)
- Fire module (fire incidents)
- Structure Fire module (residential/commercial structure fires)
- EMS module (EMS responses)
- Arson module (fire investigation cases)
- Apparatus/Personnel module
- All fields comply with NFIRS coding standards

**NERIS (New Jersey Emergency Response Information System) 1.0**
- Geolocation data (latitude/longitude required)
- Multi-type incident categorization (replace single NFIRS type)
- Enhanced EMS data (outcome tracking, transport facility)
- Enhanced risk assessment (occupancy hazards, special circumstances)
- Integration with NJ state reporting dashboard

**Creating a Report**
1. Click **New Report**
2. Select source incident from Incident Log (auto-fills matching fields)
3. Choose format: NFIRS or NERIS
4. Complete all required fields marked with *
5. Progress bar shows completeness %
6. Save as Draft
7. Chief/Officer reviews and marks Complete
8. Submit to state system when ready

**Status Workflow**
- Draft: Work in progress, can be edited
- Complete: All required fields filled, ready for submission
- Submitted: Report sent to state; read-only thereafter

---

### Pre-Incident Plans

6-tab tactical pre-plans for high-risk occupancies in your first-due area.

**Risk Levels**
- Green (Normal) — Standard occupancy, minimal hazard
- Amber (Elevated) — Multiple hazards, special access concerns
- Red (Critical) — High-hazard occupancy (hospital, school, large assembly)
- Purple (Hazmat) — Chemical storage, manufacturing, bulk storage

**Six Tabs**

**1. Overview**
- Property name, address, occupancy type (Residential, Commercial, Industrial, Institutional, etc.)
- Owner contact information and emergency contact
- Risk level and last review date (flag if >180 days old)
- Floor count, total square footage, access notes

**2. Hazards**
- List all hazards identified (e.g., "Propane bulk storage", "Medical gases", "Flammable liquids", "Explosive devices")
- Hazard type, location in building, quantity, and containment status
- Special handling notes (e.g., "Requires HAZMAT team for any emergency")

**3. Access & Egress**
- Main entrance locations and type (doors, gates, loading dock)
- Key access procedures (buzzed entry, key pad, contact property manager)
- Roof access points and condition
- Basement/sub-level entry
- Evacuation routes and assembly areas
- Parking and apparatus staging area

**4. Water Supply**
- Hydrant locations and flow ratings (static/residual PSI, GPM)
- Sprinkler system type and connection point
- Static water source locations (pond, swimming pool, etc.)
- Tanker drop-off locations
- Total water supply available

**5. Suppression Systems**
- Sprinkler system type (wet pipe, dry pipe, pre-action), coverage areas
- Fire extinguisher locations and types
- Foam system (if present)
- Deluge systems or other suppression
- Automatic system shut-off locations

**6. Utilities**
- Electrical main disconnect location and procedure
- Gas main shut-off location and procedure
- Propane valve location (if applicable)
- HVAC shut-off (air intake)
- Contact information for utility companies

**Adding/Editing a Plan**
1. Click **New Plan**
2. Fill in Overview tab first
3. Use Previous/Next buttons to navigate through all six tabs
4. Save at any point (auto-saves)
5. Click **Complete** when all tabs filled
6. Plan immediately available to all personnel

**Detail View**
- Click any property card to open read-only detail view
- All sections collapsed by default; expand to read
- Tactical notes appear in amber callout box at top
- Click **Edit** to modify any section

---

### Hydrant Management

Water supply inventory with ISO classification and testing.

**Features**
- List or map view of all hydrants in first-due area
- ISO flow classification (1–10; higher = better supply)
- Static and residual pressure readings (PSI)
- Flow rate (GPM) with available flow at 20 PSI residual
- Annual test records with technician and date
- Status: Normal (green) | Needs Repair (amber) | Out of Service (red)

**Adding a Hydrant**
1. Click **Add Hydrant**
2. Enter hydrant ID (municipal reference number)
3. Enter street address or GPS coordinates
4. Select owner: Municipal | Private
5. Enter installation year and barrel size (2.5" or 3")
6. Click Save

**Logging a Flow Test**
1. Click hydrant record → **Add Flow Test**
2. Enter test date, technician name
3. Record static pressure (PSI)
4. Record residual pressure (PSI)
5. Record flow rate (GPM)
6. System auto-calculates available flow at 20 PSI residual
7. Save

**Out of Service**
- Marking a hydrant Out of Service generates Critical alert
- Alerts all personnel; affects pre-incident plan routing
- Resolving when repair completed clears alert

---

### Drills & Courses

Plan, document, and track department training drills and formal courses.

**Features**
- Drill type: Live Fire | Hose Evolution | Search & Rescue | EMS | Hazmat | Driver/Operator | Other
- Date, time, location, lead instructor
- Attendance tracking with personnel list
- ISO hour credit calculation
- Drill report PDF generation for files

**Adding a Drill**
1. Click **Add Drill**
2. Enter title (e.g., "Hose Advancement Drill"), type, date, start/end time
3. Select location (station or external address)
4. Select lead instructor
5. Optionally attach learning objectives
6. Save (drill created in pending state)

**Conducting a Drill**
1. Open scheduled drill
2. Mark attendance: toggle each member Present/Absent/Excused
3. Record weather conditions, safety incidents
4. Add brief notes on drill execution
5. Click **Complete Drill**

**ISO Hour Tracking**
- Completion automatically credited to training records
- Hours apply toward LOSAP requirements
- Audit trail shows drill date and attendees

**Drill Report**
- After completion, click **Generate Report**
- PDF includes drill details, attendees, objectives, and notes
- Print or email to department files

---

### Station Daily Log

Shift journal for recording apparatus checks, staffing, events, and operational notes.

**Features**
- Timestamped entries attributed to logged-in user
- Entry categories: Operational | Maintenance | Administrative | Visitor | Other
- Shift summary mode for official daily station log
- Searchable by date range, category, or keyword

**Adding an Entry**
1. Click **New Entry**
2. Select category
3. Write entry text (e.g., "Engine 1 pre-shift check complete - all systems functional")
4. Optionally attach reference number (incident #, work order #, etc.)
5. Click Save (auto-timestamps)

**Shift Summary**
- Senior officer on duty at shift start can create **Shift Summary** entry
- Serves as official daily log: crew roster, apparatus status, safety briefing summary
- Locked after submission (read-only thereafter)

**Filtering & Searching**
- Filter by date, category, keyword
- Live search across all log entries
- Useful for incident reconstruction or audit review

---

### Community Risk Reduction (CRR)

Home safety visits, smoke detector installs, school programs, and juvenile fire setter intervention.

**Program Types**
- Smoke Alarm Installation
- Home Safety Survey
- School Education Program
- Senior Outreach
- Business Safety
- Juvenile Fire Setter Intervention
- Other

**Adding a Program**
1. Click **New Program**
2. Enter program name, type, target area/address, scheduled date
3. Assign lead coordinator (staff member)
4. Set goal (homes visited, alarms to install, people to reach)
5. Save

**Logging Results**
1. Open completed program
2. Enter number of households visited
3. Number of smoke alarms installed
4. Number of hazards identified and corrected (e.g., blocked exits, improper storage)
5. Materials distributed (fact sheets, etc.)
6. Participant feedback score (1–5 stars)
7. Save

**YTD Summary Dashboard**
- Total homes visited this year
- Total alarms installed
- Total people reached
- Trend charts showing program growth
- Linked to Public Dashboard community metrics

---

### Fire Inspections & Permits

Occupancy inspections, violation tracking, and permit management.

**Features**
- Property inspections with occupancy classification
- Violation tracking by code section
- 90-day permit expiry warnings
- Tier II and HazMat hazard flagging
- Re-inspection workflow

**Scheduling an Inspection**
1. Click **New Inspection**
2. Enter property name, address, occupancy type (1–10 classification)
3. Select assigned inspector (Chief or Officer only)
4. Set scheduled date
5. Save

**Running an Inspection**
1. Open scheduled inspection
2. Use checklist to record violations by code section
3. For each violation: code section, description, severity, correction deadline
4. Mark overall result: Pass | Failed | Re-Inspection Required | Pending
5. Save

**Violations & Corrections**
- Failed items auto-generate 30-day correction deadline
- Inspector can extend deadline by request (Chief approval)
- Property owner contact email auto-populated for notice
- Follow-up re-inspection scheduled automatically

**Re-Inspection Workflow**
- Original violations carry forward to re-inspection form
- Inspector marks each violation: Corrected | Still Outstanding | Modified
- If violations persist, escalate to code enforcement or close-out

**Tier II & HazMat Flagging**
- Inspections involving hazardous materials auto-flag for HazMat section
- Tier II chemical inventory requirement flagged in Hazmat Management
- Linked to pre-incident plan (automatically creates/updates plan)

---

### Fire Investigation

NFPA 921 case tracking for fire cause and origin investigation.

**Features**
- Case tracking: case number, linked incident, cause classification, investigator
- Six-section form: Scene Info | Evidence | Interviews | Cause Determination | Final Disposition | Evidence Log
- Cause classifications: Accidental | Natural | Incendiary | Undetermined | Under Investigation
- Evidence chain-of-custody logging
- NFIRS arson module integration

**Adding an Investigation**
1. Click **New Investigation**
2. Link to incident from Incident Log
3. Assign investigator (Chief/Officer with Fire Investigation certification required)
4. Set case open date and initial suspected cause
5. Save

**Investigation Form Sections**
- **Scene Info:** Time of discovery, first responders, weather, structural condition
- **Evidence:** Items collected, location found, photo, chain of custody
- **Interviews:** Witness statements, owner/occupant interviews, injuries/casualties
- **Cause Determination:** Origin determination, cause classification, contributing factors
- **Final Disposition:** Case closed/referred to law enforcement/insurance
- **Evidence Log:** Permanent record of all evidence collected and stored

**Attaching NFIRS Arson Module**
- At completion, attach official NFIRS Arson Module report
- System links investigation to NFIRS report for submission

---

### CAD Integration

Connect to county Computer-Aided Dispatch system for automatic incident import.

**Supported CAD Systems**
- Active911 (via webhook)
- I Am Responding (via API)
- Seven additional vendors supported (contact admin for setup)

**Features**
- Incoming calls feed with real-time updates
- 30-second auto-refresh showing newest dispatches first
- Unit assignments and call type from CAD
- One-click promotion to Incident Log
- Automatic address sanitization for public-facing reports

**Promoting CAD Call to Incident**
1. Open incoming call feed
2. Click any recent CAD call to preview details
3. Click **Create Incident** button
4. OpenFirehouse pre-fills Incident Log form with: incident type, address, unit assignments, time
5. Review and add any station-specific details (personnel, apparatus mileage)
6. Save to finalize Incident Log entry

**CAD Connection**
- Configured in Station Settings (Chief only)
- Requires API key from dispatch center
- Test connection button to verify active link
- Auto-retry failed connections with exponential backoff

---

### Event Calendar

Monthly/list view of department events with RSVP tracking.

**Features**
- Dual views: Calendar (monthly grid) | List (chronological)
- Toggle views with view selector buttons
- Color-coded event types (Training, Meeting, Drill, Fundraiser, etc.)
- RSVP per member: Going | Not Going | Maybe

**Adding an Event**
1. Click **Add Event**
2. Enter title, type, date, start/end time, location
3. Select organizer (Chief/Officer/specific member)
4. Set max attendees (optional cap)
5. Attach event description or requirements
6. Save

**RSVP & Attendance**
1. Click any event to open detail panel
2. Toggle your RSVP: Going | Not Going | Maybe
3. View attendee list (shows RSVPs)
4. After event date, RSVPs locked to read-only
5. Chiefs can manually mark attendance if different from RSVP

---

### Public Dashboard

Read-only external view of station activity for lobby display or community website embedding.

**Features**
- YTD statistics: Total Responses, Fire Incidents, EMS Responses, Rescues, Line-of-Duty Injuries
- Monthly incident bar chart (12-month history)
- Calls-by-type donut chart
- Unit Status Board (all frontline apparatus with real-time status)
- Recent Incidents table (house numbers stripped for privacy)
- Live data indicator (updates automatically)
- Station branding and logo

**Privacy**
- Incident addresses generalized (street name only, no house number)
- Member names never displayed
- Personnel count aggregated (no individual assignment details)
- No member health or personnel data visible

**Embedding on Website**
- Provided embed code for iframe integration
- Auto-refreshes every 5 minutes
- Responsive design for mobile viewing
- Direct URL: `/public?station=[stationID]`

---

### Recall / All-Call

Issue urgent member recalls with urgency levels and real-time response tracking.

**Urgency Levels**
- **Standby** — Advisory recall; stand by for possible dispatch
- **Report** — Come to station within 30 minutes
- **Emergency** — All-hands emergency; immediate response expected

**Issuing a Recall**
1. Click **Issue Recall**
2. Enter recall title and message (e.g., "Emergency: Mutual Aid Structure Fire")
3. Select urgency level (Standby/Report/Emergency)
4. Choose notification method: Push (in-app) | SMS (Twilio, optional) | Both
5. Click **Send**

**Response Tracking**
- Real-time dashboard shows who has acknowledged
- Red = no response | Amber = acknowledged but not en route | Green = en route or on-scene
- Countdown timer showing time since recall issued
- Follow-up list of members who haven't responded after 5 minutes

**Notifications**
- Push notification sent to all members instantly
- Optional SMS for Emergency urgency (if Twilio configured)
- In-app banner with recall details and countdown timer

---

### Incident Command Center

Live ICS (Incident Command System) board for active major incidents.

**Features**
- Elapsed timer (minutes since incident start)
- Milestone benchmarks (e.g., "First engine on scene", "Defensive stance declared")
- Personnel Assignment Board (ICS 203 equivalent)
- Unit tracking with ETA and on-scene status
- Radio/comms log with timestamped transmissions
- PAR (Personnel Accountability Report) countdown timer

**Starting an ICS Board**
1. Open incident from Incident Log
2. Click **Start ICS Board** (for major incidents only)
3. Assign Incident Commander from dropdown
4. Set start time (auto-set to now)
5. Board opens in shared view mode

**Using the Board**
- **Assignments:** Add personnel to divisions (Div A, B, C, etc.) with task
- **Units:** Add apparatus with ETA or on-scene status update
- **PAR Countdown:** Set target PAR time (e.g., "PAR in 5 minutes"); countdown auto-starts
- **Comms Log:** Click to add timestamped radio transmission (e.g., "Engine 1 to Dispatch: We have smoke showing")
- **Milestones:** Click to mark milestone achieved (triggers audio notification to all officers watching)

**Multi-User Sync**
- All officers/chiefs see live board updates in real-time
- Changes by one user appear instantly for all viewing
- Board access: Chief/Officer only; read-only for Members
- Archived after incident closure for AAR (After-Action Review)

---

### Hazmat Management

Chemical inventory, exposure logging, decon records, and SDS integration.

**Features**
- Chemical inventory with quantity, location, hazard classification
- SDS (Safety Data Sheet) upload and searchable reference
- Exposure incident logging
- Decontamination records (personnel and equipment)
- Integration with Incident Command Center for active incidents
- Level A/B/C/D response checklist

**Managing Chemical Inventory**
1. Click **Add Chemical**
2. Enter chemical name, location in station/building, quantity, hazard class (Health/Fire/Reactivity)
3. Upload SDS document (PDF)
4. Set reorder level and approval for disposal
5. Save

**SDS Reference**
- Search SDS database by chemical name or CAS number
- Full SDS viewer with download option
- Accessible during incident response from Incident Command Center
- Offline cache available for low-connectivity environments

**Logging Exposures**
1. Click **Log Exposure** during or after incident
2. Link to incident and personnel exposed
3. Exposure type: Inhalation | Skin | Ingestion | Injection
4. Chemical involved and quantity
5. Decontamination performed: Y/N with details
6. Medical evaluation: Y/N with facility and provider
7. Save (auto-links to Health & Wellness exposure log)

**Decon Records**
- Equipment decontamination checklist (SCBA, PPE, vehicles)
- Personnel decontamination notes
- Facility/environment decon procedures
- All records linked to incident for AAR

---

### Response Analytics

Automatic turnout time analysis with NFPA 1720 color coding.

**Features**
- Monthly turnout time bar chart (12-month history)
- Turnout time = dispatch time to first apparatus en route
- NFPA 1720 color coding: Green (<6 min) | Amber (6–9 min) | Red (>9 min)
- Drill calls excluded (separate "Training Calls" filter)
- Exportable data for grant reports and accreditation

**Dashboard View**
- Average turnout time for current month
- Trend line showing 90-day rolling average
- Month-by-month bar chart with color coding
- Toggle to include/exclude drill calls

**Understanding Metrics**
- **Green (<6 min):** Meets NFPA 1720 standard for urban/suburban
- **Amber (6–9 min):** Acceptable but trending toward standard
- **Red (>9 min):** Below standard; investigate causes
- **Turnout includes:** Dispatch receipt → crew donning → crew boarding → first unit en route

**Automatic Calculation**
- Turnout time auto-calculated from Incident Log timestamp + first unit en route time
- Officers mark "En Route" time in app or CAD system
- No manual entry required (fully automatic from incident data)

---

## Live Incident Response

The signature feature of OpenFirehouse. One-tap "I'm Responding" button triggers AI-generated Mission Brief, interactive checklist, and live AI Q&A optimized to NJ firefighter certification level.

### The I'm Responding Workflow

**Step 1: One-Tap Response**
- From mobile or desktop, click **I'm Responding** button in top navigation
- Or click Incident Alert card from Dashboard
- System auto-selects active incident and logs you as responding
- Status changes to "EN ROUTE"

**Step 2: AI Mission Brief** (generated automatically)
- Brief tailored to your certification level (Probationary, FF I, FF II, Officer, HazMat Ops, EMT)
- Content examples:
  - Probationary: "Basic fire behavior, where to set up, radio protocol"
  - FF I: "Hose deployment, RIC procedures, ladder operations"
  - FF II: "Fire behavior prediction, ventilation strategy, construction hazards"
  - Officer: "Incident strategy, resource requests, accountability procedures"
  - HazMat Ops: "Chemical properties, PPE requirements, decon procedures"
  - EMT: "Patient care priorities, transport decisions, contraindications"

**Step 3: Pre-Arrival Checklist**
- Interactive checklist auto-generated based on incident type:
  - Structure Fire: "Don full PPE → Grab SCBA → Board apparatus → Equipment check → Radio in"
  - Vehicle Accident: "Obtain scene size-up → Establish triage area → Park safely → Equipment staging"
  - Medical/EMS: "Verify scene safety → Obtain vitals → Prepare transport → Contact hospital"
  - Hazmat: "Approach from upwind → Establish hot zone → Don Level B/C PPE → Await specialist"
- Items are checkboxes; member toggles each as complete
- Incomplete items highlighted when arriving on scene

**Step 4: On-Scene Status Update**
- Click **ON SCENE** button when arriving
- System logs on-scene timestamp
- Updates ICS board in real-time if Chief is watching
- Pre-arrival checklist auto-expands to on-scene checklist

**Step 5: Live AI Q&A**
- Floating chat widget appears on right side of screen (mobile: bottom)
- Ask context-aware questions: "What's the hydrant flow here?", "Structural markings interpretation?", "Next steps for patient?", "RIC assignment?"
- AI responds with field-specific guidance drawing from:
  - Building pre-incident plan (if available)
  - Hydrant flow data
  - NFPA standards
  - NJ-specific regulations
  - Member's own incident history

**Step 6: Incident Cleared**
- Click **CLEARED** when returning to station
- System logs cleared timestamp
- Calculates total incident time and apparatus mileage
- Marks member available again in real-time availability
- Incident data feeds Analytics dashboard automatically

### Certification-Level Customization

The AI Mission Brief and Q&A are tailored to New Jersey firefighter certifications:

**Probationary**
- Basic fire behavior fundamentals
- Radio protocol and terminology
- SCBA operation
- Where to stage and when to enter
- "Ask more senior firefighter first" suggestions

**Firefighter I (FF I)**
- Building construction fundamentals
- Hose deployment and pressure management
- RIC procedures and bench-marking
- Proper ladder usage
- Water supply and fireground positioning

**Firefighter II (FF II)**
- Advanced building construction (load paths, collapse indicators)
- Fire behavior prediction (wind, fuel load, ventilation)
- Attack/defensive strategy decision points
- Ventilation strategy
- Command post locations

**Fire Officer**
- Strategic incident decisions
- Resource request language
- ICS 203 (assignment card) generation
- Mutual aid coordination
- Personnel accountability at scale
- Strategic vs. defensive decision logic

**HazMat Operations**
- Chemical properties and reactivity
- Level A/B/C/D personal protective equipment requirements
- Decontamination procedures
- Scene approach and perimeter establishment
- SDS integration (access chemical sheets during incident)

**EMT (Emergency Medical Technician)**
- Patient assessment (AVPU, vitals)
- Transport decision logic
- Contraindication checking
- Crew assignments for multi-casualty events
- Hospital destination guidance

### Mobile-First Design

- Responsive layout: fits mobile phone portrait orientation
- One-hand operation: all buttons reachable with thumb
- Offline capability: mission brief cached when dispatch arrives
- Auto-brightness adjustment for nighttime outdoor use
- Haptic feedback on button press (iOS) or vibration (Android)

### Example Mission Brief (Structure Fire → FF I)

```
INCIDENT: Structure Fire - 123 Main St

BRIEF FOR: Firefighter I

FIRE BEHAVIOR
- Single story, wood frame (lightweight truss construction)
- Smoke showing from front-right window
- Wind: NE 8 mph - fire will push left
- Expect rapid spread if not attacked quickly

KEY ACTIONS
1. Secure your SCBA and don full PPE
2. Engine crews stage on hydrant side (south side of Main St)
3. Ladder for rescue assessment
4. Interior attack on alpha side only - watch for truss failure indicators

SAFETY ALERT
- This is a truss roof - watch for sagging or popping sounds
- Coordinate with interior crews before opening walls (collapse risk)
- RIC crew stands ready with rope and irons

RADIO CHECKS
- "Engine 1 to Dispatch: Crews on scene, beginning operations"
- Listen for Incident Commander assignments before acting
```

---

## Administration

### SOG Library

Department policies and Standard Operating Guidelines by category with version tracking and review due dates.

**Categories**
- Operations | Safety | Administrative | Training | EMS/Medical | Apparatus | Personnel | Communications | Hazmat

**Status Types**
- **Active** — Current policy in effect
- **Draft** — Work in progress, not approved
- **Under Review** — Pending approval, marked with warning banner
- **Superseded** — Replaced by newer version, archived

**Review Due Dates & Alerts**
- "Due Soon" badge (amber): 90 days before review date
- "Overdue" badge (red): Review date has passed
- Clicking alert in Notifications jumps directly to SOG

**Adding an SOG**
1. Click **Add SOG**
2. Enter SOG number (e.g., "OPS-015"), category, status, title
3. Set version number and approval date
4. Set next review date (typically 2 years out)
5. Enter author name and approvals (Chief name/date)
6. Add tags (searchable metadata)
7. Paste or upload full policy text
8. Click Save

**Detail View**
- Title, number, version, approval date
- Full policy text
- Tags for filtering
- Edit/Delete buttons (Chief only)
- Print button for posting or distribution

---

### Budget & Finance

Budget lines vs. actual spending with progress tracking. Chief-only access.

**Views**

**Budget Overview Tab**
- Bar chart: Budget Allocated vs. Actual Spent by category (Personnel, Apparatus, Equipment, etc.)
- Click category to expand subcategories with individual progress bars
- Color coding: Green (<70%) | Amber (70–90%) | Red (>90%)

**Transactions Ledger Tab**
- Full transaction log with search, filters, and export
- Type filter: Expense | Revenue | Grant Reimbursement | Donation | Transfer
- Category filter to narrow results
- Expand any row to see check number, approver, and notes

**Adding a Transaction**
1. Click **Add Transaction**
2. Select type: Expense/Revenue/Grant/Donation/Transfer
3. Select category and subcategory
4. Enter date, description, amount, vendor, and reference number
5. Optionally upload receipt photo
6. Select approver (Chief confirmation)
7. Click Save

**Fiscal Year Configuration**
- Set fiscal year start date in Station Settings (Chief)
- All budget reports and transactions grouped by fiscal year
- Can view multiple years in archive for comparison

---

### Grant Management

Full lifecycle tracking: Researching → Applied → Awarded → Denied → Closed.

**Features**
- Grant source, program name, amount requested/awarded
- Application deadline, award date, reporting deadline
- Milestones and expenditure tracking
- Grant reporting module for final reports and closeout

**Adding a Grant**
1. Click **New Grant**
2. Enter grantor name (Foundation, FEMA, State, etc.), program name
3. Amount requested and deadline
4. Primary contact at grantor
5. Intended use of funds
6. Click Save (starts in "Researching" stage)

**Grant Lifecycle**
- **Researching** — Initial stage; add notes on eligibility, requirements
- **Applied** — Application submitted; track deadline
- **Under Review** — Waiting for grantor decision; watch for interim deadlines
- **Awarded** — Grant approved; enter amount awarded and schedule
- **Denied** — Application rejected; archive with notes for lessons learned
- **Closed** — All funds expended and reports filed; historical record

**Expenditure Tracking**
- Link expenses from Budget & Finance module to grant
- Auto-sum: total spent vs. grant amount
- Warn if expenditures exceed award amount

**Reporting Tab**
- Log interim progress reports and final reports
- Due dates auto-populate from grant record
- Alerts trigger 30 days before due date
- Archive report documents (PDF/Word) in system

---

### Fundraising

Campaign management for departmental fundraising events.

**Campaign Types**
- Pancake Breakfast | Car Wash | Charity Auction | Donation Drive | Raffle

**Adding a Campaign**
1. Click **New Campaign**
2. Select type, enter campaign name, start/end date
3. Set revenue goal
4. Assign lead coordinator
5. Click Save

**Tracking Results**
- Donation ledger with date, donor name (optional), amount
- Progress bar toward goal
- Donor count and average donation statistics
- Trend toward goal (days remaining)

**Donations Module**
- Click **Add Donation** to log individual gifts
- Donor name (optional), amount, payment method (Cash/Check/Card), date
- Thank you letter auto-generated for paper records

**Campaign Summary**
- Total raised, percent of goal, average donation
- Donor list (for thank-you acknowledgments)
- Bulk donor export (CSV) for mail merge

---

### Bulletin Board

Departmental announcements with priority levels, expiration dates, and pinning.

**Priority Levels**
- **High** (red) — Urgent announcements: immediate action required
- **Medium** (amber) — Important but not urgent
- **Low** (gray) — FYI notices

**Categories**
- Operations | Personnel | Training | Safety | Community | Administrative

**Features**
- Expiration date: bulletin auto-archives after date
- Pin/Unpin: chiefs can pin important notices to top of feed
- Post history: filter by date range and category
- Officer+ posting permission

**Adding a Bulletin**
1. Click **New Bulletin**
2. Select category, priority, and expiration date
3. Enter title and message
4. Optionally attach file (PDF, image, document)
5. Click Post

**Member View**
- Feed of current bulletins sorted by pin status, then date
- Color-coded by priority
- Click to read full text and attached file
- Archived bulletins searchable

---

### Asset & Inventory

Equipment and supply tracking with reorder flags and check-in/out logs.

**Features**
- Equipment categories (Tools, PPE, Hose, Nozzles, etc.)
- Quantities on hand
- Reorder level and flags (low stock alert)
- Check-in/out log with member and date
- Last inventory date and audit flag

**Adding an Asset**
1. Click **Add Asset**
2. Enter asset name, category, quantity on hand
3. Set reorder level (orange flag if below)
4. Optional: manufacturer, model, serial number
5. Click Save

**Inventory Management**
- Click **Check Out** to log removal from inventory
- Click **Check In** to log return
- Each transaction records member name and timestamp
- Quantity auto-updates

**Reorder Alerts**
- Inventory below reorder level shows orange flag
- Notifications alert Chiefs when stock is low
- Exportable purchase lists for ordering

---

### Reports & Export

Generate and export custom reports in PDF and CSV formats.

**Available Report Types**
- Incident Summary (date range, type, units, personnel)
- Training Report (certifications, completions, hours)
- Volunteer Hours Report (by member, activity type, YTD totals)
- Apparatus Status (current status, mileage, maintenance)
- Annual Activity Report (YTD statistics, trend analysis)
- Personnel Report (roster, certifications, health status)
- Budget Summary (spending vs. allocation)

**Generating a Report**
1. Click **Generate Report**
2. Select report type and date range
3. Optional filters: apparatus, member, incident type
4. Click **Export PDF** or **Export CSV**
5. File downloads to device

**Report Contents** (varies by type)
- Title page with station name and date range
- Summary statistics
- Detailed tables or charts
- Footer with generation timestamp

---

### Payroll & Stipends

Per-call, meeting, training, and annual stipend management with exportable pay reports.

**Stipend Types**
- Per-call payment (e.g., $50 per response)
- Meeting attendance (e.g., $25 per meeting)
- Training attendance (e.g., $20 per class hour)
- Annual retention stipend (e.g., $2,000 annual)

**Pay Periods**
- Select pay period (monthly, bi-weekly, or custom range)
- View all members with hours logged in period
- Calculated pay auto-computes based on rates

**Pay Period Workflow**
1. Click **New Pay Period**
2. Select period dates and type (Monthly/Bi-weekly/Custom)
3. Hours auto-populate from Volunteer Hours module
4. System applies pay rates from configuration
5. Review calculated totals for each member
6. Click **Approve Pay Run** to advance to Approved status
7. Export as CSV for accounting system or check processing

**Individual Records**
- Click member to view payment history
- Rate history showing any changes during employment
- YTD earnings summary
- Previous pay period comparison

**Configuration** (Chief only)
- Set pay rates per stipend type
- Annual LOSAP target hours
- Effective dates for rate changes

---

### Data Import

7-step wizard for bulk importing records from CSV files or legacy systems.

**Supported Systems**
- CSV export from any legacy RMS (column mapping is configurable in the
  wizard, with templates for the most common export formats)

**Import Types**
- Members (roster)
- Incidents (incident history)
- Apparatus (fleet list)
- Training Records (certifications and completions)
- Volunteer Hours (historical hours logs)

**Import Wizard Steps**
1. **Select Type** — Choose what you're importing
2. **Download Template** — Get CSV format with required columns
3. **Fill Data** — Complete CSV with your records
4. **Upload CSV** — Select file to import
5. **Validation** — System validates each row (green = valid, red = error)
6. **Review Summary** — See validation results and errors
7. **Confirm Import** — Write valid rows to database; skip errored rows

**Error Handling**
- Failed rows listed with reason (missing field, invalid format, duplicate)
- You can correct and re-import just failed rows
- No partial imports: all valid rows must be accepted or entire import cancelled

---

## Career & Workforce Management

These modules support career (paid) and combination departments. When your station is configured as **volunteer-only** in Station Settings, these modules are hidden. They appear automatically when the department type is set to **Career** or **Combination**.

### FLSA Overtime Dashboard

Tracks Fair Labor Standards Act 207(k) compliance for career firefighters. Chief-only access.

**Features**
- Current work period boundaries with days remaining countdown
- Per-member hours progress bars showing regular, OT, leave, and trade hours
- 85% threshold warnings (amber) and 100% OT alerts (red)
- Configurable work periods: 7, 14, 21, or 28 days
- OT threshold configuration per work period
- Export: JSON export for payroll integration

**Configuration**
1. Go to **Station Settings → Career Config**
2. Set **Department Type** to Career or Combination
3. Set FLSA work period length (default: 7 days / 40 hours)
4. Set period start date (anchor date for period calculations)

---

### Timesheets

FLSA-compliant timesheet generation and approval. Chief-only access.

**Features**
- Period-based timesheet generation (aligned to FLSA work periods)
- Auto-calculates hours from: daily staffing + OT records + leave requests
- Tracks: regular hours, OT hours, leave hours, trade hours, total hours
- Approval workflow: Draft → Submitted → Approved
- CSV export for payroll processing
- Per-member detail view with hour breakdowns

---

### OT Equalization Board

Ensures fair overtime distribution across career and part-time members. Chief-only access.

**Features**
- Lowest-hours-first rotation ranking (next person up for OT is the one with fewest total OT hours)
- Mandatory vs. voluntary OT type tracking
- Deviation statistics: shows how far each member is from the department average
- Last OT date display for rotation sequencing
- Filters to show career and part-time members only (volunteers excluded from OT rotation)
- Seniority-based tiebreaker when OT hours are equal

---

### Payroll & Stipends

Payment tracking for career, per-diem, and stipend-based compensation. Chief-only access.

**Features**
- Multiple pay types: per-call, stipend, shift-based, hourly rate, salary
- Period selection: weekly, biweekly, monthly, quarterly, fiscal year
- Workflow: Pending → Approved → Paid
- Configurable default rates per payment type
- Member-level payment history

---

### Grievance Tracker

Union grievance tracking with formal escalation pipeline. Officer access.

**Grievance Types (17)**
- Contract violation, pay dispute, safety concern, discipline appeal, scheduling, working conditions, equipment, training, leave denial, harassment, discrimination, retaliation, benefits, overtime, seniority, health/wellness, other

**4-Step Escalation**
1. **Step 1 — Verbal**: Informal resolution between member and supervisor
2. **Step 2 — Written**: Formal filing with union representative involvement
3. **Step 3 — Dept Head**: Management escalation with written response required
4. **Step 4 — Arbitration**: Third-party binding arbitration

**Fields**
- Grievance number, CBA article reference, filed date
- Union representative and management representative
- Timeline tracking with resolution date
- Status: Open, In Progress, Resolved, Withdrawn

---

### Personnel Actions

Tracks promotions, disciplinary actions, commendations, and performance reviews. Officer access.

**Action Types (21)**
- Promotion, demotion, suspension, termination, commendation, letter of reprimand, written warning, verbal warning, performance review, probation completion, transfer, retirement, resignation, injury report, return to duty, certification update, special assignment, temporary detail, merit award, service award, other

**Features**
- Full audit trail with dates, descriptions, and issuing authority
- Status tracking: Active, Pending, Archived
- Attachments support for documentation
- JSONB details field for structured supplemental data

---

### Exposure Tracking

OSHA-required occupational exposure documentation. Officer access.

**Exposure Types (14)**
- Smoke, chemical, biological, asbestos, diesel exhaust, PFAS/AFFF, structural collapse dust, CO, HCN, radiation, combustion byproducts, bloodborne pathogen, noise, thermal

**Features**
- Linked to incident number for cross-reference
- Duration and PPE used tracking
- Medical follow-up notes and status
- Decontamination procedures documented

---

### Daily Staffing Board

Real-time duty assignments by apparatus and position. Officer access.

**Features**
- Date navigator with shift selection
- Drag-and-drop member assignment to apparatus positions
- Minimum staffing alerts when below threshold
- Available-for-callback roster (off-duty members who can respond)
- Coverage gap identification with visual indicators
- Hours tracking per assignment

---

### Shift Patterns (Platoon Scheduling)

Configures rotating shift patterns for career departments. Chief-only access.

**Supported Patterns**
- 24 on / 48 off
- 48 on / 96 off
- Custom cycle-on / cycle-off durations
- Kelly Day intervals for recovery days
- Anchor date configuration for cycle alignment

---

### Shift Trades

Member-initiated shift trade requests with approval workflow. All members access.

**Workflow**
1. Member requests a trade (selects date, shift, and proposed swap partner)
2. Swap partner accepts or declines
3. Officer or Chief approves the trade
4. Schedule automatically updated

---

### Apparatus Out-of-Service

Tracks apparatus temporarily removed from service. Officer access.

**Features**
- OOS type classification (mechanical, accident, scheduled maintenance, inspection)
- Start date, estimated return date, actual return date
- Impact classification (critical, moderate, minor) based on fleet coverage
- Coverage plan documentation
- Linked to maintenance records when applicable

---

### Qualifications & Certifications

Member certification tracking with expiration alerts. Officer access.

**Certification Types (30+)**
- Firefighter I/II, Driver/Operator, Fire Officer I/II/III, Fire Instructor I/II, Fire Inspector I/II, Hazmat Awareness/Operations/Technician, EMT-B, Paramedic, AEMT, BLS, ACLS, PALS, CPR, Rope Rescue, Confined Space, Water Rescue, Trench Rescue, Structural Collapse, NIMS 100/200/300/400/700/800, Incident Safety Officer, Pump Operator, Aerial Operator, and more

**Features**
- Issuing authority and certificate number tracking
- Automatic expiration date alerts (90-day and 30-day warnings)
- Status tracking: Active, Expired, Pending Renewal, Revoked
- Bulk export for compliance reporting

---

### Cadet Program

Junior firefighter / explorer program management. Officer access.

**Features**
- Cadet roster with date of birth, school, enrollment date
- Parent/guardian contact information (name, phone, email)
- Rank progression tracking within cadet program
- Training hours accumulation
- Certification tracking for age-appropriate courses
- Status: Active, Inactive, Graduated, Withdrawn

---

## Reports & Export

The Reports & Export module (Officer access) provides centralized printing and data export for the entire platform.

### Bulletin Board Prints

Pre-formatted documents designed for posting at the station. Opens a print preview in a new tab.

**Available Prints**
- **Member Contact Directory** — Portrait format, sorted by rank, with phone/email. Marked confidential.
- **Monthly Duty Schedule** — Landscape calendar grid with shift type, crew names, and today highlighted. Month picker for navigation.
- **Community Events Calendar** — Next 6 weeks of events with type badges, time, and location.
- **Apparatus Status Board** — Landscape format with all units, status badges, mileage, and service dates. Overdue flagged with warning.

### Data Reports

Export data as CSV (for spreadsheets) or PDF (formatted for county coordinators, grant reviewers, or state agencies). All reports support date range filtering.

**Available Reports (15)**

| Report | Date Filter | Description |
|--------|:-----------:|-------------|
| Member Roster | ✓ | All personnel with ranks, roles, statuses, join dates, contact info, certifications |
| Apparatus Status | — | Full fleet inventory with service history, mileage, operational status |
| Incident Log | ✓ | All incidents with units, personnel, alarm levels, dispositions |
| Training Records | ✓ | Training completions, certifications, expiry dates, hours logged |
| Mutual Aid Log | ✓ | Mutual aid given/received with partner departments and personnel |
| Duty Schedule | ✓ | Scheduled shifts with crew assignments and coverage |
| Overtime Records | ✓ | OT records with type (mandatory/voluntary/holdover), hours, reason |
| Personnel Actions | ✓ | Promotions, disciplinary actions, commendations, reviews |
| Exposure Records | ✓ | OSHA exposure tracking with type, duration, PPE, follow-up |
| Grievance Log | — | Union grievances with CBA article, step, status, representatives |
| Qualifications | — | All member certifications with expiry, issuing authority, status |
| After-Action Reports | ✓ | Post-incident reviews with findings, lessons learned, action items |
| Daily Staffing Log | ✓ | Duty assignments by apparatus and position with hours |
| Cadet Program Roster | — | All cadets with guardian info, enrollment, training hours |

**Export Tips**
- **CSV** files open in Excel, Google Sheets, or Numbers — ideal for further analysis or importing into other systems
- **PDF** files are formatted with your station name and date — ready to print or email
- Use the **date range filter** to scope time-sensitive reports to a specific period (fiscal year, grant window, etc.)

---

## AI-Powered Modules

OpenFirehouse includes 9 AI-powered modules that use a dual-model architecture: OpenAI GPT-4o Mini (primary) with Anthropic Claude (fallback). AI features require an API key to be configured in Vercel environment variables (OPENAI_API_KEY and/or ANTHROPIC_API_KEY).

### AI Response Analytics

Analyzes incident response data against NFPA 1710/1720 benchmarks. Officer access.

**Tabs**
- **Dashboard** — Real-time stats: average response time, total incidents, busiest periods
- **Analyze** — Deep analysis of individual incidents with tactical observations and safety considerations
- **Trends** — Multi-incident trend detection across volume, type, geography, and timing
- **Narrative** — Officers write incident narratives themselves. The software does not auto-generate NFIRS/NERIS narrative.

---

### AI Incident Intelligence

Post-incident analysis engine for performance evaluation. Officer access.

**Features**
- Single-incident deep analysis comparing against NFPA 1710/1720 standards
- Trend analysis across 100+ recent incidents for pattern recognition
- Structured field review against NFPA 1710/1720 standards (narrative stays officer-written)
- Quarterly goal recommendations and risk alerts

---

### AI Training Recommender

Identifies training gaps and generates personalized learning paths. Officer access.

**Tabs**
- **Gap Analysis** — Expiring certifications, inactive members, skill deficiencies
- **Recommendations** — Personalized training plans based on role, rank, and incident history
- **Curriculum Builder** — Full curriculum generation with objectives, sessions, materials, assessments
- **Compliance Dashboard** — NFPA 1001, 1002, 1403, 1500 and OSHA tracking

---

### AI Report Writer

Generates professional fire department documentation. Officer access.

**Report Types**
- After-action reports with executive summary, response timeline, analysis, lessons learned
- Monthly department reports analyzing incidents, training, apparatus status, trends
- Executive summaries with key metrics and actionable recommendations
- Mutual aid activity reports with partnership analysis

---

### AI Pre-Plan Generator

Creates and enhances pre-incident tactical plans with NJ-specific considerations. Officer access.

**Features**
- Complete pre-plan generation from property data with NFPA 220/101 construction analysis
- Enhancement of existing plans with gap identification
- Hazard-specific analysis: fire behavior, collapse risk, hazmat exposure, PPE requirements
- Tactical size-up checklist with decision points, benchmarks, contingency plans
- NJ-specific: NJAC regulations, mutual aid coordination

---

### AI Staffing Predictor

Forecasts staffing needs and detects burnout risk. Officer access.

**Features**
- 7-day staffing forecast vs. leave requests and coverage gaps
- AI optimization suggestions balancing workload and qualifications
- Historical pattern analysis by day-of-week and incident peak hours
- What-if scenario modeling (e.g., multiple members on leave)
- Burnout risk detection based on hours, consecutive shifts, incident responses

---

### AI Scheduling

Conversational scheduling powered by Claude. Officer access.

**How It Works**
- Describe coverage needs in plain English (e.g., "Cover next week with at least one officer per shift")
- AI generates optimized shift assignments with conflict detection
- Review, adjust, and publish directly to the Duty Schedule module

---

### AI Meeting Minutes

Converts raw meeting transcripts into structured minutes. Officer access.

**Features**
- Paste or type a raw transcript and click Summarize
- AI extracts: meeting title, type, agenda items, motions with vote results, action items with assignees, attendees, key decisions
- Supports all meeting types: regular, special, emergency, executive, committee, training, budget, planning, annual
- Meeting minutes can be linked to related records (incidents, training, grievances, etc.)

---

## Tools

### AI Scheduling

AI-assisted duty schedule optimization based on availability, certifications, and historical patterns.

**How It Works**
1. Click **AI Scheduler** in Tools
2. Set parameters:
   - Date range (week or month)
   - Minimum crew size per shift
   - Required certifications (e.g., "must have 1 FF II per shift")
   - Excluded members (on leave, medical restrictions)
3. Click **Generate Schedule**
4. AI produces draft schedule considering:
   - Member availability (from Real-Time Availability toggle)
   - Certification levels
   - Recent response history
   - Equity (balanced workload distribution)
   - Known preferences (from past assignments)

**Reviewing & Adjusting**
- Draft schedule appears with color-coded conflicts highlighted
- Click any shift to manually adjust
- Click **Regenerate** to try different parameters
- Click **Publish** to apply schedule to Duty Schedule module

**Success Factors**
- Set realistic minimum crew sizes
- Update member availability before running scheduler
- Review health/wellness restrictions (physically unable to work)
- Request certification updates for accurate matching

---

## Notifications & Alerts

Centralized alert center aggregating important notices from all modules.

**Severity Levels**
- **Critical** (red) — Immediate action required. Examples: Apparatus out of service, medical restriction, overdue SCBA fit test
- **Warning** (amber) — Action needed soon. Examples: Certification due in 30 days, inspection overdue, grant report due in 1 week
- **Info** (blue) — Informational only. Examples: Shift reminder, event in 2 days, grant award approved

**Badge Counting**
- Top bell icon shows count of Critical + Warning alerts only
- Info alerts are not counted in badge
- Badge color: Red if any Critical, Amber if only Warnings, Gray if none

**Alert Feed**
- Chronological list with newest at top
- Click any alert to jump directly to affected record
- Mark as read/unread
- Dismiss individual alerts (hiding them from feed)
- Filter by severity, module, or search keyword

**Alert Triggers** (auto-generated)
- Certifications expiring within 90 days
- Physical/fit test due soon
- Apparatus out of service
- Hydrants out of service
- Overdue inspections or maintenance
- Grant reports due
- Member at-risk (low retention score)
- SOG review due soon

---

## Station Settings

Chief-only configuration for station-wide parameters and integrations.

**Features**

**Station Information**
- Station name and number (e.g., "Station 1")
- Department name (displays on all reports)
- Street address and phone number
- Logo/image upload (displays on Public Dashboard)

**Apparatus List**
- Add/remove apparatus from fleet
- Designate frontline vs. reserve units
- Used by dispatch and apparatus status board

**API Keys & Integrations**
- Active911 webhook for CAD integration
- I Am Responding API key
- Twilio SMS credentials (for recalls)
- Custom CAD vendor connection details

**Fiscal Year Configuration**
- Start month and date for budget cycle
- Used for reports and budget tracking

**Alert Thresholds**
- Days before certification expiry to alert (default 90)
- Days before physical due to alert (default 90)
- Days before permit expiry to alert (default 30)
- Low stock reorder flag quantity for inventory

**Feature Toggles**
- Enable/disable modules (e.g., disable Budget if not using)
- Enable/disable AI Scheduler
- Enable/disable Incident Command Center
- TV Display enabled/disabled
- Public Dashboard visibility (public or password-protected)

---

## AI Assistant

Floating chat widget available on every page. Context-aware suggested questions (PAGE_STARTERS) with intelligent answers about NFIRS codes, NJ regulations, and LOSAP rules.

**How to Use**
- Click chat bubble icon (bottom right on mobile, right sidebar on desktop)
- Type a question or select a suggested question
- AI responds with field-relevant information
- Previous questions shown in chat history
- Click X to collapse widget

**Smart Question Suggestions**
- Widget shows 3 context-aware suggested questions based on current page
- Examples on Incident Log: "What's NFIRS code for vehicle fire?", "How do I report this?"
- Examples on Training: "What's LOSAP 50-point threshold?", "CE credit requirements?"
- Examples on Health: "NFPA 1582 physical requirements", "SCBA fit test frequency?"

**Knowledge Base Integration**
- Answers draw from NFIRS 5.0 coding guides
- New Jersey fire safety regulations
- LOSAP (Law Enforcement Officers and Firefighters Fire Exempt Volunteer Insurance Plan)
- NFPA standards (1582, 1720, 1600, 1921)
- Building construction references
- Apparatus specifications

**Learning Context**
- AI remembers incident types, location history, personnel
- Customizes answers to your department's specific setup
- Learns common questions and improves over time

---

## Fire Dictation Widget

Global floating microphone for fire-service-aware speech-to-text. Available on every page, the dark circular button sits in the bottom-right corner next to the AI Assistant widget.

**How to Use**
- Click the mic button (or press **Ctrl+Shift+M**) to start listening
- Speak naturally — the system transcribes your speech in real time
- Text is automatically cleaned through a fire service terminology processor and inserted into whatever text field you last clicked
- Click the mic again (or press Ctrl+Shift+M) to stop
- The expanded panel shows a live transcript preview and character count

**Fire Service Post-Processing**

Raw speech is automatically corrected using a built-in fire service dictionary:

| You say | System transcribes |
|---------|-------------------|
| "engine one four two" | Engine 142 |
| "n f p a fifteen hundred" | NFPA 1500 |
| "battalion chief" | Battalion Chief |
| "ten four" | 10-4 |
| "s c b a" | SCBA |
| "par check all clear" | PAR check All Clear |
| "division two" | Div 2 |
| "flash over" | flashover |

**Supported Terminology**
- **Apparatus designations** — Engine, Ladder, Truck, Rescue, Squad, Tanker, Tower, Quint, Ambulance, Medic, Battalion, Hazmat, Brush, Marine, Air Unit
- **NFPA codes** — NFPA 1500, 1001, 1710, 1720, 1582, and all others
- **ICS titles** — Incident Commander, Operations Section Chief, Safety Officer, Division Supervisor, Branch Director, Staging Area Manager, etc.
- **Radio codes** — 10-4, 10-9, 10-20, Signal 10, Code Red, Mayday, All Clear, PAR, RIT, FAST
- **Ranks** — Chief, Deputy Chief, Assistant Chief, Battalion Chief, Captain, Lieutenant, Firefighter, Probationary Firefighter, Engineer, Driver/Operator
- **Acronyms** — SCBA, PASS, IDLH, TIC, PPE, RIT, FAST, EMS, ALS, BLS, HAZMAT, ISO, IC, IAP, PAR, LUNAR, CAN, LDH, ABC, PIO, REHAB, LOSAP

**Works Everywhere**

The dictation widget inserts text into any text input or textarea in the entire application — incident notes, training descriptions, grievance narratives, correspondence entries, search bars, and any other text field. It works alongside the existing per-field mic buttons on individual textareas.

**Requirements**
- Chrome, Edge, or Safari (Web Speech API required)
- Microphone permission granted to the browser
- Not supported in Firefox

---

## Correspondence Log

Universal email/file/note trail that attaches to any record across the application. Use it to maintain a paper trail of communications related to grievances, personnel actions, or any other module record.

**Where to Find It**

The Correspondence Log appears inside expanded detail views of supported modules. Currently integrated with:
- **Grievance Tracker** — inside each grievance's expanded detail
- **Personnel Actions** — inside each personnel action's expanded detail

More modules will be added over time using the same universal pattern.

**Entry Types**

| Type | Icon | Purpose |
|------|------|---------|
| Email | Envelope | Paste email text — copy from any email client and paste the body |
| File | Paperclip | Drag-and-drop file upload from your computer (up to 25 MB) |
| Note | Pencil | Internal notes, memos, phone call summaries |

**Adding an Email Entry**
1. Expand a record (e.g., a grievance)
2. In the Correspondence Log section, click the **Email** tab
3. Fill in From, Subject, and paste the email body
4. Click **Save Entry**

**Uploading a File**
1. Click the **File** tab in the Add Entry form
2. Drag a file into the drop zone, or click to browse
3. Supported files: PDFs, Word docs, images, spreadsheets — any file type up to 25 MB
4. Add an optional description, then click **Upload & Save**
5. Uploaded files can be downloaded later by clicking the file name

**Adding a Note**
1. Click the **Note** tab
2. Enter a subject and note body
3. Click **Save Entry**

**Managing Entries**
- Entries display in reverse chronological order (newest first)
- Each entry card shows type badge, from name, subject, and timestamp
- Click a card to expand and read the full body
- Click the trash icon to delete an entry (files are also removed from the server)

---

## TV Display

Wall-mounted station monitor display. Access via `/tv?pin=XXXX` (pin set in Station Settings).

**Contents**
- **Live Clock** — Large digital time (updates every second)
- **Duty Crew Roster** — Members on-duty shift with rank
- **Apparatus Status Board** — All units with current status (green/amber/red)
- **Weather Widget** — Current conditions, temperature, wind speed/direction
- **Active Incident Ticker** — Any current incidents with address and units
- **Recent Activity Feed** — Last 5 incidents and drills

**Features**
- Auto-rotate between sections every 30 seconds
- High-contrast design readable from 10+ feet away
- No interaction needed (passive display)
- Refreshes every 5 minutes for live data
- TV mode enabled/disabled in Station Settings

**Setup**
1. Mount display on station wall
2. Open OpenFirehouse on connected device or TV stick
3. In address bar, navigate to `/tv?pin=[PIN]` (pin from Settings)
4. Display auto-starts cycling

---

## Role-Based Access Reference

Complete page-by-page access matrix. Pages not listed are Chief-only by default.

### Level 1 — All Members

All members (volunteer, career, part-time) can access these modules:

| Module | Page ID | Description |
|--------|---------|-------------|
| Dashboard | dashboard | Station command center with live statistics |
| Member Roster | roster | View department personnel |
| Duty Schedule | schedule | View shift assignments and coverage |
| Volunteer Hours | hours | Track personal volunteer hours / LOSAP |
| Member Portal | portal | Personal profile, certifications, availability |
| Training Records | training | View training completions and certifications |
| Wellness | wellness | Personal health and fitness tracking |
| Apparatus Tracker | apparatus | View fleet status and assignments |
| Maintenance Log | maintenance | View apparatus maintenance history |
| Checklists | checklists | Daily apparatus and station checks |
| Incident Log | incidents | View and log incident responses |
| Pre-Incident Plans | preplans | Access building pre-plans |
| Calendar | calendar | Department events and schedule |
| Community Risk | public | Public-facing community risk data |
| SOG Library | sogs | Read department policies and SOGs |
| Drills | drills | View and participate in drills |
| CRR | crr | Community Risk Reduction data |
| Alerts | alerts | View notifications and alerts |
| Recall System | recall | Respond to emergency recalls |
| Bulletins | bulletins | Read department announcements |
| Shift Trades | shift-trades | Request and manage shift trades |
| Equipment Checkout | equipment-checkout | Check out personal gear and equipment |
| Policy Acknowledgments | policy-acks | Sign and acknowledge policies |

### Level 2 — Officers and Above

Officers, Captains, and Chiefs can access all Level 1 modules plus:

| Module | Page ID | Description |
|--------|---------|-------------|
| Command Board | command | Incident command status board |
| Mutual Aid | mutualaid | Log mutual aid given/received |
| Aid Agreements | aid-agreements | Manage mutual aid agreements |
| NFIRS Reports | nfirs | Generate NFIRS/NERIS submissions |
| Fire Inspections | inspections | Schedule and conduct inspections |
| Hydrant Management | hydrants | Hydrant inventory, flow tests, maintenance |
| Station Log | stationlog | Daily station activity journal |
| Grants | grants | Grant applications and tracking |
| CAD Integration | cad | Computer-Aided Dispatch feed |
| Fire Investigation | fireinvestigation | Cause and origin investigations |
| Recruitment | recruitment | Recruitment pipeline management |
| SCBA Tracker | scba | SCBA inventory, fit tests, cylinder tracking |
| Hazmat Tracker | hazmat | Hazmat inventory and compliance |
| Asset & Inventory | assets | Equipment inventory management |
| Reports & Export | reports | Print and export data (CSV/PDF) |
| After-Action Reports | after-action | Post-incident review documentation |
| Meeting Minutes | meeting-minutes | Meeting documentation with AI summarization |
| Document Vault | doc-vault | Department document storage |
| Training Plans | training-plans | Annual training curriculum planning |
| Qualifications | qualifications | Member certification management |
| Exposure Tracking | exposure-tracking | OSHA exposure documentation |
| Daily Staffing | daily-staffing | Real-time duty assignments |
| Apparatus OOS | apparatus-oos | Out-of-service tracking |
| Assignment Board | assignboard | Apparatus crew assignments |
| Cadet Program | cadets | Junior firefighter program |
| Retention | retention | Member retention analytics |
| Personnel Actions | personnel-actions | Promotions, discipline, commendations |
| Grievance Tracker | grievances | Union grievance escalation |
| Incident Costs | incident-costs | Per-incident cost tracking |
| AI Scheduling | ai | AI-powered schedule optimization |
| AI Response Analytics | analytics | AI incident response analysis |
| AI Incident Intelligence | incident-intel | AI post-incident review |
| AI Training Recommender | training-ai | AI training gap analysis |
| AI Report Writer | report-writer | AI document generation |
| AI Pre-Plan Generator | preplan-ai | AI tactical planning |
| AI Staffing Predictor | staffing-ai | AI staffing forecasting |

### Level 3 — Chief / Admin Only

Chiefs and administrators have access to all modules plus these sensitive areas:

| Module | Page ID | Description |
|--------|---------|-------------|
| Budget & Finance | budget | Budget tracking and transaction ledger |
| Payroll & Stipends | payroll | Payment processing and history |
| Timesheets | timesheets | FLSA-compliant timesheet management |
| FLSA Dashboard | flsa | 207(k) overtime compliance monitoring |
| OT Equalization | ot-equalization | Fair overtime distribution board |
| ISO Report | iso | ISO rating documentation |
| Fundraising | fundraising | Fundraising campaign management |
| Data Import | dataimport | CSV import from external systems |
| Station Settings | settings | Department configuration and FLSA setup |

---

## Tips & Shortcuts

**Navigation**
- **Escape key** closes any modal or expanded panel
- **Search bars** filter live as you type (no enter required)
- **Expand rows** in tables by clicking anywhere on the row
- **Sidebar collapse** groups you don't use often to declutter navigation

**Data Entry**
- **Incident Log:** Click **Log Incident** button or use keyboard shortcut (Ctrl+I)
- **Dictation:** Press **Ctrl+Shift+M** anywhere to toggle the global fire dictation mic — speak and text goes into whichever field is focused
- **Training:** Quick-add training hours from Member Roster without opening full Hours module
- **Health & Wellness:** Exposures automatically linked if incident number provided
- **Dates:** Date picker supports relative dates ("tomorrow", "in 2 weeks", "1/1/2026")

**Mobile**
- **One-handed operation:** All buttons reachable with thumb; swipe for navigation
- **Offline mode:** Critical features (incident log, mission brief) work without internet
- **Auto-save:** Changes save automatically; no "submit" button required for most modules

**Data & Privacy**
- **Session restore:** You stay logged in for 7 days even if you close the app
- **Data persistence:** All records immediately visible to other logged-in users
- **Backup:** Database auto-backs up daily; contact admin for restore requests
- **Privacy:** Members see only own health/wellness; Chiefs see all (with banner)

**Reporting & Exports**
- **Quick export:** Any table has Export button (CSV)
- **PDF reports:** Use Reports & Export module for formatted documents with cover page
- **Batch actions:** Select multiple rows to bulk-edit status, assign, or delete

**Alerts & Notifications**
- **Badge count:** Bell icon shows Critical + Warning count (not Info)
- **Alert jump:** Click any alert to go directly to affected record
- **Dismiss alerts:** Mark as read to remove from badge count
- **Bulk dismiss:** Clear all Warnings for a given issue (e.g., all "cert due soon" warnings)

**Performance**
- **Search optimization:** Use filters before searching large datasets
- **Bulk imports:** Import up to 1,000 records per batch; split large imports
- **Browser tabs:** Keep multiple OpenFirehouse tabs open; changes sync across all
- **Refresh:** F5 or browser refresh updates data if changes made by others not appearing

**Accessibility**
- **Keyboard navigation:** Tab through fields; Enter to submit; Escape to cancel
- **Screen readers:** All data tables labeled; form fields have associated labels
- **Zoom:** Browser zoom works without breaking layout (100% – 150%)
- **High contrast:** Alerts and status use color + text labels (not color alone)

---

**OpenFirehouse v1.0 — Your Department's Operational Backbone**

*Free and open-source software for volunteer and combination fire departments.*

*For support, documentation, and community contributions, visit the project repository.*

*Copyright © OpenFirehouse Community. Licensed under AGPL v3.*
