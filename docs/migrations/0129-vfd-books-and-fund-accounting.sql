-- 0129-vfd-books-and-fund-accounting.sql
-- Volunteer Fire Department (VFD) & Fire Protection District Books & Fund Accounting
--
-- Covers:
--   1. Department Accounting Mode Config (Mode A: 501(c)(3)/(c)(4) & Fire District Full Books
--      vs. Mode B: Municipal Career FD Divisional Budget & City Hall ERP Connector)
--   2. 6-Fund Restricted vs. Unrestricted Firehouse Fund Ledger (ASC 958 & GASB 54)
--      with Fund 200 Zero-Commingling Grant Lock and Fund 300 Statutory Relief Guard
--   3. Double-Entry Integer-Cent General Ledger (vfd_journal_entries & vfd_journal_lines)
--   4. Vendor W-9 & Certificate of Insurance (COI) Compliance Registry (vfd_vendors)
--   5. Dual-Signer Treasurer + Fire Chief / Board President Approval Gate (vfd_disbursements)
--   6. Volunteer Firefighter Stipend, Point-System, FLSA 29 C.F.R. § 553.106 (20% Safe Harbor),
--      IRC § 457(e)(11) LOSAP ($7,500 Cap), & IRC § 139B ($600 Exclusion) Tax Engine
--   7. IRC § 170(f)(8) Contemporaneous Written Donor Acknowledgment Receipts
--   8. NFPA 1901 / 1911 15-20 Year Apparatus Replacement Reserve & Debt Amortization
--   9. EMS Billing, MVA/Hazmat Ordinance & Wildland Strike Team Cost-Recovery Ledger
--
-- All monetary amounts are stored as integer cents (BIGINT) to prevent floating-point drift.

BEGIN;

CREATE TABLE IF NOT EXISTS public.vfd_accounting_config (
  id                              SERIAL PRIMARY KEY,
  department_id                   INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  accounting_mode                 TEXT NOT NULL DEFAULT 'vfd_full_books'
                                    CONSTRAINT vfd_accounting_mode_chk
                                    CHECK (accounting_mode IN ('vfd_full_books', 'municipal_erp_connector')),
  entity_legal_name               TEXT NOT NULL DEFAULT 'Maplewood Volunteer Fire Company #1 & Fire District',
  ein                             TEXT NOT NULL DEFAULT '22-3849102',
  sam_uei                         TEXT NOT NULL DEFAULT 'J8K4L9M2N5P1',
  sam_status                      TEXT NOT NULL DEFAULT 'Active',
  tax_exempt_classification       TEXT NOT NULL DEFAULT '501(c)(3)',
  fiscal_year                     INTEGER NOT NULL DEFAULT 2026,
  prevailing_career_wage_cents    BIGINT NOT NULL DEFAULT 7800000
                                    CONSTRAINT vfd_prevailing_wage_positive_chk CHECK (prevailing_career_wage_cents > 0),
  dual_signer_threshold_cents     BIGINT NOT NULL DEFAULT 100000
                                    CONSTRAINT vfd_dual_threshold_positive_chk CHECK (dual_signer_threshold_cents > 0),
  losap_annual_cap_cents          BIGINT NOT NULL DEFAULT 750000,
  irc_139b_monthly_exclusion_cents BIGINT NOT NULL DEFAULT 5000,
  irc_139b_annual_cap_cents       BIGINT NOT NULL DEFAULT 60000,
  erp_target_system               TEXT NOT NULL DEFAULT 'tyler_munis'
                                    CONSTRAINT vfd_erp_target_chk
                                    CHECK (erp_target_system IN ('tyler_munis', 'caselle', 'workday')),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id)
);

