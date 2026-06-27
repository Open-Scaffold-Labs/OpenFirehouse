'use strict';
/**
 * routes/modules.js — On-demand training module completions (Phase 4)
 *
 * GET  /api/modules/completions        — list completions for the logged-in user
 * GET  /api/modules/completions/all    — list all completions for the station (chief/officer)
 * POST /api/modules/:moduleId/complete — record a module completion + create training record
 */

const express = require('express');
const router  = express.Router();
const { moduleCompletions, training } = require('../db');

// GET completions for the current user
router.get('/completions', async (req, res) => {
  try {
    const completions = await moduleCompletions.allForUser(req.user.id, req.user.department_id);
    res.json({ data: completions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch completions' });
  }
});

// GET all completions for the station (for compliance view)
router.get('/completions/all', async (req, res) => {
  try {
    const completions = await moduleCompletions.allForStation(req.user.department_id);
    res.json({ data: completions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch station completions' });
  }
});

// POST complete a module — record completion and auto-create training record
router.post('/:moduleId/complete', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { score = 0, passed = true, moduleTitle, creditHours = 0, certificationEarned = '' } = req.body;

    const memberName = req.user.name || req.user.username || 'Unknown';

    // 1. Upsert the module completion
    const completion = await moduleCompletions.upsert(
      req.user.department_id,
      req.user.id,
      memberName,
      moduleId,
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
          courseName:    moduleTitle || moduleId,
          type:          'Continuing Education',
          status:        'Passed',
          completedDate: today,
          expiresDate:   null,
          hours:         creditHours,
          instructor:    'OpenFirehouse AI Training',
          location:      'Online — Self-Paced',
          notes:         `Completed via OpenFirehouse on-demand module. Score: ${score}%`,
        }, req.user.department_id);
      } catch (tErr) {
        // Training record creation is non-fatal — completion is still recorded
        console.warn('Could not auto-create training record:', tErr.message);
      }
    }

    res.json({ data: { completion, trainingRecord } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record completion' });
  }
});

module.exports = router;
