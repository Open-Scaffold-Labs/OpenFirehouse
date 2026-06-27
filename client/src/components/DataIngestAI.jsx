import { useState, useCallback, useEffect } from 'react';
import {
  Brain, Upload, FileText, CheckCircle2, AlertTriangle, ArrowRight,
  ArrowLeft, Loader2, Trash2, Download, Database, Sparkles, XCircle,
  FileSpreadsheet, ClipboardPaste, RefreshCw, Eye, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '../utils/api';

// ─── step labels ─────────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Select Target', icon: Database },
  { label: 'Provide Data', icon: Upload },
  { label: 'AI Analysis', icon: Brain },
  { label: 'Review Mapping', icon: Eye },
  { label: 'Transform', icon: Sparkles },
  { label: 'Import', icon: CheckCircle2 },
];

// ─── stepper bar ─────────────────────────────────────────────────────────────
function Stepper({ step }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const active = i === step;
        const done = i < step;
        return (
          <div key={i} className="flex items-center gap-1 flex-1">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              active ? 'bg-red-600 text-white shadow-sm' :
              done ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' :
              'bg-gray-100 dark:bg-gray-800 text-gray-400'
            }`}>
              <Icon size={14} />
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 rounded ${done ? 'bg-emerald-300' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── confidence badge ────────────────────────────────────────────────────────
function ConfBadge({ level }) {
  const colors = {
    high: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
    medium: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
    low: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colors[level] || colors.low}`}>
      {level}
    </span>
  );
}

