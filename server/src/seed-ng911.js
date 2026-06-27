'use strict';
const db = require('./db');
module.exports = async function seedNG911() {
  const { rows } = await db.query('SELECT COUNT(*) as c FROM ng911_calls WHERE station_id = 1');
  if (parseInt(rows[0].c) > 0) { console.log('NG911 seed: already seeded.'); return; }
  console.log('NG911 seed: inserting demo calls...');

  const CALLS = [
    {
      call_id: 'NG911-2026-0342', call_type: 'Structure Fire', priority: 'emergency',
      caller_name: 'Janet Crawford', caller_phone: '(570) 555-8821',
      caller_latitude: 40.7335, caller_longitude: -74.2695, caller_accuracy_meters: 8,
      location_method: 'device_gps', verified_address: '742 Evergreen Terrace',
      verified_city: 'Maplewood', verified_state: 'NJ', verified_zip: '07040',
      building_name: 'Single-family residence', floor: '2nd', room: '',
      supplemental_data: { construction: 'Wood frame', stories: 2, occupants_reported: 'possibly inside', hydrant_nearby: 'H-055 — 150ft' },
      call_narrative: 'Caller reports heavy smoke coming from second floor windows. Caller is across the street. States she saw flames briefly in an upstairs window. Believes the owner may still be inside — his car is in the driveway. Dog barking from inside.',
      caller_text_messages: [
        { time: '14:30:15', text: 'FIRE at 742 Evergreen Terrace smoke from upstairs windows' },
        { time: '14:30:42', text: 'I can see flames now in the 2nd floor window on the left side' },
        { time: '14:31:10', text: 'Owner might be inside his truck is here' },
      ],
      media_urls: [
        { type: 'image', url: '/demo/ng911-smoke-showing.jpg', caption: 'Smoke visible from 2nd floor — caller photo', timestamp: '14:30:28' },
        { type: 'image', url: '/demo/ng911-flames-window.jpg', caption: 'Flames in upstairs window — caller photo', timestamp: '14:31:05' },
      ],
      psap_name: 'Essex County 911 Center', psap_id: 'PSAP-NJ-034',
      ani: '5705558821', ali: '742 EVERGREEN TER MAPLEWOOD NJ 07040', esn: 'ESN-1402',
      status: 'dispatched', incident_created: true,
    },
    {
      call_id: 'NG911-2026-0338', call_type: 'Medical — Cardiac', priority: 'emergency',
      caller_name: 'Charge Nurse — Riverside Nursing', caller_phone: '(570) 555-0212',
      caller_latitude: 40.7342, caller_longitude: -74.2705, caller_accuracy_meters: 12,
      location_method: 'database_lookup', verified_address: '45 Riverside Drive',
      verified_city: 'Maplewood', verified_state: 'NJ', verified_zip: '07040',
      building_name: 'Riverside Nursing & Rehabilitation Center', floor: '2nd', room: 'Room 214',
      supplemental_data: { occupancy_type: 'Healthcare', residents: 112, knox_box: 'K-022', elevator: true, AED_location: 'Nurses station 2nd floor' },
      call_narrative: 'Charge nurse reports 78-year-old male patient unresponsive in Room 214. Staff performing CPR. AED applied — no shock advised. Patient has DNR on file but family has requested full resuscitation.',
      caller_text_messages: [],
      media_urls: [],
      psap_name: 'Essex County 911 Center', psap_id: 'PSAP-NJ-034',
      ani: '5705550212', ali: '45 RIVERSIDE DR MAPLEWOOD NJ 07040', esn: 'ESN-1402',
      status: 'dispatched', incident_created: true,
    },
    {
      call_id: 'NG911-2026-0345', call_type: 'Hazmat — Fuel Spill', priority: 'high',
      caller_name: 'Tom Reeves — Night Manager', caller_phone: '(570) 555-0335',
      caller_latitude: 40.7288, caller_longitude: -74.2615, caller_accuracy_meters: 15,
      location_method: 'device_gps', verified_address: '775 Route 22',
      verified_city: 'Maplewood', verified_state: 'NJ', verified_zip: '07040',
      building_name: "Hannigan's Fuel & Auto", floor: '', room: 'Fueling canopy area',
      supplemental_data: { hazmat_type: 'Gasoline', estimated_volume: '50+ gallons', UST_count: 3, knox_box: 'K-091', emergency_shutoff: 'Red mushroom button — cashier window AND canopy column' },
      call_narrative: 'Night manager reports a vehicle struck a fuel dispenser at the canopy. Gasoline is flowing freely from the damaged dispenser. Driver is injured and still in the vehicle. Strong fuel odor. Manager has activated the emergency shutoff but fuel is still draining from the broken line.',
      caller_text_messages: [
        { time: '22:14:30', text: 'Car hit the gas pump fuel is everywhere' },
        { time: '22:15:02', text: 'Hit the emergency stop but fuel still coming out of broken pipe' },
      ],
      media_urls: [
        { type: 'image', url: '/demo/ng911-fuel-spill.jpg', caption: 'Damaged dispenser with fuel flowing — caller photo', timestamp: '22:14:45' },
      ],
      psap_name: 'Essex County 911 Center', psap_id: 'PSAP-NJ-034',
      ani: '5705550335', ali: '775 RTE 22 MAPLEWOOD NJ 07040', esn: 'ESN-1402',
      status: 'new', incident_created: false,
    },
    {
      call_id: 'NG911-2026-0347', call_type: 'Fire Alarm', priority: 'standard',
      caller_name: 'ADT Monitoring Center', caller_phone: '(800) 555-0199',
      caller_latitude: 40.7278, caller_longitude: -74.2648, caller_accuracy_meters: 5,
      location_method: 'database_lookup', verified_address: '500 Valley Road',
      verified_city: 'Maplewood', verified_state: 'NJ', verified_zip: '07040',
      building_name: 'Valley View Apartments', floor: '3rd', room: 'Unit 312',
      supplemental_data: { alarm_zone: 'Smoke detector — Kitchen', alarm_panel: 'Lobby fire command center', knox_box: 'K-034', gate_code: '7721', sprinkler: true, standpipe: true },
      call_narrative: 'Automatic fire alarm activation. Smoke detector Zone 3-12 (3rd floor, Unit 312, kitchen). No callback from occupant. Building is sprinklered. Fire command center in lobby. Knox Box K-034 in main vestibule.',
      caller_text_messages: [],
      media_urls: [],
      psap_name: 'Essex County 911 Center', psap_id: 'PSAP-NJ-034',
      ani: '8005550199', ali: '500 VALLEY RD APT 312 MAPLEWOOD NJ 07040', esn: 'ESN-1402',
      status: 'new', incident_created: false,
    },
  ];

  for (const c of CALLS) {
    await db.query(
      `INSERT INTO ng911_calls (station_id, call_id, call_type, priority, caller_name, caller_phone,
        caller_latitude, caller_longitude, caller_accuracy_meters, location_method,
        verified_address, verified_city, verified_state, verified_zip,
        building_name, floor, room, supplemental_data, call_narrative,
        caller_text_messages, media_urls, psap_name, psap_id, ani, ali, esn, status, incident_created)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
      [1, c.call_id, c.call_type, c.priority, c.caller_name, c.caller_phone,
       c.caller_latitude, c.caller_longitude, c.caller_accuracy_meters, c.location_method,
       c.verified_address, c.verified_city, c.verified_state, c.verified_zip,
       c.building_name, c.floor, c.room, JSON.stringify(c.supplemental_data),
       c.call_narrative, JSON.stringify(c.caller_text_messages), JSON.stringify(c.media_urls),
       c.psap_name, c.psap_id, c.ani, c.ali, c.esn, c.status, c.incident_created]
    );
  }
  console.log(`NG911 seed: inserted ${CALLS.length} demo calls.`);
};
