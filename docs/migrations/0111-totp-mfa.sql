-- 0111-totp-mfa.sql
-- Phase 5 (HARDEN THE TAIL) — TOTP multi-factor auth + recovery codes,
-- with per-department org-wide enforcement.
--
-- MARKET BAR (competitor-shipping inventory, 12 fire/EMS RMS products,
-- 2026-07-26): 6 of 12 ship MFA (all three head vendors do), 5 of 12 ship TOTP,
-- 4 of 12 let an administrator mandate it org-wide. We shipped NONE of it.
--
-- Scope is TOTP and nothing more, deliberately:
--   * WebAuthn / passkeys / hardware keys — 0 of 12 ship it
--   * push-approval MFA                   — 0 of 12 ship it
--   * SMS                                 — restricted by NIST SP 800-63B, and
--                                           one competitor refuses it outright
-- Two quality notes from the same inventory that this design answers directly:
-- one competitor's MFA CANNOT be mandated by an administrator at all, and
-- another's has NO recovery path (a locked-out captain telephones a state
-- employee). We ship both the mandate and the recovery codes.
--
-- WHY COLUMNS ON `users` RATHER THAN NEW TABLES
-- ---------------------------------------------
-- The MFA check happens during login, BEFORE any department context exists, so
-- a separate table would need either an RLS policy it cannot satisfy pre-auth or
-- a SECURITY DEFINER function — and the DEFINER/RLS-bypass surface is Dale-gated
-- (repo CLAUDE.md). `users` is already read pre-login by findByUsername (SELECT *),
-- is OF-owned, and already carries RLS. Additive nullable columns introduce no new
-- isolation surface and no new gated review.
--
-- `users` is shared with FireHazmat. Every column here is additive and nullable
-- (or defaulted), so that application is unaffected.

-- The shared secret, base32. NULL = never enrolled.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;

-- Enrolment is TWO-PHASE: a secret exists as soon as enrolment starts, but
-- mfa_enabled stays FALSE until the member proves possession with a valid code.
-- An abandoned enrolment therefore never locks anyone out.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ;

-- REPLAY DEFENCE. A TOTP is valid for its whole ~30s window (±1 step), so
-- without recording the step that was consumed, an intercepted code can be
-- replayed for up to 90 seconds. This column stores the last accepted step;
-- verification refuses any step <= it. This is the single most commonly omitted
-- part of a TOTP implementation.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_step BIGINT;

-- Recovery codes as a JSONB array of { h: <sha256 hex>, used_at: <iso|null> }.
-- Only HASHES are stored — the plaintext codes are displayed exactly once, at
-- enrolment, and are unrecoverable afterwards by design.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_codes JSONB;

-- Per-department mandate. DEFAULT FALSE: enabling MFA for a whole department is
-- an explicit act by a chief, never a silent upgrade that locks a volunteer
-- roster out of the system overnight.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index: the only query that scans by this predicate is the chief's
-- "who still needs to enrol" list, and it only ever wants the un-enrolled.
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users (station_id) WHERE mfa_enabled = FALSE;

COMMENT ON COLUMN users.mfa_secret IS
  'Base32 TOTP shared secret (RFC 6238). NULL = never enrolled. Presence does NOT mean active — see mfa_enabled.';
COMMENT ON COLUMN users.mfa_enabled IS
  'TRUE only after the member proved possession with a valid code. Two-phase so an abandoned enrolment cannot lock anyone out.';
COMMENT ON COLUMN users.mfa_last_step IS
  'Last accepted RFC 6238 time step. Verification refuses any step <= this value, preventing replay of a code inside its own validity window.';
COMMENT ON COLUMN users.mfa_recovery_codes IS
  'JSONB array of { h: sha256-hex, used_at: timestamp|null }. Hashes only; plaintext is shown once at enrolment and never stored.';
COMMENT ON COLUMN departments.mfa_required IS
  'When TRUE every member of the department must enrol in TOTP MFA. DEFAULT FALSE — enabling is an explicit chief action.';
