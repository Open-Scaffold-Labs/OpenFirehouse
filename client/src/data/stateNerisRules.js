/**
 * stateNerisRules.js — pluggable per-state NERIS/NFIRS submission rules
 * (W4.1, roadmap 2.4, 2026-06-10).
 *
 * The validation rules used to be hardcoded New Jersey assumptions (FDID
 * shape, 30-day submission deadline, NJ as the address-state fallback). Every
 * state runs its own program with its own quirks — this module makes them
 * data, not code. To support a new state, add an entry here; everything else
 * (validateNerisIncident, the NFIRS export screens) picks it up by state code.
 *
 * Rule fields (all optional — DEFAULT applies when absent):
 *   stateCode               2-letter code
 *   label                   human name for UI
 *   fdidPattern             RegExp the department FDID must match
 *   fdidHint                what a valid FDID looks like (for the error text)
 *   submissionDeadlineDays  days after the incident date a report must be
 *                           submitted (deadline WARNING when exceeded)
 *   notes                   free-text shown in the export UI
 */

export const STATE_RULES = {
  DEFAULT: {
    stateCode: '',
    label: 'Default (no state-specific rules)',
    fdidPattern: /^[A-Za-z0-9-]{2,10}$/,
    fdidHint: '2-10 letters/digits/dashes',
    submissionDeadlineDays: null,
    notes: '',
  },
  NJ: {
    stateCode: 'NJ',
    label: 'New Jersey',
    // NJ FDIDs are county(2)-department(3), e.g. 14-001
    fdidPattern: /^\d{2}-?\d{3}$/,
    fdidHint: 'county + department digits, e.g. 14-001',
    submissionDeadlineDays: 30,
    notes: 'NJ requires submission within 30 days of the incident date.',
  },
  // Add states as departments onboard, e.g.:
  // PA: { stateCode: 'PA', label: 'Pennsylvania', fdidPattern: /^\d{5}$/, fdidHint: '5 digits', submissionDeadlineDays: null },
};

export function getStateRules(stateCode) {
  const code = String(stateCode || '').toUpperCase().trim();
  return STATE_RULES[code] || { ...STATE_RULES.DEFAULT, stateCode: code };
}

/**
 * Apply a state's rules to a NERIS incident document.
 * Returns { errors: string[], warnings: string[] } to merge into the main
 * validation result.
 */
export function applyStateRules(neris, rules) {
  const errors = [];
  const warnings = [];
  if (!rules) return { errors, warnings };

  const fdid = neris?._meta?.fdid || '';
  if (fdid && rules.fdidPattern && !rules.fdidPattern.test(fdid)) {
    errors.push(
      `FDID "${fdid}" does not match the ${rules.label || rules.stateCode || 'state'} format (${rules.fdidHint || 'see state program'})`
    );
  }

  if (rules.submissionDeadlineDays) {
    // incident epoch is the trailing segment of the neris id
    const epoch = Number(String(neris?.incident_neris_id || '').split(':').pop());
    if (Number.isFinite(epoch) && epoch > 0) {
      const ageDays = (Date.now() - epoch) / 86_400_000;
      if (ageDays > rules.submissionDeadlineDays) {
        warnings.push(
          `Incident is ${Math.floor(ageDays)} days old — past the ${rules.label || rules.stateCode} ${rules.submissionDeadlineDays}-day submission deadline`
        );
      }
    }
  }

  return { errors, warnings };
}
