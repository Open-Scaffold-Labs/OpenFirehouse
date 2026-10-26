'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ERR,
  validateFundRestriction,
  validateDoubleEntryJournal,
  evaluateVolunteerStipendAndLosap,
  evaluateDisbursementGates,
  buildIrc170f8DonorReceipt,
  buildMunicipalErpBatchExport,
  runVfdQuickBooksUncomminglingImport,
} = require('../utils/vfdBooksEngine');

describe('vfdBooksEngine — Volunteer Fire Department & Fire Protection District Books (t3026u)', () => {
  it('1. enforces Fund 200 (FEMA Grant) Zero-Commingling Lock and Fund 300 (2% Foreign Fire Relief) Statutory Guard', () => {
    const allowedGrant = validateFundRestriction({
      fundCode: '200',
      expenseCategory: 'fema_afg_equipment',
      grantId: 'EMW-2025-FG-04192',
    });
    assert.equal(allowedGrant.ok, true);

    const blockedGrant = validateFundRestriction({
      fundCode: '200',
      expenseCategory: 'station_utilities_electric_gas',
      grantId: 'EMW-2025-FG-04192',
    });
    assert.equal(blockedGrant.ok, false);
    assert.equal(blockedGrant.code, ERR.FUND_200_COMMINGLING_LOCK);

    const blockedRelief = validateFundRestriction({
      fundCode: '300',
      expenseCategory: 'station_utilities_electric_gas',
    });
    assert.equal(blockedRelief.ok, false);
    assert.equal(blockedRelief.code, ERR.FUND_300_STATUTORY_GUARD);
  });

  it('2. enforces integer-cent double-entry balance (debits === credits)', () => {
    const balanced = validateDoubleEntryJournal({
      fundCode: '100',
      expenseCategory: 'general_operating',
      lines: [
        { accountCode: '5100', debitCents: 145000, creditCents: 0 },
        { accountCode: '1010', debitCents: 0, creditCents: 145000 },
      ],
    });
    assert.equal(balanced.ok, true);
    assert.equal(balanced.totalCents, 145000);

    const unbalanced = validateDoubleEntryJournal({
      fundCode: '100',
      expenseCategory: 'general_operating',
      lines: [
        { accountCode: '5100', debitCents: 145000, creditCents: 0 },
        { accountCode: '1010', debitCents: 0, creditCents: 140000 },
      ],
    });
    assert.equal(unbalanced.ok, false);
    assert.equal(unbalanced.code, ERR.UNBALANCED_JOURNAL);
  });

  it('3. enforces DOL FLSA 29 C.F.R. § 553.106 20% Nominal Fee ceiling, IRC § 139B ($600/yr) tax exclusion, and IRC § 457(e)(11) LOSAP ($7,500 cap)', () => {
    const safe = evaluateVolunteerStipendAndLosap({
      prevailingCareerWageCents: 7800000, // $78,000 -> 20% ceiling is $15,600 (1,560,000 cents)
      grossStipendCents: 420000, // $4,200
      activeMonthsInYear: 12,
      losapContributionCents: 240000, // $2,400
    });
    assert.equal(safe.ok, true);
    assert.equal(safe.flsaSafeHarborStatus, 'compliant');
    assert.equal(safe.irc139bExcludedCents, 60000); // $600 excluded
    assert.equal(safe.taxableW2WagesCents, 360000); // $3,600 taxable

    const breached = evaluateVolunteerStipendAndLosap({
      prevailingCareerWageCents: 7800000,
      grossStipendCents: 1700000, // $17,000 > $15,600 20% ceiling
      activeMonthsInYear: 12,
      losapContributionCents: 240000,
    });
    assert.equal(breached.ok, false);
    assert.equal(breached.code, ERR.FLSA_20_PCT_SAFE_HARBOR_EXCEEDED);
  });

  it('4. enforces Dual-Signer VFD Treasurer + Fire Chief/Board President gate over $1,000 or on Restricted Funds + W-9/COI gate', () => {
    const vendorOk = {
      vendorName: 'Pierce Apparatus Service',
      w9Verified: true,
      tinMasked: '**-***4819',
      coiRequired: true,
      coiVerified: true,
      coiExpiresOn: '2027-06-30',
    };

    const needsSecondSigner = evaluateDisbursementGates({
      fundCode: '100',
      expenseCategory: 'general_operating',
      amountCents: 250000, // $2,500 > $1,000 threshold
      dualSignerThresholdCents: 100000,
      vendor: vendorOk,
      treasurerApproval: { signerName: 'Treasurer Jane Doe' },
      secondApproval: null,
    });
    assert.equal(needsSecondSigner.ok, false);
    assert.equal(needsSecondSigner.requiresDualSigner, true);
    assert.equal(needsSecondSigner.status, 'pending_chief_or_board');

    const fullySigned = evaluateDisbursementGates({
      fundCode: '200',
      expenseCategory: 'fema_afg_equipment',
      grantId: 'EMW-2025-FG-04192',
      amountCents: 450000,
      dualSignerThresholdCents: 100000,
      vendor: vendorOk,
      treasurerApproval: { signerName: 'Treasurer Jane Doe' },
      secondApproval: { signerName: 'Fire Chief Matt Lavin', signerRole: 'Fire Chief' },
    });
    assert.equal(fullySigned.ok, true);
    assert.equal(fullySigned.status, 'approved_and_posted');
  });

  it('5. generates IRC § 170(f)(8) donor receipts, Municipal ERP export, and 15-min QBO un-commingling import', () => {
    const receipt = buildIrc170f8DonorReceipt({
      receiptNumber: 'DON-2026-0099',
      donationDate: '2026-10-26',
      donorName: 'Pine Valley Lumber',
      campaignName: 'Pancake Breakfast & Engine Fund',
      grossAmountCents: 50000,
      quidProQuoGoodsProvided: true,
      goodsServicesDescription: '4 Pancake Breakfast Tickets',
      goodsFairMarketValueCents: 4000,
      organizationName: 'Maplewood VFD',
      ein: '22-3849102',
    });
    assert.equal(receipt.ok, true);
    assert.equal(receipt.receipt.taxDeductibleCents, 46000);

    const qbo = runVfdQuickBooksUncomminglingImport({});
    assert.equal(qbo.zeroDollarVarianceVerified, true);
    assert.equal(qbo.cashVarianceCents, 0);
    assert.equal(qbo.importedRowsCount, 6);

    const erp = buildMunicipalErpBatchExport({
      targetSystem: 'tyler_munis',
      fiscalYear: 2026,
      batchItems: [
        { orgObjectCode: '101-2210-51100', division: 'Suppression', description: 'FLSA 7(k)', debitCents: 500000, creditCents: 0 },
        { orgObjectCode: '101-0000-10100', division: 'Treasury', description: 'Offset', debitCents: 0, creditCents: 500000 },
      ],
    });
    assert.equal(erp.balanced, true);
    assert.equal(erp.totalDebitCents, 500000);
  });
});
