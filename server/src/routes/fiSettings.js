'use strict';
/**
 * routes/fiSettings.js — per-department prevention toggles (Phase 2.4):
 *   allow_crew_inspections — engine-company inspections by undesignated members
 *                            (incumbent workflow; default ON; bureau-only depts
 *                            turn it off)
 *   admin_only_commit      — the incumbent "only administrators may commit
 *                            inspections" restriction (default OFF)
 * Chief-gated writes, audited. Lives in fi_settings (own table — see 0049).
 *
 * ── 3.2 billing config (added Slice D, 2026-08-07) ────────────────────────────
 * Three columns shipped with 0125/0126 and had NO WRITE PATH ANYWHERE, which made
 * the entire invoice + payment surface unreachable: both mint routes refuse with
 * 409 INVOICE_PREFIX_NOT_CONFIGURED until a prefix is set. 0125's own header says
 * "The route refuses to issue until a prefix is configured" — the config path was
 * always intended, it was simply never built.
 *
 *   invoice_number_prefix     — the DEPT segment of FY-DEPT-NNNNNN. Ships '',
 *                               meaning NOT YET CONFIGURED; the allocator's CHECK
 *                               is {1,12} precisely so '' can never mint
 *                               FY2026--000001 onto a document retained forever.
 *   fiscal_year_start_month   — 1..12, default 1 (calendar year). §1.8 records the
 *                               per-fiscal-year reset requirement as UNVERIFIED, so
 *                               this is CONFIG, not a claim about the law.
 *   waiver_approval_threshold — the R9 band. NULL = no band, and NULL is NOT 0.
 *                               Ships unset on purpose: an unchosen default is a
 *                               decision nobody made, and this one is an unratified
 *                               money-approval policy.
 *
 * The zod rules below MIRROR THE DATABASE CHECKS EXACTLY, so the app's refusal and
 * the database's refusal are the same refusal rather than two different opinions.
 *
 * 🔴 THE BODY IS .strict() AND MUST STAY .strict(). It was a bare z.object, so an
 * unknown key was STRIPPED IN SILENCE and the PATCH answered 200 having changed
 * nothing — which is how a setting "saves" in the UI and is absent from the
 * database. That is precisely how these three columns stayed unreachable while
 * looking settable.
 *
 * ⚠️ COUPLING, made explicit because the client depends on it: PreventionSettings
 * calls `fi.settings.patch(form)` where `form` IS the GET response. So every column
 * this route RETURNS must also be a column it ACCEPTS, or saving breaks entirely.
 * Guarded by the round-trip test in tests/fiSettingsBilling.test.js — if you add a
 * column to fullSettings(), add it to the schema in the same edit.
 */
const express = require('express');
const router  = express.Router();
const { z } = require('zod');
const { pool } = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireChief } = require('../middleware/requireRole');
const { audit } = require('../utils/auditLog');
const { getFiSettings } = require('../middleware/fiAuth');

// P2.3: the notice text blocks (decision §7.3 — DEPARTMENT-authored; the PDF
// builder renders clearly-flagged generic samples when a block is empty).
const TEXT_BLOCKS = ['notice_header', 'notice_body', 'notice_legalese',
                     'notice_passed_body', 'notice_footer', 'signature_agreement_text'];

// 3.2 billing config. Separate list because these are MONEY policy, not workflow.
const BILLING_COLS = ['invoice_number_prefix', 'fiscal_year_start_month',
                      'waiver_approval_threshold'];

const BILLING_DEFAULTS = {
  invoice_number_prefix: '',        // '' = not yet configured; minting refuses
  fiscal_year_start_month: 1,       // calendar year
  waiver_approval_threshold: null,  // NULL = no band (R9 ships unset). NOT 0.
};

async function fullSettings(stationId) {
  const { rows } = await pool.query(
    `SELECT allow_crew_inspections, admin_only_commit,
            ${BILLING_COLS.join(', ')}, ${TEXT_BLOCKS.join(', ')}
     FROM fi_settings WHERE department_id = $1`, [stationId]);
  return rows[0] || {
    allow_crew_inspections: true, admin_only_commit: false,
    ...BILLING_DEFAULTS,
    ...Object.fromEntries(TEXT_BLOCKS.map((k) => [k, ''])),
  };
}

router.get('/', scoped(async ({ stationId }) => ({ data: await fullSettings(stationId) })));

router.patch('/', requireChief,
  validate({ body: z.object({
    allow_crew_inspections: z.boolean().optional(),
    admin_only_commit:      z.boolean().optional(),

    // CHECK (invoice_number_prefix ~ '^[A-Z0-9]{0,12}$') — no whitespace, no hyphen
    // (the field separator), no lowercase: it goes INTO a number retained forever.
    invoice_number_prefix: z.string()
      .regex(/^[A-Z0-9]{0,12}$/, 'must be up to 12 characters, A–Z and 0–9 only — '
        + 'no spaces, no hyphens, no lowercase')
      .optional(),

    // CHECK (fiscal_year_start_month BETWEEN 1 AND 12)
    fiscal_year_start_month: z.number().int()
      .min(1, 'must be a month, 1–12').max(12, 'must be a month, 1–12').optional(),

    // CHECK (waiver_approval_threshold IS NULL OR >= 0). Money is a STRING over the
    // wire like every other amount in this module — never a JSON number. null is
    // meaningful and must round-trip: NULL = no band, which is not the same as 0.
    waiver_approval_threshold: z.union([
      z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'must be a dollar amount like 250.00, '
        + 'or left empty for no threshold'),
      z.null(),
    ]).optional(),

    ...Object.fromEntries(TEXT_BLOCKS.map((k) => [k, z.string().max(8000).optional()])),
  }).strict().refine((b) => Object.keys(b).length > 0, 'No settings in request') }),
  scoped(async ({ req, stationId, user }) => {
    const next = { ...(await fullSettings(stationId)), ...req.body };
    const cols = ['allow_crew_inspections', 'admin_only_commit', ...BILLING_COLS, ...TEXT_BLOCKS];
    try {
      await pool.query(
        `INSERT INTO fi_settings (department_id, ${cols.join(', ')}, updated_at)
         VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}, NOW())
         ON CONFLICT (department_id) DO UPDATE
           SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = NOW()`,
        [stationId, ...cols.map((c) => next[c])]);
    } catch (e) {
      // The DB is the authority; this is the human-readable path to the same no.
      if (e.code === '23514') {
        // Deliberately NO constraint name: errorHandler genericises 5xx precisely so schema
        // internals do not reach a client, and re-throwing a 23514 as a 4xx would route
        // around that. It tells a clerk nothing either.
        throw httpError(422, 'That billing setting is not allowed — check the prefix format '
          + '(A–Z and 0–9, up to 12), the fiscal-year start month (1–12), and that the waiver '
          + 'threshold is not negative.', 'INVALID_BILLING_SETTING');
      }
      throw e;
    }
    await audit(stationId, user, 'update', 'fi_settings', stationId, { fields: Object.keys(req.body) });
    return { data: next };
  }));

module.exports = router;
