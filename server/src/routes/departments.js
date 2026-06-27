'use strict';
/**
 * routes/departments.js — P4.2 department self-service.
 *
 * Mounted BEHIND requireAuth + the dbTransaction GUC middleware. `departments`
 * has no RLS policy (it has no department_id column — it IS the tenant root), so
 * isolation here is app-layer: every query is scoped to req.user.department_id,
 * and PATCH refuses any id other than the caller's own department.
 *
 * Tier is attestation-based (OF EULA §5): re-attesting recomputes plan_tier and
 * returns an advisory — it NEVER blocks.
 */
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireChief } = require('../middleware/requireRole');
const { classifyTier, STORAGE_QUOTA_GB, STORAGE_OVERAGE_USD_PER_GB, STORAGE_WARN_FRACTION } = require('../lib/licensing');
const { generateJoinCode, hashInviteToken } = require('../utils/inviteToken');
const { audit } = require('../utils/auditLog');

const router = express.Router();

// GET /api/departments/me — the caller's department.
router.get('/me', scoped(async ({ user }) => {
  const { rows } = await db.pool.query(
    'SELECT id, name, fdid, dept_type, shift_pattern, plan_tier, created_at FROM departments WHERE id = $1',
    [user.department_id]
  );
  if (!rows.length) throw httpError(404, 'Department not found', 'NOT_FOUND');
  return { data: rows[0] };
}));

// ── POST /api/departments/join-code — generate/rotate a self-join code (chief) ─
// Members redeem this at POST /api/auth/join. Only the sha256 hash is stored; the
// plaintext is returned ONCE here for the chief to share. Rotating revokes prior
// active codes. 30-day expiry.
router.post('/join-code', requireChief, scoped(async ({ user }) => {
  await db.pool.query(
    'UPDATE of_department_join_codes SET revoked_at = now() WHERE department_id = $1 AND revoked_at IS NULL',
    [user.department_id]
  );
  const code = generateJoinCode();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const r = await db.pool.query(
    `INSERT INTO of_department_join_codes (department_id, code_hash, expires_at, created_by_user_id)
     VALUES ($1, $2, $3, $4) RETURNING id, expires_at`,
    [user.department_id, hashInviteToken(code), expiresAt, user.id]
  );
  await audit(user.department_id, user, 'create', 'of_department_join_codes', r.rows[0].id, {});
  return { _status: 201, data: { code, expires_at: r.rows[0].expires_at } };
}));

