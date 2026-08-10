'use strict';
/**
 * aiNarrativeGuard.js — the AI-never-writes-the-legal-record boundary, in CODE.
 *
 * DOCTRINE (Matt, 2026-06-10): AI never writes into the legal record. It may
 * auto-fill FACTS (type, address, units, personnel, times from CAD/radio). It may
 * NOT write narrative prose into `incidents.notes` — the subpoenable narrative,
 * which ships to NERIS VERBATIM as `outcome_narrative`.
 *
 * WHY THIS FILE EXISTS (2026-08-07). The doctrine was real and the prompt said so
 * explicitly — `ai_log_incident`'s system prompt reads "Do NOT include a 'notes'
 * field or any narrative prose". But the CLIENT was separately wired to read
 * `notes` off the result and write it straight into the narrative box on a
 * prefilled form. So the ONLY thing standing between a single non-compliant model
 * completion and machine-written prose in a subpoenable record was a sentence in a
 * prompt.
 *
 * A PROMPT IS NOT AN ENFORCEMENT MECHANISM. This is the same class of failure as
 * the `/^pass\b/i` regex that guarded whether an inspection could pass with open
 * violations — a soft mechanism holding a hard control, which worked right up until
 * it didn't ("Passed" defeated it). The rule now lives where it cannot be talked out
 * of: the server deletes the keys, whatever the model returned.
 *
 * SCOPED PER-ACTION, DELIBERATELY. A blanket deep strip of `notes` would break
 * actions that legitimately return one — the staffing forecast returns a per-day
 * `notes` about coverage concerns, which is an internal advisory document and not a
 * legal record. Only actions that declare `forbiddenResultKeys` are filtered, and
 * only at the top level of their result.
 */

/**
 * Strip an action's forbidden keys from its result, in place.
 *
 * @param {object|null} result           the parsed AI result (mutated)
 * @param {string[]|undefined} forbidden the action's declared forbiddenResultKeys
 * @returns {string[]} the keys actually removed — empty when there was nothing to do.
 *                     A non-empty return means the model IGNORED its instruction,
 *                     which is worth logging: it is the only signal we get.
 */
function stripForbiddenKeys(result, forbidden) {
  if (!Array.isArray(forbidden) || !forbidden.length) return [];
  if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
  const dropped = [];
  for (const key of forbidden) {
    // `undefined` means absent; a present-but-empty value ('' or null) still counts
    // as the model having emitted the field, and is still removed.
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      delete result[key];
      dropped.push(key);
    }
  }
  return dropped;
}

module.exports = { stripForbiddenKeys };
