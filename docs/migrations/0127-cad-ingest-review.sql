-- 0127-cad-ingest-review.sql
-- 4C.4 — the operator review row for a CAD ingest fault.
-- Spec: docs/CAD-INGEST-4C4-SPEC-2026-08-05.md · parent spec: docs/CAD-INGEST-4C2-SPEC-2026-07-27.md
--
-- NUMBERING (F4): claimed by an empty stub, PUSHED as dad5733, before any SQL was written.
-- Head verified TWO ways on 2026-08-05 — `ls docs/migrations/` -> 0126, and a live query of the
-- prod of_schema_migrations ledger -> 0126-fi-payments.sql (114 rows). Never from CLAUDE.md.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- WHY
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4C.2 made an unreadable dispatch DURABLE. Durability is half a remedy. Per NENA-STA-024
-- §3.3.5.3.1 the sending CAD's action on our 400/500 is NOTHING — it will never send that call
-- again and it believes we have it. So the bytes sitting in a table nobody opens is, to the
-- department, indistinguishable from the call never arriving. 09 NCAC 06C .0213(a)(4) is the
-- one explicit rule found for this (ONE STATE's rule — deliberately not described as a norm;
-- see spec §1): on detecting an interface fault the system "shall send an appropriate message
-- consisting of visual and audible indications to personnel designated by the PSAP." NFPA 1221
-- §3.3.85 names the artifact: a Trouble Signal.
--
-- CJIS AU-6a's periodic-review duty is discharged by the operator panel this table serves, not
-- by any cron job (4C.2 spec §5.7 says so in as many words).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- WHY A THIRD TABLE AND NOT A COLUMN — a deliberate divergence from the parent spec's sketch
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4C.2 §5.5 sketched review as "the only write the table permits after insert" — i.e. a mutable
-- column on cad_ingest_outcome. This does NOT do that. cad_ingest_outcome stays exactly as 0115
-- left it: no UPDATE granted to anything, no seam, nothing mutable.
--
-- 0115's own header is the argument: "these bytes arrived" and "we could read them" are
-- different facts established at different times, which is why the receipt and the outcome are
-- separate rows. "An operator looked at this and did something about it" is a THIRD fact,
-- established later, by a different actor. It gets a third row. This is also 0125's invoice
-- doctrine (a correction is a NEW linked row; the original renders unchanged forever) and it
-- costs nothing: a column seam would mean granting of_app UPDATE on a table whose entire value
-- is that of_app holds no UPDATE at all. 0126 had to pay that price for the void seam. Here we
-- do not, and "no UPDATE anywhere in the CAD ingest chain" stays provable in one query.
--
-- Accepted consequence: review is a HISTORY, not a flag. Re-review is representable. "Reviewed"
-- is derived as EXISTS(a review row); the panel shows the most recent.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- RETENTION: NONE. ARCHIVE FOREVER — same rule as the two tables it annotates.
-- This table must NEVER be added to `retention_policy` (Matt, 2026-07-27; 4C.2 spec §5.7).
-- A review record that outlives its subject is useless, and one that dies first is worse.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.cad_ingest_review (
  id             BIGSERIAL PRIMARY KEY,
  -- The FAULT reviewed, not the receipt: a receipt can have several outcomes over its life,
  -- and it is a specific outcome that a human dispositions.
  outcome_id     BIGINT      NOT NULL REFERENCES public.cad_ingest_outcome (id),
  department_id  INTEGER     NOT NULL,
  -- clock_timestamp(), not now(): same reason as 0115 — two reviews inside one transaction must
  -- still order.
  reviewed_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  -- users.id. No FK, matching the audit_log convention: a review is a fact about what happened,
  -- and it must survive the reviewer's account being removed.
  reviewed_by    INTEGER     NOT NULL,
  -- FROZEN AT REVIEW TIME, on purpose. Resolving the name at read time would let a rename or a
  -- deactivation silently rewrite who cleared a fault.
  reviewer_name  TEXT        NOT NULL,
  note           TEXT,

  -- ⚠ EVERY NULLABLE COLUMN TESTED INSIDE A CHECK CARRIES AN EXPLICIT `IS NOT NULL` ARM.
  -- length(btrim(NULL)) > 0 evaluates to NULL, and a CHECK treats NULL as PASS (three-valued
  -- logic). That leak shipped in 0125 and was found by a probe during 0126; it is not repeated
  -- here. reviewer_name is NOT NULL so its test cannot leak; note is nullable, so its arm is
  -- explicit — a note is optional, but an empty-string note is not a note.
  CONSTRAINT cad_ingest_review_reviewer_name_present
    CHECK (length(btrim(reviewer_name)) > 0),
  CONSTRAINT cad_ingest_review_note_nonempty
    CHECK (note IS NULL OR length(btrim(note)) > 0)
);

