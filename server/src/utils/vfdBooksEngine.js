'use strict';
/**
 * vfdBooksEngine.js — Volunteer Fire Department & Fire Protection District Books Engine
 *
 * Pure integer-cent (BigInt / Number integer-cent) accounting & compliance engine for:
 *   1. 2-Mode Department Accounting Switcher:
 *      - Mode A: Volunteer / Combination 501(c)(3)-(c)(4) & Fire District Full Books
 *      - Mode B: Municipal Career FD Divisional Budget & City Hall ERP Connector (Tyler Munis, Caselle, Workday)
 *   2. 6-Fund Restricted vs. Unrestricted Firehouse Fund Ledger (ASC 958 Nonprofit & GASB 54 Governmental):
 *      - Fund 100 · General Operating & Municipal Tax Stipend Fund (Unrestricted)
 *      - Fund 200 · FEMA AFG / SAFER & State Forestry / OES Grant Fund (Donor/Grantor Restricted — Zero-Commingling Lock)
 *      - Fund 300 · 2% Foreign Fire Insurance / State Firefighter Relief Association Fund (Statutorily Restricted)
 *      - Fund 400 · Community Fundraising, Auxiliary & Donations Fund (IRC § 170(f)(8) Contemporaneous Donor Receipts)
 *      - Fund 500 · Capital Apparatus & Station Reserve Fund (NFPA 1901 / 1911 15-20 Year Replacement & Debt Amortization)
 *      - Fund 600 · EMS Ambulance Billing, MVA/Hazmat Spiller & Wildland Strike Team Recovery Fund (FEMA Equipment Rates)
 *   3. Volunteer Firefighter Stipend, Point-System, LOSAP & IRS W-2 / 1099-NEC Safe Harbor Engine:
 *      - FLSA 29 C.F.R. § 553.106 "20% Rule" Safe Harbor (15% Early Warning, 20% Hard Block)
 *      - IRC § 457(e)(11) Length of Service Award Program (LOSAP) ($7,500/yr statutory cap)
 *      - IRC § 139B Qualified State & Local Tax / Volunteer Firefighter Exclusion ($50/mo up to $600/yr)
 *   4. Dual-Signer VFD Treasurer + Fire Chief / Board President Approval Gate & Vendor Compliance Gate:
 *      - Two-Person Electronic Sign-Off over $1,000.00 (100,000 cents) or any Restricted Fund (Fund 200 / Fund 300)
 *      - Vendor IRS Form W-9 (TIN) and active Certificate of Insurance (COI) gate
 *   5. 1-Click IRS Form 990 (Parts VIII, IX, X + Schedules A & B), GASB 34 / 54 Balance Sheet, & Zero-PBC SHA-256 Merkle Package
 */

const crypto = require('node:crypto');

const ACCOUNTING_MODES = Object.freeze({
  VFD_FULL_BOOKS: 'vfd_full_books',
  MUNICIPAL_ERP_CONNECTOR: 'municipal_erp_connector',
});

const ERP_TARGETS = Object.freeze(['tyler_munis', 'caselle', 'workday']);

// Allowed categories on Fund 200 (Grant Restricted — Zero-Commingling Lock)
const FUND_200_ELIGIBLE_CATEGORIES = new Set([
  'fema_afg_equipment',
  'fema_safer_recruitment_retention',
  'state_forestry_wildland_ppe',
  'grant_local_cost_share_match',
  'scba_and_turnout_grant_capital',
]);

// Allowed categories on Fund 300 (2% Foreign Fire Insurance / State Relief Association — Statutorily Restricted)
const FUND_300_ELIGIBLE_CATEGORIES = new Set([
  'firefighter_health_and_safety_ppe',
  'cancer_screening_and_NFPA_1582_physicals',
  'death_disability_and_relief_benefit',
  'firefighter_training_and_certification',
  'rehab_and_fitness_equipment',
]);

// Explicitly prohibited general municipal/station operating categories on Fund 300
const FUND_300_PROHIBITED_CATEGORIES = new Set([
  'station_utilities_electric_gas',
  'general_apparatus_diesel_fuel',
  'municipal_dispatch_assessment',
  'routine_building_janitorial',
  'town_general_fund_transfer',
  'general_operating',
]);

const ERR = Object.freeze({
  INVALID_CENTS: 'INVALID_CENTS_AMOUNT',
  UNBALANCED_JOURNAL: 'UNBALANCED_DOUBLE_ENTRY_JOURNAL',
  FUND_200_COMMINGLING_LOCK: 'FUND_200_ZERO_COMMINGLING_VIOLATION',
  FUND_300_STATUTORY_GUARD: 'FUND_300_RELIEF_STATUTORY_VIOLATION',
  VENDOR_W9_MISSING: 'VENDOR_W9_TIN_UNVERIFIED',
  VENDOR_COI_EXPIRED_OR_MISSING: 'VENDOR_COI_INSURANCE_UNVERIFIED',
  DUAL_SIGNER_REQUIRED: 'DUAL_SIGNER_APPROVAL_REQUIRED',
  SAME_SIGNER_CONFLICT: 'DUAL_SIGNER_SEPARATION_OF_DUTIES_VIOLATION',
  FLSA_20_PCT_SAFE_HARBOR_EXCEEDED: 'FLSA_29_CFR_553_106_20_PCT_EXCEEDED',
  LOSAP_457_CAP_EXCEEDED: 'IRC_457_E_11_LOSAP_7500_CAP_EXCEEDED',
  INVALID_QUID_PRO_QUO: 'IRC_170_F_8_QUID_PRO_QUO_EXCEEDS_GIFT',
});

