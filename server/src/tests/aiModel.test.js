'use strict';
// W3.2 — central AI model config + API-key redaction (2026-06-10)
const { test } = require('node:test');
const assert = require('node:assert');
const { AI_MODEL, AI_MODEL_HEAVY, OPENAI_MODEL, sanitizeAIError } = require('../config/aiModel');

test('model config exports non-empty strings', () => {
  for (const m of [AI_MODEL, AI_MODEL_HEAVY, OPENAI_MODEL]) {
    assert.equal(typeof m, 'string');
    assert.ok(m.length > 0);
  }
});

test('sanitizeAIError redacts provider API keys', () => {
  assert.equal(
    sanitizeAIError('Incorrect API key provided: sk-proj-AbCdEf1234567890xyz'),
    'Incorrect API key provided: sk-***'
  );
  assert.equal(
    sanitizeAIError('invalid x-api-key: sk-ant-api03-AbCdEf123456'),
    'invalid x-api-key: sk-ant-***'
  );
  assert.equal(
    sanitizeAIError('Authorization: Bearer abcDEF123456789.token-here failed'),
    'Authorization: Bearer *** failed'
  );
  assert.match(sanitizeAIError('"api_key": "abcdefgh12345678"'), /\*\*\*/);
});

test('sanitizeAIError leaves normal messages alone and never throws', () => {
  assert.equal(sanitizeAIError('rate limit exceeded'), 'rate limit exceeded');
  assert.equal(sanitizeAIError(''), '');
  assert.equal(sanitizeAIError(null), '');
  assert.equal(sanitizeAIError(undefined), '');
  // Short tokens that just look key-ish shouldn't be nuked
  assert.equal(sanitizeAIError('task sk-1 done'), 'task sk-1 done');
});
