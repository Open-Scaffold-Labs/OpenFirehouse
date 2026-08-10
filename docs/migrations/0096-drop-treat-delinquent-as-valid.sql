-- 0096-drop-treat-delinquent-as-valid.sql
--
-- Phase 3, module 3.1b — remove the column added by 0094 EARLIER THE SAME DAY.
-- Spec: docs/PHASE3-31B-CATALOGUE-EXPIRY-RENEWAL-SPEC-2026-07-27.md §2.2 (rewritten)
--
-- Claimed by stub 2026-07-27. Head at claim: 0095, verified by listing docs/migrations/.
-- Phase 3 owns block 0090–0099 (§5b rule 2).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- WHY THIS COLUMN SHOULD NEVER HAVE EXISTED — Matt's ruling, 2026-07-27
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 0094 added `departments.treat_delinquent_as_valid` to answer "is a permit inside its grace
-- period lawful to OPERATE on?" I had graded that question un-derivable from the market and
-- escalated it as a department-configurable posture, defaulted to the strict reading.
--
-- Matt: "we shouldn't say anything about it being lawful, that's not our job, it just needs
-- to work how the other platforms do it."
--
-- He is right, and the error is worth recording precisely because the boolean LOOKED humble.
-- Making it configurable felt like deferring to the department. It is not. A configurable
-- legal conclusion is still a legal conclusion — the software would render a verdict on
-- whether a business may lawfully operate, and a department that never opened its settings
-- would get a verdict it never chose. THE ONLY SAFE NUMBER OF LEGAL VERDICTS FOR THIS
-- PRODUCT TO RENDER IS ZERO, and "configurable" is not zero. No documented platform ships a
-- toggle like this either; they show the status ladder and the dates and let the bureau draw
-- its own conclusion.
--
-- What replaces it is not a different default — it is STATING THE FACTS AND STOPPING:
-- the term ended on <date>, the permit is in grace, it is renewable until <date>. Every one
-- of those is something the record actually knows. Whether a business may operate on that is
-- the AHJ's call, made by a human who has the rest of the context.
--
-- This is the same doctrine as 3.1a's "record says Active" chip (show BOTH facts, invent
-- neither) and OFM's "never claim a status the app isn't reading". It is also the framing
-- checkpoint working as intended: "make it configurable" is the same species of excuse as
-- "harden it later" — it converts a decision you should not be making into a setting, and
-- the setting still has a default.
--
-- SAFE TO DROP: the column was added earlier today by 0094, is referenced by NOTHING (no
-- route, no query, no client — grep-verified across server/src and client/src before
-- writing this), and prod has never had a non-default value in it. This is not a data
-- migration; there is no data.
--
-- ⚠ ORDER NOTE — the inverse of the usual D6. For an ADD, the migration lands first and the
-- code follows. For a DROP, code that reads the column must go FIRST or the deploy 500s.
-- Here neither order can hurt because nothing reads it; the reasoning is recorded so the
-- next session doesn't infer the wrong general rule from this file.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE departments DROP COLUMN IF EXISTS treat_delinquent_as_valid;

INSERT INTO of_schema_migrations (filename) VALUES ('0096-drop-treat-delinquent-as-valid.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
