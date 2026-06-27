// ─── Field Maps ──────────────────────────────────────────────────────────────
//
// Maps source-system CSV column names → OpenFirehouse internal field names.
// Keys are lowercase/normalized source column names.
// Values are OpenFirehouse field IDs.
//
// Usage: fieldMaps[recordType][sourceSystem] returns a lookup object.
// Auto-apply: during mapping step, normalize each CSV header and look it up here.

// ── Record Type Definitions ───────────────────────────────────────────────────

export const RECORD_TYPES = [
  {
    id: 'runlist',
    label: 'Run List / Riding Assignments',
    description: 'Import a daily run list — who is riding each apparatus (BC, captains, firefighters) — from a PDF, spreadsheet, or paste. Creates the apparatus + members and staffs the board.',
    targetModule: 'Run List',
    icon: 'ClipboardList',
    fields: [
      { id: 'unit',     label: 'Unit / Apparatus', required: true  },
      { id: 'position', label: 'Position / Seat',  required: false },
      { id: 'name',     label: 'Name',             required: true  },
      { id: 'rank',     label: 'Rank',             required: false },
    ],
    sampleCsv: `Unit,Position,Name,Rank
Battalion 1,Battalion Chief,Robert Hale,BC
Battalion 1,BC Aide,Daniel Ortiz,FF
Engine 1,Captain,David Marsh,Capt
Engine 1,Firefighter,Eric Donovan,FF
Engine 1,Firefighter,Ryan Patel,FF
Truck 1,Captain,James Sullivan,Capt
Truck 1,Firefighter,Mark Reilly,FF`,
  },
  {
    id: 'members',
    label: 'Members / Personnel',
    description: 'Import member roster — names, ranks, contact info, hire dates, certifications.',
    targetModule: 'Member Roster',
    icon: 'Users',
    fields: [
      { id: 'firstName',    label: 'First Name',   required: true  },
      { id: 'lastName',     label: 'Last Name',    required: true  },
      { id: 'rank',         label: 'Rank',         required: false },
      { id: 'email',        label: 'Email',        required: false },
      { id: 'phone',        label: 'Phone',        required: false },
      { id: 'hireDate',     label: 'Hire Date',    required: false },
      { id: 'status',       label: 'Status',       required: false },
      { id: 'address',      label: 'Address',      required: false },
      { id: 'emergencyContact', label: 'Emergency Contact', required: false },
    ],
    sampleCsv: `first_name,last_name,rank,email,phone,hire_date,status
Sarah,Chen,Chief,schen@example.com,715-555-0100,2010-04-15,Active
Maria,Delgado,Lieutenant,mdelgado@example.com,715-555-0101,2012-08-22,Active
Sarah,Chen,Lieutenant,schen@example.com,715-555-0102,2014-01-10,Active
Nathan,McGee,Firefighter,nmcgee@example.com,715-555-0103,2018-06-30,Active
Priya,Sharma,Firefighter,psharma@example.com,715-555-0104,2019-11-05,Active`,
  },
  {
    id: 'incidents',
    label: 'Incidents / Calls',
    description: 'Import incident records from CAD export, NFIRS XML, or RMS.',
    targetModule: 'Incident Log',
    icon: 'Flame',
    fields: [
      { id: 'incidentNumber', label: 'Incident Number', required: true  },
      { id: 'date',           label: 'Date',            required: true  },
      { id: 'type',           label: 'Incident Type',   required: true  },
      { id: 'address',        label: 'Address',         required: false },
      { id: 'dispatchTime',   label: 'Dispatch Time',   required: false },
      { id: 'clearTime',      label: 'Clear Time',      required: false },
      { id: 'units',          label: 'Units / Apparatus', required: false },
      { id: 'respondingOfficer', label: 'Officer',      required: false },
      { id: 'injuries',       label: 'Injuries',        required: false },
      { id: 'narrative',      label: 'Narrative',       required: false },
    ],
    sampleCsv: `incident_number,call_date,call_type,address,dispatch_time,units,narrative
INC-2025-0001,2025-01-04,Structure Fire,412 Main St,07:22,Engine 1,Working house fire — controlled in 40 min
INC-2025-0002,2025-01-05,Medical — Priority 1,88 Riverside Dr,14:10,Rescue 1,EMS assist — patient transported
INC-2025-0003,2025-01-07,Alarm,200 Commerce Rd,09:55,Engine 1,Sprinkler activation — cooking smoke
INC-2025-0004,2025-01-12,MVA,Rte 15 & Bridge St,18:33,"Engine 1, Rescue 1",Two-vehicle accident with injuries`,
  },
  {
    id: 'training',
    label: 'Training Management',
    description: 'Import certifications and training history per member.',
    targetModule: 'Training Management',
    icon: 'BookOpen',
    fields: [
      { id: 'memberLastName',   label: 'Member Last Name',  required: true  },
      { id: 'memberFirstName',  label: 'Member First Name', required: false },
      { id: 'courseName',       label: 'Course / Cert Name', required: true },
      { id: 'provider',         label: 'Provider',          required: false },
      { id: 'completionDate',   label: 'Completion Date',   required: true  },
      { id: 'expirationDate',   label: 'Expiration Date',   required: false },
      { id: 'certNumber',       label: 'Cert / Card Number', required: false },
      { id: 'hoursCompleted',   label: 'Hours',             required: false },
    ],
    sampleCsv: `last_name,first_name,course,provider,completion_date,expiration_date,cert_number
Chen,Sarah,Firefighter I,State Fire Academy,2010-06-15,,FA-001234
Delgado,Maria,Firefighter I,State Fire Academy,2012-09-20,,FA-001892
Chen,Sarah,Emergency Vehicle Operator,EVOC Center,2021-03-10,2024-03-10,EVOC-8841
McGee,Nathan,Hazmat Operations,County EMA,2020-07-22,2023-07-22,HM-4422
Sharma,Priya,Firefighter I,State Fire Academy,2019-12-05,,FA-005510`,
  },
  {
    id: 'apparatus',
    label: 'Apparatus',
    description: 'Import fleet inventory — unit IDs, types, year, VIN, mileage.',
    targetModule: 'Apparatus Tracker',
    icon: 'Truck',
    fields: [
      { id: 'unitId',    label: 'Unit ID',     required: true  },
      { id: 'type',      label: 'Type',        required: true  },
      { id: 'year',      label: 'Year',        required: false },
      { id: 'make',      label: 'Make',        required: false },
      { id: 'model',     label: 'Model',       required: false },
      { id: 'vin',       label: 'VIN',         required: false },
      { id: 'mileage',   label: 'Mileage',     required: false },
      { id: 'status',    label: 'Status',      required: false },
      { id: 'notes',     label: 'Notes',       required: false },
    ],
    sampleCsv: `unit_id,unit_type,year,make,model,vin,mileage,status
Engine 1,Pumper,2018,Pierce,Enforcer,1F9EL3WL8JK000001,42800,In Service
Tanker 1,Tanker,2015,KME,Predator,1M9TK2WL5FK000002,38200,In Service
Rescue 1,Rescue,2020,Horton,PX,1HTMMAAR5LH000003,21400,In Service
Engine 2,Pumper,2008,Pierce,Arrow XT,1F9EL3WL8AK000004,98700,Reserve`,
  },
  {
    id: 'assets',
    label: 'Assets & Inventory',
    description: 'Import equipment and supply inventory from a spreadsheet.',
    targetModule: 'Asset & Inventory',
    icon: 'Package',
    fields: [
      { id: 'name',          label: 'Item Name',    required: true  },
      { id: 'category',      label: 'Category',     required: false },
      { id: 'quantity',      label: 'Quantity',     required: true  },
      { id: 'location',      label: 'Location',     required: false },
      { id: 'serialNumber',  label: 'Serial Number', required: false },
      { id: 'purchaseDate',  label: 'Purchase Date', required: false },
      { id: 'purchasePrice', label: 'Purchase Price', required: false },
      { id: 'notes',         label: 'Notes',        required: false },
    ],
    sampleCsv: `item_name,category,qty,location,serial_number,purchase_date
Scott Air-Pak X3 Pro SCBA,SCBA,6,Station Bay,SCOTT-2021-001,2021-03-15
4" Attack Hose 50ft,Hose,24,Hose Tower,,2019-06-01
Stokes Basket,Rescue,2,Rescue 1,,2020-08-10
Thermal Imaging Camera,Thermal,3,Engine 1,,2022-01-20`,
  },
];

