'use strict';
const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { hashInviteToken, generateInviteToken } = require('../utils/inviteToken');
const { audit } = require('../utils/auditLog');

const router = express.Router();

const { ACCESS_SECRET, REFRESH_SECRET } = require('../config/jwtSecret');
// Phase 5 / migration 0110: token lifetimes are now the DEPARTMENT's idle window
// rather than a hardcoded '7d'. These two constants remain as the fallback used
// when no department policy can be resolved — they are the pre-0110 behaviour.
const ACCESS_TTL     = '7d';
const REFRESH_TTL    = '7d';
const {
  getSessionPolicy,
  idleMinutesFor,
  isBeyondMaxAge,
  normalizePlatform,
} = require('../config/sessionPolicy');
// Phase 5 / 0111 — TOTP second factor.
const { verify: verifyTotp, hashRecoveryCode } = require('../utils/totp');
// The MFA challenge window. Deliberately short: it is not a session, it is the
// gap between typing a password and typing a code.
const MFA_CHALLENGE_TTL = '5m';

// W3.6 (roadmap 4.10): sameSite was 'none', which let any third-party site
// send the refresh cookie (the ONE cookie-authed endpoint — everything else
// is Bearer-header auth and CSRF-immune). Every supported flow is actually
// same-origin: prod serves client+API from the same deployment, previews
// likewise, and the Vite dev server proxies /api. Default is now 'lax';
// a genuinely cross-origin self-host can set COOKIE_SAMESITE=none explicitly.
const SAMESITE = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
const COOKIE_OPTS = {
  httpOnly: true,
  secure:   true,
  sameSite: ['lax', 'strict', 'none'].includes(SAMESITE) ? SAMESITE : 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms (pre-0110 default)
  path:     '/',
};

// Phase 5 / 0110: the refresh cookie is ROLLING — its lifetime is the
// department's idle window and it is re-minted on every successful refresh.
// An idle client's cookie simply expires; that IS the idle timeout, with no
// server-side session table. Clearing still uses COOKIE_OPTS + maxAge: 0.
function cookieOptsForWindow(idleMinutes) {
  return { ...COOKIE_OPTS, maxAge: Math.max(1, Number(idleMinutes) || 10080) * 60 * 1000 };
}

// departmentId is the resolved ACTIVE department (Phase 2). It is carried in
// the token for the client/transition, but requireAuth re-resolves it fresh
// from the DB on every request, so the token value is never authoritative.
// client_kind ('command' | 'companion') is a CLIENT capability label, signed into
// the token so it can't be swapped per-request. It is NOT a user-privilege boundary
// (the same user can log in on the web with full rights) — it is the form-factor
// guardrail that keeps the read-only companion PHONE app from writing (the recall/
// incident responder is the lone allowlisted exception; see middleware/companionGate.js).
// Defaults to 'command' so every existing client (web, iPad command app) is unaffected.
const CLIENT_KINDS = ['command', 'companion'];
function normalizeClientKind(k) {
  return CLIENT_KINDS.includes(k) ? k : 'command';
}

function makeTokens(user, departmentId, clientKind = 'command', opts = {}) {
  // Phase 5 / 0110. `platform` selects the web vs mobile idle window; `idleMinutes`
  // is the resolved window; `sessionStart` is the ABSOLUTE session anchor, preserved
  // across rotations so session_max_hours can be enforced. Callers that pass none of
  // these get exactly the pre-0110 behaviour (7d, no cap).
  const platform     = normalizePlatform(opts.platform);
  const idleMinutes  = Number(opts.idleMinutes) > 0 ? Number(opts.idleMinutes) : null;
  const sessionStart = Number.isFinite(opts.sessionStart)
    ? opts.sessionStart
    : Math.floor(Date.now() / 1000);

  const payload = {
    sub: user.id, username: user.username, role: user.role, stationId: user.station_id,
    department_id: departmentId, client_kind: normalizeClientKind(clientKind),
    plat: platform,
    sst:  sessionStart,
  };
  const ttl = idleMinutes ? `${idleMinutes}m` : ACCESS_TTL;
  const accessToken  = jwt.sign(payload, ACCESS_SECRET,  { expiresIn: ttl });
  const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: idleMinutes ? `${idleMinutes}m` : REFRESH_TTL });
  return { accessToken, refreshToken, idleMinutes, platform, sessionStart };
}

