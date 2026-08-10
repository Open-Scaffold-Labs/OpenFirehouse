// moduleRegistry.js — the single source of truth for which modules a department's
// workspace EXPOSES.
//
// ── WHY THIS EXISTS (market-shaped, not a hide hack) ─────────────────────────
// The large fire suites don't show every capability they sell to every department.
// A department licenses/enables the modules it wants and works only in those; an
// admin toggles availability. Showing the whole catalog to everyone is the market
// exception, not the rule (competitive research, 2026-07-21). This registry is the
// foundation of that model.
//
// TODAY: the enabled set = the modules that meet our hardening bar. Modules still
// being brought to that bar by the HARDEN-THE-TAIL program
// (docs/HARDEN-THE-TAIL-GAMEPLAN-2026-07-21.md) are marked 'planned' and hidden
// from nav + deep-link — their routes and DATA remain fully intact underneath, so
// this is reversible in ONE line (flip 'planned' → 'ready') the moment a module's
// phase closes. Nothing is deleted; a department mid-flight never loses data.
//
// FUTURE (server-driven per-department enablement): isModuleEnabled() already
// accepts an optional per-dept enabled-set, so swapping the hard-coded ready-set
// for a `departments.enabled_modules` column behind an admin toggle is a clean
// drop-in — no call sites change.
//
// The keys below are nav item ids (Layout.jsx NAV_GROUPS) / page ids (App.jsx).
// A module ABSENT from this map defaults to 'ready' (visible) — so this list is
// only ever the *hidden* set, which keeps it honest and short.

export const MODULE_STATUS = {
  // Below-bar scaffolds — hidden until their HARDEN-THE-TAIL phase brings them to
  // standard. `phase` documents where each returns. (Market parity: competitors
  // expose these only when mature; a bare-CRUD version visible hurts the brand.)
  recruitment:          { status: 'planned', phase: 'P3 (recruiting pipeline)' },
  cadets:               { status: 'planned', phase: 'PII hardening (minors data)' },
  'personnel-actions':  { status: 'planned', phase: 'P1-adjacent (HR/legal records)' },
  wellness:             { status: 'planned', phase: 'PII hardening (medical data)' },
  'commander-cam':      { status: 'planned', phase: 'P5' },
  nfirs:                { status: 'planned', phase: 'state-reporting (NFIRS retired nationally 2026-01)' },
  ng911:                { status: 'planned', phase: 'P5' },
  avl:                  { status: 'planned', phase: 'P5 (fleet/telematics)' },
  fireinvestigation:    { status: 'planned', phase: 'P3 (case management)' },
  'incident-costs':     { status: 'planned', phase: 'finance phase' },
  'community-outreach': { status: 'planned', phase: 'P4' },
  public:               { status: 'planned', phase: 'P4 (public dashboard)' },
  budget:               { status: 'planned', phase: 'finance phase' },
  grants:               { status: 'planned', phase: 'finance phase' },
  fundraising:          { status: 'planned', phase: 'finance phase' },
};

/**
 * Is this module exposed in the workspace?
 * @param {string} navId               nav item / page id
 * @param {Set<string>|null} deptEnabled  future per-department enabled-set; null = show all ready modules (today)
 */
export function isModuleEnabled(navId, deptEnabled = null) {
  const entry = MODULE_STATUS[navId];
  const ready = !entry || entry.status === 'ready';
  if (!ready) return false;
  // Future per-department override: only narrows the ready set, never widens it.
  if (deptEnabled && typeof deptEnabled.has === 'function') return deptEnabled.has(navId);
  return true;
}

/** For a future admin surface: the planned set + where each returns. */
export function plannedModules() {
  return Object.entries(MODULE_STATUS)
    .filter(([, v]) => v.status === 'planned')
    .map(([id, v]) => ({ id, phase: v.phase }));
}