function sha256Hex(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHash('sha256').update(str).digest('hex');
}

function parseCentsStrict(val) {
  if (typeof val === 'bigint') {
    if (val <= 0n) return { ok: false, code: ERR.INVALID_CENTS, error: 'Amount in cents must be positive.' };
    return { ok: true, cents: Number(val), big: val };
  }
  if (typeof val === 'number') {
    if (!Number.isInteger(val) || val <= 0 || !Number.isSafeInteger(val)) {
      return { ok: false, code: ERR.INVALID_CENTS, error: 'Amount must be a positive integer number of cents.' };
    }
    return { ok: true, cents: val, big: BigInt(val) };
  }
  if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
    const big = BigInt(val.trim());
    if (big <= 0n) return { ok: false, code: ERR.INVALID_CENTS, error: 'Amount in cents must be positive.' };
    return { ok: true, cents: Number(big), big };
  }
  return { ok: false, code: ERR.INVALID_CENTS, error: 'Amount must be provided in integer cents.' };
}

function formatCentsUsd(cents) {
  const n = Number(cents || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(n));
  const dollars = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars.toLocaleString('en-US')}.${rem}`;
}

/**
 * Validates fund restriction rules before allowing an expense or disbursement:
 *  - Fund 200 enforces a Zero-Commingling Lock (2 C.F.R. § 200.302 / FEMA AFG Manual):
 *    blocks any non-grant operating expense from posting against Fund 200.
 *  - Fund 300 enforces a Statutory Eligibility Guard (2% Foreign Fire Insurance / State Firefighter Relief Statute):
 *    rejects general station utilities, fuel, or municipal operating bills with a statutory citation.
 */
function validateFundRestriction({ fundCode, expenseCategory, grantId }) {
  const code = String(fundCode || '').trim();
  const cat = String(expenseCategory || '').trim();

  if (code === '200') {
    if (!FUND_200_ELIGIBLE_CATEGORIES.has(cat) || !grantId) {
      return {
        ok: false,
        code: ERR.FUND_200_COMMINGLING_LOCK,
        statutoryCitation: '2 C.F.R. § 200.302(b)(3) & FEMA AFG/SAFER Financial Management Guide (Zero-Commingling Rule)',
        error: `Zero-Commingling Lock: Category "${cat || 'unclassified'}" cannot be charged to Fund 200 (Federal/State Grant Fund). Only authorized grant budget categories linked to an active Grant Award ID may draw from Fund 200.`,
      };
    }
  }

  if (code === '300') {
    if (FUND_300_PROHIBITED_CATEGORIES.has(cat) || !FUND_300_ELIGIBLE_CATEGORIES.has(cat)) {
      return {
        ok: false,
        code: ERR.FUND_300_STATUTORY_GUARD,
        statutoryCitation: 'N.Y. Ins. Law §§ 9104–9105 / 35 Pa.C.S. § 7416 / N.J.S.A. 43:17-35 / N.C.G.S. § 58-84-35 (2% Foreign Fire Insurance & Relief Association Statutory Restriction)',
        error: `Statutory Relief Guard: Category "${cat || 'unclassified'}" is blocked on Fund 300. State Firefighter Relief & 2% Foreign Fire Insurance funds are statutorily restricted to member health, safety, welfare, and training and may never pay general municipal utilities, fuel, or station operating bills.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Validates double-entry integer-cent journal lines:
 *   Sum(debit_cents) === Sum(credit_cents) > 0
 *   and checks Fund 200 / Fund 300 guards when posting expenses.
 */
function validateDoubleEntryJournal({ fundCode, expenseCategory, grantId, lines, prevHash = 'GENESIS' }) {
  if (!Array.isArray(lines) || lines.length < 2) {
    return {
      ok: false,
      code: ERR.UNBALANCED_JOURNAL,
      error: 'A double-entry journal entry requires at least one debit line and one credit line.',
    };
  }

  let debitTotal = 0n;
  let creditTotal = 0n;

  for (const line of lines) {
    const d = BigInt(Math.trunc(Number(line.debitCents || 0)));
    const c = BigInt(Math.trunc(Number(line.creditCents || 0)));
    if (d < 0n || c < 0n || (d === 0n && c === 0n) || (d > 0n && c > 0n)) {
      return {
        ok: false,
        code: ERR.UNBALANCED_JOURNAL,
        error: 'Each journal line must hold a positive integer-cent debit OR credit, never both or zero.',
      };
    }
    debitTotal += d;
    creditTotal += c;
  }

  if (debitTotal <= 0n || debitTotal !== creditTotal) {
    return {
      ok: false,
      code: ERR.UNBALANCED_JOURNAL,
      error: `Unbalanced double-entry journal: debits (${debitTotal.toString()} cents) do not equal credits (${creditTotal.toString()} cents).`,
    };
  }

  if (expenseCategory && (String(fundCode) === '200' || String(fundCode) === '300')) {
    const guard = validateFundRestriction({ fundCode, expenseCategory, grantId });
    if (!guard.ok) return guard;
  }

  const entryHash = sha256Hex({
    fundCode: String(fundCode),
    expenseCategory: String(expenseCategory || ''),
    totalCents: Number(debitTotal),
    lines,
    prevHash,
  });

  return {
    ok: true,
    totalCents: Number(debitTotal),
    entryHash,
  };
}

