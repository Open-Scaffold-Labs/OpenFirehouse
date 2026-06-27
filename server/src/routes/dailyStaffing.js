const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET / — daily staffing for a given date
// If no manual daily_staffing entries exist, auto-populate from the Duty Schedule (shifts table)
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    // 1) Check for manual daily_staffing entries first
    const { rows } = await pool.query(`
      SELECT ds.*, m.name AS member_name, m.rank AS member_rank,
             a.designation AS apparatus_name
      FROM daily_staffing ds
      LEFT JOIN members m ON m.id = ds.member_id
      LEFT JOIN apparatus a ON a.id = ds.apparatus_id
      WHERE ds.department_id = $2 AND ds.date = $1
      ORDER BY ds.apparatus_id, ds.position
    `, [date, stationId]);

    if (rows.length > 0) {
      return res.json({ data: rows, date, source: 'manual' });
    }

    // 2) No manual entries — pull from Duty Schedule (shifts table)
    //    Include Day shift crew + Duty Officer for a complete on-duty picture.
    const { rows: shifts } = await pool.query(
      `SELECT id, date, "shiftType", crew, "memberIds", notes FROM shifts WHERE department_id = $2 AND date = $1`,
      [date, stationId]
    );

    // Collect member names AND numeric IDs from all shifts for this date
    const memberNames = new Set();
    const memberIds = new Set();
    const shiftTypeMap = new Map(); // name → shiftType for labeling

    for (const shift of shifts) {
      const crew = typeof shift.crew === 'string' ? JSON.parse(shift.crew || '[]') : (shift.crew || []);
      const mids = typeof shift.memberIds === 'string' ? JSON.parse(shift.memberIds || '[]') : (shift.memberIds || []);

      for (const c of crew) {
        if (typeof c === 'object' && c !== null) {
          if (c.id) memberIds.add(Number(c.id));
          if (c.name) { memberNames.add(c.name); shiftTypeMap.set(c.name, shift.shiftType); }
        } else if (typeof c === 'string' && c.trim()) {
          // Crew stored as name strings (common in seed data)
          memberNames.add(c.trim());
          shiftTypeMap.set(c.trim(), shift.shiftType);
        } else if (typeof c === 'number' || (typeof c === 'string' && !isNaN(Number(c)))) {
          memberIds.add(Number(c));
        }
      }
      mids.forEach(id => { if (id) memberIds.add(Number(id)); });
    }

    console.log(`[daily-staffing] Date: ${date}, Shifts found: ${shifts.length}, Names: ${[...memberNames].join(', ')}, IDs: ${[...memberIds].join(', ')}`);

    if (memberNames.size === 0 && memberIds.size === 0) {
      console.log('[daily-staffing] No members found in shifts — returning empty');
      return res.json({ data: [], date, source: 'schedule' });
    }

    // Look up members by both ID and name — handles name-based seed data
    let members = [];
    if (memberIds.size > 0) {
      const { rows } = await pool.query(
        `SELECT id, name, rank, status FROM members WHERE id = ANY($1) AND department_id = $2`,
        [[...memberIds], stationId]
      );
      members.push(...rows);
    }
    if (memberNames.size > 0) {
      const existingIds = new Set(members.map(m => m.id));
      const { rows } = await pool.query(
        `SELECT id, name, rank, status FROM members WHERE name = ANY($1) AND department_id = $2`,
        [[...memberNames], stationId]
      );
      rows.forEach(r => { if (!existingIds.has(r.id)) members.push(r); });
    }

    // Determine shift labels: show Day Shift crew + Duty Officer
    const dayShift = shifts.find(s => s.shiftType === 'Day');
    const dutyOfficer = shifts.find(s => s.shiftType === 'Duty Officer');

    // Build virtual staffing entries — only include Day shift + Duty Officer
    // (Night shift isn't on duty during the day)
    const dayCrewNames = new Set();
    if (dayShift) {
      const crew = typeof dayShift.crew === 'string' ? JSON.parse(dayShift.crew || '[]') : (dayShift.crew || []);
      crew.forEach(c => dayCrewNames.add(typeof c === 'string' ? c.trim() : (c?.name || '')));
    }
    if (dutyOfficer) {
      const crew = typeof dutyOfficer.crew === 'string' ? JSON.parse(dutyOfficer.crew || '[]') : (dutyOfficer.crew || []);
      crew.forEach(c => dayCrewNames.add(typeof c === 'string' ? c.trim() : (c?.name || '')));
    }

    // Filter to only Day + Duty Officer members
    console.log(`[daily-staffing] dayCrewNames: ${[...dayCrewNames].join(', ')}, total members found: ${members.length}`);
    const onDutyMembers = members.filter(m => dayCrewNames.has(m.name));
    if (onDutyMembers.length === 0 && members.length > 0) {
      // Fallback if name matching fails: use all found members
      console.log('[daily-staffing] Name filter matched 0, falling back to all found members');
      onDutyMembers.push(...members);
    }
    console.log(`[daily-staffing] Returning ${onDutyMembers.length} on-duty members`);

    const virtualRows = onDutyMembers.map((m) => {
      const sType = shiftTypeMap.get(m.name) || 'Day';
      const isOfficer = sType === 'Duty Officer';
      return {
        id: `sched-${m.id}`,
        station_id: stationId,
        date,
        member_id: m.id,
        member_name: m.name,
        member_rank: m.rank,
        position: isOfficer ? 'Officer in Charge' : '',
        apparatus_id: null,
        apparatus_name: null,
        status: 'on_duty',
        start_time: '07:00',
        end_time: '07:00',
        hours: 24,
        notes: `From Duty Schedule (${sType})`,
        from_schedule: true,
      };
    });

    // Sort: Duty Officer first, then by rank
    const rankOrder = { chief: 0, captain: 1, lieutenant: 2, sergeant: 3, 'driver/engineer': 4, driver: 5, engineer: 5, firefighter: 6, emt: 7, paramedic: 7, probationary: 8 };
    virtualRows.sort((a, b) => {
      if (a.position === 'Officer in Charge') return -1;
      if (b.position === 'Officer in Charge') return 1;
      const ra = rankOrder[(a.member_rank || '').toLowerCase()] ?? 9;
      const rb = rankOrder[(b.member_rank || '').toLowerCase()] ?? 9;
      return ra - rb;
    });

    res.json({ data: virtualRows, date, source: 'schedule' });
  } catch (err) {
    console.error('GET /api/daily-staffing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /summary — staffing summary for date range
router.get('/summary', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const start = req.query.start || new Date().toISOString().slice(0, 10);
    const end = req.query.end || start;
    const { rows } = await pool.query(`
      SELECT ds.date,
             COUNT(DISTINCT ds.member_id) AS total_on_duty,
             COUNT(DISTINCT ds.apparatus_id) AS apparatus_staffed,
             SUM(ds.hours) AS total_hours
      FROM daily_staffing ds
      WHERE ds.department_id = $3 AND ds.date BETWEEN $1 AND $2
      GROUP BY ds.date
      ORDER BY ds.date
    `, [start, end, stationId]);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /roster — available members not yet assigned for a date
// Excludes members from both manual daily_staffing AND from the Duty Schedule
router.get('/roster', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    // Collect member IDs already on duty from manual entries
    const { rows: manualRows } = await pool.query(
      `SELECT member_id FROM daily_staffing WHERE department_id = $2 AND date = $1`, [date, stationId]
    );
    const assignedIds = new Set(manualRows.map(r => r.member_id));

    // Also collect member IDs from Duty Schedule if no manual entries
    if (assignedIds.size === 0) {
      const { rows: shifts } = await pool.query(
        `SELECT crew, "memberIds" FROM shifts WHERE department_id = $2 AND date = $1`, [date, stationId]
      );
      for (const shift of shifts) {
        const crew = typeof shift.crew === 'string' ? JSON.parse(shift.crew || '[]') : (shift.crew || []);
        const mids = typeof shift.memberIds === 'string' ? JSON.parse(shift.memberIds || '[]') : (shift.memberIds || []);
        crew.forEach(c => { const id = typeof c === 'object' ? (c.id || c.memberId) : c; if (id) { const n = Number(id); if (!isNaN(n)) assignedIds.add(n); } });
        mids.forEach(id => { if (id) { const n = Number(id); if (!isNaN(n)) assignedIds.add(n); } });
      }
    }

    const idArr = [...assignedIds];
    let query, params;
    if (idArr.length > 0) {
      query = `SELECT m.id, m.name, m.rank, m.status FROM members m
               WHERE m.department_id = $2 AND m.status IN ('Active', 'Probationary')
               AND m.id != ALL($1) ORDER BY m.rank, m.name`;
      params = [idArr, stationId];
    } else {
      query = `SELECT m.id, m.name, m.rank, m.status FROM members m
               WHERE m.department_id = $1 AND m.status IN ('Active', 'Probationary')
               ORDER BY m.rank, m.name`;
      params = [stationId];
    }

    const { rows } = await pool.query(query, params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — assign member to daily staffing
router.post('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const { member_id, date, position, apparatus_id, status, start_time, end_time, hours, notes } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO daily_staffing (station_id, date, member_id, position, apparatus_id, status, start_time, end_time, hours, notes)
      VALUES ($10, $1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      date || new Date().toISOString().slice(0, 10),
      member_id, position || '', apparatus_id || null,
      status || 'on_duty', start_time || '08:00', end_time || '08:00',
      hours || 24, notes || '',
      stationId,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/daily-staffing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id — update staffing entry
router.patch('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const allowed = ['position', 'apparatus_id', 'status', 'start_time', 'end_time', 'hours', 'notes'];
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`"${key}" = $${idx++}`);
        vals.push(req.body[key]);
      }
    }
    if (sets.length === 0) return res.json({ ok: true });
    vals.push(parseInt(req.params.id));
    vals.push(stationId);
    const { rows } = await pool.query(
      `UPDATE daily_staffing SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $${idx + 1} RETURNING *`, vals
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('DELETE FROM daily_staffing WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
