// prevention/feeSteps.js — turn one feeEngine calculation step into a sentence.
//
// ── WHY THIS IS ITS OWN PURE MODULE ──────────────────────────────────────────────────
// The breakdown panel is the one place this module deliberately exceeds the documented fire
// market bar (see the Slice D spec §0.3(d)), and the whole justification is that "a commit
// gate is meaningless if the person cannot see what they are ratifying". A breakdown that
// renders blank rows delivers none of that while still carrying the cost of the departure.
//
// It rendered blank on the first pass, and the reason is worth keeping: the component read
// `s.kind`, `s.step`, `s.detail` and `s.note`. The engine emits NONE of those. Every step is
// keyed on **`op`**, with shape-specific fields, and many steps carry no `amount` at all —
// they carry `base`, `after`, `added` or `to`. Guessing at another module's data shape is
// how you ship a panel that looks finished and says nothing.
//
// Shapes below are transcribed from the `steps.push(...)` calls in server/src/utils/
// feeEngine.js. If a step is added there and not here, it degrades to a readable fallback
// rather than an empty line — and the unit test asserts that fallback, so a new op shows up
// as something a clerk can still read.
//
// NOTE the two formatters. `fmtRate` is for MONEY that may carry sub-cent precision (a
// per-unit rate); `fmtQty` is for quantities and percentages, which must never be dressed
// with a dollar sign. Rendering "50" as "$50.00" when it is 50% is exactly the confusion
// this screen exists to prevent.
import { fmtMoney, fmtQty, fmtRate } from './money';

const MODIFIER_VERB = {
  percent_add: 'plus',
  percent_multiply: 'times',
  amount_add: 'plus',
  per_unit_add: 'plus, per unit',
  floor: 'raised to a floor of',
  cap: 'capped at',
};

/** True when a modifier's `value` is a dollar amount rather than a percentage/quantity. */
export function modifierValueIsMoney(kind) {
  return kind === 'amount_add' || kind === 'per_unit_add' || kind === 'floor' || kind === 'cap';
}

/** One engine step → a sentence a clerk can check against the adopted schedule. */
export function describeStep(step) {
  if (typeof step === 'string') return step;
  if (!step || typeof step !== 'object' || !step.op) return '';

  const op = String(step.op);

  // modifier:<kind> is the only composite op.
  if (op.startsWith('modifier:')) {
    const kind = op.slice('modifier:'.length);
    const verb = MODIFIER_VERB[kind] || kind.replace(/_/g, ' ');
    const value = modifierValueIsMoney(kind) ? fmtRate(step.value)
      : `${fmtQty(step.value)}${kind.startsWith('percent') ? '%' : ''}`;
    return `Step ${step.seq}: ${verb} ${value} — ${fmtMoney(step.before)} → ${fmtMoney(step.after)}`;
  }

  switch (op) {
    case 'flat':
      return `Flat amount ${fmtMoney(step.amount)}`;
    case 'hours':
      return `Hours ${fmtQty(step.raw)} → ${fmtQty(step.rounded)}`
        + (step.increment ? ` (billed in ${fmtQty(step.increment)}-hour steps, ${String(step.mode).replace(/_/g, ' ')})` : '');
    case 'minimum_hours':
      return `Minimum of ${fmtQty(step.floor)} hours applies — billed ${fmtQty(step.billable)}`;
    case 'hours_x_rate':
      return `${fmtQty(step.hours)} hours × ${fmtRate(step.rate)} = ${fmtMoney(step.amount)}`;
    case 'after_hours_multiplier':
      return `After-hours ×${fmtQty(step.multiplier)} → ${fmtMoney(step.amount)}`;
    case 'passthrough':
      return `Carried from fee line #${step.fromItemId} — ${fmtMoney(step.amount)}`;
    case 'axis_from_item':
      return `Measured from fee line #${step.fromItemId} — ${fmtMoney(step.value)}`;
    case 'tier':
      return `Matched a tier — ${fmtMoney(step.base)}`;
    case 'per_unit':
      return `Plus ${fmtRate(step.rate)} per ${fmtQty(step.unitSize)}`
        + ` on ${fmtQty(step.measured)}`
        + (step.perUnitBasis === 'excess_above_floor' ? ' above the band floor' : ' (whole quantity)')
        + ` = ${step.units} unit${step.units === '1' ? '' : 's'}, ${fmtMoney(step.added)}`;
    case 'percent_of':
      return `${fmtQty(step.percent)}% of fee line #${step.fromItemId} (${fmtMoney(step.base)}) = ${fmtMoney(step.amount)}`;
    case 'surcharge':
      return `${fmtQty(step.percent)}% surcharge on ${fmtMoney(step.subtotal)}`
        + (Array.isArray(step.includedCodes) && step.includedCodes.length
          ? ` (${step.includedCodes.join(', ')})` : '')
        + ` = ${fmtMoney(step.amount)}`;
    case 'min_amount':
      return `Below the floor — raised from ${fmtMoney(step.from)} to ${fmtMoney(step.to)}`;
    case 'max_amount':
      return `Above the cap — reduced from ${fmtMoney(step.from)} to ${fmtMoney(step.to)}`;
    default:
      // A step this module has not learned yet still has to READ as something. An empty
      // line in a money breakdown is worse than an ugly one.
      return `${op.replace(/_/g, ' ')}${step.amount !== undefined ? ` — ${fmtMoney(step.amount)}` : ''}`;
  }
}
