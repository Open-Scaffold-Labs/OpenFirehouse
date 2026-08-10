/**
 * utils/leaveBankSummary.js — PURE helpers for the chief leave-bank config screen (1.2e-c).
 * No React/DOM — unit-tested under `node --test`. Encodes the market-bar trust element: a
 * plain-language rule summary rendered from the raw settings ("8h per pay period · max 480h ·
 * 40h carryover"), and form validation (code shape, required fields, cap sanity).
 */

const UNIT_ABBR = { hours: 'h', shifts: ' shifts', days: 'd' };
function u(unit) { return UNIT_ABBR[unit] || 'h'; }

const PERIOD_LABEL = { biweekly: 'pay period', monthly: 'month', annual: 'year' };

/** A one-line plain-language summary of a bank's accrual rule + limits. */
export function accrualSummary(bank = {}) {
  const unit = u(bank.unit);
  const rate = Number(bank.accrual_rate) || 0;
  const parts = [];

  switch (bank.accrual_method) {
    case 'per_period':
      parts.push(`${rate}${unit} per ${PERIOD_LABEL[bank.period] || 'pay period'}`);
      break;
    case 'annual_grant':
      parts.push(`${rate}${unit} granted each year`);
      break;
    case 'anniversary':
      parts.push(`${rate}${unit} on each work anniversary`);
      break;
    case 'per_hours_worked':
      parts.push(`${rate}${unit} per hour worked`);
      break;
    default:
      parts.push('No automatic accrual (manual only)');
  }

  if (Array.isArray(bank.tenure_tiers) && bank.tenure_tiers.length) parts.push('tiered by years of service');
  if (bank.accrual_cap != null) parts.push(`max ${Number(bank.accrual_cap)}${unit}`);
  if (bank.carryover_cap != null) parts.push(`${Number(bank.carryover_cap)}${unit} carryover`);
  if (bank.allow_negative) parts.push(`may go negative to ${Number(bank.negative_floor) || 0}${unit}`);

  const summary = parts.join(' · ');
  return bank.is_flsa_comp ? `FLSA comp · ${summary}` : summary;
}

/** Fields relevant to a given accrual method (drives conditional disclosure in the form). */
export function methodNeeds(method) {
  return {
    rate: method && method !== 'none',
    period: method === 'per_period',
    tiers: method && method !== 'none',
  };
}

/** Validate the editor form. Returns an array of human error strings (empty = valid). */
export function validateBank(form = {}) {
  const errors = [];
  const code = String(form.code || '').trim();
  if (!code) errors.push('Code is required.');
  else if (!/^[A-Z0-9_]+$/.test(code)) errors.push('Code must be UPPER_SNAKE (letters, numbers, underscore).');
  if (!String(form.name || '').trim()) errors.push('Name is required.');

  const method = form.accrual_method || 'none';
  if (method !== 'none' && !(Number(form.accrual_rate) > 0)) {
    errors.push('An accruing bank needs a rate greater than 0.');
  }
  if (method === 'per_period' && !form.period) errors.push('Per-pay-period accrual needs a period.');

  for (const [field, flabel] of [['accrual_cap', 'Max balance'], ['carryover_cap', 'Carryover cap']]) {
    if (form[field] != null && form[field] !== '' && !(Number(form[field]) >= 0)) {
      errors.push(`${flabel} must be 0 or more.`);
    }
  }
  if (form.allow_negative && form.negative_floor != null && Number(form.negative_floor) > 0) {
    errors.push('Negative floor must be 0 or below (how far negative a bank may go).');
  }
  // Tenure tiers only matter for an accruing bank; a filled row must be a whole-year threshold
  // and a numeric rate (a fractional year would 400 on the server's integer-years schema).
  if (methodNeeds(method).tiers) {
    for (const t of form.tenure_tiers || []) {
      if (!t || (t.years === '' && t.rate === '')) continue;
      if (!Number.isInteger(Number(t.years)) || Number(t.years) < 0) errors.push('Tenure tier years must be a whole number (0 or more).');
      if (!(Number(t.rate) >= 0)) errors.push('Tenure tier rate must be 0 or more.');
    }
  }
  return errors;
}
