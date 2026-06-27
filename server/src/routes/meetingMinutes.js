'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');

// AI provider calls go through the ONE guarded helper (utils/aiClient): budget
// check before, real token usage after, centralized model + key-safe errors.
// Prompt-injection guarding (promptGuard) is applied at the call site.
const { callAI, sendAIError } = require('../utils/aiClient');
const { guardedSystemPrompt, guardedUserPrompt } = require('../utils/promptGuard');

const MEETING_TYPES = [
  'regular', 'special', 'emergency', 'executive', 'committee',
  'training', 'budget', 'planning', 'annual', 'other'
];

// GET / — list meetings (optional ?status=&type=&linked_module=&linked_record_id=)
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    let sql = 'SELECT * FROM meeting_minutes WHERE department_id = $1';
    const params = [stationId];
    if (req.query.status) { sql += ` AND status = $${params.length + 1}`; params.push(req.query.status); }
    if (req.query.type) { sql += ` AND meeting_type = $${params.length + 1}`; params.push(req.query.type); }
    if (req.query.linked_module) { sql += ` AND linked_module = $${params.length + 1}`; params.push(req.query.linked_module); }
    if (req.query.linked_record_id) { sql += ` AND linked_record_id = $${params.length + 1}`; params.push(req.query.linked_record_id); }
    sql += ' ORDER BY meeting_date DESC';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /types
router.get('/types', (_req, res) => res.json(MEETING_TYPES));