function safeUser(user, departmentId) {
  return { id: user.id, username: user.username, name: user.name, initials: user.initials, role: user.role, stationId: user.station_id, department_id: departmentId, email_verified: !!user.email_verified,
    // Unit-login (migration 0025): non-null only for role='unit' in-cab accounts.
    // The client reads this to enter unit mode (rig-scoped nav + auto GPS reporting).
    apparatus_id: user.apparatus_id ?? null,
    // 2.2 (0083): the mechanic capability grant — client-side gating only; the
    // server enforces regardless. Refreshes on next login/refresh after a grant.
    fleet_maintenance: user.fleet_maintenance === true };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// Reuses checkout.js's Resend pattern. No-ops gracefully (logs) when RESEND_API_KEY
// isn't configured — so signup never fails on a missing email key; the email simply
// goes out once the key is set in the app env.
async function sendVerificationEmail({ to, deptName, link }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(JSON.stringify({ kind: 'of_email_verify_skipped_no_resend', to }));
    return { skipped: true };
  }
  const html = `<h2>Verify your email for OpenFirehouse — ${escapeHtml(deptName)}</h2>
    <p>Confirm this is your department's contact email. This link expires in 24 hours.</p>
    <p style="margin:32px 0"><a href="${link}" style="background:#EF4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Verify email</a></p>
    <p style="color:#6b7280;font-size:12px">If you didn't sign up for OpenFirehouse, you can ignore this email.</p>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'OpenFirehouse <licenses@openscaffoldlabs.com>', to, reply_to: 'support@openscaffoldlabs.com', subject: `Verify your OpenFirehouse email — ${deptName}`, html }),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    console.log(JSON.stringify({ kind: 'of_email_verify_send_error', message: e.message }));
    return { ok: false };
  }
}

// W3.3 — zod on the unauthenticated surface
const { z } = require('zod');
const validate = require('../middleware/validate');
const { classifyTier } = require('../lib/licensing');
const loginSchema = z.looseObject({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(256),
  // Optional: the mobile app sends 'companion' from a phone, 'command' from an
  // iPad. Absent → 'command' (web + every existing client is unchanged).
  clientKind: z.enum(['command', 'companion']).optional(),
  // Phase 5 / 0110. Selects which of the department's two idle windows applies.
  // The native apps (iPad command AND companion phone) send 'mobile'; the web
  // client sends nothing and normalizes to 'web'. This is a timeout selector
  // only — it is NOT a privilege boundary and grants no capability.
  platform:   z.enum(['web', 'mobile']).optional(),
});

// POST /api/auth/login
router.post('/login', validate({ body: loginSchema }), async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await db.users.findByUsername(username.toLowerCase().trim());
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    // Quick-win (2026-06-10): no station → fail closed (the old || 1 fallback
    // silently filed such users into department 1). Prod verified 0 NULLs.
    if (!user.station_id) {
      return res.status(403).json({ error: 'Account has no station assigned. Contact your chief.', code: 'NO_STATION' });
    }

    const departmentId = await db.users.resolveDepartmentId(user.id, user.station_id);

    // Phase 5 / 0111 — the second factor. Password was already checked above;
    // if this account has MFA ACTIVE we stop here and issue NO session tokens.
    // Instead we return a short-lived, single-purpose challenge token that can
    // do exactly one thing: be exchanged at /api/auth/mfa for real tokens.
    //
    // A user without MFA falls straight through, byte-for-byte as before.
    if (user.mfa_enabled === true && user.mfa_secret) {
      const mfaToken = jwt.sign(
        { sub: user.id, mfa: 'pending', client_kind: normalizeClientKind(req.body.clientKind),
          plat: normalizePlatform(req.body.platform) },
        ACCESS_SECRET,
        { expiresIn: MFA_CHALLENGE_TTL }
      );
      return res.json({ mfaRequired: true, mfaToken });
    }

    // Phase 5 / 0110: resolve this department's idle window for the calling
    // platform. `platform` is a client hint ('web' | 'mobile'); anything else,
    // including absent, normalizes to 'web'. It selects a timeout only — it is
    // NOT a privilege boundary and grants nothing.
    const platform    = normalizePlatform(req.body.platform);
    const policy      = await getSessionPolicy(departmentId);
    const idleMinutes = idleMinutesFor(policy, platform);

    const { accessToken, refreshToken } = makeTokens(user, departmentId, req.body.clientKind, {
      platform, idleMinutes,
    });
    res.cookie('refreshToken', refreshToken, cookieOptsForWindow(idleMinutes));
    res.json({
      token: accessToken,
      user: safeUser(user, departmentId),
      session: { idleMinutes, platform, maxHours: policy.session_max_hours },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('refreshToken', { ...COOKIE_OPTS, maxAge: 0 });
  res.json({ ok: true });
});

// POST /api/auth/refresh
// POST /api/auth/mfa — exchange a challenge token + TOTP (or recovery code) for a session.
// Phase 5 / 0111. This is the ONLY thing an mfa:pending token can do.
const mfaExchangeSchema = z.looseObject({
  mfaToken: z.string().min(1).max(4096),
  code:     z.string().min(6).max(20),
});

router.post('/mfa', validate({ body: mfaExchangeSchema }), async (req, res) => {
  try {
    let payload;
    try {
      payload = jwt.verify(req.body.mfaToken, ACCESS_SECRET);
    } catch {
      return res.status(401).json({ error: 'That sign-in attempt expired. Start again.', code: 'MFA_CHALLENGE_EXPIRED' });
    }
    // A full session token must NOT be accepted here, and a challenge token must
    // never be accepted anywhere else. requireAuth reads no `mfa` claim, so a
    // pending token cannot authenticate a normal route; this check closes the
    // other direction.
    if (payload.mfa !== 'pending') {
      return res.status(401).json({ error: 'Invalid challenge.', code: 'MFA_BAD_CHALLENGE' });
    }

    const user = await db.users.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found.' });

    // findById projects an explicit column list, so read the MFA state directly.
    const { rows } = await db.pool.query(
      'SELECT mfa_secret, mfa_enabled, mfa_last_step, mfa_recovery_codes FROM users WHERE id = $1',
      [payload.sub]
    );
    const m = rows[0];
    if (!m || !m.mfa_enabled || !m.mfa_secret) {
      return res.status(409).json({ error: 'MFA is not active for this account.', code: 'MFA_NOT_ENABLED' });
    }

    const submitted = String(req.body.code || '').trim();
    let accepted = false;
    let usedRecovery = false;
    let newStep = m.mfa_last_step;

    const totp = verifyTotp(m.mfa_secret, submitted);
    if (totp.valid) {
      // REPLAY DEFENCE: a TOTP stays valid for its whole window, so a code whose
      // step has already been consumed must be refused even though it verifies.
      if (m.mfa_last_step != null && totp.step <= Number(m.mfa_last_step)) {
        return res.status(401).json({
          error: 'That code has already been used. Wait for the next one.',
          code:  'MFA_CODE_REPLAYED',
        });
      }
      accepted = true;
      newStep = totp.step;
    } else {
      // Fall back to a single-use recovery code.
      const codes = Array.isArray(m.mfa_recovery_codes) ? m.mfa_recovery_codes : [];
      const hash  = hashRecoveryCode(submitted);
      const idx   = codes.findIndex((c) => c && c.h === hash && !c.used_at);
      if (idx !== -1) {
        codes[idx].used_at = new Date().toISOString();
        await db.pool.query('UPDATE users SET mfa_recovery_codes = $1 WHERE id = $2',
          [JSON.stringify(codes), payload.sub]);
        accepted = true;
        usedRecovery = true;
      }
    }

    if (!accepted) {
      return res.status(401).json({ error: 'That code is not right.', code: 'MFA_INVALID_CODE' });
    }

    if (!usedRecovery) {
      await db.pool.query('UPDATE users SET mfa_last_step = $1 WHERE id = $2', [newStep, payload.sub]);
    }

    if (!user.station_id) {
      return res.status(403).json({ error: 'Account has no station assigned. Contact your chief.', code: 'NO_STATION' });
    }
    const departmentId = await db.users.resolveDepartmentId(user.id, user.station_id);

    const platform    = normalizePlatform(payload.plat);
    const policy      = await getSessionPolicy(departmentId);
    const idleMinutes = idleMinutesFor(policy, platform);

    const { accessToken, refreshToken } = makeTokens(user, departmentId, payload.client_kind, {
      platform, idleMinutes,
    });
    res.cookie('refreshToken', refreshToken, cookieOptsForWindow(idleMinutes));
    res.json({
      token: accessToken,
      user: safeUser(user, departmentId),
      session: { idleMinutes, platform, maxHours: policy.session_max_hours },
      usedRecoveryCode: usedRecovery,
      recoveryCodesRemaining: usedRecovery
        ? (Array.isArray(m.mfa_recovery_codes) ? m.mfa_recovery_codes : []).filter((c) => c && !c.used_at).length - 1
        : undefined,
    });
  } catch (err) {
    console.error('MFA exchange error:', err);
    res.status(500).json({ error: 'Sign-in failed.' });
  }
});

router.post('/refresh', async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ error: 'No refresh token.' });

  try {
    const payload = jwt.verify(token, REFRESH_SECRET);
    const user = await db.users.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found.' });
    if (!user.station_id) return res.status(403).json({ error: 'Account has no station assigned. Contact your chief.', code: 'NO_STATION' });

    const departmentId = await db.users.resolveDepartmentId(user.id, user.station_id);

    // Phase 5 / 0110 — the ABSOLUTE cap. `sst` (session start) is preserved across
    // every rotation, so a continuously-active client is still forced to
    // re-authenticate once session_max_hours is reached. Idle expiry needs no check
    // here: an idle client's rolling refresh cookie has already expired, and
    // jwt.verify above has already thrown.
    const policy = await getSessionPolicy(departmentId);
    if (isBeyondMaxAge(payload.sst, policy.session_max_hours)) {
      res.clearCookie('refreshToken', { ...COOKIE_OPTS, maxAge: 0 });
      return res.status(401).json({
        error: 'Session expired. Please sign in again.',
        code:  'SESSION_MAX_AGE',
      });
    }

    // Preserve client_kind across rotation — a companion phone stays a companion.
    // Preserve the platform too, so the idle window doesn't silently switch tiers.
    const platform    = normalizePlatform(payload.plat);
    const idleMinutes = idleMinutesFor(policy, platform);

    const { accessToken, refreshToken } = makeTokens(user, departmentId, payload.client_kind, {
      platform, idleMinutes, sessionStart: payload.sst,
    });
    res.cookie('refreshToken', refreshToken, cookieOptsForWindow(idleMinutes));
    res.json({
      token: accessToken,
      user: safeUser(user, departmentId),
      session: { idleMinutes, platform, maxHours: policy.session_max_hours },
    });
  } catch {
    res.clearCookie('refreshToken', { ...COOKIE_OPTS, maxAge: 0 });
    res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
});

// ── P4.2: self-serve department signup ───────────────────────────────────────
// Public + rate-limited (authLimiter wraps /api/auth). Dark-launched behind
// P4_SIGNUP=on (rollout §11) so public tenant creation is off until enabled.
// Creates, in ONE transaction (atomic — no orphan on failure): a mirror station,
// the founding chief user (station_id = mirror; never the default-1), then the
// department + founding-chief mapping via the owner-side of_provision_department
// DEFINER fn, then backfills the station's department_id. Tier is classified from
// the attested size (advisory; never blocks — OF EULA is attestation-based).
// NOTE: email verification is intentionally NOT here — OF has no outbound email
// infra yet; abuse control is the rate limiter. Add verification when email infra
// + a vendor/secret decision lands (Matt/Dale).
const signupSchema = z.looseObject({
  departmentName:    z.string().min(1).max(200),
  fdid:              z.string().max(10).optional(),
  deptType:          z.string().max(40).optional(),
  attestedMembers:   z.number().int().min(0).max(100000).optional(),
  attestedStations:  z.number().int().min(0).max(1000).optional(),
  attestedBudgetUsd: z.number().min(0).optional(),
  chiefUsername:     z.string().min(3).max(100),
  chiefName:         z.string().min(1).max(200),
  chiefPassword:     z.string().min(12).max(256),   // NIST 800-63B min
  chiefEmail:        z.string().email().max(200),    // required: verifiable contact + abuse filter
});

// Dark-launch gate runs FIRST (before validation) so when off the endpoint is
// indistinguishable from a non-existent route — 404 for ALL inputs, no info leak.
const requireSignupEnabled = (req, res, next) =>
  process.env.P4_SIGNUP === 'on' ? next() : res.status(404).json({ error: 'Not found.' });

router.post('/signup', requireSignupEnabled, validate({ body: signupSchema }), async (req, res) => {
  const b = req.body;
  const username = b.chiefUsername.toLowerCase().trim();
  const tier = classifyTier({
    members:    b.attestedMembers   || 0,
    stations:   b.attestedStations  || 0,
    budget_usd: b.attestedBudgetUsd || 0,
  });
  const initials = b.chiefName.split(/\s+/).map(s => s[0] || '').join('').toUpperCase().slice(0, 4) || 'CH';
  const hash = bcrypt.hashSync(b.chiefPassword, 10);
  const verifyToken = generateInviteToken();
  const verifyHash  = hashInviteToken(verifyToken);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const dup = await client.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (dup.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'That username is unavailable.', code: 'USERNAME_TAKEN' });
    }

    // 1. mirror station (department_id backfilled in step 4)
    const st = await client.query(
      `INSERT INTO stations (name, department_id) VALUES ($1, NULL) RETURNING id`, ['Station 1']);
    const mirrorStationId = st.rows[0].id;

    // 2. founding chief (station_id = the mirror, explicitly — not the default 1)
    const u = await client.query(
      `INSERT INTO users (username, name, initials, role, "passwordHash", email, station_id, email_verify_token_hash, email_verify_sent_at)
       VALUES ($1, $2, $3, 'chief', $4, $5, $6, $7, now()) RETURNING *`,
      [username, b.chiefName.trim(), initials, hash, b.chiefEmail.trim(), mirrorStationId, verifyHash]);
    const chief = u.rows[0];

    // 3. department + founding-chief mapping (owner-side DEFINER; atomic in this txn)
    const dep = await client.query(
      `SELECT public.of_provision_department($1,$2,$3,$4,$5,$6) AS id`,
      [chief.id, b.departmentName.trim(), b.fdid || '', b.deptType || '', tier, mirrorStationId]);
    const departmentId = dep.rows[0].id;

    // 4. backfill the mirror station's department
    await client.query('UPDATE stations SET department_id = $1 WHERE id = $2', [departmentId, mirrorStationId]);

    await client.query('COMMIT');

    // Audit the provisioning event (best-effort) on the SAME connection — the pool
    // is max:1, so opening a second connection here would deadlock. Set the dept
    // GUC + write department_id explicitly so the append-only audit_log RLS
    // WITH CHECK passes on prod for this unauthed flow.
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.department_id', $1, true)", [String(departmentId)]);
      await client.query(
        `INSERT INTO audit_log (station_id, department_id, user_id, user_name, action, table_name, record_id, detail)
         VALUES ($1, $1, $2, $3, 'create', 'departments', $1, $4)`,
        [departmentId, chief.id, username, JSON.stringify({ kind: 'self_serve_signup', tier })]);
      await client.query('COMMIT');
    } catch (_) { await client.query('ROLLBACK').catch(() => {}); }

    // Verification email (best-effort; no-ops if RESEND_API_KEY isn't configured).
    const baseUrl = `https://${req.headers.host || 'app.openfirehouse.openscaffoldlabs.com'}`;
    try {
      await sendVerificationEmail({
        to: b.chiefEmail.trim(), deptName: b.departmentName.trim(),
        link: `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`,
      });
    } catch (_) { /* never blocks signup */ }

    const { accessToken, refreshToken } = makeTokens(chief, departmentId);
    res.cookie('refreshToken', refreshToken, COOKIE_OPTS);
    return res.status(201).json({
      token: accessToken,
      user: safeUser(chief, departmentId),
      department: { id: departmentId, name: b.departmentName.trim(), plan_tier: tier },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Only a genuine username-uniqueness violation is USERNAME_TAKEN. Any other
    // 23505 (e.g. a primary-key collision from a desynced sequence) must NOT
    // masquerade as "username unavailable" — that mislabel hid a real
    // signup-breaking bug. Surface a truthful error and log the cause
    // (code/constraint/table only — never err.detail, which can contain the
    // attempted value / PII).
    if (err.code === '23505' && err.constraint === 'users_username_key') {
      return res.status(409).json({ error: 'That username is unavailable.', code: 'USERNAME_TAKEN' });
    }
    console.error('Signup error:', err.code || '', err.constraint || '', err.table || '', err.message);
    return res.status(500).json({ error: 'Signup failed.' });
  } finally {
    client.release();
  }
});

