-- 0001_licenses.sql — persistent ledger for issued OpenFirehouse department licenses.
-- ADR-0001 (licensing-and-commercial-tier).
--
-- Apply against the OpenFirehouse-OWNED Supabase project (ref YOUR_PROJECT_REF):
--   psql "$OPENFIREHOUSE_DATABASE_URL" -f supabase/migrations/0001_licenses.sql
--
-- Mirrors FireHazmat's public.licenses + the jwt column from 0009, with
-- product_family added for explicit isolation (defense in depth — the
-- OpenFirehouse Supabase project is its own schema authority, but the column
-- means an accidental data move across product families is still detectable).

create table if not exists public.licenses (
  license_id              text         primary key,
  jti                     text         not null unique,
  jwt                     text,                                   -- retrieval-page reads this back
  product_family          text         not null default 'openfirehouse'
                                       check (product_family in ('openfirehouse', 'firehazmat')),
  stripe_invoice_id       text         not null unique,           -- idempotency key
  stripe_subscription_id  text,                                   -- null for free + comp issuances
  stripe_customer_id      text,
  dept_name               text,
  dept_email              text,
  tier                    text,                                   -- independent | career_small | career_mid | metro
  member_count            integer,                                -- attested
  station_count           integer,                                -- attested
  annual_budget_usd       bigint,                                 -- attested, in whole dollars
  livemode                boolean      not null default true,
  issued_at               timestamptz  not null default now(),
  expires_at              timestamptz  not null,
  issuer                  text         not null,                  -- stripe | dale | comp | free
  status                  text         not null default 'active', -- active | revoked | refunded
  revoked_at              timestamptz,
  revoked_reason          text,                                   -- refunded | dispute_lost | unpaid_after_dunning | manual | attestation_misrep | key_rotation
  metadata                jsonb        not null default '{}'::jsonb,
  constraint licenses_status_check
    check (status in ('active', 'revoked', 'refunded')),
  constraint licenses_issuer_check
    check (issuer in ('stripe', 'dale', 'comp', 'free')),
  constraint licenses_tier_check
    check (tier in ('independent', 'career_small', 'career_mid', 'metro')),
  constraint licenses_revoked_consistency
    check ((status = 'active' and revoked_at is null) or status <> 'active')
);

-- Lookup paths the runtime actually uses (same shape as FireHazmat):
--   1. revocation check    : WHERE jti = $1
--   2. webhook idempotency : WHERE stripe_invoice_id = $1
--   3. support lookup      : WHERE dept_email ILIKE $1
--   4. reconciler gap scan : WHERE status = 'active'
--   5. customer portal     : WHERE stripe_customer_id = $1

create index if not exists licenses_dept_email_idx
  on public.licenses (dept_email);
create index if not exists licenses_stripe_customer_idx
  on public.licenses (stripe_customer_id);
create index if not exists licenses_active_status_idx
  on public.licenses (status) where status = 'active';
create index if not exists licenses_expires_at_idx
  on public.licenses (expires_at) where status = 'active';

-- Defense in depth. Service role bypasses RLS as designed.
alter table public.licenses enable row level security;

comment on table public.licenses is
  'ADR-0001 — persistent ledger of issued OpenFirehouse department licenses. '
  'All writes via Vercel serverless functions; all reads via the runtime client '
  'and Edge Functions for revocation check (fail-open). Status = active | revoked | refunded. '
  'Tier reflects the Rule C classification (independent | career_small | career_mid | metro). '
  'See docs/adr/ADR-0001-licensing-and-commercial-tier.md and EULA.md.';

comment on column public.licenses.product_family is
  'Defense in depth — should always be openfirehouse in this Supabase project. The constraint '
  'prevents an accidental cross-write from breaking either product.';
comment on column public.licenses.tier is
  'independent (free) | career_small ($999) | career_mid ($2499) | metro ($4999)';
comment on column public.licenses.member_count is
  'Operational members attested at signup. Re-attest within 60 days of crossing a threshold.';
comment on column public.licenses.annual_budget_usd is
  'Annual operational budget in whole USD (no cents) as attested at signup.';
