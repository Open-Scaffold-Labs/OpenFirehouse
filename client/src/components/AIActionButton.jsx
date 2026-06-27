import { useState } from 'react';
import { Sparkles, Loader2, X, Copy, Check, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { api } from '../utils/api';

/**
 * AIActionButton — Shared contextual AI component
 *
 * Embeds AI actions directly inside any module. No page navigation needed.
 * Calls the unified POST /api/ai/action endpoint with action + context.
 *
 * Props:
 *   action      (string)   — Action identifier (e.g. 'analyze_incident', 'draft_after_action')
 *   context     (object)   — { module, recordId, data } passed to the backend
 *   label       (string)   — Button text (default: "AI")
 *   variant     (string)   — "button" | "inline" | "icon" | "menu-item" (default: "button")
 *   onResult    (function) — Callback receiving the AI result
 *   onApplied   (function) — Callback after result is saved/applied to the record
 *   saveable    (boolean)  — If true, show "Apply to Record" button in result panel
 *   confirmText (string)   — Optional confirmation prompt before executing
 *   resultType  (string)   — "text" | "json" | "insert" — how to display result (default: "text")
 *   className   (string)   — Additional CSS classes
 */
export default function AIActionButton({
  action,
  context = {},
  label = 'AI',
  variant = 'button',
  onResult,
  onApplied,
  saveable = false,
  confirmText,
  resultType = 'text',
  className = '',
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleClick() {
    if (confirmText && !window.confirm(confirmText)) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.post('/api/ai/action', {
        action,
        module: context.module,
        record_id: context.recordId,
        data: context.data,
        options: context.options || {},
      });

      setResult(res);
      if (onResult) onResult(res);
    } catch (err) {
      setError(err.message || 'AI action failed');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    const text = typeof result?.result === 'string' ? result.result : JSON.stringify(result?.result, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDismiss() {
    setResult(null);
    setError(null);
    setSaved(false);
  }

  async function handleApply() {
    if (!result) return;
    setSaving(true);
    try {
      const res = await api.post('/api/ai/action/apply', {
        action,
        record_id: context.recordId,
        result: result.result,
      });
      setSaved(true);
      if (onApplied) onApplied(res);
    } catch (err) {
      setError(err.message || 'Failed to save AI result');
    } finally {
      setSaving(false);
    }
  }

  // ── Button variants ──────────────────────────────────────────────────────

  const baseClasses = 'inline-flex items-center gap-1.5 font-medium transition-all duration-200 disabled:opacity-50';

  const variantClasses = {
    button: `${baseClasses} rounded-lg px-3 py-2 text-xs bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm hover:from-violet-700 hover:to-indigo-700 hover:shadow-md`,
    inline: `${baseClasses} rounded-md px-2 py-1 text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/50 hover:bg-violet-100 dark:hover:bg-violet-900 ring-1 ring-violet-200 hover:ring-violet-300`,
    icon: `${baseClasses} rounded-lg p-1.5 text-violet-500 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/50`,
    'menu-item': `${baseClasses} w-full rounded-lg px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-950/50 hover:text-violet-700`,
  };

  const buttonEl = (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`${variantClasses[variant] || variantClasses.button} ${className}`}
      title={label}
      aria-label={label}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
      {variant !== 'icon' && (
        <span>{loading ? 'Thinking…' : label}</span>
      )}
    </button>
  );

  // ── Result display ───────────────────────────────────────────────────────

  const resultPanel = result && (
    <div className="mt-2 rounded-lg bg-violet-50 dark:bg-violet-950/50 ring-1 ring-violet-200 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-violet-100/60">
        <button onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:text-violet-900">
          <Sparkles className="h-3 w-3" />
          AI Result
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <div className="flex items-center gap-1">
          {saveable && !saved && (
            <button onClick={handleApply} disabled={saving}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900 ring-1 ring-emerald-200 transition-colors disabled:opacity-50"
              title="Apply to record">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {saving ? 'Saving…' : 'Apply'}
            </button>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/50">
              <Check className="h-3 w-3" /> Applied
            </span>
          )}
          <button onClick={handleCopy}
            className="rounded-md p-1 text-violet-500 hover:text-violet-700 hover:bg-violet-200/60 transition-colors"
            title="Copy result"
            aria-label="Copy result">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button onClick={handleDismiss}
            className="rounded-md p-1 text-violet-400 hover:text-violet-700 hover:bg-violet-200/60 transition-colors"
            title="Dismiss"
            aria-label="Dismiss AI result">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {/* Body */}
      {expanded && (
        <div className="px-3 py-2.5 max-h-80 overflow-y-auto">
          {resultType === 'json' && typeof result.result === 'object' ? (
            <AIJsonResult data={result.result} />
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">
              {typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2)}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const errorPanel = error && (
    <div className="mt-2 rounded-lg bg-red-50 dark:bg-red-950/50 ring-1 ring-red-200 px-3 py-2 flex items-center gap-2">
      <span className="text-xs text-red-600 dark:text-red-400 flex-1">{error}</span>
      <button onClick={handleDismiss} className="text-red-400 hover:text-red-600" aria-label="Dismiss error">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <div className="inline-block">
      {buttonEl}
      {resultPanel}
      {errorPanel}
    </div>
  );
}

/* ── Sub-component: structured JSON renderer ────────────────────────────── */

function AIJsonResult({ data }) {
  if (!data || typeof data !== 'object') return <p className="text-sm text-gray-600 dark:text-gray-300">{String(data)}</p>;

  // Render top-level keys as labeled sections
  return (
    <div className="space-y-3">
      {Object.entries(data).map(([key, value]) => (
        <div key={key}>
          <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-0.5">
            {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}
          </p>
          {Array.isArray(value) ? (
            <ul className="space-y-0.5 ml-1">
              {value.map((item, i) => (
                <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-1.5">
                  <span className="text-violet-400 mt-1.5 h-1 w-1 rounded-full bg-violet-400 flex-shrink-0" />
                  {typeof item === 'object' ? JSON.stringify(item) : String(item)}
                </li>
              ))}
            </ul>
          ) : typeof value === 'object' && value !== null ? (
            <div className="ml-1 space-y-0.5">
              {Object.entries(value).map(([k, v]) => (
                <p key={k} className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}: </span>
                  {String(v)}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-700 dark:text-gray-300">{String(value)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
