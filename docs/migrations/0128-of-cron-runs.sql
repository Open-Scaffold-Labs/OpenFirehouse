-- 0128-of-cron-runs.sql
-- X-PHASE cron liveness — the platform-job INVOCATION ledger.
--
-- NUMBERING (F4): claimed by an empty stub, PUSHED as 2b5dc50, before any SQL was written.
-- Head verified TWO ways on 2026-08-06 — `ls docs/migrations/` -> 0127, and a live query of the
-- prod of_schema_migrations ledger -> 0127-cad-ingest-review.sql (115 rows). Never from CLAUDE.md.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE DEFECT
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- OpenFirehouse runs FIVE Vercel crons and NOTHING NOTICES IF ONE STOPS FIRING. Every way a
-- cron goes quiet produces SILENCE inside our process, so on-error alerting is structurally
-- blind to all of them (verified against our own code, not argued in the abstract):
--   1. utils/cronAuth.js gates every /api/cron/* path on a CRON_SECRET bearer. A rotated or
--      unset secret means the invocation is refused BEFORE any handler runs — no exception is
--      thrown inside our code, so there is nothing for an error path to report.
--   2. The schedules live in vercel.json. A merge that drops or renames a line removes the
--      invocation entirely, and nothing in the app notices its own absence.
--   3. maxDuration against a growing table and the max:1 pool: the job starts, times out,
--      does partial work, and completes never.
-- ABSENCE OF SUCCESS is the only signal that catches all three. That is what this table is.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- WHY A SECOND TABLE AND NOT A WIDER fi_job_runs — the question was asked, and answered by
-- reading 0095's header rather than by preference
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 0095 created `fi_job_runs` for the permit-expiry job and its columns are DOMAIN columns, on
-- purpose — its own header has a section titled "WHY THE COUNTS ARE COLUMNS AND NOT A JSON
-- BLOB", because `skipped_no_terms` must be queryable. It is also `department_id NOT NULL`
-- with dept_isolation, because the expiry ladder is evaluated per department.
--
-- Neither fits the other four crons. `evaluated_for DATE NOT NULL` is meaningless for the
-- Stripe reconciler; and `reconcile` has NO DEPARTMENT AT ALL — `licenses` is a global table.
-- Widening fi_job_runs would mean relaxing a NOT NULL that exists for a reason and inventing a
-- tenant for a global job. Both are worse than a second object.
--
-- So the two tables answer two different questions and stay single-purpose:
--   fi_job_runs   → "what did the expiry ladder DO to this department's permits"  (domain)
--   of_cron_runs  → "did this scheduled invocation HAPPEN at all"                 (liveness)
-- The DOCTRINE is shared verbatim and is 0095's, cited here so it is not re-derived:
--
--   🔴 ONE ROW PER RUN, WRITTEN AT THE END. A run that dies mid-flight leaves NO ROW AT ALL.
--   That is not a gap in the ledger — it IS the signal. The obvious insert-at-start /
--   update-at-finish shape buys a "running" state at the price of a ledger whose rows can be
--   rewritten after the fact, and a rewritable ledger cannot answer the only question it
--   exists to answer.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- TENANCY: GLOBAL, AND SAID SO EXPLICITLY RATHER THAN BY OMISSION
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- These are PLATFORM jobs, not tenant records. There is deliberately no `department_id`:
-- `reconcile` genuinely has none, and a nullable tenant key is invisible to of_app under a
-- dept_isolation policy (`NULL = <guc>` is NULL, never true — the 0115 lesson).
--
-- RLS is nevertheless ENABLED, with an explicit permissive `global_read` policy — the exact
-- shape `stations` uses for `bootstrap_read`. A global table with RLS simply switched OFF is
-- indistinguishable, to any future audit, from a tenant table somebody forgot. This way the
-- globalness is a NAMED POLICY an auditor can read, not an absence they have to interpret.
--
-- 🔴 CONSEQUENCE THAT BINDS THE CALL SITES: because any department's chief can read this
-- table, `summary` MUST carry TOTALS ONLY and never per-department detail. A count of
-- departments swept is fine; naming them is a cross-tenant leak through a global table.
-- Enforced by a CHECK on payload size and by convention at every writer; asserted in tests.
--
-- RETENTION: this one IS prunable, unlike the CAD receipt log. It holds no records of legal
-- consequence — only "a job ran at 13:45 and touched 4 things". Deliberately NOT added to
-- retention_policy in this migration, because adding a policy row is an operational decision
-- with a rationale of its own (the 0034 pattern), and nothing is at risk while it is small.
-- Flagged, not decided.
--
-- ADDITIVE. One new table. No existing table touched.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.of_cron_runs (
  id           BIGSERIAL PRIMARY KEY,

  -- A CLOSED SET, matched EXACTLY. A job name is a CONTROL value: the staleness query filters
  -- on it, so a typo would silently create a job nothing ever looks for — which is precisely
  -- the failure this table exists to detect, arriving through the back door. Kept in lock-step
  -- with server/src/constants/cronJobs.js, and a test asserts BOTH against vercel.json.
  job_name     TEXT        NOT NULL
                 CHECK (job_name IN ('reconcile','retention','neris_sweep',
                                     'report_delivery','permit_expiry')),

  started_at   TIMESTAMPTZ NOT NULL,
  -- clock_timestamp(), not now(): now() is transaction-start and identical for every row in a
  -- transaction, so two runs recorded in one txn could not be ordered (the 0115 reasoning).
  finished_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

  outcome      TEXT        NOT NULL CHECK (outcome IN ('success','failed')),

  -- Totals only. See the tenancy note above — this is readable by every department's chief.
  summary      JSONB,

  -- Present only on outcome='failed'. Sanitized at the call site; never a raw driver dump
  -- (a driver error can echo a connection string).
  error        TEXT,

  CONSTRAINT of_cron_runs_time_order CHECK (finished_at >= started_at),
  CONSTRAINT of_cron_runs_error_only_on_failure
    CHECK ((outcome = 'failed') OR (error IS NULL)),
  -- ⚠ EVERY NULLABLE COLUMN TESTED INSIDE A CHECK CARRIES AN EXPLICIT `IS NOT NULL` ARM.
  -- length(btrim(NULL)) > 0 evaluates to NULL and a CHECK treats NULL as PASS — the leak that
  -- shipped in 0125 and was found by a probe during 0126. An error is optional; an EMPTY
  -- error on a failed run is a run whose cause was silently dropped.
  CONSTRAINT of_cron_runs_error_nonempty
    CHECK (error IS NULL OR length(btrim(error)) > 0),
  -- A cheap fence on the tenancy rule above: a summary that has grown into per-department
  -- detail will not fit. Not a substitute for the convention, a backstop for it.
  CONSTRAINT of_cron_runs_summary_small
    CHECK (summary IS NULL OR length(summary::text) <= 2000)
);

-- The staleness query's index: newest SUCCESS per job. Partial, because the rows that answer
-- "is this job alive" are a subset.
CREATE INDEX IF NOT EXISTS idx_of_cron_runs_job_success
  ON public.of_cron_runs (job_name, finished_at DESC) WHERE outcome = 'success';
CREATE INDEX IF NOT EXISTS idx_of_cron_runs_job_time
  ON public.of_cron_runs (job_name, finished_at DESC);

ALTER TABLE public.of_cron_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS global_read ON public.of_cron_runs;
-- Deliberately permissive and NAMED. See the tenancy note: this records platform jobs, one of
-- which has no department at all. Authorization is at the route (chief), not at the row.
CREATE POLICY global_read ON public.of_cron_runs FOR ALL USING (true) WITH CHECK (true);

-- Append-only, enforced by Postgres rather than by our own good intentions. TRUNCATE is in the
-- list FROM THE START — 0121 and 0124 exist solely because two earlier append-only tables
-- shipped without it and Supabase's schema default privileges had already handed service_role
-- the one statement that empties a table.
GRANT SELECT, INSERT ON public.of_cron_runs TO of_app;
GRANT USAGE, SELECT ON SEQUENCE public.of_cron_runs_id_seq TO of_app;
REVOKE UPDATE, DELETE, TRUNCATE ON public.of_cron_runs
  FROM of_app, anon, authenticated, service_role, PUBLIC;

COMMENT ON TABLE public.of_cron_runs IS
  'Append-only invocation ledger for the scheduled jobs in vercel.json. One row per run, '
  'written at the END — a run that dies mid-flight leaves no row, and that absence IS the '
  'signal (0095 doctrine). GLOBAL, not tenant-scoped: reconcile has no department. RLS on '
  'with an explicit permissive global_read policy so the globalness is named, not implied. '
  'summary carries TOTALS ONLY — every chief can read this table. 0128.';

-- ── A verification that CAN fail, asserting BOTH directions (the 0118 lesson: a probe that
-- asserts only an absence can be vacuously true).
DO $verify$
DECLARE bad TEXT; granted INT;
BEGIN
  SELECT string_agg(grantee || ':' || privilege_type, ', ' ORDER BY grantee || privilege_type)
    INTO bad
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND table_name = 'of_cron_runs'
     AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')
     AND grantee IN ('of_app','anon','authenticated','service_role','PUBLIC');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '0128 FAILED: mutating privilege still held on of_cron_runs -> %', bad;
  END IF;

  SELECT count(*) INTO granted
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND table_name = 'of_cron_runs'
     AND grantee = 'of_app' AND privilege_type IN ('SELECT','INSERT');
  IF granted <> 2 THEN
    RAISE EXCEPTION '0128 FAILED: of_app must hold exactly SELECT+INSERT, found % of 2', granted;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='of_cron_runs'
                    AND policyname='global_read') THEN
    RAISE EXCEPTION '0128 FAILED: the named global_read policy is missing — a global table '
                    'with RLS off is indistinguishable from a tenant table somebody forgot';
  END IF;

  RAISE NOTICE '0128: of_cron_runs is append-only, RLS on with a named global policy, of_app SELECT+INSERT';
END $verify$;

INSERT INTO of_schema_migrations (filename) VALUES ('0128-of-cron-runs.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
