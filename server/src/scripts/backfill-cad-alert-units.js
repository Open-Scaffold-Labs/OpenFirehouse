#!/usr/bin/env node
/**
 * backfill-cad-alert-units.js — parse every existing cad_alerts.units string into
 * cad_alert_units rows (migration 0041).
 *
 * SAFETY PROPERTIES (this touches the legal record, so they are not optional):
 *   • IDEMPOTENT — re-runnable. Inserts are ON CONFLICT DO NOTHING against the two
 *     unique indexes, so a second run changes nothing.
 *   • NON-DESTRUCTIVE — never writes to cad_alerts. The verbatim `units` string
 *     stays exactly as CAD sent it. These rows are a parsed INDEX over it.
 *   • LOSES NOTHING — a unit that doesn't resolve to our fleet (mutual aid) is
 *     still recorded, as text. Dropping it would erase a rig from the run history.
 *   • REPORTS WHAT IT COULDN'T DO — prints resolved / mutual-aid / AMBIGUOUS counts.
 *     Ambiguous tokens ("B14" where the dept has both a Brush 14 and a Battalion 14)
 *     are deliberately left unresolved for a human to map via apparatus.aliases.
 *     A confident wrong answer is worse than an honest gap.
 *
 * Usage:  DATABASE_URL=… node src/scripts/backfill-cad-alert-units.js [--apply]
 *         (dry-run by default — prints what it WOULD do and changes nothing)
 */
const { Pool } = require('pg');
const { parseUnits } = require('../utils/unitParse');

const APPLY = process.argv.includes('--apply');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is required (refusing to guess).'); process.exit(1); }
  const pool = new Pool({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });

  // Fleet per department — resolution is dept-scoped. Engine 1 in dept A is NOT
  // Engine 1 in dept B; resolving across departments would be a tenancy leak.
  const { rows: fleetRows } = await pool.query(
    `SELECT id, department_id, designation, aliases FROM apparatus`);
  const fleetByDept = new Map();
  for (const a of fleetRows) {
    if (!fleetByDept.has(a.department_id)) fleetByDept.set(a.department_id, []);
    fleetByDept.get(a.department_id).push(a);
  }

  const { rows: alerts } = await pool.query(
    `SELECT id, department_id, station_id, units, dispatched_at
       FROM cad_alerts
      WHERE units IS NOT NULL AND units <> ''
      ORDER BY id`);

  let tokens = 0, resolved = 0, mutualAid = 0, ambiguous = 0, inserted = 0;
  const ambiguousExamples = new Map();
  const mutualAidExamples = new Map();

  for (const a of alerts) {
    const fleet = fleetByDept.get(a.department_id) || [];
    const rows = parseUnits(a.units, fleet);
    for (const r of rows) {
      tokens++;
      if (r.apparatus_id != null) resolved++;
      else if (r.ambiguous) {
        ambiguous++;
        ambiguousExamples.set(r.unit_raw, (ambiguousExamples.get(r.unit_raw) || 0) + 1);
      } else {
        mutualAid++;
        mutualAidExamples.set(r.unit_raw, (mutualAidExamples.get(r.unit_raw) || 0) + 1);
      }

      if (APPLY) {
        const res = await pool.query(
          `INSERT INTO cad_alert_units
             (department_id, station_id, cad_alert_id, unit_raw, unit_norm,
              apparatus_id, ambiguous, seq, dispatched_at, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'cad')
           ON CONFLICT DO NOTHING`,
          [a.department_id, a.station_id, a.id, r.unit_raw, r.unit_norm,
           r.apparatus_id, r.ambiguous, r.seq, a.dispatched_at]);
        inserted += res.rowCount;
      }
    }
  }

  const pct = (n) => tokens ? ((n / tokens) * 100).toFixed(1) + '%' : '—';
  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN (no writes — pass --apply)'}`);
  console.log(`  alerts with units : ${alerts.length}`);
  console.log(`  unit tokens       : ${tokens}`);
  console.log(`  ├─ resolved       : ${resolved} (${pct(resolved)})  → linked to an apparatus`);
  console.log(`  ├─ mutual aid     : ${mutualAid} (${pct(mutualAid)})  → kept as text, not our fleet`);
  console.log(`  └─ AMBIGUOUS      : ${ambiguous} (${pct(ambiguous)})  → left unresolved ON PURPOSE, needs a human`);
  if (APPLY) console.log(`  rows inserted     : ${inserted} (re-runs insert 0 — idempotent)`);

  if (ambiguousExamples.size) {
    console.log('\n  Ambiguous tokens — map these via apparatus.aliases:');
    for (const [tok, n] of [...ambiguousExamples].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`    ${tok}  ×${n}`);
    }
  }
  if (mutualAidExamples.size) {
    console.log('\n  Unrecognized units (mutual aid, or a rig missing from the fleet):');
    for (const [tok, n] of [...mutualAidExamples].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`    ${tok}  ×${n}`);
    }
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
