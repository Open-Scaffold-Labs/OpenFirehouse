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
const rateLimit = require('express-rate-limit');
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
    'SELECT id, name, fdid, dept_type, shift_pattern, allow_rig_status, status_timer_config, par_interval_default_min, plan_tier, neris_id, neris_submission_enabled, session_idle_minutes_web, session_idle_minutes_mobile, session_max_hours, mfa_required, created_at FROM departments WHERE id = $1',
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
  allow_rig_status:  z.boolean().optional(), // 0040 — rig self-statusing gate
  // 0064 — NERIS Track B: the department's NERIS entity id (two letters + 8
  // digits, e.g. FD12345678; empty clears) and the live-submission gate
  // (DEFAULT FALSE — a chief explicitly turns national submission on).
  neris_id: z.string().regex(/^([A-Z]{2}\d{8})?$/, 'NERIS entity ID must look like FD12345678').optional(),
  neris_submission_enabled: z.boolean().optional(),
  // 0062 — department SOG default for the PAR interval (minutes). null clears
  // it (= no timer until command sets one — there is NO NFPA-mandated interval,
  // never hardcode one). Range mirrors the DB CHECK.
  par_interval_default_min: z.number().int().min(1).max(180).nullable().optional(),
  // 0075 — per-department minimum-staffing config + warn/block enforcement.
  // null min clears the explicit minimum (falls back to the historic default).
  min_staffing_per_shift: z.number().int().min(0).max(100).nullable().optional(),
  staffing_enforcement: z.enum(['warn', 'block']).optional(),
  // 0057 (par_anchor) is CLOSED as a pending decision (Matt, 2026-07-16): the
  // dispatch-anchored default matches the market leader, no vendor ships a
  // configurable anchor, and the setting is parked until a real department
  // whose dispatcher counts from on-scene asks. The 0057 file stays on disk as
  // the ready-made implementation. If it is ever revived: apply 0057 in the
  // SAME change as the code that reads it — Vercel auto-deploys on push, so
  // shipping the code alone means live requests SELECT a column that does not
  // exist.
  // 0046 — per-status timer thresholds (minutes; 0 = off; null = defaults).
  // NOTE: z.record(z.enum(...), v) in Zod 4 demands EVERY enum key (exhaustive
  // records) — a partial config 400'd on prod (caught live 2026-07-12). An
  // all-optional strict object is the partial-record shape we actually want.
  status_timer_config: z.strictObject({
    dispatched:     z.number().int().min(0).max(1440).optional(),
    enroute:        z.number().int().min(0).max(1440).optional(),
    on_scene:       z.number().int().min(0).max(1440).optional(),
    transporting:   z.number().int().min(0).max(1440).optional(),
    at_hospital:    z.number().int().min(0).max(1440).optional(),
    returning:      z.number().int().min(0).max(1440).optional(),
    in_service:     z.number().int().min(0).max(1440).optional(),
    on_the_air:     z.number().int().min(0).max(1440).optional(),
    out_of_service: z.number().int().min(0).max(1440).optional(),
  }).nullable().optional(),
  // 0110 (Phase 5) — session + idle timeout. Ranges MIRROR the DB CHECK
  // constraints exactly, so bad input is a clean 400 rather than a Postgres
  // error surfacing through the 500 handler. Defaults are the pre-0110
  // behaviour (7d / 7d / 168h): a department that never touches these sees
  // no change whatsoever.
  session_idle_minutes_web:    z.number().int().min(5).max(10080).optional(),
  session_idle_minutes_mobile: z.number().int().min(5).max(10080).optional(),
  session_max_hours:           z.number().int().min(1).max(168).optional(),
  // 0111 (Phase 5) — org-wide MFA mandate. 4 of 12 competitors let an admin
  // mandate MFA; one cannot mandate it at all. DEFAULT FALSE — turning this on
  // for a whole volunteer roster is an explicit chief decision, never implicit.
  mfa_required: z.boolean().optional(),
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
    if (b.allow_rig_status !== undefined) { sets.push(`allow_rig_status = $${i++}`); vals.push(b.allow_rig_status); }
    if (b.neris_id !== undefined) { sets.push(`neris_id = $${i++}`); vals.push(b.neris_id); }
    if (b.neris_submission_enabled !== undefined) { sets.push(`neris_submission_enabled = $${i++}`); vals.push(b.neris_submission_enabled); }
    if (b.status_timer_config !== undefined) { sets.push(`status_timer_config = $${i++}`); vals.push(b.status_timer_config == null ? null : JSON.stringify(b.status_timer_config)); }
    if (b.par_interval_default_min !== undefined) { sets.push(`par_interval_default_min = $${i++}`); vals.push(b.par_interval_default_min); }
    if (b.min_staffing_per_shift !== undefined) { sets.push(`min_staffing_per_shift = $${i++}`); vals.push(b.min_staffing_per_shift); }
    if (b.staffing_enforcement !== undefined) { sets.push(`staffing_enforcement = $${i++}`); vals.push(b.staffing_enforcement); }
    // 0110 — session policy. Takes effect on each user's NEXT login or token
    // refresh (tokens already minted carry their own expiry); it does not and
    // must not retroactively invalidate a session mid-incident.
    if (b.session_idle_minutes_web !== undefined)    { sets.push(`session_idle_minutes_web = $${i++}`);    vals.push(b.session_idle_minutes_web); }
    if (b.session_idle_minutes_mobile !== undefined) { sets.push(`session_idle_minutes_mobile = $${i++}`); vals.push(b.session_idle_minutes_mobile); }
    if (b.session_max_hours !== undefined)           { sets.push(`session_max_hours = $${i++}`);           vals.push(b.session_max_hours); }
    if (b.mfa_required !== undefined)                { sets.push(`mfa_required = $${i++}`);                vals.push(b.mfa_required); }

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
      `UPDATE departments SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, name, fdid, dept_type, shift_pattern, allow_rig_status, status_timer_config, par_interval_default_min, min_staffing_per_shift, staffing_enforcement, session_idle_minutes_web, session_idle_minutes_mobile, session_max_hours, mfa_required, plan_tier`,
      vals
    );
    return { data: rows[0], tier_advisory: tierAdvisory };
  })
);

