# Recommended `data-testid` hooks

The app currently has **zero** `data-testid` attributes and **no URL router**, so
E2E selectors fall back to visible text — which is brittle (copy changes break
tests) and can't target state-based views. Adding a small, stable set of test hooks
is the highest-leverage testability investment here: it converts the `test.fixme`
journey steps into fast, reliable, always-on tests.

Add `data-testid` to these ~20 controls (name → suggested id):

## Auth & shell
- Login username field → `login-username`
- Login password field → `login-password`
- Login submit → `login-submit`
- Primary nav item, each → `nav-{board|dispatch|inspections|reports|roster|...}`
- Logged-in landmark (app shell root) → `app-shell`

## Incident / command
- Command board root → `command-board`
- PAR: start → `par-start`; account toggle per unit → `par-account-{unitId}`; complete → `par-complete`
- Clear-call open → `call-clear`; release-unit → `unit-release-{unitId}`; disposition select → `call-disposition`
- Status-check button (overdue rig) → `status-check-{unitId}`

## Inspection / prevention
- Inspection result control → `inspection-result`
- Complete inspection → `inspection-complete`
- Cite violation → `violation-cite`
- Generate notice → `notice-generate`
- Service outcome (Signed/Refused/No party) → `service-outcome`
- Record returned mail → `notice-returned-mail`
- "Action required / enforcement blocked" banner → `enforcement-blocked`

## Save / trust surfaces (the ones that lied)
- Save-state indicator → `save-state` (must expose `data-state="saved|saving|failed"`)
- Copy button → `copy-action`
- "Hand over / served" confirmation → `notice-served`
- Offline banner → `offline-banner`

## Field / offline
- Size-Up root → `sizeup`
- Pre-plan panel → `sizeup-preplan` (expose `data-age` and `data-source="device|network"`)
- Hydrant list → `sizeup-hydrants`

Exposing `data-state` / `data-source` / `data-age` as attributes (not just styling)
lets a test assert the *truth* of a screen — e.g. that the save indicator says
`failed` when storage is dead — which is exactly the class of bug that shipped.
