# Schema Baseline — reproducible installs, CI, and DR

> **Status:** Option A of the schema-reproducibility plan. The committed
> baseline file (`db/baseline.sql`) is generated from prod by whoever has prod
> access (see §1); the tooling, CI wiring, and this doc are in place.

## Why this exists

`db.js` `initDb()` builds only the base ~98 of ~122 tables and **none** of the
`of_*` SECURITY DEFINER functions or RLS that migrations 0012+ added; the 31
migration files do **not** replay cleanly onto an empty database (≈5 fail on
ordering/dependency: `0004` s.dept_type, `0019` activity_entries,
`0021/0027/0028` department_id). So nothing rebuilds prod from scratch — which
is why CI was red, why Supabase dev branches come up empty, and why a fresh
self-host clone would be missing provisioning, invites, RLS, AVL, etc.

**The fix:** one committed, structure-only baseline that CI, fresh-install, and
DR all rebuild from. The database schema becomes a versioned artifact;
`initDb()` stops building schema piecemeal and only runs idempotent seeds.

## What the baseline is

`db/baseline.sql` = `pg_dump --schema-only --schema=public --no-owner
--no-privileges` of prod. **Structure only — zero rows** (no department/PHI data
ever enters the repo). It creates every table, function, trigger, index, and RLS
policy. `--no-owner --no-privileges` keeps it portable: it carries **no** roles
or grants, so it loads cleanly into any Postgres (CI's `of_ci`, a self-hoster's
role). The role/grant model + the anon lockdown (migration **0031**) are a
**separate, explicit step** — not baked into the public baseline.

Today every RLS policy in prod is `TO public`, so the baseline references no
`of_app` role and loads with no role pre-creation. (Once 0031's `of_app`-scoped
policies land, keep them in the separate role/RLS step, or pre-create an `of_app`
stub before loading.)

## 1. Generate it (needs prod access + pg_dump ≥ 17)

```bash
./scripts/schema-baseline.sh generate "$PROD_DATABASE_URL"   # session pooler :5432
```

The script refuses if `pg_dump` is older than the prod server major (17), aborts
if any data rows slipped in, then auto-runs the scrub. Equivalent raw command:

```bash
pg_dump --schema-only --schema=public --no-owner --no-privileges --no-comments \
  "$PROD_DATABASE_URL" > db/baseline.sql
```

> No pg17 locally? `brew install postgresql@17`, or use the Supabase CLI
> (`supabase db dump --schema public -f db/baseline.sql`), which bundles a
> matching dumper.

## 2. Scrub it (before committing to a soon-public repo)

```bash
./scripts/schema-baseline.sh scrub
```

Genericizes the prod project ref (your `<project-ref>` → `YOUR_PROJECT_REF`),
hard-fails on any surviving secret-like pattern, and runs **gitleaks** (with
`.gitleaks.toml`) when installed. Also eyeball the SECURITY DEFINER function
bodies in the dump for any embedded internal references.

## 3. Verify it reproduces

```bash
./scripts/schema-baseline.sh verify
```

Loads the baseline into a throwaway DB and runs the server suite against it.
**Validated** with a schema-complete stand-in: loading the baseline takes the
suite from ~12 schema failures (fresh `initDb`) to **148/151 pass**. The one
remaining failure is `tenancyIsolation`, which fails only because a schema-only
DB has no `station 1` seed row — closed by the bootstrap/seed step in §5, not a
schema gap.

## 4. CI uses it

`.github/workflows/ci.yml` loads `db/baseline.sql` into the `of_tenancy_ci`
service DB **before** the server tests, so CI tests the real schema (and thereby
proves the fresh-install path) instead of `initDb`'s partial bootstrap. The step
no-ops with a warning until `db/baseline.sql` is committed.

## 5. Fresh install + DR use the same baseline

- **Fresh install:** create an empty DB → load `db/baseline.sql` → `initDb()`
  runs only the **idempotent reference seeds** (ERG 2024 hazmat + NFPA courses)
  and the **bootstrap chief** → apply any migrations newer than the baseline.
  *(This requires the small `db.js` change so `initDb` seeds-after-baseline
  instead of fast-path-skipping when the schema already exists — the DB-surface
  step.)*
- **DR restore:** load the same `db/baseline.sql` → restore a data backup → apply
  migrations newer than the baseline → re-apply the role/grant + 0031 step.

## Regeneration policy

Regenerate and re-commit `db/baseline.sql` whenever a schema-changing migration
is applied to prod, so the baseline tracks prod HEAD and "newer than baseline"
stays a small set. Once the migrations are clean enough to replay, CI can also
assert the baseline matches `initDb + migrations` — at which point you can
graduate to **Option C** (migrations become the source of truth; the baseline
becomes a generated artifact).

## Division of labor

- **Prod-access owner (Dale/Matt):** run §1 generate (needs prod creds + pg17);
  the `db.js` fresh-install/seed rewire (§5); commit `db/baseline.sql`.
- **Done (this change):** `scripts/schema-baseline.sh` (generate/scrub/verify),
  the `ci.yml` baseline-load step, this doc, and the validation above.