-- The panel's two queries: "is this fault reviewed / show me the latest review" and
-- "what has this department reviewed lately".
CREATE INDEX IF NOT EXISTS idx_cad_ingest_review_outcome
  ON public.cad_ingest_review (outcome_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cad_ingest_review_dept_time
  ON public.cad_ingest_review (department_id, reviewed_at DESC);

ALTER TABLE public.cad_ingest_review ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.cad_ingest_review;
CREATE POLICY dept_isolation ON public.cad_ingest_review FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);

-- Append-only, enforced by Postgres rather than by our own good intentions.
-- TRUNCATE IS IN THIS LIST FROM THE START. 0121 and 0124 exist solely because the two 0115
-- tables shipped without it and Supabase's schema default privileges had already handed
-- service_role TRUNCATE — the one statement that could empty an archive-forever table.
GRANT SELECT, INSERT ON public.cad_ingest_review TO of_app;
GRANT USAGE, SELECT ON SEQUENCE public.cad_ingest_review_id_seq TO of_app;
REVOKE UPDATE, DELETE, TRUNCATE ON public.cad_ingest_review
  FROM of_app, anon, authenticated, service_role, PUBLIC;

COMMENT ON TABLE public.cad_ingest_review IS
  'Append-only operator review of a cad_ingest_outcome fault. RLS dept_isolation, no UPDATE or '
  'DELETE granted to any role, retained FOREVER — never pruned, never in retention_policy. '
  'Discharges the periodic-review duty (CJIS AU-6a) and the trouble-signal disposition of '
  '09 NCAC 06C .0213(a)(4). 0127 (4C.4).';

-- ── A verification that CAN fail. Not decoration: the 0118 lesson is that a probe asserting an
-- absence can be vacuously true, so this asserts BOTH directions — the grants we want present
-- AND the ones that must be absent.
DO $verify$
DECLARE bad TEXT; missing INT;
BEGIN
  SELECT string_agg(grantee || ':' || privilege_type, ', ' ORDER BY grantee || privilege_type)
    INTO bad
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND table_name = 'cad_ingest_review'
     AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')
     AND grantee IN ('of_app','anon','authenticated','service_role','PUBLIC');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '0127 FAILED: mutating privilege still held on cad_ingest_review -> %', bad;
  END IF;

  SELECT count(*) INTO missing
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND table_name = 'cad_ingest_review'
     AND grantee = 'of_app' AND privilege_type IN ('SELECT','INSERT');
  IF missing <> 2 THEN
    RAISE EXCEPTION '0127 FAILED: of_app must hold exactly SELECT+INSERT, found % of 2', missing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='cad_ingest_review'
                    AND policyname='dept_isolation') THEN
    RAISE EXCEPTION '0127 FAILED: dept_isolation policy missing on cad_ingest_review';
  END IF;

  RAISE NOTICE '0127: cad_ingest_review is append-only (no UPDATE/DELETE/TRUNCATE), RLS on, of_app SELECT+INSERT';
END $verify$;

INSERT INTO of_schema_migrations (filename) VALUES ('0127-cad-ingest-review.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
