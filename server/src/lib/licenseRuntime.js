'use strict';
/**
 * lib/licenseRuntime.js — server-side runtime license validator.
 * ADR-0001 Step 13.
 *
 * Validates a JWT against the embedded public keys, checks the cloud ledger
 * for revocation, returns a structured status object.
 *
 * Two-lever model (same as FireHazmat ADR-0007 Decision 5):
 *   - Signature + expiry are the OFFLINE entitlement. If the JWT verifies
 *     and isn't expired, the basic UI works even with no internet.
 *   - The ledger status check adds a server-gated layer. Fail-OPEN on DB
 *     errors so a transient outage never drops a paying department.
 */
const jwt = require('jsonwebtoken');
const { supabase } = require('./licensing');

const LICENSE_PUBLIC_KEYS = {
  'of-k1': `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvE8xImdNh47ywSf8GBHg
rgW1Zb961xhMgME9aY7PEgCG/KZJT5sChmWbNIwSnwuWFhJzDJZTNv1Mi5arX9nR
DMvVRtWESSQ/MPGsfuRePSkhcIL0PICgsrWyLHTnhbklXTYSOPIchH62YG30/eH8
TnkAbLHaNNGwX/hltsBEsfBBcP5CQRCVb7ifcat53ALfhTvcxcISiiyZjPSG2grj
z5LV1E2+lYUWoT4DPKDtVSywNYMvsE668bgvrcnOXiUQ/vRtpXlBVhWhiNcU4n51
gBcSIKnsYt+azd0RyWYcO1pTUVLx3+teLPTGvJXnb7uOUp6WaIuGMFhjbpo8ZGmt
tQIDAQAB
-----END PUBLIC KEY-----`,
};
const DEFAULT_KID = 'of-k1';

const ISSUER   = 'openscaffoldlabs.com';
const SUBJECT  = 'openfirehouse-dept-license';
const AUDIENCE = 'com.openscaffoldlabs.openfirehouse';

/**
 * Verify a JWT cryptographically + claim-check. Does NOT consult the
 * ledger (that's checkRevocation()). Returns { ok, payload, reason }.
 */
function verifyOffline(token) {
  if (typeof token !== 'string' || !token.trim()) return { ok: false, reason: 'empty_token' };
  // Decode the header without verifying to get kid
  let kid = DEFAULT_KID;
  try {
    const headerB64 = token.split('.')[0];
    const headerJson = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    if (typeof headerJson.kid === 'string' && headerJson.kid) kid = headerJson.kid;
  } catch { /* keep default */ }
  const pem = LICENSE_PUBLIC_KEYS[kid];
  if (!pem) return { ok: false, reason: 'unknown_kid' };
  try {
    const payload = jwt.verify(token, pem, {
      algorithms: ['RS256'],
      issuer: ISSUER, audience: AUDIENCE,
    });
    if (payload.sub !== SUBJECT) return { ok: false, reason: 'wrong_subject' };
    if (payload.product !== 'openfirehouse' && payload.product !== undefined) return { ok: false, reason: 'wrong_product' };
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, reason: `verify_failed: ${e.message}` };
  }
}

/**
 * Check the cloud ledger for revocation. FAIL OPEN on DB errors or unknown
 * jti — same posture as FireHazmat Edge Functions.
 */
async function checkRevocation(jti) {
  if (!jti) return { blocked: false };
  try {
    const sb = supabase();
    const { data, error } = await sb
      .from('licenses')
      .select('status, revoked_reason')
      .eq('jti', jti)
      .eq('product_family', 'openfirehouse')
      .maybeSingle();
    if (error) {
      console.warn('license ledger lookup failed (fail-open):', error.message);
      return { blocked: false, ledger: 'unreachable' };
    }
    if (!data) return { blocked: false, ledger: 'not_found' };
    if (data.status === 'revoked' || data.status === 'refunded') {
      return { blocked: true, reason: data.status, ledger_reason: data.revoked_reason };
    }
    return { blocked: false, ledger: 'active' };
  } catch (e) {
    console.warn('license ledger lookup threw (fail-open):', String(e));
    return { blocked: false, ledger: 'error' };
  }
}

/**
 * Full validation: signature + expiry + revocation. Returns the public-
 * facing status object the API endpoints emit.
 */
async function validateLicense(token) {
  const off = verifyOffline(token);
  if (!off.ok) return { active: false, reason: off.reason };
  const p = off.payload;
  const rev = await checkRevocation(p.jti);
  if (rev.blocked) return {
    active: false, reason: 'revoked', ledger_reason: rev.ledger_reason,
    license_id: p.license_id, dept_name: p.dept_name, tier: p.tier,
  };
  return {
    active: true,
    license_id: p.license_id,
    jti:        p.jti,
    dept_id:    p.dept_id,
    dept_name:  p.dept_name,
    dept_email: p.dept_email,
    tier:       p.tier,
    expires_at: p.exp ? new Date(p.exp * 1000).toISOString() : null,
    issued_by:  p.issued_by,
    ledger:     rev.ledger || 'active',
  };
}

/**
 * Persist a validated JWT to public.license_config, keyed by the license's
 * department (one active license per department). The department comes from the
 * VALIDATED JWT's dept_id claim — never from caller input — so an activation can
 * only ever land on the department the issuer signed it for. The caller
 * (routes/licenseRuntime) additionally checks that the activating user belongs to
 * that department before calling this. (Runtime uses the RLS-bypassing
 * service_role key, so this app-layer scoping IS the isolation boundary.)
 */
async function persistActivation(token, status, activatedBy) {
  if (status.dept_id == null) {
    throw new Error('License JWT has no dept_id claim — cannot scope activation to a department');
  }
  const sb = supabase();
  const { error } = await sb.from('license_config').upsert({
    department_id: status.dept_id,
    jwt: token,
    jti: status.jti,
    license_id: status.license_id,
    dept_name:  status.dept_name,
    dept_email: status.dept_email,
    tier:       status.tier,
    expires_at: status.expires_at,
    activated_at: new Date().toISOString(),
    activated_by: activatedBy || null,
  }, { onConflict: 'department_id' });
  if (error) throw new Error(`Persist failed: ${error.message}`);
}

/** Read a department's activated license JWT from DB (or null). */
async function loadActivatedJwt(departmentId) {
  if (departmentId == null) return null;
  try {
    const sb = supabase();
    const { data, error } = await sb
      .from('license_config').select('jwt')
      .eq('department_id', departmentId)
      .maybeSingle();
    if (error || !data) return null;
    return data.jwt;
  } catch { return null; }
}

/** Clear a department's activated license (explicit deactivation). */
async function clearActivation(departmentId) {
  if (departmentId == null) throw new Error('clearActivation requires a departmentId');
  const sb = supabase();
  const { error } = await sb.from('license_config').delete().eq('department_id', departmentId);
  if (error) throw new Error(`Clear failed: ${error.message}`);
}

module.exports = {
  verifyOffline, checkRevocation, validateLicense,
  persistActivation, loadActivatedJwt, clearActivation,
  LICENSE_PUBLIC_KEYS, DEFAULT_KID,
};
