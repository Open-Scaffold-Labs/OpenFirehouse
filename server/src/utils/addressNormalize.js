'use strict';
/**
 * addressNormalize.js — fuzzy address matching for CAD → preplan auto-surface
 *
 * Uses Jaccard token similarity. Threshold ≥ 0.75 is a reliable match
 * for abbreviated CAD addresses vs. full pre-plan addresses.
 */

const ABBREVS = {
  'st':    'street',
  'ave':   'avenue',
  'av':    'avenue',
  'blvd':  'boulevard',
  'rd':    'road',
  'dr':    'drive',
  'ln':    'lane',
  'ct':    'court',
  'pl':    'place',
  'pkwy':  'parkway',
  'hwy':   'highway',
  'n':     'north',
  's':     'south',
  'e':     'east',
  'w':     'west',
  'ne':    'northeast',
  'nw':    'northwest',
  'se':    'southeast',
  'sw':    'southwest',
};

/**
 * Normalize an address string to a token set.
 * Lowercases, strips punctuation, expands common abbreviations.
 */
function tokenize(addr) {
  if (!addr) return new Set();
  const tokens = addr
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(t => ABBREVS[t] ?? t);
  return new Set(tokens);
}

/**
 * Jaccard similarity between two token sets.
 * Returns a value in [0, 1].
 */
function jaccard(setA, setB) {
  if (!setA.size && !setB.size) return 1;
  if (!setA.size || !setB.size) return 0;
  const intersection = new Set([...setA].filter(t => setB.has(t)));
  const union        = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Find the best-matching pre-plan for a CAD address.
 *
 * @param {string} cadAddress    — raw address from CAD alert
 * @param {Array}  prePlans      — array of { id, occupancyName, address }
 * @param {number} threshold     — minimum similarity to return a match (default 0.75)
 * @returns {{ plan, score } | null}
 */
function findBestMatch(cadAddress, prePlans, threshold = 0.75) {
  if (!cadAddress || !prePlans?.length) return null;
  const cadTokens = tokenize(cadAddress);

  let best = null;
  let bestScore = -1;

  for (const plan of prePlans) {
    const planTokens = tokenize(plan.address);
    const score = jaccard(cadTokens, planTokens);
    if (score > bestScore) {
      bestScore = score;
      best = plan;
    }
  }

  if (bestScore >= threshold) return { plan: best, score: bestScore };
  return null;
}

module.exports = { tokenize, jaccard, findBestMatch };
