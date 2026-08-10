'use strict';
/**
 * routes/checks.js — apparatus checks (Phase 2.1, migration 0082).
 * Spec: docs/PHASE2-CHECKS-SPEC-2026-07-25.md §3.
 *
 *   Templates (officer+ writes; versioned — editing items MINTS the next version):
 *     GET/POST            /api/checks/templates        PATCH/DELETE /api/checks/templates/:id
 *   Completions (any member incl. unit sessions; a FINALIZED compliance record):
 *     GET                 /api/checks/completions      GET /api/checks/completions/:id
 *     POST                /api/checks/completions      (the ONE write door — result_code DERIVED)
 *     PATCH               /api/checks/completions/:id  → 409 RECORD_FINALIZED, unconditional
 *     DELETE              /api/checks/completions/:id  (chief; SOFT delete; reason required; audited)
 *   Due board (computed on view — no cron, no telemetry; phase §2 ceiling):
 *     GET                 /api/checks/due
 *
 * Ceilings held (phase spec §2): never touches unit_statuses or apparatus OOS; no crew
 * hard gates (the server derives the result — it never blocks the check itself); no
 * work-order mint here (2.2 builds it on this substrate). Photos ride the existing
 * generic attachments route (module 'apparatus_checks').
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireOfficer, requireChief } = require('../middleware/requireRole');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { isIsoDay, addDaysISO } = require('../utils/localDate');
const {
  FREQUENCIES, FREQUENCY_DAYS, ITEM_OUTCOMES, deriveResultCode,
} = require('../constants/checkVocab');

const idParam = z.object({ id: z.string().regex(/^\d+$/) });

/** pg returns DATE columns as JS Date objects (the 1.7 dedupe bug class) —
 *  normalize check_date to a plain YYYY-MM-DD string on every read path. */
function normalizeCheckRow(row) {
  if (row && row.check_date instanceof Date) {
    return { ...row, check_date: row.check_date.toISOString().slice(0, 10) };
  }
  if (row && typeof row.check_date === 'string' && row.check_date.length > 10) {
    return { ...row, check_date: row.check_date.slice(0, 10) };
  }
  return row;
}

const templateItem = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_.-]+$/).optional(),
  section: z.string().trim().max(100).optional(),
  label: z.string().trim().min(1).max(300),
}).strict();

const templateBase = z.object({
  name: z.string().trim().min(1).max(160),
  frequency: z.enum(FREQUENCIES).optional(),
  apparatus_id: z.number().int().positive().nullable().optional(),
  items: z.array(templateItem).min(1).max(500),
}).strict();

/** Assign stable keys to items missing one; refuse duplicate keys. */
function normalizeItems(items) {
  const seen = new Set();
  const out = items.map((it, i) => {
    const key = it.key || `k${i + 1}`;
    return { key, section: (it.section || '').trim(), label: it.label.trim() };
  });
  for (const it of out) {
    if (seen.has(it.key)) throw httpError(422, `Duplicate item key: ${it.key}`, 'DUPLICATE_ITEM_KEY');
    seen.add(it.key);
  }
  return out;
}

async function fetchTemplate(stationId, id) {
  const { rows } = await pool.query(
    `SELECT t.*, v.version AS current_version, v.items AS current_items
       FROM check_templates t
       LEFT JOIN check_template_versions v ON v.id = t.current_version_id
      WHERE t.id = $1 AND t.department_id = $2 AND t.deleted_at IS NULL`,
    [id, stationId]);
  return rows[0] || null;
}

// ── Templates ────────────────────────────────────────────────────────────────

