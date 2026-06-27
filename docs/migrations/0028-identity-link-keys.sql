-- 0028-identity-link-keys.sql — P0 of the Login↔Member↔Certifications identity
-- link gameplan (v2, 2026-06-18). Makes the account↔person link keys ROBUST
-- before any backfill writes. Foundation only — no behavior change yet.
--
-- WHY (life-safety): a mis-linked certification is a deposition exhibit, not a
-- bug ticket. The internal join key must be members.id (PK, immutable); the
-- account↔person link is members.user_id → users.id; everything else (name,
-- email, badge) is an ATTRIBUTE, never a join key. This migration enforces that
-- one login maps to at most one member row per department, and adds the stable,
-- SSO/SCIM-ready correlation columns (dormant until P6).
--
-- Verified live this session (2026-06-18) before writing:
--   • prod (YOUR_PROJECT_REF): 47 members / 1 linked / 46 null; NO
--     (user_id, department_id) unique; NO members.personnel_id/external_id;
--     NO public.users.external_id. userdept_dups = none (constraint applies clean).
--   • idx_members_dept_number UNIQUE (department_id, "memberNumber") ALREADY
--     EXISTS on prod AND in db.js (line ~3063) — so gameplan P0.2 is ALREADY
--     SATISFIED. This migration does NOT recreate it (would be a duplicate).
--   • TWO `users` tables exist (public + auth) — all DDL here is schema-qualified
--     to public.* deliberately.
--
-- Idempotent. Reversible (rollback at foot). Mirror into db.js for fresh installs;
-- stamp of_schema_migrations. Apply order: local → prod (Supabase apply_migration,
-- since initDb() fast-paths existing prod) → db.js mirror → ledger.

-- ── P0.1 — one login ↔ at most one member per department ──────────────────────
-- Partial unique so the 46 unlinked (user_id IS NULL) rows are unaffected; only
-- linked rows are constrained. Blocks the "two members share one login" collision
-- (the Nathan McGee / Nathan P. McGee class of failure, FMEA R3).
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_user_dept
  ON public.members (user_id, department_id)
  WHERE user_id IS NOT NULL;

-- ── P0.2 — per-department business-key uniqueness ─────────────────────────────
-- ALREADY ENFORCED by idx_members_dept_number (department_id, "memberNumber").
-- Intentionally NOT recreated here. (Documented, verified live 2026-06-18.)

-- ── P0.3 — stable, SSO/SCIM-ready correlation columns (additive, nullable) ─────
-- personnel_id: agency-assigned badge / employee number (the agency-badge analog
--   used across mature credentialing platforms). Display/match attribute.
-- external_id (members + users): SCIM (RFC 7643) `externalId` correlation key.
--   Dormant until P6 (SAML/SCIM). Link resolves by external_id, never email-as-key.
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS personnel_id TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS external_id  TEXT;
ALTER TABLE public.users   ADD COLUMN IF NOT EXISTS external_id  TEXT;

-- Correlation lookups: external_id is the SSO/SCIM join key. Partial unique per
-- department on members so two people can't share one SCIM externalId; partial
-- unique global on users (the auth identity).
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_external_id
  ON public.members (department_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_id
  ON public.users (external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_personnel_id
  ON public.members (department_id, personnel_id)
  WHERE personnel_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (documented per Principle #7 — reversible by default):
--   DROP INDEX IF EXISTS public.idx_members_user_dept;
--   DROP INDEX IF EXISTS public.idx_members_external_id;
--   DROP INDEX IF EXISTS public.idx_users_external_id;
--   DROP INDEX IF EXISTS public.idx_members_personnel_id;
--   ALTER TABLE public.members DROP COLUMN IF EXISTS personnel_id;
--   ALTER TABLE public.members DROP COLUMN IF EXISTS external_id;
--   ALTER TABLE public.users   DROP COLUMN IF EXISTS external_id;
-- ──────────────────────────────────────────────────────────────────────────────
