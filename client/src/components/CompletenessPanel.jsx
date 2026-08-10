import { useState, useEffect } from 'react';
import {
  CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronRight,
  Loader2, Sparkles, RefreshCw, FileCheck,
} from 'lucide-react';
import { api } from '../utils/api';
import AIActionButton from './AIActionButton';

const CATEGORY_LABELS = {
  core: 'Core Fields',
  timeline: 'Timeline',
  resources: 'Personnel & Resources',
  narrative: 'Narrative',
  linked: 'Linked Records',
  compliance: 'Compliance',
  documentation: 'Documentation',
  analysis: 'Analysis',
};

const CATEGORY_ORDER = ['core', 'timeline', 'resources', 'narrative', 'linked', 'compliance', 'documentation', 'analysis'];

function ScoreRing({ score }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';

  return (
    <div className="relative flex items-center justify-center w-14 h-14">
      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="4" />
        <circle cx="24" cy="24" r={radius} fill="none" stroke={color} strokeWidth="4"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700 ease-out" />
      </svg>
      <span className="absolute text-sm font-bold" style={{ color }}>{score}%</span>
    </div>
  );
}

function CheckItem({ check, incidentData, onRefresh }) {
  return (
    <div className={`flex items-start gap-2 py-1.5 ${check.complete ? 'opacity-70' : ''}`}>
      {check.complete ? (
        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
      ) : check.required ? (
        <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${check.complete ? 'text-gray-500 dark:text-gray-400' : check.required ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
            {check.label}
          </span>
          {check.required && !check.complete && (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-1.5 py-0.5 rounded">Required</span>
          )}
        </div>
        {check.value && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{check.value}</p>
        )}
        {check.detail && !check.complete && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{check.detail}</p>
        )}
        {check.aiAction && !check.complete && incidentData && (
          <div className="mt-1">
            <AIActionButton
              action={check.aiAction}
              context={{ module: 'incidents', recordId: incidentData.id, data: incidentData }}
              label={`AI: Fix this`}
              variant="inline"
              saveable
              onApplied={() => { if (onRefresh) onRefresh(); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CategorySection({ category, incidentData, onRefresh }) {
  const [open, setOpen] = useState(!category.checks.every(c => c.complete));
  const allComplete = category.complete === category.total;

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-2 px-1 text-left hover:bg-gray-50/50 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3 text-gray-500 dark:text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-500 dark:text-gray-400" />}
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider flex-1">
          {CATEGORY_LABELS[category.label] || category.label}
        </span>
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
          allComplete ? 'bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
        }`}>
          {category.complete}/{category.total}
        </span>
      </button>
      {open && (
        <div className="pl-5 pb-2 space-y-0.5">
          {category.checks.map((check) => (
            <CheckItem key={check.field} check={check} incidentData={incidentData} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CompletenessPanel({ incidentId, incidentData, onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const fetchCompleteness = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/api/completeness/incident/${incidentId}`);
      setData(res.data || res);
    } catch (err) {
      setError(err.message || 'Could not check completeness');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCompleteness(); }, [incidentId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 bg-gray-50 dark:bg-gray-950 rounded-lg">
        <Loader2 className="h-4 w-4 text-gray-500 dark:text-gray-400 animate-spin" />
        <span className="text-xs text-gray-500 dark:text-gray-400">Checking completeness...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 bg-red-50 dark:bg-red-950/50 rounded-lg">
        <XCircle className="h-4 w-4 text-red-400" />
        <span className="text-xs text-red-700 dark:text-red-400">{error}</span>
        <button onClick={fetchCompleteness} className="ml-auto text-xs text-red-600 dark:text-red-400 underline">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  // Sort categories by defined order
  const sortedCategories = [...data.categories].sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a.label) ?? 99) - (CATEGORY_ORDER.indexOf(b.label) ?? 99)
  );

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-gray-50/50 transition-colors"
      >
        <FileCheck className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        <ScoreRing score={data.score} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{data.label}</span>
            {/* 700, not 600, on both pills: on its own -50 tint green-600 measures
                3.08:1 and red-600 4.36:1 — both under 4.5. A tinted pill is not the
                white card it sits on, and the backdrop is half the measurement.
                The red branch had never been rendered by any sweep. */}
            {data.readyForSubmission ? (
              <span className="text-[11px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/50 px-2 py-0.5 rounded-full">
                Ready
              </span>
            ) : (
              <span className="text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded-full">
                {data.required.total - data.required.complete} required missing
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {data.complete} of {data.total} fields complete
            {data.checks.filter(c => c.aiAction).length > 0 && (
              <> · <Sparkles className="h-3 w-3 inline text-amber-400" /> AI can help with {data.checks.filter(c => c.aiAction && !c.complete).length} field(s)</>
            )}
          </p>
        </div>
        <RefreshCw
          className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 hover:text-gray-500 transition-colors"
          onClick={(e) => { e.stopPropagation(); fetchCompleteness(); }}
        />
        {collapsed ? <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-700">
          {sortedCategories.map((cat) => (
            <CategorySection key={cat.label} category={cat} incidentData={incidentData} onRefresh={fetchCompleteness} />
          ))}
        </div>
      )}
    </div>
  );
}
