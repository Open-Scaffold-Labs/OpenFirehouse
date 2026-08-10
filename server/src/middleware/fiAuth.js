'use strict';
/**
 * middleware/fiAuth.js — prevention permissions: DESIGNATION-based, not rank-based
 * (Prevention Core Phase 2.4; Matt's bureau doctrine + incumbent research §7.1).
 *
 * Fire-prevention bureaus can be separate entities from suppression: inspectors
 * are a GRANTED list — any user, any rank, including non-active/civilian members.
 * Permissions therefore ride on fi_designations rows, with two deliberate
 * fallbacks so no department is locked out on day one:
 *
 *   inspector actions  = designated 'inspector' or 'prevention_admin'
 *                        OR (fi_settings.allow_crew_inspections AND any member —
 *                            the incumbent engine-company workflow, default ON;
 *                            strict bureau-only departments toggle it off)
 *   prevention admin   = designated 'prevention_admin'
 *                        OR chief-level role (chiefs can always administer —
 *                            they're also the only ones who can grant designations)
 *   commit (complete)  = inspector rule, AND if fi_settings.admin_only_commit is
 *                        ON, prevention-admin rule (the incumbent
 *                        "only administrators may commit" restriction)
 *
 * Fail-closed: no req.user.department_id → 401. Settings default row when absent.
 */
const { pool } = require('../db');
const { roleLevel } = require('./requireRole');

// Mirrors routes/fiSettings.js. The billing three were added 2026-08-07 (3.2 Slice D): the
// waiver gate in fiFeeSchedules reads waiver_approval_threshold off THIS object when a
// department has no fi_settings row, so leaving it out here was a second source of truth for
// the same default. NULL = no band, and NULL is not 0.
const DEFAULT_SETTINGS = {
  allow_crew_inspections: true, admin_only_commit: false,
  invoice_number_prefix: '', fiscal_year_start_month: 1, waiver_approval_threshold: null,
};

async function getFiSettings(departmentId) {
  // SELECT * on purpose: consumers beyond the gate need the notice text blocks
  // too (fiNotices PDF builder) — one settings fetch serves all (P2.3).
  const { rows } = await pool.query(
    'SELECT * FROM fi_settings WHERE department_id = $1', [departmentId]);
  return rows[0] || { ...DEFAULT_SETTINGS };
}

async function getDesignations(departmentId, userId) {
  const { rows } = await pool.query(
    `SELECT role FROM fi_designations
     WHERE department_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [departmentId, userId]);
  return new Set(rows.map((r) => r.role));
}

function deny(res, label) {
  return res.status(403).json({
    error: `This action requires ${label}.`,
    code: 'FORBIDDEN_FI',
  });
}

/** Attaches req.fi = { settings, designations, isInspector, isPreventionAdmin }. */
async function loadFiContext(req, res, next) {
  try {
    const dept = req.user?.department_id;
    if (!dept) return res.status(401).json({ error: 'Authentication required', code: 'NO_STATION' });
    const [settings, designations] = await Promise.all([
      getFiSettings(dept),
      getDesignations(dept, req.user.id),
    ]);
    const isPreventionAdmin = designations.has('prevention_admin') || roleLevel(req.user.role) >= 3;
    const isInspector = isPreventionAdmin || designations.has('inspector')
      || (settings.allow_crew_inspections === true); // crew workflow (any member) when toggled on
    req.fi = { settings, designations, isInspector, isPreventionAdmin };
    next();
  } catch (e) { next(e); }
}

function requireInspector(req, res, next) {
  if (!req.fi) return res.status(500).json({ error: 'fiAuth: loadFiContext must run first', code: 'FI_CTX_MISSING' });
  if (!req.fi.isInspector) return deny(res, 'an inspector designation (or crew inspections enabled)');
  next();
}

function requirePreventionAdmin(req, res, next) {
  if (!req.fi) return res.status(500).json({ error: 'fiAuth: loadFiContext must run first', code: 'FI_CTX_MISSING' });
  if (!req.fi.isPreventionAdmin) return deny(res, 'a prevention-admin designation (or chief authority)');
  next();
}

/** The commit gate: inspector + (admin when the department requires it). */
function requireCommit(req, res, next) {
  if (!req.fi) return res.status(500).json({ error: 'fiAuth: loadFiContext must run first', code: 'FI_CTX_MISSING' });
  if (!req.fi.isInspector) return deny(res, 'an inspector designation (or crew inspections enabled)');
  if (req.fi.settings.admin_only_commit === true && !req.fi.isPreventionAdmin) {
    return deny(res, 'a prevention-admin designation (this department restricts committing inspections to administrators)');
  }
  next();
}

module.exports = { loadFiContext, requireInspector, requirePreventionAdmin, requireCommit, getFiSettings };
