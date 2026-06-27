import { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle,
  Save, User, ChevronDown, ChevronUp, ClipboardCheck,
} from 'lucide-react';
import { api } from '../utils/api';

// ─── helpers ─────────────────────────────────────────────────────────────────

function classifyResult(responses) {
  const vals = Object.values(responses);
  if (vals.some((r) => r.value === 'fail')) {
    // Check if all fails were noted and corrected
    const hasFail = vals.some((r) => r.value === 'fail');
    return hasFail ? 'Fail' : 'Pass with Deficiency';
  }
  return 'Pass';
}

function buildStatus(responses) {
  const vals = Object.values(responses);
  const failCount = vals.filter((r) => r.value === 'fail').length;
  if (failCount === 0) return 'Pass';
  if (failCount > 0) return 'Fail';
  return 'Pass with Deficiency';
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({ item, response, onChange }) {
  const [noteOpen, setNoteOpen] = useState(false);

  function handlePassFail(val) {
    onChange(item.id, { ...response, value: val });
    if (val === 'fail') setNoteOpen(true);
  }

  return (
    <div className={`rounded-xl border transition-colors ${
      response?.value === 'fail' ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50' :
      response?.value === 'pass' ? 'border-green-100 dark:border-green-900 bg-green-50/30' :
      'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900'
    }`}>
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Pass / Fail buttons */}
        {item.type === 'pass_fail' && (
          <div className="flex gap-1 mt-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => handlePassFail('pass')}
              className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${
                response?.value === 'pass'
                  ? 'bg-green-600 border-green-600 text-white'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400 hover:border-green-400 hover:text-green-600'
              }`}
              title="Pass"
              aria-label={`Mark as pass: ${item.description}`}
            >
              <CheckCircle2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => handlePassFail('fail')}
              className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${
                response?.value === 'fail'
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400 hover:border-red-400 hover:text-red-600'
              }`}
              title="Fail"
              aria-label={`Mark as fail: ${item.description}`}
            >
              <XCircle size={16} />
            </button>
          </div>
        )}

        {/* Label / input */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug ${response?.value === 'fail' ? 'text-red-800 dark:text-red-300 font-medium' : 'text-gray-800 dark:text-gray-100'}`}>
            {item.description}
          </p>

          {/* Number input */}
          {item.type === 'number' && (
            <input
              type="number"
              className="mt-2 w-40 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
              placeholder="Enter value"
              aria-label={item.description}
              value={response?.value ?? ''}
              onChange={(e) => onChange(item.id, { ...response, value: e.target.value })}
            />
          )}

          {/* Text input */}
          {item.type === 'text' && (
            <input
              type="text"
              className="mt-2 w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
              placeholder="Enter details…"
              aria-label={item.description}
              value={response?.value ?? ''}
              onChange={(e) => onChange(item.id, { ...response, value: e.target.value })}
            />
          )}

          {/* Note field (fail or manually expanded) */}
          {item.type === 'pass_fail' && (response?.value === 'fail' || noteOpen) && (
            <textarea
              className="mt-2 w-full border border-red-200 dark:border-red-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 resize-none dark:text-gray-100"
              rows={2}
              placeholder="Describe the deficiency…"
              aria-label={`Deficiency note for ${item.description}`}
              value={response?.note ?? ''}
              onChange={(e) => onChange(item.id, { ...response, note: e.target.value })}
            />
          )}
        </div>

        {/* Add note toggle (for pass items) */}
        {item.type === 'pass_fail' && response?.value === 'pass' && (
          <button
            type="button"
            onClick={() => setNoteOpen((o) => !o)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 mt-1"
            title="Add note"
            aria-label="Add note"
            aria-expanded={noteOpen}
          >
            {noteOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({ category, responses, onChange, collapseSignal }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (collapseSignal) setOpen(false);
  }, [collapseSignal]);

  const passCount = category.items.filter((i) => responses[i.id]?.value === 'pass').length;
  const failCount = category.items.filter((i) => responses[i.id]?.value === 'fail').length;
  const total     = category.items.length;
  const allDone   = passCount + failCount === total;

  return (
    <div className="bg-gray-50 dark:bg-gray-950 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{category.name}</span>
          {allDone ? (
            failCount > 0
              ? <AlertTriangle size={14} className="text-red-500" />
              : <CheckCircle2 size={14} className="text-green-600 dark:text-green-400" />
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">{passCount + failCount}/{total}</span>
          {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {category.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              response={responses[item.id]}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Runner ──────────────────────────────────────────────────────────────

export default function ChecklistRunner({ template, onComplete, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [inspector, setInspector] = useState('');
  const [date,      setDate]      = useState(today);
  const [notes,     setNotes]     = useState('');
  const [responses, setResponses] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [members, setMembers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [collapseSignal, setCollapseSignal] = useState(0);

  // Fetch members on mount
  useEffect(() => {
    async function fetch() {
      try {
        const raw = await api.get('/api/members');
        const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        setMembers(arr);
      } catch (err) {
        console.error('Failed to fetch members:', err);
      } finally {
        setLoadingData(false);
      }
    }
    fetch();
  }, []);

  const ACTIVE_MEMBERS = members.filter((m) => m.status !== 'Inactive');

  const totalItems = template.categories.reduce((sum, c) => sum + c.items.length, 0);
  const answered   = Object.keys(responses).filter((k) => {
    const v = responses[k]?.value;
    return v !== undefined && v !== '' && v !== null;
  }).length;
  const failCount  = Object.values(responses).filter((r) => r.value === 'fail').length;
  const pct        = Math.round((answered / totalItems) * 100);

  function handleChange(itemId, val) {
    setResponses((r) => ({ ...r, [itemId]: val }));
  }

  function handleSubmit() {
    if (!inspector) { alert('Please select an inspector before submitting.'); return; }

    // Compute overall status
    let status = 'Pass';
    if (failCount > 0) status = 'Fail';

    const entry = {
      id:           `cl-${Date.now()}`,
      templateId:   template.id,
      templateName: template.name,
      apparatus:    template.apparatus,
      frequency:    template.frequency,
      completedDate: date,
      completedBy:  inspector,
      status,
      notes,
      responses,
    };
    onComplete(entry);
  }

  if (loadingData) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 dark:border-gray-700 border-t-red-700 mx-auto mb-3"></div>
        <p className="text-sm text-gray-400">Loading form…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">

      {/* Back */}
      <button onClick={onCancel}
        className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-red-700 transition-colors font-medium">
        <ArrowLeft size={16} /> Back to Checklists
      </button>

      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <ClipboardCheck size={22} className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{template.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{template.apparatus} · {template.frequency} · ~{template.estimatedMinutes} min</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>{answered} of {totalItems} items completed</span>
            <span className={failCount > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-green-600 dark:text-green-400 font-semibold'}>
              {failCount > 0 ? `${failCount} fail${failCount > 1 ? 's' : ''}` : answered === totalItems ? 'All Pass' : `${pct}%`}
            </span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${failCount > 0 ? 'bg-red-500' : 'bg-green-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Inspector + Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Inspector <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100"
              value={inspector}
              onChange={(e) => setInspector(e.target.value)}
              aria-label="Inspector"
            >
              <option value="">— Select inspector —</option>
              {ACTIVE_MEMBERS.map((m) => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
              max={today}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 dark:text-gray-100" />
          </div>
        </div>
      </div>

      {/* Checklist items by category */}
      <div className="space-y-4">
        <div className="flex justify-end">
          <button onClick={() => setCollapseSignal(s => s + 1)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">
            Collapse All
          </button>
        </div>
        {template.categories.map((cat) => (
          <CategorySection
            key={cat.name}
            category={cat}
            responses={responses}
            onChange={handleChange}
            collapseSignal={collapseSignal}
          />
        ))}
      </div>

      {/* Overall notes */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Inspector Notes (optional)</label>
        <textarea
          className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white dark:bg-gray-900 resize-none dark:text-gray-100"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-label="Inspector notes"
          placeholder="Overall notes, follow-up actions needed, items referred to apparatus committee…"
        />
      </div>

      {/* Submit */}
      <div className="flex justify-between items-center bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-5 py-4">
        <div>
          {answered < totalItems && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              ⚠ {totalItems - answered} item{totalItems - answered !== 1 ? 's' : ''} not yet answered
            </p>
          )}
          {failCount > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">
              {failCount} deficienc{failCount > 1 ? 'ies' : 'y'} — result will be marked FAIL
            </p>
          )}
          {answered === totalItems && failCount === 0 && (
            <p className="text-xs text-green-700 dark:text-green-300 font-semibold flex items-center gap-1">
              <CheckCircle2 size={13} /> All items passed — ready to submit
            </p>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={!inspector}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-red-700 rounded-xl hover:bg-red-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          <Save size={15} />
          Submit & Sign Off
        </button>
      </div>
    </div>
  );
}
