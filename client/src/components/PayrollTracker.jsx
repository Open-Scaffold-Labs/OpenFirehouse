import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  DollarSign, Plus, Search, ChevronDown, ChevronUp,
  CheckCircle2, Clock, AlertCircle, Users, Save, X,
  TrendingUp, FileText, Calendar,
} from 'lucide-react';
import {
  PAY_TYPES, PAY_STATUSES, PAY_PERIODS,
  STATUS_COLORS, TYPE_COLORS, DEFAULT_RATES,
} from '../data/payroll';
import { api } from '../utils/api';

// ─── helpers ─────────────────────────────────────────────────────────────────

function currency(n) {
  return '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─── chips ───────────────────────────────────────────────────────────────────

function StatusChip({ status }) {
  const c = STATUS_COLORS[status] ?? { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-300', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0`} />
      {status}
    </span>
  );
}

function TypeBadge({ type }) {
  const cls = TYPE_COLORS[type] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
  return (
    <span className={`inline-block text-[10px] font-semibold rounded-full px-2 py-0.5 ${cls}`}>
      {type}
    </span>
  );
}

// ─── stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color = 'text-gray-700 dark:text-gray-300', bg = 'bg-white dark:bg-gray-900' }) {
  return (
    <div className={`${bg} rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 flex items-start gap-3`}>
      <div className="h-10 w-10 rounded-lg bg-gray-50 dark:bg-gray-950 flex items-center justify-center shrink-0">
        <Icon size={20} className={color} />
      </div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── pay entry form (modal) ───────────────────────────────────────────────────

const EMPTY_ENTRY = {
  memberName: '', memberRole: 'member',
  type: 'Per-Call', amount: '',
  date: new Date().toISOString().slice(0, 10),
  period: 'Q1-2026',
  description: '',
  status: 'Pending',
  approvedBy: '',
};

function PayEntryForm({ entry, onSave, onClose }) {
  const isEdit = !!entry;
  const [form, setForm] = useState(entry ? { ...entry } : { ...EMPTY_ENTRY });
  const [errors, setErrors] = useState({});
  const [members, setMembers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const raw = await api.get('/api/members');
        const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        setMembers(arr);
      } catch (err) {
        console.error('Failed to fetch members:', err);
      } finally {
        setLoadingData(false);
      }
    }
    fetch();
  }, []);

  const memberNames = members.map((m) => m.name);

  function set(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
    if (errors[field]) setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  }

  // Auto-fill rate when type changes
  function handleTypeChange(type) {
    const rate = DEFAULT_RATES[type] ?? '';
    set('type', type);
    if (!form.amount || Object.values(DEFAULT_RATES).includes(Number(form.amount))) {
      setForm((f) => ({ ...f, type, amount: rate || '' }));
    }
  }

  function validate() {
    const errs = {};
    if (!form.memberName.trim()) errs.memberName = 'Member name is required.';
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) < 0) {
      errs.amount = 'Valid amount is required.';
    }
    if (!form.date) errs.date = 'Date is required.';
    if (!form.description.trim()) errs.description = 'Description is required.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    onSave({ ...form, amount: Number(form.amount) });
  }

  const labelCls = 'block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1';
  const inputCls = (f) =>
    `w-full border ${errors[f] ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100`;
  const errMsg = (f) => errors[f] ? <p className="text-xs text-red-500 mt-1">{errors[f]}</p> : null;

  if (loadingData) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 dark:border-gray-700 border-t-red-700 mx-auto mb-3"></div>
            <p className="text-sm text-gray-400">Loading form…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">{isEdit ? 'Edit Pay Entry' : 'Add Pay Entry'}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Member */}
          <div>
            <label className={labelCls}>Member *</label>
            <select className={inputCls('memberName')} value={form.memberName} onChange={(e) => set('memberName', e.target.value)}>
              <option value="">— Select a member —</option>
              {members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
            {errMsg('memberName')}
          </div>

          {/* Type + Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Pay Type *</label>
              <select className={inputCls('type')} value={form.type} onChange={(e) => handleTypeChange(e.target.value)}>
                {PAY_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Amount ($) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputCls('amount')}
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                placeholder="0.00"
              />
              {errMsg('amount')}
            </div>
          </div>

          {/* Date + Period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Date *</label>
              <input
                type="date"
                className={inputCls('date')}
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
              />
              {errMsg('date')}
            </div>
            <div>
              <label className={labelCls}>Pay Period</label>
              <select className={inputCls('period')} value={form.period} onChange={(e) => set('period', e.target.value)}>
                {PAY_PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description *</label>
            <input
              className={inputCls('description')}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Call incident, meeting name, drill description…"
            />
            {errMsg('description')}
          </div>

          {/* Status + Approved By */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls('status')} value={form.status} onChange={(e) => set('status', e.target.value)}>
                {PAY_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Approved By</label>
              <select className={inputCls('approvedBy')} value={form.approvedBy} onChange={(e) => set('approvedBy', e.target.value)}>
                <option value="">— Select a member —</option>
                {members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </div>
          </div>

        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-800 transition-colors"
          >
            <Save size={14} /> {isEdit ? 'Save Changes' : 'Add Entry'}
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── member summary row ───────────────────────────────────────────────────────

function MemberSummaryRow({ name, entries }) {
  const [open, setOpen] = useState(false);
  const total   = entries.reduce((s, e) => s + e.amount, 0);
  const paid    = entries.filter((e) => e.status === 'Paid').reduce((s, e) => s + e.amount, 0);
  const pending = entries.filter((e) => e.status !== 'Paid').reduce((s, e) => s + e.amount, 0);

  const byType = {};
  entries.forEach((e) => {
    byType[e.type] = (byType[e.type] || 0) + e.amount;
  });

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
      >
        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 text-sm">{name}</td>
        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-medium">{currency(total)}</td>
        <td className="px-4 py-3 text-sm text-green-700 dark:text-green-300 font-medium">{currency(paid)}</td>
        <td className="px-4 py-3 text-sm text-amber-700 dark:text-amber-300 font-medium">{currency(pending)}</td>
        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{entries.length}</td>
        <td className="px-4 py-3 text-gray-400">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            aria-label={`Expand ${name} payroll details`}
            aria-expanded={open}
            className="p-0.5"
          >
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="p-0">
            <div className="bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700 px-5 py-3">
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Breakdown by Type</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.entries(byType).map(([type, amt]) => (
                  <div key={type} className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 ${TYPE_COLORS[type] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                    {type}: {currency(amt)}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                {entries.slice(0, 8).map((e) => (
                  <div key={e.id} className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
                    <span className="w-24 shrink-0 text-gray-400">{e.date}</span>
                    <TypeBadge type={e.type} />
                    <span className="flex-1 truncate">{e.description}</span>
                    <span className="font-semibold shrink-0">{currency(e.amount)}</span>
                    <StatusChip status={e.status} />
                  </div>
                ))}
                {entries.length > 8 && (
                  <p className="text-xs text-gray-400 italic">…and {entries.length - 8} more entries</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

const TABS = ['Ledger', 'Members', 'Pay Periods'];

export default function PayrollTracker() {
  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [period, setPeriod]       = useState('Q1-2026');
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // Period-scoped entries for Ledger tab
  const periodEntries = useMemo(() =>
    entries.filter((e) => e.period === period),
    [entries, period]
  );

  // Filtered ledger
  const filtered = useMemo(() => {
    return periodEntries.filter((e) => {
      const matchType   = typeFilter === 'All' || e.type === typeFilter;
      const matchStatus = statusFilter === 'All' || e.status === statusFilter;
      const q = search.toLowerCase();
      const matchSearch = !q || [e.memberName, e.type, e.description, e.status]
        .some((v) => v?.toLowerCase().includes(q));
      return matchType && matchStatus && matchSearch;
    });
  }, [periodEntries, typeFilter, statusFilter, search]);

  // Stat cards for current period
  const periodTotal   = periodEntries.reduce((s, e) => s + e.amount, 0);
  const paidTotal     = periodEntries.filter((e) => e.status === 'Paid').reduce((s, e) => s + e.amount, 0);
  const pendingTotal  = periodEntries.filter((e) => e.status === 'Pending').reduce((s, e) => s + e.amount, 0);
  const uniqueMembers = [...new Set(periodEntries.map((e) => e.memberName))].length;

  // All-time totals for Members tab (YTD = Q1-2026 + Q4-2025 + Q3-2025 etc.)
  const memberMap = useMemo(() => {
    const m = {};
    entries.forEach((e) => {
      if (!m[e.memberName]) m[e.memberName] = [];
      m[e.memberName].push(e);
    });
    return m;
  }, [entries]);

  const fetchEntries = useCallback(async () => {
    try {
      const raw = await api.get('/api/pay-entries');
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setEntries(arr);
    } catch (e) {
      console.error('Failed to fetch pay entries', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  async function handleSave(data) {
    try {
      if (data.id) {
        const { id, ...changes } = data;
        const res = await api.patch(`/api/pay-entries/${id}`, changes);
        setEntries((prev) => prev.map((e) => e.id === res.data.id ? res.data : e));
      } else {
        const res = await api.post('/api/pay-entries', data);
        setEntries((prev) => [...prev, res.data]);
      }
    } catch (e) {
      console.error('Failed to save pay entry', e);
    }
    setShowForm(false);
    setEditing(null);
  }

  function handleEdit(entry) {
    setEditing(entry);
    setShowForm(true);
  }

  const currentPeriodInfo = PAY_PERIODS.find((p) => p.id === period);

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading payroll entries…</div>;

  return (
    <div className="space-y-6">

      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Payroll &amp; Stipends</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Track per-call pay, stipends, meeting and training compensation for all members.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-800 transition-colors shrink-0"
        >
          <Plus size={15} /> Add Entry
        </button>
      </div>

      {/* period selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mr-1">Pay Period:</span>
        {PAY_PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              period === p.id
                ? 'bg-red-700 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {p.label}
            {p.status === 'Open' && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-400 align-middle" />
            )}
          </button>
        ))}
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={`${currentPeriodInfo?.label ?? 'Period'} Total`}
          value={currency(periodTotal)}
          sub={`${periodEntries.length} entries`}
          icon={DollarSign}
          color="text-gray-800 dark:text-gray-100"
        />
        <StatCard
          label="Paid Out"
          value={currency(paidTotal)}
          sub={`${periodEntries.filter((e) => e.status === 'Paid').length} entries paid`}
          icon={CheckCircle2}
          color="text-green-600 dark:text-green-400"
        />
        <StatCard
          label="Pending / Awaiting"
          value={currency(pendingTotal)}
          sub={`${periodEntries.filter((e) => e.status !== 'Paid').length} entries`}
          icon={Clock}
          color="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          label="Members Compensated"
          value={uniqueMembers}
          sub="unique members this period"
          icon={Users}
          color="text-blue-600 dark:text-blue-400"
        />
      </div>

      {/* tabs */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 dark:border-gray-700">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setActiveTab(i)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeTab === i
                  ? 'border-b-2 border-red-700 text-red-700 dark:text-red-300'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Tab 0: Ledger ── */}
        {activeTab === 0 && (
          <>
            {/* filters */}
            <div className="p-4 border-b border-gray-50 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search member, type, description…"
                  aria-label="Search pay entries"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['All', ...PAY_TYPES].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                      typeFilter === t ? 'bg-gray-800 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t === 'All' ? 'All Types' : t}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['All', ...PAY_STATUSES].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                      statusFilter === s ? 'bg-red-700 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {s === 'All' ? 'All Statuses' : s}
                  </button>
                ))}
              </div>
            </div>

            {/* ledger table */}
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <DollarSign size={32} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">No entries match your filter.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-left">
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Member</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Type</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Description</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Amount</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Date</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((e) => {
                    const isOpen = expandedId === e.id;
                    return (
                      <>
                        <tr
                          key={e.id}
                          onClick={() => setExpandedId(isOpen ? null : e.id)}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{e.memberName}</p>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <TypeBadge type={e.type} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden lg:table-cell truncate max-w-xs">
                            {e.description}
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-900 dark:text-gray-100 text-sm">
                            {currency(e.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusChip status={e.status} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{e.date}</td>
                          <td className="px-4 py-3 text-gray-400">
                            <button
                              type="button"
                              onClick={(ev) => { ev.stopPropagation(); setExpandedId(isOpen ? null : e.id); }}
                              aria-label={`Expand ${e.memberName} payroll entry details`}
                              aria-expanded={isOpen}
                              className="p-0.5"
                            >
                              {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${e.id}-detail`}>
                            <td colSpan={7} className="p-0">
                              <div className="bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700 px-5 py-3 flex items-start justify-between gap-4">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <TypeBadge type={e.type} />
                                    <StatusChip status={e.status} />
                                  </div>
                                  <p className="text-sm text-gray-700 dark:text-gray-300">{e.description}</p>
                                  <p className="text-xs text-gray-400">
                                    Date: {e.date} · Period: {PAY_PERIODS.find((p) => p.id === e.period)?.label ?? e.period}
                                    {e.approvedBy && ` · Approved by: ${e.approvedBy}`}
                                  </p>
                                </div>
                                <button
                                  onClick={(ev) => { ev.stopPropagation(); handleEdit(e); }}
                                  className="text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 hover:bg-white dark:hover:bg-gray-900 transition-colors shrink-0"
                                >
                                  Edit
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
                    <td colSpan={3} className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
                      Showing {filtered.length} of {periodEntries.length} entries
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900 dark:text-gray-100 text-sm">
                      {currency(filtered.reduce((s, e) => s + e.amount, 0))}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            )}
          </>
        )}

        {/* ── Tab 1: Members ── */}
        {activeTab === 1 && (
          <div>
            {Object.keys(memberMap).length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">No pay records found.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-left">
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Member</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Earned</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Paid</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pending</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Entries</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {Object.entries(memberMap)
                    .sort((a, b) => b[1].reduce((s, e) => s + e.amount, 0) - a[1].reduce((s, e) => s + e.amount, 0))
                    .map(([name, memberEntries]) => (
                      <MemberSummaryRow key={name} name={name} entries={memberEntries} />
                    ))
                  }
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Tab 2: Pay Periods ── */}
        {activeTab === 2 && (
          <div className="p-5 space-y-3">
            {PAY_PERIODS.map((p) => {
              const pEntries = entries.filter((e) => e.period === p.id);
              const pTotal   = pEntries.reduce((s, e) => s + e.amount, 0);
              const pPaid    = pEntries.filter((e) => e.status === 'Paid').reduce((s, e) => s + e.amount, 0);
              const pPending = pEntries.filter((e) => e.status !== 'Paid').reduce((s, e) => s + e.amount, 0);
              return (
                <div key={p.id} className="bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100">{p.label}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          p.status === 'Open' ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}>
                          {p.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{p.start} — {p.end}</p>
                    </div>
                    <button
                      onClick={() => { setPeriod(p.id); setActiveTab(0); }}
                      className="text-xs text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-300 font-semibold border border-red-200 dark:border-red-900 rounded-lg px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                    >
                      View Ledger
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{currency(pTotal)}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-green-700 dark:text-green-300">{currency(pPaid)}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Paid</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{currency(pPending)}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pending</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 text-center mt-2">{pEntries.length} entries · {[...new Set(pEntries.map((e) => e.memberName))].length} members</p>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* form modal */}
      {showForm && (
        <PayEntryForm
          entry={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

    </div>
  );
}
