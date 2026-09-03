import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

register('./_resolveExtensions.mjs', import.meta.url);

const ROOT = path.join(import.meta.dirname, '../../../..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('Ask and Dashboard surface Run morning brief now next to the same session plug', () => {
  const panel = read('client/src/components/MorningBriefPanel.jsx');
  const ask = read('client/src/components/AskOpenFirehouse.jsx');
  const dash = read('client/src/components/Dashboard.jsx');
  const invoke = read('client/src/utils/askInvoke.js');
  assert.match(panel, /Run morning brief now/);
  assert.match(panel, /runMorningBriefNow/);
  assert.match(invoke, /\/api\/agent\/routines\/morning-brief\/run/);
  assert.match(invoke, /\/api\/agent\/invoke/);
  assert.doesNotMatch(invoke, /\/api\/ask\//);
  assert.match(ask, /MorningBriefPanel/);
  assert.match(ask, /Morning brief/);
  assert.match(dash, /MorningBriefPanel/);
  assert.doesNotMatch(panel, /\bMCP\b/);
});
