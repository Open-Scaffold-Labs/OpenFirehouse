'use strict';
/**
 * routes/vfdBooks.js — Volunteer Fire Department & Fire Protection District Books API
 *
 * Mounted at /api/vfd-books in server/src/index.js behind requireAuth.
 * Tenant-scoped per req.user.department_id (or stationId fallback in memory store).
 * All monetary figures are stored and computed in integer cents.
 */

const express = require('express');
const router = express.Router();
const {
  ACCOUNTING_MODES,
  ERP_TARGETS,
  sha256Hex,
  parseCentsStrict,
  validateDoubleEntryJournal,
  evaluateVolunteerStipendAndLosap,
  evaluateDisbursementGates,
  buildIrc170f8DonorReceipt,
  buildForm990AndZeroPbcPackage,
  buildMunicipalErpBatchExport,
  runVfdQuickBooksUncomminglingImport,
} = require('../utils/vfdBooksEngine');

// Per-department state store seeded with authoritative, realistic VFD & Fire District records
const departmentStores = new Map();

function createInitialStore(deptId) {
  const config = {
    departmentId: deptId,
    accountingMode: ACCOUNTING_MODES.VFD_FULL_BOOKS,
    entityLegalName: 'Maplewood Volunteer Fire Company #1 & Fire Protection District',
    ein: '22-3849102',
    samUei: 'J8K4L9M2N5P1',
    samStatus: 'Active (Expires 2027-04-30)',
    taxExemptClassification: '501(c)(3) Public Charity & Special Fire District',
    fiscalYear: 2026,
    prevailingCareerWageCents: 7800000, // $78,000.00 prevailing career firefighter wage
    dualSignerThresholdCents: 100000,   // $1,000.00 dual-signer threshold
    losapAnnualCapCents: 750000,        // $7,500.00 IRC § 457(e)(11) statutory cap
    irc139bMonthlyExclusionCents: 5000, // $50.00/mo IRC § 139B exclusion
    irc139bAnnualCapCents: 60000,       // $600.00/yr IRC § 139B exclusion cap
    erpTargetSystem: 'tyler_munis',
  };

  const funds = [
    {
      fundCode: '100',
      fundName: 'Fund 100 · General Operating & Municipal Tax Stipend Fund',
      shortName: 'General Operating',
      asc958Class: 'without_donor_restrictions',
      gasb54Class: 'unassigned',
      restrictionType: 'unrestricted',
      openingBalanceCents: 24500000, // $245,000.00
      currentBalanceCents: 19845000, // $198,450.00
      encumberedCents: 1420000,      // $14,200.00
      grantAwardCents: 0,
      localMatchPercent: 0,
      localMatchRequiredCents: 0,
      localMatchMetCents: 0,
      zeroComminglingLocked: false,
      statutoryCitation: 'Town Fire Protection Contract & General Operating Millage (Unrestricted)',
      allowedUseSummary: 'Station utilities, apparatus diesel/fuel, fleet maintenance, insurance, dispatch fees, and general operations.',
    },
    {
      fundCode: '200',
      fundName: 'Fund 200 · FEMA AFG / SAFER & State Forestry / OES Grant Fund',
      shortName: 'FEMA & State Grants',
      asc958Class: 'with_donor_restrictions',
      gasb54Class: 'restricted',
      restrictionType: 'grant_restricted',
      openingBalanceCents: 18500000, // $185,000.00
      currentBalanceCents: 14250000, // $142,500.00
      encumberedCents: 3800000,      // $38,000.00
      grantAwardCents: 18500000,     // $185,000.00 FEMA AFG SCBA Award
      localMatchPercent: 5,
      localMatchRequiredCents: 925000, // $9,250.00 (5% local cost-share match)
      localMatchMetCents: 925000,      // $9,250.00 met
      zeroComminglingLocked: true,
      statutoryCitation: '2 C.F.R. § 200.302(b)(3) & FEMA AFG Award EMW-2025-FG-04192 (Zero-Commingling Lock Active)',
      allowedUseSummary: 'Strictly restricted to approved FEMA AFG SCBA replacement, SAFER recruitment/retention, and State Forestry wildland PPE.',
    },
    {
      fundCode: '300',
      fundName: 'Fund 300 · 2% Foreign Fire Insurance / State Firefighter Relief Association Fund',
      shortName: '2% Relief Association',
      asc958Class: 'with_donor_restrictions',
      gasb54Class: 'restricted',
      restrictionType: 'statutorily_restricted',
      openingBalanceCents: 6820000,  // $68,200.00
      currentBalanceCents: 5940000,  // $59,400.00
      encumberedCents: 450000,       // $4,500.00
      grantAwardCents: 0,
      localMatchPercent: 0,
      localMatchRequiredCents: 0,
      localMatchMetCents: 0,
      zeroComminglingLocked: true,
      statutoryCitation: 'N.Y. Ins. Law §§ 9104–9105 / 35 Pa.C.S. § 7416 / N.J.S.A. 43:17-35 (2% Foreign Fire Insurance Relief Statute)',
      allowedUseSummary: 'Statutorily restricted to firefighter health, safety, NFPA 1582 cancer screenings, welfare, death/disability relief, and training.',
    },
    {
      fundCode: '400',
      fundName: 'Fund 400 · Community Fundraising, Auxiliary & Donations Fund',
      shortName: 'Fundraising & Auxiliary',
      asc958Class: 'without_donor_restrictions',
      gasb54Class: 'assigned',
      restrictionType: 'unrestricted',
      openingBalanceCents: 4100000,  // $41,000.00
      currentBalanceCents: 5685000,  // $56,850.00
      encumberedCents: 210000,       // $2,100.00
      grantAwardCents: 0,
      localMatchPercent: 0,
      localMatchRequiredCents: 0,
      localMatchMetCents: 0,
      zeroComminglingLocked: false,
      statutoryCitation: 'IRC § 170(c)(1) / § 501(c)(3) Charitable Contributions & IRC § 170(f)(8) Contemporaneous Written Acknowledgments',
      allowedUseSummary: 'Pancake breakfasts, fish fries, annual residential mailer drive, and memorial gifts with automated donor tax receipts.',
    },
    {
      fundCode: '500',
      fundName: 'Fund 500 · Capital Apparatus & Station Reserve Fund',
      shortName: 'Capital Apparatus Reserve',
      asc958Class: 'without_donor_restrictions',
      gasb54Class: 'committed',
      restrictionType: 'board_committed',
      openingBalanceCents: 36000000, // $360,000.00
      currentBalanceCents: 41500000, // $415,000.00
      encumberedCents: 8450000,      // $84,500.00 annual lease-purchase debt service
      grantAwardCents: 0,
      localMatchPercent: 0,
      localMatchRequiredCents: 0,
      localMatchMetCents: 0,
      zeroComminglingLocked: false,
      statutoryCitation: 'NFPA 1901 / 1911 15–20 Year Apparatus Replacement Schedule & USDA Rural Development Lease-Purchase Reserve',
      allowedUseSummary: 'Committed multi-year apparatus sinking fund (Type 1 Engine, Aerial Ladder, Water Tender) and tax-exempt debt service.',
    },
    {
      fundCode: '600',
      fundName: 'Fund 600 · EMS Ambulance Billing, MVA/Hazmat Spiller & Wildland Strike Team Recovery Fund',
      shortName: 'EMS & Cost Recovery',
      asc958Class: 'without_donor_restrictions',
      gasb54Class: 'assigned',
      restrictionType: 'cost_recovery_assigned',
      openingBalanceCents: 7400000,  // $74,000.00
      currentBalanceCents: 9890000,  // $98,900.00
      encumberedCents: 600000,       // $6,000.00
      grantAwardCents: 0,
      localMatchPercent: 0,
      localMatchRequiredCents: 0,
      localMatchMetCents: 0,
      zeroComminglingLocked: false,
      statutoryCitation: '42 C.F.R. § 414.610 EMS Fee Schedule, State Spiller Recovery Ordinance & FEMA Schedule of Equipment Rates',
      allowedUseSummary: '3rd-party EMS ambulance billing revenue, highway MVA/Hazmat ordinance billing, and Mutual-Aid / Wildland Strike Team reimbursements.',
    },
  ];

  const vendors = [
    {
      id: 1,
      vendorCode: 'VND-101',
      vendorName: 'Pierce / Atlantic Emergency Apparatus Service LLC',
      category: 'Apparatus Mechanic & Pump Overhaul',
      w9Verified: true,
      tinMasked: 'XX-XXX4821',
      coiRequired: true,
      coiVerified: true,
      coiExpiresOn: '2027-06-30',
      coiCarrier: 'VFIS / Glatfelter Specialty Risk ($5M Garagekeepers)',
      paymentMethod: 'ACH',
    },
    {
      id: 2,
      vendorCode: 'VND-102',
      vendorName: 'MES (Municipal Emergency Services, Inc.)',
      category: 'SCBA, Turnout PPE & Thermal Imaging',
      w9Verified: true,
      tinMasked: 'XX-XXX9104',
      coiRequired: true,
      coiVerified: true,
      coiExpiresOn: '2027-09-15',
      coiCarrier: 'Travelers Commercial Inland Marine ($10M)',
      paymentMethod: 'ACH',
    },
    {
      id: 3,
      vendorCode: 'VND-103',
      vendorName: 'National MedTest Occupational Health & NFPA 1582 Clinic',
      category: 'Firefighter Physicals & Cancer Screening',
      w9Verified: true,
      tinMasked: 'XX-XXX3319',
      coiRequired: true,
      coiVerified: true,
      coiExpiresOn: '2027-03-31',
      coiCarrier: 'Chubb Healthcare Professional Liability',
      paymentMethod: 'Check',
    },
    {
      id: 4,
      vendorCode: 'VND-104',
      vendorName: 'Tri-County Heavy Truck & Welding (Unverified Vendor)',
      category: 'Apparatus Frame & Fabrication',
      w9Verified: false,
      tinMasked: '',
      coiRequired: true,
      coiVerified: false,
      coiExpiresOn: '2025-12-31',
      coiCarrier: 'Expired / Missing Certificate',
      paymentMethod: 'Check',
    },
  ];

  const journalEntries = [
    {
      id: 1,
      entryNumber: 'JE-2026-0001',
      entryDate: '2026-09-15',
      fundCode: '200',
      description: 'FEMA AFG Grant Drawdown #2 — 18 MSA G1 4500 PSI SCBA Units & Cylinders (EMW-2025-FG-04192)',
      expenseCategory: 'fema_afg_equipment',
      form990Function: 'program_services',
      form990Line: 'Part IX Line 24a — Grant-Funded Fire Suppression PPE & Breathing Apparatus',
      totalCents: 4250000, // $42,500.00
      lines: [
        { accountCode: '5210-200', accountName: 'FEMA AFG SCBA Equipment Expense', debitCents: 4250000, creditCents: 0 },
        { accountCode: '1010-200', accountName: 'Restricted Grant Checking (SAM UEI Verified)', debitCents: 0, creditCents: 4250000 },
      ],
      prevHash: 'GENESIS',
      entryHash: sha256Hex('JE-2026-0001:200:4250000:GENESIS'),
      createdByName: 'Treasurer R. Callahan',
    },
    {
      id: 2,
      entryNumber: 'JE-2026-0002',
      entryDate: '2026-09-28',
      fundCode: '300',
      description: 'Annual NFPA 1582 Firefighter Physicals & Early-Detection Cancer Ultrasound Screenings (24 Members)',
      expenseCategory: 'cancer_screening_and_NFPA_1582_physicals',
      form990Function: 'program_services',
      form990Line: 'Part IX Line 24b — Firefighter Health, Safety & Relief Association Benefits',
      totalCents: 880000, // $8,800.00
      lines: [
        { accountCode: '5320-300', accountName: '2% Foreign Fire Relief — Member Health & Cancer Screening', debitCents: 880000, creditCents: 0 },
        { accountCode: '1010-300', accountName: '2% Relief Association Dedicated Checking', debitCents: 0, creditCents: 880000 },
      ],
      prevHash: sha256Hex('JE-2026-0001:200:4250000:GENESIS'),
      entryHash: sha256Hex('JE-2026-0002:300:880000'),
      createdByName: 'Treasurer R. Callahan',
    },
    {
      id: 3,
      entryNumber: 'JE-2026-0003',
      entryDate: '2026-10-04',
      fundCode: '100',
      description: 'Engine 1 & Ladder 2 Annual UL / NFPA 1911 Pump, Aerial & Ground Ladder Certification + Preventative Service',
      expenseCategory: 'general_operating',
      form990Function: 'program_services',
      form990Line: 'Part IX Line 24a — Fire Suppression & Apparatus Fleet Maintenance',
      totalCents: 1485000, // $14,850.00
      lines: [
        { accountCode: '5140-100', accountName: 'Apparatus Maintenance & NFPA Pump/Ladder Testing', debitCents: 1485000, creditCents: 0 },
        { accountCode: '1010-100', accountName: 'General Operating Checking', debitCents: 0, creditCents: 1485000 },
      ],
      prevHash: sha256Hex('JE-2026-0002:300:880000'),
      entryHash: sha256Hex('JE-2026-0003:100:1485000'),
      createdByName: 'Treasurer R. Callahan',
    },
    {
      id: 4,
      entryNumber: 'JE-2026-0004',
      entryDate: '2026-10-10',
      fundCode: '100',
      description: 'VFIS Commercial Package, Portable Equipment, Directors & Officers + CPA Form 990 Audit Retainer',
      expenseCategory: 'general_operating',
      form990Function: 'management_general',
      form990Line: 'Part IX Line 11b/20 — Accounting, Legal & Department Insurance Administration',
      totalCents: 640000, // $6,400.00
      lines: [
        { accountCode: '5610-100', accountName: 'Management, Audit & Fiduciary Insurance', debitCents: 640000, creditCents: 0 },
        { accountCode: '1010-100', accountName: 'General Operating Checking', debitCents: 0, creditCents: 640000 },
      ],
      prevHash: sha256Hex('JE-2026-0003:100:1485000'),
      entryHash: sha256Hex('JE-2026-0004:100:640000'),
      createdByName: 'Treasurer R. Callahan',
    },
    {
      id: 5,
      entryNumber: 'JE-2026-0005',
      entryDate: '2026-10-14',
      fundCode: '400',
      description: 'Annual Town-Wide Fund Drive Mailer Printing, Postage & Pancake Breakfast Supplies',
      expenseCategory: 'fundraising_event',
      form990Function: 'fundraising',
      form990Line: 'Part IX Line 24c — Direct Fundraising Mailer & Community Event Costs',
      totalCents: 215000, // $2,150.00
      lines: [
        { accountCode: '5810-400', accountName: 'Fundraising Printing, Postage & Event Supplies', debitCents: 215000, creditCents: 0 },
        { accountCode: '1010-400', accountName: 'Fundraising & Auxiliary Checking', debitCents: 0, creditCents: 215000 },
      ],
      prevHash: sha256Hex('JE-2026-0004:100:640000'),
      entryHash: sha256Hex('JE-2026-0005:400:215000'),
      createdByName: 'Treasurer R. Callahan',
    },
  ];

  const disbursements = [
    {
      id: 1,
      voucherNumber: 'VCH-2026-0101',
      disbursementDate: '2026-09-15',
      fundCode: '200',
      vendorId: 2,
      vendorName: 'MES (Municipal Emergency Services, Inc.)',
      description: '18 MSA G1 SCBA Units & Carbon Cylinders — FEMA AFG Grant EMW-2025-FG-04192',
      expenseCategory: 'fema_afg_equipment',
      grantId: 'EMW-2025-FG-04192',
      form990Function: 'program_services',
      amountCents: 4250000, // $42,500.00
      paymentMethod: 'ACH',
      checkOrAchRef: 'ACH-20260915-8841',
      requiresDualSigner: true,
      status: 'approved_and_posted',
      treasurerSignerName: 'Treasurer R. Callahan',
      treasurerSignerRole: 'VFD Treasurer',
      treasurerSignedAt: '2026-09-15T14:10:00Z',
      treasurerSigHash: sha256Hex('VCH-2026-0101:Treasurer R. Callahan:4250000'),
      secondSignerName: 'Chief M. Donovan',
      secondSignerRole: 'Fire Chief',
      secondSignedAt: '2026-09-15T15:02:00Z',
      secondSigHash: sha256Hex('VCH-2026-0101:Chief M. Donovan:4250000'),
      journalEntryNumber: 'JE-2026-0001',
      bankSettlementRef: 'MERCURY-SETTLE-992014',
      merkleLeafHash: sha256Hex('VCH-2026-0101:APPROVED:4250000'),
    },
    {
      id: 2,
      voucherNumber: 'VCH-2026-0102',
      disbursementDate: '2026-09-28',
      fundCode: '300',
      vendorId: 3,
      vendorName: 'National MedTest Occupational Health & NFPA 1582 Clinic',
      description: 'Annual Firefighter NFPA 1582 Medical Physicals & Cancer Ultrasound Screening',
      expenseCategory: 'cancer_screening_and_NFPA_1582_physicals',
      grantId: null,
      form990Function: 'program_services',
      amountCents: 880000, // $8,800.00
      paymentMethod: 'Check',
      checkOrAchRef: 'CHK #3042',
      requiresDualSigner: true,
      status: 'approved_and_posted',
      treasurerSignerName: 'Treasurer R. Callahan',
      treasurerSignerRole: 'VFD Treasurer',
      treasurerSignedAt: '2026-09-28T11:20:00Z',
      treasurerSigHash: sha256Hex('VCH-2026-0102:Treasurer R. Callahan:880000'),
      secondSignerName: 'President D. Kowalski',
      secondSignerRole: 'Board President',
      secondSignedAt: '2026-09-28T13:45:00Z',
      secondSigHash: sha256Hex('VCH-2026-0102:President D. Kowalski:880000'),
      journalEntryNumber: 'JE-2026-0002',
      bankSettlementRef: 'MERCURY-CHK-3042',
      merkleLeafHash: sha256Hex('VCH-2026-0102:APPROVED:880000'),
    },
    {
      id: 3,
      voucherNumber: 'VCH-2026-0103',
      disbursementDate: '2026-10-24',
      fundCode: '100',
      vendorId: 1,
      vendorName: 'Pierce / Atlantic Emergency Apparatus Service LLC',
      description: 'Engine 1 Hale Qmax 1500 GPM Pump Valve Rebuild & Governor Calibration',
      expenseCategory: 'general_operating',
      grantId: null,
      form990Function: 'program_services',
      amountCents: 342000, // $3,420.00 (> $1,000 threshold -> awaiting Chief/Board 2nd sign-off!)
      paymentMethod: 'ACH',
      checkOrAchRef: 'ACH-PENDING-9102',
      requiresDualSigner: true,
      status: 'pending_chief_or_board',
      treasurerSignerName: 'Treasurer R. Callahan',
      treasurerSignerRole: 'VFD Treasurer',
      treasurerSignedAt: '2026-10-24T16:30:00Z',
      treasurerSigHash: sha256Hex('VCH-2026-0103:Treasurer R. Callahan:342000'),
      secondSignerName: null,
      secondSignerRole: null,
      secondSignedAt: null,
      secondSigHash: null,
      journalEntryNumber: null,
      bankSettlementRef: null,
      merkleLeafHash: sha256Hex('VCH-2026-0103:PENDING_SECOND:342000'),
    },
  ];

  // Seed Volunteer Firefighter Stipends, Points, LOSAP & FLSA 20% Safe Harbor records
  const rawMembers = [
    {
      id: 1,
      memberId: 101,
      memberName: 'Capt. Sarah Jenkins',
      rankTitle: 'Captain',
      activeMonthsInYear: 12,
      incidentCallsResponded: 64,
      drillHoursCompleted: 42,
      dutyShiftsCompleted: 28,
      grossStipendCents: 685000,       // $6,850.00 (8.78% of $78k — Compliant)
      losapContributionCents: 650000,  // $6,500.00 (Under $7,500 IRC § 457(e)(11) cap)
    },
    {
      id: 2,
      memberId: 102,
      memberName: 'Lt. Marcus Vance',
      rankTitle: 'Lieutenant',
      activeMonthsInYear: 12,
      incidentCallsResponded: 88,
      drillHoursCompleted: 48,
      dutyShiftsCompleted: 46,
      grossStipendCents: 1248000,      // $12,480.00 (16.00% of $78k — 15% Early Warning!)
      losapContributionCents: 750000,  // $7,500.00 (At statutory cap)
    },
    {
      id: 3,
      memberId: 103,
      memberName: 'FF/EMT Elena Rostova',
      rankTitle: 'Firefighter / EMT',
      activeMonthsInYear: 12,
      incidentCallsResponded: 52,
      drillHoursCompleted: 36,
      dutyShiftsCompleted: 18,
      grossStipendCents: 492000,       // $4,920.00 (6.31% of $78k — Compliant)
      losapContributionCents: 520000,  // $5,200.00
    },
    {
      id: 4,
      memberId: 104,
      memberName: 'FF Tyler Brooks (Probationary)',
      rankTitle: 'Probationary Firefighter',
      activeMonthsInYear: 8,
      incidentCallsResponded: 14,
      drillHoursCompleted: 16,
      dutyShiftsCompleted: 2,
      grossStipendCents: 145000,       // $1,450.00 (48 pts — 2 pts shy of 50-pt LOSAP year)
      losapContributionCents: 0,
    },
  ];

  const memberStipends = rawMembers.map((m) => {
    const evalRes = evaluateVolunteerStipendAndLosap({
      ...m,
      prevailingCareerWageCents: config.prevailingCareerWageCents,
      losapAnnualCapCents: config.losapAnnualCapCents,
      irc139bMonthlyExclusionCents: config.irc139bMonthlyExclusionCents,
      irc139bAnnualCapCents: config.irc139bAnnualCapCents,
    });
    return {
      ...m,
      ...evalRes,
    };
  });

  // Seed IRC § 170(f)(8) Donor Receipts (including Schedule B major donors >= $5,000 and quid-pro-quo pancake breakfast)
  const donorReceipts = [
    buildIrc170f8DonorReceipt({
      receiptNumber: 'DON-2026-0041',
      donationDate: '2026-09-10',
      donorName: 'Estate of Arthur & Clara Pendelton',
      donorAddress: '412 Oak Ridge Rd, Maplewood, NJ 07040',
      campaignName: 'Memorial Thermal Imaging & Rescue Tool Bequest',
      grossAmountCents: 1500000, // $15,000.00 (Schedule B Major Donor)
      quidProQuoGoodsProvided: false,
      organizationName: config.entityLegalName,
      ein: config.ein,
    }).receipt,
    buildIrc170f8DonorReceipt({
      receiptNumber: 'DON-2026-0042',
      donationDate: '2026-10-02',
      donorName: 'Maplewood Industrial Park Association LLC',
      donorAddress: '800 Commerce Blvd, Maplewood, NJ 07040',
      campaignName: 'Annual Town-Wide Fire Company Fund Drive',
      grossAmountCents: 650000, // $6,500.00 (Schedule B Major Donor)
      quidProQuoGoodsProvided: false,
      organizationName: config.entityLegalName,
      ein: config.ein,
    }).receipt,
    buildIrc170f8DonorReceipt({
      receiptNumber: 'DON-2026-0043',
      donationDate: '2026-10-18',
      donorName: 'Harrison Family Trust',
      donorAddress: '89 Highland Ave, Maplewood, NJ 07040',
      campaignName: 'Autumn Firehouse Pancake Breakfast & Station Open House (4 Benefactor Tickets)',
      grossAmountCents: 50000, // $500.00 gross
      quidProQuoGoodsProvided: true,
      goodsServicesDescription: '4 Pancake Breakfast Meals & Commemorative Maltese Cross Mug',
      goodsFairMarketValueCents: 6000, // $60.00 FMV -> $440.00 tax-deductible
      organizationName: config.entityLegalName,
      ein: config.ein,
    }).receipt,
  ];

  // Seed Fund 500 Apparatus Replacement Schedule (15-20 Year NFPA 1901 / 1911 Reserve + USDA Lease-Purchase)
  const apparatusReserveSchedule = [
    {
      unitId: 'ENG-1',
      unitName: 'Engine 1 · 2018 Pierce Enforcer 1500 GPM Type 1 Pumper',
      nfpaStandard: 'NFPA 1901 / 1911 (15-Year Frontline + 5-Year Reserve)',
      inServiceYear: 2018,
      plannedReplacementYear: 2033,
      estimatedReplacementCostCents: 92500000, // $925,000.00
      accumulatedSinkingFundCents: 21500000,   // $215,000.00
      annualReserveContributionCents: 5400000, // $54,000.00/yr
      debtInstrument: 'USDA Rural Development Community Facilities 3.25% Tax-Exempt Lease-Purchase',
      annualDebtPrincipalCents: 4850000,       // $48,500.00
      annualDebtInterestCents: 1120000,        // $11,200.00
      remainingPrincipalCents: 19400000,       // $194,000.00
    },
    {
      unitId: 'LAD-2',
      unitName: 'Ladder 2 · 2014 E-ONE Cyclone 100-ft Rear-Mount Aerial',
      nfpaStandard: 'NFPA 1901 / 1911 (20-Year Aerial Lifecycle)',
      inServiceYear: 2014,
      plannedReplacementYear: 2034,
      estimatedReplacementCostCents: 165000000, // $1,650,000.00
      accumulatedSinkingFundCents: 14200000,    // $142,000.00
      annualReserveContributionCents: 7800000,  // $78,000.00/yr
      debtInstrument: 'Municipal Tax-Exempt Equipment Lease-Purchase (Paid Off 2024)',
      annualDebtPrincipalCents: 0,
      annualDebtInterestCents: 0,
      remainingPrincipalCents: 0,
    },
    {
      unitId: 'TND-3',
      unitName: 'Tender 3 · 2021 Kenworth / Midwest 3,000-Gallon Tactical Water Tender',
      nfpaStandard: 'NFPA 1901 Rural Water Supply (20-Year Schedule)',
      inServiceYear: 2021,
      plannedReplacementYear: 2041,
      estimatedReplacementCostCents: 46000000, // $460,000.00
      accumulatedSinkingFundCents: 5800000,    // $58,000.00
      annualReserveContributionCents: 2480000, // $24,800.00/yr
      debtInstrument: 'State Volunteer Fire Assistance 2.00% Revolving Loan',
      annualDebtPrincipalCents: 2150000,       // $21,500.00
      annualDebtInterestCents: 330000,         // $3,300.00
      remainingPrincipalCents: 15050000,       // $150,500.00
    },
  ];

  // Seed Fund 600 Cost-Recovery Batches (EMS Ambulance Billing, MVA/Hazmat Ordinance, Wildland Strike Team)
  const costRecoveryItems = [
    {
      id: 'REC-2026-01',
      recoveryDate: '2026-10-05',
      stream: 'EMS 3rd-Party Ambulance Billing (ALS/BLS Transport Batch #2026-09)',
      authorityCitation: '42 C.F.R. § 414.610 Medicare/Commercial EMS Fee Schedule',
      incidentOrBatchRef: 'EMS-BATCH-2026-09 (41 Transports)',
      billedCents: 3840000,    // $38,400.00
      collectedCents: 3420000, // $34,200.00
      status: 'Settled & Reconciled to Fund 600',
    },
    {
      id: 'REC-2026-02',
      recoveryDate: '2026-10-12',
      stream: 'Interstate 280 Milepost 9.4 Commercial Tanker Diesel Spill & Extrication Recovery',
      authorityCitation: 'Township Ordinance § 14-82 (Non-Resident MVA & Hazardous Materials Spiller Cost Recovery)',
      incidentOrBatchRef: 'INC-2026-0418 (Engine 1, Rescue 4, Hazmat Support — 4.5 hrs)',
      billedCents: 685000,     // $6,850.00
      collectedCents: 685000,  // $6,850.00
      status: 'Paid by Commercial Carrier (Progressive Commercial)',
    },
    {
      id: 'REC-2026-03',
      recoveryDate: '2026-10-19',
      stream: 'Wildland Strike Team Deployment — Pine Barrens Complex (FEMA Equipment + Backfill)',
      authorityCitation: 'FEMA Schedule of Equipment Rates (Cost Code 8692 Type 3/6 Engine) & State Forestry Compact',
      incidentOrBatchRef: 'OES-STRIKE-2026-112 (72-Hour Mutual-Aid Deployment)',
      billedCents: 2490000,    // $24,900.00
      collectedCents: 1850000, // $18,500.00 partial portal drawdown
      status: 'State Portal Drawdown In Progress ($6,400.00 Balance Pending)',
    },
  ];

  // Seed Mode B Municipal Career FD Divisional Budget & City Hall ERP Connector lines
  const municipalDivisionalLines = [
    {
      orgObjectCode: '101-2210-51101',
      division: 'Career Suppression — Base Salaries & Longevity',
      adoptedBudgetCents: 485000000, // $4,850,000.00
      encumberedCents: 12000000,
      expendedYtdCents: 362000000,
      flsa7kCycleDays: 28,
      femaProjectCode: '',
    },
    {
      orgObjectCode: '101-2210-51204',
      division: 'FLSA § 7(k) (207(k)) 28-Day Cycle Scheduled & Holdover Overtime',
      adoptedBudgetCents: 64000000,  // $640,000.00
      encumberedCents: 0,
      expendedYtdCents: 49850000,
      flsa7kCycleDays: 28,
      femaProjectCode: '',
    },
    {
      orgObjectCode: '215-2240-43190',
      division: 'FEMA Public Assistance & Wildland Strike Team Portal Cost Recovery',
      adoptedBudgetCents: 45000000,  // $450,000.00
      encumberedCents: 4500000,
      expendedYtdCents: 31800000,
      flsa7kCycleDays: 28,
      femaProjectCode: 'FEMA-DR-4792-PA',
    },
    {
      orgObjectCode: '101-2230-42210',
      division: 'Fire Marshal Prevention Bureau — Life-Safety Inspection & Permit Fee Sub-Ledger',
      adoptedBudgetCents: 28500000,  // $285,000.00
      encumberedCents: 0,
      expendedYtdCents: 24120000,
      flsa7kCycleDays: 28,
      femaProjectCode: 'FI-SUBLEDGER-2026',
    },
  ];

  return {
    config,
    funds,
    vendors,
    journalEntries,
    disbursements,
    memberStipends,
    donorReceipts,
    apparatusReserveSchedule,
    costRecoveryItems,
    municipalDivisionalLines,
  };
}