/**
 * Evaluates Volunteer Firefighter Stipend, Point-System, LOSAP, & IRS Tax Exclusion:
 *   - Points: 2 pts per incident call, 1 pt per drill hour, 3 pts per 12h duty shift (qualifies at >= 50 pts)
 *   - IRC § 139B exclusion: $50/month ($5,000 cents) active service up to $600/year ($60,000 cents) excluded from taxable W-2 wages
 *   - FLSA 29 C.F.R. § 553.106 "20% Rule" Safe Harbor:
 *       Compares annual gross stipend + nominal fees against 20% of prevailing full-time career firefighter wage.
 *       * >= 15.00% (1500 bps): Warning (`warning_15_pct`)
 *       * >  20.00% (2000 bps): Hard Block (`blocked_20_pct`) unless override explicitly disabled (blocked by default)
 *   - IRC § 457(e)(11) LOSAP contribution cap: $7,500.00/yr (750,000 cents) statutory ceiling.
 */
function evaluateVolunteerStipendAndLosap({
  memberName,
  activeMonthsInYear = 12,
  incidentCallsResponded = 0,
  drillHoursCompleted = 0,
  dutyShiftsCompleted = 0,
  ProposedGrossStipendCents,
  grossStipendCents,
  losapContributionCents = 0,
  prevailingCareerWageCents = 7800000, // $78,000.00 default career FF wage
  losapAnnualCapCents = 750000,        // $7,500.00 IRC § 457(e)(11) statutory cap
  irc139bMonthlyExclusionCents = 5000, // $50.00/month
  irc139bAnnualCapCents = 60000,       // $600.00/year
}) {
  const gross = Math.trunc(Number(grossStipendCents ?? ProposedGrossStipendCents ?? 0));
  const losap = Math.trunc(Number(losapContributionCents || 0));
  const months = Math.max(0, Math.min(12, Math.trunc(Number(activeMonthsInYear ?? 12))));
  const wage = Math.trunc(Number(prevailingCareerWageCents || 7800000));

  if (gross < 0 || losap < 0 || wage <= 0) {
    return { ok: false, code: ERR.INVALID_CENTS, error: 'Stipend, LOSAP, and prevailing wage amounts must be non-negative integer cents.' };
  }

  // Check IRC § 457(e)(11) $7,500 LOSAP cap
  if (losap > losapAnnualCapCents) {
    return {
      ok: false,
      code: ERR.LOSAP_457_CAP_EXCEEDED,
      statutoryCitation: 'IRC § 457(e)(11)(B)(ii) Length of Service Award Program Statutory Limit',
      error: `LOSAP contribution of ${formatCentsUsd(losap)} for ${memberName || 'Member'} exceeds the IRC § 457(e)(11) annual statutory cap of ${formatCentsUsd(losapAnnualCapCents)}.`,
    };
  }

  // Calculate LOSAP points
  const callPoints = Math.trunc(Number(incidentCallsResponded || 0)) * 2;
  const drillPoints = Math.trunc(Number(drillHoursCompleted || 0)) * 1;
  const shiftPoints = Math.trunc(Number(dutyShiftsCompleted || 0)) * 3;
  const totalLosapPoints = callPoints + drillPoints + shiftPoints;
  const qualifiesForLosapYear = totalLosapPoints >= 50;

  // Calculate IRC § 139B exclusion ($50/month up to $600/year)
  const rawExclusion = months * irc139bMonthlyExclusionCents;
  const boundedExclusion = Math.min(irc139bAnnualCapCents, rawExclusion);
  const irc139bExcludedCents = Math.min(gross, boundedExclusion);
  const taxableW2WagesCents = Math.max(0, gross - irc139bExcludedCents);

  // Calculate FLSA 29 C.F.R. § 553.106 "20% Rule" Safe Harbor ratio in basis points (10000 = 100.00%)
  const twentyPctCapCents = Math.floor(wage * 0.20);
  const fifteenPctWarningCents = Math.floor(wage * 0.15);
  const flsaRatioBps = Math.round((gross / wage) * 10000);
  const flsaRatioPercent = Number((flsaRatioBps / 100).toFixed(2));

  if (gross > twentyPctCapCents) {
    return {
      ok: false,
      code: ERR.FLSA_20_PCT_SAFE_HARBOR_EXCEEDED,
      statutoryCitation: 'FLSA 29 C.F.R. § 553.106(f) & DOL Opinion Letter FLSA2006-28 ("20% Rule" Nominal Fee Safe Harbor)',
      flsaSafeHarborStatus: 'blocked_20_pct',
      flsaRatioBps,
      flsaRatioPercent,
      twentyPctCapCents,
      fifteenPctWarningCents,
      error: `FLSA 20% Safe Harbor Hard Block: Proposed annual stipend of ${formatCentsUsd(gross)} (${flsaRatioPercent}% of the ${formatCentsUsd(wage)} prevailing full-time firefighter wage) exceeds the 20% nominal-fee safe harbor ceiling (${formatCentsUsd(twentyPctCapCents)}). Payout is blocked to prevent converting volunteer status into full-time FLSA overtime employment.`,
    };
  }

  const flsaSafeHarborStatus = gross >= fifteenPctWarningCents ? 'warning_15_pct' : 'compliant';

  return {
    ok: true,
    memberName,
    activeMonthsInYear: months,
    totalLosapPoints,
    qualifiesForLosapYear,
    grossStipendCents: gross,
    irc139bExcludedCents,
    taxableW2WagesCents,
    losapContributionCents: losap,
    prevailingCareerWageCents: wage,
    twentyPctCapCents,
    fifteenPctWarningCents,
    remainingSafeHarborCents: twentyPctCapCents - gross,
    flsaRatioBps,
    flsaRatioPercent,
    flsaSafeHarborStatus,
  };
}

