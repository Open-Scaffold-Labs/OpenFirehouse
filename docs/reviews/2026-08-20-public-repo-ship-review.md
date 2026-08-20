# Public-repo ship review — 20 August 2026

Read-and-report review of the public OpenFirehouse tree. Claims were checked
against code, tests, and GitHub Actions — not against docs.

**Scope:** can this repo be handed to a small volunteer or combination
department? No code was changed. No marketing copy was rewritten.

---

## Verdict: **ship with caveats**

A **single department** can self-host (Docker Compose or Vercel + Supabase)
and run real station work: login, first-run setup, incident command, roster,
and a genuine NERIS submit path exist in code.

It is **not yet** the product the README sells to that department:

- Hosted Independent (free, multi-department) is still dark-launched and
  isolated only at the application layer.
- The legal-record path (incident narrative → NFIRS / NERIS) is officer-written
  in runtime code, but public docs still advertise AI-authored narratives.
- Core fireground journeys are not proven in the browser: the E2E gate on
  `main` is red, and the incident / NFIRS / cross-tenant specs are `test.fixme`.
- The documents that would bind a hosted Independent offer
  (`HOSTED-SERVICE-AGREEMENT.md`, `COMMERCIAL-LICENSE.md`,
  `docs/PRICING-CHANGES-FAQ.md`) are linked from the README and **absent**.

Do not put a second department on the same database until tenant isolation
is department-keyed and RLS is actually on.

---

## What is real (verified)

| Claim | Reality |
|---|---|
| React 19 + Vite + Tailwind client | `client/package.json`: React `^19.2.0`, Vite `^7.3.1`, Tailwind `^4.2.1` |
| Express + Postgres / Supabase + Vercel | `server/package.json` (`express`, `pg`); `vercel.json` serverless `/api` + crons |
| AGPL | `LICENSE` is AGPL v3 |
| NERIS V1 Data Exchange Compatible | Real HTTP client, payload builder, approve/submit engine, hourly cron, registry, and `scripts/neris-compat-proofs.js`. CHANGELOG records an FSRI check on 2026-08-03. Not just `server/src/constants/neris/enums.json`. |
| Independent tier free (≤30 / ≤2 / ≤$750K) | `classifyTier()` in `server/src/lib/licensing.js` matches those thresholds. Tier is **stored and advisory**; it never blocks features (`server/src/routes/departments.js`). Self-serve signup is off unless `P4_SIGNUP=on`. |
| JWT + bcrypt + roles | Real. Production refuses to boot without `JWT_SECRET` (`server/src/config/jwtSecret.js`). |
| ~178 lazy-loaded views | **Stale.** `client/src/App.jsx` has 99 `lazy()` imports. |

---

## Findings by severity

### Critical (blocks “hand this to a department” for hosted / shared use)

1. **Postgres RLS is written and not enforced.** Policies exist in
   `db/baseline.sql`. Runtime middleware is a no-op unless `P5_TXN=on`
   (`server/src/middleware/dbTransaction.js:31–32`). Default CI and
   `.env.example` never set the flag. The app connects as the DB owner, which
   bypasses RLS. Isolation is whatever each route remembers to filter.

2. **`routeKit.scoped()` hands handlers `stationId`, and many treat it as
   `department_id`.** Kit comment claims department scoping
   (`server/src/utils/routeKit.js:27–31`) but the value is
   `req.user.stationId` (lines 50–55). Example: `workOrders.js:79–84` queries
   `pm_schedules.department_id = $1` with `[stationId]`. After P4 signup,
   station id ≠ department id (`server/src/routes/auth.js`). Result is empty
   data or, if ids collide, the wrong tenant.

3. **Push-to-main is the documented ship path; the 14-point audit never
   sees it.** `docs/Development-Workflow.md` and
   `.github/workflows/README-deploy.md` say contributors push `main` and
   Vercel auto-deploys. `audit.yml` runs only on `pull_request` to `main`.
   GitHub Actions has **no recorded `audit.yml` runs**. The gate CONTRIBUTING
   advertises does not run on the path that actually ships.

### High

4. **E2E on `main` is failing; the journeys that matter are still
   scaffolding.** Last completed E2E runs on `main` (2026-08-10 and
   2026-08-11) failed at “Run E2E (desktop project)”. The incident lifecycle,
   NFIRS 5.0 schema export, and two-department isolation specs are
   `test.fixme` (`e2e/journeys/01-incident-lifecycle.spec.js:22`,
   `05-nfirs-neris-export.spec.js:19`, `06-tenancy-isolation.spec.js:37`).
   What passes is login/shell, contrast, and permits layout.

5. **SQL-vs-schema gate is reporting-only** after a production-class miss
   (calendar feed returned empty months with HTTP 200).
   `scripts/sql-prepare-gate.js` exits 0 unless `--strict` / `--max N`.
   CI invokes it with neither (`.github/workflows/ci.yml`).

