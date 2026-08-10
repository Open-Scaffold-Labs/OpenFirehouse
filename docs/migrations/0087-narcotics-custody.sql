-- 0087-narcotics-custody.sql
-- Phase 2.7 — controlled-substance chain of custody (91 FR 5241 / 21 CFR §1304.27).
-- Spec: docs/PHASE2-NARCOTICS-SPEC-2026-07-26.md §3.
--
-- ⚠ DALE REVIEW GATE: applied LOCALLY during the build; NOT applied to prod (and no
-- dependent code pushes) until Dale signs off. D6 still holds — migration and code
-- ship together, after the review.
--
-- Design law carried in from 2.1–2.5 + the fi doctrine:
--   · cs_events is APPEND-ONLY at the DATABASE (per-role REVOKE sweep — the 0082
--     lesson: Supabase default privileges auto-grant table-level UPDATE; revoke from
--     of_app/anon/authenticated/service_role explicitly, not just PUBLIC).
--   · cs_items.status is written only by the event door (no column-scoped UPDATE
--     grant beyond what the door needs).
--   · RLS dept_isolation on every table (the standing GUC policy).
--   · Server-authoritative time; the client's clock is metadata, never a record.

BEGIN;

-- ── Catalog ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_substances (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  station_id    INTEGER NOT NULL,
  name          TEXT NOT NULL,                      -- §1304.27(a)(1)
  schedule      TEXT NOT NULL CHECK (schedule IN ('II','III','IV','V')),
  finished_form TEXT NOT NULL,                      -- §1304.27(a)(2) e.g. '10 mg/mL, 2 mL vial'
  unit_label    TEXT NOT NULL DEFAULT 'mg',         -- the unit amounts are recorded in
  units_per_container NUMERIC(10,2) NOT NULL,       -- §1304.27(b)(1)(iii) e.g. 100 (mg per vial)
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, name, finished_form)
);

-- ── Storage locations (safes/vaults/boxes) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_locations (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  station_id    INTEGER NOT NULL,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('vault','safe','box','other')),
  home_station_id INTEGER REFERENCES stations(id),  -- fixed-facility tie
  apparatus_id  INTEGER REFERENCES apparatus(id),   -- vehicle tie (a box rides a rig)
  seal_mode     TEXT NOT NULL DEFAULT 'single' CHECK (seal_mode IN ('none','single','multi')),
  current_seals TEXT NOT NULL DEFAULT '',           -- comma-joined seal numbers now applied
  par_level     INTEGER,                            -- alert-only (market ceiling)
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, name)
);

-- ── The vial (unit of custody) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_items (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  station_id    INTEGER NOT NULL,
  substance_id  INTEGER NOT NULL REFERENCES cs_substances(id) ON DELETE RESTRICT,
  control_no    TEXT NOT NULL,                      -- department-assigned, on the label
  lot_no        TEXT NOT NULL DEFAULT '',
  expiration    DATE,
  location_id   INTEGER REFERENCES cs_locations(id) ON DELETE RESTRICT,
  -- Closed set; written ONLY by the event door (one door — checked in code AND
  -- enforced by the grants below).
  status        TEXT NOT NULL DEFAULT 'in_stock' CHECK (status IN
                  ('in_stock','administered','wasted','expired','broken','transferred','destroyed')),
  remaining_units NUMERIC(10,2),                    -- after a partial administration+waste, 0
  acquired_event_id INTEGER,                        -- back-link filled by the acquire event
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, control_no)
);