// ─── main component ──────────────────────────────────────────────────────────
export default function DataIngestAI() {
  const [step, setStep] = useState(0);
  const [schemas, setSchemas] = useState([]);
  const [targetModule, setTargetModule] = useState('');
  const [sourceDesc, setSourceDesc] = useState('');
  const [rawData, setRawData] = useState('');
  const [inputMethod, setInputMethod] = useState('paste'); // paste | file
  const [fileName, setFileName] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [mapping, setMapping] = useState([]);
  const [transformResult, setTransformResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAllRows, setShowAllRows] = useState(false);

  // Fetch schemas on mount
  useEffect(() => {
    api.get('/api/data-ingest/schemas').then(res => {
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setSchemas(list);
    }).catch(() => {});
  }, []);

  // File handler
  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setRawData(ev.target.result);
    reader.readAsText(file);
  }, []);

  // Drop handler
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setRawData(ev.target.result);
    reader.readAsText(file);
  }, []);

  // Step 2 → 3: Run AI analysis
  async function runAnalysis() {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/data-ingest/analyze', {
        rawData, targetModule, sourceDescription: sourceDesc || `File: ${fileName}`,
      });
      if (res.analysis) {
        setAnalysis(res.analysis);
        setMapping(res.analysis.columnMapping || []);
        setStep(3);
      } else {
        setError('AI analysis returned empty result.');
      }
    } catch (err) {
      setError(err.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  // Step 3 → 4: Transform data
  async function runTransform() {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/data-ingest/transform', {
        rawData, targetModule, columnMapping: mapping,
        sourceDescription: sourceDesc || `File: ${fileName}`,
      });
      setTransformResult(res);
      setStep(4);
    } catch (err) {
      setError(err.message || 'Transformation failed');
    } finally {
      setLoading(false);
    }
  }

  // Step 4 → 5: Import
  async function runImport() {
    if (!transformResult?.rows?.length) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/data-ingest/import', {
        targetModule, rows: transformResult.rows,
      });
      setImportResult(res);
      setStep(5);
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  // Reset
  function reset() {
    setStep(0);
    setTargetModule('');
    setSourceDesc('');
    setRawData('');
    setFileName('');
    setAnalysis(null);
    setMapping([]);
    setTransformResult(null);
    setImportResult(null);
    setError('');
    setShowAllRows(false);
  }

  // Remove a mapping row
  function removeMapping(idx) {
    setMapping(prev => prev.filter((_, i) => i !== idx));
  }

  const selectedSchema = schemas.find(s => s.id === targetModule);

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-600 to-orange-500 shadow-md">
          <Brain size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">AI Data Ingestion</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Paste or upload any format — AI maps it to OpenFirehouse automatically.</p>
        </div>
      </div>

      <Stepper step={step} />

      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-sm text-red-700 dark:text-red-300">
          <XCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Error</p>
            <p>{error}</p>
          </div>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="ml-auto text-red-400 hover:text-red-600 dark:hover:text-red-400">×</button>
        </div>
      )}

      {/* ── STEP 0: Select Target ────────────────────────────────────────── */}
      {step === 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">What are you importing?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Select which module this data belongs to. AI will map your data to the correct fields.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {schemas.map(s => (
              <button
                key={s.id}
                onClick={() => setTargetModule(s.id)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  targetModule === s.id
                    ? 'border-red-500 bg-red-50 dark:bg-red-950/50 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{s.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.columns.length} fields</p>
              </button>
            ))}
          </div>

          {targetModule && selectedSchema && (
            <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Target Fields for {selectedSchema.label}:</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedSchema.columns.map(c => (
                  <span key={c.name} className={`text-[11px] px-2 py-0.5 rounded-full border ${
                    c.required ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900 font-semibold' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                  }`}>
                    {c.name.replace(/"/g, '')}{c.required ? ' *' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => setStep(1)}
              disabled={!targetModule}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 1: Provide Data ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">Provide Your Data</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Paste data directly, upload a CSV/TSV/TXT file, or even paste a screenshot-to-text conversion.
              AI will figure out the format and map it to <strong>{selectedSchema?.label}</strong>.
            </p>
          </div>

          {/* source description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Source Description (optional)</label>
            <input
              type="text"
              value={sourceDesc}
              onChange={e => setSourceDesc(e.target.value)}
              placeholder="e.g. CSV export from previous RMS, member roster spreadsheet, hand-typed list from chief..."
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </div>

          {/* input method toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setInputMethod('paste')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                inputMethod === 'paste' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <ClipboardPaste size={14} /> Paste Data
            </button>
            <button
              onClick={() => setInputMethod('file')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                inputMethod === 'file' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <FileSpreadsheet size={14} /> Upload File
            </button>
          </div>

          {inputMethod === 'paste' ? (
            <textarea
              value={rawData}
              onChange={e => setRawData(e.target.value)}
              aria-label="Paste raw data to import"
              placeholder={`Paste your data here in any format:\n\n• CSV with headers\n• Tab-separated table\n• Hand-typed list\n• Copy-pasted from a spreadsheet\n• JSON array\n• Even messy notes — AI will figure it out\n\nExample:\nName, Rank, Status, Badge#\nJohn Smith, Captain, Active, 1234\nJane Doe, FF1, Active, 1235`}
              rows={12}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-300 resize-y"
            />
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-10 text-center hover:border-red-400 hover:bg-red-50/30 transition-colors"
            >
              <Upload size={32} className="mx-auto text-gray-400 mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-300 font-medium mb-1">Drop a file here or click to browse</p>
              <p className="text-xs text-gray-400">Supports CSV, TSV, TXT, JSON</p>
              <input type="file" accept=".csv,.tsv,.txt,.json" onChange={handleFile} className="hidden" id="file-input" />
              <label htmlFor="file-input" className="inline-block mt-3 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                Choose File
              </label>
              {fileName && (
                <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400 font-medium flex items-center justify-center gap-1">
                  <CheckCircle2 size={14} /> {fileName} loaded ({rawData.length.toLocaleString()} chars)
                </p>
              )}
            </div>
          )}

          {rawData && (
            <p className="text-xs text-gray-400">{rawData.length.toLocaleString()} characters · ~{rawData.split('\n').length} lines</p>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(0)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              <ArrowLeft size={14} /> Back
            </button>
            <button
              onClick={() => { setStep(2); runAnalysis(); }}
              disabled={!rawData.trim() || loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
              Analyze with AI <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: AI Analyzing (loading state) ─────────────────────────── */}
      {step === 2 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-10 text-center">
          <Loader2 size={40} className="mx-auto text-red-600 dark:text-red-400 animate-spin mb-4" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">AI is Analyzing Your Data</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Detecting format, identifying columns, mapping to {selectedSchema?.label} schema,
            and checking data quality. This usually takes 5–15 seconds.
          </p>
        </div>
      )}

      {/* ── STEP 3: Review Mapping ───────────────────────────────────────── */}
      {step === 3 && analysis && (
        <div className="space-y-5">
          {/* summary card */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 shrink-0">
                <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Analysis Complete</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{analysis.summary}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{analysis.totalRecords || '—'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Records Found</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{analysis.detectedFormat || '—'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Format</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{analysis.detectedSource || '—'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Source System</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{mapping.length}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Fields Mapped</p>
              </div>
            </div>
          </div>

          {/* mapping table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Column Mapping</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Review and adjust the AI-proposed field mapping. Remove rows you don't want imported.</p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Source Column</th>
                    <th className="text-center py-2 px-1 text-xs text-gray-400">→</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Target Field</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Confidence</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Transform</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {mapping.map((m, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-2 px-3 font-mono text-xs text-gray-700 dark:text-gray-300">{m.sourceColumn}</td>
                      <td className="text-center px-1 text-gray-300 dark:text-gray-600">→</td>
                      <td className="py-2 px-3">
                        <select
                          value={m.targetColumn}
                          aria-label={`Target field for ${m.sourceColumn}`}
                          onChange={e => {
                            const updated = [...mapping];
                            updated[i] = { ...m, targetColumn: e.target.value };
                            setMapping(updated);
                          }}
                          className="border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-red-300"
                        >
                          {selectedSchema?.columns.map(c => (
                            <option key={c.name} value={c.name.replace(/"/g, '')}>{c.name.replace(/"/g, '')}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3 text-center"><ConfBadge level={m.confidence} /></td>
                      <td className="py-2 px-3 text-xs text-gray-500 dark:text-gray-400 max-w-[200px] truncate">{m.transformNote || '—'}</td>
                      <td className="py-2 px-2">
                        <button onClick={() => removeMapping(i)} aria-label={`Remove mapping for ${m.sourceColumn}`} className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* warnings */}
          {analysis.warnings?.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1"><AlertTriangle size={13} /> Warnings</p>
              <ul className="space-y-1">
                {analysis.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700 dark:text-amber-300">• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* missing required */}
          {analysis.missingRequiredFields?.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl p-4">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2 flex items-center gap-1"><XCircle size={13} /> Missing Required Fields</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.missingRequiredFields.map((f, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 font-medium">{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* sample preview */}
          {analysis.sampleRows?.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Sample Preview (first {analysis.sampleRows.length} rows)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      {Object.keys(analysis.sampleRows[0]).map(k => (
                        <th key={k} className="text-left py-2 px-2 font-semibold text-gray-500 dark:text-gray-400">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.sampleRows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-700">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="py-2 px-2 text-gray-700 dark:text-gray-300 max-w-[150px] truncate">{String(v ?? '—')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => { setStep(1); setAnalysis(null); }} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
              <ArrowLeft size={14} /> Back
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => { setStep(2); runAnalysis(); }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <RefreshCw size={14} /> Re-analyze
              </button>
              <button
                onClick={runTransform}
                disabled={mapping.length === 0 || loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Transform Data <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4: Transform Results / Preview ──────────────────────────── */}
      {step === 4 && transformResult && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 shrink-0">
                <Sparkles size={18} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Data Transformed</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {transformResult.stats?.transformed || transformResult.rows?.length || 0} records ready for import.
                  {transformResult.stats?.skipped > 0 && ` ${transformResult.stats.skipped} rows skipped.`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{transformResult.stats?.totalInput || '—'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Input Rows</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{transformResult.rows?.length || 0}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Ready to Import</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{transformResult.stats?.skipped || 0}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Skipped</p>
              </div>
            </div>

            {/* data preview table */}
            {transformResult.rows?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
                      <th className="text-left py-2 px-2 font-semibold text-gray-500 dark:text-gray-400">#</th>
                      {Object.keys(transformResult.rows[0]).map(k => (
                        <th key={k} className="text-left py-2 px-2 font-semibold text-gray-500 dark:text-gray-400">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllRows ? transformResult.rows : transformResult.rows.slice(0, 10)).map((row, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="py-1.5 px-2 text-gray-400">{i + 1}</td>
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="py-1.5 px-2 text-gray-700 dark:text-gray-300 max-w-[160px] truncate">{String(v ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {transformResult.rows.length > 10 && (
                  <button
                    onClick={() => setShowAllRows(!showAllRows)}
                    className="mt-2 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1"
                  >
                    {showAllRows ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {showAllRows ? 'Show less' : `Show all ${transformResult.rows.length} rows`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* warnings */}
          {transformResult.warnings?.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1"><AlertTriangle size={13} /> Transform Warnings</p>
              <ul className="space-y-1">
                {transformResult.warnings.map((w, i) => <li key={i} className="text-xs text-amber-700 dark:text-amber-300">• {w}</li>)}
              </ul>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
              <ArrowLeft size={14} /> Back to Mapping
            </button>
            <button
              onClick={runImport}
              disabled={!transformResult.rows?.length || loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
              Import {transformResult.rows?.length || 0} Records <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 5: Import Complete ──────────────────────────────────────── */}
      {step === 5 && importResult && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 text-center space-y-5">
          <div className="inline-flex p-4 rounded-full bg-emerald-100 dark:bg-emerald-950/50">
            <CheckCircle2 size={40} className="text-emerald-600 dark:text-emerald-400" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Import Complete</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Data has been imported into {selectedSchema?.label}.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
            <div className="bg-emerald-50 dark:bg-emerald-950/50 rounded-xl p-4">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{importResult.inserted}</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Inserted</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/50 rounded-xl p-4">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{importResult.failed}</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">Failed</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-4">
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{importResult.total}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
            </div>
          </div>

          {importResult.errors?.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl p-4 text-left max-w-lg mx-auto">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2">Errors (first {importResult.errors.length}):</p>
              <ul className="space-y-1">
                {importResult.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-700 dark:text-red-300">Row {e.row}: {e.error}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            <RefreshCw size={14} /> Import More Data
          </button>
        </div>
      )}
    </div>
  );
}
