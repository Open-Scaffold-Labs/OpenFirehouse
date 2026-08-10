/**
 * MyOtOffers.jsx — the member's OT-offer view (Phase 1.5).
 *
 * Market bar: member transparency — see your live offers (with the response window),
 * accept/decline in-app, and see your standing (in-window equalization balance) on each
 * list you're on. Reads GET /api/hiring/my-offers (self-resolved server-side); reading it
 * also lazily advances expiries, so the countdowns are honest. Accept/decline are
 * self-only server-enforced. 60s visibility-aware refresh while mounted.
 */

import { useState, useEffect, useCallback } from 'react';
import { BellRing, Check, X, Clock, Loader2, ListOrdered } from 'lucide-react';
import { api } from '../utils/api';

function countdown(expiresAt) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'window lapsed — still yours if unfilled';
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m to respond` : `${m}m to respond`;
}

export default function MyOtOffers() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { const r = await api.get('/api/hiring/my-offers'); setData(r.data); }
    catch (_) { setData(null); }  // unlinked login / no offers yet — render nothing
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
  }, [load]);

  if (!data) return null;
  const live = (data.offers || []).filter(o => o.outcome === 'pending' || (o.outcome === 'expired' && o.event_status === 'open'));
  const recent = (data.offers || []).filter(o => !live.includes(o)).slice(0, 5);
  if (!live.length && !recent.length && !(data.standing || []).length) return null;

  async function respond(offer, action) {
    setBusy(offer.id); setError('');
    try { await api.post(`/api/hiring/offers/${offer.id}/${action}`, {}); await load(); }
    catch (e) { setError(e?.message || 'That offer is no longer open.'); await load(); }
    finally { setBusy(null); }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <BellRing size={16} className="text-red-700 dark:text-red-300" />
        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">OT Offers</h3>
      </div>

      {live.length === 0 ? (
        <p className="text-xs text-gray-400 mb-3">No open offers. When a vacancy reaches your turn on a list, it lands here.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {live.map(o => (
            <div key={o.id} className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  {String(o.shift_date).slice(0, 10)}{o.position_name ? ` — ${o.position_name}` : ''}
                </span>
                {o.vacancy_hours != null && <span className="text-xs text-gray-500">{Number(o.vacancy_hours)}h</span>}
                <span className="text-[11px] text-blue-700 dark:text-blue-300 flex items-center gap-1 ml-auto">
                  <Clock size={11} /> {countdown(o.expires_at)}
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                <button disabled={busy === o.id} onClick={() => respond(o, 'accept')}
                  className="flex-1 py-1.5 bg-green-700 hover:bg-green-800 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1 disabled:opacity-50">
                  {busy === o.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Accept
                </button>
                <button disabled={busy === o.id} onClick={() => respond(o, 'decline')}
                  className="flex-1 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-lg flex items-center justify-center gap-1 disabled:opacity-50">
                  <X size={12} /> Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>}

      {(data.standing || []).length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800 pt-2">
          <p className="text-[10px] font-black uppercase tracking-wide text-gray-400 mb-1 flex items-center gap-1">
            <ListOrdered size={10} /> My standing
          </p>
          <div className="flex flex-wrap gap-2">
            {data.standing.map(s => (
              <span key={s.list_id} className="text-[11px] font-bold px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-300">
                {s.list_name}: {Number(s.balance)}h this period
              </span>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <details className="text-[11px] text-gray-400 pt-2">
          <summary className="cursor-pointer font-bold">Recent ({recent.length})</summary>
          <ul className="pl-1 pt-1 space-y-0.5">
            {recent.map(o => (
              <li key={o.id}>{String(o.shift_date).slice(0, 10)} — {o.outcome}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
