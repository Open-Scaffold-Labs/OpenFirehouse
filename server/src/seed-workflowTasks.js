'use strict';
const db = require('./db');

// Rewritten 2026-07-16 to match the real workflow_tasks schema (0049 workflow
// engine): user_id / task_type / target_module / target_record_id / status /
// deadline / completed_at. The old seed wrote incident_id/assigned_to/priority/
// due_date/notes — none of which exist on the table — so it never inserted a row.
module.exports = async function seedWorkflowTasks() {
  const { rows } = await db.query('SELECT COUNT(*) as c FROM workflow_tasks WHERE station_id = 1');
  if (parseInt(rows[0].c) > 0) { console.log('Workflow tasks seed: already seeded.'); return; }
  console.log('Workflow tasks seed: inserting demo data...');

  const incidents = await db.query('SELECT id FROM incidents WHERE station_id = 1 ORDER BY id LIMIT 3');
  const incIds = incidents.rows.map(r => r.id);
  const members = await db.query('SELECT id, name FROM members WHERE station_id = 1');
  const idByName = {};
  for (const m of members.rows) idByName[m.name] = m.id;

  // status is 'active' (open) or 'completed' — the panel splits on status === 'active'.
  const TASKS = [
    { title: 'Complete after-action report',               task_type: 'after_action',       target_module: 'incidents',  target_record_id: incIds[0] || null,              status: 'active',    assigned_to: 'Maria Delgado',   deadline: '2026-03-20' },
    { title: 'Submit NFIRS report to state',               task_type: 'nfirs_report',       target_module: 'incidents',  target_record_id: incIds[0] || null,              status: 'active',    assigned_to: 'Sarah Chen',      deadline: '2026-03-22' },
    { title: 'Review and replace damaged hose',            task_type: 'apparatus_followup', target_module: 'incidents',  target_record_id: incIds[0] || null,              status: 'completed', assigned_to: 'Nathan McGee',    deadline: '2026-03-15' },
    { title: 'File incident cost report',                  task_type: 'incident_cost',      target_module: 'incidents',  target_record_id: incIds[1] || incIds[0] || null, status: 'active',    assigned_to: 'Sarah Chen',      deadline: '2026-03-25' },
    { title: 'Schedule CISD for involved members',         task_type: 'wellness',           target_module: 'incidents',  target_record_id: incIds[1] || incIds[0] || null, status: 'active',    assigned_to: 'Maria Delgado',   deadline: '2026-03-18' },
    { title: 'Update pre-plan for Valley View Apartments', task_type: 'pre_plan_update',    target_module: 'preplans',   target_record_id: null,                           status: 'active',    assigned_to: 'Nathan McGee',    deadline: '2026-03-30' },
    { title: 'Prepare ISO audit documentation',            task_type: 'compliance',         target_module: 'compliance', target_record_id: null,                           status: 'active',    assigned_to: 'Sarah Chen',      deadline: '2026-06-01' },
    { title: 'Annual SCBA flow test scheduling',           task_type: 'equipment',          target_module: 'scba',       target_record_id: null,                           status: 'active',    assigned_to: 'Mike Harrington', deadline: '2026-04-15' },
  ];

  let count = 0;
  for (const t of TASKS) {
    await db.query(
      `INSERT INTO workflow_tasks
         (station_id, user_id, title, task_type, target_module, target_record_id, status, deadline, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        1,
        idByName[t.assigned_to] || null,
        t.title,
        t.task_type,
        t.target_module,
        t.target_record_id,
        t.status,
        t.deadline ? t.deadline + 'T12:00:00Z' : null,
        t.status === 'completed' ? new Date().toISOString() : null,
      ]
    );
    count++;
  }
  console.log(`Workflow tasks seed: inserted ${count} tasks.`);
};
