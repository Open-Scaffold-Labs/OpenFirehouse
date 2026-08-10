-- 0085 — Phase 2.4 par-level inventory + expirations.
-- Spec: docs/PHASE2-INVENTORY-SPEC-2026-07-26.md. Claimed from the §5b block (`3669455`).
--
-- The leave-banks pattern transplanted: APPEND-ONLY inventory_txns (physical REVOKE U/D)
-- behind cached balances (inventory_stock / inventory_lots, both CHECK qty >= 0 — the
-- negative-stock door is physical). Par per (item × location); min = alert edge, max =
-- order-up-to pick target. Requisitions: acceptance never moves stock (denied/cancelled
-- retained — no hard delete). Ceilings: no auto-reorder, no auto-accept, no inferred usage.
--
-- D6: prod-first → ledgered → probes → THEN code.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  station_id    INTEGER,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT '',
  unit          TEXT NOT NULL DEFAULT 'each',
  tracks_lots   BOOLEAN NOT NULL DEFAULT FALSE,
  notes         TEXT NOT NULL DEFAULT '',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_department ON public.inventory_items(department_id, active);

CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  station_id    INTEGER,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'supply_room'
                  CONSTRAINT inventory_locations_kind_chk
                  CHECK (kind IN ('supply_room','station','apparatus','kit','other')),
  apparatus_id  INTEGER REFERENCES public.apparatus(id) ON DELETE SET NULL,
  parent_id     INTEGER REFERENCES public.inventory_locations(id) ON DELETE SET NULL,  -- reserved
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_inventory_locations_department ON public.inventory_locations(department_id, active);

