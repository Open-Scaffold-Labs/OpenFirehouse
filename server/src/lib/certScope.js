'use strict';
/**
 * Shared cert-oversight scope resolver (Step 2 — migration 0027). Used by both
 * /api/notifications/rank-config and /api/alerts so there's ONE source of truth
 * for "which members' cert alerts does this viewer see."
 *
 * The pure branch decision is decideCertScope (config/rankNotifications, unit-tested);
 * this wrapper resolves the viewer's member row and runs the chosen member-id query.
 *
 * Bulletproofing: department-scoped throughout; a missing member row or a career
 * officer with no unit/group falls back to station scope (never empty, never a
 * crash) — an officer seeing MORE certs is safe; hiding all is the dangerous failure.
 *
 * ctx = { userId, departmentId, stationId }
 * returns { certScope, certMemberIds, memberId }
 */
const db = require('../db');
const { decideCertScope } = require('../config/rankNotifications');

async function resolveCertScope(ctx, tier) {
  const dept = ctx.departmentId;
  const member = await db.members.memberByUserId(ctx.userId, dept).catch(() => null);
  const decision = decideCertScope(tier, member, ctx.stationId);
  let certMemberIds = null;
  if (decision.source?.kind === 'crew') {
    certMemberIds = await db.members.crewMemberIds(dept, decision.source.unitId, decision.source.group);
  } else if (decision.source?.kind === 'station') {
    certMemberIds = await db.members.stationMemberIds(dept, decision.source.stationId);
  }
  return { certScope: decision.scope, certMemberIds, memberId: member?.id ?? null };
}

module.exports = { resolveCertScope };
