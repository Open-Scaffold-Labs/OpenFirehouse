-- 0125-fi-invoices.sql
--
-- Phase 3, module 3.2 (Slice B) — the invoice ledger: numbering, lines, void, adjustment,
-- dunning stamps, and a gap report.
-- Spec: docs/PHASE3-PERMITS-FEES-SPEC-2026-07-26.md
--       §1.8 (the bar, immutability, numbering) · §1.9 (the audits this is the negative image of)
--       §4 (records classification) · §5 (inherited doctrine) · §7 (module 3.2)
--       §8 F5/F10/F11/F12/F13/F14/F17/F18 · §10 R1 (market bar IS the spec) · R2 (money boundary)
--
-- Claimed by stub 2026-08-04, pushed as df6ae6a BEFORE any SQL was written (F4 rule; four
-- number collisions to date). Head verified 0124 TWO ways at claim time: listing
-- docs/migrations/ AND a live query of the prod of_schema_migrations ledger (0124 applied
-- 2026-08-04 20:49:41+00). Never from a doc — that headline has gone stale four times.
-- Note: spec §9's block "0090-0099" is STALE; so is 0118's note that the head was 0117.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DELIBERATELY DOES NOT CREATE — and the one open ruling
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- NO `fi_payments`. NO `fi_holds`. NO late-fee engine. NO AR aging buckets. NO account
-- statements. NO credit memos as distinct numbered documents. NO write-offs.
--
-- Most of those are CONFIRMED MARKET ABSENCES and therefore NON-GOALS under R1's ceiling
-- (§10 R2 OUT-list: A1 general ledger · A10 statements · A11 credit memos · A12 write-offs ·
-- A13 aging · A14 dunning ENGINE · A15 holds · A8 automatic lien filing · merchant of record).
--
-- 🟡 ONE IS DIFFERENT AND IS FLAGGED FOR MATT RATHER THAN DECIDED HERE. R2's IN-list contains
--    "partial payments, overpayments, refunds" as parity, and §4 classifies "Payment recorded"
--    as MONEY with the state-auditor field set (payor · amount · MODE · purpose · PREPARER ·
--    date) — but conditions it on "if §10 Q4 = yes". The 2026-08-04 handoff reports Q4 as
--    ruled = R2 and concludes `fi_payments` "must not be added without a new ruling", giving
--    the reason as "permit holds are a confirmed market absence" — which is the reason for
--    A15/`fi_holds`, not for a payment ledger. The two got conflated in one sentence.
--    So: recording money RECEIVED is not built here, and no `paid_amount` column is added
--    either — a column no route writes and no gate reads is dead weight, which is the exact
--    "guard whose remedy did not exist" class this repo shipped and reverted on 2026-08-04
--    (9abbdd9). The consequence is stated plainly rather than papered over:
--      → R3 issuance gate #1 ("fee paid in full") HAS NO DATA SOURCE UNTIL THIS IS RULED.
--    This slice is coherent without it: R2 says we own the CHARGE, and the charge side is
--    complete. The dunning stamps need no payment data either — they record an act the
--    department PERFORMED ("second notice sent on this date"), which is precisely why the
--    observed model is stamps and not an engine ("Stamps yes, engine no", R2 verbatim).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- WHY THE SHAPE IS THIS SHAPE — the published audit findings, mapped to decisions
-- ═════════════════════════════════════════════════════════════════════════════════════════
--   FINDING (2018 municipal audit of a fire marshal's office)     → DECISION HERE
--   "not pre-numbered, difficult to identify gaps"                → fi_invoice_sequences +
--                                                                   fi_invoice_number_gaps.
--                                                                   0118's header promised this
--                                                                   table for Slice B; this is it.
--                                                                   (Named fi_invoice_sequences,
--                                                                   not fi_document_sequences:
--                                                                   it allocates ONE document
--                                                                   kind and a generic name would
--                                                                   invite permit numbers into a
--                                                                   counter with different rules.)
--   "corrections can be made to the original transaction"         → an issued invoice is
--   "There is no audit trail in the system to track changes"        PHYSICALLY append-only; a
--                                                                   correction is a NEW linked
--                                                                   `adjustment` invoice
--   "Inspectors had access rights to change fees in the system"   → F14: requireInspector may
--                                                                   READ; only
--                                                                   requirePreventionAdmin may
--                                                                   issue / void / adjust / stamp
--
--   STATE COMPTROLLER'S INTERNAL-CONTROL MANUAL                   → DECISION HERE
--   "a serially press-numbered duplicate receipt form"            → (dept, FY, sequence) UNIQUE,
--                                                                   monotonic, never reused
--   "any gaps or missing receipt forms should be INVESTIGATED"    → the gap VIEW. Note the verb:
--                                                                   investigated, not prohibited
--   "Both copies of voided receipts should also be retained"      → void CONSUMES AND RETAINS its
--                                                                   number; the row and every
--                                                                   original amount survive
--                                                                   unchanged forever
--   "approve all billing adjustments, write-offs and refunds      → void and adjustment both
--    PRIOR to such adjustments being made" · "The reasons for       require reason_code +
--    all adjustments should be documented and retained"             reason_text + operator +
--    (rationale names the fraud: "fake refunds to cover the         approving_authority, all
--    theft of cash")                                                CHECK-enforced, not optional
--
--   STATE AUDITOR'S ACCOUNTING MANUAL (binding on software,       → DECISION HERE
--   "manual OR automated")
--   "If a receipt is voided, the original and any copies of that  → REVOKE UPDATE/DELETE at the
--    receipt must be retained"                                      grant level, then re-grant
--   "software that maintains a proper audit trail of voided or      UPDATE on the void + dunning
--    cancelled receipts"                                            columns ONLY
--
-- ⚠ GAPLESSNESS IS NOT A US LEGAL REQUIREMENT AND OVERCLAIMING IT IS ITS OWN ERROR (§1.8).
--   Pre-numbered sequential documents ARE a required internal control; gaplessness itself is
--   statutory under EU VAT and several other e-invoicing regimes, which is where the
--   misconception comes from. What is required: every number accounted for INCLUDING voids,
--   and gaps investigable. So the allocator is a counter row taken with a row lock in the same
--   statement as the insert — NOT a Postgres SEQUENCE, which gaps on every rolled-back
--   transaction and would manufacture gaps the report then asks a human to investigate for
--   nothing. Per-fiscal-year resets are a common convention; §1.8 records the requirement as
--   UNVERIFIED, so fiscal_year_start_month is per-department CONFIG defaulting to the calendar
--   year, which is a configuration choice and is not a claim about the law.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- ADDITIVE. Three new tables, one new view, two new columns on fi_settings (both with
-- defaults, so no existing row breaks). No NOT NULL relaxed, no CHECK widened, no data
-- migration, nothing dropped. F13 (destructive needs Matt's explicit sign-off) not engaged.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Four live prod probes required before dependent code pushes (spec §9):
--   (a) wrong-dept RLS read AND write as of_app returns 0 rows / is refused
--   (b) physical guard probe returns 42501 on UPDATE and DELETE of an issued invoice
--   (c) constraint probe returns 23505 (duplicate number) / 23514 (sum identity, unreasoned void)
--   (d) the deployed code's exact statement shapes, in a txn + ROLLBACK, zero residue
-- ─────────────────────────────────────────────────────────────────────────────────────────

-- ══ 1. Per-department invoicing config ═══════════════════════════════════════════════════
-- fi_settings is the existing per-department prevention config (PK department_id).
ALTER TABLE fi_settings
  ADD COLUMN IF NOT EXISTS invoice_number_prefix TEXT NOT NULL DEFAULT '';

ALTER TABLE fi_settings
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month SMALLINT NOT NULL DEFAULT 1;

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_settings_fy_start_month_ck') THEN
    ALTER TABLE fi_settings ADD CONSTRAINT fi_settings_fy_start_month_ck
      CHECK (fiscal_year_start_month BETWEEN 1 AND 12);
  END IF;
  -- The prefix is the DEPT segment of FY-DEPT-NNNNNN. It goes INTO a document number that is
  -- retained forever, so it is constrained to characters that cannot break a number's parse:
  -- no whitespace, no hyphen (the field separator), no lowercase ambiguity.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_settings_invoice_prefix_ck') THEN
    ALTER TABLE fi_settings ADD CONSTRAINT fi_settings_invoice_prefix_ck
      CHECK (invoice_number_prefix ~ '^[A-Z0-9]{0,12}$');
  END IF;
END $c$;

-- ══ 2. The number allocator ══════════════════════════════════════════════════════════════
-- One counter row per (department, fiscal year). This is a COUNTER, not a record: it is the
-- one table here that is legitimately mutable, and it is the reason the ledger can be fully
-- immutable. Allocation and insertion happen in ONE statement (see routes/fiInvoices.js), so
-- a rolled-back mint returns the number rather than burning it.
CREATE TABLE IF NOT EXISTS fi_invoice_sequences (
  department_id INTEGER NOT NULL,
  fiscal_year   INTEGER NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 9999),

  -- FROZEN AT FIRST ALLOCATION for this (dept, FY), copied from fi_settings at that moment.
  -- Deliberately denormalised: a department that changes its prefix must not retroactively
  -- change the meaning of numbers already issued under the old one. The number a payer holds
  -- and the number in our ledger have to stay the same string.
  --
  -- NON-EMPTY, unlike fi_settings.invoice_number_prefix which defaults to ''. That default
  -- means "not yet configured"; letting it through to here would mint FY2026--000001, with a
  -- hole where the department should be, onto a document retained forever. The route refuses
  -- to issue until a prefix is configured; this CHECK makes that refusal unbypassable.
  prefix        TEXT NOT NULL CHECK (prefix ~ '^[A-Z0-9]{1,12}$'),

  last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (department_id, fiscal_year)
);

-- ══ 3. The invoice ledger ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fi_invoices (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,

  -- ── Identity. The full document number is stored VERBATIM as the string the payer sees,
  --    alongside its parts, because the parts are what the gap report reasons over and the
  --    string is what appears on paper. Both, on purpose.
  invoice_number  TEXT    NOT NULL CHECK (invoice_number ~ '^FY[0-9]{4}-[A-Z0-9]{1,12}-[0-9]{6,}$'),
  fiscal_year     INTEGER NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 9999),
  sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),

  status       TEXT NOT NULL DEFAULT 'Issued' CHECK (status IN ('Issued', 'Void')),

  -- ── The correction model (§1.8). The standards mandate NEITHER void+reissue NOR credit
  --    memo; they mandate that the original is retained, the correction is a NEW pre-approved
  --    record, attributable and reasoned, and that it balances. An `adjustment` is that new
  --    record. It is NOT a credit memo as a distinct numbered document (A11, a confirmed
  --    market absence) — it is an invoice, drawn from the same sequence, that names its parent.
  invoice_kind TEXT NOT NULL DEFAULT 'original' CHECK (invoice_kind IN ('original', 'adjustment')),
  adjusts_invoice_id     INTEGER REFERENCES fi_invoices(id) ON DELETE RESTRICT,
  adjustment_reason_code TEXT,
  adjustment_reason_text TEXT,
  adjustment_approving_authority TEXT,

  -- ── Billed party, frozen at issue. A legal instrument names its addressee AS OF ISSUE; if
  --    this read through to a live property/permit row, reprinting a two-year-old invoice
  --    would silently address it to whoever owns the building today.
  bill_to_name    TEXT NOT NULL CHECK (length(btrim(bill_to_name)) > 0),
  bill_to_address TEXT,
  bill_to_email   TEXT,

  -- ── Money. NUMERIC, never REAL (§5.6). The category split is the published AR schema's own
  --    field set: invoice_amount · fee · penalty_amount · posting_fee · interest_amount.
  --    Every one of these is computed server-side from the LINES in the same statement that
  --    inserts them, so the header cannot disagree with its own detail.
  invoice_amount  NUMERIC(12,2) NOT NULL,
  fee_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  penalty_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  posting_fee     NUMERIC(12,2) NOT NULL DEFAULT 0,
  interest_amount NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- ── Dunning: DATE STAMPS, not an engine (R2, verbatim: "Stamps yes, engine no"). The
  --    observed field data model is exactly these columns on the invoice. A14 (a dunning
  --    ladder that escalates on its own) is a confirmed market absence and is a NON-GOAL.
  invoice_date        DATE NOT NULL,
  due_date            DATE,
  second_notice_date  DATE,
  final_notice_date   DATE,
  lien_date           DATE,
  sent_to_bureau_date DATE,

  -- ── Void: consume and retain (§1.8). The number stays spent; the row stays readable.
  void_reason_code TEXT,
  void_reason_text TEXT,
  void_approving_authority TEXT,
  voided_by_user_id INTEGER,
  voided_at        TIMESTAMPTZ,

  -- ── Attribution + replay defence
  issued_by_user_id INTEGER NOT NULL,
  -- F10: a replayed generation must not mint a second document. Client-minted, same contract
  -- as the fi-sync batch: a repeat is answered `duplicate` and `duplicate` counts as success.
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ── Numbering invariants ──
  CONSTRAINT fi_invoices_seq_unique    UNIQUE (department_id, fiscal_year, sequence_number),
  CONSTRAINT fi_invoices_number_unique UNIQUE (department_id, invoice_number),

  -- ── Structural invariants ──
  -- An adjustment names its parent; an original has none. Both directions, so neither an
  -- orphan adjustment nor a parented original can exist.
  CHECK ((invoice_kind = 'original') = (adjusts_invoice_id IS NULL)),
  -- An adjustment is never anonymous and never unreasoned. This is the comptroller's
  -- "reasons for all adjustments should be documented and retained", enforced.
  CHECK (invoice_kind = 'original' OR (
           adjustment_reason_code IS NOT NULL
           AND length(btrim(adjustment_reason_text)) > 0
           AND length(btrim(adjustment_approving_authority)) > 0)),
  -- The header equals the sum of its parts, always, in both directions.
  CHECK (invoice_amount = fee_amount + penalty_amount + posting_fee + interest_amount),
  -- An ORIGINAL invoice can never carry a negative figure. An ADJUSTMENT can — a net credit
  -- correcting an overcharge is the whole point of one, and forbidding it would force the
  -- correction back into an in-place edit, which is the thing being prevented.
  -- Zero is legal and stays first-class (see the partial index below): the auditor's first
  -- stop is zero-fee and voided records, so a $0 invoice must be a ROW, never an absence.
  CHECK (invoice_kind = 'adjustment' OR (
           invoice_amount >= 0 AND fee_amount >= 0 AND penalty_amount >= 0
           AND posting_fee >= 0 AND interest_amount >= 0)),
  -- Dunning stamps record acts performed AFTER the invoice existed. Ordering only — NOT
  -- presence. A CHECK requiring a second notice before a final one would be inventing a
  -- department's escalation policy, which is precisely the engine R2 rules out.
  CHECK (due_date            IS NULL OR due_date            >= invoice_date),
  CHECK (second_notice_date  IS NULL OR second_notice_date  >= invoice_date),
  CHECK (final_notice_date   IS NULL OR final_notice_date   >= invoice_date),
  CHECK (lien_date           IS NULL OR lien_date           >= invoice_date),
  CHECK (sent_to_bureau_date IS NULL OR sent_to_bureau_date >= invoice_date),
  -- Void is a complete act or no act: status and timestamp agree, and the paperwork is there.
  CHECK ((status = 'Void') = (voided_at IS NOT NULL)),
  CHECK (voided_at IS NULL OR (
           void_reason_code IS NOT NULL
           AND length(btrim(void_reason_text)) > 0
           AND length(btrim(void_approving_authority)) > 0
           AND voided_by_user_id IS NOT NULL)),
  -- An invoice cannot adjust itself.
  CHECK (adjusts_invoice_id IS NULL OR adjusts_invoice_id <> id)
);

