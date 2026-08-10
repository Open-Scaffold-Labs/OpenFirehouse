# HANDOFF — Fire Inspection Violations: jurisdiction-configurable vocabulary + the NJ model

**Written:** 2026-07-12, end of a long session.
**For:** the next session picking this up.
**Status:** researched and specced. **No code written yet.** Nothing here is committed.

---

## 0. READ THIS FIRST — the one thing that matters

**Matt is a working fire inspector in New Jersey.** He is the domain expert. When his lived
experience conflicts with a research summary, **he is right and the research is wrong.**

This session made exactly that mistake: a research agent produced a "correct national vocabulary"
in which `Abated` means *the jurisdiction hired a contractor and liened the property*. That IS a
real meaning — in California and some municipal code-enforcement regimes. It is **NOT** the New
Jersey meaning, and I recommended a design around it before Matt corrected me.

**New Jersey's own code settles it.** N.J.A.C. 5:70-2.10(b):

> "Time periods allowed for **abatement** of violations of this Code shall be as follows:
> … the fire official shall allow a minimum of **15 days** … a minimum of **30 days** for
> **abatement** or the submission of a request for an extension."

In NJ, **abatement = the owner/landlord corrects the violation within the allowed period.**
That is exactly how Matt uses the word. It is the word printed on the notice he serves.

---

## 1. THE ACTUAL PROBLEM

Fire code enforcement is administered **state by state and municipality by municipality**.
NJ runs the Uniform Fire Code (N.J.A.C. 5:70); other states don't; home-rule towns amend on top.

So the bug is **not** "we picked the wrong word." The bug is **we picked a word at all** and
hard-coded it for everyone.

### The pattern to follow (we already did this twice this weekend)

| Domain | Canonical INSIDE (software reasons on this) | Department's OWN words OUTSIDE |
|---|---|---|
| Unit designations | `apparatus_id` | "E1" / "Engine 1" — dept-configured aliases (migration 0041) |
| Apparatus types | NERIS `type_unit` (49 values) | "Tower Ladder 1" — the crew's label (migration 0042) |
| **Violation statuses** | **open / resolved semantics** | **"Abated" in NJ** · "Corrected" elsewhere |

Same shape every time: **canonical semantics internally, jurisdiction's vocabulary on screen,
never destroy the raw value.**

---

## 2. WHAT THE CODE DOES TODAY (all verified this session, file:line)

### The canonical axis (this part is fine)
`server/src/constants/violationStatus.js`
- `VIOLATION_STATUSES = ['Open', 'Time Extension', 'Corrected', 'Withdrawn']` (:27)
- `RESOLVED_VIOLATION_STATUSES = ['Corrected', 'Withdrawn']` (:29)
- `LEGACY_STATUS_MAP` (:32–43): `abated → Corrected`, `void → Withdrawn`, `unabated → Open`, …
- `canonicalizeViolationStatus()` — unknown → `'Open'` (**fail-open**; keep this rule forever)
- `isResolvedViolationStatus()` — canonicalizes first, so the SERVER thinks `'Abated'` is resolved

### 🐞 BUG 1 — server and clients disagree (REAL, verified)
Canonicalization is **WRITE-ONLY** (`routes/fiInspections.js:14–35` `coerce()`, called on POST/PATCH).
**The read path never canonicalizes.** And both clients decide "resolved" by **raw literal compare**:
- web: `client/src/components/FireInspections.jsx:31` — `!RESOLVED_VIOLATION_STATUSES.includes(v.status)`
- iPad: `OpenFirehouseMobile/src/constants/violations.ts:21–23` — same, no canonicalization

**Consequence, today, on a legacy `'Abated'` record:**
- Server: **resolved**
- Web + iPad: **OPEN, amber "needs action"**, rendering the word "Abated" which is in no dropdown
- Web edit form: the `<select>` has no `Abated` option → shows an **empty "Select…" placeholder**
- Then **any save silently flips it to `Corrected`** — no notice, no audit record

I initially told Matt this was a deliberate "fail-safe." **It is not. It is a bug.** Correct that
if it comes up.

