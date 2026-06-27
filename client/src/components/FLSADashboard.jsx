import { useState, useEffect, useCallback } from 'react';
import {
  Clock, AlertTriangle, CheckCircle, Loader2, RefreshCw,
  TrendingUp, Users, Calendar, Download,
} from 'lucide-react';
import { api } from '../utils/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function hoursBar(hours, threshold) {
  const pct = Math.min(100, (hours / threshold) * 100);
  const color = pct >= 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-400' : pct >= 50 ? 'bg-blue-400' : 'bg-green-400';
  return { pct, color };
}

// ── Member OT card ────────────────────────────────────────────────────────────

function MemberRow({ member, threshold }) {
  const { pct, color } = hoursBar(member.totalHours, threshold);
  return (
    <div className={`flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-b-0 ${
      member.overThreshold ? 'bg-red-50 dark:bg-red-950/50' : ''
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{member.name}</span>
          {member.overThreshold && (
            <span className="text-[9px] font-bold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/50 px-1.5 py-0.5 rounded-full">OT</span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{member.shifts} shift{member.shifts !== 1 ? 's' : ''} this period</p>
      </div>

      <div className="w-48">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-bold text-gray-600 dark:text-gray-300 w-14 text-right">{member.totalHours}h</span>
        </div>
        <p className="text-[10px] text-gray-400 text-right">
          {member.overThreshold
            ? <span className="text-red-600 dark:text-red-400 font-bold">{member.otHours}h overtime</span>
            : `${Math.max(0, threshold - member.totalHours)}h until OT`
          }
        </p>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function FLSADashboard() {
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [flsaRes, configRes] = await Promise.all([
        api.get('/api/station-config/flsa'),
        api.get('/api/station-config'),
      ]);
      setData(flsaRes?.data && typeof flsaRes.data === 'object' ? flsaRes.data : typeof flsaRes === 'object' && !Array.isArray(flsaRes) ? flsaRes : {});
      setConfig(configRes?.data && typeof configRes.data === 'object' ? configRes.data : typeof configRes === 'object' && !Array.isArray(configRes) ? configRes : {});
    } catch (e) {
      setError(e.message || 'Failed to load FLSA data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleExport() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FLSA_Period_${data.periodStart}_${data.periodEnd}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading FLSA data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button onClick={fetchData} className="ml-auto text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300">Retry</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const members = data.members || [];
  const otMembers = members.filter(m => m.overThreshold);
  const nearOtMembers = members.filter(m => !m.overThreshold && m.totalHours >= data.otThreshold * 0.85);
  const totalShifts = members.reduce((sum, m) => sum + m.shifts, 0);
  const totalHours = members.reduce((sum, m) => sum + m.totalHours, 0);
  const totalOT = members.reduce((sum, m) => sum + m.otHours, 0);

  // Days remaining in period
  const today = new Date();
  const periodEnd = new Date(data.periodEnd + 'T23:59:59');
  const daysRemaining = Math.max(0, Math.ceil((periodEnd - today) / (24 * 60 * 60 * 1000)));

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Clock className="h-6 w-6 text-red-700 dark:text-red-300" />
            FLSA §207(k) Overtime Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {config?.dept_type === 'career' ? 'Career' : config?.dept_type === 'combination' ? 'Combination' : 'Volunteer'} Department
            {' · '}{data.periodDays}-Day Work Period
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-gray-800 text-white rounded-xl hover:bg-gray-900">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Period info banner */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-0 divide-x divide-gray-100 dark:divide-gray-700">
          {[
            { label: 'Period Start', value: fmtDate(data.periodStart), icon: Calendar },
            { label: 'Period End', value: fmtDate(data.periodEnd), icon: Calendar },
            { label: 'Days Remaining', value: daysRemaining, icon: Clock, alert: daysRemaining <= 3 },
            { label: 'OT Threshold', value: `${data.otThreshold}h`, icon: TrendingUp },
            { label: 'Members Tracked', value: members.length, icon: Users },
            { label: 'In Overtime', value: otMembers.length, icon: AlertTriangle, alert: otMembers.length > 0 },
          ].map((stat, i) => (
            <div key={i} className={`px-4 py-4 text-center ${stat.alert ? 'bg-red-50 dark:bg-red-950/50' : ''}`}>
              <stat.icon size={14} className={`mx-auto mb-1 ${stat.alert ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`} />
              <p className={`text-lg font-black ${stat.alert ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-gray-100'}`}>{stat.value}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* OT Alert Banner */}
      {otMembers.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-800 dark:text-red-300">
              {otMembers.length} member{otMembers.length > 1 ? 's' : ''} in overtime this period
            </p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
              {otMembers.map(m => `${m.name} (+${m.otHours}h OT)`).join(', ')}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              Total OT liability: <strong>{totalOT}h</strong> at 1.5× rate
            </p>
          </div>
        </div>
      )}

      {/* Near-OT Warning */}
      {nearOtMembers.length > 0 && otMembers.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
              {nearOtMembers.length} member{nearOtMembers.length > 1 ? 's' : ''} approaching overtime threshold
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              {nearOtMembers.map(m => `${m.name} (${m.totalHours}h / ${data.otThreshold}h)`).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-400">Total Shifts</p>
          <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{totalShifts}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-400">Total Hours</p>
          <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{totalHours.toLocaleString()}</p>
        </div>
        <div className={`rounded-2xl border shadow-sm px-4 py-3 ${totalOT > 0 ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-700'}`}>
          <p className="text-xs text-gray-400">Overtime Hours</p>
          <p className={`text-2xl font-black ${totalOT > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-gray-100'}`}>{totalOT}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-400">Avg Hours/Member</p>
          <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{members.length > 0 ? Math.round(totalHours / members.length) : 0}</p>
        </div>
      </div>

      {/* Member hours table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Hours by Member</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {data.periodDays}-day period · {data.otThreshold}h threshold
          </p>
        </div>

        {members.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Clock className="mx-auto h-8 w-8 text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">No shifts recorded in this work period</p>
            <p className="text-xs text-gray-400 mt-1">Hours will appear as shifts are assigned to crew members</p>
          </div>
        ) : (
          <div>
            {/* Column headers */}
            <div className="flex items-center gap-4 px-5 py-2 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <span className="flex-1">Member</span>
              <span className="w-48 text-right">Hours / Threshold</span>
            </div>
            {members.map((m, i) => (
              <MemberRow key={i} member={m} threshold={data.otThreshold} />
            ))}
          </div>
        )}
      </div>

      {/* FLSA Disclaimer */}
      <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3">
        <Clock size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
          <strong>FLSA §207(k) Note:</strong> Fire departments may establish work periods of 7–28 days under the FLSA partial exemption.
          Overtime is owed for hours exceeding the threshold for the chosen work period.
          For a 28-day period, the FLSA maximum threshold is 212 hours.
          Configure your work period in Station Settings → Career & Staffing Configuration.
          This dashboard is for internal tracking — consult your labor attorney for payroll compliance.
        </p>
      </div>
    </div>
  );
}
