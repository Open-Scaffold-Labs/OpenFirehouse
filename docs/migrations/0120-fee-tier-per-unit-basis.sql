-- 0120-fee-tier-per-unit-basis.sql
--
-- Make a tier's per-unit BASIS explicit instead of assumed.
--
-- Claimed by stub 2026-08-04 (pushed, 2d6aad9) per the F4 rule, alongside 0119.
-- Head was 0118 at claim time, verified by listing docs/migrations/.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE $75 QUESTION, AND WHY IT IS A COLUMN AND NOT A DECISION
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- A tier reading "$250, plus $15 per 1,000 sq ft" has two readings for a 7,200 sq ft building:
--     whole quantity      $250 + $15 x 8 = $370   (all 7,200, rounded up)
--     excess above floor  $250 + $15 x 3 = $295   (only the 2,200 over the tier's 5,000 floor)
-- Same sentence, $75 apart, on every permit.
--
-- 🔴 0118 SHIPPED WITH THE SECOND ONE HARDCODED, AND WITH A CITATION THAT DOES NOT EXIST.
-- feeEngine's header attributed the phrase "$X plus $Y per 1,000 sq ft" to spec §1.7. It is not
-- in §1.7. I paraphrased it out of the chaining discussion and then cited it as a quote. §1.7's
-- only verbatim per-unit phrases are "plus 50%", "+$10 per bed", "per quarter hour or part
-- thereof" and "additional 300%" — and the one unambiguous per-unit instance, "+$10 per bed",
-- means EVERY bed, i.e. the WHOLE-QUANTITY form. So the documented evidence points at the form
-- I did NOT build for tiers, and excess-above-floor is a shape I introduced with nothing behind
-- it. Fixed in the engine header by this change.
--
-- WHY BOTH, RATHER THAN SWAPPING TO THE OTHER ONE. A fee schedule is a document a department
-- ADOPTS BY ORDINANCE. The software does not get to pick the arithmetic; it has to express
-- whatever the ordinance says, and real ordinances say both. So the failure mode was never
-- "picked the wrong one" — it was "only supports one". This module has already met that exact
-- pattern twice and answered it the same way both times:
--     hourly rates  — market SPLIT on multiplier vs minimum-hours  -> support BOTH, same row
--     surcharge     — applies to some fee lines and not others     -> per-line flag, not global
-- Per-tier basis is the third instance of the same rule. It needed no new market pass and no
-- field question; it follows from the module's own established logic.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- NOT NULL, NO DEFAULT — deliberately, and this is the load-bearing part
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Whoever types the schedule in must say which their ordinance means. This is the
-- `departments.treat_delinquent_as_valid` lesson from 0094/0096, which was added and DROPPED
-- the same day: a configurable default that nobody sets is still a decision they never made,
-- and a department that never touched the setting would have got an answer it did not choose.
-- Here that unchosen answer is worth $75 a permit in the example above.
--
-- Free to make mandatory right now: `fi_fee_item_tiers` holds ZERO rows on prod (verified at
-- claim time), so there is no backfill and no ambiguity about what existing rows meant. This
-- is exactly the window the pre-launch standing fact exists for — doing it properly is cheap
-- today and expensive the moment a department has authored a schedule.
--
-- Shape: `per_unit_basis TEXT` CHECK IN ('whole_quantity','excess_above_floor'), required
-- whenever per_unit IS NOT NULL and forbidden when it is NULL (a basis with no rate is noise).
--
-- ADDITIVE. One column on one table with no rows. No data migration.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE fi_fee_item_tiers
  ADD COLUMN IF NOT EXISTS per_unit_basis TEXT;

-- The closed set. Two values because two readings of the same ordinance sentence exist in the
-- wild, and the department's own text is what picks between them.
DO $c1$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_fee_item_tiers_per_unit_basis_ck') THEN
    ALTER TABLE fi_fee_item_tiers
      ADD CONSTRAINT fi_fee_item_tiers_per_unit_basis_ck
      CHECK (per_unit_basis IS NULL OR per_unit_basis IN ('whole_quantity','excess_above_floor'));
  END IF;
END $c1$;

-- REQUIRED whenever there is a per-unit rate, and FORBIDDEN when there is not.
-- The forbidden half matters as much as the required half: a basis with no rate is a setting
-- that reads as meaningful and changes nothing, which is how a reviewer is misled.
-- Together with the existing (per_unit IS NULL) = (unit_size IS NULL) check, a per-unit charge
-- can only exist fully specified: a rate, a unit size, AND a stated basis.
--
-- 🔴 ADDED NOT VALID, THEN VALIDATED — because "the table is empty" was a claim about PROD that
-- I generalized to every database, and the first apply FAILED on my own dev box. It held 11 rows
-- of test residue with `per_unit` set and no basis, so a plain ADD CONSTRAINT aborted.
-- A migration must not require a clean database. NOT VALID binds every future INSERT/UPDATE
-- immediately; the VALIDATE below then either succeeds (prod, and any clean DB — fully enforced,
-- identical to adding it validated) or fails loudly with the number of rows a human has to fix.
-- That is the 0056 doctrine — an unmappable legacy value is SURFACED, never silently defaulted.
-- Backfilling a basis would have been the worse choice: it would invent, per row, the very
-- decision this column exists to make the department state.
DO $c2$
DECLARE offending INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_fee_item_tiers_per_unit_complete_ck') THEN
    ALTER TABLE fi_fee_item_tiers
      ADD CONSTRAINT fi_fee_item_tiers_per_unit_complete_ck
      CHECK ((per_unit IS NULL) = (per_unit_basis IS NULL)) NOT VALID;
  END IF;

  SELECT count(*) INTO offending FROM fi_fee_item_tiers
   WHERE (per_unit IS NULL) <> (per_unit_basis IS NULL);

  IF offending = 0 THEN
    ALTER TABLE fi_fee_item_tiers VALIDATE CONSTRAINT fi_fee_item_tiers_per_unit_complete_ck;
    RAISE NOTICE '0120: per_unit_basis constraint VALIDATED (no pre-existing rows to fix)';
  ELSE
    RAISE WARNING '0120: constraint left NOT VALID — % existing tier row(s) have a per-unit rate with no stated basis. They are enforced on next write; list them with: SELECT id, item_id, per_unit FROM fi_fee_item_tiers WHERE per_unit IS NOT NULL AND per_unit_basis IS NULL;', offending;
  END IF;
END $c2$;

-- of_app already holds UPDATE on this table (draft-only, trigger-enforced), so the new column
-- is writable while a version is a Draft and frozen after adoption, with no extra grant.

INSERT INTO of_schema_migrations (filename) VALUES ('0120-fee-tier-per-unit-basis.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
