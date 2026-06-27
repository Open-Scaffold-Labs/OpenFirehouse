/**
 * Email Ingest API Routes
 *
 * Migration SQL (run this to create the table):
 *
 * CREATE TABLE IF NOT EXISTS email_documents (
 *   id SERIAL PRIMARY KEY,
 *   station_id INTEGER REFERENCES stations(id),
 *   module VARCHAR(64),
 *   subject TEXT,
 *   from_address VARCHAR(255),
 *   content TEXT,
 *   metadata JSONB,
 *   filed_at TIMESTAMP DEFAULT NOW(),
 *   filed_by INTEGER REFERENCES members(id),
 *   created_at TIMESTAMP DEFAULT NOW()
 * );
 * CREATE INDEX idx_email_documents_module ON email_documents(module);
 * CREATE INDEX idx_email_documents_station ON email_documents(station_id);
 * CREATE INDEX idx_email_documents_filed_at ON email_documents(filed_at DESC);
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { processEmailIntelligence } = require('../utils/inboundIntelligence');
const { callAI, sendAIError } = require('../utils/aiClient');
const { guardedSystemPrompt, guardedUserPrompt } = require('../utils/promptGuard');

// ─────────────────────────────────────────────────────────────────────────
// Module keyword configuration
// ─────────────────────────────────────────────────────────────────────────

const MODULE_KEYWORDS = {
  'aid-agreements': ['agreement', 'mutual aid', 'mou', 'cooperative', 'assistance'],
  'grants': ['grant', 'fema', 'afg', 'safer', 'award', 'funding', 'federal'],
  'training': ['training', 'certification', 'class', 'course', 'recertification', 'nfpa', 'academy'],
  'maintenance': ['maintenance', 'repair', 'service', 'pump test', 'ladder test', 'apparatus', 'warranty'],
  'incidents': ['incident', 'fire', 'response', 'dispatch', 'investigation', 'arson'],
  'budget': ['budget', 'invoice', 'purchase', 'expense', 'fiscal', 'payment', 'vendor'],
  'doc-vault': ['document', 'policy', 'contract', 'insurance', 'legal', 'ordinance'],
  'sogs': ['sog', 'sop', 'guideline', 'standard operating', 'protocol'],
  'personnel-actions': ['personnel', 'hire', 'termination', 'promotion', 'disciplinary'],
  'inspections': ['inspection', 'violation', 'code', 'compliance', 'fire marshal'],
  'hazmat': ['hazmat', 'hazardous', 'msds', 'sds', 'chemical', 'spill'],
  'meeting-minutes': ['meeting', 'minutes', 'agenda', 'motion', 'vote', 'board'],
};

// ─────────────────────────────────────────────────────────────────────────
// Keyword-based classification helper
// ─────────────────────────────────────────────────────────────────────────

function classifyByKeywords(content, subject, from) {
  const text = `${subject || ''} ${content || ''} ${from || ''}`.toLowerCase();
  const results = {};

  for (const [moduleId, keywords] of Object.entries(MODULE_KEYWORDS)) {
    let matchCount = 0;
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      matchCount += (text.match(regex) || []).length;
    }
    if (matchCount > 0) {
      results[moduleId] = {
        confidence: Math.min(1, matchCount / keywords.length / 2),
        matchCount,
      };
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// Optional AI classification (if API keys are available)
// ─────────────────────────────────────────────────────────────────────────

async function classifyWithAI(content, subject, from, stationId) {
  const hasAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const hasOpenAIKey = process.env.OPENAI_API_KEY;

  if (!hasAnthropicKey && !hasOpenAIKey) {
    return null;
  }

  const moduleList = Object.keys(MODULE_KEYWORDS).join(', ');
  const systemPrompt = `Classify this email into one or more of these modules (return as a JSON object with module IDs as keys and confidence scores 0-1 as values, or empty {} if none match):

Modules: ${moduleList}

Return ONLY valid JSON like {"module-id": 0.8, "another-module": 0.6} or {}.`;

  const emailData = `Subject: ${subject || '(no subject)'}
From: ${from || '(no from)'}
Content: ${content.slice(0, 500)}...`;

  try {
    const text = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Email to classify:\n', emailData),
      {
        maxTokens: 256,
        heavy: false,
        meta: { stationId, action: 'email_classify' },
      },
    ) || '{}';
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch (err) {
    console.error('AI classification error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/email-ingest/classify
// Detects modules with confidence scores
// ─────────────────────────────────────────────────────────────────────────

router.post('/classify', async (req, res) => {
  try {
    const { content, subject, from } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    // Start with keyword-based classification
    const keywordResults = classifyByKeywords(content, subject, from);

    // Attempt AI classification if available
    const aiResults = await classifyWithAI(content, subject, from, req.user.department_id);

    // Merge results, preferring AI confidence if available, otherwise use keyword confidence
    const merged = { ...keywordResults };
    if (aiResults && typeof aiResults === 'object') {
      for (const [moduleId, aiConfidence] of Object.entries(aiResults)) {
        if (typeof aiConfidence === 'number' && aiConfidence > 0) {
          merged[moduleId] = {
            confidence: Math.max(aiConfidence, merged[moduleId]?.confidence || 0),
            matchCount: merged[moduleId]?.matchCount || 0,
            aiDetected: true,
          };
        }
      }
    }

    // Sort by confidence descending
    const sorted = Object.entries(merged)
      .sort(([, a], [, b]) => b.confidence - a.confidence)
      .reduce((acc, [moduleId, data]) => ({ ...acc, [moduleId]: data }), {});

    res.json({
      modules: sorted,
      totalModulesDetected: Object.keys(sorted).length,
    });
  } catch (err) {
    if (sendAIError(res, err)) return;
    console.error('classify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/email-ingest/file
// Creates a record in the email_documents table
// ─────────────────────────────────────────────────────────────────────────

router.post('/file', async (req, res) => {
  try {
    const { content, subject, from, date, module_id, metadata } = req.body;
    const stationId = req.user.department_id;
    const filedBy = req.user?.id || null;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const result = await pool.query(
      `INSERT INTO email_documents (station_id, module, subject, from_address, content, metadata, filed_by, filed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, station_id, module, subject, from_address, content, metadata, filed_at, filed_by`,
      [
        stationId,
        module_id || 'unclassified',
        subject || null,
        from || null,
        content,
        metadata ? JSON.stringify(metadata) : null,
        filedBy,
        date || new Date().toISOString(),
      ]
    );

    const doc = result.rows[0];

    // Layer 3: Intelligence pipeline — auto-link to incidents, generate signals
    processEmailIntelligence({
      id: doc.id,
      subject: doc.subject,
      content,
      from_address: doc.from_address,
      module: doc.module,
    }, stationId).catch(() => {});

    res.status(201).json({
      id: doc.id,
      station_id: doc.station_id,
      module: doc.module,
      subject: doc.subject,
      from_address: doc.from_address,
      metadata: doc.metadata,
      filed_at: doc.filed_at,
      filed_by: doc.filed_by,
    });
  } catch (err) {
    console.error('file error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/email-ingest/recent
// Returns last 20 filed documents
// ─────────────────────────────────────────────────────────────────────────

router.get('/recent', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const limit = parseInt(req.query.limit || '20', 10);

    const result = await pool.query(
      `SELECT id, station_id, module, subject, from_address, metadata, filed_at, filed_by
       FROM email_documents
       WHERE department_id = $1
       ORDER BY filed_at DESC
       LIMIT $2`,
      [stationId, limit]
    );

    res.json({
      documents: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error('recent error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
