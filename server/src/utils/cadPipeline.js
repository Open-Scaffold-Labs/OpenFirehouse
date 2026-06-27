'use strict';
/**
 * cadPipeline.js — Layer 3: CAD-to-Incident Auto-Pipeline
 *
 * When a CAD alert arrives via Active911 webhook, this pipeline:
 *   1. Classifies the incident type from the CAD description
 *   2. Maps CAD fields to incident fields
 *   3. Generates the next incident number (YY-NNNN)
 *   4. Calls AI to enrich FACTS only — type, alarm level, units, personnel,
 *      disposition hints. NEVER the narrative (doctrine 2026-06-10: incident
 *      narratives are officer-written; AI plays zero role in them).
 *   5. Creates a draft incident in the database
 *   6. Links the CAD alert to the new incident
 *   7. Returns the created incident (existing post-creation hooks fire downstream)
 *
 * The pipeline runs fire-and-forget from the webhook handler so the
 * Active911 response is never delayed.
 */

const { pool, incidents: incDb, workflowTasks } = require('../db');
const { checkCompleteness } = require('./completenessEngine');
const { broadcastToStation } = require('../routes/push');

// ── Incident Type Classification ────────────────────────────────────────────
// Maps common CAD descriptions/nature codes to OpenFirehouse incident types.
// Matched case-insensitively against the CAD description + details fields.
const TYPE_RULES = [
  { pattern: /structure\s*fire|house\s*fire|building\s*fire|residen.*fire|commercial\s*fire/i, type: 'Structure Fire' },
  { pattern: /vehicle\s*fire|car\s*fire|truck\s*fire|auto\s*fire/i,                           type: 'Vehicle Fire' },
  { pattern: /brush|wildland|grass\s*fire|woods\s*fire|forest/i,                               type: 'Brush / Wildland Fire' },
  { pattern: /dumpster|rubbish|trash\s*fire|debris/i,                                          type: 'Dumpster / Rubbish Fire' },
  { pattern: /mva|mvc|accident|collision|crash|vehicle\s*acc|auto\s*acc|pin-in|extrication/i,  type: 'Vehicle Accident' },
  { pattern: /tech.*rescue|confined\s*space|trench|collapse|high\s*angle|rope/i,               type: 'Technical Rescue' },
  { pattern: /water\s*rescue|drowning|swift\s*water|ice\s*rescue/i,                            type: 'Water Rescue' },
  { pattern: /medical|ems|cardiac|chest\s*pain|breathing|unresponsive|stroke|seizure|fall|injury|bleed|diabetic|overdose|od\b|diff\s*breath/i, type: 'Medical / EMS' },
  { pattern: /hazmat|haz-mat|hazardous\s*material|spill|chemical/i,                            type: 'Hazmat' },
  { pattern: /gas\s*leak|natural\s*gas|odor.*gas|carbon\s*monoxide|co\s*alarm|co\s*detector/i, type: 'Gas Leak' },
  { pattern: /public\s*assist|lockout|lock-out|water\s*problem|elevator|lift\s*assist/i,       type: 'Public Assist' },
  { pattern: /false\s*alarm|alarm\s*activation|fire\s*alarm|smoke\s*detector|pull\s*station|unintentional/i, type: 'False Alarm' },
  { pattern: /mutual\s*aid|cover\s*assignment|standby|fill-in/i,                               type: 'Mutual Aid' },
];

/**
 * Classify a CAD alert description into an incident type.
 * Returns the best match or 'Other' if no rules hit.
 */
function classifyIncidentType(description, details) {
  const text = `${description || ''} ${details || ''}`;
  for (const rule of TYPE_RULES) {
    if (rule.pattern.test(text)) return rule.type;
  }
  return 'Other';
}

// ── Alarm Level Inference ───────────────────────────────────────────────────
// Estimate alarm level from the number of units dispatched.
function inferAlarmLevel(unitsStr) {
  if (!unitsStr) return 'Still';
  const units = unitsStr.split(/[,;|]+/).map(u => u.trim()).filter(Boolean);
  if (units.length >= 6) return '3rd Alarm';
  if (units.length >= 4) return '2nd Alarm';
  if (units.length >= 2) return 'Working';
  return 'Still';
}

