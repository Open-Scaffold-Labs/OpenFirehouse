'use strict';
/**
 * utils/aiBudget.js — per-department AI token budgets + usage tracking
 * (W3.5, roadmap 4.7, 2026-06-10).
 *
 * BYO-key departments previously had no ceiling: a runaway loop or a hostile
 * oversized record was a real bill for a volunteer department. Now every
 * dispatcher-routed AI call:
 *   1. assertWithinBudget(stationId) BEFORE the provider call — throws a
 *      BUDGET_EXCEEDED error (handlers map it to HTTP 429) once today's
 *      recorded tokens reach the station's daily budget;
 *   2. recordUsage(...) AFTER — real token counts from the provider's usage
 *      block when available, chars/4 estimate otherwise (estimates marked).
 *
 * Budget resolution: stations.ai_daily_token_budget (per-department override)
 * → env AI_DAILY_TOKEN_BUDGET → 250,000 tokens/day default.
 *
 * Table (also hand-applied to prod — initDb's fast-path skips CREATEs on
 * existing DBs):
 *   ai_usage(station_id, used_on, action, model, input_tokens, output_tokens,
 *            estimated, calls, created_at)
 */

const { pool } = require('../db');

const DEFAULT_DAILY_BUDGET = parseInt(process.env.AI_DAILY_TOKEN_BUDGET || '250000', 10);

let tableEnsured = false;
async function ensureTable() {
  if (tableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_usage (
        id SERIAL PRIMARY KEY,
        station_id INTEGER NOT NULL,
        department_id INTEGER,
        used_on DATE NOT NULL DEFAULT CURRENT_DATE,
        action TEXT DEFAULT '',
        model TEXT DEFAULT '',
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        estimated BOOLEAN DEFAULT FALSE,
        calls INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // department_id is the tenant key the read/enforcement paths filter on. On
    // already-provisioned prod the column was added by the 0019 sweep; this
    // ALTER is the fresh-install / older-DB self-heal so writes + reads agree.
    await pool.query('ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS department_id INTEGER');
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_ai_usage_dept_date ON ai_usage (department_id, used_on)'
    );
    tableEnsured = true;
  } catch (e) {
    console.error('[aiBudget] ensureTable failed:', e.message);
  }
}

async function getDailyBudget(stationId) {
  try {
    const { rows } = await pool.query(
      'SELECT ai_daily_token_budget FROM stations WHERE id = $1',
      [stationId]
    );
    const v = rows[0]?.ai_daily_token_budget;
    if (Number.isFinite(Number(v)) && Number(v) > 0) return Number(v);
  } catch (_) { /* column may not exist on old installs — fall through */ }
  return DEFAULT_DAILY_BUDGET;
}

async function getTodayUsage(stationId) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
            COALESCE(SUM(calls), 0) AS calls
     FROM ai_usage WHERE department_id = $1 AND used_on = CURRENT_DATE`,
    [stationId]
  );
  return { tokens: parseInt(rows[0].tokens, 10), calls: parseInt(rows[0].calls, 10) };
}

/** Throws { code: 'BUDGET_EXCEEDED', status: 429 } when today's spend ≥ budget. */
async function assertWithinBudget(stationId) {
  const [budget, usage] = await Promise.all([getDailyBudget(stationId), getTodayUsage(stationId)]);
  if (usage.tokens >= budget) {
    const err = new Error(
      `Daily AI token budget reached (${usage.tokens.toLocaleString()} of ${budget.toLocaleString()} tokens used today). ` +
      'Resets at midnight UTC. A chief can raise the budget in Station Settings.'
    );
    err.code = 'BUDGET_EXCEEDED';
    err.status = 429;
    throw err;
  }
  return { budget, used: usage.tokens };
}

/**
 * Record a completed call. Fire-and-forget by design — usage tracking must
 * never fail the user's AI request.
 *
 * Writes BOTH department_id (the tenant key the budget reads/enforces on) and
 * the legacy NOT-NULL station_id, to the same department id. Previously this
 * wrote only station_id while the reads filtered department_id, so recorded
 * usage was invisible and the budget never actually accumulated (M1 fix).
 * @param {number} departmentId  the caller's department id
 * @param {{action?: string, model?: string, inputTokens?: number,
 *          outputTokens?: number, estimated?: boolean}} u
 */
async function recordUsage(departmentId, u = {}) {
  try {
    await ensureTable();
    await pool.query(
      `INSERT INTO ai_usage (station_id, department_id, action, model, input_tokens, output_tokens, estimated)
       VALUES ($1, $1, $2, $3, $4, $5, $6)`,
      [departmentId, u.action || '', u.model || '',
       Math.max(0, Math.round(u.inputTokens || 0)),
       Math.max(0, Math.round(u.outputTokens || 0)),
       !!u.estimated]
    );
  } catch (e) {
    console.error('[aiBudget] recordUsage failed:', e.message);
  }
}

/** chars/4 estimate for providers/paths that don't return a usage block. */
function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

/** Summary for the usage endpoint / Station Settings display. */
async function usageSummary(stationId) {
  await ensureTable();
  const [budget, today] = await Promise.all([getDailyBudget(stationId), getTodayUsage(stationId)]);
  const { rows: daily } = await pool.query(
    `SELECT used_on, SUM(input_tokens + output_tokens) AS tokens, SUM(calls) AS calls
     FROM ai_usage
     WHERE department_id = $1 AND used_on >= CURRENT_DATE - INTERVAL '30 days'
     GROUP BY used_on ORDER BY used_on DESC`,
    [stationId]
  );
  const { rows: byAction } = await pool.query(
    `SELECT action, SUM(input_tokens + output_tokens) AS tokens, SUM(calls) AS calls
     FROM ai_usage
     WHERE department_id = $1 AND used_on >= CURRENT_DATE - INTERVAL '30 days'
     GROUP BY action ORDER BY tokens DESC LIMIT 20`,
    [stationId]
  );
  return {
    budget,
    today: { tokens: today.tokens, calls: today.calls, remaining: Math.max(0, budget - today.tokens) },
    last30Days: daily.map(d => ({ date: d.used_on, tokens: parseInt(d.tokens, 10), calls: parseInt(d.calls, 10) })),
    byAction: byAction.map(a => ({ action: a.action, tokens: parseInt(a.tokens, 10), calls: parseInt(a.calls, 10) })),
  };
}

module.exports = { assertWithinBudget, recordUsage, estimateTokens, usageSummary, getDailyBudget, getTodayUsage, DEFAULT_DAILY_BUDGET };
