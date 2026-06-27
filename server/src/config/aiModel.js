'use strict';
// Single source of truth for ALL AI model strings (W3.2, 2026-06-10).
//
// History: every AI route hardcoded 'claude-haiku-4-5-20241022' — an invalid
// model string (that date-version never existed), so every AI feature 500'd
// in production. Centralized here, overridable without a deploy.
//
// - AI_MODEL        — default Anthropic model (fast/cheap tier)
// - AI_MODEL_HEAVY  — Anthropic model for deliberately-heavier work
//                     (self-heal code fixes, deep incident analysis)
// - OPENAI_MODEL    — default OpenAI model (the OpenAI-first helpers)
const AI_MODEL       = process.env.AI_MODEL       || 'claude-haiku-4-5-20251001';
const AI_MODEL_HEAVY = process.env.AI_MODEL_HEAVY || 'claude-sonnet-4-20250514';
const OPENAI_MODEL   = process.env.OPENAI_MODEL   || 'gpt-4o-mini';

// Redact anything that looks like a provider API key from error text before
// it reaches logs or HTTP responses. Provider error bodies can echo the key
// ("Incorrect API key provided: sk-..."), and our helpers JSON.stringify
// those bodies into Error messages (the aiAction.js:122 class — W3.2).
function sanitizeAIError(text) {
  return String(text == null ? '' : text)
    .replace(/sk-ant-[A-Za-z0-9_-]{4,}/g, 'sk-ant-***')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/g, '$1***')
    .replace(/("?(?:x-api-key|api[_-]?key|authorization)"?\s*[:=]\s*"?)[A-Za-z0-9._-]{8,}/gi, '$1***');
}

module.exports = { AI_MODEL, AI_MODEL_HEAVY, OPENAI_MODEL, sanitizeAIError };