-- ══ 4. Invoice lines ═════════════════════════════════════════════════════════════════════
-- Lines carry the subject. The header does NOT: §1.8 names three live billing models and one
-- of them is a CONSOLIDATED ANNUAL INVOICE spanning many permits, so a permit_id on the
-- header would be wrong for a third of the market.
CREATE TABLE IF NOT EXISTS fi_invoice_lines (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,
  invoice_id    INTEGER NOT NULL REFERENCES fi_invoices(id) ON DELETE RESTRICT,
  line_number   INTEGER NOT NULL CHECK (line_number >= 1),

  line_kind   TEXT NOT NULL CHECK (line_kind IN ('fee', 'penalty', 'posting_fee', 'interest')),
  description TEXT NOT NULL CHECK (length(btrim(description)) > 0),
  amount      NUMERIC(12,2) NOT NULL,

  -- ⚠ FKs onto legal records. RESTRICT, never CASCADE: deleting a permit must not silently
  --   delete the money record that cites it (the 0016 CASCADE→RESTRICT lesson).
  assessment_id INTEGER REFERENCES fi_fee_assessments(id) ON DELETE RESTRICT,
  permit_id     INTEGER REFERENCES fi_permits(id)         ON DELETE RESTRICT,
  inspection_id INTEGER REFERENCES fi_inspections(id)     ON DELETE RESTRICT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fi_invoice_lines_number_unique UNIQUE (invoice_id, line_number)
);