-- ── THE CUSTODY LEDGER — append-only ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_events (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  station_id    INTEGER NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN
                  ('acquire','deliver','restock_hospital','transfer','administer',
                   'waste','expire','break','destroy','count_adjust')),
  item_id       INTEGER REFERENCES cs_items(id) ON DELETE RESTRICT,
  location_id   INTEGER REFERENCES cs_locations(id) ON DELETE RESTRICT,
  to_location_id INTEGER REFERENCES cs_locations(id) ON DELETE RESTRICT, -- transfer/deliver target
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- SERVER time (client time is metadata)
  client_recorded_at TIMESTAMPTZ,                   -- metadata only, never the record time

  -- §1304.27(a) — administration / disposal
  amount_administered NUMERIC(10,2),                -- (a)(5)
  amount_disposed     NUMERIC(10,2),                -- (a)(9)
  manner_disposed     TEXT NOT NULL DEFAULT '',     -- (a)(10)
  patient_identifier  TEXT NOT NULL DEFAULT '',     -- (a)(4) run/patient id — NEVER name+DOB prose
  incident_number     TEXT NOT NULL DEFAULT '',
  standing_order      BOOLEAN,                      -- (a)(8)
  authorizer_name     TEXT NOT NULL DEFAULT '',     -- (a)(7) medical director / authorizing professional

  -- §1304.27(b) — counterpart registrant (acquire/distribute/destroy via reverse distributor)
  counterpart_name    TEXT NOT NULL DEFAULT '',
  counterpart_address TEXT NOT NULL DEFAULT '',
  counterpart_dea_no  TEXT NOT NULL DEFAULT '',
  containers          INTEGER,                      -- (b) container count
  units_per_container NUMERIC(10,2),

  -- Seals broken/applied on this event (verified at counts)
  seals_broken  TEXT NOT NULL DEFAULT '',
  seals_applied TEXT NOT NULL DEFAULT '',

  -- Dual auth: the ACTOR (session + CS-PIN verified server-side) and, where the
  -- doctrine requires one, the WITNESS (their own PIN + e-signature captured).
  -- Destruction (§1317.95(c)) carries BOTH employees' signatures: actor + witness.
  actor_user_id   INTEGER NOT NULL REFERENCES users(id),
  actor_name      TEXT NOT NULL,                    -- (a)(6) snapshot at event time
  actor_signature TEXT NOT NULL DEFAULT '',         -- required for destroy (§1317.95)
  witness_user_id INTEGER REFERENCES users(id),
  witness_name    TEXT NOT NULL DEFAULT '',         -- (a)(11)
  witness_signature TEXT NOT NULL DEFAULT '',       -- data-URL, size-capped in code

  -- count_adjust corrections reference what they correct — nothing is ever edited.
  corrects_event_id INTEGER REFERENCES cs_events(id),
  note          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (witness_user_id IS NULL OR witness_user_id <> actor_user_id) -- no self-witness
);
ALTER TABLE cs_items
  ADD CONSTRAINT fk_cs_items_acquired_event
  FOREIGN KEY (acquired_event_id) REFERENCES cs_events(id);

-- ── Shift counts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_counts (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  station_id    INTEGER NOT NULL,
  location_id   INTEGER NOT NULL REFERENCES cs_locations(id) ON DELETE RESTRICT,
  kind          TEXT NOT NULL CHECK (kind IN ('on_coming','off_going','audit','biennial')),
  counted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seals_verified TEXT NOT NULL DEFAULT '',          -- what was on the box, as read
  seals_intact  BOOLEAN NOT NULL DEFAULT TRUE,
  verifier1_user_id INTEGER NOT NULL REFERENCES users(id),
  verifier1_name    TEXT NOT NULL,
  verifier2_user_id INTEGER NOT NULL REFERENCES users(id),
  verifier2_name    TEXT NOT NULL,
  verifier2_signature TEXT NOT NULL DEFAULT '',
  clean         BOOLEAN NOT NULL,                   -- expected == actual on every line
  note          TEXT NOT NULL DEFAULT '',
  CHECK (verifier2_user_id <> verifier1_user_id)    -- two DISTINCT humans
);

