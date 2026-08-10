/**
 * usStates.js — the one list of US states, and the one way to read a stored value.
 *
 * WHY THIS IS A SHARED MODULE AND NOT A LITERAL IN A COMPONENT
 * -----------------------------------------------------------
 * The setup wizard asks for a state on TWO screens: the department's HQ address on
 * step 1, and each station's address on step 2. On 2026-08-04 step 1 was changed to a
 * picker and step 2 was left as free text — and step 2 is the field that actually
 * reaches Postgres. Two screens asking one question two ways is how `NJ`, `N.J.`,
 * `New Jersey` and `nj` all ended up being valid answers to the same question.
 *
 * WHY `toStateCode` EXISTS, AND WHY IT NEVER DISCARDS
 * --------------------------------------------------
 * A `<select>` whose options are 2-letter codes renders BLANK when handed a stored
 * value like `New Jersey` — `selectedIndex` goes to -1, and React's state and the DOM
 * then disagree: React holds "New Jersey" while the control reports "". The field
 * looks unanswered for a department that answered it. Verified in Chromium.
 *
 * So a stored value is NORMALISED for display, never dropped:
 *   'New Jersey' → 'NJ'   ·   'n.j.' → 'NJ'   ·   ' nj ' → 'NJ'
 * and anything still unrecognised is returned AS-IS so the caller can render it as a
 * visible option rather than showing an empty box. Silently replacing a recorded value
 * with a blank is the same class of harm as the wizard dropping a half-typed apparatus
 * row: the record stops saying what someone entered.
 *
 * Scope is the United States — 50 states plus DC, which has its own fire department.
 * PR is retained because it was already in the list and removing it would strip a
 * working option from anyone using it. This is not the place to litigate territories;
 * it is the place to make sure all fifty states behave identically, which is the bug
 * that actually shipped: the picker was only ever verified against the one state our
 * demo data happens to use.
 */

/** Every option the picker offers, in the order it offers them. */
export const US_STATES = [
  { code: 'AL', name: 'Alabama' },        { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },        { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },     { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },    { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },        { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },         { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },       { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },           { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },       { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },          { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },      { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },       { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },       { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },     { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },           { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },         { code: 'PA', name: 'Pennsylvania' },
  { code: 'PR', name: 'Puerto Rico' },    { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },      { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },           { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },       { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

export const STATE_CODES = US_STATES.map((s) => s.code);

const BY_NAME = new Map(US_STATES.map((s) => [s.name.toUpperCase().replace(/[^A-Z]/g, ''), s.code]));
const BY_CODE = new Set(STATE_CODES);

/**
 * Read whatever is stored and return the USPS code when it is recognisable.
 * Returns the ORIGINAL string when it is not — the caller renders it rather than
 * dropping it, so a value nobody can parse is still visible to the person who can.
 */
export function toStateCode(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (letters.length === 2 && BY_CODE.has(letters)) return letters;   // 'nj', 'N.J.'
  const byName = BY_NAME.get(letters);                                // 'New Jersey'
  if (byName) return byName;
  return raw;                                                        // unrecognised — keep it
}

/** True when a stored value maps to a real option. */
export const isKnownState = (value) => BY_CODE.has(toStateCode(value));
