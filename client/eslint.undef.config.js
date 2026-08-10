// eslint.undef.config.js — THE SHIP GATE. One rule, and it must stay at zero.
//
// WHY THIS FILE EXISTS
// --------------------
// On 2026-07-27 a dead identifier shipped to production and took an entire page into the
// ErrorBoundary. Nothing in the module gate could have caught it:
//
//   - the client BUILD was green. Vite bundles a free identifier happily; a ReferenceError
//     only happens when the line executes.
//   - the 803-test SERVER SUITE was green. It never renders a component.
//
// So "server suite + client build" is not a gate for React code. Only a browser pass caught
// it — on the first click. A green build is not evidence that a page renders.
//
// Running the FULL lint is not an option: the client carries ~595 pre-existing problems
// (mostly no-unused-vars and react-hooks warnings), so `npm run lint` exits non-zero on a
// clean tree and can never gate anything. But of those, `no-undef` was only 12 — and when
// they were actually read, THREE were live crashes and the rest were undeclared globals we
// simply had not told eslint about. So this config runs that ONE rule, at zero, and the
// rest of the lint debt stays a separate cleanup that does not block shipping.
//
// WHAT IT ALREADY CAUGHT, the day it was written:
//   - DailyStaffingBoard.jsx — `minCrew`, deleted by 1.4 but still referenced twice in the
//     render body. THE DAILY STAFFING PAGE WAS DEAD ON PRODUCTION and nobody knew.
//   - PermitsTab.jsx — `isExpiredByDate`, the bug that prompted all of this.
//   - MyPortal.jsx — `user`, a ReferenceError hiding behind a `||` so it fired only for
//     members with no name recorded.
//   - PreIncidentPlans.jsx — `onNavigate`, never passed to PlanDetail; optional chaining
//     does not save an UNDECLARED binding, only a null value, so the Knox link threw.
//
// IF THIS GATE GOES RED: read the identifier before touching the config. A genuinely new
// global belongs in `languageProfiles` in eslint.config.js. Everything else is a crash
// waiting for the first user to reach that line — fix the code, not the rule.
import { globalIgnores } from 'eslint/config'
import { languageProfiles } from './eslint.config.js'

export default [
  globalIgnores(['dist']),
  ...languageProfiles,
  {
    files: ['**/*.{js,jsx,mjs}'],
    rules: { 'no-undef': 'error' },
  },
]