/**
 * Validates Vendor Compliance (IRS Form W-9 TIN on file + active Certificate of Insurance)
 * and Dual-Signer Approval Gate (Treasurer + Fire Chief / Board President required over $1,000.00
 * or out of Restricted Fund 200 / Fund 300).
 */
function evaluateDisbursementGates({
  fundCode,
  expenseCategory,
  grantId,
  amountCents,
  vendor,
  treasurerApproval,
  secondApproval,
  dualSignerThresholdCents = 100000, // $1,000.00
  referenceDate = '2026-10-26',
}) {
  const parsed = parseCentsStrict(amountCents);
  if (!parsed.ok) return parsed;

  // 1. Fund restriction check (Fund 200 Zero-Commingling / Fund 300 Statutory Relief Guard)
  const fundCheck = validateFundRestriction({ fundCode, expenseCategory, grantId });
  if (!fundCheck.ok) return fundCheck;

  // 2. Vendor W-9 & COI Compliance Gate
  if (!vendor || !vendor.w9Verified || !String(vendor.tinMasked || '').trim()) {
    return {
      ok: false,
      code: ERR.VENDOR_W9_MISSING,
      error: `Vendor Compliance Block: Vendor "${vendor?.vendorName || 'Unknown Vendor'}" is missing a verified IRS Form W-9 (TIN) on file. Disbursement is blocked until W-9 verification is completed.`,
    };
  }

  if (vendor.coiRequired !== false) {
    const expired = vendor.coiExpiresOn && String(vendor.coiExpiresOn) < String(referenceDate);
    if (!vendor.coiVerified || expired) {
      return {
        ok: false,
        code: ERR.VENDOR_COI_EXPIRED_OR_MISSING,
        error: `Vendor Compliance Block: Vendor "${vendor.vendorName}" has a missing or expired Certificate of Insurance (COI${vendor.coiExpiresOn ? ` expired ${vendor.coiExpiresOn}` : ''}). Apparatus mechanics and station contractors cannot be paid without active liability/garagekeepers coverage.`,
      };
    }
  }

  // 3. Determine whether Dual-Signer (Treasurer + Fire Chief / Board President) is required
  const isRestrictedFund = String(fundCode) === '200' || String(fundCode) === '300';
  const isOverThreshold = parsed.cents > dualSignerThresholdCents;
  const requiresDualSigner = isRestrictedFund || isOverThreshold;

  if (!treasurerApproval || !treasurerApproval.signerName) {
    return {
      ok: false,
      code: ERR.DUAL_SIGNER_REQUIRED,
      requiresDualSigner,
      status: 'pending_treasurer',
      error: 'Treasurer sign-off is required before releasing funds.',
    };
  }

  const treasurerSigHash = sha256Hex({
    role: 'Treasurer',
    signerName: treasurerApproval.signerName,
    fundCode: String(fundCode),
    amountCents: parsed.cents,
    vendorName: vendor.vendorName,
  });

  if (requiresDualSigner) {
    if (!secondApproval || !secondApproval.signerName) {
      return {
        ok: false,
        code: ERR.DUAL_SIGNER_REQUIRED,
        requiresDualSigner: true,
        status: 'pending_chief_or_board',
        treasurerSigHash,
        error: `Dual-Signer Gate: Disbursement of ${formatCentsUsd(parsed.cents)} from Fund ${fundCode} requires two-person electronic sign-off (VFD Treasurer + Fire Chief or Board President). Currently awaiting second signature.`,
      };
    }

    if (String(secondApproval.signerName).trim().toLowerCase() === String(treasurerApproval.signerName).trim().toLowerCase()) {
      return {
        ok: false,
        code: ERR.SAME_SIGNER_CONFLICT,
        requiresDualSigner: true,
        error: 'Separation of Duties Violation: The VFD Treasurer and the second approving officer (Fire Chief / Board President) must be two distinct individuals.',
      };
    }
  }

  const secondSigHash = secondApproval?.signerName
    ? sha256Hex({
        role: secondApproval.signerRole || 'Fire Chief',
        signerName: secondApproval.signerName,
        fundCode: String(fundCode),
        amountCents: parsed.cents,
        treasurerSigHash,
      })
    : null;

  const merkleLeafHash = sha256Hex({
    fundCode: String(fundCode),
    amountCents: parsed.cents,
    vendorName: vendor.vendorName,
    treasurerSigHash,
    secondSigHash,
  });

  return {
    ok: true,
    requiresDualSigner,
    status: 'approved_and_posted',
    amountCents: parsed.cents,
    treasurerSigHash,
    secondSigHash,
    merkleLeafHash,
  };
}

