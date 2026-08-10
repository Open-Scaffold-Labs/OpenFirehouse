// incidentDraft.js — the LOCAL, unsent draft of an incident report.
//
// ── THE RULING THIS IMPLEMENTS (Matt, 2026-08-07, spec R3) ───────────────────
// "local until you explicitly save." No server-backed autosave. A half-written
// report is PRIVATE TO THE MACHINE IT WAS TYPED ON and is not visible to anyone
// else in the department — which is the correct default for a subpoenable record
// in progress: nothing enters the shared record until a person commits it.
//
// ⚠️ THIS IS NOT A BACKUP, AND THE UI MUST NOT CALL IT ONE. Clearing site data
// loses it. It does not follow the officer to another machine or another browser.
// The label is "Draft saved on this computer" — never a bare "Saved", which is
// the word the officer will read as "it is in the system".
//
// ⚠️ IT IS ALSO NOT A SUBMISSION. `buildNerisSavePayload` remains the ONE place
// the NERIS save shape is built (P2-D5). A draft is a UI convenience and never
// touches the payload path. Do not let these two converge.
//
// Same-origin localStorage is shared between the report window and the list
// window that opened it (spec R1), so a draft written in one is readable in the
// other. That is deliberate and is what makes the pop-out window safe to close.

const PREFIX = 'of_incident_draft:';

/** New reports share one key; existing ones key on their id. */
export function draftKey(incidentId) {
  return `${PREFIX}${incidentId ? String(incidentId) : 'new'}`;
}

/**
 * Persist a draft. Best-effort by design: a full disk or a private-mode quota
 * error must never take down the form the officer is typing into.
 * @returns {boolean} true when it actually landed — callers show state from this,
 *   never from the assumption that it worked.
 */
export function saveDraft(incidentId, form) {
  try {
    localStorage.setItem(draftKey(incidentId), JSON.stringify({
      savedAt: new Date().toISOString(),
      form,
    }));
    return true;
  } catch {
    return false;   // quota / private mode / disabled storage
  }
}

/** Read a draft back. Returns null when absent OR unreadable — see below. */
export function loadDraft(incidentId) {
  try {
    const raw = localStorage.getItem(draftKey(incidentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // A draft whose shape we do not recognise is DISCARDED, not merged. Merging
    // an unknown shape into a legal record's form state is how a field ends up
    // holding something nobody typed.
    if (!parsed || typeof parsed !== 'object' || !parsed.form || typeof parsed.form !== 'object') return null;
    return { savedAt: parsed.savedAt || null, form: parsed.form };
  } catch {
    return null;
  }
}

export function clearDraft(incidentId) {
  try { localStorage.removeItem(draftKey(incidentId)); } catch { /* nothing to do */ }
}

/** Human label for the draft state. Deliberately never the word "Saved" alone. */
export function draftLabel(savedAt) {
  if (!savedAt) return null;
  const d = new Date(savedAt);
  if (!Number.isFinite(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `Draft saved on this computer at ${hh}:${mm}`;
}
