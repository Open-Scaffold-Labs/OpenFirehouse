'use strict';
/**
 * routes/scenarios.js — Scenario-Based Learning completions (Phase 5)
 *
 * GET  /api/scenarios/completions        — list completions for the logged-in user
 * GET  /api/scenarios/completions/all    — list all completions for the station (chief/officer)
 * POST /api/scenarios/:scenarioId/complete — record a scenario completion + create training record
 */

const express = require('express');
const router  = express.Router();
const { scenarioCompletions, training } = require('../db');

// GET completions for the current user
router.get('/completions', async (req, res) => {
  try {
    const completions = await scenarioCompletions.allForUser(req.user.id, req.user.department_id);
    res.json({ data: completions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch scenario completions' });
  }
});

// GET all completions for the station (for compliance / chief view)
router.get('/completions/all', async (req, res) => {
  try {
    const completions = await scenarioCompletions.allForStation(req.user.department_id);
    res.json({ data: completions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch station scenario completions' });
  }
});

// POST complete a scenario — record completion and auto-create training record if passed
router.post('/:scenarioId/complete', async (req, res) => {
  try {
    const { scenarioId } = req.params;
    const { score = 0, passed = false, scenarioTitle, creditHours = 0 } = req.body;

    const memberName = req.user.name || req.user.username || 'Unknown';

    // 1. Upsert the scenario completion
    const completion = await scenarioCompletions.upsert(
      req.user.department_id,
      req.user.id,
      memberName,
      scenarioId,
      score,
      passed
    );

    // 2. Auto-create a training record if passed and creditHours > 0
    let trainingRecord = null;
    if (passed && creditHours > 0) {
      const today = new Date().toISOString().split('T')[0];
      try {
        trainingRecord = await training.create({
          memberId:      req.user.id || 0,
          memberName,
          courseName:    scenarioTitle || scenarioId,
          type:          'Continuing Education',
          status:        'Passed',
          completedDate: today,
          expiresDate:   null,
          hours:         creditHours,
          instructor:    'OpenFirehouse Scenario Training',
          location:      'Online — Scenario-Based Learning',
          notes:         `Completed via OpenFirehouse scenario. Score: ${score}%`,
        }, req.user.department_id);
      } catch (tErr) {
        // Training record creation is non-fatal
        console.warn('Could not auto-create training record for scenario:', tErr.message);
      }
    }

    res.json({ data: { completion, trainingRecord } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record scenario completion' });
  }
});

module.exports = router;
