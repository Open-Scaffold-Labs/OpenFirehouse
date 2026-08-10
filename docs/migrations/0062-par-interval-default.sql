-- 0062-par-interval-default.sql  (department-default PAR interval — 2026-07-16)
--
-- WHY: the Command Board's PAR interval is set per-incident (0048) and starts
-- BLANK — deliberately, because there is NO NFPA-mandated PAR interval ("every
-- 20 minutes" is departmental SOG convention, not a standard; see 0057's header
-- and utils/parClock.js). But a department whose SOG *does* say "PAR every 20"
-- currently makes the IC re-select 20 on every incident — friction at the worst
-- possible moment. The market-leading command board lets departments configure
-- PAR reminders to their SOPs; this is that, done our way:
--
--   departments.par_interval_default_min INTEGER NULL
--     NULL (the default) = exactly today's behavior — no timer until command
--     sets one. We never impose the folklore-20 on anyone; a department opts
--     into ITS OWN SOG number. When set, a newly activated board starts with
--     this interval pre-selected; command keeps the per-incident override,
--     because incident conditions vary and command outranks a setting.
--
-- The CHECK range (1–180 minutes) exists because a typo here mis-arms a
-- life-safety reminder: 0 would silently disable what the department asked
-- for (NULL is the explicit "off" spelling), and anything beyond 3 hours is
-- not a PAR cadence.
--
-- RELATED DECISION (2026-07-16, Matt): the 0057 par_anchor file remains
-- DELIBERATELY UNAPPLIED. Market check: no vendor ships a configurable clock
-- anchor (each hardcodes its own; the leader anchors to dispatch, as we do).
-- The per-department anchor setting is parked until a real department whose
-- dispatcher counts from on-scene asks for it. 0057 stays on disk as the
-- ready-made implementation; it is no longer a pending decision.
--
-- `departments` is the tenant root and is deliberately RLS-off (bootstrap), so
-- no policy is added — matching every prior departments migration.
--
-- APPLY: local rehearsal -> prod by hand (Supabase MCP apply_migration) ->
-- mirror into db.js for fresh installs. Stamps of_schema_migrations.
--
-- NUMBERING: 0061 (neris-phase2) is the ledger head; 0062 was free at write
-- time. (0057 exists as a file but is intentionally absent from the ledger.)

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS par_interval_default_min INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'departments_par_interval_default_chk'
                   AND conrelid = 'public.departments'::regclass) THEN
    ALTER TABLE public.departments
      ADD CONSTRAINT departments_par_interval_default_chk
      CHECK (par_interval_default_min IS NULL
             OR (par_interval_default_min >= 1 AND par_interval_default_min <= 180));
  END IF;
END $$;

COMMENT ON COLUMN public.departments.par_interval_default_min IS
  'Department SOG default for the Command Board PAR interval (minutes, 1-180). '
  'NULL = no timer until command sets one (there is no NFPA-mandated interval — '
  'never hardcode one). Pre-fills a newly activated board; command keeps the '
  'per-incident override.';

-- Stamp the ledger (of_schema_migrations stays 1:1 with the APPLIED files).
INSERT INTO public.of_schema_migrations (filename)
VALUES ('0062-par-interval-default.sql')
ON CONFLICT DO NOTHING;