function getDeptStore(req) {
  const deptId = Number(req.user?.department_id || req.user?.stationId || 1);
  if (!departmentStores.has(deptId)) {
    departmentStores.set(deptId, createInitialStore(deptId));
  }
  return departmentStores.get(deptId);
}

function computeKpis(store) {
  const totalCashAcrossFundsCents = store.funds.reduce((s, f) => s + Number(f.currentBalanceCents || 0), 0);
  const unrestrictedCashCents = store.funds
    .filter((f) => ['100', '400', '600'].includes(String(f.fundCode)))
    .reduce((s, f) => s + Number(f.currentBalanceCents || 0), 0);
  const restrictedCashCents = store.funds
    .filter((f) => ['200', '300'].includes(String(f.fundCode)))
    .reduce((s, f) => s + Number(f.currentBalanceCents || 0), 0);
  const capitalReserveCashCents = store.funds
    .filter((f) => String(f.fundCode) === '500')
    .reduce((s, f) => s + Number(f.currentBalanceCents || 0), 0);
  const pendingDualSignCount = store.disbursements.filter((d) => d.status !== 'approved_and_posted').length;
  const unverifiedVendorsCount = store.vendors.filter((v) => !v.w9Verified || !v.coiVerified).length;

  return {
    totalCashAcrossFundsCents,
    unrestrictedCashCents,
    restrictedCashCents,
    capitalReserveCashCents,
    pendingDualSignCount,
    unverifiedVendorsCount,
  };
}

