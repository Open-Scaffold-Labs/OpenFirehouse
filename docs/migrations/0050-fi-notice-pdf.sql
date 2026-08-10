-- 0050 — Prevention Core Phase 2.3: violation-notice PDF (2026-07-12)
--
-- 1. fi_settings gains the department-authored notice text blocks — the exact
--    structure the reference incumbent ships (decision §7.3, incumbent research):
--    Header / Body / LEGALESE / Passed-inspection body / Footer + the signature
--    agreement text. WE never author legal language: the API serves clearly-generic
--    sample text when a block is empty, flagged "review with your authority having
--    jurisdiction". Departments paste their own statutory wording.
-- 2. fi_notices gains the PDF itself (BYTEA) + file_name. Deliberate: a notice is
--    a small (~tens of KB) LEGAL document — storing it in the row keeps it atomic
--    with the record, RLS-covered, in the same backup story, and keeps the photo
--    bucket's folder-listing API clean. storage_path remains for any future
--    external-storage need.
-- Idempotent; applied by hand; db.js fresh-install mirror joins the existing
-- mirror follow-up queue.

ALTER TABLE fi_settings ADD COLUMN IF NOT EXISTS notice_header      TEXT NOT NULL DEFAULT '';
ALTER TABLE fi_settings ADD COLUMN IF NOT EXISTS notice_body        TEXT NOT NULL DEFAULT '';
ALTER TABLE fi_settings ADD COLUMN IF NOT EXISTS notice_legalese    TEXT NOT NULL DEFAULT '';
ALTER TABLE fi_settings ADD COLUMN IF NOT EXISTS notice_passed_body TEXT NOT NULL DEFAULT '';
ALTER TABLE fi_settings ADD COLUMN IF NOT EXISTS notice_footer      TEXT NOT NULL DEFAULT '';
ALTER TABLE fi_settings ADD COLUMN IF NOT EXISTS signature_agreement_text TEXT NOT NULL DEFAULT '';

ALTER TABLE fi_notices ADD COLUMN IF NOT EXISTS pdf       BYTEA;
ALTER TABLE fi_notices ADD COLUMN IF NOT EXISTS file_name TEXT NOT NULL DEFAULT '';
