// AIWriteTextarea.jsx — DictateTextarea with AI enhancement panel
// Wraps DictateTextarea with a sparkle button that offers text enhancement options
import { useState } from 'react';
import { Sparkles, Loader, AlertCircle, X } from 'lucide-react';
import DictateTextarea from './DictateTextarea';

/**
 * Enhanced textarea with dictation + AI writing assistance.
 * Shows a sparkle button that opens a panel with rewrite/enhance options.
 *
 * Props: same as DictateTextarea
 */
export default function AIWriteTextarea({
  value = '',
  onChange,
  rows = 4,
  placeholder = '',
  className = '',
  disabled = false,
  name,
  id,
}) {
  const [showPanel, setShowPanel] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState(null);

  const enhance = async (action) => {
    if (!value.trim()) {
      setError('Please enter some text first');
      return;
    }

    setEnhancing(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, action }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.enhanced) {
        onChange({ target: { name, value: data.enhanced } });
        setShowPanel(false);
      } else {
        setError('No enhancement returned');
      }
    } catch (err) {
      console.error('AI enhancement error:', err);
      setError(`Enhancement failed: ${err.message}`);
    } finally {
      setEnhancing(false);
    }
  };

  return (
    <div className="relative">
      <DictateTextarea
        value={value}
        onChange={onChange}
        rows={rows}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        name={name}
        id={id}
      />

      {/* Sparkle button — bottom right, outside the textbox */}
      <button
        type="button"
        onClick={() => setShowPanel(!showPanel)}
        disabled={disabled}
        className="absolute bottom-2 right-12 w-7 h-7 rounded-full flex items-center justify-center transition-colors shadow-sm bg-yellow-100 dark:bg-yellow-950/50 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900 disabled:opacity-50"
        title="AI writing assistant"
        aria-label="AI writing assistant"
      >
        <Sparkles size={14} />
      </button>

      {/* AI Enhancement Panel */}
      {showPanel && (
        <div className="absolute bottom-12 right-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-10 min-w-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">AI Enhancement</span>
            <button
              type="button"
              onClick={() => setShowPanel(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Close AI enhancement panel"
            >
              <X size={14} />
            </button>
          </div>

          {error && (
            <div className="flex gap-2 items-start mb-2 p-2 bg-red-50 dark:bg-red-950/50 rounded text-xs text-red-700 dark:text-red-300">
              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1">
            {[
              { label: 'Rewrite', action: 'rewrite' },
              { label: 'Concise', action: 'concise' },
              { label: 'Professional', action: 'professional' },
              { label: 'Fix Grammar', action: 'grammar' },
              { label: 'Expand', action: 'expand' },
              { label: 'Casual', action: 'casual' },
            ].map(btn => (
              <button
                key={btn.action}
                type="button"
                onClick={() => enhance(btn.action)}
                disabled={enhancing}
                className="px-2 py-1 text-xs bg-yellow-50 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900 rounded border border-yellow-200 dark:border-yellow-900 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {enhancing && <Loader size={12} className="animate-spin" />}
                {btn.label}
              </button>
            ))}
          </div>

          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
            Powered by AI
          </div>
        </div>
      )}
    </div>
  );
}
