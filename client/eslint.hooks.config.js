// eslint.hooks.config.js — THE SECOND SHIP GATE. One rule, and it must stay at zero.
//
// WHY THIS FILE EXISTS
// --------------------
// On 2026-08-07 a browser pass on production found the Prevention Center's **Settings ›
// Department** tab white-screening to the ErrorBoundary with React error #310, "rendered
// more hooks than during the previous render". The cause was one `useState` declared BELOW
// an `if (!form) return <Spinner/>` guard: the first render bailed early with four hooks,
// and the render after the fetch resolved ran five. React counts them and throws.
//
// It had been broken since cc7e2f8 — WEEKS — and every gate this repo has was green:
//
//   - the client BUILD was green. Rules of Hooks is a RUNTIME contract, not a syntax error.
//   - the 1169-test SERVER SUITE was green. It never renders a component.
//   - `lint:undef` was green. Every identifier was perfectly well defined.
//   - the client test runner CANNOT mount a component at all — there is no jsdom, no
//     testing-library, nothing. A component-level regression test is not available to us.
//
// So the existing gates cannot see this defect class, and the tab only breaks AFTER its
// fetch resolves — which means it looks like a loading screen right up until it doesn't.
// Only a browser pass caught it, on the one surface a browser pass had never covered.
//
// `eslint-plugin-react-hooks` was already installed and `rules-of-hooks` was already ON in
// eslint.config.js. It would have caught this the day it was written. It did not, because
// the full `npm run lint` carries ~593 pre-existing problems and therefore exits non-zero
// on a clean tree — a gate that is always red is not a gate. This config runs that ONE rule,
// at zero, exactly as eslint.undef.config.js does for `no-undef`, and leaves the rest of the
// lint debt as a separate cleanup that does not block shipping.
//
// IF THIS GATE GOES RED: fix the code, never the rule. A hook below a conditional return is
// not a style opinion — it is a component that will crash for a user and not for you,
// because it only fires once the data arrives.
import { globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import { languageProfiles } from './eslint.config.js'

// THE ONE EXEMPTION, and it is a true false-positive rather than debt.
//
// src/App.jsx trips this rule 40 times — every hook in App() sits below three early returns:
//
//   if (IS_REPORT_WINDOW) return <IncidentReportWindow />;
//   if (IS_KIOSK)         return <KioskApp />;
//   if (IS_TV_MODE)       return <TVDisplay pin={TV_PIN} />;
//
// All three predicates are MODULE CONSTANTS, evaluated once when the bundle loads and never
// reassigned — App.jsx says so itself in the comment above them. So the branch taken is fixed
// for the entire life of the page: the hook COUNT never changes between renders, and #310 can
// never fire. The rule cannot see that a predicate is constant, so it flags all 40.
//
// This was checked, not assumed, before being exempted — the whole point of the gate is that
// it flags a real crash, and "fixing" 40 deliberate lines to silence it would be the opposite
// of what it exists for. If App.jsx ever gains an early return on a value that CHANGES during
// a session, this exemption becomes a hole; re-read those three predicates before adding one.
export default [
  globalIgnores(['dist']),
  ...languageProfiles,
  {
    files: ['**/*.{js,jsx,mjs}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error' },
  },
  {
    files: ['src/App.jsx'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
]
