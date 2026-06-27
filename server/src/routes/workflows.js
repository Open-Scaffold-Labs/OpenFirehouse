/**
 * /api/workflows — AI Workflow Orchestration
 *
 * Manages multi-step tasks: completeness checking, persistent task tracking,
 * and proactive status updates.
 *
 * Phase 1: Completeness engine (rules-based — what's present, what's missing)
 * Phase 2: AI action integration (apply AI results back to records)
 * Phase 3: Persistent task tracking (workflow_tasks table) + auto-creation
 *
 * DOCTRINE (Matt, 2026-06-10): AI narrative generation was removed entirely.
 * AI plays zero role in incident narratives — the officer writes them
 * directly. The old narrative generator, POST /:id/draft endpoint, and
 * ai_drafts.narrative storage are gone; do not reintroduce them.
 */

const express = require('express');
const router  = express.Router();
const https   = require('https');
const db      = require('../db');
const { pool } = db;
const { checkCompleteness } = require('../utils/completenessEngine');

// ── Bridge: convert new engine output to workflow checklist format ────────────
// The new engine returns { checks: [{ field, label, complete, value, detail, aiAction }] }
// The workflow system expects [{ key, label, status, data }]
function engineToChecklist(engineResult) {
  return engineResult.checks.map(c => ({
    key: c.field,
    label: c.label,
    status: c.complete ? 'complete' : (c.required ? 'missing' : 'optional'),
    data: {
      value: c.value,
      detail: c.detail,
      aiAction: c.aiAction,
      canDraft: !!c.aiAction,
    },
  }));
}

// ── Completeness Engine (unified) ────────────────────────────────────────────
async function checkIncidentCompleteness(incidentId, stationId) {
  const incident = await db.incidents.findById(incidentId, stationId);
  if (!incident) return { error: 'Incident not found', results: [] };

  const engineResult = await checkCompleteness('incident_report', { incident, stationId });
  const results = engineToChecklist(engineResult);

  return {
    incident,
    results,
    summary: {
      complete: engineResult.complete,
      total: engineResult.total,
      percentage: engineResult.score,
    },
    engine: engineResult, // full engine output for detailed views
  };
}

