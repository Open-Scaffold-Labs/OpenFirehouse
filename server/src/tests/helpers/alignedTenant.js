'use strict';
/**
 * Test fixture: create a department + its mirror station with the SAME explicit id —
 * the EXPAND-phase convention every scoped route assumes (dept.id == station.id, the
 * 0004 backfill / signup mirror-station shape).
 *
 * Raw `INSERT ... RETURNING id` pairs only align when the two sequences happen to sit
 * at the same value — pure luck, and run-to-run luck at that (anti-pattern #36): the
 * background-seed race in CI drifted stations one ahead of departments and broke
 * hiringEngine's fixture on 2026-07-26 while the same file was green locally and the
 * day before. Explicit equal ids make the fixture deterministic; setval keeps later
 * nextval allocations clear of the claimed id.
 */
async function mkAlignedDeptStation(pool, name) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { rows } = await pool.query(
      `SELECT GREATEST(
         (SELECT COALESCE(MAX(id), 0) FROM departments),
         (SELECT COALESCE(MAX(id), 0) FROM stations),
         (SELECT last_value FROM departments_id_seq),
         (SELECT last_value FROM stations_id_seq)) + 1 + $1::int AS id`, [attempt]);
    const id = Number(rows[0].id);
    try {
      await pool.query('BEGIN');
      await pool.query('INSERT INTO departments (id, name) VALUES ($1, $2)', [id, name]);
      await pool.query('INSERT INTO stations (id, name, department_id) VALUES ($1, $2, $1)', [id, name]);
      await pool.query(`SELECT setval('departments_id_seq', $1, true)`, [id]);
      await pool.query(`SELECT setval('stations_id_seq', $1, true)`, [id]);
      await pool.query('COMMIT');
      return id;
    } catch (e) {
      await pool.query('ROLLBACK');
      if (e.code !== '23505') throw e; // only retry on an id collision (seed race)
    }
  }
  throw new Error('mkAlignedDeptStation: could not allocate an aligned id after 3 attempts');
}

module.exports = { mkAlignedDeptStation };
