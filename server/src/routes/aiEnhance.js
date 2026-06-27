'use strict';
/**
 * routes/aiEnhance.js — AI Text Enhancement Endpoint
 *
 * Provides writing assistance for text fields: rewrite, make concise, professional tone, grammar fixes, etc.
 * Used by AIWriteTextarea and similar components.
 *
 * POST /api/ai/enhance
 *   Body: { text, action }
 *   action: 'rewrite', 'concise', 'professional', 'grammar', 'expand', 'casual'
 *   Returns: { enhanced }
 */

const express = require('express');
const router = express.Router();

// AI provider calls go through the ONE guarded helper (utils/aiClient): budget
// check before, real token usage after, centralized model + key-safe errors.
// Prompt-injection guarding (promptGuard) is applied at the call site.
const { callAI, sendAIError } = require('../utils/aiClient');
const { guardedSystemPrompt, guardedUserPrompt } = require('../utils/promptGuard');

/**
 * Enhancement action definitions
 */
const enhanceActions = {
  rewrite: {
    systemPrompt: 'You are a professional writing assistant. Rewrite the given text to be clearer and more engaging while preserving the original meaning.',
    userPrompt: (text) => `Rewrite this text:\n\n${text}`,
    temperature: 0.6,
  },
  concise: {
    systemPrompt: 'You are a professional editing assistant. Make the given text as concise as possible while retaining all important information.',
    userPrompt: (text) => `Make this more concise:\n\n${text}`,
    temperature: 0.3,
  },
  professional: {
    systemPrompt: 'You are a professional communication expert. Rewrite the given text in a formal, professional tone suitable for official documents.',
    userPrompt: (text) => `Rewrite this in a professional tone:\n\n${text}`,
    temperature: 0.4,
  },
  grammar: {
    systemPrompt: 'You are a professional editor. Fix grammar, spelling, and punctuation errors in the given text while preserving the original meaning and tone.',
    userPrompt: (text) => `Fix grammar and spelling in this text:\n\n${text}`,
    temperature: 0.2,
  },
  expand: {
    systemPrompt: 'You are a professional writer. Expand the given text by adding more detail, context, and examples while maintaining the original message.',
    userPrompt: (text) => `Expand and add more detail to this text:\n\n${text}`,
    temperature: 0.6,
  },
  casual: {
    systemPrompt: 'You are a friendly communication expert. Rewrite the given text in a casual, friendly tone while keeping it appropriate for the context.',
    userPrompt: (text) => `Rewrite this in a more casual, friendly tone:\n\n${text}`,
    temperature: 0.5,
  },
};

// ── POST /api/ai/enhance — enhance text with AI ──────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { text, action } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required and must be a string' });
    }

    if (!action || !enhanceActions[action]) {
      return res.status(400).json({
        error: `action must be one of: ${Object.keys(enhanceActions).join(', ')}`,
      });
    }

    const def = enhanceActions[action];
    const enhanced = await callAI(
      guardedSystemPrompt(def.systemPrompt),
      guardedUserPrompt('Data:\n', def.userPrompt(text)),
      {
        maxTokens: 1000,
        temperature: def.temperature,
        heavy: false,
        meta: { stationId: req.user.department_id, action: `enhance_${action}` },
      },
    );

    res.json({ enhanced: enhanced.trim() });
  } catch (err) {
    if (sendAIError(res, err)) return;
    const { sanitizeAIError } = require('../config/aiModel');
    console.error('AI enhance error:', sanitizeAIError(err.stack || err.message));
    res.status(500).json({
      error: 'Text enhancement failed',
      details: sanitizeAIError(err.message),
    });
  }
});

module.exports = router;
