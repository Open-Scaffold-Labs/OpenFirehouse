import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import {
  DollarSign, TrendingUp, TrendingDown, PiggyBank,
  Plus, Search, ChevronDown, ChevronUp,
  Edit2, Trash2, HandCoins, Gift,
} from 'lucide-react';
import {
  BUDGET_CATEGORIES, SUBCATEGORIES, TRANSACTION_TYPES, TYPE_COLORS, FISCAL_YEAR,
} from '../data/budget';
import BudgetForm from './BudgetForm';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';
import { api } from '../utils/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${m}/${day}/${y}`;
}

function pct(spent, allocated) {
  if (!allocated) return 0;
  return Math.min(100, Math.round((spent / allocated) * 100));
}

function progressColor(p) {
  if (p >= 90) return 'bg-red-500';
  if (p >= 70) return 'bg-amber-400';
  return 'bg-green-500';
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color, bg }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 flex items-start gap-4">
      <div className={`p-3 rounded-xl ${bg} flex-shrink-0`}>
        <Icon size={20} className={color} />
      </div>
      <div className="min-w-0">
        <p className={`text-2xl font-black truncate ${color}`}>{value}</p>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 leading-tight">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Category row (expandable) ────────────────────────────────────────────────
function CategoryRow({ category, lines, transactions, onEditLine, onDeleteLine }) {
  const [open, setOpen] = useState(false);

  const allocated = lines.reduce((s, l) => s + l.allocated, 0);
  const spent      = transactions
    .filter((t) => t.category === category && t.type === 'Expense')
    .reduce((s, t) => s + t.amount, 0);
  const income     = transactions
    .filter((t) => t.category === category && t.type !== 'Expense')
    .reduce((s, t) => s + t.amount, 0);
  const remaining  = allocated - spent;
  const p          = pct(spent, allocated);

  // Per-subcategory breakdown
  const subBreakdown = useMemo(() => {
    const map = {};
    lines.forEach((l) => {
      if (!map[l.subcategory]) map[l.subcategory] = { allocated: 0, spent: 0, line: l };
      map[l.subcategory].allocated += l.allocated;
    });
    transactions.filter((t) => t.category === category && t.type === 'Expense').forEach((t) => {
      if (!map[t.subcategory]) map[t.subcategory] = { allocated: 0, spent: 0, line: null };
      map[t.subcategory].spent += t.amount;
    });
    return Object.entries(map);
  }, [lines, transactions, category]);

  return (
    <>
      <tr
        className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
              aria-label={`Expand ${category} budget details`}
              aria-expanded={open}
              className="p-0.5 flex-shrink-0"
            >
              {open ? <ChevronUp size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />}
            </button>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{category}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-right font-medium">{currency(allocated)}</td>
        <td className="px-4 py-3 text-sm text-red-700 dark:text-red-300 text-right font-medium">{currency(spent)}</td>
        <td className="px-4 py-3 text-sm text-green-700 dark:text-green-300 text-right font-medium">{currency(income > 0 ? income : 0)}</td>
        <td className={`px-4 py-3 text-sm text-right font-bold ${remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}>
          {currency(remaining)}
        </td>
        <td className="px-4 py-3 w-36">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${progressColor(p)}`} style={{ width: `${p}%` }} />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{p}%</span>
          </div>
        </td>
      </tr>

      {/* Expanded subcategory rows */}
      {open && subBreakdown.map(([sub, data]) => {
        const sp = pct(data.spent, data.allocated);
        return (
          <tr key={sub} className="bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-700">
            <td className="px-4 py-2 pl-10">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 italic">{sub}</span>
              </div>
            </td>
            <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 text-right">{data.allocated ? currency(data.allocated) : '—'}</td>
            <td className="px-4 py-2 text-xs text-red-600 dark:text-red-400 text-right">{data.spent ? currency(data.spent) : '—'}</td>
            <td className="px-4 py-2 text-xs text-gray-400 text-right">—</td>
            <td className={`px-4 py-2 text-xs text-right font-medium ${(data.allocated - data.spent) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}`}>
              {data.allocated ? currency(data.allocated - data.spent) : '—'}
            </td>
            <td className="px-4 py-2 w-36">
              {data.allocated > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${progressColor(sp)}`} style={{ width: `${sp}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-400 w-7 text-right">{sp}%</span>
                </div>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BudgetTracker() {
  const [budgetLines,   setBudgetLines]   = useState([]);
  const [transactions,  setTransactions]  = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState('overview'); // overview | transactions
  const [showForm,      setShowForm]      = useState(false);
  const [editingTxn,    setEditingTxn]    = useState(null);
  const [search,        setSearch]        = useState('');
  const [typeFilter,    setTypeFilter]    = useState('All');
  const [catFilter,     setCatFilter]     = useState('All');
  const [expandedTxn,   setExpandedTxn]   = useState(null);

  // ── Derived totals ─────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const totalAllocated = budgetLines.reduce((s, l) => s + l.allocated, 0);
    const expenses       = transactions.filter((t) => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
    const revenue        = transactions.filter((t) => t.type === 'Revenue').reduce((s, t) => s + t.amount, 0);
    const grants         = transactions.filter((t) => t.type === 'Grant').reduce((s, t) => s + t.amount, 0);
    const donations      = transactions.filter((t) => t.type === 'Donation').reduce((s, t) => s + t.amount, 0);
    const remaining      = totalAllocated - expenses;
    const pctUsed        = pct(expenses, totalAllocated);
    return { totalAllocated, expenses, revenue, grants, donations, remaining, pctUsed };
  }, [budgetLines, transactions]);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    return BUDGET_CATEGORIES.map((cat) => {
      const allocated = budgetLines.filter((l) => l.category === cat).reduce((s, l) => s + l.allocated, 0);
      const spent     = transactions.filter((t) => t.category === cat && t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
      return { category: cat.split(' ')[0], allocated, spent }; // short label
    });
  }, [budgetLines, transactions]);

  // ── Filtered transactions ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((t) => {
        const matchType = typeFilter === 'All' || t.type === typeFilter;
        const matchCat  = catFilter  === 'All' || t.category === catFilter;
        const matchQ    = !q || [t.description, t.vendor, t.category, t.subcategory, t.checkNumber]
          .join(' ').toLowerCase().includes(q);
        return matchType && matchCat && matchQ;
      });
  }, [transactions, typeFilter, catFilter, search]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [linesRes, txnsRes] = await Promise.all([
        api.get('/api/budget-lines'),
        api.get('/api/budget-transactions'),
      ]);
      const lines = Array.isArray(linesRes?.data) ? linesRes.data : Array.isArray(linesRes) ? linesRes : [];
      const txns = Array.isArray(txnsRes?.data) ? txnsRes.data : Array.isArray(txnsRes) ? txnsRes : [];
      setBudgetLines(lines);
      setTransactions(txns);
    } catch (e) {
      console.error('Failed to fetch budget data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleSave(data) {
    try {
      if (data.id) {
        const { id, ...changes } = data;
        const res = await api.patch(`/api/budget-transactions/${id}`, changes);
        setTransactions((prev) => prev.map((t) => (t.id === id ? res.data : t)));
      } else {
        const res = await api.post('/api/budget-transactions', data);
        setTransactions((prev) => [...prev, res.data]);
      }
    } catch (e) {
      console.error('Failed to save transaction', e);
    }
    setShowForm(false);
    setEditingTxn(null);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    try {
      await api.delete(`/api/budget-transactions/${id}`);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      console.error('Failed to delete transaction', e);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Budget &amp; Finance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Fiscal Year {FISCAL_YEAR}</p>
        </div>
        <button
          onClick={() => { setEditingTxn(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 transition-colors shadow-sm"
        >
          <Plus size={16} /> Add Transaction
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={DollarSign}   label="Total Budget"   value={currency(totals.totalAllocated)} sub={`FY${FISCAL_YEAR}`}   color="text-gray-800 dark:text-gray-100"    bg="bg-gray-100 dark:bg-gray-800" />
        <StatCard icon={TrendingDown} label="Total Expenses" value={currency(totals.expenses)}       sub="YTD expenses"         color="text-red-700 dark:text-red-300"     bg="bg-red-50 dark:bg-red-950/50"   />
        <StatCard icon={PiggyBank}    label="Remaining"      value={currency(totals.remaining)}      sub={`${totals.pctUsed}% used`} color={totals.remaining < 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'} bg={totals.remaining < 0 ? 'bg-red-50 dark:bg-red-950/50' : 'bg-green-50 dark:bg-green-950/50'} />
        <StatCard icon={TrendingUp}   label="Revenue"        value={currency(totals.revenue)}        sub="Town appropriations"  color="text-blue-700 dark:text-blue-300"    bg="bg-blue-50 dark:bg-blue-950/50"  />
        <StatCard icon={Gift}         label="Grants & Donations" value={currency(totals.grants + totals.donations)} sub="YTD received" color="text-purple-700 dark:text-purple-300" bg="bg-purple-50 dark:bg-purple-950/50" />
      </div>

      {/* Overall progress bar */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Overall Budget Utilization</p>
          <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
            {currency(totals.expenses)} <span className="text-gray-400 font-normal">of</span> {currency(totals.totalAllocated)}
          </p>
        </div>
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progressColor(totals.pctUsed)}`}
            style={{ width: `${totals.pctUsed}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <p className="text-xs text-gray-400">{totals.pctUsed}% spent</p>
          <p className="text-xs text-gray-400">{currency(totals.remaining)} remaining</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        {[
          { id: 'overview',     label: 'Budget Overview' },
          { id: 'transactions', label: 'Transactions'    },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              activeTab === id ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Bar chart */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4">Budget vs. Actual by Category</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barGap={4} margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(v, name) => [currency(v), name === 'allocated' ? 'Budget' : 'Spent']}
                />
                <Bar dataKey="allocated" name="Budget" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spent"     name="Spent"  fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 justify-center mt-2">
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="h-3 w-3 rounded-sm bg-slate-200" /> Budget
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="h-3 w-3 rounded-sm bg-red-600" /> Spent
              </span>
            </div>
          </div>

          {/* Budget lines table */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Budget Lines</h2>
              <p className="text-xs text-gray-400 mt-0.5">Click a row to expand subcategory breakdown</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Category</th>
                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">Allocated</th>
                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">Spent</th>
                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">Income</th>
                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">Remaining</th>
                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-36">Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {BUDGET_CATEGORIES.map((cat) => (
                    <CategoryRow
                      key={cat}
                      category={cat}
                      lines={budgetLines.filter((l) => l.category === cat)}
                      transactions={transactions.filter((t) => t.category === cat)}
                      onEditLine={() => {}}
                      onDeleteLine={() => {}}
                    />
                  ))}
                </tbody>
                {/* Totals footer */}
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-gray-950 border-t-2 border-gray-200 dark:border-gray-700">
                    <td className="px-4 py-3 text-sm font-black text-gray-800 dark:text-gray-100">TOTAL</td>
                    <td className="px-4 py-3 text-sm font-black text-gray-800 dark:text-gray-100 text-right">{currency(totals.totalAllocated)}</td>
                    <td className="px-4 py-3 text-sm font-black text-red-700 dark:text-red-300 text-right">{currency(totals.expenses)}</td>
                    <td className="px-4 py-3 text-sm font-black text-green-700 dark:text-green-300 text-right">{currency(totals.revenue + totals.grants + totals.donations)}</td>
                    <td className={`px-4 py-3 text-sm font-black text-right ${totals.remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}>
                      {currency(totals.remaining)}
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Transactions Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 bg-gray-50 dark:bg-gray-950 dark:text-gray-100"
                placeholder="Search description, vendor, check number…"
                aria-label="Search transactions"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {['All', ...TRANSACTION_TYPES].map((t) => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                    typeFilter === t
                      ? 'bg-red-700 text-white border-red-700'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setCatFilter('All')}
                className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                  catFilter === 'All' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                }`}>
                All Categories
              </button>
              {BUDGET_CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCatFilter(c)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                    catFilter === c ? 'bg-gray-800 text-white border-gray-800' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">Showing {filtered.length} of {transactions.length} transactions</p>

          {/* Transactions table */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Date</th>
                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Type</th>
                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Description</th>
                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Category</th>
                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">Amount</th>
                    <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Vendor</th>
                    <th className="px-4 py-2 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((txn) => {
                    const tc   = TYPE_COLORS[txn.type] ?? TYPE_COLORS['Expense'];
                    const open = expandedTxn === txn.id;
                    return (
                      <React.Fragment key={txn.id}>
                        <tr
                          className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                          onClick={() => setExpandedTxn(open ? null : txn.id)}
                        >
                          <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(txn.date)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tc.badge}`}>
                              {txn.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-100 max-w-xs">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setExpandedTxn(open ? null : txn.id); }}
                                aria-label={`Expand transaction ${txn.description} details`}
                                aria-expanded={open}
                                className="p-0.5 flex-shrink-0"
                              >
                                {open ? <ChevronUp size={13} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />}
                              </button>
                              <span className="truncate">{txn.description}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                            <span className="block truncate max-w-[120px]">{txn.subcategory}</span>
                          </td>
                          <td className={`px-4 py-3 text-sm font-bold text-right whitespace-nowrap ${tc.text}`}>
                            {txn.type === 'Expense' ? '-' : '+'}{currency(txn.amount)}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-[120px]">
                            <span className="truncate block">{txn.vendor || '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingTxn(txn); setShowForm(true); }}
                                aria-label={`Edit transaction ${txn.description}`}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(txn.id); }}
                                aria-label={`Delete transaction ${txn.description}`}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded detail */}
                        {open && (
                          <tr className="bg-gray-50 dark:bg-gray-950">
                            <td colSpan={7} className="px-8 py-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                                <div>
                                  <p className="text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Check / Ref</p>
                                  <p className="text-gray-700 dark:text-gray-300 font-medium">{txn.checkNumber || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Category</p>
                                  <p className="text-gray-700 dark:text-gray-300 font-medium">{txn.category}</p>
                                </div>
                                <div>
                                  <p className="text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Approved By</p>
                                  <p className="text-gray-700 dark:text-gray-300 font-medium">{txn.approvedBy || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Notes</p>
                                  <p className="text-gray-700 dark:text-gray-300">{txn.notes || '—'}</p>
                                </div>
                              </div>
                              {/* Linked Meetings */}
                              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                                <LinkedMeetings module="budget" recordId={txn.id} recordLabel={txn.description || 'Budget Line'} />
                                <Attachments module="budget" recordId={txn.id} recordLabel={txn.description || 'Budget Line'} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <DollarSign size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No transactions match your filters.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <BudgetForm
          record={editingTxn}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingTxn(null); }}
        />
      )}
    </div>
  );
}
