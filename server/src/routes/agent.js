'use strict';
/**
 * routes/agent.js — department-local fire-verb HTTP surface.
 *
 *   GET  /api/agent/verbs                 — catalog (any authed user)
 *   POST /api/agent/invoke                — run or queue a verb (JWT/roles)
 *   GET  /api/agent/approvals             — list queue (officer+)
 *   POST /api/agent/approvals/:id/accept  — execute a gated verb (officer+)
 *   POST /api/agent/approvals/:id/reject  — dismiss a gated verb (officer+)
 *
 * Mounted behind requireAuth. The MCP stdio process is a thin client of
 * POST /invoke. The Dashboard panel uses the approvals routes.
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validateReq = require('../middleware/validate');
const { requireOfficer } = require('../middleware/requireRole');
const { catalog } = require('../utils/agentVerbRegistry');
const { invoke, listApprovals, resolveApproval } = require('../utils/agentInvoke');

router.get('/verbs', (req, res) => {
  res.json({ data: catalog(), count: catalog().length });
});

router.post('/invoke', async (req, res) => {
  try {
    const verb = req.body && req.body.verb;
    const args = (req.body && req.body.args) || {};
    if (!verb || typeof verb !== 'string') {
      return res.status(400).json({ error: 'verb is required', code: 'INVALID_ARGS' });
    }
    const out = await invoke(req, verb, args);
    if (!out.ok && !out.queued) {
      return res.status(out.status || 400).json({
        error: out.error,
        code: out.code,
        droppedKeys: out.droppedKeys,
        available: out.available,
        result: out.result,
      });
    }
    res.status(out.status).json({
      queued: !!out.queued,
      approval: out.approval || null,
      result: out.result,
      droppedKeys: out.droppedKeys || [],
    });
  } catch (err) {
    console.error('POST /agent/invoke error:', err);
    res.status(500).json({ error: 'Failed to invoke verb' });
  }
});

router.get('/approvals', requireOfficer, async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = await listApprovals(req.user.department_id, status);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    console.error('GET /agent/approvals error:', err);
    res.status(500).json({ error: 'Failed to list approvals' });
  }
});

const idParam = z.object({ id: z.string().regex(/^\d+$/, 'numeric id') });

router.post('/approvals/:id/accept', requireOfficer, validateReq({ params: idParam }), async (req, res) => {
  try {
    const out = await resolveApproval(req, Number(req.params.id), 'approved', req.body && req.body.note);
    if (!out.ok) {
      return res.status(out.status).json({ error: out.error, code: out.code, result: out.result });
    }
    res.json({ data: out.approval, result: out.result });
  } catch (err) {
    console.error('POST /agent/approvals/:id/accept error:', err);
    res.status(500).json({ error: 'Failed to accept approval' });
  }
});

router.post('/approvals/:id/reject', requireOfficer, validateReq({ params: idParam }), async (req, res) => {
  try {
    const out = await resolveApproval(req, Number(req.params.id), 'rejected', req.body && req.body.note);
    if (!out.ok) {
      return res.status(out.status).json({ error: out.error, code: out.code });
    }
    res.json({ data: out.approval });
  } catch (err) {
    console.error('POST /agent/approvals/:id/reject error:', err);
    res.status(500).json({ error: 'Failed to reject approval' });
  }
});

module.exports = router;
