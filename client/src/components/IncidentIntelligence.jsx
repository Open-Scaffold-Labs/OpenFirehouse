import { useState, useEffect, useCallback } from 'react';
import {
  Brain, TrendingUp, BarChart3, Clock, MapPin, AlertTriangle,
  Sparkles, ChevronDown, ChevronRight, Loader2, RefreshCw,
  Target, Shield, Zap, BookOpen, Flame, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { api } from '../utils/api';
import { FAB_RAIL_GUTTER } from '../utils/fabRail';

// ── Grade badge ─────────────────────────────────────────────────────────────

function GradeBadge({ grade }) {
  const colors = {
    A: 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300 border-green-300 dark:border-green-800',
    B: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    C: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    D: 'bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800',
    F: 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800',
  };
  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border-2 text-lg font-black ${colors[grade] || colors.C}`}>
      {grade}
    </span>
  );
}

// ── Rating pill ─────────────────────────────────────────────────────────────

function RatingPill({ rating }) {
  const colors = {
    excellent: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300',
    good: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
    optimal: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300',
    appropriate: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
    fair: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
    slow: 'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300',
    critical: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300',
    'under-resourced': 'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300',
    'over-resourced': 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
    improving: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300',
    stable: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
    declining: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300',
    increasing: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
    decreasing: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${colors[rating] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
      {(rating || '').replace(/[-_]/g, ' ')}
    </span>
  );
}

// ── Mini bar chart ──────────────────────────────────────────────────────────

function MiniBarChart({ data, labels, color = 'bg-red-500', height = 48 }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div className={`w-full rounded-t ${color} transition-all`} style={{ height: `${Math.max(2, (v / max) * height)}px` }} title={`${labels?.[i] || i}: ${v}`} />
          {labels && <span className="text-[11px] text-gray-500 dark:text-gray-400">{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Incident Analysis Card ──────────────────────────────────────────────────

function AnalysisCard({ analysis }) {
  const [open, setOpen] = useState({ response: true, resource: false, tactical: false, safety: false, training: false });
  const toggle = (key) => setOpen(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-4">
      {/* Summary + Grade */}
      <div className="flex items-start gap-4 bg-white dark:bg-gray-900 rounded-2xl border p-5">
        <GradeBadge grade={analysis.overallGrade} />
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">{analysis.summary}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">{analysis.keyTakeaway}</p>
        </div>
      </div>

      {/* Response Time Assessment */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border overflow-hidden">
        <button onClick={() => toggle('response')} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800">
          <Clock size={16} className="text-blue-600 dark:text-blue-400" />
          <span className="flex-1 text-left text-sm font-bold text-gray-900 dark:text-gray-100">Response Time Assessment</span>
          <RatingPill rating={analysis.responseTimeAssessment?.rating} />
          {open.response ? <ChevronDown size={14} className="text-gray-500 dark:text-gray-400" /> : <ChevronRight size={14} className="text-gray-500 dark:text-gray-400" />}
        </button>
        {open.response && analysis.responseTimeAssessment && (
          <div className="px-5 pb-4 space-y-2 border-t bg-gray-50/50 dark:bg-gray-950/50">
            <p className="text-sm text-gray-700 dark:text-gray-300 pt-3">{analysis.responseTimeAssessment.details}</p>
            <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-3 py-2">
              <p className="text-xs text-blue-800 dark:text-blue-300"><strong>NFPA Benchmark:</strong> {analysis.responseTimeAssessment.benchmark}</p>
            </div>
          </div>
        )}
      </div>

      {/* Resource Deployment */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border overflow-hidden">
        <button onClick={() => toggle('resource')} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800">
          <Target size={16} className="text-purple-600 dark:text-purple-400" />
          <span className="flex-1 text-left text-sm font-bold text-gray-900 dark:text-gray-100">Resource Deployment</span>
          <RatingPill rating={analysis.resourceDeployment?.rating} />
          {open.resource ? <ChevronDown size={14} className="text-gray-500 dark:text-gray-400" /> : <ChevronRight size={14} className="text-gray-500 dark:text-gray-400" />}
        </button>
        {open.resource && analysis.resourceDeployment && (
          <div className="px-5 pb-4 space-y-2 border-t bg-gray-50/50 dark:bg-gray-950/50">
            <p className="text-sm text-gray-700 dark:text-gray-300 pt-3">{analysis.resourceDeployment.details}</p>
            {analysis.resourceDeployment.suggestion && (
              <div className="bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900 rounded-xl px-3 py-2">
                <p className="text-xs text-purple-800 dark:text-purple-300"><strong>Suggestion:</strong> {analysis.resourceDeployment.suggestion}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tactical Observations */}
      {analysis.tacticalObservations?.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border overflow-hidden">
          <button onClick={() => toggle('tactical')} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800">
            <Shield size={16} className="text-amber-600 dark:text-amber-400" />
            <span className="flex-1 text-left text-sm font-bold text-gray-900 dark:text-gray-100">Tactical Observations</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{analysis.tacticalObservations.length} items</span>
            {open.tactical ? <ChevronDown size={14} className="text-gray-500 dark:text-gray-400" /> : <ChevronRight size={14} className="text-gray-500 dark:text-gray-400" />}
          </button>
          {open.tactical && (
            <div className="px-5 pb-4 border-t bg-gray-50/50 dark:bg-gray-950/50 pt-3 space-y-1.5">
              {analysis.tacticalObservations.map((obs, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <Zap size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <span>{obs}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Safety + Training */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {analysis.safetyConsiderations?.length > 0 && (
          <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-2xl px-4 py-3">
            <p className="text-xs font-bold text-red-800 dark:text-red-300 mb-2 flex items-center gap-1.5"><AlertTriangle size={12} /> Safety Considerations</p>
            {analysis.safetyConsiderations.map((s, i) => (
              <p key={i} className="text-xs text-red-700 dark:text-red-300 mb-1 ml-4">• {s}</p>
            ))}
          </div>
        )}
        {analysis.trainingOpportunities?.length > 0 && (
          <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-2xl px-4 py-3">
            <p className="text-xs font-bold text-green-800 dark:text-green-300 mb-2 flex items-center gap-1.5"><BookOpen size={12} /> Training Opportunities</p>
            {analysis.trainingOpportunities.map((t, i) => (
              <p key={i} className="text-xs text-green-700 dark:text-green-300 mb-1 ml-4">• {t}</p>
            ))}
          </div>
        )}
      </div>

      {analysis.similarIncidentPatterns && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-2xl px-4 py-3">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1 flex items-center gap-1.5"><TrendingUp size={12} /> Pattern Detection</p>
          <p className="text-xs text-amber-700 dark:text-amber-300">{analysis.similarIncidentPatterns}</p>
        </div>
      )}
    </div>
  );
}

// ── Trend Analysis Card ─────────────────────────────────────────────────────

function TrendCard({ trends }) {
  return (
    <div className="space-y-4">
      {/* Executive Summary */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl px-5 py-4 text-white">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Executive Summary</p>
        <p className="text-sm leading-relaxed">{trends.executiveSummary}</p>
      </div>

      {/* Volume + Response grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Call Volume Trend</p>
            <RatingPill rating={trends.volumeTrend?.direction} />
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300">{trends.volumeTrend?.details}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Response Performance</p>
            <RatingPill rating={trends.responsePerformance?.trend} />
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300">{trends.responsePerformance?.details}</p>
        </div>
      </div>

      {/* Type + Temporal */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {trends.typeAnalysis && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Incident Type Analysis</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {(trends.typeAnalysis.dominantTypes || []).map(t => (
                <span key={t} className="px-2 py-0.5 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 rounded-full text-xs font-medium">{t}</span>
              ))}
            </div>
            {trends.typeAnalysis.emerging && (
              <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 rounded-lg px-2 py-1 mb-1"><strong>Emerging:</strong> {trends.typeAnalysis.emerging}</p>
            )}
            <p className="text-xs text-gray-600 dark:text-gray-300">{trends.typeAnalysis.details}</p>
          </div>
        )}
        {trends.temporalPatterns && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Temporal Patterns</p>
            <div className="space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
              {trends.temporalPatterns.busyDays && <p><strong>Peak Days:</strong> {trends.temporalPatterns.busyDays}</p>}
              {trends.temporalPatterns.busyHours && <p><strong>Peak Hours:</strong> {trends.temporalPatterns.busyHours}</p>}
              {trends.temporalPatterns.seasonal && <p><strong>Seasonal:</strong> {trends.temporalPatterns.seasonal}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Hotspots */}
      {trends.geographicHotspots?.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 flex items-center gap-1.5"><MapPin size={12} /> Geographic Hotspots</p>
          <div className="space-y-2">
            {trends.geographicHotspots.map((h, i) => (
              <div key={i} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-950 rounded-xl px-3 py-2">
                <span className="text-lg font-black text-red-700 dark:text-red-300 min-w-[24px] text-center">{h.count}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{h.location}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{h.concern}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations + Priorities + Goals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {trends.resourceRecommendations?.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-2xl px-4 py-3">
            <p className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-2">Resource Recommendations</p>
            {trends.resourceRecommendations.map((r, i) => (
              <p key={i} className="text-xs text-blue-700 dark:text-blue-300 mb-1">• {r}</p>
            ))}
          </div>
        )}
        {trends.trainingPriorities?.length > 0 && (
          <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-2xl px-4 py-3">
            <p className="text-xs font-bold text-green-800 dark:text-green-300 mb-2">Training Priorities</p>
            {trends.trainingPriorities.map((t, i) => (
              <p key={i} className="text-xs text-green-700 dark:text-green-300 mb-1">• {t}</p>
            ))}
          </div>
        )}
        {trends.quarterlyGoals?.length > 0 && (
          <div className="bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900 rounded-2xl px-4 py-3">
            <p className="text-xs font-bold text-purple-800 dark:text-purple-300 mb-2">Quarterly Goals</p>
            {trends.quarterlyGoals.map((g, i) => (
              <p key={i} className="text-xs text-purple-700 dark:text-purple-300 mb-1">• {g}</p>
            ))}
          </div>
        )}
      </div>

      {/* Risk Alerts */}
      {trends.riskAlerts?.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-2xl px-4 py-3">
          <p className="text-xs font-bold text-red-800 dark:text-red-300 mb-2 flex items-center gap-1.5"><AlertTriangle size={12} /> Risk Alerts</p>
          {trends.riskAlerts.map((a, i) => (
            <p key={i} className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300 mb-1"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" aria-hidden="true" /> {a}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function IncidentIntelligence() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard'); // dashboard | analyze | trends
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [trends, setTrends] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await api.get('/api/incident-analysis/stats');
      setStats(raw?.data || raw || {});
    } catch (err) {
      console.error('Stats error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const analyzeIncident = async (incident) => {
    setSelectedIncident(incident);
    setAnalysis(null);
    setError('');
    setTab('analyze');
    setAiLoading(true);
    try {
      const raw = await api.post('/api/incident-analysis/analyze', { incident });
      setAnalysis(raw?.analysis || raw?.data?.analysis || raw);
    } catch (err) {
      setError(err.message || 'Analysis failed');
    } finally {
      setAiLoading(false);
    }
  };

  const runTrendAnalysis = async () => {
    setTrends(null);
    setError('');
    setTab('trends');
    setAiLoading(true);
    try {
      const raw = await api.post('/api/incident-analysis/trends', {});
      setTrends(raw?.trends || raw?.data?.trends || raw);
    } catch (err) {
      setError(err.message || 'Trend analysis failed');
    } finally {
      setAiLoading(false);
    }
  };

  // The "Narrative Writer" (AI-generated NFIRS narrative) was removed per
  // doctrine 2026-06-10: AI plays zero role in incident narratives — the
  // officer writes them directly in the incident record.

  const DAY_LABELS =['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i % 6 === 0 ? `${i}` : '');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 dark:text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        <span className="text-sm">Loading incident data…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Brain className="h-6 w-6 text-red-700 dark:text-red-300" />
            AI Incident Intelligence
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">AI-powered analysis, trend detection, and actionable insights</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchStats}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={runTrendAnalysis}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-gradient-to-r from-red-700 to-red-600 text-white rounded-xl hover:from-red-800 hover:to-red-700 shadow-sm">
            <Sparkles size={14} /> AI Trend Analysis
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
          { id: 'analyze', label: 'Incident Analysis', icon: Brain },
          { id: 'trends', label: 'Trend Report', icon: TrendingUp },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
              tab === t.id ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Dashboard Tab ──────────────────────────────────────────────── */}
      {tab === 'dashboard' && stats && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
              <div className="flex items-center gap-2 mb-1"><Flame size={14} className="text-red-600 dark:text-red-400" /><span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">Incidents YTD</span></div>
              <p className="text-3xl font-black text-gray-900 dark:text-gray-100">{stats.totalIncidents || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
              <div className="flex items-center gap-2 mb-1"><Clock size={14} className="text-blue-600 dark:text-blue-400" /><span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">Avg Response</span></div>
              <p className="text-3xl font-black text-gray-900 dark:text-gray-100">{stats.avgResponseTime != null ? `${stats.avgResponseTime}m` : '—'}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
              <div className="flex items-center gap-2 mb-1"><Target size={14} className="text-purple-600 dark:text-purple-400" /><span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">90th %ile</span></div>
              <p className="text-3xl font-black text-gray-900 dark:text-gray-100">{stats.p90ResponseTime != null ? `${stats.p90ResponseTime}m` : '—'}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
              <div className="flex items-center gap-2 mb-1"><Clock size={14} className="text-amber-600 dark:text-amber-400" /><span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">Avg Duration</span></div>
              <p className="text-3xl font-black text-gray-900 dark:text-gray-100">{stats.avgDuration != null ? `${stats.avgDuration}m` : '—'}</p>
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Day of week */}
            {stats.dayOfWeek && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Calls by Day of Week</p>
                <MiniBarChart data={stats.dayOfWeek} labels={DAY_LABELS} color="bg-red-500" height={56} />
              </div>
            )}
            {/* Hour of day */}
            {stats.hourOfDay && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4 col-span-2">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Calls by Hour of Day</p>
                <MiniBarChart data={stats.hourOfDay} labels={HOUR_LABELS} color="bg-blue-500" height={56} />
              </div>
            )}
          </div>

          {/* Type breakdown + Repeat locations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.typeCounts && Object.keys(stats.typeCounts).length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Incident Types</p>
                <div className="space-y-2">
                  {Object.entries(stats.typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 dark:text-gray-300 w-36 truncate">{type}</span>
                      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${(count / (stats.totalIncidents || 1)) * 100}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-8 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {stats.repeatLocations?.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border p-4">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 flex items-center gap-1.5"><MapPin size={12} className="text-red-600 dark:text-red-400" /> Repeat Locations</p>
                <div className="space-y-2">
                  {stats.repeatLocations.map((loc, i) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-950 rounded-xl px-3 py-2">
                      <span className="text-lg font-black text-red-700 dark:text-red-300">{loc.count}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{loc.address}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">{loc.types.join(', ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recent incidents — clickable for AI analysis */}
          {stats.recentIncidents?.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 dark:bg-gray-950 border-b flex items-center justify-between">
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Recent Incidents — Click to Analyze</p>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">AI analysis requires API key</span>
              </div>
              <div className="divide-y">
                {/* FAB_RAIL_GUTTER: the Analyze button reaches the right edge, and the
                    floating rail claims the outer 68px of the viewport. Measured on prod
                    2026-08-06: 8-20% covered at three different scroll positions. */}
                {stats.recentIncidents.map(inc => (
                  <div key={inc.id} className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${FAB_RAIL_GUTTER}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">#{inc.incidentNumber}</span>
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-[11px] font-medium text-gray-600 dark:text-gray-300">{inc.type}</span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">{inc.alarmLevel}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{inc.address} · {inc.date} {inc.time}</p>
                    </div>
                    <button onClick={() => analyzeIncident(inc)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold bg-gray-900 text-white rounded-lg hover:bg-gray-800">
                      <Brain size={10} /> Analyze
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Analyze Tab ────────────────────────────────────────────────── */}
      {tab === 'analyze' && (
        <div className="space-y-4">
          {selectedIncident && (
            <div className="bg-gray-900 text-white rounded-2xl px-5 py-3 flex items-center gap-3">
              <Flame size={16} className="text-red-400" />
              <div className="flex-1">
                <span className="text-sm font-bold">#{selectedIncident.incidentNumber}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{selectedIncident.type} · {selectedIncident.address} · {selectedIncident.date}</span>
              </div>
            </div>
          )}
          {aiLoading && (
            <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin mr-3" />
              <span className="text-sm">AI is analyzing this incident…</span>
            </div>
          )}
          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
          )}
          {analysis && <AnalysisCard analysis={analysis} />}
          {!selectedIncident && !aiLoading && (
            <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-12 text-center">
              <Brain className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Select an incident from the Dashboard tab to run AI analysis</p>
            </div>
          )}
        </div>
      )}

      {/* ── Trends Tab ─────────────────────────────────────────────────── */}
      {tab === 'trends' && (
        <div className="space-y-4">
          {aiLoading && (
            <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin mr-3" />
              <span className="text-sm">AI is analyzing {stats?.totalIncidents || 0} incidents for trends…</span>
            </div>
          )}
          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
          )}
          {trends && <TrendCard trends={trends} />}
          {!trends && !aiLoading && !error && (
            <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-12 text-center">
              <TrendingUp className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Click "AI Trend Analysis" to generate a comprehensive trend report</p>
              <button onClick={runTrendAnalysis}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-gradient-to-r from-red-700 to-red-600 text-white rounded-xl">
                <Sparkles size={14} /> Run Analysis
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
