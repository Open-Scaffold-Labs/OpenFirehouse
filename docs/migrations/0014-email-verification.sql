-- 0014-email-verification.sql — email verification for self-serve signup
-- (P4.6 pre-marketing gate). Additive + idempotent. Mirror into db.js; stamp ledger.
--
-- Token-in-DB (sha256 hash) — no new signing-secret env dependency. The raw token
-- is emailed once (via Resend, reusing checkout.js's pattern); only the hash is
-- stored. SOFT gate: signup still logs the chief in immediately; email_verified is
-- a trust signal + abuse filter (a bot signup can't click the link), never a hard
-- block. users is shared_access (OF + FireHazmat); these columns are additive and
-- default to a safe value, so FireHazmat is unaffected.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verify_token_hash text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verify_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_users_email_verify_token ON public.users(email_verify_token_hash);
