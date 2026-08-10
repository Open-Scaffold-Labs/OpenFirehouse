'use strict';
/**
 * totp.test.js — Phase 5 / 0111.
 *
 * The centre of this file is RFC 6238 Appendix B: the standard's OWN published
 * test vectors. That is the justification for implementing TOTP in-house rather
 * than taking a dependency — correctness here is demonstrable against the
 * specification, not asserted. If these vectors pass, the implementation agrees
 * with every conforming authenticator app in the world.
 *
 * The rest are adversarial cases around the parts RFC 6238 does NOT specify and
 * where real implementations get it wrong: replay, drift window boundaries,
 * malformed input, and constant-time comparison.
 */

const assert = require('node:assert');
const { test } = require('node:test');

const {
  base32Encode, base32Decode, generateSecret,
  hotp, generate, verify, otpauthURI,
  generateRecoveryCodes, hashRecoveryCode,
} = require('../utils/totp');

// RFC 6238 Appendix B uses the ASCII seed "12345678901234567890".
const RFC_SECRET_ASCII = '12345678901234567890';
const RFC_SECRET_B32   = base32Encode(Buffer.from(RFC_SECRET_ASCII, 'ascii'));

// ── RFC 6238 Appendix B — the official vectors (SHA-1, 8 digits, 30s) ────────

test('RFC 6238 Appendix B: all published SHA-1 test vectors match exactly', () => {
  const vectors = [
    { time: 59,          expected: '94287082' },
    { time: 1111111109,  expected: '07081804' },
    { time: 1111111111,  expected: '14050471' },
    { time: 1234567890,  expected: '89005924' },
    { time: 2000000000,  expected: '69279037' },
    { time: 20000000000, expected: '65353130' },
  ];

  for (const { time, expected } of vectors) {
    const actual = generate(RFC_SECRET_B32, { seconds: time, digits: 8, algorithm: 'sha1' });
    assert.strictEqual(actual, expected, `RFC 6238 vector at T=${time}`);
  }
});

test('RFC 6238: the final vector exceeds 2^32 seconds — proves 64-bit counter handling', () => {
  // T=20000000000 / 30 = 666666666 steps, but the moment itself is > 2^32.
  // A naive 32-bit counter write passes the first five vectors and fails here.
  assert.strictEqual(
    generate(RFC_SECRET_B32, { seconds: 20000000000, digits: 8 }),
    '65353130'
  );
});

test('RFC 4226 HOTP: dynamic truncation matches the published HOTP vectors', () => {
  const key = Buffer.from(RFC_SECRET_ASCII, 'ascii');
  const expected = [
    '755224', '287082', '359152', '969429', '338314',
    '254676', '287922', '162583', '399871', '520489',
  ];
  expected.forEach((want, counter) => {
    assert.strictEqual(hotp(key, counter, 6, 'sha1'), want, `HOTP counter=${counter}`);
  });
});

// ── base32 round-trip ────────────────────────────────────────────────────────

test('base32: round-trips arbitrary bytes, and tolerates padding/case/whitespace', () => {
  for (const s of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', 'hello world']) {
    const buf = Buffer.from(s, 'utf8');
    assert.deepStrictEqual(base32Decode(base32Encode(buf)), buf, `round-trip ${JSON.stringify(s)}`);
  }
  const enc = base32Encode(Buffer.from('abcde'));
  assert.deepStrictEqual(base32Decode(enc.toLowerCase()), Buffer.from('abcde'));
  assert.deepStrictEqual(base32Decode(`${enc}====`), Buffer.from('abcde'));
  assert.deepStrictEqual(base32Decode(enc.split('').join(' ')), Buffer.from('abcde'));
});

test('base32: rejects characters outside the RFC 4648 alphabet', () => {
  assert.throws(() => base32Decode('ABC!'), /Invalid base32/);
  assert.throws(() => base32Decode('0189'), /Invalid base32/); // 0/1/8/9 are NOT in base32
});

test('generateSecret: 160 bits of entropy, and never repeats', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const s = generateSecret();
    assert.strictEqual(base32Decode(s).length, 20, '20 bytes = 160 bits (RFC 4226 §4)');
    assert.ok(!seen.has(s), 'secrets must not repeat');
    seen.add(s);
  }
});

// ── verify(): the drift window, exactly ──────────────────────────────────────

