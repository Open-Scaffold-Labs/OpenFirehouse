'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// GET /api/messages — inbox for the current user (messages addressed to them)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM messages
       WHERE to_username = $1 AND department_id = $2
       ORDER BY sent_at DESC`,
      [req.user.username, req.user.department_id]
    );
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// GET /api/messages/unread-count — count of unread messages for current user
router.get('/unread-count', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS count FROM messages
       WHERE to_username = $1 AND department_id = $2 AND read_at IS NULL`,
      [req.user.username, req.user.department_id]
    );
    res.json({ count: parseInt(rows[0].count, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// POST /api/messages — send a message (creates one row per recipient)
router.post('/', async (req, res) => {
  try {
    const { recipients, subject, body } = req.body;
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'At least one recipient is required' });
    }
    if (!subject || String(subject).trim() === '') {
      return res.status(400).json({ error: 'Subject is required' });
    }
    if (!body || String(body).trim() === '') {
      return res.status(400).json({ error: 'Body is required' });
    }

    // Tenancy: recipients must be users of the sender's own department.
    // NOTE: `users` is the SHARED platform identity table — it has station_id,
    // NOT department_id (membership lives in of_user_departments). During the
    // single-station transition station_id == the department id, so filtering
    // users.station_id by req.user.department_id (equal value) is correct.
    // A proper multi-station version joins of_user_departments.
    const normalized = recipients.map(r => String(r).trim().toLowerCase());
    const { rows: validUsers } = await pool.query(
      `SELECT LOWER(username) AS username FROM users
       WHERE station_id = $1 AND LOWER(username) = ANY($2)`,
      [req.user.department_id, normalized]
    );
    const validSet = new Set(validUsers.map(u => u.username));
    const invalid = normalized.filter(u => !validSet.has(u));
    if (invalid.length) {
      return res.status(400).json({ error: `Unknown recipient(s): ${invalid.join(', ')}` });
    }

    const sent = [];
    for (const to of recipients) {
      const { rows } = await pool.query(
        `INSERT INTO messages
           (station_id, from_id, from_name, from_username, to_username, subject, body)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          req.user.department_id,
          req.user.id,
          req.user.name     || '',
          req.user.username || '',
          String(to).trim().toLowerCase(),
          String(subject).trim(),
          String(body).trim(),
        ]
      );
      sent.push(rows[0]);
    }
    res.status(201).json({ data: sent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// PATCH /api/messages/:id/read — mark a message as read (only the recipient can do this)
router.patch('/:id/read', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `UPDATE messages
       SET read_at = NOW()
       WHERE id = $1 AND to_username = $2 AND department_id = $3 AND read_at IS NULL
       RETURNING *`,
      [id, req.user.username, req.user.department_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Message not found or already read' });
    }
    res.json({ data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

module.exports = router;
