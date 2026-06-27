/**
 * trainingModules.js — On-demand training module content library (Phase 4)
 *
 * Each module contains:
 *   id, title, description, category, estimatedMinutes, creditHours,
 *   certificationEarned, passingScore, slides[], quiz[]
 *
 * Slide types: 'intro' | 'content' | 'list' | 'table' | 'callout'
 * Quiz question types: 'multiple' (4 choices, 1 correct)
 */

export const MODULE_CATEGORIES = [
  'All',
  'Reporting',
  'Compliance',
  'Command & Control',
  'Hazardous Materials',
];

export const MODULES = [

  // ── 1. NFIRS CODING ESSENTIALS ──────────────────────────────────────────────
  {
    id: 'nfirs-basics',
    title: 'NFIRS Coding Essentials',
    description: 'Master the most critical NFIRS incident type, property use, and action taken codes used on every run.',
    category: 'Reporting',
    estimatedMinutes: 20,
    creditHours: 0.5,
    certificationEarned: '',
    passingScore: 70,
    badgeColor: 'bg-orange-100 text-orange-700',
    icon: '🔥',
    slides: [
      {
        type: 'intro',
        title: 'NFIRS Coding Essentials',
        body: 'The National Fire Incident Reporting System (NFIRS) is the backbone of fire service data in the U.S. Every incident you run gets coded — accurately or not. This module teaches you the codes you\'ll use on 90% of your calls.',
        note: '~20 minutes · 0.5 CE credit hours upon completion',
      },
      {
        type: 'content',
        title: 'What is NFIRS?',
        body: 'NFIRS is a nationwide database managed by FEMA/USFA that collects incident data from fire departments. NJ departments are required to report all incidents. Your reports feed state and national fire statistics — and they affect your department\'s FEMA grant eligibility.',
        keyPoints: [
          'Required by NJ for all fire, EMS, and service calls',
          'Feeds FEMA grant eligibility calculations',
          'Used to track firefighter injury and fatality trends nationally',
          'OpenFirehouse generates NFIRS-ready reports from your incident log',
        ],
      },
      {
        type: 'table',
        title: 'Structure Fire Codes (100s)',
        intro: 'These are your most critical codes. Know them cold.',
        rows: [
          ['111', 'Structure Fire — Building fire', 'Most common structure fire code'],
          ['113', 'Cooking fire — confined to container', 'Pot on stove, no extension'],
          ['114', 'Chimney or flue fire — confined', 'No structural extension'],
          ['116', 'Fuel burner / boiler malfunction', 'Mechanical issue with heating equipment'],
          ['121', 'Fire in mobile home used as fixed residence', 'Manufactured home, permanent site'],
          ['131', 'Passenger vehicle fire', 'Cars, SUVs, pickup trucks'],
          ['137', 'Camper / RV fire', 'Motorhome or travel trailer'],
        ],
        columns: ['Code', 'Description', 'Notes'],
      },
      {
        type: 'table',
        title: 'EMS & Rescue Codes (300s)',
        intro: 'Use these for medical assists, vehicle accidents, and rescues.',
        rows: [
          ['311', 'Medical assist — assist EMS crew', 'You assisted EMS but did not transport'],
          ['321', 'EMS call — excluding vehicle accident', 'Medical emergency, no vehicle involved'],
          ['322', 'Motor vehicle accident with injuries', 'Injuries present, may need EMS'],
          ['323', 'Motor vehicle accident — no injuries', 'Property damage only'],
          ['324', 'Motor vehicle accident with entrapment', 'Extrication required'],
          ['341', 'Search for person on land', 'Non-water search and rescue'],
          ['353', 'Removal of victim(s) from stairwell', 'Elevator/confined space'],
        ],
        columns: ['Code', 'Description', 'Notes'],
      },
      {
        type: 'table',
        title: 'HazMat & Service Codes (400s–500s)',
        intro: 'Gas leaks, spills, and service calls make up a significant portion of runs.',
        rows: [
          ['412', 'Gas leak — natural gas or LPG', 'Any gas odor call without ignition'],
          ['413', 'Oil or combustible liquid spill — no ignition', 'Fuel spill, hydraulic fluid'],
          ['440', 'Electrical wiring/equipment problem', 'Sparking wires, transformer issue'],
          ['500', 'Service call — general', 'When no other code fits'],
          ['510', 'Person in distress — general', 'Welfare check, assist citizen'],
          ['531', 'Smoke or odor — other', 'Odor investigation, no fire found'],
          ['542', 'Animal rescue', 'Animal stuck in structure, pipe, etc.'],
        ],
        columns: ['Code', 'Description', 'Notes'],
      },
      {
        type: 'table',
        title: 'False Alarm & Good Intent Codes (600s–700s)',
        intro: 'Always code accurately — false alarms affect department statistics.',
        rows: [
          ['611', 'Dispatched and cancelled en route', 'Cancel before arrival'],
          ['622', 'No incident found on arrival', 'Arrived, nothing found'],
          ['651', 'Smoke scare — odor of smoke', 'Investigation, no fire confirmed'],
          ['710', 'Malfunction — fire alarm system', 'System fault, no fire'],
          ['711', 'Malfunction — smoke detector', 'Residential detector false activation'],
          ['730', 'System malfunction — sprinkler system', 'Sprinkler water flow, no fire'],
          ['743', 'Smoke detector activated — cooking', 'Burnt food activation'],
        ],
        columns: ['Code', 'Description', 'Notes'],
      },
      {
        type: 'list',
        title: 'Property Use Codes — The Essentials',
        body: 'Property use codes classify where the incident occurred. You only need about 10 for 80% of your calls.',
        items: [
          { label: '419', text: '1-2 family dwelling — most residential calls' },
          { label: '429', text: 'Multifamily dwelling (3+ units) — apartment buildings' },
          { label: '439', text: 'Hotel/motel' },
          { label: '511', text: 'Church, place of worship' },
          { label: '539', text: 'School or college classroom' },
          { label: '599', text: 'Business/mercantile — unclassified (use when nothing else fits)' },
          { label: '745', text: 'Residential street/driveway — most vehicle fires and accidents' },
          { label: '936', text: 'Vacant lot — outside fires with no structure involved' },
        ],
      },
      {
        type: 'list',
        title: 'Action Taken Codes — Top 8',
        body: 'Action taken codes tell the story of what your crew actually did. You can enter multiple codes.',
        items: [
          { label: '11', text: 'Extinguishment by fire service personnel — primary suppression' },
          { label: '12', text: 'Salvage/overhaul — post-fire operations' },
          { label: '32', text: 'Provide advanced life support (ALS)' },
          { label: '33', text: 'Provide basic life support (BLS)' },
          { label: '41', text: 'Search and rescue' },
          { label: '42', text: 'Extrication of victim(s)' },
          { label: '86', text: 'Investigate — odor/smoke/alarm investigation' },
          { label: '93', text: 'Cancelled en route — use with code 611' },
        ],
      },
      {
        type: 'callout',
        title: 'Key Rules to Remember',
        points: [
          'Always use the MOST SPECIFIC code that fits. 111 (structure fire) beats 100 (fire — general).',
          'If a call has multiple elements, use the code for the primary action. A car fire with injuries is 131, not 322.',
          'Code 611 (dispatched and cancelled) should always have Action Taken = 93.',
          'Gas leaks without ignition are 412, not a fire code.',
          'When in doubt, 500 (service call — general) is your catch-all.',
        ],
      },
    ],
    quiz: [
      {
        q: 'A resident called for a pot fire on the stove. You arrived, the fire was out, confined to the pot. What NFIRS incident type code do you use?',
        options: ['111 — Structure Fire, building fire', '113 — Cooking fire, confined to container', '500 — Service call', '651 — Smoke scare'],
        answer: 1,
        explanation: '113 is the correct code. The fire was confined to the container (the pot). 111 would imply extension to the building structure.',
      },
      {
        q: 'You respond to a vehicle accident with entrapment — one patient trapped, one walking wounded. What is the primary incident type code?',
        options: ['322 — MVA with injuries', '324 — MVA with entrapment', '321 — EMS call', '311 — Medical assist'],
        answer: 1,
        explanation: '324 (MVA with entrapment) is the most specific code. It implies injuries and captures the extrication element that 322 does not.',
      },
      {
        q: 'You arrive at a residence for a smoke detector activation. Investigation reveals burnt toast — no fire, no damage. What code?',
        options: ['113 — Cooking fire confined to container', '531 — Smoke or odor — other', '743 — Smoke detector activated due to cooking', '711 — Malfunction, smoke detector'],
        answer: 2,
        explanation: '743 is the most specific code for a smoke detector that activated due to cooking (burnt food). 711 is for a malfunction — the detector worked correctly here.',
      },
      {
        q: 'A neighbor reports a gas odor outside. You arrive, check with meters, find a small natural gas leak at a meter connection — no ignition. What is the correct code?',
        options: ['111 — Structure Fire', '412 — Gas leak (natural gas or LPG)', '500 — Service call', '440 — Electrical problem'],
        answer: 1,
        explanation: '412 is specifically for natural gas and LPG leaks without ignition. It captures the hazmat element of the response.',
      },
      {
        q: 'Your unit is dispatched to an automatic alarm, arrives on scene, and finds no evidence of fire or smoke. The building owner says the alarm panel has been malfunctioning. What code?',
        options: ['622 — No incident found on arrival', '710 — Malfunction, fire alarm system', '743 — Smoke detector activated, cooking', '651 — Smoke scare'],
        answer: 1,
        explanation: '710 is correct — there is a documented system malfunction. 622 would be used when there is no explanation found. The key difference: 710 = known malfunction, 622 = nothing found at all.',
      },
    ],
  },

  // ── 2. LOSAP DOCUMENTATION ───────────────────────────────────────────────────
  {
    id: 'losap-documentation',
    title: 'LOSAP Points & Documentation',
    description: 'Understand how NJ LOSAP works, what earns points, and how to track your hours in OpenFirehouse.',
    category: 'Compliance',
    estimatedMinutes: 15,
    creditHours: 0.5,
    certificationEarned: '',
    passingScore: 70,
    badgeColor: 'bg-emerald-100 text-emerald-700',
    icon: '🏅',
    slides: [
      {
        type: 'intro',
        title: 'LOSAP Points & Documentation',
        body: 'The Length of Service Awards Program (LOSAP) is one of the most important benefits available to NJ volunteer firefighters. But it only pays out if your department documents it correctly — every year.',
        note: '~15 minutes · 0.5 CE credit hours upon completion',
      },
      {
        type: 'content',
        title: 'What is LOSAP?',
        body: 'LOSAP (N.J.S.A. 40A:14-183 et seq.) is a state-mandated pension benefit for active volunteer firefighters and first aid members in New Jersey. Participating municipalities contribute to an annuity for each qualifying member each year. The annuity grows tax-deferred and pays out when the member reaches retirement age or separates from the department.',
        keyPoints: [
          'Funded by the municipality — no cost to members',
          'Benefits vest after a set number of qualifying years (typically 5)',
          'Managed through a certified LOSAP provider (varies by municipality)',
          'A member must earn 50+ points per year to qualify for that year',
          'Points reset to zero on January 1 of each new year',
        ],
      },
      {
        type: 'table',
        title: 'How Points Are Earned',
        intro: 'The 50-point threshold must be met through a combination of activities. Training is the most controllable category.',
        rows: [
          ['Emergency responses', '1 point per response', 'No cap; requires accurate incident log'],
          ['Fire training drills', '1 point per hour', 'Maximum 20 points per year from drills'],
          ['Department meetings', '1 point per meeting', 'Maximum 6 points per year'],
          ['Non-emergency activities', '1 point per event', 'Parades, fundraisers, community events'],
          ['Officers/committee service', '5 points per year', 'Line officers, committee chairs'],
          ['Total required', '50 points minimum', 'To qualify for a pension contribution that year'],
        ],
        columns: ['Activity', 'Points', 'Notes'],
      },
      {
        type: 'callout',
        title: 'Why Training Hours Matter Most',
        points: [
          'Training is the most predictable LOSAP source — you control the schedule.',
          'A member who runs 30 calls but does no training could still fall short of 50 points.',
          'With 20 available training points, a member doing 2 hours of training per month earns 24 points from training alone — nearly halfway to the threshold.',
          'OpenFirehouse tracks training hours in real time against the 50-point threshold in the Compliance & LOSAP tab.',
        ],
      },
      {
        type: 'list',
        title: 'What Counts as Qualifying Training',
        body: 'Not all training activities automatically earn LOSAP points. Qualifying activities must meet specific criteria.',
        items: [
          { label: '✓', text: 'NJ State Fire Academy courses and certifications' },
          { label: '✓', text: 'Department drill nights (documented by the training officer)' },
          { label: '✓', text: 'Fire service seminars and conferences (with sign-in sheets)' },
          { label: '✓', text: 'Online courses from approved providers (FEMA EMI, NFA, etc.)' },
          { label: '✓', text: 'First aid/CPR/medical training (for departments with EMS charter)' },
          { label: '✗', text: 'Informal training, self-study without documentation' },
          { label: '✗', text: 'Training not recorded in the official department log' },
        ],
      },
      {
        type: 'content',
        title: 'Documenting in OpenFirehouse',
        body: 'Every training record you enter in OpenFirehouse contributes to your LOSAP hour total for the year. The Compliance & LOSAP tab shows every member\'s running total against the 50-point threshold in real time.',
        keyPoints: [
          'Log training immediately after completion — don\'t batch entries at year-end',
          'Make sure hours are accurate — 4-hour drill night = 4 points',
          'Use the CSV export in the Compliance tab to produce your year-end LOSAP training report',
          'The chief or training officer should reconcile the report against the LOSAP administrator\'s records before the annual submission deadline',
        ],
      },
      {
        type: 'callout',
        title: 'Year-End LOSAP Checklist',
        points: [
          'Run the Compliance & LOSAP report in OpenFirehouse by November 1.',
          'Identify any members below 50 points — they still have time to make it up.',
          'Export the CSV training report and cross-check against the LOSAP administrator\'s file.',
          'Submit by your municipality\'s deadline (typically January–March for the prior year).',
          'Keep documentation for 7 years — members can challenge their point totals.',
        ],
      },
    ],
    quiz: [
      {
        q: 'A volunteer firefighter runs 25 emergency calls and attends 20 hours of training in a year. How many total LOSAP points have they earned from these two categories?',
        options: ['25 points', '45 points', '50 points', '65 points'],
        answer: 1,
        explanation: '25 points from responses + 20 points from training = 45 points. They are 5 points short of the 50-point threshold and would not qualify for that year without additional activities.',
      },
      {
        q: 'What is the maximum number of LOSAP points a member can earn from training drills in a single year?',
        options: ['10 points', '20 points', '50 points', 'Unlimited'],
        answer: 1,
        explanation: 'Training drills are capped at 20 LOSAP points per year. This is why members need to combine training with emergency responses and other activities to reliably reach 50 points.',
      },
      {
        q: 'A member completed a 4-hour online FEMA ICS-200 course. How many LOSAP points does this earn?',
        options: ['0 — online courses don\'t count', '1 point', '4 points', '5 points'],
        answer: 2,
        explanation: '4 points — one point per hour for qualifying training. FEMA EMI online courses are approved providers and count toward LOSAP training hours.',
      },
      {
        q: 'Where in OpenFirehouse can you see each member\'s real-time LOSAP training hours for the current year?',
        options: ['Dashboard → Reports', 'Training → Compliance & LOSAP tab', 'Volunteer Hours module', 'Member Roster → certifications'],
        answer: 1,
        explanation: 'The Compliance & LOSAP tab in the Training module shows every member\'s running training hour total for the calendar year against the 50-point threshold.',
      },
    ],
  },

  // ── 3. NIMS/ICS FUNDAMENTALS ─────────────────────────────────────────────────
  {
    id: 'nims-ics-fundamentals',
    title: 'NIMS/ICS Fundamentals',
    description: 'Core concepts of the National Incident Management System and Incident Command System — required for all operational personnel.',
    category: 'Command & Control',
    estimatedMinutes: 20,
    creditHours: 0.5,
    certificationEarned: '',
    passingScore: 70,
    badgeColor: 'bg-blue-100 text-blue-700',
    icon: '📋',
    slides: [
      {
        type: 'intro',
        title: 'NIMS/ICS Fundamentals',
        body: 'NIMS (National Incident Management System) and ICS (Incident Command System) are required by FEMA for all departments receiving federal preparedness grants. More importantly, they save lives by creating a common operating structure across agencies.',
        note: '~20 minutes · 0.5 CE credit hours upon completion',
      },
      {
        type: 'content',
        title: 'Why NIMS Matters to Your Department',
        body: 'NIMS isn\'t just a federal checkbox. Every year, departments responding to major incidents — wildfires, mass casualties, hurricanes — fail to coordinate because incoming mutual aid units don\'t speak the same command language. ICS fixes that.',
        keyPoints: [
          'Required for all FEMA grant recipients (Assistance to Firefighters Grant, SAFER)',
          'ICS-100 and NIMS-700 are required for all operational personnel',
          'ICS-200 is required for those who may command incidents',
          'NJ FEMA training: all required courses are free online at training.fema.gov',
          'Completions count toward LOSAP training hours',
        ],
      },
      {
        type: 'content',
        title: 'The Five NIMS Components',
        body: 'NIMS is built around five integrated components that together create a nationwide framework for incident management.',
        keyPoints: [
          'Preparedness — planning, training, and exercises before incidents occur',
          'Communications — interoperable, plain language, unified command',
          'Resource Management — request, track, and demobilize resources systematically',
          'Command and Management — ICS, Multiagency Coordination, Public Information',
          'Ongoing Management & Maintenance — regular updates and integration into operations',
        ],
      },
      {
        type: 'list',
        title: 'ICS Command Structure',
        body: 'ICS uses a consistent organizational structure regardless of incident size. Every incident has an Incident Commander — even a one-unit response.',
        items: [
          { label: 'IC', text: 'Incident Commander — overall authority and accountability for the incident' },
          { label: 'Safety', text: 'Safety Officer — authority to stop unsafe operations immediately' },
          { label: 'PIO', text: 'Public Information Officer — manages media and public communications' },
          { label: 'Liaison', text: 'Liaison Officer — coordinates with outside agencies and mutual aid' },
          { label: 'Ops', text: 'Operations Section — tactical execution of the incident action plan' },
          { label: 'Planning', text: 'Planning Section — situation status, resource tracking, IAP development' },
          { label: 'Logistics', text: 'Logistics Section — support, facilities, communications, supply' },
          { label: 'Finance', text: 'Finance/Admin — cost tracking, time recording, compensation/claims' },
        ],
      },
      {
        type: 'table',
        title: 'ICS Span of Control',
        intro: 'One of the most important ICS principles: each supervisor manages 3–7 people, with 5 being optimal.',
        rows: [
          ['Single Resource', '1 unit or person', 'A single engine, tanker, or individual'],
          ['Task Force', 'Up to 5 resources', 'Mixed resources with common communications and supervisor'],
          ['Strike Team', '5 same-type resources', 'Five engines, five medics — standardized resources'],
          ['Division/Group', '3–7 resources', 'Geographic (Division) or functional (Group) organization'],
          ['Branch', '3–5 Divisions/Groups', 'Used on very large incidents to maintain span of control'],
        ],
        columns: ['Unit', 'Size', 'Description'],
      },
      {
        type: 'callout',
        title: 'ICS Principles You Must Know',
        points: [
          'Unity of Command: every person reports to exactly one supervisor.',
          'Common Terminology: plain language, no 10-codes on multi-agency incidents.',
          'Modular Organization: expand or contract the structure as the incident grows or shrinks.',
          'Incident Action Plan: every operational period has written or verbal objectives.',
          'Accountability: check-in/check-out for all personnel at every incident.',
          'Transfer of Command: a formal briefing is required when command changes hands.',
        ],
      },
      {
        type: 'content',
        title: 'Required Courses for NJ Firefighters',
        body: 'All courses are free at training.fema.gov. Completions are tracked by your FEMA Student ID (FEMA SID). Enter completions in OpenFirehouse Training Management to count toward LOSAP.',
        keyPoints: [
          'ICS-100 (IS-100.c) — Introduction to ICS: ~3 hours, required for all operational personnel',
          'NIMS-700 (IS-700.b) — NIMS: An Introduction: ~3 hours, all personnel',
          'ICS-200 (IS-200.c) — Basic ICS for Initial Response: ~4 hours, required for IC-eligible personnel',
          'NIMS-800 (IS-800.d) — National Response Framework: ~3 hours, officers and chiefs',
          'ICS-300/400 — Advanced ICS: required for large-incident command; typically classroom delivery',
        ],
      },
    ],
    quiz: [
      {
        q: 'What is the optimal span of control in ICS — the number of subordinates one supervisor should manage?',
        options: ['1–3 subordinates', '3–7 subordinates, with 5 being optimal', '8–10 subordinates', 'No limit as long as communication is maintained'],
        answer: 1,
        explanation: 'ICS span of control is 3–7, with 5 being optimal. This principle prevents supervisors from being overwhelmed and ensures accountability and coordination.',
      },
      {
        q: 'Under ICS Unity of Command, a firefighter from Mutual Aid Engine 5 reports to:',
        options: ['Their own department\'s chief', 'Exactly one ICS supervisor on this incident', 'The Incident Commander directly', 'Whoever gives them instructions first'],
        answer: 1,
        explanation: 'Unity of Command means every person at an incident reports to exactly one supervisor — determined by their position in the ICS structure for that incident, regardless of home department.',
      },
      {
        q: 'The Safety Officer at an ICS incident has authority to:',
        options: ['Redirect resources at their discretion', 'Stop unsafe operations immediately, without IC approval', 'Manage all communications on the incident', 'Authorize mutual aid requests'],
        answer: 1,
        explanation: 'The Safety Officer has the unique authority to stop any operation they determine to be unsafe, immediately and without prior approval from the IC. This is a hard stop — not a recommendation.',
      },
      {
        q: 'Which FEMA course is required for ALL operational fire service personnel under NIMS?',
        options: ['ICS-300', 'ICS-400', 'IS-100 (ICS-100) and IS-700 (NIMS-700)', 'ICS-200 only'],
        answer: 2,
        explanation: 'IS-100 (ICS-100) and IS-700 (NIMS-700) are the baseline required courses for all operational personnel. ICS-200 is required for those who may serve as Incident Commanders. ICS-300/400 are for complex incident management.',
      },
      {
        q: 'What is required when command of an incident is transferred from one person to another?',
        options: ['A radio announcement to all units', 'A formal briefing of the incoming IC, covering situation status and action plan', 'Approval from the dispatch center', 'Nothing — the new IC simply takes over'],
        answer: 1,
        explanation: 'Transfer of Command requires a formal briefing — the outgoing IC briefs the incoming IC on the situation, objectives, tactics, resources, and any safety concerns. This ensures continuity and accountability.',
      },
    ],
  },

  // ── 4. HAZMAT AWARENESS ─────────────────────────────────────────────────────
  {
    id: 'hazmat-awareness',
    title: 'HazMat Awareness Level',
    description: 'OSHA-required baseline knowledge: recognize hazmat incidents, identify hazards, and protect yourself and the public.',
    category: 'Hazardous Materials',
    estimatedMinutes: 20,
    creditHours: 0.5,
    certificationEarned: 'HazMat Awareness',
    passingScore: 75,
    badgeColor: 'bg-yellow-100 text-yellow-800',
    icon: '⚠️',
    slides: [
      {
        type: 'intro',
        title: 'HazMat Awareness Level',
        body: 'Every firefighter must be trained to the Awareness Level at minimum (OSHA 29 CFR 1910.120). This module covers the essential knowledge you need to recognize a hazmat incident and protect yourself, your crew, and the public.',
        note: '~20 minutes · 0.5 CE credit hours upon completion · Contributes to Awareness refresher documentation',
      },
      {
        type: 'content',
        title: 'The Three Levels of HazMat Response',
        body: 'OSHA and NFPA 472 define three levels of hazmat responder. Your training level determines what actions you are authorized to take.',
        keyPoints: [
          'Awareness Level: recognize the incident, isolate the area, notify, and protect yourself — nothing more',
          'Operations Level: defensive actions — stop the hazmat from spreading further, protect exposures',
          'Technician Level: offensive actions — enter the hot zone with full PPE, stop the source',
          'Most NJ volunteer departments are trained to Operations Level minimum',
          'NEVER enter a hot zone without Technician-level training and appropriate PPE',
        ],
      },
      {
        type: 'list',
        title: 'Recognizing a HazMat Incident',
        body: 'Hazmat incidents don\'t announce themselves. You have to recognize the signs before you get too close.',
        items: [
          { label: '1', text: 'Placards and labels — diamond-shaped DOT hazard placards on vehicles, tanks, and containers' },
          { label: '2', text: 'Container shape — cryogenic dewars, chlorine cylinders, MC-331 pressurized tankers' },
          { label: '3', text: 'Occupancy type — chemical plant, lab, dry cleaner, farm (pesticides), pool supply store' },
          { label: '4', text: 'Visible signs — vapor cloud, discoloration, dead vegetation, leaking liquid, unusual odor' },
          { label: '5', text: 'Multiple victims with similar symptoms — headache, nausea, breathing difficulty, no trauma' },
          { label: '6', text: 'Shipping papers — bill of lading, manifest, or MSDS/SDS documents' },
        ],
      },
      {
        type: 'table',
        title: 'DOT Hazard Placards — Critical Nine',
        intro: 'Placards use a 9-class system. Know what each class means so you can call for the right resources.',
        rows: [
          ['Class 1', 'Explosives', 'Orange placard — DO NOT APPROACH'],
          ['Class 2', 'Gases', 'Various — compressed, flammable (red), or toxic (white/black)'],
          ['Class 3', 'Flammable Liquids', 'Red placard — gasoline, ethanol, diesel'],
          ['Class 4', 'Flammable Solids', 'Red/white striped — reactive materials'],
          ['Class 5', 'Oxidizers/Peroxides', 'Yellow placard — can intensify fire without fuel'],
          ['Class 6', 'Toxic/Infectious', 'White skull & crossbones — poison, biohazard'],
          ['Class 7', 'Radioactive', 'Yellow/white — DO NOT APPROACH, call HAZMAT immediately'],
          ['Class 8', 'Corrosives', 'Black/white — acids, caustics; severe skin/eye injury'],
          ['Class 9', 'Misc. Hazardous', 'Black/white stripes — doesn\'t fit other classes'],
        ],
        columns: ['Class', 'Type', 'Awareness Notes'],
      },
      {
        type: 'list',
        title: 'The ERG — Your First Tool',
        body: 'The Emergency Response Guidebook (ERG) is published by PHMSA and is required in all hazmat response vehicles. Every firefighter should know how to use it.',
        items: [
          { label: 'Orange', text: 'Look up 4-digit UN/NA number to find the guide page number' },
          { label: 'Blue', text: 'Look up chemical name to find the guide page number' },
          { label: 'Yellow', text: 'Look up UN/NA number to confirm chemical name and guide' },
          { label: 'Green', text: 'Initial isolation and protective action distances for TIH materials' },
          { label: 'Guide Page', text: 'Each guide page gives potential hazards, public safety actions, and emergency response procedures' },
        ],
      },
      {
        type: 'content',
        title: 'Awareness Level Actions — What You CAN Do',
        body: 'Awareness Level is not helpless. There is a defined set of protective actions you are trained and authorized to take.',
        keyPoints: [
          'RECOGNIZE — identify the incident as involving hazardous materials',
          'ISOLATE — establish a perimeter; keep people away from the hazard area',
          'NOTIFY — call for the right resources (HazMat Team, CHEMTREC: 1-800-424-9300)',
          'PROTECT yourself — stay upwind, uphill, and upstream from the release',
          'DO NOT enter the hot zone or take offensive action at any level',
          'DO NOT attempt rescue unless you have Operations-level training and appropriate PPE',
        ],
      },
      {
        type: 'callout',
        title: 'Initial Isolation — The Rule of Thumb',
        points: [
          'Unknown material — isolate at least 330 feet (100m) in all directions until identified.',
          'Fire involving a tank/tanker — isolate at least 1,600 feet (0.5 mile) in all directions.',
          'Spill without fire — use ERG green pages for TIH materials; ERG guide page for others.',
          'Always position apparatus upwind and uphill from the release.',
          'If in doubt, stay back and call for HAZMAT. You cannot unexpose yourself.',
        ],
      },
    ],
    quiz: [
      {
        q: 'You arrive at a tractor-trailer accident. The truck has a placard with a skull and crossbones on a white background. What hazard class is this?',
        options: ['Class 3 — Flammable Liquid', 'Class 6 — Toxic/Infectious', 'Class 8 — Corrosive', 'Class 2 — Compressed Gas'],
        answer: 1,
        explanation: 'Class 6 (Toxic/Infectious) uses a white placard with skull and crossbones. This means the material poses a significant inhalation, ingestion, or contact toxicity hazard. Isolate and call for HazMat.',
      },
      {
        q: 'As an Awareness Level trained firefighter, you arrive first at a chemical plant with a visible vapor cloud. What are you authorized to do?',
        options: ['Enter the building to evacuate occupants', 'Attempt to identify and stop the leak', 'Recognize the incident, isolate the area, and notify for proper resources', 'Don SCBA and approach for product identification'],
        answer: 2,
        explanation: 'Awareness Level = Recognize, Isolate, Notify, Protect yourself. You are NOT authorized to enter the hazard area, attempt rescue, or take offensive action. Those require Operations or Technician level training.',
      },
      {
        q: 'You need to look up emergency response information for a substance marked "UN 1203" on a tanker. What color section of the ERG do you use first?',
        options: ['Blue — alphabetical chemical name index', 'Orange — numerical UN/NA number index', 'Green — isolation distances', 'White — general guidance'],
        answer: 1,
        explanation: 'The orange section lists UN/NA numbers in numerical order. Find 1203 (gasoline), get the guide page number, then turn to that guide page for hazards and protective actions.',
      },
      {
        q: 'What is the initial isolation distance for an unknown material at a hazmat scene until the substance is identified?',
        options: ['50 feet', '100 feet', '330 feet (100 meters)', '1,600 feet (0.5 mile)'],
        answer: 2,
        explanation: '330 feet (100 meters) in all directions is the initial isolation zone for an unknown material. For fires involving tanks, extend to 1,600 feet. Always position upwind and uphill.',
      },
      {
        q: 'Multiple patients at a scene are presenting with headache, nausea, and difficulty breathing — no visible trauma. What should this tell you?',
        options: ['Likely carbon monoxide from a heating system only', 'Consider a hazmat incident — toxic release may be affecting bystanders and you', 'Normal symptoms for a stressful situation', 'Call for additional EMS and proceed normally'],
        answer: 1,
        explanation: 'Multiple victims with similar non-trauma symptoms is a classic indicator of a toxic release. This should trigger hazmat awareness protocols immediately — isolate, call for HazMat, and do not approach without protection.',
      },
    ],
  },
];

export function getModuleById(id) {
  return MODULES.find((m) => m.id === id) || null;
}
