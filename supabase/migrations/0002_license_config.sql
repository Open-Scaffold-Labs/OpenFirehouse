-- 0002_license_config.sql — server-side storage for the activated department
-- license JWT. ADR-0001 Step 13 (runtime enforcement).
--
-- One row per OpenFirehouse install. The chief activates the license by
-- pasting the JWT into Settings → Activate License; the server validates
-- the signature + expiry against the embedded public key, looks up status
-- in the cloud ledger, and stores the JWT here so subsequent boots skip
-- the activation gate.

create table if not exists public.license_config (
  id           int          primary key default 1 check (id = 1),
  jwt          text         not null,
  jti          text         not null,
  license_id   text         not null,
  dept_name    text,
  dept_email   text,
  tier         text,
  expires_at   timestamptz  not null,
  activated_at timestamptz  not null default now(),
  activated_by text,
  metadata     jsonb        not null default '{}'::jsonb
);

alter table public.license_config enable row level security;

comment on table public.license_config is
  'Single-row table holding the activated department license JWT. '
  'Written via /api/license/activate, read via /api/license/status and '
  'the server boot checks. See docs/adr/ADR-0001 + EULA.md.';
