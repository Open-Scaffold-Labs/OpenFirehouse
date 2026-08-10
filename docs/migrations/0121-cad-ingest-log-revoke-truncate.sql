-- 0121-cad-ingest-log-revoke-truncate.sql
--
-- Take TRUNCATE on `cad_ingest_log` away from `service_role`.
--
-- Claimed by stub 2026-08-04 (pushed, 34537b5) per the F4 rule. Head verified 0120 by listing docs/migrations/
-- and by `git log --all -- 'docs/migrations/0121*'` (no hits on any ref).
--
-- WHY: `cad_ingest_log` is the CAD receipt log. Its written doctrine (OF CLAUDE.md, 4C.2) is
-- "RETENTION: NONE. ARCHIVE FOREVER", append-only, deliberately never added to
-- `retention_policy`, because a dispatch we fail to keep is not delayed — the sending CAD
-- believes it was delivered and there is no redelivery. 0115 correctly REVOKEs UPDATE/DELETE.
-- It does NOT revoke TRUNCATE, and Supabase's schema default privileges grant it, so a
-- bypass-RLS role can empty the entire log in one statement. Verified live 2026-08-04:
--     cad_ingest_log  service_role  INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE
-- TRUNCATE directly contradicts the one property the table exists to have.
--
-- NOT A MARKET QUESTION. A grant that contradicts its own table's stated doctrine is simply
-- wrong; competitors' role grants are unobservable and R4 governs. Also the SAFE direction —
-- removing a privilege, which can only ever refuse an operation, never enable one.
--
-- SCOPE, deliberately narrow: TRUNCATE only. service_role keeps SELECT/INSERT/REFERENCES/TRIGGER
-- because those do not contradict append-only, and because service_role is `rolcanlogin = false`
-- — it cannot connect over Postgres at all and is reachable only through the Supabase Data API.
-- ⚠️ WHETHER THAT DATA API IS ENABLED ON THIS PROJECT IS STILL UNVERIFIED (get_advisors does not
-- report it; it needs a dashboard read, which is Matt's). If it is disabled, none of these grants
-- are reachable and this migration is belt-and-braces. If it is enabled, this closes a real hole.
-- Either way the REVOKE is correct, which is why it is not gated on the answer.
--
-- ⚠️ CORRECTION TO MY OWN FIRST DRAFT OF THIS HEADER: it said "the same REVOKE is added to db.js
-- so a fresh install does not recreate the hole." That is FALSE and I checked before shipping it.
-- `cad_ingest_log` DOES NOT APPEAR IN server/src/db.js AT ALL — it exists only via migration
-- 0115, so a fresh install has no such table and there is no mirror to patch. Adding a REVOKE for
-- a table db.js never creates would be incoherent.
-- That absence is a separate, PRE-EXISTING gap worth someone's attention: the CAD receipt table
-- that the 4C.2 ingest doctrine is built on is not part of the fresh-install schema. Flagged, not
-- fixed here — mirroring it is its own change with its own verification.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $rv$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE TRUNCATE ON cad_ingest_log FROM %I', r);
    END IF;
  END LOOP;
END $rv$;

-- A check that CAN fail: after this, no role but the owner may hold TRUNCATE here.
DO $verify$
DECLARE holders TEXT;
BEGIN
  SELECT string_agg(grantee, ', ' ORDER BY grantee) INTO holders
    FROM information_schema.table_privileges
   WHERE table_name = 'cad_ingest_log' AND privilege_type = 'TRUNCATE'
     AND grantee IN ('of_app','anon','authenticated','service_role');
  IF holders IS NOT NULL THEN
    RAISE EXCEPTION '0121 FAILED: TRUNCATE on cad_ingest_log still held by %', holders;
  END IF;
  RAISE NOTICE '0121: TRUNCATE on cad_ingest_log revoked from every non-owner role';
END $verify$;

INSERT INTO of_schema_migrations (filename) VALUES ('0121-cad-ingest-log-revoke-truncate.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
