// ─── OpenFirehouse Auth / Role System ──────────────────────────────────────────
// Real authentication is handled server-side via JWT (Phase 3).
// This file defines roles and page-access rules used for UI access control.
//
// Rank order (lowest → highest):
//   Firefighter → Lieutenant → Captain → Battalion Chief → Deputy Chief → Fire Chief
//
// Training roles are non-line staff whose job is scheduling/conducting training
// and maintaining training records. They carry BC-level access clearance.

// Access levels:
//   1 = All members         — Firefighter, Lieutenant (line rank; daily ops, personal info)
//   2 = Officers            — Captain (company officers; management, compliance, officer tools)
//   3 = Chiefs / Command    — Battalion Chief, Deputy Chief, Fire Chief (command authority;
//                             finance, personnel actions, department-wide config)
//
// Training division roles match the equivalent line rank:
//   training_captain   → level 2 (officer clearance, like a Captain)
//   training_battalion → level 3 (chief clearance, like a Battalion Chief)

export const ROLES = {
  // ── Chiefs / Command (level 3) ───────────────────────────────────────────
  chief:               { label: 'Fire Chief',            level: 3, color: 'text-red-700',     bg: 'bg-red-100'     },
  deputy_chief:        { label: 'Deputy Chief',          level: 3, color: 'text-red-600',     bg: 'bg-red-50'      },
  battalion_chief:     { label: 'Battalion Chief',       level: 3, color: 'text-orange-700',  bg: 'bg-orange-100'  },
  training_battalion:  { label: 'Training Battalion',    level: 3, color: 'text-purple-700',  bg: 'bg-purple-100'  },
  // ── Officers (level 2) ───────────────────────────────────────────────────
  officer:             { label: 'Captain',               level: 2, color: 'text-amber-700',   bg: 'bg-amber-100'   },
  lieutenant:          { label: 'Lieutenant',            level: 2, color: 'text-yellow-700',  bg: 'bg-yellow-100'  },
  training_captain:    { label: 'Training Captain',      level: 2, color: 'text-violet-700',  bg: 'bg-violet-100'  },
  dispatch:            { label: 'Dispatch',              level: 2, color: 'text-indigo-700',  bg: 'bg-indigo-100'  },
  // ── Line Members (level 1) ───────────────────────────────────────────────
  member:              { label: 'Firefighter',           level: 1, color: 'text-blue-700',    bg: 'bg-blue-100'    },
  // ── Unit login (in-cab apparatus terminal; migration 0025) ───────────────
  // NOT a level on the chief↔member ladder — its access is an explicit page
  // allowlist (UNIT_PAGES), handled as a branch in canAccess(). level:0 so any
  // accidental level-based check fails closed.
  unit:                { label: 'Unit Terminal',         level: 0, color: 'text-emerald-700', bg: 'bg-emerald-100' },
};

// Pages a UNIT-login session (the in-cab apparatus terminal) may open. This is
// the operational + rig-related surface — a superset of the OF Mobile/iPad tabs
// (Dispatch, Map, Pre-Plans, Inspections, Hydrants, Field Tools, Hazmat) plus
// the rig-maintenance modules (apparatus/equipment/inventory/checks, maintenance,
// fuel log). Records authoring (incidents/NFIRS/NERIS) + personnel/admin are
// deliberately excluded — a person logs in (member/officer) for those. Mirrors
// the server-side unitGate denylist.
export const UNIT_PAGES = new Set([
  // Operational
  'command',            // dispatch / size-up / command board
  'incident-map',       // live district map
  'recall',             // see/respond to recalls from the rig
  'radio-log',
  'todays-crew',
  // The rig itself
  'apparatus',
  'apparatus-oos',
  'maintenance',
  'checklists',
  'activity-equipment', // equipment + apparatus checks, hose/ladder/rig inventory, FUEL LOG
  'equipment-checkout',
  'assets',             // asset & inventory
  // Inspections (parity with the iPad Inspections tab)
  'inspections', 'inspection-search', 'inspection-entry', 'inspection-checklist', 'inspector-status',
  // Pre-plans + size-up reference (parity with iPad)
  'preplans',
  'hydrants',
  'hazmat',
  'knox-keys',
]);

// ─── Role-check helpers ───────────────────────────────────────────────────────

/** BC / Deputy Chief / Fire Chief and their training equivalents. Level 3. */
export function isBcPlus(user) {
  return (ROLES[user?.role]?.level ?? 0) >= 3;
}

/** Captain / Lieutenant and above (level 2+). Company officers — can post general bulletins. */
export function isOfficerPlus(user) {
  return (ROLES[user?.role]?.level ?? 0) >= 2;
}

/**
 * Roles allowed to CLEAR / CLOSE an active call.
 * Dispatch-controlled model: a call is cleared by Dispatch, with the chiefs
 * able to override. Company officers (Captain/Lieutenant) and line firefighters
 * cannot. Kept in lock-step with the server's middleware/requireDispatch.js.
 */
export const CLEAR_ROLES = ['dispatch', 'chief', 'deputy_chief', 'battalion_chief'];
export function canClearCalls(user) {
  return CLEAR_ROLES.includes(user?.role);
}

