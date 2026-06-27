'use strict';
/**
 * seed-deptDocuments.js — Populate dept_documents table.
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedDeptDocuments() {
  const result = await pool.query('SELECT COUNT(*) FROM dept_documents WHERE station_id = $1', [1]);
  if (result.rows[0].count > 0) {
    console.log('Department documents seed: already seeded, skipping.');
    return;
  }

  const records = [
    {
      station_id: 1,
      title: 'Station 14 SOG Manual',
      category: 'operations',
      doc_type: 'sog',
      description: 'Complete collection of Standard Operating Guidelines for Station 14. Covers ICS, structural firefighting, apparatus operations, hazmat response, and personnel safety.',
      version: '2025.1',
      effective_date: '2025-01-01',
      review_date: '2026-01-01',
      file_ref: 'SOG-Manual-2025.pdf',
      content: '',
      tags: JSON.stringify(['SOG', 'Operations', 'Standards']),
      uploaded_by: 'Chief Sarah Chen',
      status: 'active',
      access_level: 'all',
    },
    {
      station_id: 1,
      title: 'Member Handbook',
      category: 'administrative',
      doc_type: 'manual',
      description: 'Membership requirements, expectations, training obligations, benefits information, and disciplinary procedures. Updated annually.',
      version: '2026.0',
      effective_date: '2026-01-01',
      review_date: '2026-12-31',
      file_ref: 'Member-Handbook-2026.pdf',
      content: '',
      tags: JSON.stringify(['Handbook', 'Membership', 'Benefits']),
      uploaded_by: 'Chief Sarah Chen',
      status: 'active',
      access_level: 'all',
    },
    {
      station_id: 1,
      title: 'Budget and Financial Report 2025',
      category: 'administrative',
      doc_type: 'report',
      description: 'Annual budget allocation, equipment purchases, maintenance costs, and financial summary for fiscal year 2025. Board-approved.',
      version: '2025-final',
      effective_date: '2025-01-01',
      review_date: '2025-12-31',
      file_ref: 'Budget-2025.pdf',
      content: '',
      tags: JSON.stringify(['Budget', 'Finance', 'Annual']),
      uploaded_by: 'Treasurer Richard Perez',
      status: 'archived',
      access_level: 'officers',
    },
    {
      station_id: 1,
      title: 'Station Safety Policy and Procedures',
      category: 'safety',
      doc_type: 'policy',
      description: 'Comprehensive safety policies covering station operations, apparatus safety, hazard identification, PPE requirements, and incident reporting. OSHA-aligned.',
      version: '2025.2',
      effective_date: '2025-06-01',
      review_date: '2026-06-01',
      file_ref: 'Safety-Policy-2025.pdf',
      content: '',
      tags: JSON.stringify(['Safety', 'OSHA', 'Policy']),
      uploaded_by: 'Safety Officer Terrence Brooks',
      status: 'active',
      access_level: 'all',
    },
  ];

  let inserted = 0;
  for (const rec of records) {
    await pool.query(
      `INSERT INTO dept_documents (station_id, title, category, doc_type, description, version, effective_date, review_date, file_ref, content, tags, uploaded_by, status, access_level, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       ON CONFLICT DO NOTHING`,
      [
        rec.station_id, rec.title, rec.category, rec.doc_type, rec.description, rec.version,
        rec.effective_date, rec.review_date, rec.file_ref, rec.content, rec.tags,
        rec.uploaded_by, rec.status, rec.access_level,
      ]
    );
    inserted++;
  }

  console.log(`Department documents seed complete: ${inserted} inserted.`);
};
