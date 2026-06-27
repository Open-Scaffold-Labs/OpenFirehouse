'use strict';
/**
 * routes/checklists.js — CRUD REST API for inspection checklists
 *
 * GET    /api/checklist-templates           — list all templates
 * POST   /api/checklist-templates           — create a new template
 * PATCH  /api/checklist-templates/:id       — update a template
 * DELETE /api/checklist-templates/:id       — delete a template
 * GET    /api/checklist-completions         — list all completions (optionally filtered by templateId)
 * POST   /api/checklist-completions         — create a new completion
 * DELETE /api/checklist-completions/:id     — delete a completion
 */

const express = require('express');
const router  = express.Router();
const { checklistTemplates: tplDb, checklistCompletions: cmpDb } = require('../db');

// ── Checklist Templates ──────────────────────────────────────────────────────

// GET /api/checklist-templates
router.get('/checklist-templates', async (req, res) => {
  try {
    const templates = await tplDb.all(req.user.department_id);
    res.json({ data: templates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST /api/checklist-templates
router.post('/checklist-templates', async (req, res) => {
  try {
    if (!req.body.name || String(req.body.name).trim() === '') {
      return res.status(400).json({ error: 'name is required' });
    }
    const template = await tplDb.create({
      name: req.body.name,
      apparatus: req.body.apparatus || '',
      frequency: req.body.frequency || 'Daily',
      estimatedMinutes: req.body.estimatedMinutes || 15,
      categories: req.body.categories || [],
    }, req.user.department_id);
    res.status(201).json({ data: template });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// PATCH /api/checklist-templates/:id
router.patch('/checklist-templates/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await tplDb.findById(id, req.user.department_id)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const updated = await tplDb.update(id, {
      name: req.body.name,
      apparatus: req.body.apparatus,
      frequency: req.body.frequency,
      estimatedMinutes: req.body.estimatedMinutes,
      categories: req.body.categories,
    }, req.user.department_id);
    res.json({ data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /api/checklist-templates/:id
router.delete('/checklist-templates/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await tplDb.findById(id, req.user.department_id)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    await tplDb.remove(id, req.user.department_id);
    res.json({ message: `Template ${id} deleted` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ── Checklist Completions ────────────────────────────────────────────────────

// GET /api/checklist-completions (with optional templateId filter)
router.get('/checklist-completions', async (req, res) => {
  try {
    const templateId = req.query.templateId ? Number(req.query.templateId) : null;
    const completions = await cmpDb.all(req.user.department_id, templateId);
    res.json({ data: completions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch completions' });
  }
});

// POST /api/checklist-completions
router.post('/checklist-completions', async (req, res) => {
  try {
    if (!req.body.completedDate || String(req.body.completedDate).trim() === '') {
      return res.status(400).json({ error: 'completedDate is required' });
    }
    const completion = await cmpDb.create({
      templateId: req.body.templateId,
      templateName: req.body.templateName || '',
      apparatus: req.body.apparatus || '',
      frequency: req.body.frequency || '',
      completedDate: req.body.completedDate,
      completedBy: req.body.completedBy || '',
      status: req.body.status || 'Pass',
      notes: req.body.notes || '',
      responses: req.body.responses || {},
    }, req.user.department_id);
    res.status(201).json({ data: completion });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create completion' });
  }
});

// DELETE /api/checklist-completions/:id
router.delete('/checklist-completions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await cmpDb.findById(id, req.user.department_id)) {
      return res.status(404).json({ error: 'Completion not found' });
    }
    await cmpDb.remove(id, req.user.department_id);
    res.json({ message: `Completion ${id} deleted` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete completion' });
  }
});

module.exports = router;
