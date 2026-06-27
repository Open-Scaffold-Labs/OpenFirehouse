'use strict';
/**
 * routes/incidents.js — CRUD REST API for incidents
 *
 * GET    /api/incidents          — list all incidents
 * GET    /api/incidents/:id      — get one incident
 * POST   /api/incidents          — create an incident
 * PATCH  /api/incidents/:id      — update incident fields
 * DELETE /api/incidents/:id      — delete an incident
 */

const express = require('express');
const router  = express.Router();

// 4.3 zod rollout: numeric :id fence (body validation is the local validate()
// below — named import avoided deliberately to prevent shadowing).
const { z } = require('zod');
const validateReq = require('../middleware/validate');
const idParam = z.object({ id: z.string().regex(/^\d+$/, 'numeric id') });

const { incidents: db, workflowTasks, pool, unitStatus } = require('../db');
const { audit } = require('../utils/auditLog');
const { broadcastToStation } = require('./push');
const aiActions = require('../utils/aiActionRegistry');
const { checkCompleteness } = require('../utils/completenessEngine');
const { dispatch: webhookDispatch } = require('../utils/webhookOrchestrator');

// ── Auto-create workflow task ────────────────────────────────────────────────
// Fire-and-forget: after creating an incident, automatically spawn a workflow
// task so the completeness engine starts tracking it immediately.
async function autoCreateWorkflowTask(incident, stationId, userId) {
  try {
    // Run initial completeness check
    const engineResult = await checkCompleteness('incident_report', { incident, stationId });
    const checklist = engineResult.checks.map(c => ({
      key: c.field,
      label: c.label,
      status: c.complete ? 'complete' : (c.required ? 'missing' : 'optional'),
      data: { value: c.value, detail: c.detail, aiAction: c.aiAction, canDraft: !!c.aiAction },
    }));

    await workflowTasks.create({
      user_id: userId || null,
      title: `Complete report: ${incident.incidentNumber}`,
      task_type: 'incident_report',
      target_module: 'incidents',
      target_record_id: incident.id,
      checklist,
      conversation: [{
        role: 'assistant',
        content: `Workflow auto-started for ${incident.incidentNumber} (${incident.type} at ${incident.address}). ${engineResult.complete} of ${engineResult.total} fields complete — score ${engineResult.score}%. I'll track progress as fields are filled in.`,
        timestamp: new Date().toISOString(),
      }],
    }, stationId);
  } catch (err) {
    console.error('Auto-create workflow task error:', err.message);
  }
}

// ── Auto-exposure check ─────────────────────────────────────────────────────
// Fire-and-forget: after saving an incident that could involve hazardous
// exposures, ask AI to assess whether exposure records should be created.
const EXPOSURE_TYPES = ['Structure Fire', 'Vehicle Fire', 'Hazmat', 'Gas Leak', 'Brush / Wildland Fire'];

async function checkAutoExposure(incident, stationId) {
  try {
    if (!EXPOSURE_TYPES.includes(incident.type)) return;
    const action = aiActions.auto_exposure;
    if (!action) return;
    const context = await action.buildContext({ data: incident, stationId });
    // We'd call the AI here in production; for now we store the intent
    // so the exposure tracking module can surface it to the user.
    try {
      await pool.query(
        `INSERT INTO exposure_queue (station_id, incident_id, incident_type, personnel, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT DO NOTHING`,
        [stationId, incident.id, incident.type, JSON.stringify(incident.personnel || []), 'pending']
      );
    } catch { /* exposure_queue table may not exist yet — that's fine */ }
  } catch (err) {
    console.error('Auto-exposure check failed (non-blocking):', err.message);
  }
}

const REQUIRED_FIELDS = ['incidentNumber', 'date', 'type'];

function validate(body, requireAll = true) {
  const errors = [];
  if (requireAll) {
    for (const f of REQUIRED_FIELDS) {
      if (!body[f] || String(body[f]).trim() === '') errors.push(`${f} is required`);
    }
  }
  if (body.injuries !== undefined) {
    const n = Number(body.injuries);
    if (isNaN(n) || n < 0) errors.push('injuries must be a non-negative number');
  }
  return errors;
}

function coerce(data) {
  const out = { ...data };
  if (out.injuries !== undefined) out.injuries = parseInt(out.injuries, 10) || 0;
  return out;
}