// ── AI Conversational Agent ──────────────────────────────────────────────────
// (The narrative generator that used to live here was removed per doctrine
// 2026-06-10: AI never writes incident narratives.)
async function agentRespond(task, userMessage, stationId) {
  const apiKey = await db.stations.getApiKey(stationId, 'anthropicApiKey');
  if (!apiKey) return { reply: 'No API key configured. Add one in Station Settings.', action: null };

  // M1: per-department daily token budget. This chat endpoint is best-effort
  // (it resolves a reply, never throws), so a spent budget surfaces as a
  // friendly reply rather than an HTTP error.
  const aiBudget = require('../utils/aiBudget');
  try {
    await aiBudget.assertWithinBudget(stationId);
  } catch (e) {
    if (e && e.code === 'BUDGET_EXCEEDED') return { reply: e.message, action: null };
  }

  // Build conversation history
  const history = (task.conversation || []).slice(-10).map(c => ({
    role: c.role, content: c.content,
  }));
  history.push({ role: 'user', content: userMessage });

  // Build context about the task
  const checklist = task.checklist || [];
  const completeItems = checklist.filter(c => c.status === 'complete');
  const missingItems = checklist.filter(c => c.status === 'missing' || c.status === 'partial');

  const systemPrompt = `You are a fire department AI workflow assistant embedded in OpenFirehouse. You help officers complete multi-step tasks like incident reports, NFIRS submissions, and after-action reviews.

CURRENT TASK: "${task.title}" (${task.task_type})
STATUS: ${task.status}
PROGRESS: ${completeItems.length}/${checklist.length} items complete

COMPLETE ITEMS:
${completeItems.map(c => `✓ ${c.label}`).join('\n') || 'None yet'}

MISSING/PARTIAL ITEMS:
${missingItems.map(c => `✗ ${c.label} (${c.status})`).join('\n') || 'All complete!'}

RULES:
- Be concise and actionable
- Suggest specific next steps
- If the user asks you to draft or write the incident narrative, explain that AI does not write incident narratives — the narrative must be written by the officer directly in the incident record
- If asked to send reminders, note that proactive reminders are coming in a future update
- Reference specific missing items by name
- Celebrate progress when items get completed
- Use fire service terminology naturally`;

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: require('../config/aiModel').AI_MODEL,
      max_tokens: 800,
      system: require('../utils/promptGuard').guardedSystemPrompt(systemPrompt),
      messages: history,
    });

    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
        'x-api-key': apiKey.trim(), 'anthropic-version': '2023-06-01',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            const { sanitizeAIError } = require('../config/aiModel');
            return resolve({ reply: `AI error: ${sanitizeAIError(parsed.error.message)}`, action: null });
          }
          const text = parsed.content?.[0]?.text || 'I couldn\'t generate a response.';
          // M1: record real token usage against the department budget.
          if (parsed.usage) {
            require('../utils/aiBudget').recordUsage(stationId, {
              action: 'workflow_chat', model: require('../config/aiModel').AI_MODEL,
              inputTokens: parsed.usage.input_tokens, outputTokens: parsed.usage.output_tokens,
            });
          }
          // No action detection: AI never drafts narratives (doctrine 2026-06-10).
          resolve({ reply: text, action: null, usage: parsed.usage });
        } catch (e) { resolve({ reply: 'Failed to get AI response.', action: null }); }
      });
    });
    req.on('error', (e) => resolve({ reply: `Connection error: ${e.message}`, action: null }));
    req.write(body);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET / — list workflow tasks ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const tasks = await db.workflowTasks.all(req.user.department_id, status || undefined);
    res.json({ data: tasks });
  } catch (err) {
    console.error('GET /api/workflows error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id — single task with live completeness recheck ────────────────────
// NOTE: :id is constrained to digits so it can't shadow GET /alerts below —
// unconstrained, '/alerts' matched here, parseInt('alerts') → NaN → SQL 500
// on every dashboard load (this endpoint had never worked in prod).
router.get('/:id(\\d+)', async (req, res) => {
  try {
    const task = await db.workflowTasks.findById(parseInt(req.params.id), req.user.department_id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Re-check completeness live
    let completeness = null;
    if (task.task_type === 'incident_report' && task.target_record_id) {
      completeness = await checkIncidentCompleteness(task.target_record_id, req.user.department_id);
      if (!completeness.error) {
        // Update checklist on the task
        task.checklist = completeness.results;
        await db.workflowTasks.update(task.id, { checklist: completeness.results }, req.user.department_id);
      }
    }

    res.json({ data: task, completeness });
  } catch (err) {
    console.error('GET /api/workflows/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /check — run completeness check without creating a task ─────────────
router.post('/check', async (req, res) => {
  try {
    const { task_type, target_record_id } = req.body;
    if (task_type === 'incident_report' && target_record_id) {
      const result = await checkIncidentCompleteness(parseInt(target_record_id), req.user.department_id);
      return res.json({ data: result });
    }
    res.status(400).json({ error: 'Unsupported task_type or missing target_record_id' });
  } catch (err) {
    console.error('POST /api/workflows/check error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /alerts — proactive workflow notifications ───────────────────────────
// Scans all active workflow tasks and generates alerts for:
//   - Incomplete reports older than 24 hours (warning) or 72 hours (critical)
//   - Tasks with completeness score below 50%
//   - Stale tasks (no updates in 48+ hours)
//   - Approaching deadlines
router.get('/alerts', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const tasks = await db.workflowTasks.all(stationId, 'active');
    const now = Date.now();
    const alerts = [];

    for (const task of tasks) {
      const checklist = task.checklist || [];
      const completeItems = checklist.filter(c => c.status === 'complete').length;
      const totalItems = checklist.filter(c => c.status !== 'optional').length;
      const pct = totalItems > 0 ? Math.round((completeItems / totalItems) * 100) : 0;
      const ageHours = (now - new Date(task.created_at).getTime()) / 3600000;
      const staleHours = (now - new Date(task.updated_at).getTime()) / 3600000;

      // Incomplete report aging alerts
      if (pct < 100 && ageHours > 72) {
        alerts.push({
          id: `wf-overdue-${task.id}`,
          severity: 'critical',
          category: 'Workflows',
          title: `Overdue: ${task.title}`,
          detail: `${pct}% complete — created ${Math.round(ageHours / 24)} days ago. ${totalItems - completeItems} item(s) still missing.`,
          module: 'workflows',
          taskId: task.id,
          targetModule: task.target_module,
          targetRecordId: task.target_record_id,
          score: pct,
          date: task.created_at,
        });
      } else if (pct < 100 && ageHours > 24) {
        alerts.push({
          id: `wf-incomplete-${task.id}`,
          severity: 'warning',
          category: 'Workflows',
          title: `Incomplete: ${task.title}`,
          detail: `${pct}% complete — ${totalItems - completeItems} item(s) still missing. Created ${Math.round(ageHours)} hours ago.`,
          module: 'workflows',
          taskId: task.id,
          targetModule: task.target_module,
          targetRecordId: task.target_record_id,
          score: pct,
          date: task.created_at,
        });
      }

      // Low score alert (separate from age)
      if (pct > 0 && pct < 50 && ageHours > 4) {
        alerts.push({
          id: `wf-lowscore-${task.id}`,
          severity: 'warning',
          category: 'Workflows',
          title: `Low Completeness: ${task.title}`,
          detail: `Only ${pct}% complete — ${checklist.filter(c => c.data?.aiAction && c.status !== 'complete').length} field(s) can be auto-filled by AI.`,
          module: 'workflows',
          taskId: task.id,
          score: pct,
          date: task.created_at,
        });
      }

      // Stale task alert
      if (staleHours > 48 && pct < 100) {
        alerts.push({
          id: `wf-stale-${task.id}`,
          severity: 'info',
          category: 'Workflows',
          title: `Stale Task: ${task.title}`,
          detail: `No updates in ${Math.round(staleHours / 24)} days. ${pct}% complete.`,
          module: 'workflows',
          taskId: task.id,
          score: pct,
          date: task.updated_at,
        });
      }

      // Deadline approaching
      if (task.deadline) {
        const deadlineMs = new Date(task.deadline).getTime();
        const hoursUntil = (deadlineMs - now) / 3600000;
        if (hoursUntil < 0 && pct < 100) {
          alerts.push({
            id: `wf-pastdue-${task.id}`,
            severity: 'critical',
            category: 'Workflows',
            title: `Past Deadline: ${task.title}`,
            detail: `Deadline was ${Math.round(Math.abs(hoursUntil / 24))} day(s) ago. ${pct}% complete.`,
            module: 'workflows',
            taskId: task.id,
            score: pct,
            date: task.deadline,
          });
        } else if (hoursUntil > 0 && hoursUntil < 24 && pct < 100) {
          alerts.push({
            id: `wf-deadline-${task.id}`,
            severity: 'critical',
            category: 'Workflows',
            title: `Deadline Today: ${task.title}`,
            detail: `Due in ${Math.round(hoursUntil)} hours. ${pct}% complete.`,
            module: 'workflows',
            taskId: task.id,
            score: pct,
            date: task.deadline,
          });
        } else if (hoursUntil > 0 && hoursUntil < 72 && pct < 100) {
          alerts.push({
            id: `wf-deadline-soon-${task.id}`,
            severity: 'warning',
            category: 'Workflows',
            title: `Deadline Approaching: ${task.title}`,
            detail: `Due in ${Math.round(hoursUntil / 24)} day(s). ${pct}% complete.`,
            module: 'workflows',
            taskId: task.id,
            score: pct,
            date: task.deadline,
          });
        }
      }
    }

    // Deduplicate by taskId — keep highest severity per task
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3));

    res.json({ data: alerts, count: alerts.length, activeTasks: tasks.length });
  } catch (err) {
    console.error('GET /api/workflows/alerts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST / — create a new workflow task ──────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { title, task_type, target_module, target_record_id, deadline } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    // Run initial completeness check
    let checklist = [];
    if (task_type === 'incident_report' && target_record_id) {
      const result = await checkIncidentCompleteness(parseInt(target_record_id), req.user.department_id);
      if (!result.error) checklist = result.results;
    }

    const task = await db.workflowTasks.create({
      user_id: req.user.id || null,
      title,
      task_type: task_type || 'incident_report',
      target_module: target_module || 'incidents',
      target_record_id: target_record_id ? parseInt(target_record_id) : null,
      checklist,
      deadline: deadline || null,
      conversation: [{
        role: 'assistant',
        content: `Workflow started: "${title}". I've run an initial completeness check — ${checklist.filter(c => c.status === 'complete').length}/${checklist.filter(c => c.status !== 'optional').length} required items are complete. Ask me anything about this task.`,
        timestamp: new Date().toISOString(),
      }],
    }, req.user.department_id);

    res.status(201).json({ data: task });
  } catch (err) {
    console.error('POST /api/workflows error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:id/chat — converse with the AI agent about a task ─────────────────
router.post('/:id/chat', async (req, res) => {
  try {
    const task = await db.workflowTasks.findById(parseInt(req.params.id), req.user.department_id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    // Add user message to conversation
    const conversation = task.conversation || [];
    conversation.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

    // Get AI response. No narrative-draft action handling here — AI never
    // writes incident narratives (doctrine 2026-06-10); the officer does.
    const { reply } = await agentRespond({ ...task, conversation }, message, req.user.department_id);

    // Add assistant reply
    conversation.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });

    const updated = await db.workflowTasks.update(task.id, { conversation }, req.user.department_id);
    res.json({ data: updated, reply });
  } catch (err) {
    console.error('POST /api/workflows/:id/chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// NOTE: the old POST /:id/draft endpoint (AI narrative generation) was
// removed entirely per doctrine 2026-06-10 — it served only narratives.

// ── PATCH /:id — update task (status, etc.) ──────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const updated = await db.workflowTasks.update(parseInt(req.params.id), req.body, req.user.department_id);
    if (!updated) return res.status(404).json({ error: 'Task not found' });
    res.json({ data: updated });
  } catch (err) {
    console.error('PATCH /api/workflows/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /:id — remove task ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.workflowTasks.remove(parseInt(req.params.id), req.user.department_id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/workflows/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
