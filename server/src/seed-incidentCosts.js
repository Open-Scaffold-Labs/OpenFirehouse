'use strict';
const db = require('./db');
module.exports = async function seedIncidentCosts() {
  const { rows } = await db.query('SELECT COUNT(*) as c FROM incident_costs WHERE station_id = 1');
  if (parseInt(rows[0].c) > 0) { console.log('Incident costs seed: already seeded.'); return; }
  console.log('Incident costs seed: inserting demo data...');
  // Get first few incident IDs
  const incidents = await db.query('SELECT id FROM incidents WHERE station_id = 1 ORDER BY id LIMIT 5');
  if (!incidents.rows.length) { console.log('No incidents to attach costs to.'); return; }
  const ids = incidents.rows.map(r => r.id);
  const COSTS = [
    { incident_id: ids[0], category: 'personnel', description: 'Overtime — 4 members, 6 hours each', amount: 2400, entered_by: 'Sarah Chen' },
    { incident_id: ids[0], category: 'apparatus', description: 'Engine 1 fuel — 42 gallons diesel', amount: 168, entered_by: 'Sarah Chen' },
    { incident_id: ids[0], category: 'supplies', description: 'AFFF foam concentrate — 20 gallons used', amount: 340, entered_by: 'Maria Delgado' },
    { incident_id: ids[0], category: 'equipment', description: 'Replacement hose — 200ft 1.75" burst during ops', amount: 890, entered_by: 'Maria Delgado' },
    { incident_id: ids[1] || ids[0], category: 'personnel', description: 'Callback pay — 2 members, 4 hours', amount: 640, entered_by: 'Sarah Chen' },
    { incident_id: ids[1] || ids[0], category: 'apparatus', description: 'Rescue 1 fuel + mileage', amount: 95, entered_by: 'Sarah Chen' },
    { incident_id: ids[2] || ids[0], category: 'supplies', description: 'Medical supplies used — BLS kit restock', amount: 125, entered_by: 'Nathan McGee' },
    { incident_id: ids[2] || ids[0], category: 'hazmat', description: 'Absorbent material — 4 bags for fuel spill', amount: 220, entered_by: 'Maria Delgado' },
  ];
  for (const c of COSTS) {
    await db.query(
      `INSERT INTO incident_costs (station_id, incident_id, category, description, amount, entered_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [1, c.incident_id, c.category, c.description, c.amount, c.entered_by]
    );
  }
  console.log(`Incident costs seed: inserted ${COSTS.length} cost entries.`);
};
