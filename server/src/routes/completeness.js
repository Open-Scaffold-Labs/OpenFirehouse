'use strict';
/**
 * routes/completeness.js — Completeness checking API
 *
 * GET /api/completeness/incident/:id      — Check incident report completeness
 * GET /api/completeness/after-action/:id  — Check after-action report completeness
 * GET /api/completeness/package/:id       — Check full incident package completeness (Phase 5)
 * GET /api/completeness/types             — List available document types
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { checkCompleteness, documentTypes } = require('../utils/completenessEngine');
const { checkPackageCompleteness, packages } = require('../utils/documentPackage');

// GET /api/completeness/types — list available document types
router.get('/types', (req, res) => {
  const types = Object.entries(documentTypes).map(([key, val]) => ({
    key,
    label: val.label,
    description: val.description,
    checkCount: val.checks.length,
    requiredCount: val.checks.filter(c => c.required).length,
  }));
  res.json({ data: types });
});

// GET /api/completeness/package/:id — full incident package completeness (Phase 5)
router.get('/package/:id', async (req, res) => {
  try {
    const incidentId = Number(req.params.id);
    const stationId = req.user.department_id;
    const result = await checkPackageCompleteness('incident_package', incidentId, stationId);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json({ data: result });
  } catch (err) {
    console.error('Package completeness check error:', err);
    res.status(500).json({ error: 'Package completeness check failed' });
  }
});

// GET /api/completeness/packages — list available package types
router.get('/packages', (req, res) => {
  const pkgs = Object.entries(packages).map(([key, val]) => ({
    key,
    label: val.label,
    description: val.description,
    documentCount: val.documents.length,
  }));
  res.json({ data: pkgs });
});

// GET /api/completeness/incident/:id
router.get('/incident/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const stationId = req.user.department_id;

    const { rows } = await pool.query(
      'SELECT * FROM incidents WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL',
      [id, stationId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Incident not found' });

    const incident = rows[0];
    // Parse JSON string fields
    if (typeof incident.units === 'string') {
      try { incident.units = JSON.parse(incident.units); } catch { incident.units = []; }
    }
    if (typeof incident.personnel === 'string') {
      try { incident.personnel = JSON.parse(incident.personnel); } catch { incident.personnel = []; }
    }
    if (typeof incident.photos === 'string') {
      try { incident.photos = JSON.parse(incident.photos); } catch { incident.photos = []; }
    }

    const result = await checkCompleteness('incident_report', { incident, stationId });
    res.json({ data: result });
  } catch (err) {
    console.error('Completeness check error:', err);
    res.status(500).json({ error: 'Completeness check failed' });
  }
});

// GET /api/completeness/after-action/:id
router.get('/after-action/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const stationId = req.user.department_id;

    const { rows } = await pool.query(
      'SELECT * FROM after_action_reports WHERE id = $1 AND department_id = $2',
      [id, stationId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'After-action report not found' });

    const result = await checkCompleteness('after_action_report', { record: rows[0], stationId });
    res.json({ data: result });
  } catch (err) {
    console.error('Completeness check error:', err);
    res.status(500).json({ error: 'Completeness check failed' });
  }
});

module.exports = router;
