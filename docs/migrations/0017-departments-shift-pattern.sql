-- 0017-departments-shift-pattern.sql
-- RETRO-CAPTURE (2026-06-15): formalizes a prod schema change that originally
-- shipped on 2026-06-15 ~05:58 UTC via the db.js fresh-install mirror + an
-- ad-hoc Supabase MCP apply, WITHOUT a numbered migration file at the time
-- (P4.3). This file exists for ledger completeness + replayability.
--
-- NOTE ON ORDER: chronologically this ran BETWEEN 0012 and 0013 (see the
-- of_schema_migrations.applied_at, which records the true original time). It is
-- numbered 0017 because the migration sequence is forward-only — we never
-- renumber already-applied migrations. It is fully idempotent (ADD COLUMN IF
-- NOT EXISTS), so applying it now is a no-op on prod, and fresh installs get
-- this column via db.js (block 3b) regardless of file order.
--
-- Change: departments.shift_pattern — the department's shift MODE label
-- (e.g. the platoon/Kelly scheme), set by the Department Setup Wizard.

ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS shift_pattern TEXT;