### 🐞 BUG 2 — dead vocabulary still live in the UI
- `client/src/components/InspectionEntry.jsx:734` — batch bar offering
  `['Abated','UnAbated','Withdrawn','Time Extension','Recommended']` (the OLD vocabulary).
  Also defaults new violations to `'New Violation'` (:284) and writes `'Void'` (:328).
  *Mitigating:* this screen is **pure local state, never persists** (no `api`/`fetch` imports).
  But an inspector doesn't know that.
- `client/src/components/InspectionSearch.jsx:316–321` — filter offers `Pending` and
  `Referred to Legal`, **which are not statuses at all**, and **omits** `Time Extension` +
  `Withdrawn` (so they can never be searched). Runs off static demo data.
- `client/src/components/FireInspectionForm.jsx:170` — hard-codes `v.status === 'Corrected'`
  to choose "Corrected Date" vs "Follow-Up Date". `Withdrawn` (resolved) wrongly gets a follow-up.

### 🐞 BUG 3 — violations have NO audit trail and are HARD-deleted
- `routes/fiInspections.js` contains **0** `audit()` calls (`routes/incidents.js` has 3).
  A status change **overwrites** with no who/when/from→to.
- `db.js:4353` — `DELETE FROM fi_inspections …` — **hard delete**, no `deleted_at`.
  Incidents/exposure records are soft-deleted; inspections are not.
- Violations are an **unversioned JSON blob in a TEXT column** (`db.js:522`
  `violations TEXT DEFAULT '[]'`). **No violation has a stable id** — it's an array position.
- ⚠️ Violation **photos key on the array index** (`FireInspections.jsx:41–44`,
  `OpenFirehouseMobile/src/app/(tabs)/tools/inspections.tsx:236`) — so removing or reordering a
  violation **silently re-associates its photos to a different violation.**

**Why BUG 3 is serious:** IFC §104.6 requires the fire code official to "keep a record of each
inspection made, **including notices and orders issued, showing the findings and disposition of
each**," retained **not less than 5 years**. These records surface in liens, insurance disputes,
and litigation. No history + hard delete does not meet that bar.

---

## 3. WHAT NEW JERSEY ACTUALLY REQUIRES (that we don't model)

From **N.J.A.C. 5:70-2.10** (Enforcement procedures) — fetched and read this session:

1. **The abatement clock, with statutory minimums.**
   - **15 days** minimum for a violation of N.J.A.C. 5:70-3
   - **30 days** minimum for 5:70-4 (or the submission of an extension request)
   - as little as **3 days** for a dangerous condition liable to spread fire or endanger occupants
   - *We store a free-text, unvalidated `followUpDate`. We cannot enforce or even warn on these.*

2. **The extension request — and this is legally loaded.**
   5:70-2.10(d): extensions must be **requested IN WRITING by the owner**, and (d)2:
   > "An application for an extension **shall be deemed to be an admission that the notice of
   > violation is factually and procedurally correct and that the violations do or did exist.**"

   That is an **admission against interest**. We have a `Time Extension` *status* and nothing
   else — no written request, no date, no record that the owner conceded the violation.
   **We are throwing away evidence.**

3. **Imminent hazard** (5:70-2.16) — a **separate track**; the time limits do not apply.
   `imminentHazard` exists as a field in `InspectionEntry.jsx` and **does not persist**.