// ── P4.4: accept a member invite (set password) ──────────────────────────────
// Public + rate-limited (authLimiter wraps /api/auth). The member redeems the
// single-use secret their chief handed them, sets a password, and is logged in.
// Their role stays the lowest tier until the chief verifies their rank (zero
// elevated reach). FOR UPDATE + the single-use guard make the redeem race-safe.
const acceptInviteSchema = z.looseObject({
  token:    z.string().min(10).max(400),
  password: z.string().min(12).max(256), // NIST 800-63B min, matches signup
});
router.post('/accept-invite', validate({ body: acceptInviteSchema }), async (req, res) => {
  const { token, password } = req.body;
  const tokenHash = hashInviteToken(token);
  const passwordHash = bcrypt.hashSync(password, 10);
  try {
    // Owner-side, single-use, atomic redeem (0016): claims the invite (marks it
    // used ONLY if unused + unexpired) AND sets the password in one DEFINER call.
    // of_member_invites is now RLS-on and this endpoint is unauthenticated (no
    // dept GUC), so a direct of_app UPDATE would be blocked by dept_isolation —
    // the DEFINER fn runs owner-side and is authorized by the token hash itself.
    let redeemed;
    try {
      const r = await db.pool.query(
        'SELECT * FROM public.of_redeem_member_invite($1, $2)',
        [tokenHash, passwordHash]
      );
      redeemed = r.rows[0];
    } catch (e) {
      if (/invalid, used, or expired/i.test(e.message || '')) {
        return res.status(400).json({ error: 'This invite is invalid, already used, or expired.', code: 'INVALID_INVITE' });
      }
      throw e;
    }

    const user = await db.users.findById(redeemed.redeemed_user_id);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (!user.station_id) {
      return res.status(403).json({ error: 'Account has no station assigned. Contact your chief.', code: 'NO_STATION' });
    }
    const departmentId = await db.users.resolveDepartmentId(user.id, user.station_id);
    try {
      await db.runWithDepartment(departmentId, user.id, () =>
        audit(departmentId, { id: user.id, username: user.username }, 'accept', 'of_member_invites', redeemed.redeemed_invite_id, { member_id: redeemed.redeemed_member_id }));
    } catch (_) { /* best-effort */ }
    const { accessToken, refreshToken } = makeTokens(user, departmentId);
    res.cookie('refreshToken', refreshToken, COOKIE_OPTS);
    return res.json({ token: accessToken, user: safeUser(user, departmentId) });
  } catch (err) {
    console.error('accept-invite error:', err.message);
    return res.status(500).json({ error: 'Could not accept invite.' });
  }
});