// ── GET /api/departments/join-code — current code status (chief) ──────────────
// The code itself can't be shown (stored hashed) — only whether one is active.
router.get('/join-code', requireChief, scoped(async ({ user }) => {
  const r = await db.pool.query(
    `SELECT expires_at FROM of_department_join_codes
       WHERE department_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
    [user.department_id]
  );
  return { data: { active: r.rows.length > 0, expires_at: r.rows[0]?.expires_at || null } };
}));

// ── GET /api/departments/tier-status — P4.5 advisory: attested tier (provisioning
// layer) joined with license status (entitlement layer). ADVISORY ONLY — never a
// hard block (OF EULA is attestation-based; a department keeps its tier through
// the paid year and re-attests at renewal). Surfaces the next step (buy/activate).
router.get('/tier-status', requireChief, scoped(async ({ user }) => {
  const { rows } = await db.pool.query('SELECT plan_tier FROM departments WHERE id = $1', [user.department_id]);
  const attestedTier = rows[0]?.plan_tier || 'independent';
  const paidTier = attestedTier !== 'independent';

  // License (entitlement) status via the runtime validator. Degrades gracefully
  // when the licensing backend isn't configured (e.g. local dev) — never throws.
  let license = { activated: false, reason: 'no_license_on_file' };
  try {
    const { loadActivatedJwt, validateLicense } = require('../lib/licenseRuntime');
    const token = await loadActivatedJwt(user.department_id);
    if (token) { const s = await validateLicense(token); license = { activated: !!s.active, ...s }; }
  } catch (_) {
    license = { activated: false, reason: 'status_unavailable' };
  }

  let advisory = null;
  if (paidTier && !license.activated) {
    advisory = {
      kind: 'needs_license',
      message: `Your attested size classifies as "${attestedTier.replace('_', ' ')}". Activate a paid license to unlock cloud features — nothing is blocked in the meantime.`,
      buy: '/api/checkout',
      activate: 'settings_activate_license',
    };
  } else if (paidTier && license.activated && license.tier && license.tier !== attestedTier) {
    advisory = {
      kind: 'reattest',
      message: `Your active license is "${String(license.tier).replace('_', ' ')}" but your attested size now classifies as "${attestedTier.replace('_', ' ')}". Re-attestation takes effect at renewal — never mid-year, never retroactive.`,
      effective_at: 'next_renewal',
    };
  }

  // Storage metering (real usage from the file-bearing tables) + quota advisory.
  // ADVISORY only — overage is billed $0.05/GB/mo with an 80% warning; never blocked.
  const GB = 1024 ** 3;
  // Covers DB-resident content + the attachment registry's recorded file sizes:
  // attachments/correspondence (file_size of uploaded files) + the inline document
  // bodies (dept_documents.content, sogs.content) + incident photos. URL-only
  // pointers whose bytes live in a Storage bucket outside the attachments registry
  // aren't separately counted (future: Supabase Storage API).
  const su = await db.pool.query(
    `SELECT
         COALESCE((SELECT SUM(file_size)             FROM attachments    WHERE department_id = $1), 0)
       + COALESCE((SELECT SUM(file_size)             FROM correspondence WHERE department_id = $1), 0)
       + COALESCE((SELECT SUM(octet_length(content)) FROM dept_documents WHERE department_id = $1), 0)
       + COALESCE((SELECT SUM(octet_length(content)) FROM sogs           WHERE department_id = $1), 0)
       + COALESCE((SELECT SUM(octet_length(photos))  FROM incidents      WHERE department_id = $1), 0) AS used_bytes`,
    [user.department_id]
  );
  const usedBytes = Number(su.rows[0].used_bytes) || 0;
  const quotaGb = STORAGE_QUOTA_GB[attestedTier] ?? STORAGE_QUOTA_GB.independent;
  const usedGb = usedBytes / GB;
  const fraction = quotaGb > 0 ? usedGb / quotaGb : 0;
  const overageGb = Math.max(0, usedGb - quotaGb);
  const storage = {
    used_bytes: usedBytes,
    used_gb: Number(usedGb.toFixed(3)),
    quota_gb: quotaGb,
    percent: Math.round(fraction * 100),
    warn: fraction >= STORAGE_WARN_FRACTION,
    over_quota: overageGb > 0,
    overage_gb: Number(overageGb.toFixed(3)),
    overage_est_usd_per_mo: Number((overageGb * STORAGE_OVERAGE_USD_PER_GB).toFixed(2)),
    advisory: null,
  };
  if (storage.over_quota) {
    storage.advisory = `You're ${storage.overage_gb} GB over your ${quotaGb} GB quota — about $${storage.overage_est_usd_per_mo}/mo overage at $0.05/GB. Delete old content or upgrade; nothing is blocked.`;
  } else if (storage.warn) {
    storage.advisory = `You've used ${storage.percent}% of your ${quotaGb} GB storage quota. Nothing is blocked — you can delete old content or upgrade before overage begins.`;
  }

  return { data: { attested_tier: attestedTier, paid_tier: paidTier, license, advisory, storage, hard_caps: false } };
}));

const patchSchema = z.looseObject({
  name:              z.string().min(1).max(200).optional(),
  fdid:              z.string().max(10).optional(),
  dept_type:         z.string().max(40).optional(),
  shift_pattern:     z.string().max(60).optional(),
  attestedMembers:   z.number().int().min(0).max(100000).optional(),
  attestedStations:  z.number().int().min(0).max(1000).optional(),
  attestedBudgetUsd: z.number().min(0).optional(),
});

// PATCH /api/departments/:id — chief-only; edit metadata + re-attest size (advisory).
router.patch('/:id',
  requireChief,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }), body: patchSchema }),
  scoped(async ({ req, user }) => {
    if (Number(req.params.id) !== Number(user.department_id)) {
      throw httpError(404, 'Department not found', 'NOT_FOUND'); // only your own dept
    }
    const b = req.body;
    const sets = [];
    const vals = [];
    let i = 1;
    if (b.name !== undefined)      { sets.push(`name = $${i++}`);      vals.push(b.name.trim()); }
    if (b.fdid !== undefined)      { sets.push(`fdid = $${i++}`);      vals.push(b.fdid); }
    if (b.dept_type !== undefined) { sets.push(`dept_type = $${i++}`); vals.push(b.dept_type); }
    if (b.shift_pattern !== undefined) { sets.push(`shift_pattern = $${i++}`); vals.push(b.shift_pattern); }

    let tierAdvisory = null;
    if (b.attestedMembers !== undefined || b.attestedStations !== undefined || b.attestedBudgetUsd !== undefined) {
      const tier = classifyTier({
        members:    b.attestedMembers   || 0,
        stations:   b.attestedStations  || 0,
        budget_usd: b.attestedBudgetUsd || 0,
      });
      sets.push(`plan_tier = $${i++}`); vals.push(tier);
      tierAdvisory = { tier, reattest_required: true, effective_at: 'next_renewal' };
    }

    if (!sets.length) throw httpError(400, 'No updatable fields provided', 'NO_FIELDS');
    sets.push('updated_at = now()');
    vals.push(user.department_id);
    const { rows } = await db.pool.query(
      `UPDATE departments SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, name, fdid, dept_type, shift_pattern, plan_tier`,
      vals
    );
    return { data: rows[0], tier_advisory: tierAdvisory };
  })
);

module.exports = router;
