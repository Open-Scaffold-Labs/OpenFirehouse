// ─── CAD Integration Data ───────────────────────────────────────────────────

export const CAD_VENDORS = [
  {
    id: 'imagetrend',
    name: 'ImageTrend Elite',
    description: 'ImageTrend Elite — incident/records integration via REST web services.',
    docsUrl: 'https://support.imagetrend.com',
    authMethod: 'OAuth 2.0',
    features: ['Incident import', 'EMS/patient data', 'Training sync', 'NFIRS export'],
    logo: 'IT',
  },
  {
    id: 'premierone',
    name: 'Motorola PremierOne',
    description: 'Motorola Solutions PremierOne CAD — fire/EMS dispatch integration.',
    docsUrl: 'https://www.motorolasolutions.com',
    authMethod: 'IP Whitelist + API Key',
    features: ['Real-time dispatch', 'Unit status', 'Incident import', 'Geo/mapping'],
    logo: 'PO',
  },
  {
    id: 'centralsquare',
    name: 'CentralSquare CAD',
    description: 'CentralSquare — CAD dispatch integration.',
    docsUrl: 'https://www.centralsquare.com',
    authMethod: 'API Key',
    features: ['Incident import', 'Unit tracking', 'Automated reports'],
    logo: 'CS',
  },
  {
    id: 'tyler',
    name: 'Tyler Technologies New World',
    description: 'Tyler Technologies New World — CAD dispatch integration.',
    docsUrl: 'https://www.tylertech.com',
    authMethod: 'OAuth 2.0',
    features: ['CAD dispatch feed', 'Incident export', 'Personnel integration'],
    logo: 'TY',
  },
  {
    id: 'console1',
    name: 'Zetron ACOM / Console One',
    description: 'Zetron ACOM — dispatch logging integration.',
    docsUrl: 'https://www.zetron.com',
    authMethod: 'Network (LAN/VPN)',
    features: ['Dispatch logging', 'Unit status', 'Incident timestamps'],
    logo: 'ZT',
  },
  {
    id: 'spillman',
    name: 'Motorola Spillman Flex',
    description: 'Spillman Flex CAD — CAD incident/records integration.',
    docsUrl: 'https://www.motorolasolutions.com',
    authMethod: 'API Key',
    features: ['Incident export', 'Unit tracking', 'Records integration'],
    logo: 'SF',
  },
  {
    id: 'csv',
    name: 'Generic CSV / FTP Export',
    description: 'Manual or automated CSV export from any CAD system via FTP or file drop.',
    docsUrl: null,
    authMethod: 'FTP / File Upload',
    features: ['Incident batch import', 'Flexible field mapping', 'One-time or scheduled'],
    logo: 'CSV',
  },
];

export const CONNECTION_STATUSES = ['Active', 'Inactive', 'Error', 'Testing'];

export const SYNC_INTERVALS = [
  'Manual only',
  'Every 15 minutes',
  'Every 30 minutes',
  'Hourly',
  'Every 4 hours',
  'Daily',
];

export const INCIDENT_TYPES_CAD = [
  'Structure Fire',
  'Vehicle Fire',
  'Brush / Wildland Fire',
  'Medical — Priority 1 (Life Threat)',
  'Medical — Priority 2',
  'Medical — Priority 3',
  'Motor Vehicle Accident',
  'Hazmat',
  'Technical Rescue',
  'Water Rescue',
  'Alarm (Smoke / CO / Sprinkler)',
  'Public Assist',
  'Mutual Aid Given',
  'Mutual Aid Received',
  'Other',
];

// Mock CAD connections configured for this demo station
export const initialConnections = [
  {
    id: 1,
    vendorId: 'centralsquare',
    name: 'County Dispatch — CentralSquare',
    status: 'Active',
    host: 'dispatch.maplewoodcounty.gov',
    apiKey: '••••••••••••••••3f8a',
    syncInterval: 'Every 15 minutes',
    lastSync: '2026-03-06T07:45:00',
    lastSyncResult: 'success',
    incidentsImported: 247,
    fieldMap: {
      incident_number: 'incidentNumber',
      call_type: 'type',
      address: 'address',
      dispatch_time: 'dispatchTime',
      unit_id: 'apparatus',
    },
    notes: 'Primary dispatch connection. County CAD feeds all fire and EMS calls.',
  },
];

// Mock import log entries
export const initialImportLog = [
  {
    id: 1,
    connectionId: 1,
    timestamp: '2026-03-06T07:45:00',
    status: 'success',
    records: 3,
    message: '3 new incidents imported (INC-2026-0312 through INC-2026-0314)',
  },
  {
    id: 2,
    connectionId: 1,
    timestamp: '2026-03-06T07:30:00',
    status: 'success',
    records: 0,
    message: 'No new incidents since last sync.',
  },
  {
    id: 3,
    connectionId: 1,
    timestamp: '2026-03-05T19:15:00',
    status: 'success',
    records: 1,
    message: '1 new incident imported (INC-2026-0311).',
  },
  {
    id: 4,
    connectionId: 1,
    timestamp: '2026-03-05T12:00:00',
    status: 'error',
    records: 0,
    message: 'Connection timeout — retried successfully at 12:01.',
  },
  {
    id: 5,
    connectionId: 1,
    timestamp: '2026-03-04T08:00:00',
    status: 'success',
    records: 2,
    message: '2 new incidents imported (INC-2026-0309, INC-2026-0310).',
  },
];

// Mock recent incidents pulled from CAD
export const cadRecentIncidents = [
  {
    id: 'INC-2026-0314',
    type: 'Medical — Priority 1 (Life Threat)',
    address: '540 Elm St',
    dispatchTime: '2026-03-06T06:22:00',
    units: ['Engine 1', 'Rescue 1'],
    status: 'Closed',
    imported: true,
  },
  {
    id: 'INC-2026-0313',
    type: 'Alarm (Smoke / CO / Sprinkler)',
    address: '200 Commerce Rd',
    dispatchTime: '2026-03-06T02:15:00',
    units: ['Engine 1'],
    status: 'Closed',
    imported: true,
  },
  {
    id: 'INC-2026-0312',
    type: 'Motor Vehicle Accident',
    address: 'Route 15 & Bridge St',
    dispatchTime: '2026-03-05T22:47:00',
    units: ['Engine 1', 'Rescue 1', 'Tanker 1'],
    status: 'Closed',
    imported: true,
  },
  {
    id: 'INC-2026-0311',
    type: 'Structure Fire',
    address: '2200 Industrial Pkwy',
    dispatchTime: '2026-03-05T08:45:00',
    units: ['Engine 1', 'Tanker 1', 'Engine 2'],
    status: 'Closed',
    imported: true,
  },
];

// Field mapping reference — what our incident model expects vs common CAD field names
export const FIELD_MAP_REFERENCE = [
  { freestation: 'incidentNumber', label: 'Incident Number',  examples: 'inc_num, call_id, incident_id' },
  { freestation: 'type',           label: 'Call Type',        examples: 'call_type, inc_type, nature' },
  { freestation: 'address',        label: 'Address',          examples: 'address, location, call_addr' },
  { freestation: 'dispatchTime',   label: 'Dispatch Time',    examples: 'dispatch_time, alarm_time, call_time' },
  { freestation: 'apparatus',      label: 'Unit(s)',          examples: 'unit_id, units, apparatus' },
  { freestation: 'respondingOfficer', label: 'Officer',       examples: 'officer, supervisor, ic' },
  { freestation: 'narrative',      label: 'Narrative',        examples: 'narrative, comments, remarks' },
];
