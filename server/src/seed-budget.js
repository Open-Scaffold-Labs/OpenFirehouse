'use strict';
const { budgetLines, budgetTransactions, pool } = require('./db');

module.exports = async function seedBudget() {
// ── Budget Lines ──────────────────────────────────────────────────────────────
  const existingLines = await budgetLines.all(1);
  if (existingLines.length === 0) {
    const lines = [
      { lineNumber: 'AE-101', fiscalYear: 2026, description: 'Maintenance & Repairs',             category: 'Apparatus & Equipment', budgetedAmount: 28000, status: 'Active', notes: 'Annual pump tests, aerial certifications, preventive maintenance contracts.' },
      { lineNumber: 'AE-102', fiscalYear: 2026, description: 'Fuel & Fluids',                     category: 'Apparatus & Equipment', budgetedAmount: 14000, status: 'Active', notes: 'Diesel and gasoline for all apparatus, estimated at 2026 rates.' },
      { lineNumber: 'AE-103', fiscalYear: 2026, description: 'Tools & Accessories',               category: 'Apparatus & Equipment', budgetedAmount:  8500, status: 'Active', notes: 'Replacement hose, nozzles, hand tools, and SCBA accessories.' },
      { lineNumber: 'PT-101', fiscalYear: 2026, description: 'Protective Gear / PPE',             category: 'Personnel & Training',  budgetedAmount: 18000, status: 'Active', notes: 'Turnout gear replacements, helmets, gloves, hoods. Approx 3 sets per year.' },
      { lineNumber: 'PT-102', fiscalYear: 2026, description: 'Training & Certification',          category: 'Personnel & Training',  budgetedAmount: 12000, status: 'Active', notes: 'FF1/FF2 courses, conference registrations, live-fire training evolutions.' },
      { lineNumber: 'PT-103', fiscalYear: 2026, description: 'Member Physicals',                  category: 'Personnel & Training',  budgetedAmount:  4500, status: 'Active', notes: 'Annual NFPA 1582 physicals for all active members.' },
      { lineNumber: 'FA-101', fiscalYear: 2026, description: 'Utilities',                         category: 'Facilities',            budgetedAmount:  9600, status: 'Active', notes: 'Electric, gas, water, internet. Based on prior 3-year average.' },
      { lineNumber: 'FA-102', fiscalYear: 2026, description: 'Building Maintenance',              category: 'Facilities',            budgetedAmount:  6000, status: 'Active', notes: 'Bay door service, HVAC filters, plumbing, electrical repairs.' },
      { lineNumber: 'CM-101', fiscalYear: 2026, description: 'Dispatch / PSAP Fees',              category: 'Communications',        budgetedAmount:  7200, status: 'Active', notes: 'Annual county dispatch service agreement.' },
      { lineNumber: 'CM-102', fiscalYear: 2026, description: 'IT & Software',                     category: 'Communications',        budgetedAmount:  3600, status: 'Active', notes: 'OpenFirehouse hosting (future), records management system license.' },
      { lineNumber: 'EM-101', fiscalYear: 2026, description: 'Medical Consumables',               category: 'EMS Supplies',          budgetedAmount:  5500, status: 'Active', notes: 'Gloves, bandages, IV supplies, O2 masks, disposable airway equipment.' },
      { lineNumber: 'EM-102', fiscalYear: 2026, description: 'Medications & Controlled Substances', category: 'EMS Supplies',        budgetedAmount:  2800, status: 'Active', notes: 'Narcan, aspirin, glucose, epi per standing orders. Controlled substance vault.' },
      { lineNumber: 'AD-101', fiscalYear: 2026, description: 'Insurance Premiums',                category: 'Administrative',        budgetedAmount: 16500, status: 'Active', notes: 'Liability, workers comp, apparatus, and property insurance.' },
      { lineNumber: 'AD-102', fiscalYear: 2026, description: 'Dues & Memberships',                category: 'Administrative',        budgetedAmount:  2200, status: 'Active', notes: 'NVFC, state firefighters association, NAEMSP dues.' },
      { lineNumber: 'AD-103', fiscalYear: 2026, description: 'Miscellaneous / Contingency',       category: 'Administrative',        budgetedAmount:  3000, status: 'Active', notes: 'Contingency fund for unplanned minor expenses.' },
    ];
    for (const l of lines) { await budgetLines.create(l, 1); }
    console.log(`[seed] Inserted ${lines.length} budget lines`);
  }

// ── Budget Transactions ───────────────────────────────────────────────────────
  const existingTxns = await budgetTransactions.all(1);
  // Re-seed if no transactions exist, OR if existing ones are missing 'category'
  // (happens when they were inserted before the type/category columns were added)
  const needsTxnReseed = existingTxns.length === 0 || !existingTxns[0].category;
  if (needsTxnReseed) {
    if (existingTxns.length > 0) {
      await pool.query('DELETE FROM budget_transactions WHERE station_id = $1', [1]);
      console.log('[seed] Cleared stale budget transactions (missing category column data)');
    }
    const txns = [
      { date: '2026-01-06', type: 'Expense',  category: 'Apparatus & Equipment', subcategory: 'Maintenance & Repairs',   description: 'Engine 14 — annual pump test and certification',            amount:  1850, vendor: 'Tri-State Fire Apparatus',              checkNumber: '4521',          approvedBy: 'Chief Sarah Chen',         notes: '' },
      { date: '2026-01-10', type: 'Expense',  category: 'Administrative',         subcategory: 'Insurance Premiums',      description: 'Q1 liability and property insurance premium',               amount:  4125, vendor: "Volunteer Firemen's Insurance Services", checkNumber: '4522',          approvedBy: 'Chief Sarah Chen',         notes: 'Annual policy split into quarterly payments.' },
      { date: '2026-01-15', type: 'Revenue',  category: 'Administrative',         subcategory: 'Miscellaneous',           description: 'Town annual fire protection appropriation — Q1',            amount: 30000, vendor: '',                                       checkNumber: 'ACH-012026',    approvedBy: 'Board of Directors',       notes: 'First quarter disbursement from town operating budget.' },
      { date: '2026-01-20', type: 'Expense',  category: 'Facilities',             subcategory: 'Utilities',               description: 'Station utilities — January',                               amount:   742, vendor: 'Maplewood Electric & Gas',               checkNumber: 'EFT',           approvedBy: 'Lt. Maria Santos',         notes: '' },
      { date: '2026-01-22', type: 'Expense',  category: 'Communications',         subcategory: 'Dispatch / PSAP Fees',    description: 'County dispatch services — January',                       amount:   600, vendor: 'Maplewood County PSAP',                  checkNumber: '4523',          approvedBy: 'Chief Sarah Chen',         notes: 'Monthly flat fee per intergovernmental agreement.' },
      { date: '2026-01-28', type: 'Grant',    category: 'Apparatus & Equipment',  subcategory: 'Tools & Accessories',     description: 'FEMA AFG Grant — SCBA replacement program',                amount: 22500, vendor: 'FEMA / DHS',                             checkNumber: 'Grant-AFG-2025-14', approvedBy: 'Chief Sarah Chen',     notes: '90% federal / 10% local match. Local match of $2,500 to be budgeted in Q2.' },
      { date: '2026-02-03', type: 'Expense',  category: 'Personnel & Training',   subcategory: 'Training & Certification', description: 'FF1/FF2 course registration — 3 members',                 amount:  1350, vendor: 'State Fire Academy',                     checkNumber: '4524',          approvedBy: 'Training Officer K. Osei', notes: 'Sponsored for Probationary Members Johnson, Kim, and Watts.' },
      { date: '2026-02-10', type: 'Expense',  category: 'EMS Supplies',           subcategory: 'Medical Consumables',     description: 'EMS consumable restock — Q1',                              amount:   687, vendor: 'Bound Tree Medical',                     checkNumber: '4525',          approvedBy: 'EMS Lt. N. McGee',      notes: 'IV supplies, gloves, airway disposables, gauze.' },
      { date: '2026-02-14', type: 'Donation', category: 'Personnel & Training',   subcategory: 'Protective Gear / PPE',   description: 'Donation — Maplewood Lions Club (PPE fund)',               amount:  2500, vendor: 'Maplewood Lions Club',                   checkNumber: 'Donation',      approvedBy: 'Board of Directors',       notes: 'Restricted donation toward turnout gear for new members.' },
      { date: '2026-02-18', type: 'Expense',  category: 'Facilities',             subcategory: 'Utilities',               description: 'Station utilities — February',                              amount:   814, vendor: 'Maplewood Electric & Gas',               checkNumber: 'EFT',           approvedBy: 'Lt. Maria Santos',         notes: 'Higher due to cold snap in early Feb.' },
      { date: '2026-02-20', type: 'Expense',  category: 'Communications',         subcategory: 'Dispatch / PSAP Fees',    description: 'County dispatch services — February',                      amount:   600, vendor: 'Maplewood County PSAP',                  checkNumber: '4526',          approvedBy: 'Chief Sarah Chen',         notes: '' },
      { date: '2026-02-25', type: 'Expense',  category: 'Apparatus & Equipment',  subcategory: 'Fuel & Fluids',           description: 'Fleet fuel — January & February',                          amount:  1940, vendor: 'Maplewood Municipal Fuel Depot',          checkNumber: '4527',          approvedBy: 'Chief Sarah Chen',         notes: 'Bimonthly fuel invoice.' },
      { date: '2026-03-01', type: 'Expense',  category: 'Personnel & Training',   subcategory: 'Member Physicals',        description: 'NFPA 1582 physicals — 6 members (batch 1)',                amount:  1620, vendor: 'Occupational Health Associates',          checkNumber: '4528',          approvedBy: 'Chief Sarah Chen',         notes: 'First batch of annual physicals. Remaining 8 scheduled for April.' },
      { date: '2026-03-04', type: 'Expense',  category: 'Apparatus & Equipment',  subcategory: 'Maintenance & Repairs',   description: 'Ladder 14 — outrigger position indicator repair (parts)', amount:  2340, vendor: 'Sutphen Corporation',                    checkNumber: '4529',          approvedBy: 'Chief Sarah Chen',         notes: 'Ref Work Order WO-2026-003. Critical repair, expedited.' },
      { date: '2026-03-05', type: 'Expense',  category: 'Communications',         subcategory: 'Dispatch / PSAP Fees',    description: 'County dispatch services — March',                         amount:   600, vendor: 'Maplewood County PSAP',                  checkNumber: '4530',          approvedBy: 'Chief Sarah Chen',         notes: '' },
    ];
    for (const t of txns) { await budgetTransactions.create(t, 1); }
    console.log(`[seed] Inserted ${txns.length} budget transactions`);
  }
};
