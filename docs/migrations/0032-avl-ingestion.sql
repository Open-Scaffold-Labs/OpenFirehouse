-- 0032-avl-ingestion.sql — hardware AVL / vehicle-location ingestion (ADR-0003).
--
-- Lets a department forward its existing in-vehicle AVL feed (truck modem / GPS
-- gateway / vendor cloud) into OF's command map, login-independent — mirroring
-- the CAD ingestion auth model (per-dept webhook secret + SECURITY DEFINER
-- resolver). The location store/realtime/map are already source-agnostic, so
-- this only adds the receiving side.
--
-- Apply to prod by hand (Supabase) AND it is mirrored into db.js for fresh
-- installs. RLS + the DEFINER fn are the security surface — review before prod.

-- ── Per-department AVL connection (one per feed; secret stored hashed) ────────
CREATE TABLE IF NOT EXISTS public.avl_connections (
  id                  SERIAL PRIMARY KEY,
  department_id       INTEGER NOT NULL,
  name                TEXT NOT NULL DEFAULT 'AVL Feed',
  vendor_id           TEXT NOT NULL DEFAULT 'generic',   -- adapter key: generic | nmea | <vendor>
  status              TEXT NOT NULL DEFAULT 'Active',     -- Active | Inactive | revoked
  webhook_secret_hash TEXT,                               -- sha256 of the shared secret
  field_map           TEXT NOT NULL DEFAULT '{}',         -- optional per-feed field overrides (JSON)
  last_fix_at         TIMESTAMPTZ,
  fixes_ingested      INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_avl_connections_dept   ON public.avl_connections(department_id);
CREATE INDEX IF NOT EXISTS idx_avl_connections_secret ON public.avl_connections(webhook_secret_hash);

-- ── Hardware device -> apparatus mapping (one row per tracked unit) ───────────
CREATE TABLE IF NOT EXISTS public.avl_devices (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  device_ref    TEXT NOT NULL,            -- modem/GPS unit id, or the feed's unit reference
  apparatus_id  INTEGER NOT NULL,
  label         TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'Active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, device_ref)
);
CREATE INDEX IF NOT EXISTS idx_avl_devices_dept ON public.avl_devices(department_id);

-- ── Secret -> department resolver (bypasses RLS; the feed is unauthenticated) ─
-- Mirrors of_cad_connection_by_webhook_secret. EXECUTE to of_app only.
CREATE OR REPLACE FUNCTION public.of_avl_connection_by_webhook_secret(p_secret_hash text)
  RETURNS TABLE (connection_id integer, department_id integer, vendor_id text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $fn$ SELECT id, department_id, vendor_id FROM public.avl_connections
          WHERE webhook_secret_hash = p_secret_hash
            AND COALESCE(status,'') NOT IN ('Inactive','disabled','revoked')
          ORDER BY id DESC LIMIT 1 $fn$;

DO $do$
  DECLARE r text; f text := 'public.of_avl_connection_by_webhook_secret(text)';
  BEGIN
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
      FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r); END IF;
      END LOOP;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO of_app', f); END IF;
    END IF;
  END $do$;

-- ── RLS dept_isolation (app runs as of_app; owner bypasses for migrations) ────
ALTER TABLE public.avl_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avl_devices     ENABLE ROW LEVEL SECURITY;

DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='avl_connections' AND policyname='dept_isolation') THEN
    CREATE POLICY dept_isolation ON public.avl_connections FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='avl_devices' AND policyname='dept_isolation') THEN
    CREATE POLICY dept_isolation ON public.avl_devices FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);
  END IF;
END $do$;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
    -- DELETE included: routes/avlAdmin.js DELETE /connections/:id is a hard
    -- delete. Without it, delete works locally (owner role) but 500s on prod
    -- under of_app. (Dale review 2026-07-04.) RLS dept_isolation still scopes
    -- which rows are deletable.
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.avl_connections TO of_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.avl_devices TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.avl_connections_id_seq TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.avl_devices_id_seq TO of_app;
  END IF;
END $do$;

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0032-avl-ingestion.sql')
ON CONFLICT (filename) DO NOTHING;
