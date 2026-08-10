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
const {
  validateNerisIncidentFields, NERIS_INCIDENT_FIELDS,
  nerisStatusTransitionFor, nerisStatusGuard, mergeNerisReview,
} = require('../utils/nerisValidate');
const { associateCallToIncident, ASSOCIATION_RESULT } = require('../utils/callAssociation');
const { buildNerisIncidentPayload } = require('../utils/nerisPayload');
const { submitAfterApproval, attemptSubmission, refreshNerisStatus } = require('../utils/nerisSubmit');
const { roleLevel } = require('../middleware/requireRole');
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

// POST /api/incidents/neris-preview — the ONE completeness brain (P2-D5, F25).
// Registered BEFORE any '/:id' route so 'neris-preview' can never be matched as
// an id (the nfirsReports '/neris/export' gotcha). PURE: runs the canonical
// transformer on the DRAFT BODY + the caller's own department row — no writes,
// no cross-department reads, no payload in the response (nothing to leak).
// An `id` in the body is IGNORED (no DB merge in Phase 2 — the form sends its
// full current state).
router.post('/neris-preview', async (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) ? req.body : {};
    const { id: _ignored, ...draft } = body;

    // Closed-set save-validation first — included in the result, NOT a 422
    // (preview never blocks; it informs).
    const fieldCheck = validateNerisIncidentFields(draft);

    // Caller's OWN department row only (the nfirsReports departmentRow pattern —
    // shared pool chokepoint, never a second client).
    const { rows } = await pool.query(
      'SELECT id, name, fdid FROM departments WHERE id = $1',
      [req.user.department_id]
    );
    const department = rows[0] || {};

    const { validation } = buildNerisIncidentPayload({ incident: draft, department });
    const errors = [...new Set([...fieldCheck.errors, ...validation.errors])];
    res.json({
      data: {
        validation: {
          valid: errors.length === 0,
          errors,
          warnings: validation.warnings,
          completeness: validation.completeness,
        },
        completeness: validation.completeness,
      },
    });
  } catch (err) {
    console.error('POST /incidents/neris-preview error:', err);
    res.status(500).json({ error: 'Failed to build NERIS preview' });
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

    // neris_status / neris_review have exactly ONE door: the status route (P2-D6).
    if (req.body.neris_status !== undefined || req.body.neris_review !== undefined) {
      return res.status(422).json({
        error: 'neris_status and neris_review change only via POST /api/incidents/:id/neris-status',
        code: 'NERIS_STATUS_VIA_ROUTE',
      });
    }

    // NERIS closed-set validation (Wave 3, D2/D5). PRESENT-but-invalid values are
    // refused; a body with no NERIS fields is untouched — drafts stay saveable (F12).
    const neris = validateNerisIncidentFields(req.body);
    if (!neris.ok) {
      return res.status(422).json({ error: 'NERIS validation failed', code: 'NERIS_INVALID', details: neris.errors });
    }

    if (await db.findByNumber(req.body.incidentNumber, req.user.department_id)) {
      return res.status(409).json({ error: `Incident number "${req.body.incidentNumber}" already exists` });
    }

    const nerisFields = {};
    for (const f of NERIS_INCIDENT_FIELDS) {
      if (req.body[f] !== undefined) nerisFields[f] = req.body[f];
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
      ...nerisFields,
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

    // 4.1a-R — bind this report to its CAD call, keyed on the run number. THIS is
    // where the association is created; the Command Board never writes it (it
    // reflects state, it does not activate it — Matt, 2026-07-26).
    //
    // NON-FATAL, but REPORTED. Never block an officer over a data-quality problem:
    // NEMSIS forbids it in MUST-language for warnings, and USFA's own tool saved
    // INVALID incidents rather than block. The incident is logged either way.
    // But the outcome rides out in the response — the whole reason 4.1a's
    // predecessor failed for twelve days is that a link result went nowhere.
    let association = null;
    if (req.body.cadRunNumber) {
      try {
        association = await associateCallToIncident(
          req.user.department_id, inc.id, req.body.cadRunNumber);
        if (association.result === ASSOCIATION_RESULT.LINKED) {
          audit(req.user.department_id, req.user, 'update', 'incidents', inc.id, {
            cad_run_number: association.runNumber, cad_alert_id: association.alertId,
          });
        }
      } catch (e) {
        console.error('[incidents] CAD association failed:', e.message);
        association = { result: 'error', alertId: null, runNumber: null };
      }
    }

    res.status(201).json({ data: inc, association });

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

    // neris_status / neris_review have exactly ONE door: the status route (P2-D6).
    if (req.body.neris_status !== undefined || req.body.neris_review !== undefined) {
      return res.status(422).json({
        error: 'neris_status and neris_review change only via POST /api/incidents/:id/neris-status',
        code: 'NERIS_STATUS_VIA_ROUTE',
      });
    }

    // Approved-lock (P2-D6/F22): while approved, NERIS fields are frozen —
    // 409, not a silent drop. Non-NERIS fields stay editable; return_to_draft
    // (officer+, audited) unlocks. Pure guard, unit-tested in nerisReviewChain.
    const statusGuard = nerisStatusGuard(existing, req.body);
    if (statusGuard.blocked) {
      return res.status(409).json({
        error: 'This incident\'s NERIS report is approved — return it to draft to edit NERIS fields',
        code: 'NERIS_APPROVED_LOCKED',
        details: statusGuard.fields,
      });
    }

    // NERIS closed-set validation (Wave 3, D2/D5) — only PRESENT fields are
    // checked, so a partial PATCH that never mentions NERIS is unaffected (F12).
    const neris = validateNerisIncidentFields(req.body);
    if (!neris.ok) {
      return res.status(422).json({ error: 'NERIS validation failed', code: 'NERIS_INVALID', details: neris.errors });
    }
    // XOR against the MERGED record (F3): a PATCH adding noaction to a record
    // that already carries actions (or vice versa) would otherwise pass the
    // body-only check and die on the DB CHECK as an opaque 500.
    if (req.body.neris_noaction !== undefined || req.body.neris_actions !== undefined) {
      const mergedNoaction = req.body.neris_noaction !== undefined ? req.body.neris_noaction : existing.neris_noaction;
      const mergedActions  = req.body.neris_actions  !== undefined ? req.body.neris_actions  : existing.neris_actions;
      if (mergedNoaction != null && Array.isArray(mergedActions) && mergedActions.length > 0) {
        return res.status(422).json({
          error: 'NERIS validation failed', code: 'NERIS_INVALID',
          details: ['neris_noaction and a non-empty neris_actions are mutually exclusive (record would hold both after this update)'],
        });
      }
    }

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

// POST /api/incidents/:id/neris-status — the ONE door for the NERIS review
// chain (P2-D6): draft → in_review → approved, revertible. Role gates:
//   submit_review    — any authenticated member of the department
//   approve / return_to_draft — officer+ (roleLevel >= 2, the requireOfficer tier)
// The transition is COMPARE-AND-SET (F23): the UPDATE lands only if the row
// still holds the status this request read — a racing reviewer gets 409
// STALE_STATUS, never a silent double-transition. Every transition is
// audit-logged with the incident's INTEGER id (lesson #14).
const NERIS_STATUS_ACTIONS = ['submit_review', 'approve', 'return_to_draft'];

router.post('/:id/neris-status', validateReq({ params: idParam }), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { action, notes } = req.body || {};

    if (!NERIS_STATUS_ACTIONS.includes(action)) {
      return res.status(400).json({
        error: 'action must be submit_review, approve, or return_to_draft',
        code: 'INVALID_ACTION',
      });
    }
    if ((action === 'approve' || action === 'return_to_draft') && roleLevel(req.user.role) < 2) {
      return res.status(403).json({
        error: 'This action requires officer authority.',
        code: 'FORBIDDEN_ROLE',
      });
    }

    const existing = await db.findById(id, req.user.department_id);
    if (!existing) return res.status(404).json({ error: 'Incident not found' });

    const from = existing.neris_status || 'draft';
    const next = nerisStatusTransitionFor(action, from);
    if (!next) {
      return res.status(409).json({
        error: `Cannot ${action} from status "${from}"`,
        code: 'INVALID_TRANSITION',
        details: { from, action },
      });
    }

    const review = mergeNerisReview(existing.neris_review, {
      action,
      by: req.user.id,
      by_name: req.user.name || req.user.username || '',
      at: new Date().toISOString(),
      notes: typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 2000) : undefined,
    });

    const updated = await db.nerisStatusTransition(id, req.user.department_id, from, next, review);
    if (!updated) {
      // Existence was just confirmed in-scope — 0 rows means the status moved
      // under us (two reviewers racing). Tell the caller to re-read (F23).
      return res.status(409).json({
        error: 'The report\'s review status changed while you were acting — reload and retry',
        code: 'STALE_STATUS',
        details: { expected: from },
      });
    }

    audit(req.user.department_id, req.user, `neris_status_${action}`, 'incidents', id, {
      from, to: next, ...(notes ? { notes: String(notes).slice(0, 500) } : {}),
    });

    // ── Track B (TB-D1): approval is the submission trigger. The engine is
    // caught end-to-end and bounded — its outcome can NEVER fail the approval.
    // Submission happens only when the department enabled it (default OFF);
    // the response carries the fresh submission axis so the chip paints
    // immediately instead of waiting for a refetch.
    if (next === 'approved') {
      const result = await submitAfterApproval(id, req.user.department_id);
      if (result.attempted || result.state) {
        const fresh = await db.findById(id, req.user.department_id);
        return res.json({ data: fresh || updated });
      }
    }
    res.json({ data: updated });
  } catch (err) {
    console.error('POST /incidents/:id/neris-status error:', err);
    res.status(500).json({ error: 'Failed to update NERIS review status' });
  }
});