router.get('/templates', scoped(async ({ stationId }) => {
  const { rows } = await pool.query(
    `SELECT t.id, t.name, t.apparatus_id, a.designation AS apparatus_designation,
            t.frequency, t.active, t.created_at, t.updated_at,
            v.id AS version_id, v.version, v.items
       FROM check_templates t
       LEFT JOIN check_template_versions v ON v.id = t.current_version_id
       LEFT JOIN apparatus a ON a.id = t.apparatus_id
      WHERE t.department_id = $1 AND t.deleted_at IS NULL
      ORDER BY t.active DESC, t.name`, [stationId]);
  return { data: rows };
}));

router.post('/templates', requireOfficer, validate({ body: templateBase }),
  scoped(async ({ req, stationId, user }) => {
    const b = req.body;
    const items = normalizeItems(b.items);
    if (b.apparatus_id) {
      const a = await pool.query(
        'SELECT id FROM apparatus WHERE id = $1 AND department_id = $2',
        [b.apparatus_id, stationId]);
      if (!a.rows.length) throw httpError(422, 'Apparatus not found in your department.', 'BAD_APPARATUS');
    }
    // Template + version 1 in one statement (the version INSERT reads the tpl CTE's
    // OUTPUT, which is allowed); the current_version pointer is a second statement —
    // a data-modifying CTE cannot UPDATE a row inserted by a sibling CTE (same-snapshot
    // rule; caught by the 2.1 adversarial suite before ship).
    const { rows } = await pool.query(
      `WITH tpl AS (
         INSERT INTO check_templates
           (department_id, station_id, name, apparatus_id, frequency, created_by_user_id)
         VALUES ($1, $1, $2, $3, $4, $5) RETURNING id
       )
       INSERT INTO check_template_versions (template_id, department_id, version, items, created_by_user_id)
       SELECT tpl.id, $1, 1, $6::jsonb, $5 FROM tpl RETURNING id, template_id`,
      [stationId, b.name, b.apparatus_id || null, b.frequency || 'daily',
       user.id, JSON.stringify(items)]);
    const created = { id: rows[0].template_id, version_id: rows[0].id };
    await pool.query(
      'UPDATE check_templates SET current_version_id = $1 WHERE id = $2 AND department_id = $3',
      [created.version_id, created.id, stationId]);
    await audit(stationId, user, 'create', 'check_templates', created.id,
      { name: b.name, frequency: b.frequency || 'daily', items: items.length });
    return { data: { id: created.id, version_id: created.version_id, version: 1 }, _status: 201 };
  }));

router.patch('/templates/:id', requireOfficer,
  validate({
    params: idParam,
    body: templateBase.partial().extend({ active: z.boolean().optional() }).strict(),
  }),
  scoped(async ({ req, stationId, user }) => {
    const tpl = await fetchTemplate(stationId, req.params.id);
    if (!tpl) throw httpError(404, 'Template not found.', 'NOT_FOUND');
    const b = req.body;
    if (b.apparatus_id) {
      const a = await pool.query(
        'SELECT id FROM apparatus WHERE id = $1 AND department_id = $2',
        [b.apparatus_id, stationId]);
      if (!a.rows.length) throw httpError(422, 'Apparatus not found in your department.', 'BAD_APPARATUS');
    }
    let mintedVersion = null;
    if (b.items !== undefined) {
      // Items changed ⇒ mint the NEXT version (snapshots are immutable — never UPDATE one).
      const items = normalizeItems(b.items);
      try {
        const { rows } = await pool.query(
          `WITH ver AS (
             INSERT INTO check_template_versions (template_id, department_id, version, items, created_by_user_id)
             VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id, version
           ), upd AS (
             UPDATE check_templates SET current_version_id = ver.id, updated_at = NOW()
               FROM ver WHERE check_templates.id = $1 RETURNING check_templates.id
           )
           SELECT ver.id, ver.version FROM ver`,
          [tpl.id, stationId, (tpl.current_version || 0) + 1, JSON.stringify(items), user.id]);
        mintedVersion = rows[0];
      } catch (e) {
        if (e.code === '23505') {
          throw httpError(409, 'Template was edited by someone else — reload and retry.', 'VERSION_CONFLICT');
        }
        throw e;
      }
    }
    const cols = { name: b.name, frequency: b.frequency, active: b.active };
    if (b.apparatus_id !== undefined) cols.apparatus_id = b.apparatus_id;
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(cols)) {
      if (v === undefined) continue;
      vals.push(v); sets.push(`${k} = $${vals.length}`);
    }
    if (sets.length) {
      vals.push(tpl.id, stationId);
      await pool.query(
        `UPDATE check_templates SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $${vals.length - 1} AND department_id = $${vals.length}`, vals);
    } else if (!mintedVersion) {
      throw httpError(400, 'No valid fields', 'NO_FIELDS');
    }
    await audit(stationId, user, 'update', 'check_templates', tpl.id, {
      fields: Object.keys(cols).filter((k) => cols[k] !== undefined),
      ...(mintedVersion ? { minted_version: mintedVersion.version } : {}),
    });
    const fresh = await fetchTemplate(stationId, tpl.id);
    return {
      data: {
        ...fresh,
        version: fresh.current_version,
        version_id: fresh.current_version_id,
        items: fresh.current_items,
      },
    };
  }));

