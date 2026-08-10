// ─── Fire Inspections & Permits ───────────────────────────────────────────────

import { RESULT_CODES, RESULT_LABELS } from '../lib/shared/inspectionResult.js';

export const INSPECTION_TYPES = [
  'Annual Inspection',
  'Follow-Up Inspection',
  'Complaint Investigation',
  'New Construction',
  'Change of Occupancy',
  'Special Event',
  'Reinspection',
  'Courtesy / Educational',
];

export const PERMIT_TYPES = [
  'Occupancy Permit',
  'Special Event Permit',
  'Fireworks / Pyrotechnics',
  'Open Burning Permit',
  'Blasting Permit',
  'Tank Installation / Removal',
  'Hazardous Materials Storage',
  'Fire Suppression System',
  'Fire Alarm System',
  'High-Piled Storage',
  'Tent / Temporary Structure',
];

export const VIOLATION_CODES = [
  { code: '1001', desc: 'Blocked or obstructed exit / egress path' },
  { code: '1002', desc: 'Exit sign missing, obscured, or non-illuminated' },
  { code: '1003', desc: 'Emergency lighting inoperable' },
  { code: '1004', desc: 'Door hardware not code compliant' },
  { code: '1005', desc: 'Locked exit door during occupancy' },
  { code: '2001', desc: 'Fire extinguisher missing, overdue, or improperly mounted' },
  { code: '2002', desc: 'Sprinkler system impaired or partially out of service' },
  { code: '2003', desc: 'Sprinkler head obstructed or painted' },
  { code: '2004', desc: 'Fire alarm system impaired or panel in trouble' },
  { code: '2005', desc: 'Smoke detector missing, discharged, or missing battery' },
  { code: '2006', desc: 'Suppression system not tested within required interval' },
  { code: '3001', desc: 'Combustible materials stored too close to heat source' },
  { code: '3002', desc: 'Excessive accumulation of combustibles / housekeeping' },
  { code: '3003', desc: 'Flammable/combustible liquid improperly stored' },
  { code: '3004', desc: 'No smoking violation in restricted area' },
  { code: '4001', desc: 'Electrical panel obstructed (36" clearance required)' },
  { code: '4002', desc: 'Extension cord used as permanent wiring' },
  { code: '4003', desc: 'Open junction box or exposed wiring' },
  { code: '4004', desc: 'Overloaded circuit or multi-tap without protection' },
  { code: '5001', desc: 'Missing or expired occupancy permit' },
  { code: '5002', desc: 'Change of use without fire marshal approval' },
  { code: '5003', desc: 'Overcrowding — occupant load limit exceeded' },
  { code: '5004', desc: 'Required fire safety plan not posted' },
  { code: '6001', label: 'HazMat', desc: 'Hazardous materials stored without permit' },
  { code: '6002', label: 'HazMat', desc: 'MSDS / SDS not available or not current' },
  { code: '6003', label: 'HazMat', desc: 'Secondary containment missing or inadequate' },
];

// 'Pass with Violations' REMOVED 2026-07-13 (Matt's correction — an inspection
// cannot pass with unabated violations; the server now 422s a passing result
// while open violations remain). Legacy records keep their stored value on read,
// so RESULT_COLORS below still carries the retired key for historical rendering.
// DERIVED from the server-owned result axis — client/src/lib/shared/inspectionResult.js
// is GENERATED from server/src/constants/inspectionResult.js (a drift test fails the
// suite if it goes stale). This replaces the hand-kept literal that let the three
// surfaces' result vocabularies drift (the iPad once shipped 'Conditional'). One source.
export const INSPECTION_RESULTS = RESULT_CODES.map((c) => RESULT_LABELS[c]);
// Permit status axis — MUST stay in lockstep with server/src/constants/permitStatus.js
// (server/src/tests/permitStatus.test.js reads this literal and fails the suite on
// drift, the same fence VIOLATION_STATUSES uses). The server owns the vocabulary and
// REFUSES an unrecognized value with 400 INVALID_PERMIT_STATUS — it never guesses a
// control value onto a legal record. Order is lifecycle reading order, not alphabetical.
// The full lifecycle (Suspended, Terminated-by-transfer, typed denials) arrives with
// the issuance engine in 3.1 — a status nothing can reach is a lie, so it waits for
// the transition that produces it.
// KEEP IN LOCKSTEP with server/src/constants/permitStatus.js — server/src/tests/permitStatus.test.js
// reads THIS literal off disk and fails the suite on drift. The server owns the vocabulary; this is
// a mirror for the UI, never a second source of truth. 'TerminatedByTransfer' added in 3.1a
// (IFC §105.3.1: a change of occupancy/operation/tenancy/ownership terminates the permit).
// AboutToExpire + Delinquent added in 3.1b (0094) — both written ONLY by the scheduled
// expiry job. AboutToExpire is a VALID permit (in term, notice window open); Delinquent is
// past term but inside grace and still renewable. 'Expired' is the trapdoor where renewal
// is withdrawn — grace lives UPSTREAM of it, which is the market's documented shape.
export const PERMIT_STATUSES    = ['Pending', 'Active', 'AboutToExpire', 'Delinquent', 'Expired', 'Revoked', 'Denied', 'TerminatedByTransfer'];

