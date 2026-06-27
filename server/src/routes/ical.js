'use strict';
/**
 * routes/ical.js — iCal / Google Calendar subscription endpoint
 *
 * This route allows members to subscribe to their personal fire department calendar
 * from their phone (Google Calendar, Apple Calendar, Outlook, etc).
 *
 * GET /ical/:token.ics — UNAUTHENTICATED (token IS the auth)
 *   Returns an iCal file (.ics) that phones/calendar apps can subscribe to.
 *
 * The token is a unique UUID that ties to a calendar_subscriptions record.
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool, runWithDepartment } = require('../db');
const { aggregateFeeds } = require('../feeds');

// ── Helper: Format date/time for iCal ─────────────────────────────────────
/**
 * Convert a date string (YYYY-MM-DD) and optional time (HH:MM or HHmm)
 * into iCal format.
 * - All-day events: DTSTART;VALUE=DATE:YYYYMMDD
 * - Timed events: DTSTART:YYYYMMDDTHHmmSS
 */
function formatICalDate(dateStr, timeStr = null) {
  if (!dateStr) return null;

  // Parse date: expect YYYY-MM-DD format
  const dateParts = dateStr.split('-');
  if (dateParts.length !== 3) return null;
  const [year, month, day] = dateParts;
  const dateOnly = `${year}${month}${day}`;

  // If no time, return all-day event
  if (!timeStr) {
    return { value: dateOnly, isAllDay: true };
  }

  // Parse time: expect HH:MM or HHMM
  const timeParts = timeStr.replace(':', '').trim();
  if (timeParts.length < 4) {
    // Fall back to all-day if time is malformed
    return { value: dateOnly, isAllDay: true };
  }

  return { value: `${dateOnly}T${timeParts}00`, isAllDay: false };
}

// ── GET /ical/:token.ics — Serve iCal file ──────────────────────────────────
router.get('/:token.ics', async (req, res) => {
  try {
    const { token } = req.params;

    // Look up subscription by token
    const { rows: subs } = await pool.query(
      `SELECT
        cs.id,
        cs.member_id,
        cs.station_id,
        cs.tier,
        cs.categories,
        m.name as member_name
       FROM calendar_subscriptions cs
       LEFT JOIN members m ON cs.member_id = m.id
       WHERE cs.cal_token = $1 LIMIT 1`,
      [token]
    );

    if (subs.length === 0) {
      return res.status(404).json({ error: 'Calendar subscription not found' });
    }

    const subscription = subs[0];

    // The fetch-timestamp write + feed aggregation run in the subscription's
    // department context (RLS-ready; behavior-neutral until P5_TXN=on).
    const entries = await runWithDepartment(subscription.station_id, subscription.member_id, async () => {
      // Update last_fetched_at
      await pool.query(
        `UPDATE calendar_subscriptions SET last_fetched_at = NOW() WHERE id = $1`,
        [subscription.id]
      );

      // Get calendar entries
      const start = new Date();
      start.setDate(start.getDate() - 7); // 7 days ago
      const startStr = start.toISOString().split('T')[0];

      const end = new Date();
      end.setDate(end.getDate() + 90); // 90 days from now
      const endStr = end.toISOString().split('T')[0];

      const categories = subscription.categories && subscription.categories.length > 0
        ? subscription.categories
        : null;

      return aggregateFeeds(startStr, endStr, {
        stationId: subscription.station_id,
        memberId: subscription.member_id,
        tier: subscription.tier || 'member',
        categories,
      });
    });

    // Build iCal format
    const icalLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Open Firehouse//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:Open Firehouse - ${subscription.member_name || 'Member'}`,
      'X-WR-TIMEZONE:America/New_York',
      'X-WR-CALDESC:Personal fire department calendar from Open Firehouse',
    ];

    // Add each calendar entry as a VEVENT
    for (const entry of entries) {
      const startInfo = formatICalDate(entry.date, entry.time);
      const endInfo = formatICalDate(
        entry.end_date || entry.date,
        entry.end_time || entry.time
      );

      if (!startInfo) continue; // Skip entries with invalid dates

      // Build event UID from entry ID and domain
      const uid = `${entry.id}@openfirehouse`;

      // Escape special characters in text fields
      const summary = (entry.title || '').replace(/[\\,;:]/g, '\\$&');
      const description = (entry.subtitle || '').replace(/[\\,;:]/g, '\\$&');
      const location = (entry.location || '').replace(/[\\,;:]/g, '\\$&');
      const category = (entry.category || '').replace(/[\\,;:]/g, '\\$&');

      icalLines.push('BEGIN:VEVENT');
      icalLines.push(`UID:${uid}`);

      if (startInfo.isAllDay) {
        icalLines.push(`DTSTART;VALUE=DATE:${startInfo.value}`);
      } else {
        icalLines.push(`DTSTART:${startInfo.value}`);
      }

      if (endInfo) {
        if (endInfo.isAllDay) {
          // For all-day events, end date is exclusive (next day)
          const endDate = new Date(
            entry.end_date || entry.date + 'T00:00:00'
          );
          endDate.setDate(endDate.getDate() + 1);
          const endDateStr = endDate.toISOString().split('T')[0].replace(/-/g, '');
          icalLines.push(`DTEND;VALUE=DATE:${endDateStr}`);
        } else {
          icalLines.push(`DTEND:${endInfo.value}`);
        }
      }

      icalLines.push(`SUMMARY:${summary}`);

      if (description) {
        icalLines.push(`DESCRIPTION:${description}`);
      }

      if (location) {
        icalLines.push(`LOCATION:${location}`);
      }

      if (category) {
        icalLines.push(`CATEGORIES:${category}`);
      }

      icalLines.push('DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z');
      icalLines.push('STATUS:CONFIRMED');
      icalLines.push('END:VEVENT');
    }

    icalLines.push('END:VCALENDAR');

    // Return iCal format with correct content type
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="calendar-${token.substring(0, 8)}.ics"`);
    res.send(icalLines.join('\r\n'));

  } catch (err) {
    console.error('[ical] error:', err);
    res.status(500).json({ error: 'Failed to generate calendar feed' });
  }
});

module.exports = router;