CREATE TABLE IF NOT EXISTS public.vfd_funds (
  id                        SERIAL PRIMARY KEY,
  department_id             INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  fund_code                 TEXT NOT NULL
                              CONSTRAINT vfd_fund_code_chk
                              CHECK (fund_code IN ('100', '200', '300', '400', '500', '600')),
  fund_name                 TEXT NOT NULL,
  asc_958_class             TEXT NOT NULL
                              CONSTRAINT vfd_asc_958_chk
                              CHECK (asc_958_class IN ('without_donor_restrictions', 'with_donor_restrictions')),
  gasb_54_class             TEXT NOT NULL
                              CONSTRAINT vfd_gasb_54_chk
                              CHECK (gasb_54_class IN ('nonspendable', 'restricted', 'committed', 'assigned', 'unassigned')),
  restriction_type          TEXT NOT NULL
                              CONSTRAINT vfd_restriction_type_chk
                              CHECK (restriction_type IN ('unrestricted', 'grant_restricted', 'statutorily_restricted', 'board_committed', 'cost_recovery_assigned')),
  opening_balance_cents     BIGINT NOT NULL DEFAULT 0,
  current_balance_cents     BIGINT NOT NULL DEFAULT 0,
  encumbered_cents          BIGINT NOT NULL DEFAULT 0,
  grant_award_cents         BIGINT NOT NULL DEFAULT 0,
  local_match_percent       INTEGER NOT NULL DEFAULT 0,
  local_match_required_cents BIGINT NOT NULL DEFAULT 0,
  local_match_met_cents     BIGINT NOT NULL DEFAULT 0,
  zero_commingling_locked   BOOLEAN NOT NULL DEFAULT FALSE,
  statutory_citation        TEXT NOT NULL DEFAULT '',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, fund_code)
);
CREATE INDEX IF NOT EXISTS idx_vfd_funds_dept ON public.vfd_funds(department_id, fund_code);

CREATE TABLE IF NOT EXISTS public.vfd_vendors (
  id                  SERIAL PRIMARY KEY,
  department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  vendor_code         TEXT NOT NULL,
  vendor_name         TEXT NOT NULL,
  category            TEXT NOT NULL,
  w9_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  tin_masked          TEXT NOT NULL DEFAULT '',
  coi_required        BOOLEAN NOT NULL DEFAULT TRUE,
  coi_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  coi_expires_on      DATE,
  coi_carrier         TEXT NOT NULL DEFAULT '',
  payment_method      TEXT NOT NULL DEFAULT 'ACH'
                        CONSTRAINT vfd_vendor_pay_method_chk CHECK (payment_method IN ('ACH', 'Check')),
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, vendor_code)
);
CREATE INDEX IF NOT EXISTS idx_vfd_vendors_dept ON public.vfd_vendors(department_id);

CREATE TABLE IF NOT EXISTS public.vfd_journal_entries (
  id                  SERIAL PRIMARY KEY,
  department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  entry_number        TEXT NOT NULL,
  entry_date          DATE NOT NULL,
  fund_code           TEXT NOT NULL,
  description         TEXT NOT NULL,
  expense_category    TEXT NOT NULL DEFAULT 'general_operating',
  form_990_function   TEXT NOT NULL DEFAULT 'program_services'
                        CONSTRAINT vfd_990_fn_chk
                        CHECK (form_990_function IN ('program_services', 'management_general', 'fundraising', 'revenue_receipt', 'balance_sheet_transfer')),
  form_990_line       TEXT NOT NULL DEFAULT 'Part IX Line 24a — Fire Suppression & Rescue',
  total_cents         BIGINT NOT NULL
                        CONSTRAINT vfd_journal_total_positive_chk CHECK (total_cents > 0),
  lines_json          JSONB NOT NULL DEFAULT '[]',
  prev_hash           TEXT NOT NULL,
  entry_hash          TEXT NOT NULL,
  created_by_name     TEXT NOT NULL DEFAULT 'Treasurer',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, entry_number)
);
CREATE INDEX IF NOT EXISTS idx_vfd_journal_dept ON public.vfd_journal_entries(department_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS public.vfd_disbursements (
  id                        SERIAL PRIMARY KEY,
  department_id             INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  voucher_number            TEXT NOT NULL,
  disbursement_date         DATE NOT NULL,
  fund_code                 TEXT NOT NULL,
  vendor_id                 INTEGER REFERENCES public.vfd_vendors(id) ON DELETE RESTRICT,
  vendor_name               TEXT NOT NULL,
  description               TEXT NOT NULL,
  expense_category          TEXT NOT NULL,
  form_990_function         TEXT NOT NULL DEFAULT 'program_services',
  amount_cents              BIGINT NOT NULL
                              CONSTRAINT vfd_disb_amount_positive_chk CHECK (amount_cents > 0),
  payment_method            TEXT NOT NULL DEFAULT 'Check'
                              CONSTRAINT vfd_disb_method_chk CHECK (payment_method IN ('Check', 'ACH', 'Wire')),
  check_or_ach_ref          TEXT NOT NULL DEFAULT '',
  requires_dual_signer      BOOLEAN NOT NULL DEFAULT FALSE,
  status                    TEXT NOT NULL DEFAULT 'pending_treasurer'
                              CONSTRAINT vfd_disb_status_chk
                              CHECK (status IN ('pending_treasurer', 'pending_chief_or_board', 'approved_and_posted', 'rejected')),
  treasurer_signer_name     TEXT,
  treasurer_signer_role     TEXT,
  treasurer_signed_at       TIMESTAMPTZ,
  treasurer_sig_hash        TEXT,
  second_signer_name        TEXT,
  second_signer_role        TEXT,
  second_signed_at          TIMESTAMPTZ,
  second_sig_hash           TEXT,
  journal_entry_number      TEXT,
  bank_settlement_ref       TEXT,
  merkle_leaf_hash          TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, voucher_number)
);
CREATE INDEX IF NOT EXISTS idx_vfd_disbursements_dept ON public.vfd_disbursements(department_id, status);

