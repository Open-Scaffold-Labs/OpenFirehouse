-- 0076 — Leave banks foundation (Phase 1.2a).
--
-- The greenfield foundation for per-member leave/accrual BANKS. Follows the 1.2c
-- min-staffing config (0075) and precedes 1.2b (approval writes the record) + 1.2d
-- (accrual engine). Spec: docs/PHASE1-LEAVE-ACCRUALS-SPEC-2026-07-24.md §4/§5.
--
-- Market pass (2026-07-24, competitors generic per the standing rule). Two research
-- agents established the floor + validated the legal facts:
--   * Per-member accrual BANKS (vacation/sick/personal/holiday/comp/on-call + custom +
--     statutory codes) with per-department accrual RULES are table-stakes.
--   * The balance system is an APPEND-ONLY LEDGER of movements with the balance as a
--     derived/cached running total — confirmed the recommended pattern for an auditable
--     wage/hour record (mutating a balance field in place is the anti-pattern).
--   * FLSA §7(o) comp time is legally distinct from vacation: 480-hour public-safety cap
--     (= 320 OT hours worked at 1.5x), CANNOT be use-it-or-lose-it forfeited, cash-out on
--     separation. is_flsa_comp flags the bank; the cap rides accrual_cap.
--
-- Three research-driven refinements over the spec's literal §4 columns, all on the
-- IMMUTABLE ledger (which REVOKE U/D makes un-ALTERable-in-spirit later, so get it right
-- up front) or the shift-unit gap:
--   1. leave_types.unit is a CHECK set 'hours'|'shifts'|'days' (24h-shift depts track a
--      "day off" as a SHIFT, not 8 hours) — a naive hours-only model paints us in.
--   2. leave_accrual_ledger.period_key — 1.2d's accrual-run idempotency guard needs a
--      DB-level unique constraint on this append-only table; adding the column now avoids
--      a second migration against a REVOKE-U/D table.
--   3. leave_accrual_ledger.rate_at_post — comp-time liability valuation + rate-change
--      effective-dating both need the member's rate captured AT post time; the ledger is
--      immutable, so an un-captured rate is unrecoverable.
--
-- Records/operational classification (spec §6):
--   * leave_accrual_ledger = RECORD-grade → append-only (GRANT SELECT,INSERT; REVOKE
--     UPDATE,DELETE), like mayday_events (0059) / par_checks (0048). A bank movement is a
--     record; corrections are a 'reversal' entry, never an edit.
--   * leave_types (config) + leave_balances (derived cache) = operational, editable.
--     leave_types is deactivated (active=false), never hard-deleted (it carries history) —
--     so of_app gets SELECT,INSERT,UPDATE, NOT DELETE.
--
-- Tenancy: department_id from the JWT (never station_id). RLS dept_isolation on all three,
-- matching the ~100 other tenant tables. No new public/unauthenticated or SECURITY DEFINER
-- surface → NOT Dale-gated (spec §8).
--
-- Seeding: the table-stakes bank set is seeded PER DEPARTMENT lazily by the route on first
-- read (spec §5), NOT here — this migration is schema-only + additive. No drops, no data loss.
--
-- D6: applied to prod by hand (Supabase MCP) → verified live by query → ledgered in
-- of_schema_migrations → THEN the dependent code (routes/leaveTypes.js + db.js mirror) ships.
-- Head verified 0075 against docs/migrations/ AND the prod of_schema_migrations ledger
-- (2026-07-24); 0076 was free.

BEGIN;

-- ── leave_types — per-department bank definitions + accrual-rule config (editable) ──
CREATE TABLE IF NOT EXISTS public.leave_types (
  id              SERIAL PRIMARY KEY,
  department_id   INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,                       -- stable per-dept code (VAC, SICK, COMP, ...)
  name            TEXT NOT NULL,
  unit            TEXT NOT NULL DEFAULT 'hours'
                    CONSTRAINT leave_types_unit_chk CHECK (unit IN ('hours','shifts','days')),
  accrual_method  TEXT NOT NULL DEFAULT 'none'
                    CONSTRAINT leave_types_accrual_method_chk
                    CHECK (accrual_method IN ('none','per_period','annual_grant','anniversary','per_hours_worked')),
  accrual_rate    NUMERIC NOT NULL DEFAULT 0,          -- base rate (units per period / per hour worked)
  period          TEXT
                    CONSTRAINT leave_types_period_chk
                    CHECK (period IS NULL OR period IN ('biweekly','monthly','annual')),
  carryover_cap   NUMERIC,                             -- NULL = unlimited carryover; 0 = use-it-or-lose-it
  accrual_cap     NUMERIC,                             -- NULL = no max-balance ceiling; comp bank = 480
  allow_negative  BOOLEAN NOT NULL DEFAULT FALSE,
  negative_floor  NUMERIC NOT NULL DEFAULT 0,          -- most-negative balance permitted when allow_negative
  tenure_tiers    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ "years": 0, "rate": 3.08 }, { "years": 4, "rate": 4.62 }]
  is_flsa_comp    BOOLEAN NOT NULL DEFAULT FALSE,      -- §7(o) comp bank (480 cap, no forfeiture, cash-out on sep)
  is_paid         BOOLEAN NOT NULL DEFAULT TRUE,       -- FALSE for LWOP / unpaid statutory codes
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leave_types_dept_code_uniq UNIQUE (department_id, code)
);
CREATE INDEX IF NOT EXISTS idx_leave_types_dept ON public.leave_types(department_id);

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.leave_types;
CREATE POLICY dept_isolation ON public.leave_types FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);

