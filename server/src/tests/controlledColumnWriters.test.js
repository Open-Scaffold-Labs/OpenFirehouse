'use strict';
/**
 * controlledColumnWriters.test.js — the §5b writer-coverage check (3.2 Slice C).
 *
 * THE FAILURE MODE THIS EXISTS FOR is on file and cost a live back door:
 * PASS_WITH_OPEN_VIOLATIONS fired on /complete and not on the PATCH the iPad actually wrote
 * through — same record, same payload, 422 on one door and 200 on the other. "A guard that
 * exists on one route and not another is not a guard."
 *
 * WHAT IT DOES (spec §5b, each clause because the obvious version misses it):
 *  1. Enumerates every statement that WRITES a controlled money table — from SOURCE, not a
 *     hand-kept list of routes (a hand-kept list drifts exactly like RENDERABLE_PAGES did).
 *  2. Asserts each writer is on an EXPLICIT allowlist with a stated reason, and — the other
 *     direction — that every allowlisted writer still exists (so the allowlist cannot rot).
 *  3. For UPDATE statements, asserts the SET list touches ONLY that table's permitted seam
 *     columns. A frozen column in a SET list fails this suite before it can reach prod
 *     (where the grant layer and trigger would refuse it at runtime — three layers).
 *  4. Guard REACHABILITY (anti-pattern #61): the issuance gate must be CALLED in the issue
 *     handler BEFORE the write it guards — a gate defined but not called, or called after
 *     db.issue, is dead code that reads as protection.
 *
 * COMMENT HANDLING (mistake #10 of the 2026-08-05 handoff — a check that greps a document
 * discussing itself): JS comments are stripped BEFORE matching, so a comment QUOTING an SQL
 * statement cannot register as a writer — and the stripper output is asserted non-empty for
 * every file, so a broken stripper cannot silently scan nothing.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..');

/** The controlled tables and, for UPDATE, the only columns a writer may SET. */
const CONTROLLED = {
  fi_payments: {
    updatable: ['status', 'void_reason_code', 'void_reason_text', 'void_approving_authority',
                'voided_by_user_id', 'voided_at'],
  },
  fi_invoices: {
    updatable: ['status', 'void_reason_code', 'void_reason_text', 'void_approving_authority',
                'voided_by_user_id', 'voided_at',
                'due_date', 'second_notice_date', 'final_notice_date', 'lien_date',
                'sent_to_bureau_date',
                // The stamp route sets its column via a template placeholder that zod has
                // already bound to the DUNNING_STAMPS enum — allowed as the literal token.
                '${stamp}'],
  },
  fi_invoice_lines:     { updatable: [] }, // append-only, no seam at all
  fi_receipt_sequences: { updatable: ['last_sequence', 'updated_at'] },
  fi_invoice_sequences: { updatable: ['last_sequence', 'updated_at'] },
  fi_fee_assessments: {
    updatable: ['committed_amount', 'committed_by_user_id', 'committed_at', 'override_reason',
                'reason_code', 'reason_text', 'attested_by_user_id',
                'waiver_amount', 'waiver_reason', 'waived_by_user_id', 'waived_at',
                'waiver_approving_authority'],
  },
};

/**
 * The allowlist: every legitimate writer, with its reason. BOTH directions are asserted —
 * a writer not listed here fails, and an entry listed here that no longer exists fails.
 * db.js DDL (CREATE TABLE/TRIGGER) is not DML and does not register; tests are excluded
 * because fixtures write deliberately, with the triggers disabled, against a local DB.
 */
