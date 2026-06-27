'use strict';
/**
 * backfill-member-userid.js — P1 of the identity-link gameplan (v2).
 *
 * Backfills members.user_id for EXISTING unlinked roster rows, using STABLE keys
 * ONLY — never a name match (a duplicate-name auto-link is the canonical
 * life-safety failure this whole effort exists to prevent; §0/FMEA R1/R3).
 *
 * Match priority (stable keys only):
 *   1. external_id  — members.external_id = users.external_id (SSO/SCIM key)
 *   2. email        — a member email (email / station_email / personal_email)
 *                     equal to a users.email, where that email is UNIQUE on BOTH
 *                     sides within the department (one user, one member).
 *   Name is NEVER a match key (False Identifier anti-pattern; Principle #3).
 *
 * Output is a 3-bucket report: unambiguous / ambiguous / unmatched. Only the
 * UNAMBIGUOUS bucket is written, and only with --apply. Idempotent (touches only
 * user_id IS NULL). Reversible: --apply prints the exact id list it set so a
 * rollback is `UPDATE members SET user_id=NULL WHERE id IN (...)`.
 *
 * Usage:
 *   DATABASE_URL=… node server/src/scripts/backfill-member-userid.js            # dry-run (default)
 *   DATABASE_URL=… node server/src/scripts/backfill-member-userid.js --apply    # write unambiguous
 *
 * Refuses to silently default to localhost — DATABASE_URL must be explicit
 * (mirrors the seed-hazmat-json.js safety convention).
 */

const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');
const DB = process.env.DATABASE_URL;
if (!DB) {
  console.error('Refusing to run: set DATABASE_URL explicitly (no silent localhost default).');
  process.exit(1);
}

const norm = (s) => String(s || '').trim().toLowerCase();
const emailsOf = (m) => [m.email, m.station_email, m.personal_email]
  .map(norm).filter((e) => e && e.includes('@'));

(async () => {
  const pool = new Pool({ connectionString: DB, max: 1 });
  try {
    const { rows: members } = await pool.query(
      `SELECT id, department_id, name, email, station_email, personal_email, external_id
         FROM members WHERE user_id IS NULL`);
    const { rows: users } = await pool.query(
      `SELECT u.id, u.email, u.external_id, oud.department_id
         FROM users u JOIN of_user_departments oud ON oud.user_id = u.id`);

    // Index users by (department, email) and (department, external_id), tracking
    // collisions so a non-unique key can never be used.
    const byDeptEmail = new Map();   // 'dept|email' -> Set(userId)
    const byDeptExt   = new Map();   // 'dept|ext'   -> Set(userId)
    for (const u of users) {
      if (norm(u.email).includes('@')) {
        const k = `${u.department_id}|${norm(u.email)}`;
        (byDeptEmail.get(k) || byDeptEmail.set(k, new Set()).get(k)).add(u.id);
      }
      if (u.external_id) {
        const k = `${u.department_id}|${u.external_id}`;
        (byDeptExt.get(k) || byDeptExt.set(k, new Set()).get(k)).add(u.id);
      }
    }
    // Count members sharing each email within a dept (the OTHER side of unique).
    const memberEmailCount = new Map();
    for (const m of members) for (const e of emailsOf(m)) {
      const k = `${m.department_id}|${e}`;
      memberEmailCount.set(k, (memberEmailCount.get(k) || 0) + 1);
    }

    const unambiguous = []; // {memberId, userId, via}
    const ambiguous = [];   // {memberId, reason}
    const unmatched = [];   // memberId

    for (const m of members) {
      // 1. external_id (strongest)
      if (m.external_id) {
        const k = `${m.department_id}|${m.external_id}`;
        const set = byDeptExt.get(k);
        if (set && set.size === 1) { unambiguous.push({ memberId: m.id, userId: [...set][0], via: 'external_id' }); continue; }
        if (set && set.size > 1) { ambiguous.push({ memberId: m.id, reason: 'external_id matches multiple users' }); continue; }
      }
      // 2. dept-unique email on BOTH sides
      let matchedUser = null, ambig = false;
      for (const e of emailsOf(m)) {
        const k = `${m.department_id}|${e}`;
        const uset = byDeptEmail.get(k);
        if (!uset) continue;
        if (uset.size > 1 || (memberEmailCount.get(k) || 0) > 1) { ambig = true; break; }
        const uid = [...uset][0];
        if (matchedUser && matchedUser !== uid) { ambig = true; break; }
        matchedUser = uid;
      }
      if (ambig) { ambiguous.push({ memberId: m.id, reason: 'email not unique on both sides within dept' }); continue; }
      if (matchedUser) { unambiguous.push({ memberId: m.id, userId: matchedUser, via: 'email' }); continue; }
      unmatched.push(m.id);
    }

    console.log(`\n=== P1 backfill dry-run (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`);
    console.log(`unlinked members:     ${members.length}`);
    console.log(`UNAMBIGUOUS (write):  ${unambiguous.length}`);
    console.log(`AMBIGUOUS (→ P5):     ${ambiguous.length}`);
    console.log(`UNMATCHED (→ P5):     ${unmatched.length}`);
    if (unambiguous.length) console.log('  unambiguous:', JSON.stringify(unambiguous));
    if (ambiguous.length)   console.log('  ambiguous:', JSON.stringify(ambiguous.slice(0, 25)));

    if (APPLY && unambiguous.length) {
      const touched = [];
      for (const { memberId, userId } of unambiguous) {
        // Atomic + idempotent: only writes a still-NULL row; the (user_id,
        // department_id) partial unique (0028) is the race/double-link backstop.
        const r = await pool.query(
          'UPDATE members SET user_id = $1, "updatedAt" = NOW() WHERE id = $2 AND user_id IS NULL RETURNING id',
          [userId, memberId]);
        if (r.rows.length) touched.push(memberId);
      }
      console.log(`\nAPPLIED. Rows set: ${touched.length}`);
      console.log(`ROLLBACK: UPDATE members SET user_id=NULL WHERE id IN (${touched.join(',') || 'NULL'});`);
    } else if (!APPLY) {
      console.log('\n(dry-run — no writes. Re-run with --apply to write the unambiguous bucket.)');
    }
  } finally {
    await pool.end();
  }
})().catch((e) => { console.error('backfill failed:', e.message); process.exit(1); });
