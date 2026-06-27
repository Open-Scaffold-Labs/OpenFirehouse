'use strict';
/**
 * routes/aiAction.js — Unified AI Action Endpoint
 *
 * Single entry point for all contextual AI actions across every module.
 * Replaces the per-module AI route pattern with a centralized dispatcher.
 *
 * POST /api/ai/action
 *   Body: { action, module, record_id, data, options }
 *   Returns: { result, type, metadata }
 */

const express = require('express');
const router  = express.Router();
const actions = require('../utils/aiActionRegistry');

// AI provider calls go through the ONE guarded helper (utils/aiClient): it
// budget-checks before, records real token usage after, and centralizes the
// model + key-safe error handling. Prompt-injection guarding is applied at the
// call sites below via promptGuard (the dispatcher knows which part is data).
const { callAI } = require('../utils/aiClient');

// ── POST /api/ai/action — unified dispatcher ────────────────────────────────

router.post('/', async (req, res) => {
  const start = Date.now();
  try {
    const { action, module, record_id, data, options = {} } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }

    const actionDef = actions[action];
    if (!actionDef) {
      return res.status(400).json({
        error: `Unknown action: ${action}`,
        availableActions: Object.keys(actions),
      });
    }

    const stationId = req.user.department_id;

    // Build enriched context from DB
    const contextStr = await actionDef.buildContext({
      record_id,
      data,
      stationId,
      options,
      userId: req.user.id,
    });

    // Call the AI — context goes through the prompt-injection guard (W3.4):
    // record data is delimited as <station_data> and the system prompt gets
    // the standing data-is-not-instructions rule.
    const { guardedUserPrompt, guardedSystemPrompt } = require('../utils/promptGuard');
    const rawResult = await callAI(
      guardedSystemPrompt(actionDef.systemPrompt),
      guardedUserPrompt(
        `${module ? `Module: ${module}\n` : ''}${record_id ? `Record ID: ${record_id}\n` : ''}Data:\n`,
        contextStr
      ),
      {
        maxTokens: actionDef.maxTokens || 2000,
        temperature: actionDef.temperature || 0.4,
        meta: { stationId, action }, // budget check + usage recording
      },
    );

    // Format the result
    const formatted = actionDef.formatResult(rawResult);

    res.json({
      ...formatted,
      metadata: {
        action,
        module,
        record_id,
        duration_ms: Date.now() - start,
      },
    });

  } catch (err) {
    if (err.message === 'NO_API_KEY') {
      return res.status(503).json({
        error: 'No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your environment.',
      });
    }
    if (err.code === 'BUDGET_EXCEEDED') {
      return res.status(429).json({ error: err.message, code: 'BUDGET_EXCEEDED' });
    }
    // W3.2: provider error bodies can echo the API key ("Incorrect API key
    // provided: sk-...") — sanitize before logging or returning to the client.
    const { sanitizeAIError } = require('../config/aiModel');
    console.error(`AI action error [${req.body?.action}]:`, sanitizeAIError(err.stack || err.message));
    res.status(500).json({
      error: 'AI action failed',
      details: sanitizeAIError(err.message),
    });
  }
});

// ── POST /api/ai/action/apply — persist AI result back to DB ────────────────

router.post('/apply', async (req, res) => {
  try {
    const { action, record_id, result } = req.body;

    if (!action || !record_id) {
      return res.status(400).json({ error: 'action and record_id are required' });
    }

    const { saveHandlers } = require('../utils/aiActionRegistry');
    const handler = saveHandlers?.[action];

    if (!handler) {
      return res.status(400).json({
        error: `No save handler for action: ${action}`,
        saveable: Object.keys(saveHandlers || {}),
      });
    }

    const stationId = req.user.department_id;
    const saved = await handler({
      record_id,
      result,
      stationId,
      userId: req.user.id,
      userName: req.user.username,
    });

    res.json(saved);
  } catch (err) {
    const { sanitizeAIError } = require('../config/aiModel');
    console.error(`AI apply error [${req.body?.action}]:`, sanitizeAIError(err.stack || err.message));
    res.status(500).json({ error: 'Failed to save AI result', details: sanitizeAIError(err.message) });
  }
});

// ── POST /api/ai/action/package — generate full document package (Phase 5) ──

router.post('/package', async (req, res) => {
  try {
    const { incidentId } = req.body;
    if (!incidentId) {
      return res.status(400).json({ error: 'incidentId is required' });
    }

    const stationId = req.user.department_id;
    const userId = req.user.id;

    const { generatePackage } = require('../utils/documentPackage');
    // Adapt documentPackage's positional callAI(system, user, maxTokens, temperature)
    // to the shared opts-based helper, binding the department for budget/usage.
    const budgetedCallAI = (s, u, maxTokens, temperature) =>
      callAI(s, u, { maxTokens, temperature, meta: { stationId, action: 'incident_package' } });
    const result = await generatePackage(
      'incident_package',
      Number(incidentId),
      stationId,
      budgetedCallAI,
      userId
    );

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json({ data: result });
  } catch (err) {
    if (err.message === 'NO_API_KEY') {
      return res.status(503).json({
        error: 'No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your environment.',
      });
    }
    if (err.code === 'BUDGET_EXCEEDED') {
      return res.status(429).json({ error: err.message, code: 'BUDGET_EXCEEDED' });
    }
    const { sanitizeAIError } = require('../config/aiModel');
    console.error('Package generation error:', sanitizeAIError(err.stack || err.message));
    res.status(500).json({ error: 'Package generation failed', details: sanitizeAIError(err.message) });
  }
});

// ── GET /api/ai/action/usage — W3.5 per-department usage + budget ────────────

router.get('/usage', async (req, res) => {
  try {
    const summary = await require('../utils/aiBudget').usageSummary(req.user.department_id);
    res.json({ data: summary });
  } catch (err) {
    console.error('AI usage summary error:', err.message);
    res.status(500).json({ error: 'Failed to load AI usage' });
  }
});

// ── GET /api/ai/action/catalog — list available actions ─────────────────────

router.get('/catalog', (req, res) => {
  const catalog = Object.entries(actions).map(([key, def]) => ({
    action: key,
    maxTokens: def.maxTokens,
    responseFormat: def.responseFormat || 'text',
    temperature: def.temperature || 0.4,
  }));
  res.json({ actions: catalog, count: catalog.length });
});

module.exports = router;
