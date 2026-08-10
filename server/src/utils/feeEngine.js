'use strict';
/**
 * utils/feeEngine.js — the fee calculation engine (Phase 3, module 3.2 Slice A).
 *
 * PURE. No database, no clock, no I/O, no rounding hidden anywhere. The caller reads the
 * effective schedule version and hands it in; this file turns (schedule + inputs) into a
 * PROPOSAL. It never commits, never writes, and never decides that a fee is owed.
 *
 * Spec: docs/PHASE3-PERMITS-FEES-SPEC-2026-07-26.md §1.6, §1.7, §1.9, §8 F6/F9.
 * Storage: docs/migrations/0118-fi-fee-schedules.sql.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE ARITHMETIC IS BigInt AND NOT NUMBER — this is the whole point of the file
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * §8 F9 is "fee math drift: NUMERIC end-to-end; explicit rounding". The audit behind it found
 * **$11,127 of fee-calculation errors across 13 of 34 sampled permits, IN BOTH DIRECTIONS**.
 * IEEE-754 doubles produce exactly that signature: 0.1 + 0.2 = 0.30000000000000004, and
 * 1.005 * 100 = 100.49999999999999, so a naive `Math.round(x * 100) / 100` under-collects on
 * some inputs and over-collects on others. A money engine on floats IS the finding.
 *
 * So: every quantity is a BigInt scaled by 1e9 (SCALE). Postgres NUMERIC arrives as a STRING
 * from pg — it is parsed digit-by-digit and NEVER passed through parseFloat/Number. The only
 * places a value becomes a decimal string again are the outputs, at exactly 2 dp.
 *
 * ROUNDING IS EXPLICIT AND HAPPENS AT NAMED PLACES ONLY:
 *   · every multiply/divide rounds half-away-from-zero at 1e-9 (deterministic, negligible)
 *   · each ITEM's amount is rounded to whole cents at its boundary, and that rounded value is
 *     what a chained item consumes. This is deliberate: "25% of the building permit fee" means
 *     25% of the actual dollar fee a payer would owe, not of an unrounded ghost. It also makes
 *     the stored breakdown reproduce the arithmetic exactly, line by line.
 *   · hours round per the item's OWN increment and mode before any money is touched.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * IT REFUSES RATHER THAN GUESSES. A $0 IS NEVER A FALLBACK.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The same audit found "two permits assessed NO FEE AT ALL". A missing input, an unmatched
 * tier, or an unknown axis therefore returns `{ ok: false, errors: [...] }` — never a total of
 * zero. A genuine zero-fee assessment is a real thing (a municipal exemption) but it is
 * AUTHORED, reason-coded and approver-stamped, never the residue of a failed computation.
 *
 * Following permitLadder.js: this returns a sentinel result, it does not throw. A thrown
 * exception in a route becomes a 500 and reads as "the system broke"; a refusal is a 422 and
 * reads as "your schedule does not cover this case", which is what actually happened.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * PER-UNIT BASIS — STATED BY THE TIER, NEVER ASSUMED (migration 0120)
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * "$250, plus $15 per 1,000 sq ft" on a 7,200 sq ft building means either $370 (all 7,200) or
 * $295 (only the 2,200 above a 5,000 floor). $75 apart, every permit. So each tier states its
 * own `per_unit_basis` — `whole_quantity` or `excess_above_floor` — and a rate without a basis
 * is REFUSED, not guessed. A fee schedule is adopted by ordinance and real ordinances say both;
 * the software's job is to express the department's text, not to pick the arithmetic.
 *
 * 🔴 THIS SHIPPED WRONG IN 0118 AND THE COMMENT HERE WAS PART OF THE PROBLEM. The original
 * version hardcoded excess-above-floor and justified it by attributing "$X plus $Y per 1,000
 * sq ft" to spec §1.7. **That phrase is not in §1.7.** I paraphrased it out of the chaining
 * discussion and then cited it as a quote, which would have read to the next session as sourced.
 * §1.7's only verbatim per-unit phrases are "plus 50%", "+$10 per bed", "per quarter hour or
 * part thereof" and "additional 300%" — and "+$10 per bed" is unambiguously the WHOLE count,
 * i.e. the basis I had NOT implemented for tiers. Fabricated citations are worse than missing
 * ones: they survive review.
 *
 * A modifier's `per_unit_add` stays whole-quantity and needs no flag: "+$10 per bed" means
 * every bed, and there is no tier floor for it to be relative to.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * THE THREE DOCUMENTED CHAINS OF §1.7 — TWO BUILT, ONE REFUSED
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *   ✅ square footage → valuation → building permit fee → 25% OF IT
 *      Leg 2 is a table keyed on valuation DOLLARS produced by leg 1, so a 'valuation' item
 *      may take its axis value from a chained item (`input_item_id`) instead of an input.
 *   ✅ base hours → hourly rate → "PLUS 50%" → "+$10 PER BED"
 *      The trailing adjustments are ordered fi_fee_item_modifiers rows; seq is load-bearing.
 *   ❌ valuation → dollars → HOURS OF INSPECTION CREDIT
 *      REFUSED with UNSUPPORTED_FEE_CHAIN. It requires reading a dollar amount as a count of
 *      hours, and the source phrase does not say whether the "credit" is an allowance deducted
 *      from billed hours, a cap, or a prepaid block. Three incompatible mechanisms, one phrase.
 *      Guessing would put an invented rule inside a money engine — and worse, WITHOUT the guard
 *      the engine would ignore input_item_id and silently bill inputs.hours instead. Modelling
 *      it needs a real adopted schedule in front of us, not an inference.
 */

