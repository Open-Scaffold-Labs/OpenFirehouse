-- 0081 — Ordered hiring/callback engine + grievance audit (Phase 1.5).
-- Spec: docs/PHASE1-HIRING-SPEC-2026-07-25.md §2. Claim-by-stub 2026-07-25 (head verified
-- 0080 in files AND the prod of_schema_migrations ledger).
--
-- Market pass (2026-07-25, competitors generic per the standing rule): named per-dept
-- ordered lists (a member on many); three composable rule families (hours-ascending
-- accumulation w/ reset windows + tie-break chains, rotation by last-awarded, static
-- seniority/manual); eligibility distinct from ordering with inspectable reasons; a
-- SEPARATE mandatory list type (mandate-count ascending + reverse-seniority, rotate-on-
-- hold, human-triggered only — never an automatic fallback); offer sequencing (in-order
-- windows + blast; late-accept while open; distinct outcomes); admin bypass recorded not
-- prevented; equalization counters charging worked + (configurably) refused/expired, with
-- computed reset WINDOWS (history never rewritten) and adjustments-with-reason; and the
-- grievance record: the ordered list AT THE MOMENT of hiring (immutable snapshot), every
-- offer w/ time/channel/outcome, skips attributed, the award, bypasses distinct.
--
-- Channel boundary (F12 OPEN): offers carry RESERVED channel/contact fields ('in_app' now;
-- sms/voice/email at 1.6) — the audit row shape is fixed NOW so telephony is additive.
--
-- Records classification (spec §6): hiring_charge_ledger = record-grade fairness ledger →
-- PHYSICALLY append-only (REVOKE UPDATE/DELETE — the 0076/0079 pattern); corrections are
-- 'adjustment'/'reversal' entries. hiring_events.list_snapshot is written once and has no
-- update path in code; events/offers/lists are never hard-deleted by the app (no DELETE
-- grant); hiring_list_members is editable membership (add/remove/reorder IS the config).
-- The FLSA/§225 ledger (ot_records) is deliberately NOT touched — the market never merges
-- pay math with fairness math.
--
-- Tenancy: department_id from the JWT; RLS dept_isolation on all five tables. No new
-- public/unauthenticated or SECURITY DEFINER surface.
--
-- D6: applied to prod by hand (Supabase MCP) → ledgered → verified live by query (incl.
-- RLS + append-only + unique-constraint probes) → THEN dependent code ships. Additive only.

BEGIN;

