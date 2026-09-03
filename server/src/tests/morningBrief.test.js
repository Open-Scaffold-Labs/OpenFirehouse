'use strict';
/**
 * morningBrief.test.js — first routine stays read-only and quiet when calm.
 * Pure functions; no database.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  MORNING_BRIEF_READ_VERBS,
  GATED_WRITE_VERBS,
  extractFacts,
  isNoteworthy,
  fingerprint,
  formatDigest,
  decideSilence,
  isWeekdayMorning,
  scheduleConfig,
} = require('../utils/morningBrief');

test('morning brief only lists immediate read verbs', () => {
  assert.deepEqual([...MORNING_BRIEF_READ_VERBS], [
    'board_read', 'duty_read', 'roster_read', 'apparatus_status_read', 'incident_read',
  ]);
  for (const verb of MORNING_BRIEF_READ_VERBS) {
    assert.ok(!GATED_WRITE_VERBS.includes(verb), `${verb} is a write`);
  }
});

function reply(verb, data, extra = {}) {
  return { verb, out: { ok: true, status: 200, queued: false, result: { data }, ...extra } };
}

test('extractFacts + digest stay dense and do not invent legal narrative', () => {
  const facts = extractFacts([
    reply('board_read', { incident_type: 'Medical', address: '123 Oak St', units_count: 2 }),
    reply('duty_read', { payload: { crew: [
      { member_name: 'Capt. Rivera', position_name: 'Captain', designation: 'E-1' },
    ] } }),
    reply('roster_read', [{ id: 1, status: 'Active' }, { id: 2, status: 'Active' }]),
    reply('apparatus_status_read', [
      { apparatus_id: 1, designation: 'E-1', status: 'in_service' },
      { apparatus_id: 2, designation: 'L-1', status: 'out_of_service' },
    ]),
    reply('incident_read', [
      { id: 9, incidentNumber: '2026-001', type: 'Medical', address: '123 Oak St', disposition: '' },
      { id: 10, incidentNumber: '2026-002', type: 'Alarm', disposition: 'closed' },
    ]),
  ]);
  assert.equal(facts.boardActive, true);
  assert.match(facts.boardLine, /Medical/);
  assert.equal(facts.dutyCount, 1);
  assert.equal(facts.oosCount, 1);
  assert.equal(facts.openIncidentCount, 1);
  assert.equal(isNoteworthy(facts), true);

  const digest = formatDigest(facts, { silent: false });
  assert.match(digest, /Morning shift brief/);
  assert.match(digest, /ACTIVE/);
  assert.match(digest, /Capt\. Rivera/);
  assert.match(digest, /L-1/);
  assert.match(digest, /2026-001/);
  assert.doesNotMatch(digest, /Heavy smoke|patient refused|NFIRS narrative/i);
  assert.match(digest, /do not write incident narrative/);
});

test('calm house is not noteworthy and scheduled stay silent', () => {
  const facts = extractFacts([
    reply('board_read', null),
    reply('duty_read', { payload: { crew: [
      { member_name: 'FF Smith', designation: 'E-1' },
    ] } }),
    reply('roster_read', [{ id: 1 }]),
    reply('apparatus_status_read', [{ apparatus_id: 1, designation: 'E-1', status: 'in_service' }]),
    reply('incident_read', [{ id: 3, disposition: 'closed' }]),
  ]);
  assert.equal(facts.boardActive, false);
  assert.equal(facts.oosCount, 0);
  assert.equal(facts.openIncidentCount, 0);
  assert.equal(isNoteworthy(facts), false);

  const scheduled = decideSilence(facts, null, 'scheduled', false);
  assert.equal(scheduled.silent, true);
  const manual = decideSilence(facts, null, 'manual', false);
  assert.equal(manual.silent, false);
  assert.match(formatDigest(facts, scheduled), /House is quiet/);
});

test('unchanged fingerprint stays silent on the scheduled tick', () => {
  const facts = extractFacts([
    reply('board_read', { type: 'Fire', address: '1 Main' }),
    reply('duty_read', { payload: { crew: [] } }),
    reply('roster_read', []),
    reply('apparatus_status_read', []),
    reply('incident_read', []),
  ]);
  const fp = fingerprint(facts);
  const again = decideSilence(facts, fp, 'scheduled', false);
  assert.equal(again.silent, true);
  assert.equal(again.unchanged, true);
  const demo = decideSilence(facts, fp, 'manual', false);
  assert.equal(demo.silent, false);
});

test('empty or missing duty is noteworthy', () => {
  const missing = extractFacts([reply('duty_read', null)]);
  assert.equal(missing.dutyMissing, true);
  assert.equal(isNoteworthy(missing), true);
  const empty = extractFacts([reply('duty_read', { payload: { crew: [] } })]);
  assert.equal(empty.dutyEmpty, true);
  assert.equal(isNoteworthy(empty), true);
});

test('weekday morning uses the configured house clock', () => {
  const cfg = { timeZone: 'America/New_York', localHour: 7 };
  // 2026-09-04 Friday 11:00 UTC = 07:00 EDT
  assert.equal(isWeekdayMorning(new Date('2026-09-04T11:00:00Z'), cfg), true);
  // Saturday
  assert.equal(isWeekdayMorning(new Date('2026-09-05T11:00:00Z'), cfg), false);
  // Friday 08:00 EDT
  assert.equal(isWeekdayMorning(new Date('2026-09-04T12:00:00Z'), cfg), false);
  const schedule = scheduleConfig();
  assert.equal(schedule.localHour, 7);
  assert.equal(schedule.cron, '0 11 * * *');
});

test('Saturday morning is not a weekday brief slot', () => {
  const cfg = { timeZone: 'America/New_York', localHour: 7 };
  assert.equal(isWeekdayMorning(new Date('2026-09-05T11:00:00Z'), cfg), false);
});
