-- 0126-fi-payments.sql
--
-- Phase 3, module 3.2 Slice C — the payment ledger: receipts applied against invoices,
-- refund authorisations, the receipt-number gap report, the derived-balance view, and the
-- R9 waiver/refund approval band.
-- Spec: docs/PHASE3-SLICE-C-PAYMENTS-SPEC-2026-08-04.md (§0 Q4 is RULED — payment RECORDING
--       is in scope; §1 the market bar from the fees spec's §1.10; §4 the shape; §4b R8+R9)
--       + docs/PHASE3-PERMITS-FEES-SPEC-2026-07-26.md §1.10 · §10 R2 · §4 (MONEY class).
--
-- Claimed by empty stub 2026-08-04 (F4). Head RE-verified 0125 two ways on 2026-08-05 before
-- SQL was written: `ls docs/migrations/` AND a live query of the prod of_schema_migrations
-- ledger (0125-fi-invoices.sql applied 2026-08-05 02:54:59+00, top row).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DELIBERATELY DOES NOT CREATE (each a confirmed market absence per §10 R2 OUT)
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- NO general ledger (A1). NO account statements (A10). NO credit memos as distinct numbered
-- documents (A11). NO write-offs (A12). NO AR aging buckets (A13). NO dunning ENGINE (A14).
-- NO `fi_holds` (A15). NO automatic lien filing (A8). NO merchant of record, ever. NO card
-- taking — payment EXECUTION stays in the hosted flow (ADR-0001); this slice records money
-- that has ALREADY been received: at a counter, by mail, or by the city's processor.
-- NO stored balance column — a stored balance is a second source of truth for the same
-- number; balance is DERIVED (the view below). NO cashier role or toggle (R8: cashiering is
-- a shared municipal service in the dominant model; a fire-side cashier designation would
-- EXCEED the market bar, which R1 forbids in both directions).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- WHY THE SHAPE IS THIS SHAPE
-- ═════════════════════════════════════════════════════════════════════════════════════════
--   STATE AUDITOR / COMPTROLLER REQUIREMENT                       → DECISION HERE
--   "a serially press-numbered duplicate receipt form"            → fi_receipt_sequences, the
--                                                                    0125 COUNTER-ROW pattern
--                                                                    (NOT a Postgres SEQUENCE,
--                                                                    which gaps on rollback and
--                                                                    manufactures gap-report
--                                                                    noise), own gap VIEW
--   payor · amount · MODE of payment · purpose · the EMPLOYEE     → columns, most NOT NULL;
--   who received it · date  (the §4 MONEY field set)                method is a CLOSED SET
--   "If a receipt is voided, the original and any copies must     → void CONSUMES AND RETAINS
--    be retained"                                                   its number; row survives
--   "approve all billing adjustments, write-offs and refunds      → refund rows carry reason
--    PRIOR" · "reasons documented and retained" (the named          code + text + approving
--    fraud: "fake refunds to cover the theft of cash")              authority, CHECK-enforced
--   refunds route to Accounts Payable (§1.10)                     → a refund here is an
--                                                                    AUTHORISATION record only;
--                                                                    no disbursement is made or
--                                                                    recorded, because we never
--                                                                    make one
--
-- ONE NUMBER SERIES FOR BOTH KINDS, deliberately: payments and refund authorisations draw
-- from the same per-(dept, FY) counter and the same gap report covers both. Two counters
-- would double the machinery and give the auditor two series to reconcile; the `kind` column
-- is the discriminator and the receipt-number format carries an R segment so a receipt can
-- never be misread as an invoice number.
--
-- R9 (spec §4b): the waiver/refund approval band. The threshold is CONFIG and SHIPS UNSET
-- (NULL = no band = today's behaviour). The state auditor's manual requires management
-- approval "above a dollar threshold" but publishes NO figure — the number is each
-- municipality's own finance policy, and hardcoding one would put an unratified policy into
-- a money control (the treat_delinquent_as_valid lesson: an unchosen default is a decision
-- nobody made). When set, a waiver or refund at/above the band requires a SECOND named
-- approver, trigger-enforced at the database so it survives a route written wrongly.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- ADDITIVE. Two new tables, two new views, one column on fi_settings, one column on
-- fi_fee_assessments (both nullable, no existing row breaks). Nothing dropped, no CHECK
-- widened, no data migration. F13 (destructive needs Matt's sign-off) not engaged.
-- ─────────────────────────────────────────────────────────────────────────────────────────

-- ══ 1. Config: the R9 band ═══════════════════════════════════════════════════════════════
ALTER TABLE fi_settings
  ADD COLUMN IF NOT EXISTS waiver_approval_threshold NUMERIC(12,2);

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_settings_waiver_threshold_ck') THEN
    ALTER TABLE fi_settings ADD CONSTRAINT fi_settings_waiver_threshold_ck
      CHECK (waiver_approval_threshold IS NULL OR waiver_approval_threshold >= 0);
  END IF;
END $c$;

-- The second named approver on an assessment waiver, required only when the band is set and
-- the waiver is at/above it (trigger below). Nullable: NULL is the pre-band world.
ALTER TABLE fi_fee_assessments
  ADD COLUMN IF NOT EXISTS waiver_approving_authority TEXT;

-- ══ 2. The receipt-number allocator ══════════════════════════════════════════════════════
-- Same counter-row pattern as fi_invoice_sequences and for the same reason (0125's header).
-- Allocation and insertion happen in ONE statement (routes/fiPayments.js), so a rolled-back
-- receipt returns its number rather than burning it.
CREATE TABLE IF NOT EXISTS fi_receipt_sequences (
  department_id INTEGER NOT NULL,
  fiscal_year   INTEGER NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 9999),
  -- Frozen at first allocation, copied from fi_settings.invoice_number_prefix at that moment
  -- (one department segment serves both document families — a second prefix config would be
  -- a second thing to misconfigure). NON-EMPTY: an unset prefix is a route-level REFUSAL,
  -- and this CHECK makes that refusal unbypassable.
  prefix        TEXT NOT NULL CHECK (prefix ~ '^[A-Z0-9]{1,12}$'),
  last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (department_id, fiscal_year)
);

-- ══ 3. The payment ledger ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fi_payments (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL,

  -- One row per receipt. `kind` discriminates money RECEIVED from a refund AUTHORISED.
  kind TEXT NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment', 'refund_authorization')),

  -- Identity: verbatim string + parts, both, same as invoices. The R segment is what stops a
  -- receipt number ever being misread as an invoice number on paper.
  receipt_number  TEXT    NOT NULL CHECK (receipt_number ~ '^FY[0-9]{4}-[A-Z0-9]{1,12}-R[0-9]{6,}$'),
  fiscal_year     INTEGER NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 9999),
  sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),

  status TEXT NOT NULL DEFAULT 'Recorded' CHECK (status IN ('Recorded', 'Void')),

  -- Every receipt applies against an invoice. RESTRICT: the money record that cites a
  -- document must survive that document (the 0016 CASCADE→RESTRICT lesson).
  invoice_id INTEGER NOT NULL REFERENCES fi_invoices(id) ON DELETE RESTRICT,

  -- Money. NUMERIC, never REAL. Strictly positive: the sign lives in `kind`, and a $0
  -- receipt is not a receipt (a genuine zero-fee document is an INVOICE fact, not a payment).
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),

  -- The state-auditor field set. `method` is a CLOSED SET matched exactly — nothing may
  -- pattern-match, lowercase-and-compare, or coerce it (the /^pass\b/i lesson).
  method       TEXT CHECK (method IN ('cash', 'check', 'card', 'ach', 'money_order', 'other')),
  check_number TEXT,
  payor_name   TEXT NOT NULL CHECK (length(btrim(payor_name)) > 0),
  purpose      TEXT,
  received_by_user_id INTEGER NOT NULL,
  received_date DATE NOT NULL,
  deposit_batch_ref TEXT,
  notes        TEXT,

  -- Refund authorisation fields (kind = 'refund_authorization' only). We record that a
  -- refund was AUTHORISED and by whom; disbursement is Finance's, via AP, always.
  refund_of_payment_id   INTEGER REFERENCES fi_payments(id) ON DELETE RESTRICT,
  refund_reason_code     TEXT CHECK (refund_reason_code IS NULL OR refund_reason_code IN
                           ('overpayment', 'duplicate_payment', 'permit_withdrawn',
                            'fee_adjusted', 'paid_in_error', 'other')),
  refund_reason_text     TEXT,
  refund_approving_authority TEXT,
  -- The R9 second approver, required by trigger only at/above the configured band.
  refund_second_approver TEXT,

  -- Void: consume and retain (identical contract to fi_invoices).
  void_reason_code TEXT CHECK (void_reason_code IS NULL OR void_reason_code IN
                     ('recorded_in_error', 'wrong_amount', 'wrong_invoice', 'wrong_payor',
                      'duplicate', 'other')),
  void_reason_text TEXT,
  void_approving_authority TEXT,
  voided_by_user_id INTEGER,
  voided_at        TIMESTAMPTZ,

  issued_by_user_id INTEGER NOT NULL,
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ── Numbering invariants (one series, both kinds) ──
  CONSTRAINT fi_payments_seq_unique    UNIQUE (department_id, fiscal_year, sequence_number),
  CONSTRAINT fi_payments_number_unique UNIQUE (department_id, receipt_number),

  -- ── Structural invariants ──
  -- A payment names its mode; a refund authorisation has none (no money moves here — AP
  -- disburses). Both directions, so neither a mode-less payment nor a moded refund exists.
  CHECK ((kind = 'payment') = (method IS NOT NULL)),
  -- A check number belongs to a numbered instrument, and a check must carry one.
  -- ⚠ EVERY nullable column tested inside a CHECK carries an explicit IS NOT NULL:
  --   length(btrim(NULL)) > 0 is NULL, and a CHECK treats NULL as PASS (SQL three-valued
  --   logic). The local probe run for this migration caught exactly that — a check payment
  --   with no check number INSERTED — and the same leak is in 0125's void/adjustment CHECKs,
  --   tightened in §11 below.
  CHECK (check_number IS NULL OR method IN ('check', 'money_order')),
  CONSTRAINT fi_payments_check_needs_number_ck CHECK (
    method IS DISTINCT FROM 'check'
    OR (check_number IS NOT NULL AND length(btrim(check_number)) > 0)),
  -- A refund authorisation is never anonymous and never unreasoned ("fake refunds to cover
  -- the theft of cash" is the named fraud). A payment carries none of these fields.
  CHECK ((kind = 'refund_authorization') = (refund_reason_code IS NOT NULL)),
  CONSTRAINT fi_payments_refund_complete_ck CHECK (kind = 'payment' OR (
           refund_reason_text IS NOT NULL AND length(btrim(refund_reason_text)) > 0
           AND refund_approving_authority IS NOT NULL
           AND length(btrim(refund_approving_authority)) > 0)),
  CHECK (kind = 'refund_authorization' OR (
           refund_reason_text IS NULL AND refund_approving_authority IS NULL
           AND refund_second_approver IS NULL AND refund_of_payment_id IS NULL)),
  -- Void is a complete act or no act.
  CHECK ((status = 'Void') = (voided_at IS NOT NULL)),
  CONSTRAINT fi_payments_void_complete_ck CHECK (voided_at IS NULL OR (
           void_reason_code IS NOT NULL
           AND void_reason_text IS NOT NULL AND length(btrim(void_reason_text)) > 0
           AND void_approving_authority IS NOT NULL
           AND length(btrim(void_approving_authority)) > 0
           AND voided_by_user_id IS NOT NULL)),
  -- A refund cannot refund itself.
  CHECK (refund_of_payment_id IS NULL OR refund_of_payment_id <> id)
);

