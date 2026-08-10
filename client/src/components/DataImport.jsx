import { useState, useRef, useEffect } from 'react';
import {
  Upload, Check, AlertTriangle, ChevronRight,
  ChevronLeft, FileText, Users, Flame, BookOpen,
  Truck, Package, X, ArrowRight, RefreshCw,
  CheckCircle, XCircle, Info, Download, ClipboardList,
} from 'lucide-react';
import {
  RECORD_TYPES, SOURCE_SYSTEMS, autoMapFields,
} from '../data/importers/fieldMaps';
import { validateAll, getValidationSummary } from '../data/importers/validators';
import {
  parseCSV, parseWorkbook, parsePDF, parseRunListPDF,
  applyMapping, createImportLogEntry, fmtTimestamp,
} from '../data/importers/importUtils';
import { api } from '../utils/api';

// ─── Step list ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'type',     label: 'Record Type'   },
  { id: 'source',   label: 'Source System' },
  { id: 'upload',   label: 'Upload'        },
  { id: 'mapping',  label: 'Field Mapping' },
  { id: 'validate', label: 'Validate'      },
  { id: 'preview',  label: 'Preview'       },
  { id: 'done',     label: 'Complete'      },
];

// ─── Icons per record type ────────────────────────────────────────────────────

const TYPE_ICONS = {
  runlist:   ClipboardList,
  members:   Users,
  incidents: Flame,
  training:  BookOpen,
  apparatus: Truck,
  assets:    Package,
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBar({ currentStep }) {
  const idx = STEPS.findIndex(s => s.id === currentStep);
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((step, i) => {
        const done    = i < idx;
        const active  = i === idx;
        const pending = i > idx;
        return (
          <div key={step.id} className="flex items-center gap-1 flex-1 min-w-0">
            <div className={`flex items-center gap-1.5 flex-shrink-0 ${pending ? 'opacity-40' : ''}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
                done   ? 'bg-green-500 text-white' :
                active ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>
                {done ? <Check size={12} /> : i + 1}
              </div>
              <span className={`text-[10px] font-semibold whitespace-nowrap ${active ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-1 ${i < idx ? 'bg-green-300' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Navigation buttons ───────────────────────────────────────────────────────

function NavRow({ onBack, onNext, nextLabel = 'Next', nextDisabled, showBack = true }) {
  return (
    <div className="flex justify-between items-center pt-5 mt-5 border-t border-gray-100 dark:border-gray-700">
      <div>
        {showBack && (
          <button onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700">
            <ChevronLeft size={14} /> Back
          </button>
        )}
      </div>
      <button onClick={onNext} disabled={nextDisabled}
        className={`flex items-center gap-1.5 px-5 py-2 text-sm font-bold rounded-xl transition-colors ${
          nextDisabled
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
        }`}>
        {nextLabel} <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ─── Step 1: Record Type ──────────────────────────────────────────────────────

function StepType({ selected, onSelect }) {
  return (
    <div>
      <h2 className="text-lg font-black text-gray-900 dark:text-gray-100 mb-1">What are you importing?</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Select the type of data you want to bring into OpenFirehouse.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {RECORD_TYPES.map(rt => {
          const Icon = TYPE_ICONS[rt.id] ?? FileText;
          const sel  = selected === rt.id;
          return (
            <button key={rt.id} onClick={() => onSelect(rt.id)}
              className={`flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                sel ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 shadow-sm' : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${sel ? 'bg-blue-600' : 'bg-gray-100 dark:bg-gray-800'}`}>
                <Icon size={18} className={sel ? 'text-white' : 'text-gray-500 dark:text-gray-400'} />
              </div>
              <div>
                <p className={`text-sm font-bold ${sel ? 'text-blue-800 dark:text-blue-300' : 'text-gray-800 dark:text-gray-100'}`}>{rt.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{rt.description}</p>
                <p className={`text-[10px] font-semibold mt-1 ${sel ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>→ {rt.targetModule}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 2: Source System ────────────────────────────────────────────────────

function StepSource({ recordType, selected, onSelect }) {
  const compatible = SOURCE_SYSTEMS.filter(s => s.supports.includes(recordType));
  return (
    <div>
      <h2 className="text-lg font-black text-gray-900 dark:text-gray-100 mb-1">Where is your data coming from?</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Choose your source system so OpenFirehouse can auto-suggest field mappings.</p>
      <div className="space-y-2">
        {compatible.map(sys => {
          const sel = selected === sys.id;
          return (
            <button key={sys.id} onClick={() => onSelect(sys.id)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                sel ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50' : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-200'
              }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-[11px] font-black ${sel ? 'bg-blue-600 text-white' : 'bg-gray-800 text-white'}`}>
                {sys.id === 'csv' ? 'CSV' : sys.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-bold ${sel ? 'text-blue-800 dark:text-blue-300' : 'text-gray-800 dark:text-gray-100'}`}>{sys.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{sys.description}</p>
              </div>
              {sel && <Check size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 3: Upload ───────────────────────────────────────────────────────────

function StepUpload({ recordType, onParsed, parsedData }) {
  const fileRef  = useRef(null);
  const [error,  setError]  = useState('');
  const [drag,   setDrag]   = useState(false);
  const [pasteBuf, setPasteBuf] = useState('');
  const rt = RECORD_TYPES.find(r => r.id === recordType);

  function handleFile(file) {
    if (!file) return;
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const isPDF   = /\.pdf$/i.test(file.name);
    const isText  = /\.(csv|tsv|txt)$/i.test(file.name);
    if (!isExcel && !isPDF && !isText) {
      setError('Upload a CSV, TSV, Excel (.xlsx), or PDF file — or paste your rows below.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const result = isPDF
          ? (recordType === 'runlist' ? await parseRunListPDF(e.target.result) : await parsePDF(e.target.result))
          : isExcel
            ? await parseWorkbook(e.target.result)
            : parseCSV(e.target.result);
        if (result.headers.length === 0) { setError('File appears to be empty or unreadable.'); return; }
        if (result.rows.length === 0) {
          setError(isPDF
            ? 'Couldn’t read any rows from this PDF. Make sure it’s a text-based run list (not a scan), or import the CSV/Excel/paste version.'
            : 'No data rows found — check that your file has a header row plus at least one data row.');
          return;
        }
        setError('');
        onParsed(result, file.name);
      } catch (err) {
        setError(`Parse error: ${err.message}`);
      }
    };
    if (isExcel || isPDF) reader.readAsArrayBuffer(file); else reader.readAsText(file);
  }

  function handlePasteText() {
    const text = (pasteBuf || '').trim();
    if (!text) return;
    try {
      const result = parseCSV(text);
      if (result.headers.length === 0 || result.rows.length === 0) {
        setError('Couldn’t read any rows from the pasted data — include a header row plus at least one data row.');
        return;
      }
      setError('');
      onParsed(result, 'pasted data');
    } catch (err) {
      setError(`Parse error: ${err.message}`);
    }
  }

  function loadSample() {
    if (!rt?.sampleCsv) return;
    const result = parseCSV(rt.sampleCsv);
    setError('');
    onParsed(result, 'sample_data.csv');
  }

  return (
    <div>
      <h2 className="text-lg font-black text-gray-900 dark:text-gray-100 mb-1">Upload your file</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        Upload a CSV, TSV, or Excel (.xlsx) export from your source system — or paste rows
        straight from Excel / Google Sheets below. We auto-detect the delimiter and columns.
      </p>

      {/* Drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
          drag ? 'border-blue-400 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50' :
          parsedData ? 'border-green-400 dark:border-green-700 bg-green-50 dark:bg-green-950/50' :
          'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-950'
        }`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault(); setDrag(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload a CSV, TSV, Excel, or PDF file — click to browse"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
      >
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf" className="hidden" aria-label="Data file to import"
          onChange={e => handleFile(e.target.files[0])} />
        {parsedData ? (
          <>
            <CheckCircle size={28} className="text-green-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-green-800 dark:text-green-300">{parsedData.fileName}</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">{parsedData.rows.length} rows · {parsedData.headers.length} columns detected</p>
          </>
        ) : (
          <>
            <Upload size={28} className="text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">Drag & drop a CSV, TSV, Excel, or PDF file here, or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">.csv · .tsv · .xlsx · .xls · .pdf — or paste below</p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-3 flex gap-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Sample data option */}
      {rt?.sampleCsv && (
        <div className="mt-4 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-blue-800 dark:text-blue-300">No file yet? Try the sample data</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Load example {rt.label} records to walk through the full import flow.</p>
          </div>
          <button onClick={loadSample}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-shrink-0 ml-4">
            <Download size={12} /> Load Sample
          </button>
        </div>
      )}

      {/* Paste option — straight from Excel / Google Sheets */}
      <div className="mt-4">
        <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5">…or paste rows from Excel / Google Sheets</p>
        <textarea
          rows={4}
          value={pasteBuf}
          onChange={e => setPasteBuf(e.target.value)}
          aria-label="Paste rows from Excel or Google Sheets"
          placeholder="Paste tab- or comma-separated rows here, including the header row."
          className="w-full text-xs font-mono border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 focus:border-blue-400 focus:outline-none resize-y"
        />
        <div className="flex justify-end mt-2">
          <button onClick={handlePasteText} disabled={!pasteBuf.trim()}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              pasteBuf.trim() ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            }`}>
            <Check size={12} /> Use pasted data
          </button>
        </div>
      </div>

      {/* Preview table */}
      {parsedData && parsedData.rows.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Raw Preview (first 3 rows)</p>
          <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-950">
                  {parsedData.headers.map(h => (
                    <th key={h} className="px-3 py-2 text-left font-bold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedData.rows.slice(0, 3).map((row, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    {parsedData.headers.map(h => (
                      <td key={h} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[160px] truncate">{row[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Field Mapping ────────────────────────────────────────────────────

function StepMapping({ recordType, sourceSystem, headers, mapping, onMappingChange }) {
  const rt = RECORD_TYPES.find(r => r.id === recordType);
  const freestationFields = rt?.fields ?? [];
  const usedFields = Object.values(mapping).filter(Boolean);

  return (
    <div>
      <h2 className="text-lg font-black text-gray-900 dark:text-gray-100 mb-1">Map your columns</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        Match each column from your CSV to the corresponding OpenFirehouse field.
        Columns mapped to <span className="font-semibold">Skip</span> will not be imported.
      </p>
      <div className="flex items-center gap-2 mb-4 text-xs">
        <span className="bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full font-semibold">
          {Object.values(mapping).filter(Boolean).length} / {headers.length} mapped
        </span>
        {sourceSystem !== 'csv' && (
          <span className="text-gray-400">Auto-suggested from {sourceSystem.toUpperCase()} field names</span>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="grid grid-cols-[1fr_20px_1fr] gap-4 px-5 py-2.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          <span>Your CSV Column</span>
          <span />
          <span>OpenFirehouse Field</span>
        </div>
        {headers.map(header => {
          const current = mapping[header] ?? '';
          const autoMapped = current !== '';
          return (
            <div key={header} className="grid grid-cols-[1fr_20px_1fr] gap-4 px-5 py-2.5 border-b border-gray-50 last:border-b-0 items-center">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded px-2 py-0.5 truncate max-w-[180px]">{header}</span>
                {autoMapped && <span className="text-[9px] bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-full px-1.5 font-semibold">auto</span>}
              </div>
              <ArrowRight size={13} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
              <select
                value={current}
                onChange={e => onMappingChange(header, e.target.value)}
                aria-label={`OpenFirehouse field for column ${header}`}
                className={`w-full text-xs border rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                  current ? 'border-blue-200 dark:border-blue-900 text-gray-800 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-400'
                }`}
              >
                <option value="">— Skip this column —</option>
                {freestationFields.map(f => (
                  <option
                    key={f.id}
                    value={f.id}
                    disabled={usedFields.includes(f.id) && current !== f.id}
                  >
                    {f.label}{f.required ? ' *' : ''}
                    {usedFields.includes(f.id) && current !== f.id ? ' (already mapped)' : ''}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* Required field check */}
      <div className="mt-4 space-y-1">
        {freestationFields.filter(f => f.required).map(f => {
          const isMapped = Object.values(mapping).includes(f.id);
          return (
            <div key={f.id} className={`flex items-center gap-2 text-xs ${isMapped ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {isMapped ? <CheckCircle size={12} /> : <XCircle size={12} />}
              <span><span className="font-semibold">{f.label}</span> (required) — {isMapped ? 'mapped' : 'not yet mapped'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 5: Validate ─────────────────────────────────────────────────────────

function StepValidate({ results, summary }) {
  const [showAll, setShowAll] = useState(false);
  const issues = results.filter(r => !r.valid || r.warnings.length > 0);
  const display = showAll ? issues : issues.slice(0, 10);

  return (
    <div>
      <h2 className="text-lg font-black text-gray-900 dark:text-gray-100 mb-1">Validation results</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        Review any issues found in your data before completing the import.
        Rows with errors will be skipped. Rows with warnings will still be imported.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total rows',  value: summary.total,    color: 'text-gray-800 dark:text-gray-100' },
          { label: 'Clean',       value: summary.clean,    color: 'text-green-700 dark:text-green-300' },
          { label: 'Warnings',    value: summary.warnings, color: 'text-amber-700 dark:text-amber-300' },
          { label: 'Errors',      value: summary.errors,   color: 'text-red-700 dark:text-red-300'   },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 px-4 py-3 text-center shadow-sm">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {summary.errors === 0 && summary.warnings === 0 ? (
        <div className="flex items-center gap-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-xl px-4 py-3">
          <Check size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">All {summary.total} rows are clean — ready to import!</p>
        </div>
      ) : (
        <>
          {summary.errors > 0 && (
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 mb-3">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-800 dark:text-red-300 font-medium">
                {summary.errors} row{summary.errors > 1 ? 's' : ''} have errors and will be skipped.
                Fix them in your source file and re-import, or proceed to import the {summary.valid} valid rows.
              </p>
            </div>
          )}

          {issues.length > 0 && (
            <div className="space-y-1.5">
              {display.map(r => (
                <div key={r.rowIndex} className={`rounded-xl px-4 py-2 border ${
                  !r.valid
                    ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900'
                    : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900'
                }`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    {!r.valid
                      ? <XCircle size={12} className="text-red-500 flex-shrink-0" />
                      : <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />}
                    <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase">Row {r.rowIndex + 1}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {Object.values(r.row).filter(Boolean).slice(0, 3).join(' · ')}
                    </span>
                  </div>
                  <ul className="text-xs ml-4 space-y-0.5">
                    {r.errors.map((e, i) => <li key={i} className="text-red-700 dark:text-red-300">{e}</li>)}
                    {r.warnings.map((w, i) => <li key={i} className="text-amber-700 dark:text-amber-300">{w}</li>)}
                  </ul>
                </div>
              ))}
              {issues.length > 10 && (
                <button onClick={() => setShowAll(!showAll)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold">
                  {showAll ? 'Show fewer' : `Show all ${issues.length} issues`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Step 6: Preview ──────────────────────────────────────────────────────────

function StepPreview({ results, recordType, fileName, sourceSystem }) {
  const valid   = results.filter(r => r.valid);
  const invalid = results.filter(r => !r.valid);
  const rt = RECORD_TYPES.find(r => r.id === recordType);

  return (
    <div>
      <h2 className="text-lg font-black text-gray-900 dark:text-gray-100 mb-1">Ready to import</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Review the summary below, then click Import to finalize.</p>

      {/* Summary box */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-400 text-xs uppercase tracking-wide">Record type</span><p className="font-bold text-gray-900 dark:text-gray-100 mt-0.5">{rt?.label}</p></div>
          <div><span className="text-gray-400 text-xs uppercase tracking-wide">Source system</span><p className="font-bold text-gray-900 dark:text-gray-100 mt-0.5">{SOURCE_SYSTEMS.find(s => s.id === sourceSystem)?.name ?? sourceSystem}</p></div>
          <div><span className="text-gray-400 text-xs uppercase tracking-wide">File</span><p className="font-bold text-gray-700 dark:text-gray-300 mt-0.5 font-mono text-xs">{fileName}</p></div>
          <div><span className="text-gray-400 text-xs uppercase tracking-wide">Target module</span><p className="font-bold text-blue-700 dark:text-blue-300 mt-0.5">{rt?.targetModule}</p></div>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-center">
          <div className="bg-green-50 dark:bg-green-950/50 rounded-xl py-3">
            <p className="text-2xl font-black text-green-700 dark:text-green-300">{valid.length}</p>
            <p className="text-xs text-green-600 dark:text-green-400 font-semibold">Will be imported</p>
          </div>
          <div className="bg-red-50 dark:bg-red-950/50 rounded-xl py-3">
            <p className="text-2xl font-black text-red-600 dark:text-red-400">{invalid.length}</p>
            <p className="text-xs text-red-600 dark:text-red-400 font-semibold">Will be skipped</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-950 rounded-xl py-3">
            <p className="text-2xl font-black text-gray-700 dark:text-gray-300">{results.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">Total rows</p>
          </div>
        </div>
      </div>

      {/* Sample of records to import */}
      {valid.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Sample records to import</p>
          <div className="space-y-1.5">
            {valid.slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-green-100 dark:border-green-900 rounded-xl px-4 py-2">
                <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                <p className="text-xs text-gray-700 dark:text-gray-300 truncate">
                  {Object.values(r.row).filter(Boolean).join(' · ')}
                </p>
              </div>
            ))}
            {valid.length > 5 && (
              <p className="text-xs text-gray-400 pl-2">…and {valid.length - 5} more</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 7: Done ─────────────────────────────────────────────────────────────

function StepDone({ importedCount, failedCount = 0, recordType, onReset, logEntry }) {
  const rt = RECORD_TYPES.find(r => r.id === recordType);
  const hasFailures = failedCount > 0;
  return (
    <div className="text-center py-6">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${hasFailures ? 'bg-amber-100 dark:bg-amber-950/50' : 'bg-green-100 dark:bg-green-950/50'}`}>
        {hasFailures ? <AlertTriangle size={28} className="text-amber-600 dark:text-amber-400" /> : <Check size={28} className="text-green-600 dark:text-green-400" />}
      </div>
      <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-2">{hasFailures ? 'Import finished with errors' : 'Import complete!'}</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
        <span className="font-bold text-green-700 dark:text-green-300">{importedCount} records</span> imported into{' '}
        <span className="font-semibold">{rt?.targetModule}</span>
        {hasFailures && <span className="text-amber-700 dark:text-amber-300 ml-1">· <span className="font-bold">{failedCount} failed</span></span>}.
      </p>
      <p className="text-xs text-gray-400 mb-6">{fmtTimestamp(logEntry?.timestamp)}</p>

      <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-5 py-4 text-left mb-6 max-w-md mx-auto">
        <p className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-1">Next steps</p>
        <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <li>• Navigate to <span className="font-semibold">{rt?.targetModule}</span> to review your imported records</li>
          <li>• Verify a few records to confirm field mapping was accurate</li>
          {recordType === 'members' && <li>• Set role assignments and access levels for imported members</li>}
          {recordType === 'incidents' && <li>• Review imported incidents for NFIRS completeness</li>}
          {recordType === 'training' && <li>• Check for expiring certifications flagged in the alert system</li>}
          <li>• If anything looks wrong, fix your source CSV and re-import</li>
        </ul>
      </div>

      <div className="flex justify-center gap-3">
        <button onClick={onReset}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700">
          <RefreshCw size={14} /> Import More Data
        </button>
      </div>
    </div>
  );
}

// ─── Import Log ───────────────────────────────────────────────────────────────

function ImportLog({ log }) {
  if (log.length === 0) {
    return <p className="text-center text-sm text-gray-400 py-10">No imports yet this session.</p>;
  }
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-4 px-5 py-2.5 bg-gray-50 dark:bg-gray-950 border-b text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        <span>Time</span><span>Record Type</span><span>Source</span><span>Imported</span><span>Skipped</span><span>Status</span>
      </div>
      {log.map(entry => (
        <div key={entry.id} className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-4 px-5 py-2.5 border-b border-gray-50 last:border-b-0 items-center">
          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{fmtTimestamp(entry.timestamp)}</span>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{RECORD_TYPES.find(r => r.id === entry.recordType)?.label ?? entry.recordType}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{SOURCE_SYSTEMS.find(s => s.id === entry.sourceSystem)?.name ?? entry.sourceSystem}</span>
          <span className="text-xs font-bold text-green-700 dark:text-green-300">{entry.imported}</span>
          <span className={`text-xs font-bold ${entry.skipped > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>{entry.skipped > 0 ? entry.skipped : '—'}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${
            entry.status === 'success' ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300' :
            entry.status === 'partial' ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' :
            'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
          }`}>{entry.status}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DataImport({ stations = [], selectedStation = null }) {
  const [activeTab, setActiveTab] = useState('wizard');
  const [step,      setStep]      = useState('type');
  // Per-station grain (0072): a roster import targets ONE station. Default to the
  // picked house; multi-house depts must choose explicitly before committing.
  const isMultiHouse = Array.isArray(stations) && stations.length > 1;
  const [importStationId, setImportStationId] = useState(selectedStation || '');

  // Wizard state
  const [recordType,   setRecordType]   = useState('');
  const [sourceSystem, setSourceSystem] = useState('');
  const [parsedData,   setParsedData]   = useState(null); // { headers, rows, fileName }
  const [mapping,      setMapping]      = useState({});
  const [valResults,   setValResults]   = useState([]);
  const [summary,      setSummary]      = useState(null);
  const [logEntry,     setLogEntry]     = useState(null);
  const [importLog,    setImportLog]    = useState([]);
  const [importing,    setImporting]    = useState(false);
  const [importError,  setImportError]  = useState(null);

  // ── Scroll to top on step change ─────────────────────────────────────────

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const main = document.querySelector('main');
    if (main) main.scrollTop = 0;
  }, [step]);

  // ── Step navigation helpers ──────────────────────────────────────────────

  function go(target) { setStep(target); }

  function resetWizard() {
    setStep('type');
    setRecordType('');
    setSourceSystem('');
    setParsedData(null);
    setMapping({});
    setValResults([]);
    setSummary(null);
    setLogEntry(null);
  }

  // ── Step: Type → Source ──────────────────────────────────────────────────

  function handleTypeDone() {
    setSourceSystem('');
    go('source');
  }

  // ── Step: Source → Upload ────────────────────────────────────────────────

  function handleSourceDone() {
    go('upload');
  }

  // ── Step: Upload → Mapping ───────────────────────────────────────────────

  function handleParsed(result, fileName) {
    setParsedData({ ...result, fileName });
    // Auto-map fields
    const auto = autoMapFields(result.headers, recordType, sourceSystem);
    setMapping(auto);
  }

  function handleUploadDone() {
    go('mapping');
  }

  // ── Step: Mapping → Validate ──────────────────────────────────────────────

  function handleMappingDone() {
    const mappedRows = applyMapping(parsedData.rows, mapping);
    const results    = validateAll(mappedRows, recordType);
    const sum        = getValidationSummary(results);
    setValResults(results);
    setSummary(sum);
    go('validate');
  }

  // ── Step: Validate → Preview ──────────────────────────────────────────────

  function handleValidateDone() { go('preview'); }

  // ── Step: Preview → Done (commit) ─────────────────────────────────────────

  async function handleImport() {
    const validRows = valResults.filter(r => r.valid).map(r => r.row);
    if (!recordType || validRows.length === 0) return;

    setImporting(true);
    setImportError(null);

    let succeeded = 0;
    let failed    = 0;
    let errors    = [];

    try {
      if (recordType === 'runlist') {
        if (isMultiHouse && !importStationId) {
          setImportError('Choose which station this roster imports into before committing.');
          setImporting(false);
          return;
        }
        const d = new Date();
        const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const result = await api.post('/api/import/run-list', {
          rows: validRows, date: localDate,
          ...(importStationId ? { station_id: Number(importStationId) } : {}),
        });
        succeeded = result.data?.crew ?? validRows.length;
        failed    = 0;
      } else {
        const result = await api.post('/api/import', { recordType, rows: validRows });
        succeeded = result.imported ?? 0;
        failed    = result.failed   ?? 0;
        errors    = (result.errors  ?? []).map(e => e.message || 'Row failed');
      }
    } catch (err) {
      failed = validRows.length;
      errors = [err.message || 'Import request failed'];
    }

    const sum   = getValidationSummary(valResults);
    const entry = createImportLogEntry({
      recordType,
      sourceSystem,
      fileName:  parsedData.fileName,
      summary:   { ...sum, succeeded, failed },
    });
    setLogEntry({ ...entry, succeeded, failed, errors });
    setImportLog(prev => [entry, ...prev]);
    setImporting(false);
    go('done');
  }

  // ── Required fields check for mapping step ────────────────────────────────

  const requiredFieldsMapped = (() => {
    if (!recordType) return false;
    const rt = RECORD_TYPES.find(r => r.id === recordType);
    const required = rt?.fields.filter(f => f.required).map(f => f.id) ?? [];
    const mapped   = Object.values(mapping).filter(Boolean);
    return required.every(f => mapped.includes(f));
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100">Data Import &amp; Conversion</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Import existing records from any legacy RMS via CSV export
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        {[
          { id: 'wizard', label: 'Import Wizard' },
          { id: 'log',    label: `Import Log${importLog.length > 0 ? ` (${importLog.length})` : ''}` },
          { id: 'about',  label: 'Supported Systems' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === t.id ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* ── Wizard Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'wizard' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-7">
          {step !== 'done' && <StepBar currentStep={step} />}

          {step === 'type' && (
            <>
              <StepType selected={recordType} onSelect={setRecordType} />
              <NavRow showBack={false} onNext={handleTypeDone} nextDisabled={!recordType} nextLabel="Choose Source" />
            </>
          )}

          {step === 'source' && (
            <>
              <StepSource recordType={recordType} selected={sourceSystem} onSelect={setSourceSystem} />
              <NavRow onBack={() => go('type')} onNext={handleSourceDone} nextDisabled={!sourceSystem} nextLabel="Upload File" />
            </>
          )}

          {step === 'upload' && (
            <>
              <StepUpload
                recordType={recordType}
                parsedData={parsedData ? { ...parsedData } : null}
                onParsed={handleParsed}
              />
              <NavRow onBack={() => go('source')} onNext={handleUploadDone} nextDisabled={!parsedData} nextLabel="Map Fields" />
            </>
          )}

          {step === 'mapping' && (
            <>
              <StepMapping
                recordType={recordType}
                sourceSystem={sourceSystem}
                headers={parsedData?.headers ?? []}
                mapping={mapping}
                onMappingChange={(header, field) => setMapping(prev => ({ ...prev, [header]: field }))}
              />
              <div className="text-xs text-gray-400 mt-3 flex items-center gap-1">
                <Info size={11} /> Fields marked <span className="font-bold ml-0.5">*</span> are required.
              </div>
              <NavRow onBack={() => go('upload')} onNext={handleMappingDone} nextDisabled={!requiredFieldsMapped} nextLabel="Validate" />
            </>
          )}

          {step === 'validate' && (
            <>
              <StepValidate results={valResults} summary={summary} />
              <NavRow
                onBack={() => go('mapping')}
                onNext={handleValidateDone}
                nextDisabled={summary && summary.valid === 0}
                nextLabel={`Preview Import (${summary?.valid ?? 0} rows)`}
              />
            </>
          )}

          {step === 'preview' && (
            <>
              <StepPreview
                results={valResults}
                recordType={recordType}
                fileName={parsedData?.fileName}
                sourceSystem={sourceSystem}
              />
              {recordType === 'runlist' && isMultiHouse && (
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl">
                  <label className="block text-xs font-bold text-amber-800 dark:text-amber-300 mb-1.5">
                    Import this roster into station
                  </label>
                  <select
                    value={importStationId}
                    onChange={(e) => setImportStationId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                  >
                    <option value="">— Choose a station —</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5">
                    Your department has more than one station — a roster belongs to one house.
                  </p>
                </div>
              )}
              {importError && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300">
                  {importError}
                </div>
              )}
              <NavRow
                onBack={() => go('validate')}
                onNext={handleImport}
                nextLabel={importing ? 'Importing…' : `Import ${valResults.filter(r => r.valid).length} Records`}
                nextDisabled={importing}
              />
            </>
          )}

          {step === 'done' && (
            <StepDone
              importedCount={logEntry?.succeeded ?? valResults.filter(r => r.valid).length}
              failedCount={logEntry?.failed ?? 0}
              recordType={recordType}
              onReset={resetWizard}
              logEntry={logEntry}
            />
          )}
        </div>
      )}

      {/* ── Log Tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'log' && (
        <div>
          <p className="text-xs text-gray-400 mb-3">Import history for this session (resets on page reload).</p>
          <ImportLog log={importLog} />
        </div>
      )}

      {/* ── Supported Systems Tab ──────────────────────────────────────────── */}
      {activeTab === 'about' && (
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 text-xs text-blue-800 dark:text-blue-300">
            OpenFirehouse supports importing from all major fire RMS and training platforms.
            For each system, export your data as CSV from the Reports or Administration section,
            then use the Import Wizard above. Field auto-mapping means most imports require
            minimal manual configuration.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SOURCE_SYSTEMS.map(sys => (
              <div key={sys.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-gray-800 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">
                    {sys.id === 'csv' ? 'CSV' : sys.name.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{sys.name}</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{sys.description}</p>
                <div className="flex flex-wrap gap-1">
                  {sys.supports.map(s => {
                    const rt = RECORD_TYPES.find(r => r.id === s);
                    return (
                      <span key={s} className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full px-2 py-0.5 font-medium">
                        {rt?.label ?? s}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