-- ══ 5. Indexes ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_fi_invoices_dept_created
  ON fi_invoices (department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fi_invoices_dept_fy_seq
  ON fi_invoices (department_id, fiscal_year, sequence_number);
CREATE INDEX IF NOT EXISTS idx_fi_invoices_adjusts
  ON fi_invoices (adjusts_invoice_id) WHERE adjusts_invoice_id IS NOT NULL;

-- F18, twice over: the auditor's first stop is zero-fee and voided records, so both get a
-- partial index rather than a full scan of the ledger.
CREATE INDEX IF NOT EXISTS idx_fi_invoices_zero_amount
  ON fi_invoices (department_id, created_at DESC) WHERE invoice_amount = 0;
CREATE INDEX IF NOT EXISTS idx_fi_invoices_voided
  ON fi_invoices (department_id, voided_at DESC) WHERE voided_at IS NOT NULL;

-- F10: the replay fence. Partial, because most invoices carry no key and NULLs would not
-- collide anyway — being explicit costs nothing and documents the intent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fi_invoices_idempotency
  ON fi_invoices (department_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fi_invoice_lines_invoice
  ON fi_invoice_lines (invoice_id, line_number);
CREATE INDEX IF NOT EXISTS idx_fi_invoice_lines_assessment
  ON fi_invoice_lines (department_id, assessment_id) WHERE assessment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fi_invoice_lines_permit
  ON fi_invoice_lines (department_id, permit_id) WHERE permit_id IS NOT NULL;

-- ══ 6. RLS: dept_isolation on all three (F13) ════════════════════════════════════════════
-- NOTE ON `WITH CHECK`: it is omitted deliberately, matching all 185 existing dept_isolation
-- policies. For a policy with no explicit WITH CHECK, Postgres reuses the USING expression to
-- validate new rows — VERIFIED EMPIRICALLY on prod 2026-08-04, not assumed from the docs: as
-- of_app with app.department_id=1, an INSERT naming department_id=3 into fi_fee_schedules was
-- refused with `42501 / new row violates row-level security policy`, while the identical
-- statement naming department_id=1 succeeded (the control that makes that result readable).
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fi_invoice_sequences', 'fi_invoices', 'fi_invoice_lines'] LOOP
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

-- ══ 7. Physical append-only ══════════════════════════════════════════════════════════════
-- Lines are frozen the instant they exist. There is no seam at all: a line that needs to
-- change is a correction, and a correction is a new adjustment invoice.
CREATE OR REPLACE FUNCTION fi_invoice_lines_append_only()
RETURNS TRIGGER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  -- CREATE OR REPLACE FUNCTION DISCARDS a SET search_path clause, so it is declared inline
  -- above rather than added by a later ALTER (the 0119 lesson: an ALTER-applied search_path
  -- is silently undone by the next db.js fresh install).
  RAISE EXCEPTION
    'fi_invoice_lines is append-only (attempted % on line %). An invoice line is part of an issued document; correct it with an adjustment invoice, never in place.',
    TG_OP, COALESCE(OLD.id, NEW.id);
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fi_invoice_lines_append_only ON fi_invoice_lines;
CREATE TRIGGER trg_fi_invoice_lines_append_only
  BEFORE UPDATE OR DELETE ON fi_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION fi_invoice_lines_append_only();

-- A line's sign is governed by its PARENT's kind, which is a cross-table rule and therefore
-- cannot be a CHECK. It lives in a trigger so it survives a route written wrongly later —
-- the same reasoning as 0118's draft_only trigger. Without this, the header CHECK forbidding
-- negatives on an original is defeated by a negative LINE plus a compensating positive one.
CREATE OR REPLACE FUNCTION fi_invoice_lines_sign_matches_parent()
RETURNS TRIGGER
SET search_path = pg_catalog, public
AS $fn$
DECLARE parent_kind TEXT; parent_dept INTEGER;
BEGIN
  SELECT invoice_kind, department_id INTO parent_kind, parent_dept
    FROM fi_invoices WHERE id = NEW.invoice_id;
  IF parent_kind IS NULL THEN
    RAISE EXCEPTION 'fi_invoice_lines: invoice % does not exist', NEW.invoice_id;
  END IF;
  -- A line must not be filed under a different tenant from its own header. RLS checks each
  -- row against the session's department; it does not check the two against EACH OTHER.
  IF parent_dept IS DISTINCT FROM NEW.department_id THEN
    RAISE EXCEPTION 'fi_invoice_lines: line department % does not match invoice % department %',
      NEW.department_id, NEW.invoice_id, parent_dept;
  END IF;
  IF parent_kind = 'original' AND NEW.amount < 0 THEN
    RAISE EXCEPTION 'fi_invoice_lines: a negative amount (%) is not permitted on an ORIGINAL invoice (%). A credit belongs on an adjustment invoice.',
      NEW.amount, NEW.invoice_id;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fi_invoice_lines_sign ON fi_invoice_lines;
CREATE TRIGGER trg_fi_invoice_lines_sign
  BEFORE INSERT ON fi_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION fi_invoice_lines_sign_matches_parent();

-- The invoice header has exactly two seams: the dunning stamps and the void. Everything that
-- constitutes the document — its number, its party, its money, who issued it, when — is frozen.
CREATE OR REPLACE FUNCTION fi_invoices_append_only()
RETURNS TRIGGER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'fi_invoices %: an issued invoice is never deleted. Void it — the number is consumed and the record is retained.',
      OLD.id;
  END IF;

  IF NEW.id                     IS DISTINCT FROM OLD.id
  OR NEW.department_id          IS DISTINCT FROM OLD.department_id
  OR NEW.invoice_number         IS DISTINCT FROM OLD.invoice_number
  OR NEW.fiscal_year            IS DISTINCT FROM OLD.fiscal_year
  OR NEW.sequence_number        IS DISTINCT FROM OLD.sequence_number
  OR NEW.invoice_kind           IS DISTINCT FROM OLD.invoice_kind
  OR NEW.adjusts_invoice_id     IS DISTINCT FROM OLD.adjusts_invoice_id
  OR NEW.adjustment_reason_code IS DISTINCT FROM OLD.adjustment_reason_code
  OR NEW.adjustment_reason_text IS DISTINCT FROM OLD.adjustment_reason_text
  OR NEW.adjustment_approving_authority IS DISTINCT FROM OLD.adjustment_approving_authority
  OR NEW.bill_to_name           IS DISTINCT FROM OLD.bill_to_name
  OR NEW.bill_to_address        IS DISTINCT FROM OLD.bill_to_address
  OR NEW.bill_to_email          IS DISTINCT FROM OLD.bill_to_email
  OR NEW.invoice_amount         IS DISTINCT FROM OLD.invoice_amount
  OR NEW.fee_amount             IS DISTINCT FROM OLD.fee_amount
  OR NEW.penalty_amount         IS DISTINCT FROM OLD.penalty_amount
  OR NEW.posting_fee            IS DISTINCT FROM OLD.posting_fee
  OR NEW.interest_amount        IS DISTINCT FROM OLD.interest_amount
  OR NEW.invoice_date           IS DISTINCT FROM OLD.invoice_date
  OR NEW.issued_by_user_id      IS DISTINCT FROM OLD.issued_by_user_id
  OR NEW.idempotency_key        IS DISTINCT FROM OLD.idempotency_key
  OR NEW.created_at             IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'fi_invoices %: this column is part of the issued document and is append-only. Correct it with an adjustment invoice, never in place.',
      OLD.id;
  END IF;

  -- Void resolves exactly ONCE and never un-resolves. Re-voiding in place with a different
  -- reason, leaving no second record, is the "fake refunds to cover the theft of cash" shape.
  IF OLD.voided_at IS NOT NULL
     AND (NEW.status                   IS DISTINCT FROM OLD.status
       OR NEW.voided_at                IS DISTINCT FROM OLD.voided_at
       OR NEW.voided_by_user_id        IS DISTINCT FROM OLD.voided_by_user_id
       OR NEW.void_reason_code         IS DISTINCT FROM OLD.void_reason_code
       OR NEW.void_reason_text         IS DISTINCT FROM OLD.void_reason_text
       OR NEW.void_approving_authority IS DISTINCT FROM OLD.void_approving_authority) THEN
    RAISE EXCEPTION 'fi_invoices %: already voided at % and cannot be re-voided or un-voided',
      OLD.id, OLD.voided_at;
  END IF;

  -- A dunning stamp records that an act happened on a date. Once recorded it is a fact about
  -- the past, so it may be set from NULL exactly once and never rewritten or cleared.
  IF (OLD.due_date            IS NOT NULL AND NEW.due_date            IS DISTINCT FROM OLD.due_date)
  OR (OLD.second_notice_date  IS NOT NULL AND NEW.second_notice_date  IS DISTINCT FROM OLD.second_notice_date)
  OR (OLD.final_notice_date   IS NOT NULL AND NEW.final_notice_date   IS DISTINCT FROM OLD.final_notice_date)
  OR (OLD.lien_date           IS NOT NULL AND NEW.lien_date           IS DISTINCT FROM OLD.lien_date)
  OR (OLD.sent_to_bureau_date IS NOT NULL AND NEW.sent_to_bureau_date IS DISTINCT FROM OLD.sent_to_bureau_date) THEN
    RAISE EXCEPTION
      'fi_invoices %: a dunning stamp records an act on a date and cannot be rewritten once set.',
      OLD.id;
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fi_invoices_append_only ON fi_invoices;
CREATE TRIGGER trg_fi_invoices_append_only
  BEFORE UPDATE OR DELETE ON fi_invoices
  FOR EACH ROW EXECUTE FUNCTION fi_invoices_append_only();

-- ══ 8. The gap report ════════════════════════════════════════════════════════════════════
-- The comptroller's verb is INVESTIGATED, not prohibited. This surfaces every allocated
-- number with no document behind it — which, given the counter-in-one-statement allocator,
-- should be permanently empty and is therefore a real signal when it is not.
--
-- security_invoker = true is LOAD-BEARING. A view's default is to run with its OWNER's
-- privileges, which would BYPASS RLS and let any department read another's numbering. PG 17.6
-- on prod (verified live), so the option is available.
CREATE OR REPLACE VIEW fi_invoice_number_gaps
  WITH (security_invoker = true) AS
SELECT s.department_id,
       s.fiscal_year,
       s.prefix,
       g.n AS missing_sequence_number,
       format('FY%s-%s-%s', s.fiscal_year, s.prefix, lpad(g.n::text, 6, '0')) AS missing_invoice_number
  FROM fi_invoice_sequences s
  CROSS JOIN LATERAL generate_series(1, s.last_sequence) AS g(n)
 WHERE NOT EXISTS (
         SELECT 1 FROM fi_invoices i
          WHERE i.department_id   = s.department_id
            AND i.fiscal_year     = s.fiscal_year
            AND i.sequence_number = g.n);
-- Note what is NOT filtered: voided invoices COUNT AS PRESENT. A void consumes and retains
-- its number, so treating it as a gap would send an auditor after a number that is properly
-- accounted for — the opposite of the control's purpose.

-- ══ 9. Grants: per-role, column-scoped ═══════════════════════════════════════════════════
-- The 0082 lesson: Supabase default privileges auto-grant table-level UPDATE, and a REVOKE
-- from PUBLIC alone does not strip it. Revoke per-role, THEN re-grant exactly the two seams.
DO $grants$
DECLARE r TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    FOREACH r IN ARRAY ARRAY['of_app', 'anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format(
          'REVOKE UPDATE, DELETE, TRUNCATE ON fi_invoices, fi_invoice_lines, fi_invoice_sequences FROM %I', r);
      END IF;
    END LOOP;

    -- The ledger: SELECT + INSERT, and UPDATE on the two seams ONLY. Even a route that tries
    -- to rewrite an amount is refused at the grant layer, before the trigger is reached.
    GRANT SELECT, INSERT ON fi_invoices      TO of_app;
    GRANT SELECT, INSERT ON fi_invoice_lines TO of_app;
    GRANT UPDATE (status, void_reason_code, void_reason_text, void_approving_authority,
                  voided_by_user_id, voided_at,
                  due_date, second_notice_date, final_notice_date, lien_date, sent_to_bureau_date)
      ON fi_invoices TO of_app;

    -- The counter is genuinely mutable — that is what lets the ledger be immutable.
    GRANT SELECT, INSERT ON fi_invoice_sequences TO of_app;
    GRANT UPDATE (last_sequence, updated_at) ON fi_invoice_sequences TO of_app;

    GRANT SELECT ON fi_invoice_number_gaps TO of_app;

    GRANT USAGE, SELECT ON SEQUENCE fi_invoices_id_seq      TO of_app;
    GRANT USAGE, SELECT ON SEQUENCE fi_invoice_lines_id_seq TO of_app;
  END IF;
END $grants$;
