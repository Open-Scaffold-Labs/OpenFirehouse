'use strict';
// Phase E — staffing scoring unit tests (DB-free; pure functions).
const { test } = require('node:test');
const assert = require('node:assert');
const {
  rankOrdinal, rankMet, isValidQual, buildMemberCertIndex, scoreSeat, apparatusVerdict,
  isOfficerSeat, actingInfo,
} = require('../utils/staffingScore');

test('rankOrdinal ladders ranks correctly, Battalion Chief outranks Lieutenant', () => {
  assert.equal(rankOrdinal('Probationary FF'), 1);
  assert.equal(rankOrdinal('Firefighter'), 2);
  assert.equal(rankOrdinal('Firefighter/Paramedic'), 2); // still FF rank
  assert.equal(rankOrdinal('Driver/Engineer'), 3);
  assert.equal(rankOrdinal('Lieutenant'), 4);
  assert.equal(rankOrdinal('Captain'), 5);
  assert.equal(rankOrdinal('Battalion Chief'), 6);
  assert.equal(rankOrdinal('Fire Chief'), 7);
  assert.equal(rankOrdinal(''), 0);
  assert.ok(rankOrdinal('Battalion Chief') > rankOrdinal('Lieutenant'));
});

test('rankMet: meets/exceeds passes, under fails, unparseable requirement does not penalize', () => {
  assert.equal(rankMet('Captain', 'Lieutenant'), true);
  assert.equal(rankMet('Firefighter II', 'Lieutenant'), false);
  assert.equal(rankMet('Engineer', 'Firefighter'), true);
  assert.equal(rankMet('Firefighter', ''), true);          // no requirement
  assert.equal(rankMet('Firefighter', 'Sergeant'), true);  // unknown requirement → allow
});

test('isValidQual: only active + unexpired count', () => {
  const now = new Date('2026-06-18');
  assert.equal(isValidQual({ status: 'active', expiry_date: '2030-01-01' }, now), true);
  assert.equal(isValidQual({ status: 'active', expiry_date: null }, now), true);
  assert.equal(isValidQual({ status: 'active', expiry_date: '2025-01-01' }, now), false); // expired
  assert.equal(isValidQual({ status: 'pending', expiry_date: '2030-01-01' }, now), false);
  assert.equal(isValidQual({ status: 'expired', expiry_date: '2030-01-01' }, now), false);
});

test('buildMemberCertIndex separates valid from all and tracks hasAny', () => {
  const now = new Date('2026-06-18');
  const idx = buildMemberCertIndex([
    { member_id: 1, cert_type: 'firefighter_2', status: 'active', expiry_date: '2030-01-01' },
    { member_id: 1, cert_type: 'fire_officer_1', status: 'expired', expiry_date: '2024-01-01' },
  ], now);
  const m = idx.get(1);
  assert.equal(m.hasAny, true);
  assert.ok(m.valid.has('firefighter_2'));
  assert.ok(!m.valid.has('fire_officer_1')); // expired → not valid
  assert.ok(m.all.has('fire_officer_1'));     // but present in all
  assert.equal(idx.has(99), false);
});

test('scoreSeat: open when no member', () => {
  const r = scoreSeat({ requiredCerts: ['fire_officer_1'], minRank: 'Lieutenant', member: null });
  assert.equal(r.qualification, 'open');
  assert.equal(r.filled, false);
  assert.deepEqual(r.missingCerts, ['fire_officer_1']);
});

test('scoreSeat: qualified when certs held + rank met', () => {
  const r = scoreSeat({
    requiredCerts: ['fire_officer_1'], minRank: 'Lieutenant',
    member: { rank: 'Captain', certs: { valid: new Set(['fire_officer_1']), hasAny: true } },
  });
  assert.equal(r.qualification, 'qualified');
  assert.deepEqual(r.missingCerts, []);
  assert.equal(r.rankMet, true);
});

test('scoreSeat: partial when cert missing', () => {
  const r = scoreSeat({
    requiredCerts: ['firefighter_2', 'interior_qualified'], minRank: 'Firefighter',
    member: { rank: 'Firefighter', certs: { valid: new Set(['firefighter_2']), hasAny: true } },
  });
  assert.equal(r.qualification, 'partial');
  assert.deepEqual(r.missingCerts, ['interior_qualified']);
});

test('scoreSeat: qualified when certs held even if under min_rank (acting up is not a deficiency)', () => {
  const r = scoreSeat({
    requiredCerts: ['fire_officer_1'], minRank: 'Lieutenant',
    member: { rank: 'Firefighter II', certs: { valid: new Set(['fire_officer_1']), hasAny: true } },
  });
  assert.equal(r.qualification, 'qualified'); // certs met → qualified
  assert.equal(r.rankMet, false);             // rank shortfall reported, not penalized
});

test('isOfficerSeat: officer seats detected by min_rank or name', () => {
  assert.equal(isOfficerSeat('Lieutenant', 'Officer'), true);
  assert.equal(isOfficerSeat('Captain', 'Officer'), true);
  assert.equal(isOfficerSeat('', 'Company Officer'), true);
  assert.equal(isOfficerSeat('Firefighter', 'Nozzle'), false);
  assert.equal(isOfficerSeat('Engineer', 'Driver/Engineer'), false);
});

test('actingInfo: FF in officer seat is labeled A/L (never FF), captain shows real rank', () => {
  // FF acting up into a Lieutenant-level officer seat → A/L
  const ff = actingInfo('Firefighter II', 'Lieutenant', 'Officer');
  assert.equal(ff.acting, true);
  assert.equal(ff.displayRank, 'A/L');
  // FF acting up into a Captain-level seat → A/C
  const ffCap = actingInfo('Firefighter', 'Captain', 'Officer');
  assert.equal(ffCap.displayRank, 'A/C');
  // A real Captain in an officer seat shows their real rank
  const cap = actingInfo('Captain', 'Lieutenant', 'Officer');
  assert.equal(cap.acting, false);
  assert.equal(cap.displayRank, 'Captain');
  // Non-officer seat → real rank, never acting
  const driver = actingInfo('Firefighter', 'Engineer', 'Driver/Engineer');
  assert.equal(driver.acting, false);
  assert.equal(driver.displayRank, 'Firefighter');
});

test('scoreSeat: unverified when member has no cert records (never silently "short")', () => {
  const r = scoreSeat({
    requiredCerts: ['firefighter_2'], minRank: 'Firefighter',
    member: { rank: 'Firefighter', certs: { valid: new Set(), hasAny: false } },
  });
  assert.equal(r.qualification, 'unverified');
});

test('apparatusVerdict: staffed / short / unstaffed', () => {
  const filled = { filled: true };
  const open = { filled: false };
  assert.equal(apparatusVerdict([filled, filled]), 'staffed');
  assert.equal(apparatusVerdict([filled, open]), 'short');
  assert.equal(apparatusVerdict([open, open]), 'unstaffed');
  assert.equal(apparatusVerdict([]), 'unstaffed');
});