CREATE TABLE IF NOT EXISTS public.inventory_stock (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  item_id       INTEGER NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  location_id   INTEGER NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  qty           NUMERIC(12,2) NOT NULL DEFAULT 0
                  CONSTRAINT inventory_stock_qty_chk CHECK (qty >= 0),
  par_min       NUMERIC(12,2),
  par_max       NUMERIC(12,2),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_stock_pair_uniq UNIQUE (item_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_department ON public.inventory_stock(department_id);

CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id              SERIAL PRIMARY KEY,
  department_id   INTEGER NOT NULL,
  item_id         INTEGER NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  location_id     INTEGER NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  lot_number      TEXT NOT NULL DEFAULT '',
  expiration_date DATE,
  qty             NUMERIC(12,2) NOT NULL DEFAULT 0
                    CONSTRAINT inventory_lots_qty_chk CHECK (qty >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_department ON public.inventory_lots(department_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_item_loc ON public.inventory_lots(item_id, location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_expiry ON public.inventory_lots(department_id, expiration_date)
  WHERE expiration_date IS NOT NULL;

-- The APPEND-ONLY movement ledger (the closed five-verb market vocabulary; usage-transfer
-- is a composite endpoint writing usage + transfer rows).
CREATE TABLE IF NOT EXISTS public.inventory_txns (
  id                       SERIAL PRIMARY KEY,
  department_id            INTEGER NOT NULL,
  item_id                  INTEGER NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  location_id              INTEGER NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  lot_id                   INTEGER REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  verb                     TEXT NOT NULL
                             CONSTRAINT inventory_txns_verb_chk
                             CHECK (verb IN ('usage','restock','transfer','count_adjust')),
  qty_delta                NUMERIC(12,2) NOT NULL,
  counterpart_location_id  INTEGER REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  counted_qty              NUMERIC(12,2),
  incident_ref             TEXT NOT NULL DEFAULT '',
  reason                   TEXT NOT NULL DEFAULT '',
  requisition_id           INTEGER,
  performed_by_user_id     INTEGER,
  performed_by_name        TEXT NOT NULL DEFAULT '',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_txns_department ON public.inventory_txns(department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_txns_item_loc ON public.inventory_txns(item_id, location_id);

CREATE TABLE IF NOT EXISTS public.requisitions (
  id                   SERIAL PRIMARY KEY,
  department_id        INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  station_id           INTEGER,
  to_location_id       INTEGER NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  from_location_id     INTEGER REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'submitted'
                         CONSTRAINT requisitions_status_chk
                         CHECK (status IN ('submitted','accepted','denied','fulfilled','cancelled')),
  note                 TEXT NOT NULL DEFAULT '',
  requested_by_user_id INTEGER,
  requested_by_name    TEXT NOT NULL DEFAULT '',
  decided_by_user_id   INTEGER,
  decided_at           TIMESTAMPTZ,
  decide_note          TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_requisitions_department ON public.requisitions(department_id, status);

CREATE TABLE IF NOT EXISTS public.requisition_lines (
  id             SERIAL PRIMARY KEY,
  requisition_id INTEGER NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  department_id  INTEGER NOT NULL,
  item_id        INTEGER NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  qty_requested  NUMERIC(12,2) NOT NULL
                   CONSTRAINT requisition_lines_qty_chk CHECK (qty_requested > 0),
  qty_fulfilled  NUMERIC(12,2)
);
CREATE INDEX IF NOT EXISTS idx_requisition_lines_req ON public.requisition_lines(requisition_id);
CREATE INDEX IF NOT EXISTS idx_requisition_lines_department ON public.requisition_lines(department_id);

-- ── RLS dept_isolation ──
DO $$
  DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_items','inventory_locations','inventory_stock','inventory_lots','inventory_txns','requisitions','requisition_lines'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
    EXECUTE format($p$CREATE POLICY dept_isolation ON public.%I FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)$p$, t);
  END LOOP;
END $$;

COMMENT ON TABLE public.inventory_txns IS
  'APPEND-ONLY inventory movement ledger (Phase 2.4). Every quantity change is a person, a '
  'verb, and a row; the cached balances (inventory_stock/inventory_lots) change only through '
  'the one postTxn door, and their CHECK (qty >= 0) makes the negative-stock block physical.';
COMMENT ON TABLE public.requisitions IS
  'Crew supply requests (Phase 2.4). ACCEPTANCE NEVER MOVES STOCK — a human records fulfilled '
  'quantities and only that recording posts ledger rows. Denied/cancelled retained for audit.';

-- ── Grants + per-role revoke sweep ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.inventory_items TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.inventory_items_id_seq TO of_app;
    GRANT SELECT, INSERT, UPDATE ON public.inventory_locations TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.inventory_locations_id_seq TO of_app;
    GRANT SELECT, INSERT, UPDATE ON public.inventory_stock TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.inventory_stock_id_seq TO of_app;
    GRANT SELECT, INSERT, UPDATE ON public.inventory_lots TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.inventory_lots_id_seq TO of_app;
    GRANT SELECT, INSERT ON public.inventory_txns TO of_app;                -- append-only
    GRANT USAGE, SELECT ON SEQUENCE public.inventory_txns_id_seq TO of_app;
    GRANT SELECT, INSERT, UPDATE ON public.requisitions TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.requisitions_id_seq TO of_app;
    GRANT SELECT, INSERT, UPDATE ON public.requisition_lines TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.requisition_lines_id_seq TO of_app;
  END IF;
END $$;

DO $$
  DECLARE r text;
BEGIN
  REVOKE UPDATE, DELETE ON public.inventory_txns FROM PUBLIC;
  REVOKE DELETE ON public.inventory_items, public.inventory_locations, public.inventory_stock,
                   public.inventory_lots, public.requisitions, public.requisition_lines FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON public.inventory_txns FROM %I', r);
      EXECUTE format('REVOKE DELETE ON public.inventory_items, public.inventory_locations, public.inventory_stock, public.inventory_lots, public.requisitions, public.requisition_lines FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- Stamp the ledger.
INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0085-par-inventory.sql', NOW());

COMMIT;