6. **Public docs still teach AI-authored NFIRS narratives.** Runtime code
   forbids this (see Life-safety). README lines 24 and 33, brochure
   (`client/public/brochure.html:114`), and user-guide
   (`docs/user-guide.md:1899`, `1910`) still claim AI drafts / writes / auto-
   generates NFIRS narratives. A chief following the docs will look for a
   feature the legal-record path correctly removed.

7. **Binding hosted-tier documents are missing.** README links
   `HOSTED-SERVICE-AGREEMENT.md`, `COMMERCIAL-LICENSE.md`, and
   `docs/PRICING-CHANGES-FAQ.md`. None of those files exist. ADR-0005 still
   marks the hosted agreement and OEM license as drafts pending counsel.
   `SECURITY.md` links a missing `SECURITY-POSTURE.md`.

8. **Pricing copy disagrees with itself.** README: Career Small $3,000 /
   Career Mid $12,000 / Metro custom. `client/public/signup.html:123–125`:
   $999 / $2,499 / $4,999.

9. **Nightly `db-backup` has been failing** on `main` for every scheduled
   run inspected (2026-08-13 through 2026-08-20). The backup story a
   department would rely on is not green.

### Medium

10. **NFIRS 5.0 export is a best-effort Basic Module flat file**
    (`client/src/utils/nfirsFlatFile.js:10–15`). No automated schema proof;
    the E2E check is `test.fixme`. Usable as a start; not “take this to the
    state” without a first successful state import.

11. **Client unit tests (128) never run in CI.** `.github/workflows/ci.yml`
    runs server tests, `lint:undef`, and the client *build*. Zero React
    component tests exist.

12. **Full client lint is ~595 issues and is not a gate** (only `no-undef`).
    Documented in `client/eslint.undef.config.js` and `ci.yml`.

13. **`GET /api/admin/db-audit`** (`server/src/routes/dbAudit.js:54–72`)
    lets any `chief` `COUNT(*)` every listed table with no department filter.

14. **ARCHITECTURE.md is stale on tenancy** (lines 112–122): still describes
    station-only isolation and “RLS not yet implemented.” Both are wrong
    relative to `db/baseline.sql` + `of_user_departments`.

15. **Independent / signup path is honor-system and dark.** `P4_SIGNUP`
    defaults off. Size attestation never enforces.

### Low / residual

16. Demo mode (`SEED_DEMO` / `OPENFIREHOUSE_DEMO`) uses password `1234` and
    skips the auth rate limiter. Fine for the public demo; fatal if left on
    a real department deploy.
17. `cad_enrich_incident` has no `forbiddenResultKeys`
    (`server/src/utils/aiActionRegistry.js:804`). Unused today; wiring it
    would reopen the narrative hole the other action closed.
18. NG911 “create incident” copies the 911 call text into `incidents.notes`
    (`server/src/routes/ng911.js:150–155`). Not AI, but it is machine text
    landing in the field NERIS reads as the officer narrative.
19. `docs/Development-Workflow.md:109` says `npm run dev` does not exist.
    Root `package.json` defines it.
20. Historical honesty in `ci.yml`: the pipeline was red for 207 runs /
    218 commits with tests and gates skipped. Current CI on `main` is green
    (last success 2026-08-11); that history is why several gates are still
    toothless.

---

## Life-safety check

CONTRIBUTING states two non-negotiables. Runtime code was checked, not the
comments.

### A — AI never authors the legal record — **held in code, contradicted in docs**

Enforced, not just prompted:

- `ai_log_incident` declares `forbiddenResultKeys` including `notes` and
  `narrativeStatement` (`server/src/utils/aiActionRegistry.js:38`).
- `server/src/routes/aiAction.js` strips those keys centrally.
- `IncidentForm.jsx` no longer reads `aiPrefill.notes`.
- Narrative draft endpoints were removed.
- `server/src/tests/aiNarrativeGuard.test.js` fails if the declaration is
  deleted.
- NERIS payload copies officer `incidents.notes` verbatim
  (`server/src/utils/nerisPayload.js`).

No active path was found that generates and persists AI prose into
`incidents.notes` / NFIRS / NERIS. The remaining holes are unused
(`cad_enrich_incident`) and NG911 call-text copy (above). The **docs**
still advertise the removed feature.

### B — Unit status never flips automatically — **held for clear/release; not absolute**

Clear/release matches the rule:

- Live Dispatch clear modal requires a dispatcher-confirmed release
  (`client/src/components/LiveDispatch.jsx:163–170`).
- `POST /api/cad/alerts/:id/clear` does not touch units unless
  `releaseUnits` is explicit (`server/src/routes/cad.js`).
- CAD close webhook closes the call only (`server/src/cad/pipeline.js`
  `processClose`).
- AVL is location-only. PAR prompts; it does not auto-run.

Automatic status writes still exist, by design:

- `autoDispatchUnits` sets matched apparatus to `dispatched` with
  `userId: null` on CAD ingest (`server/src/cad/pipeline.js:32–52`).
- `processStatusUpdate` applies CAD status words (including
  available/clear → `in_service`) through `unitStatus.set` with
  `userId: null` (same file, ~316–322).

That is framed as “dispatcher CAD keystroke, relayed.” CONTRIBUTING’s
wording is absolute and does not mention the exception. Not a silent
clear-call bug; it is doctrine drift. A CAD feed that sends `available`
will release a unit without the Live Dispatch modal.

**No surgical code fix in this PR.** The unused `cad_enrich_incident`
gap and the CAD-relay exception need a product decision, not a one-line
guess.

---

## Security / auth / tenant isolation

**Auth (solid for a single department).** Bearer JWT, user re-loaded from
DB on every request, MFA challenge tokens blocked from normal routes,
NULL station / department fail closed, bcrypt, role ladder
(member / officer / chief / admin). First-run bootstrap is public until
any user exists, then 409.

**Tenant isolation (not ready for shared hosting).**

| Layer | Status |
|---|---|
| App-layer `department_id` filters | Strong on newer routes (`incidents.js`). Inconsistent on `scoped()` routes. |
| Static `tenancyGuard.test.js` | Real; forbids `station_id = 1` and client-supplied tenant ids. |
| Live two-tenant HTTP suite | Real when `TENANCY_TEST_DB` is set (CI does set it). Models **station A vs station B**, not provisioned departments with split ids. 27 API families. |
| Postgres RLS | Schema yes; runtime off. |
| Browser E2E cross-tenant | `test.fixme`. |
| Identity tables under `of_app` | `app_full_access` USING (true) in baseline — if P5 is flipped on without tightening these, users/departments/stations are globally readable. |

Single-station installs where `department_id` still equals `station_id`
are the only topology the current tests actually prove.

---

## Test + CI reality

| Gate | Enforced? | Notes |
|---|---|---|
| Server `node:test` (~849 tests; ~103 DB-gated) | Yes, every push | Postgres 17 + `db/baseline.sql` + migrations > `0071` + `db/ci-seed.sql` |
| Two-tenant isolation (server) | Yes in CI | Station-scoped, not full P4 department-scoped |
| Client unit tests (128) | **No** | Not invoked in any workflow |
| Client/server `lint:undef` | Yes | Only `no-undef`; full lint excluded |
| Client build | Yes | |
| SQL prepare gate | Report only | |
| E2E Playwright | Intended on `main` / PRs | Last completed `main` runs **failed**; 11 core tests are `fixme` |
| 14-point audit | PR-only; needs `OSL_ECOSYSTEM_TOKEN` to clone private `openscaffold-core` | **No runs on record.** Push-to-main skips it. |
| Nightly db-backup | Scheduled | **Failing** |

Frameworks: server and client use Node’s built-in test runner. E2E is
Playwright. No Jest/Vitest in the ship path.

`db/baseline.sql` header says it was dumped from Homebrew Postgres 16.13;
CI comments say prod is 17.6. Content was prod-faithful at migration 0071;
provenance is not a live prod dump.

---

## Highest-leverage next fixes (3–5)

1. **Make the real ship path match the gates.** Require PRs to `main` (or
   run `audit.yml` + E2E on every push that can deploy). Get E2E green
   before calling `main` production-ready. Unblock or retire the failing
   nightly backup.

2. **Ratchet the SQL prepare gate.** Start with `--max N` at today’s
   failure count, then `--strict`. This is the cheapest fence against
   another empty-200 production outage.

3. **Stop treating `stationId` as `department_id`.** Change
   `routeKit.scoped()` to pass `department_id`, migrate callers, and
   extend `tenancyIsolation.test.js` to a P4-provisioned pair (station id
   ≠ department id). Then turn `P5_TXN=on` in CI (as `of_app`) before
   production.

4. **Replace the three `test.fixme` operational journeys** — incident
   lifecycle, NFIRS 5.0 file validation, two-department browser isolation —
   and add `npm test --workspace=client` to `ci.yml`.

5. **Align the public record with the code** (separate docs PR; not this
   one): remove “AI drafts NFIRS narratives” from README / brochure /
   user-guide; write down the CAD-relay exception in CONTRIBUTING; restore
   or stop linking the hosted-service, OEM, and pricing documents; pick
   one price table.

---

## Bottom line for a volunteer / combination department

**Self-host one department, with someone who can read Vercel logs and a
Postgres backup:** yes, with the caveats above. Treat NFIRS export as
unverified until the state program accepts a file. Do not enable demo
mode. Do not put two departments on one instance.

**Offer the advertised Independent hosted product (free, signup, shared
tenancy, binding pledge):** not yet. The isolation, the legal docs, the
browser proof, and the deploy discipline are the blockers — not missing
modules.