// Display labels for the statuses whose machine name isn't presentable. Display ONLY —
// never an input to a decision, and never matched against.
export const PERMIT_STATUS_LABELS = {
  TerminatedByTransfer: 'Terminated (transfer)',
  // Say what the operator needs to DO, not just what the machine calls it. "About to expire"
  // reads as a warning; the honest reading is that the renewal window has OPENED.
  //
  // ⚠ NEITHER LABEL MAKES A LEGAL CLAIM, and that is deliberate (Matt, 2026-07-27). We do
  // not say a permit is "valid" or "invalid", or that a business may or may not operate —
  // that is the AHJ's call. 'Term ended' is a FACT the record knows; the screen pairs it
  // with the dates (ended on X, renewable until Y) and stops there.
  AboutToExpire: 'Renewal open',
  Delinquent:    'Term ended — renewable',
};

// ─────────────────────────────────────────────────────────────────────────────────────
// THE FACET TABLE — a MIRROR of server/src/constants/permitStatus.js PERMIT_STATUS_FACETS.
//
// WHY IT IS HERE. 3.1b inserts two job-written statuses (AboutToExpire, Delinquent —
// migration 0094) between "in force" and "dead", which means `status === 'Active'` stops
// being the test for "is this permit valid". Every literal comparison in the UI becomes
// wrong SILENTLY on the day the job first runs: the control simply stops being offered,
// and the operator blames themselves. That is the same failure as offering a control the
// server refuses, in the opposite direction.
//
// server/src/tests/permitStatus.test.js reads this table FROM DISK and fails the suite on
// drift, exactly as it already does for PERMIT_STATUSES. CHANGE BOTH TOGETHER.
//
// These stay read-only OPINIONS about what to render. THE SERVER IS THE CONTROL.
// ─────────────────────────────────────────────────────────────────────────────────────
export const PERMIT_STATUS_FACETS = {
  Pending:              { issued: false, inForce: false, revocable: false, terminable: false, terminal: false, renewable: false },
  Active:               { issued: true,  inForce: true,  revocable: true,  terminable: true,  terminal: false, renewable: false },
  AboutToExpire:        { issued: true,  inForce: true,  revocable: true,  terminable: true,  terminal: false, renewable: true  },
  Delinquent:           { issued: true,  inForce: false, revocable: true,  terminable: true,  terminal: false, renewable: true  },
  Expired:              { issued: true,  inForce: false, revocable: false, terminable: false, terminal: false, renewable: false },
  Revoked:              { issued: true,  inForce: false, revocable: false, terminable: false, terminal: true,  renewable: false },
  Denied:               { issued: false, inForce: false, revocable: false, terminable: false, terminal: true,  renewable: false },
  TerminatedByTransfer: { issued: true,  inForce: false, revocable: false, terminable: false, terminal: true,  renewable: false },
};

// The one status a permit is created in. Mirrors the server's DEFAULT_PERMIT_STATUS —
// named rather than spelled inline so the create/issue boundary has ONE spelling on both
// sides of the wire.
export const DEFAULT_PERMIT_STATUS = 'Pending';

const permitStatusesWhere = (facet) =>
  PERMIT_STATUSES.filter((s) => PERMIT_STATUS_FACETS[s]?.[facet]);

export const ISSUED_PERMIT_STATUSES     = permitStatusesWhere('issued');
export const IN_FORCE_PERMIT_STATUSES      = permitStatusesWhere('inForce');
export const REVOCABLE_PERMIT_STATUSES  = permitStatusesWhere('revocable');
export const TERMINABLE_PERMIT_STATUSES = permitStatusesWhere('terminable');
export const RENEWABLE_PERMIT_STATUSES  = permitStatusesWhere('renewable');
export const TERMINAL_PERMIT_STATUSES   = permitStatusesWhere('terminal');

