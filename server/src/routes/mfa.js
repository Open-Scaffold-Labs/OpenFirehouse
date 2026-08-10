'use strict';
/**
 * mfa.js — TOTP multi-factor authentication (Phase 5, migration 0111).
 *
 *   POST /api/mfa/enroll    — begin enrolment: mint a secret, return the otpauth URI
 *   POST /api/mfa/confirm   — prove possession, ACTIVATE, return recovery codes ONCE
 *   POST /api/mfa/disable   — turn it off (password required; blocked if dept mandates)
 *   GET  /api/mfa/status    — is it on for me, and does my department require it
 *   POST /api/mfa/recovery/regenerate — new codes (password + active MFA required)
 *
 * The login-time half lives in routes/auth.js — this file owns enrolment and
 * lifecycle only.
 *
 * DESIGN NOTES THAT ARE LOAD-BEARING
 * ----------------------------------
 * 1. ENROLMENT IS TWO-PHASE. /enroll writes a secret but leaves mfa_enabled
 *    FALSE. Only /confirm — which requires a working code — flips it on. A
 *    member who starts enrolment and walks away is never locked out.
 * 2. REPLAY IS BLOCKED. Every successful verification advances mfa_last_step,
 *    and any step <= the stored one is refused. Without this a code intercepted
 *    over someone's shoulder stays usable for its whole ~90s tolerance window.
 * 3. RECOVERY CODES ARE SHOWN ONCE. Stored as SHA-256 hashes, single-use. One
 *    competitor in the market ships MFA with no recovery path at all; a chief
 *    who loses a phone should not have to telephone a vendor.
 * 4. DISABLING REQUIRES THE PASSWORD, not just a session. A walked-up
 *    unattended browser must not be able to strip a second factor.
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const { z }   = require('zod');
const db      = require('../db');
const requireAuth = require('../middleware/auth');
const validate    = require('../middleware/validate');
const { audit }   = require('../utils/auditLog');
const {
  generateSecret, verify, otpauthURI,
  generateRecoveryCodes, hashRecoveryCode,
} = require('../utils/totp');

const router = express.Router();
router.use(requireAuth);

const ISSUER = 'OpenFirehouse';

/** Shape of a stored recovery code entry. */
const liveCodes = (arr) => (Array.isArray(arr) ? arr : []).filter((c) => c && !c.used_at);

// ── GET /api/mfa/status ──────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const { rows } = await db.pool.query(
      `SELECT u.mfa_enabled, u.mfa_enrolled_at, u.mfa_recovery_codes,
              COALESCE(d.mfa_required, FALSE) AS dept_required
         FROM users u
         LEFT JOIN departments d ON d.id = $2
        WHERE u.id = $1`,
      [req.user.id, req.user.department_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    const r = rows[0];
    res.json({
      enabled:            r.mfa_enabled === true,
      enrolledAt:         r.mfa_enrolled_at,
      departmentRequired: r.dept_required === true,
      recoveryCodesRemaining: liveCodes(r.mfa_recovery_codes).length,
    });
  } catch (err) {
    console.error('mfa/status error:', err);
    res.status(500).json({ error: 'Could not read MFA status.' });
  }
});

// ── POST /api/mfa/enroll ─────────────────────────────────────────────────────
router.post('/enroll', async (req, res) => {
  try {
    const { rows } = await db.pool.query(
      'SELECT username, mfa_enabled FROM users WHERE id = $1', [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });

    // Re-enrolling while active would silently invalidate the member's existing
    // authenticator. Make them disable first, deliberately.
    if (rows[0].mfa_enabled) {
      return res.status(409).json({
        error: 'Multi-factor authentication is already active. Turn it off before enrolling again.',
        code:  'MFA_ALREADY_ENABLED',
      });
    }

    const secret = generateSecret();
    // Written but NOT enabled — phase one of two.
    await db.pool.query(
      'UPDATE users SET mfa_secret = $1, mfa_enabled = FALSE, mfa_last_step = NULL WHERE id = $2',
      [secret, req.user.id]
    );

    res.json({
      secret,
      otpauthUri: otpauthURI({ secret, accountName: rows[0].username, issuer: ISSUER }),
      // The member types this if their camera cannot read the QR.
      manualEntryKey: secret.replace(/(.{4})/g, '$1 ').trim(),
    });
  } catch (err) {
    console.error('mfa/enroll error:', err);
    res.status(500).json({ error: 'Could not start MFA enrolment.' });
  }
});

// ── POST /api/mfa/confirm ────────────────────────────────────────────────────
const codeSchema = z.object({ code: z.string().min(6).max(20) });