// GET /api/vfd-books/summary — Complete workbench payload
router.get('/summary', (req, res) => {
  const store = getDeptStore(req);
  const form990AndAudit = buildForm990AndZeroPbcPackage({
    config: store.config,
    funds: store.funds,
    journalEntries: store.journalEntries,
    disbursements: store.disbursements,
    donorReceipts: store.donorReceipts,
  });

  res.json({
    data: {
      config: store.config,
      kpis: computeKpis(store),
      funds: store.funds,
      vendors: store.vendors,
      journalEntries: store.journalEntries,
      disbursements: store.disbursements,
      memberStipends: store.memberStipends,
      donorReceipts: store.donorReceipts,
      apparatusReserveSchedule: store.apparatusReserveSchedule,
      costRecoveryItems: store.costRecoveryItems,
      municipalDivisionalLines: store.municipalDivisionalLines,
      form990AndAudit,
    },
  });
});

// PATCH /api/vfd-books/mode — Switch between Mode A (VFD & Fire District Full Books) and Mode B (Municipal Career FD & City Hall ERP Connector)
router.patch('/mode', (req, res) => {
  const store = getDeptStore(req);
  const { accountingMode, erpTargetSystem, prevailingCareerWageCents, dualSignerThresholdCents } = req.body || {};

  if (accountingMode && !Object.values(ACCOUNTING_MODES).includes(accountingMode)) {
    return res.status(400).json({
      error: `Invalid accountingMode. Must be one of: ${Object.values(ACCOUNTING_MODES).join(', ')}`,
    });
  }
  if (erpTargetSystem && !ERP_TARGETS.includes(erpTargetSystem)) {
    return res.status(400).json({
      error: `Invalid erpTargetSystem. Must be one of: ${ERP_TARGETS.join(', ')}`,
    });
  }

  if (accountingMode) store.config.accountingMode = accountingMode;
  if (erpTargetSystem) store.config.erpTargetSystem = erpTargetSystem;
  if (prevailingCareerWageCents != null) {
    const p = parseCentsStrict(prevailingCareerWageCents);
    if (!p.ok) return res.status(400).json(p);
    store.config.prevailingCareerWageCents = p.cents;
  }
  if (dualSignerThresholdCents != null) {
    const p = parseCentsStrict(dualSignerThresholdCents);
    if (!p.ok) return res.status(400).json(p);
    store.config.dualSignerThresholdCents = p.cents;
  }

  res.json({ data: store.config });
});

