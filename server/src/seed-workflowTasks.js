'use strict';
const db = require('./db');
module.exports = async function seedWorkflowTasks() {
  const { rows } = await db.query('SELECT COUNT(*) as c FROM workflow_tasks WHERE station_id = 1');
  if (parseInt(rows[0].c) > 0) { console.log('Workflow tasks seed: already seeded.'); return; }
  console.log('Workflow tasks seed: inserting demo data...');
  const incidents = await db.query('SELECT id FROM incidents WHERE station_id = 1 ORDER BY id LIMIT 3');
  const incIds = incidents.rows.map(r => r.id);
  const TASKS = [
    { incident_id: incIds[0], title: 'Complete after-action report', status: 'in_progress', assigned_to: 'Maria Delgado', priority: 'high', due_date: '2026-03-20', notes: 'Draft started. Need input from Engine 1 crew.' },
    { incident_id: incIds[0], title: 'Submit NFIRS report to state', status: 'pending', assigned_to: 'Sarah Chen', priority: 'high', due_date: '2026-03-22', notes: 'Waiting on after-action completion.' },
    { incident_id: incIds[0], title: 'Review and replace damaged hose', status: 'completed', assigned_to: 'Nathan McGee', priority: 'medium', due_date: '2026-03-15', notes: 'Replacement ordered. PO #2026-0089.' },
    { incident_id: incIds[1] || incIds[0], title: 'File incident cost report', status: 'pending', assigned_to: 'Sarah Chen', priority: 'medium', due_date: '2026-03-25', notes: 'Awaiting fuel receipts from apparatus officer.' },
    { incident_id: incIds[1] || incIds[0], title: 'Schedule CISD for involved members', status: 'in_progress', assigned_to: 'Maria Delgado', priority: 'high', due_date: '2026-03-18', notes: 'Contacted county CISM team. Session TBD.' },
    { incident_id: null, title: 'Update pre-plan for Valley View Apartments', status: 'in_progress', assigned_to: 'Nathan McGee', priority: 'medium', due_date: '2026-03-30', notes: 'Building C re-keyed. Need to update Knox Box contents and access info.' },
    { incident_id: null, title: 'Prepare ISO audit documentation', status: 'pending', assigned_to: 'Sarah Chen', priority: 'high', due_date: '2026-06-01', notes: 'ISO review scheduled Q3 2026. Begin assembling binder.' },
    { incident_id: null, title: 'Annual SCBA flow test scheduling', status: 'pending', assigned_to: 'Mike Harrington', priority: 'medium', due_date: '2026-04-15', notes: 'Coordinate with Scott Safety for testing dates.' },
  ];
  for (const t of TASKS) {
    await db.query(
      `INSERT INTO workflow_tasks (station_id, incident_id, title, status, assigned_to, priority, due_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [1, t.incident_id, t.title, t.status, t.assigned_to, t.priority, t.due_date, t.notes]
    );
  }
  console.log(`Workflow tasks seed: inserted ${TASKS.length} tasks.`);
};
