import { useState, useEffect, useCallback } from 'react';
import { Package, FileText, Shield, AlertTriangle, CheckCircle2, Circle, ChevronDown, ChevronRight, Zap, RefreshCw, Loader2, FileCheck, ClipboardList, Users, BarChart3 } from 'lucide-react';
import AIActionButton from './AIActionButton';
import { api } from '../utils/api';

// ── Score Ring — circular progress indicator ──────────────────────────────────
function ScoreRing({ score, size = 56, stroke = 5 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-all duration-700" />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        className="transform rotate-90 origin-center" fill={color}
        style={{ fontSize: size * 0.28, fontWeight: 700 }}>{score}%</text>
    </svg>
  );
}

// ── Document type icons ───────────────────────────────────────────────────────
const DOC_ICONS = {
  incident_report: FileText,
  after_action_report: ClipboardList,
  exposure_check: Users,
  nfirs_check: FileCheck,
};

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ score, included }) {
  if (!included) return <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">N/A</span>;
  if (score === 100) return <span className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded font-medium">Complete</span>;
  if (score >= 50) return <span className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded font-medium">In Progress</span>;
  return <span className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded font-medium">{score > 0 ? 'Incomplete' : 'Not Started'}</span>;
}

// ── Document Row — expandable document in the package ─────────────────────────
function DocumentRow({ doc, incidentId, incidentData, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = DOC_ICONS[doc.docType] || FileText;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => doc.included && setExpanded(!expanded)}
        aria-expanded={expanded}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          doc.included ? 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer' : 'opacity-60 cursor-default'
        }`}
      >
        {doc.included ? (
          expanded ? <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
        ) : <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />}

        <Icon className={`w-5 h-5 shrink-0 ${doc.included ? (doc.score === 100 ? 'text-emerald-500' : 'text-blue-500') : 'text-gray-300 dark:text-gray-600'}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{doc.label}</span>
            {doc.required && <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded">Required</span>}
          </div>
          {doc.detail && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{doc.detail}</p>}
          {doc.reason && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{doc.reason}</p>}
          {doc.status && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Status: {doc.status}</p>}
        </div>

        <StatusBadge score={doc.score} included={doc.included} />

        {doc.included && (
          <div className="shrink-0 ml-1">
            <ScoreRing score={doc.score} size={36} stroke={3} />
          </div>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && doc.included && (
        <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 px-4 py-3">
          {/* Checks by category */}
          {doc.categories && doc.categories.map(cat => (
            <div key={cat.label} className="mb-3 last:mb-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{cat.label}</span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{cat.complete}/{cat.total}</span>
              </div>
              <div className="space-y-1 pl-2">
                {cat.checks.map(check => (
                  <div key={check.field} className="flex items-start gap-2 text-sm">
                    {check.complete ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className={check.complete ? 'text-gray-600 dark:text-gray-300' : 'text-gray-900 dark:text-gray-100'}>{check.label}</span>
                      {check.value && <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{check.value}</span>}
                      {check.detail && <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{check.detail}</p>}
                    </div>
                    {!check.complete && check.aiAction && (
                      <AIActionButton
                        action={check.aiAction}
                        recordId={incidentId}
                        data={incidentData}
                        variant="inline"
                        label="Fix"
                        saveable
                        onApplied={onRefresh}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Exposure member list */}
          {doc.members && doc.members.length > 0 && (
            <div className="space-y-1 pl-2">
              {doc.members.map(m => (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  {m.hasExposure ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                  <span className={m.hasExposure ? 'text-gray-600 dark:text-gray-300' : 'text-gray-900 dark:text-gray-100'}>
                    {m.rank ? `${m.rank} ` : ''}{m.name}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{m.hasExposure ? 'Covered' : 'Missing'}</span>
                </div>
              ))}
            </div>
          )}

          {/* AI actions available for this document */}
          {doc.aiActions && doc.aiActions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              {doc.aiActions.map(action => (
                <AIActionButton
                  key={action}
                  action={action}
                  recordId={incidentId}
                  data={incidentData}
                  variant="button"
                  saveable
                  onApplied={onRefresh}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: DocumentPackagePanel
// ═══════════════════════════════════════════════════════════════════════════════

export default function DocumentPackagePanel({ incidentId, incidentData }) {
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [expanded, setExpanded] = useState(false);

  // Bugfix (2026-06-10 design audit): this panel read localStorage 'token',
  // but the app stores its JWT as 'fs_token' (utils/api.js) — so every request
  // went out as "Bearer null", 401'd, and the panel permanently showed
  // "Failed to load package". Use the shared api util, which owns the token
  // (and the refresh flow) so this class of drift can't recur.
  const fetchPackage = useCallback(async () => {
    try {
      setLoading(true);
      const json = await api.get(`/api/completeness/package/${incidentId}`);
      setPkg(json.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => { fetchPackage(); }, [fetchPackage]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setGenResult(null);
      const json = await api.post('/api/ai/action/package', { incidentId });
      setGenResult(json.data);
      // Refresh package data
      await fetchPackage();
    } catch (err) {
      setGenResult({ status: 'error', message: err.message });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-3">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading document package...
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-500 py-2">{error}</div>;
  }

  if (!pkg) return null;

  const includedDocs = pkg.documents.filter(d => d.included);
  const completeDocs = includedDocs.filter(d => d.score === 100);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
        <Package className="w-5 h-5 text-indigo-500" />
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{pkg.label}</span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400">{completeDocs.length}/{includedDocs.length} documents</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{pkg.description}</p>
        </div>
        <ScoreRing score={pkg.score} size={44} stroke={4} />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 space-y-3">
          {/* Package summary bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <BarChart3 className="w-3.5 h-3.5" />
                {pkg.complete}/{pkg.total} checks passed
              </span>
              {pkg.availableActions.length > 0 && (
                <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                  <Zap className="w-3.5 h-3.5" />
                  {pkg.availableActions.length} AI action{pkg.availableActions.length !== 1 ? 's' : ''} available
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); fetchPackage(); }}
                className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>

              {pkg.generatable && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {generating ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                  ) : (
                    <><Zap className="w-3.5 h-3.5" /> Generate Full Package</>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Generation result */}
          {genResult && (
            <div className={`rounded-lg px-3 py-2 text-sm ${
              genResult.status === 'error' ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300' :
              genResult.status === 'complete' ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' :
              genResult.status === 'nothing_to_generate' ? 'bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-300' :
              'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
            }`}>
              <div className="flex items-center gap-2">
                {genResult.status === 'complete' && <CheckCircle2 className="w-4 h-4" />}
                {genResult.status === 'error' && <AlertTriangle className="w-4 h-4" />}
                <span className="font-medium">{genResult.message}</span>
              </div>
              {genResult.scoreBefore !== undefined && genResult.scoreBefore !== genResult.score && (
                <p className="text-xs mt-1 opacity-75">
                  Package score: {genResult.scoreBefore}% → {genResult.score}%
                </p>
              )}
              {genResult.results && genResult.results.length > 0 && (
                <div className="mt-2 space-y-1">
                  {genResult.results.map((r, i) => (
                    <div key={i} className="text-xs flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{r.forDocument}: {r.saved ? 'Generated & saved' : 'Generated'}</span>
                    </div>
                  ))}
                </div>
              )}
              {genResult.errors && genResult.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {genResult.errors.map((e, i) => (
                    <div key={i} className="text-xs flex items-center gap-1.5 text-red-600 dark:text-red-400">
                      <AlertTriangle className="w-3 h-3" />
                      <span>{e.forDocument}: {e.error}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Document list */}
          <div className="space-y-2">
            {pkg.documents.map(doc => (
              <DocumentRow
                key={doc.docType}
                doc={doc}
                incidentId={incidentId}
                incidentData={incidentData}
                onRefresh={fetchPackage}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
