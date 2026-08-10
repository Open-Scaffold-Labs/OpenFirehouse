#!/usr/bin/env node
'use strict';
/**
 * scripts/gen-shared-client-libs.js
 *
 * ONE SOURCE OF TRUTH for logic that must be identical on the server and in the
 * offline client. Today that means the SERVICE-OF-NOTICE / JONES GATE logic.
 *
 * WHY THIS EXISTS
 * Offline, the client has to compute the service status itself — it cannot ask the
 * server. If the client re-implemented the Jones gate, the two would drift, and the
 * day they disagree the app shows an inspector "SERVED" for a notice the server
 * considers action_required. On a legal record, that is not a cosmetic bug.
 *
 * So the pure module is authored ONCE (server, CommonJS) and this script emits the
 * ESM mirror the Vite client imports. The mirror carries the source's SHA-256, and
 * a unit test fails the suite if it goes stale. Drift is therefore impossible, not
 * merely discouraged.
 *
 * (We deliberately do NOT rely on Node's require(esm) or on Vite transforming a CJS
 * source file — both work on this machine and neither is a promise we want to make
 * against an unknown production Node/bundler minor version.)
 *
 *   node scripts/gen-shared-client-libs.js          # write
 *   node scripts/gen-shared-client-libs.js --check  # verify only (used by the test)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

// The iPad app is a SEPARATE REPO. It is a mirror target, not a required one: if it isn't
// checked out (CI, a fresh clone), those entries are SKIPPED with a note rather than failing
// the build. On a machine that has both, drift between the two clients is impossible.
const OFM_ROOT = process.env.OFM_ROOT || path.resolve(ROOT, '..', 'OpenFirehouseMobile');

const SHARED = [
  {
    // CommonJS on the server → ESM mirror in the web client.
    src: 'server/src/utils/serviceOfNotice.js',
    out: 'client/src/lib/shared/serviceOfNotice.js',
    mode: 'cjs2esm',
  },
  {
    // ── THE OFFLINE SYNC BRAIN — ONE COPY, TWO CLIENTS. (2026-07-14) ──────────────────
    // syncCore is already pure ESM and already the web client's, so this is a verbatim
    // COPY into the iPad app, not a transform.
    //
    // Why it must be generated rather than hand-copied: this module decides whether a
    // failed write is a TRANSIENT FAILURE or a REFUSAL, and whether a replayed completion
    // is a DUPLICATE (success) or a rejection. If the two clients ever disagree, one of
    // them lies to a fire officer about the state of a legal record — and we have now done
    // exactly that twice (the iPad's queue filed a 422 as "pending" and kept showing
    // "Pass"; the web treated the server's own crashes as refusals of the inspector's
    // work). Three different inspection-result vocabularies drifted the same way.
    //
    // RN has no global `crypto`; the iPad installs the Web Crypto surface at app start
    // (src/lib/cryptoPolyfill.ts) so this file runs UNCHANGED and stays byte-identical.
    src: 'client/src/lib/offline/syncCore.js',
    out: 'src/lib/shared/syncCore.js',
    mode: 'esm-copy',
    outRoot: OFM_ROOT,
    optional: true,          // skip cleanly when the iPad repo isn't checked out
    note: 'the offline sync brain — shared with the iPad client',
  },
  {
    // ── THE INSPECTION RESULT AXIS — ONE VOCABULARY, THREE SURFACES. (2026-07-15) ─────
    // The server owns the closed set (constants/inspectionResult.js). Until now the web
    // and the iPad each kept their OWN copy of the labels, in sync only by a lockstep
    // TEST and human discipline — the same arrangement that let the iPad ship 'Conditional'
    // (a result that exists nowhere else; the server now REJECTS it). This makes the two
    // clients read the SERVER's enum by construction: drift becomes impossible, not merely
    // discouraged. Pure module, no requires → the cjs2esm transform mirrors it verbatim.
    src: 'server/src/constants/inspectionResult.js',
    out: 'client/src/lib/shared/inspectionResult.js',
    mode: 'cjs2esm',
  },
  {
    src: 'server/src/constants/inspectionResult.js',
    out: 'src/lib/shared/inspectionResult.js',
    mode: 'cjs2esm',
    outRoot: OFM_ROOT,
    optional: true,          // skip cleanly when the iPad repo isn't checked out
  },
];

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Strip the CommonJS footer and re-export every name as ESM. */
function toEsm(source, srcRel, hash) {
  const marker = source.indexOf('module.exports');
  if (marker === -1) throw new Error(`${srcRel}: no module.exports footer found`);

  const body = source.slice(0, marker).trimEnd();
  const footer = source.slice(marker);

  // Pull the exported names out of `module.exports = { a, b, c };`
  const inner = footer.replace(/^module\.exports\s*=\s*\{/, '').replace(/\};?\s*$/, '');
  const names = inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(':')[0].trim())
    .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));

  if (!names.length) throw new Error(`${srcRel}: could not parse exported names`);

  return [
    '// ⚠️  GENERATED FILE — DO NOT EDIT.',
    `// Source of truth: ${srcRel}`,
    '// Regenerate: node scripts/gen-shared-client-libs.js',
    '//',
    '// This is the ESM mirror of a PURE, server-owned module (logic or vocabulary),',
    '// shared so the offline client and the server reach the SAME verdict / read the',
    '// SAME closed set. If the two ever disagree, a client can show an inspector a state',
    '// the server rejects. A unit test fails the suite if this file goes stale.',
    `// source-sha256: ${hash}`,
    '',
    body,
    '',
    `export { ${names.join(', ')} };`,
    '',
  ].join('\n');
}

