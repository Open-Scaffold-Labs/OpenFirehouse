<!--
Thanks for sending a pull request. A few things to confirm before
clicking Create:
-->

## What this changes

A one-paragraph description of the change.

## Why

What problem does this solve? Link to the issue if one exists
(`Fixes #123`).

## How to verify

Steps a reviewer can follow to confirm this works.

## Audit gate

The 14-point audit gate runs automatically on every PR (see
`.github/workflows/audit.yml`). A PR that *lowers* the score versus
`main` fails the check. Flat or improved passes.

If your PR adds new files outside the audit's known set, it may
trip the staleness checks — those usually need a one-line addition
to the audit config rather than a content change.

## License

By submitting this PR you agree that your contribution is licensed
under the same AGPL v3 terms as the rest of the project. See
`LICENSE` and `docs/WHY_AGPL.md`.

## Checklist

- [ ] Tests / smoke verification updated where applicable
- [ ] Docs updated where applicable
- [ ] CHANGELOG.md updated (under `## Unreleased`)
- [ ] Audit gate passing locally
