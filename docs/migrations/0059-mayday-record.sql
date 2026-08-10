-- 0059-mayday-record.sql  (MAYDAY: the sealed, append-only fireground record — 2026-07-15)
--
-- Phase 4. When command declares a MAYDAY, the board FREEZES an immutable snapshot
-- and starts an append-only event log. This is the highest-consequence fireground
-- event and the record is a legal document (NIOSH FFFIPP / litigation), so it gets
-- the same — higher — append-only discipline as par_checks (0048): GRANT SELECT,
-- INSERT only; REVOKE UPDATE, DELETE (the 0046 lesson); RLS dept_isolation; a
-- client-minted UUID is THE idempotency key.
--
-- DESIGN — matches the market (tap-and-snapshot + checklist + timer). There is NO
-- typed LUNAR form, NO air field, NO channel field (decisions log 2026-07-15: on a
-- fireground, manual input during the incident is a regression):
--   mayday_events    — ONE immutable row per declaration. The frozen board snapshot
--                      (units/assignments/zones/crews-inside) as JSONB, plus an
--                      OPTIONAL one-tap victim_unit / nature. NEVER updated.
--   mayday_event_log — APPEND-ONLY stream of the taps that follow (checklist items,
--                      PAR requested/result, note, resolved). "Current status" is a
--                      projection: active = no 'resolved' row. No UPDATE path.
--   par_checks.mayday_id — links a MAYDAY-ordered PAR to its declaration. The PAR
--                      itself reuses par_checks (0058); there is no third PAR store.
--
-- declared_at / at are SERVER-authoritative (NOW()); client_recorded_at is metadata
-- only, never trusted for ordering — a spoofed device clock cannot move the legal
-- timeline.
--
-- ADDITIVE + SAFE: two new tables no existing code reads + one nullable column.
-- Applying to prod BEFORE the code is safe here (empty tables; unlike the 0057
-- par_anchor case, nothing deployed reads them yet). Order: local -> prod (Matt's
-- gate) -> mirror db.js -> THEN ship the code that writes them.
--
-- NUMBERING: 0058 (par-idempotency) is the highest APPLIED; 0057 (par-anchor) is
-- deferred/local-only. 0059 was free at write time (verified against the migrations
-- dir + the of_schema_migrations ledger + prod list_migrations, 2026-07-15).

-- ── mayday_events — the immutable declaration + frozen snapshot ──────────────
CREATE TABLE IF NOT EXISTS public.mayday_events (
  client_id           UUID PRIMARY KEY,                    -- client-minted = idempotency key
  department_id       INTEGER NOT NULL,
  incident_id         INTEGER,
  board_key           TEXT,
  declared_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- SERVER-authoritative
  client_recorded_at  TIMESTAMPTZ,                         -- metadata only; never orders the record
  declared_by_user_id INTEGER NOT NULL,
  victim_unit         TEXT,                                -- OPTIONAL one tap (a unit already on the board)
  nature              TEXT,                                -- OPTIONAL chip (lost/trapped/collapse/low_air/unaccounted/other)
  scene_snapshot      JSONB NOT NULL DEFAULT '{}'::jsonb   -- sealed board state at declaration
);
CREATE INDEX IF NOT EXISTS idx_mayday_events_dept_time
  ON public.mayday_events (department_id, declared_at DESC);

ALTER TABLE public.mayday_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.mayday_events;
CREATE POLICY dept_isolation ON public.mayday_events FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);
GRANT SELECT, INSERT ON public.mayday_events TO of_app;
-- Supabase default privileges auto-grant UPDATE/DELETE — revoke (0046 lesson). The
-- frozen declaration is a legal record; the app must be PHYSICALLY unable to rewrite it.
REVOKE UPDATE, DELETE ON public.mayday_events FROM of_app, anon, authenticated, service_role, PUBLIC;

-- ── mayday_event_log — the append-only stream of taps after declaration ──────
CREATE TABLE IF NOT EXISTS public.mayday_event_log (
  client_id     UUID PRIMARY KEY,                          -- idempotency (replay => duplicate => success)
  mayday_id     UUID NOT NULL REFERENCES public.mayday_events (client_id),
  department_id INTEGER NOT NULL,
  at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),         -- SERVER-authoritative, monotonic
  actor_user_id INTEGER NOT NULL,
  kind          TEXT NOT NULL
                  CHECK (kind IN ('checklist_item','par_requested','par_result','note','resolved')),
  payload       JSONB
);
CREATE INDEX IF NOT EXISTS idx_mayday_event_log_mayday_at
  ON public.mayday_event_log (mayday_id, at);

ALTER TABLE public.mayday_event_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.mayday_event_log;
CREATE POLICY dept_isolation ON public.mayday_event_log FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);
GRANT SELECT, INSERT ON public.mayday_event_log TO of_app;
REVOKE UPDATE, DELETE ON public.mayday_event_log FROM of_app, anon, authenticated, service_role, PUBLIC;

-- ── link a MAYDAY-ordered PAR back to its declaration (reuse par_checks 0058) ─
ALTER TABLE public.par_checks ADD COLUMN IF NOT EXISTS mayday_id UUID;

COMMENT ON TABLE public.mayday_events IS
  'Immutable MAYDAY declaration + frozen board snapshot. Append-only (REVOKE '
  'UPDATE/DELETE). client_id is the client-minted idempotency key; a replay is a '
  'duplicate = success. declared_at is server-authoritative.';
COMMENT ON TABLE public.mayday_event_log IS
  'Append-only stream of taps after a MAYDAY declaration (checklist_item, '
  'par_requested, par_result, note, resolved). Current status is a projection: '
  'active = no resolved row. No UPDATE/DELETE path.';

-- Stamp the ledger (of_schema_migrations stays 1:1 with the files).
INSERT INTO public.of_schema_migrations (filename)
VALUES ('0059-mayday-record.sql')
ON CONFLICT DO NOTHING;
