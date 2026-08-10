'use strict';
const db = require('./db');

// Rewritten 2026-07-16. `correspondence` is a PER-RECORD document log
// (module + record_id + entry_type + from_name/subject/body), consumed by
// CorrespondenceLog, which today renders on only two surfaces: Grievances
// (module 'grievances') and Personnel Actions (module 'personnel-actions').
// The old seed wrote an imaginary inbox (type/direction/from_email/category/
// status) with no host record and no renderer — it never inserted a row.
// This attaches document-trail entries to the seeded grievance and
// personnel-action records that actually exist at seed time.
module.exports = async function seedCorrespondence() {
  const { rows } = await db.query('SELECT COUNT(*) as c FROM correspondence WHERE station_id = 1');
  if (parseInt(rows[0].c) > 0) { console.log('Correspondence seed: already seeded.'); return; }
  console.log('Correspondence seed: inserting demo data...');

  const griev = (await db.query(
    'SELECT id, grievance_number FROM grievances WHERE station_id = 1 ORDER BY id'
  )).rows;
  const pas = (await db.query(
    'SELECT id, action_type FROM personnel_actions WHERE station_id = 1 ORDER BY id'
  )).rows;

  if (!griev.length && !pas.length) {
    console.log('Correspondence seed: no grievance/personnel-action host records found — skipping.');
    return;
  }

  const entries = [];

  // ── Grievance document trail (union ↔ management) ─────────────────────────
  if (griev[0]) {
    const g = griev[0];
    entries.push(
      { module: 'grievances', record_id: g.id, entry_type: 'email', date: '2026-02-19',
        from_name: 'IAFF Local 2087, Grievance Committee <grievance@iafflocal2087.org>',
        subject: `Step 2 grievance filing — ${g.grievance_number}`,
        body: 'Formal Step 2 submission per Article 14 of the CBA. The Union requests a hearing within the ten-day contractual window and reserves the right to advance to arbitration if the matter is not resolved.',
        entered_by: 'Diane Tolliver' },
      { module: 'grievances', record_id: g.id, entry_type: 'email', date: '2026-02-21',
        from_name: 'Chief Sarah Chen <chief@maplewoodvfd.org>',
        subject: `RE: Step 2 grievance — ${g.grievance_number}`,
        body: 'Acknowledging receipt. Management will schedule the Step 2 hearing for next Tuesday at 10:00. Please confirm which Union representatives will attend so we can reserve the appropriate room.',
        entered_by: 'Sarah Chen' },
    );
  }
  if (griev[1]) {
    const g = griev[1];
    entries.push(
      { module: 'grievances', record_id: g.id, entry_type: 'note', date: '2026-02-24',
        from_name: 'Maria Delgado',
        subject: 'Step 1 meeting summary',
        body: 'Met with the grievant and shop steward regarding the overtime bypass. Management to pull the callback log and respond in writing by end of week. Grievant amenable to resolution at Step 1 if the missed OT is credited.',
        entered_by: 'Maria Delgado' },
    );
  }

  // ── Personnel-action document trail (letters, acknowledgments) ────────────
  if (pas[0]) {
    const a = pas[0];
    entries.push(
      { module: 'personnel-actions', record_id: a.id, entry_type: 'email', date: '2026-01-16',
        from_name: 'Office of the Fire Chief',
        subject: 'Notice of personnel action — for your record',
        body: 'This confirms the personnel action recorded in your file. A copy has been placed in your permanent record per department policy. Please reply to acknowledge receipt, or contact the Chief with any questions.',
        entered_by: 'Sarah Chen' },
      { module: 'personnel-actions', record_id: a.id, entry_type: 'note', date: '2026-01-17',
        from_name: 'Maria Delgado',
        subject: 'Acknowledgment received',
        body: 'Member acknowledged the action in person and had no objections. Signed acknowledgment filed with HR.',
        entered_by: 'Maria Delgado' },
    );
  }
  if (pas[1]) {
    const a = pas[1];
    entries.push(
      { module: 'personnel-actions', record_id: a.id, entry_type: 'email', date: '2026-02-02',
        from_name: 'MN Board of Firefighter Training & Education <records@mbfte.state.mn.us>',
        subject: 'Certification on file — confirmation',
        body: 'This confirms the certification referenced in this personnel action has been verified against the state registry and is current. No further documentation is required at this time.',
        entered_by: 'Sarah Chen' },
    );
  }

  let count = 0;
  for (const e of entries) {
    await db.query(
      `INSERT INTO correspondence
         (station_id, module, record_id, entry_type, from_name, subject, body, entered_by, created_at)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8)`,
      [e.module, e.record_id, e.entry_type, e.from_name, e.subject, e.body, e.entered_by, e.date + 'T12:00:00Z']
    );
    count++;
  }
  console.log(`Correspondence seed: inserted ${count} entries across grievances and personnel actions.`);
};
