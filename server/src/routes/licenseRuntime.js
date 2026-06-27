'use strict';
/**
 * routes/licenseRuntime.js — per-department runtime license endpoints.
 *
 * Mounted at /api/license AFTER requireAuth (post-login gating). Every endpoint
 * is scoped to the authenticated user's department (req.user.department_id).
 *
 * ISOLATION: the runtime uses the RLS-bypassing service_role key, so these
 * handlers ARE the isolation boundary — each scopes to the caller's department,
 * and /activate additionally requires that the license's signed dept_id matches
 * the caller's department. Activation/deactivation are chief-level actions.
 *
 *   GET  /api/license/status     — validated status of THIS department's license
 *   POST /api/license/activate   — store a JWT for THIS department (chief; the
 *                                  JWT's dept_id must equal the caller's dept)
 *   POST /api/license/deactivate — clear THIS department's license (chief)
 */
const express = require('express');
const authedRouter = express.Router();
const { requireChief } = require('../middleware/requireRole');
const {
  validateLicense, persistActivation, loadActivatedJwt, clearActivation,
} = require('../lib/licenseRuntime');

function isEnvTrue(v) { return String(v || '').trim().toLowerCase() === 'true'; }
const IS_DEMO = isEnvTrue(process.env.OPENFIREHOUSE_DEMO);

// License enforcement is OPT-IN. OpenFirehouse is AGPL open source, so a
// self-hosted install must run fully without any license — "clone it and run it
// for $0, forever." Entitlement gating is therefore OFF unless the operator
// explicitly turns it on with OPENFIREHOUSE_LICENSE_ENFORCED=true, which is how
// the Open Scaffold Labs managed-hosting service runs. Self-host (the default)
// is never walled behind activation.
const IS_LICENSE_ENFORCED = isEnvTrue(process.env.OPENFIREHOUSE_LICENSE_ENFORCED);

authedRouter.get('/status', async (req, res) => {
  try {
    // Demo deployment: license enforcement disabled (still requires login).
    if (IS_DEMO) {
      return res.json({
        activated: true, mode: 'demo', dept_name: 'OpenFirehouse Demo',
        tier: 'demo', active: true, reason: 'demo_mode_env_set',
      });
    }
    // Self-host default: enforcement is opt-in. Without OPENFIREHOUSE_LICENSE_ENFORCED
    // every authenticated department is treated as activated, so the app is fully
    // usable on a plain self-host (the AGPL run-right). Only the managed-hosting
    // service sets the flag to turn on the entitlement checks below.
    if (!IS_LICENSE_ENFORCED) {
      return res.json({
        activated: true, mode: 'self-host', tier: 'self-host',
        active: true, reason: 'enforcement_disabled',
      });
    }
    const deptId = req.user?.department_id;
    if (deptId == null) return res.status(401).json({ activated: false, reason: 'no_department' });
    const token = await loadActivatedJwt(deptId);
    if (!token) return res.json({ activated: false, reason: 'no_license_on_file' });
    const status = await validateLicense(token);
    res.json({ activated: status.active, ...status });
  } catch (err) {
    res.status(500).json({ activated: false, error: err.message });
  }
});

authedRouter.post('/activate', requireChief, express.json({ limit: '20kb' }), async (req, res) => {
  try {
    if (IS_DEMO) {
      return res.status(400).json({
        ok: false, error: 'This is the public OpenFirehouse demo. License activation is disabled here.',
      });
    }
    const deptId = req.user?.department_id;
    if (deptId == null) return res.status(401).json({ ok: false, error: 'no department context' });

    const token = (req.body && typeof req.body.jwt === 'string') ? req.body.jwt.trim() : '';
    if (!token) return res.status(400).json({ ok: false, error: 'jwt required in body' });

    const status = await validateLicense(token);
    if (!status.active) {
      return res.status(400).json({ ok: false, error: 'license invalid', reason: status.reason });
    }

    // App-layer isolation boundary (service_role bypasses RLS): a license may only
    // be activated for the department it was signed for, by a chief of THAT
    // department. The dept_id comes from the cryptographically-verified JWT.
    if (status.dept_id == null || Number(status.dept_id) !== Number(deptId)) {
      return res.status(403).json({
        ok: false, error: 'This license is not issued for your department.', code: 'DEPT_MISMATCH',
      });
    }

    await persistActivation(token, status, req.body.activated_by || req.user?.username || null);
    console.log(JSON.stringify({
      kind: 'of_license_activated', department_id: deptId,
      license_id: status.license_id, tier: status.tier,
    }));
    res.json({ ok: true, ...status });
  } catch (err) {
    console.log(JSON.stringify({ kind: 'of_license_activate_error', message: err.message }));
    res.status(500).json({ ok: false, error: err.message });
  }
});

authedRouter.post('/deactivate', requireChief, async (req, res) => {
  try {
    const deptId = req.user?.department_id;
    if (deptId == null) return res.status(401).json({ ok: false, error: 'no department context' });
    await clearActivation(deptId);
    console.log(JSON.stringify({
      kind: 'of_license_deactivated', department_id: deptId, user: req.user?.username || 'unknown',
    }));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = { authedRouter };
