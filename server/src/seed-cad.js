'use strict';
const { cadConnections: db } = require('./db');

module.exports = async function seedCad() {
  const existing = await db.all(1);
  if (existing.length > 0) {
    console.log(`CAD connections seed: already seeded (${existing.length} records) — skipping.`);
  } else {
    const records = [
      {
        vendorId: 'centralsquare',
        name: 'County Dispatch — CentralSquare',
        status: 'Active',
        host: 'dispatch.maplewoodcounty.gov',
        apiKey: '••••••••••••••••3f8a',
        syncInterval: 'Every 15 minutes',
        notes: 'Primary dispatch connection. County CAD feeds all fire and EMS calls.',
        incidentsImported: 247,
        lastSync: '2026-03-06T07:45:00',
        lastSyncResult: 'success',
        fieldMap: {
          incident_number: 'incidentNumber',
          call_type:       'type',
          address:         'address',
          dispatch_time:   'dispatchTime',
          unit_id:         'apparatus',
        },
      },
    ];

    for (const r of records) { await db.create(r, 1); }
    console.log(`CAD connections seed: inserted ${records.length} records.`);
  }
};