const {
  FEE_ITEM_KINDS, FEE_VARIABLES, CATEGORICAL_VARIABLES, ROUNDING_MODES, MODIFIER_KINDS,
  PER_UNIT_BASES,
} = require('../constants/feeSchedule');

// ── Fixed-point core ─────────────────────────────────────────────────────────────────────
const DECIMALS = 9;
const SCALE = 10n ** BigInt(DECIMALS);
const CENT = SCALE / 100n;

/** Round-half-away-from-zero integer division. The money convention, stated once. */
function divRound(numerator, denominator) {
  if (denominator === 0n) return null;
  const neg = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const r = n % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return neg ? -rounded : rounded;
}
function divFloor(n, d) { const q = n / d; return (n % d !== 0n && (n < 0n) !== (d < 0n)) ? q - 1n : q; }
function divCeil(n, d) { const q = n / d; return (n % d !== 0n && (n < 0n) === (d < 0n)) ? q + 1n : q; }

const mul = (a, b) => divRound(a * b, SCALE);

/**
 * Parse a decimal into scaled BigInt WITHOUT floats. Accepts what pg hands back for NUMERIC
 * (a string), plus JS numbers for test ergonomics — integers only for numbers, because a
 * non-integer JS number has already lost the exactness this function exists to preserve.
 */
function parseDec(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'bigint') return value * SCALE;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    if (!Number.isInteger(value)) {
      // Deliberately routed through the string form rather than accepted as a float.
      return parseDec(value.toFixed(DECIMALS));
    }
    return BigInt(value) * SCALE;
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === '' || s === '-' || s === '.' || s === '-.') return null;
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [intPart = '0', fracRaw = ''] = body.split('.');
  const frac = (fracRaw + '0'.repeat(DECIMALS)).slice(0, DECIMALS);
  // Anything beyond 9 dp is truncated, not rounded — and it cannot occur from this schema
  // (the widest NUMERIC scale in 0118 is 4).
  const scaled = BigInt(intPart || '0') * SCALE + BigInt(frac || '0');
  return neg ? -scaled : scaled;
}

/** Round a scaled value to whole cents (still scaled). The item-boundary rounding step. */
const roundToCents = (scaled) => divRound(scaled, CENT) * CENT;

