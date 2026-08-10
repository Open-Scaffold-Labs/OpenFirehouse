/**
 * ReasonDialog.jsx — shared inline confirm/reason modal (design-critique 2026-07-26).
 * Replaces window.prompt()/confirm() on destructive record actions (the 1.4/1.5
 * critique rulings, re-applied to the 2.1 + 2.2 surfaces).
 *
 *  <ReasonDialog title message requireReason confirmLabel destructive onConfirm onClose />
 *  onConfirm(reason) — reason is '' when requireReason is false.
 */
import { useState } from 'react';
import { X } from 'lucide-react';

export default function ReasonDialog({
  title, message, requireReason = false, confirmLabel = 'Confirm',
  destructive = true, onConfirm, onClose,
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ok = !requireReason || reason.trim().length >= 3;

  async function confirm() {
    setBusy(true); setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (e) {
      setError(e.message || 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {message && <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>}
          {requireReason && (
            <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              placeholder="Reason (required — goes on the audit record)"
              className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
            <button onClick={confirm} disabled={busy || !ok}
              className={`px-3 py-2 text-sm rounded-lg text-white disabled:opacity-40 ${destructive ? 'bg-red-600' : 'bg-blue-600'}`}>
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