router.delete('/templates/:id', requireOfficer, validate({ params: idParam }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `UPDATE check_templates SET deleted_at = NOW(), active = FALSE, updated_at = NOW()
        WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL RETURNING id, name`,
      [req.params.id, stationId]);
    if (!rows.length) throw httpError(404, 'Template not found.', 'NOT_FOUND');
    await audit(stationId, user, 'soft_delete', 'check_templates', rows[0].id, { name: rows[0].name });
    return { data: { id: rows[0].id, deleted: true } };
  }));

// ── Completions (the compliance record) ──────────────────────────────────────

const completionItem = z.object({
  item_key: z.string().trim().min(1).max(80),
  outcome: z.enum(ITEM_OUTCOMES),
  note: z.string().trim().max(1000).optional(),
}).strict();

const completionBody = z.object({
  template_id: z.number().int().positive(),
  template_version_id: z.number().int().positive(),
  apparatus_id: z.number().int().positive().optional(),
  check_date: z.string(),           // client's LOCAL day (localDate doctrine); validated below
  items: z.array(completionItem).min(1).max(500),
  notes: z.string().trim().max(4000).optional(),
}).strict();                        // strict ⇒ a client-supplied result_code is REJECTED, not ignored

router.get('/completions',
  validate({
    query: z.object({
      template_id: z.string().regex(/^\d+$/).optional(),
      apparatus_id: z.string().regex(/^\d+$/).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
    }).partial(),
  }),
  scoped(async ({ req, stationId }) => {
    const conds = ['c.department_id = $1', 'c.deleted_at IS NULL'];
    const vals = [stationId];
    if (req.query.template_id) { vals.push(req.query.template_id); conds.push(`c.template_id = $${vals.length}`); }
    if (req.query.apparatus_id) { vals.push(req.query.apparatus_id); conds.push(`c.apparatus_id = $${vals.length}`); }
    const limit = Math.min(Number(req.query.limit || 100), 500);
    vals.push(limit);
    const { rows } = await pool.query(
      `SELECT c.*, t.name AS template_name
         FROM apparatus_checks c
         JOIN check_templates t ON t.id = c.template_id
        WHERE ${conds.join(' AND ')}
        ORDER BY c.check_date DESC, c.id DESC
        LIMIT $${vals.length}`, vals);
    return { data: rows.map(normalizeCheckRow) };
  }));