// ── Source Systems ────────────────────────────────────────────────────────────

export const SOURCE_SYSTEMS = [
  {
    id: 'eso',
    name: 'Standard RMS Export (Format A)',
    description: 'Common fire RMS CSV format — first_name, last_name, hire_date, incident_number style columns. Auto-maps most fields.',
    supports: ['members', 'incidents', 'training'],
  },
  {
    id: 'firehouse',
    name: 'Standard RMS Export (Format B)',
    description: 'Extended fire RMS CSV format — fname, lname, entry_date, apparatus style columns. Includes apparatus records.',
    supports: ['members', 'incidents', 'training', 'apparatus'],
  },
  {
    id: 'imagetrend',
    name: 'Web-Based RMS Export',
    description: 'Web RMS CSV format — firstname, lastname, emailaddress, phonenumber style columns. Auto-maps most fields.',
    supports: ['members', 'incidents', 'training'],
  },
  {
    id: 'emergencyreporting',
    name: 'Incident / Response Export',
    description: 'Incident-focused CSV export format. Best for call history and training completion records.',
    supports: ['incidents', 'training'],
  },
  {
    id: 'targetsolutions',
    name: 'Training Platform Export',
    description: 'Training completion CSV — member name, course, completion date, expiration date columns.',
    supports: ['training'],
  },
  {
    id: 'csv',
    name: 'Generic CSV / Excel / PDF',
    description: 'Any CSV, Excel, or PDF export — or paste rows directly. Columns are auto-mapped and you can adjust.',
    supports: ['runlist', 'members', 'incidents', 'training', 'apparatus', 'assets'],
  },
];

