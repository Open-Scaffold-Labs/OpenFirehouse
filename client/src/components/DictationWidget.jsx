/**
 * DictationWidget — Global floating microphone for fire-service-aware dictation.
 *
 * Always-visible mic button (positioned left of AI Assistant widget).
 * Click to start listening; speech is cleaned through the fire service
 * post-processor and inserted into whichever input/textarea is focused.
 *
 * Features:
 *   - Floating pill that expands when active to show transcript preview
 *   - Fire-service terminology cleanup (apparatus, NFPA, ICS, radio codes, ranks)
 *   - Auto-inserts into the last focused text input or textarea
 *   - Visual pulse animation while listening
 *   - Keyboard shortcut: Ctrl+Shift+M to toggle
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, X, Flame } from 'lucide-react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { fireCleanup } from '../utils/fireTranscript';
import { fabSlotCls } from '../utils/fabRail';

export default function DictationWidget() {
  const [expanded, setExpanded] = useState(false);
  const [recentText, setRecentText] = useState('');
  const [charCount, setCharCount] = useState(0);
  const lastFocusedRef = useRef(null);
  const fadeTimerRef = useRef(null);

  // ── Track last focused input/textarea ─────────────────────────────────
  useEffect(() => {
    const handleFocus = (e) => {
      const tag = e.target.tagName;
      if (
        (tag === 'INPUT' && (e.target.type === 'text' || e.target.type === 'search' || e.target.type === 'url' || e.target.type === 'email' || !e.target.type)) ||
        tag === 'TEXTAREA' ||
        e.target.isContentEditable
      ) {
        lastFocusedRef.current = e.target;
      }
    };
    document.addEventListener('focusin', handleFocus, true);
    return () => document.removeEventListener('focusin', handleFocus, true);
  }, []);

  // ── Insert text into last focused field ───────────────────────────────
  const insertText = useCallback((raw) => {
    const cleaned = fireCleanup(raw);
    if (!cleaned) return;

    setRecentText(cleaned);
    setCharCount((c) => c + cleaned.length);

    // Clear the preview after a few seconds
    clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => setRecentText(''), 4000);

    const el = lastFocusedRef.current;
    if (!el) return;

    if (el.isContentEditable) {
      // ContentEditable — append at cursor or end
      el.focus();
      document.execCommand('insertText', false, cleaned);
    } else {
      // Standard input/textarea — use native input event for React compatibility
      const nativeInputValueSetter =
        Object.getOwnPropertyDescriptor(
          el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype,
          'value'
        )?.set;

      if (nativeInputValueSetter) {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const before = el.value.slice(0, start);
        const after = el.value.slice(end);
        nativeInputValueSetter.call(el, before + cleaned + after);
        // Fire React-compatible input event
        el.dispatchEvent(new Event('input', { bubbles: true }));
        // Move cursor to end of inserted text
        const newPos = start + cleaned.length;
        el.setSelectionRange(newPos, newPos);
      }
    }
  }, []);

  // ── Speech recognition ────────────────────────────────────────────────
  const { listening, supported, interimText, start, stop } = useSpeechRecognition({
    onResult: insertText,
    continuous: true,
  });

  // ── Toggle listening ──────────────────────────────────────────────────
  const handleToggle = useCallback(() => {
    if (listening) {
      stop();
      // Keep expanded briefly to show last result
      setTimeout(() => {
        if (!listening) setExpanded(false);
      }, 2000);
    } else {
      setRecentText('');
      setCharCount(0);
      setExpanded(true);
      start();
    }
  }, [listening, start, stop]);

  // ── Close / stop ──────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    stop();
    setExpanded(false);
    setRecentText('');
  }, [stop]);

  // ── Keyboard shortcut: Ctrl+Shift+M ──────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        handleToggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleToggle]);

  // Don't render if browser doesn't support speech
  if (!supported) return null;

  return (
    <>
      {/* ── Expanded transcript panel ──────────────────────────────────── */}
      {expanded && (
        <div className="fixed bottom-[5.5rem] right-20 z-50 w-72 bg-gray-900 text-white rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <Flame size={14} className="text-orange-400" />
              <span className="text-xs font-bold tracking-wide">FIRE DICTATION</span>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close dictation panel"
              className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X size={12} />
            </button>
          </div>

          {/* Status */}
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              {listening ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                  <span className="text-xs text-red-300 font-semibold">Listening…</span>
                </>
              ) : (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-500"></span>
                  <span className="text-xs text-gray-400">Stopped</span>
                </>
              )}
              {charCount > 0 && (
                <span className="ml-auto text-[10px] text-gray-500 dark:text-gray-400">{charCount} chars</span>
              )}
            </div>

            {/* Interim (live) text */}
            {interimText && (
              <div className="text-xs text-gray-300 dark:text-gray-600 italic bg-gray-800 rounded-lg px-3 py-2 leading-relaxed">
                {interimText}
              </div>
            )}

            {/* Recent final text */}
            {recentText && !interimText && (
              <div className="text-xs text-green-300 bg-gray-800 rounded-lg px-3 py-2 leading-relaxed">
                {recentText.length > 120 ? recentText.slice(-120) + '…' : recentText}
              </div>
            )}

            {/* Target hint */}
            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
              {lastFocusedRef.current
                ? 'Inserting into focused field'
                : 'Click a text field first, then speak'}
            </p>

            {/* Shortcut hint */}
            <p className="text-[10px] text-gray-600 dark:text-gray-300">
              <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400 text-[9px] font-mono">Ctrl+Shift+M</kbd> to toggle
            </p>
          </div>
        </div>
      )}

      {/* ── Floating mic button ────────────────────────────────────────── */}
      <button
        onClick={handleToggle}
        className={`${fabSlotCls('dictation')} z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${
          listening
            ? 'bg-red-600 animate-pulse hover:bg-red-700 ring-4 ring-red-600/30'
            : 'bg-gray-800 hover:bg-gray-700'
        }`}
        title={listening ? 'Stop dictation (Ctrl+Shift+M)' : 'Start fire dictation (Ctrl+Shift+M)'}
        aria-label={listening ? 'Stop dictation' : 'Start fire dictation'}
      >
        {listening ? (
          <Mic size={22} className="text-white" />
        ) : (
          <MicOff size={22} className="text-gray-300 dark:text-gray-600" />
        )}
      </button>
    </>
  );
}
