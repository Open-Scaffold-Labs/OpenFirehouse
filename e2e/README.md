# OpenFirehouse — End-to-End System Test Harness

This is the layer OpenFirehouse did not have: tests that drive the **real UI in a
real browser, through complete workflows, under hostile conditions**, and assert
the **database end-state** — not just what the screen says.

Every bug in the Jul 12–14 engineering report lived in this blind spot. A green
build and 55 passing server unit tests never exercised the browser, never went
offline, never measured on an iPad, and never ran two requests at once
(`--test-concurrency=1`). This harness closes that gap.

> **A green build is a compile check. Unit tests are a contract check. Neither is
> a does-this-work check.** That's what these are for.

## Prerequisites (one-time)

```bash
cd e2e
npm install
npx playwright install        # downloads browser engines
```

## Running

Start the app first (from repo root): `npm run dev` (client :5173 → proxies to server :3005).
Then, in `e2e/`:

```bash
npm run test              # all journeys, default (desktop) project
npm run test:ipad         # iPad viewport projects (13", 11", mini, portrait+landscape)
npm run test:offline      # only the offline / dead-zone journey
npm run report            # open the last HTML report
npm run test -- --headed  # watch it drive the browser
```

Point it at another environment with `E2E_BASE_URL` (e.g. the live demo):

```bash
E2E_BASE_URL=https://app.openfirehouse.openscaffoldlabs.com npm run test
```

## What's here

```
e2e/
  playwright.config.js      # device projects (desktop + iPad sizes), retries, reporters
  fixtures/
    auth.js                 # apiLogin (fast) + uiLogin, DEMO_USERS, loginAs fixture
    faults.js               # goOffline, failApi, blockStorage, blockClipboard/print — the fault-injection kit
    db.js                   # apiGet/expectRow helpers to assert the DB end-state after a journey
  journeys/
    01-incident-lifecycle.spec.js     # dispatch → command → PAR → clear the call
    02-inspection-lifecycle.spec.js   # inspect → cite → notice → serve → returned-mail → reinspect
    03-offline-field-day.spec.js      # the moat: a full field day with the network dead
    04-fresh-install.spec.js          # zero-state install → first-run setup
    05-nfirs-neris-export.spec.js     # export a valid federal file
    06-tenancy-isolation.spec.js      # two departments, neither sees the other
```

## Honesty about the current state of this scaffold

This app was built with **no `data-testid` hooks and no URL router** (navigation is
React state, so pages aren't deep-linkable). That makes stable E2E harder than it
should be. Two consequences you'll see in these files:

1. **Selectors use accessible roles / visible text / placeholders** (`getByRole`,
   `getByPlaceholder`, `getByText`) because that's all the app exposes today. Where a
   step needs a selector we could not confirm against the running app, it is marked
   `test.fixme(...)` with a `TODO(selector)` note — it is **pending, not passing**.
   Nothing here reports green unless it actually ran.
2. **Recommended remediation:** add `data-testid` to the ~20 critical controls listed
   in `journeys/_TESTIDS.md`. It converts these fixmes into stable, fast tests and is
   the single highest-leverage testability investment in the codebase.

The **config, fixtures, and login path are real and runnable today.** The journey
bodies are the contract for what each end-to-end test must prove; fill the fixmes as
the selectors/testids land.
