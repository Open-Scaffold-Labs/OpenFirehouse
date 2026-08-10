-- 0093-fi-permit-catalogue.sql
--
-- Phase 3, module 3.1b — the permit type catalogue + effective-dated expiration rule groups.
-- Spec: docs/PHASE3-31B-CATALOGUE-EXPIRY-RENEWAL-SPEC-2026-07-27.md §3.1–3.2
-- Audit: docs/PHASE3-31B-MARKET-AUDIT-2026-07-27.md §5
--
-- Claimed by stub 2026-07-27. Head at claim: 0092, verified by LISTING docs/migrations/ —
-- never from a doc; that headline has gone stale three times. Phase 3 owns 0090–0099 (§5b
-- rule 2). 0102 is a BURNED number, not a free one.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- WHY THE SHAPE IS THIS SHAPE (and not the one the gameplan recorded)
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The gameplan's 3.1b line said "catalogue with per-type fees and duration · term
-- {value,unit}". The market audit found BOTH of those are the wrong shape:
--   · fee is a LINK to a fee schedule, 2 of 2 platforms — never a scalar on the type;
--   · duration does NOT live on the type at all. NEITHER documented platform carries a
--     scalar term. It lives in an effective-dated EXPIRATION RULE GROUP carrying
--     term · about-to-expire window · grace period.
-- Two things the recorded scope omitted entirely and that the market grades COMMON and
-- UNIVERSAL respectively: the GRACE PERIOD (the boundary the whole penalty ladder pegs to)
-- and the ABOUT-TO-EXPIRE WINDOW (which does double duty — it notifies AND it unlocks
-- renewal). Both are first-class columns here.
--
-- SINGLE BASIS, "from issuance". The market's multi-basis expiration axis is CONSTRUCTION
-- machinery — its third basis terminates at a Certificate of Occupancy. An operational
-- permit has one anchor. Cut for the CLASS reason, not the rarity reason (audit §6).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 🔴 WHAT THIS MIGRATION DELIBERATELY DOES NOT DO — SEED THE CATALOGUE
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The spec calls for the catalogue to be model-code-SEEDED (IFC §105.5's operational permit
-- list) and never model-code-BOUND. Seeding is an "omission to beat" — no vendor ships a
-- seeded catalogue — and it is still the right goal.
--
-- It is NOT in this migration because I DO NOT HAVE VERIFIED §105.5 TEXT. Every code quote
-- in this module is reconstructed from adopting jurisdictions with local amendments visibly
-- marked; ICC's own model text has never been read. Writing ~50 seed rows from memory would
-- put unverified content into a table whose whole purpose is to be authoritative — and this
-- module has ALREADY had to retract one "code" claim that turned out to be a local amendment
-- (the 365-day term), and has caught the construction-vs-operational contaminant FOUR times.
-- A seed list is exactly where that error would become permanent and invisible.
--
-- So: schema now, seed when the list is sourced and verified. A department can author its own
-- types from day one, which is the part that cannot wait. Recorded as an open item, not
-- forgotten.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- IMMUTABILITY, DONE THE WAY THIS REPO DOES IT
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The market's documented mechanic is that a rule version's effective_from is IMMUTABLE
-- after save and adding a later-dated version auto-closes the prior one. That is enforced
-- here at the DATABASE, per-role and column-scoped, the way 0082/0087 did it — of_app may
-- UPDATE effective_to and nothing else on a rule version. A version whose start date can be
-- edited cannot answer "what did the catalogue say on the day this permit was issued",
-- which is the only question version history exists to answer.
--
-- RETIRE, NEVER DELETE. A type with issued permits is referenced by legal records; deleting
-- it would orphan them the way a hard member-delete would orphan subpoenable exposure
-- records. of_app gets no DELETE on either table.
--
-- ADDITIVE ONLY. Two new tables, no existing table touched, no data migration.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── The rule GROUP: a stable identity that versions hang off ─────────────────────────────
-- The type points at the GROUP, never at a version. Resolution picks the version effective
-- on a given date — and under R7 that resolution happens ONCE, at issuance, after which the
-- permit carries its own snapshot and stops caring what the catalogue says.
CREATE TABLE IF NOT EXISTS fi_permit_expiration_rule_groups (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, name)
);