-- ── hiring_lists — named per-dept ordered lists (config; deactivate, never delete) ──
CREATE TABLE IF NOT EXISTS public.hiring_lists (
  id                   SERIAL PRIMARY KEY,
  department_id        INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  list_type            TEXT NOT NULL DEFAULT 'voluntary'
                         CONSTRAINT hiring_lists_type_chk
                         CHECK (list_type IN ('voluntary','mandatory')),
  target_rank          TEXT NOT NULL DEFAULT '',        -- '' = any rank
  required_certs       TEXT NOT NULL DEFAULT '[]',      -- JSON array of canonical cert codes
  order_method         TEXT NOT NULL DEFAULT 'hours_asc'
                         CONSTRAINT hiring_lists_order_chk
                         CHECK (order_method IN ('hours_asc','rotation','seniority','manual')),
  tie_breakers         TEXT NOT NULL DEFAULT '["seniority","member_id"]',  -- JSON chain; member_id = stable terminal
  charge_worked        BOOLEAN NOT NULL DEFAULT TRUE,
  charge_refused       BOOLEAN NOT NULL DEFAULT FALSE,  -- CBA-dependent; conservative default
  charge_expired       BOOLEAN NOT NULL DEFAULT FALSE,
  reset_period         TEXT NOT NULL DEFAULT 'annual'
                         CONSTRAINT hiring_lists_reset_chk
                         CHECK (reset_period IN ('annual','none')),
  reset_anchor         TEXT NOT NULL DEFAULT '01-01',   -- MM-DD (annual window start)
  offer_window_minutes INTEGER NOT NULL DEFAULT 30
                         CONSTRAINT hiring_lists_window_chk CHECK (offer_window_minutes BETWEEN 1 AND 10080),
  sort_order           INTEGER NOT NULL DEFAULT 0,
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hiring_lists_dept ON public.hiring_lists(department_id, active);

-- ── hiring_list_members — membership + manual order + rotation position ──
CREATE TABLE IF NOT EXISTS public.hiring_list_members (
  id              SERIAL PRIMARY KEY,
  department_id   INTEGER NOT NULL,
  list_id         INTEGER NOT NULL REFERENCES public.hiring_lists(id) ON DELETE CASCADE,
  member_id       INTEGER NOT NULL,
  manual_order    INTEGER NOT NULL DEFAULT 0,
  last_awarded_at TIMESTAMPTZ,                          -- rotation: ascending NULLS FIRST
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hiring_list_members_uniq UNIQUE (list_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_hlm_dept_list ON public.hiring_list_members(department_id, list_id);

-- ── hiring_charge_ledger — APPEND-ONLY fairness ledger (separate from FLSA/ot_records) ──
-- department_id is a plain column (no FK): an immutable record must not be cascade-erased
-- (the mayday/leave-ledger convention). Balance = Σ delta_hours within the list's computed
-- reset window; mandate count = COUNT(reason='mandate_hold') in-window. A reset is a WINDOW
-- BOUNDARY, never a mutation.
CREATE TABLE IF NOT EXISTS public.hiring_charge_ledger (
  id                 SERIAL PRIMARY KEY,
  department_id      INTEGER NOT NULL,
  list_id            INTEGER NOT NULL REFERENCES public.hiring_lists(id) ON DELETE RESTRICT,
  member_id          INTEGER NOT NULL,
  delta_hours        NUMERIC NOT NULL,
  reason             TEXT NOT NULL
                       CONSTRAINT hcl_reason_chk
                       CHECK (reason IN ('worked','refused','expired','mandate_hold','adjustment','reversal','seed')),
  source_kind        TEXT,                              -- 'hiring_offer' | 'hiring_event' | 'manual'
  source_id          INTEGER,                           -- INTEGER only (lesson #14)
  note               TEXT,                              -- REQUIRED by the route for 'adjustment'
  created_by_user_id INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hcl_dept_list_member
  ON public.hiring_charge_ledger(department_id, list_id, member_id, created_at);

-- ── hiring_events — the grievance record root (immutable snapshot; engine-owned) ──
CREATE TABLE IF NOT EXISTS public.hiring_events (
  id                  SERIAL PRIMARY KEY,
  department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  vacancy_id          INTEGER NOT NULL,                 -- vacancies.id (loose ref, house style)
  list_id             INTEGER NOT NULL REFERENCES public.hiring_lists(id) ON DELETE RESTRICT,
  mode                TEXT NOT NULL DEFAULT 'sequential'
                        CONSTRAINT hiring_events_mode_chk
                        CHECK (mode IN ('sequential','blast')),
  status              TEXT NOT NULL DEFAULT 'open'
                        CONSTRAINT hiring_events_status_chk
                        CHECK (status IN ('open','awarded','exhausted','cancelled')),
  list_snapshot       TEXT NOT NULL,                    -- JSON; written ONCE (no code update path)
  awarded_member_id   INTEGER,
  award_method        TEXT
                        CONSTRAINT hiring_events_award_chk
                        CHECK (award_method IS NULL OR award_method IN ('accepted','assigned_bypass','mandate')),
  cancelled_reason    TEXT,
  started_by_user_id  INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hiring_events_dept_status
  ON public.hiring_events(department_id, status, created_at);
-- One live hiring run per vacancy — race-proof at the DB.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hiring_events_live_vacancy
  ON public.hiring_events(department_id, vacancy_id) WHERE status = 'open';

-- ── hiring_offers — the offer sequence (channel fields reserved for 1.6) ──
CREATE TABLE IF NOT EXISTS public.hiring_offers (
  id               SERIAL PRIMARY KEY,
  department_id    INTEGER NOT NULL,
  event_id         INTEGER NOT NULL REFERENCES public.hiring_events(id) ON DELETE CASCADE,
  member_id        INTEGER NOT NULL,
  position_in_list INTEGER NOT NULL DEFAULT 0,
  offered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ,
  channel          TEXT NOT NULL DEFAULT 'in_app'
                     CONSTRAINT hiring_offers_channel_chk
                     CHECK (channel IN ('in_app','sms','voice','email')),   -- only in_app used pre-1.6
  contact_ref      TEXT,                                -- reserved: number/address contacted (1.6)
  outcome          TEXT NOT NULL DEFAULT 'pending'
                     CONSTRAINT hiring_offers_outcome_chk
                     CHECK (outcome IN ('pending','accepted','declined','expired','skipped','superseded')),
  outcome_at       TIMESTAMPTZ,
  outcome_note     TEXT,                                -- skip reason / attribution detail
  charged          BOOLEAN NOT NULL DEFAULT FALSE,      -- charge-once guard (same txn as outcome)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hiring_offers_event_member_uniq UNIQUE (event_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_hiring_offers_dept_member
  ON public.hiring_offers(department_id, member_id, outcome);
CREATE INDEX IF NOT EXISTS idx_hiring_offers_event ON public.hiring_offers(event_id);

-- ── RLS dept_isolation on all five ──
DO $$
  DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hiring_lists','hiring_list_members','hiring_charge_ledger','hiring_events','hiring_offers'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
    EXECUTE format($p$CREATE POLICY dept_isolation ON public.%I FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)$p$, t);
  END LOOP;
END $$;

COMMENT ON TABLE public.hiring_charge_ledger IS
  'Append-only OT-equalization/fairness ledger (Phase 1.5). REVOKE UPDATE/DELETE — a charge '
  'is a record; corrections are adjustment/reversal entries with reason + author. Balance = '
  'SUM(delta_hours) within the list''s computed reset window (a reset never rewrites '
  'history). Deliberately separate from ot_records (FLSA/§225) — pay math and fairness math '
  'are never merged (market doctrine).';
COMMENT ON TABLE public.hiring_events IS
  'One hiring run per vacancy (Phase 1.5): list_snapshot = the ordered eligible list AT THE '
  'MOMENT of hiring with per-candidate factors + exclusion reasons — the skip-order '
  'grievance record. Written once, no update path. Engine-owned lifecycle '
  'open→awarded|exhausted|cancelled; award always goes through the ONE vacancy fill door.';

-- ── Role grants (guarded for local dev DBs without these roles) ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.hiring_lists TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.hiring_lists_id_seq TO of_app;
    -- membership rows ARE config: add/remove/reorder → of_app gets DELETE here (only here).
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.hiring_list_members TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.hiring_list_members_id_seq TO of_app;
    GRANT SELECT, INSERT ON public.hiring_charge_ledger TO of_app;              -- append-only
    GRANT USAGE, SELECT ON SEQUENCE public.hiring_charge_ledger_id_seq TO of_app;
    GRANT SELECT, INSERT, UPDATE ON public.hiring_events TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.hiring_events_id_seq TO of_app;
    GRANT SELECT, INSERT, UPDATE ON public.hiring_offers TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.hiring_offers_id_seq TO of_app;
  END IF;
END $$;

-- Supabase default privileges auto-grant U/D on new tables (the 0046/0059/0076 lesson) —
-- revoke so the ledger is physically un-rewritable and records are physically un-deletable.
DO $$
  DECLARE r text;
BEGIN
  REVOKE UPDATE, DELETE ON public.hiring_charge_ledger FROM PUBLIC;
  REVOKE DELETE ON public.hiring_lists, public.hiring_events, public.hiring_offers FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON public.hiring_charge_ledger FROM %I', r);
      EXECUTE format('REVOKE DELETE ON public.hiring_lists, public.hiring_events, public.hiring_offers FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- Stamp the ledger (of_schema_migrations stays 1:1 with the files).
INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0081-hiring-engine.sql', NOW());

COMMIT;
