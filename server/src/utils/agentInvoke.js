'use strict';
/**
 * agentInvoke.js — run a prepared fire verb against the existing route, or
 * enqueue it. The existing routers stay the write doors; this file only
 * decides execute vs. queue and builds a synthetic request for the router.
 */

const { pool } = require('../db');
const { prepareInvocation } = require('./agentVerbRegistry');
const { effectiveLevel } = require('../middleware/requireRole');

const routers = {
  incidents: () => require('../routes/incidents'),
  members: () => require('../routes/members'),
  training: () => require('../routes/training'),
  units: () => require('../routes/units'),
  messages: () => require('../routes/messages'),
};

function dispatchExisting(parentReq, route) {
  const load = routers[route.router];
  if (!load) {
    return Promise.resolve({ status: 500, body: { error: `No wrapper for router ${route.router}` } });
  }
  const router = load();
  const req = {
    method: route.method,
    url: route.url,
    originalUrl: route.url,
    path: route.url,
    body: route.body || {},
    query: route.query || {},
    params: {},
    headers: parentReq.headers || {},
    user: parentReq.user,
    get: typeof parentReq.get === 'function' ? parentReq.get.bind(parentReq) : () => undefined,
    app: parentReq.app,
  };

  return new Promise((resolve) => {
    let settled = false;
    const done = (status, body) => {
      if (settled) return;
      settled = true;
      resolve({ status, body });
    };
    let statusCode = 200;
    const res = {
      statusCode,
      status(c) { statusCode = c; this.statusCode = c; return this; },
      json(body) { done(statusCode, body); return this; },
      send(body) { done(statusCode, body); return this; },
      end(body) { done(statusCode, body); return this; },
      set() { return this; },
      setHeader() { return this; },
      getHeader() { return undefined; },
    };
    try {
      router(req, res, (err) => {
        if (err) done(500, { error: err.message || 'Route error' });
        else done(statusCode === 200 ? 404 : statusCode, { error: 'No matching route' });
      });
    } catch (err) {
      done(500, { error: err.message || 'Dispatch failed' });
    }
  });
}

async function findChiefUsernames(departmentId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT LOWER(u.username) AS username
       FROM users u
       JOIN of_user_departments ud ON ud.user_id = u.id
      WHERE ud.department_id = $1
        AND ud.role IN ('chief','deputy_chief','battalion_chief','training_battalion','admin')`,
    [departmentId]
  );
  if (rows.length) return rows.map((r) => r.username);
  const fallback = await pool.query(
    `SELECT LOWER(username) AS username FROM users
      WHERE station_id = $1
        AND role IN ('chief','deputy_chief','battalion_chief','training_battalion','admin')`,
    [departmentId]
  );
  return fallback.rows.map((r) => r.username);
}

async function executePrepared(parentReq, prepared, extra = {}) {
  if (prepared.executePlan && prepared.executePlan.kind === 'neris_submit') {
    const id = prepared.executePlan.incidentId;
    const review = await dispatchExisting(parentReq, {
      router: 'incidents', method: 'POST', url: `/${id}/neris-status`,
      body: { action: 'submit_review' },
    });
    // Already in_review / approved is fine — fall through to approve.
    if (review.status >= 500) return review;
    const approve = await dispatchExisting(parentReq, {
      router: 'incidents', method: 'POST', url: `/${id}/neris-status`,
      body: { action: 'approve' },
    });
    return approve;
  }

  if (prepared.executePlan && prepared.executePlan.kind === 'notify_chief') {
    const recipients = await findChiefUsernames(parentReq.user.department_id);
    if (!recipients.length) {
      return { status: 422, body: { error: 'No chief accounts found in this department.', code: 'NO_CHIEF' } };
    }
    const requestedBy = extra.requestedByName ? `Agent request by ${extra.requestedByName}\n\n` : '';
    return dispatchExisting(parentReq, {
      router: 'messages',
      method: 'POST',
      url: '/',
      body: {
        recipients,
        subject: prepared.executePlan.subject,
        body: requestedBy + prepared.executePlan.body,
      },
    });
  }

  return dispatchExisting(parentReq, prepared.route);
}

async function enqueueApproval(user, prepared) {
  const { rows } = await pool.query(
    `INSERT INTO agent_approvals
       (department_id, verb, status, payload, summary,
        requested_by, requested_by_name, requested_by_role)
     VALUES ($1,$2,'pending',$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      user.department_id,
      prepared.verb,
      JSON.stringify({
        route: prepared.route,
        executePlan: prepared.executePlan,
        droppedKeys: prepared.droppedKeys,
      }),
      prepared.summary,
      user.id,
      user.name || user.username || '',
      user.role || '',
    ]
  );
  return rows[0];
}

