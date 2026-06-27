-- 0033-preplan-tactical-sketch.sql
-- Adds pre_plans."tacticalSketch" — durable, server-side storage for the iPad
-- tactical sketch (vector strokes, stored as JSON text).
--
-- WHY: before this, a tactical sketch drawn on the apparatus-mounted iPad
-- (OpenFirehouseMobile pre-plans.tsx) was saved to LOCAL device SQLite ONLY
-- (writeCache) — it was never synced, never archived in the DB, not visible to
-- the web app or any other device, and LOST if the device was wiped/replaced.
-- Departments need this field-authored data archived and accessible. Storing the
-- stroke JSON on the pre-plan row fixes that, reusing the existing
-- PATCH /api/pre-plans/:id route + the mobile offline sync queue
-- (the mobile app sends the field as `tacticalSketch`).
--
-- SHAPE: a JSON array of stroke objects (kept as re-editable vectors, NOT a
-- flattened PNG, so the sketch can be re-opened/edited and rendered on the web
-- later). Defaults to '[]'.
--
-- SAFETY: idempotent (ADD COLUMN IF NOT EXISTS). Fresh installs get the column
-- via db.js (pre_plans CREATE TABLE). RLS is unaffected — this is an additive
-- column on pre_plans, which is already protected by its dept_isolation policy;
-- no new policy or grant is required (of_app already holds UPDATE on pre_plans).

ALTER TABLE public.pre_plans ADD COLUMN IF NOT EXISTS "tacticalSketch" TEXT DEFAULT '[]';

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0033-preplan-tactical-sketch.sql')
ON CONFLICT (filename) DO NOTHING;
