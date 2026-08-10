-- 0083 — Phase 2.2 defect→work-order rebuild (defects + work orders + parts + notes + PM).
-- Spec: docs/PHASE2-WORKORDERS-SPEC-2026-07-26.md. Claimed from Phase 2's §5b block
-- (0083–0089) and pushed as a stub 2026-07-26 (`6f1cc62`).
--
-- Market bar (targeted pass 2026-07-26): defect = first-class entity separate from the WO
-- (dedupe-on-reflag rides on it); closed status enum w/ resolved TERMINAL (corrections = a
-- new WO referencing the old); priority display-only — NEVER drives status/OOS; NUMERIC
-- parts/labor line items; PM whichever-first anchored to last completion, due list only
-- (no auto-generation — the no-automation ceiling). Mechanic = users.fleet_maintenance
-- capability grant (§5 ruling 1 — never a role rung).
--
-- Records classification: work_order_notes = APPEND-ONLY (physical REVOKE U/D). Defects/WOs/
-- PM = operational records: no hard delete anywhere (per-role DELETE revoke; WO soft-delete
-- via deleted_at); terminal-WO immutability is ROUTE-level (UPDATE stays granted for
-- non-terminal edits — documented honestly; the D6 probe asserts the grants that ARE
-- physical). Per-role UPDATE/DELETE revokes throughout — the 0082 default-privileges lesson.
--
-- D6: applied to prod by hand (Supabase MCP) → ledgered → four live probes → THEN code.

BEGIN;

