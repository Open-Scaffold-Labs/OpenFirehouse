'use strict';
/**
 * completenessEngine.js — Rules-based document completeness checker
 *
 * Layer 2, Phase 1 of the agentic architecture.
 * No AI required — pure rules that map required fields to database queries.
 *
 * Each document type defines:
 *   label        — Human-readable name
 *   description  — What this document is
 *   checks[]     — Array of completeness checks, each with:
 *     field      — Machine identifier
 *     label      — Human-readable field name
 *     category   — Grouping (core, narrative, personnel, compliance, etc.)
 *     required   — Is this field mandatory for submission?
 *     check()    — Async function returning { complete, value?, detail? }
 *     aiAction   — Optional: which AI action can fill this if missing
 *     source     — Where the data comes from (table name / module)
 */

const { pool } = require('../db');

// ── Helper: safe query that returns [] on error ──────────────────────────────
async function safeQuery(sql, params) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch {
    return [];
  }
}

async function safeQueryOne(sql, params) {
  const rows = await safeQuery(sql, params);
  return rows[0] || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT TYPE: INCIDENT REPORT
// ═══════════════════════════════════════════════════════════════════════════════

const incidentReport = {
  label: 'Incident Report',
  description: 'Complete incident record ready for department files and NFIRS submission',
  checks: [
    // ── Core Fields ──
    {
      field: 'incidentNumber',
      label: 'Incident Number',
      category: 'core',
      required: true,
      check: async ({ incident }) => ({
        complete: !!incident.incidentNumber,
        value: incident.incidentNumber || null,
      }),
      source: 'incidents',
    },
    {
      field: 'date',
      label: 'Incident Date',
      category: 'core',
      required: true,
      check: async ({ incident }) => ({
        complete: !!incident.date,
        value: incident.date || null,
      }),
      source: 'incidents',
    },
    {
      field: 'time',
      label: 'Incident Time',
      category: 'core',
      required: true,
      check: async ({ incident }) => ({
        complete: !!incident.time && incident.time.trim() !== '',
        value: incident.time || null,
      }),
      source: 'incidents',
    },
    {
      field: 'type',
      label: 'Incident Type',
      category: 'core',
      required: true,
      check: async ({ incident }) => ({
        complete: !!incident.type,
        value: incident.type || null,
      }),
      source: 'incidents',
    },
    {
      field: 'address',
      label: 'Location / Address',
      category: 'core',
      required: true,
      check: async ({ incident }) => ({
        complete: !!incident.address && incident.address.trim() !== '',
        value: incident.address || null,
      }),
      source: 'incidents',
    },
    {
      field: 'alarmLevel',
      label: 'Alarm Level',
      category: 'core',
      required: false,
      check: async ({ incident }) => ({
        complete: !!incident.alarmLevel && incident.alarmLevel !== 'Still',
        value: incident.alarmLevel || null,
        detail: incident.alarmLevel === 'Still' ? 'Defaults to Still — confirm if accurate' : null,
      }),
      source: 'incidents',
    },
    {
      field: 'disposition',
      label: 'Disposition',
      category: 'core',
      required: true,
      check: async ({ incident }) => ({
        complete: !!incident.disposition && incident.disposition.trim() !== '',
        value: incident.disposition || null,
      }),
      source: 'incidents',
    },

    // ── Timeline ──
    {
      field: 'dispatchTime',
      label: 'Dispatch Time',
      category: 'timeline',
      required: true,
      check: async ({ incident }) => ({
        complete: !!incident.dispatchTime && incident.dispatchTime.trim() !== '',
        value: incident.dispatchTime || null,
      }),
      source: 'incidents',
    },
    {
      field: 'clearTime',
      label: 'Clear / Available Time',
      category: 'timeline',
      required: true,
      check: async ({ incident }) => ({
        complete: !!incident.clearTime && incident.clearTime.trim() !== '',
        value: incident.clearTime || null,
      }),
      source: 'incidents',
    },

    // ── Personnel & Resources ──
    {
      field: 'units',
      label: 'Units Responding',
      category: 'resources',
      required: true,
      check: async ({ incident }) => {
        const units = Array.isArray(incident.units) ? incident.units : JSON.parse(incident.units || '[]');
        return {
          complete: units.length > 0,
          value: units.length > 0 ? `${units.length} unit(s)` : null,
        };
      },
      source: 'incidents',
    },
    {
      field: 'personnel',
      label: 'Personnel on Scene',
      category: 'resources',
      required: true,
      check: async ({ incident }) => {
        const pers = Array.isArray(incident.personnel) ? incident.personnel : JSON.parse(incident.personnel || '[]');
        return {
          complete: pers.length > 0,
          value: pers.length > 0 ? `${pers.length} member(s)` : null,
        };
      },
      source: 'incidents',
    },

    // ── Narrative ──
    // A human-written narrative is still REQUIRED for NFIRS — but there is
    // deliberately no aiAction here. DOCTRINE (Matt, 2026-06-10): AI plays
    // zero role in incident narratives; the officer writes them directly.
    {
      field: 'narrative',
      label: 'Incident Narrative',
      category: 'narrative',
      required: true,
      check: async ({ incident }) => {
        const hasNotes = !!incident.notes && incident.notes.trim().length > 20;
        return {
          complete: hasNotes,
          value: hasNotes ? `${incident.notes.trim().length} characters` : null,
          detail: !hasNotes ? 'A narrative of at least a few sentences is required for NFIRS — written by the officer' : null,
        };
      },
      source: 'incidents',
    },

    // ── Linked Records ──
    {
      field: 'afterAction',
      label: 'After-Action Report',
      category: 'linked',
      required: false,
      check: async ({ incident, stationId }) => {
        const aar = await safeQueryOne(
          'SELECT id, status FROM after_action_reports WHERE incident_id = $1 AND department_id = $2',
          [incident.id, stationId]
        );
        return {
          complete: !!aar,
          value: aar ? `${aar.status} (ID: ${aar.id})` : null,
          detail: !aar ? 'Recommended for working fires, significant incidents, and unusual calls' : null,
        };
      },
      aiAction: 'draft_after_action',
      source: 'after_action_reports',
    },
    {
      field: 'exposureRecords',
      label: 'Exposure Records',
      category: 'linked',
      required: false, // required dynamically based on incident type
      check: async ({ incident, stationId }) => {
        const EXPOSURE_TYPES = ['Structure Fire', 'Vehicle Fire', 'Hazmat', 'Gas Leak', 'Brush / Wildland Fire'];
        const needsExposure = EXPOSURE_TYPES.includes(incident.type);

        if (!needsExposure) {
          return { complete: true, value: 'Not applicable for this incident type' };
        }

        const personnel = Array.isArray(incident.personnel) ? incident.personnel : JSON.parse(incident.personnel || '[]');
        const exposures = await safeQuery(
          'SELECT id, member_id FROM exposure_records WHERE incident_id = $1 AND department_id = $2 AND deleted_at IS NULL',
          [incident.id, stationId]
        );

        const covered = exposures.length;
        const needed = personnel.length;

        return {
          complete: covered >= needed && needed > 0,
          value: needed > 0 ? `${covered} of ${needed} personnel covered` : 'No personnel listed',
          detail: covered < needed && needed > 0
            ? `Missing exposure records for ${needed - covered} personnel. Required for ${incident.type} incidents.`
            : null,
        };
      },
      aiAction: 'auto_exposure',
      source: 'exposure_records',
    },
    {
      field: 'nfirsReport',
      label: 'NFIRS Submission',
      category: 'compliance',
      required: false,
      check: async ({ incident, stationId }) => {
        const nfirs = await safeQueryOne(
          'SELECT id, status FROM nfirs_reports WHERE "incidentNumber" = $1 AND department_id = $2',
          [incident.incidentNumber, stationId]
        );
        return {
          complete: !!nfirs && nfirs.status !== 'Draft',
          value: nfirs ? `${nfirs.status}` : null,
          detail: !nfirs ? 'NFIRS report has not been started' : (nfirs.status === 'Draft' ? 'NFIRS report is still in draft' : null),
        };
      },
      aiAction: 'nfirs_auto_complete',
      source: 'nfirs_reports',
    },
    {
      field: 'attachments',
      label: 'Scene Photos / Attachments',
      category: 'documentation',
      required: false,
      check: async ({ incident, stationId }) => {
        const photos = Array.isArray(incident.photos) ? incident.photos : JSON.parse(incident.photos || '[]');
        const attachments = await safeQuery(
          'SELECT id FROM attachments WHERE module = $1 AND record_id = $2 AND department_id = $3',
          ['incidents', incident.id, stationId]
        );
        const total = photos.length + attachments.length;
        return {
          complete: total > 0,
          value: total > 0 ? `${total} file(s)` : null,
        };
      },
      source: 'attachments',
    },
  ],
};


// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT TYPE: AFTER-ACTION REPORT
// ═══════════════════════════════════════════════════════════════════════════════

const afterActionReport = {
  label: 'After-Action Report',
  description: 'Post-incident review documenting strengths, improvements, and lessons learned',
  checks: [
    {
      field: 'title', label: 'Report Title', category: 'core', required: true,
      check: async ({ record }) => ({ complete: !!record.title && record.title.trim() !== '', value: record.title || null }),
      source: 'after_action_reports',
    },
    {
      field: 'summary', label: 'Summary', category: 'narrative', required: true,
      check: async ({ record }) => ({ complete: !!record.summary && record.summary.trim().length > 20, value: record.summary ? `${record.summary.length} chars` : null }),
      source: 'after_action_reports',
    },
    {
      field: 'strengths', label: 'Strengths Identified', category: 'analysis', required: true,
      check: async ({ record }) => {
        const arr = Array.isArray(record.strengths) ? record.strengths : JSON.parse(record.strengths || '[]');
        return { complete: arr.length > 0, value: arr.length > 0 ? `${arr.length} item(s)` : null };
      },
      source: 'after_action_reports',
    },
    {
      field: 'improvements', label: 'Areas for Improvement', category: 'analysis', required: true,
      check: async ({ record }) => {
        const arr = Array.isArray(record.improvements) ? record.improvements : JSON.parse(record.improvements || '[]');
        return { complete: arr.length > 0, value: arr.length > 0 ? `${arr.length} item(s)` : null };
      },
      source: 'after_action_reports',
    },
    {
      field: 'actionItems', label: 'Action Items', category: 'analysis', required: true,
      check: async ({ record }) => {
        const arr = Array.isArray(record.action_items) ? record.action_items : JSON.parse(record.action_items || '[]');
        return { complete: arr.length > 0, value: arr.length > 0 ? `${arr.length} item(s)` : null };
      },
      source: 'after_action_reports',
    },
    {
      field: 'lessonsLearned', label: 'Lessons Learned', category: 'narrative', required: false,
      check: async ({ record }) => ({ complete: !!record.lessons_learned && record.lessons_learned.trim().length > 10, value: record.lessons_learned ? `${record.lessons_learned.length} chars` : null }),
      source: 'after_action_reports',
    },
    {
      field: 'attendees', label: 'Review Attendees', category: 'documentation', required: false,
      check: async ({ record }) => {
        const arr = Array.isArray(record.attendees) ? record.attendees : JSON.parse(record.attendees || '[]');
        return { complete: arr.length > 0, value: arr.length > 0 ? `${arr.length} attendee(s)` : null };
      },
      source: 'after_action_reports',
    },
    {
      field: 'conductedBy', label: 'Conducted By', category: 'documentation', required: true,
      check: async ({ record }) => ({ complete: !!record.conducted_by && record.conducted_by.trim() !== '', value: record.conducted_by || null }),
      source: 'after_action_reports',
    },
  ],
};


// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY & ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const documentTypes = {
  incident_report: incidentReport,
  after_action_report: afterActionReport,
  // Future: nfirs_submission, exposure_report, training_compliance_audit, grievance_package
};

