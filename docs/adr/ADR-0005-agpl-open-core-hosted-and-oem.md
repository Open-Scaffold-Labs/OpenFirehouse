# ADR-0005 — OpenFirehouse licensing: AGPL open core, monetized via hosted service + commercial/OEM license

**Status:** Accepted (drafts pending counsel review) · 2026-06-19
**Supersedes:** ADR-0001 (the original AGPL + size-based commercial-use tier). (Renumbered to ADR-0005 because ADR-0002/0003/0004 are now used for identity, AVL, and bug-report-privacy decisions on main; the earlier proprietary/source-available exploration was never adopted.)
**Author:** Open Scaffold Labs
**Companion documents:**
- `LICENSE` — GNU AGPL v3 (the software license; unmodified)
- `HOSTED-SERVICE-AGREEMENT.md` — the paid managed-hosting subscription + the binding Pledge
- `COMMERCIAL-LICENSE.md` — the dual-license / OEM escape hatch
- `TRADEMARK-POLICY.md` — protects the OpenFirehouse / Fire Hazmat names and logos (the AGPL covers code, not brand)
- `CLA.md` — Contributor License Agreement (enables commercial relicensing)
- `docs/WHY_AGPL.md` — public-facing rationale

> **Draft notice:** the AGPL text is standard and unmodified. The Hosted
> Service Agreement and Commercial/OEM License are bespoke drafts that an
> attorney should review before use. Nothing here is legal advice.

---

## Context

The OpenFirehouse marketing site makes four load-bearing public promises:
genuine open source (**AGPL v3, full source on a public GitHub repo**), that
**any department can self-host free, forever**, that hosting is **free for
volunteer departments and fairly priced by size as they grow**, and a set of
binding **anti-lock-in guarantees** ("your data is always yours," a written
price cap, "can't be bought out from under you").

Two earlier ADRs are inconsistent with that marketing and are superseded:

- **ADR-0001** kept AGPL but bolted on an EULA that charged departments for
  *production use even when self-hosted*. That contradicts both AGPL (which
  grants every recipient a free run-right) and the site's "run free forever
  on your own servers" promise.
- **ADR-0002** abandoned open source entirely for a proprietary,
  source-available-to-licensees model with a private repo. That directly
  contradicts "open source · AGPL v3 · view the source · clone it tonight."

Neither was ever published: the repo has been private throughout, with zero
forks and zero external contributors. The decision is fully reversible at no
cost, so we choose the model the marketing actually describes.

## Decision

Adopt an **AGPL open-core model**: the software is genuinely open source, and
revenue comes from the hosted service and a commercial/OEM license — never
from charging anyone for the right to run the open-source code.

### 1. The software license is AGPL v3, on a public repo

`LICENSE` is the standard, unmodified GNU AGPL v3. The GitHub repository is
**public**. Anyone — any department, any size — may clone, study, modify,
self-host, and run OpenFirehouse free, forever. This makes every "open
source / view the source / run free on your own servers / can't lock you
out" claim literally true.

### 2. We monetize the hosted service, not the code

`HOSTED-SERVICE-AGREEMENT.md` governs Open Scaffold Labs' managed hosting at
app.openfirehouse.openscaffoldlabs.com. It is a **service subscription**, not
a software license, and it never restricts the AGPL code. It is free for the
Independent (volunteer/small) tier and size-tiered above it. Self-hosting any
tier is always $0.

### 3. The Pledge is contractual

The anti-lock-in promises are written into the Hosted Service Agreement as
binding terms that also bind any successor: (a) the department owns its data
and can export it any time, including after cancellation, at no charge;
(b) paid prices rise at most once a year by no more than the greater of CPI-U
or 5%, with 60 days' notice; (c) the Independent tier is permanently free and
its thresholds may only widen.

### 4. A commercial/OEM license is the dual-license escape hatch

`COMMERCIAL-LICENSE.md` is for parties who cannot accept AGPL — typically a
vendor shipping a closed-source fork, embedding OpenFirehouse in a
proprietary product, or hosting a modified version without publishing
changes. Negotiated directly; departments never need it.

### 5. Contributions require a CLA

Because we also sell commercial/OEM licenses, every external contribution is
accepted under `CLA.md`, which grants Open Scaffold Labs the right to license
contributions both under AGPL and commercially. Without it we could ship a
contribution under AGPL but not include it in a commercial license.

### 6. AGPL §13 compliance for the hosted version

Because we operate a configured/modified hosted instance, AGPL §13 requires
offering its corresponding source to users. Publishing everything to the
public repo satisfies this; an in-app "Source" link to the repo closes the
loop.

### 7a. The brand is protected by a separate Trademark Policy

The AGPL covers the *code*; it grants no rights to the **OpenFirehouse** or
**Fire Hazmat** names or logos. `TRADEMARK-POLICY.md` reserves those marks so a
fork cannot present itself as an official edition ("OpenFirehouse Pro,"
"Official OpenFirehouse Cloud," etc.). Forkers must use their own name and
branding; truthful nominative references ("based on OpenFirehouse,"
"OpenFirehouse-compatible") are allowed. This is the Mozilla/Firefox and Red
Hat model — open code, protected brand — and may matter as much as the OEM
license for preventing customer confusion. Trademark registrations for both
marks are in progress.

### 7. FireHazmat stays a separate proprietary product

FireHazmat is a distinct codebase shipped as a closed-source native iOS/iPadOS
app (plus PWA) under its own EULA and Apple's terms. AGPL does not reach it
because they share no licensed code. (AGPL/GPL is incompatible with the App
Store, so a separate proprietary codebase is required for an App Store app.)
Any future shared code must be AGPL or separately commercially licensed.

## Consequences

### What this enables

- A licensing posture that matches the marketing word-for-word, so "it's in
  the license, not a sales rep's promise" is accurate.
- Genuine open-source goodwill, OSI compliance, grant eligibility, and the
  "can't be bought out from under you" moat — the open source *is* the moat.
- AGPL stops competitors from absorbing the code into a closed product
  (publish changes or buy a commercial license).
- A real, defensible product (managed hosting) plus a dual-license revenue
  line from vendors.

### What this costs — the deliberate trade

- **A large, well-resourced department can self-host for $0 and never pay.**
  AGPL guarantees it and the site promises it. Size-based revenue depends on
  departments *choosing* managed hosting (most will, for lack of IT
  capacity), not on license enforcement. We accept this; it is the price of
  the open-source promise, and it is incompatible with mandatory self-host
  fees.
- The repository must be public — reversing the ADR-0002 private-repo
  posture.
- A CLA process (sign-before-merge) is required.

### What this forbids

- Charging departments for the right to run the code (self-hosting is free).
- A private or source-available-only repo (the model requires public source).
- Merging external contributions without a signed CLA.

## Migration / implementation

1. Keep `LICENSE` as unmodified AGPL v3 (done — restored).
2. Add `HOSTED-SERVICE-AGREEMENT.md` and `COMMERCIAL-LICENSE.md`.
3. Remove the proprietary `EULA.md` and `docs/WHY_SOURCE_AVAILABLE.md`;
   restore `docs/WHY_AGPL.md` (done).
4. Keep `CLA.md`; wire sign-before-merge into `CONTRIBUTING.md`.
5. Update `README.md` so self-hosting is free and paid = hosting.
6. Mark ADR-0001 and ADR-0002 superseded by this ADR.
7. Make the GitHub repo public; add an in-app "Source" link (AGPL §13).
8. Counsel review of the Hosted Service Agreement and Commercial/OEM License
   before launch.