CREATE TABLE IF NOT EXISTS cs_count_lines (
  id            SERIAL PRIMARY KEY,
  count_id      INTEGER NOT NULL REFERENCES cs_counts(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL,
  item_id       INTEGER REFERENCES cs_items(id) ON DELETE RESTRICT,
  expected_present BOOLEAN NOT NULL,
  actual_present   BOOLEAN NOT NULL
);

-- ── Discrepancies — first-class, open until a chief resolves with a reason ───
CREATE TABLE IF NOT EXISTS cs_discrepancies (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  station_id    INTEGER NOT NULL,
  count_id      INTEGER REFERENCES cs_counts(id) ON DELETE RESTRICT,
  item_id       INTEGER REFERENCES cs_items(id) ON DELETE RESTRICT,
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detail        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution    TEXT NOT NULL DEFAULT '' ,          -- found / documentation_error / reported
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_at   TIMESTAMPTZ,
  resolved_by_user_id INTEGER REFERENCES users(id),
  resolving_event_id  INTEGER REFERENCES cs_events(id)
);

-- ── 72-hour designated-location notifications (§1304.27(c)) ─────────────────
CREATE TABLE IF NOT EXISTS cs_notifications (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  station_id    INTEGER NOT NULL,
  event_id      INTEGER NOT NULL REFERENCES cs_events(id) ON DELETE RESTRICT,
  due_by        TIMESTAMPTZ NOT NULL,               -- occurred_at + 72h
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by_user_id INTEGER REFERENCES users(id)
);

-- ── Per-user CS PIN (bcrypt; never logged, never returned) ───────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS cs_pin_hash TEXT;
-- The cs_manager capability grant (the fleet_maintenance pattern — market
-- platforms ship admin-configurable CS access, not a role rung).
ALTER TABLE users ADD COLUMN IF NOT EXISTS cs_manager BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cs_items_dept_status   ON cs_items (department_id, status);
CREATE INDEX IF NOT EXISTS idx_cs_items_location      ON cs_items (location_id) WHERE status = 'in_stock';
CREATE INDEX IF NOT EXISTS idx_cs_events_dept_time    ON cs_events (department_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_events_item         ON cs_events (item_id);
CREATE INDEX IF NOT EXISTS idx_cs_counts_dept_loc     ON cs_counts (department_id, location_id, counted_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_discrepancies_open  ON cs_discrepancies (department_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_cs_notifications_due   ON cs_notifications (department_id) WHERE acknowledged_at IS NULL;

-- ── RLS: dept_isolation on all seven tables ──────────────────────────────────
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cs_substances','cs_locations','cs_items','cs_events',
                           'cs_counts','cs_count_lines','cs_discrepancies','cs_notifications'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DO $p$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = %L AND policyname = ''dept_isolation'') THEN
           CREATE POLICY dept_isolation ON %I
             USING (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int);
         END IF;
       END $p$', t, t);
  END LOOP;
END $rls$;

-- ── Grants: the append-only sweep (0082 lesson — PER ROLE, not just PUBLIC) ──
DO $grants$
DECLARE r TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        -- The ledger + count lines: INSERT/SELECT only. No UPDATE. No DELETE. Ever.
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON cs_events, cs_count_lines, cs_counts FROM %I', r);
        -- Items: the event door needs status/location/remaining/acquired-link only.
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON cs_items FROM %I', r);
        -- Discrepancies + notifications: resolution/ack columns only.
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON cs_discrepancies, cs_notifications FROM %I', r);
        EXECUTE format('REVOKE DELETE, TRUNCATE ON cs_substances, cs_locations FROM %I', r);
      END IF;
    END LOOP;
    GRANT SELECT, INSERT ON cs_substances, cs_locations, cs_items, cs_events,
                          cs_counts, cs_count_lines, cs_discrepancies, cs_notifications TO of_app;
    GRANT UPDATE (name, schedule, finished_form, unit_label, units_per_container, active) ON cs_substances TO of_app;
    GRANT UPDATE (name, kind, home_station_id, apparatus_id, seal_mode, current_seals, par_level, active) ON cs_locations TO of_app;
    GRANT UPDATE (status, location_id, remaining_units, acquired_event_id) ON cs_items TO of_app;
    GRANT UPDATE (status, resolution, resolution_note, resolved_at, resolved_by_user_id, resolving_event_id) ON cs_discrepancies TO of_app;
    GRANT UPDATE (acknowledged_at, acknowledged_by_user_id) ON cs_notifications TO of_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO of_app;
  END IF;
END $grants$;

INSERT INTO of_schema_migrations (filename) VALUES ('0087-narcotics-custody.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