/**
 * Run completeness checks for a document type.
 *
 * @param {string} docType — key from documentTypes
 * @param {object} context — { incident?, record?, stationId }
 * @returns {object} { docType, label, description, score, complete, total, required: { complete, total }, checks: [...] }
 */
async function checkCompleteness(docType, context) {
  const doc = documentTypes[docType];
  if (!doc) throw new Error(`Unknown document type: ${docType}`);

  const results = await Promise.all(
    doc.checks.map(async (check) => {
      try {
        const result = await check.check(context);
        return {
          field: check.field,
          label: check.label,
          category: check.category,
          required: check.required,
          complete: result.complete,
          value: result.value || null,
          detail: result.detail || null,
          aiAction: !result.complete ? check.aiAction || null : null,
          source: check.source,
        };
      } catch (err) {
        return {
          field: check.field,
          label: check.label,
          category: check.category,
          required: check.required,
          complete: false,
          value: null,
          detail: `Check failed: ${err.message}`,
          aiAction: check.aiAction || null,
          source: check.source,
        };
      }
    })
  );

  const total = results.length;
  const completeCount = results.filter(r => r.complete).length;
  const requiredChecks = results.filter(r => r.required);
  const requiredComplete = requiredChecks.filter(r => r.complete).length;

  // Group by category
  const categories = {};
  for (const r of results) {
    if (!categories[r.category]) categories[r.category] = { label: r.category, checks: [], complete: 0, total: 0 };
    categories[r.category].checks.push(r);
    categories[r.category].total++;
    if (r.complete) categories[r.category].complete++;
  }

  return {
    docType,
    label: doc.label,
    description: doc.description,
    score: total > 0 ? Math.round((completeCount / total) * 100) : 0,
    complete: completeCount,
    total,
    required: { complete: requiredComplete, total: requiredChecks.length },
    readyForSubmission: requiredComplete === requiredChecks.length,
    categories: Object.values(categories),
    checks: results,
  };
}

module.exports = { checkCompleteness, documentTypes };
