'use strict';
/**
 * constants/feeSchedule.js — the closed sets of the fee-schedule model (Phase 3, module 3.2).
 *
 * SAME DOCTRINE AS constants/inspectionResult.js: these are CONTROL values. They are matched
 * EXACTLY and never by pattern. The repo has already paid for the alternative — the inspection
 * pass doctrine was a regex (/^pass\b/i) and "Passed" silently defeated a life-safety control.
 * Nothing here may ever be pattern-matched, lowercased-and-compared, or startsWith'd.
 *
 * ⚠ EVERY SET BELOW IS MIRRORED BY A CHECK CONSTRAINT IN docs/migrations/0118-fi-fee-schedules.sql.
 * If you add a value here you MUST add a migration widening the matching CHECK, and vice versa.
 * A value legal in JS but illegal in Postgres is a 23514 at write time; a value legal in Postgres
 * but unknown to JS is worse — it is a fee line the engine cannot compute, which is the F9
 * silent-$0 failure. `assertMirrorsDatabase()` below is the regression fence for that.
 */

/**
 * The five primitives of §1.7, plus 'surcharge'.
 *
 * 'surcharge' is not a sixth primitive smuggled in — §1.7 requires a per-fee-line applicability
 * flag because a flat "apply X% to the invoice total" is WRONG in at least two jurisdictions
 * (one applies 10% to installation permits only; one runs a third column reading "N/A" on its
 * hourly, re-inspection and appeal lines). A surcharge's base is the SURCHARGEABLE SUBTOTAL,
 * which is a different base from percent_of's "one named fee", so it cannot be modelled as
 * percent_of without losing both jurisdictions.
 */
const FEE_ITEM_KINDS = Object.freeze([
  'flat',        // one amount. One county: 71 of 73 operational types are the identical amount.
  'tiered',      // lookup on 1 or 2 axes
  'valuation',   // construction valuation -> dollars (a tiered table on a money axis)
  'hourly',      // hours x rate, with BOTH a minimum-hours floor and an after-hours multiplier
  'percent_of',  // a percentage of ONE named other item
  'surcharge',   // a percentage of the surchargeable subtotal
]);

/**
 * The tiering / metering axes. EXACTLY the 18 observed in §1.7, plus 'hours' (the metered
 * quantity for an hourly item) and 'occupancy_group' (the categorical second axis of the one
 * true 2-D matrix: occupancy group x square footage).
 *
 * CLOSED ON PURPOSE. An unrecognised axis is the F9 failure mode — it computes $0 in silence.
 * Adding a 19th is a one-line migration plus a line here, and that friction is the point.
 */
const FEE_VARIABLES = Object.freeze([
  'square_footage', 'occupant_load', 'stories', 'sprinkler_heads', 'alarm_devices',
  'smoke_heat_vents', 'gate_count', 'tank_count', 'chemical_count', 'licensed_beds',
  'students', 'apartment_units', 'hotel_rooms', 'hazmat_quantity',
  'construction_valuation', 'job_material_cost', 'acres', 'outside_storage_area',
  'hours', 'occupancy_group',
]);

/** Axes whose values are categorical text (matched exactly), not numeric ranges. */
const CATEGORICAL_VARIABLES = Object.freeze(['occupancy_group']);

/**
 * How a tier's per-unit rate is measured (migration 0120). A tier reading
 * "$250, plus $15 per 1,000 sq ft" has two readings for a 7,200 sq ft building:
 *   whole_quantity      $250 + $15 x 8 = $370   (all 7,200, rounded up)
 *   excess_above_floor  $250 + $15 x 3 = $295   (only the 2,200 above the tier's 5,000 floor)
 * Same sentence, $75 apart, on every permit.
 *
 * BOTH, chosen per tier, because a fee schedule is a document a department ADOPTS BY ORDINANCE
 * and real ordinances say both — the software does not get to pick the arithmetic. Third
 * instance of the pattern in this module: hourly supports multiplier AND minimum-hours because
 * the market is split; the surcharge is a per-line flag because it applies to some lines and
 * not others. There is no default: a basis is required whenever per_unit is set and forbidden
 * when it is not (CHECK-enforced), because an unchosen default here is a fee nobody decided.
 */
const PER_UNIT_BASES = Object.freeze(['whole_quantity', 'excess_above_floor']);

/**
 * Hour rounding. 'up_any_part' is the DEFAULT because it is what the source text says, not
 * because it is generous: "per quarter hour or part thereof" and "prorated in 15-minute
 * increments at the beginning of each increment" are both quoted provisions in §1.7.
 */
const ROUNDING_MODES = Object.freeze(['up_any_part', 'nearest', 'down', 'none']);

/** Ordered adjustments — the trailing "plus 50%", the "+$10 per bed". */
const MODIFIER_KINDS = Object.freeze([
  'percent_add',      // + value% of the running amount
  'percent_multiply', // x value
  'amount_add',       // + $value
  'per_unit_add',     // + $value for every unit_size of per_unit_variable
  'floor',            // running amount may not fall below value
  'cap',              // running amount may not exceed value
]);

const SCHEDULE_VERSION_STATUSES = Object.freeze(['Draft', 'Adopted', 'Superseded']);

/** §1.7's five observed governance forms for adopting a fee schedule. */
const ADOPTING_INSTRUMENTS = Object.freeze([
  'ordinance', 'ordinance_exhibit', 'code_appendix', 'board_resolution',
  'resolution_under_enabling_ordinance',
]);

const ASSESSMENT_KINDS = Object.freeze([
  'base', 'reinspection', 'penalty_work_without_permit', 'surcharge', 'other',
]);

/**
 * §1.7's penalty band for work without a permit: observed 1.5x-3x, modal 2.0x, one outlier at
 * "additional 300%" (effective 4x) which also STACKS. Default 2.0, allow 1.5-4.0, stacking opt-in.
 */
const PENALTY_MULTIPLIER_DEFAULT = '2.00';
const PENALTY_MULTIPLIER_MIN = 1.5;
const PENALTY_MULTIPLIER_MAX = 4.0;

/**
 * The mirror fence. Call with the live CHECK-constraint values pulled from Postgres; it reports
 * any value the database allows that JS does not know about, and vice versa.
 *
 * This exists because the two lists CANNOT be kept in step by intention. `certs.js` and
 * `apparatus_positions.required_certs` drifted exactly this way (the old seeder matched members
 * by hardcoded NAME and went silently sparse when the roster changed).
 */
function diffAgainstDatabase(setName, dbValues) {
  const known = {
    FEE_ITEM_KINDS, FEE_VARIABLES, ROUNDING_MODES, MODIFIER_KINDS,
    SCHEDULE_VERSION_STATUSES, ADOPTING_INSTRUMENTS, ASSESSMENT_KINDS,
  }[setName];
  if (!known) return { error: `unknown set ${setName}` };
  const db = new Set(dbValues);
  return {
    inDatabaseOnly: [...db].filter((v) => !known.includes(v)), // the dangerous direction
    inCodeOnly: known.filter((v) => !db.has(v)),
  };
}

module.exports = {
  FEE_ITEM_KINDS,
  FEE_VARIABLES,
  CATEGORICAL_VARIABLES,
  PER_UNIT_BASES,
  ROUNDING_MODES,
  MODIFIER_KINDS,
  SCHEDULE_VERSION_STATUSES,
  ADOPTING_INSTRUMENTS,
  ASSESSMENT_KINDS,
  PENALTY_MULTIPLIER_DEFAULT,
  PENALTY_MULTIPLIER_MIN,
  PENALTY_MULTIPLIER_MAX,
  diffAgainstDatabase,
};
