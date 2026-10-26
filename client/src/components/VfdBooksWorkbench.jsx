import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import {
  Landmark,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Users,
  Lock,
  Receipt,
  ArrowRightLeft,
  RefreshCw,
} from 'lucide-react';

function fmtUsd(cents) {
  const n = Number(cents || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(n)) / 100;
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function VfdBooksWorkbench() {
  const [summary, setSummary] = useState(null);
  const [form990Pkg, setForm990Pkg] = useState(null);
  const [qboImport, setQboImport] = useState(null);
  const [erpBatch, setErpBatch] = useState(null);
  const [activeTab, setActiveTab] = useState('funds');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // Interactive test states
  const [testFundCode, setTestFundCode] = useState('200');
  const [testCategory, setTestCategory] = useState('station_utilities_electric_gas');
  const [testAmountDollars, setTestAmountDollars] = useState('1450');
  const [testPayee, setTestPayee] = useState('Valley Electric Utility');

  const [stipendMemberName, setStipendMemberName] = useState('FF/EMT Sarah Jenkins');
  const [stipendCallPoints, setStipendCallPoints] = useState('68');
  const [stipendProposedDollars, setStipendProposedDollars] = useState('18500');

  const [donorName, setDonorName] = useState('Oak Ridge Hardware & Feed');
  const [donorGrossDollars, setDonorGrossDollars] = useState('500');
  const [donorQuidProQuo, setDonorQuidProQuo] = useState(true);
  const [donorGoodsDollars, setDonorGoodsDollars] = useState('40');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, pkgRes, qboRes] = await Promise.all([
        api.get('/api/vfd-books/summary'),
        api.get('/api/vfd-books/form-990-audit-package'),
        api.post('/api/vfd-books/qbo-import', {}),
      ]);
      setSummary(sumRes?.data || null);
      setForm990Pkg(pkgRes?.data || null);
      setQboImport(qboRes?.data || null);
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to load VFD Books workbench.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleToggleMode(mode, erpTargetSystem = 'tyler_munis') {
    try {
      await api.patch('/api/vfd-books/mode', { accountingMode: mode, erpTargetSystem });
      if (mode === 'municipal_erp_connector') {
        const exp = await api.post('/api/vfd-books/erp-export', { targetSystem: erpTargetSystem });
        setErpBatch(exp?.data || null);
      }
      await loadAll();
      setFeedback({
        type: 'ok',
        message:
          mode === 'vfd_full_books'
            ? 'Switched to Mode A: Volunteer 501(c)(3)/501(c)(4) & Fire District Full Books (Replaces QuickBooks 100%).'
            : `Switched to Mode B: Municipal Career FD Budget & City Hall ERP Connector (${erpTargetSystem.toUpperCase()}).`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Could not switch mode.' });
    }
  }

  async function handleTestDisbursement(e) {
    e.preventDefault();
    setFeedback(null);
    const amountCents = Math.round(Number(testAmountDollars || 0) * 100);
    try {
      const res = await api.post('/api/vfd-books/disbursements', {
        fundCode: testFundCode,
        expenseCategory: testCategory,
        amountCents,
        payeeName: testPayee,
        memo: `Interactive test disbursement (${testCategory})`,
        grantId: testFundCode === '200' ? 'EMW-2025-FG-04192' : null,
      });
      await loadAll();
      setFeedback({
        type: 'ok',
        message: `Disbursement ${res?.data?.voucherNumber || ''} created (${res?.data?.status}). Dual-signer required: ${res?.data?.requiresDualSigner ? 'YES' : 'NO'}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Statutory Zero-Commingling Guardrail blocked this transaction.',
      });
    }
  }

  async function handleCoSignDisbursement(id) {
    setFeedback(null);
    try {
      const res = await api.post(`/api/vfd-books/disbursements/${id}/co-sign`, {
        secondSignerName: 'Fire Chief Matt Lavin',
        secondSignerRole: 'Fire Chief',
      });
      await loadAll();
      setFeedback({
        type: 'ok',
        message: `Dual-Signer Gate satisfied! Voucher ${res?.data?.voucherNumber} sealed with @openscaffold/esign SHA-256 (${res?.data?.approvalSealSha256?.slice(0, 16)}…).`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Co-sign failed.' });
    }
  }

  async function handleEvaluateStipend(e) {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await api.post('/api/vfd-books/stipends/evaluate', {
        memberName: stipendMemberName,
        callPointsEarned: Number(stipendCallPoints || 0),
        trainingHoursCompleted: 42,
        qualifiedMonthsCount: 12,
        proposedAnnualStipendCents: Math.round(Number(stipendProposedDollars || 0) * 100),
        proposedLosapContributionCents: 240000,
      });
      await loadAll();
      setFeedback({
        type: 'ok',
        message: `Evaluated ${res?.data?.memberName}: FLSA Ratio ${res?.data?.flsaRatioPercent}% (${res?.data?.flsaStatus}) · IRC § 139B Tax-Free Exclusion ${fmtUsd(res?.data?.irc139bTaxFreeExclusionCents)}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.message || 'FLSA 29 C.F.R. § 553.106 20% Safe-Harbor Guardrail blocked stipend!',
      });
    }
  }

  async function handleCreateDonorReceipt(e) {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await api.post('/api/vfd-books/donor-receipts', {
        donorName,
        campaignName: 'Annual Pancake Breakfast & Engine Drive',
        grossAmountCents: Math.round(Number(donorGrossDollars || 0) * 100),
        quidProQuoGoodsProvided: donorQuidProQuo,
        goodsServicesDescription: donorQuidProQuo ? '4 Pancake Breakfast Tickets ($10 FMV each)' : '',
        goodsFairMarketValueCents: donorQuidProQuo ? Math.round(Number(donorGoodsDollars || 0) * 100) : 0,
      });
      await loadAll();
      setFeedback({
        type: 'ok',
        message: `Generated IRC § 170(f)(8) Receipt ${res?.data?.receiptNumber}: Deductible Gift ${fmtUsd(res?.data?.taxDeductibleAmountCents)}.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Donor receipt error.' });
    }
  }

  if (loading && !summary) {
    return (
      <div className="p-6 text-slate-300 flex items-center gap-3">
        <RefreshCw className="animate-spin" size={18} />
        <span>Loading OpenFirehouse Volunteer Fire Department &amp; Fire District Books (@openscaffold/books v3.2)…</span>
      </div>
    );
  }

  const config = summary?.config || {};
  const funds = summary?.funds || [];
  const kpis = summary?.kpis || {};
  const disbursements = summary?.disbursements || [];
  const stipends = summary?.memberStipends || [];
  const donorReceipts = summary?.donorReceipts || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Need 1: 2-Mode Toggle */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-400">
              <Landmark size={15} />
              <span>@openscaffold/books v3.2 · STD-14 Integer-Cent Engine · LO-2026-01 ESIGN</span>
            </div>
            <h1 className="text-xl font-black text-white mt-1">
              Volunteer Fire Department &amp; Fire Protection District Books
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {config.entityLegalName} · EIN {config.ein} · SAM.gov UEI {config.samUei} ({config.samStatus})
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleToggleMode('vfd_full_books')}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
                config.accountingMode === 'vfd_full_books'
                  ? 'bg-red-600 text-white border-red-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              Mode A · 501(c)(3) VFD &amp; Fire District Full Books
            </button>
            <button
              type="button"
              onClick={() => handleToggleMode('municipal_erp_connector', 'tyler_munis')}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
                config.accountingMode === 'municipal_erp_connector'
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              Mode B · Municipal City Hall ERP Connector (Tyler Munis / Caselle)
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 uppercase font-bold">Total 6-Fund Cash</div>
            <div className="text-lg font-black text-emerald-400 mt-0.5">{fmtUsd(kpis.totalCashAcrossFundsCents)}</div>
            <div className="text-[11px] text-slate-500">Unrestricted: {fmtUsd(kpis.unrestrictedCashCents)}</div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 uppercase font-bold">Restricted Grant &amp; 2% Relief</div>
            <div className="text-lg font-black text-amber-400 mt-0.5">{fmtUsd(kpis.restrictedCashCents)}</div>
            <div className="text-[11px] text-slate-500">Zero-Commingling Lock Active</div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 uppercase font-bold">Capital Apparatus Reserve</div>
            <div className="text-lg font-black text-sky-400 mt-0.5">{fmtUsd(kpis.capitalReserveCashCents)}</div>
            <div className="text-[11px] text-slate-500">NFPA 1901 Sinking Schedule</div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 uppercase font-bold">Dual-Signer Gate Queue</div>
            <div className="text-lg font-black text-white mt-0.5">{kpis.pendingDualSignCount || 0} Pending</div>
            <div className="text-[11px] text-slate-500">&gt;$1,000 or Restricted Fund</div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 uppercase font-bold">FLSA 20% Safe-Harbor</div>
            <div className="text-lg font-black text-emerald-400 mt-0.5">29 C.F.R. § 553.106</div>
            <div className="text-[11px] text-slate-500">Ceiling: {fmtUsd((config.prevailingCareerWageCents || 7800000) * 0.2)}/yr</div>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
            feedback.type === 'error'
              ? 'bg-red-950/70 border-red-700 text-red-200'
              : 'bg-emerald-950/70 border-emerald-700 text-emerald-200'
          }`}
        >
          {feedback.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Navigation Tabs for the 6 Core VFD Needs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        {[
          { id: 'funds', label: '1 · 6-Fund Ledger & Zero-Commingling Guard' },
          { id: 'stipends', label: '2 · Volunteer Stipends, FLSA 20% Guard, IRC § 139B & LOSAP' },
          { id: 'dualsigner', label: '3 · Dual-Signer Approval Gate & Donor IRC § 170(f)(8) Receipts' },
          { id: 'form990', label: '4 · 1-Click IRS Form 990 + GASB 34/54 + Town Trustee Pack' },
          { id: 'qbo', label: '5 · 15-Min QuickBooks Un-Commingling Import & City Hall ERP' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === t.id
                ? 'bg-red-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: 6-FUND LEDGER & ZERO-COMMINGLING GUARD */}
      {activeTab === 'funds' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {funds.map((f) => (
              <div key={f.fundCode} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-red-400 uppercase">{f.fundName}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      f.zeroComminglingLocked
                        ? 'bg-amber-950 text-amber-300 border border-amber-700'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                    }`}
                  >
                    {f.zeroComminglingLocked ? 'Zero-Commingling Lock' : 'Unrestricted / Designated'}
                  </span>
                </div>
                <div className="text-xl font-black text-white mt-2">{fmtUsd(f.currentBalanceCents)}</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  ASC 958: <code>{f.asc958Class}</code> · GASB 54: <code>{f.gasb54Class}</code> · Encumbered: {fmtUsd(f.encumberedCents)}
                </div>
                <div className="text-[11px] text-slate-300 mt-2">{f.allowedUseSummary}</div>
                <div className="text-[10px] text-slate-500 mt-1">{f.statutoryCitation}</div>
              </div>
            ))}
          </div>

          {/* Interactive Statutory Commingling Blocker Test */}
          <form onSubmit={handleTestDisbursement} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Lock size={16} className="text-amber-400" />
              <span>Test Statutory Zero-Commingling Blocker (Fund 200 FEMA Grant &amp; Fund 300 2% Foreign Fire Relief)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Target Fund</label>
                <select
                  value={testFundCode}
                  onChange={(e) => setTestFundCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  <option value="100">Fund 100 · General Operating</option>
                  <option value="200">Fund 200 · FEMA AFG / SAFER Grant</option>
                  <option value="300">Fund 300 · 2% Foreign Fire Relief</option>
                  <option value="500">Fund 500 · Capital Apparatus Reserve</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Expense Category</label>
                <select
                  value={testCategory}
                  onChange={(e) => setTestCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  <option value="station_utilities_electric_gas">Station Electric/Gas Bill (Prohibited in 200/300)</option>
                  <option value="fema_afg_equipment">FEMA AFG Approved SCBA Equipment (Fund 200 Allowed)</option>
                  <option value="firefighter_health_and_safety_ppe">Firefighter Safety &amp; Cancer Screening (Fund 300 Allowed)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Amount ($ USD)</label>
                <input
                  type="number"
                  value={testAmountDollars}
                  onChange={(e) => setTestAmountDollars(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Payee Vendor</label>
                <input
                  type="text"
                  value={testPayee}
                  onChange={(e) => setTestPayee(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold"
            >
              Validate &amp; Submit Voucher Against Statutory Guardrails
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: VOLUNTEER STIPENDS, FLSA 20% GUARD, IRC § 139B & LOSAP */}
      {activeTab === 'stipends' && (
        <div className="space-y-4">
          <form onSubmit={handleEvaluateStipend} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Users size={16} className="text-sky-400" />
              <span>Test DOL FLSA 29 C.F.R. § 553.106 (20% Nominal Fee Rule), IRC § 139B ($600 Tax-Free) &amp; IRC § 457(e)(11) LOSAP</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Volunteer Member</label>
                <input
                  type="text"
                  value={stipendMemberName}
                  onChange={(e) => setStipendMemberName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Call Points Earned</label>
                <input
                  type="number"
                  value={stipendCallPoints}
                  onChange={(e) => setStipendCallPoints(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Proposed Annual Stipend ($ USD — 20% Cap is $15,600 on $78k Wage)
                </label>
                <input
                  type="number"
                  value={stipendProposedDollars}
                  onChange={(e) => setStipendProposedDollars(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                />
              </div>
            </div>
            <button type="submit" className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold">
              Evaluate FLSA 20% Safe-Harbor &amp; IRC § 139B Tax Split
            </button>
          </form>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-x-auto">
            <h3 className="text-xs font-bold uppercase text-slate-400 mb-3">Active Volunteer Roster Stipend &amp; LOSAP Ledger</h3>
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2">Member</th>
                  <th className="py-2">Points</th>
                  <th className="py-2">Gross Stipend</th>
                  <th className="py-2">IRC § 139B Excluded</th>
                  <th className="py-2">Taxable W-2</th>
                  <th className="py-2">LOSAP (§ 457(e)(11))</th>
                  <th className="py-2">FLSA 20% Ratio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {stipends.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 font-bold text-white">{m.memberName}</td>
                    <td className="py-2">{m.totalPoints} pts</td>
                    <td className="py-2">{fmtUsd(m.grossStipendCents)}</td>
                    <td className="py-2 text-emerald-400">{fmtUsd(m.irc139bTaxFreeExclusionCents)}</td>
                    <td className="py-2">{fmtUsd(m.taxableW2WagesCents)}</td>
                    <td className="py-2">{fmtUsd(m.losapContributionCents)}</td>
                    <td className="py-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-bold">
                        {m.flsaRatioPercent}% ({m.flsaStatus})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DUAL-SIGNER GATE & DONOR RECEIPTS */}
      {activeTab === 'dualsigner' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <ShieldCheck size={16} className="text-emerald-400" />
              <span>Dual-Signer VFD Treasurer + Fire Chief Gate (&gt;$1,000 or Restricted Fund)</span>
            </div>
            <div className="space-y-2">
              {disbursements.map((d) => (
                <div key={d.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between font-bold text-white">
                    <span>{d.voucherNumber} · {d.payeeName} (Fund {d.fundCode})</span>
                    <span>{fmtUsd(d.amountCents)}</span>
                  </div>
                  <div className="text-slate-400">{d.memo}</div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-400">
                      1st Signer: {d.firstSignerName} · Status: <strong>{d.status}</strong>
                    </span>
                    {d.status === 'pending_second_signature' && (
                      <button
                        type="button"
                        onClick={() => handleCoSignDisbursement(d.id)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-[11px]"
                      >
                        Co-Sign as Fire Chief (@openscaffold/esign)
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <form onSubmit={handleCreateDonorReceipt} className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Receipt size={16} className="text-amber-400" />
                <span>Fund 400 · Generate IRC § 170(f)(8) &amp; § 6115 Donor Receipt</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Donor Name</label>
                  <input
                    type="text"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Gross Gift ($ USD)</label>
                  <input
                    type="number"
                    value={donorGrossDollars}
                    onChange={(e) => setDonorGrossDollars(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={donorQuidProQuo}
                    onChange={(e) => setDonorQuidProQuo(e.target.checked)}
                  />
                  <span>Quid Pro Quo Pancake Breakfast / Goods Provided (IRC § 6115)</span>
                </label>
                {donorQuidProQuo && (
                  <input
                    type="number"
                    value={donorGoodsDollars}
                    onChange={(e) => setDonorGoodsDollars(e.target.value)}
                    className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                    placeholder="FMV $"
                  />
                )}
              </div>
              <button type="submit" className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold">
                Issue Contemporaneous Tax Receipt
              </button>
            </form>
            <div className="space-y-2 pt-2 border-t border-slate-800">
              {donorReceipts.slice(0, 3).map((r) => (
                <div key={r.receiptNumber} className="bg-slate-950 border border-slate-800 rounded p-2.5 text-[11px]">
                  <div className="font-bold text-white">
                    {r.receiptNumber} · {r.donorName} — Deductible: {fmtUsd(r.taxDeductibleAmountCents)} (Gross {fmtUsd(r.grossAmountCents)})
                  </div>
                  <div className="text-slate-400 mt-0.5">{r.statutoryLegend}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: IRS FORM 990 + GASB 34/54 + ZERO-PBC */}
      {activeTab === 'form990' && form990Pkg && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              IRS Form 990 (Part VIII, Part IX Functional Expenses, Schedule A &amp; Schedule B) + GASB 54 Balance Sheet
            </h3>
            <span className="text-xs font-mono text-emerald-400">
              Merkle Root: {form990Pkg.zeroPbcAuditBinder?.merkleRootSha256?.slice(0, 20)}…
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400 font-bold uppercase text-[11px]">Part IX · Program Services (Fire &amp; EMS)</div>
              <div className="text-lg font-black text-emerald-400 mt-1">
                {fmtUsd(form990Pkg.partIXFunctionalExpenses?.programServicesCents)} ({form990Pkg.partIXFunctionalExpenses?.programEfficiencyRatioPercent}%)
              </div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400 font-bold uppercase text-[11px]">Part IX · Management &amp; General</div>
              <div className="text-lg font-black text-white mt-1">
                {fmtUsd(form990Pkg.partIXFunctionalExpenses?.managementAndGeneralCents)}
              </div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400 font-bold uppercase text-[11px]">Schedule A · Public Support Test</div>
              <div className="text-lg font-black text-sky-400 mt-1">
                {form990Pkg.scheduleAPublicCharityStatus?.publicSupportPercentage}% (Passes ≥33.33%)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: 15-MIN QUICKBOOKS UN-COMMINGLING IMPORT & CITY HALL ERP */}
      {activeTab === 'qbo' && (
        <div className="space-y-4">
          {qboImport && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <ArrowRightLeft size={16} className="text-emerald-400" />
                  <span>Need 6 · 15-Minute QuickBooks Single-Checking Un-Commingling Import</span>
                </div>
                <span className="px-2.5 py-1 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 text-xs font-bold">
                  Cash Variance: {fmtUsd(qboImport.cashVarianceCents)} (60-Day Zero-Double-Entry Shadow Verified)
                </span>
              </div>
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2">QBO ID</th>
                    <th className="py-2">Legacy Account</th>
                    <th className="py-2">Memo</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Reconstructed Target Fund</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(qboImport.mappedTransactions || []).map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 font-mono">{r.id}</td>
                      <td className="py-2 text-slate-400">{r.legacyAccount}</td>
                      <td className="py-2 text-white font-semibold">{r.memo}</td>
                      <td className="py-2">{fmtUsd(r.amountCents)}</td>
                      <td className="py-2 text-emerald-400 font-bold">Fund {r.assignedFundCode} ({r.classificationRule})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {erpBatch && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <FileSpreadsheet size={16} className="text-blue-400" />
                <span>Mode B · City Hall ERP Balanced Journal Batch ({erpBatch.targetSystem?.toUpperCase()})</span>
              </div>
              <pre className="bg-slate-950 border border-slate-800 rounded p-3 text-[11px] text-slate-300 overflow-x-auto">
                {erpBatch.csv}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
