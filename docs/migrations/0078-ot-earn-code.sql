-- 0078 — OT earn-code axis for FLSA §225 qualified-overtime reporting (Phase 1.2f).
--
-- Adds the market-standard EARN-CODE axis to ot_records so the tax-QUALIFYING portion of
-- overtime can be distinguished from the rest and exported. Spec: docs/PHASE1-LEAVE-ACCRUALS-
-- SPEC-2026-07-24.md §2b (legal citation settled 2026-07-24) + §5 (1.2f).
--
-- Legal facts confirmed (research agent, 2026-07-25; OBBBA → IRC §225 / IRS Notice 2025-69):
--   * QUALIFIED overtime = ONLY the HALF-premium (0.5× the regular rate, the "half" of
--     time-and-a-half), NOT the gross OT pay.
--   * ONLY FLSA §7 / §7(k) / §7(o)-required OT premium qualifies. OT owed only by a CBA/MOU/
--     state law/department policy does NOT qualify — including the premium on hours below the
--     §7(k) work-period threshold (212h/28-day for fire, prorated).
--   * Reporting: W-2 Box 12 Code "TT" — voluntary TY2025 (penalty relief, IRS Notice 2025-62),
--     MANDATORY TY2026. The employer/payroll system files it; a timekeeping product COMPUTES +
--     EXPORTS the figure. OF is ADVISORY — never payroll-of-record.
--
-- Two additive, NULLABLE columns on the existing ot_records (which today tracks OT in HOURS
-- only — ot_type is the equalization axis 'mandatory'/'voluntary', ORTHOGONAL to the FLSA
-- basis, so it is NOT reused):
--   * earn_code — the FLSA basis of the OT premium. CLOSED set (CHECK). NULL on legacy rows =
--     UNCLASSIFIED → the export surfaces these for a human and NEVER auto-qualifies them
--     (the legacy-rows-left-NULL-and-surfaced doctrine). mandatory/voluntary is NOT mapped to
--     an earn_code (a mandatory OT may be FLSA-required OR contractual).
--   * regular_rate — the weighted-avg regular-rate basis for the half-premium (optional; OF
--     stores no pay rates today). When present the export can show the half-premium DOLLARS;
--     when NULL the export carries qualifying HOURS + the 0.5×rate formula for payroll to apply.
--
-- Deferred (honest, same run-store block as auto-hours): the §7(k) work-period ENGINE that
-- auto-classifies which worked hours fall above the 212/28-day threshold (and splits a record
-- that straddles it) — that needs the worked-hours store mid-consolidation. Here the earn_code
-- is SET (entered/defaulted per the dept's FLSA config), not auto-derived from raw hours.
--
-- Additive + nullable → no backfill, no data loss, no RLS change (ot_records RLS already set).
-- D6: applied to prod by hand (Supabase MCP) → verified live → ledgered → THEN the dependent
-- code (utils/qualifiedOt.js + otEqualization write + the qualified-OT export) ships.
-- Head verified 0077 (docs/migrations/ + prod of_schema_migrations, 2026-07-25); 0078 free.

BEGIN;

ALTER TABLE public.ot_records
  ADD COLUMN IF NOT EXISTS earn_code TEXT
    CONSTRAINT ot_records_earn_code_chk
    CHECK (earn_code IS NULL OR earn_code IN ('flsa_ot','cba_ot','other_premium','comp_cashout'));

ALTER TABLE public.ot_records
  ADD COLUMN IF NOT EXISTS regular_rate NUMERIC;

INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0078-ot-earn-code.sql', NOW());

COMMIT;
