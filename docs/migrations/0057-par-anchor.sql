-- 0057-par-anchor.sql
--
-- WHY: the PAR clock has to count from somewhere, and WHERE it counts from is not
-- our decision to make. It is the department's, and the standard says so twice.
--
-- NFPA 1500 §8.2.4 (mandatory body):
--   "The fire department communications center SHALL START AN INCIDENT CLOCK WHEN
--    THE FIRST ARRIVING UNIT IS ON-SCENE of a working structure fire or hazardous
--    materials incident..."
--   §8.2.4.1 — dispatch notifies the IC "at every 10-minute increment."
--   §8.2.4.2 — the IC MAY CANCEL the notification.
--
-- NFPA 1500 Annex A.8.2.4 (non-mandatory, and it describes OUR CUSTOMER):
--   "Some fire departments can also wish to be provided with reports of ELAPSED
--    TIME-FROM-DISPATCH. This method can be more appropriate for FIRE DEPARTMENTS
--    WITH LONG TRAVEL TIMES where significant incident progress could have occurred
--    prior to the first unit arrival."
--
-- That is the rural / volunteer profile — OpenFirehouse's core market. So BOTH
-- anchors are legitimate and a hardcoded default would be wrong for roughly half
-- our users. It becomes a setting.
--
-- THE FAILURE MODE THIS EXISTS TO PREVENT:
--   In most jurisdictions DISPATCH is ALREADY announcing elapsed-time notifications
--   over the radio — NFPA makes it their job, and real dispatch SOPs script it
--   ("Dispatch should notify command at ten minute intervals"). If OUR board is
--   anchored differently from THEIR clock, the IC hears TWO DIFFERENT NUMBERS FOR
--   THE SAME FIRE, on the radio and on the screen, while people are inside a
--   burning building. The department must be able to make our clock agree with
--   their dispatcher's, and the UI must SAY which anchor is in use.
--
-- NOTE ON THE INTERVAL, because it is a common and dangerous myth:
--   There is NO NFPA-mandated PAR interval. NFPA 1500 §8.4 requires an
--   accountability SYSTEM; it prescribes no "every N minutes". The ubiquitous
--   "PAR every 20 minutes" is departmental SOG convention, not a standard. Never
--   cite a standard for the default, and never hardcode it. (par_interval_min
--   already lives per-incident on active_boards, from 0048.)
--
-- WHAT THIS DOES: one nullable-with-default text column on the tenant root.
-- `departments` is the tenant root and is deliberately RLS-off (bootstrap), so no
-- policy is added here — matching every prior departments migration.
--
-- APPLY: local rehearsal -> prod by hand (Supabase MCP apply_migration) -> mirror
-- into db.js for fresh installs. The runner stamps of_schema_migrations.
--
-- NUMBERING: 0055 and 0056 were taken by a concurrent Fire-Inspection session in
-- this repo. Re-derived at write time; 0057 was free.

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS par_anchor TEXT NOT NULL DEFAULT 'on_scene';

-- Only two legal values. A typo here would silently mis-anchor a life-safety clock,
-- so the database refuses it rather than the application hoping for the best.
DO $$
BEGIN
  ALTER TABLE public.departments
    ADD CONSTRAINT departments_par_anchor_chk
    CHECK (par_anchor IN ('on_scene', 'dispatch'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.departments.par_anchor IS
  'What the fireground PAR clock counts from. on_scene = NFPA 1500 §8.2.4 default '
  '(first arriving unit on-scene). dispatch = Annex A.8.2.4, for departments with '
  'long travel times (rural/volunteer). Must match what the department''s DISPATCH '
  'CENTER announces over the radio, or the IC hears two different numbers for the '
  'same fire.';