router.get('/completions/:id', validate({ params: idParam }),
  scoped(async ({ req, stationId }) => {
    const { rows } = await pool.query(
      `SELECT c.*, t.name AS template_name
         FROM apparatus_checks c
         JOIN check_templates t ON t.id = c.template_id
        WHERE c.id = $1 AND c.department_id = $2 AND c.deleted_at IS NULL`,
      [req.params.id, stationId]);
    if (!rows.length) throw httpError(404, 'Check not found.', 'NOT_FOUND');
    const items = await pool.query(
      `SELECT id, item_key, section, label, outcome, note
         FROM apparatus_check_items WHERE check_id = $1 ORDER BY id`, [rows[0].id]);
    return { data: { ...normalizeCheckRow(rows[0]), items: items.rows } };
  }));

/**
 * THE completion engine — the ONE door (2.6). The online route below and the
 * fi-sync `check.complete` applier both call THIS function, so a queued offline
 * check is held to the exact same rules as a live one, forever, without anyone
 * remembering to update two copies (the fiSync "imported, not copy-pasted" rule).
 * `body` must already be completionBody-validated by the caller.
 */
async function applyCheckCompletion({ stationId, user, body }) {
    const b = body;
    if (!isIsoDay(b.check_date)) {
      throw httpError(422, 'check_date must be a real calendar day (YYYY-MM-DD).', 'BAD_DATE');
    }
    // Sanity ceiling only: never more than 1 day ahead of the server's UTC day.
    // (The past stays open — 2.6's offline sync legitimately records yesterday's check.)
    const serverDay = new Date().toISOString().slice(0, 10);
    if (b.check_date > addDaysISO(serverDay, 1)) {
      throw httpError(422, 'check_date is in the future.', 'BAD_DATE');
    }

    const tpl = await fetchTemplate(stationId, b.template_id);
    if (!tpl || !tpl.active) throw httpError(404, 'Template not found or inactive.', 'NOT_FOUND');
    if (tpl.current_version_id !== b.template_version_id) {
      // The template changed after the client rendered it — never attach outcomes to
      // items the officer just edited. Client refetches and re-renders.
      throw httpError(409, 'This checklist was updated — reload it and run the check again.',
        'STALE_TEMPLATE_VERSION');
    }

    // Resolve the rig: a rig-bound template pins it; a generic template requires one.
    let apparatusId = tpl.apparatus_id;
    if (apparatusId) {
      if (b.apparatus_id && b.apparatus_id !== apparatusId) {
        throw httpError(422, 'This checklist is bound to a different apparatus.', 'BAD_APPARATUS');
      }
    } else {
      if (!b.apparatus_id) throw httpError(422, 'apparatus_id is required for this checklist.', 'BAD_APPARATUS');
      apparatusId = b.apparatus_id;
    }
    const app = await pool.query(
      'SELECT id, designation FROM apparatus WHERE id = $1 AND department_id = $2',
      [apparatusId, stationId]);
    if (!app.rows.length) throw httpError(422, 'Apparatus not found in your department.', 'BAD_APPARATUS');

    // Every snapshot item answered exactly once; no unknown keys; sections/labels
    // denormalized from the SNAPSHOT (client copies are never trusted).
    const snapshot = Array.isArray(tpl.current_items) ? tpl.current_items : [];
    const byKey = new Map(snapshot.map((it) => [it.key, it]));
    const answered = new Set();
    const itemRows = [];
    for (const it of b.items) {
      const snap = byKey.get(it.item_key);
      if (!snap) throw httpError(422, `Unknown checklist item: ${it.item_key}`, 'UNKNOWN_ITEM');
      if (answered.has(it.item_key)) throw httpError(422, `Item answered twice: ${it.item_key}`, 'DUPLICATE_ITEM');
      answered.add(it.item_key);
      itemRows.push({
        item_key: it.item_key,
        section: snap.section || '',
        label: snap.label,
        outcome: it.outcome,
        note: it.note || '',
      });
    }
    if (answered.size !== snapshot.length) {
      const missing = snapshot.filter((it) => !answered.has(it.key)).map((it) => it.key);
      throw httpError(422, `Every item must be answered (pass, fail, or N/A). Missing: ${missing.join(', ')}`,
        'INCOMPLETE_CHECK', { missing });
    }

    // THE derivation — the passed-with-open-defect guard. Never client input.
    const resultCode = deriveResultCode(itemRows.map((r) => r.outcome));
    const failedCount = itemRows.filter((r) => r.outcome === 'fail').length;

    // One atomic statement: the check + every item outcome.
    const { rows } = await pool.query(
      `WITH chk AS (
         INSERT INTO apparatus_checks
           (department_id, station_id, template_id, template_version_id, apparatus_id,
            apparatus_name, frequency, check_date, completed_by_user_id, completed_by_name,
            result_code, item_count, failed_count, notes)
         VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *
       ), its AS (
         INSERT INTO apparatus_check_items
           (check_id, department_id, item_key, section, label, outcome, note)
         SELECT chk.id, $1, x.item_key, x.section, x.label, x.outcome, x.note
           FROM chk, jsonb_to_recordset($14::jsonb)
                AS x(item_key text, section text, label text, outcome text, note text)
         RETURNING id
       )
       SELECT chk.*, (SELECT COUNT(*) FROM its)::int AS items_written FROM chk`,
      [stationId, tpl.id, b.template_version_id, apparatusId, app.rows[0].designation || '',
       tpl.frequency, b.check_date, user.id, user.name || user.username || '',
       resultCode, itemRows.length, failedCount, b.notes || '',
       JSON.stringify(itemRows)]);
    const created = normalizeCheckRow(rows[0]);
    await audit(stationId, user, 'create', 'apparatus_checks', created.id, {
      template_id: tpl.id, apparatus_id: apparatusId,
      result_code: resultCode, failed: failedCount, items: itemRows.length,
    });
    return created;
}

