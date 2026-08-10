'use strict';
// csv.test.js — the CSV parse/generate contract. Pure, no DB, always runs.
// The two things that actually bite: fields containing commas/quotes/newlines, and CSV
// FORMULA INJECTION on export (a cell starting with = + - @ executes in Excel). Both pinned.

const { test } = require('node:test');
const assert = require('node:assert');
const { toCsv, parseCsv, escapeCell } = require('../utils/csv');

const COLS = [{ key: 'code', header: 'code' }, { key: 'title', header: 'title' }];

test('parseCsv reads a simple table with a header', () => {
  const { header, rows } = parseCsv('code,title\n1001,Blocked exit\n2001,Missing extinguisher\n');
  assert.deepEqual(header, ['code', 'title']);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { code: '1001', title: 'Blocked exit' });
});

test('parseCsv handles quoted commas, quoted newlines, and escaped quotes', () => {
  const csv = 'code,title\r\n'
    + '1001,"Exit, egress, and stairs"\r\n'
    + '2001,"Line one\nline two"\r\n'
    + '3001,"He said ""clear the exit"""\r\n';
  const { rows } = parseCsv(csv);
  assert.equal(rows[0].title, 'Exit, egress, and stairs', 'comma inside quotes stays one field');
  assert.equal(rows[1].title, 'Line one\nline two', 'newline inside quotes stays one field');
  assert.equal(rows[2].title, 'He said "clear the exit"', 'doubled quotes unescape to one');
});

test('parseCsv strips a BOM and lower-cases/trims headers', () => {
  const { header, rows } = parseCsv('﻿ Code , Title \n1001,x\n');
  assert.deepEqual(header, ['code', 'title']);
  assert.deepEqual(rows[0], { code: '1001', title: 'x' });
});

test('parseCsv on empty / whitespace input returns no rows (never throws)', () => {
  assert.deepEqual(parseCsv(''), { header: [], rows: [] });
  assert.deepEqual(parseCsv('   \n  \n'), { header: [], rows: [] });
  assert.deepEqual(parseCsv(null), { header: [], rows: [] });
});

test('toCsv escapes commas, quotes, and newlines per RFC 4180', () => {
  const csv = toCsv([{ code: '1001', title: 'Exit, "main", stairs' }], COLS);
  assert.match(csv, /"Exit, ""main"", stairs"/);
  assert.ok(csv.startsWith('code,title\r\n'));
});

test('🔴 toCsv neutralizes CSV formula injection (= + - @ get a leading quote)', () => {
  for (const evil of ['=SUM(A1)', '+1+1', '-2+3', '@cmd', '\tTAB']) {
    const cell = escapeCell(evil);
    assert.ok(cell.startsWith("'") || cell.startsWith('"\''),
      `a formula-leading cell must be neutralized: ${JSON.stringify(evil)} -> ${JSON.stringify(cell)}`);
  }
  // A normal value is untouched.
  assert.equal(escapeCell('1001'), '1001');
  assert.equal(escapeCell('Blocked exit'), 'Blocked exit');
});

test('toCsv round-trips through parseCsv', () => {
  const original = [
    { code: '1001', title: 'Exit, egress' },
    { code: '2001', title: 'Line\nbreak' },
  ];
  const { rows } = parseCsv(toCsv(original, COLS));
  assert.deepEqual(rows, original);
});
