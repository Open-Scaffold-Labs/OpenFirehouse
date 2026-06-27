import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, RefreshCw, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, Loader2, Download, TrendingUp,
} from 'lucide-react';
import { api } from '../utils/api';

// ── Score color helpers ───────────────────────────────────────────────────────

function scoreColor(score, target) {
  const pct = target > 0 ? score / target : 0;
  if (pct >= 0.9) return 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-900';
  if (pct >= 0.7) return 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900';
  if (pct >= 0.5) return 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900';
  return 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900';
}

function barColor(score, target) {
  const pct = target > 0 ? score / target : 0;
  if (pct >= 0.9) return 'bg-green-500';
  if (pct >= 0.7) return 'bg-blue-500';
  if (pct >= 0.5) return 'bg-amber-400';
  return 'bg-red-400';
}

function ppcClass(score) {
  if (score >= 90) return 'Class 1';
  if (score >= 80) return 'Class 2';
  if (score >= 70) return 'Class 3';
  if (score >= 60) return 'Class 4';
  if (score >= 50) return 'Class 5';
  if (score >= 40) return 'Class 6';
  if (score >= 30) return 'Class 7';
  if (score >= 20) return 'Class 8';
  if (score >= 10) return 'Class 9';
  return 'Class 10';
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ section }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${scoreColor(section.score, section.maxScore)}`}>
            <span className="text-sm font-black">{Math.round(section.score)}</span>
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{section.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Weight: {section.weight}% · Target: {section.maxScore} pts · Score: {section.score.toFixed(1)} pts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor(section.score, section.maxScore)}`}
              style={{ width: `${Math.min(100, (section.score / section.maxScore) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 w-10 text-right">
            {Math.round((section.score / section.maxScore) * 100)}%
          </span>
          {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3">
          {/* Metrics grid */}
          {section.metrics && section.metrics.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {section.metrics.map((m, i) => {
                const met = m.target > 0 && m.value >= m.target;
                return (
                  <div key={i} className={`rounded-xl border px-3 py-2.5 ${met ? 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-900' : 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700'}`}>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{m.label}</p>
                    <p className={`text-lg font-black ${met ? 'text-green-700 dark:text-green-300' : 'text-gray-800 dark:text-gray-100'}`}>
                      {typeof m.value === 'number' ? m.value.toLocaleString() : m.value}
                    </p>
                    {m.target > 0 && (
                      <p className="text-[10px] text-gray-400">
                        Target: {m.target.toLocaleString()}
                        {met && <CheckCircle className="inline ml-1 text-green-500" size={9} />}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Recommendations */}
          {section.recommendations && section.recommendations.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">Improvement Opportunities</p>
              {section.recommendations.map((r, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5 mb-0.5">
                  <AlertTriangle size={10} className="flex-shrink-0 mt-0.5" /> {r}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ISOReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/iso-report?year=${year}`);
      // Server may wrap in { data } or return flat — normalize
      const report = res.data || res;
      setData(report);
    } catch (e) {
      console.error('ISO report error:', e);
      setError(e.message || 'Failed to load ISO report');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  function handleExport() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ISO_Grading_Report_${year}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Generating ISO grading data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button onClick={fetchReport} className="ml-auto text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const overallScore = data.overallScore || 0;
  const classification = ppcClass(overallScore);
  const sections = data.sections || [];

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-red-700 dark:text-red-300" />
            ISO Grading Report
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Public Protection Classification (PPC) scoring based on ISO/FSRS methodology
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            aria-label="Report year"
            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300 dark:text-gray-100"
          >
            {[0, -1, -2, -3].map(offset => {
              const y = new Date().getFullYear() + offset;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
          <button onClick={fetchReport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-gray-800 text-white rounded-xl hover:bg-gray-900">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Overall score hero card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 md:divide-x divide-gray-100 dark:divide-gray-700">
          {/* Score dial */}
          <div className="flex flex-col items-center justify-center py-8 px-6">
            <div className={`w-28 h-28 rounded-full flex items-center justify-center border-4 ${
              overallScore >= 70 ? 'border-green-400 bg-green-50 dark:bg-green-950/50' :
              overallScore >= 50 ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/50' :
              overallScore >= 30 ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/50' :
              'border-red-400 bg-red-50 dark:bg-red-950/50'
            }`}>
              <div className="text-center">
                <p className="text-3xl font-black text-gray-900 dark:text-gray-100">{Math.round(overallScore)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">/ 100</p>
              </div>
            </div>
            <p className="mt-3 text-lg font-bold text-gray-900 dark:text-gray-100">{classification}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">ISO Classification</p>
          </div>

          {/* Section breakdown */}
          <div className="py-6 px-6 col-span-2">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Section Scores</p>
            <div className="space-y-2.5">
              {sections.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 dark:text-gray-300 w-40 truncate">{s.name}</span>
                  <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor(s.score, s.maxScore)}`}
                      style={{ width: `${Math.min(100, (s.score / s.maxScore) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-16 text-right">
                    {s.score.toFixed(1)} / {s.maxScore}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {data.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(data.summary).map(([key, val]) => (
            <div key={key} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3">
              <p className="text-xs text-gray-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
              <p className="text-xl font-black text-gray-900 dark:text-gray-100">
                {typeof val === 'number' ? val.toLocaleString() : val}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Detailed sections */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <TrendingUp size={14} className="text-red-700 dark:text-red-300" />
          Detailed Section Analysis
        </h2>
        {sections.map((s, i) => (
          <SectionCard key={i} section={s} />
        ))}
      </div>

      {/* Member training summary */}
      {data.memberTraining && data.memberTraining.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Member Training Hours (ISO Credit)</p>
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-[1fr_1fr_0.8fr_0.8fr] gap-3 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide pb-2 border-b border-gray-100 dark:border-gray-700">
              <span>Member</span>
              <span>Rank</span>
              <span>Training Hours</span>
              <span>ISO Target</span>
            </div>
            {data.memberTraining.slice(0, 20).map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_0.8fr_0.8fr] gap-3 py-2 border-b border-gray-50 items-center">
                <span className="text-xs font-medium text-gray-800 dark:text-gray-100">{m.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{m.rank}</span>
                <span className={`text-xs font-bold ${m.hours >= 240 ? 'text-green-700 dark:text-green-300' : m.hours >= 120 ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300'}`}>
                  {m.hours}h
                </span>
                <span className="text-xs text-gray-400">{m.rank?.includes('Chief') || m.rank?.includes('Captain') ? '240h' : '120h'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3">
        <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          This report is an <strong>estimated</strong> ISO/FSRS grading based on data in OpenFirehouse.
          Actual PPC classifications are determined by ISO field surveys and may differ.
          Use this as a self-assessment tool to identify improvement areas before your next ISO evaluation.
        </p>
      </div>
    </div>
  );
}
