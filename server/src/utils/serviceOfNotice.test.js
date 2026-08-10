'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  isEffected, jonesGate, serviceStatus, postingDefects,
} = require('./serviceOfNotice');

const at = (iso) => new Date(iso).toISOString();
const rec = (o) => ({ id: o.id ?? 1, served_at: at('2026-07-13T12:00:00Z'), voided_at: null, ...o });

test('serviceOfNotice — refusal is SERVICE, not a failure', () => {
  // The whole industry treats "no signature" as the sad path. The law does not:
  // the person was there and the document was offered. That is service.
  assert.equal(isEffected(rec({ method: 'personal_service', outcome: 'refused_signature' })), true);
  assert.equal(isEffected(rec({ method: 'personal_service', outcome: 'refused_acceptance' })), true);
  // Nobody home is NOT service.
  assert.equal(isEffected(rec({ method: 'personal_service', outcome: 'no_party_present' })), false);
});

test('serviceOfNotice — a refused signature still starts the clock', () => {
  const s = serviceStatus([rec({ method: 'personal_service', outcome: 'refused_signature' })]);
  assert.equal(s.status, 'sufficient');
  assert.equal(s.servedAt, at('2026-07-13T12:00:00Z'),
    'the correction clock runs from the date served — refusal does not toll it');
});

test('serviceOfNotice — mailing is service; a mailing we KNOW bounced is not', () => {
  assert.equal(isEffected(rec({ method: 'certified_mail', outcome: 'mailed' })), true);
  assert.equal(isEffected(rec({ method: 'certified_mail', outcome: 'delivered' })), true);
  assert.equal(isEffected(rec({ method: 'certified_mail', outcome: 'returned_undelivered' })), false);
  assert.equal(isEffected(rec({ method: 'certified_mail', outcome: 'unclaimed' })), false);
});

test('THE JONES GATE — returned mail BLOCKS until a cure is recorded', () => {
  const returned = rec({ id: 1, method: 'certified_mail', outcome: 'returned_undelivered',
    served_at: at('2026-07-01T12:00:00Z'), mail_returned_at: at('2026-07-10T12:00:00Z') });

  const gate = jonesGate([returned]);
  assert.equal(gate.blocked, true, 'knowing the mail failed and doing nothing is exactly what Jones condemns');
  assert.match(gate.reason, /Jones v\. Flowers/);
  assert.equal(gate.required.length, 3, 'the three cures the Court actually blessed — and no skip trace');

  const s = serviceStatus([returned]);
  assert.equal(s.status, 'action_required');
  assert.equal(s.servedAt, null, 'no clock starts on a notice we know never arrived');
});

test('THE JONES GATE — posting AFTER the failure clears it (IPMC §107.3)', () => {
  const returned = rec({ id: 1, method: 'certified_mail', outcome: 'returned_undelivered',
    served_at: at('2026-07-01T12:00:00Z'), mail_returned_at: at('2026-07-10T12:00:00Z') });
  const posted = rec({ id: 2, method: 'posted_premises', outcome: 'posted',
    served_at: at('2026-07-11T09:00:00Z') });

  const gate = jonesGate([returned, posted]);
  assert.equal(gate.blocked, false);
  assert.deepEqual(gate.cures, [2]);

  const s = serviceStatus([returned, posted]);
  assert.equal(s.status, 'sufficient');
  assert.equal(s.servedAt, at('2026-07-11T09:00:00Z'), 'the clock runs from the POSTING, the cure that worked');
});

test('THE JONES GATE — a posting BEFORE the letter bounced does NOT cure it', () => {
  // A cure must be a RESPONSE to the knowledge. Sequence matters.
  const posted = rec({ id: 1, method: 'posted_premises', outcome: 'posted',
    served_at: at('2026-07-01T09:00:00Z') });
  const returned = rec({ id: 2, method: 'certified_mail', outcome: 'unclaimed',
    served_at: at('2026-07-02T12:00:00Z'), mail_returned_at: at('2026-07-20T12:00:00Z') });

  assert.equal(jonesGate([posted, returned]).blocked, true,
    'the earlier posting predates the failure — it cannot be the response to it');
});

test('THE JONES GATE — first-class resend also cures (the Court said so explicitly)', () => {
  const returned = rec({ id: 1, method: 'certified_mail', outcome: 'returned_undelivered',
    served_at: at('2026-07-01T12:00:00Z'), mail_returned_at: at('2026-07-10T12:00:00Z') });
  const resend = rec({ id: 2, method: 'first_class_mail', outcome: 'mailed',
    served_at: at('2026-07-11T12:00:00Z') });
  assert.equal(jonesGate([returned, resend]).blocked, false);
});

test('serviceOfNotice — voided records are ignored (retire, never delete)', () => {
  const voided = rec({ id: 1, method: 'personal_service', outcome: 'served',
    voided_at: at('2026-07-13T13:00:00Z') });
  assert.equal(serviceStatus([voided]).status, 'pending', 'a voided record proves nothing');
});

test('serviceOfNotice — the controlling date is the EARLIEST effected service', () => {
  const s = serviceStatus([
    rec({ id: 1, method: 'certified_mail', outcome: 'mailed', served_at: at('2026-07-05T12:00:00Z') }),
    rec({ id: 2, method: 'personal_service', outcome: 'served', served_at: at('2026-07-03T12:00:00Z') }),
  ]);
  assert.equal(s.servedAt, at('2026-07-03T12:00:00Z'));
});

test('serviceOfNotice — posting evidence: no photo, no GPS, or a junk fix is a defect', () => {
  assert.deepEqual(postingDefects({ posting_photo_present: true, posting_lat: 1, posting_lng: 2, posting_accuracy_m: 8 }), []);
  assert.ok(postingDefects({ posting_lat: 1, posting_lng: 2 }).some((d) => /photo/i.test(d)));
  assert.ok(postingDefects({ posting_photo_present: true }).some((d) => /GPS/i.test(d)));
  // Same rule as the dispatch surface: a fix worse than 100 m is not a fix.
  assert.ok(postingDefects({ posting_photo_present: true, posting_lat: 1, posting_lng: 2, posting_accuracy_m: 250 })
    .some((d) => /too coarse/i.test(d)));
});