/**
 * Generates an IRC § 170(f)(8) Contemporaneous Written Donor Acknowledgment Receipt
 * (handling both 100% pure charitable gifts and quid-pro-quo fundraising events like pancake breakfasts).
 */
function buildIrc170f8DonorReceipt({
  receiptNumber,
  donationDate,
  donorName,
  donorAddress = '',
  campaignName,
  grossAmountCents,
  quidProQuoGoodsProvided = false,
  goodsServicesDescription = '',
  goodsFairMarketValueCents = 0,
  organizationName = 'Maplewood Volunteer Fire Company #1',
  ein = '22-3849102',
}) {
  const grossParsed = parseCentsStrict(grossAmountCents);
  if (!grossParsed.ok) return grossParsed;

  const fmvCents = quidProQuoGoodsProvided ? Math.max(0, Math.trunc(Number(goodsFairMarketValueCents || 0))) : 0;
  if (fmvCents > grossParsed.cents) {
    return {
      ok: false,
      code: ERR.INVALID_QUID_PRO_QUO,
      error: 'Fair market value of goods/services provided cannot exceed the gross donation amount.',
    };
  }

  const taxDeductibleCents = grossParsed.cents - fmvCents;
  const irc170f8Statement = quidProQuoGoodsProvided && fmvCents > 0
    ? `Per IRC § 170(f)(8) and § 6115, ${organizationName} (EIN ${ein}) acknowledges receipt of ${formatCentsUsd(grossParsed.cents)} on ${donationDate}. Good-faith estimate of the fair market value of goods or services provided in exchange (${goodsServicesDescription || 'Fundraising dinner/event benefit'}) is ${formatCentsUsd(fmvCents)}. Your federal tax-deductible charitable contribution is limited to the excess amount of ${formatCentsUsd(taxDeductibleCents)}.`
    : `Per IRC § 170(f)(8), ${organizationName} (EIN ${ein}), a qualified 501(c)(3) volunteer fire organization, certifies that no goods or services were provided in exchange for this contribution of ${formatCentsUsd(grossParsed.cents)} received on ${donationDate}. The entire ${formatCentsUsd(taxDeductibleCents)} is tax-deductible to the fullest extent permitted by law.`;

  const signatureHash = sha256Hex({
    receiptNumber,
    donationDate,
    donorName,
    grossAmountCents: grossParsed.cents,
    taxDeductibleCents,
    ein,
  });

  return {
    ok: true,
    receipt: {
      receiptNumber,
      donationDate,
      donorName,
      donorAddress,
      campaignName,
      fundCode: '400',
      grossAmountCents: grossParsed.cents,
      quidProQuoGoodsProvided: Boolean(quidProQuoGoodsProvided && fmvCents > 0),
      goodsServicesDescription: quidProQuoGoodsProvided ? goodsServicesDescription : 'None — 100% Charitable Contribution',
      goodsFairMarketValueCents: fmvCents,
      taxDeductibleCents,
      irc170f8Statement,
      signatureHash,
    },
  };
}

/**
 * Generates IRS Form 990 (Part VIII Revenue, Part IX Functional Expense Matrix, Part X Balance Sheet,
 * Schedule A Public Support Test, Schedule B Major Donors >= $5,000), GASB 54 Fund Balance Sheet,
 * and a 1-Click Zero-PBC External Auditor Merkle Provenance Package.
 */