/** Any training division role. */
export function isTrainingRole(user) {
  return ['training_battalion', 'training_captain'].includes(user?.role);
}

/**
 * True if the user should see ALL members' cert/training alerts.
 * Only BC+ (Battalion Chief, Deputy Chief, Fire Chief, Training Battalion) see all.
 * Captains, Lieutenants, and Firefighters see only their own.
 */
export function seesAllCertAlerts(user) {
  return isBcPlus(user);
}

// Minimum role level required to see each page in the sidebar.
// Pages not listed here are treated as chief-only (level 3).
//
// Level 1 = All members     — daily operations, personal info, basic tools
// Level 2 = Officers+       — management, compliance, investigations, AI tools
// Level 3 = Chief/Admin     — finance, payroll, settings, system config
export const PAGE_ACCESS = {
  // ── Everyone (level 1) ──────────────────────────────────────────────────
  dashboard:            1,
  roster:               1,
  schedule:             1,
  hours:                1,
  portal:               1,
  training:             1,
  wellness:             1,
  apparatus:            1,
  maintenance:          1,
  checklists:           1,
  incidents:            1,
  preplans:             2,
  calendar:             1,
  public:               1,
  sogs:                 1,
  drills:               1,
  crr:                  1,
  alerts:               1,
  recall:               1,   // members need to respond to recalls
  bulletins:            1,   // department announcements — everyone reads
  'shift-trades':       1,   // members initiate their own trades
  'equipment-checkout': 1,   // members check out their own gear
  'incident-map':       1,   // everyone can view the map
  'commander-cam':      2,   // officers can access Commander Cam
  'vacancy-fill':       2,   // officers manage auto vacancy fill
  'ng911':              2,   // officers view NG911 console
  'fto-tracker':        2,   // officers manage FTO tracking
  'knox-keys':          2,   // officers manage Knox boxes, members can view
  'policy-acks':        1,   // members sign policies
  messages:             1,   // everyone can use messaging
  'todays-crew':        1,   // everyone can view today's crew
  'radio-log':          1,   // everyone can view radio log
  'training-modules':   1,   // everyone can access training modules
  'training-catalog':   1,   // everyone can access video courses & CEU
  'my-training':        1,   // everyone can view their own training progress
  'training-compliance':1,   // everyone can view training compliance
  'community-outreach': 2,   // officers manage outreach
  'email-ingest':       3,   // chief only
  'db-admin':           3,   // chief only
  'avl':                3,   // chief only — vehicle AVL feeds

  command:              1,   // all members need dispatch/command access for incident response
  // ── Officers+ (level 2) ─────────────────────────────────────────────────
  mutualaid:            2,
  'aid-agreements':     2,
  nfirs:                2,
  inspections:            1,
  'inspection-search':    1,
  'inspection-entry':     1,
  'inspection-checklist': 1,
  'inspector-status':     1,
  violations:             1,
  permits:                1,
  registrations:          1,
  'registration-search':  1,
  'registration-entry':   1,
  complaints:             1,
  'preplan-wizard':       2,
  hydrants:             2,
  stationlog:           2,
  grants:               2,
  cad:                  2,
  fireinvestigation:    2,
  recruitment:          2,
  scba:                 2,
  hazmat:               2,
  assets:               2,
  reports:              2,
  'after-action':       2,
  'meeting-minutes':    2,
  'doc-vault':          2,
  'training-plans':     2,
  qualifications:       2,
  'exposure-tracking':  2,
  'daily-staffing':     2,
  'apparatus-oos':      2,
  assignboard:          2,
  cadets:               2,
  retention:            2,
  'personnel-actions':  2,
  grievances:           2,
  'incident-costs':     2,
  ai:                   2,   // AI scheduling
  analytics:            2,   // AI response analytics
  'workflows':          2,   // AI workflow orchestration
  'incident-intel':     2,   // AI incident intelligence
  'training-ai':        2,   // AI training recommender
  'report-writer':      2,   // AI report writer
  'preplan-ai':         2,   // AI pre-plan generator
  'staffing-ai':        2,   // AI staffing predictor

  // ── Chief/Admin only (level 3) ──────────────────────────────────────────
  budget:               3,
  payroll:              3,
  timesheets:           3,
  flsa:                 3,
  'ot-equalization':    3,
  iso:                  3,
  fundraising:          3,
  dataimport:           3,
  'data-ingest':        3,   // AI data ingestion — chief only
  settings:             3,
};

/** True when this session is an in-cab unit-login terminal (migration 0025). */
export function isUnitSession(user) {
  return user?.role === 'unit' && (user?.apparatus_id != null);
}

export function canAccess(user, pageId) {
  if (!user) return false;
  // Unit terminals are gated by an explicit allowlist, NOT the role level ladder.
  if (user.role === 'unit') return UNIT_PAGES.has(pageId);
  const required = PAGE_ACCESS[pageId] ?? 3;
  const level    = ROLES[user.role]?.level ?? 0;
  return level >= required;
}
