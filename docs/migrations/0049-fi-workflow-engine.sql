-- 0049 — Prevention Core Phase 2: workflow-engine substrate (2026-07-12)
--
--   fi_designations        — the rank-INDEPENDENT prevention permission model
--                            (Matt's bureau requirement + incumbent research §7.1):
--                            prevention bureaus are often separate entities from
--                            suppression; inspectors are a GRANTED list — any user,
--                            any rank, including non-active/civilian personnel.
--                            roles: 'inspector' | 'prevention_admin'. Revoke = set
--                            revoked_at (grant history is a record, never erased).
--   fi_inspection_answers  — the checklist findings on a completed inspection
--                            (IFC §104.6 "showing the findings"). Answers SNAPSHOT
--                            the prompt + code at answer time — a later checklist
--                            edit must never rewrite what an inspector answered
--                            (items are replace-wholesale, so item_id is SET NULL
--                            and the snapshot is the durable record).
--   fi_settings            — per-department prevention toggles (own table, NOT
--                            departments columns — deliberate: the departments
--                            surface was under active edit by a concurrent session,
--                            and these are prevention-module concerns):
--                              allow_crew_inspections (default TRUE — engine-company
--                                inspections are a first-class incumbent workflow;
--                                strict bureau-only departments turn it off)
--                              admin_only_commit (default FALSE — the incumbent
--                                "only administrators may commit inspections" toggle)
--
-- All dept-scoped + dept_isolation RLS + dept indexes. Applied by hand; the
-- fresh-install db.js mirror joins the existing follow-up queue (db.js under
-- concurrent edit again; live DBs get schema from this file). Idempotent.

CREATE TABLE IF NOT EXISTS fi_designations (
  id                 SERIAL PRIMARY KEY,
  department_id      INTEGER NOT NULL,
  user_id            INTEGER NOT NULL,
  role               TEXT NOT NULL CHECK (role IN ('inspector','prevention_admin')),
  granted_by_user_id INTEGER,
  granted_by         TEXT NOT NULL DEFAULT '',
  granted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at         TIMESTAMPTZ,
  revoked_by         TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fi_designations_dept ON fi_designations (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_designations_user ON fi_designations (department_id, user_id) WHERE revoked_at IS NULL;
-- One ACTIVE grant per user+role per department (history rows keep revoked_at).
CREATE UNIQUE INDEX IF NOT EXISTS uq_fi_designations_active
  ON fi_designations (department_id, user_id, role) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS fi_inspection_answers (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  inspection_id INTEGER NOT NULL REFERENCES fi_inspections(id) ON DELETE RESTRICT,
  checklist_id  INTEGER REFERENCES fi_checklists(id) ON DELETE SET NULL,
  item_id       INTEGER REFERENCES fi_checklist_items(id) ON DELETE SET NULL,
  prompt        TEXT NOT NULL,                 -- snapshot at answer time
  code_snapshot TEXT NOT NULL DEFAULT '',      -- bound code at answer time ('' = unbound)
  answer        TEXT NOT NULL CHECK (answer IN ('yes','no','na')),
  position      INTEGER NOT NULL DEFAULT 0,
  answered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fi_answers_dept ON fi_inspection_answers (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_answers_insp ON fi_inspection_answers (inspection_id);

CREATE TABLE IF NOT EXISTS fi_settings (
  department_id          INTEGER PRIMARY KEY,
  allow_crew_inspections BOOLEAN NOT NULL DEFAULT TRUE,
  admin_only_commit      BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fi_designations','fi_inspection_answers','fi_settings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
    EXECUTE format($p$CREATE POLICY dept_isolation ON public.%I FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)$p$, t);
  END LOOP;
END $$;