const ALLOWLIST = [
  { file: 'routes/fiPayments.js', table: 'fi_payments', op: 'INSERT',
    reason: 'the receipt mint — the single creator, one CTE statement with the allocator' },
  { file: 'routes/fiPayments.js', table: 'fi_receipt_sequences', op: 'INSERT',
    reason: 'the allocator CTE — its ON CONFLICT arm is column-validated inline by this test' },
  { file: 'routes/fiPayments.js', table: 'fi_payments', op: 'UPDATE',
    reason: 'the void seam — the one mutation a receipt has' },
  { file: 'routes/fiInvoices.js', table: 'fi_invoices', op: 'INSERT',
    reason: 'the invoice mint (originals and adjustments), one CTE statement' },
  { file: 'routes/fiInvoices.js', table: 'fi_invoice_lines', op: 'INSERT',
    reason: 'lines ride the same single mint statement' },
  { file: 'routes/fiInvoices.js', table: 'fi_invoice_sequences', op: 'INSERT',
    reason: 'the invoice allocator CTE — ON CONFLICT arm column-validated inline' },
  { file: 'routes/fiInvoices.js', table: 'fi_invoices', op: 'UPDATE',
    reason: 'the two seams: void, and the dunning stamp (zod-enum-bound column)' },
  { file: 'routes/fiFeeSchedules.js', table: 'fi_fee_assessments', op: 'INSERT',
    reason: 'the assessment proposal writer — via the insertRow() HELPER, which is exactly '
          + 'the dynamic-writer shape a naive INSERT-INTO grep misses (found by this test '
          + 'failing on first run, 2026-08-05)' },
  { file: 'routes/fiFeeSchedules.js', table: 'fi_fee_assessments', op: 'UPDATE',
    reason: 'the commit and waiver seams — grant-scoped columns only' },
];

/** Strip JS comments without touching string/template contents on the same line. */
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, ''); // block comments
  out = out.split('\n').filter((line) => {
    const trimmed = line.trim();
    return !(trimmed.startsWith('//') || trimmed.startsWith('*'));
  }).join('\n');
  return out;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'tests' || entry.name === 'node_modules') continue;
      walk(p, files);
    } else if (entry.name.endsWith('.js')) {
      files.push(p);
    }
  }
  return files;
}

