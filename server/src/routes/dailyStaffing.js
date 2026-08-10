const express = require('express');
const router = express.Router();
const { requireOfficer } = require('../middleware/requireRole');
const { pool } = require('../db');

// Daily staffing = the date-keyed RIDING BOARD (1.1c-b / migration 0070).
// daily_staffing was folded into apparatus_assignments: the on-duty assignment IS the
// timecard line, and a seatless-but-paid assignment (apparatus_id NULL — duty command /
// floater / admin / coverage) is first-class. Member name/rank + apparatus designation are
// resolved by JOIN (never stored on the board). The response keeps the legacy shape:
// `position` aliases position_name; `apparatus_name` from apparatus.designation.

// GET / — daily staffing for a given date
// If no board entries exist for the date, auto-populate from the Duty Schedule (shifts table)
router.get('/', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    // 1) Board entries first (the folded riding board)
    const { rows } = await pool.query(`
      SELECT aa.id, aa.department_id, aa.station_id, aa.date, aa.member_id,
             aa.position_name AS position, aa.apparatus_id, aa.position_id,
             aa.status, aa.start_time, aa.end_time, aa.hours, aa.notes,
             m.name AS member_name, m.rank AS member_rank,
             a.designation AS apparatus_name
      FROM apparatus_assignments aa
      LEFT JOIN members m ON m.id = aa.member_id
      LEFT JOIN apparatus a ON a.id = aa.apparatus_id
      WHERE aa.department_id = $2 AND aa.date = $1
      ORDER BY aa.apparatus_id NULLS LAST, aa.position_name
    `, [date, stationId]);

    if (rows.length > 0) {
      return res.json({ data: rows, date, source: 'manual' });
    }

    // 2) No board entries — pull from Duty Schedule (shifts table)
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

// GET /mine?days=N — the CALLER's upcoming tours (1.7 companion member surface).
// JWT-derived member (members.user_id — the 1.2e pattern; never a client-sent id), union
// of riding-board rows and roster shifts (id-first, name fallback — rename-proof), deduped
// per date+source, ascending. Read-only; any authed client (the phone's My Schedule).
router.get('/mine', async (req, res) => {
  try {
    const deptId = req.user.department_id;
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
    const m = await pool.query(
      'SELECT id, name FROM members WHERE user_id = $1 AND department_id = $2 LIMIT 1',
      [req.user.id, deptId]);
    if (!m.rows.length) {
      return res.status(403).json({ error: 'Your login is not linked to a roster member.', code: 'NO_MEMBER_LINK' });
    }
    const me = m.rows[0];
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

    const board = await pool.query(
      `SELECT aa.date, aa.position_name, aa.start_time, aa.end_time, aa.hours, aa.status,
              a.designation AS apparatus_name
         FROM apparatus_assignments aa
         LEFT JOIN apparatus a ON a.id = aa.apparatus_id
        WHERE aa.department_id = $1 AND aa.member_id = $2 AND aa.date >= $3 AND aa.date <= $4
        ORDER BY aa.date`, [deptId, me.id, today, end]);

    const shifts = await pool.query(
      `SELECT id, date, "shiftType", crew, "memberIds" FROM shifts
        WHERE department_id = $1 AND date >= $2 AND date <= $3 ORDER BY date`,
      [deptId, today, end]);
    const { memberOnShift } = require('../utils/leaveSchedule');
    // pg returns DATE columns as JS Dates at LOCAL midnight — format with local components
    // (never toISOString, which can shift the day across the UTC boundary: local-day doctrine).
    const isoDay = (v) => {
      if (typeof v === 'string') return v.slice(0, 10);
      const dt = new Date(v);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };
    const boardDates = new Set(board.rows.map((r) => isoDay(r.date)));
    const rosterTours = shifts.rows
      .map((s) => ({
        ...s,
        crew: typeof s.crew === 'string' ? JSON.parse(s.crew || '[]') : (s.crew || []),
        memberIds: typeof s.memberIds === 'string' ? JSON.parse(s.memberIds || '[]') : (s.memberIds || []),
      }))
      .filter((s) => memberOnShift(s, me.id, me.name) && !boardDates.has(isoDay(s.date)))
      .map((s) => ({
        date: isoDay(s.date), source: 'roster', shift_type: s.shiftType,
        position_name: '', apparatus_name: null, start_time: null, end_time: null, hours: null,
      }));

    const tours = [
      ...board.rows.map((r) => ({ ...r, date: isoDay(r.date), source: 'board', shift_type: null })),
      ...rosterTours,
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    res.json({ data: { member_id: me.id, member_name: me.name, days, tours } });
  } catch (err) {
    console.error('GET /api/daily-staffing/mine error:', err);
    res.status(500).json({ error: 'Failed to load your schedule' });
  }
});

// GET /summary — staffing summary for date range (hours now live on the board)
router.get('/summary', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const start = req.query.start || new Date().toISOString().slice(0, 10);
    const end = req.query.end || start;
    const { rows } = await pool.query(`
      SELECT aa.date,
             COUNT(DISTINCT aa.member_id) AS total_on_duty,
             COUNT(DISTINCT aa.apparatus_id) AS apparatus_staffed,
             SUM(aa.hours) AS total_hours
      FROM apparatus_assignments aa
      WHERE aa.department_id = $3 AND aa.date BETWEEN $1 AND $2
      GROUP BY aa.date
      ORDER BY aa.date
    `, [start, end, stationId]);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /roster — available members not yet on the board for a date
// Excludes members already on the board AND from the Duty Schedule
router.get('/roster', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    // Collect member IDs already on duty from board entries
    const { rows: manualRows } = await pool.query(
      `SELECT member_id FROM apparatus_assignments WHERE department_id = $2 AND date = $1`, [date, stationId]
    );
    const assignedIds = new Set(manualRows.map(r => r.member_id));

    // Also collect member IDs from Duty Schedule if no board entries
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

// POST / — assign member to the riding board for a date
router.post('/', requireOfficer, async (req, res) => {
  try {
    const stationId = req.user.department_id;
    if (!stationId) return res.status(401).json({ error: 'NO_DEPARTMENT', code: 'NO_DEPARTMENT' });
    const { member_id, date, position, apparatus_id, status, start_time, end_time, hours, notes } = req.body;
    if (!member_id) return res.status(400).json({ error: 'member_id required', code: 'MEMBER_REQUIRED' });

    // One person per seat per rig per day (uq_apparatus_assignments_seat). A real seat
    // that is re-assigned overwrites (last-write-wins on the seat); seatless rows
    // (apparatus_id NULL) never collide and always insert. Race-proof via ON CONFLICT.
    const { rows } = await pool.query(`
      INSERT INTO apparatus_assignments
        (department_id, date, member_id, position_name, apparatus_id, status, start_time, end_time, hours, notes)
      VALUES ($10, $1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (department_id, date, apparatus_id, position_name)
      DO UPDATE SET member_id = EXCLUDED.member_id, status = EXCLUDED.status,
                    start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
                    hours = EXCLUDED.hours, notes = EXCLUDED.notes
      RETURNING *
    `, [
      date || new Date().toISOString().slice(0, 10),
      member_id, position || '', apparatus_id || null,
      status || 'on_duty', start_time || '08:00', end_time || '08:00',
      hours != null ? hours : 24, notes || '',
      stationId,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/daily-staffing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id — update a board entry
router.patch('/:id', requireOfficer, async (req, res) => {
  try {
    const stationId = req.user.department_id;
    // Map the legacy `position` field to the board column `position_name`.
    const colMap = { position: 'position_name', apparatus_id: 'apparatus_id', status: 'status',
                     start_time: 'start_time', end_time: 'end_time', hours: 'hours', notes: 'notes' };
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const key of Object.keys(colMap)) {
      if (req.body[key] !== undefined) {
        sets.push(`"${colMap[key]}" = $${idx++}`);
        vals.push(req.body[key]);
      }
    }
    if (sets.length === 0) return res.json({ ok: true });
    vals.push(parseInt(req.params.id));
    vals.push(stationId);
    const { rows } = await pool.query(
      `UPDATE apparatus_assignments SET ${sets.join(', ')} WHERE id = $${idx} AND department_id = $${idx + 1} RETURNING *`, vals
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', requireOfficer, async (req, res) => {
  try {
    const stationId = req.user.department_id;
    await pool.query('DELETE FROM apparatus_assignments WHERE id = $1 AND department_id = $2', [req.params.id, stationId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