// ── P4.4 self-claim: join an existing department with a chief-issued code ─────
// Public + rate-limited. The valid join code IS the authorization — the owner-side
// of_register_pending_member DEFINER fn validates it, creates a pending member
// login (lowest role until a chief verifies rank), and we log them in pending.
const joinSchema = z.looseObject({
  joinCode:      z.string().min(4).max(40),
  username:      z.string().min(3).max(100),
  password:      z.string().min(12).max(256), // NIST 800-63B min
  name:          z.string().min(1).max(200),
  requestedRank: z.string().max(60).optional(),
});
router.post('/join', validate({ body: joinSchema }), async (req, res) => {
  const b = req.body;
  try {
    const pwHash   = bcrypt.hashSync(b.password, 10);
    const codeHash = hashInviteToken(b.joinCode.trim().toUpperCase());
    const r = await db.pool.query(
      'SELECT * FROM public.of_register_pending_member($1, $2, $3, $4, $5)',
      [b.username.toLowerCase().trim(), pwHash, b.name.trim(), codeHash, b.requestedRank || '']
    );
    const row = r.rows[0];
    const user = await db.users.findById(row.new_user_id);
    const departmentId = await db.users.resolveDepartmentId(user.id, user.station_id);
    try {
      await db.runWithDepartment(departmentId, user.id, () =>
        audit(departmentId, { id: user.id, username: user.username }, 'create', 'members', null, { kind: 'self_claim_join' }));
    } catch (_) { /* best-effort */ }
    const { accessToken, refreshToken } = makeTokens(user, departmentId);
    res.cookie('refreshToken', refreshToken, COOKIE_OPTS);
    return res.status(201).json({ token: accessToken, user: safeUser(user, departmentId), pending: true });
  } catch (err) {
    const msg = err.message || '';
    // of_register_pending_member RAISEs 'username taken' for a real dup; key on
    // that (or the username constraint) — not a bare 23505, which could be an
    // unrelated unique-violation surfacing as a misleading "username unavailable".
    if (/username taken/i.test(msg) || err.constraint === 'users_username_key') {
      return res.status(409).json({ error: 'That username is unavailable.', code: 'USERNAME_TAKEN' });
    }
    if (/invalid or expired join code/i.test(msg)) {
      return res.status(400).json({ error: 'Invalid or expired join code.', code: 'INVALID_JOIN_CODE' });
    }
    console.error('join error:', msg);
    return res.status(500).json({ error: 'Could not complete sign-up.' });
  }
});

