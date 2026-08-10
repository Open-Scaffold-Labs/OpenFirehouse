// eslint.undef.config.js — THE SERVER SHIP GATE. One rule, and it must stay at zero.
//
// WHY THIS FILE EXISTS
// --------------------
// The client got this gate on 2026-07-27, after a dead identifier shipped to production
// and took an entire page into the ErrorBoundary. The gate was scoped to the client. The
// SERVER was left unfenced, and the identical class was already live there:
//
//   cad/index.js called processStatusUpdate() in the unit-status branch added by 4bfde8b
//   (2026-07-15) but never destructured it from ./pipeline. A free identifier is a
//   ReferenceError only when the line executes, so `npm test` was green and `npm run build`
//   was green while every CAD-relayed unit status answered 500 on prod for 12 days.
//
// The stakes on this side are not a blank page. Per NENA-STA-024.1.1-2025's eventResponse
// table a 500 produces NO sender action, and the standard defines no dead-letter queue and
// no redelivery — so a dead identifier on an ingest path does not surface an error to
// anyone, it DELETES A DISPATCH. NENA-STA-024 3.14 makes logging every message MUST-level;
// NFPA 1221 12.5.3 makes keeping a record of every dispatch signal SHALL.
//
// A test suite cannot substitute for this rule. Tests cover the lines they call, and the
// defect above sat on a branch that no test reached — the layer between a covered adapter
// and a covered pipeline. This rule reads every line whether or not anything calls it.
//
// SCOPED TO no-undef ONLY, deliberately, exactly as on the client: a full lint of this
// workspace would carry pre-existing debt and so could never sit at zero, and a gate that
// cannot go green is not a gate. Cleaning the rest is separate work that must not block
// shipping.
//
// IF THIS GATE GOES RED: read the identifier before touching the config. A genuinely new
// runtime global belongs in the `globals` block below. Everything else is a crash waiting
// for the first line that executes it — fix the code, not the rule.
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        // node:test injects nothing global; the suite imports { test } explicitly.
      },
    },
    rules: { 'no-undef': 'error' },
  },
  {
    // The few ESM entrypoints/scripts in this workspace, if any appear later.
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { 'no-undef': 'error' },
  },
];