// POST /api/vfd-books/journal-entries — Record a balanced double-entry integer-cent journal entry (enforcing Fund 200 & Fund 300 guards)
router.post('/journal-entries', (req, res) => {
  const store = getDeptStore(req);
  const {
    entryDate = new Date().toISOString().slice(0, 10),
    fundCode = '100',
    description,
    expenseCategory = 'general_operating',
    grantId = null,
    form990Function = 'program_services',
    form990Line = 'Part IX Line 24a — Fire Suppression & Rescue',
    lines = [],
  } = req.body || {};

  if (!description || !String(description).trim()) {
    return res.status(400).json({ error: 'Journal description is required.' });
  }

  const fund = store.funds.find((f) => f.fundCode === String(fundCode));
  if (!fund) {
    return res.status(404).json({ error: `Fund ${fundCode} not found.` });
  }

  const prevHash = store.journalEntries.length
    ? store.journalEntries[store.journalEntries.length - 1].entryHash
    : 'GENESIS';

  const validation = validateDoubleEntryJournal({
    fundCode,
    expenseCategory,
    grantId,
    lines,
    prevHash,
  });

  if (!validation.ok) {
    return res.status(422).json(validation);
  }

  const entryNumber = `JE-${store.config.fiscalYear}-${String(store.journalEntries.length + 1).padStart(4, '0')}`;
  const newEntry = {
    id: store.journalEntries.length + 1,
    entryNumber,
    entryDate,
    fundCode: String(fundCode),
    description: String(description).trim(),
    expenseCategory,
    grantId,
    form990Function,
    form990Line,
    totalCents: validation.totalCents,
    lines,
    prevHash,
    entryHash: validation.entryHash,
    createdByName: req.user?.name || 'Treasurer R. Callahan',
  };

  store.journalEntries.push(newEntry);
  if (form990Function === 'revenue_receipt') {
    fund.currentBalanceCents += validation.totalCents;
  } else if (form990Function !== 'balance_sheet_transfer') {
    fund.currentBalanceCents -= validation.totalCents;
  }

  res.status(201).json({ data: newEntry, fund });
});