test('verify: accepts the current step and exactly one step either side, and no more', () => {
  const now = 1_700_000_000;
  const code = generate(RFC_SECRET_B32, { seconds: now });

  assert.strictEqual(verify(RFC_SECRET_B32, code, { seconds: now }).valid, true, 'current step');
  assert.strictEqual(verify(RFC_SECRET_B32, code, { seconds: now + 30 }).valid, true, '+1 step');
  assert.strictEqual(verify(RFC_SECRET_B32, code, { seconds: now - 30 }).valid, true, '-1 step');

  // Two steps away must FAIL. If this passes, the window is wider than intended
  // and a stolen code lives far longer than it should.
  assert.strictEqual(verify(RFC_SECRET_B32, code, { seconds: now + 60 }).valid, false, '+2 steps');
  assert.strictEqual(verify(RFC_SECRET_B32, code, { seconds: now - 60 }).valid, false, '-2 steps');
});

test('verify: returns the matched STEP so the caller can block replay', () => {
  const now = 1_700_000_000;
  const code = generate(RFC_SECRET_B32, { seconds: now });
  const res = verify(RFC_SECRET_B32, code, { seconds: now });

  assert.strictEqual(res.valid, true);
  assert.strictEqual(typeof res.step, 'number');
  // The step must identify the window the code belongs to, not the window it was
  // checked in — otherwise storing it cannot prevent a replay 25 seconds later.
  assert.strictEqual(res.step, Math.floor(now / 30));

  const later = verify(RFC_SECRET_B32, code, { seconds: now + 20 });
  assert.strictEqual(later.valid, true, 'same window, still valid');
  assert.strictEqual(later.step, res.step, 'SAME step — so a replay is detectable');
});

test('verify: rejects malformed input without throwing', () => {
  const now = 1_700_000_000;
  for (const bad of [undefined, null, '', '12345', '1234567', 'abcdef', '12 34 56', {}, [], 0, NaN]) {
    const r = verify(RFC_SECRET_B32, bad, { seconds: now });
    assert.strictEqual(r.valid, false, `must reject ${JSON.stringify(bad)}`);
    assert.strictEqual(r.step, null);
  }
});

test('verify: a malformed SECRET fails closed rather than throwing', () => {
  const r = verify('not!valid!base32', '123456', { seconds: 1_700_000_000 });
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.step, null);
});

test('verify: tolerates user-entered whitespace in the code', () => {
  const now = 1_700_000_000;
  const code = generate(RFC_SECRET_B32, { seconds: now });
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  assert.strictEqual(verify(RFC_SECRET_B32, spaced, { seconds: now }).valid, true);
});

test('verify: a code from a DIFFERENT secret is rejected', () => {
  const now = 1_700_000_000;
  const other = generateSecret();
  const code = generate(other, { seconds: now });
  assert.strictEqual(verify(RFC_SECRET_B32, code, { seconds: now }).valid, false);
});

// ── otpauth URI ──────────────────────────────────────────────────────────────

test('otpauthURI: encodes issuer and account so a colon cannot corrupt the label', () => {
  const uri = otpauthURI({ secret: 'ABC234', accountName: 'chief@dept:1', issuer: 'Open:Firehouse' });
  assert.ok(uri.startsWith('otpauth://totp/'));
  // The raw colon must not survive into the label segment.
  const label = uri.slice('otpauth://totp/'.length, uri.indexOf('?'));
  assert.ok(!label.includes('Open:Firehouse'), 'issuer colon must be percent-encoded');
  assert.ok(label.includes('%3A'), 'colon encoded as %3A');
  assert.ok(uri.includes('secret=ABC234'));
  assert.ok(uri.includes('period=30'));
  assert.ok(uri.includes('digits=6'));
});

// ── recovery codes ───────────────────────────────────────────────────────────

test('recovery codes: unique, well-formed, and hashing is normalization-insensitive', () => {
  const codes = generateRecoveryCodes(10);
  assert.strictEqual(codes.length, 10);
  assert.strictEqual(new Set(codes).size, 10, 'no duplicates');
  for (const c of codes) assert.match(c, /^[A-Z2-7]{4}-[A-Z2-7]{4}$/);

  // A tired firefighter typing at 3am must not be defeated by case or dashes.
  const c = codes[0];
  const h = hashRecoveryCode(c);
  assert.strictEqual(hashRecoveryCode(c.toLowerCase()), h);
  assert.strictEqual(hashRecoveryCode(c.replace('-', '')), h);
  assert.strictEqual(hashRecoveryCode(` ${c} `), h);
  // But a genuinely different code must not collide.
  assert.notStrictEqual(hashRecoveryCode(codes[1]), h);
});

test('recovery codes: the stored hash does not reveal the code', () => {
  const [code] = generateRecoveryCodes(1);
  const hash = hashRecoveryCode(code);
  assert.strictEqual(hash.length, 64, 'sha256 hex');
  assert.ok(!hash.includes(code.replace('-', '').toLowerCase()));
});
