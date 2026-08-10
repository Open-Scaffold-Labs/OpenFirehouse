-- 0047 — Prevention Core Phase 1: fire-inspection data model v2 (2026-07-12)
--
-- Six new tables, all department-scoped with dept_isolation RLS (same policy SQL
-- as 0015/0016/0023/0043) and a leading department_id index:
--
--   fi_violations       — violations as first-class rows (the incumbent date
--                         ladder), materialized from fi_inspections.violations.
--                         PHASE-1 AUTHORITY NOTE: the JSON array on fi_inspections
--                         remains the API contract and the write source; these rows
--                         are a queryable mirror kept in exact sync at the route
--                         write chokepoint (utils/fiViolationSync.js). Phase 2
--                         flips authority to the rows.
--   fi_code_library     — dept-editable citable sections (section number + short
--                         title + optional deep link + dept remediation text).
--                         NO copyrighted code text is ever shipped or seeded.
--   fi_inspection_types — schedulable inspection types w/ default frequency.
--   fi_checklists /
--   fi_checklist_items  — per-type checklists; items optionally pre-bound to a
--                         code-library entry (the incumbents' indirection layer).
--   fi_notices          — generated notice record (append-only; PDF path etc.).
--   fi_signatures       — occupant/inspector signature records (append-only).
--
-- FK doctrine: fi_violations/fi_notices/fi_signatures → fi_inspections is
-- ON DELETE RESTRICT (legal records never vanish via a cascade; the legal path is
-- soft-delete which touches nothing). fi_checklist_items → fi_checklists CASCADEs
-- (configuration composition, not a record). code_ref SET NULL (retiring a code
-- must not delete checklist items).
--
-- Applied by hand (Supabase MCP) AND to be mirrored in db.js for fresh installs
-- (mirror deferred to a follow-up commit — db.js was mid-edit by a concurrent
-- session at ship time; prod + local get the schema from THIS file regardless).
-- Idempotent.

-- ── fi_violations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fi_violations (
  id             SERIAL PRIMARY KEY,
  department_id  INTEGER NOT NULL,
  inspection_id  INTEGER NOT NULL REFERENCES fi_inspections(id) ON DELETE RESTRICT,
  violation_key  TEXT    NOT NULL,             -- the stable id from the array (UUID | position-string)
  position       INTEGER NOT NULL DEFAULT 0,   -- array order (shape-stable serialization)
  code           TEXT,
  description    TEXT,
  severity       TEXT,
  status         TEXT    NOT NULL DEFAULT 'Open',
  status_raw     TEXT,                         -- inspector's original word (never overwritten)
  notes          TEXT,
  -- The incumbent date ladder (legacy blob maps: correctedDate→repaired_date,
  -- followUpDate→next_recheck_date; the rest arrive with the Phase-2 workflow):
  reported_date        DATE,
  sched_recheck_date   DATE,
  actual_recheck_date  DATE,
  next_recheck_date    DATE,
  repaired_date        DATE,
  imminent_hazard  BOOLEAN NOT NULL DEFAULT FALSE,
  carried_from_key TEXT,                       -- reinspection lineage (Phase 2)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (inspection_id, violation_key)
);
CREATE INDEX IF NOT EXISTS idx_fi_violations_dept        ON fi_violations (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_violations_dept_status ON fi_violations (department_id, status) WHERE deleted_at IS NULL;

-- ── fi_code_library ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fi_code_library (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  code          TEXT NOT NULL,                 -- the short citable code shown in the field ('1001')
  title         TEXT NOT NULL DEFAULT '',      -- short paraphrased title (never copyrighted text)
  category      TEXT NOT NULL DEFAULT '',
  code_body     TEXT NOT NULL DEFAULT '',      -- e.g. 'IFC', 'NFPA 1', 'Local Ordinance'
  edition       TEXT NOT NULL DEFAULT '',      -- e.g. '2018'
  section       TEXT NOT NULL DEFAULT '',      -- e.g. '1031.2'
  link_url      TEXT NOT NULL DEFAULT '',      -- deep link to a FREE official viewer
  remediation_text TEXT NOT NULL DEFAULT '',   -- dept-authored corrective wording
  active        BOOLEAN NOT NULL DEFAULT TRUE, -- retire-don't-delete
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (department_id, code)
);
CREATE INDEX IF NOT EXISTS idx_fi_code_library_dept ON fi_code_library (department_id);

-- ── fi_inspection_types ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fi_checklists (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  name          TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_fi_checklists_dept ON fi_checklists (department_id);

CREATE TABLE IF NOT EXISTS fi_inspection_types (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  name          TEXT NOT NULL,
  default_frequency_days INTEGER,              -- completing one schedules the next (Phase 2)
  default_checklist_id   INTEGER REFERENCES fi_checklists(id) ON DELETE SET NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE, -- retire-don't-delete
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (department_id, name)
);
CREATE INDEX IF NOT EXISTS idx_fi_inspection_types_dept ON fi_inspection_types (department_id);

CREATE TABLE IF NOT EXISTS fi_checklist_items (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  checklist_id  INTEGER NOT NULL REFERENCES fi_checklists(id) ON DELETE CASCADE,
  prompt        TEXT NOT NULL,
  code_ref_id   INTEGER REFERENCES fi_code_library(id) ON DELETE SET NULL,
  required      BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fi_checklist_items_dept ON fi_checklist_items (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_checklist_items_list ON fi_checklist_items (checklist_id);

-- ── fi_notices (append-only) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fi_notices (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  inspection_id INTEGER NOT NULL REFERENCES fi_inspections(id) ON DELETE RESTRICT,
  storage_path  TEXT NOT NULL DEFAULT '',
  generated_by_user_id INTEGER,
  generated_by  TEXT NOT NULL DEFAULT '',
  sent_to       TEXT NOT NULL DEFAULT '',
  sent_at       TIMESTAMPTZ,
  method        TEXT NOT NULL DEFAULT '',      -- email | print | personal | certified_mail | posting
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fi_notices_dept ON fi_notices (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_notices_insp ON fi_notices (inspection_id);

-- ── fi_signatures (append-only) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fi_signatures (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  inspection_id INTEGER NOT NULL REFERENCES fi_inspections(id) ON DELETE RESTRICT,
  role          TEXT NOT NULL CHECK (role IN ('occupant','inspector')),
  signer_name   TEXT NOT NULL DEFAULT '',
  storage_path  TEXT NOT NULL DEFAULT '',
  signed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fi_signatures_dept ON fi_signatures (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_signatures_insp ON fi_signatures (inspection_id);

-- ── dept_isolation RLS on all six (matches 0015/0023/0043 pattern) ────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fi_violations','fi_code_library','fi_inspection_types',
                           'fi_checklists','fi_checklist_items','fi_notices','fi_signatures'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
    EXECUTE format($p$CREATE POLICY dept_isolation ON public.%I FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)$p$, t);
  END LOOP;
END $$;

-- ── Backfill: materialize rows from every existing violations blob ────────────
-- Statuses are canonicalized here exactly as constants/violationStatus.js does
-- (unknown → 'Open', fail-open) with the original word preserved in status_raw.
-- Dates only cast when they look like dates (legacy fields are free TEXT).
INSERT INTO fi_violations (
  department_id, inspection_id, violation_key, position, code, description,
  severity, status, status_raw, notes, next_recheck_date, repaired_date
)
SELECT
  fi.department_id,
  fi.id,
  COALESCE(t.elem->>'id', (t.ord - 1)::text),
  (t.ord - 1)::int,
  t.elem->>'code',
  t.elem->>'description',
  t.elem->>'severity',
  CASE lower(trim(COALESCE(t.elem->>'status','')))
    WHEN 'open' THEN 'Open' WHEN 'new violation' THEN 'Open' WHEN 'unabated' THEN 'Open'
    WHEN 'pending' THEN 'Open' WHEN 'recommended' THEN 'Open'
    WHEN 'corrected' THEN 'Corrected' WHEN 'abated' THEN 'Corrected'
    WHEN 'withdrawn' THEN 'Withdrawn' WHEN 'void' THEN 'Withdrawn'
    WHEN 'time extension' THEN 'Time Extension'
    ELSE 'Open' END,
  COALESCE(t.elem->>'status_raw',
    CASE WHEN lower(trim(COALESCE(t.elem->>'status',''))) IN
              ('open','corrected','withdrawn','time extension') THEN NULL
         ELSE t.elem->>'status' END),
  t.elem->>'notes',
  CASE WHEN (t.elem->>'followUpDate')  ~ '^\d{4}-\d{2}-\d{2}' THEN substring(t.elem->>'followUpDate'  from 1 for 10)::date END,
  CASE WHEN (t.elem->>'correctedDate') ~ '^\d{4}-\d{2}-\d{2}' THEN substring(t.elem->>'correctedDate' from 1 for 10)::date END
FROM fi_inspections fi,
     LATERAL jsonb_array_elements(fi.violations::jsonb) WITH ORDINALITY AS t(elem, ord)
WHERE fi.violations IS NOT NULL AND fi.violations <> '[]'
ON CONFLICT (inspection_id, violation_key) DO NOTHING;