// POST /api/vfd-books/disbursements — Submit a vendor check/ACH disbursement (enforces Fund 200/300 guards, W-9/COI vendor gate, and Dual-Signer gate)
router.post('/disbursements', (req, res) => {
  const store = getDeptStore(req);
  const {
    disbursementDate = new Date().toISOString().slice(0, 10),
    fundCode = '100',
    vendorId,
    payeeName,
    description,
    memo,
    expenseCategory = 'general_operating',
    grantId = null,
    form990Function = 'program_services',
    amountCents,
    paymentMethod = 'ACH',
    checkOrAchRef = '',
    treasurerSignerName = 'Treasurer R. Callahan',
    secondSignerName = null,
    secondSignerRole = 'Fire Chief',
  } = req.body || {};

  const finalDescription = String(description || memo || '').trim();
  if (!finalDescription) {
    return res.status(400).json({ error: 'Disbursement description is required.' });
  }

  let vendor = vendorId ? store.vendors.find((v) => Number(v.id) === Number(vendorId)) : null;
  if (!vendor && payeeName) {
    vendor = store.vendors.find((v) => v.vendorName.toLowerCase().includes(String(payeeName).toLowerCase())) || {
      id: 99,
      vendorCode: 'VND-ADHOC',
      vendorName: String(payeeName).trim(),
      category: 'Department Vendor',
      w9Verified: true,
      tinMasked: 'XX-XXX8821',
      coiRequired: true,
      coiVerified: true,
      coiExpiresOn: '2027-12-31',
    };
  }
  if (!vendor) {
    return res.status(404).json({ error: 'Selected vendor not found.' });
  }

  const fund = store.funds.find((f) => f.fundCode === String(fundCode));
  if (!fund) {
    return res.status(404).json({ error: `Fund ${fundCode} not found.` });
  }

  const gateResult = evaluateDisbursementGates({
    fundCode,
    expenseCategory,
    grantId,
    amountCents,
    vendor,
    treasurerApproval: treasurerSignerName ? { signerName: treasurerSignerName } : null,
    secondApproval: secondSignerName ? { signerName: secondSignerName, signerRole: secondSignerRole } : null,
    dualSignerThresholdCents: store.config.dualSignerThresholdCents,
  });

  // Hard blocks (Fund 200 commingling, Fund 300 statutory violation, Vendor missing W-9/COI, Same-signer conflict, Invalid cents)
  if (!gateResult.ok && gateResult.code !== 'DUAL_SIGNER_REQUIRED') {
    return res.status(422).json(gateResult);
  }

  const parsedAmount = parseCentsStrict(amountCents);
  const voucherNumber = `VCH-${store.config.fiscalYear}-${String(store.disbursements.length + 101).padStart(4, '0')}`;
  const isApproved = gateResult.ok && gateResult.status === 'approved_and_posted';

  let journalEntryNumber = null;
  if (isApproved) {
    const prevHash = store.journalEntries.length
      ? store.journalEntries[store.journalEntries.length - 1].entryHash
      : 'GENESIS';
    journalEntryNumber = `JE-${store.config.fiscalYear}-${String(store.journalEntries.length + 1).padStart(4, '0')}`;
    const jeLines = [
      { accountCode: `5100-${fundCode}`, accountName: `${expenseCategory} (${vendor.vendorName})`, debitCents: parsedAmount.cents, creditCents: 0 },
      { accountCode: `1010-${fundCode}`, accountName: `Fund ${fundCode} Checking`, debitCents: 0, creditCents: parsedAmount.cents },
    ];
    store.journalEntries.push({
      id: store.journalEntries.length + 1,
      entryNumber: journalEntryNumber,
      entryDate: disbursementDate,
      fundCode: String(fundCode),
      description: `${voucherNumber}: ${finalDescription}`,
      expenseCategory,
      grantId,
      form990Function,
      form990Line: 'Part IX Line 24a — Program Services Disbursement',
      totalCents: parsedAmount.cents,
      lines: jeLines,
      prevHash,
      entryHash: sha256Hex({ voucherNumber, amountCents: parsedAmount.cents, prevHash }),
      createdByName: treasurerSignerName,
    });
    fund.currentBalanceCents -= parsedAmount.cents;
  }

  const newDisbursement = {
    id: store.disbursements.length + 1,
    voucherNumber,
    disbursementDate,
    fundCode: String(fundCode),
    vendorId: vendor.id,
    vendorName: vendor.vendorName,
    description: finalDescription,
    expenseCategory,
    grantId,
    form990Function,
    amountCents: parsedAmount.cents,
    paymentMethod,
    checkOrAchRef: checkOrAchRef || `${paymentMethod.toUpperCase()}-${voucherNumber}`,
    requiresDualSigner: Boolean(gateResult.requiresDualSigner),
    status: gateResult.status,
    treasurerSignerName,
    treasurerSignerRole: 'VFD Treasurer',
    treasurerSignedAt: new Date().toISOString(),
    treasurerSigHash: gateResult.treasurerSigHash,
    secondSignerName: isApproved ? secondSignerName : null,
    secondSignerRole: isApproved ? secondSignerRole : null,
    secondSignedAt: isApproved && secondSignerName ? new Date().toISOString() : null,
    secondSigHash: isApproved ? gateResult.secondSigHash : null,
    journalEntryNumber,
    bankSettlementRef: isApproved ? `SETTLED-${voucherNumber}` : null,
    merkleLeafHash: gateResult.merkleLeafHash || sha256Hex({ voucherNumber, status: gateResult.status }),
  };

  store.disbursements.unshift(newDisbursement);
  res.status(201).json({ data: newDisbursement, gateResult });
});

