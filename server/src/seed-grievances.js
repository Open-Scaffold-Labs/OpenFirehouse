'use strict';
/**
 * seed-grievances.js — Populate grievances table with sample data.
 * Covers multiple grievance types, steps, and statuses.
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedGrievances() {
  const result = await pool.query('SELECT COUNT(*) FROM grievances WHERE station_id = $1', [1]);
  if (result.rows[0].count > 0) {
    console.log('Grievances seed: already seeded, skipping.');
    return;
  }

  // Dynamic member lookup
  const { rows: members } = await pool.query('SELECT id, name FROM members WHERE station_id = 1 ORDER BY id');
  if (members.length === 0) { console.log('Grievances seed: no members found, skipping.'); return; }
  const m = (name) => { const found = members.find(r => r.name === name); return found ? found.id : null; };

  const records = [
    {
      station_id: 1,
      grievance_number: 'GRV-2026-001',
      filed_by: m('James Ortega'),
      filed_date: '2026-01-10',
      cba_article: 'Article 12 — Work Schedules',
      subject: 'Denied Shift Swap Request',
      description: 'Grievant requested a shift swap with a qualified member for the January 18 duty shift. Request was denied without explanation despite meeting all contractual requirements under Article 12, Section 3.',
      grievance_type: 'scheduling',
      current_step: 'step_3',
      status: 'open',
      resolution: '',
      resolved_date: null,
      assigned_to: 'Sarah Chen',
      union_rep: 'Mike Harrington',
      management_rep: 'Sarah Chen',
      notes: 'Escalated to department head after informal and written steps did not resolve.',
      timeline: JSON.stringify([
        { date: '2026-01-10', action: 'Grievance filed (Step 1 — Verbal)', by: 'James Ortega' },
        { date: '2026-01-15', action: 'Step 1 meeting held. Not resolved.', by: 'Mike Harrington' },
        { date: '2026-01-20', action: 'Advanced to Step 2 — Written Grievance', by: 'Mike Harrington' },
        { date: '2026-02-01', action: 'Written response received. Not satisfactory.', by: 'Sarah Chen' },
        { date: '2026-02-05', action: 'Advanced to Step 3 — Department Head Review', by: 'Mike Harrington' },
      ]),
    },
    {
      station_id: 1,
      grievance_number: 'GRV-2026-002',
      filed_by: m('Lisa Fontaine'),
      filed_date: '2026-01-22',
      cba_article: 'Article 7 — Safety Equipment',
      subject: 'Defective PPE Not Replaced in Timely Manner',
      description: 'Grievant reported a damaged SCBA facepiece on January 8. Replacement was not provided for 14 days, exceeding the 48-hour replacement standard in Article 7, Section 5. Member was assigned to interior attack duties during this period with borrowed equipment.',
      grievance_type: 'safety',
      current_step: 'step_2',
      status: 'open',
      resolution: '',
      resolved_date: null,
      assigned_to: 'Maria Delgado',
      union_rep: 'Mike Harrington',
      management_rep: 'Maria Delgado',
      notes: 'Supply chain delay cited by management. Union argues contractual obligation regardless.',
      timeline: JSON.stringify([
        { date: '2026-01-22', action: 'Grievance filed (Step 1 — Verbal)', by: 'Carlos Ruiz' },
        { date: '2026-01-25', action: 'Step 1 meeting held. Management acknowledged delay.', by: 'Mike Harrington' },
        { date: '2026-02-01', action: 'Advanced to Step 2 — Written Grievance', by: 'Mike Harrington' },
      ]),
    },
    {
      station_id: 1,
      grievance_number: 'GRV-2025-014',
      filed_by: m('Tracy Benson'),
      filed_date: '2025-10-05',
      cba_article: 'Article 15 — Overtime Distribution',
      subject: 'Inequitable Overtime Assignment',
      description: 'Grievant was passed over for three consecutive overtime opportunities in September despite being next on the equalization list. Overtime was assigned to junior members, violating Article 15 seniority provisions.',
      grievance_type: 'overtime',
      current_step: 'step_1',
      status: 'resolved',
      resolution: 'Management agreed overtime equalization list was not properly maintained. Grievant awarded 12 hours compensatory time. OT equalization procedures updated and re-distributed to all officers.',
      resolved_date: '2025-11-15',
      assigned_to: 'Sarah Chen',
      union_rep: 'Mike Harrington',
      management_rep: 'Sarah Chen',
      notes: 'Resolved at Step 1 with corrective action.',
      timeline: JSON.stringify([
        { date: '2025-10-05', action: 'Grievance filed (Step 1 — Verbal)', by: 'Tracy Benson' },
        { date: '2025-10-10', action: 'Step 1 meeting held.', by: 'Mike Harrington' },
        { date: '2025-11-15', action: 'Grievance resolved — compensatory time awarded.', by: 'Sarah Chen' },
      ]),
    },
    {
      station_id: 1,
      grievance_number: 'GRV-2025-012',
      filed_by: m('Nathan McGee'),
      filed_date: '2025-08-18',
      cba_article: 'Article 9 — Training Opportunities',
      subject: 'Denied Access to Officer Development Course',
      description: 'Grievant applied for the County Fire Officer Development Program. Application was not forwarded by department despite meeting all eligibility criteria. A less-senior member was nominated instead without transparent selection process.',
      grievance_type: 'training',
      current_step: 'step_4',
      status: 'resolved',
      resolution: 'Arbitrator ruled in favor of grievant. Department required to implement transparent selection process for external training opportunities. Grievant enrolled in next available course cycle at department expense.',
      resolved_date: '2025-12-20',
      assigned_to: 'Sarah Chen',
      union_rep: 'Mike Harrington',
      management_rep: 'Sarah Chen',
      notes: 'Went to arbitration. Precedent-setting for training selection process.',
      timeline: JSON.stringify([
        { date: '2025-08-18', action: 'Grievance filed (Step 1)', by: 'Nathan McGee' },
        { date: '2025-08-25', action: 'Step 1 — not resolved', by: 'Mike Harrington' },
        { date: '2025-09-05', action: 'Advanced to Step 2', by: 'Mike Harrington' },
        { date: '2025-09-20', action: 'Step 2 — written response unsatisfactory', by: 'Sarah Chen' },
        { date: '2025-10-01', action: 'Advanced to Step 3', by: 'Mike Harrington' },
        { date: '2025-10-15', action: 'Step 3 — department head upheld decision', by: 'Sarah Chen' },
        { date: '2025-10-20', action: 'Advanced to Step 4 — Arbitration', by: 'Mike Harrington' },
        { date: '2025-12-20', action: 'Arbitration ruling in favor of grievant', by: 'Arbitrator J. Williams' },
      ]),
    },
    {
      station_id: 1,
      grievance_number: 'GRV-2026-003',
      filed_by: m('Mike Harrington'),
      filed_date: '2026-02-14',
      cba_article: 'Article 5 — Working Conditions',
      subject: 'Inadequate Station Heating System',
      description: 'Bunk room heating system has been intermittently failing since December, with overnight temperatures dropping below 55°F on multiple occasions. Temporary space heaters provided are insufficient and present a fire hazard per SOG 400.03.',
      grievance_type: 'working_conditions',
      current_step: 'step_1',
      status: 'open',
      resolution: '',
      resolved_date: null,
      assigned_to: 'Sandra Kim',
      union_rep: 'Nathan McGee',
      management_rep: 'Sandra Kim',
      notes: 'HVAC contractor scheduled for assessment. Temporary accommodations under discussion.',
      timeline: JSON.stringify([
        { date: '2026-02-14', action: 'Grievance filed (Step 1 — Verbal)', by: 'Mike Harrington' },
        { date: '2026-02-18', action: 'Step 1 meeting scheduled for Feb 22', by: 'Nathan McGee' },
      ]),
    },
    {
      station_id: 1,
      grievance_number: 'GRV-2025-010',
      filed_by: m('Sandra Kim'),
      filed_date: '2025-07-01',
      cba_article: 'Article 11 — Discipline',
      subject: 'Unjust Written Reprimand',
      description: 'Grievant received a written reprimand for alleged failure to follow apparatus checkout procedures. Grievant maintains checkout was completed per SOG but checklist was misplaced by shift officer. No progressive discipline steps were followed.',
      grievance_type: 'discipline_dispute',
      current_step: 'step_2',
      status: 'resolved',
      resolution: 'Written reprimand removed from member file. Department agreed that documentation was insufficient to support the discipline. Checkout procedure updated to include digital backup.',
      resolved_date: '2025-08-10',
      assigned_to: 'Sarah Chen',
      union_rep: 'Mike Harrington',
      management_rep: 'Maria Delgado',
      notes: 'Resolved at Step 2. Good outcome — led to procedural improvement.',
      timeline: JSON.stringify([
        { date: '2025-07-01', action: 'Grievance filed (Step 1)', by: 'Sandra Kim' },
        { date: '2025-07-08', action: 'Step 1 — management maintained reprimand', by: 'Mike Harrington' },
        { date: '2025-07-15', action: 'Advanced to Step 2', by: 'Mike Harrington' },
        { date: '2025-08-10', action: 'Resolved — reprimand removed', by: 'Maria Delgado' },
      ]),
    },
  ];

  let inserted = 0;
  for (const rec of records) {
    if (!rec.filed_by) { console.warn(`  ⚠️  Skipping grievance ${rec.grievance_number}: filed_by member not found`); continue; }
    await pool.query(
      `INSERT INTO grievances (station_id, grievance_number, filed_by, filed_date, cba_article, subject, description, grievance_type, current_step, status, resolution, resolved_date, assigned_to, union_rep, management_rep, notes, timeline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [
        rec.station_id, rec.grievance_number, rec.filed_by, rec.filed_date, rec.cba_article,
        rec.subject, rec.description, rec.grievance_type, rec.current_step, rec.status,
        rec.resolution, rec.resolved_date, rec.assigned_to, rec.union_rep, rec.management_rep,
        rec.notes, rec.timeline,
      ]
    );
    inserted++;
  }

  console.log(`Grievances seed complete: ${inserted} inserted.`);
};
