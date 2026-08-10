-- 0106-cad-alert-id-provenance.sql
-- Phase 4 / CAD ingest. Number claimed by stub 2026-07-27 (F4) before any SQL.
--
-- THE DEFECT (market pass 2026-07-27)
-- All five CAD adapters synthesized their fallback identifier as
-- `${prefix}-${Date.now()}` when a vendor payload carried no call id. That is
-- NON-DETERMINISTIC, and CAD vendors retry on timeout — pipeline.js says so in
-- its own comment. So every retry of an id-less dispatch minted a NEW alert_id,
-- defeating the duplicate guard exactly when it is needed. Two alert rows for
-- one call can become two draft incidents on clear: two incident numbers for
-- one fire.
--
-- NENA-STA-021.1a settles the shape of the fix: the standard does not permit an
-- absent identifier and prescribes SYNTHESIZING one namespaced to the creating
-- agency. Synthesis was never the mistake — non-determinism was. The code fix is
-- cad/alertIdentity.js (a content hash over sender-stated fields only).

BEGIN;

-- 1. PROVENANCE. A synthesized identifier must never masquerade as the call's
--    real CAD-issued number — the same standard already applied to
--    fi_inspections.result_code. An operator seeing a synthesized id needs to
--    know their CAD is misconfigured, not trust it as the run number.
--
--    DELIBERATELY NULLABLE, WITH NO DEFAULT AND NO BACKFILL. The 30 existing
--    prod rows carry ids like 'ABBREV-1781061560103' — a timestamp-shaped
--    suffix, i.e. fixtures, not verifiable vendor numbers. Stamping them
--    'vendor' would assert a provenance nobody established. NULL means
--    "recorded before provenance was tracked", which is the truth, and matches
--    how unmappable legacy result_code rows were left rather than defaulted.
ALTER TABLE cad_alerts ADD COLUMN IF NOT EXISTS alert_id_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'cad_alerts'::regclass AND conname = 'cad_alerts_alert_id_source_check'
  ) THEN
    ALTER TABLE cad_alerts
      ADD CONSTRAINT cad_alerts_alert_id_source_check
      CHECK (alert_id_source IS NULL OR alert_id_source IN ('vendor','synthesized'));
  END IF;
END $$;

-- 2. AN IDENTIFIER ALWAYS EXISTS. Preventive, not a repair — prod has 0 nulls of
--    30, and no shipped adapter can emit a null on the dispatch path (verified
--    by reading all five; the one null-capable line is on the unit-status path,
--    which never inserts an alert).
--
--    It is closed anyway because 0104 made (department_id, alert_id) unique with
--    NULLS NOT DISTINCT: if a future adapter ever returned null, the SECOND such
--    call in that department would be refused 23505 and silently dropped. That
--    is a trap laid for the next adapter author, and a dropped dispatch is the
--    one failure this domain does not tolerate — NENA-STA-024 §3.14 makes
--    logging every message MUST-level, and NFPA 1221 §12.5.3 makes keeping a
--    record of every dispatch signal SHALL.
ALTER TABLE cad_alerts ALTER COLUMN alert_id SET NOT NULL;

-- NOT DOING, deliberately: no change to uq_cad_alerts_dept_alert. NULLS NOT
-- DISTINCT is correct for the cross-tenant scoping 0104 shipped, and once
-- alert_id is NOT NULL the null case cannot arise. Two guards, neither relying
-- on the other.

INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0106-cad-alert-id-provenance.sql', NOW())
ON CONFLICT DO NOTHING;

COMMIT;