// Revocation grounds — mirrors server/src/constants/permitGrounds.js (IFC §105.4's seven
// model grounds + LOCAL_GROUND). LOCAL_GROUND REQUIRES a citation to the local provision;
// the server and a Postgres CHECK both refuse it without one, so the picker must collect it.
export const REVOCATION_GROUNDS = [
  { code: 'MISREPRESENTATION',        label: 'Material misrepresentation in the application' },
  { code: 'DIFFERENT_LOCATION',       label: 'Used at a location other than the one permitted' },
  { code: 'DIFFERENT_ACTIVITY',       label: 'Used for an activity other than the one permitted' },
  { code: 'CONDITION_VIOLATED',       label: 'A condition of the permit was violated' },
  { code: 'DIFFERENT_PERSON',         label: 'Used by a person or firm other than the permittee' },
  { code: 'NONCOMPLIANCE_WITH_ORDER', label: 'Failure to comply with a served order or notice in time' },
  { code: 'ISSUED_IN_ERROR',          label: 'Issued in error or contrary to code' },
  { code: 'LOCAL_GROUND',             label: 'A ground adopted locally (citation required)' },
];
// Canonical four-state violation axis (2026-07-11) — MUST stay in lockstep with
// server/src/constants/violationStatus.js (a server test reads this literal and
// fails the suite on drift). Resolved = Corrected | Withdrawn; everything else
// counts as open. Legacy values ('Abated', 'New Violation', 'Void', …) are
// canonicalized server-side on every write.
export const VIOLATION_STATUSES = ['Open', 'Time Extension', 'Corrected', 'Withdrawn'];
export const RESOLVED_VIOLATION_STATUSES = ['Corrected', 'Withdrawn'];

// P0 (2026-07-12): read-side canonicalization, mirrored from the server
// (server/src/constants/violationStatus.js — the lockstep contract). The server
// canonicalizes on write AND read, but the client must not regress to raw literal
// compares if it ever renders a value that predates server normalization (offline
// caches, exports). Unknown → 'Open' — fail-open: never silently resolve.
const LEGACY_STATUS_MAP = {
  'new violation': 'Open', 'unabated': 'Open', 'pending': 'Open', 'recommended': 'Open',
  'open': 'Open', 'abated': 'Corrected', 'corrected': 'Corrected',
  'void': 'Withdrawn', 'withdrawn': 'Withdrawn', 'time extension': 'Time Extension',
};
export function canonicalizeViolationStatus(status) {
  const key = String(status ?? '').trim().toLowerCase();
  return LEGACY_STATUS_MAP[key] ?? 'Open';
}
export function isResolvedViolationStatus(status) {
  return RESOLVED_VIOLATION_STATUSES.includes(canonicalizeViolationStatus(status));
}
// VIOLATION SEVERITY IS RETIRED (2026-07-14, Matt — a working fire inspector):
// "we dont have a severity button or label... imminentHazard handles this on its own."
// Fire inspection does not grade violations Low/Moderate/High. A condition is either an
// IMMINENT HAZARD or an ordinary violation with a correct-by date. The field was
// invented, gated no logic, and DEFAULTED to 'Moderate' — so a notice served on a
// property owner could carry a grading the inspector never made. Authoring and display
// are gone; the DB column is retained (retire, don't delete). Do not reintroduce this.

export const VIOLATION_CATEGORIES = [
  'Access', 'Assembly', 'Commercial Kitchen', 'Electrical', 'Elevator',
  'Emergency Lighting', 'Exit/Egress', 'Fire Alarm', 'Fire Escape',
  'Fire Extinguisher', 'General', 'Hazardous Materials', 'Housekeeping',
  'HVAC', 'Means of Egress', 'Occupancy', 'Signage', 'Sprinkler',
  'Structural', 'Suppression System',
];

export const VIOLATION_ACTIONS = [
  'Access', 'Fire escape', 'Maintain', 'Provide', 'Remove', 'Repair',
  'Replace', 'Service', 'Install', 'Correct', 'Post', 'Clean', 'Test',
];

export const FLOOR_OPTIONS = ['Basement', 'Sub-Basement', '1st', '2nd', '3rd', '4th', '5th', 'Roof', 'General', 'All Floors'];
export const LOCATION_OPTIONS = ['Building', 'Apartment', 'Hallway', 'Stairwell', 'Lobby', 'Roof', 'Basement', 'Kitchen', 'Storage', 'Mechanical Room', 'Exterior', 'Parking'];

export const INSPECTION_CHECKLISTS = [
  '2025 In-Service Checklist',
  'Default Check List',
  'City Ordinances',
  'Day to Day Operations Checklist',
  'Inspector 101 Basic Checklist',
  'NJ Inspection Check List',
  'Illegal Units',
  'LHU Registration Categories',
  'In-Service',
];

