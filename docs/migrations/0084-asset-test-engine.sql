-- 0084 — Phase 2.3 generic asset-test engine (tracked assets + per-dept test types +
-- finalized test events). Spec: docs/PHASE2-ASSET-TESTS-SPEC-2026-07-26.md. Claimed from
-- Phase 2's §5b block and pushed as a stub (`fb04f83`).
--
-- Standards bar: ONE engine, N schedules per (target × test type) — the SCBA dual-clock
-- (DOT hydro anchored to last requal vs composite 15-yr life from manufacture) proves the
-- shape. Result and lifecycle status are SEPARATE closed axes; a FAIL proposes, a human
-- dispositions (no vendor auto-condemns — the ceiling). Retirement clocks are alert-only.
-- UNRECORDED result exists ONLY for legacy imports (a known date, an unrecorded outcome —
-- never a fabricated PASS).
--
-- Records: asset_test_events are FINAL (no UPDATE grant; chief-only reasoned soft delete);
-- tracked_assets/asset_test_types soft-delete only (no DELETE grant). Per-role revoke
-- sweep incl. table-level UPDATE strip on events (the 0082 default-privileges lesson).
--
-- D6: applied to prod by hand → ledgered → four live probes → THEN code.

BEGIN;

-- ── tracked_assets — serialized, individually-tested items (pumps ride apparatus) ──
CREATE TABLE IF NOT EXISTS public.tracked_assets (
  id                  SERIAL PRIMARY KEY,
  department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  station_id          INTEGER,
  family              TEXT NOT NULL
                        CONSTRAINT tracked_assets_family_chk
                        CHECK (family IN ('scba','hose','ladder','ppe','other')),
  name                TEXT NOT NULL,
  serial              TEXT NOT NULL DEFAULT '',
  identity            JSONB NOT NULL DEFAULT '{}',
  manufacture_date    DATE,
  manufacture_year    INTEGER,          -- legacy year-only imports; never silently faked into a date
  in_service_date     DATE,
  assigned_member_id  INTEGER REFERENCES public.members(id) ON DELETE SET NULL,
  apparatus_id        INTEGER REFERENCES public.apparatus(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'in_service'
                        CONSTRAINT tracked_assets_status_chk
                        CHECK (status IN ('in_service','out_of_service','condemned','retired')),
  status_reason       TEXT NOT NULL DEFAULT '',
  retirement_months   INTEGER,
  retirement_advisory BOOLEAN NOT NULL DEFAULT FALSE,
  notes               TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tracked_assets_department ON public.tracked_assets(department_id, family, status);

-- ── asset_test_types — per-dept cadence config (seeded table-stakes on first read) ──
CREATE TABLE IF NOT EXISTS public.asset_test_types (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  station_id    INTEGER,
  name          TEXT NOT NULL,
  family        TEXT NOT NULL
                  CONSTRAINT asset_test_types_family_chk
                  CHECK (family IN ('scba','hose','ladder','ppe','pump','other')),
  target        TEXT NOT NULL DEFAULT 'asset'
                  CONSTRAINT asset_test_types_target_chk CHECK (target IN ('asset','apparatus')),
  interval_days INTEGER NOT NULL
                  CONSTRAINT asset_test_types_interval_chk CHECK (interval_days BETWEEN 1 AND 7300),
  anchor        TEXT NOT NULL DEFAULT 'last_event'
                  CONSTRAINT asset_test_types_anchor_chk
                  CHECK (anchor IN ('last_event','manufacture','in_service')),
  first_anchor  TEXT
                  CONSTRAINT asset_test_types_first_anchor_chk
                  CHECK (first_anchor IS NULL OR first_anchor IN ('manufacture','in_service')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_asset_test_types_department ON public.asset_test_types(department_id, family, active);

-- ── asset_test_events — the FINALIZED test record ──
CREATE TABLE IF NOT EXISTS public.asset_test_events (
  id                   SERIAL PRIMARY KEY,
  department_id        INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  station_id           INTEGER,
  test_type_id         INTEGER NOT NULL REFERENCES public.asset_test_types(id) ON DELETE RESTRICT,
  asset_id             INTEGER REFERENCES public.tracked_assets(id) ON DELETE CASCADE,
  apparatus_id         INTEGER REFERENCES public.apparatus(id) ON DELETE CASCADE,
  event_date           DATE NOT NULL,
  result               TEXT NOT NULL
                         CONSTRAINT asset_test_events_result_chk
                         CHECK (result IN ('PASS','FAIL','NOT_COMPLETED','UNRECORDED')),
  performed_by_user_id INTEGER,
  performed_by_name    TEXT NOT NULL DEFAULT '',
  outside_company      TEXT NOT NULL DEFAULT '',
  pressure_used        NUMERIC(6,0),
  readings             JSONB,
  note                 TEXT NOT NULL DEFAULT '',
  recorded_by_user_id  INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ,
  CONSTRAINT asset_test_events_one_target_chk
    CHECK ((asset_id IS NOT NULL)::int + (apparatus_id IS NOT NULL)::int = 1)
);
CREATE INDEX IF NOT EXISTS idx_asset_test_events_department ON public.asset_test_events(department_id);
CREATE INDEX IF NOT EXISTS idx_asset_test_events_target
  ON public.asset_test_events(test_type_id, asset_id, apparatus_id, event_date DESC);

-- ── RLS dept_isolation ──
DO $$
  DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tracked_assets','asset_test_types','asset_test_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
    EXECUTE format($p$CREATE POLICY dept_isolation ON public.%I FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)$p$, t);
  END LOOP;
END $$;

COMMENT ON TABLE public.asset_test_events IS
  'Finalized NFPA-family test records (Phase 2.3). FINAL: no UPDATE grant; chief-only '
  'reasoned soft delete. UNRECORDED = legacy-import only (a known date with no recorded '
  'outcome — never a fabricated PASS). A FAIL never changes the asset''s status: the '
  'disposition door on tracked_assets is a separate, reasoned, mechanic/chief human act.';
COMMENT ON TABLE public.tracked_assets IS
  'Serialized tested items (Phase 2.3): SCBA cylinders, hose lengths, ladders, PPE. Pumps '
  'are apparatus. Lifecycle status is a closed set; retirement clocks are ALERT-ONLY.';

-- ── Grants + per-role revoke sweep ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.tracked_assets TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.tracked_assets_id_seq TO of_app;
    GRANT SELECT, INSERT, UPDATE ON public.asset_test_types TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.asset_test_types_id_seq TO of_app;
    GRANT SELECT, INSERT ON public.asset_test_events TO of_app;
    GRANT UPDATE (deleted_at) ON public.asset_test_events TO of_app;   -- soft delete ONLY
    GRANT USAGE, SELECT ON SEQUENCE public.asset_test_events_id_seq TO of_app;
  END IF;
END $$;

DO $$
  DECLARE r text;
BEGIN
  REVOKE UPDATE, DELETE ON public.asset_test_events FROM PUBLIC;
  REVOKE DELETE ON public.tracked_assets, public.asset_test_types FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON public.asset_test_events FROM %I', r);
      EXECUTE format('REVOKE DELETE ON public.tracked_assets, public.asset_test_types FROM %I', r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
    GRANT UPDATE (deleted_at) ON public.asset_test_events TO of_app;
  END IF;
END $$;

-- ── Data migration: cylinders → tracked_assets + UNRECORDED anchor events ──
-- manufacture_year carried AS a year (manufacture_date stays NULL — the life clock reports
-- "not recorded" rather than a fabricated date). Hydro/inspection dates become UNRECORDED
-- events under per-dept seeded SCBA test types so the due clocks anchor on real history.
DO $$
  DECLARE c RECORD; aid INT; flow_type INT; hydro_type INT; d TEXT;
BEGIN
  FOR c IN SELECT * FROM public.cylinders LOOP
    IF EXISTS (SELECT 1 FROM public.tracked_assets t
                WHERE t.department_id = c.department_id AND t.family = 'scba'
                  AND t.notes LIKE '%[migrated cylinder #' || c.id || ']%') THEN
      CONTINUE;  -- idempotent
    END IF;
    -- Seed the two SCBA types for this dept if absent (the route also seeds on read).
    SELECT id INTO flow_type FROM public.asset_test_types
     WHERE department_id = c.department_id AND family = 'scba' AND name = 'SCBA flow test' AND deleted_at IS NULL LIMIT 1;
    IF flow_type IS NULL THEN
      INSERT INTO public.asset_test_types (department_id, station_id, name, family, target, interval_days, anchor)
      VALUES (c.department_id, c.station_id, 'SCBA flow test', 'scba', 'asset', 365, 'last_event')
      RETURNING id INTO flow_type;
    END IF;
    SELECT id INTO hydro_type FROM public.asset_test_types
     WHERE department_id = c.department_id AND family = 'scba' AND name = 'Cylinder hydrostatic test' AND deleted_at IS NULL LIMIT 1;
    IF hydro_type IS NULL THEN
      INSERT INTO public.asset_test_types (department_id, station_id, name, family, target, interval_days, anchor)
      VALUES (c.department_id, c.station_id, 'Cylinder hydrostatic test', 'scba', 'asset', 1825, 'last_event')
      RETURNING id INTO hydro_type;
    END IF;

    INSERT INTO public.tracked_assets
      (department_id, station_id, family, name, serial, identity, manufacture_year,
       status, retirement_months, notes)
    VALUES
      (c.department_id, c.station_id, 'scba',
       COALESCE(NULLIF(c."unitId",''), 'Cylinder ' || c.id),
       COALESCE(c.serial,''),
       jsonb_strip_nulls(jsonb_build_object(
         'make', NULLIF(c.make,''), 'model', NULLIF(c.model,''), 'size', NULLIF(c.size,''),
         'material', NULLIF(c.material,''), 'max_pressure', c."maxPressure")),
       c."manufactureYear",
       CASE WHEN LOWER(COALESCE(c.status,'')) LIKE 'out%' THEN 'out_of_service' ELSE 'in_service' END,
       CASE WHEN LOWER(COALESCE(c.material,'')) LIKE '%carbon%' OR LOWER(COALESCE(c.material,'')) LIKE '%composite%'
            THEN 180 ELSE NULL END,
       COALESCE(c.notes,'') || ' [migrated cylinder #' || c.id || ']')
    RETURNING id INTO aid;

    d := NULLIF(LEFT(COALESCE(c."lastHydroDate",''), 10), '');
    IF d IS NOT NULL AND d ~ '^\d{4}-\d{2}-\d{2}$' THEN
      INSERT INTO public.asset_test_events
        (department_id, station_id, test_type_id, asset_id, event_date, result, note)
      VALUES (c.department_id, c.station_id, hydro_type, aid, d::date, 'UNRECORDED',
              'Migrated from the legacy cylinder record — date only; outcome was not recorded.');
    END IF;
    d := NULLIF(LEFT(COALESCE(c."lastInspectionDate",''), 10), '');
    IF d IS NOT NULL AND d ~ '^\d{4}-\d{2}-\d{2}$' THEN
      INSERT INTO public.asset_test_events
        (department_id, station_id, test_type_id, asset_id, event_date, result, note)
      VALUES (c.department_id, c.station_id, flow_type, aid, d::date, 'UNRECORDED',
              'Migrated from the legacy cylinder record — date only; outcome was not recorded.');
    END IF;
  END LOOP;
END $$;

-- Stamp the ledger.
INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0084-asset-test-engine.sql', NOW());

COMMIT;
