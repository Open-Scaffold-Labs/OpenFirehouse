'use strict';
/**
 * utils/aiClient.js — the ONE guarded AI provider helper (M1, 2026-06-15).
 *
 * Every AI feature must reach a provider through callAI() so all calls inherit,
 * in a single place:
 *   - per-department daily token BUDGET (utils/aiBudget): assert before, record after;
 *   - centralized MODEL strings (config/aiModel) — never hardcode a model;
 *   - API-key-safe error shape (NO_API_KEY → 503, BUDGET_EXCEEDED → 429).
 * Callers remain responsible for wrapping untrusted record data with
 * utils/promptGuard before passing it in (the injection guard can't know which
 * part of a prompt is attacker-influenceable).
 *
 * Before this, ~14 route files each carried a near-duplicate local callAI with
 * no budget, no injection guard, and divergent models; the M1 sweep removed them.
 *
 * Provider order: OpenAI first (if OPENAI_API_KEY) else Anthropic (if
 * ANTHROPIC_API_KEY) — preserving the prior per-route behavior. The Anthropic
 * request intentionally OMITS `temperature` (every prior route helper did too —
 * Anthropic then uses its default); OpenAI keeps `temperature` as before.
 */

const aiBudget = require('./aiBudget');
const { AI_MODEL, AI_MODEL_HEAVY, OPENAI_MODEL } = require('../config/aiModel');

/**
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object}  [opts]
 * @param {number}  [opts.maxTokens=2000]
 * @param {number}  [opts.temperature=0.4]  OpenAI only (Anthropic uses its default)
 * @param {boolean} [opts.heavy=false]      use the heavier Anthropic tier (AI_MODEL_HEAVY)
 * @param {string}  [opts.model]            explicit model override (rare)
 * @param {{stationId?:number, action?:string}} [opts.meta]  budget owner (department id) + label
 * @returns {Promise<string>}  the model's text output
 * @throws  Error('NO_API_KEY') when neither provider key is set;
 *          { code:'BUDGET_EXCEEDED', status:429 } when the department's daily budget is spent.
 */
async function callAI(systemPrompt, userPrompt, opts = {}) {
  const { maxTokens = 2000, temperature = 0.4, heavy = false, model, meta = null } = opts;
  const deptId = meta && meta.stationId != null ? meta.stationId : null;

  if (deptId != null) {
    await aiBudget.assertWithinBudget(deptId); // throws 429-shaped on exceed
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openaiKey) {
    const useModel = model || OPENAI_MODEL;
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: useModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'OpenAI error');
    const text = data.choices?.[0]?.message?.content || '';
    if (deptId != null) {
      const u = data.usage;
      aiBudget.recordUsage(deptId, {
        action: meta.action, model: useModel,
        inputTokens: u?.prompt_tokens ?? aiBudget.estimateTokens(systemPrompt + userPrompt),
        outputTokens: u?.completion_tokens ?? aiBudget.estimateTokens(text),
        estimated: !u,
      });
    }
    return text;
  }

  if (anthropicKey) {
    const useModel = model || (heavy ? AI_MODEL_HEAVY : AI_MODEL);
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'Anthropic error');
    const text = data.content?.[0]?.text || '';
    if (deptId != null) {
      const u = data.usage;
      aiBudget.recordUsage(deptId, {
        action: meta.action, model: useModel,
        inputTokens: u?.input_tokens ?? aiBudget.estimateTokens(systemPrompt + userPrompt),
        outputTokens: u?.output_tokens ?? aiBudget.estimateTokens(text),
        estimated: !u,
      });
    }
    return text;
  }

  throw new Error('NO_API_KEY');
}

/**
 * Consistent HTTP mapping for AI errors. Returns true if it sent a response
 * (caller should `return`), false if the error is not AI-specific (caller logs
 * with sanitizeAIError + returns its own 500).
 */
function sendAIError(res, err) {
  if (err && err.message === 'NO_API_KEY') {
    res.status(503).json({ error: 'No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your environment.' });
    return true;
  }
  if (err && err.code === 'BUDGET_EXCEEDED') {
    res.status(429).json({ error: err.message, code: 'BUDGET_EXCEEDED' });
    return true;
  }
  return false;
}

module.exports = { callAI, sendAIError };
