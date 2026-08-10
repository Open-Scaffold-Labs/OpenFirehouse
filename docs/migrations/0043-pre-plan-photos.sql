-- 0043-pre-plan-photos.sql  (T.10: pre-plan photos — first-class photo model)
--
-- pre_plan_photos: one row per photo attached to a pre-incident plan. The photo
-- BYTES live in the private `preplan-photos` Supabase Storage bucket (path
-- {department_id}/{plan_id}/{uuid}.{ext}); this table is the source of truth for
-- METADATA: caption, category, uploader, ordering, primary flag. A DB-backed
-- model (vs. storage-listing, the older prePlanAttachments pattern) is what makes
-- photos first-class: captioned at capture ("FDC — rear alley, NE corner"),
-- categorized (fdc / knox_box / access / utilities / water_supply / hazard /
-- general), and countable in ONE indexed query when Size-Up surfaces a matched
-- plan at dispatch. Categories are APP-validated (routes/prePlanPhotos.js), not a
-- CHECK constraint — same convention as db.UNIT_STATUS_VALUES.
--
-- Dept-scoped + RLS (dept_isolation) like every OF tenant table (the app connects
-- as the non-owner of_app role; the dept GUC is set per request). Idempotent.
-- Apply to prod by hand (Supabase MCP) + mirror in db.js + stamp of_schema_migrations.
--
-- ONE-TIME COMPANION STEP (not SQL-in-this-file): create the PRIVATE storage
-- bucket `preplan-photos` in the OF Supabase project (dashboard or MCP), matching
-- how `preplan-attachments` / `inspection-photos` were created. Uploads 500 until
-- the bucket exists.

CREATE TABLE IF NOT EXISTS public.pre_plan_photos (
  id            SERIAL PRIMARY KEY,
  plan_id       INTEGER NOT NULL REFERENCES public.pre_plans(id) ON DELETE CASCADE,
  station_id    INTEGER NOT NULL,
  department_id INTEGER NOT NULL,
  storage_path  TEXT NOT NULL UNIQUE,
  caption       TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'general',
  mimetype      TEXT NOT NULL DEFAULT '',
  size_bytes    INTEGER,
  uploaded_by   TEXT NOT NULL DEFAULT '',
  taken_at      TIMESTAMPTZ,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Hot reads: the plan's ordered photo strip + the Size-Up photo count.
CREATE INDEX IF NOT EXISTS idx_pre_plan_photos_plan ON public.pre_plan_photos(plan_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_pre_plan_photos_dept ON public.pre_plan_photos(department_id);

-- Department-isolation RLS (matches the 0006 uniform policy; 0023 pattern).
ALTER TABLE public.pre_plan_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.pre_plan_photos;
CREATE POLICY dept_isolation ON public.pre_plan_photos FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pre_plan_photos TO of_app;
GRANT USAGE, SELECT ON SEQUENCE public.pre_plan_photos_id_seq TO of_app;
