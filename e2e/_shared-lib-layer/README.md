# Layer 1 — the shared law (NOT a Playwright layer)

This folder is a **hand-off**, parked in `e2e/` because that's the collision-free surface
right now. The parity test belongs with the shared libs, in the **server `node:test` suite**
(next to `server/src/tests/syncCore.test.js`), which already dynamic-imports the client's
`syncCore.js`. Move `syncCore-parity.sketch.mjs` there when the trees are clean.

## Why this exists
`scripts/gen-shared-client-libs.js` generates one SHA-pinned `syncCore` used by both the web
PWA and the native Expo app. The existing `sharedClientLibs.test.js` proves both clients run
the **same code**. It does **not** prove they reach the **same conclusion** when an inspector
walks the same inspection offline and reconnects. Given "no signal = no building" was a real
bug, that's the class that bites — and because the logic is one shared artifact, proving it is
cheap.

## What the sketch does
- Defines a canonical **offline field-day fixture** (answers → inspection patch → signature →
  notice → service → photo) and a **fault matrix** (clean reconnect, mid-save disconnect,
  server rejects one op, duplicate replay).
- Computes the **DB-bound end-state** each fault produces through the real `syncCore` API
  (`drainBatch` → `applyResults` / `applyTransportFailure`), normalized so the random
  idempotency keys don't matter — only the committed ops, their order, and the residual outbox.
- **Runnable today** against the committed web `syncCore`: golden-sanity per fault + a
  determinism check.
- **The parity assertion is the hand-off:** point `E2E_SYNCCORE_NATIVE` at the native app's
  generated `syncCore` (or replay the same golden inside the mobile `jest-expo` suite) and it
  asserts web and native land the **identical** end-state. Skipped with a clear message until
  that path is wired.

## Run (once relocated, or standalone from repo root)
```bash
node --test e2e/_shared-lib-layer/syncCore-parity.sketch.mjs
# native parity too:
E2E_SYNCCORE_NATIVE=/path/to/mobile/syncCore.js node --test e2e/_shared-lib-layer/syncCore-parity.sketch.mjs
```
