'use strict';
const express = require('express');
const router  = express.Router();
const { nfirsReports: db, incidents: incDb } = require('../db');
const { autoCompleteNfirs, createAndAutoComplete } = require('../utils/nfirsAutoComplete');
const aiActions = require('../utils/aiActionRegistry');

// ─── NERIS Export Helpers (server-side mirror of client/utils/nerisExport.js) ──

function generateNerisId(fdid, incidentDate) {
  const epoch = incidentDate ? new Date(incidentDate).getTime() : Date.now();
  return `${fdid}:${epoch}`;
}

function parseCivicLocation(report) {
  return {
    an_number: report.streetNumber || '',
    an_complete: report.streetNumber || '',
    sn_prefix: report.streetPrefix || '',
    sn_street_name: report.streetName || '',
    sn_suffix: report.streetSuffix || '',
    sn_type: report.streetType || '',
    csop_postal_comm: report.city || '',
    csop_state: report.state || 'NJ',
    csop_postal_code: report.zip || '',
    csop_country: 'US',
  };
}

function toNerisIncident(report, incident = {}) {
  const fdid = report.fdid || 'NJ14-001';
  const merged = { ...incident, ...report };

  const neris = {
    incident_neris_id: generateNerisId(fdid, merged.incidentDate),
    incident_internal_id: merged.incidentNumber || '',
    incident_final_type: merged.neris_type
      ? [merged.neris_type.split('.')]
      : [['PUBSERV', 'CITIZEN_ASSIST', 'CITIZEN_ASSIST_SERVICE_CALL']],
    incident_final_type_primary: [true],
    incident_point: null,
    incident_location: parseCivicLocation(merged),
    incident_people_present: (merged.civilianDeaths > 0 || merged.civilianInjuries > 0 || merged.fsDeaths > 0 || merged.fsInjuries > 0),
    incident_displaced_number: 0,
    incident_rescue_animal: 0,
    incident_actions_taken: (merged.actions_taken || []).map(a => a.split('.')),
    unit_response: [],
    risk_reduction: {
      detector_present: merged.detectorPresence || null,
      detector_operation: merged.detectorOperation || null,
      sprinkler_present: merged.sprinklerPresence || null,
      sprinkler_operation: merged.sprinklerOperation || null,
    },
    incident_aid_direction: merged.aidCode || null,
    incident_narrative_outcome: merged.narrativeStatement || merged.notes || '',
    rescue_ff: [],
    rescue_nonff: [],
    _meta: {
      neris_version: '1.0',
      export_date: new Date().toISOString(),
      source: 'OpenFirehouse',
      fdid,
      original_incident_number: merged.incidentNumber || '',
    },
  };

  // GPS
  if (merged.latitude && merged.longitude) {
    neris.incident_point = {
      type: 'Point',
      coordinates: [parseFloat(merged.longitude), parseFloat(merged.latitude)],
    };
  }

  // Unit response
  const units = merged.respondingUnits
    ? merged.respondingUnits.split(',').map(u => u.trim()).filter(Boolean)
    : (incident.units || []);
  if (units.length) {
    neris.unit_response = units.map(uid => {
      const resp = { unit_id_reported: uid };
      const date = merged.incidentDate;
      if (date) {
        if (merged.dispatchTime || merged.alarmTime) resp.time_dispatch = `${date}T${merged.dispatchTime || merged.alarmTime}:00Z`;
        if (merged.onSceneTime || merged.arrivalTime) resp.time_on_scene = `${date}T${merged.onSceneTime || merged.arrivalTime}:00Z`;
        if (merged.unitClearTime || merged.clearedTime) resp.time_unit_clear = `${date}T${merged.unitClearTime || merged.clearedTime}:00Z`;
      }
      return resp;
    });
  }

  // Casualties
  if (merged.fsDeaths > 0 || merged.fsInjuries > 0) {
    neris.rescue_ff.push({ ff_deaths: parseInt(merged.fsDeaths) || 0, ff_injuries: parseInt(merged.fsInjuries) || 0 });
  }
  if (merged.civilianDeaths > 0 || merged.civilianInjuries > 0) {
    neris.rescue_nonff.push({ civilian_deaths: parseInt(merged.civilianDeaths) || 0, civilian_injuries: parseInt(merged.civilianInjuries) || 0 });
  }

  // Fire module
  if (merged.isStructureFire) {
    neris.fire = {
      structure_type: merged.structureType || null,
      stories_above_grade: merged.storiesAboveGrade ? parseInt(merged.storiesAboveGrade) : null,
      stories_below_grade: merged.storiesBelowGrade ? parseInt(merged.storiesBelowGrade) : null,
      fire_origin: merged.fireOriginCode || null,
      fire_cause: merged.fireCauseCode || null,
      property_loss: merged.propertyLoss ? parseFloat(merged.propertyLoss) : null,
      contents_loss: merged.contentsLoss ? parseFloat(merged.contentsLoss) : null,
    };
  }

  return neris;
}

// ─── Routes ────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try { res.json({ data: await db.all(req.user.department_id) }); }
  catch (e) { res.status(500).json({ error: 'Failed to fetch NFIRS reports' }); }
});

