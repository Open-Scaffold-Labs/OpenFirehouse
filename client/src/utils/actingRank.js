// actingRank.js — display-only acting-officer titles for the run list / board.
//
// Fire-service rule (Matt, 2026-06-18): a member riding an OFFICER seat is never
// labeled "FF" — if they're below the seat's officer rank they're ACTING UP and
// shown as A/C / A/L / A/BC. This mirrors the server's staffingScore.actingInfo
// (the authoritative qualification scoring stays server-side; this is display).
//
// It does NOT change member_rank (grouping/officer-detection logic still keys on
// the real rank) — it only derives the label to SHOW.

function rankOrd(rank) {
  const r = String(rank || '').toLowerCase();
  if (!r) return 0;
  if (/prob/.test(r)) return 1;
  if (/battalion/.test(r)) return 6;
  if (/chief/.test(r)) return 7;
  if (/captain/.test(r)) return 5;
  if (/lieutenant|lt\b/.test(r)) return 4;
  if (/engineer|driver/.test(r)) return 3;
  if (/firefighter|\bff\b|emt|paramedic|medic/.test(r)) return 2;
  return 0;
}

// Determine the officer level of a seat from its position name and/or min rank.
// Returns { ord, abbr } for officer seats, or null for non-officer seats.
function officerSeat(position, minRank) {
  const p = String(position || '').toLowerCase();
  if (p.includes('battalion')) return { ord: 6, abbr: 'A/BC' };
  if (p.includes('captain')) return { ord: 5, abbr: 'A/C' };
  if (p.includes('lieutenant')) return { ord: 4, abbr: 'A/L' };
  if (p.includes('officer') || p.includes('company') || p.includes('chief')) {
    const m = String(minRank || '').toLowerCase();
    if (m.includes('captain')) return { ord: 5, abbr: 'A/C' };
    if (m.includes('battalion')) return { ord: 6, abbr: 'A/BC' };
    if (m.includes('chief')) return { ord: 7, abbr: 'A/Chief' };
    return { ord: 4, abbr: 'A/L' }; // generic officer seat defaults to Lieutenant level
  }
  return null;
}

/**
 * actingDisplayRank(memberRank, position, minRank) -> string
 * Officer seat + member at/above the seat rank → their real rank.
 * Officer seat + member acting up → A/C / A/L / A/BC.
 * Non-officer seat → the member's real rank unchanged.
 */
export function actingDisplayRank(memberRank, position, minRank) {
  const seat = officerSeat(position, minRank);
  if (!seat) return memberRank || '';
  if (!memberRank) return '';
  return rankOrd(memberRank) >= seat.ord ? memberRank : seat.abbr;
}
