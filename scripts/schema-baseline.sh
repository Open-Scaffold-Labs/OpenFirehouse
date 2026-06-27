#!/usr/bin/env bash
# ============================================================================
# scripts/schema-baseline.sh — generate / scrub / verify the committed schema
# baseline (Option A: one structure-only baseline that CI, fresh-install, and
# DR all rebuild from). See docs/INSTALL.md and the Schema-Baseline plan.
#
#   ./scripts/schema-baseline.sh generate "$PROD_DATABASE_URL"
#   ./scripts/schema-baseline.sh scrub
#   ./scripts/schema-baseline.sh verify          # loads db/baseline.sql into a
#                                                # throwaway DB + runs the suite
#
# WHY: db.js initDb() builds only ~98 of ~122 tables and none of the of_*
# SECURITY DEFINER functions; the 31 migrations don't replay cleanly onto an
# empty DB. So nothing rebuilds prod from scratch — CI is red, dev branches come
# up empty, and a fresh self-host clone is broken. The baseline fixes all three.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."           # repo root
BASELINE="db/baseline.sql"
PROJECT_REF="${PROJECT_REF:-YOUR_PROJECT_REF}"   # set PROJECT_REF=<ref> in your shell; never hardcode prod here

die(){ echo "ERROR: $*" >&2; exit 1; }

cmd_generate() {
  local url="${1:-}"
  [ -n "$url" ] || die "usage: generate <PROD_DATABASE_URL>  (use the SESSION pooler :5432, not the txn pooler :6543)"
  # pg_dump must be >= the prod server major (prod is Postgres 17) or it refuses.
  local maj; maj="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
  [ "$maj" -ge 17 ] || die "pg_dump is v$maj; prod is Postgres 17 — install postgresql@17 (brew install postgresql@17) or use 'supabase db dump'."
  mkdir -p db
  echo ">> dumping schema (structure only, public schema, no data) -> $BASELINE"
  pg_dump --schema-only --schema=public --no-owner --no-privileges --no-comments \
    "$url" > "$BASELINE"
  grep -qE '^(COPY |INSERT INTO )' "$BASELINE" && die "baseline unexpectedly contains DATA rows — aborting (privacy)."
  echo ">> generated: $(grep -c '^CREATE TABLE' "$BASELINE") tables, \
$(grep -cE '^CREATE (OR REPLACE )?FUNCTION' "$BASELINE") functions, \
$(grep -c 'CREATE POLICY' "$BASELINE") policies, 0 data rows."
  cmd_scrub
}

cmd_scrub() {
  [ -f "$BASELINE" ] || die "$BASELINE not found — run generate first."
  echo ">> scrubbing $BASELINE (genericize prod identifiers for the soon-public repo)"
  # Genericize the prod project ref (and add org/stripe ids here if they ever appear).
  sed -i.bak "s/${PROJECT_REF}/YOUR_PROJECT_REF/g" "$BASELINE" && rm -f "${BASELINE}.bak"
  # Hard fail if any real-secret patterns survive.
  if grep -nEi "${PROJECT_REF}|sk_live|sk_test_[0-9A-Za-z]|sk-ant-|acct_[0-9A-Za-z]|eyJhbGciOi|BEGIN (RSA |EC )?PRIVATE KEY" "$BASELINE"; then
    die "secret-like content found in baseline (above) — review before committing."
  fi
  if command -v gitleaks >/dev/null 2>&1; then
    echo ">> gitleaks scan"
    gitleaks detect --no-git --source "$BASELINE" $( [ -f .gitleaks.toml ] && echo "-c .gitleaks.toml" ) || die "gitleaks flagged the baseline."
  else
    echo ">> gitleaks not installed — pattern scan passed; run gitleaks before committing to a public repo."
  fi
  echo ">> scrub clean."
}

cmd_verify() {
  [ -f "$BASELINE" ] || die "$BASELINE not found — run generate first."
  local db="of_baseline_verify_$$"
  echo ">> creating throwaway DB $db and loading the baseline"
  createdb "$db"
  trap 'dropdb --if-exists "'"$db"'" >/dev/null 2>&1 || true' EXIT
  psql -q -v ON_ERROR_STOP=0 "$db" -f "$BASELINE" >/tmp/baseline_load.$$ 2>&1
  local errs; errs="$(grep -c 'ERROR' /tmp/baseline_load.$$ || true)"
  echo "   load completed (benign 'schema public already exists' aside; ERROR lines: $errs)"
  echo "   objects: $(psql "$db" -tAc "select count(*) from information_schema.tables where table_schema='public'") tables, \
$(psql "$db" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'of_%'") of_* fns"
  # Trip-wire: every serial column's sequence must resolve via pg_get_serial_sequence
  # (its ALTER SEQUENCE ... OWNED BY must be present). A baseline missing these
  # silently no-ops sequence reconciliation and breaks the FIRST self-serve signup
  # (departments_pkey collision). pg_dump emits OWNED BY even with --no-owner; a
  # catalog-extracted baseline must append them. This check is the guard.
  local unowned
  unowned="$(psql "$db" -tAc "select count(*) from information_schema.columns c where c.table_schema='public' and c.column_default like 'nextval(%' and pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) is null")"
  [ "$unowned" = "0" ] || die "$unowned serial column(s) lack OWNED BY (pg_get_serial_sequence NULL) — baseline is missing ALTER SEQUENCE ... OWNED BY; signup sequence reconciliation will silently fail."
  echo "   sequence ownership: all $(psql "$db" -tAc "select count(*) from information_schema.columns where table_schema='public' and column_default like 'nextval(%'") serial columns resolve via pg_get_serial_sequence ✓"
  echo ">> running the server suite against the baseline-loaded DB"
  TENANCY_TEST_DB="postgresql://$(whoami)@localhost:5432/$db" JWT_SECRET=ci-throwaway NODE_ENV=test \
    npm test --workspace=server 2>&1 | grep -E "ℹ (tests|pass|fail|skipped)|does not exist" | tail -8
  echo ">> NOTE: the baseline + initDb's background seeds + the reconcileSequences()"
  echo "   pass should leave the suite fully green; tests own their station fixtures."
}

case "${1:-}" in
  generate) shift; cmd_generate "$@";;
  scrub)    cmd_scrub;;
  verify)   cmd_verify;;
  *) echo "usage: $0 {generate <PROD_DATABASE_URL>|scrub|verify}"; exit 2;;
esac