// POST /api/vfd-books/disbursements/:id/co-sign — Second signature by Fire Chief or Board President
router.post('/disbursements/:id/co-sign', (req, res) => {
  const store = getDeptStore(req);
  const disb = store.disbursements.find((d) => Number(d.id) === Number(req.params.id));
  if (!disb) {
    return res.status(404).json({ error: 'Disbursement voucher not found.' });
  }
  if (disb.status === 'approved_and_posted') {
    return res.status(400).json({ error: 'Disbursement is already approved and posted.' });
  }

  const { secondSignerName = 'Chief M. Donovan', secondSignerRole = 'Fire Chief' } = req.body || {};
  const vendor = store.vendors.find((v) => Number(v.id) === Number(disb.vendorId)) || {
    vendorName: disb.vendorName,
    w9Verified: true,
    tinMasked: 'XX-XXX4821',
    coiRequired: true,
    coiVerified: true,
    coiExpiresOn: '2027-06-30',
  };

  const gateResult = evaluateDisbursementGates({
    fundCode: disb.fundCode,
    expenseCategory: disb.expenseCategory,
    grantId: disb.grantId,
    amountCents: disb.amountCents,
    vendor,
    treasurerApproval: { signerName: disb.treasurerSignerName },
    secondApproval: { signerName: secondSignerName, signerRole: secondSignerRole },
    dualSignerThresholdCents: store.config.dualSignerThresholdCents,
  });

  if (!gateResult.ok) {
    return res.status(422).json(gateResult);
  }

  disb.status = 'approved_and_posted';
  disb.secondSignerName = secondSignerName;
  disb.secondSignerRole = secondSignerRole;
  disb.secondSignedAt = new Date().toISOString();
  disb.secondSigHash = gateResult.secondSigHash;
  disb.merkleLeafHash = gateResult.merkleLeafHash;

  const prevHash = store.journalEntries.length
    ? store.journalEntries[store.journalEntries.length - 1].entryHash
    : 'GENESIS';
  const journalEntryNumber = `JE-${store.config.fiscalYear}-${String(store.journalEntries.length + 1).padStart(4, '0')}`;
  store.journalEntries.push({
    id: store.journalEntries.length + 1,
    entryNumber: journalEntryNumber,
    entryDate: disb.disbursementDate,
    fundCode: disb.fundCode,
    description: `${disb.voucherNumber}: ${disb.description}`,
    expenseCategory: disb.expenseCategory,
    grantId: disb.grantId,
    form990Function: disb.form990Function || 'program_services',
    form990Line: 'Part IX Line 24a — Dual-Signed Fire Department Disbursement',
    totalCents: disb.amountCents,
    lines: [
      { accountCode: `5100-${disb.fundCode}`, accountName: disb.description, debitCents: disb.amountCents, creditCents: 0 },
      { accountCode: `1010-${disb.fundCode}`, accountName: `Fund ${disb.fundCode} Checking`, debitCents: 0, creditCents: disb.amountCents },
    ],
    prevHash,
    entryHash: sha256Hex({ voucherNumber: disb.voucherNumber, secondSigHash: disb.secondSigHash, prevHash }),
    createdByName: `${disb.treasurerSignerName} + ${secondSignerName}`,
  });

  disb.journalEntryNumber = journalEntryNumber;
  disb.bankSettlementRef = `MERCURY-SETTLE-${disb.voucherNumber}`;

  const fund = store.funds.find((f) => f.fundCode === disb.fundCode);
  if (fund) fund.currentBalanceCents -= disb.amountCents;

  res.json({ data: disb });
});