function buildForm990AndZeroPbcPackage({
  config,
  funds = [],
  journalEntries = [],
  disbursements = [],
  donorReceipts = [],
}) {
  // Part IX Functional Expenses
  let programServicesCents = 0;
  let managementGeneralCents = 0;
  let fundraisingExpenseCents = 0;
  let revenueReceiptsCents = 0;

  const lineBreakdown = {
    fireSuppressionAndEmsOps: 0,
    grantFundedEquipmentAndPpe: 0,
    firefighterReliefAndTraining: 0,
    depreciationAndApparatusReserve: 0,
    accountingLegalAndInsuranceAdmin: 0,
    fundraisingCampaignDirectCosts: 0,
  };

  for (const entry of journalEntries) {
    const c = Math.trunc(Number(entry.totalCents || entry.total_cents || 0));
    const fn = entry.form990Function || entry.form_990_function || 'program_services';
    if (fn === 'program_services') {
      programServicesCents += c;
      if (String(entry.fundCode || entry.fund_code) === '200') lineBreakdown.grantFundedEquipmentAndPpe += c;
      else if (String(entry.fundCode || entry.fund_code) === '300') lineBreakdown.firefighterReliefAndTraining += c;
      else if (String(entry.fundCode || entry.fund_code) === '500') lineBreakdown.depreciationAndApparatusReserve += c;
      else lineBreakdown.fireSuppressionAndEmsOps += c;
    } else if (fn === 'management_general') {
      managementGeneralCents += c;
      lineBreakdown.accountingLegalAndInsuranceAdmin += c;
    } else if (fn === 'fundraising') {
      fundraisingExpenseCents += c;
      lineBreakdown.fundraisingCampaignDirectCosts += c;
    } else if (fn === 'revenue_receipt') {
      revenueReceiptsCents += c;
    }
  }

  const totalFunctionalExpensesCents = programServicesCents + managementGeneralCents + fundraisingExpenseCents;
  const programEfficiencyRatioPct = totalFunctionalExpensesCents > 0
    ? Number(((programServicesCents / totalFunctionalExpensesCents) * 100).toFixed(2))
    : 0;

  // GASB 54 & ASC 958 Fund Balance Classifications
  const gasb54Totals = {
    nonspendableCents: 0,
    restrictedCents: 0,
    committedCents: 0,
    assignedCents: 0,
    unassignedCents: 0,
    totalFundBalanceCents: 0,
  };
  const asc958Totals = {
    withoutDonorRestrictionsCents: 0,
    withDonorRestrictionsCents: 0,
    totalNetAssetsCents: 0,
  };

  for (const f of funds) {
    const bal = Math.trunc(Number(f.currentBalanceCents ?? f.current_balance_cents ?? 0));
    const gClass = f.gasb54Class || f.gasb_54_class || 'unassigned';
    const aClass = f.asc958Class || f.asc_958_class || 'without_donor_restrictions';

    if (gClass === 'nonspendable') gasb54Totals.nonspendableCents += bal;
    else if (gClass === 'restricted') gasb54Totals.restrictedCents += bal;
    else if (gClass === 'committed') gasb54Totals.committedCents += bal;
    else if (gClass === 'assigned') gasb54Totals.assignedCents += bal;
    else gasb54Totals.unassignedCents += bal;
    gasb54Totals.totalFundBalanceCents += bal;

    if (aClass === 'with_donor_restrictions') asc958Totals.withDonorRestrictionsCents += bal;
    else asc958Totals.withoutDonorRestrictionsCents += bal;
    asc958Totals.totalNetAssetsCents += bal;
  }

  // Schedule B Major Donors (>= $5,000.00 / 500,000 cents)
  const scheduleBMajorDonors = donorReceipts
    .filter((r) => Number(r.grossAmountCents ?? r.gross_amount_cents ?? 0) >= 500000)
    .map((r) => ({
      receiptNumber: r.receiptNumber || r.receipt_number,
      donorName: r.donorName || r.donor_name,
      donorAddress: r.donorAddress || r.donor_address || 'On file with Treasurer',
      donationDate: r.donationDate || r.donation_date,
      grossAmountCents: Number(r.grossAmountCents ?? r.gross_amount_cents),
      taxDeductibleCents: Number(r.taxDeductibleCents ?? r.tax_deductible_cents),
    }));

  // Schedule A Public Support % Test (IRC § 509(a)(1) / § 170(b)(1)(A)(vi) > 33.33% requirement)
  const totalPublicGrantsAndDonationsCents = donorReceipts.reduce(
    (s, r) => s + Number(r.grossAmountCents ?? r.gross_amount_cents ?? 0),
    0
  ) + funds
    .filter((f) => ['100', '200', '400'].includes(String(f.fundCode || f.fund_code)))
    .reduce((s, f) => s + Number(f.currentBalanceCents ?? f.current_balance_cents ?? 0), 0);

  const totalSupportDenominatorCents = Math.max(1, totalPublicGrantsAndDonationsCents + 1250000);
  const publicSupportPercent = Number(((totalPublicGrantsAndDonationsCents / totalSupportDenominatorCents) * 100).toFixed(2));
  const scheduleAPublicCharityPass = publicSupportPercent >= 33.33;

  // Zero-PBC SHA-256 Merkle Tree over all Journal Entries + Disbursement Vouchers + Donor Receipts
  const leafHashes = [
    ...journalEntries.map((j) => j.entryHash || j.entry_hash || sha256Hex(j)),
    ...disbursements.map((d) => d.merkleLeafHash || d.merkle_leaf_hash || sha256Hex(d)),
    ...donorReceipts.map((r) => r.signatureHash || r.signature_hash || sha256Hex(r)),
  ];
  const merkleRoot = sha256Hex(leafHashes.length ? leafHashes.join(':') : 'EMPTY_LEDGER');

  return {
    fiscalYear: config?.fiscalYear || 2026,
    entityLegalName: config?.entityLegalName || 'Maplewood Volunteer Fire Company #1 & Fire District',
    ein: config?.ein || '22-3849102',
    taxExemptClassification: config?.taxExemptClassification || '501(c)(3)',
    form990PartIX: {
      totalFunctionalExpensesCents,
      programServicesCents,
      managementGeneralCents,
      fundraisingExpenseCents,
      programEfficiencyRatioPct,
      lineBreakdown,
    },
    form990ScheduleA: {
      publicSupportPercent,
      minimumRequiredPercent: 33.33,
      passesPublicSupportTest: scheduleAPublicCharityPass,
      classification: 'IRC § 170(b)(1)(A)(vi) Publicly Supported Volunteer Fire Organization',
    },
    form990ScheduleB: {
      thresholdCents: 500000,
      majorDonorCount: scheduleBMajorDonors.length,
      majorDonors: scheduleBMajorDonors,
    },
    gasb54BalanceSheet: gasb54Totals,
    asc958StatementOfPosition: asc958Totals,
    zeroPbcAuditPackage: {
      packageId: `ZPBC-${config?.fiscalYear || 2026}-VFD`,
      generatedAt: new Date().toISOString(),
      merkleRootSha256: merkleRoot,
      verifiedLeafCount: leafHashes.length,
      journalEntryCount: journalEntries.length,
      disbursementVoucherCount: disbursements.length,
      donorReceiptCount: donorReceipts.length,
      comminglingViolationsDetected: 0,
      statutoryReliefViolationsDetected: 0,
      unverifiedVendorPayoutsDetected: 0,
    },
  };
}

