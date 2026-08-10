# Testid + Router — implementation plan (apply AFTER Matt's "trees clean" ping)

Prerequisite work before the journeys can be un-`fixme`'d. Hooks first, journeys second.
This edits `client/src`, which is Matt's active surface (16 modified in OF web, plus
untracked). **Do not start until Matt confirms both trees are clean and pushed.**

## Rules of engagement
- One small, self-contained PR: hooks + router only, **no behavior change**.
- `data-testid` is inert at runtime; the router change is hash-sync with **no new dependency**.
- Sequence when the ping comes: `git pull` → apply → run the harness against the seeded
  env to convert fixmes → commit → open PR → land `e2e/` alongside.

## Definition of done (per Matt) — status

The highest-value hooks are the surfaces that **lied** in the Jul 12–14 report. Tracker:

- [x] Stable set — login, app-shell, offline-banner (nav via existing `data-nav-id`) — `c7358ac`
- [x] Router hash-sync (`#/page`) — `c7358ac`
- [x] Apply-time set — PAR · clear-call · status-check · notice · service · returned-mail · enforcement-blocked — `04e5fc9`
- [x] **Web dispatch surface** (LiveDispatch) — `dispatch-card` (+`data-status`/`data-dispatched-at`) · `active-call-map` · `map-view-{route,overhead,street}` (+`data-active`) — *this commit* (Matt's correction: the web CAD/dispatch surface IS hookable → Playwright)
- [ ] **Size-Up PROVENANCE parity — NATIVE / Layer 3, NOT web.** Per Matt: the "synced Nm ago / OFFLINE · synced …" age+source stamps live in native `SizeUpMap.tsx`; **no `data-source`/`data-age` exists anywhere in the web client**, so there is nothing on web to hang the assertion on. This box belongs to Layer 3 (Maestro/mobile), not this plan.
- [x] State attrs where they exist on web — `offline-banner` `data-state`, `service-outcome` `data-served`, dispatch `data-status`/`data-dispatched-at`
- [ ] Journey `fixme` steps flipped to real tests and passing — in progress (needs a safe seeded env, not stale prod)
- [x] `e2e.yml` gating PRs to main — `e1de5b7` (first CI run fixed: NODE_ENV scoped to server-start so `npm ci` keeps devDeps)

Open items: (1) **Size-Up parity** — native / Layer 3, Matt's court; (2) **flipping the
record-mutating journeys** — needs a seeded non-prod env; (3) **CI provisioning** — the seeded
`e2e.yml` instance isn't license-activated, so App.jsx stalls at the first-run/`authReady`/
license gate before the shell (`getByTestId('login-username')` times out). The E2E step is
**temporarily non-blocking** (`continue-on-error`) until Matt provisions license activation in
CI, then flip it back. Infra is green (build/seed/browser); the hooks are proven on the live
(provisioned) demo. Everything web-hookable is done and build-verified.

---

## Part A — Router: light hash-sync in `App.jsx` (no react-router)

The app has no URL router; navigation is a `page` state string (`App.jsx:230`), seeded by
`getInitialPage()` (`App.jsx:150`) and driven by `handleNavigate` (`~601`) + the
`{page === '…' && <Component/>}` chain (`674–698`). We make `page` reflect in the URL hash
so pages become deep-linkable and testable — a ~15-line change, no migration.

1. **`getInitialPage()`** — read the hash first:
   ```js
   function getInitialPage() {
     const fromHash = (location.hash.match(/^#\/([\w-]+)/) || [])[1];
     if (fromHash) return fromHash;
     /* …existing fallback logic unchanged… */
   }
   ```
2. **Sync `page` → URL** (add near the other effects):
   ```js
   useEffect(() => {
     const target = `#/${page}`;
     if (location.hash !== target) history.replaceState(null, '', target);
   }, [page]);
   ```
3. **Honor back/forward** (hash/pop):
   ```js
   useEffect(() => {
     const onHash = () => {
       const id = (location.hash.match(/^#\/([\w-]+)/) || [])[1];
       if (id && id !== page && canAccess(user, id)) setPage(id);
     };
     window.addEventListener('hashchange', onHash);
     return () => window.removeEventListener('hashchange', onHash);
   }, [page, user]);
   ```

Result: `page.goto('/#/incidents')` deep-links in Playwright; access guards
(`canAccess`) still apply. A full react-router adoption is a separate, larger change —
**not now**.

---

## Part B — `data-testid` hooks

### Stable surfaces — apply with confidence

| Control | testid | File / anchor |
|---|---|---|
| Login username input | `login-username` | `LoginScreen.jsx` (placeholder `chief · officer · member`, ~L241) |
| Login password input | `login-password` | `LoginScreen.jsx` (~L251) |
| Sign-in button | `login-submit` | `LoginScreen.jsx` submit button |
| Demo quick-login buttons | `login-demo-{role}` | `LoginScreen.jsx` (`doLogin(u,'1234')`) |
| App shell root | `app-shell` | `App.jsx` Layout wrapper (`~668`) |
| Nav item (each) | `` nav-${item.id} `` | `Layout.jsx` — the nav `<button>` rendered from the `{id,label,icon}` arrays (`L34+`). **One edit covers every nav item.** |
| Offline banner | `offline-banner` | `OfflineBanner.jsx` |
| Incident new / save | `incident-new`, `incident-save` | `IncidentLog.jsx` |

### Map at apply-time — Matt's recent prevention/command surfaces (likely in-flux)

These didn't resolve to stable files (they're in Matt's recent call-close / prevention
work — commits `d7b7e7e`, `b7f8964`, `56b2a73`, `daa28d3`, `3e5ce9e`, `a06a903`). Locate
the owning component once his tree lands, then apply the same pattern:

- Command board root → `command-board`
- PAR: start / account per unit / complete → `par-start`, `par-account-{unitId}`, `par-complete`
- Clear call / release unit / disposition → `call-clear`, `unit-release-{unitId}`, `call-disposition`
- Overdue status check → `status-check-{unitId}`
- Inspection result / complete → `inspection-result`, `inspection-complete`
- Cite violation / generate notice → `violation-cite`, `notice-generate`
- Service outcome / returned mail / enforcement-blocked banner → `service-outcome`, `notice-returned-mail`, `enforcement-blocked`
- Size-Up / pre-plan / hydrants → `sizeup`, `sizeup-preplan`, `sizeup-hydrants` — **NOTE: the native app is the primary Size-Up; the PWA versions are parity checks only.**

---

## Part C — expose STATE as attributes (this is the part that catches lies)

Ids alone locate a control; the bugs that shipped were controls **lying about state**. So
on the trust surfaces, expose state as data-attributes a test can assert:

- Save indicator → `data-testid="save-state"` **plus** `data-state="saved|saving|failed"`
  — this is what catches "All changes saved" when storage is dead.
- `sizeup-preplan` / `sizeup-hydrants` → `data-source="device|network"` + `data-age="…"`
  — catches "no signal" rendering as "no building".
- Notice served confirmation → `data-testid="notice-served"` + `data-served="signed|refused|no-party"`.

---

## Part D — after applying

1. Flip the un-blocked journey steps from `test.fixme` → `test`, replacing `TODO(selector)`
   with `getByTestId(...)`; re-run against the seeded env until the golden journeys pass.
2. Add `.github/workflows/e2e.yml` (from the position paper) gating PRs to main.
3. Cross-client parity (Matt's idea) is a **separate layer**, not a Playwright journey —
   it belongs where `syncCore` is tested (same fixture + fault → assert native and PWA land
   the identical DB end-state on reconnect).
