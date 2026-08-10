-- 0075 — Per-department minimum-staffing config + warn/block enforcement (Phase 1.2c).
-- Market pass (2026-07-24, competitors generic): WARNING when an approved leave would drop a
-- shift below minimum staffing is the market NORM; hard-block is a per-department opt-in, not
-- the default. This introduces the per-dept config that replaces the scattered hardcoded
-- MIN_CREW=3 (leaveRequests.js) — the leave path reads it first; other hardcoded sites migrate
-- opportunistically. Advisory posture: WARN surfaces the shortfall to the approver; BLOCK
-- (opt-in) 422s an approval that would breach. Never auto-denies, never payroll-of-record.
--
-- `departments` is the tenant ROOT (RLS-off, bootstrap per the OF security model), so these are
-- additive columns only — no RLS / policy change. No drops, no data loss.
-- D6: applied to prod by hand (Supabase MCP) → verified by query → ledgered → then the
-- dependent code (leaveRequests.js config read + departments PATCH allow-list) ships.

BEGIN;

-- Nullable: NULL means "no explicit per-shift minimum set" → the leave path falls back to the
-- prior default (3) so behavior is unchanged until a chief configures a number.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS min_staffing_per_shift INTEGER;

-- Enforcement mode. Default 'warn' matches the market norm and preserves today's behavior
-- (nothing was ever blocked before). The DEFAULT backfills existing rows to 'warn'.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS staffing_enforcement TEXT NOT NULL DEFAULT 'warn';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_staffing_enforcement_chk') THEN
    ALTER TABLE departments ADD CONSTRAINT departments_staffing_enforcement_chk
      CHECK (staffing_enforcement IN ('warn','block'));
  END IF;
END $$;

INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0075-department-min-staffing-config.sql', NOW());

COMMIT;