// ── Parse Units ─────────────────────────────────────────────────────────────
function parseUnits(unitsStr) {
  if (!unitsStr) return [];
  return unitsStr.split(/[,;|]+/).map(u => u.trim()).filter(Boolean);
}

// ── Generate Next Incident Number ───────────────────────────────────────────
// Format: YY-NNNN (e.g., 26-0012). Queries the database for the highest
// incident number this year and increments.
async function generateIncidentNumber(stationId) {
  const year = new Date().getFullYear().toString().slice(-2); // "26"
  const prefix = `${year}-`;

  try {
    const { rows } = await pool.query(
      `SELECT "incidentNumber" FROM incidents
       WHERE department_id = $1 AND "incidentNumber" LIKE $2
       ORDER BY "incidentNumber" DESC LIMIT 1`,
      [stationId, `${prefix}%`]
    );

    if (rows.length > 0) {
      const lastNum = parseInt(rows[0].incidentNumber.split('-')[1], 10) || 0;
      return `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
    }
    return `${prefix}0001`;
  } catch (err) {
    // Fallback: timestamp-based to avoid collisions
    const seq = Date.now().toString().slice(-4);
    return `${prefix}${seq}`;
  }
}

// ── Map CAD Alert → Incident Fields ─────────────────────────────────────────
function mapCadToIncident(alert, incidentNumber) {
  const type       = classifyIncidentType(alert.description, alert.details);
  const units      = parseUnits(alert.units);
  const alarmLevel = inferAlarmLevel(alert.units);

  // Extract time from dispatched_at
  const dispatchTime = alert.dispatched_at || alert.dispatchedAt;
  const dispatchDate = dispatchTime ? new Date(dispatchTime) : new Date();
  const date = dispatchDate.toISOString().slice(0, 10);                    // YYYY-MM-DD
  const time = dispatchDate.toTimeString().slice(0, 5);                    // HH:MM

  return {
    incidentNumber,
    date,
    time,
    type,
    alarmLevel,
    address:     alert.address || '',
    units,
    personnel:   [],          // Filled by AI enrichment or duty roster lookup
    disposition: '',          // Not yet known
    injuries:    0,
    notes:       '',          // Officer-written ONLY — AI never fills the narrative (doctrine 2026-06-10)
    // Pipeline metadata (stored in notes prefix until we add columns)
    _source:       'cad_auto',
    _cadAlertId:   alert.id,
    _dispatchTime: time,
  };
}

// ── AI Enrichment ───────────────────────────────────────────────────────────
// Calls the AI action registry to enrich the draft incident with refined type
// classification, units, and personnel lookup. FACTS ONLY — per doctrine
// (Matt, 2026-06-10) AI never writes the narrative; incidents.notes is
// officer-written and is deliberately never touched here.
async function enrichWithAI(draftIncident, alert, stationId, callAI) {
  if (!callAI) return draftIncident;

  try {
    const result = await callAI('cad_enrich_incident', {
      data: { alert, draftIncident },
      stationId,
    });

    if (!result) return draftIncident;

    // Parse the AI response
    let enriched;
    if (typeof result === 'string') {
      try {
        enriched = JSON.parse(result.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
      } catch {
        // AI returned plain text — discard it. Narrative prose must never
        // land in the incident record (doctrine 2026-06-10).
        return draftIncident;
      }
    } else {
      enriched = result;
    }

    // Merge AI enrichments — FACTS only. enriched.notes (if a model still
    // returns one) is deliberately ignored: AI never writes the narrative.
    if (enriched.type && enriched.type !== 'Other') draftIncident.type = enriched.type;
    if (enriched.alarmLevel) draftIncident.alarmLevel = enriched.alarmLevel;
    if (enriched.disposition) draftIncident.disposition = enriched.disposition;
    if (Array.isArray(enriched.personnel) && enriched.personnel.length > 0) {
      draftIncident.personnel = enriched.personnel;
    }
    if (Array.isArray(enriched.units) && enriched.units.length > 0) {
      draftIncident.units = enriched.units;
    }

    return draftIncident;
  } catch (err) {
    console.warn('[CAD Pipeline] AI enrichment failed (non-blocking):', err.message);
    return draftIncident;
  }
}

// ── Link CAD Alert to Incident ──────────────────────────────────────────────
// Add incident_id column to cad_alerts if it doesn't exist, then update.
async function linkAlertToIncident(alertId, incidentId) {
  try {
    // Ensure column exists (idempotent)
    await pool.query(
      `ALTER TABLE cad_alerts ADD COLUMN IF NOT EXISTS incident_id INTEGER`
    );
    await pool.query(
      `UPDATE cad_alerts SET incident_id = $1 WHERE id = $2`,
      [incidentId, alertId]
    );
  } catch (err) {
    console.warn('[CAD Pipeline] Link alert→incident failed:', err.message);
  }
}

// Also add cad_alert_id to incidents table
async function addCadAlertColumn() {
  try {
    await pool.query(
      `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS cad_alert_id INTEGER`
    );
    await pool.query(
      `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`
    );
  } catch (err) {
    console.warn('[CAD Pipeline] Schema migration note:', err.message);
  }
}

// ── Pipeline Configuration ──────────────────────────────────────────────────
// Check if auto-pipeline is enabled. Uses env var for now, can be
// extended to per-station settings later.
function isPipelineEnabled() {
  const env = process.env.CAD_AUTO_PIPELINE;
  // Default to enabled — this is the whole point of Layer 3
  if (env === undefined) return true;
  return env === 'true' || env === '1';
}

// ── Check for Duplicate ─────────────────────────────────────────────────────
// Prevent creating multiple incidents for the same CAD alert.
async function isAlreadyLinked(alertId) {
  try {
    const { rows } = await pool.query(
      `SELECT incident_id FROM cad_alerts WHERE id = $1 AND incident_id IS NOT NULL`,
      [alertId]
    );
    return rows.length > 0;
  } catch {
    // Column may not exist yet — that means nothing is linked
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process a CAD alert through the auto-pipeline.
 *
 * @param {Object} alert      — The stored cad_alerts row (from db.create)
 * @param {number} stationId  — Multi-tenancy station ID
 * @param {Function} callAI   — Optional AI caller (action, options) => result
 * @returns {Object}          — { success, incident, enriched, error }
 */
async function processCadAlert(alert, stationId, callAI) {
  const startTime = Date.now();

  try {
    // 0. Pre-checks
    if (!isPipelineEnabled()) {
      return { success: false, skipped: true, reason: 'Pipeline disabled' };
    }

    if (await isAlreadyLinked(alert.id)) {
      return { success: false, skipped: true, reason: 'Alert already linked to an incident' };
    }

    // 1. Ensure schema columns exist
    await addCadAlertColumn();

    // 2. Generate incident number
    const incidentNumber = await generateIncidentNumber(stationId);

    // 3. Map CAD fields → incident fields
    const draft = mapCadToIncident(alert, incidentNumber);

    // 4. AI enrichment (non-blocking — if it fails, we still create the draft)
    const enriched = await enrichWithAI(draft, alert, stationId, callAI);

    // 5. Add source tag to notes — mechanical provenance only. The narrative
    //    itself stays empty for the officer to write (AI never writes it,
    //    doctrine 2026-06-10).
    const sourceTag = `[Auto-generated from CAD alert ${alert.alert_id || alert.id}]`;
    enriched.notes = sourceTag;

    // 6. Create the incident
    const incident = await incDb.create({
      incidentNumber: enriched.incidentNumber,
      date:           enriched.date,
      time:           enriched.time,
      type:           enriched.type,
      alarmLevel:     enriched.alarmLevel,
      address:        enriched.address,
      units:          enriched.units,
      personnel:      enriched.personnel,
      disposition:    enriched.disposition,
      injuries:       enriched.injuries,
      notes:          enriched.notes,
    }, stationId);

    // 7. Update source and cad_alert_id on the new incident
    try {
      await pool.query(
        `UPDATE incidents SET source = 'cad_auto', cad_alert_id = $1 WHERE id = $2 AND department_id = $3`,
        [alert.id, incident.id, stationId]
      );
    } catch { /* column might not exist yet in edge cases */ }

    // 8. Link the alert back to the incident
    await linkAlertToIncident(alert.id, incident.id);

    // 9. Fire post-creation hooks (same as manual incident creation)
    //    - Workflow task for completeness tracking
    //    - Push notification to station members
    //    - Auto-exposure check for hazardous incident types
    try {
      const engineResult = await checkCompleteness('incident_report', { incident, stationId });
      const checklist = engineResult.checks.map(c => ({
        key: c.field,
        label: c.label,
        status: c.complete ? 'complete' : (c.required ? 'missing' : 'optional'),
        data: { value: c.value, detail: c.detail, aiAction: c.aiAction, canDraft: !!c.aiAction },
      }));
      await workflowTasks.create({
        user_id: null,
        title: `Complete report: ${incident.incidentNumber} (auto-created from CAD)`,
        task_type: 'incident_report',
        target_module: 'incidents',
        target_record_id: incident.id,
        checklist,
        conversation: [{
          role: 'assistant',
          content: `Auto-created from CAD alert ${alert.alert_id || alert.id}. ${engineResult.complete} of ${engineResult.total} fields complete — score ${engineResult.score}%. Review the auto-populated fields and fill in any gaps.`,
          timestamp: new Date().toISOString(),
        }],
      }, stationId);
    } catch (hookErr) {
      console.warn('[CAD Pipeline] Workflow task creation failed:', hookErr.message);
    }

    // Push notification
    try {
      await broadcastToStation(stationId, {
        title: `New Incident (Auto) — ${incident.type}`,
        body:  `${incident.incidentNumber} · ${incident.alarmLevel} · ${incident.address}`,
        icon:  '/icon-192.png',
        badge: '/icon-192.png',
        data:  { url: '/incidents', source: 'cad_auto' },
      });
    } catch { /* non-fatal */ }

    const duration = Date.now() - startTime;
    console.log(`[CAD Pipeline] ✔ Created incident ${incidentNumber} from CAD alert ${alert.alert_id || alert.id} (${duration}ms)`);

    return {
      success: true,
      incident,
      enriched: !!callAI,
      duration,
      incidentNumber,
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[CAD Pipeline] ✘ Failed to process alert ${alert.id}:`, err.message);
    return {
      success: false,
      error: err.message,
      duration,
    };
  }
}

