import { useState, useEffect, useCallback } from 'react';
import {
  Award, AlertTriangle, CheckCircle2, Clock, TrendingUp,
  Users, Download, RefreshCw, ChevronDown, ChevronRight,
  Loader2, XCircle, ShieldCheck, Calendar,
} from 'lucide-react';
import { api } from '../utils/api';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${m}/${d}/${y}`;
}

function CertBadge({ status, daysRemaining }) {
  if (status === 'expired')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">
        <XCircle size={11} /> Expired
      </span>
    );
  if (status === 'critical')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">
        <AlertTriangle size={11} /> {daysRemaining}d
      </span>
    );
  if (status === 'warning')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
        <Clock size={11} /> {daysRemaining}d
      </span>
    );
  if (status === 'caution')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300">
        <Clock size={11} /> {daysRemaining}d
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 size={11} /> Valid
    </span>
  );
}

function LosapBar({ hours, threshold }) {
  const pct = Math.min(100, Math.round((hours / threshold) * 100));
  const color = hours >= threshold ? 'bg-emerald-500' : hours >= threshold * 0.7 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap w-16 text-right">
        {hours}/{threshold} hrs
      </span>
    </div>
  );
}

function LosapBadge({ status }) {
  if (status === 'met')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
        <ShieldCheck size={11} /> Met
      </span>
    );
  if (status === 'on-track')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
        <TrendingUp size={11} /> On Track
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">
      <AlertTriangle size={11} /> At Risk
    </span>
  );
}

function SummaryCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-start gap-4 shadow-sm">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function TrainingCompliance() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [exportYear,   setExportYear]   = useState(new Date().getFullYear());
  const [exporting,    setExporting]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await api.get('/api/training/compliance');
      const obj = raw?.data && typeof raw.data === 'object' ? raw.data : typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      setData(obj);
    } catch (err) {
      setError(err.message || 'Failed to load compliance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      // Use fetch directly so we can handle the CSV blob
      const token = localStorage.getItem('of_token');
      const resp  = await fetch(`/api/training/export?year=${exportYear}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `training_report_${exportYear}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      <Loader2 className="h-8 w-8 animate-spin mr-3" />
      <span className="text-sm">Loading compliance data…</span>
    </div>
  );

  if (error) return (
    <div className="rounded-xl bg-red-50 dark:bg-red-950/50 ring-1 ring-red-200 p-8 text-center">
      <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Could not load compliance data</p>
      <p className="text-xs text-red-500 mb-4">{error}</p>
      <button onClick={load} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">Retry</button>
    </div>
  );

  const { summary, members } = data;

  // filter members
  let visible = members;
  if (filterStatus === 'expired')  visible = members.filter((m) => m.expiredCount > 0);
  if (filterStatus === 'alerts')   visible = members.filter((m) => m.alertCount > 0);
  if (filterStatus === 'losap')    visible = members.filter((m) => m.losapStatus === 'at-risk');
  if (filterStatus === 'ok')       visible = members.filter((m) => m.expiredCount === 0 && m.alertCount === 0 && m.losapStatus === 'met');

  const years = [];
  for (let y = new Date().getFullYear(); y >= new Date().getFullYear() - 4; y--) years.push(y);

  return (
    <div className="space-y-6">

      {/* ── critical alert banner ── */}
      {(summary.membersWithExpired > 0 || summary.membersWithAlerts > 0) && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${summary.membersWithExpired > 0 ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900' : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900'}`}>
          <AlertTriangle size={18} className={summary.membersWithExpired > 0 ? 'text-red-600 dark:text-red-400 mt-0.5' : 'text-amber-600 dark:text-amber-400 mt-0.5'} />
          <div className="text-sm">
            {summary.membersWithExpired > 0 && (
              <span className="font-semibold text-red-700 dark:text-red-300">
                {summary.membersWithExpired} member{summary.membersWithExpired > 1 ? 's have' : ' has'} expired certifications.{' '}
              </span>
            )}
            {summary.membersWithAlerts > 0 && (
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                {summary.membersWithAlerts} member{summary.membersWithAlerts > 1 ? 's have' : ' has'} certifications expiring within 90 days.
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Members Tracked"
          value={summary.totalMembers}
          icon={Users}
          color="bg-indigo-500"
          sub="with training records"
        />
        <SummaryCard
          label="Cert Issues"
          value={summary.membersWithExpired + summary.membersWithAlerts}
          icon={AlertTriangle}
          color={summary.membersWithExpired > 0 ? 'bg-red-500' : 'bg-amber-500'}
          sub={`${summary.membersWithExpired} expired · ${summary.membersWithAlerts} expiring`}
        />
        <SummaryCard
          label={`LOSAP Met (${summary.year})`}
          value={summary.membersLosapMet}
          icon={ShieldCheck}
          color="bg-emerald-500"
          sub={`${summary.losapThreshold}+ hrs threshold`}
        />
        <SummaryCard
          label="LOSAP At Risk"
          value={summary.membersLosapAtRisk}
          icon={TrendingUp}
          color="bg-orange-500"
          sub="below 70% of threshold"
        />
      </div>

      {/* ── toolbar ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-3 flex-wrap">
            {[
              { val: 'all',     label: 'All Members' },
              { val: 'expired', label: 'Expired Certs' },
              { val: 'alerts',  label: 'Expiring Soon' },
              { val: 'losap',   label: 'LOSAP At Risk' },
              { val: 'ok',      label: 'Fully Compliant' },
            ].map(({ val, label }) => (
              <button
                key={val}
                onClick={() => setFilterStatus(val)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterStatus === val
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* export controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Refresh"
              aria-label="Refresh compliance data"
            >
              <RefreshCw size={15} />
            </button>
            <select
              value={exportYear}
              onChange={(e) => setExportYear(Number(e.target.value))}
              aria-label="Export year"
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
            >
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── member compliance table ── */}
      <div className="space-y-2">
        {visible.length === 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center text-gray-400">
            No members match this filter.
          </div>
        )}

        {visible.map((member) => {
          const isOpen = expanded === member.memberName;
          const hasIssues = member.expiredCount > 0 || member.alertCount > 0;
          const rowBorder = member.expiredCount > 0
            ? 'border-red-200 dark:border-red-900'
            : member.alertCount > 0
            ? 'border-amber-200 dark:border-amber-900'
            : 'border-gray-200 dark:border-gray-700';

          return (
            <div key={member.memberName} className={`bg-white dark:bg-gray-900 rounded-xl border shadow-sm overflow-hidden ${rowBorder}`}>
              {/* member row */}
              <button
                className="w-full text-left px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                onClick={() => setExpanded(isOpen ? null : member.memberName)}
              >
                <div className="flex items-center gap-4">
                  {/* avatar */}
                  <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 flex items-center justify-center text-xs font-bold shrink-0">
                    {member.memberName.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                  </div>

                  {/* name */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{member.memberName}</p>
                    <p className="text-xs text-gray-400">{member.totalRecords} record{member.totalRecords !== 1 ? 's' : ''}</p>
                  </div>

                  {/* cert status */}
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    {member.expiredCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">
                        <XCircle size={11} /> {member.expiredCount} Expired
                      </span>
                    )}
                    {member.alertCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
                        <Clock size={11} /> {member.alertCount} Expiring
                      </span>
                    )}
                    {!hasIssues && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 size={11} /> Certs OK
                      </span>
                    )}
                  </div>

                  {/* LOSAP */}
                  <div className="hidden md:flex items-center gap-3 w-52 shrink-0">
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">LOSAP {summary.year}</span>
                    <div className="flex-1">
                      <LosapBar hours={member.losapHoursYTD} threshold={member.losapThreshold} />
                    </div>
                  </div>

                  {/* LOSAP badge */}
                  <div className="hidden sm:block shrink-0">
                    <LosapBadge status={member.losapStatus} />
                  </div>

                  {/* expand icon */}
                  <div className="shrink-0 text-gray-400">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                </div>
              </button>

              {/* expanded: cert details */}
              {isOpen && (
                <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 bg-gray-50 dark:bg-gray-950">
                  {member.certifications.length === 0 ? (
                    <p className="text-sm text-gray-400">No certifications with expiry dates on record.</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                        Tracked Certifications
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {member.certifications
                          .sort((a, b) => {
                            const order = { expired: 0, critical: 1, warning: 2, caution: 3, ok: 4 };
                            return (order[a.status] || 4) - (order[b.status] || 4);
                          })
                          .map((cert) => (
                            <div
                              key={cert.courseName}
                              className={`flex items-center justify-between p-3 rounded-lg border text-sm ${
                                cert.status === 'expired' ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900' :
                                cert.status === 'critical' ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900' :
                                cert.status === 'warning' ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900' :
                                cert.status === 'caution' ? 'bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-900' :
                                'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                              }`}
                            >
                              <div>
                                <p className="font-medium text-gray-800 dark:text-gray-100">{cert.courseName}</p>
                                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  <Calendar size={11} />
                                  <span>Exp: {fmtDate(cert.expiresDate)}</span>
                                </div>
                              </div>
                              <CertBadge status={cert.status} daysRemaining={cert.daysRemaining} />
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* LOSAP detail */}
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        LOSAP Progress — {summary.year}
                      </p>
                      <LosapBadge status={member.losapStatus} />
                    </div>
                    <LosapBar hours={member.losapHoursYTD} threshold={member.losapThreshold} />
                    <p className="text-xs text-gray-400 mt-1.5">
                      {member.losapHoursYTD} hours logged this year · {Math.max(0, member.losapThreshold - member.losapHoursYTD)} hours needed to meet threshold
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <p className="text-xs text-gray-400 text-center pb-4">
        LOSAP threshold: {summary.losapThreshold} training hours per calendar year (NJ standard) ·
        Alert thresholds: 90 days (caution), 60 days (warning), 30 days (critical)
      </p>
    </div>
  );
}