test('writer coverage: every writer of a controlled money table is allowlisted, and only seam columns are SET', () => {
  const tables = Object.keys(CONTROLLED);
  const tableAlt = tables.join('|');
  const insertRe = new RegExp(`INSERT\\s+INTO\\s+(${tableAlt})\\b`, 'gi');
  const updateRe = new RegExp(`UPDATE\\s+(${tableAlt})\\b([\\s\\S]*?)\\bSET\\b([\\s\\S]*?)(\\bWHERE\\b|RETURNING|$)`, 'gi');

  const found = []; // { file, table, op, setCols? }
  for (const abs of walk(SRC)) {
    const rel = path.relative(SRC, abs);
    const raw = fs.readFileSync(abs, 'utf8');
    const src = stripComments(raw);
    // The stripper must not have emptied a non-trivial file (mistake #10: a broken stripper
    // scanning nothing reports success for hours).
    if (raw.trim().length > 0) {
      assert.ok(src.trim().length > 0, `comment stripper emptied ${rel} — the scan would be vacuous`);
    }

    let m;
    insertRe.lastIndex = 0;
    while ((m = insertRe.exec(src)) !== null) {
      found.push({ file: rel, table: m[1].toLowerCase(), op: 'INSERT' });
      // An INSERT's ON CONFLICT DO UPDATE arm is a WRITE PATH of its own: validate its SET
      // columns against the same seam list (the allocator bumps last_sequence/updated_at
      // and nothing else — a DO UPDATE that touched an amount would pass a naive scan).
      const stmt = src.slice(m.index, m.index + 2000);
      const conflictM = /ON\s+CONFLICT[\s\S]*?DO\s+UPDATE\s+SET([\s\S]*?)(RETURNING|WHERE|\))/i.exec(stmt);
      if (conflictM) {
        const cols = conflictM[1].split(',')
          .map((frag) => (frag.split('=')[0] || '').trim())
          .filter(Boolean)
          .map((c) => (c.includes('.') ? c.split('.').pop() : c));
        const permitted = CONTROLLED[m[1].toLowerCase()].updatable;
        const illegal = cols.filter((c) => !permitted.includes(c));
        assert.deepEqual(illegal, [],
          `${rel}: INSERT ${m[1]} ON CONFLICT DO UPDATE SETs non-seam column(s) ${JSON.stringify(illegal)}`);
      }
    }
    // Dynamic writers: the insertRow()/updateRow() helper style. A naive INSERT-INTO grep
    // misses these — the assessment writer was found ONLY by this pattern (first run).
    const helperRe = new RegExp(`(insertRow|updateRow)\\(\\s*['"](${tableAlt})['"]`, 'gi');
    helperRe.lastIndex = 0;
    while ((m = helperRe.exec(src)) !== null) {
      found.push({
        file: rel,
        table: m[2].toLowerCase(),
        op: m[1].toLowerCase() === 'insertrow' ? 'INSERT' : 'UPDATE',
      });
    }
    updateRe.lastIndex = 0;
    while ((m = updateRe.exec(src)) !== null) {
      const setCols = m[3].split(',')
        .map((frag) => (frag.split('=')[0] || '').trim())
        .filter(Boolean)
        // fi_receipt_sequences.last_sequence appears as `fi_receipt_sequences.last_sequence`
        // inside the ON CONFLICT arm — take the column side.
        .map((c) => c.includes('.') ? c.split('.').pop() : c);
      found.push({ file: rel, table: m[1].toLowerCase(), op: 'UPDATE', setCols });
    }
  }

  // Direction 1: every writer found in source is allowlisted.
  const allowKey = (w) => `${w.file}|${w.table}|${w.op}`;
  const allowed = new Set(ALLOWLIST.map(allowKey));
  const unlisted = found.filter((w) => !allowed.has(allowKey(w)));
  assert.deepEqual(
    unlisted.map(allowKey), [],
    `writers of controlled tables not on the allowlist — a guard on one door is not a guard; `
    + `either the new writer carries every doctrine (and gets allowlisted with a reason) or it goes`);

  // Direction 2: every allowlisted writer still exists (the allowlist cannot rot into fiction).
  const foundKeys = new Set(found.map(allowKey));
  const stale = ALLOWLIST.filter((w) => !foundKeys.has(allowKey(w)));
  assert.deepEqual(
    stale.map(allowKey), [],
    'allowlist entries with no matching writer in source — remove them or the list is fiction');

  // Direction 3: UPDATE statements SET only that table's seam columns.
  for (const w of found) {
    if (w.op !== 'UPDATE') continue;
    const permitted = CONTROLLED[w.table].updatable;
    const illegal = (w.setCols || []).filter((c) => !permitted.includes(c));
    assert.deepEqual(illegal, [],
      `${w.file}: UPDATE ${w.table} SETs frozen column(s) ${JSON.stringify(illegal)} — `
      + `a receipt/invoice is corrected by void + re-record / adjustment, never in place`);
  }

  // Sanity: the scan itself found the writers we know exist — a scan that finds nothing
  // is a broken scan, not a clean codebase (the vacuous-check class).
  assert.ok(found.some((w) => w.table === 'fi_payments' && w.op === 'INSERT'),
    'the scan failed to find the receipt mint it is known to contain — the regex is broken');
});

test('guard reachability (#61): the issuance gate is defined, called, and called BEFORE the write it guards', () => {
  const src = stripComments(
    fs.readFileSync(path.join(SRC, 'routes', 'fiPermits.js'), 'utf8'));
  assert.ok(src.trim().length > 0, 'stripper emptied fiPermits.js');

  const defIdx = src.indexOf('async function evaluateIssuanceGates');
  assert.ok(defIdx >= 0, 'the gate function no longer exists');

  // The CALL site (not the definition) must exist…
  const callRe = /await\s+evaluateIssuanceGates\s*\(/;
  const callM = callRe.exec(src);
  assert.ok(callM, 'the gate is DEFINED but never CALLED — dead code reading as protection');

  // …and must run before the issuance write in the same handler.
  const issueWrite = src.indexOf('db.issue(', callM.index);
  assert.ok(issueWrite > callM.index,
    'the gate call does not precede db.issue() — a gate after the write guards nothing');

  // And the gate body must actually read the ledger it gates on (not return [] again).
  const body = src.slice(defIdx, src.indexOf('router.post', defIdx));
  assert.match(body, /fi_fee_assessments/, 'gate #1(a): the uninvoiced-assessment check is gone');
  assert.match(body, /fi_payments/, 'gate #1(b): the payment-ledger balance check is gone');
});