router.post('/confirm', validate({ body: codeSchema }), async (req, res) => {
  try {
    const { rows } = await db.pool.query(
      'SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1', [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    const u = rows[0];

    if (u.mfa_enabled) {
      return res.status(409).json({ error: 'Already active.', code: 'MFA_ALREADY_ENABLED' });
    }
    if (!u.mfa_secret) {
      return res.status(409).json({ error: 'Start enrolment first.', code: 'MFA_NOT_STARTED' });
    }

    const { valid, step } = verify(u.mfa_secret, req.body.code);
    if (!valid) {
      return res.status(401).json({
        error: 'That code is not right. Check your authenticator app and try again.',
        code:  'MFA_INVALID_CODE',
      });
    }

    // Plaintext goes to the member exactly once, in this response, and is never
    // stored — only the hashes are.
    const codes = generateRecoveryCodes(10);
    const stored = codes.map((c) => ({ h: hashRecoveryCode(c), used_at: null }));

    await db.pool.query(
      `UPDATE users
          SET mfa_enabled = TRUE, mfa_enrolled_at = NOW(),
              mfa_last_step = $1, mfa_recovery_codes = $2
        WHERE id = $3`,
      [step, JSON.stringify(stored), req.user.id]
    );

    await audit(req.user.department_id, req.user, 'update', 'users', req.user.id,
      { note: 'mfa_enabled' });

    res.json({
      enabled: true,
      recoveryCodes: codes,
      warning: 'These recovery codes are shown once. Save them somewhere safe — they are the only way back in if you lose your phone.',
    });
  } catch (err) {
    console.error('mfa/confirm error:', err);
    res.status(500).json({ error: 'Could not activate MFA.' });
  }
});

// ── POST /api/mfa/disable ────────────────────────────────────────────────────
const disableSchema = z.object({ password: z.string().min(1).max(256) });

router.post('/disable', validate({ body: disableSchema }), async (req, res) => {
  try {
    const { rows } = await db.pool.query(
      `SELECT u."passwordHash", u.mfa_enabled, COALESCE(d.mfa_required, FALSE) AS dept_required
         FROM users u LEFT JOIN departments d ON d.id = $2
        WHERE u.id = $1`,
      [req.user.id, req.user.department_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    const u = rows[0];

    if (!u.mfa_enabled) {
      return res.status(409).json({ error: 'MFA is not active.', code: 'MFA_NOT_ENABLED' });
    }
    // A member cannot opt out of their department's mandate.
    if (u.dept_required) {
      return res.status(403).json({
        error: 'Your department requires multi-factor authentication. A chief must turn off the requirement first.',
        code:  'MFA_REQUIRED_BY_DEPARTMENT',
      });
    }
    // Session alone is not enough — an unattended browser must not be able to
    // strip a second factor.
    if (!bcrypt.compareSync(req.body.password, u.passwordHash)) {
      return res.status(401).json({ error: 'Password is not correct.', code: 'BAD_PASSWORD' });
    }

    await db.pool.query(
      `UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL,
              mfa_enrolled_at = NULL, mfa_last_step = NULL, mfa_recovery_codes = NULL
        WHERE id = $1`,
      [req.user.id]
    );

    await audit(req.user.department_id, req.user, 'update', 'users', req.user.id,
      { note: 'mfa_disabled' });

    res.json({ enabled: false });
  } catch (err) {
    console.error('mfa/disable error:', err);
    res.status(500).json({ error: 'Could not turn off MFA.' });
  }
});

// ── POST /api/mfa/recovery/regenerate ────────────────────────────────────────
router.post('/recovery/regenerate', validate({ body: disableSchema }), async (req, res) => {
  try {
    const { rows } = await db.pool.query(
      'SELECT "passwordHash", mfa_enabled FROM users WHERE id = $1', [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    if (!rows[0].mfa_enabled) {
      return res.status(409).json({ error: 'MFA is not active.', code: 'MFA_NOT_ENABLED' });
    }
    if (!bcrypt.compareSync(req.body.password, rows[0].passwordHash)) {
      return res.status(401).json({ error: 'Password is not correct.', code: 'BAD_PASSWORD' });
    }

    const codes = generateRecoveryCodes(10);
    const stored = codes.map((c) => ({ h: hashRecoveryCode(c), used_at: null }));
    // Regenerating REPLACES the old set — any previously issued code stops working.
    await db.pool.query('UPDATE users SET mfa_recovery_codes = $1 WHERE id = $2',
      [JSON.stringify(stored), req.user.id]);

    await audit(req.user.department_id, req.user, 'update', 'users', req.user.id,
      { note: 'mfa_recovery_codes_regenerated' });

    res.json({
      recoveryCodes: codes,
      warning: 'Your previous recovery codes no longer work. Save these somewhere safe.',
    });
  } catch (err) {
    console.error('mfa/recovery/regenerate error:', err);
    res.status(500).json({ error: 'Could not regenerate recovery codes.' });
  }
});

module.exports = router;