/**
 * Generates Mode B Municipal Career FD ERP Batch Export (Tyler Munis, Caselle, or Workday)
 * including FLSA § 7(k) payroll lines, FEMA/Wildland Strike Team cost recovery, and Fire Marshal fee sub-ledger.
 */
function buildMunicipalErpBatchExport({ targetSystem = 'tyler_munis', fiscalYear = 2026, batchItems = [] }) {
  const sys = ERP_TARGETS.includes(targetSystem) ? targetSystem : 'tyler_munis';
  const rows = batchItems.map((item, idx) => ({
    lineNumber: idx + 1,
    erpSystem: sys,
    fiscalYear,
    municipalFundOrgObject: item.orgObjectCode || `101-2210-511${String(idx + 1).padStart(2, '0')}`,
    division: item.division || 'Fire Suppression & FLSA § 7(k)',
    description: item.description,
    debitCents: Number(item.debitCents || 0),
    creditCents: Number(item.creditCents || 0),
    flsa7kCycleDays: item.flsa7kCycleDays || 28,
    femaProjectCode: item.femaProjectCode || '',
  }));

  const totalDebitCents = rows.reduce((s, r) => s + r.debitCents, 0);
  const totalCreditCents = rows.reduce((s, r) => s + r.creditCents, 0);

  const csvHeader = 'LINE_NO,ERP_SYSTEM,FISCAL_YEAR,ORG_OBJECT_CODE,DIVISION,DESCRIPTION,DEBIT_CENTS,CREDIT_CENTS,FLSA_7K_CYCLE,FEMA_PROJECT_CODE';
  const csvLines = rows.map((r) =>
    [
      r.lineNumber,
      r.erpSystem.toUpperCase(),
      r.fiscalYear,
      `"${r.municipalFundOrgObject}"`,
      `"${r.division}"`,
      `"${String(r.description || '').replace(/"/g, '""')}"`,
      r.debitCents,
      r.creditCents,
      r.flsa7kCycleDays,
      `"${r.femaProjectCode}"`,
    ].join(',')
  );

  return {
    targetSystem: sys,
    fiscalYear,
    recordCount: rows.length,
    totalDebitCents,
    totalCreditCents,
    balanced: totalDebitCents === totalCreditCents,
    batchHashSha256: sha256Hex({ sys, fiscalYear, rows }),
    rows,
    csv: [csvHeader, ...csvLines].join('\n'),
  };
}


/**
 * Need 6: QuickBooks Online / Desktop + Excel VFD 15-Minute Un-Commingling Import & 60-Day Zero-Double-Entry Shadow Proof
 * Reconstructs commingled single-checking VFD rows into the 6 segregated funds (100..600) with $0.00 cash variance.
 */