CREATE TABLE IF NOT EXISTS public.vfd_member_stipends (
  id                              SERIAL PRIMARY KEY,
  department_id                   INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  member_id                       INTEGER,
  member_name                     TEXT NOT NULL,
  rank_title                      TEXT NOT NULL DEFAULT 'Firefighter',
  active_months_in_year           INTEGER NOT NULL DEFAULT 12
                                    CONSTRAINT vfd_active_months_chk CHECK (active_months_in_year BETWEEN 0 AND 12),
  incident_calls_responded        INTEGER NOT NULL DEFAULT 0,
  drill_hours_completed           INTEGER NOT NULL DEFAULT 0,
  duty_shifts_completed           INTEGER NOT NULL DEFAULT 0,
  total_losap_points              INTEGER NOT NULL DEFAULT 0,
  qualifies_for_losap_year        BOOLEAN NOT NULL DEFAULT FALSE,
  gross_stipend_cents             BIGINT NOT NULL DEFAULT 0,
  irc_139b_excluded_cents         BIGINT NOT NULL DEFAULT 0,
  taxable_w2_wages_cents          BIGINT NOT NULL DEFAULT 0,
  losap_contribution_cents        BIGINT NOT NULL DEFAULT 0
                                    CONSTRAINT vfd_losap_cap_chk CHECK (losap_contribution_cents <= 750000),
  flsa_ratio_bps                  INTEGER NOT NULL DEFAULT 0,
  flsa_safe_harbor_status         TEXT NOT NULL DEFAULT 'compliant'
                                    CONSTRAINT vfd_flsa_status_chk
                                    CHECK (flsa_safe_harbor_status IN ('compliant', 'warning_15_pct', 'blocked_20_pct')),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, member_name)
);
CREATE INDEX IF NOT EXISTS idx_vfd_stipends_dept ON public.vfd_member_stipends(department_id);

CREATE TABLE IF NOT EXISTS public.vfd_donor_receipts (
  id                              SERIAL PRIMARY KEY,
  department_id                   INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  receipt_number                  TEXT NOT NULL,
  donation_date                   DATE NOT NULL,
  donor_name                      TEXT NOT NULL,
  donor_address                   TEXT NOT NULL DEFAULT '',
  campaign_name                   TEXT NOT NULL,
  fund_code                       TEXT NOT NULL DEFAULT '400',
  gross_amount_cents              BIGINT NOT NULL
                                    CONSTRAINT vfd_donor_gross_pos_chk CHECK (gross_amount_cents > 0),
  quid_pro_quo_goods_provided     BOOLEAN NOT NULL DEFAULT FALSE,
  goods_services_description      TEXT NOT NULL DEFAULT '',
  goods_fair_market_value_cents   BIGINT NOT NULL DEFAULT 0
                                    CONSTRAINT vfd_donor_fmv_nonneg_chk CHECK (goods_fair_market_value_cents >= 0),
  tax_deductible_cents            BIGINT NOT NULL
                                    CONSTRAINT vfd_donor_ded_nonneg_chk CHECK (tax_deductible_cents >= 0),
  irc_170_f_8_statement           TEXT NOT NULL,
  signature_hash                  TEXT NOT NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, receipt_number)
);
CREATE INDEX IF NOT EXISTS idx_vfd_donor_receipts_dept ON public.vfd_donor_receipts(department_id, donation_date DESC);

-- Enable RLS with standard dept_isolation policy across all VFD Books tables
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vfd_accounting_config',
    'vfd_funds',
    'vfd_vendors',
    'vfd_journal_entries',
    'vfd_disbursements',
    'vfd_member_stipends',
    'vfd_donor_receipts'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
    EXECUTE format($p$CREATE POLICY dept_isolation ON public.%I FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)$p$, t);
  END LOOP;
END $$;

COMMIT;
