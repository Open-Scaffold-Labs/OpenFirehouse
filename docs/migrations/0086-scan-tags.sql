-- 0086 — Phase 2.5 barcode/QR scan tags. Spec: docs/PHASE2-BARCODE-SPEC-2026-07-26.md.
-- Claimed from the §5b block (`fd714f2`).
--
-- Opaque, unguessable per-record tags (a printed label never carries a raw row id);
-- resolution is dept-scoped server-side and READ-ONLY. Tags mint at creation in the
-- routes; this migration adds the columns + partial unique indexes + backfills every
-- existing row. Ceiling honored: scanning accelerates existing doors — no new write
-- surface, no scan-enforced gate.

BEGIN;

ALTER TABLE public.tracked_assets      ADD COLUMN IF NOT EXISTS scan_tag TEXT;
ALTER TABLE public.inventory_items     ADD COLUMN IF NOT EXISTS scan_tag TEXT;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS scan_tag TEXT;
ALTER TABLE public.apparatus           ADD COLUMN IF NOT EXISTS scan_tag TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tracked_assets_scan_tag      ON public.tracked_assets(scan_tag)      WHERE scan_tag IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_scan_tag     ON public.inventory_items(scan_tag)     WHERE scan_tag IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_locations_scan_tag ON public.inventory_locations(scan_tag) WHERE scan_tag IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_apparatus_scan_tag           ON public.apparatus(scan_tag)           WHERE scan_tag IS NOT NULL;

-- Backfill: 'ofh' + 20 hex chars of randomness per row (md5-based — no pgcrypto
-- dependency; per-row random()+clock_timestamp() salting keeps rows distinct).
UPDATE public.tracked_assets      SET scan_tag = 'ofh' || substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 20) WHERE scan_tag IS NULL;
UPDATE public.inventory_items     SET scan_tag = 'ofh' || substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 20) WHERE scan_tag IS NULL;
UPDATE public.inventory_locations SET scan_tag = 'ofh' || substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 20) WHERE scan_tag IS NULL;
UPDATE public.apparatus           SET scan_tag = 'ofh' || substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 20) WHERE scan_tag IS NULL;

INSERT INTO of_schema_migrations (filename, applied_at)
VALUES ('0086-scan-tags.sql', NOW());

COMMIT;