// ── Field Maps ────────────────────────────────────────────────────────────────
// fieldMaps[recordType][sourceSystem] = { 'source_column_lowercase': 'freestationField' }

export const FIELD_MAPS = {

  members: {
    eso: {
      'first_name':          'firstName',
      'firstname':           'firstName',
      'last_name':           'lastName',
      'lastname':            'lastName',
      'rank':                'rank',
      'title':               'rank',
      'email':               'email',
      'email_address':       'email',
      'phone':               'phone',
      'cell_phone':          'phone',
      'mobile':              'phone',
      'hire_date':           'hireDate',
      'employment_date':     'hireDate',
      'start_date':          'hireDate',
      'status':              'status',
      'member_status':       'status',
      'address':             'address',
    },
    firehouse: {
      'fname':               'firstName',
      'lname':               'lastName',
      'first_name':          'firstName',
      'last_name':           'lastName',
      'rank':                'rank',
      'e_mail':              'email',
      'email':               'email',
      'work_phone':          'phone',
      'cell':                'phone',
      'home_phone':          'phone',
      'hire_date':           'hireDate',
      'entry_date':          'hireDate',
      'status':              'status',
    },
    imagetrend: {
      'firstname':           'firstName',
      'lastname':            'lastName',
      'given_name':          'firstName',
      'family_name':         'lastName',
      'rank':                'rank',
      'emailaddress':        'email',
      'email':               'email',
      'phonenumber':         'phone',
      'mobilephone':         'phone',
      'hiredate':            'hireDate',
      'memberstatus':        'status',
    },
    csv: {},
  },

  incidents: {
    eso: {
      'incident_number':     'incidentNumber',
      'inc_num':             'incidentNumber',
      'call_date':           'date',
      'incident_date':       'date',
      'call_type':           'type',
      'incident_type':       'type',
      'nature':              'type',
      'address':             'address',
      'location':            'address',
      'call_addr':           'address',
      'dispatch_time':       'dispatchTime',
      'alarm_time':          'dispatchTime',
      'clear_time':          'clearTime',
      'unit_id':             'units',
      'units':               'units',
      'apparatus':           'units',
      'officer':             'respondingOfficer',
      'ic':                  'respondingOfficer',
      'injuries':            'injuries',
      'narrative':           'narrative',
      'remarks':             'narrative',
      'comments':            'narrative',
    },
    firehouse: {
      'incident_no':         'incidentNumber',
      'alarm_date':          'date',
      'inc_date':            'date',
      'inc_type':            'type',
      'call_type':           'type',
      'address':             'address',
      'dispatch':            'dispatchTime',
      'cleared':             'clearTime',
      'unit':                'units',
      'officer_in_charge':   'respondingOfficer',
      'ems_injuries':        'injuries',
      'narrative':           'narrative',
    },
    imagetrend: {
      'incidentnumber':      'incidentNumber',
      'incidentdate':        'date',
      'incidenttype':        'type',
      'calltype':            'type',
      'address':             'address',
      'dispatchtime':        'dispatchTime',
      'cleartime':           'clearTime',
      'unit':                'units',
      'respondingunit':      'units',
      'supervisor':          'respondingOfficer',
      'injuries':            'injuries',
      'narrative':           'narrative',
    },
    emergencyreporting: {
      'run_number':          'incidentNumber',
      'incident_date':       'date',
      'call_type':           'type',
      'incident_address':    'address',
      'dispatch_time':       'dispatchTime',
      'unit_responding':     'units',
      'narrative':           'narrative',
    },
    csv: {},
  },

  training: {
    eso: {
      'last_name':           'memberLastName',
      'first_name':          'memberFirstName',
      'course_name':         'courseName',
      'course':              'courseName',
      'provider':            'provider',
      'training_provider':   'provider',
      'completion_date':     'completionDate',
      'completed_date':      'completionDate',
      'expiration_date':     'expirationDate',
      'expires':             'expirationDate',
      'cert_number':         'certNumber',
      'certificate_number':  'certNumber',
      'hours':               'hoursCompleted',
      'credit_hours':        'hoursCompleted',
    },
    firehouse: {
      'last_name':           'memberLastName',
      'first_name':          'memberFirstName',
      'course_name':         'courseName',
      'provider':            'provider',
      'date_completed':      'completionDate',
      'expiration_date':     'expirationDate',
      'cert_no':             'certNumber',
      'hours':               'hoursCompleted',
    },
    imagetrend: {
      'lastname':            'memberLastName',
      'firstname':           'memberFirstName',
      'coursename':          'courseName',
      'provider':            'provider',
      'completiondate':      'completionDate',
      'expirationdate':      'expirationDate',
      'certificatenumber':   'certNumber',
      'hours':               'hoursCompleted',
    },
    targetsolutions: {
      'last_name':           'memberLastName',
      'first_name':          'memberFirstName',
      'course_title':        'courseName',
      'course_name':         'courseName',
      'training_provider':   'provider',
      'completion_date':     'completionDate',
      'expiration_date':     'expirationDate',
      'certificate_id':      'certNumber',
      'credit_hours':        'hoursCompleted',
    },
    csv: {},
  },

  apparatus: {
    firehouse: {
      'unit_id':             'unitId',
      'apparatus_id':        'unitId',
      'unit_type':           'type',
      'apparatus_type':      'type',
      'year':                'year',
      'make':                'make',
      'manufacturer':        'make',
      'model':               'model',
      'vin':                 'vin',
      'mileage':             'mileage',
      'odometer':            'mileage',
      'status':              'status',
      'notes':               'notes',
    },
    csv: {
      'unit_id':             'unitId',
      'unit_type':           'type',
      'year':                'year',
      'make':                'make',
      'model':               'model',
      'vin':                 'vin',
      'mileage':             'mileage',
      'status':              'status',
    },
  },

  assets: {
    csv: {
      'item_name':           'name',
      'name':                'name',
      'description':         'name',
      'category':            'category',
      'qty':                 'quantity',
      'quantity':            'quantity',
      'count':               'quantity',
      'location':            'location',
      'serial_number':       'serialNumber',
      'serial_no':           'serialNumber',
      'sn':                  'serialNumber',
      'purchase_date':       'purchaseDate',
      'date_purchased':      'purchaseDate',
      'purchase_price':      'purchasePrice',
      'cost':                'purchasePrice',
      'notes':               'notes',
    },
  },
};

