# HANDOFF — Prevention Core: Phases 0–2 SHIPPED, pick up at Phase 3 (web UI)

**Written:** 2026-07-12, end of session. **For:** the next session.
**Status:** Phases 0, 1, 2 (incl. 2.3) built, e2e-verified, applied to prod, committed, pushed, wiki'd. Phase 3 is next and is UI work — it deserves a fresh session's full context.

---

## 0. READ THIS FIRST — the operating truths

1. **Matt is a working NJ fire inspector and a captain. He is the domain expert.** When his lived experience conflicts with research or your assumptions, he is right. He has corrected sessions before (the "Abated" fiasco; rank-based gates). Say plainly what changed and what didn't; if you didn't touch something, say so and prove it with git.
2. **The mission is NATIONAL, not NJ.** Matt's explicit direction: "we are trying to become the biggest name in life-safety apps worldwide." The module follows the INCUMBENT-SHAPED CORE (the leading fire-prevention platforms' workflow), jurisdiction-neutral. NJ anything is deferred — it's a future test case, never a design input. Research verdicts backing this live in the session outputs (FI-INCUMBENT-PARITY-AND-VERDICT.md) and wiki.
3. **The bar we set (Matt's words): function, usability, adaptability, security, flawless design. Speed is NOT a priority; getting it right is.** Think of everything that could go wrong and prevent it in the design.

## 1. THE MINDSET — how this work has been done (keep it exactly)

- **Research before build.** Parallel agents over live web sources before betting on any design; adversarial agents pointed at our own theses (that's how the "jurisdiction engine" got correctly killed). Never answer from memory.
- **Plan → Matt gates → build → verify → ship.** Each phase greenlit by Matt. Once greenlit: work autonomously, but the pattern for state changes is established — migrations applied to prod via Supabase MCP after local rehearsal + suite green; commits pushed with full evidence in the message. If something NEW and destructive comes up, stop and ask.
- **audit-before-claim on everything.** Every factual claim carries session evidence (file:line, command output, SQL result). Unverified → verify now, hedge explicitly, or drop. Bad news leads, never buried (the fresh-install bug, the concurrent-session test failures, the CTE bug in my own code — all reported plainly).
- **Verify end-to-end over real HTTP.** Every phase has opt-in e2e suites (TENANCY_TEST_DB harness, boots the real app): fiLifecycleE2E, fiPreventionConfig, fiWorkflowEngine, fiNotices. The e2e suites have caught real bugs the unit tests couldn't (CTE same-snapshot 23505; PDFKit hex-run encoding). Run:
  `cd server && TENANCY_TEST_DB='postgresql://matthewlavin@localhost:5432/freestation' npm test`
- **Concurrent-session discipline (BIT US REPEATEDLY — 3+ collisions today):** another Claude session works these repos simultaneously (unit-status/CAD surfaces). Before ANY edit: `git status --short`. NEVER stage a file carrying their hunks (db.js especially — check `git diff <file>` first). Migration numbers RACE: check `ls docs/migrations/` AND the prod `of_schema_migrations` ledger immediately before numbering (0046 and 0048 were both taken mid-build; we became 0047/0049). Their uncommitted WIP also fails THEIR tests in full-suite runs — attribute before assuming it's yours (stash-baseline test if needed). Their committed migrations may not be applied to the LOCAL dev DB — apply them if the suite breaks on missing columns (happened with 0044 and 0046-status-timers).
- **Session wrap, every session:** CHANGELOG.md (public, user-facing prose) · private wiki (`apps/openfirehouse.md` What+Why, `log.md`, `my-tasks/mlav1114.md`) committed+pushed · `notebooklm-wiki-refresh.py --only openfirehouse` (verify_failed must be 0; fix = delete-by-title + re-add, NEVER --force) · CHANGELOG source in notebook 9c8f delete+re-add when it changed. Roll Call at session start.

## 2. NON-NEGOTIABLE DOCTRINES (all already enforced in code — don't regress)

- **Inspection records are LEGAL records:** soft-delete only, append-only audit_log on every mutation (status transitions logged from→to), RESTRICT FKs, server-authoritative timestamps, notices append-only (regeneration adds, never alters).
- **AI never writes the record.** Violation descriptions, notice wording = inspector/department-authored. We ship SAMPLE legal text flagged "[review with your AHJ]" — never authoritative legalese, never blank.
- **Fail-open status:** unknown violation status = Open, NEVER silently resolved. `status_raw` preserves the inspector's original word forever (first raw wins).
- **No copyrighted code text in the repo** (licensing research: Tier A only — section numbers + paraphrased titles + deep links; dept-entered text stays in their tenant).
- **Dept-scoped everything:** department_id + leading index + dept_isolation RLS on every new table (copy the exact policy SQL from 0047/0049/0050), routeKit `scoped()` fail-closed, zod validation, unified errors.
- **Date doctrine:** the server NEVER derives "today" — clients supply the inspector's local day; server does pure calendar math via `utils/localDate.js` (DST/leap-proof, unit-tested). No `toISOString()` date-math anywhere in this module.
- **Permissions are DESIGNATION-based, not rank-based** (Matt: bureaus are separate entities; inspectors can be any rank incl. non-active). fi_designations + fiAuth middleware + the two incumbent toggles (allow_crew_inspections, admin_only_commit).
- **Retire-don't-delete** for config in use. **Photos key on stable violation ids** (pre-0045 = position-string ids; NEVER re-key, never use render index).
- **No competitor names in any artifact** (repos, docs, commits). Standards/agencies OK (NFPA, ICC, IFC, NERIS, state fire marshals).

## 3. WHAT SHIPPED TODAY (all on OpenFirehouse-private main, all prod-applied)

| Commit | What | Migration |
|---|---|---|
| `bca56b4` | P0: soft-delete + audit trail + stable violation ids + canonicalize-on-read (+ mobile `f7e149d`) | 0045 |
| `722395e` | P1: data model v2 — fi_violations (date ladder, mirror-sync at route chokepoint), fi_code_library, fi_inspection_types, fi_checklists(+items), fi_notices, fi_signatures + CRUD routes + seeds | 0047 |
| `41a5558` | P1 follow-up: db.js fresh-install mirror for 0047 (verified on scratch DB) | — |
| `daa28d3` | P2: workflow engine — POST /:id/complete (reinspection w/ lineage, next-cycle spawn w/ dedupe), answers snapshots, fi_designations, fi_settings, fiAuth, localDate | 0049 |
| `69ef9a6` | P2.3: notice PDF — fiNoticePdf (PDFKit), fiNotices routes (generate/list/stream, dormant Resend email), dept legal-text blocks in fi_settings | 0050 |

**Phase-1 authority model (important for Phase 3):** `fi_inspections.violations` (JSON array) is still the API contract — clients unchanged so far. `fi_violations` rows are an exactly-synced queryable mirror (utils/fiViolationSync.js, upsert+prune). **Phase 2 was supposed to flip authority to the rows — it did NOT (deliberate: zero client changes while the engine landed). The flip is now a Phase 3/4 decision — flip when the new UI ships, or keep the mirror. Surface this to Matt when Phase 3 starts.**

**Key files:** server routes `fiInspections/fiProperties/fiPermits/fiCodeLibrary/fiInspectionTypes/fiChecklists/fiWorkflow/fiNotices/fiDesignations/fiSettings/fiInspectionPhotos.js` · `middleware/fiAuth.js` · `utils/{fiViolationSync,localDate,fiNoticePdf,auditLog}.js` · `constants/violationStatus.js` · web `client/src/components/FireInspections.jsx` + `FireInspectionForm.jsx` (the OLD UI, still live) + `data/fireInspections.js` · mobile `src/app/(tabs)/tools/inspections.tsx`, `constants/violations.ts`, `lib/violationPhotos.ts`.

## 4. PHASE 3 — what to build (web UI; get Matt's go on the spec first)

Per the gameplan (outputs/FI-PREVENTION-CORE-GAMEPLAN.md) + the incumbent workflow research — the 10 polished moments to match and 5 struggle-points to beat are enumerated in FI-INCUMBENT-PARITY-AND-VERDICT.md §2:

- **3.1** My Inspections queue (assigned/due, one-tap start) + Scheduling admin (types+frequencies UI, batch-schedule wizard, per-inspector workload).
- **3.2** The inspection runner: property dossier header (history/open violations/permits/pre-plan — data exists), checklist runner (Yes/No/NA + counters + search, wired to fi_checklists + answers API), violation dialog (note+photos+pre-bound code from fi_code_library — kill the hardcoded client array), completion summary → the /complete engine (reinspection toggle defaulted ON + pre-computed date), signature capture (canvas → fi_signatures), notice PDF view/email/print (APIs all live).
- **3.3** Search/reporting + violation-aging dashboard (fi_violations rows exist precisely for this).
- **Settings UI:** designations management, the two toggles, the six notice legal-text blocks (flag sample text "review with your AHJ").
- **Gates per screen (Matt's explicit ask):** design-critique + accessibility-review skills BEFORE calling a screen done; screenshots to Matt; empty-states with personality; visibility-aware polling; no console errors; client build green.
- Phase 4 after: iPad-first mobile field flow (mini + 13" first, airplane-mode round-trip test). Phase 5 (permits/fees) and Phase 6 differentiators stay parked.

## 5. OPEN ITEMS / KNOWN ISSUES (also in wiki/my-tasks/mlav1114.md)

- ✅ **Fresh-install initDb bug — DIAGNOSED AND FIXED (`e9abaec`, late 2026-07-12).** Root cause proven statement-by-statement: `idx_members_crew ON members(department_id,…)` (added 2026-06-18, `7048970`) sat inside the atomic swallow-all ALTER batch, but `department_id` only exists after `applyDepartmentExpand` — so on fresh DBs the whole batch silently rolled back and the hardening pass died on `members.station_id`. Matt gated the fix on intent-verification first: the batch + swallow ARE intentional (documented perf design — preserved); only the one statement was relocated, plus the hardening loop now warns-and-continues on 42703. Fresh install verified end-to-end on a scratch DB; suite 307/0; zero behavior change on existing DBs. Lesson for this handoff: when you find a "bug" in old code, verify design intent (comments + git archaeology) before changing it.
- **db.js fresh-install mirror for 0049+0050** pending (db.js repeatedly held by the concurrent session; live DBs fine via migrations). Same pattern as the 0047 mirror commit `41a5558` — copy it.
- **UTC "today" 48-component sweep** — platform-wide, still Matt's sequencing call (one call site fixed in inspections; localDate.js is the tool).
- **Old mobile builds** key new-violation photos by index until an app update ships (harmless at current data volume).
- **RESEND_API_KEY** unset platform-wide → notice email is dormant (explicit skip message; Matt+Dale ops item).
- **NJ pack / Matt's DCA form** — deferred by Matt's national-first call; revisit only when he raises it.

## 6. RESEARCH ARTIFACTS (session outputs folder, not committed)

FI-JURISDICTION-RESEARCH.md (jurisdiction/licensing research; partly superseded) · FI-INCUMBENT-PARITY-AND-VERDICT.md (the parity checklist + verdicts — **the Phase 3 spec source**) · FI-PREVENTION-CORE-GAMEPLAN.md (the master plan, risk register, checklist, audit record). If the outputs folder is gone, the substance is summarized in wiki/apps/openfirehouse.md entries dated 2026-07-12.

## 7. TONE

Matt is motivated and trusts this process — repay it with precision. Lead with what shipped and what's verified; flag what isn't with the exact reason; never soften a failure into "mostly done." When he pushes back, he's usually seeing something real — today his pushbacks killed a bad architecture (NJ-first), fixed the permission model (rank→designation), and forced the e2e test that found two real bugs. Lock in.
