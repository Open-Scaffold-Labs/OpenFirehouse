'use strict';
/**
 * documentPackage.js — Multi-document orchestration engine
 *
 * Layer 2, Phase 5 of the agentic architecture.
 *
 * Defines document packages — coordinated sets of documents that share
 * context and can be generated together from a single command.
 *
 * A package:
 *   - Pulls shared context ONCE (incident, personnel, timeline, etc.)
 *   - Runs completeness checks across ALL constituent document types
 *   - Identifies which AI actions can fill gaps across the set
 *   - Executes those actions in dependency order
 *   - Returns a unified progress/status view
 */

const { pool } = require('../db');
const { checkCompleteness } = require('./completenessEngine');

// ── Helpers ──────────────────────────────────────────────────────────────────

async function safeQuery(sql, params) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch { return []; }
}

async function safeQueryOne(sql, params) {
  const rows = await safeQuery(sql, params);
  return rows[0] || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pull all data related to an incident ONCE. Every document generator
 * in the package reads from this shared context instead of re-querying.
 */
async function buildSharedContext(incidentId, stationId) {
  // Core incident
  const incident = await safeQueryOne(
    'SELECT * FROM incidents WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL',
    [incidentId, stationId]
  );
  if (!incident) return null;

  // Parse JSON fields
  for (const field of ['units', 'personnel', 'photos']) {
    if (typeof incident[field] === 'string') {
      try { incident[field] = JSON.parse(incident[field]); } catch { incident[field] = []; }
    }
    if (!Array.isArray(incident[field])) incident[field] = [];
  }

  // After-action report (may not exist yet)
  const afterAction = await safeQueryOne(
    'SELECT * FROM after_action_reports WHERE incident_id = $1 AND department_id = $2',
    [incidentId, stationId]
  );

  // Exposure records
  const exposures = await safeQuery(
    'SELECT * FROM exposure_records WHERE incident_id = $1 AND department_id = $2 AND deleted_at IS NULL',
    [incidentId, stationId]
  );

  // NFIRS report
  const nfirs = await safeQueryOne(
    'SELECT * FROM nfirs_reports WHERE "incidentNumber" = $1 AND department_id = $2',
    [incident.incidentNumber, stationId]
  );

  // Personnel details (resolve member names from IDs)
  const memberIds = incident.personnel.map(p => typeof p === 'object' ? p.id || p.memberId : p).filter(Boolean);
  let members = [];
  if (memberIds.length > 0) {
    members = await safeQuery(
      `SELECT id, "firstName", "lastName", rank, status FROM members WHERE id = ANY($1) AND department_id = $2`,
      [memberIds, stationId]
    );
  }

  // Linked meetings / correspondence
  const correspondence = await safeQuery(
    'SELECT id, subject, created_at FROM correspondence WHERE module = $1 AND record_id = $2 AND department_id = $3 ORDER BY created_at DESC LIMIT 10',
    ['incidents', incidentId, stationId]
  );

  // Attachments
  const attachments = await safeQuery(
    'SELECT id, filename, file_type, created_at FROM attachments WHERE module = $1 AND record_id = $2 AND department_id = $3',
    ['incidents', incidentId, stationId]
  );

  return {
    incident,
    afterAction,
    exposures,
    nfirs,
    members,
    correspondence,
    attachments,
    stationId,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// PACKAGE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Each package defines:
 *   label        — Human-readable name
 *   description  — What this package produces
 *   documents[]  — Ordered list of document types in this package
 *   each doc:
 *     docType    — Key in completenessEngine.documentTypes
 *     label      — Display name
 *     required   — Is this document mandatory for the package?
 *     condition  — Optional function: should this doc be included? (dynamic)
 *     contextKey — How to extract context for checkCompleteness
 *     aiActions  — Ordered list of AI actions to run for this doc
 */

const EXPOSURE_TYPES = ['Structure Fire', 'Vehicle Fire', 'Hazmat', 'Gas Leak', 'Brush / Wildland Fire'];

const packages = {
  incident_package: {
    label: 'Full Incident Package',
    description: 'Complete incident documentation: report, after-action review, exposure records, and NFIRS submission',
    documents: [
      {
        docType: 'incident_report',
        label: 'Incident Report',
        required: true,
        condition: () => true,
        contextKey: (ctx) => ({ incident: ctx.incident, stationId: ctx.stationId }),
        // No aiActions: the incident report's missing piece is the narrative,
        // which is officer-written only (doctrine 2026-06-10 — AI plays zero
        // role in incident narratives).
        aiActions: [],
      },
      {
        docType: 'after_action_report',
        label: 'After-Action Report',
        required: false,
        condition: (ctx) => {
          // Required for working fires, significant incidents
          const types = ['Structure Fire', 'Vehicle Fire', 'Hazmat', 'Gas Leak', 'Technical Rescue'];
          return types.includes(ctx.incident.type);
        },
        contextKey: (ctx) => {
          if (ctx.afterAction) {
            return { record: ctx.afterAction, stationId: ctx.stationId };
          }
          // No AAR exists yet — return a stub so completeness shows all missing
          return {
            record: { id: null, title: '', summary: '', strengths: '[]', improvements: '[]', action_items: '[]', lessons_learned: '', attendees: '[]', conducted_by: '' },
            stationId: ctx.stationId,
          };
        },
        aiActions: ['draft_after_action'],
      },
      {
        docType: 'exposure_check',
        label: 'Exposure Records',
        required: false,
        condition: (ctx) => EXPOSURE_TYPES.includes(ctx.incident.type),
        // Exposure checks are part of incident_report completeness, not a separate doc type
        // We surface them separately for the package view
        contextKey: null, // handled specially
        aiActions: ['auto_exposure'],
      },
      {
        docType: 'nfirs_check',
        label: 'NFIRS Submission',
        required: false,
        condition: () => true,
        contextKey: null, // checked via incident_report completeness
        aiActions: [],
      },
    ],
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// PACKAGE COMPLETENESS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check completeness across all documents in a package.
 * Returns per-document scores + aggregate package score.
 */
async function checkPackageCompleteness(packageType, incidentId, stationId) {
  const pkg = packages[packageType];
  if (!pkg) throw new Error(`Unknown package type: ${packageType}`);

  // Build shared context once
  const ctx = await buildSharedContext(incidentId, stationId);
  if (!ctx) return { error: 'Incident not found' };

  const documentResults = [];
  let totalChecks = 0;
  let totalComplete = 0;
  let totalRequired = 0;
  let totalRequiredComplete = 0;

  for (const doc of pkg.documents) {
    const included = doc.condition(ctx);

    if (!included) {
      documentResults.push({
        docType: doc.docType,
        label: doc.label,
        required: doc.required,
        included: false,
        reason: 'Not applicable for this incident type',
        score: 100,
        complete: 0,
        total: 0,
        aiActions: [],
      });
      continue;
    }

    // For standard document types with completeness checks
    if (doc.docType === 'incident_report' || doc.docType === 'after_action_report') {
      const compContext = doc.contextKey(ctx);
      const result = await checkCompleteness(doc.docType, compContext);

      // Identify which AI actions are available for incomplete checks
      const availableActions = result.checks
        .filter(c => !c.complete && c.aiAction)
        .map(c => c.aiAction);

      documentResults.push({
        docType: doc.docType,
        label: doc.label,
        required: doc.required,
        included: true,
        score: result.score,
        complete: result.complete,
        total: result.total,
        readyForSubmission: result.readyForSubmission,
        categories: result.categories,
        checks: result.checks,
        aiActions: [...new Set(availableActions)],
      });

      totalChecks += result.total;
      totalComplete += result.complete;
      totalRequired += result.required.total;
      totalRequiredComplete += result.required.complete;
    }

    // Exposure check — derived from incident report data
    else if (doc.docType === 'exposure_check') {
      const personnelCount = ctx.incident.personnel.length;
      const exposureCount = ctx.exposures.length;
      const isComplete = exposureCount >= personnelCount && personnelCount > 0;

      documentResults.push({
        docType: doc.docType,
        label: doc.label,
        required: doc.required,
        included: true,
        score: personnelCount > 0 ? Math.round((Math.min(exposureCount, personnelCount) / personnelCount) * 100) : 0,
        complete: Math.min(exposureCount, personnelCount),
        total: personnelCount,
        detail: `${exposureCount} of ${personnelCount} personnel have exposure records`,
        members: ctx.members.map(m => {
          const hasExposure = ctx.exposures.some(e => e.member_id === m.id);
          return { id: m.id, name: `${m.firstName} ${m.lastName}`, rank: m.rank, hasExposure };
        }),
        aiActions: isComplete ? [] : ['auto_exposure'],
      });

      totalChecks += personnelCount;
      totalComplete += Math.min(exposureCount, personnelCount);
    }

    // NFIRS check — simple exists check
    else if (doc.docType === 'nfirs_check') {
      const hasNfirs = !!ctx.nfirs;
      const isSubmitted = hasNfirs && ctx.nfirs.status !== 'Draft';

      documentResults.push({
        docType: doc.docType,
        label: doc.label,
        required: doc.required,
        included: true,
        score: isSubmitted ? 100 : (hasNfirs ? 50 : 0),
        complete: isSubmitted ? 1 : 0,
        total: 1,
        status: isSubmitted ? 'Submitted' : (hasNfirs ? 'Draft' : 'Not Started'),
        detail: isSubmitted ? `Submitted (ID: ${ctx.nfirs.id})` : (hasNfirs ? 'NFIRS report is in draft' : 'NFIRS report has not been created'),
        aiActions: [],
      });

      totalChecks += 1;
      totalComplete += isSubmitted ? 1 : 0;
    }
  }

  // Aggregate
  const packageScore = totalChecks > 0 ? Math.round((totalComplete / totalChecks) * 100) : 0;

  // Collect all actionable AI actions across the package
  const allActions = documentResults
    .filter(d => d.included && d.aiActions.length > 0)
    .flatMap(d => d.aiActions.map(a => ({ action: a, forDocument: d.label, docType: d.docType })));

  return {
    packageType,
    label: pkg.label,
    description: pkg.description,
    incidentId,
    incidentNumber: ctx.incident.incidentNumber,
    incidentType: ctx.incident.type,
    incidentDate: ctx.incident.date,
    incidentAddress: ctx.incident.address,
    score: packageScore,
    complete: totalComplete,
    total: totalChecks,
    required: { complete: totalRequiredComplete, total: totalRequired },
    documents: documentResults,
    availableActions: allActions,
    generatable: allActions.length > 0,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// PACKAGE GENERATION — execute all AI actions in dependency order
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run all available AI actions for a package in sequence.
 * Returns progress updates and final results.
 *
 * Dependency order:
 * 1. draft_after_action (internal review doc — references the officer-written narrative)
 * 2. auto_exposure (independent, can run anytime)
 *
 * Note (doctrine 2026-06-10): the incident narrative itself is NEVER
 * AI-generated — it is officer-written, so it has no entry here.
 *
 * @param {string} packageType
 * @param {number} incidentId
 * @param {number} stationId
 * @param {function} callAI — the AI caller from aiAction.js
 * @param {number} userId
 * @returns {object} { results[], errors[], finalScore }
 */
async function generatePackage(packageType, incidentId, stationId, callAI, userId) {
  const actions = require('./aiActionRegistry');
  const { saveHandlers } = actions;

  // First, check what's needed
  const completeness = await checkPackageCompleteness(packageType, incidentId, stationId);
  if (completeness.error) return { error: completeness.error };

  if (!completeness.generatable) {
    return {
      status: 'nothing_to_generate',
      message: 'All AI-draftable fields are already complete',
      score: completeness.score,
      documents: completeness.documents,
    };
  }

  // Define execution order (dependencies). draft_narrative is deliberately
  // absent — incident narratives are officer-written only (doctrine 2026-06-10).
  const executionOrder = ['draft_after_action', 'auto_exposure'];

  // Filter to only actions that are actually needed
  const neededActions = executionOrder.filter(a =>
    completeness.availableActions.some(aa => aa.action === a)
  );

  const results = [];
  const errors = [];

  for (const actionName of neededActions) {
    const actionDef = actions[actionName];
    if (!actionDef) continue;

    const actionInfo = completeness.availableActions.find(a => a.action === actionName);

    try {
      // Build context
      const contextStr = await actionDef.buildContext({
        record_id: incidentId,
        data: {},
        stationId,
        options: {},
        userId,
      });

      // Call AI — through the prompt-injection guard (W3.4)
      const { guardedUserPrompt, guardedSystemPrompt } = require('./promptGuard');
      const rawResult = await callAI(
        guardedSystemPrompt(actionDef.systemPrompt),
        guardedUserPrompt(`Record ID: ${incidentId}\nData:\n`, contextStr),
        actionDef.maxTokens || 2000,
        actionDef.temperature || 0.4,
      );

      // Format
      const formatted = actionDef.formatResult(rawResult);

      // Auto-save if handler exists — UNLESS the handler writes to a legal
      // table (W3.4: AI writes to legal records require an explicit,
      // per-result user confirmation via POST /api/ai/action/apply; package
      // generation must not bypass that).
      const handler = saveHandlers?.[actionName];
      const needsConfirmation = !!actionDef.requiresConfirmation;
      let saved = null;
      if (handler && !needsConfirmation) {
        saved = await handler({
          record_id: incidentId,
          result: formatted.result || rawResult,
          stationId,
          userId,
        });
      }

      results.push({
        action: actionName,
        forDocument: actionInfo?.forDocument || actionName,
        status: needsConfirmation ? 'needs_review' : 'success',
        saved: !!saved,
        // needs_review results carry the full payload so the UI can show it
        // and the user can explicitly apply it.
        result: needsConfirmation ? (formatted.result ?? rawResult) : undefined,
        preview: typeof formatted.result === 'string'
          ? formatted.result.substring(0, 200) + (formatted.result.length > 200 ? '...' : '')
          : null,
      });
    } catch (err) {
      errors.push({
        action: actionName,
        forDocument: actionInfo?.forDocument || actionName,
        error: err.message,
      });
    }
  }

  // Re-check completeness after generation
  const finalCompleteness = await checkPackageCompleteness(packageType, incidentId, stationId);

  return {
    status: errors.length === 0 ? 'complete' : 'partial',
    message: `Generated ${results.length} document(s)${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
    actionsRun: results.length,
    actionsTotal: neededActions.length,
    results,
    errors,
    score: finalCompleteness.score || completeness.score,
    scoreBefore: completeness.score,
    documents: finalCompleteness.documents || completeness.documents,
  };
}


module.exports = {
  packages,
  buildSharedContext,
  checkPackageCompleteness,
  generatePackage,
};
