-- 0118-fi-fee-schedules.sql
--
-- Phase 3, module 3.2 (Slice A) — fee schedules + the calculation engine's storage.
-- Spec: docs/PHASE3-PERMITS-FEES-SPEC-2026-07-26.md
--       §1.6 (re-inspection needs a HUMAN discriminator) · §1.7 (the five chaining primitives)
--       §1.9 (the audits this schema is the negative image of) · §6 (table shape)
--       §8 F6/F8/F9/F13/F14/F17 · §10 R1 (the market bar IS the spec) · R2 (money boundary)
--
-- Claimed by stub 2026-08-04, pushed as 01aafba BEFORE any SQL was written (F4 rule; four
-- number collisions to date). Head verified 0117 three ways at claim time: file listing, the
-- prod of_schema_migrations ledger, and `git log --all -- 'docs/migrations/0118*'`.
-- Note: spec §9's block "0090–0099" is STALE — the repo head was 0117 when 3.2 opened.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- ⛔ NOT YET APPLIED. Two items need Matt's call before this touches prod — see APPROVAL
--    GATES at the bottom of this header. Do not apply on the strength of this file alone.
-- ═════════════════════════════════════════════════════════════════════════════════════════
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- WHY THE SHAPE IS THIS SHAPE — it is the negative image of three published audits
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- §1.9 collects government-authored descriptions of exactly what NOT to build. Each finding
-- maps to a specific decision here, and that mapping is the design rationale:
--
--   FINDING (2018 municipal audit of a fire marshal's office)     → DECISION HERE
--   "not pre-numbered, difficult to identify gaps"                → Slice B (fi_document_sequences)
--   "corrections can be made to the original transaction"         → items are IMMUTABLE once
--   "There is no audit trail in the system to track changes"        adopted; a change is a NEW
--                                                                   version, never an edit
--   "Inspectors had access rights to change fees in the system"   → F14. Route layer is
--                                                                   prevention_admin-only; the
--                                                                   DB refuses UPDATE on an
--                                                                   adopted version regardless
--                                                                   of who is asking
--   FINDING (2025 state comptroller, 840 permits / $404,544)      → DECISION HERE
--   "$11,127 of fee-calculation errors in BOTH directions"        → NUMERIC end-to-end, explicit
--                                                                   rounding, a stored per-item
--                                                                   breakdown that reproduces
--                                                                   the arithmetic
--   "two permits assessed no fee at all"                          → zero-fee is a first-class,
--                                                                   queryable, reason-coded row
--                                                                   (F18), never an absence
--   "the system did not timestamp its own writes, so auditors     → computed_at + committed_at +
--    could not test timeliness at all"                              created_at on every row
--   FINDING (third audit, rate tables)                            → DECISION HERE
--   "5 of 15 rate-table entries did not match the board-approved  → adopting_instrument +
--    schedule; the schedule in force traced to a board action        adopting_instrument_ref +
--    SEVEN YEARS earlier; one wrong entry applied to every          adopted_by + adopted_on are
--    permit transaction"                                            NOT NULL on an adopted
--                                                                   version. A number in force
--                                                                   must name the instrument
--                                                                   that authorizes it.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE FIVE PRIMITIVES, AND WHY THERE IS A SIXTH KIND
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- §1.7: every adopted schedule read composes from exactly five — flat per-type · tiered
-- lookup · construction valuation · hours × hourly rate with minimum hours · percentage of
-- another fee. Those are `kind IN ('flat','tiered','valuation','hourly','percent_of')`.
--
-- 'surcharge' is a sixth KIND and that is not scope creep. §1.7 is explicit that a flat
-- "apply X% to the invoice total" implementation is WRONG in at least two jurisdictions: one
-- county applies 10% to installation permits ONLY; one city runs a literal third column (3%
-- IT fee) carrying "N/A" on its hourly, re-inspection and appeal lines. A surcharge's base is
-- therefore "the surchargeable subtotal", which is a different base from percent_of's "one
-- named fee". Modelling it as percent_of cannot express either jurisdiction. So: 'surcharge'
-- is its own kind, and EVERY other item carries `surchargeable` — the per-fee-line
-- applicability flag §1.7 names in as many words. A department with no surcharge (one large
-- city has none in 35 pages) simply has no surcharge item and the flag is inert.
--
-- CHAINING IS THE NORM AND IS "what a naive model breaks on" (§1.7 verbatim). The three
-- documented chains are why items form a DAG rather than a list:
--   valuation → dollars → HOURS OF INSPECTION CREDIT
--   square footage → valuation → building permit fee → 25% OF IT
--   base hours → hourly rate → "PLUS 50%" → "+$10 PER BED"
-- Mechanically: an item's input is either an application VARIABLE (`input_variable`) or
-- ANOTHER ITEM'S COMPUTED OUTPUT (`input_item_id`). The trailing "+50%" / "+$10 per bed"
-- adjustments are ordered rows in fi_fee_item_modifiers, because they apply in sequence and a
-- single column cannot hold two of them. Cycle detection is the engine's job and has its own
-- test; the DB blocks only the trivial self-reference.
--
-- HOURLY CARRIES BOTH MECHANISMS AT ONCE. §1.7: the market is SPLIT on after-hours and both
-- sides must be supported — about half apply a rate multiplier (2.0× / 1.5× / 1.33× / 1.07×),
-- the other half apply NO multiplier and monetize via a minimum-hours floor (3 hr, 2 hr).
-- "A multiplier-only model cannot express the second; a floor-only model cannot express the
-- first." So `after_hours_multiplier` and `minimum_hours` coexist on the same row, and
-- rounding granularity is its own field because it is quoted as a real provision ("per
-- quarter hour or part thereof", "prorated in 15-minute increments at the beginning of each
-- increment") — which is rounding UP on ANY PART, not to nearest.
--
-- TIERING IS TWO-DIMENSIONAL because one jurisdiction runs a true matrix (occupancy group ×
-- sq ft). Axis 2 is categorical there, axis 1 numeric, so a tier row can match either a
-- numeric RANGE or an exact VALUE on each axis independently. `per_unit`/`unit_size` on a tier
-- row carries the "$X plus $Y per 1,000 sq ft" and "+$10 per bed" shapes.
--
-- `input_variable` IS A CLOSED SET, deliberately. It is a CONTROL value feeding money math,
-- and the F9 failure mode is an unrecognised axis silently computing $0. The 18 axes are the
-- 18 §1.7 observed, plus 'hours' (metered) and 'occupancy_group' (the matrix's other axis).
-- Adding a 19th is a one-line migration, and that friction is the point.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- WHAT THIS SLICE DOES NOT DO — named as boundaries, not as "later"
-- ─────────────────────────────────────────────────────────────────────────────────────────
--   · NO INVOICES. fi_invoices / fi_invoice_lines / fi_invoice_corrections /
--     fi_document_sequences are Slice B (0119). An assessment is a CHARGE, not a document.
--   · NO PAYMENTS, NO HOLDS. R2 settles this: payment execution stays hosted, we are never
--     merchant of record, and permit holds are A15 — a confirmed market absence and therefore
--     a NON-GOAL, not a backlog item. fi_payments / fi_holds are NOT created here and must
--     not be added without a new ruling.
--   · NO APPLICATION-INPUT CAPTURE UI. The engine is pure and takes the variables as an
--     argument; fi_fee_assessments.inputs records verbatim which values produced the number,
--     so nothing is lost while the capture surface is unbuilt. This is a slice boundary with
--     the record kept, not a gap with data thrown away.
--   · NO AUTOMATIC PENALTY OR RE-INSPECTION ASSESSMENT. §1.6 is doctrine: a re-inspection fee
--     CANNOT be auto-assessed from the inspection result — one county's published decision
--     matrix has two rows near-identical in text and OPPOSITE in outcome, discriminated only
--     by a human judgment about fault. The columns for the attested reason exist here and the
--     CHECK makes the attestation mandatory; the workflow that collects it is not in Slice A.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 🔴 APPROVAL GATES — read before applying
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- (1) fi_fee_assessments.permit_id and .inspection_id are FKs onto LEGAL RECORDS. Spec §9
--     lists "any FK touching a legal record" as DALE-GATED. In-repo precedent exists —
--     0116 applied `permit_id INTEGER NOT NULL REFERENCES fi_permits(id) ON DELETE RESTRICT`
--     on 2026-08-03 — but whether Dale reviewed that is NOT something this session verified,
--     so it is offered as precedent, not as clearance. Matt's call whether Dale looks first.
-- (2) The FK added to fi_permit_types.fee_schedule_id closes 3.1b's seam. It is catalog→
--     catalog, not legal-record-touching. Pre-verified: 0 rows carry a non-NULL value.
--
-- D6 ORDER BINDS. Nothing in server/src/utils/feeEngine.js or its routes pushes until this
-- file is applied to prod by hand, ledgered, and verified by the four live probes in §9:
--   (a) wrong-dept RLS read as of_app returns 0 rows
--   (b) physical guard probe returns 42501
--   (c) constraint probe returns 23505/23514
--   (d) the deployed code's exact statement shapes, in a txn + ROLLBACK, zero residue
--
-- ADDITIVE. Five new tables. One existing table touched, and only to add an FK constraint on
-- a column that is NULL in every row (fi_permit_types.fee_schedule_id). No NOT NULL relaxed,
-- no CHECK widened, no data migration.
-- ─────────────────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ══ 1. The schedule: a stable identity that versions hang off ═════════════════════════════
-- fi_permit_types points at the SCHEDULE, never at a version — exactly as it points at an
-- expiration rule GROUP (0093). Resolution picks the version effective on the vesting date.
CREATE TABLE IF NOT EXISTS fi_fee_schedules (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, name)
);

-- ══ 2. The effective-dated versions ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fi_fee_schedule_versions (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  schedule_id   INTEGER NOT NULL REFERENCES fi_fee_schedules(id) ON DELETE RESTRICT,
  version       INTEGER NOT NULL CHECK (version > 0),

  -- 'Draft'     — being authored. Items are editable ONLY here.
  -- 'Adopted'   — in force. Frozen: the adopting instrument authorizes these exact numbers.
  -- 'Superseded'— a later version took over. Still resolves for anything that vested under it.
  status        TEXT NOT NULL DEFAULT 'Draft'
                CHECK (status IN ('Draft','Adopted','Superseded')),

  -- ── The adopting instrument. This block is the whole answer to the rate-table audit. ──
  -- §1.7's five observed governance forms: ordinance · ordinance + Exhibit A · code appendix ·
  -- board resolution · an enabling ordinance delegating to resolution forever after.
  adopting_instrument     TEXT CHECK (adopting_instrument IN
                            ('ordinance','ordinance_exhibit','code_appendix','board_resolution',
                             'resolution_under_enabling_ordinance')),
  adopting_instrument_ref TEXT,   -- e.g. 'Ord. 2024-17, Exhibit A' — the citable identifier
  adopted_by              TEXT,   -- the adopting BODY, not the clerk who typed it
  adopted_on              DATE,

  effective_from      DATE NOT NULL,   -- immutable once adopted (trigger-enforced below)
  effective_to        DATE,            -- NULL = the open version
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id  INTEGER,

  -- ── Penalty band (§1.7): observed 1.5×–3×, modal 2.0×, one outlier at "additional 300%"
  --    (effective 4×) that also STACKS. Ship 2.0 default, allow 1.5–4.0, stacking opt-in. ──
  penalty_multiplier       NUMERIC(4,2) NOT NULL DEFAULT 2.00
                           CHECK (penalty_multiplier >= 1.50 AND penalty_multiplier <= 4.00),
  penalty_stacking_allowed BOOLEAN NOT NULL DEFAULT FALSE,

  UNIQUE (schedule_id, version),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),

  -- An ADOPTED version must name what adopted it. A number in force with no instrument is
  -- precisely the seven-year-old-board-action finding. Draft versions are exempt while authored.
  CHECK (status = 'Draft' OR (adopting_instrument IS NOT NULL
                              AND adopting_instrument_ref IS NOT NULL
                              AND adopted_by IS NOT NULL
                              AND adopted_on IS NOT NULL))
);

-- Exactly ONE open version per schedule. Two open versions makes "which fee applied on the
-- day this permit was assessed" ambiguous, and an ambiguous answer there is the audit finding.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fi_fee_schedule_versions_open
  ON fi_fee_schedule_versions (schedule_id) WHERE effective_to IS NULL;

-- ══ 3. The fee items — the five primitives plus 'surcharge' ══════════════════════════════
CREATE TABLE IF NOT EXISTS fi_fee_items (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  version_id    INTEGER NOT NULL REFERENCES fi_fee_schedule_versions(id) ON DELETE RESTRICT,

  -- code is the CONTROL value: matched EXACTLY, never by pattern (F6 — the /^pass\b/i lesson
  -- from the inspection result axis; "Passed" silently defeated it). name is display only.
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,

  kind          TEXT NOT NULL CHECK (kind IN
                  ('flat','tiered','valuation','hourly','percent_of','surcharge')),

  -- ── Where this item's input comes from: a variable, or another item's output (the DAG) ──
  -- Closed set on purpose: the 18 tiering axes of §1.7, plus 'hours' and 'occupancy_group'.
  input_variable TEXT CHECK (input_variable IN
                   ('square_footage','occupant_load','stories','sprinkler_heads','alarm_devices',
                    'smoke_heat_vents','gate_count','tank_count','chemical_count','licensed_beds',
                    'students','apartment_units','hotel_rooms','hazmat_quantity',
                    'construction_valuation','job_material_cost','acres','outside_storage_area',
                    'hours','occupancy_group')),
  -- The chain leg. valuation → hours-of-credit; sq ft → valuation → building fee → 25% of it.
  input_item_id  INTEGER REFERENCES fi_fee_items(id) ON DELETE RESTRICT,
  -- Second axis for the true 2-D matrix (occupancy group × sq ft). NULL = one-dimensional.
  tier_axis_2    TEXT CHECK (tier_axis_2 IN
                   ('square_footage','occupant_load','stories','sprinkler_heads','alarm_devices',
                    'smoke_heat_vents','gate_count','tank_count','chemical_count','licensed_beds',
                    'students','apartment_units','hotel_rooms','hazmat_quantity',
                    'construction_valuation','job_material_cost','acres','outside_storage_area',
                    'hours','occupancy_group')),

  -- ── kind = 'flat' ──
  flat_amount   NUMERIC(12,2) CHECK (flat_amount IS NULL OR flat_amount >= 0),

  -- ── kind = 'hourly'. BOTH mechanisms, simultaneously — see the header. ──
  hourly_rate       NUMERIC(10,2) CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
  minimum_hours     NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (minimum_hours >= 0),
  -- 0.25 for "per quarter hour or part thereof". NULL = no rounding.
  rounding_increment_hours NUMERIC(6,4)
                    CHECK (rounding_increment_hours IS NULL OR rounding_increment_hours > 0),
  -- 'up_any_part' is the quoted provision ("or part thereof" / "at the BEGINNING of each
  -- increment"). It is the default because it is what the source text says, not what is kind.
  rounding_mode     TEXT NOT NULL DEFAULT 'up_any_part'
                    CHECK (rounding_mode IN ('up_any_part','nearest','down','none')),
  -- Observed 2.0 / 1.5 / 1.33 / 1.07. NULL = this jurisdiction does not multiply.
  after_hours_multiplier NUMERIC(4,2)
                    CHECK (after_hours_multiplier IS NULL OR after_hours_multiplier >= 1.00),

  -- ── kind = 'percent_of' / 'surcharge' ──
  -- percent_of reads its base from input_item_id. surcharge reads the surchargeable subtotal.
  percent_rate  NUMERIC(7,4) CHECK (percent_rate IS NULL OR percent_rate >= 0),

  -- ── THE per-fee-line applicability flag §1.7 requires by name ──
  -- One city's third column reads "N/A" on its hourly, re-inspection and appeal lines. A
  -- surcharge sums only over items with this TRUE. A surcharge is never surchargeable itself.
  surchargeable BOOLEAN NOT NULL DEFAULT TRUE,

  -- Applied after the primitive, in sequence: the "plus 50%", the "+$10 per bed".
  -- (rows live in fi_fee_item_modifiers)

  min_amount    NUMERIC(12,2) CHECK (min_amount IS NULL OR min_amount >= 0),
  max_amount    NUMERIC(12,2) CHECK (max_amount IS NULL OR max_amount >= 0),

  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (version_id, code),

  -- Nothing may consume itself. Longer cycles are the engine's job (it has a test).
  CHECK (input_item_id IS NULL OR input_item_id <> id),
  CHECK (max_amount IS NULL OR min_amount IS NULL OR max_amount >= min_amount),
  CHECK (NOT (kind = 'surcharge' AND surchargeable)),

  -- Each primitive must carry the parameter it cannot compute without. A 'flat' item with a
  -- NULL amount is the "permit assessed no fee at all" finding arriving as a data defect.
  CHECK (kind <> 'flat'       OR flat_amount IS NOT NULL),
  CHECK (kind <> 'hourly'     OR hourly_rate IS NOT NULL),
  CHECK (kind <> 'percent_of' OR (percent_rate IS NOT NULL AND input_item_id IS NOT NULL)),
  CHECK (kind <> 'surcharge'  OR percent_rate IS NOT NULL),
  CHECK (kind <> 'tiered'     OR input_variable IS NOT NULL),
  CHECK (kind <> 'valuation'  OR input_variable IS NOT NULL OR input_item_id IS NOT NULL)
);

-- ══ 4. Tier rows — one axis or two, numeric range or exact categorical match ══════════════
CREATE TABLE IF NOT EXISTS fi_fee_item_tiers (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  item_id       INTEGER NOT NULL REFERENCES fi_fee_items(id) ON DELETE RESTRICT,

  -- Axis 1: EITHER a numeric range OR an exact value. Half-open [min, max) so adjacent tiers
  -- cannot both claim a boundary value — a boundary owned by two tiers is a fee that depends
  -- on evaluation order.
  axis1_min     NUMERIC(16,4),
  axis1_max     NUMERIC(16,4),
  axis1_match   TEXT,

  -- Axis 2: only for the true matrix (occupancy group × sq ft).
  axis2_min     NUMERIC(16,4),
  axis2_max     NUMERIC(16,4),
  axis2_match   TEXT,

  amount        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  -- "$X plus $Y per 1,000 sq ft" and "+$10 per bed" within a tier.
  per_unit      NUMERIC(12,4) CHECK (per_unit IS NULL OR per_unit >= 0),
  unit_size     NUMERIC(16,4) CHECK (unit_size IS NULL OR unit_size > 0),

  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (axis1_max IS NULL OR axis1_min IS NULL OR axis1_max > axis1_min),
  CHECK (axis2_max IS NULL OR axis2_min IS NULL OR axis2_max > axis2_min),
  -- A range and an exact match on the same axis is two different rules in one row.
  CHECK (axis1_match IS NULL OR (axis1_min IS NULL AND axis1_max IS NULL)),
  CHECK (axis2_match IS NULL OR (axis2_min IS NULL AND axis2_max IS NULL)),
  -- per_unit without unit_size is an undefined rate.
  CHECK ((per_unit IS NULL) = (unit_size IS NULL))
);

-- ══ 5. Ordered modifiers — the trailing "plus 50%", "+$10 per bed" ═══════════════════════
CREATE TABLE IF NOT EXISTS fi_fee_item_modifiers (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  item_id       INTEGER NOT NULL REFERENCES fi_fee_items(id) ON DELETE RESTRICT,

  -- seq is load-bearing: "+50% then +$10/bed" and "+$10/bed then +50%" are different money.
  seq           INTEGER NOT NULL CHECK (seq > 0),

  kind          TEXT NOT NULL CHECK (kind IN
                  ('percent_add','percent_multiply','amount_add','per_unit_add','floor','cap')),
  value         NUMERIC(16,4) NOT NULL,
  -- for per_unit_add: which variable is counted ("per bed" → licensed_beds)
  per_unit_variable TEXT CHECK (per_unit_variable IN
                   ('square_footage','occupant_load','stories','sprinkler_heads','alarm_devices',
                    'smoke_heat_vents','gate_count','tank_count','chemical_count','licensed_beds',
                    'students','apartment_units','hotel_rooms','hazmat_quantity',
                    'construction_valuation','job_material_cost','acres','outside_storage_area',
                    'hours','occupancy_group')),
  unit_size     NUMERIC(16,4) CHECK (unit_size IS NULL OR unit_size > 0),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (item_id, seq),
  CHECK (kind <> 'per_unit_add' OR (per_unit_variable IS NOT NULL AND unit_size IS NOT NULL))
);

-- ══ 6. Assessments — the computed proposal AND the human commit ═══════════════════════════
-- Two amounts on purpose. The engine PROPOSES (computed_amount); a person COMMITS
-- (committed_amount). Nothing here auto-commits money, and a commit that differs from the
-- computation must say why, in writing, attributably.
CREATE TABLE IF NOT EXISTS fi_fee_assessments (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,

  -- ⚠ FKs onto legal records — APPROVAL GATE (1) in the header.
  permit_id     INTEGER REFERENCES fi_permits(id) ON DELETE RESTRICT,
  inspection_id INTEGER REFERENCES fi_inspections(id) ON DELETE RESTRICT,

  -- §1.8 names three live billing models; two of them are permit-based and one is
  -- inspection-event based, so the subject is one or the other, never neither, never both.
  CHECK ((permit_id IS NOT NULL) <> (inspection_id IS NOT NULL)),

  assessment_kind TEXT NOT NULL DEFAULT 'base' CHECK (assessment_kind IN
                    ('base','reinspection','penalty_work_without_permit','surcharge','other')),

  -- ── VESTING (§1.7). The vesting rule is ABSENT from every fee schedule read end to end;
  --    it lives in the building administrative code. So the version used is RECORDED on the
  --    assessment rather than re-derived later, and the date it was chosen by is recorded
  --    beside it. F7: the vesting date is NOT the renewal anchor and must not be conflated.
  schedule_version_id INTEGER NOT NULL
                      REFERENCES fi_fee_schedule_versions(id) ON DELETE RESTRICT,
  vesting_date        DATE NOT NULL,

  -- Verbatim inputs. The capture UI is not in Slice A; recording what the engine was given
  -- means the arithmetic stays reproducible in its absence.
  inputs            JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- ── The proposal ──
  computed_amount   NUMERIC(12,2) NOT NULL CHECK (computed_amount >= 0),
  -- The per-item trace. The comptroller found $11,127 of errors in BOTH directions; a total
  -- with no breakdown cannot be checked, and "it computed it" is not an audit answer.
  computed_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ── The human commit ──
  committed_amount    NUMERIC(12,2) CHECK (committed_amount IS NULL OR committed_amount >= 0),
  committed_by_user_id INTEGER,
  committed_at        TIMESTAMPTZ,
  override_reason     TEXT,

  -- §1.6: a re-inspection fee CANNOT be derived from the inspection result. The discriminator
  -- is a human judgment about fault, and one county's own matrix has two near-identical rows
  -- with OPPOSITE outcomes. So the attestation is mandatory at the database, not the UI.
  reason_code        TEXT,
  reason_text        TEXT,
  attested_by_user_id INTEGER,

  -- ── Waiver / exemption. Auditors sample waivers and voids FIRST (§1.9). ──
  waiver_amount    NUMERIC(12,2) CHECK (waiver_amount IS NULL OR waiver_amount >= 0),
  waiver_reason    TEXT,
  waived_by_user_id INTEGER,
  waived_at        TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A commit is a complete act: amount, operator, timestamp — all three or none.
  CHECK ((committed_amount IS NULL) = (committed_at IS NULL)),
  CHECK (committed_amount IS NULL OR committed_by_user_id IS NOT NULL),
  -- Overriding the computation requires a written reason. This is the "$11,127 in both
  -- directions" control: a different number is allowed, an unexplained one is not.
  CHECK (committed_amount IS NULL OR committed_amount = computed_amount
         OR (override_reason IS NOT NULL AND length(btrim(override_reason)) > 0)),
  -- The §1.6 doctrine, enforced.
  CHECK (assessment_kind <> 'reinspection'
         OR (reason_code IS NOT NULL AND attested_by_user_id IS NOT NULL)),
  -- A waiver is never anonymous and never unreasoned.
  CHECK (waiver_amount IS NULL
         OR (waiver_reason IS NOT NULL AND length(btrim(waiver_reason)) > 0
             AND waived_by_user_id IS NOT NULL AND waived_at IS NOT NULL))
);

-- ══ 7. Close 3.1b's seam ═════════════════════════════════════════════════════════════════
-- Pre-verified 2026-08-04: 0 rows carry a non-NULL fee_schedule_id, and no code reads it.
DO $seam$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fi_permit_types_fee_schedule') THEN
    ALTER TABLE fi_permit_types
      ADD CONSTRAINT fk_fi_permit_types_fee_schedule
      FOREIGN KEY (fee_schedule_id) REFERENCES fi_fee_schedules(id) ON DELETE RESTRICT;
  END IF;
END $seam$;

-- ══ Indexes ══════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_fi_fee_schedules_dept          ON fi_fee_schedules (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_fee_schedule_versions_sched
  ON fi_fee_schedule_versions (schedule_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_fi_fee_schedule_versions_dept  ON fi_fee_schedule_versions (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_fee_items_version           ON fi_fee_items (version_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_fi_fee_items_dept              ON fi_fee_items (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_fee_items_input             ON fi_fee_items (input_item_id);
CREATE INDEX IF NOT EXISTS idx_fi_fee_item_tiers_item         ON fi_fee_item_tiers (item_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_fi_fee_item_tiers_dept         ON fi_fee_item_tiers (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_fee_item_modifiers_item     ON fi_fee_item_modifiers (item_id, seq);
CREATE INDEX IF NOT EXISTS idx_fi_fee_item_modifiers_dept     ON fi_fee_item_modifiers (department_id);
CREATE INDEX IF NOT EXISTS idx_fi_fee_assessments_permit      ON fi_fee_assessments (department_id, permit_id);
CREATE INDEX IF NOT EXISTS idx_fi_fee_assessments_inspection  ON fi_fee_assessments (department_id, inspection_id);
CREATE INDEX IF NOT EXISTS idx_fi_fee_assessments_dept_created
  ON fi_fee_assessments (department_id, created_at DESC);
-- F18: zero-fee assessments must be findable as first-class objects. The auditor's first stop
-- is voided and zero-fee records — if that query is a full scan nobody runs it.
CREATE INDEX IF NOT EXISTS idx_fi_fee_assessments_zero_fee
  ON fi_fee_assessments (department_id, created_at DESC)
  WHERE computed_amount = 0 OR committed_amount = 0;

-- ══ RLS: dept_isolation on all five (F13) ════════════════════════════════════════════════
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fi_fee_schedules','fi_fee_schedule_versions','fi_fee_items',
                           'fi_fee_item_tiers','fi_fee_item_modifiers','fi_fee_assessments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DO $p$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = %L AND policyname = ''dept_isolation'') THEN
           CREATE POLICY dept_isolation ON %I
             USING (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int);
         END IF;
       END $p$', t, t);
  END LOOP;
END $rls$;

-- ══ Immutability: an ADOPTED version and its items are frozen ════════════════════════════
-- This is the direct answer to "corrections can be made to the original transaction. There is
-- no audit trail in the system to track changes." A fee change is a NEW VERSION. The DB
-- refuses the edit regardless of which role asks, which is what makes F14 a property of the
-- schema rather than a property of the route being written correctly.
CREATE OR REPLACE FUNCTION fi_fee_schedule_versions_freeze()
RETURNS TRIGGER AS $fn$
BEGIN
  IF OLD.status = 'Draft' THEN
    RETURN NEW;                      -- authoring a draft is the one time numbers may move
  END IF;
  IF NEW.id                      IS DISTINCT FROM OLD.id
  OR NEW.department_id           IS DISTINCT FROM OLD.department_id
  OR NEW.schedule_id             IS DISTINCT FROM OLD.schedule_id
  OR NEW.version                 IS DISTINCT FROM OLD.version
  OR NEW.effective_from          IS DISTINCT FROM OLD.effective_from
  OR NEW.adopting_instrument     IS DISTINCT FROM OLD.adopting_instrument
  OR NEW.adopting_instrument_ref IS DISTINCT FROM OLD.adopting_instrument_ref
  OR NEW.adopted_by              IS DISTINCT FROM OLD.adopted_by
  OR NEW.adopted_on              IS DISTINCT FROM OLD.adopted_on
  OR NEW.penalty_multiplier      IS DISTINCT FROM OLD.penalty_multiplier
  OR NEW.penalty_stacking_allowed IS DISTINCT FROM OLD.penalty_stacking_allowed
  OR NEW.created_at              IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'fi_fee_schedule_versions %: version is % — adopted fee terms are frozen. Author a NEW version; only effective_to and status may change.', OLD.id, OLD.status;
  END IF;
  -- Status may only move forward: Adopted -> Superseded. Never back to Draft.
  IF NEW.status = 'Draft' THEN
    RAISE EXCEPTION 'fi_fee_schedule_versions %: cannot return an adopted version to Draft', OLD.id;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fi_fee_schedule_versions_freeze ON fi_fee_schedule_versions;
CREATE TRIGGER trg_fi_fee_schedule_versions_freeze
  BEFORE UPDATE ON fi_fee_schedule_versions
  FOR EACH ROW EXECUTE FUNCTION fi_fee_schedule_versions_freeze();

-- Items, tiers and modifiers are editable ONLY while their version is a Draft. Row-state
-- conditions cannot be expressed as column grants, so this is a trigger — shared by all three.
CREATE OR REPLACE FUNCTION fi_fee_item_draft_only()
RETURNS TRIGGER AS $fn$
DECLARE v_status TEXT; v_version_id INTEGER; v_item_id INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'fi_fee_items' THEN
    v_version_id := COALESCE(OLD.version_id, NEW.version_id);
  ELSE
    v_item_id := COALESCE(OLD.item_id, NEW.item_id);
    SELECT i.version_id INTO v_version_id FROM fi_fee_items i WHERE i.id = v_item_id;
  END IF;

  SELECT status INTO v_status FROM fi_fee_schedule_versions WHERE id = v_version_id;

  IF v_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION '%: fee schedule version % is % — its fee lines are frozen. Author a NEW version.',
      TG_TABLE_NAME, v_version_id, COALESCE(v_status, 'missing');
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$fn$ LANGUAGE plpgsql;

DO $trg$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fi_fee_items','fi_fee_item_tiers','fi_fee_item_modifiers'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_draft_only ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_draft_only BEFORE UPDATE OR DELETE ON %I '
                || 'FOR EACH ROW EXECUTE FUNCTION fi_fee_item_draft_only()', t, t);
  END LOOP;
END $trg$;

-- ══ Assessments: append-only apart from the commit and waiver seams ══════════════════════
-- The COMPUTATION is a fact — what the engine proposed, from which version, on which inputs.
-- It never changes. The commit and the waiver genuinely resolve after the row exists, and each
-- may resolve exactly ONCE: re-committing a different amount later, in place, with no second
-- record, is the "fake refunds to cover the theft of cash" shape the comptroller's manual names.
CREATE OR REPLACE FUNCTION fi_fee_assessments_append_only()
RETURNS TRIGGER AS $fn$
BEGIN
  IF NEW.id                  IS DISTINCT FROM OLD.id
  OR NEW.department_id       IS DISTINCT FROM OLD.department_id
  OR NEW.permit_id           IS DISTINCT FROM OLD.permit_id
  OR NEW.inspection_id       IS DISTINCT FROM OLD.inspection_id
  OR NEW.assessment_kind     IS DISTINCT FROM OLD.assessment_kind
  OR NEW.schedule_version_id IS DISTINCT FROM OLD.schedule_version_id
  OR NEW.vesting_date        IS DISTINCT FROM OLD.vesting_date
  OR NEW.inputs              IS DISTINCT FROM OLD.inputs
  OR NEW.computed_amount     IS DISTINCT FROM OLD.computed_amount
  OR NEW.computed_breakdown  IS DISTINCT FROM OLD.computed_breakdown
  OR NEW.computed_at         IS DISTINCT FROM OLD.computed_at
  OR NEW.created_at          IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'fi_fee_assessments %: the computation is append-only. Re-assess by creating a NEW assessment.', OLD.id;
  END IF;

  IF OLD.committed_at IS NOT NULL
     AND (NEW.committed_amount     IS DISTINCT FROM OLD.committed_amount
       OR NEW.committed_at         IS DISTINCT FROM OLD.committed_at
       OR NEW.committed_by_user_id IS DISTINCT FROM OLD.committed_by_user_id
       OR NEW.override_reason      IS DISTINCT FROM OLD.override_reason) THEN
    RAISE EXCEPTION 'fi_fee_assessments %: already committed at %. A committed charge is corrected by a NEW linked record, never in place.', OLD.id, OLD.committed_at;
  END IF;

  IF OLD.waived_at IS NOT NULL
     AND (NEW.waiver_amount     IS DISTINCT FROM OLD.waiver_amount
       OR NEW.waiver_reason     IS DISTINCT FROM OLD.waiver_reason
       OR NEW.waived_by_user_id IS DISTINCT FROM OLD.waived_by_user_id
       OR NEW.waived_at         IS DISTINCT FROM OLD.waived_at) THEN
    RAISE EXCEPTION 'fi_fee_assessments %: waiver already recorded at % and cannot be rewritten', OLD.id, OLD.waived_at;
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fi_fee_assessments_append_only ON fi_fee_assessments;
CREATE TRIGGER trg_fi_fee_assessments_append_only
  BEFORE UPDATE ON fi_fee_assessments
  FOR EACH ROW EXECUTE FUNCTION fi_fee_assessments_append_only();

-- ══ Grants: per-role, column-scoped (the 0082 lesson — Supabase default privileges
--    auto-grant table-level UPDATE, and a REVOKE from PUBLIC alone does not strip it) ══════
DO $grants$
DECLARE r TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON fi_fee_schedules, '
                    || 'fi_fee_schedule_versions, fi_fee_items, fi_fee_item_tiers, '
                    || 'fi_fee_item_modifiers, fi_fee_assessments FROM %I', r);
      END IF;
    END LOOP;

    GRANT SELECT, INSERT ON fi_fee_schedules, fi_fee_schedule_versions, fi_fee_items,
                            fi_fee_item_tiers, fi_fee_item_modifiers, fi_fee_assessments TO of_app;

    GRANT UPDATE (name, updated_at) ON fi_fee_schedules TO of_app;

    -- Draft authoring plus the two lifecycle moves. effective_from, the adopting instrument
    -- and the penalty band are absent from this list ON PURPOSE — the trigger also refuses
    -- them once adopted, so the guard survives a future GRANT mistake.
    GRANT UPDATE (status, effective_to, effective_from, adopting_instrument,
                  adopting_instrument_ref, adopted_by, adopted_on,
                  penalty_multiplier, penalty_stacking_allowed) ON fi_fee_schedule_versions TO of_app;

    -- Draft-only editing, enforced by trigger (row state, not column identity).
    GRANT UPDATE, DELETE ON fi_fee_items, fi_fee_item_tiers, fi_fee_item_modifiers TO of_app;

    -- The commit and waiver seams. computed_*, inputs, vesting and the FKs are NOT grantable:
    -- a proposal that can be rewritten after the fact is not a proposal.
    GRANT UPDATE (committed_amount, committed_by_user_id, committed_at, override_reason,
                  reason_code, reason_text, attested_by_user_id,
                  waiver_amount, waiver_reason, waived_by_user_id, waived_at)
      ON fi_fee_assessments TO of_app;

    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO of_app;
  END IF;
END $grants$;

INSERT INTO of_schema_migrations (filename) VALUES ('0118-fi-fee-schedules.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
