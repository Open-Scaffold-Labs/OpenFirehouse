-- 0037-recall-response-destination.sql — Station/Scene/Unable structured recall
-- response (ENDGAME B5, Dale-gated; built 2026-07-04).
--
-- ADDITIVE + backward compatible by design:
--   • `response` keeps its existing two values ('responding' | 'unavailable') —
--     old clients (web already shipped, mobile builds in the field) keep working
--     unchanged and their rows stay valid.
--   • New nullable `destination` refines a 'responding' row: 'station' | 'scene'.
--     NULL = "responding (unspecified)" — exactly what every pre-existing row
--     and every old client means today. 'Unable' is the existing 'unavailable'.
--   • CHECK is named + guarded so the migration is idempotent, and scoped so
--     'unavailable' rows can never carry a destination.
--
-- Mirrored into server/src/db.js (initDb additive column + respond()).
-- Apply order: local → prod → ledger. No backfill needed (NULL is the correct
-- historical value).

ALTER TABLE public.recall_responses
  ADD COLUMN IF NOT EXISTS destination TEXT;

DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recall_responses_destination_check'
      AND conrelid = 'public.recall_responses'::regclass
  ) THEN
    ALTER TABLE public.recall_responses
      ADD CONSTRAINT recall_responses_destination_check CHECK (
        destination IS NULL
        OR (response = 'responding' AND destination IN ('station', 'scene'))
      );
  END IF;
END $do$;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- ALTER TABLE public.recall_responses DROP CONSTRAINT IF EXISTS recall_responses_destination_check;
-- ALTER TABLE public.recall_responses DROP COLUMN IF EXISTS destination;

INSERT INTO public.of_schema_migrations (filename)
VALUES ('0037-recall-response-destination.sql')
ON CONFLICT (filename) DO NOTHING;