// ── NERIS Track B: the enrollment surface (chief) ────────────────────────────

// GET /api/departments/:id/neris-info — what the settings panel needs: our
// integration Client ID (NOT a secret — the dept admin pastes it into the NERIS
// portal's Enrollments page, the documented flow), the target environment, and
// whether server credentials are configured at all.
router.get('/:id/neris-info',
  requireChief,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) }),
  scoped(async ({ req, user }) => {
    if (Number(req.params.id) !== Number(user.department_id)) {
      throw httpError(404, 'Department not found', 'NOT_FOUND');
    }
    const client = require('../utils/nerisClient');
    const base = process.env.NERIS_API_BASE || client.NERIS_TEST_BASE;
    return { data: {
      client_id: process.env.NERIS_CLIENT_ID || null,
      configured: client.isConfigured(),
      environment: base.includes('api-test') ? 'test' : 'live',
    } };
  })
);

// POST /api/departments/:id/neris-check — the connection probe: mints a token
// and reads the department's own entity. Proves creds + entity id; a portal
// enrollment gap surfaces on first submit with guidance (the probe cannot
// prove enrollment — NERIS has no read for it; honest limitation, documented).
router.post('/:id/neris-check',
  requireChief,
  validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) }),
  scoped(async ({ req, user }) => {
    if (Number(req.params.id) !== Number(user.department_id)) {
      throw httpError(404, 'Department not found', 'NOT_FOUND');
    }
    const client = require('../utils/nerisClient');
    const { rows } = await db.pool.query('SELECT neris_id FROM departments WHERE id = $1', [user.department_id]);
    const entityId = String((rows[0] && rows[0].neris_id) || '').trim();
    if (!entityId) throw httpError(422, 'Set your NERIS entity ID first.', 'NO_ENTITY_ID');
    if (!client.isConfigured()) throw httpError(503, 'NERIS credentials are not configured on the server.', 'NOT_CONFIGURED');
    audit(user.department_id, user, 'neris_connection_check', 'departments', user.department_id, { entity: entityId });
    try {
      const got = await client.getEntity(entityId);
      return { data: { ok: true, entity: entityId, name: (got.data && (got.data.name || got.data.entity_name)) || null } };
    } catch (err) {
      const refused = Boolean(err && err.name === 'NerisRefusedError');
      // A 403 here has ONE ordinary meaning and it is not an error on the chief's
      // part: NERIS only lets us read an entity we are enrolled with, and the
      // enrollment step happens in THEIR portal (described further down this same
      // panel). Verified live 2026-08-03 against a department that had not enrolled
      // us. Say the actionable thing instead of surfacing a gateway refusal.
      const reason = (refused && err.status === 403)
        ? 'NERIS will not let us read this department until it enrolls OpenFirehouse. Do the one-time enrollment below, then check again.'
        : String((err && (err.detail || err.reason || err.message)) || 'unknown').slice(0, 200);
      return { data: { ok: false, entity: entityId, refused, reason, needsEnrollment: refused && err.status === 403 } };
    }
  })
);