// ── Pipeline Status ─────────────────────────────────────────────────────────
// Returns stats about the pipeline — how many alerts processed, linked, etc.
async function getPipelineStatus(stationId) {
  try {
    const [totalAlerts, linkedAlerts, autoIncidents] = await Promise.all([
      pool.query('SELECT COUNT(*) as c FROM cad_alerts WHERE department_id = $1', [stationId]),
      pool.query('SELECT COUNT(*) as c FROM cad_alerts WHERE department_id = $1 AND incident_id IS NOT NULL', [stationId])
        .catch(() => ({ rows: [{ c: 0 }] })),
      pool.query(`SELECT COUNT(*) as c FROM incidents WHERE department_id = $1 AND source = 'cad_auto' AND deleted_at IS NULL`, [stationId])
        .catch(() => ({ rows: [{ c: 0 }] })),
    ]);

    // Recent pipeline activity
    const { rows: recent } = await pool.query(
      `SELECT ca.id as alert_id, ca.alert_id as external_id, ca.description, ca.address,
              ca.dispatched_at, ca.incident_id, i."incidentNumber", i.type
       FROM cad_alerts ca
       LEFT JOIN incidents i ON ca.incident_id = i.id
       WHERE ca.department_id = $1
       ORDER BY ca.dispatched_at DESC
       LIMIT 10`,
      [stationId]
    ).catch(() => ({ rows: [] }));

    return {
      enabled: isPipelineEnabled(),
      stats: {
        totalAlerts:    parseInt(totalAlerts.rows[0].c),
        linkedAlerts:   parseInt(linkedAlerts.rows[0].c),
        autoIncidents:  parseInt(autoIncidents.rows[0].c),
        conversionRate: totalAlerts.rows[0].c > 0
          ? Math.round((linkedAlerts.rows[0].c / totalAlerts.rows[0].c) * 100)
          : 0,
      },
      recent,
    };
  } catch (err) {
    return { enabled: isPipelineEnabled(), stats: null, error: err.message };
  }
}

module.exports = {
  processCadAlert,
  getPipelineStatus,
  isPipelineEnabled,
  classifyIncidentType,
  inferAlarmLevel,
  generateIncidentNumber,
  mapCadToIncident,
};
