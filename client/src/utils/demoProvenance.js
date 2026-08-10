// utils/demoProvenance.js — is this dispatch a DEMO, or a real call?
//
// This is the only thing standing between a real fire and the Command Board's
// 80-second scripted demo sequence, which fabricates radio traffic, unit statuses,
// milestones, an incident commander and a PAR. That sequence is a legitimate and
// valuable sales tool. It must simply never, ever run on a real incident.
//
// It used to be gated on "did this incident come from a dispatch?" — which a live
// CAD feed satisfies exactly as well as the Simulate Dispatch button does. Nothing
// went wrong in practice (every dispatch in prod today is a demo dispatch), but the
// day a department wires a real Active911 feed, a real fire would have triggered
// the script and written fabricated radio traffic and fabricated NFIRS response
// times into incidents.notes — the subpoenable narrative and the NERIS export
// source.
//
// The demo already identifies itself in the data: LiveDispatch's fireDispatch()
// mints `demo-<timestamp>` ids. Real CAD vendors mint their own ids and never use
// that prefix. So the provenance is already there; we just have to READ it.
//
// Lives in utils/ (not inline in CommandBoard.jsx) so it is trivially unit-testable
// without dragging React into a test runner. A gate this important does not get to
// be an untested inline expression.

export const DEMO_ID_PREFIX = 'demo-';

/**
 * True IFF this dispatch was minted by our own demo tooling.
 *
 * Deliberately FAIL-CLOSED for the demo (and therefore fail-SAFE for real calls):
 * anything we cannot positively identify as a demo is treated as a real incident,
 * and the scripted sequence stays off. An unrecognised alert must never be assumed
 * fake.
 *
 * @param {{id?: string|number, alert_id?: string|number}|null|undefined} alert
 * @returns {boolean}
 */
export function isDemoDispatch(alert) {
  if (!alert || typeof alert !== 'object') return false;
  const id = alert.id ?? alert.alert_id ?? '';
  return String(id).startsWith(DEMO_ID_PREFIX);
}
