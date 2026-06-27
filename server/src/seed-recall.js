'use strict';
/**
 * seed-recall.js — Demo recall events and member responses.
 * Shows the full recall lifecycle: one closed recall from last month
 * and one recently closed recall so the feature has visible history.
 *
 * Idempotent: skips if recall_events already has data.
 */

const { pool } = require('./db');

module.exports = async function seedRecall() {
  const { rows: check } = await pool.query(
    'SELECT COUNT(*) as c FROM recall_events WHERE station_id = 1'
  );
  if (parseInt(check[0].c) > 0) {
    console.log('Recall seed: already seeded, skipping.');
    return;
  }

  // ── Get member IDs ──────────────────────────────────────────────────────────
  const { rows: members } = await pool.query(
    `SELECT id, name FROM members WHERE station_id = 1 ORDER BY id`
  );
  if (members.length === 0) {
    console.log('Recall seed: no members found, skipping.');
    return;
  }

  const mid = (name) => members.find(m => m.name === name)?.id || null;

  // ── Event 1: Major structure fire recall — closed (last month) ────────────
  const { rows: [evt1] } = await pool.query(
    `INSERT INTO recall_events (station_id, level, incident_type, location, message, issued_by, status, created_at, closed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      1,
      'full',
      'Structure Fire — 3rd Alarm',
      '847 Oak Street, Maplewood',
      'All off-duty personnel report to Station 14 immediately. Major structure fire at 847 Oak Street. 3rd alarm declared. Report in full gear. Mutual aid requested from Millburn and Livingston.',
      'Sarah Chen',
      'closed',
      new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString(), // 32 days ago
      new Date(Date.now() - 32 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(), // 3 hours later
    ]
  );

  // Responses for event 1
  const r1Members = [
    { name: 'Maria Delgado',   response: 'Responding', eta: '10 min' },
    { name: 'Nathan McGee',    response: 'Responding', eta: '15 min' },
    { name: 'Sandra Kim',      response: 'Responding', eta: '12 min' },
    { name: 'James Ortega',    response: 'Responding', eta: '20 min' },
    { name: 'Tracy Benson',    response: 'Responding', eta: '18 min' },
    { name: 'Mike Harrington', response: 'Responding', eta: '25 min' },
    { name: 'Lisa Fontaine',   response: 'Responding', eta: '14 min' },
    { name: 'Kevin Marsh',     response: 'Responding', eta: '22 min' },
    { name: 'Diane Tolliver',  response: 'Responding', eta: '30 min' },
    { name: 'Carlos Ruiz',     response: 'Not Available', eta: '' },
    { name: 'Amy Winters',     response: 'Not Available', eta: '' },
  ];

  for (const r of r1Members) {
    const memberId = mid(r.name);
    if (!memberId) continue;
    await pool.query(
      `INSERT INTO recall_responses (recall_id, member_id, member_name, response, eta, responded_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (recall_id, member_id) DO NOTHING`,
      [
        evt1.id,
        memberId,
        r.name,
        r.response,
        r.eta,
        new Date(Date.now() - 32 * 24 * 60 * 60 * 1000 + Math.floor(Math.random() * 20 + 5) * 60 * 1000).toISOString(),
      ]
    );
  }

  // ── Event 2: Standby recall — closed (2 weeks ago) ────────────────────────
  const { rows: [evt2] } = await pool.query(
    `INSERT INTO recall_events (station_id, level, incident_type, location, message, issued_by, status, created_at, closed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      1,
      'standby',
      'Winter Storm Operations',
      'Station 14 — All Coverage Areas',
      'Standby alert — all available off-duty personnel report to station for winter storm operations. Road conditions are deteriorating. Plan for extended 12-hour shifts.',
      'Maria Delgado',
      'closed',
      new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() - 14 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000).toISOString(),
    ]
  );

  const r2Members = [
    { name: 'Nathan McGee',    response: 'Responding', eta: '20 min' },
    { name: 'Sandra Kim',      response: 'Responding', eta: '25 min' },
    { name: 'James Ortega',    response: 'Not Available', eta: '' },
    { name: 'Tracy Benson',    response: 'Responding', eta: '35 min' },
    { name: 'Mike Harrington', response: 'Responding', eta: '15 min' },
    { name: 'Kevin Marsh',     response: 'Responding', eta: '30 min' },
    { name: 'Carlos Ruiz',     response: 'Responding', eta: '10 min' },
    { name: 'Amy Winters',     response: 'Responding', eta: '45 min' },
  ];

  for (const r of r2Members) {
    const memberId = mid(r.name);
    if (!memberId) continue;
    await pool.query(
      `INSERT INTO recall_responses (recall_id, member_id, member_name, response, eta, responded_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (recall_id, member_id) DO NOTHING`,
      [
        evt2.id,
        memberId,
        r.name,
        r.response,
        r.eta,
        new Date(Date.now() - 14 * 24 * 60 * 60 * 1000 + Math.floor(Math.random() * 25 + 8) * 60 * 1000).toISOString(),
      ]
    );
  }

  console.log(`Recall seed complete: 2 recall events with responses inserted.`);
};