4. **The Notice of Violation itself.** NJ's DCA form is literally
   *"Notice of Violations and **Order to Correct**"* (https://nj.gov/dca/divisions/dfs/forms/bfce/noticevio.pdf).
   Penalties (up to **$500/violation/day**, 5:70-2.12) **cannot be imposed except upon issuance of
   a written order** requiring abatement with a reasonable compliance period. The notice must also
   carry a **written statement of the owner's right to appeal** (5:70-2.19).
   *We model none of this: no notice, no service date, no appeal statement.*

---

## 4. THE PROPOSED DESIGN (Matt has NOT approved this yet)

### 4.1 Two layers
- **Semantic states** (what the software computes on, small and fixed):
  `OPEN` · `EXTENDED` (open, clock moved) · `RESOLVED` · `DISMISSED` (no violation existed) ·
  `VOID` (clerical, non-record)
  → **Resolved-for-counting = RESOLVED | DISMISSED.** Everything else counts OPEN. **Fail-open
  stays: an unrecognized label NEVER silently resolves a violation.**
- **Jurisdiction labels** (what the inspector sees and picks), per-department, seeded by state.
  **New Jersey default:** `Open` · **`Abated`** · `Time Extension` · `Withdrawn`
  (a CA/municipal department could add `Abated by Jurisdiction` → still `RESOLVED`, but with
  cost-recovery/lien fields — do NOT ship that as the NJ default)

### 4.2 Concretely
- New table or dept-config column: violation status vocabulary per department
  (`label`, `semantic_state`, `sort_order`, `is_default`), seeded from a state pack.
- `violationStatus.js` keeps the semantic axis + fail-open; the **label list becomes data**, not a
  hard-coded array.
- **Keep `LEGACY_STATUS_MAP` as a READ-time view, not a destructive write.** Preserve the raw
  string forever (`status_raw`); never overwrite it in place.

### 4.3 Fix the bugs regardless of the vocabulary decision
1. **Canonicalize on READ** (or share one helper both clients import) so the server and the clients
   stop disagreeing. This alone fixes the amber-"Abated" display and the silent flip on save.
2. Kill the dead vocabulary in `InspectionEntry.jsx:734`; fix `InspectionSearch.jsx:316–321`;
   remove the `=== 'Corrected'` hard-code in `FireInspectionForm.jsx:170`.
3. **Append-only status history** (who / when / old→new / why / triggering re-inspection) and
   **soft-delete** inspections — same doctrine already protecting incidents and exposure records.
4. Give each violation a **stable id** and re-key photos off it (the array-index coupling is a
   latent photo-misattribution bug).

### 4.4 NJ artifacts worth modeling
- `compliance_due_date` + validation against the statutory minimums (15 / 30 / 3 days)
- **Extension request**: `requested_at`, `requested_in_writing` (bool), `reason`, `new_due_date`,
  and a flag noting it **constitutes an admission** under 5:70-2.10(d)2
- `imminent_hazard` (persisted, separate track — time limits don't apply)
- **NOV**: issued_at, **served_at**, service method, appeal statement included (y/n)

---

## 4.5 ⬅ DO THIS RESEARCH BEFORE YOU BUILD (Matt's explicit ask)

**Research how the top fire-inspection / code-enforcement platforms handle state and municipal code
differences — the vocabulary, the forms, and the workflow.** Matt's read (and he does this job):
*"I'm sure they are built customized to each fire inspector's jurisdiction, and we have to be able to
handle this just as well if not better."* Treat that as the bar.

**Use agents (parallel), and use WebSearch/web_fetch heavily — do NOT answer from memory.**

⚠️ **NAMING RULE (hard):** never write a competitor product or company name in ANY artifact — this
doc, code, commits, marketing. Generic descriptors only ("a widely-used fire-prevention platform",
"a municipal code-enforcement suite"). Standards/agencies/codes ARE nameable: NFPA, IFC, ICC, NJ DCA,
N.J.A.C., NFIRS, NERIS, OSHA, ISO, state fire marshals.

### The questions to answer

1. **Is per-jurisdiction configuration the actual industry model?** Do these platforms ship a
   configurable status/disposition vocabulary, or one hard-coded national set? How is it configured —
   admin UI, per-tenant config, professional-services setup during onboarding?
2. **How do they handle the CODE ITSELF differing by state?** NJ = Uniform Fire Code (N.J.A.C. 5:70);
   other states adopt IFC editions with amendments; home-rule towns amend further. Do they ship
   **state code packs** / adopted-code libraries? Versioned by code edition/year? Who maintains them —
   the vendor, the department, or a third party?
3. **The violation CODE LIBRARY** (not just the status): where do the citable code sections come from?
   Is it a licensed ICC/NFPA code database, a vendor-curated list, or department-entered? **Note the
   licensing question: ICC and NFPA code text is copyrighted** — how do they legally ship code text?
   (This matters a lot for an open-source product. Find out.)
4. **Forms and notices.** Every state has its own NOV form (NJ's is literally *"Notice of Violations
   and Order to Correct"*, nj.gov/dca/divisions/dfs/forms/bfce/noticevio.pdf). Do these platforms ship
   per-jurisdiction printable/served notice templates? Templating engine? Who authors them?
5. **Statutory clocks and penalties.** NJ mandates minimum abatement periods (15/30/3 days) and
   penalties up to $500/violation/day. Do they encode per-jurisdiction deadline rules and penalty
   schedules, or leave them to the inspector?
6. **Multi-jurisdiction reality.** A county/regional bureau may inspect across towns with different
   amendments. Does the config live at department level, or per-jurisdiction *within* a department?
   (This likely decides our data model — dept-level may be too coarse.)
7. **How do they onboard a new department** without a services engagement? Is there a self-serve path,
   or is jurisdiction setup always human-configured? **That's our opening if it's always services-led.**
8. **What do inspectors actually complain about** in these tools re: jurisdiction fit? (forums, reviews,
   fire-marshal association discussions)

### Deliver
- Whether per-jurisdiction vocabulary/config is table-stakes or a differentiator
- The recommended **data model** for jurisdiction config (dept-level vs jurisdiction-level; state packs;
  versioning by adopted code edition)
- A clear answer on the **code-text licensing/copyright** constraint for an open-source product
- Where we can be **better**: e.g. ship an NJ pack that's correct out of the box, self-serve, with the
  statutory clocks encoded — instead of a blank vocabulary a department must configure by hand
- Cite sources with URLs

**Then bring it to Matt before building.** He is the NJ subject-matter expert and offered to supply the
real DCA form — build from that, not from a summary.

---

## 5. THE OPEN QUESTION FOR MATT (ask this first)

> **Is the NJ vocabulary I should seed as default `Open / Abated / Time Extension / Withdrawn` —
> or should I build it from the actual DCA "Notice of Violations and Order to Correct" form you
> serve?**

He offered to be the source. **Build from the real form, not from a regulation summary.**
Ask to see it, or ask him to list the statuses/fields exactly as they appear on the notice.

---

## 6. STATE OF THE WORLD (as of this handoff)

**Committed and pushed this session (OpenFirehouse):**
- `f3e70e5` Dispatch Archive (migration 0041) + the Demo Center
- `b018ad1` unit aliases / standards alignment (zero-padding, T=Truck-vs-Tanker refusal)
- `fd2085a` NERIS apparatus types (migration 0042)
- `05c424d` demo staffing/board data made reproducible (nightly pg_cron job)

**Also live:** migrations 0040–0043 all applied to prod + ledger. `/demos` is live and verified.

**NOT done / known open (unrelated to violations):**
- 🔴 **The UTC "today" bug — 48 components** compute today with `toISOString()`. After ~8pm Eastern
  that's *tomorrow*, so a night crew opening the Assignment Board sees "No shifts scheduled."
  **Live for every real department.** This is the highest-value fix on the board.
- `/api/cad/simulate` never geocodes (null lat/lng on simulated calls).
- iPad demo shows only **Route**; Matt asked for route + overhead + street **on the iPad**.
  Blocked because another session was using the simulator. Method that works: temporarily flip the
  default in `SizeUpMap.tsx:114` (`useState<'route'|'overhead'|'street'>('route')`), let Metro
  fast-refresh, screenshot with `xcrun simctl io`, then **revert the file**.
- 12 apparatus have no NERIS type (deliberate — a chief must pick; "Ladder" → 7 candidates).

**⚠️ Multiple Claude sessions are editing these repos concurrently.** One swept up my uncommitted
`SizeUpMap.tsx` change into its own commit (`75810ca`) this session. **Check `git status` before
editing a file, and don't drive the iOS simulator without checking whether another session is in it.**

---

## 7. TONE NOTE FOR THE NEXT SESSION

Matt caught **three** bad word choices from me this session that made fine work sound alarming
("left it deliberately broken", "locks the plume distances", "the client fails safe"). The work was
correct each time; the wording was not. **Say plainly what changed and what didn't. If you didn't
touch something, say "I did not touch this" and prove it with git.**

And when Matt says the domain works a certain way — **he does this job.** Start from that.
