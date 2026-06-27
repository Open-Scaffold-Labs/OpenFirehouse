'use strict';
const { payEntries: db } = require('./db');

module.exports = async function seedPayroll() {
  const existing = await db.all(1);
  if (existing.length > 0) {
    console.log(`Pay entries seed: already seeded (${existing.length} records) — skipping.`);
  } else {
  const records = [
    // ── Q1 2026 ──────────────────────────────────────────────────────────────
    { memberName: 'Nathan McGee',  memberRole: 'officer', type: 'Per-Call',           amount: 25.00, date: '2026-01-08', period: 'Q1-2026', description: 'Structure fire — 112 Elm St',                      status: 'Approved', approvedBy: 'Sarah Chen' },
    { memberName: 'Sandra Kim',  memberRole: 'officer', type: 'Per-Call',           amount: 25.00, date: '2026-01-08', period: 'Q1-2026', description: 'Structure fire — 112 Elm St',                      status: 'Approved', approvedBy: 'Sarah Chen' },
    { memberName: 'Nathan McGee',      memberRole: 'member',  type: 'Per-Call',           amount: 25.00, date: '2026-01-08', period: 'Q1-2026', description: 'Structure fire — 112 Elm St',                      status: 'Approved', approvedBy: 'Sarah Chen' },
    { memberName: 'Sarah Chen', memberRole: 'officer', type: 'Meeting Attendance', amount: 15.00, date: '2026-01-14', period: 'Q1-2026', description: 'January general meeting',                          status: 'Approved', approvedBy: 'Sarah Chen' },
    { memberName: 'Nathan McGee',  memberRole: 'officer', type: 'Meeting Attendance', amount: 15.00, date: '2026-01-14', period: 'Q1-2026', description: 'January general meeting',                          status: 'Approved', approvedBy: 'Sarah Chen' },
    { memberName: 'Nathan McGee',      memberRole: 'member',  type: 'Meeting Attendance', amount: 15.00, date: '2026-01-14', period: 'Q1-2026', description: 'January general meeting',                          status: 'Approved', approvedBy: 'Sarah Chen' },
    { memberName: 'Sandra Kim',  memberRole: 'officer', type: 'Training / Drill',   amount: 20.00, date: '2026-01-22', period: 'Q1-2026', description: 'Live burn drill — mutual aid training site',        status: 'Approved', approvedBy: 'Sarah Chen' },
    { memberName: 'Sarah Chen', memberRole: 'officer', type: 'Per-Call',           amount: 25.00, date: '2026-02-03', period: 'Q1-2026', description: 'MVA with entrapment — Route 14',                   status: 'Approved', approvedBy: 'Sarah Chen' },
    { memberName: 'Nathan McGee',      memberRole: 'member',  type: 'Per-Call',           amount: 25.00, date: '2026-02-03', period: 'Q1-2026', description: 'MVA with entrapment — Route 14',                   status: 'Approved', approvedBy: 'Sarah Chen' },
    { memberName: 'Maria Delgado',     memberRole: 'officer', type: 'Training / Drill',   amount: 20.00, date: '2026-02-12', period: 'Q1-2026', description: 'Haz-Mat operations refresher (4 hrs)',              status: 'Approved', approvedBy: 'Sarah Chen' },
    { memberName: 'Nathan McGee',  memberRole: 'officer', type: 'Meeting Attendance', amount: 15.00, date: '2026-02-11', period: 'Q1-2026', description: 'February general meeting',                         status: 'Approved', approvedBy: 'Sarah Chen' },
    { memberName: 'Nathan McGee',      memberRole: 'member',  type: 'Meeting Attendance', amount: 15.00, date: '2026-02-11', period: 'Q1-2026', description: 'February general meeting',                         status: 'Pending',  approvedBy: '' },
    { memberName: 'Sandra Kim',  memberRole: 'officer', type: 'Administrative',     amount: 15.00, date: '2026-02-20', period: 'Q1-2026', description: 'Recruitment file maintenance (2 hrs)',              status: 'Pending',  approvedBy: '' },
    { memberName: 'Sarah Chen', memberRole: 'officer', type: 'Per-Call',           amount: 25.00, date: '2026-03-01', period: 'Q1-2026', description: 'Brush fire — County Road 7',                       status: 'Pending',  approvedBy: '' },
    { memberName: 'Maria Delgado',     memberRole: 'officer', type: 'Per-Call',           amount: 25.00, date: '2026-03-01', period: 'Q1-2026', description: 'Brush fire — County Road 7',                       status: 'Pending',  approvedBy: '' },
    // ── Q2 2026 ──────────────────────────────────────────────────────────────
    { memberName: 'Sarah Chen',        memberRole: 'chief',   type: 'Per-Call',           amount: 25.00, date: '2026-04-05', period: 'Q2-2026', description: 'Brush fire — Maplewood State Forest',                 status: 'Pending',  approvedBy: '' },
    { memberName: 'Tracy Benson',      memberRole: 'member',  type: 'Per-Call',           amount: 25.00, date: '2026-04-05', period: 'Q2-2026', description: 'Brush fire — Maplewood State Forest',                 status: 'Pending',  approvedBy: '' },
    { memberName: 'Kevin Marsh',       memberRole: 'member',  type: 'Per-Call',           amount: 25.00, date: '2026-04-05', period: 'Q2-2026', description: 'Brush fire — Maplewood State Forest',                 status: 'Pending',  approvedBy: '' },
    { memberName: 'Maria Delgado',     memberRole: 'officer', type: 'Meeting Attendance', amount: 15.00, date: '2026-04-08', period: 'Q2-2026', description: 'April general meeting',                               status: 'Pending',  approvedBy: '' },
    { memberName: 'Nathan McGee',      memberRole: 'officer', type: 'Meeting Attendance', amount: 15.00, date: '2026-04-08', period: 'Q2-2026', description: 'April general meeting',                               status: 'Pending',  approvedBy: '' },
    { memberName: 'Sandra Kim',        memberRole: 'officer', type: 'Meeting Attendance', amount: 15.00, date: '2026-04-08', period: 'Q2-2026', description: 'April general meeting',                               status: 'Pending',  approvedBy: '' },
    { memberName: 'Diane Tolliver',    memberRole: 'member',  type: 'Training / Drill',   amount: 20.00, date: '2026-04-15', period: 'Q2-2026', description: 'Driver/operator pump ops refresher',                  status: 'Pending',  approvedBy: '' },
    { memberName: 'Kevin Marsh',       memberRole: 'member',  type: 'Training / Drill',   amount: 20.00, date: '2026-04-15', period: 'Q2-2026', description: 'Driver/operator pump ops refresher',                  status: 'Pending',  approvedBy: '' },
    { memberName: 'Amy Winters',       memberRole: 'member',  type: 'Per-Call',           amount: 25.00, date: '2026-04-22', period: 'Q2-2026', description: 'Medical — cardiac arrest, 45 Pine St',               status: 'Pending',  approvedBy: '' },
    { memberName: 'Lisa Fontaine',     memberRole: 'member',  type: 'Per-Call',           amount: 25.00, date: '2026-04-22', period: 'Q2-2026', description: 'Medical — cardiac arrest, 45 Pine St',               status: 'Pending',  approvedBy: '' },
    { memberName: 'James Ortega',      memberRole: 'member',  type: 'Per-Call',           amount: 25.00, date: '2026-05-02', period: 'Q2-2026', description: 'MVA with rollover — County Road 12',                 status: 'Pending',  approvedBy: '' },
    { memberName: 'Mike Harrington',   memberRole: 'member',  type: 'Per-Call',           amount: 25.00, date: '2026-05-02', period: 'Q2-2026', description: 'MVA with rollover — County Road 12',                 status: 'Pending',  approvedBy: '' },
    { memberName: 'Carlos Ruiz',       memberRole: 'member',  type: 'Training / Drill',   amount: 20.00, date: '2026-05-10', period: 'Q2-2026', description: 'Wildland fire operations field day',                  status: 'Pending',  approvedBy: '' },
    { memberName: 'Amy Winters',       memberRole: 'member',  type: 'Training / Drill',   amount: 20.00, date: '2026-05-10', period: 'Q2-2026', description: 'Wildland fire operations field day',                  status: 'Pending',  approvedBy: '' },
    { memberName: 'Sarah Chen',        memberRole: 'chief',   type: 'Meeting Attendance', amount: 15.00, date: '2026-05-13', period: 'Q2-2026', description: 'May general meeting',                                 status: 'Pending',  approvedBy: '' },
    { memberName: 'Diane Tolliver',    memberRole: 'member',  type: 'Per-Call',           amount: 25.00, date: '2026-05-25', period: 'Q2-2026', description: 'Structure fire — 88 Ridgeline Court',                status: 'Pending',  approvedBy: '' },
    { memberName: 'Nathan McGee',      memberRole: 'officer', type: 'Per-Call',           amount: 25.00, date: '2026-06-04', period: 'Q2-2026', description: 'Hazmat spill — Rt. 22 industrial area',              status: 'Pending',  approvedBy: '' },
    { memberName: 'Tracy Benson',      memberRole: 'member',  type: 'Per-Call',           amount: 25.00, date: '2026-06-04', period: 'Q2-2026', description: 'Hazmat spill — Rt. 22 industrial area',              status: 'Pending',  approvedBy: '' },
    { memberName: 'Sandra Kim',        memberRole: 'officer', type: 'Administrative',     amount: 15.00, date: '2026-06-15', period: 'Q2-2026', description: 'Quarterly budget reconciliation (3 hrs)',             status: 'Pending',  approvedBy: '' },
    { memberName: 'Maria Delgado',     memberRole: 'officer', type: 'Special Assignment', amount: 30.00, date: '2026-06-20', period: 'Q2-2026', description: 'State training officer summit — Columbus (1 day)',    status: 'Pending',  approvedBy: '' },
    // ── Q4 2025 ──────────────────────────────────────────────────────────────
    { memberName: 'Sarah Chen',        memberRole: 'chief',   type: 'Annual Stipend',     amount: 2400.00, date: '2025-12-31', period: 'Q4-2025', description: 'Annual chief stipend — FY 2025',               status: 'Paid',     approvedBy: 'Board of Directors' },
    { memberName: 'Nathan McGee',  memberRole: 'officer', type: 'Annual Stipend',     amount: 1200.00, date: '2025-12-31', period: 'Q4-2025', description: 'Annual officer stipend — FY 2025',             status: 'Paid',     approvedBy: 'Sarah Chen' },
    { memberName: 'Sandra Kim',  memberRole: 'officer', type: 'Annual Stipend',     amount: 1200.00, date: '2025-12-31', period: 'Q4-2025', description: 'Annual officer stipend — FY 2025',             status: 'Paid',     approvedBy: 'Sarah Chen' },
    { memberName: 'Nathan McGee',      memberRole: 'member',  type: 'Annual Stipend',     amount:  600.00, date: '2025-12-31', period: 'Q4-2025', description: 'Annual member stipend — FY 2025',              status: 'Paid',     approvedBy: 'Sarah Chen' },
    { memberName: 'Sarah Chen', memberRole: 'officer', type: 'Annual Stipend',     amount: 1200.00, date: '2025-12-31', period: 'Q4-2025', description: 'Annual officer stipend — FY 2025',             status: 'Paid',     approvedBy: 'Sarah Chen' },
    { memberName: 'Maria Delgado',     memberRole: 'officer', type: 'Annual Stipend',     amount: 1200.00, date: '2025-12-31', period: 'Q4-2025', description: 'Annual officer stipend — FY 2025',             status: 'Paid',     approvedBy: 'Sarah Chen' },
    { memberName: 'Nathan McGee',  memberRole: 'officer', type: 'Per-Call',           amount:   25.00, date: '2025-11-14', period: 'Q4-2025', description: 'Carbon monoxide alarm — 88 Elm Court',         status: 'Paid',     approvedBy: 'Sarah Chen' },
    { memberName: 'Nathan McGee',      memberRole: 'member',  type: 'Per-Call',           amount:   25.00, date: '2025-11-14', period: 'Q4-2025', description: 'Carbon monoxide alarm — 88 Elm Court',         status: 'Paid',     approvedBy: 'Sarah Chen' },
    { memberName: 'Maria Delgado',     memberRole: 'officer', type: 'Special Assignment', amount:   30.00, date: '2025-10-18', period: 'Q4-2025', description: 'County training officer conference — Columbus (2 days)', status: 'Paid', approvedBy: 'Sarah Chen' },
  ];

    // Map per-call/stipend fields to pay_entries schema
    const PERIOD_DATES = {
      'Q1-2026': { payPeriodStart: '2026-01-01', payPeriodEnd: '2026-03-31' },
      'Q2-2026': { payPeriodStart: '2026-04-01', payPeriodEnd: '2026-06-30' },
      'Q4-2025': { payPeriodStart: '2025-10-01', payPeriodEnd: '2025-12-31' },
    };
    for (const r of records) {
      const dates = PERIOD_DATES[r.period] || { payPeriodStart: r.date, payPeriodEnd: r.date };
      await db.create({
        memberName:     r.memberName,
        payPeriodStart: dates.payPeriodStart,
        payPeriodEnd:   dates.payPeriodEnd,
        regularHours:   0,
        overtimeHours:  0,
        grossPay:       r.amount,
        netPay:         r.amount,
        paymentDate:    r.date,
        paymentMethod:  'Check',
        notes:          `${r.type}: ${r.description}. Status: ${r.status}${r.approvedBy ? '. Approved by: ' + r.approvedBy : ''}`,
      }, 1);
    }
    console.log(`Pay entries seed: inserted ${records.length} records.`);
  }
};