router.post('/completions', validate({ body: completionBody }),
  scoped(async ({ req, stationId, user }) => {
    const created = await applyCheckCompletion({ stationId, user, body: req.body });
    return { data: created, _status: 201 };
  }));

// A completed check is FINAL. Unconditional — there is no amendable field (fi doctrine).
router.patch('/completions/:id', validate({ params: idParam }),
  scoped(async () => {
    throw httpError(409, 'A completed check is a finalized record and cannot be edited.',
      'RECORD_FINALIZED');
  }));

router.delete('/completions/:id', requireChief,
  validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3).max(500) }).strict() }),
  scoped(async ({ req, stationId, user }) => {
    const { rows } = await pool.query(
      `UPDATE apparatus_checks SET deleted_at = NOW()
        WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL
        RETURNING id, template_id, result_code`,
      [req.params.id, stationId]);
    if (!rows.length) throw httpError(404, 'Check not found.', 'NOT_FOUND');
    await audit(stationId, user, 'soft_delete', 'apparatus_checks', rows[0].id,
      { reason: req.body.reason, result_code: rows[0].result_code });
    return { data: { id: rows[0].id, deleted: true } };
  }));

// ── Due board (computed on view; ?today= is the CLIENT's local day per localDate doctrine) ──

async function computeDueBoard(stationId, today) {
    const { rows } = await pool.query(
      `WITH targets AS (
         SELECT t.id AS template_id, t.name, t.frequency,
                COALESCE(t.apparatus_id, a.id) AS apparatus_id,
                COALESCE(ta.designation, a.designation) AS designation,
                COALESCE(ta.status, a.status) AS apparatus_status
           FROM check_templates t
           LEFT JOIN apparatus ta ON ta.id = t.apparatus_id
           LEFT JOIN apparatus a
             ON t.apparatus_id IS NULL AND a.department_id = t.department_id
          WHERE t.department_id = $1 AND t.deleted_at IS NULL AND t.active = TRUE
       ), latest AS (
         SELECT DISTINCT ON (c.template_id, c.apparatus_id)
                c.template_id, c.apparatus_id, c.check_date, c.result_code
           FROM apparatus_checks c
          WHERE c.department_id = $1 AND c.deleted_at IS NULL
          ORDER BY c.template_id, c.apparatus_id, c.check_date DESC, c.id DESC
       )
       SELECT tg.template_id, tg.name, tg.frequency, tg.apparatus_id, tg.designation,
              tg.apparatus_status, l.check_date AS last_check_date, l.result_code AS last_result
         FROM targets tg
         LEFT JOIN latest l
           ON l.template_id = tg.template_id AND l.apparatus_id = tg.apparatus_id
        WHERE tg.apparatus_id IS NOT NULL
        ORDER BY tg.name, tg.designation`, [stationId]);
    const data = rows.map((r) => {
      // 2.2: an OOS rig's checks are PAUSED (the documented market behavior — the
      // system REACTS to a human OOS decision; it never makes one). Not due/overdue.
      if (r.apparatus_status === 'Out of Service') {
        return { ...r, due_date: null, due_state: 'oos' };
      }
      const interval = FREQUENCY_DAYS[r.frequency] || 1;
      let dueState = 'due'; // never checked ⇒ due now
      let dueDate = null;
      let last = null;
      if (r.last_check_date) {
        // pg returns DATE as a JS Date (the 1.7 dedupe bug class) — the row must
        // carry the plain YYYY-MM-DD day, never a raw ISO serialization (leaked
        // as "last 2026-07-26T04:00:00.000Z" on the OFM due board, 2026-07-26).
        last = (r.last_check_date instanceof Date)
          ? r.last_check_date.toISOString().slice(0, 10)
          : String(r.last_check_date).slice(0, 10);
        dueDate = addDaysISO(last, interval);
        dueState = today < dueDate ? 'ok' : (today === dueDate ? 'due' : 'overdue');
      }
      return { ...r, last_check_date: last, due_date: dueDate, due_state: dueState };
    });
    return data;
}