-- ── The effective-dated versions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fi_permit_expiration_rules (
  id                  SERIAL PRIMARY KEY,
  department_id       INTEGER NOT NULL,
  group_id            INTEGER NOT NULL REFERENCES fi_permit_expiration_rule_groups(id) ON DELETE RESTRICT,
  version             INTEGER NOT NULL CHECK (version > 0),

  -- The term itself. Single basis: from issuance.
  term_value          INTEGER NOT NULL CHECK (term_value > 0),
  term_unit           TEXT    NOT NULL CHECK (term_unit IN ('day','month','year')),

  -- UNIVERSAL. Flips Active -> AboutToExpire, and unlocks renewal. Double duty on purpose.
  notice_window_days  INTEGER NOT NULL DEFAULT 30 CHECK (notice_window_days >= 0),

  -- COMMON, and the boundary the entire penalty ladder pegs to. Grace runs AFTER term-end
  -- and BEFORE 'Expired' — see the spec §0.1 correction. Zero is a legitimate value: a
  -- department may run no grace at all.
  grace_days          INTEGER NOT NULL DEFAULT 0 CHECK (grace_days >= 0),

  effective_from      DATE NOT NULL,          -- IMMUTABLE after save (grant-enforced below)
  effective_to        DATE,                   -- NULL = the open version; auto-closed by the app
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id  INTEGER,

  UNIQUE (group_id, version),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Exactly ONE open version per group. Without this, two open versions make "which rule
-- applies today" ambiguous — and an ambiguous answer to that question is how an issued
-- permit ends up with a term nobody can reconstruct.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fi_permit_expiration_rules_open
  ON fi_permit_expiration_rules (group_id) WHERE effective_to IS NULL;

-- ── The catalogue ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fi_permit_types (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,

  -- code is the CONTROL value: exactly matched, never pattern-matched. name is display.
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,

  -- e.g. '105.5.24' when the type mirrors a model-code operational permit. NULL for a
  -- department's own type. Informational — it does NOT bind anything. Model-code SEEDED,
  -- never model-code BOUND.
  ifc_section   TEXT,

  expiration_rule_group_id INTEGER REFERENCES fi_permit_expiration_rule_groups(id) ON DELETE RESTRICT,

  -- ⚠ A SEAM, NOT A FEATURE. 3.2 owns fees and will add the referenced table + the FK.
  -- 3.1b writes NULL here and reads nothing through it. Present so 3.2 is additive rather
  -- than schema surgery on a table that by then holds legal records.
  fee_schedule_id INTEGER,

  -- IFC §105.2.2 makes an inspection AUTHORIZED, not required -> per-type config. The SEAM
  -- only: the issuance gate itself is 3.2's, and only after R3's contractor-licensure gate
  -- is re-tested — it is UNVERIFIED and looks sourced from construction practice.
  requires_inspection BOOLEAN NOT NULL DEFAULT FALSE,

  -- Not every operational permit renews. One jurisdiction's TEMPORARY permits cannot be
  -- renewed after expiry at all — the opposite rule from its own annual permits. Do not
  -- hard-code the annual assumption anywhere.
  allow_renewal BOOLEAN NOT NULL DEFAULT TRUE,

  -- Three-state, defaulting to staff-only. That default is the market's AND the safe one.
  portal_visibility TEXT NOT NULL DEFAULT 'staff_only'
    CHECK (portal_visibility IN ('staff_only','view_only','apply_online')),

  autonumber_prefix TEXT,

  -- Retire-never-delete. 'Retired' keeps resolving for permits issued under it.
  status        TEXT NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft','Active','Retired')),
  valid_from    DATE,
  valid_to      DATE,

  -- The market's documented versioning mechanic for a TYPE is clone-and-retire (as opposed
  -- to the rule group's effective-dated versions). Modelled as it is documented.
  version               INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  superseded_by_type_id INTEGER REFERENCES fi_permit_types(id) ON DELETE RESTRICT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

-- A retired type KEEPS its code (its issued permits still reference it), so uniqueness is
-- scoped to the live ones — otherwise clone-and-retire would collide with itself.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fi_permit_types_dept_code_live
  ON fi_permit_types (department_id, code) WHERE status <> 'Retired';

CREATE INDEX IF NOT EXISTS idx_fi_permit_types_dept        ON fi_permit_types (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_permit_types_dept_status ON fi_permit_types (department_id, status);
CREATE INDEX IF NOT EXISTS idx_fi_permit_expiration_rule_groups_dept
  ON fi_permit_expiration_rule_groups (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_permit_expiration_rules_group
  ON fi_permit_expiration_rules (group_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_fi_permit_expiration_rules_dept
  ON fi_permit_expiration_rules (department_id);

-- ── RLS: dept_isolation on all three ─────────────────────────────────────────────────────
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fi_permit_expiration_rule_groups','fi_permit_expiration_rules',
                           'fi_permit_types'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DO $p$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = %L AND policyname = ''dept_isolation'') THEN
           CREATE POLICY dept_isolation ON %I
             USING (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int);
         END IF;
       END $p$', t, t);
  END LOOP;
END $rls$;

-- ── Grants: per-role, column-scoped (the 0082 lesson — Supabase default privileges
--    auto-grant table-level UPDATE, and a REVOKE from PUBLIC alone does not strip it) ─────
DO $grants$
DECLARE r TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        -- No DELETE anywhere: retire, never delete. No blanket UPDATE: re-granted by column.
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON fi_permit_types, '
                    || 'fi_permit_expiration_rule_groups, fi_permit_expiration_rules FROM %I', r);
      END IF;
    END LOOP;

    GRANT SELECT, INSERT ON fi_permit_types, fi_permit_expiration_rule_groups,
                            fi_permit_expiration_rules TO of_app;

    -- A rule VERSION is immutable except for being closed. effective_from, the term, the
    -- window and the grace period are NOT in this list on purpose — editing them would
    -- rewrite what the catalogue said on a date already relied upon.
    GRANT UPDATE (effective_to) ON fi_permit_expiration_rules TO of_app;

    GRANT UPDATE (name, updated_at) ON fi_permit_expiration_rule_groups TO of_app;

    -- The type is editable (that is the point of a department-authored catalogue) — but
    -- `code` is NOT, because it is the control value that issued permits were classified
    -- by, and `version` is not hand-set. Changing what a code MEANS is clone-and-retire.
    GRANT UPDATE (name, ifc_section, expiration_rule_group_id, fee_schedule_id,
                  requires_inspection, allow_renewal, portal_visibility, autonumber_prefix,
                  status, valid_from, valid_to, superseded_by_type_id, updated_at)
      ON fi_permit_types TO of_app;

    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO of_app;
  END IF;
END $grants$;

INSERT INTO of_schema_migrations (filename) VALUES ('0093-fi-permit-catalogue.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
