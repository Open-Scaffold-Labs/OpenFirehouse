-- 0079 — Shift trades rebuild + payback ledger (Phase 1.3a/b).
--
-- Spec: docs/PHASE1-TRADES-SPEC-2026-07-25.md. Market pass 2026-07-25 (fire/EMS scheduling
-- help-docs, FLSA §207(p)(3), 29 CFR §553.31, OPM firefighter trading-time policy). Field gate:
-- Matt ruled "follow exactly what our competitors do" — the market bar IS the spec.
--
-- Rebuilds the existing partial shift_trades scaffold to the parity bar:
--   * trade_type axis (give_away | swap | payback) so ONE table carries all three market types;
--   * a two-stage workflow (accept then approve) needs accepted_by/accepted_at/approved_at +
--     approved_by_user_id (the old scaffold conflated accept+approve in one officer PATCH);
--   * client_key = the client-minted idempotency / atomic-claim key (a partial-unique index makes
--     the open-board single-winner claim race-proof, and a replay a safe no-op);
--   * swap_shift_id = the covering member's shift in a mutual swap (payback_shift_id already exists).
-- The existing `status` TEXT column is NOT given a DB CHECK (pre-existing rows + the app is the
-- validator, matching db.UNIT_STATUS_VALUES) — only the NEW trade_type gets a CHECK.
--
-- NEW shift_trade_ledger — the payback/IOU balance between two members, APPEND-ONLY (a payback is a
-- record; corrections are a 'reversal' entry, never an edit) — mirrors leave_accrual_ledger (0076)
-- exactly: GRANT SELECT,INSERT; REVOKE UPDATE,DELETE; RLS dept_isolation; department_id a plain
-- column (no FK — an immutable record must not be cascade-erased by a tenant delete). The balance
-- between a pair = SUM(delta_hours); it is hours-denominated and runs member↔member, not against the
-- employer (OPM doctrine).
--
-- departments.trades_require_approval — the per-dept officer-approval flag (default TRUE = the market
-- norm), mirroring allow_rig_status (0040). FALSE → peer-accept directly approves.
--
-- Tenancy: department_id from the JWT (never station_id). RLS dept_isolation. No new
-- public/unauthenticated or SECURITY DEFINER surface → NOT Dale-gated.
--
-- D6: applied to prod by hand → verified live by query → ledgered in of_schema_migrations → THEN the
-- dependent code (routes/shiftTrades.js rebuild + db.js mirror) ships. Head verified 0078 against
-- docs/migrations/ AND the prod of_schema_migrations ledger (2026-07-25); 0079 was free.

BEGIN;

-- ── shift_trades — additive columns for the three-type, two-stage workflow ──
ALTER TABLE public.shift_trades
  ADD COLUMN IF NOT EXISTS trade_type            TEXT NOT NULL DEFAULT 'give_away'
    CONSTRAINT shift_trades_type_chk CHECK (trade_type IN ('give_away','swap','payback')),
  ADD COLUMN IF NOT EXISTS accepted_by_member_id INTEGER,
  ADD COLUMN IF NOT EXISTS accepted_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_user_id   INTEGER,
  ADD COLUMN IF NOT EXISTS swap_shift_id         INTEGER,
  ADD COLUMN IF NOT EXISTS reason                TEXT,
  ADD COLUMN IF NOT EXISTS client_key            TEXT;

-- Atomic-claim / idempotency: a given (dept, client_key) is unique, so a replayed accept/create can
-- never double-award. Partial — legacy rows carry no client_key and are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_trades_client_key
  ON public.shift_trades(department_id, client_key) WHERE client_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shift_trades_dept_status
  ON public.shift_trades(department_id, status);

-- ── departments.trades_require_approval — per-dept officer-approval flag (default ON) ──
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS trades_require_approval BOOLEAN NOT NULL DEFAULT TRUE;

-- ── shift_trade_ledger — APPEND-ONLY payback/IOU balance between two members ──
-- balance(a,b) = SUM(delta_hours) over rows for that pair. 'incurred' when a covered payback is
-- approved (owed_by owes owed_to); 'settled' closes it against a repayment shift; 'reversal' handles
-- the call-out case (the substitute never worked → the substitute becomes the debtor). Corrections
-- are entries, never edits (the leave-ledger doctrine).
CREATE TABLE IF NOT EXISTS public.shift_trade_ledger (
  id                 SERIAL PRIMARY KEY,
  department_id      INTEGER NOT NULL,
  owed_by_member_id  INTEGER NOT NULL,        -- the member who owes a shift back
  owed_to_member_id  INTEGER NOT NULL,        -- the member owed
  delta_hours        NUMERIC NOT NULL,        -- +incurred (owed_by now owes), −settled/reversal
  reason             TEXT NOT NULL
                       CONSTRAINT shift_trade_ledger_reason_chk
                       CHECK (reason IN ('incurred','settled','reversal')),
  source_kind        TEXT NOT NULL DEFAULT 'trade'
                       CONSTRAINT shift_trade_ledger_source_kind_chk
                       CHECK (source_kind IN ('trade','manual')),
  source_id          INTEGER,                 -- shift_trades.id
  shift_id           INTEGER,                 -- the shift the payback was incurred/settled against
  note               TEXT,
  created_by_user_id INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shift_trade_ledger_dept_pair
  ON public.shift_trade_ledger(department_id, owed_by_member_id, owed_to_member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shift_trade_ledger_source
  ON public.shift_trade_ledger(department_id, source_id);

ALTER TABLE public.shift_trade_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.shift_trade_ledger;
CREATE POLICY dept_isolation ON public.shift_trade_ledger FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);

COMMENT ON TABLE public.shift_trade_ledger IS
  'Append-only ledger of payback/IOU movements between two members. REVOKE UPDATE/DELETE — a payback '
  'is a record; corrections are a reversal entry, never an edit. balance(a,b) = SUM(delta_hours). '
  'incurred=owed_by owes owed_to; settled=repaid; reversal=call-out case (substitute becomes debtor). '
  'Hours-denominated, member↔member, not against the employer (OPM firefighter trading-time doctrine).';

-- ── Role grants (guarded so the file also runs on a local dev DB without these roles) ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
    -- shift_trade_ledger: append-only — SELECT + INSERT only.
    GRANT SELECT, INSERT ON public.shift_trade_ledger TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.shift_trade_ledger_id_seq TO of_app;
  END IF;
END $$;

-- Supabase default privileges auto-grant UPDATE/DELETE on new tables to of_app + the API roles (the
-- 0046/0059/0076 lesson). The immutable ledger must be PHYSICALLY un-rewritable → revoke UPDATE +
-- DELETE. PUBLIC always exists; the named roles are guarded.
DO $$
  DECLARE r text;
BEGIN
  REVOKE UPDATE, DELETE ON public.shift_trade_ledger FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON public.shift_trade_ledger FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- Stamp the ledger (of_schema_migrations stays 1:1 with the files).
INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0079-shift-trades-payback-ledger.sql', NOW());

COMMIT;
