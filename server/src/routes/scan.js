'use strict';
/**
 * routes/scan.js — barcode/QR resolution + label payloads (Phase 2.5, migration 0086).
 * Spec: docs/PHASE2-BARCODE-SPEC-2026-07-26.md.
 *
 * Scanning is READ-RESOLUTION ONLY — it accelerates the doors 2.1–2.4 built and never
 * becomes a write path or a gate. Tags are opaque and unguessable; resolution is
 * dept-scoped, so a label from another department resolves to NOTHING (404).
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { z } = require('zod');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireMechanic } = require('../middleware/requireRole');
const { pool } = require('../db');

const TAG_RE = /^ofh[0-9a-f]{20}$/;
const mintTag = () => 'ofh' + crypto.randomBytes(10).toString('hex');

const KINDS = {
  asset: {
    table: 'tracked_assets',
    summary: `SELECT id, scan_tag, name, family, serial, status FROM tracked_assets
               WHERE scan_tag = $1 AND department_id = $2 AND deleted_at IS NULL`,
  },
  item: {
    table: 'inventory_items',
    summary: `SELECT id, scan_tag, name, category, unit, tracks_lots FROM inventory_items
               WHERE scan_tag = $1 AND department_id = $2 AND deleted_at IS NULL`,
  },
  location: {
    table: 'inventory_locations',
    summary: `SELECT id, scan_tag, name, kind FROM inventory_locations
               WHERE scan_tag = $1 AND department_id = $2 AND deleted_at IS NULL`,
  },
  apparatus: {
    table: 'apparatus',
    summary: `SELECT id, scan_tag, designation AS name, type, status FROM apparatus
               WHERE scan_tag = $1 AND department_id = $2`,
  },
};

// Any member: what is this label? (Read-only; foreign/unknown tags are indistinguishable.)
router.get('/resolve/:tag',
  validate({ params: z.object({ tag: z.string().regex(TAG_RE) }) }),
  scoped(async ({ req, stationId }) => {
    for (const [kind, cfg] of Object.entries(KINDS)) {
      const { rows } = await pool.query(cfg.summary, [req.params.tag, stationId]);
      if (rows.length) return { data: { kind, record: rows[0] } };
    }
    throw httpError(404, 'Nothing in your department matches this label.', 'NOT_FOUND');
  }));

// Mechanic/chief: label payloads for a print sheet (mints missing tags on the way).
router.post('/labels', requireMechanic,
  validate({
    body: z.object({
      kind: z.enum(['asset', 'item', 'location', 'apparatus']),
      ids: z.array(z.number().int().positive()).min(1).max(200),
    }).strict(),
  }),
  scoped(async ({ req, stationId }) => {
    const { kind, ids } = req.body;
    const cfg = KINDS[kind];
    const nameCol = kind === 'apparatus' ? 'designation' : 'name';
    const sub = kind === 'asset' ? 'family' : kind === 'item' ? 'category' : kind === 'location' ? 'kind' : 'type';
    const del = kind === 'apparatus' ? '' : 'AND deleted_at IS NULL';
    const { rows } = await pool.query(
      `SELECT id, scan_tag, ${nameCol} AS title, ${sub} AS subtitle
         FROM ${cfg.table} WHERE id = ANY($1) AND department_id = $2 ${del}`,
      [ids, stationId]);
    if (!rows.length) throw httpError(404, 'No matching records.', 'NOT_FOUND');
    const out = [];
    for (const r of rows) {
      let tag = r.scan_tag;
      if (!tag) {
        tag = mintTag();
        await pool.query(`UPDATE ${cfg.table} SET scan_tag = $1 WHERE id = $2 AND department_id = $3`,
          [tag, r.id, stationId]);
      }
      out.push({ id: r.id, tag, code: `OFH1:${tag}`, title: r.title, subtitle: r.subtitle || '' });
    }
    return { data: out };
  }));

module.exports = { router, mintTag };
