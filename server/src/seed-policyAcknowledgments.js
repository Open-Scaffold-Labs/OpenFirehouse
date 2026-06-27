'use strict';
/**
 * seed-policyAcknowledgments.js — Populate policy_acknowledgments table.
 * Creates 5 department policies with acknowledgment tracking.
 */

const { pool } = require('./db');

module.exports = async function seedPolicyAcknowledgments() {
  const { rows } = await pool.query('SELECT COUNT(*) FROM policy_acknowledgments WHERE station_id = $1', [1]);
  if (parseInt(rows[0].count) > 0) {
    console.log('Policy acknowledgments seed: already seeded, skipping.');
    return;
  }

  const policies = [
    {
      title: 'Workplace Harassment Prevention Policy',
      category: 'HR',
      version: '2.1',
      effective_date: '2026-01-01',
      description: 'Updated workplace harassment and discrimination prevention policy per state requirements. All members must review and acknowledge by January 31, 2026.',
      created_by: 1, // Sarah Chen
      acknowledgments: JSON.stringify([
        { member_id: 1, name: 'Sarah Chen', acknowledged_at: '2026-01-05T08:30:00Z' },
        { member_id: 2, name: 'Maria Delgado', acknowledged_at: '2026-01-06T09:15:00Z' },
        { member_id: 3, name: 'Nathan McGee', acknowledged_at: '2026-01-06T10:00:00Z' },
        { member_id: 4, name: 'Sandra Kim', acknowledged_at: '2026-01-07T07:45:00Z' },
        { member_id: 5, name: 'James Ortega', acknowledged_at: '2026-01-08T14:20:00Z' },
        { member_id: 6, name: 'Tracy Benson', acknowledged_at: '2026-01-10T08:00:00Z' },
        { member_id: 7, name: 'Mike Harrington', acknowledged_at: '2026-01-12T11:30:00Z' },
        { member_id: 8, name: 'Lisa Fontaine', acknowledged_at: '2026-01-15T09:00:00Z' },
        { member_id: 11, name: 'Kevin Marsh', acknowledged_at: '2026-01-16T08:30:00Z' },
        { member_id: 12, name: 'Diane Tolliver', acknowledged_at: '2026-01-18T10:00:00Z' },
      ]),
      status: 'active',
    },
    {
      title: 'SCBA Air Management Procedure',
      category: 'Operations',
      version: '3.0',
      effective_date: '2025-11-15',
      description: 'Revised SCBA air management protocol adopting the "Rule of Air Management" (ROAM). Establishes mandatory low-air alarm exit procedures and two-in/two-out compliance checks.',
      created_by: 2, // Maria Delgado
      acknowledgments: JSON.stringify([
        { member_id: 1, name: 'Sarah Chen', acknowledged_at: '2025-11-16T08:00:00Z' },
        { member_id: 2, name: 'Maria Delgado', acknowledged_at: '2025-11-15T14:00:00Z' },
        { member_id: 3, name: 'Nathan McGee', acknowledged_at: '2025-11-17T09:30:00Z' },
        { member_id: 4, name: 'Sandra Kim', acknowledged_at: '2025-11-18T07:00:00Z' },
        { member_id: 5, name: 'James Ortega', acknowledged_at: '2025-11-18T07:15:00Z' },
        { member_id: 6, name: 'Tracy Benson', acknowledged_at: '2025-11-20T08:45:00Z' },
        { member_id: 7, name: 'Mike Harrington', acknowledged_at: '2025-11-22T10:00:00Z' },
        { member_id: 8, name: 'Lisa Fontaine', acknowledged_at: '2025-11-22T11:00:00Z' },
        { member_id: 9, name: 'Carlos Ruiz', acknowledged_at: '2025-11-25T14:00:00Z' },
        { member_id: 10, name: 'Amy Winters', acknowledged_at: '2025-11-26T09:00:00Z' },
        { member_id: 11, name: 'Kevin Marsh', acknowledged_at: '2025-11-28T08:30:00Z' },
        { member_id: 12, name: 'Diane Tolliver', acknowledged_at: '2025-12-01T10:00:00Z' },
      ]),
      status: 'active',
    },
    {
      title: 'Social Media and Public Communications Policy',
      category: 'Admin',
      version: '1.0',
      effective_date: '2026-02-01',
      description: 'New policy governing member use of social media and public statements regarding department activities. Includes guidelines on incident scene photography, HIPAA compliance, and official spokesperson designation.',
      created_by: 1,
      acknowledgments: JSON.stringify([
        { member_id: 1, name: 'Sarah Chen', acknowledged_at: '2026-02-02T08:00:00Z' },
        { member_id: 2, name: 'Maria Delgado', acknowledged_at: '2026-02-03T09:00:00Z' },
        { member_id: 3, name: 'Nathan McGee', acknowledged_at: '2026-02-05T10:30:00Z' },
        { member_id: 5, name: 'James Ortega', acknowledged_at: '2026-02-08T14:00:00Z' },
        { member_id: 6, name: 'Tracy Benson', acknowledged_at: '2026-02-10T08:00:00Z' },
      ]),
      status: 'active',
    },
    {
      title: 'Controlled Substance Administration Protocol',
      category: 'EMS',
      version: '4.2',
      effective_date: '2025-09-01',
      description: 'Updated controlled substance administration, storage, and documentation protocol per state EMS board directive. Mandatory for all paramedic-certified members.',
      created_by: 2,
      acknowledgments: JSON.stringify([
        { member_id: 2, name: 'Maria Delgado', acknowledged_at: '2025-09-02T08:00:00Z' },
        { member_id: 8, name: 'Lisa Fontaine', acknowledged_at: '2025-09-03T09:30:00Z' },
        { member_id: 12, name: 'Diane Tolliver', acknowledged_at: '2025-09-05T10:00:00Z' },
      ]),
      status: 'active',
    },
    {
      title: 'Vehicle Pursuit and Emergency Response Driving',
      category: 'Operations',
      version: '2.0',
      effective_date: '2025-06-15',
      description: 'Revised emergency vehicle operations policy. Covers intersection clearing procedures, speed limits during responses, backing protocols, and post-accident reporting requirements.',
      created_by: 1,
      acknowledgments: JSON.stringify([
        { member_id: 1, name: 'Sarah Chen', acknowledged_at: '2025-06-16T08:00:00Z' },
        { member_id: 2, name: 'Maria Delgado', acknowledged_at: '2025-06-16T08:15:00Z' },
        { member_id: 3, name: 'Nathan McGee', acknowledged_at: '2025-06-17T09:00:00Z' },
        { member_id: 4, name: 'Sandra Kim', acknowledged_at: '2025-06-17T09:30:00Z' },
        { member_id: 5, name: 'James Ortega', acknowledged_at: '2025-06-18T10:00:00Z' },
        { member_id: 6, name: 'Tracy Benson', acknowledged_at: '2025-06-18T10:30:00Z' },
        { member_id: 7, name: 'Mike Harrington', acknowledged_at: '2025-06-20T08:00:00Z' },
        { member_id: 8, name: 'Lisa Fontaine', acknowledged_at: '2025-06-22T09:00:00Z' },
        { member_id: 9, name: 'Carlos Ruiz', acknowledged_at: '2025-06-25T14:00:00Z' },
        { member_id: 10, name: 'Amy Winters', acknowledged_at: '2025-06-28T08:30:00Z' },
        { member_id: 11, name: 'Kevin Marsh', acknowledged_at: '2025-06-30T10:00:00Z' },
        { member_id: 12, name: 'Diane Tolliver', acknowledged_at: '2025-07-01T08:00:00Z' },
      ]),
      status: 'active',
    },
    {
      title: 'Personal Protective Equipment Requirements',
      category: 'Safety',
      version: '3.1',
      effective_date: '2026-01-15',
      description: 'Updated PPE requirements for all operational activities. Specifies gear requirements by activity type, inspection procedures, and replacement protocols.',
      created_by: 1,
      acknowledgments: JSON.stringify([
        { member_id: 1, name: 'Sarah Chen', acknowledged_at: '2026-01-16T08:00:00Z' },
        { member_id: 2, name: 'Maria Delgado', acknowledged_at: '2026-01-17T09:00:00Z' },
        { member_id: 3, name: 'Nathan McGee', acknowledged_at: '2026-01-17T10:00:00Z' },
        { member_id: 4, name: 'Sandra Kim', acknowledged_at: '2026-01-18T07:30:00Z' },
        { member_id: 5, name: 'James Ortega', acknowledged_at: '2026-01-20T08:00:00Z' },
        { member_id: 6, name: 'Tracy Benson', acknowledged_at: '2026-01-20T14:00:00Z' },
        { member_id: 7, name: 'Mike Harrington', acknowledged_at: '2026-01-22T09:00:00Z' },
        { member_id: 8, name: 'Lisa Fontaine', acknowledged_at: '2026-01-23T10:00:00Z' },
        { member_id: 9, name: 'Carlos Ruiz', acknowledged_at: '2026-01-25T14:00:00Z' },
        { member_id: 10, name: 'Amy Winters', acknowledged_at: '2026-01-27T08:30:00Z' },
        { member_id: 11, name: 'Kevin Marsh', acknowledged_at: '2026-01-28T09:00:00Z' },
        { member_id: 12, name: 'Diane Tolliver', acknowledged_at: '2026-01-30T10:00:00Z' },
      ]),
      status: 'active',
    },
    {
      title: 'Drug-Free Workplace Policy',
      category: 'HR',
      version: '1.0',
      effective_date: '2026-02-01',
      description: 'Drug and alcohol-free workplace policy per federal DOT and NFPA standards. Includes testing protocols, treatment resources, and consequence procedures.',
      created_by: 1,
      acknowledgments: JSON.stringify([
        { member_id: 1, name: 'Sarah Chen', acknowledged_at: '2026-02-02T08:00:00Z' },
        { member_id: 2, name: 'Maria Delgado', acknowledged_at: '2026-02-03T09:00:00Z' },
        { member_id: 3, name: 'Nathan McGee', acknowledged_at: '2026-02-04T10:00:00Z' },
        { member_id: 4, name: 'Sandra Kim', acknowledged_at: '2026-02-05T07:30:00Z' },
        { member_id: 5, name: 'James Ortega', acknowledged_at: '2026-02-06T08:00:00Z' },
        { member_id: 6, name: 'Tracy Benson', acknowledged_at: '2026-02-08T14:00:00Z' },
        { member_id: 7, name: 'Mike Harrington', acknowledged_at: '2026-02-09T09:00:00Z' },
        { member_id: 8, name: 'Lisa Fontaine', acknowledged_at: '2026-02-10T10:00:00Z' },
        { member_id: 9, name: 'Carlos Ruiz', acknowledged_at: '2026-02-12T14:00:00Z' },
        { member_id: 10, name: 'Amy Winters', acknowledged_at: '2026-02-14T08:30:00Z' },
        { member_id: 11, name: 'Kevin Marsh', acknowledged_at: '2026-02-16T09:00:00Z' },
        { member_id: 12, name: 'Diane Tolliver', acknowledged_at: '2026-02-17T10:00:00Z' },
      ]),
      status: 'active',
    },
    {
      title: 'HIPAA Privacy and Confidentiality',
      category: 'Compliance',
      version: '2.0',
      effective_date: '2025-10-01',
      description: 'Health Information Portability and Accountability Act compliance training. Covers patient information protection, breach notification, and legal requirements.',
      created_by: 2,
      acknowledgments: JSON.stringify([
        { member_id: 1, name: 'Sarah Chen', acknowledged_at: '2025-10-02T08:00:00Z' },
        { member_id: 2, name: 'Maria Delgado', acknowledged_at: '2025-10-03T09:00:00Z' },
        { member_id: 3, name: 'Nathan McGee', acknowledged_at: '2025-10-04T10:00:00Z' },
        { member_id: 4, name: 'Sandra Kim', acknowledged_at: '2025-10-05T07:30:00Z' },
        { member_id: 5, name: 'James Ortega', acknowledged_at: '2025-10-06T08:00:00Z' },
        { member_id: 8, name: 'Lisa Fontaine', acknowledged_at: '2025-10-07T10:00:00Z' },
        { member_id: 6, name: 'Tracy Benson', acknowledged_at: '2025-10-08T14:00:00Z' },
        { member_id: 12, name: 'Diane Tolliver', acknowledged_at: '2025-10-09T10:00:00Z' },
      ]),
      status: 'active',
    },
    {
      title: 'Workplace Violence Prevention',
      category: 'Safety',
      version: '1.0',
      effective_date: '2026-03-01',
      description: 'Policy addressing recognition, prevention, and response to workplace violence. Includes de-escalation techniques and incident reporting procedures.',
      created_by: 1,
      acknowledgments: JSON.stringify([
        { member_id: 1, name: 'Sarah Chen', acknowledged_at: '2026-03-02T08:00:00Z' },
        { member_id: 2, name: 'Maria Delgado', acknowledged_at: '2026-03-03T09:00:00Z' },
        { member_id: 3, name: 'Nathan McGee', acknowledged_at: '2026-03-04T10:00:00Z' },
        { member_id: 4, name: 'Sandra Kim', acknowledged_at: '2026-03-05T07:30:00Z' },
      ]),
      status: 'active',
    },
  ];

  let inserted = 0;
  for (const p of policies) {
    await pool.query(
      `INSERT INTO policy_acknowledgments (station_id, title, category, version, effective_date, description, created_by, acknowledgments, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) ON CONFLICT DO NOTHING`,
      [1, p.title, p.category, p.version, p.effective_date, p.description, p.created_by, p.acknowledgments, p.status]
    );
    inserted++;
  }

  console.log(`Policy acknowledgments seed complete: ${inserted} inserted.`);
};