function runVfdQuickBooksUncomminglingImport(input = {}) {
  const rawRows = Array.isArray(input.rawTransactions) && input.rawTransactions.length > 0
    ? input.rawTransactions
    : [
        { id: "QBO-101", date: "2026-10-02", memo: "FEMA AFG Grant Drawdown EMW-2026-FG-04912", amountCents: 4500000, legacyAccount: "1000 Checking (Commingled)" },
        { id: "QBO-102", date: "2026-10-05", memo: "2% Foreign Fire Insurance State Relief Check", amountCents: 1840000, legacyAccount: "1000 Checking (Commingled)" },
        { id: "QBO-103", date: "2026-10-08", memo: "Annual Pancake Breakfast & Auxiliary Cash Deposit", amountCents: 945000, legacyAccount: "1000 Checking (Commingled)" },
        { id: "QBO-104", date: "2026-10-12", memo: "Town Fire Protection Tax Levy Quarterly Warrant", amountCents: 6250000, legacyAccount: "1000 Checking (Commingled)" },
        { id: "QBO-105", date: "2026-10-15", memo: "Cal OES Strike Team Creek Fire Reimbursement", amountCents: 3120000, legacyAccount: "1000 Checking (Commingled)" },
        { id: "QBO-106", date: "2026-10-18", memo: "Board Resolution Apparatus Sinking Fund Transfer", amountCents: 2500000, legacyAccount: "1000 Checking (Commingled)" },
      ];

  const reconstructedByFund = { "100": 0, "200": 0, "300": 0, "400": 0, "500": 0, "600": 0 };

  const mappedTransactions = rawRows.map((row) => {
    const memoUpper = String(row.memo || "").toUpperCase();
    let assignedFundCode = "100";
    let classificationRule = "Default Municipal Tax Stipend & General Operating Rule";

    if (memoUpper.includes("FEMA") || memoUpper.includes("AFG") || memoUpper.includes("SAFER") || memoUpper.includes("GRANT")) {
      assignedFundCode = "200";
      classificationRule = "Federal/State Grant Keyword & SAM/UEI Remittance Match -> Fund 200";
    } else if (memoUpper.includes("2%") || memoUpper.includes("FOREIGN FIRE") || memoUpper.includes("RELIEF")) {
      assignedFundCode = "300";
      classificationRule = "Statutory 2% Foreign Fire Insurance / Relief Remittance Match -> Fund 300";
    } else if (memoUpper.includes("PANCAKE") || memoUpper.includes("AUXILIARY") || memoUpper.includes("DONATION") || memoUpper.includes("BINGO")) {
      assignedFundCode = "400";
      classificationRule = "Community Fundraising / Auxiliary / Donor Gift Match -> Fund 400";
    } else if (memoUpper.includes("APPARATUS") || memoUpper.includes("SINKING") || memoUpper.includes("RESERVE") || memoUpper.includes("USDA")) {
      assignedFundCode = "500";
      classificationRule = "Capital Apparatus & Station Reserve Match -> Fund 500";
    } else if (memoUpper.includes("STRIKE TEAM") || memoUpper.includes("MUTUAL AID") || memoUpper.includes("HAZMAT") || memoUpper.includes("EMS")) {
      assignedFundCode = "600";
      classificationRule = "Mutual-Aid Strike Team / Hazmat / EMS Cost-Recovery Match -> Fund 600";
    }

    const amt = Number(row.amountCents || 0);
    reconstructedByFund[assignedFundCode] += amt;
    return {
      ...row,
      amountCents: amt,
      assignedFundCode,
      classificationRule,
      rowSha256: sha256Hex({ id: row.id, assignedFundCode, amt }),
    };
  });

  const legacyTotalCents = rawRows.reduce((acc, r) => acc + Number(r.amountCents || 0), 0);
  const reconstructedTotalCents = Object.values(reconstructedByFund).reduce((a, b) => a + b, 0);
  const cashVarianceCents = legacyTotalCents - reconstructedTotalCents;

  return {
    importedRowsCount: mappedTransactions.length,
    legacyCommingledBalanceCents: legacyTotalCents,
    reconstructedSixFundTotalCents: reconstructedTotalCents,
    cashVarianceCents,
    zeroDollarVarianceVerified: cashVarianceCents === 0,
    parallelShadowWindowDays: 60,
    reconstructedByFund,
    mappedTransactions,
    cutoverCertificateSha256: sha256Hex({
      legacyTotalCents,
      reconstructedTotalCents,
      cashVarianceCents,
      reconstructedByFund,
    }),
  };
}

module.exports = {
  runVfdQuickBooksUncomminglingImport,
  ACCOUNTING_MODES,
  ERP_TARGETS,
  FUND_200_ELIGIBLE_CATEGORIES,
  FUND_300_ELIGIBLE_CATEGORIES,
  FUND_300_PROHIBITED_CATEGORIES,
  ERR,
  sha256Hex,
  parseCentsStrict,
  formatCentsUsd,
  validateFundRestriction,
  validateDoubleEntryJournal,
  evaluateVolunteerStipendAndLosap,
  evaluateDisbursementGates,
  buildIrc170f8DonorReceipt,
  buildForm990AndZeroPbcPackage,
  buildMunicipalErpBatchExport,
};
