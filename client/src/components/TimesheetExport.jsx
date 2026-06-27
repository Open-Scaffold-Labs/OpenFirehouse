import { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet, Loader2, Download, CheckCircle, Clock,
  Calendar, DollarSign, Filter, Plus, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { api } from '../utils/api';

export default function TimesheetExport() {
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  // Default to current 14-day period
  const today = new Date();
  const periodEnd = today.toISOString().slice(0, 10);
  const periodStartDefault = new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [periodStart, setPeriodStart] = useState(periodStartDefault);
  const [periodEndDate, setPeriodEndDate] = useState(periodEnd);

  const fetchData = useCallback(async () => {
    try {
      let url = `/api/timesheets?period_start=${periodStart}&period_end=${periodEndDate}`;
      if (filterStatus) url += `&status=${filterStatus}`;
      const raw = await api.get(url);
      const arr = Array.isArray(raw?.data?.data) ? raw.data.data : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setTimesheets(arr);
    } catch (err) {
      console.error('Failed to load timesheets:', err);
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEndDate, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await api.post('/api/timesheets/generate', {
        period_start: periodStart, period_end: periodEndDate,
      });
      alert(`Generated ${res.data?.generated || res.generated || 0} timesheets`);
      fetchData();
    } catch (err) {
      alert(err.message || 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove(id) {
    try {
      await api.patch(`/api/timesheets/${id}`, { status: 'approved', approved_by: 'Chief' });
      fetchData();
    } catch (err) { alert(err.message || 'Failed'); }
  }

  async function handleApproveAll() {
    const drafts = timesheets.filter(t => t.status === 'draft');
    if (!confirm(`Approve all ${drafts.length} draft timesheets?`)) return;
    for (const t of drafts) {
      await api.patch(`/api/timesheets/${t.id}`, { status: 'approved', approved_by: 'Chief' }).catch(() => {});
    }
    fetchData();
  }

  async function handleExportCSV() {
    try {
      const res = await api.post('/api/timesheets/export', {
        period_start: periodStart, period_end: periodEndDate,
      });
      const csv = res.data?.csv || res.csv || '';
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `timesheets-${periodStart}-to-${periodEndDate}.csv`;
      a.click();
    } catch (err) { alert(err.message || 'Export failed'); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading timesheets…</span>
      </div>
    );
  }

  const totalRegular = timesheets.reduce((s, t) => s + parseFloat(t.regular_hours || 0), 0);
  const totalOT = timesheets.reduce((s, t) => s + parseFloat(t.ot_hours || 0), 0);
  const drafts = timesheets.filter(t => t.status === 'draft').length;
  const approved = timesheets.filter(t => t.status === 'approved').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-red-700 dark:text-red-300" />
            Payroll & Timesheets
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">FLSA-compliant timesheet generation and payroll export</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-xl hover:bg-red-800 disabled:opacity-40">
            {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Generate Period
          </button>
          <button onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 dark:border-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
        <Calendar size={14} className="text-gray-400" />
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase">Period Start</label>
          <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm dark:bg-gray-900 dark:text-gray-100" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase">Period End</label>
          <input type="date" value={periodEndDate} onChange={e => setPeriodEndDate(e.target.value)}
            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm dark:bg-gray-900 dark:text-gray-100" />
        </div>
        <div className="flex gap-1 ml-auto">
          <Filter size={14} className="text-gray-400 mt-1" />
          {['', 'draft', 'approved'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                filterStatus === s ? 'bg-red-700 text-white border-red-700' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
              }`}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Timesheets', value: timesheets.length, icon: FileSpreadsheet, color: 'text-gray-700 dark:text-gray-300' },
          { label: 'Regular Hours', value: totalRegular.toFixed(1), icon: Clock, color: 'text-blue-700 dark:text-blue-300' },
          { label: 'OT Hours', value: totalOT.toFixed(1), icon: DollarSign, color: totalOT > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400' },
          { label: 'Pending Approval', value: drafts, icon: AlertTriangle, color: drafts > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={14} className={s.color} />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{s.label}</span>
            </div>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Approve all button */}
      {drafts > 0 && (
        <div className="flex justify-end">
          <button onClick={handleApproveAll}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-xl hover:bg-green-100 dark:hover:bg-green-900/50">
            <CheckCircle size={14} /> Approve All ({drafts})
          </button>
        </div>
      )}

      {/* Timesheet table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">Member</th>
              <th className="text-right px-4 py-3">Regular</th>
              <th className="text-right px-4 py-3">OT</th>
              <th className="text-right px-4 py-3">Leave</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {timesheets.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">
                No timesheets for this period. Click "Generate Period" to create them.
              </td></tr>
            ) : (
              timesheets.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{t.member_name}</p>
                    <p className="text-[10px] text-gray-400">{t.member_rank}</p>
                  </td>
                  <td className="px-4 py-3 text-right">{parseFloat(t.regular_hours || 0).toFixed(1)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={parseFloat(t.ot_hours) > 0 ? 'font-bold text-amber-700 dark:text-amber-300' : ''}>
                      {parseFloat(t.ot_hours || 0).toFixed(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{parseFloat(t.leave_hours || 0).toFixed(1)}</td>
                  <td className="px-4 py-3 text-right font-bold">{parseFloat(t.total_hours || 0).toFixed(1)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      t.status === 'approved' ? 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300' :
                      t.status === 'draft' ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {t.status === 'draft' && (
                      <button onClick={() => handleApprove(t.id)}
                        className="text-xs font-semibold text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/50 px-2 py-1 rounded">
                        Approve
                      </button>
                    )}
                    {t.status === 'approved' && (
                      <span className="text-[10px] text-gray-400">
                        {t.approved_by && `by ${t.approved_by}`}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {timesheets.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 dark:bg-gray-950 font-bold text-sm">
                <td className="px-4 py-3 text-gray-900 dark:text-gray-100">Totals</td>
                <td className="px-4 py-3 text-right">{totalRegular.toFixed(1)}</td>
                <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-300">{totalOT.toFixed(1)}</td>
                <td className="px-4 py-3 text-right">
                  {timesheets.reduce((s, t) => s + parseFloat(t.leave_hours || 0), 0).toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right">
                  {timesheets.reduce((s, t) => s + parseFloat(t.total_hours || 0), 0).toFixed(1)}
                </td>
                <td className="px-4 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                  {approved}/{timesheets.length} approved
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
