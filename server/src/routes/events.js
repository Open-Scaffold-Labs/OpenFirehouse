'use strict';
const express = require('express');
const router  = express.Router();
const { events: db } = require('../db');
const { expandRRule } = require('../utils/rrule');

router.get('/', async (req, res) => {
  try {
    let events = await db.all(req.user.department_id);

    // Handle expand_recurrence query parameter
    if (req.query.expand_recurrence === 'true' && req.query.start && req.query.end) {
      const start = req.query.start;
      const end = req.query.end;
      const expanded = [];
      const cancelledMap = new Map(); // Map of recurrence_id + original_date to is_cancelled
      const modifiedMap = new Map();  // Map of recurrence_id + original_date to modified event

      // Build maps of cancelled and modified occurrences
      for (const event of events) {
        if (event.recurrence_id) {
          const key = `${event.recurrence_id}-${event.original_date}`;
          if (event.is_cancelled) {
            cancelledMap.set(key, true);
          } else {
            modifiedMap.set(key, event);
          }
        }
      }

      // Expand recurring events
      for (const event of events) {
        if (!event.recurrence_id) { // Only process parent events, not modifications/cancellations
          if (event.rrule) {
            const occurrences = expandRRule(event.rrule, event.date, start, end);
            for (const occDate of occurrences) {
              const dateStr = occDate.toISOString().split('T')[0];
              const key = `${event.id}-${dateStr}`;
              const cancelKey = `${event.id}-${dateStr}`;

              // Check if this occurrence is cancelled
              if (cancelledMap.has(cancelKey)) {
                continue; // Skip cancelled occurrences
              }

              // Check if this occurrence is modified
              if (modifiedMap.has(cancelKey)) {
                const modified = modifiedMap.get(cancelKey);
                expanded.push({ ...modified, id: event.id });
              } else {
                // Create a virtual occurrence
                expanded.push({
                  ...event,
                  id: event.id,
                  date: dateStr,
                  _recurrence_date: dateStr,
                  _is_occurrence: true,
                });
              }
            }
          } else {
            // Non-recurring event - include if within range
            if (event.date >= start && event.date <= end) {
              expanded.push(event);
            }
          }
        }
      }

      res.json({ data: expanded });
    } else {
      res.json({ data: events });
    }
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});
router.get('/:id', async (req, res) => { try { const r = await db.findById(+req.params.id, req.user.department_id); if (!r) return res.status(404).json({ error: 'Not found' }); res.json({ data: r }); } catch(e) { res.status(500).json({ error: 'Failed' }); } });

router.post('/', async (req, res) => {
  try {
    if (!req.body.title) return res.status(400).json({ error: 'title is required' });
    if (!req.body.date)  return res.status(400).json({ error: 'date is required' });
    res.status(201).json({ data: await db.create({
      title:        req.body.title,
      type:         req.body.type         || 'Other',
      date:         req.body.date,
      startTime:    req.body.startTime    || '',
      endTime:      req.body.endTime      || '',
      location:     req.body.location     || '',
      organizer:    req.body.organizer    || '',
      description:  req.body.description  || '',
      maxAttendees: req.body.maxAttendees != null ? Number(req.body.maxAttendees) : null,
      rsvps:        req.body.rsvps        ?? [],
      notes:        req.body.notes        || '',
      rrule:        req.body.rrule        || null,
    }, req.user.department_id) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to create event' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    res.json({ data: await db.update(id, req.body, req.user.department_id) });
  } catch(e) { res.status(500).json({ error: 'Failed to update event' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!await db.findById(id, req.user.department_id)) return res.status(404).json({ error: 'Not found' });
    await db.remove(id, req.user.department_id);
    res.json({ message: `Event ${id} deleted` });
  } catch(e) { res.status(500).json({ error: 'Failed to delete event' }); }
});

router.post('/:id/cancel-occurrence', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!req.body.date) return res.status(400).json({ error: 'date is required' });

    const parent = await db.findById(id, req.user.department_id);
    if (!parent) return res.status(404).json({ error: 'Not found' });

    // Create a cancellation record
    const result = await db.create({
      title:         parent.title,
      type:          parent.type,
      date:          req.body.date,
      startTime:     parent.startTime || '',
      endTime:       parent.endTime || '',
      location:      parent.location || '',
      organizer:     parent.organizer || '',
      description:   parent.description || '',
      maxAttendees:  parent.maxAttendees,
      rsvps:         [],
      notes:         parent.notes || '',
      recurrence_id: id,
      original_date: req.body.date,
      is_cancelled:  true,
    }, req.user.department_id);

    res.status(201).json({ data: result });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to cancel occurrence' });
  }
});

router.post('/:id/modify-occurrence', async (req, res) => {
  try {
    const id = +req.params.id;
    if (!req.body.original_date) return res.status(400).json({ error: 'original_date is required' });

    const parent = await db.findById(id, req.user.department_id);
    if (!parent) return res.status(404).json({ error: 'Not found' });

    // Create a modified occurrence record
    const modified = {
      title:         req.body.title !== undefined ? req.body.title : parent.title,
      type:          req.body.type !== undefined ? req.body.type : parent.type,
      date:          req.body.date !== undefined ? req.body.date : req.body.original_date,
      startTime:     req.body.startTime !== undefined ? req.body.startTime : (parent.startTime || ''),
      endTime:       req.body.endTime !== undefined ? req.body.endTime : (parent.endTime || ''),
      location:      req.body.location !== undefined ? req.body.location : (parent.location || ''),
      organizer:     req.body.organizer !== undefined ? req.body.organizer : (parent.organizer || ''),
      description:   req.body.description !== undefined ? req.body.description : (parent.description || ''),
      maxAttendees:  req.body.maxAttendees !== undefined ? req.body.maxAttendees : parent.maxAttendees,
      rsvps:        req.body.rsvps || [],
      notes:        req.body.notes !== undefined ? req.body.notes : (parent.notes || ''),
      recurrence_id: id,
      original_date: req.body.original_date,
      is_cancelled:  false,
    };

    const result = await db.create(modified, req.user.department_id);
    res.status(201).json({ data: result });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to modify occurrence' });
  }
});

module.exports = router;
