import { useState, useRef } from 'react';
import {
  Upload, Link, CheckCircle, AlertTriangle, Loader2,
  XCircle, MapPin, ChevronRight, RotateCcw,
} from 'lucide-react';
import { api } from '../utils/api';
import { nfpa291Class } from '../utils/nfpa291';

const STEPS = ['Source', 'Preview', 'Confirm', 'Done'];

function StepBar({ step }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center flex-1 last:flex-none">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold border-2 shrink-0 ${
            i < step  ? 'bg-green-500 border-green-500 text-white' :
            i === step ? 'bg-red-600 border-red-600 text-white' :
                         'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400'
          }`}>
            {i < step ? <CheckCircle size={13} /> : i + 1}
          </div>
          <span className={`ml-2 text-xs font-semibold ${i === step ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>{s}</span>
          {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-3 rounded ${i < step ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} />}
        </div>
      ))}
    </div>
  );
}

export default function HydrantImport({ onClose, onImported }) {
  const [step,      setStep]      = useState(0);
  const [mode,      setMode]      = useState('arcgis'); // 'arcgis' | 'csv'
  const [arcgisUrl, setArcgisUrl] = useState('');
  const [csvFile,   setCsvFile]   = useState(null);
  const [preview,   setPreview]   = useState(null);
  const [result,    setResult]    = useState(null);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');
  const fileRef = useRef(null);

  async function handlePreview() {
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      if (mode === 'arcgis') {
        fd.append('arcgisUrl', arcgisUrl.trim());
      } else if (csvFile) {
        fd.append('file', csvFile);
      } else {
        setError('Please select a CSV file.');
        setBusy(false);
        return;
      }
      const res = await api.postForm('/api/hydrants/import/preview', fd);
      setPreview(res);
      setStep(1);
    } catch (e) {
      setError(e?.message || 'Preview failed');
    }
    setBusy(false);
  }

  async function handleCommit() {
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      if (mode === 'arcgis') {
        fd.append('arcgisUrl', arcgisUrl.trim());
      } else if (csvFile) {
        fd.append('file', csvFile);
      }
      const res = await api.postForm('/api/hydrants/import/commit', fd);
      setResult(res);
      setStep(3);
      if (onImported) onImported(res);
    } catch (e) {
      setError(e?.message || 'Import failed');
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-red-700 rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold text-white">Import Hydrants</h2>
            <p className="text-[11px] text-red-200">ArcGIS Feature Service or CSV</p>
          </div>
          <button onClick={onClose} className="text-red-200 hover:text-white"><XCircle size={18} /></button>
        </div>

        <div className="p-6">
          <StepBar step={step} />

          {/* Step 0 — Source */}
          {step === 0 && (
            <div className="space-y-5">
              <div className="flex gap-3">
                {[
                  { id: 'arcgis', label: 'ArcGIS Feature Service', icon: Link,   desc: 'Import from a municipality GIS REST endpoint' },
                  { id: 'csv',    label: 'CSV File',                icon: Upload, desc: 'Import from a spreadsheet export' },
                ].map(({ id, label, icon: Icon, desc }) => (
                  <button key={id} onClick={() => setMode(id)}
                    className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${
                      mode === id
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}>
                    <Icon size={18} className={mode === id ? 'text-red-600 dark:text-red-400' : 'text-gray-400'} />
                    <p className={`text-sm font-bold mt-2 ${mode === id ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'}`}>{label}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>

              {mode === 'arcgis' && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
                    ArcGIS Feature Service URL
                  </label>
                  <input
                    type="url"
                    value={arcgisUrl}
                    onChange={e => setArcgisUrl(e.target.value)}
                    placeholder="https://services.arcgis.com/.../FeatureServer/0"
                    className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <p className="text-[10px] text-gray-400">
                    Paste the REST endpoint URL for your municipality's hydrant layer. Must end in a layer number (e.g., /0).
                    Supports public ArcGIS Online and ArcGIS Enterprise services.
                  </p>
                </div>
              )}

              {mode === 'csv' && (
                <div>
                  <input type="file" accept=".csv,.txt" ref={fileRef}
                    onChange={e => setCsvFile(e.target.files?.[0] ?? null)}
                    className="hidden" />
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center hover:border-red-300 dark:hover:border-red-700 transition-colors">
                    <Upload size={20} className="mx-auto mb-2 text-gray-400" />
                    {csvFile
                      ? <p className="text-sm font-bold text-green-600 dark:text-green-400">{csvFile.name}</p>
                      : <p className="text-sm text-gray-500">Click to choose a CSV file</p>}
                    <p className="text-[10px] text-gray-400 mt-1">
                      Fields auto-mapped. Lat/lng columns (if present) will set GPS pins.
                    </p>
                  </button>
                </div>
              )}

              {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}

              <div className="flex justify-end">
                <button onClick={handlePreview} disabled={busy || (mode === 'arcgis' && !arcgisUrl.trim()) || (mode === 'csv' && !csvFile)}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                  {busy ? 'Fetching…' : 'Preview Import'}
                </button>
              </div>
            </div>
          )}

          {/* Step 1 — Preview */}
          {step === 1 && preview && (
            <div className="space-y-5">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Total Rows',    value: preview.total,    color: 'text-gray-900 dark:text-gray-100' },
                  { label: 'Valid',         value: preview.valid,    color: 'text-green-600 dark:text-green-400' },
                  { label: 'Invalid',       value: preview.invalid,  color: preview.invalid > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400' },
                  { label: 'GPS Pinned',    value: preview.geoCount, color: 'text-blue-600 dark:text-blue-400' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                    <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-gray-400">{s.label}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Sample (first 10 rows)</p>
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-[10px]">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        {['#', 'Address', 'Flow (GPM)', 'Class', 'GPS'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample.map((row, i) => {
                        const cls = nfpa291Class(row.flowRate);
                        return (
                          <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                            <td className="px-3 py-2 font-mono font-bold text-gray-800 dark:text-gray-100">{row.hydrantNumber}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400 truncate max-w-[180px]">{row.streetAddress || '—'}</td>
                            <td className="px-3 py-2 font-bold text-gray-700 dark:text-gray-300">{row.flowRate ? `${row.flowRate} GPM` : '—'}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold ${cls.tailwind}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cls.dot}`} />
                                {cls.label}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              {row.lat && row.lng
                                ? <MapPin size={11} className="text-green-500" title={`${row.lat}, ${row.lng}`} />
                                : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {preview.invalid > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {preview.invalid} row{preview.invalid !== 1 ? 's' : ''} skipped (missing hydrant ID/number).
                </p>
              )}

              {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}

              <div className="flex justify-between">
                <button onClick={() => { setStep(0); setPreview(null); setError(''); }}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700">
                  <RotateCcw size={12} /> Back
                </button>
                <button onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700">
                  <ChevronRight size={14} /> Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Confirm */}
          {step === 2 && preview && (
            <div className="space-y-5">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <AlertTriangle size={15} /> Ready to import {preview.valid} hydrant{preview.valid !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Existing hydrants with the same number will be updated. New hydrants will be created.
                  {preview.geoCount > 0 && ` ${preview.geoCount} hydrant${preview.geoCount !== 1 ? 's' : ''} will receive GPS pins.`}
                  {' '}This cannot be undone in bulk.
                </p>
              </div>

              {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}

              <div className="flex justify-between">
                <button onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700">
                  <RotateCcw size={12} /> Back
                </button>
                <button onClick={handleCommit} disabled={busy}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  {busy ? 'Importing…' : 'Import Hydrants'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Done */}
          {step === 3 && result && (
            <div className="text-center space-y-4 py-6">
              <CheckCircle size={48} className="mx-auto text-green-500" />
              <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">Import Complete</h3>
              <div className="flex justify-center gap-6">
                <div>
                  <p className="text-2xl font-black text-green-600 dark:text-green-400">{result.inserted}</p>
                  <p className="text-xs text-gray-400">Added</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{result.updated}</p>
                  <p className="text-xs text-gray-400">Updated</p>
                </div>
                {result.errors > 0 && (
                  <div>
                    <p className="text-2xl font-black text-red-600 dark:text-red-400">{result.errors}</p>
                    <p className="text-xs text-gray-400">Errors</p>
                  </div>
                )}
              </div>
              <button onClick={onClose}
                className="px-6 py-2 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
