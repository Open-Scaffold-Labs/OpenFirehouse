// components/CadTroubleBanner.jsx — 4C.4. The app-wide half of the trouble signal.
//
// A dispatch we could not read is not "an item in a queue". The sending CAD will never send it
// again and believes we have it (NENA-STA-024 §3.3.5.3.1), so until a human is TOLD, that call
// simply did not happen as far as the department is concerned. A panel nobody has open is a
// log, and 4C.2 already gave us a log. This is the part that tells someone.
//
// 09 NCAC 06C .0213(a)(4) requires "visual and audible indications to personnel designated by
// the PSAP" on an interface fault. This component is the visual half app-wide; the tone (a
// TROUBLE signal, deliberately low and slow so it can never be mistaken for a dispatch —
// NFPA 1221 §3.3.85) is the audible half.
//
// DESIGN NOTES, each one a decision rather than a default:
//  · NO DISMISS. The bar stays until the fault is reviewed on the CAD page. A CAD emitting
//    unreadable payloads is a configuration defect to fix with that vendor (4C.2 spec §5.5),
//    and a dismiss button is how that conversation stops happening. The app-wide speaker
//    toggle remains the only audio opt-out.
//  · POLLS AT THE HOUSE CADENCE — 5 minutes, visibility-aware. The first version of this
//    component deliberately did NOT poll, on the reasoning that the realtime ping plus a page
//    load was enough and a second app-wide poll was a cost not worth paying. The browser pass
//    on prod disproved it in one screenshot: with four faults outstanding the bar did not
//    appear, because it had read once at mount and nothing had told it since. That is the
//    whole failure mode this module exists to fix, reproduced inside the fix. Realtime has
//    been silently dead on this product for 34 days at a stretch; an annunciator that depends
//    on it is an annunciator that can be silently dead too. 5-min visibility-aware polling is
//    this repo's documented default for exactly this kind of card, and one request per officer
//    per five minutes is not a cost worth a silent trouble signal.
//    NOT accelerated when the ping is missing: a synchronised request spike from every client
//    turns "one bar is late" into "the app is down".
//  · Officer+ only, because the route is. Mounting it for members would fire a 403 per load
//    and show a bar naming a screen they cannot open.
import { useEffect, useState, useCallback, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import { cadFaultTopic, subscribeBroadcast } from '../utils/supabase';
import { toneTrouble } from '../utils/alertTones';
import { isOfficerPlus } from '../data/auth';

export default function CadTroubleBanner({ currentUser, onNavigate }) {
  const [summary, setSummary] = useState(null);
  const lastCount = useRef(null);

  const allowed = isOfficerPlus(currentUser);
  const departmentId = currentUser?.department_id ?? null;

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      const r = await api.get('/api/cad-ingest/summary');
      const s = r?.data || r || null;
      setSummary(s);
      const n = Number(s?.unreviewed || 0);
      // Rising edge only. Tone when the count GOES UP — never on every read, or an operator
      // learns to ignore it, which is the failure mode a trouble signal cannot afford.
      if (lastCount.current !== null && n > lastCount.current) toneTrouble();
      lastCount.current = n;
    } catch {
      // Silent by design: this bar's job is to announce a KNOWN fault. It must never itself
      // become a second thing shouting about a network blip. The CAD console says plainly
      // when its own read failed.
    }
  }, [allowed]);

  useEffect(() => { load(); }, [load]);

  // The poll that makes this bar independent of realtime. Paused while the tab is hidden and
  // refetched the instant it comes back, so a backgrounded tab costs nothing but a returning
  // operator sees current state immediately.
  useEffect(() => {
    if (!allowed) return;
    const tick = () => { if (!document.hidden) load(); };
    const id = setInterval(tick, 300000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [allowed, load]);

  // Own topic, ref-counted — see the long note in CadIngestFaults.jsx. Subscribing to the
  // dispatch topic here and calling removeChannel on unmount killed live dispatch push
  // app-wide, because supabase-js hands every caller the SAME channel object for a topic.
  useEffect(() => {
    if (!allowed || departmentId == null) return;    // never default a tenant
    return subscribeBroadcast(cadFaultTopic(departmentId), 'cad_ingest_fault', () => load());
  }, [allowed, departmentId, load]);

  const n = Number(summary?.unreviewed || 0);
  if (!allowed || n < 1) return null;

  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-40 bg-amber-500 text-amber-950 shadow-md print:hidden"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3">
        <AlertTriangle size={16} className="shrink-0" />
        <p className="text-sm font-bold min-w-0">
          {n === 1
            ? 'A dispatch arrived that OpenFirehouse could not read.'
            : `${n} dispatches arrived that OpenFirehouse could not read.`}
          <span className="font-medium">
            {' '}The message{n === 1 ? ' was' : 's were'} kept in full — your CAD will not send{' '}
            {n === 1 ? 'it' : 'them'} again.
          </span>
        </p>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('cad')}
            className="ml-auto shrink-0 px-3 py-1 rounded-lg bg-amber-950 text-amber-50 text-xs font-black hover:bg-amber-900"
          >
            Open CAD Integration
          </button>
        )}
      </div>
    </div>
  );
}
