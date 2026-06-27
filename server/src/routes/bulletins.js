'use strict';
const express = require('express');
const router = express.Router();
const { bulletins } = require('../db');

// Rank order: firefighter < lieutenant < captain (officer) < battalion_chief < deputy_chief < chief
// Training roles (training_captain, training_battalion) carry BC-level clearance.
// Only BC+ can post, edit, or delete any bulletin (Daily Notice or general).

/** BC and above (including training battalion/captain) — required for all bulletin writes */
function isBcPlus(user) {
  return ['chief', 'deputy_chief', 'battalion_chief',
          'training_battalion', 'training_captain'].includes(user?.role);
}

router.get('/', async (req, res) => {
  try {
    const data = await bulletins.allForStation(req.user.department_id);
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bulletins' });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!isBcPlus(req.user)) {
      return res.status(403).json({ error: 'Battalion Chief or above required to post bulletins' });
    }
    const category = req.body.category || 'General';
    if (!req.body.title || String(req.body.title).trim() === '') {
      return res.status(400).json({ error: 'title is required' });
    }
    const data = await bulletins.create(req.user.department_id, {
      title: req.body.title,
      body: req.body.body || '',
      category,
      priority: req.body.priority || 'normal',
      pinned: req.body.pinned || false,
      expires_at: req.body.expires_at || null,
      author_id: req.user.id,
      author_name: req.user.name || '',
    });
    res.status(201).json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create bulletin' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    if (!isBcPlus(req.user)) {
      return res.status(403).json({ error: 'Battalion Chief or above required to edit bulletins' });
    }
    const id = Number(req.params.id);
    const data = await bulletins.update(id, req.user.department_id, req.body);
    if (!data) {
      return res.status(404).json({ error: 'Bulletin not found' });
    }
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update bulletin' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!isBcPlus(req.user)) {
      return res.status(403).json({ error: 'Battalion Chief or above required to delete bulletins' });
    }
    const id = Number(req.params.id);
    const success = await bulletins.remove(id, req.user.department_id);
    if (!success) {
      return res.status(404).json({ error: 'Bulletin not found' });
    }
    res.json({ message: `Bulletin ${id} deleted` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete bulletin' });
  }
});

module.exports = router;