router.get('/due',
  validate({ query: z.object({ today: z.string().optional() }).partial() }),
  scoped(async ({ req, stationId }) => {
    const today = (req.query.today && isIsoDay(req.query.today))
      ? req.query.today : new Date().toISOString().slice(0, 10);
    return { data: await computeDueBoard(stationId, today) };
  }));

// ── Offline pack (2.6) — one crew-readable payload the device caches before ──
// losing signal: active templates WITH their current-version item snapshots
// (versions pinned at cache time — a template edited while the crew is offline
// yields a terminal STALE_TEMPLATE_VERSION on drain, work preserved), the
// apparatus list, and the due board. ?today= is the CLIENT's local day
// (localDate doctrine). Spec: docs/PHASE2-OFM-FIELD-SPEC-2026-07-26.md §1.
router.get('/offline-pack',
  validate({ query: z.object({ today: z.string().optional() }).partial() }),
  scoped(async ({ req, stationId }) => {
    const today = (req.query.today && isIsoDay(req.query.today))
      ? req.query.today : new Date().toISOString().slice(0, 10);
    const [templates, apparatus, due] = await Promise.all([
      pool.query(
        `SELECT t.id, t.name, t.frequency, t.apparatus_id, t.current_version_id,
                v.version AS current_version, v.items AS current_items
           FROM check_templates t
           LEFT JOIN check_template_versions v ON v.id = t.current_version_id
          WHERE t.department_id = $1 AND t.deleted_at IS NULL AND t.active = TRUE
          ORDER BY t.name`, [stationId]).then((r) => r.rows),
      pool.query(
        `SELECT id, designation, type, status FROM apparatus
          WHERE department_id = $1 ORDER BY designation`, [stationId]).then((r) => r.rows),
      computeDueBoard(stationId, today),
    ]);
    return { data: { templates, apparatus, due, packedAt: new Date().toISOString() } };
  }));

module.exports = router;
module.exports.completionBody = completionBody;
module.exports.applyCheckCompletion = applyCheckCompletion;
