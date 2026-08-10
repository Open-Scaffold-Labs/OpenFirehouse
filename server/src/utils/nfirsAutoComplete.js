'use strict';
/**
 * nfirsAutoComplete.js — Layer 3: NFIRS Auto-Completion Engine
 *
 * Fills in missing NFIRS fields from incident data, pre-plans, and AI.
 * Three tiers of auto-completion:
 *
 *   Tier 1 — Direct Mapping (no AI): Copy fields from the linked incident
 *            (address, units, personnel, narrative, dates, times)
 *
 *   Tier 2 — Lookup & Inference (no AI): Match incident type to NFIRS code,
 *            pull structure data from pre-plans, infer detector/sprinkler
 *            presence from property type, parse address components
 *
 *   Tier 3 — AI Enrichment: Determine fire origin/cause, estimate losses,
 *            refine narrative for NFIRS compliance, fill structure details
 *
 * The engine is non-destructive: it only fills EMPTY fields and never
 * overwrites existing data.
 */

const { pool, incidents: incDb, nfirsReports: nfDb } = require('../db');

// ═══════════════════════════════════════════════════════════════════════════════
// INCIDENT TYPE → NFIRS CODE MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

const TYPE_TO_NFIRS_CODE = {
  'Structure Fire':           '111',
  'Vehicle Fire':             '131',
  'Brush / Wildland Fire':    '140',
  'Dumpster / Rubbish Fire':  '150',
  'Vehicle Accident':         '322',
  'Technical Rescue':         '351',
  'Water Rescue':             '360',
  'Medical / EMS':            '311',
  'Hazmat':                   '410',
  'Gas Leak':                 '413',
  'Public Assist':            '500',
  'False Alarm':              '700',
  'Mutual Aid':               '571',
  'Other':                    '900',
};

// Reverse lookup
const NFIRS_CODE_TO_TYPE = Object.fromEntries(
  Object.entries(TYPE_TO_NFIRS_CODE).map(([k, v]) => [v, k])
);

// ═══════════════════════════════════════════════════════════════════════════════
// TIER 1 — DIRECT FIELD MAPPING (incident → NFIRS)
// ═══════════════════════════════════════════════════════════════════════════════