export const RESULT_COLORS = {
  'Pass':                  'bg-green-100 text-green-800',
  'Fail':                  'bg-red-100   text-red-800',
  'Reinspection Required': 'bg-orange-100 text-orange-800',
  'Not Completed':         'bg-gray-100  text-gray-700',
  // RETIRED value — no longer selectable (see INSPECTION_RESULTS above), but
  // records completed before 2026-07-13 still carry it and must render.
  'Pass with Violations':  'bg-amber-100 text-amber-800',
};

export const PERMIT_STATUS_COLORS = {
  Active:  'bg-green-100 text-green-800',
  Pending: 'bg-amber-100 text-amber-800',
  Expired: 'bg-red-100   text-red-800',
  Revoked: 'bg-red-100   text-red-900',
  Denied:  'bg-gray-100  text-gray-700',
};

// ─── Sample Properties ─────────────────────────────────────────────────────────

export const initialProperties = [
  {
    id: 1,
    name: 'Maplewood Town Center Mall',
    address: '1200 Commerce Blvd, Maplewood, MN 55117',
    occupancyType: 'Mercantile / Assembly',
    propertyUseCode: '580',
    ownerName: 'Maplewood Properties LLC',
    ownerPhone: '651-555-0101',
    ownerEmail: 'mgmt@maplewoodtowncenter.com',
    contactName: 'Frank Russo',
    contactPhone: '651-555-0102',
    squareFootage: 142000,
    stories: 2,
    occupantLoad: 1800,
    sprinklered: true,
    alarmMonitored: true,
    hazmatOnsite: false,
    notes: 'Main entrance on Commerce Blvd. Fire command panel at main security desk.',
  },
  {
    id: 2,
    name: 'Maplewood Elementary School',
    address: '88 Ridgeline Court, Maplewood, MN 55117',
    occupancyType: 'Educational',
    propertyUseCode: '213',
    ownerName: 'Maplewood School District #622',
    ownerPhone: '651-555-0200',
    ownerEmail: 'facilities@maplewoodisd622.org',
    contactName: 'Sharon Tran',
    contactPhone: '651-555-0201',
    squareFootage: 38400,
    stories: 1,
    occupantLoad: 520,
    sprinklered: true,
    alarmMonitored: true,
    hazmatOnsite: false,
    notes: 'Fire drills conducted twice per year. Emergency plan filed with district.',
  },
  {
    id: 3,
    name: 'Riverdale Arms Apartments',
    address: '1847 Lakeview Blvd, Maplewood, MN 55117',
    occupancyType: 'Residential Multifamily',
    propertyUseCode: '429',
    ownerName: 'Riverdale Properties Inc.',
    ownerPhone: '651-555-0310',
    ownerEmail: 'management@riverdalearms.com',
    contactName: 'Pete Nance',
    contactPhone: '651-555-0311',
    squareFootage: 52000,
    stories: 3,
    occupantLoad: 180,
    sprinklered: false,
    alarmMonitored: true,
    hazmatOnsite: false,
    notes: 'No sprinkler system — pre-code construction. Annual inspection priority.',
  },
  {
    id: 4,
    name: 'Apex Chemical Supply',
    address: '334 Industrial Pkwy, Maplewood, MN 55117',
    occupancyType: 'Industrial / Hazmat',
    propertyUseCode: '600',
    ownerName: 'Apex Supply Co.',
    ownerPhone: '651-555-0400',
    ownerEmail: 'safety@apexchemical.com',
    contactName: 'Raj Mehta',
    contactPhone: '651-555-0401',
    squareFootage: 24000,
    stories: 1,
    occupantLoad: 45,
    sprinklered: true,
    alarmMonitored: true,
    hazmatOnsite: true,
    notes: 'Tier II facility. MSDS on file. Secondary containment in west wing.',
  },
  {
    id: 5,
    name: 'Maplewood VFW Post 8984',
    address: '412 Elmwood Drive, Maplewood, MN 55117',
    occupancyType: 'Assembly / Restaurant',
    propertyUseCode: '161',
    ownerName: 'VFW Post 8984',
    ownerPhone: '651-555-0502',
    ownerEmail: 'post8984@vfw.org',
    contactName: 'Harold Bauer',
    contactPhone: '651-555-0503',
    squareFootage: 6800,
    stories: 1,
    occupantLoad: 180,
    sprinklered: false,
    alarmMonitored: true,
    hazmatOnsite: false,
    notes: 'Bar and restaurant. Kitchen suppression hood inspected March 2025.',
  },
];

// ─── Sample Inspections ────────────────────────────────────────────────────────