-- ── leave_balances — per member × type derived cache (balance = Σ ledger.delta_hours) ──
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id             SERIAL PRIMARY KEY,
  department_id  INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  member_id      INTEGER NOT NULL,                     -- members.id (loose ref, house style; members are never hard-deleted)
  leave_type_id  INTEGER NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  balance_hours  NUMERIC NOT NULL DEFAULT 0,           -- cache maintained transactionally; ledger is source of truth
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leave_balances_uniq UNIQUE (department_id, member_id, leave_type_id)
);
CREATE INDEX IF NOT EXISTS idx_leave_balances_dept_member ON public.leave_balances(department_id, member_id);

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.leave_balances;
CREATE POLICY dept_isolation ON public.leave_balances FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);

-- ── leave_accrual_ledger — APPEND-ONLY audit trail of every bank movement ──
-- department_id is a plain column (no FK) like mayday_events (0059): an immutable record
-- must not be cascade-erased by a tenant delete. leave_type_id RESTRICTs so a bank type
-- with history can't be dropped (the route deactivates instead).
CREATE TABLE IF NOT EXISTS public.leave_accrual_ledger (
  id                 SERIAL PRIMARY KEY,
  department_id      INTEGER NOT NULL,
  member_id          INTEGER NOT NULL,
  leave_type_id      INTEGER NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  delta_hours        NUMERIC NOT NULL,                 -- +accrual/grant, −usage/adjustment
  reason             TEXT NOT NULL
                       CONSTRAINT leave_ledger_reason_chk
                       CHECK (reason IN ('accrual','grant','usage','adjustment','reversal')),
  source_kind        TEXT NOT NULL DEFAULT 'manual'
                       CONSTRAINT leave_ledger_source_kind_chk
                       CHECK (source_kind IN ('leave_request','manual','accrual_run')),
  source_id          INTEGER,                          -- e.g. leave_requests.id for usage/reversal
  period_key         TEXT,                             -- accrual-run idempotency key (1.2d)
  rate_at_post       NUMERIC,                          -- member hourly rate at post-time (comp-liability valuation)
  note               TEXT,
  created_by_user_id INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leave_ledger_dept_member_type
  ON public.leave_accrual_ledger(department_id, member_id, leave_type_id, created_at);
-- Accrual-run idempotency (1.2d): a given (dept, type, member, period) may post at most one
-- accrual entry, so a re-run/retry can never double-accrue. Partial: only accrual-run rows
-- carry a period_key; manual grants/usage/reversals leave it NULL and are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_ledger_accrual_period
  ON public.leave_accrual_ledger(department_id, leave_type_id, member_id, period_key)
  WHERE period_key IS NOT NULL;

ALTER TABLE public.leave_accrual_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dept_isolation ON public.leave_accrual_ledger;
CREATE POLICY dept_isolation ON public.leave_accrual_ledger FOR ALL
  USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
  WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);

COMMENT ON TABLE public.leave_accrual_ledger IS
  'Append-only ledger of every leave-bank movement (accrual, grant, usage, adjustment, '
  'reversal). REVOKE UPDATE/DELETE — a bank movement is a record; corrections are a reversal '
  'entry, never an edit. leave_balances.balance_hours is the derived cache = SUM(delta_hours). '
  'period_key gives accrual-run idempotency; rate_at_post preserves the rate for comp-liability '
  'valuation.';

-- ── Role grants (guarded so the file also runs on a local dev DB without these roles) ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
    -- leave_types: editable config, but NEVER hard-deleted (deactivate via UPDATE active=false).
    GRANT SELECT, INSERT, UPDATE ON public.leave_types TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.leave_types_id_seq TO of_app;
    -- leave_balances: derived cache — upserted (INSERT/UPDATE), never deleted by the app.
    GRANT SELECT, INSERT, UPDATE ON public.leave_balances TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.leave_balances_id_seq TO of_app;
    -- leave_accrual_ledger: append-only — SELECT + INSERT only.
    GRANT SELECT, INSERT ON public.leave_accrual_ledger TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE public.leave_accrual_ledger_id_seq TO of_app;
  END IF;
END $$;

-- Supabase default privileges auto-grant UPDATE/DELETE on new tables to of_app + the API
-- roles (the 0046/0059 lesson). Two enforcements:
--   * the immutable ledger must be PHYSICALLY un-rewritable → revoke UPDATE + DELETE.
--   * leave_types (config) + leave_balances (cache) are DEACTIVATED / upserted, never
--     hard-deleted (a bank type carries history) → revoke DELETE (UPDATE/INSERT stay).
-- PUBLIC always exists; the named roles are guarded.
DO $$
  DECLARE r text;
BEGIN
  REVOKE UPDATE, DELETE ON public.leave_accrual_ledger FROM PUBLIC;
  REVOKE DELETE ON public.leave_types, public.leave_balances FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON public.leave_accrual_ledger FROM %I', r);
      EXECUTE format('REVOKE DELETE ON public.leave_types, public.leave_balances FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- Stamp the ledger (of_schema_migrations stays 1:1 with the files).
INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0076-leave-banks.sql', NOW());

COMMIT;
