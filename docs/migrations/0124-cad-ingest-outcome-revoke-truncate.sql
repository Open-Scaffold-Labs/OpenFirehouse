-- 0124-cad-ingest-outcome-revoke-truncate.sql
--
-- Finish what 0121 started: revoke TRUNCATE on `cad_ingest_outcome` too.
--
-- Claimed by stub 2026-08-04 per the F4 rule. Head verified 0123 by listing docs/migrations/.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 0121 WAS INCOMPLETE, AND I MADE THE SAME MISTAKE I WAS FIXING.
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- 0121's finding was that 0115 revoked UPDATE/DELETE but not TRUNCATE, so Supabase's schema
-- default left a bypass-RLS role able to empty an archive-forever log in one statement.
-- 0121 then fixed exactly ONE table and left its sibling behind. Verified live 2026-08-04,
-- after 0121:
--     cad_ingest_log      →  no non-owner holds UPDATE/DELETE/TRUNCATE   ✅
--     cad_ingest_outcome  →  service_role STILL holds TRUNCATE           ❌
--
-- The two tables are one record. 0115 created them together, revoked UPDATE/DELETE on both in
-- the same breath, and `cad_ingest_outcome` is what says whether a received dispatch actually
-- parsed and what we answered the sender. A receipt whose OUTCOME can be erased is not much
-- better than no receipt: the log would show a payload arrived and nothing would show what
-- became of it. Truncating the outcome table also silently satisfies every FK, because the FK
-- points from outcome → log, not the other way.
--
-- WHY I MISSED IT: 0121 was written from the ONE table named in the finding, not from the
-- doctrine the finding was about. The lesson is the same one as the fi_inspections back door —
-- "a guard that exists on one route and not another is not a guard" — here in its data form:
-- **when you revoke a privilege because of a DOCTRINE, enumerate every table that doctrine
-- covers, not the table you happened to be looking at.** The db.js mirror written the same day
-- got this right (it loops over both tables), so a fresh install was already correct and only
-- prod carried the gap — which is the inverse of the usual drift and easy to miss.
--
-- Caught by a check that COULD fail: after mirroring the tables into db.js, the verification
-- asserted "no non-owner holds UPDATE/DELETE/TRUNCATE on EITHER table" and it returned FAILED.
-- Had that check named only cad_ingest_log, this would still be open.
--
-- REVOKE only, same safe direction as 0121: it can refuse an operation, never enable one.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $rv$
DECLARE t TEXT; r TEXT;
BEGIN
  -- BOTH tables, deliberately — re-revoking on cad_ingest_log is a harmless no-op and makes
  -- this migration the complete statement of the invariant rather than a patch to a patch.
  FOREACH t IN ARRAY ARRAY['cad_ingest_log','cad_ingest_outcome'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role','PUBLIC'] LOOP
        IF r = 'PUBLIC' OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
          EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM %s', t,
                         CASE WHEN r = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r) END);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $rv$;

-- The check that found the gap, now permanent: it names BOTH tables and every write verb.
DO $verify$
DECLARE held TEXT;
BEGIN
  SELECT string_agg(grantee||' → '||table_name||'.'||privilege_type, ', ' ORDER BY table_name, grantee)
    INTO held
    FROM information_schema.table_privileges
   WHERE table_name IN ('cad_ingest_log','cad_ingest_outcome')
     AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')
     AND grantee IN ('of_app','anon','authenticated','service_role');
  IF held IS NOT NULL THEN
    RAISE EXCEPTION '0124 FAILED: write verbs still held on the CAD receipt log — %', held;
  END IF;
  RAISE NOTICE '0124: verified — no non-owner can UPDATE, DELETE or TRUNCATE either CAD ingest table';
END $verify$;

INSERT INTO of_schema_migrations (filename) VALUES ('0124-cad-ingest-outcome-revoke-truncate.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