// POST /api/incidents/:id/neris-submission/retry — officer+ manual retry of a
// retryable submission state (Track B). The engine is the ONE brain; this route
// only authorizes and invokes it. A 'refused' record is deliberately retryable
// here too — the officer retries AFTER fixing + re-approving, or on our rule
// updates; the engine re-validates before any network call regardless.
router.post('/:id/neris-submission/retry', validateReq({ params: idParam }), async (req, res) => {
  try {
    if (roleLevel(req.user.role) < 2) {
      return res.status(403).json({ error: 'This action requires officer authority.', code: 'FORBIDDEN_ROLE' });
    }
    const id = Number(req.params.id);
    const existing = await db.findById(id, req.user.department_id);
    if (!existing) return res.status(404).json({ error: 'Incident not found' });
    if (existing.neris_status !== 'approved') {
      return res.status(409).json({
        error: 'Only an approved report can be submitted to NERIS.',
        code: 'NOT_APPROVED',
      });
    }
    audit(req.user.department_id, req.user, 'neris_submission_retry', 'incidents', id, {});
    await attemptSubmission(id, req.user.department_id, { reason: 'retry' });
    const fresh = await db.findById(id, req.user.department_id);
    res.json({ data: fresh });
  } catch (err) {
    console.error('POST /incidents/:id/neris-submission/retry error:', err);
    res.status(500).json({ error: 'Failed to retry NERIS submission' });
  }
});

// POST /api/incidents/:id/neris-submission/refresh — on-open status refresh
// (Alpine-style on-demand check). Read-only against NERIS; updates our mirror.
router.post('/:id/neris-submission/refresh', validateReq({ params: idParam }), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.findById(id, req.user.department_id);
    if (!existing) return res.status(404).json({ error: 'Incident not found' });
    await refreshNerisStatus(id, req.user.department_id);
    const fresh = await db.findById(id, req.user.department_id);
    res.json({ data: fresh });
  } catch (err) {
    console.error('POST /incidents/:id/neris-submission/refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh NERIS status' });
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
