# ADR-0004 — bug_reports tenant privacy (chief sees own dept; vendor sees all)

**Status:** Accepted + implemented · **Date:** 2026-06-19 · **Owners:** Matt + Dale (security surface)

## Context

The in-app "report a bug" feature stores rows in `bug_reports`. The chief-facing read
(`GET /api/debug-agent/reports`) ran `SELECT … FROM bug_reports` with **no department
filter**, and the self-heal action (`POST /api/debug-agent/dispatch`) fetched any report
by id — so **any chief could read or act on every department's bug reports**, across all
customers. That's a real multi-tenant privacy gap. It was originally global so the
OpenFirehouse team (vendor) could triage all reports — a legitimate need, but it shouldn't
be exposed to every customer chief.

`bug_reports` has no `department_id` column; the canonical user→department mapping is
`of_user_departments`.

## Decision

Two needs, both satisfied:

1. **A regular chief sees/acts on ONLY their own department's reports.** Reads join
   `of_user_departments` to scope by the caller's `department_id`; `/dispatch` verifies the
   target report's owner is mapped to the caller's department (404 — not 403 — so other
   departments' ids aren't enumerable).
2. **Vendor/platform admins (the OpenFirehouse team) see ALL departments** for support.
   Identified by a **config allowlist** `VENDOR_ADMIN_EMAILS` (comma-separated), checked
   against the caller's `users.email`. **No emails committed to the repo. Fail-closed:** if
   the env var is unset, nobody is a vendor admin and everyone is department-scoped.

Implementation: `server/src/routes/debugAgent.js` — `isVendorAdmin(req)` helper + scoped
`GET /reports` and `POST /dispatch`.

## Why no RLS on bug_reports

`bug_reports` stays a DB-global table (no `dept_isolation` policy) precisely because the
vendor needs cross-department reads. Isolation is enforced at the **app layer** (the scoped
queries above) — consistent with OF's app-layer dept-scoping being a primary control, and
with `bug_reports` already being a deliberate global table. Adding `dept_isolation` RLS
would block the vendor view; if stronger DB-level enforcement is ever wanted, the path is a
`department_id` column on `bug_reports` (stamped at insert + backfilled) with a policy that
carves out a vendor role — a future hardening, not required for this fix.

## Ops (Matt/Dale)

- Set **`VENDOR_ADMIN_EMAILS`** in Vercel to the team's login emails (comma-separated). Until
  then, *every* chief — including the team — is department-scoped (safe default; the team
  just won't see cross-dept until it's set).

## Verification

Local isolation test (this session): a user mapped only to dept 2 with a bug report →
dept-2 scope **includes** it, dept-1 scope **excludes** it. Full server suite green
(192 tests, 190 pass, 0 fail, 2 skipped). No schema change; works on existing prod data
immediately (no migration dependency).

## Consequences

- **Positive:** closes the cross-tenant leak now, no migration, vendor support preserved.
- **Cost:** vendor identity is config-driven (must set the env var); a future `department_id`
  column would allow DB-level enforcement if desired.