async function invoke(parentReq, verbName, args) {
  const prepared = prepareInvocation(verbName, args, parentReq.user);
  if (!prepared.ok) return prepared;

  if (prepared.gate === 'approval') {
    const item = await enqueueApproval(parentReq.user, prepared);
    return {
      ok: true,
      status: 202,
      queued: true,
      approval: item,
      droppedKeys: prepared.droppedKeys,
    };
  }

  const result = await executePrepared(parentReq, prepared);
  return {
    ok: result.status < 400,
    status: result.status,
    queued: false,
    result: result.body,
    droppedKeys: prepared.droppedKeys,
  };
}

async function listApprovals(departmentId, status) {
  const params = [departmentId];
  let q = 'SELECT * FROM agent_approvals WHERE department_id = $1';
  if (status) {
    params.push(status);
    q += ` AND status = $${params.length}`;
  }
  q += ' ORDER BY created_at DESC';
  const { rows } = await pool.query(q, params);
  return rows;
}

async function getApproval(id, departmentId) {
  const { rows } = await pool.query(
    'SELECT * FROM agent_approvals WHERE id = $1 AND department_id = $2',
    [id, departmentId]
  );
  return rows[0] || null;
}

async function resolveApproval(parentReq, id, decision, note) {
  if (effectiveLevel(parentReq.user) < 2) {
    return {
      ok: false,
      status: 403,
      error: 'This action requires officer authority.',
      code: 'FORBIDDEN_ROLE',
    };
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    return { ok: false, status: 400, error: 'decision must be approved or rejected', code: 'INVALID_ARGS' };
  }

  const existing = await getApproval(id, parentReq.user.department_id);
  if (!existing) return { ok: false, status: 404, error: 'Approval not found' };
  if (existing.status !== 'pending') {
    return {
      ok: false,
      status: 409,
      error: `This item is already ${existing.status}`,
      code: 'ALREADY_RESOLVED',
    };
  }

  if (decision === 'rejected') {
    const { rows } = await pool.query(
      `UPDATE agent_approvals
          SET status = 'rejected',
              resolved_by = $3,
              resolved_by_name = $4,
              resolved_at = NOW(),
              resolve_note = $5
        WHERE id = $1 AND department_id = $2 AND status = 'pending'
        RETURNING *`,
      [id, parentReq.user.department_id, parentReq.user.id, parentReq.user.name || parentReq.user.username || '', note || null]
    );
    if (!rows[0]) {
      return { ok: false, status: 409, error: 'This item was resolved by someone else', code: 'STALE' };
    }
    return { ok: true, status: 200, approval: rows[0] };
  }

  const claimed = await pool.query(
    `UPDATE agent_approvals
        SET status = 'approved',
            resolved_by = $3,
            resolved_by_name = $4,
            resolved_at = NOW(),
            resolve_note = $5
      WHERE id = $1 AND department_id = $2 AND status = 'pending'
      RETURNING *`,
    [id, parentReq.user.department_id, parentReq.user.id, parentReq.user.name || parentReq.user.username || '', note || null]
  );
  if (!claimed.rows[0]) {
    return { ok: false, status: 409, error: 'This item was resolved by someone else', code: 'STALE' };
  }

  const payload = claimed.rows[0].payload || {};
  const prepared = {
    verb: claimed.rows[0].verb,
    route: payload.route,
    executePlan: payload.executePlan || { kind: 'route' },
    droppedKeys: payload.droppedKeys || [],
    summary: claimed.rows[0].summary,
  };

  const result = await executePrepared(parentReq, prepared, {
    requestedByName: claimed.rows[0].requested_by_name,
  });

  if (result.status >= 400) {
    await pool.query(
      `UPDATE agent_approvals
          SET status = 'pending', resolved_by = NULL, resolved_by_name = NULL,
              resolved_at = NULL, resolve_note = NULL
        WHERE id = $1 AND department_id = $2`,
      [id, parentReq.user.department_id]
    );
    return {
      ok: false,
      status: result.status,
      error: (result.body && result.body.error) || 'Underlying route refused the write',
      code: (result.body && result.body.code) || 'EXECUTE_FAILED',
      result: result.body,
    };
  }

  return { ok: true, status: 200, approval: claimed.rows[0], result: result.body };
}

module.exports = {
  dispatchExisting,
  executePrepared,
  invoke,
  listApprovals,
  getApproval,
  resolveApproval,
  findChiefUsernames,
};
