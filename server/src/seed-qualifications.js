'use strict';
/**
 * seed-qualifications.js — Populate member_qualifications from the canonical
 * cert taxonomy (constants/certs.js), assigning role-appropriate certs by RANK
 * dynamically (NOT by hardcoded member name — the old name-matched seed silently
 * dropped most records once the demo roster changed, leaving the table sparse).
 *
 * Every cert is stored as a coded entity: cert_type = canonical code,
 * cert_name = canonical display name. A deterministic slice is marked
 * expired/pending so the staffing board exercises qualified/partial states.
 *
 * Fast-paths if already seeded. Set RESEED_QUALS=1 to wipe + reseed a station
 * (dev only).
 */

const { pool } = require('./db');
const { CERT_BY_CODE } = require('./constants/certs');

// ── Rank → cert ladder ──────────────────────────────────────────────────────
const BASE     = ['firefighter_1', 'cpr_aed', 'nims_ics_100', 'scba_fit_test', 'bloodborne_pathogens'];
const INTERIOR = ['firefighter_2', 'hazmat_awareness', 'interior_qualified', 'forcible_entry', 'nims_ics_200'];
const DRIVER   = ['driver_operator_pumper', 'cdl_b', 'evoc'];
const OFFICER  = ['fire_officer_1', 'hazmat_operations', 'nims_ics_300'];
const COMMAND  = ['fire_officer_2', 'incident_safety_officer', 'blue_card_ic', 'nims_ics_400'];

function rankBucket(rank) {
  const r = String(rank || '').toLowerCase();
  if (/battalion/.test(r)) return 'battalion';
  if (/chief/.test(r)) return 'chief';            // Fire Chief, Chief, Deputy Chief
  if (/captain/.test(r)) return 'captain';
  if (/lieutenant/.test(r)) return 'lieutenant';
  if (/engineer|driver/.test(r)) return 'driver'; // Driver/Engineer, Engineer
  if (/paramedic/.test(r)) return 'paramedic';
  if (/emt/.test(r)) return 'emt';
  if (/prob/.test(r)) return 'probationary';
  return 'firefighter';                            // Firefighter, Firefighter I/II
}

function certsForRank(rank) {
  switch (rankBucket(rank)) {
    case 'probationary': return ['firefighter_1', 'cpr_aed', 'nims_ics_100'];
    case 'firefighter':  return [...BASE, ...INTERIOR];
    case 'emt':          return [...BASE, ...INTERIOR, 'emt_basic'];
    case 'paramedic':    return [...BASE, ...INTERIOR, 'emt_basic', 'paramedic', 'acls', 'pals'];
    case 'driver':       return [...BASE, ...INTERIOR, ...DRIVER];
    case 'lieutenant':   return [...BASE, ...INTERIOR, ...OFFICER];
    case 'captain':      return [...BASE, ...INTERIOR, ...OFFICER, 'fire_officer_2', 'incident_safety_officer'];
    case 'battalion':    return [...BASE, ...INTERIOR, ...OFFICER, ...COMMAND];
    case 'chief':        return [...BASE, ...INTERIOR, ...OFFICER, ...COMMAND];
    default:             return [...BASE];
  }
}

// Deterministic date helpers so reseeds are stable.
function isoDate(d) { return d.toISOString().slice(0, 10); }
function yearsFromNow(n) { const d = new Date(); d.setFullYear(d.getFullYear() + n); return isoDate(d); }
function yearsAgo(n) { const d = new Date(); d.setFullYear(d.getFullYear() - n); return isoDate(d); }

module.exports = async function seedQualifications(stationId = 1) {
  if (process.env.RESEED_QUALS === '1') {
    await pool.query('DELETE FROM member_qualifications WHERE station_id = $1', [stationId]);
    console.log(`Member qualifications: RESEED_QUALS=1 - wiped station ${stationId}.`);
  }

  const check = await pool.query('SELECT COUNT(*) FROM member_qualifications WHERE station_id = $1', [stationId]);
  if (parseInt(check.rows[0].count, 10) > 0) {
    console.log('Member qualifications seed: already seeded, skipping.');
    return;
  }

  const { rows: members } = await pool.query(
    'SELECT id, name, rank, department_id FROM members WHERE station_id = $1 ORDER BY id',
    [stationId]
  );
  if (members.length === 0) { console.log('No members found, skipping.'); return; }

  let inserted = 0;
  for (const member of members) {
    const codes = [...new Set(certsForRank(member.rank))];
    // Deterministic variety: each member may have one cert expired and/or pending.
    const expiredIdx = member.id % 5 === 0 ? codes.length - 1 : -1; // ~20% have an expired cert
    const pendingIdx = member.id % 7 === 0 ? 0 : -1;                // ~14% have a pending cert

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      const meta = CERT_BY_CODE[code];
      if (!meta) continue; // guard against a stale code
      let status = 'active';
      let issued = yearsAgo(2 + (member.id % 4));
      let expiry = yearsFromNow(2 + (member.id % 3));
      if (i === expiredIdx) { status = 'expired'; issued = yearsAgo(5); expiry = yearsAgo(1); }
      else if (i === pendingIdx) { status = 'pending'; expiry = yearsFromNow(3); }

      await pool.query(
        `INSERT INTO member_qualifications
           (member_id, station_id, department_id, cert_type, cert_name,
            issued_date, expiry_date, issuing_authority, cert_number, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'')`,
        [
          member.id, stationId, member.department_id || stationId,
          code, meta.name, issued, expiry,
          'State Fire Marshal', `CERT-${member.id}-${i + 1}`, status,
        ]
      );
      inserted++;
    }
  }
  console.log(`Member qualifications seed complete: ${inserted} records across ${members.length} members.`);
};

if (require.main === module) {
  module.exports(parseInt(process.argv[2], 10) || 1)
    .then(() => { if (process.env.STANDALONE_END === '1') return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
