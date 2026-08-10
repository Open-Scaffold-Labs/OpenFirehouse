// prevention/feeForm.js — "is this fee-schedule form actually submittable?"
//
// ── WHY THESE EXIST AS PURE FUNCTIONS ────────────────────────────────────────────────
// Each mirrors a CHECK CONSTRAINT in migration 0118. The database is the authority and will
// refuse regardless; these exist so the operator is not sent into a 422 by a form that let
// them press the button. The first pass gated "Add a fee line" on code + name ONLY, so five
// of the six fee kinds could be submitted incomplete and were refused every time.
//
// They are here rather than inline in the JSX because a rule that mirrors a database
// constraint is exactly the kind of decision that drifts silently — and the client test
// runner cannot import a .jsx file, so a rule living in one is a rule with no fence.
//
// The constraints being mirrored (docs/migrations/0118-fi-fee-schedules.sql):
//   flat        → flat_amount NOT NULL
//   hourly      → hourly_rate NOT NULL
//   percent_of  → percent_rate NOT NULL AND input_item_id NOT NULL
//   surcharge   → percent_rate NOT NULL AND NOT surchargeable
//   tiered      → input_variable NOT NULL
//   valuation   → input_variable NOT NULL
//   tiers       → (per_unit IS NULL) = (unit_size IS NULL)

const has = (v) => typeof v === 'string' ? v.trim().length > 0 : v !== null && v !== undefined && v !== '';

/** Can this fee line be added? Mirrors the five kind-specific CHECKs. */
export function itemReady(f = {}) {
  if (!has(f.code) || !has(f.name)) return false;
  switch (f.kind) {
    case 'flat':       return has(f.flat_amount);
    case 'hourly':     return has(f.hourly_rate);
    case 'percent_of': return has(f.percent_rate) && has(f.input_item_id);
    case 'surcharge':  return has(f.percent_rate);
    case 'tiered':
    case 'valuation':  return has(f.input_variable);
    default:           return false;   // an unknown kind is never submittable
  }
}

/**
 * Can this tier be added?
 *
 * `amount` is required. Beyond that, the trap: "$250 plus $15 per 1,000 sq ft" needs BOTH a
 * per-unit rate AND a unit size — CHECK ((per_unit IS NULL) = (unit_size IS NULL)) — and the
 * basis, because whole-quantity versus excess-above-floor is $370 or $295 on the same
 * building. The form paired per_unit with per_unit_basis on the first pass and missed
 * unit_size, which is the half that Postgres enforces.
 */
export function tierReady(f = {}) {
  if (!has(f.amount)) return false;
  const perUnit = has(f.per_unit);
  const unitSize = has(f.unit_size);
  if (perUnit !== unitSize) return false;              // both, or neither
  if (perUnit && !has(f.per_unit_basis)) return false; // a basis is never assumed
  return true;
}

/**
 * Can this modifier be added? `seq` must be a positive integer — `Number('')` is 0, which
 * the server refuses with a 400 that a blank field gave no warning of.
 */
export function modifierReady(f = {}) {
  if (!has(f.value)) return false;
  const seq = Number(f.seq);
  return Number.isInteger(seq) && seq > 0 && seq <= 999;
}