// GET /api/departments/:id/neris-entity-search?q=&state=
//
// Server-proxied NERIS department lookup, so a chief PICKS their department from a
// list instead of hand-typing an FD######## entity id. A mistyped id is the worst
// data-entry error in this whole flow: it either fails at submit, or it resolves to
// ANOTHER department and their reports land on a stranger's national record.
//
// Why proxied and not called from the browser: the NERIS credential is server-side
// only (nerisClient reads process.env) and must never reach a client bundle.
//
// Why a PER-DEPARTMENT ceiling rather than per-IP: every search here becomes an
// outbound call to NERIS, and FSRI's published integration guidance warns that
// anomalous traffic risks permanent blocking — so the cap protects THEM, not us.
// The house apiLimiter is deliberately generous (a whole firehouse can sit behind
// one NAT IP and dispatch clients poll) so it cannot serve as that cap. Finding
// your entity id is a one-time settings task, never an operational path, so a
// modest per-department ceiling can't touch a working firehouse mid-incident.
// Best-effort only: this store is per serverless instance, same as apiLimiter.
//
// ⛔ NERIS TERMS OF USE §2 — DO NOT TURN THIS INTO A HARVESTER.
// "You agree not to access … or systematically retrieve data from, any part of
// NERIS through any automated means … except where permission is specifically
// granted." Our integration credential IS that granted permission, so an
// on-demand lookup a chief initiated is compliant. Two plausible future
// "optimizations" are NOT, and both would breach §2 (and §3, since the registry
// is UL's Content and may not be copied or redistributed):
//   1. Pre-downloading the registry (30,829 entities as of 2026-08-03) to build a
//      local search index or autocomplete table.
//   2. Caching or persisting result sets beyond the request that asked for them.
// Nothing here is stored. The ONLY value persisted from a search is the single
// neris_id the chief explicitly chose for their OWN department. Keep it that way.
const nerisSearchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  // Keyed on department ONLY — never on IP. requireChief runs before this, so
  // req.user is always present; the 'unknown' bucket is an unreachable guard, not
  // a fallback. Keeping IP out of the key sidesteps express-rate-limit's IPv6
  // bypass class (ERR_ERL_KEY_GEN_IPV6) entirely rather than mitigating it.
  keyGenerator: (req) => `neris-search:${(req.user && req.user.department_id) || 'unknown'}`,
  message: { error: 'Too many NERIS searches — wait a few minutes.', code: 'SEARCH_RATE_LIMITED' },
});

// Minimum query length. "Fire" alone matches 29,633 of the 30,829 registered
// entities (probed live 2026-08-03), so a short query is not a search, it is a
// full-table scan we hand to NERIS. Three characters is the floor.
const NERIS_SEARCH_MIN_Q = 3;
const NERIS_SEARCH_PAGE_SIZE = 25;

router.get('/:id/neris-entity-search',
  requireChief,
  nerisSearchLimiter,
  validate({
    params: z.object({ id: z.string().regex(/^\d+$/) }),
    query: z.object({
      q: z.string().trim().min(NERIS_SEARCH_MIN_Q, `Type at least ${NERIS_SEARCH_MIN_Q} characters.`).max(64),
      state: z.string().trim().regex(/^[A-Za-z]{2}$/, 'State must be a 2-letter code.').optional(),
    }),
  }),
  scoped(async ({ req, user }) => {
    if (Number(req.params.id) !== Number(user.department_id)) {
      throw httpError(404, 'Department not found', 'NOT_FOUND');
    }
    const client = require('../utils/nerisClient');
    if (!client.isConfigured()) {
      throw httpError(503, 'NERIS credentials are not configured on this deployment.', 'NOT_CONFIGURED');
    }
    const params = new URLSearchParams({
      name: String(req.query.q).trim(),
      page_size: String(NERIS_SEARCH_PAGE_SIZE),
    });
    if (req.query.state) params.set('state', String(req.query.state).trim().toUpperCase());

    try {
      // GET /entity returns ListEntitiesSummaryInfoResponse. We whitelist the
      // fields the picker needs — enough to DISAMBIGUATE two same-named
      // departments in one county (address + city + type) and nothing else.
      const res = await client.request('GET', `/entity?${params.toString()}`);
      const data = res.data || {};
      const rows = Array.isArray(data.entities) ? data.entities : [];
      return { data: {
        total: Number(data.total_count) || 0,
        truncated: (Number(data.total_count) || 0) > rows.length,
        results: rows.map((e) => ({
          neris_id: e.neris_id || null,
          name: e.name || null,
          address_line_1: e.address_line_1 || null,
          city: e.city || null,
          state: e.state || null,
          zip_code: e.zip_code || null,
          department_type: e.department_type || null,
        })).filter((e) => e.neris_id),
      } };
    } catch (err) {
      // Refused (4xx) vs unavailable (5xx/network) — the syncCore distinction, kept
      // whole: NERIS being down is OUR problem to retry, not a refusal of the
      // chief's work, and must never be reported to them as one.
      if (err && err.name === 'NerisRefusedError') {
        throw httpError(502, 'NERIS refused the lookup.', 'NERIS_REFUSED',
          { status: err.status, detail: err.detail });
      }
      throw httpError(503, 'NERIS is not reachable right now — try again shortly.', 'NERIS_UNAVAILABLE');
    }
  })
);

module.exports = router;