// ── Email verification click target ──────────────────────────────────────────
// Public. Atomic claim: flips email_verified + clears the token hash only if it
// matches and is < 24h old. SOFT — a trust signal/abuse filter, never a hard gate.
router.get('/verify-email', async (req, res) => {
  const token = req.query?.token;
  res.setHeader('Content-Type', 'text/html');
  const page = (title, body) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} — OpenFirehouse</title></head><body style="font-family:-apple-system,sans-serif;max-width:560px;margin:48px auto;padding:0 20px;color:#0F172A"><h1>${escapeHtml(title)}</h1>${body}<hr><p style="color:#6b7280;font-size:12px">Open Scaffold Labs — OpenFirehouse</p></body></html>`;
  if (!token) return res.status(400).send(page('Missing token', '<p>This link is missing its token.</p>'));
  try {
    const r = await db.pool.query(
      `UPDATE users SET email_verified = true, email_verify_token_hash = NULL
         WHERE email_verify_token_hash = $1 AND email_verify_sent_at > now() - interval '24 hours'
         RETURNING id`,
      [hashInviteToken(String(token))]
    );
    if (!r.rows.length) return res.status(400).send(page('Link invalid or expired', '<p>This verification link is invalid or has expired. Sign in and request a fresh one.</p>'));
    return res.send(page('Email verified', '<p>Thanks — your email is verified. You can close this tab and return to OpenFirehouse.</p>'));
  } catch (e) {
    return res.status(500).send(page('Something went wrong', '<p>Please try again, or email support@openscaffoldlabs.com.</p>'));
  }
});

module.exports = router;
