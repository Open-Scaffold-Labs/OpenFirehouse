'use strict';
const { mutualAid: db } = require('./db');

module.exports = async function seedMutualAid() {
  const existing = await db.all(1);
  if (existing.length > 0) { console.log('Mutual aid seed: already seeded, skipping.'); return; }

const SEED = [
  {
    date: '2026-01-08', direction: 'Given', incidentType: 'Structure Fire', status: 'Completed',
    partnerDepartment: 'Riverside VFD – Station 7',
    address: '412 Birch Lane, Riverside Township',
    unitsDeployed: ['Engine 14', 'Tanker 14'], personnelCount: 6,
    requestTime: '02:14', clearTime: '06:45',
    notes: 'Working house fire, second floor involved on arrival. Assisted with water supply and interior attack. Released at scene control.',
    incidentNumber: 'RIV-2026-0012',
  },
  {
    date: '2026-01-15', direction: 'Received', incidentType: 'Vehicle Accident', status: 'Completed',
    partnerDepartment: 'Greenfield Fire Dept – Station 2',
    address: 'Route 22 & Miller Road, Maplewood',
    unitsDeployed: ['Rescue 14'], personnelCount: 4,
    requestTime: '17:38', clearTime: '19:05',
    notes: 'Multi-vehicle accident with entrapment. Greenfield provided rescue unit and extrication equipment. One patient transported.',
    incidentNumber: 'INC-2026-0003',
  },
  {
    date: '2026-01-29', direction: 'Given', incidentType: 'Brush / Wildland Fire', status: 'Completed',
    partnerDepartment: 'Cedar Ridge VFD – Station 11',
    address: 'State Game Lands Tract 44, Cedar Ridge Twp',
    unitsDeployed: ['Brush 14'], personnelCount: 3,
    requestTime: '13:55', clearTime: '17:20',
    notes: 'Brush fire, approximately 4 acres. Provided brush unit for perimeter control. Conditions dry, moderate wind.',
    incidentNumber: 'CR-2026-0008',
  },
  {
    date: '2026-02-03', direction: 'Received', incidentType: 'Structure Fire', status: 'Completed',
    partnerDepartment: 'Oakdale Township FD – Station 9',
    address: '88 Maple Grove Road, Maplewood',
    unitsDeployed: ['Engine 14', 'Ladder 14', 'Tanker 14'], personnelCount: 5,
    requestTime: '23:11', clearTime: '04:30',
    notes: 'Commercial structure fire, 2nd alarm. Oakdale provided engine and manpower for RIT assignment. No injuries.',
    incidentNumber: 'INC-2026-0006',
  },
  {
    date: '2026-02-11', direction: 'Given', incidentType: 'Medical / EMS', status: 'Completed',
    partnerDepartment: 'Hillcrest Fire District – Station 3',
    address: '77 Valley View Drive, Hillcrest',
    unitsDeployed: ['EMS 14'], personnelCount: 2,
    requestTime: '09:22', clearTime: '10:45',
    notes: 'Cardiac arrest. Hillcrest unit delayed; EMS 14 first on scene. Patient stabilized and transferred to county EMS.',
    incidentNumber: 'HC-2026-0019',
  },
  {
    date: '2026-02-19', direction: 'Received', incidentType: 'Manpower / Staffing', status: 'Completed',
    partnerDepartment: 'Northbrook FD – Station 21',
    address: 'Station 14 – Coverage Assignment',
    unitsDeployed: [], personnelCount: 3,
    requestTime: '18:00', clearTime: '06:00',
    notes: 'Station coverage during major incident out of district. Northbrook provided 3 personnel for overnight coverage.',
    incidentNumber: '—',
  },
  {
    date: '2026-02-28', direction: 'Given', incidentType: 'Water Rescue', status: 'Completed',
    partnerDepartment: 'Lakewood VFD – Station 5',
    address: 'Silver Creek Bridge, County Road 14',
    unitsDeployed: ['Rescue 14', 'Command 14'], personnelCount: 7,
    requestTime: '16:02', clearTime: '19:30',
    notes: 'Swift water rescue, two subjects stranded on vehicle in flooded roadway. Both rescued without injury.',
    incidentNumber: 'LKW-2026-0031',
  },
  {
    date: '2026-03-02', direction: 'Given', incidentType: 'Structure Fire', status: 'Completed',
    partnerDepartment: 'Pine Valley Fire Dept – Station 18',
    address: '1802 Old Mill Road, Pine Valley',
    unitsDeployed: ['Engine 14', 'Tanker 14'], personnelCount: 5,
    requestTime: '07:48', clearTime: '12:15',
    notes: 'Barn fire, fully involved on arrival. Provided water supply tanker operations.',
    incidentNumber: 'PV-2026-0004',
  },
];

  let n = 0;
  for (const row of SEED) { await db.create(row, 1); n++; }
  console.log(`Mutual aid seed: ${n} records inserted.`);
};