-- ══ 4. Indexes ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_fi_payments_dept_created
  ON fi_payments (department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fi_payments_invoice
  ON fi_payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_fi_payments_dept_fy_seq
  ON fi_payments (department_id, fiscal_year, sequence_number);
-- The auditor's first stops: voids and refunds each get a partial index (F18).
CREATE INDEX IF NOT EXISTS idx_fi_payments_voided
  ON fi_payments (department_id, voided_at DESC) WHERE voided_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fi_payments_refunds
  ON fi_payments (department_id, created_at DESC) WHERE kind = 'refund_authorization';
-- The replay fence (F10).
CREATE UNIQUE INDEX IF NOT EXISTS idx_fi_payments_idempotency
  ON fi_payments (department_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ══ 5. RLS: dept_isolation (WITH CHECK omitted deliberately — Postgres reuses USING for new
--        rows; verified empirically on prod 2026-08-04, matching all existing policies) ════
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fi_receipt_sequences', 'fi_payments'] LOOP
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

-- ══ 6. Cross-table integrity (cannot be CHECKs; live in triggers so they survive a route
--        written wrongly later — the 0118 draft_only / 0125 line-sign reasoning) ═══════════
CREATE OR REPLACE FUNCTION fi_payments_integrity()
RETURNS TRIGGER
SET search_path = pg_catalog, public
AS $fn$
DECLARE inv RECORD; refunded RECORD; band NUMERIC;
BEGIN
  -- CREATE OR REPLACE FUNCTION DISCARDS a SET search_path added by a later ALTER, so it is
  -- declared inline here AND inline in db.js (the 0119 lesson).
  SELECT department_id, status INTO inv FROM fi_invoices WHERE id = NEW.invoice_id;
  IF inv IS NULL THEN
    RAISE EXCEPTION 'fi_payments: invoice % does not exist', NEW.invoice_id;
  END IF;
  -- A receipt must not be filed under a different tenant from the document it pays. RLS
  -- checks each row against the session; it does not check the two against EACH OTHER.
  IF inv.department_id IS DISTINCT FROM NEW.department_id THEN
    RAISE EXCEPTION 'fi_payments: payment department % does not match invoice % department %',
      NEW.department_id, NEW.invoice_id, inv.department_id;
  END IF;
  -- Money cannot be applied to a void document — there is nothing to apply it to. (An invoice
  -- voided AFTER money was taken keeps its receipts; those become unapplied cash, visible on
  -- the balance view, which is exactly what overpayment/unapplied cash exists to represent.)
  IF inv.status = 'Void' THEN
    RAISE EXCEPTION 'fi_payments: invoice % is void; record the money against a live document or leave it unapplied on a new one',
      NEW.invoice_id;
  END IF;

  IF NEW.kind = 'refund_authorization' THEN
    -- A refund that names the receipt it refunds must name a real, same-department PAYMENT
    -- on the SAME invoice — a refund of receipt X filed against document Y reconciles nowhere.
    IF NEW.refund_of_payment_id IS NOT NULL THEN
      SELECT department_id, invoice_id, kind INTO refunded
        FROM fi_payments WHERE id = NEW.refund_of_payment_id;
      IF refunded IS NULL THEN
        RAISE EXCEPTION 'fi_payments: refunded payment % does not exist', NEW.refund_of_payment_id;
      END IF;
      IF refunded.department_id IS DISTINCT FROM NEW.department_id
         OR refunded.invoice_id IS DISTINCT FROM NEW.invoice_id
         OR refunded.kind IS DISTINCT FROM 'payment' THEN
        RAISE EXCEPTION 'fi_payments: refund must name a payment on the same invoice in the same department';
      END IF;
    END IF;
    -- R9: at/above the configured band, a refund authorisation requires a SECOND named
    -- approver. NULL band = no band (ships unset; today's behaviour, not a change).
    SELECT waiver_approval_threshold INTO band
      FROM fi_settings WHERE department_id = NEW.department_id;
    IF band IS NOT NULL AND NEW.amount >= band
       AND (NEW.refund_second_approver IS NULL OR length(btrim(NEW.refund_second_approver)) = 0) THEN
      RAISE EXCEPTION 'fi_payments: a refund of % is at or above this department''s approval threshold (%) and requires a second named approver',
        NEW.amount, band;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fi_payments_integrity ON fi_payments;
CREATE TRIGGER trg_fi_payments_integrity
  BEFORE INSERT ON fi_payments
  FOR EACH ROW EXECUTE FUNCTION fi_payments_integrity();

-- R9 on assessment waivers: same band, same second-approver rule, enforced where the waiver
-- is WRITTEN (fi_fee_assessments), not only in the route.
CREATE OR REPLACE FUNCTION fi_assessment_waiver_band()
RETURNS TRIGGER
SET search_path = pg_catalog, public
AS $fn$
DECLARE band NUMERIC;
BEGIN
  IF NEW.waived_at IS NOT NULL AND OLD.waived_at IS NULL THEN
    SELECT waiver_approval_threshold INTO band
      FROM fi_settings WHERE department_id = NEW.department_id;
    IF band IS NOT NULL AND COALESCE(NEW.waiver_amount, 0) >= band
       AND (NEW.waiver_approving_authority IS NULL
            OR length(btrim(NEW.waiver_approving_authority)) = 0) THEN
      RAISE EXCEPTION 'fi_fee_assessments: a waiver of % is at or above this department''s approval threshold (%) and requires a second named approver',
        NEW.waiver_amount, band;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fi_assessment_waiver_band ON fi_fee_assessments;
CREATE TRIGGER trg_fi_assessment_waiver_band
  BEFORE UPDATE ON fi_fee_assessments
  FOR EACH ROW EXECUTE FUNCTION fi_assessment_waiver_band();

-- ══ 7. Physical append-only ══════════════════════════════════════════════════════════════
-- A receipt has exactly ONE seam: the void. Everything that constitutes the document — its
-- number, its money, its mode, who took it, when — is frozen the instant it exists.
CREATE OR REPLACE FUNCTION fi_payments_append_only()
RETURNS TRIGGER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'fi_payments %: a recorded receipt is never deleted. Void it — the number is consumed and the record retained.',
      OLD.id;
  END IF;

  IF NEW.id                   IS DISTINCT FROM OLD.id
  OR NEW.department_id        IS DISTINCT FROM OLD.department_id
  OR NEW.kind                 IS DISTINCT FROM OLD.kind
  OR NEW.receipt_number       IS DISTINCT FROM OLD.receipt_number
  OR NEW.fiscal_year          IS DISTINCT FROM OLD.fiscal_year
  OR NEW.sequence_number      IS DISTINCT FROM OLD.sequence_number
  OR NEW.invoice_id           IS DISTINCT FROM OLD.invoice_id
  OR NEW.amount               IS DISTINCT FROM OLD.amount
  OR NEW.method               IS DISTINCT FROM OLD.method
  OR NEW.check_number         IS DISTINCT FROM OLD.check_number
  OR NEW.payor_name           IS DISTINCT FROM OLD.payor_name
  OR NEW.purpose              IS DISTINCT FROM OLD.purpose
  OR NEW.received_by_user_id  IS DISTINCT FROM OLD.received_by_user_id
  OR NEW.received_date        IS DISTINCT FROM OLD.received_date
  OR NEW.deposit_batch_ref    IS DISTINCT FROM OLD.deposit_batch_ref
  OR NEW.notes                IS DISTINCT FROM OLD.notes
  OR NEW.refund_of_payment_id IS DISTINCT FROM OLD.refund_of_payment_id
  OR NEW.refund_reason_code   IS DISTINCT FROM OLD.refund_reason_code
  OR NEW.refund_reason_text   IS DISTINCT FROM OLD.refund_reason_text
  OR NEW.refund_approving_authority IS DISTINCT FROM OLD.refund_approving_authority
  OR NEW.refund_second_approver     IS DISTINCT FROM OLD.refund_second_approver
  OR NEW.issued_by_user_id    IS DISTINCT FROM OLD.issued_by_user_id
  OR NEW.idempotency_key      IS DISTINCT FROM OLD.idempotency_key
  OR NEW.created_at           IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'fi_payments %: this column is part of the recorded receipt and is append-only. A wrong receipt is voided and re-recorded, never edited.',
      OLD.id;
  END IF;

  -- Void resolves exactly ONCE and never un-resolves.
  IF OLD.voided_at IS NOT NULL
     AND (NEW.status                   IS DISTINCT FROM OLD.status
       OR NEW.voided_at                IS DISTINCT FROM OLD.voided_at
       OR NEW.voided_by_user_id        IS DISTINCT FROM OLD.voided_by_user_id
       OR NEW.void_reason_code         IS DISTINCT FROM OLD.void_reason_code
       OR NEW.void_reason_text         IS DISTINCT FROM OLD.void_reason_text
       OR NEW.void_approving_authority IS DISTINCT FROM OLD.void_approving_authority) THEN
    RAISE EXCEPTION 'fi_payments %: already voided at % and cannot be re-voided or un-voided',
      OLD.id, OLD.voided_at;
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fi_payments_append_only ON fi_payments;
CREATE TRIGGER trg_fi_payments_append_only
  BEFORE UPDATE OR DELETE ON fi_payments
  FOR EACH ROW EXECUTE FUNCTION fi_payments_append_only();

-- ══ 8. The receipt gap report ════════════════════════════════════════════════════════════
-- security_invoker = true is LOAD-BEARING (a view defaults to its OWNER's privileges, which
-- would bypass RLS). Voided receipts COUNT AS PRESENT — a void consumes and retains.
CREATE OR REPLACE VIEW fi_receipt_number_gaps
  WITH (security_invoker = true) AS
SELECT s.department_id,
       s.fiscal_year,
       s.prefix,
       g.n AS missing_sequence_number,
       format('FY%s-%s-R%s', s.fiscal_year, s.prefix, lpad(g.n::text, 6, '0')) AS missing_receipt_number
  FROM fi_receipt_sequences s
  CROSS JOIN LATERAL generate_series(1, s.last_sequence) AS g(n)
 WHERE NOT EXISTS (
         SELECT 1 FROM fi_payments p
          WHERE p.department_id   = s.department_id
            AND p.fiscal_year     = s.fiscal_year
            AND p.sequence_number = g.n);

-- ══ 9. The derived balance ═══════════════════════════════════════════════════════════════
-- BALANCE IS NEVER A COLUMN. One view, computed from the ledgers every time it is read, so
-- there is exactly one source of truth for what is owed. Refund authorisations ADD to the
-- balance (money the department has agreed to give back is money no longer credited against
-- the document). Void receipts and void refunds count for nothing. A negative balance IS the
-- representation of overpayment/unapplied cash — representable, not an error.
CREATE OR REPLACE VIEW fi_invoice_balances
  WITH (security_invoker = true) AS
SELECT i.id AS invoice_id,
       i.department_id,
       i.invoice_number,
       i.status,
       i.invoice_amount,
       COALESCE(p.paid, 0)     AS paid_amount,
       COALESCE(p.refunded, 0) AS refunded_amount,
       (i.invoice_amount - COALESCE(p.paid, 0) + COALESCE(p.refunded, 0)) AS balance
  FROM fi_invoices i
  LEFT JOIN LATERAL (
    SELECT SUM(amount) FILTER (WHERE kind = 'payment')              AS paid,
           SUM(amount) FILTER (WHERE kind = 'refund_authorization') AS refunded
      FROM fi_payments p
     WHERE p.invoice_id = i.id AND p.status <> 'Void'
  ) p ON TRUE;

-- ══ 10. Grants: per-role, column-scoped (the 0082 lesson) ════════════════════════════════
DO $grants$
DECLARE r TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    FOREACH r IN ARRAY ARRAY['of_app', 'anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format(
          'REVOKE UPDATE, DELETE, TRUNCATE ON fi_payments, fi_receipt_sequences FROM %I', r);
      END IF;
    END LOOP;

    -- The ledger: SELECT + INSERT, and UPDATE on the void seam ONLY. A route that tries to
    -- rewrite an amount is refused at the grant layer, before the trigger is reached.
    GRANT SELECT, INSERT ON fi_payments TO of_app;
    GRANT UPDATE (status, void_reason_code, void_reason_text, void_approving_authority,
                  voided_by_user_id, voided_at)
      ON fi_payments TO of_app;

    -- The counter is genuinely mutable — that is what lets the ledger be immutable.
    GRANT SELECT, INSERT ON fi_receipt_sequences TO of_app;
    GRANT UPDATE (last_sequence, updated_at) ON fi_receipt_sequences TO of_app;

    GRANT SELECT ON fi_receipt_number_gaps TO of_app;
    GRANT SELECT ON fi_invoice_balances    TO of_app;

    GRANT USAGE, SELECT ON SEQUENCE fi_payments_id_seq TO of_app;
  END IF;
END $grants$;

-- ══ 11. Tighten 0125's two NULL-leaky CHECKs on fi_invoices ══════════════════════════════
-- Found by THIS migration's local probe run (2026-08-05): a CHECK whose condition evaluates
-- to NULL passes, and `length(btrim(<nullable col>)) > 0` is NULL when the column is NULL.
-- So 0125's "void is a complete act" and "adjustment is never unreasoned" CHECKs admit a
-- void with a NULL reason_text/approving_authority and an adjustment with NULL text — the
-- exact rows they exist to refuse. The ROUTE always writes all fields, but the doctrine is
-- database-enforced-so-it-survives-a-route-written-wrongly, and a NULL leak defeats that.
--
-- Guarded: refuses to run if any existing row would violate the tightened constraint (none
-- should — the route has always written complete voids/adjustments) rather than failing
-- mid-migration with a bare 23514. Constraint names discovered by DEFINITION, because
-- auto-generated names (fi_invoices_check5…) differ across databases.
DO $tighten$
DECLARE cname TEXT; bad INTEGER;
BEGIN
  -- (a) the void CHECK
  SELECT count(*) INTO bad FROM fi_invoices
   WHERE voided_at IS NOT NULL
     AND (void_reason_code IS NULL
          OR void_reason_text IS NULL OR length(btrim(void_reason_text)) = 0
          OR void_approving_authority IS NULL OR length(btrim(void_approving_authority)) = 0
          OR voided_by_user_id IS NULL);
  IF bad > 0 THEN
    RAISE EXCEPTION '0126: % voided fi_invoices rows have incomplete void paperwork — investigate before tightening', bad;
  END IF;
  SELECT conname INTO cname FROM pg_constraint
   WHERE conrelid = 'fi_invoices'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%void_reason_code IS NOT NULL%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE fi_invoices DROP CONSTRAINT %I', cname);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_invoices_void_complete_ck') THEN
    ALTER TABLE fi_invoices ADD CONSTRAINT fi_invoices_void_complete_ck
      CHECK (voided_at IS NULL OR (
               void_reason_code IS NOT NULL
               AND void_reason_text IS NOT NULL AND length(btrim(void_reason_text)) > 0
               AND void_approving_authority IS NOT NULL
               AND length(btrim(void_approving_authority)) > 0
               AND voided_by_user_id IS NOT NULL));
  END IF;

  -- (b) the adjustment CHECK
  SELECT count(*) INTO bad FROM fi_invoices
   WHERE invoice_kind = 'adjustment'
     AND (adjustment_reason_code IS NULL
          OR adjustment_reason_text IS NULL OR length(btrim(adjustment_reason_text)) = 0
          OR adjustment_approving_authority IS NULL
          OR length(btrim(adjustment_approving_authority)) = 0);
  IF bad > 0 THEN
    RAISE EXCEPTION '0126: % adjustment fi_invoices rows have incomplete paperwork — investigate before tightening', bad;
  END IF;
  SELECT conname INTO cname FROM pg_constraint
   WHERE conrelid = 'fi_invoices'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%adjustment_reason_code IS NOT NULL%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE fi_invoices DROP CONSTRAINT %I', cname);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_invoices_adjustment_complete_ck') THEN
    ALTER TABLE fi_invoices ADD CONSTRAINT fi_invoices_adjustment_complete_ck
      CHECK (invoice_kind = 'original' OR (
               adjustment_reason_code IS NOT NULL
               AND adjustment_reason_text IS NOT NULL
               AND length(btrim(adjustment_reason_text)) > 0
               AND adjustment_approving_authority IS NOT NULL
               AND length(btrim(adjustment_approving_authority)) > 0));
  END IF;
END $tighten$;

-- ══ 12. The R9 second-approver column must be WRITABLE through the waiver seam ═══════════
-- 0118's column-scoped UPDATE grant on fi_fee_assessments predates this column. Without this
-- grant the band trigger would demand a value of_app cannot write — a guard whose remedy is
-- not offered (anti-pattern #61, mode 2). Caught at review, not in prod.
DO $g2$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
    GRANT UPDATE (waiver_approving_authority) ON fi_fee_assessments TO of_app;
  END IF;
END $g2$;

INSERT INTO of_schema_migrations (filename) VALUES ('0126-fi-payments.sql')
  ON CONFLICT DO NOTHING;
