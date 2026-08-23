'use strict';
/**
 * Who may resolve an agent approval. Pure — no DB.
 *
 * Officer+ is not enough: the requester cannot accept or reject their own
 * item. That is the human gate. The MCP token is a member/service account;
 * a different human officer acts on the Dashboard.
 */

const { effectiveLevel } = require('../middleware/requireRole');

function sameRequester(user, approval) {
  const uid = user && user.id;
  const rid = approval && approval.requested_by;
  if (uid == null || rid == null || uid === '' || rid === '') return false;
  return String(uid) === String(rid);
}

function authorizeResolve(user, approval) {
  if (effectiveLevel(user) < 2) {
    return {
      ok: false,
      status: 403,
      error: 'This action requires officer authority.',
      code: 'FORBIDDEN_ROLE',
    };
  }
  if (!approval) {
    return { ok: false, status: 404, error: 'Approval not found' };
  }
  if (approval.status !== 'pending') {
    return {
      ok: false,
      status: 409,
      error: `This item is already ${approval.status}`,
      code: 'ALREADY_RESOLVED',
    };
  }
  if (sameRequester(user, approval)) {
    return {
      ok: false,
      status: 403,
      error: 'The requester cannot accept or reject their own item. A different officer must act on the Dashboard.',
      code: 'SELF_ACCEPT_FORBIDDEN',
    };
  }
  return { ok: true };
}

module.exports = { sameRequester, authorizeResolve };
