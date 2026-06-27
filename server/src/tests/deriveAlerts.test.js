'use strict';
// deriveAlerts — pure alert-derivation unit tests (DB-free).
// Fences the live alert engine: thresholds/severity per category, rank-notification
// gating, id-based cert scope, the shiftType/crew-array field mappings, and the
// new-department empty case.
const { test } = require('node:test');
const assert = require('node:assert');
const { deriveAlerts } = require('../lib/deriveAlerts');

// 'YYYY-MM-DD' offset from today.
function ymd(off) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + off); return d.toISOString().slice(0, 10); }
const byId = (alerts, id) => alerts.find((a) => a.id === id);

test('empty data (new department) → no alerts, never throws', () => {
  assert.deepEqual(deriveAlerts({}, {}), []);
  assert.deepEqual(deriveAlerts({ apparatus: [], assets: [], shifts: [], training: [] }, {}), []);
});

test('apparatus service: overdue → critical, soon → warning, far → none', () => {
  const a = deriveAlerts({ apparatus: [
    { id: 1, designation: 'Engine 1', nextServiceDue: ymd(-5) },
    { id: 2, designation: 'Ladder 1', nextServiceDue: ymd(10) },
    { id: 3, designation: 'Rescue 1', nextServiceDue: ymd(200) },
    { id: 4, designation: 'Tanker 1', nextServiceDue: '' },
  ] }, {});
  assert.equal(byId(a, 'app-overdue-1').severity, 'critical');
  assert.equal(byId(a, 'app-soon-2').severity, 'warning');
  assert.equal(a.filter((x) => x.module === 'apparatus').length, 2); // 3 (far) + 4 (blank) skipped
});

test('maintenance gating off → no apparatus/asset alerts', () => {
  const a = deriveAlerts(
    { apparatus: [{ id: 1, designation: 'E1', nextServiceDue: ymd(-5) }],
      assets: [{ id: 9, name: 'SCBA', condition: 'Out of Service' }] },
    { enabled: { maintenance: false, certs: true, schedule: true } },
  );
  assert.equal(a.length, 0);
});

test('assets: overdue inspection + condition flags', () => {
  const a = deriveAlerts({ assets: [
    { id: 1, name: 'Hose', category: 'Hose', nextInspectionDue: ymd(-3), condition: 'Good' },
    { id: 2, name: 'Saw', category: 'Tools', condition: 'Needs Maintenance' },
    { id: 3, name: 'AED', category: 'Medical', condition: 'Out of Service' },
  ] }, {});
  assert.equal(byId(a, 'asset-overdue-1').severity, 'critical');
  assert.equal(byId(a, 'asset-maint-2').severity, 'warning');
  assert.equal(byId(a, 'asset-oos-3').severity, 'critical');
});

test('certs: expired → critical, soon → warning, far → none', () => {
  const a = deriveAlerts({ training: [
    { id: 1, memberId: 5, memberName: 'A', courseName: 'CPR', expiresDate: ymd(-1) },
    { id: 2, memberId: 5, memberName: 'A', courseName: 'EMT', expiresDate: ymd(7) },
    { id: 3, memberId: 5, memberName: 'A', courseName: 'FFII', expiresDate: ymd(100) },
  ] }, { certScope: 'all' });
  assert.equal(byId(a, 'cert-expired-1').severity, 'critical');
  assert.equal(byId(a, 'cert-soon-2').severity, 'warning');
  assert.equal(a.filter((x) => x.module === 'training').length, 2);
});

test('cert scope: own → only the viewer; crew → only the allow-list; all → everyone', () => {
  const training = [
    { id: 1, memberId: 2, memberName: 'Cap', courseName: 'CPR', expiresDate: ymd(-1) },
    { id: 2, memberId: 3, memberName: 'FF', courseName: 'EMT', expiresDate: ymd(-1) },
    { id: 3, memberId: 9, memberName: 'Other', courseName: 'HazMat', expiresDate: ymd(-1) },
  ];
  const own  = deriveAlerts({ training }, { certScope: 'own', viewerMemberId: 2 });
  assert.deepEqual(own.map((a) => a.memberId), [2]);
  const crew = deriveAlerts({ training }, { certScope: 'crew', certMemberIds: [2, 3] });
  assert.deepEqual(crew.map((a) => a.memberId).sort(), [2, 3]);
  const all  = deriveAlerts({ training }, { certScope: 'all' });
  assert.equal(all.length, 3);
});

test('certs gating off → no cert alerts even when expired', () => {
  const a = deriveAlerts(
    { training: [{ id: 1, memberId: 2, memberName: 'A', courseName: 'CPR', expiresDate: ymd(-1) }] },
    { enabled: { certs: false, maintenance: true, schedule: true }, certScope: 'all' },
  );
  assert.equal(a.length, 0);
});

test('schedule: understaffed within 14 days (uses shiftType + crew array)', () => {
  const a = deriveAlerts({ shifts: [
    { id: 1, date: ymd(3), shiftType: 'Day',   crew: ['a', 'b'] }, // 2 < 3 → warning
    { id: 2, date: ymd(4), shiftType: 'Night', crew: [] },         // 0 → critical
    { id: 3, date: ymd(5), shiftType: 'Day',   crew: ['a', 'b', 'c'] }, // staffed → none
    { id: 4, date: ymd(30), shiftType: 'Day',  crew: [] },         // beyond 14d → none
  ] }, {});
  assert.equal(byId(a, 'shift-under-1').severity, 'warning');
  assert.match(byId(a, 'shift-under-1').title, /Day/);            // shiftType used as label
  assert.equal(byId(a, 'shift-under-2').severity, 'critical');
  assert.equal(a.filter((x) => x.module === 'schedule').length, 2);
});

test('schedule gating off → no shift alerts', () => {
  const a = deriveAlerts(
    { shifts: [{ id: 1, date: ymd(2), shiftType: 'Day', crew: [] }] },
    { enabled: { schedule: false, certs: true, maintenance: true } },
  );
  assert.equal(a.length, 0);
});

test('sort: critical before warning', () => {
  const a = deriveAlerts({
    apparatus: [{ id: 1, designation: 'E1', nextServiceDue: ymd(10) }],   // warning
    assets: [{ id: 2, name: 'AED', category: 'Med', condition: 'Out of Service' }], // critical
  }, {});
  assert.equal(a[0].severity, 'critical');
});
