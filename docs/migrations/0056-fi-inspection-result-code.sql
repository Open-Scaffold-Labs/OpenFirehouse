-- 0056 — fi_inspections.result_code : the inspection result becomes a CLOSED SET
-- 2026-07-14
--
-- ✅ APPLIED TO PROD 2026-07-14 18:58 UTC (of_schema_migrations ledger updated).
--    Local dev DB: applied.
--
-- 🔴 IT WAS APPLIED AS AN INCIDENT FIX, NOT ON SCHEDULE. The code that writes result_code
--    (commit 2aa45ac) was pushed BEFORE this migration ran, and Vercel auto-deploys on push —
--    so for a few minutes prod ran code referencing a column that did not exist, and
--    POST /api/fi-inspections and .../complete both 500'd. Reads were fine; no data was
--    corrupted; blast radius was zero users ONLY because OF is pre-launch. That is luck.
--
--    THE RULE: A MIGRATION AND THE CODE THAT DEPENDS ON IT ARE ONE CHANGE. Either both ship
--    or neither does. Code referencing a column prod does not have is not "a pending
--    migration" — it is a live outage the moment it deploys. Before any schema-touching push,
--    QUERY PROD and confirm it has every column the code writes. The file being in git is not
--    the column being in Postgres. (Full write-up: docs/FI-BULLETPROOF-BUILD-2026-07-14.md §6.5)
--
-- ⚠️ NOTE ON NUMBERING: 0052 is a PERMANENT GAP. It was never applied to any database and
-- the ledger has moved past it (prod of_schema_migrations: 0051 → 0053 → 0054, verified
-- 2026-07-14). Do not attempt to apply 0052; see its own header.
--
-- ⚠️ THIS WAS 0055 UNTIL A CONCURRENT SESSION COMMITTED ITS OWN 0055 (b030660,
-- 0055-fi-drop-violation-severity.sql) WHILE THIS WAS IN FLIGHT. Migration numbers RACE.
-- Theirs was committed first, so it keeps 0055 and this becomes 0056. The two do not
-- conflict semantically (they drop fi_violations.severity; this adds fi_inspections.
-- result_code) — but APPLY 0055 BEFORE 0056.
--
-- ── WHY ────────────────────────────────────────────────────────────────────────────────
-- `fi_inspections.result` is free text (the API accepted any string ≤60 chars), and the
-- doctrine "an inspection CANNOT PASS with unabated violations" was enforced by a REGEX:
--     /^pass\b/i
-- Executed against real values on 2026-07-14:
--     'Pass', 'Pass with Violations', 'Pass, see notes'  → guard FIRES  ✅
--     'Passed', 'PASSED', 'Passing'                      → guard SILENT ❌
-- A building with unabated violations could be recorded as passing by using the past tense.
--
-- Three clients had also drifted into three vocabularies (server: none; web: Pass/Fail/
-- Reinspection Required/Not Completed; mobile: Pass/Fail/Conditional), and prod already
-- holds a value in NEITHER client's list.
--
-- result_code is now the CONTROL value — matched exactly, never pattern-matched.
-- result (free text) is RETAINED VERBATIM as the historical record, and is display-only.
--
-- ── WHY WE DO NOT REWRITE THE AMBIGUOUS ROWS ───────────────────────────────────────────
-- Prod (2026-07-14) holds 5 inspections / 4 distinct result values:
--     'Pass'                 × 1
--     'Fail'                 × 1
--     'Pass with Violations' × 2   ← ids 1 and 4, BOTH completed, EACH with 1 unabated violation
--     NULL                   × 1
--
-- 'Pass with Violations' is semantically closest to REINSPECTION_REQUIRED. WE DO NOT MAP IT.
-- Rewriting a recorded result into a different result obscures previously recorded
-- information — exactly what the 21 CFR §11.10(e) standard forbids of a record, and exactly
-- the "method or circumstances of preparation" attack FRE 803(6) invites. Mapping it to PASS
-- would launder a doctrine violation into a clean pass; mapping it to REINSPECTION_REQUIRED
-- would rewrite history into a failure. Neither is ours to do.
--
--   → Those rows keep their verbatim text, get result_code = NULL, and are surfaced by the
--     review query at the bottom of this file for a HUMAN decision (Matt's).
--   → AN UNMAPPABLE ROW IS LOGGED, NEVER DEFAULTED.
--
-- Backfill maps ONLY exact, unambiguous values. Everything else stays NULL by design.

BEGIN;

ALTER TABLE fi_inspections
  ADD COLUMN IF NOT EXISTS result_code TEXT;

-- The closed set. NULL is legal (an inspection in progress has no result yet).
ALTER TABLE fi_inspections
  DROP CONSTRAINT IF EXISTS fi_inspections_result_code_chk;
ALTER TABLE fi_inspections
  ADD CONSTRAINT fi_inspections_result_code_chk
  CHECK (result_code IS NULL OR result_code IN ('PASS','FAIL','REINSPECTION_REQUIRED','NOT_COMPLETED'));

-- Exact-match backfill ONLY. Case-insensitive, whitespace-trimmed. Nothing fuzzy.
UPDATE fi_inspections SET result_code = 'PASS'
  WHERE result_code IS NULL AND lower(btrim(result)) = 'pass';
UPDATE fi_inspections SET result_code = 'FAIL'
  WHERE result_code IS NULL AND lower(btrim(result)) = 'fail';
UPDATE fi_inspections SET result_code = 'REINSPECTION_REQUIRED'
  WHERE result_code IS NULL AND lower(btrim(result)) = 'reinspection required';
UPDATE fi_inspections SET result_code = 'NOT_COMPLETED'
  WHERE result_code IS NULL AND lower(btrim(result)) = 'not completed';

-- Hot read path: "show me the passing/failing inspections for this department".
CREATE INDEX IF NOT EXISTS idx_fi_inspections_dept_result_code
  ON fi_inspections (department_id, result_code);

COMMIT;

-- ── THE REVIEW QUERY (run after applying; the output is the remediation record) ─────────
-- Rows whose recorded result could not be safely mapped. These are NOT errors to be
-- cleaned up silently — each is a human decision about a legal record.
--
--   SELECT id, department_id, result, "completedDate",
--          (SELECT count(*) FROM fi_violations v
--            WHERE v.inspection_id = i.id
--              AND v.status NOT IN ('Corrected','Withdrawn')) AS unabated
--     FROM fi_inspections i
--    WHERE i.deleted_at IS NULL
--      AND i.result IS NOT NULL AND btrim(i.result) <> ''
--      AND i.result_code IS NULL
--    ORDER BY unabated DESC, id;
--
-- ── THE FORENSIC QUERY (P0.6 — how many buildings passed through the back door) ─────────
-- Every inspection recorded as passing that carries an unabated violation. Baseline
-- captured on prod 2026-07-14 BEFORE this migration: ids 1 and 4 (both 'Pass with
-- Violations', both completed 2026-01/02 — i.e. BEFORE the doctrine landed 2026-07-13, and
-- both pre-launch seed data in department 1). They are not evidence the guard failed; they
-- are evidence the forbidden state is reachable and exists.
--
--   SELECT i.id, i.result, i.result_code, i."completedDate", i.department_id,
--          count(v.*) FILTER (WHERE v.status NOT IN ('Corrected','Withdrawn')) AS unabated
--     FROM fi_inspections i
--     LEFT JOIN fi_violations v ON v.inspection_id = i.id
--    WHERE i.deleted_at IS NULL AND i.result ~* '^pass'
--    GROUP BY i.id, i.result, i.result_code, i."completedDate", i.department_id
--   HAVING count(v.*) FILTER (WHERE v.status NOT IN ('Corrected','Withdrawn')) > 0
--    ORDER BY unabated DESC;
