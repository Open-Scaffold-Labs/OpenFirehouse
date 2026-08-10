-- 0039-of-readonly-setrole-grant.sql — enable the SET ROLE validation path for
-- the of_readonly operator-console role.
--
-- ═══ APPLIED + VERIFIED ON PROD 2026-07-07 (abvcmaknsyqmahspmasu) ═══
-- Live before/after evidence at the bottom of this file.
--
-- ═══ CORRECTION (2026-07-07, Matt + Claude audit) ═══
-- The first draft of this migration gated and verified on
-- pg_has_role(current_user,'of_readonly','MEMBER'). A live audit of prod found
-- that would have been a SILENT NO-OP:
--   • On Supabase (PG16+), the platform already grants the owner role (`postgres`)
--     membership in every newly-created role via `supabase_admin` WITH ADMIN
--     OPTION but **set_option = false**. So pg_has_role(...,'MEMBER') was ALREADY
--     true → the `IF NOT ... 'MEMBER'` guard skipped the GRANT entirely.
--   • The verify block (also 'MEMBER') would then have RAISEd NOTICE '0039 ok'
--     while `SET ROLE of_readonly` STILL failed with 42501 — a false green.
-- In PG16+, SET ROLE capability is governed by the grant's **set_option**, which
-- pg_has_role exposes as the 'SET' privilege — NOT 'MEMBER'. This migration now
-- gates and verifies on 'SET', and grants WITH SET TRUE explicitly.
--
-- WHY: 0038 created `of_readonly`; the review brief's Definition-of-Done path,
-- `SET ROLE of_readonly; <read tests>; RESET ROLE;`, failed in the Supabase SQL
-- editor with:
--     ERROR: 42501: permission denied to set role "of_readonly"
-- because the only membership the owner held (the platform's admin grant) has
-- set_option = false. This grants the CURRENT migration/owner role SET capability
-- on of_readonly so it can assume the role for the negative read-tests. Same
-- intent as 0007-app-role.sql's `GRANT of_app TO current_user`.
--
-- HARMLESS to least-privilege: membership flows owner -> role, never the reverse.
-- The owner is already strictly more privileged than of_readonly; of_readonly
-- gains NOTHING (it holds only column-scoped SELECT on 7 tables — re-verified
-- live post-apply: 52 column grants, 0 table grants, UNCHANGED by this file).
-- INHERIT FALSE keeps this a SET-only (impersonation) membership, not privilege
-- inheritance — so the recurring access review reads cleanly.
--
-- OPTIONAL / belt-and-suspenders: the *truest* validation is to connect WITH the
-- of_readonly credential (session pooler) after the password cutover and run the
-- tests as a real login. The fence is ALSO provable owner-side via
-- has_*_privilege() with no role assumption at all
-- (see docs/ops/of-readonly-access-review.sql).
--
-- Idempotent. OPS role — do NOT mirror into db.js/initDb.

DO $$ BEGIN
  IF NOT pg_has_role(current_user, 'of_readonly', 'SET') THEN
    EXECUTE format('GRANT of_readonly TO %I WITH SET TRUE, INHERIT FALSE', current_user);
  END IF;
END $$;

-- Verify: current_user can now SET ROLE of_readonly (governed by set_option / 'SET').
DO $verify$
BEGIN
  IF NOT pg_has_role(current_user, 'of_readonly', 'SET') THEN
    RAISE EXCEPTION '0039 failed: % still lacks SET on of_readonly (set_option=false)', current_user;
  END IF;
  RAISE NOTICE '0039 ok: % can now SET ROLE of_readonly for the DoD read-tests.', current_user;
END $verify$;

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0039-of-readonly-setrole-grant.sql')
ON CONFLICT (filename) DO NOTHING;

-- ── Live audit evidence (prod abvcmaknsyqmahspmasu, 2026-07-07) ───────────────
-- BEFORE: pg_has_role('postgres','of_readonly','SET') = false; `SET ROLE
--         of_readonly` → ERROR 42501. Membership: one row (grantor
--         supabase_admin, admin=true, set=false, inherit=false).
-- AFTER : pg_has_role('postgres','of_readonly','SET') = true. Membership: + one
--         row (grantor postgres, admin=false, set=true, inherit=false). `SET ROLE
--         of_readonly` succeeds. DoD read-tests then run green as of_readonly —
--         must-SUCCEED: count(*) on departments/stations/members/incidents/
--         licenses/apparatus/unit_statuses; must-FAIL (all 42501): members.name,
--         SELECT * FROM members, licenses.jwt, licenses.stripe_customer_id,
--         incidents.notes, stations.anthropic_api_key, users, cad_connections,
--         INSERT INTO departments.
-- of_readonly's OWN grants are UNCHANGED by this migration: 52 column grants,
-- 0 table grants (fence intact).

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- REVOKE of_readonly FROM current_user;  -- drops the owner's SET membership
--   -- (the platform's supabase_admin admin-grant may persist / be re-created).
-- DELETE FROM public.of_schema_migrations WHERE filename = '0039-of-readonly-setrole-grant.sql';
