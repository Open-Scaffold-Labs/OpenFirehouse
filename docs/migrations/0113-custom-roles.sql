-- 0113-custom-roles.sql
-- Phase 5 (5.7) — department-authored custom roles.
--
-- MARKET BAR (competitor-shipping inventory, 12 fire/EMS RMS, 2026-07-26):
-- 6 of 12 ship custom role authoring — including all three head vendors AND one
-- of the low-cost tail products we compete with directly. Of the products where
-- it was verifiable it is 6 yes / 3 fixed-only. This is NOT the TTS case (0/12).
--
-- Copied from the market, deliberately:
--   * BUILT-IN ROLES STAY AND CANNOT BE DELETED. One competitor documents this
--     explicitly ("You cannot delete roles… including ones you create"). We take
--     the safer half: built-ins are undeletable and uneditable; custom roles are
--     deletable, but only while nobody holds them.
--   * PERMISSION GROUPS + PER-USER OVERRIDE is the deepest shipped model. We
--     already have the override half (fleet_maintenance 0083, cs_manager 0087) —
--     this adds the group half. The two compose; neither replaces the other.
--   * The permission atom is the PAGE, matching our existing PAGE_ACCESS surface
--     and the module/page granularity the fire-side products describe. Field-level
--     permissions are a police-RMS trait and are NOT copied.
--
-- SECURITY PROPERTIES BAKED INTO THE SCHEMA (not left to the app):
--   * `level` is CHECKed to 1..3. A custom role can never be level 0 (which would
--     be meaningless) nor exceed chief.
--   * (department_id, key) is UNIQUE, so one department's role names can never
--     collide with another's, and a role is meaningless outside its department.
--   * `is_builtin` rows are protected by a TRIGGER, not by app politeness — the
--     database itself refuses to update or delete them.
--   * `pages` is a JSONB ARRAY of page ids. An empty array is a valid, useful
--     value: a role that can sign in and reach nothing.

CREATE TABLE IF NOT EXISTS of_roles (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  key           TEXT    NOT NULL,
  label         TEXT    NOT NULL,
  -- The base level the EXISTING server gates (requireOfficer/requireChief) read.
  -- Custom roles must resolve to a level or every level-based gate in the app
  -- would have to be rewritten — this is what keeps the change additive.
  level         INTEGER NOT NULL DEFAULT 1,
  pages         JSONB   NOT NULL DEFAULT '[]'::jsonb,
  is_builtin    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT of_roles_level_ck CHECK (level BETWEEN 1 AND 3),
  CONSTRAINT of_roles_pages_is_array_ck CHECK (jsonb_typeof(pages) = 'array'),
  CONSTRAINT of_roles_key_shape_ck CHECK (key ~ '^[a-z][a-z0-9_]{1,38}$'),
  CONSTRAINT of_roles_dept_key_uniq UNIQUE (department_id, key)
);

CREATE INDEX IF NOT EXISTS idx_of_roles_dept ON of_roles (department_id);

-- Built-in protection enforced by the DATABASE. The app also refuses, but an app
-- guard is a promise and a trigger is a fact.
CREATE OR REPLACE FUNCTION of_roles_protect_builtin() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.is_builtin) THEN
    RAISE EXCEPTION 'built-in roles cannot be deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF (TG_OP = 'UPDATE' AND OLD.is_builtin) THEN
    RAISE EXCEPTION 'built-in roles cannot be modified' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_of_roles_protect_builtin ON of_roles;
CREATE TRIGGER trg_of_roles_protect_builtin
  BEFORE UPDATE OR DELETE ON of_roles
  FOR EACH ROW EXECUTE FUNCTION of_roles_protect_builtin();

-- Tenant isolation, same policy name as every other tenant table.
ALTER TABLE of_roles ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='of_roles' AND policyname='dept_isolation') THEN
    CREATE POLICY dept_isolation ON of_roles
      USING (department_id = NULLIF(current_setting('app.department_id', true), '')::int)
      WITH CHECK (department_id = NULLIF(current_setting('app.department_id', true), '')::int);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON of_roles TO of_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE of_roles_id_seq TO of_app';
  END IF;
END $$;

COMMENT ON TABLE  of_roles IS
  'Department-authored roles (Phase 5 / 5.7). Built-in rows mirror the code ladder and are trigger-protected from update/delete. Custom rows are department-scoped by RLS.';
COMMENT ON COLUMN of_roles.level IS
  'Base level 1..3 read by the existing requireOfficer/requireChief gates. Keeps custom roles additive rather than requiring every server gate to be rewritten.';
COMMENT ON COLUMN of_roles.pages IS
  'JSONB array of page ids this role may open. Empty array is valid and means: can sign in, can reach nothing.';
