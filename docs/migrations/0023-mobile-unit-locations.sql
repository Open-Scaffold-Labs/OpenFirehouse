-- 0023-mobile-unit-locations.sql  (Phase 1: live rig GPS + Expo push tokens)
--
-- Two new OF tenant tables for the OpenFirehouse Mobile client:
--   unit_locations   — one live GPS row per apparatus (upsert pattern); drives the
--                      live dispatch-map dots on web + mobile.
--   expo_push_tokens — Expo push tokens per user/device. Created now so the mobile
--                      migration is atomic; the push fan-out lands in Phase 3.
--
-- Both are department-scoped + RLS (dept_isolation), matching every OF tenant table
-- (the app connects as the non-owner of_app role; the dept GUC is set per request).
-- Idempotent. Apply to prod via Supabase MCP + mirror in db.js + stamp the ledger.

CREATE TABLE IF NOT EXISTS public.unit_locations (
  id            SERIAL PRIMARY KEY,
  apparatus_id  INTEGER NOT NULL REFERENCES public.apparatus(id) ON DELETE CASCADE,
  station_id    INTEGER NOT NULL,
  department_id INTEGER NOT NULL,
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  heading       REAL,
  speed         REAL,
  accuracy      REAL,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
-- One row per apparatus (the upsert target).
CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_locations_apparatus ON public.unit_locations(apparatus_id);
-- Hot read: "active in the last 5 min for this department".
CREATE INDEX IF NOT EXISTS idx_unit_locations_dept_updated ON public.unit_locations(department_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.expo_push_tokens (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  station_id    INTEGER NOT NULL,
  department_id INTEGER NOT NULL,
  token         TEXT NOT NULL UNIQUE,
  device_name   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expo_push_tokens_dept ON public.expo_push_tokens(department_id);

-- Department-isolation RLS (matches the 0006 uniform policy).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['unit_locations','expo_push_tokens'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY dept_isolation ON public.%I FOR ALL '
      'USING (department_id = (NULLIF(current_setting(''app.department_id'', true), ''''))::integer) '
      'WITH CHECK (department_id = (NULLIF(current_setting(''app.department_id'', true), ''''))::integer)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO of_app', t);
  END LOOP;
END $$;

GRANT USAGE, SELECT ON SEQUENCE public.unit_locations_id_seq   TO of_app;
GRANT USAGE, SELECT ON SEQUENCE public.expo_push_tokens_id_seq TO of_app;