// GET /api/incidents
router.get('/', async (req, res) => {
  try {
    const list = await db.all(req.user.department_id);
    res.json({ data: list, count: list.length });
  } catch (err) {
    console.error('GET /incidents error:', err);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

// GET /api/incidents/:id
router.get('/:id', validateReq({ params: idParam }), async (req, res) => {
  try {
    const inc = await db.findById(Number(req.params.id), req.user.department_id);
    if (!inc) return res.status(404).json({ error: 'Incident not found' });
    res.json({ data: inc });
  } catch (err) {
    console.error('GET /incidents/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch incident' });
  }
});

// GET /api/incidents/:id/apparatus-times — NFIRS per-apparatus times derived
// from the unit-status history stamped with this incident_id.
router.get('/:id/apparatus-times', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid incident id' });
    const times = await unitStatus.apparatusTimes(req.user.department_id, id);
    res.json({ data: times });
  } catch (err) {
    console.error('GET /incidents/:id/apparatus-times error:', err);
    res.status(500).json({ error: 'Failed to load apparatus times' });
  }
});

// POST /api/incidents
router.post('/', async (req, res) => {
  try {
    const errors = validate(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    if (await db.findByNumber(req.body.incidentNumber, req.user.department_id)) {
      return res.status(409).json({ error: `Incident number "${req.body.incidentNumber}" already exists` });
    }

    const inc = await db.create(coerce({
      incidentNumber: req.body.incidentNumber,
      date:           req.body.date,
      time:           req.body.time           || '',
      type:           req.body.type,
      alarmLevel:     req.body.alarmLevel     || 'Still',
      address:        req.body.address        || '',
      units:          Array.isArray(req.body.units)     ? req.body.units     : [],
      personnel:      Array.isArray(req.body.personnel) ? req.body.personnel : [],
      disposition:    req.body.disposition    || '',
      injuries:       req.body.injuries       ?? 0,
      notes:          req.body.notes          || '',
    }), req.user.department_id);

    // Companion DB writes are AWAITED before responding (previously
    // fire-and-forget — on Vercel the instance can freeze right after the
    // response, silently dropping them). Each is individually non-fatal so an
    // auxiliary failure can never block logging a life-safety incident; the
    // failure mode is a logged error + missing companion record, never a
    // half-written incident.
    await checkAutoExposure(inc, req.user.department_id);
    await autoCreateWorkflowTask(inc, req.user.department_id, req.user.id);
    audit(req.user.department_id, req.user, 'create', 'incidents', inc.id, {
      incidentNumber: inc.incidentNumber, type: inc.type,
    });

    res.status(201).json({ data: inc });

    // Fire-and-forget push notification to all subscribers at this station
    broadcastToStation(req.user.department_id, {
      title: `New Incident — ${inc.type}`,
      body:  `${inc.incidentNumber} · ${inc.alarmLevel} · ${inc.address}`,
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
      data:  { url: '/incidents' },
    });

    // Layer 3: Webhook dispatch — notify external systems
    webhookDispatch('incident.created', {
      id: inc.id, incidentNumber: inc.incidentNumber, type: inc.type,
      alarmLevel: inc.alarmLevel, address: inc.address, date: inc.date,
    }, req.user.department_id).catch(() => {});
  } catch (err) {
    // Unique-index race guard: two simultaneous creates with the same number.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Incident number already in use' });
    }
    console.error('POST /incidents error:', err);
    res.status(500).json({ error: 'Failed to create incident' });
  }
});

// PATCH /api/incidents/:id
router.patch('/:id', validateReq({ params: idParam }), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.findById(id, req.user.department_id);
    if (!existing) return res.status(404).json({ error: 'Incident not found' });

    const errors = validate(req.body, false);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    if (req.body.incidentNumber && req.body.incidentNumber !== existing.incidentNumber) {
      const collision = await db.findByNumber(req.body.incidentNumber, req.user.department_id);
      if (collision) return res.status(409).json({ error: `Incident number "${req.body.incidentNumber}" already in use` });
    }

    const updated = await db.update(id, coerce(req.body), req.user.department_id);
    audit(req.user.department_id, req.user, 'update', 'incidents', id, {
      fields: Object.keys(req.body || {}),
    });
    res.json({ data: updated });
  } catch (err) {
    console.error('PATCH /incidents/:id error:', err);
    res.status(500).json({ error: 'Failed to update incident' });
  }
});

// DELETE /api/incidents/:id — SOFT delete (Phase 2.2): incident reports are
// legal records; the row is retained with deleted_at set and an audit entry.
router.delete('/:id', validateReq({ params: idParam }), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.findById(id, req.user.department_id);
    if (!existing) return res.status(404).json({ error: 'Incident not found' });
    await db.remove(id, req.user.department_id);
    audit(req.user.department_id, req.user, 'soft_delete', 'incidents', id, {
      incidentNumber: existing.incidentNumber,
    });
    res.json({ message: `Incident ${id} deleted` });
  } catch (err) {
    console.error('DELETE /incidents/:id error:', err);
    res.status(500).json({ error: 'Failed to delete incident' });
  }
});

module.exports = router;