-- ── defects — the flagged problem (first-class; dedupe-on-reflag lives here) ──
CREATE TABLE IF NOT EXISTS public.defects (
  id                  SERIAL PRIMARY KEY,
  department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  station_id          INTEGER,
  apparatus_id        INTEGER NOT NULL REFERENCES public.apparatus(id) ON DELETE CASCADE,
  source              TEXT NOT NULL DEFAULT 'manual'
                        CONSTRAINT defects_source_chk CHECK (source IN ('check','manual')),
  check_id            INTEGER REFERENCES public.apparatus_checks(id) ON DELETE SET NULL,
  item_key            TEXT NOT NULL DEFAULT '',
  title               TEXT NOT NULL,
  detail              TEXT NOT NULL DEFAULT '',
  priority            TEXT NOT NULL DEFAULT 'routine'
                        CONSTRAINT defects_priority_chk
                        CHECK (priority IN ('routine','urgent','emergency')),
  status              TEXT NOT NULL DEFAULT 'open'
                        CONSTRAINT defects_status_chk
                        CHECK (status IN ('open','in_work','resolved','cancelled')),
  reported_by_user_id INTEGER,
  reported_by_name    TEXT NOT NULL DEFAULT '',
  resolution_kind     TEXT
                        CONSTRAINT defects_reskind_chk
                        CHECK (resolution_kind IS NULL OR resolution_kind IN ('work_order','manual')),
  resolution_note     TEXT NOT NULL DEFAULT '',
  resolved_at         TIMESTAMPTZ,
  resolved_by_user_id INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_defects_department ON public.defects(department_id, status);
-- Dedupe-on-reflag: one LIVE check-sourced defect per (dept, rig, item).
CREATE UNIQUE INDEX IF NOT EXISTS uq_defects_live_check_item
  ON public.defects(department_id, apparatus_id, item_key)
  WHERE status IN ('open','in_work') AND source = 'check' AND item_key <> '';

-- ── work_orders ──
CREATE TABLE IF NOT EXISTS public.work_orders (
  id                  SERIAL PRIMARY KEY,
  department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  station_id          INTEGER,
  apparatus_id        INTEGER REFERENCES public.apparatus(id) ON DELETE SET NULL,
  asset_label         TEXT NOT NULL DEFAULT '',
  defect_id           INTEGER REFERENCES public.defects(id) ON DELETE SET NULL,
  pm_schedule_id      INTEGER,   -- FK added after pm_schedules exists
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  priority            TEXT NOT NULL DEFAULT 'routine'
                        CONSTRAINT work_orders_priority_chk
                        CHECK (priority IN ('routine','urgent','emergency')),
  status              TEXT NOT NULL DEFAULT 'open'
                        CONSTRAINT work_orders_status_chk
                        CHECK (status IN ('open','in_progress','awaiting_parts','resolved','cancelled')),
  assigned_to_user_id INTEGER,
  assigned_to_name    TEXT NOT NULL DEFAULT '',
  vendor_name         TEXT NOT NULL DEFAULT '',
  vendor_cost         NUMERIC(10,2),
  labor_hours         NUMERIC(6,2),
  labor_rate          NUMERIC(8,2),
  legacy_cost         NUMERIC(10,2),          -- migrated old flat total, verbatim — display only
  supersedes_id       INTEGER REFERENCES public.work_orders(id) ON DELETE SET NULL, -- correction chain
  resolution_note     TEXT NOT NULL DEFAULT '',
  opened_by_user_id   INTEGER,
  opened_by_name      TEXT NOT NULL DEFAULT '',
  resolved_at         TIMESTAMPTZ,
  resolved_by_user_id INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_work_orders_department ON public.work_orders(department_id, status);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned ON public.work_orders(department_id, assigned_to_user_id)
  WHERE status IN ('open','in_progress','awaiting_parts');
-- One LIVE work order per defect (the dedupe bar).
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_live_defect
  ON public.work_orders(defect_id)
  WHERE defect_id IS NOT NULL AND status IN ('open','in_progress','awaiting_parts');

-- ── work_order_parts — NUMERIC line items ──
CREATE TABLE IF NOT EXISTS public.work_order_parts (
  id                 SERIAL PRIMARY KEY,
  work_order_id      INTEGER NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  department_id      INTEGER NOT NULL,
  name               TEXT NOT NULL,
  qty                NUMERIC(8,2) NOT NULL DEFAULT 1,
  unit_cost          NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_by_user_id INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wo_parts_wo ON public.work_order_parts(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_parts_department ON public.work_order_parts(department_id);

-- ── work_order_notes — the crew↔mechanic thread (APPEND-ONLY) ──
CREATE TABLE IF NOT EXISTS public.work_order_notes (
  id             SERIAL PRIMARY KEY,
  work_order_id  INTEGER NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  department_id  INTEGER NOT NULL,
  author_user_id INTEGER,
  author_name    TEXT NOT NULL DEFAULT '',
  body           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wo_notes_wo ON public.work_order_notes(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_notes_department ON public.work_order_notes(department_id);

-- ── pm_schedules — whichever-first triggers; due computed on view; human opens the WO ──
CREATE TABLE IF NOT EXISTS public.pm_schedules (
  id                     SERIAL PRIMARY KEY,
  department_id          INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  station_id             INTEGER,
  apparatus_id           INTEGER NOT NULL REFERENCES public.apparatus(id) ON DELETE CASCADE,
  task                   TEXT NOT NULL,
  interval_days          INTEGER,
  interval_miles         INTEGER,
  interval_hours         NUMERIC(8,1),
  last_done_date         DATE,
  last_done_mileage      INTEGER,
  last_done_engine_hours NUMERIC(8,1),
  active                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id     INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ,
  CONSTRAINT pm_schedules_trigger_chk
    CHECK (interval_days IS NOT NULL OR interval_miles IS NOT NULL OR interval_hours IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_pm_schedules_department ON public.pm_schedules(department_id, active);

ALTER TABLE public.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_pm_fk;
ALTER TABLE public.work_orders
  ADD CONSTRAINT work_orders_pm_fk
  FOREIGN KEY (pm_schedule_id) REFERENCES public.pm_schedules(id) ON DELETE SET NULL;

-- ── The mechanic capability grant (§5 ruling 1) ──
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fleet_maintenance BOOLEAN NOT NULL DEFAULT FALSE;

-- ── RLS dept_isolation on all five new tables ──
DO $$
  DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['defects','work_orders','work_order_parts','work_order_notes','pm_schedules'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
    EXECUTE format($p$CREATE POLICY dept_isolation ON public.%I FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)$p$, t);
  END LOOP;
END $$;

COMMENT ON TABLE public.defects IS
  'Flagged problems (Phase 2.2) — first-class, separate from work orders (the market pattern; '
  'dedupe-on-reflag rides on uq_defects_live_check_item). Resolves ONLY via a resolved work '
  'order or an explicit reasoned manual close. No hard delete.';
COMMENT ON TABLE public.work_orders IS
  'Work orders (Phase 2.2). Closed status enum; resolved/cancelled are TERMINAL — corrections '
  'are a NEW work order (supersedes_id), never a reopen. Costs are NUMERIC line items + '
  'labor×rate + vendor; legacy_cost carries the pre-0083 flat totals verbatim. Soft delete only.';
COMMENT ON TABLE public.work_order_notes IS
  'Crew↔mechanic thread (Phase 2.2). APPEND-ONLY — no UPDATE/DELETE grant.';

-- ── Role grants (guarded) + per-role revoke sweep (the 0082 default-privileges lesson) ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.defects TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.defects_id_seq TO of_app;
    GRANT SELECT, INSERT, UPDATE ON public.work_orders TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.work_orders_id_seq TO of_app;
    GRANT SELECT, INSERT, DELETE ON public.work_order_parts TO of_app;  -- line edits pre-resolve = delete+re-add
    GRANT USAGE, SELECT ON SEQUENCE public.work_order_parts_id_seq TO of_app;
    GRANT SELECT, INSERT ON public.work_order_notes TO of_app;          -- append-only
    GRANT USAGE, SELECT ON SEQUENCE public.work_order_notes_id_seq TO of_app;
    GRANT SELECT, INSERT, UPDATE ON public.pm_schedules TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.pm_schedules_id_seq TO of_app;
  END IF;
END $$;

DO $$
  DECLARE r text;
BEGIN
  REVOKE UPDATE, DELETE ON public.work_order_notes FROM PUBLIC;
  REVOKE DELETE ON public.defects, public.work_orders, public.pm_schedules FROM PUBLIC;
  REVOKE UPDATE ON public.work_order_parts FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON public.work_order_notes FROM %I', r);
      EXECUTE format('REVOKE DELETE ON public.defects, public.work_orders, public.pm_schedules FROM %I', r);
      EXECUTE format('REVOKE UPDATE ON public.work_order_parts FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- ── Data migration: legacy maintenance rows → work_orders (old table untouched) ──
DO $$
  DECLARE m RECORD; new_status TEXT; note TEXT;
BEGIN
  FOR m IN SELECT * FROM public.maintenance LOOP
    IF EXISTS (SELECT 1 FROM public.work_orders w
                WHERE w.department_id = m.department_id
                  AND w.description LIKE '%[migrated maintenance #' || m.id || ']%') THEN
      CONTINUE;  -- idempotent re-run guard
    END IF;
    new_status := CASE LOWER(COALESCE(m.status, ''))
      WHEN 'pending' THEN 'open' WHEN 'scheduled' THEN 'open'
      WHEN 'in progress' THEN 'in_progress' WHEN 'in_progress' THEN 'in_progress'
      WHEN 'completed' THEN 'resolved' WHEN 'complete' THEN 'resolved'
      ELSE 'open' END;
    note := COALESCE(m.description, '');
    IF LOWER(COALESCE(m.status,'')) NOT IN ('pending','scheduled','in progress','in_progress','completed','complete') THEN
      note := note || ' [unmapped legacy status: ' || COALESCE(m.status,'(none)') || ']';
    END IF;
    INSERT INTO public.work_orders
      (department_id, station_id, apparatus_id, asset_label, title, description, priority,
       status, vendor_name, labor_hours, legacy_cost, resolution_note, opened_by_name,
       resolved_at, created_at)
    VALUES
      (m.department_id, m.station_id,
       CASE WHEN m."apparatusId" > 0 AND EXISTS (SELECT 1 FROM public.apparatus a WHERE a.id = m."apparatusId")
            THEN m."apparatusId" ELSE NULL END,
       CASE WHEN m."apparatusId" > 0 AND EXISTS (SELECT 1 FROM public.apparatus a WHERE a.id = m."apparatusId")
            THEN '' ELSE COALESCE(m."apparatusName",'') END,
       COALESCE(NULLIF(m.type,''),'Maintenance'),
       note || ' [migrated maintenance #' || m.id || ']',
       CASE LOWER(COALESCE(m.priority,'')) WHEN 'urgent' THEN 'urgent' WHEN 'emergency' THEN 'emergency' ELSE 'routine' END,
       new_status, COALESCE(m.vendor,''),
       CASE WHEN m."laborHours" IS NOT NULL THEN ROUND(m."laborHours"::numeric, 2) ELSE NULL END,
       CASE WHEN m."totalCost" IS NOT NULL THEN ROUND(m."totalCost"::numeric, 2) ELSE NULL END,
       CASE WHEN new_status = 'resolved' THEN '[migrated as completed from the legacy maintenance log]' ELSE '' END,
       COALESCE(m.technician,''),
       CASE WHEN new_status = 'resolved' AND m.date ~ '^\d{4}-\d{2}-\d{2}'
            THEN (LEFT(m.date,10) || 'T12:00:00Z')::timestamptz ELSE NULL END,
       COALESCE(m."createdAt", NOW()));
  END LOOP;
END $$;

-- Stamp the ledger (of_schema_migrations stays 1:1 with the files).
INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0083-work-orders.sql', NOW());

COMMIT;
