/**
 * LabelSheet.jsx — printable QR label sheets (Phase 2.5). Mechanic/chief pick records;
 * the server returns {tag, code, title, subtitle}; QRs render client-side (qrcode lib)
 * into a print-CSS grid → window.print().
 */
import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { X, Printer } from 'lucide-react';
import { api } from '../utils/api';

export default function LabelSheet({ kind, records, onClose }) {
  // records: [{id, label}] preselected by the caller page.
  const [selected, setSelected] = useState(() => new Set(records.map((r) => r.id)));
  const [labels, setLabels] = useState(null); // [{tag, code, title, subtitle, dataUrl}]
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    setBusy(true); setError(null);
    try {
      const r = await api.post('/api/scan/labels', { kind, ids: [...selected] });
      const withQr = await Promise.all((r?.data || []).map(async (l) => ({
        ...l, dataUrl: await QRCode.toDataURL(l.code, { margin: 1, width: 220 }),
      })));
      setLabels(withQr);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  // Review-then-print (design-critique 2.5): the sheet renders first; a visible
  // Print button fires the dialog — never an auto-print ambush.

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-start justify-center overflow-y-auto p-4 print:p-0 print:bg-white print:block">
      <style>{`@media print { body * { visibility: hidden; } .ofh-labels, .ofh-labels * { visibility: visible; } .ofh-labels { position: absolute; inset: 0; } }`}</style>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl my-8 print:shadow-none print:my-0 print:max-w-none print:rounded-none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 print:hidden">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Printer className="w-5 h-5" /> Print labels
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        {!labels ? (
          <div className="px-5 py-4 space-y-3 print:hidden">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {selected.size} of {records.length} selected — uncheck any you don't need, then generate the sheet.
            </p>
            <div className="max-h-[45vh] overflow-y-auto space-y-1">
              {records.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input type="checkbox" checked={selected.has(r.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(r.id); else next.delete(r.id);
                      setSelected(next);
                    }} />
                  {r.label}
                </label>
              ))}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Cancel</button>
              <button onClick={generate} disabled={busy || selected.size === 0}
                className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">
                {busy ? 'Generating…' : 'Generate & print'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 flex justify-end gap-2 print:hidden border-b border-gray-200 dark:border-gray-700">
              <button onClick={() => setLabels(null)} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">Back</button>
              <button onClick={() => window.print()} className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-blue-600 text-white flex items-center gap-1">
                <Printer className="w-4 h-4" /> Print
              </button>
            </div>
            <div className="ofh-labels p-4 grid grid-cols-3 gap-3 print:grid-cols-3">
            {labels.map((l) => (
              <div key={l.tag} className="border border-gray-300 rounded p-2 text-center break-inside-avoid">
                <img src={l.dataUrl} alt={`QR label for ${l.title}`} className="mx-auto w-full max-w-[160px]" />
                <p className="text-xs font-semibold text-gray-900 mt-1">{l.title}</p>
                {l.subtitle && <p className="text-[10px] text-gray-600">{l.subtitle}</p>}
                <p className="text-[9px] text-gray-400 font-mono">{l.tag}</p>
              </div>
            ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