/** An already-ESM module, mirrored verbatim into another client. No transform. */
function copyEsm(source, srcRel, hash, note) {
  return [
    '// ⚠️  GENERATED FILE — DO NOT EDIT.',
    `// Source of truth: openfirehouse/${srcRel}`,
    '// Regenerate (from the openfirehouse repo): node scripts/gen-shared-client-libs.js',
    '//',
    `// ${note}`,
    '//',
    '// This module decides whether a failed write was a TRANSIENT FAILURE or a REFUSAL, and',
    '// whether a replayed write is a DUPLICATE (success) or an error. If the web client and',
    '// the iPad client ever disagree about that, one of them lies to a fire officer about the',
    '// state of a legal record. So it is authored ONCE and copied — never re-implemented.',
    '//',
    '// NOTE FOR REACT NATIVE: newClientId() reaches for the global Web Crypto API, which RN',
    '// does not ship. The app installs it at startup (src/lib/cryptoPolyfill.ts) so this file',
    '// runs UNCHANGED. Do not "fix" it here — an edit here breaks the drift check.',
    `// source-sha256: ${hash}`,
    '',
    source.trimEnd(),
    '',
  ].join('\n');
}

function run({ check }) {
  let drifted = 0;
  for (const entry of SHARED) {
    const { src, out, mode = 'cjs2esm', outRoot = ROOT, optional = false, note = '' } = entry;
    const srcAbs = path.join(ROOT, src);
    const outAbs = path.join(outRoot, out);

    // A mirror target in another repo may simply not be checked out. That is not drift.
    if (optional && !fs.existsSync(outRoot)) {
      console.log(`  ⊘ skipped (repo not present): ${outRoot}`);
      continue;
    }

    const source = fs.readFileSync(srcAbs, 'utf8');
    const hash = sha(source);
    const next = mode === 'esm-copy'
      ? copyEsm(source, src, hash, note)
      : toEsm(source, src, hash);

    const existing = fs.existsSync(outAbs) ? fs.readFileSync(outAbs, 'utf8') : null;
    if (existing === next) { console.log(`  ✓ up to date: ${out}`); continue; }

    if (check) {
      drifted++;
      const had = existing && /source-sha256: ([a-f0-9]+)/.exec(existing)?.[1];
      console.error(`  ✗ STALE: ${outAbs}`);
      console.error(`      generated from: ${had || '(missing file)'}`);
      console.error(`      source is now:  ${hash}`);
      continue;
    }
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, next);
    console.log(`  ✎ wrote: ${outAbs}`);
  }

  if (check && drifted) {
    console.error(`\n${drifted} shared module(s) out of sync.`);
    console.error('Run: node scripts/gen-shared-client-libs.js');
    process.exit(1);
  }
}

run({ check: process.argv.includes('--check') });