/**
 * GET /api/nfirs-reports/neris/export
 * Export all reports as a NERIS-compliant JSON bundle.
 * IMPORTANT: Must be registered before /:id so Express doesn't match "neris" as an ID.
 */
router.get('/neris/export', async (req, res) => {
  try {
    const reports = await db.all(req.user.department_id);
    const incidents = await incDb.all(req.user.department_id);

    const incMap = {};
    (incidents || []).forEach(inc => {
      incMap[inc.incident_number || inc.incidentNumber] = inc;
    });

    const nerisIncidents = reports.map(report => {
      const inc = incMap[report.incidentNumber] || {};
      return toNerisIncident(report, inc);
    });

    const bundle = {
      neris_version: '1.0',
      export_date: new Date().toISOString(),
      source: 'OpenFirehouse',
      fdid: reports[0]?.fdid || 'NJ14-001',
      incident_count: nerisIncidents.length,
      incidents: nerisIncidents,
    };

    res.json({ data: bundle });
  } catch (e) {
    console.error('NERIS export error:', e);
    res.status(500).json({ error: 'Failed to generate NERIS export' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await db.findById(Number(req.params.id), req.user.department_id);
    if (!row) return res.status(404).json({ error: 'Report not found' });
    res.json({ data: row });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch report' }); }
});

router.post('/', async (req, res) => {
  try {
    if (!req.body.incidentNumber) return res.status(400).json({ error: 'incidentNumber is required' });
    const { id: _ignore, ...body } = req.body;
    res.status(201).json({ data: await db.create(body, req.user.department_id) });
  } catch (e) { res.status(500).json({ error: 'Failed to create report' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Report not found' });
    res.json({ data: await db.update(id, req.body, req.user.department_id) });
  } catch (e) { res.status(500).json({ error: 'Failed to update report' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Report not found' });
    await db.remove(id, req.user.department_id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete report' }); }
});

/**
 * GET /api/nfirs-reports/:id/neris
 * Export a single report as NERIS-compliant JSON.
 */
router.get('/:id/neris', async (req, res) => {
  try {
    const report = await db.findById(Number(req.params.id), req.user.department_id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    // Try to find matching incident
    let incident = {};
    if (report.incidentNumber) {
      incident = await incDb.findByNumber(report.incidentNumber, req.user.department_id) || {};
    }

    const neris = toNerisIncident(report, incident);
    res.json({ data: neris });
  } catch (e) {
    console.error('NERIS single export error:', e);
    res.status(500).json({ error: 'Failed to generate NERIS export' });
  }
});

// ─── Layer 3: NFIRS Auto-Completion ─────────────────────────────────────────

const { callAI: aiCall, sendAIError } = require('../utils/aiClient');
const { guardedSystemPrompt, guardedUserPrompt } = require('../utils/promptGuard');

// Registry-action caller used by the NFIRS auto-complete/auto-create flows.
// Routes the provider call through the ONE guarded helper (utils/aiClient):
// budget check + usage record, prompt-injection guard, centralized model +
// key-safe errors. options.stationId carries the department id for budgeting.
// Returns null when no API key is set (preserves the prior graceful fallback);
// BUDGET_EXCEEDED (429-shaped) or any real error propagates to the route.
// NOTE (AI-narrative doctrine): the AI here does ALLOWED factual field
// auto-fill; the prohibited AI narrative tier was already removed. This change
// only swaps the transport — it writes nothing new to the legal record.
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
    if (e && e.message === 'NO_API_KEY') return null;
    throw e;
  }
  if (!raw) return null;
  const formatted = actionDef.formatResult(raw);
  return formatted?.result || raw;
}

/**
 * POST /api/nfirs-reports/auto-complete/:id
 * Auto-populate empty fields from linked incident + pre-plans + AI.
 */
router.post('/auto-complete/:id', async (req, res) => {
  try {
    const reportId = Number(req.params.id);
    const deptId = req.user.department_id;
    const boundCallAI = (actionName, options) => callAI(actionName, { ...(options || {}), stationId: deptId });
    const result = await autoCompleteNfirs(reportId, deptId, boundCallAI);
    if (!result.success) {
      return res.status(result.error?.includes('not found') ? 404 : 400).json({ error: result.error });
    }
    res.json({ data: result });
  } catch (err) {
    if (sendAIError(res, err)) return; // NO_API_KEY → 503, BUDGET_EXCEEDED → 429
    console.error('NFIRS auto-complete error:', err);
    res.status(500).json({ error: 'Auto-completion failed', details: err.message });
  }
});

/**
 * POST /api/nfirs-reports/auto-create/:incidentId
 * Create a new NFIRS report from an incident and auto-populate all fields.
 * If a report already exists for this incident, auto-completes the existing one.
 */
router.post('/auto-create/:incidentId', async (req, res) => {
  try {
    const incidentId = Number(req.params.incidentId);
    const deptId = req.user.department_id;
    const boundCallAI = (actionName, options) => callAI(actionName, { ...(options || {}), stationId: deptId });
    const result = await createAndAutoComplete(incidentId, deptId, boundCallAI);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ data: result });
  } catch (err) {
    if (sendAIError(res, err)) return; // NO_API_KEY → 503, BUDGET_EXCEEDED → 429
    console.error('NFIRS auto-create error:', err);
    res.status(500).json({ error: 'Auto-creation failed', details: err.message });
  }
});

// ─── State-Specific NFIRS Validation Rules ─────────────────────────────────
// POST /api/nfirs-reports/validate
// Validates a report against NJ-specific requirements before submission.
// Returns { valid, errors[], warnings[] }
router.post('/validate', async (req, res) => {
  try {
    const report = req.body;
    const errors = [];
    const warnings = [];

    // ── Required fields (NJ State Fire Marshal) ───────────────────────
    if (!report.incidentNumber) errors.push('Incident number is required');
    if (!report.incidentDate && !report.date) errors.push('Incident date is required');
    if (!report.incidentType) errors.push('Incident type code is required');

    // NJ requires FDID in NJ format (NJxx-xxx)
    const fdid = report.fdid || '';
    if (!fdid) {
      errors.push('FDID is required');
    } else if (!/^NJ\d{2}-\d{3}$/i.test(fdid)) {
      warnings.push(`FDID "${fdid}" does not match NJ format (NJxx-xxx). Verify with your county coordinator.`);
    }

    // ── Location requirements ─────────────────────────────────────────
    if (!report.streetName && !report.address) {
      errors.push('Street address is required for NJ NFIRS submission');
    }
    if (!report.city) warnings.push('City/municipality is recommended');
    if (!report.zip) warnings.push('ZIP code is recommended for geo-coding');

    // NJ requires municipality code (FIPS)
    if (!report.municipalityCode && !report.fipsCode) {
      warnings.push('NJ municipality/FIPS code is recommended for state reporting');
    }

    // ── Incident type validation ──────────────────────────────────────
    const incType = String(report.incidentType || '');
    if (incType && !/^\d{3}$/.test(incType)) {
      errors.push('Incident type must be a 3-digit NFIRS code (e.g., 111 for structure fire)');
    }

    // Structure fire (1xx) requires additional fields
    if (incType.startsWith('1')) {
      if (!report.propertyUse) warnings.push('Property use code required for fire incidents');
      if (!report.areaOfOrigin) warnings.push('Area of origin required for fire incidents');
      if (!report.heatSource) warnings.push('Heat source required for fire incidents');
      if (!report.itemFirstIgnited) warnings.push('Item first ignited required for fire incidents');
      if (!report.causeOfIgnition) warnings.push('Cause of ignition required for fire incidents');

      // NJ requires dollar loss estimates for structure fires
      if (report.propertyLoss === undefined && report.contentLoss === undefined) {
        warnings.push('NJ requires property/content loss estimates for structure fire reports');
      }
    }

    // ── Casualty reporting ────────────────────────────────────────────
    const ffDeaths = parseInt(report.ffDeaths || 0);
    const ffInjuries = parseInt(report.ffInjuries || 0);
    const civDeaths = parseInt(report.civDeaths || 0);
    const civInjuries = parseInt(report.civInjuries || 0);

    if (ffDeaths > 0 || civDeaths > 0) {
      warnings.push('Fatality reports require expedited submission to NJ OFIRS within 24 hours');
    }
    if (ffInjuries > 0) {
      warnings.push('Firefighter injury reports should include OSHA-required details');
    }

    // ── Unit response times ───────────────────────────────────────────
    if (!report.dispatchTime) warnings.push('Dispatch time recommended for response time analysis');
    if (!report.onSceneTime) warnings.push('On-scene arrival time recommended for ISO grading');

    // ── Detector/Sprinkler (NJ fire code emphasis) ────────────────────
    if (incType.startsWith('1')) {
      if (report.detectorPresent === undefined) {
        warnings.push('NJ emphasizes smoke detector presence/operation reporting');
      }
      if (report.sprinklerPresent === undefined) {
        warnings.push('Sprinkler system presence/operation recommended for NJ reporting');
      }
    }

    // ── GPS coordinates ───────────────────────────────────────────────
    if (!report.latitude || !report.longitude) {
      warnings.push('GPS coordinates improve NERIS mapping and analytics');
    }

    // ── Aid type ──────────────────────────────────────────────────────
    if (!report.aidType) {
      warnings.push('Aid given/received type recommended (mutual aid tracking)');
    }

    // ── NJ-specific: completed within 30 days ─────────────────────────
    if (report.incidentDate || report.date) {
      const incDate = new Date((report.incidentDate || report.date) + 'T00:00:00');
      const daysSince = Math.floor((new Date() - incDate) / (24 * 60 * 60 * 1000));
      if (daysSince > 30) {
        warnings.push(`NJ requires NFIRS submission within 30 days of incident. This incident is ${daysSince} days old.`);
      }
    }

    res.json({
      data: {
        valid: errors.length === 0,
        errors,
        warnings,
        errorCount: errors.length,
        warningCount: warnings.length,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Validation failed' });
  }
});

module.exports = router;