// POST /api/vfd-books/vendors/:id/verify-compliance — Verify Vendor W-9 TIN and Certificate of Insurance (COI)
router.post('/vendors/:id/verify-compliance', (req, res) => {
  const store = getDeptStore(req);
  const vendor = store.vendors.find((v) => Number(v.id) === Number(req.params.id));
  if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

  const { tinMasked = 'XX-XXX7742', coiCarrier = 'VFIS / Travelers Commercial ($2M)', coiExpiresOn = '2027-12-31' } = req.body || {};
  vendor.w9Verified = true;
  vendor.tinMasked = tinMasked;
  vendor.coiVerified = true;
  vendor.coiCarrier = coiCarrier;
  vendor.coiExpiresOn = coiExpiresOn;

  res.json({ data: vendor });
});

// POST /api/vfd-books/stipends/evaluate — Evaluate & record Volunteer Firefighter Stipend, LOSAP & FLSA 20% Safe Harbor
router.post('/stipends/evaluate', (req, res) => {
  const store = getDeptStore(req);
  const {
    memberName,
    rankTitle = 'Firefighter',
    activeMonthsInYear = 12,
    incidentCallsResponded = 0,
    drillHoursCompleted = 0,
    dutyShiftsCompleted = 0,
    grossStipendCents,
    proposedAnnualStipendCents,
    losapContributionCents,
    proposedLosapContributionCents,
  } = req.body || {};

  if (!memberName || !String(memberName).trim()) {
    return res.status(400).json({ error: 'memberName is required.' });
  }

  const evalResult = evaluateVolunteerStipendAndLosap({
    memberName: String(memberName).trim(),
    activeMonthsInYear,
    incidentCallsResponded,
    drillHoursCompleted,
    dutyShiftsCompleted,
    grossStipendCents: grossStipendCents ?? proposedAnnualStipendCents ?? 0,
    losapContributionCents: losapContributionCents ?? proposedLosapContributionCents ?? 0,
    prevailingCareerWageCents: store.config.prevailingCareerWageCents,
    losapAnnualCapCents: store.config.losapAnnualCapCents,
    irc139bMonthlyExclusionCents: store.config.irc139bMonthlyExclusionCents,
    irc139bAnnualCapCents: store.config.irc139bAnnualCapCents,
  });

  if (!evalResult.ok) {
    return res.status(422).json(evalResult);
  }

  const existingIdx = store.memberStipends.findIndex(
    (m) => m.memberName.toLowerCase() === String(memberName).trim().toLowerCase()
  );

  const record = {
    id: existingIdx >= 0 ? store.memberStipends[existingIdx].id : store.memberStipends.length + 1,
    memberId: existingIdx >= 0 ? store.memberStipends[existingIdx].memberId : 200 + store.memberStipends.length,
    rankTitle,
    incidentCallsResponded: Number(incidentCallsResponded),
    drillHoursCompleted: Number(drillHoursCompleted),
    dutyShiftsCompleted: Number(dutyShiftsCompleted),
    ...evalResult,
  };

  if (existingIdx >= 0) {
    store.memberStipends[existingIdx] = record;
  } else {
    store.memberStipends.push(record);
  }

  res.status(201).json({ data: record });
});