function mapIncidentToNfirs(incident) {
  const fields = {};

  if (incident.incidentNumber) fields.incidentNumber = incident.incidentNumber;
  if (incident.date)           fields.reportDate = incident.date;
  if (incident.notes)          fields.narrativeStatement = incident.notes;
  if (incident.time)           fields.dispatchTime = incident.time;

  // Map incident type → NFIRS code
  if (incident.type) {
    const code = TYPE_TO_NFIRS_CODE[incident.type];
    if (code) fields.incidentType = code;
    // Flag structure fires
    if (incident.type === 'Structure Fire') fields.isStructureFire = true;
  }

  // Units → respondingUnits (comma-separated) + categorize as suppression/EMS
  const units = Array.isArray(incident.units) ? incident.units : [];
  if (units.length > 0) {
    fields.respondingUnits = units.join(', ');
    fields.suppressionApparatus = units.filter(u =>
      /engine|ladder|truck|quint|tower|rescue|squad/i.test(u)
    );
    fields.emsApparatus = units.filter(u =>
      /medic|ambulance|ems|rescue|als|bls/i.test(u)
    );
  }

  // Personnel → categorize as suppression/EMS
  const personnel = Array.isArray(incident.personnel) ? incident.personnel : [];
  if (personnel.length > 0) {
    fields.suppressionPersonnel = personnel;
  }

  // Injuries from incident
  if (incident.injuries > 0) {
    fields.civilianInjuries = incident.injuries;
  }

  return fields;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIER 2 — LOOKUP & INFERENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a full address string into NFIRS components.
 * "847 Oak Street, Springfield, NJ 07081" →
 *   { streetNumber: "847", streetName: "Oak", streetType: "St", city: "Springfield", state: "NJ", zip: "07081" }
 */
function parseAddress(fullAddress) {
  if (!fullAddress) return {};
  const parts = {};

  // Split by comma
  const segments = fullAddress.split(',').map(s => s.trim());

  // First segment: street address
  if (segments[0]) {
    const streetMatch = segments[0].match(/^(\d+[-\w]*)\s+(.+)$/);
    if (streetMatch) {
      parts.streetNumber = streetMatch[1];
      const streetParts = streetMatch[2].trim().split(/\s+/);

      // Last word might be street type
      const STREET_TYPES = {
        'street': 'St', 'st': 'St', 'avenue': 'Ave', 'ave': 'Ave',
        'boulevard': 'Blvd', 'blvd': 'Blvd', 'drive': 'Dr', 'dr': 'Dr',
        'road': 'Rd', 'rd': 'Rd', 'lane': 'Ln', 'ln': 'Ln',
        'court': 'Ct', 'ct': 'Ct', 'place': 'Pl', 'pl': 'Pl',
        'circle': 'Cir', 'cir': 'Cir', 'way': 'Way', 'terrace': 'Ter',
        'trail': 'Trl', 'pike': 'Pike', 'highway': 'Hwy', 'hwy': 'Hwy',
        'parkway': 'Pkwy', 'pkwy': 'Pkwy',
      };

      if (streetParts.length > 1) {
        const lastWord = streetParts[streetParts.length - 1].toLowerCase();
        if (STREET_TYPES[lastWord]) {
          parts.streetType = STREET_TYPES[lastWord];
          parts.streetName = streetParts.slice(0, -1).join(' ');
        } else {
          parts.streetName = streetParts.join(' ');
        }
      } else {
        parts.streetName = streetParts[0];
      }
    }
  }

  // Second segment: city
  if (segments[1]) parts.city = segments[1];

  // Third segment: state + zip
  if (segments[2]) {
    const stateZip = segments[2].match(/([A-Z]{2})\s*(\d{5})?/i);
    if (stateZip) {
      parts.state = stateZip[1].toUpperCase();
      if (stateZip[2]) parts.zip = stateZip[2];
    }
  }

  return parts;
}

/**
 * Pull structure data from pre-plans if address matches.
 */
async function lookupPrePlan(address, stationId) {
  if (!address) return null;
  try {
    const searchAddr = address.split(',')[0].trim().toLowerCase();
    const { rows } = await pool.query(
      `SELECT "occupancyName", address, "occupancyType", "riskLevel",
              "constructionType", hazards, "waterSupply",
              stories, "squareFootage"
       FROM pre_plans
       WHERE department_id = $1 AND LOWER(address) LIKE $2
       LIMIT 1`,
      [stationId, `%${searchAddr}%`]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * Infer structure fields from pre-plan data.
 */
function inferFromPrePlan(prePlan) {
  if (!prePlan) return {};
  const fields = {};

  // Occupancy type → structure type / property use
  const OCC_MAP = {
    'residential':  { structureType: '1', propertyUse: '419' },
    'commercial':   { structureType: '2', propertyUse: '500' },
    'industrial':   { structureType: '3', propertyUse: '600' },
    'assembly':     { structureType: '1', propertyUse: '100' },
    'educational':  { structureType: '1', propertyUse: '200' },
    'healthcare':   { structureType: '1', propertyUse: '300' },
    'mixed':        { structureType: '2', propertyUse: '400' },
    'apartment':    { structureType: '1', propertyUse: '429' },
    'multi-family': { structureType: '1', propertyUse: '429' },
  };

  if (prePlan.occupancyType) {
    const key = prePlan.occupancyType.toLowerCase();
    for (const [pattern, values] of Object.entries(OCC_MAP)) {
      if (key.includes(pattern)) {
        Object.assign(fields, values);
        break;
      }
    }
  }

  if (prePlan.stories)       fields.storiesAboveGrade = parseInt(prePlan.stories) || 0;
  if (prePlan.squareFootage) fields.mainFloorArea = parseInt(prePlan.squareFootage) || 0;

  // Hazards indicate building occupied status
  fields.buildingStatus = 'occupied'; // Default for pre-planned buildings

  return fields;
}

/**
 * Look up the officer in charge from duty roster or apparatus assignments.
 */
async function lookupOfficerInCharge(stationId, incidentDate) {
  try {
    const date = incidentDate || new Date().toISOString().slice(0, 10);
    // Try the date-keyed riding board first (1.1c-b / 0070: daily_staffing folded
    // into apparatus_assignments — name/rank come from members, not stored columns).
    const { rows: staffing } = await pool.query(
      `SELECT m.name AS member_name, m.rank AS member_rank
       FROM apparatus_assignments aa
       JOIN members m ON m.id = aa.member_id
       WHERE aa.department_id = $1 AND aa.date = $2
         AND aa.position_name ILIKE ANY (ARRAY['%officer%','%oic%','%captain%','%lieutenant%','%command%'])
       ORDER BY aa.position_id NULLS LAST
       LIMIT 1`,
      [stationId, date]
    );
    if (staffing.length > 0) {
      return `${staffing[0].member_rank || ''} ${staffing[0].member_name}`.trim();
    }

    // Fall back to shifts
    const { rows: shifts } = await pool.query(
      `SELECT s.member, m.rank FROM shifts s
       LEFT JOIN members m ON s.member = m.name AND m.department_id = $1
       WHERE s.department_id = $1 AND s.date = $2
       AND m.rank IN ('Captain', 'Lieutenant', 'Chief', 'Deputy Chief', 'Assistant Chief')
       LIMIT 1`,
      [stationId, date]
    );
    if (shifts.length > 0) {
      return `${shifts[0].rank || ''} ${shifts[0].member}`.trim();
    }

    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN AUTO-COMPLETE ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Auto-complete a NFIRS report from its linked incident.
 *
 * @param {number|Object} reportOrId — NFIRS report ID or report object
 * @param {number} stationId
 * @param {Function} callAI — Optional AI caller for Tier 3
 * @returns {Object} { success, report, fieldsPopulated, tiers }
 */
async function autoCompleteNfirs(reportOrId, stationId, callAI) {
  const startTime = Date.now();
  const populated = [];
  const tiers = { tier1: [], tier2: [], tier3: [] };

  try {
    // 1. Load the existing NFIRS report
    let report;
    if (typeof reportOrId === 'object') {
      report = reportOrId;
    } else {
      report = await nfDb.findById(reportOrId, stationId);
      if (!report) return { success: false, error: 'NFIRS report not found' };
    }

    // 2. Load the linked incident
    let incident = null;
    if (report.linkedIncidentId) {
      incident = await incDb.findById(report.linkedIncidentId, stationId);
    }
    if (!incident && report.incidentNumber) {
      incident = await incDb.findByNumber(report.incidentNumber, stationId);
    }
    if (!incident) {
      return { success: false, error: 'No linked incident found for this NFIRS report' };
    }

    // Track what we'll update
    const updates = {};

    // ── TIER 1: Direct field mapping ─────────────────────────────────────
    const directFields = mapIncidentToNfirs(incident);
    for (const [key, value] of Object.entries(directFields)) {
      if (isEmpty(report[key]) && !isEmpty(value)) {
        updates[key] = value;
        populated.push(key);
        tiers.tier1.push(key);
      }
    }

    // ── TIER 2: Lookup & inference ───────────────────────────────────────

    // 2a. Parse address into components
    const address = incident.address || report.address;
    if (address) {
      const parsed = parseAddress(address);
      for (const [key, value] of Object.entries(parsed)) {
        if (isEmpty(report[key]) && !isEmpty(value) && !updates[key]) {
          updates[key] = value;
          populated.push(key);
          tiers.tier2.push(key);
        }
      }
    }

    // 2b. Pre-plan lookup for structure data
    const prePlan = await lookupPrePlan(address, stationId);
    if (prePlan) {
      const prePlanFields = inferFromPrePlan(prePlan);
      for (const [key, value] of Object.entries(prePlanFields)) {
        if (isEmpty(report[key]) && !isEmpty(value) && !updates[key]) {
          updates[key] = value;
          populated.push(key);
          tiers.tier2.push(key);
        }
      }
    }

    // 2c. Officer in charge lookup
    if (isEmpty(report.officerInCharge) && !updates.officerInCharge) {
      const oic = await lookupOfficerInCharge(stationId, incident.date);
      if (oic) {
        updates.officerInCharge = oic;
        populated.push('officerInCharge');
        tiers.tier2.push('officerInCharge');
      }
    }

    // 2d. FDID default
    if (isEmpty(report.fdid) && !updates.fdid) {
      const envFdid = process.env.NFIRS_FDID || process.env.FDID;
      if (envFdid) {
        updates.fdid = envFdid;
        populated.push('fdid');
        tiers.tier2.push('fdid');
      }
    }

    // 2e. GPS from incident's linked CAD alert
    if (isEmpty(report.latitude) && isEmpty(report.longitude)) {
      try {
        const { rows } = await pool.query(
          `SELECT latitude, longitude FROM cad_alerts
           WHERE department_id = $1 AND incident_id = $2 AND latitude IS NOT NULL
           LIMIT 1`,
          [stationId, incident.id]
        );
        if (rows.length > 0 && rows[0].latitude) {
          updates.latitude = String(rows[0].latitude);
          updates.longitude = String(rows[0].longitude);
          populated.push('latitude', 'longitude');
          tiers.tier2.push('latitude', 'longitude');
        }
      } catch { /* cad_alerts.incident_id column may not exist */ }
    }

    // ── TIER 3: AI enrichment ────────────────────────────────────────────
    // AI fills in fire-specific FACT fields (origin, cause, loss estimates).
    // narrativeStatement is deliberately excluded — incident narratives are
    // officer-written only; AI plays zero role in them (doctrine 2026-06-10).
    if (callAI) {
      try {
        const aiResult = await callAI('nfirs_auto_complete', {
          data: {
            report: { ...report, ...updates },
            incident,
            prePlan,
          },
          stationId,
        });

        if (aiResult && typeof aiResult === 'object') {
          const AI_FILLABLE = [
            'fireOriginCode', 'fireCauseCode', 'contributingFactor1', 'contributingFactor2',
            'humanFactors1', 'humanFactors2', 'detectorPresence', 'detectorOperation',
            'detectorEffectiveness', 'sprinklerPresence', 'sprinklerOperation',
            'estimatedPropertyLoss', 'estimatedPropertyValue', 'propertyLoss', 'contentsLoss',
            'buildingStatus', 'structureType',
          ];
          for (const key of AI_FILLABLE) {
            if (aiResult[key] && isEmpty(report[key]) && !updates[key]) {
              updates[key] = aiResult[key];
              populated.push(key);
              tiers.tier3.push(key);
            }
          }
        }
      } catch (err) {
        console.warn('[NFIRS AutoComplete] AI enrichment failed:', err.message);
      }
    }

    // ── Apply updates ────────────────────────────────────────────────────
    if (Object.keys(updates).length > 0) {
      await nfDb.update(report.id, updates, stationId);
    }

    const duration = Date.now() - startTime;
    console.log(`[NFIRS AutoComplete] ✔ Populated ${populated.length} fields for report ${report.id} (${duration}ms)`);

    return {
      success: true,
      reportId: report.id,
      fieldsPopulated: populated,
      fieldCount: populated.length,
      tiers: {
        tier1: { fields: tiers.tier1, label: 'Direct Mapping' },
        tier2: { fields: tiers.tier2, label: 'Lookup & Inference' },
        tier3: { fields: tiers.tier3, label: 'AI Enrichment' },
      },
      duration,
    };
  } catch (err) {
    console.error('[NFIRS AutoComplete] ✘ Failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Helper ──────────────────────────────────────────────────────────────────
function isEmpty(val) {
  if (val === undefined || val === null || val === '') return true;
  if (Array.isArray(val) && val.length === 0) return true;
  if (val === 0 || val === '0') return true; // 0 means "not filled in" for NFIRS numerics
  return false;
}

/**
 * Create a new NFIRS report from an incident and auto-populate it.
 * Used when no NFIRS report exists yet — creates one then fills it.
 */
async function createAndAutoComplete(incidentId, stationId, callAI) {
  try {
    const incident = await incDb.findById(incidentId, stationId);
    if (!incident) return { success: false, error: 'Incident not found' };

    // Check if NFIRS report already exists
    const existing = await nfDb.all(stationId);
    const alreadyExists = existing.find(r => r.incidentNumber === incident.incidentNumber);
    if (alreadyExists) {
      // Auto-complete existing report instead
      return autoCompleteNfirs(alreadyExists, stationId, callAI);
    }

    // Create minimal NFIRS report
    const report = await nfDb.create({
      incidentNumber: incident.incidentNumber,
      linkedIncidentId: incident.id,
      status: 'Draft',
    }, stationId);

    // Auto-populate
    return autoCompleteNfirs(report, stationId, callAI);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  autoCompleteNfirs,
  createAndAutoComplete,
  mapIncidentToNfirs,
  parseAddress,
  TYPE_TO_NFIRS_CODE,
  NFIRS_CODE_TO_TYPE,
};