// ── Auto-map helper ───────────────────────────────────────────────────────────
// Given a list of CSV headers and a source system + record type,
// returns a mapping object { csvHeader: freestationFieldId | '' }

export function autoMapFields(headers, recordType, sourceSystem) {
  const map = FIELD_MAPS[recordType]?.[sourceSystem] ?? {};
  const validFieldIds = new Set((RECORD_TYPES.find(rt => rt.id === recordType)?.fields ?? []).map(f => f.id));
  const result = {};
  headers.forEach(header => {
    const normalized = header.toLowerCase().trim().replace(/\s+/g, '_');
    let field = map[normalized] ?? '';
    if (!field) {
      // Generic alias fallback — only applied when the target field actually
      // exists on this record type, so it can't mis-map across types.
      const alias = GENERIC_ALIASES[normalized];
      if (alias && validFieldIds.has(alias)) field = alias;
      else if (validFieldIds.has(normalized)) field = normalized; // header already == a field id
    }
    result[header] = field;
  });
  return result;
}

// Common header synonyms → field id. Scoped at apply-time to the record type's
// own fields (see autoMapFields), so e.g. "apparatus"→unit only takes effect for
// the run-list type.
const GENERIC_ALIASES = {
  unit: 'unit', apparatus: 'unit', company: 'unit', rig: 'unit', assignment_unit: 'unit',
  position: 'position', seat: 'position', riding_position: 'position', assignment: 'position',
  name: 'name', member: 'name', member_name: 'name', full_name: 'name', personnel: 'name',
  rank: 'rank', grade: 'rank',
};