/** Render a scaled value as a 2-dp decimal string, for a NUMERIC(12,2) column. */
function formatMoney(scaled) {
  const cents = divRound(scaled, CENT);
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

/** Render a scaled value with up to 4 dp, trailing zeros trimmed — for hour counts in a trace. */
function formatQty(scaled) {
  const neg = scaled < 0n;
  const abs = neg ? -scaled : scaled;
  const whole = abs / SCALE;
  let frac = (abs % SCALE).toString().padStart(DECIMALS, '0').slice(0, 4).replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

// ── Errors ───────────────────────────────────────────────────────────────────────────────
const ERR = Object.freeze({
  UNKNOWN_KIND: 'UNKNOWN_FEE_KIND',
  UNKNOWN_VARIABLE: 'UNKNOWN_FEE_VARIABLE',
  UNKNOWN_MODIFIER: 'UNKNOWN_MODIFIER_KIND',
  UNKNOWN_ROUNDING: 'UNKNOWN_ROUNDING_MODE',
  MISSING_INPUT: 'MISSING_INPUT',
  BAD_INPUT: 'BAD_INPUT',
  NO_TIER_MATCH: 'NO_TIER_MATCH',
  MISSING_PARAM: 'MISSING_FEE_PARAMETER',
  MISSING_BASE: 'MISSING_BASE_ITEM',
  CYCLE: 'FEE_ITEM_CYCLE',
  BAD_TIER: 'BAD_TIER_DEFINITION',
  UNSUPPORTED_CHAIN: 'UNSUPPORTED_FEE_CHAIN',
});

// ── Hour rounding ────────────────────────────────────────────────────────────────────────
/**
 * "per quarter hour or part thereof" is 'up_any_part' with a 0.25 increment. The market also
 * runs plain nearest/down; 'none' bills raw hours.
 */
function roundHours(hours, increment, mode) {
  if (increment === null || increment === undefined || increment <= 0n || mode === 'none') return hours;
  switch (mode) {
    case 'up_any_part': return divCeil(hours, increment) * increment;
    case 'nearest':     return divRound(hours, increment) * increment;
    case 'down':        return divFloor(hours, increment) * increment;
    default:            return null; // caller turns this into ERR.UNKNOWN_ROUNDING
  }
}

// ── Tier matching ────────────────────────────────────────────────────────────────────────
function axisMatches(min, max, exact, value, isCategorical) {
  if (isCategorical) {
    if (exact === null || exact === undefined) return true;   // axis unconstrained
    return String(value) === String(exact);                   // EXACT, never pattern
  }
  if (exact !== null && exact !== undefined) return String(value) === String(exact);
  const v = value;
  if (v === null) return false;
  // Half-open [min, max) so two adjacent tiers can never both claim a boundary value.
  if (min !== null && v < min) return false;
  if (max !== null && v >= max) return false;
  return true;
}

// ── The engine ───────────────────────────────────────────────────────────────────────────
/**
 * @param {object} args
 * @param {Array}  args.items      fi_fee_items rows for ONE schedule version
 * @param {Array}  args.tiers      fi_fee_item_tiers rows
 * @param {Array}  args.modifiers  fi_fee_item_modifiers rows
 * @param {object} args.inputs     application variables, e.g. { square_footage: 4200, hours: '2.1' }
 * @param {boolean} args.afterHours whether THIS instance was after hours (the schedule holds the
 *                                  multiplier; the instance decides whether it applies)
 * @returns {{ok:boolean, total:string|null, lines:Array, errors:Array}}
 */
function computeFees({ items = [], tiers = [], modifiers = [], inputs = {}, afterHours = false } = {}) {
  const errors = [];
  const push = (code, message, extra = {}) => errors.push({ code, message, ...extra });

  // Index children by item id.
  const tiersByItem = new Map();
  for (const t of tiers) {
    if (!tiersByItem.has(t.item_id)) tiersByItem.set(t.item_id, []);
    tiersByItem.get(t.item_id).push(t);
  }
  for (const list of tiersByItem.values()) {
    list.sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
  }
  const modsByItem = new Map();
  for (const m of modifiers) {
    if (!modsByItem.has(m.item_id)) modsByItem.set(m.item_id, []);
    modsByItem.get(m.item_id).push(m);
  }
  for (const list of modsByItem.values()) list.sort((a, b) => a.seq - b.seq);

  const byId = new Map(items.map((i) => [i.id, i]));

  // ── Validate the closed sets BEFORE computing anything. An unknown kind or axis must be a
  //    refusal, not a line that quietly contributes nothing (F6/F9).
  for (const it of items) {
    if (!FEE_ITEM_KINDS.includes(it.kind)) {
      push(ERR.UNKNOWN_KIND, `fee item ${it.code}: unknown kind "${it.kind}"`, { itemCode: it.code });
    }
    for (const [field, v] of [['input_variable', it.input_variable], ['tier_axis_2', it.tier_axis_2]]) {
      if (v !== null && v !== undefined && !FEE_VARIABLES.includes(v)) {
        push(ERR.UNKNOWN_VARIABLE, `fee item ${it.code}: unknown ${field} "${v}"`, { itemCode: it.code, variable: v });
      }
    }
    if (it.rounding_mode && !ROUNDING_MODES.includes(it.rounding_mode)) {
      push(ERR.UNKNOWN_ROUNDING, `fee item ${it.code}: unknown rounding_mode "${it.rounding_mode}"`, { itemCode: it.code });
    }
    for (const m of (modsByItem.get(it.id) || [])) {
      if (!MODIFIER_KINDS.includes(m.kind)) {
        push(ERR.UNKNOWN_MODIFIER, `fee item ${it.code} modifier seq ${m.seq}: unknown kind "${m.kind}"`, { itemCode: it.code });
      }
    }
  }
  if (errors.length) return { ok: false, total: null, lines: [], errors };

  // ── Dependency order. Edges: base item -> percent_of item, and every surchargeable item ->
  //    every surcharge item (a surcharge cannot be computed until its subtotal exists).
  const order = topoSort(items, byId);
  if (order.cycle) {
    push(ERR.CYCLE, `fee items form a dependency cycle: ${order.cycle.join(' -> ')}`, { cycle: order.cycle });
    return { ok: false, total: null, lines: [], errors };
  }

  const amountById = new Map();   // scaled, cent-rounded
  const lines = [];

  for (const it of order.sorted) {
    const steps = [];
    const res = computeItem(it, { tiersByItem, modsByItem, amountById, items, inputs, afterHours, steps, push });
    if (res === null) continue;   // an error was already recorded; keep going to collect them all
    amountById.set(it.id, res);
    lines.push({
      itemId: it.id,
      code: it.code,
      name: it.name,
      kind: it.kind,
      surchargeable: it.surchargeable !== false && it.kind !== 'surcharge',
      amount: formatMoney(res),
      steps,
    });
  }

  if (errors.length) return { ok: false, total: null, lines, errors };

  let total = 0n;
  for (const v of amountById.values()) total += v;

  // Preserve the schedule's own presentation order in the output.
  const seq = new Map(items.map((i, idx) => [i.id, (i.sort_order ?? 0) * 100000 + idx]));
  lines.sort((a, b) => seq.get(a.itemId) - seq.get(b.itemId));

  return { ok: true, total: formatMoney(total), lines, errors: [] };
}

function computeItem(it, ctx) {
  const { tiersByItem, modsByItem, amountById, items, inputs, afterHours, steps, push } = ctx;
  let amount;

  switch (it.kind) {
    case 'flat': {
      amount = parseDec(it.flat_amount);
      if (amount === null) {
        push(ERR.MISSING_PARAM, `fee item ${it.code}: flat item has no flat_amount`, { itemCode: it.code });
        return null;
      }
      steps.push({ op: 'flat', amount: formatMoney(amount) });
      break;
    }

    case 'hourly': {
      const rate = parseDec(it.hourly_rate);
      if (rate === null) {
        push(ERR.MISSING_PARAM, `fee item ${it.code}: hourly item has no hourly_rate`, { itemCode: it.code });
        return null;
      }
      // 🔴 §1.7's FIRST documented chain — "valuation → dollars → HOURS OF INSPECTION CREDIT" —
      // IS NOT EXPRESSIBLE HERE, and this refuses rather than pretending otherwise. Feeding an
      // hourly item from another item would mean reading a DOLLAR amount as a COUNT OF HOURS,
      // and the source phrase does not say whether the credit is an allowance deducted from
      // billed hours, a cap, or a prepaid block. Inventing one of those three would put a
      // guessed mechanism inside a money engine.
      // Without this guard the engine would silently ignore input_item_id and bill inputs.hours
      // instead — a wrong number returned with total confidence, which is the failure this file
      // exists to prevent. Named as unbuilt in the header; needs a real adopted schedule to model.
      if (it.input_item_id) {
        push(ERR.UNSUPPORTED_CHAIN,
          `fee item ${it.code}: an hourly item cannot take its hours from another fee item `
          + `(the "valuation → hours of inspection credit" shape is not modelled). Remove `
          + `input_item_id or supply the hours as an input.`,
          { itemCode: it.code });
        return null;
      }

      const variable = it.input_variable || 'hours';
      const raw = readNumericInput(variable, inputs, it, push);
      if (raw === null) return null;

      const inc = parseDec(it.rounding_increment_hours);
      const mode = it.rounding_mode || 'up_any_part';
      const rounded = roundHours(raw, inc, mode);
      if (rounded === null) {
        push(ERR.UNKNOWN_ROUNDING, `fee item ${it.code}: unknown rounding_mode "${mode}"`, { itemCode: it.code });
        return null;
      }
      steps.push({ op: 'hours', raw: formatQty(raw), rounded: formatQty(rounded), increment: inc === null ? null : formatQty(inc), mode });

      // BOTH mechanisms live here — see the header. The floor applies after rounding, so a
      // 3-hour minimum bills 3 hours for a 2.1-hour visit, and 2.25 for a 2.1-hour visit under
      // a 2-hour minimum with quarter-hour rounding.
      const minHours = parseDec(it.minimum_hours) ?? 0n;
      const billable = rounded > minHours ? rounded : minHours;
      if (billable !== rounded) steps.push({ op: 'minimum_hours', floor: formatQty(minHours), billable: formatQty(billable) });

      amount = mul(billable, rate);
      steps.push({ op: 'hours_x_rate', hours: formatQty(billable), rate: formatMoney(rate), amount: formatMoney(amount) });

      // The market is SPLIT: about half multiply for after-hours, half monetise via the floor
      // above. Both are supported at once; the multiplier only bites when the instance says so.
      const ahm = parseDec(it.after_hours_multiplier);
      if (afterHours && ahm !== null) {
        amount = mul(amount, ahm);
        steps.push({ op: 'after_hours_multiplier', multiplier: formatQty(ahm), amount: formatMoney(amount) });
      }
      break;
    }

    case 'tiered':
    case 'valuation': {
      const list = tiersByItem.get(it.id) || [];
      if (list.length === 0) {
        // A valuation item may instead be a pass-through of another item's computed dollars.
        if (it.kind === 'valuation' && it.input_item_id) {
          const base = amountById.get(it.input_item_id);
          if (base === undefined) {
            push(ERR.MISSING_BASE, `fee item ${it.code}: base item ${it.input_item_id} did not compute`, { itemCode: it.code });
            return null;
          }
          amount = base;
          steps.push({ op: 'passthrough', fromItemId: it.input_item_id, amount: formatMoney(amount) });
          break;
        }
        push(ERR.BAD_TIER, `fee item ${it.code}: ${it.kind} item has no tier rows`, { itemCode: it.code });
        return null;
      }

      // ── Where axis 1's VALUE comes from: an application input, or a CHAINED item's dollars.
      // The chained form is what makes §1.7's second documented chain expressible end to end:
      //   square footage → valuation → building permit fee → 25% OF IT
      // Leg 2 is a table keyed on VALUATION DOLLARS, which are produced by leg 1 — not by any
      // application input. A tier engine that can only read inputs cannot express it, and
      // "chaining is the norm and is what a naive model breaks on" is §1.7 verbatim.
      // 0118's CHECK already anticipates this: 'tiered' requires input_variable, while
      // 'valuation' is satisfied by input_variable OR input_item_id.
      let axis1 = it.input_variable;
      let cat1 = false;
      let v1;
      if (it.kind === 'valuation' && it.input_item_id) {
        const chained = amountById.get(it.input_item_id);
        if (chained === undefined) {
          push(ERR.MISSING_BASE, `fee item ${it.code}: base item ${it.input_item_id} did not compute`, { itemCode: it.code });
          return null;
        }
        v1 = chained;
        axis1 = axis1 || `item:${it.input_item_id}`;
        steps.push({ op: 'axis_from_item', fromItemId: it.input_item_id, value: formatMoney(chained) });
      } else {
        if (!axis1) {
          push(ERR.MISSING_PARAM, `fee item ${it.code}: ${it.kind} item has no input_variable`, { itemCode: it.code });
          return null;
        }
        cat1 = CATEGORICAL_VARIABLES.includes(axis1);
        v1 = cat1 ? readCategoricalInput(axis1, inputs, it, push) : readNumericInput(axis1, inputs, it, push);
        if (v1 === null) return null;
      }

      let v2 = null; let cat2 = false;
      if (it.tier_axis_2) {
        cat2 = CATEGORICAL_VARIABLES.includes(it.tier_axis_2);
        v2 = cat2 ? readCategoricalInput(it.tier_axis_2, inputs, it, push) : readNumericInput(it.tier_axis_2, inputs, it, push);
        if (v2 === null) return null;
      }

      const hit = list.find((t) => axisMatches(parseDec(t.axis1_min), parseDec(t.axis1_max), t.axis1_match, v1, cat1)
        && (!it.tier_axis_2 || axisMatches(parseDec(t.axis2_min), parseDec(t.axis2_max), t.axis2_match, v2, cat2)));

      if (!hit) {
        // A quantity outside every tier is a GAP IN THE ADOPTED SCHEDULE. Refusing makes a
        // human fix the schedule; falling through to 0 is the "no fee at all" audit finding.
        push(ERR.NO_TIER_MATCH,
          `fee item ${it.code}: no tier covers ${axis1}=${cat1 ? v1 : formatQty(v1)}`
          + (it.tier_axis_2 ? ` / ${it.tier_axis_2}=${cat2 ? v2 : formatQty(v2)}` : ''),
          { itemCode: it.code, variable: axis1 });
        return null;
      }

      amount = parseDec(hit.amount) ?? 0n;
      steps.push({ op: 'tier', tierId: hit.id, base: formatMoney(amount) });

      const perUnit = parseDec(hit.per_unit);
      const unitSize = parseDec(hit.unit_size);
      if (perUnit !== null && unitSize !== null && unitSize > 0n && !cat1) {
        // The basis is the TIER'S to state. No default — see the header for the $75 example.
        // 0120 CHECK-enforces this pairing in Postgres; the engine also takes plain objects in
        // tests, so it refuses here too rather than silently picking a reading.
        const basis = hit.per_unit_basis;
        if (!PER_UNIT_BASES.includes(basis)) {
          push(ERR.MISSING_PARAM,
            `fee item ${it.code}: tier ${hit.id} has a per-unit rate but no per_unit_basis. `
            + `A rate of ${formatMoney(perUnit)} per ${formatQty(unitSize)} is a different fee `
            + `depending on whether it applies to the whole quantity or only above this tier's `
            + `floor — the schedule must say which (${PER_UNIT_BASES.join(' | ')}).`,
            { itemCode: it.code });
          return null;
        }
        const floorV = basis === 'excess_above_floor' ? (parseDec(hit.axis1_min) ?? 0n) : 0n;
        const measured = v1 > floorV ? v1 - floorV : 0n;
        const units = divCeil(measured, unitSize);   // whole units, "or part thereof"
        const add = mul(units * SCALE, perUnit);
        amount += add;
        steps.push({
          op: 'per_unit', perUnitBasis: basis,
          measured: formatQty(measured), unitSize: formatQty(unitSize), units: units.toString(),
          rate: formatMoney(perUnit), added: formatMoney(add),
        });
      }
      break;
    }

    case 'percent_of': {
      const pct = parseDec(it.percent_rate);
      if (pct === null || !it.input_item_id) {
        push(ERR.MISSING_PARAM, `fee item ${it.code}: percent_of needs percent_rate and input_item_id`, { itemCode: it.code });
        return null;
      }
      const base = amountById.get(it.input_item_id);
      if (base === undefined) {
        push(ERR.MISSING_BASE, `fee item ${it.code}: base item ${it.input_item_id} did not compute`, { itemCode: it.code });
        return null;
      }
      amount = divRound(mul(base, pct), 100n);
      steps.push({ op: 'percent_of', fromItemId: it.input_item_id, base: formatMoney(base), percent: formatQty(pct), amount: formatMoney(amount) });
      break;
    }

    case 'surcharge': {
      const pct = parseDec(it.percent_rate);
      if (pct === null) {
        push(ERR.MISSING_PARAM, `fee item ${it.code}: surcharge has no percent_rate`, { itemCode: it.code });
        return null;
      }
      // THE per-fee-line applicability flag doing its job. One city's third column reads "N/A"
      // on hourly, re-inspection and appeal lines; a surcharge over the invoice TOTAL is wrong
      // there. A surcharge never surcharges itself (the DB refuses that combination too).
      let subtotal = 0n;
      const included = [];
      for (const other of items) {
        if (other.id === it.id || other.kind === 'surcharge') continue;
        if (other.surchargeable === false) continue;
        const a = amountById.get(other.id);
        if (a === undefined) continue;
        subtotal += a;
        included.push(other.code);
      }
      amount = divRound(mul(subtotal, pct), 100n);
      steps.push({ op: 'surcharge', subtotal: formatMoney(subtotal), includedCodes: included, percent: formatQty(pct), amount: formatMoney(amount) });
      break;
    }

    default:
      push(ERR.UNKNOWN_KIND, `fee item ${it.code}: unknown kind "${it.kind}"`, { itemCode: it.code });
      return null;
  }

  // ── Ordered modifiers. seq is load-bearing: "+50% then +$10/bed" and "+$10/bed then +50%"
  //    are different money, which is why they are rows and not columns.
  for (const m of (modsByItem.get(it.id) || [])) {
    const val = parseDec(m.value);
    if (val === null) {
      push(ERR.MISSING_PARAM, `fee item ${it.code} modifier seq ${m.seq}: no value`, { itemCode: it.code });
      return null;
    }
    const before = amount;
    switch (m.kind) {
      case 'percent_add':      amount += divRound(mul(amount, val), 100n); break;
      case 'percent_multiply': amount = mul(amount, val); break;
      case 'amount_add':       amount += val; break;
      case 'per_unit_add': {
        // The WHOLE count, not an excess — "+$10 per bed" means every bed.
        const unitSize = parseDec(m.unit_size);
        if (!m.per_unit_variable || unitSize === null || unitSize <= 0n) {
          push(ERR.MISSING_PARAM, `fee item ${it.code} modifier seq ${m.seq}: per_unit_add needs per_unit_variable and unit_size`, { itemCode: it.code });
          return null;
        }
        const qty = readNumericInput(m.per_unit_variable, inputs, it, push);
        if (qty === null) return null;
        const units = divCeil(qty, unitSize);
        amount += mul(units * SCALE, val);
        break;
      }
      case 'floor': if (amount < val) amount = val; break;
      case 'cap':   if (amount > val) amount = val; break;
      default:
        push(ERR.UNKNOWN_MODIFIER, `fee item ${it.code} modifier seq ${m.seq}: unknown kind "${m.kind}"`, { itemCode: it.code });
        return null;
    }
    steps.push({ op: `modifier:${m.kind}`, seq: m.seq, value: formatQty(val), before: formatMoney(before), after: formatMoney(amount) });
  }

  const minA = parseDec(it.min_amount);
  const maxA = parseDec(it.max_amount);
  if (minA !== null && amount < minA) { steps.push({ op: 'min_amount', from: formatMoney(amount), to: formatMoney(minA) }); amount = minA; }
  if (maxA !== null && amount > maxA) { steps.push({ op: 'max_amount', from: formatMoney(amount), to: formatMoney(maxA) }); amount = maxA; }

  if (amount < 0n) amount = 0n;   // a negative fee line is not a refund; the DB forbids it too
  return roundToCents(amount);
}

// ── Input reading. A missing input is a REFUSAL, never a zero. ────────────────────────────
function readNumericInput(variable, inputs, it, push) {
  if (!FEE_VARIABLES.includes(variable)) {
    push(ERR.UNKNOWN_VARIABLE, `fee item ${it.code}: unknown variable "${variable}"`, { itemCode: it.code, variable });
    return null;
  }
  const raw = inputs?.[variable];
  if (raw === undefined || raw === null || raw === '') {
    push(ERR.MISSING_INPUT, `fee item ${it.code}: input "${variable}" was not supplied`, { itemCode: it.code, variable });
    return null;
  }
  const parsed = parseDec(raw);
  if (parsed === null) {
    push(ERR.BAD_INPUT, `fee item ${it.code}: input "${variable}" is not a number (${JSON.stringify(raw)})`, { itemCode: it.code, variable });
    return null;
  }
  if (parsed < 0n) {
    push(ERR.BAD_INPUT, `fee item ${it.code}: input "${variable}" is negative`, { itemCode: it.code, variable });
    return null;
  }
  return parsed;
}

function readCategoricalInput(variable, inputs, it, push) {
  const raw = inputs?.[variable];
  if (raw === undefined || raw === null || raw === '') {
    push(ERR.MISSING_INPUT, `fee item ${it.code}: input "${variable}" was not supplied`, { itemCode: it.code, variable });
    return null;
  }
  return String(raw);
}

// ── Dependency ordering ──────────────────────────────────────────────────────────────────
/**
 * Kahn-style topological sort. Two edge kinds:
 *   base -> percent_of/valuation consumer   (the explicit chain)
 *   every non-surcharge item -> every surcharge item  (a surcharge needs its subtotal first)
 *
 * A cycle is reported with the participating codes. The DB blocks only the trivial
 * self-reference (input_item_id <> id); A->B->A is unreachable by a CHECK and lives here.
 */
function topoSort(items, byId) {
  const deps = new Map(items.map((i) => [i.id, new Set()]));
  const surcharges = items.filter((i) => i.kind === 'surcharge');

  for (const it of items) {
    if (it.input_item_id && byId.has(it.input_item_id)) deps.get(it.id).add(it.input_item_id);
  }
  for (const s of surcharges) {
    for (const other of items) {
      if (other.id !== s.id && other.kind !== 'surcharge') deps.get(s.id).add(other.id);
    }
  }

  const sorted = [];
  const done = new Set();
  let remaining = items.slice();
  while (remaining.length) {
    const ready = remaining.filter((i) => [...deps.get(i.id)].every((d) => done.has(d)));
    if (ready.length === 0) {
      // Everything left is in or behind a cycle. Report the actual loop, not just "a cycle".
      return { cycle: findCycle(remaining, deps, byId) };
    }
    ready.sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
    for (const i of ready) { sorted.push(i); done.add(i.id); }
    remaining = remaining.filter((i) => !done.has(i.id));
  }
  return { sorted };
}

function findCycle(remaining, deps, byId) {
  const inPlay = new Set(remaining.map((i) => i.id));
  const seen = new Map();
  const walk = (id, path) => {
    if (seen.get(id) === 'done') return null;
    const idx = path.indexOf(id);
    if (idx >= 0) return path.slice(idx).concat(id).map((x) => byId.get(x)?.code ?? String(x));
    path.push(id);
    for (const d of deps.get(id) || []) {
      if (!inPlay.has(d)) continue;
      const hit = walk(d, path);
      if (hit) return hit;
    }
    path.pop();
    seen.set(id, 'done');
    return null;
  };
  for (const i of remaining) {
    const hit = walk(i.id, []);
    if (hit) return hit;
  }
  return remaining.map((i) => i.code);
}

module.exports = {
  computeFees,
  // exported for unit tests and for anyone tempted to reimplement money math elsewhere
  ERR,
  parseDec,
  formatMoney,
  formatQty,
  roundHours,
  roundToCents,
  divRound,
  SCALE,
};
