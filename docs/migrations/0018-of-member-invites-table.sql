-- 0018-of-member-invites-table.sql
-- RETRO-CAPTURE (2026-06-15): formalizes the of_member_invites TABLE, which
-- originally shipped on 2026-06-15 ~06:47 UTC via the db.js fresh-install mirror
-- (block 3c) + an ad-hoc Supabase MCP apply, WITHOUT a numbered migration file
-- at the time (P4.4). This file exists for ledger completeness + replayability.
--
-- NOTE ON ORDER: chronologically this ran BETWEEN 0012 and 0013 (see
-- of_schema_migrations.applied_at for the true original time) — i.e. BEFORE
-- 0016, which adds the RLS policy + redeem fn to this same table. It is numbered
-- 0018 because the sequence is forward-only (we never renumber applied
-- migrations). Everything here is idempotent (CREATE TABLE / INDEX IF NOT EXISTS,
-- guarded grants), so applying it now is a no-op on prod, and fresh installs
-- build this table — in the correct order, before the 0016 RLS step — via db.js
-- block 3c, not by replaying these numbered files in filename order.
--
-- Table: single-use, hashed, expiring set-password invites. The chief issues
-- one when adding a member; the member redeems it at POST /api/auth/accept-invite
-- (RLS + the of_redeem_member_invite DEFINER fn were added later, in 0016).

CREATE TABLE IF NOT EXISTS public.of_member_invites (
  id                 SERIAL PRIMARY KEY,
  member_id          INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id      INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  token_hash         TEXT NOT NULL,
  expires_at         TIMESTAMPTZ NOT NULL,
  used_at            TIMESTAMPTZ,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_member_invites_token  ON public.of_member_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_member_invites_member ON public.of_member_invites(member_id);

-- of_app (non-owner, prod) needs table + sequence privileges; owner installs no-op the grant.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.of_member_invites TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.of_member_invites_id_seq TO of_app;
  END IF;
END $$;