export const initialInspections = [
  {
    id: 1,
    propertyId: 1,
    type: 'Annual Inspection',
    inspectorName: 'Maria Delgado',
    scheduledDate: '2026-01-15',
    completedDate: '2026-01-15',
    result: 'Reinspection Required',
    violations: [
      { code: '2001', status: 'Corrected',      correctedDate: '2026-02-01', notes: 'Extinguisher in food court replaced.' },
      { code: '4002', status: 'Open',            followUpDate: '2026-03-15', notes: 'Extension cord in east corridor storage room.' },
    ],
    followUpDate: '2026-03-15',
    notes: 'General compliance good. Two violations noted. See violations detail.',
  },
  {
    id: 2,
    propertyId: 3,
    type: 'Annual Inspection',
    inspectorName: 'Maria Delgado',
    scheduledDate: '2026-01-28',
    completedDate: '2026-01-28',
    result: 'Fail',
    violations: [
      { code: '1001', status: 'Pending',    followUpDate: '2026-02-28', notes: 'Laundry room exit blocked by resident storage.' },
      { code: '2005', status: 'Pending',    followUpDate: '2026-02-28', notes: '4 detectors with dead batteries in units 204, 207, 312, 315.' },
      { code: '1002', status: 'Corrected',  correctedDate: '2026-02-10', notes: 'Exit sign 3rd floor stairwell replaced.' },
    ],
    followUpDate: '2026-02-28',
    notes: 'Reinspection required. Building owner contacted — agreed to 30-day correction window.',
  },
  {
    id: 3,
    propertyId: 2,
    type: 'Annual Inspection',
    inspectorName: 'Sarah Chen',
    scheduledDate: '2026-02-05',
    completedDate: '2026-02-05',
    result: 'Pass',
    violations: [],
    notes: 'Full compliance. Excellent recordkeeping by facilities team.',
  },
  {
    id: 4,
    propertyId: 4,
    type: 'Annual Inspection',
    inspectorName: 'Maria Delgado',
    scheduledDate: '2026-02-18',
    completedDate: '2026-02-18',
    result: 'Reinspection Required',
    violations: [
      { code: '6002', status: 'Open', followUpDate: '2026-03-18', notes: 'SDS binder not current — 3 chemicals updated since last filing.' },
    ],
    followUpDate: '2026-03-18',
    notes: 'Hazmat storage in good order. SDS update required.',
  },
  {
    id: 5,
    propertyId: 5,
    type: 'Annual Inspection',
    inspectorName: 'Sarah Chen',
    scheduledDate: '2026-03-01',
    completedDate: null,
    result: null,
    violations: [],
    followUpDate: null,
    notes: 'Scheduled — not yet completed.',
  },
];

// ─── Sample Permits ────────────────────────────────────────────────────────────

export const initialPermits = [
  {
    id: 1,
    propertyId: 1,
    type: 'Occupancy Permit',
    permitNumber: 'OCC-2024-001',
    issuedDate: '2024-03-01',
    expiresDate: '2026-03-01',
    status: 'Expired',
    issuedBy: 'Maria Delgado',
    fee: 350,
    conditions: 'Maximum occupant load 1,800. All emergency exits must remain unlocked during occupancy.',
    notes: 'Renewal application received 2026-02-20 — pending review.',
  },
  {
    id: 2,
    propertyId: 4,
    type: 'Hazardous Materials Storage',
    permitNumber: 'HAZ-2025-004',
    issuedDate: '2025-04-01',
    expiresDate: '2026-04-01',
    status: 'Active',
    issuedBy: 'Sarah Chen',
    fee: 500,
    conditions: 'Tier II reporting required. Secondary containment mandatory. Inspector access on demand.',
    notes: '',
  },
  {
    id: 3,
    propertyId: 5,
    type: 'Special Event Permit',
    permitNumber: 'EVT-2026-011',
    issuedDate: '2026-02-14',
    expiresDate: '2026-04-01',
    status: 'Active',
    issuedBy: 'Maria Delgado',
    fee: 75,
    conditions: 'Occupant load not to exceed 200 for special events. No open flame permitted without additional permit.',
    notes: 'St. Patrick\'s Day event March 17.',
  },
  {
    id: 4,
    propertyId: 2,
    type: 'Fire Alarm System',
    permitNumber: 'FA-2025-002',
    issuedDate: '2025-09-01',
    expiresDate: '2027-09-01',
    status: 'Active',
    issuedBy: 'Sarah Chen',
    fee: 200,
    conditions: 'Annual testing required. Test records must be submitted to fire marshal within 30 days of test.',
    notes: '',
  },
];
