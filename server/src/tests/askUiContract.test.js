'use strict';
/**
 * askUiContract.test.js — Ask Open Firehouse stays a face of this product.
 *
 * Proves the in-app chat wires to POST /api/agent/invoke (the held
 * department-agent draft), never shows the plumbing name in UI copy,
 * and Duty/Board only lists the read verbs.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const ASK_UI = path.join(ROOT, 'client/src/components/AskOpenFirehouse.jsx');
const INVOKE = path.join(ROOT, 'client/src/utils/askInvoke.js');
const AGENT = path.join(ROOT, 'client/src/utils/dutyBoardAgent.js');
const APP = path.join(ROOT, 'client/src/App.jsx');
const AUTH = path.join(ROOT, 'client/src/data/auth.js');
const LAYOUT = path.join(ROOT, 'client/src/components/Layout.jsx');

function read(p) {
  assert.ok(fs.existsSync(p), `missing ${p}`);
  return fs.readFileSync(p, 'utf8');
}

function uiStrings(src) {
  return [...src.matchAll(/['"`]([^'"`]{8,})['"`]/g)].map((m) => m[1]);
}

test('Ask client calls the live invoke contract, not a shadow API', () => {
  const invoke = read(INVOKE);
  assert.match(invoke, /\/api\/agent\/invoke/);
  assert.match(invoke, /\/api\/agent\/approvals/);
  assert.match(invoke, /\/api\/agent\/routines\/morning-brief/);
  assert.doesNotMatch(invoke, /\/api\/ask\//);
  assert.match(read(AGENT), /invokeAgent|askInvoke/);
  assert.match(read(ASK_UI), /runDutyBoardTurn/);
  assert.match(read(ASK_UI), /Run morning brief now|MorningBriefPanel/);
  const verbs = read(path.join(ROOT, 'client/src/utils/askVerbs.js'));
  assert.match(verbs, /board_read/);
  assert.match(verbs, /duty_read/);
  assert.match(read(AGENT), /board_read/);
  assert.match(read(AGENT), /duty_read/);
});

test('Ask UI copy never names the plumbing layer', () => {
  const PANEL = path.join(ROOT, 'client/src/components/MorningBriefPanel.jsx');
  for (const file of [ASK_UI, AGENT, PANEL]) {
    const strings = uiStrings(read(file)).join('\n');
    assert.doesNotMatch(strings, /\bMCP\b/, `${file} leaked plumbing into a UI string`);
  }
});

test('Ask is a signed-in page every member can open', () => {
  const app = read(APP);
  assert.match(app, /page === 'ask'/);
  assert.match(app, /AskOpenFirehouse/);
  assert.match(app, /'ask'/);
  assert.match(read(AUTH), /ask:\s*1/);
  assert.match(read(LAYOUT), /Ask Open Firehouse/);
});