// GET /linkable-records?module=incidents — get records to link to
router.get('/linkable-records', async (req, res) => {
  try {
    const { module } = req.query;
    const stationId = req.user.department_id;
    let rows = [];
    switch (module) {
      case 'incidents': {
        const r = await db.query("SELECT id, COALESCE(description, type) as label, incident_date as date FROM incidents WHERE department_id = $1 AND deleted_at IS NULL ORDER BY incident_date DESC LIMIT 50", [stationId]);
        rows = r.rows.map(r => ({ id: r.id, label: `#${r.id} — ${r.label}`, date: r.date }));
        break;
      }
      case 'training': {
        const r = await db.query("SELECT id, title as label, training_date as date FROM training WHERE department_id = $1 ORDER BY training_date DESC LIMIT 50", [stationId]);
        rows = r.rows.map(r => ({ id: r.id, label: r.label, date: r.date }));
        break;
      }
      case 'grievances': {
        const r = await db.query("SELECT id, subject as label, filed_date as date FROM grievances WHERE department_id = $1 AND deleted_at IS NULL ORDER BY filed_date DESC LIMIT 50", [stationId]);
        rows = r.rows.map(r => ({ id: r.id, label: `Grievance: ${r.label}`, date: r.date }));
        break;
      }
      case 'after-action': {
        const r = await db.query("SELECT id, title as label, report_date as date FROM after_action_reports WHERE department_id = $1 ORDER BY report_date DESC LIMIT 50", [stationId]);
        rows = r.rows.map(r => ({ id: r.id, label: r.label, date: r.date }));
        break;
      }
      case 'budget': {
        const r = await db.query("SELECT id, name as label FROM budget_lines WHERE department_id = $1 ORDER BY name LIMIT 50", [stationId]);
        rows = r.rows.map(r => ({ id: r.id, label: `Budget: ${r.label}` }));
        break;
      }
      case 'grants': {
        const r = await db.query("SELECT id, title as label, submitted_date as date FROM grants WHERE department_id = $1 ORDER BY submitted_date DESC LIMIT 50", [stationId]);
        rows = r.rows.map(r => ({ id: r.id, label: r.label, date: r.date }));
        break;
      }
      case 'investigations': {
        const r = await db.query("SELECT id, COALESCE(incident_address, 'Investigation') as label, date_started as date FROM investigations WHERE department_id = $1 ORDER BY date_started DESC LIMIT 50", [stationId]);
        rows = r.rows.map(r => ({ id: r.id, label: `Investigation: ${r.label}`, date: r.date }));
        break;
      }
      default:
        return res.json([]);
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /stats
router.get('/stats', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const total = await db.query('SELECT COUNT(*) as c FROM meeting_minutes WHERE department_id = $1', [stationId]);
    const drafts = await db.query("SELECT COUNT(*) as c FROM meeting_minutes WHERE department_id = $1 AND status = 'draft'", [stationId]);
    const thisYear = await db.query(
      "SELECT COUNT(*) as c FROM meeting_minutes WHERE department_id = $1 AND EXTRACT(YEAR FROM meeting_date) = EXTRACT(YEAR FROM NOW())",
      [stationId]
    );
    res.json({
      total: parseInt(total.rows[0].c),
      drafts: parseInt(drafts.rows[0].c),
      thisYear: parseInt(thisYear.rows[0].c),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await db.query(
      `INSERT INTO meeting_minutes (station_id, title, meeting_date, meeting_type, location, called_by, attendees, agenda, motions, action_items, notes, next_meeting, recorded_by, status, linked_module, linked_record_id, linked_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [req.user.department_id, b.title, b.meeting_date, b.meeting_type || 'regular', b.location, b.called_by,
       JSON.stringify(b.attendees || []), JSON.stringify(b.agenda || []), JSON.stringify(b.motions || []),
       JSON.stringify(b.action_items || []), b.notes, b.next_meeting, b.recorded_by, b.status || 'draft',
       b.linked_module || null, b.linked_record_id || null, b.linked_label || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /:id
router.patch('/:id', async (req, res) => {
  try {
    const b = req.body;
    const jsonFields = ['attendees', 'agenda', 'motions', 'action_items'];
    const allowed = ['title', 'meeting_date', 'meeting_type', 'location', 'called_by', 'attendees', 'agenda', 'motions', 'action_items', 'notes', 'next_meeting', 'recorded_by', 'status', 'linked_module', 'linked_record_id', 'linked_label'];
    const data = {};
    for (const k of allowed) {
      if (b[k] !== undefined) data[k] = jsonFields.includes(k) ? JSON.stringify(b[k]) : b[k];
    }
    const { sets, values, nextIdx } = db.buildSetClause(data, Object.keys(data), 1);
    if (!sets) return res.status(400).json({ error: 'No valid fields' });
    values.push(req.params.id, req.user.department_id);
    const { rows } = await db.query(`UPDATE meeting_minutes SET ${sets}, updated_at = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx + 1} RETURNING *`, values);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /summarize — AI-powered transcript → structured minutes
router.post('/summarize', async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript || transcript.trim().length < 20) {
      return res.status(400).json({ error: 'Transcript too short to summarize' });
    }

    const systemPrompt = `You are a fire department meeting secretary. Given a raw transcript of a department meeting, extract structured meeting minutes. Return ONLY valid JSON with this exact structure (no markdown, no code fences):
{
  "title": "short meeting title",
  "meeting_type": "regular|special|emergency|executive|committee|training|budget|planning|annual|other",
  "agenda": ["agenda item 1", "agenda item 2"],
  "motions": [{"text": "motion description", "moved_by": "name or unknown", "seconded_by": "name or unknown", "result": "passed|failed|tabled"}],
  "action_items": [{"task": "what needs to be done", "assigned_to": "name or unknown", "due_date": ""}],
  "attendees_mentioned": ["name1", "name2"],
  "key_decisions": ["decision 1", "decision 2"],
  "notes": "any other important discussion points not captured above"
}
Extract as much structure as possible. If something isn't mentioned, use empty arrays. For names, use whatever was said in the transcript.`;

    const result = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Here is the meeting transcript:\n\n', transcript),
      {
        maxTokens: 2000,
        temperature: 0.3,
        heavy: true,
        meta: { stationId: req.user.department_id, action: 'meeting_summarize' },
      },
    );

    // Parse the JSON response
    try {
      // Strip markdown code fences if present
      let cleaned = result.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      const parsed = JSON.parse(cleaned);
      res.json({ summary: parsed, raw_transcript: transcript });
    } catch (parseErr) {
      // If JSON parsing fails, return the raw text so the client can still use it
      res.json({ summary: null, raw_text: result, raw_transcript: transcript });
    }
  } catch (e) {
    if (sendAIError(res, e)) return;
    res.status(500).json({ error: e.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM meeting_minutes WHERE id = $1 AND department_id = $2', [req.params.id, req.user.department_id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
