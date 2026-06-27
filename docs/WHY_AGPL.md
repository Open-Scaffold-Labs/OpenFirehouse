# Why AGPL v3?

Short answer: because OpenFirehouse is open source for fire departments,
not for proprietary fire-software vendors. AGPL v3 enforces that
distinction without restricting any legitimate department use.

If you're a department thinking about using OpenFirehouse, you don't
need to read the rest of this. **Self-hosted department use has zero
license obligations.** Run it, fork it, customize it, never share a
line of code back — that's all fine. The license is invisible to you.

The rest of this document is for developers, vendors, and the
license-curious.

---

## What AGPL v3 actually requires

AGPL v3 is GPL v3 plus one extra clause: if you offer modified
software *as a service over a network* to users who aren't part of
your organization, you have to publish your modifications under the
same AGPL terms.

What this means in practice:

| Use case                                                        | AGPL obligation |
|-----------------------------------------------------------------|-----------------|
| Your department runs OpenFirehouse for itself                   | **None.** Use it however you want. |
| Your department modifies OpenFirehouse for its own use          | **None.** Modify all you want. No publication required. |
| Your department shares a tarball with a neighboring department  | The neighboring department gets the same AGPL grant — same as you. |
| A vendor takes OpenFirehouse, adds proprietary features, and **sells it as a hosted service** to fire departments | **The vendor must publish their modifications under AGPL v3.** |
| A vendor packages OpenFirehouse as an **on-prem product** they sell | They must distribute their modifications under AGPL v3 to the buyer. |
| A vendor wants to ship a proprietary fork without publishing source | **They need a commercial license from Open Scaffold Labs.** |

The thing AGPL closes that plain GPL doesn't: the "SaaS loophole."
Under GPL v2, a vendor could take a GPL'd project, modify it, host it
as a service, and never publish their modifications because they
weren't *distributing* the software — they were just letting users
talk to it over a network. AGPL fixes that.

---

## Why this matters for OpenFirehouse specifically

The fire-software market is dominated by a small number of large
proprietary incumbents operating SaaS products at $4,000–$30,000 per
department per year. Their primary moat is feature breadth built up
over 20 years.

OpenFirehouse is competitive on feature breadth right now: 178
components, 90 tables, 574 API endpoints, an NFIRS 5.0 exporter, a
PCR module, CAD integration paths, an AI assistant woven through the
incident-command stack. A small department can self-host it for
roughly $20/month in Supabase + Vercel costs versus thousands of
dollars per year for the incumbent product. That's the value
proposition.

If OpenFirehouse were MIT-licensed, the rational move for any
incumbent would be to:

1. Fork the repository
2. Add their proprietary CAD integrations and reporting layers on top
3. Ship the result as part of their existing closed product
4. Capture all the development effort with none of the open-source
   reciprocity

This isn't hypothetical. It's a well-documented pattern across
multiple categories: MongoDB and AWS DocumentDB, Elasticsearch and
AWS OpenSearch, Redis and AWS ElastiCache. Each of those projects
eventually relicensed (to SSPL, ELv2, AGPL, RSAL) once the pattern
became unsustainable. The lesson from that history: pick the right
license at the start, when there's no community to fragment.

AGPL v3 is the right license at the start. It doesn't restrict
departments at all. It doesn't restrict service providers who are
willing to be transparent about their modifications. It only
restricts the specific behavior we don't want to enable: closed forks
of OpenFirehouse competing with OpenFirehouse on top of OpenFirehouse's
own code.

---

## Why not MIT?

MIT is the right license for libraries, frameworks, and tools whose
goal is maximum adoption with minimum friction. React is MIT. Express
is MIT. The Linux kernel famously isn't (it's GPL v2), because Linux
is a product that competes with proprietary operating systems, not a
library that lives inside them.

OpenFirehouse is a *product*, not a library. It competes directly with
proprietary fire-software vendors. The license needs to match.

---

## Why not GPL v2 or GPL v3?

Either would work for on-prem distribution, but neither closes the
hosted-SaaS loophole. A vendor could take GPL'd OpenFirehouse, host
it under their own brand, never publish their modifications, and
operate identically to a closed product. AGPL is the only widely-used
license that closes this gap.

---

## Why not SSPL or BUSL or Elastic License?

These are stricter than AGPL — they restrict any commercial hosting,
not just hosting of modified versions. They also fail OSI's open-source
definition. We want OpenFirehouse to be unambiguously open source so
that:

- It can be referenced in NFPA/USFA grant applications that require
  open source
- It can be redistributed by package managers, Linux distros, etc.
- Volunteer contributors don't have to worry about a future
  rug-pull from "open source" to "source available"

AGPL is the strongest license that still meets the OSI definition.

---

## Companies that pioneered this choice

OpenFirehouse is in good company on AGPL:

- **Open Dental** — Vertical SaaS for dental practices. AGPL v3.
  Same competitive dynamics as fire software (entrenched proprietary
  incumbents, fragmented small customers).
- **Discourse** — Forum software. GPL v2 / AGPL hybrid.
- **Mastodon** — Federated social. AGPL v3.
- **Frappe / ERPNext** — ERP system. GPL v3 historically, AGPL-style
  effect via commercial license carve-outs.
- **Bahmni** — Hospital information system. AGPL v3.
- **MongoDB** (pre-SSPL) — AGPL v3 for the same reason we're picking it.

In every one of these cases, the pattern is the same: open-source
copyleft for the community version, commercial license available for
organizations that need different terms.

---

## Commercial license

Organizations that can't or don't want to operate under AGPL v3 —
typically because they need to ship a closed fork or integrate
OpenFirehouse into a proprietary product — can purchase a separate
commercial license from Open Scaffold Labs.

Contact: dale@openscaffoldlabs.com

This is a standard "open core / dual license" model. The AGPL version
is fully featured. The commercial license isn't a "premium" tier — it
just changes the legal terms under which you're using the code.

---

## What does this mean for…

**A volunteer fire department running OpenFirehouse**
Nothing. Use it, modify it, never publish anything. AGPL applies only
if you offer the modified software to other organizations as a service.

**A regional consortium hosting OpenFirehouse for member departments**
This is where the "as a service" question gets nuanced. If the
consortium is structurally one organization (shared ownership,
shared governance), self-hosting probably applies. If the consortium
is acting as a vendor to legally independent departments, AGPL
publication obligations probably apply. When in doubt, email us —
this is the kind of thing that gets a quick free informal answer, not
a lawsuit.

**A consultant customizing OpenFirehouse for a department client**
Fine under AGPL. Hand the modified code to the client; the client
self-hosts it. No publication required because nobody is offering it
as a service to anyone else.

**A vendor building a closed fork**
Talk to us about a commercial license.

**A vendor building an open fork that publishes its modifications**
Welcome aboard. Drop a note in our Discussions; we'd like to know
what you're doing.

---

## Why this is the right time to pick this license

There are zero external contributors right now. There is no community
to fragment, no contributor agreements to migrate, no donated
copyright to renegotiate. The relicense from MIT to AGPL is a single
commit signed by the sole copyright holder (Open Scaffold Labs, LLC).

If we waited until OpenFirehouse had 50 contributors and 200
deployments, we couldn't do this without either tracking down every
contributor for re-permission or rewriting their code. Companies have
spent years and millions of dollars on exactly that exercise.

We're picking the license at the right moment — before the cost of
the decision compounds.

---

*Last updated: May 2026, at the point of relicensing from MIT to
AGPL v3. Questions, disagreements, or commercial license inquiries:
dale@openscaffoldlabs.com.*