// POST /api/vfd-books/donor-receipts — Issue IRC § 170(f)(8) Contemporaneous Written Donor Acknowledgment Receipt
router.post('/donor-receipts', (req, res) => {
  const store = getDeptStore(req);
  const {
    donationDate = new Date().toISOString().slice(0, 10),
    donorName,
    donorAddress = '',
    campaignName = 'Annual Community Fire Drive',
    grossAmountCents,
    quidProQuoGoodsProvided = false,
    goodsServicesDescription = '',
    goodsFairMarketValueCents = 0,
  } = req.body || {};

  if (!donorName || !String(donorName).trim()) {
    return res.status(400).json({ error: 'donorName is required.' });
  }

  const receiptNumber = `DON-${store.config.fiscalYear}-${String(store.donorReceipts.length + 41).padStart(4, '0')}`;
  const result = buildIrc170f8DonorReceipt({
    receiptNumber,
    donationDate,
    donorName: String(donorName).trim(),
    donorAddress,
    campaignName,
    grossAmountCents,
    quidProQuoGoodsProvided,
    goodsServicesDescription,
    goodsFairMarketValueCents,
    organizationName: store.config.entityLegalName,
    ein: store.config.ein,
  });

  if (!result.ok) {
    return res.status(422).json(result);
  }

  store.donorReceipts.unshift(result.receipt);
  const fund400 = store.funds.find((f) => f.fundCode === '400');
  if (fund400) fund400.currentBalanceCents += result.receipt.grossAmountCents;

  res.status(201).json({ data: result.receipt });
});

// GET /api/vfd-books/form-990-audit-package — 1-Click IRS Form 990 (Parts VIII, IX, X + Schedules A & B), GASB 54 & Zero-PBC Merkle Audit Package
router.get('/form-990-audit-package', (req, res) => {
  const store = getDeptStore(req);
  const pkg = buildForm990AndZeroPbcPackage({
    config: store.config,
    funds: store.funds,
    journalEntries: store.journalEntries,
    disbursements: store.disbursements,
    donorReceipts: store.donorReceipts,
  });
  res.json({ data: pkg });
});

// POST /api/vfd-books/erp-export — Mode B Municipal Career FD Batch Export for Tyler Munis, Caselle, or Workday
router.post('/erp-export', (req, res) => {
  const store = getDeptStore(req);
  const { targetSystem = store.config.erpTargetSystem } = req.body || {};

  const batchItems = store.municipalDivisionalLines.flatMap((line) => [
    {
      orgObjectCode: line.orgObjectCode,
      division: line.division,
      description: `${line.division} — Monthly GL & FLSA § 7(k) Batch Posting`,
      debitCents: line.expendedYtdCents,
      creditCents: 0,
      flsa7kCycleDays: line.flsa7kCycleDays,
      femaProjectCode: line.femaProjectCode,
    },
    {
      orgObjectCode: '101-0000-10100',
      division: 'City Hall Central Treasury Clearing',
      description: `Offset Clearing — ${line.orgObjectCode}`,
      debitCents: 0,
      creditCents: line.expendedYtdCents,
      flsa7kCycleDays: line.flsa7kCycleDays,
      femaProjectCode: line.femaProjectCode,
    },
  ]);

  const exportPkg = buildMunicipalErpBatchExport({
    targetSystem,
    fiscalYear: store.config.fiscalYear,
    batchItems,
  });

  res.json({ data: exportPkg });
});

// POST /api/vfd-books/qbo-import — QuickBooks Online / Desktop + Excel VFD 15-Minute Un-Commingling Import & 60-Day Shadow Proof
router.post('/qbo-import', (req, res) => {
  const result = runVfdQuickBooksUncomminglingImport(req.body || {});
  res.json({ data: result });
});

module.exports = router;
