'use strict';
const express = require('express');
const router  = express.Router();
const { mutualAid: db, incidents: incDb } = require('../db');
const { recommendPartners } = require('../utils/mutualAidRecommender');
const aiActions = require('../utils/aiActionRegistry');

function coerce(d) {
  const o = { ...d };
  if (o.personnelCount !== undefined) o.personnelCount = parseInt(o.personnelCount, 10) || 0;
  return o;
}

router.get('/', async (req, res) => { try { res.json({ data: await db.all(req.user.department_id) }); } catch(e) { res.status(500).json({ error: 'Failed to fetch mutual aid records' }); } });
router.get('/:id', async (req, res) => { try { const r = await db.findById(+req.params.id, req.user.department_id); if (!r) return res.status(404).json({ error: 'Not found' }); res.json({ data: r }); } catch(e) { res.status(500).json({ error: 'Failed' }); } });

router.post('/', async (req, res) => {
  try {
    if (!req.body.date) return res.status(400).json({ error: 'date is required' });
    res.status(201).json({ data: await db.create(coerce({
      date:              req.body.date,
      direction:         req.body.direction         || 'Given',
      incidentType:      req.body.incidentType      || '',
      status:            req.body.status            || 'Completed',
      partnerDepartment: req.body.partnerDepartment || '',
      address:           req.body.address           || '',
      unitsDeployed:     req.body.unitsDeployed     ?? [],
      personnelCount:    req.body.personnelCount     ?? 0,
      requestTime:       req.body.requestTime       || '',
      clearTime:         req.body.clearTime         || '',
      notes:             req.body.notes             || '',
      incidentNumber:    req.body.incidentNumber    || '',
    }), req.user.department_id) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create mutual aid record' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    res.json({ data: await db.update(id, coerce(req.body), req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to update record' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `Record ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete record' }); }
});

// ─── Layer 3: Mutual Aid Recommendations ────────────────────────────────────

const { callAI: aiCall, sendAIError } = require('../utils/aiClient');
const { guardedSystemPrompt, guardedUserPrompt } = require('../utils/promptGuard');

// Registry-action caller used by the recommender. Routes the provider call
// through the ONE guarded helper (utils/aiClient): budget check + usage record,
// prompt-injection guard, centralized model + key-safe errors. options.stationId
// carries the department id for budgeting. Returns null when no API key is
// configured (preserves the recommender's graceful non-AI fallback); a
// BUDGET_EXCEEDED (429-shaped) or any real error propagates to the route.
async function callAI(actionName, options) {
  const actionDef = aiActions[actionName];
  if (!actionDef) return null;
  const contextStr = await actionDef.buildContext(options);
  let raw;
  try {
    raw = await aiCall(
      guardedSystemPrompt(actionDef.systemPrompt),
      guardedUserPrompt('Data:\n', contextStr),
      {
        maxTokens: actionDef.maxTokens || 1500,
        temperature: actionDef.temperature || 0.3,
        meta: { stationId: options?.stationId, action: actionName },
      },
    );
  } catch (e) {
    if (e && e.message === 'NO_API_KEY') return null; // no key → recommender uses its non-AI path
    throw e; // BUDGET_EXCEEDED / real errors bubble to the route
  }
  if (!raw) return null;
  const formatted = actionDef.formatResult(raw);
  return formatted?.result || raw;
}

/**
 * GET /api/mutual-aid/recommend/:incidentId
 * Get AI-powered partner recommendations for a specific incident.
 */
router.get('/recommend/:incidentId', async (req, res) => {
  try {
    const incidentId = Number(req.params.incidentId);
    const incident = await incDb.findById(incidentId, req.user.department_id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const deptId = req.user.department_id;
    // Bind the department onto the registry caller so every provider call is
    // budgeted to the caller's department.
    const boundCallAI = (actionName, options) => callAI(actionName, { ...(options || {}), stationId: deptId });
    const result = await recommendPartners(incident, deptId, boundCallAI);
    res.json({ data: result });
  } catch (err) {
    if (sendAIError(res, err)) return; // NO_API_KEY → 503, BUDGET_EXCEEDED → 429
    console.error('Mutual aid recommendation error:', err);
    res.status(500).json({ error: 'Recommendation failed', details: err.message });
  }
});

/**
 * POST /api/mutual-aid/activate
 * Activate a recommended partner — creates a mutual aid incident record
 * and returns the activation details.
 */
router.post('/activate', async (req, res) => {
  try {
    const { incidentId, agreementId, partnerAgency, resourcesNeeded } = req.body;
    if (!incidentId || !partnerAgency) {
      return res.status(400).json({ error: 'incidentId and partnerAgency are required' });
    }

    const incident = await incDb.findById(Number(incidentId), req.user.department_id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    // Create mutual aid activation record
    const record = await db.create(coerce({
      date: incident.date || new Date().toISOString().slice(0, 10),
      direction: 'Received',
      incidentType: incident.type || '',
      status: 'Active',
      partnerDepartment: partnerAgency,
      address: incident.address || '',
      unitsDeployed: [],
      personnelCount: 0,
      requestTime: new Date().toTimeString().slice(0, 5),
      clearTime: '',
      notes: resourcesNeeded
        ? `Resources requested: ${resourcesNeeded}. Activated from incident ${incident.incidentNumber}.`
        : `Activated from incident ${incident.incidentNumber}.`,
      incidentNumber: incident.incidentNumber || '',
    }), req.user.department_id);

    res.status(201).json({
      data: {
        activation: record,
        message: `Mutual aid activated: ${partnerAgency} for ${incident.type} at ${incident.address}`,
      }
    });
  } catch (err) {
    console.error('Mutual aid activation error:', err);
    res.status(500).json({ error: 'Activation failed', details: err.message });
  }
});

module.exports = router;
