// RecallSystem.jsx — Recall / All-Call management
import { useState, useEffect, useCallback } from 'react';
import { Siren, CheckCircle2, XCircle, Clock, Users, ChevronDown, ChevronUp, RefreshCw, X, AlertTriangle, FlaskConical } from 'lucide-react';
import { api } from '../utils/api';

const flipInStyles = `
  @keyframes flipIn {
    from { transform: perspective(400px) rotateX(-90deg); opacity: 0; }
    to   { transform: perspective(400px) rotateX(0deg);   opacity: 1; }
  }
  .flip-in { animation: flipIn 0.35s ease-out both; }
`;

const LEVEL_OPTIONS = [
  { value: 'additional', label: 'Request for Additional Resources',  color: 'amber' },
  { value: 'full',       label: 'Full Department Recall',            color: 'red'   },
  { value: 'standby',   label: 'Standby Alert',                     color: 'blue'  },
];

const INCIDENT_TYPES = [
  'Structure Fire', 'Vehicle Fire', 'Wildland / Brush', 'Medical / EMS',
  'Motor Vehicle Accident', 'Hazmat', 'Gas Leak', 'Technical Rescue',
  'Water Rescue', 'Service Call', 'Mass Casualty', 'Other',
];

const LEVEL_COLORS = {
  additional: { bg: 'bg-amber-900/40', border: 'border-amber-600', badge: 'bg-amber-700 text-amber-100', text: 'text-amber-300' },
  full:       { bg: 'bg-red-900/40',   border: 'border-red-600',   badge: 'bg-red-700 text-red-100',     text: 'text-red-300'   },
  standby:    { bg: 'bg-blue-900/40',  border: 'border-blue-600',  badge: 'bg-blue-700 text-blue-100',   text: 'text-blue-300'  },
};

function timeAgo(ts) {
  const secs = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function elapsed(ts) {
  const secs = Math.floor((Date.now() - new Date(ts)) / 1000);
  const h = Math.floor(secs / 3600).toString().padStart(2, '0');
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ── Issue Recall Modal ────────────────────────────────────────────────────────
function IssueModal({ onClose, onIssued }) {
  const [form, setForm] = useState({ level: 'additional', incidentType: '', location: '', message: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      const data = await api.post('/api/recall', form);
      if (data.error) throw new Error(data.error || 'Failed to issue recall');
      onIssued(data.data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-red-700 rounded-xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Siren className="h-5 w-5 text-red-400 animate-pulse" />
            <h2 className="text-white font-bold text-lg">Issue Recall / All-Call</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Level */}
          <div>
            <label className="block text-gray-300 dark:text-gray-600 text-sm font-medium mb-1">Recall Level</label>
            <select
              value={form.level}
              onChange={e => set('level', e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700"
            >
              {LEVEL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Incident Type */}
          <div>
            <label className="block text-gray-300 dark:text-gray-600 text-sm font-medium mb-1">Incident Type</label>
            <select
              value={form.incidentType}
              onChange={e => set('incidentType', e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700"
            >
              <option value="">— Select type —</option>
              {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="block text-gray-300 dark:text-gray-600 text-sm font-medium mb-1">Location / Address</label>
            <input
              type="text"
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="e.g. 412 Oak St — or leave blank"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-gray-300 dark:text-gray-600 text-sm font-medium mb-1">Additional Message <span className="text-gray-500 dark:text-gray-400">(optional)</span></label>
            <textarea
              value={form.message}
              onChange={e => set('message', e.target.value)}
              rows={2}
              placeholder="e.g. Need two engine crews and a tanker…"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 resize-none dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700"
            />
          </div>

          {err && <p className="text-red-400 text-sm">{err}</p>}

          {/* Warning */}
          <div className="flex gap-2 bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-xs">This will immediately send a push notification to every member with the app installed.</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-bold transition-colors flex items-center justify-center gap-2">
              <Siren className="h-4 w-4" />
              {saving ? 'Sending…' : 'Issue Recall'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Respond Modal (for members seeing an active recall) ───────────────────────
function RespondModal({ recall, myResponse, onClose, onResponded }) {
  const [eta, setEta] = useState(myResponse?.eta || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function respond(response, destination = null) {
    setSaving(true); setErr('');
    try {
      const data = await api.post(`/api/recall/${recall.id}/respond`, { response, eta, destination });
      if (data.error) throw new Error(data.error || 'Failed to respond');
      onResponded(data.data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const colors = LEVEL_COLORS[recall.level] || LEVEL_COLORS.full;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className={`bg-gray-900 border-2 ${colors.border} rounded-xl w-full max-w-md shadow-2xl`}>
        <div className={`px-5 py-4 ${colors.bg} rounded-t-xl border-b ${colors.border}`}>
          <div className="flex items-center gap-3">
            <Siren className="h-6 w-6 text-red-400 animate-pulse" />
            <div>
              <p className={`text-xs font-bold uppercase tracking-widest ${colors.text}`}>
                {LEVEL_OPTIONS.find(o => o.value === recall.level)?.label || recall.level}
              </p>
              <h2 className="text-white font-bold text-lg leading-tight">
                {recall.incident_type || 'Recall Issued'}
                {recall.location && <span className="font-normal text-gray-300 dark:text-gray-600"> @ {recall.location}</span>}
              </h2>
            </div>
          </div>
          {recall.message && (
            <p className="text-gray-300 dark:text-gray-600 text-sm mt-2 ml-9">{recall.message}</p>
          )}
          <p className="text-gray-400 text-xs mt-1 ml-9">Issued by {recall.issued_by} · {timeAgo(recall.created_at)}</p>
        </div>

        <div className="p-5 space-y-4">
          {myResponse ? (
            <div className={`flex items-center gap-3 rounded-lg px-4 py-3 ${myResponse.response === 'responding' ? 'bg-green-900/40 border border-green-700' : 'bg-gray-800 border border-gray-600'}`}>
              {myResponse.response === 'responding'
                ? <CheckCircle2 className="h-5 w-5 text-green-400" />
                : <XCircle className="h-5 w-5 text-gray-400" />}
              <div>
                <p className="text-white font-semibold text-sm">
                  {myResponse.response === 'responding'
                    ? `You marked yourself Responding${myResponse.destination === 'station' ? ' to Station' : myResponse.destination === 'scene' ? ' to Scene' : ''}`
                    : 'You marked yourself Unavailable'}
                </p>
                {myResponse.eta && <p className="text-gray-400 text-xs">ETA: {myResponse.eta}</p>}
              </div>
            </div>
          ) : (
            <p className="text-gray-300 dark:text-gray-600 text-sm text-center">Are you available to respond?</p>
          )}

          <div>
            <label className="block text-gray-400 text-xs mb-1">ETA (optional)</label>
            <select
              value={eta}
              onChange={e => setEta(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700"
            >
              <option value="">— Select ETA —</option>
              {['5 min','10 min','15 min','20 min','30 min','45 min','En route now','Already on scene'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {err && <p className="text-red-400 text-sm">{err}</p>}

          {/* 0037 structured response: Station / Scene / Unable */}
          <div className="grid grid-cols-2 gap-3">
            <button
              disabled={saving}
              onClick={() => respond('responding', 'station')}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" /> To Station
            </button>
            <button
              disabled={saving}
              onClick={() => respond('responding', 'scene')}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" /> To Scene
            </button>
          </div>
          <button
            disabled={saving}
            onClick={() => respond('unavailable')}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <XCircle className="h-4 w-4 text-gray-300 dark:text-gray-600" /> Unable to Respond
          </button>

          <button onClick={onClose} className="w-full text-gray-500 dark:text-gray-400 hover:text-gray-300 text-xs py-1 transition-colors">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Recall Card (in the history list) ─────────────────────────────────────────
function RecallCard({ recall, user, onClose: onCloseRecall, onRefresh, collapseSignal }) {
  const [expanded, setExpanded] = useState(recall.status === 'active');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [showRespond, setShowRespond] = useState(false);

  useEffect(() => {
    if (collapseSignal) setExpanded(false);
  }, [collapseSignal]);

  const colors = LEVEL_COLORS[recall.level] || LEVEL_COLORS.full;
  const responding  = recall.responses?.filter(r => r.response === 'responding') || [];
  const unavailable = recall.responses?.filter(r => r.response === 'unavailable') || [];
  const myResponse  = recall.responses?.find(r => r.member_id === user?.id);
  const canClose    = ['officer', 'chief'].includes(user?.role) && recall.status === 'active';

  async function handleClose(e) {
    e.stopPropagation();
    setClosing(true);
    setCloseError('');
    try {
      const data = await api.patch(`/api/recall/${recall.id}/close`, {});
      if (data.error) throw new Error(data.error);
      onRefresh();
    } catch (err) {
      console.error(err);
      setCloseError(err.message || 'Failed to close recall');
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className={`rounded-xl border ${colors.border} ${recall.status === 'active' ? colors.bg : 'bg-gray-900/50 border-gray-700'} overflow-hidden`}>
      {/* Card header */}
      <div
        className="flex items-start justify-between px-4 py-3 cursor-pointer"
        role="button" tabIndex={0} aria-expanded={expanded} aria-label="Toggle recall details"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(x => !x); } }}
        onClick={() => setExpanded(x => !x)}
      >
        <div className="flex items-start gap-3 min-w-0">
          <Siren className={`h-4 w-4 mt-0.5 flex-shrink-0 ${recall.status === 'active' ? 'text-red-400 animate-pulse' : 'text-gray-500 dark:text-gray-400'}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
                {LEVEL_OPTIONS.find(o => o.value === recall.level)?.label || recall.level}
              </span>
              {recall.status === 'active'
                ? <span className="text-xs bg-green-800 text-green-200 px-2 py-0.5 rounded-full font-bold">ACTIVE</span>
                : <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Closed</span>
              }
            </div>
            <p className="text-white font-semibold text-sm mt-0.5">
              {recall.incident_type || 'General Recall'}
              {recall.location && <span className="text-gray-400 font-normal"> @ {recall.location}</span>}
            </p>
            <p className="text-gray-400 text-xs">
              {timeAgo(recall.created_at)} · Issued by {recall.issued_by}
              {recall.status === 'active' && ` · ⏱ ${elapsed(recall.created_at)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          <div className="text-right">
            <p className="text-green-400 text-sm font-bold">{responding.length} responding</p>
            <p className="text-gray-400 text-xs">{unavailable.length} unavailable · {(recall.responses?.length || 0)} total</p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-700/50 pt-3 space-y-3">
          {recall.message && (
            <p className="text-gray-300 dark:text-gray-600 text-sm italic">"{recall.message}"</p>
          )}

          {/* Response board */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-950/40 border border-green-800 rounded-lg p-3">
              <p className="text-green-400 text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Responding ({responding.length})
              </p>
              {responding.length === 0
                ? <p className="text-gray-500 dark:text-gray-400 text-xs">No responses yet</p>
                : responding.map((r, idx) => (
                    <div
                      key={r.id}
                      className="flip-in flex items-center justify-between py-0.5 bg-green-900/50 px-2 rounded my-0.5"
                      style={{ animationDelay: `${idx * 60}ms` }}
                    >
                      <span className="text-green-100 text-xs font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3" /> {r.member_name}
                        {r.destination && (
                          <span className="text-[10px] font-bold uppercase tracking-wide bg-green-800 text-green-200 rounded px-1 py-px">
                            {r.destination === 'station' ? 'STA' : 'SCENE'}
                          </span>
                        )}
                      </span>
                      {r.eta && <span className="text-green-300 text-xs font-semibold">{r.eta}</span>}
                    </div>
                  ))
              }
            </div>
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-1">
                <XCircle className="h-3 w-3" /> Not Available ({unavailable.length})
              </p>
              {unavailable.length === 0
                ? <p className="text-gray-500 dark:text-gray-400 text-xs">No responses yet</p>
                : unavailable.map((r, idx) => (
                    <div
                      key={r.id}
                      className="flip-in flex items-center gap-1.5 py-0.5 bg-red-900/40 px-2 rounded my-0.5"
                      style={{ animationDelay: `${idx * 60}ms` }}
                    >
                      <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />
                      <span className="text-red-100 text-xs font-medium">{r.member_name}</span>
                    </div>
                  ))
              }
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {recall.status === 'active' && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowRespond(true); }}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                  myResponse?.response === 'responding'
                    ? 'bg-green-800 text-green-100 border border-green-600'
                    : myResponse?.response === 'unavailable'
                    ? 'bg-gray-700 text-gray-300 dark:text-gray-600'
                    : 'bg-blue-700 hover:bg-blue-600 text-white'
                }`}
              >
                {myResponse?.response === 'responding' ? '✓ Responding — Update' : myResponse?.response === 'unavailable' ? 'Update Response' : 'Respond'}
              </button>
            )}
            {canClose && (
              <button
                disabled={closing}
                onClick={handleClose}
                className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 rounded-lg py-2 text-sm font-medium transition-colors"
              >
                {closing ? 'Closing…' : 'Close Recall'}
              </button>
            )}
          </div>
          {closeError && (
            <p className="text-red-400 text-xs mt-2">{closeError}</p>
          )}
        </div>
      )}

      {showRespond && (
        <RespondModal
          recall={recall}
          myResponse={myResponse}
          onClose={() => setShowRespond(false)}
          onResponded={() => { setShowRespond(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ── Main RecallSystem Component ───────────────────────────────────────────────
export default function RecallSystem({ user }) {
  const [recalls, setRecalls]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showIssue, setShowIssue]     = useState(false);
  const [ticker, setTicker]           = useState(0);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [testStatus, setTestStatus]   = useState('idle'); // 'idle' | 'sending' | 'ok' | 'error'

  const canIssue = ['officer', 'chief'].includes(user?.role);

  const sendTestNotification = useCallback(async () => {
    setTestStatus('sending');
    try {
      await api.post('/api/push/test', {});
      setTestStatus('ok');
    } catch (e) {
      console.error('Test recall error:', e);
      setTestStatus('error');
    } finally {
      setTimeout(() => setTestStatus('idle'), 4000);
    }
  }, []);

  const fetchRecalls = useCallback(async () => {
    try {
      const raw = await api.get('/api/recall');
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setRecalls(arr);
    } catch (e) {
      console.error('fetchRecalls error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecalls(); }, [fetchRecalls]);

  // Refresh every 10s while an active recall exists; update elapsed timer every second
  useEffect(() => {
    const hasActive = recalls.some(r => r.status === 'active');
    if (!hasActive) return;
    const timerInterval = setInterval(() => setTicker(t => t + 1), 1000);
    const fetchInterval = setInterval(fetchRecalls, 10_000);
    return () => { clearInterval(timerInterval); clearInterval(fetchInterval); };
  }, [recalls, fetchRecalls]);

  const active   = recalls.filter(r => r.status === 'active');
  const history  = recalls.filter(r => r.status !== 'active');

  return (
    <>
      <style>{flipInStyles}</style>
      <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Siren className="h-7 w-7 text-red-400" />
            Recall System
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Issue an all-call or recall to notify off-duty members via push notification
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchRecalls}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            title="Refresh"
            aria-label="Refresh recalls"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {canIssue && (
            <>
              <button
                onClick={sendTestNotification}
                disabled={testStatus === 'sending'}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  testStatus === 'ok'
                    ? 'bg-green-900/50 border-green-700 text-green-300'
                    : testStatus === 'error'
                    ? 'bg-red-900/50 border-red-700 text-red-300'
                    : 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-300 dark:text-gray-600'
                }`}
                title="Send a test push notification to verify delivery is working"
              >
                {testStatus === 'sending' ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : testStatus === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : testStatus === 'error' ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <FlaskConical className="h-4 w-4" />
                )}
                {testStatus === 'ok' ? 'Sent!' : testStatus === 'error' ? 'Failed' : 'Send Test'}
              </button>
              <button
                onClick={() => setShowIssue(true)}
                className="flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
              >
                <Siren className="h-4 w-4" />
                Issue Recall
              </button>
            </>
          )}
        </div>
      </div>

      {/* How-it-works tip for members */}
      {!canIssue && (
        <div className="bg-blue-950/40 border border-blue-800 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-blue-300 text-sm">
            When a recall is issued, you'll get a push notification. Open the app to respond with your availability and ETA.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-gray-400">Loading recalls…</div>
      )}

      {/* Active recalls */}
      {!loading && active.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-red-400 font-bold text-sm uppercase tracking-widest flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse inline-block" />
            Active ({active.length})
          </h2>
          {active.map(r => (
            <RecallCard
              key={r.id}
              recall={r}
              user={user}
              onRefresh={fetchRecalls}
            />
          ))}
        </div>
      )}

      {/* No active recall */}
      {!loading && active.length === 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl px-6 py-8 text-center">
          <Siren className="h-10 w-10 text-gray-600 dark:text-gray-300 mx-auto mb-3" />
          <p className="text-gray-300 dark:text-gray-600 font-semibold">No active recall</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {canIssue ? 'Issue a recall to notify off-duty members.' : 'No recall is currently active.'}
          </p>
          {canIssue && (
            <button
              onClick={() => setShowIssue(true)}
              className="mt-4 bg-red-800 hover:bg-red-700 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors inline-flex items-center gap-2"
            >
              <Siren className="h-4 w-4" /> Issue Recall
            </button>
          )}
        </div>
      )}

      {/* History */}
      {!loading && history.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-gray-400 font-bold text-sm uppercase tracking-widest flex items-center gap-2">
              <Clock className="h-4 w-4" /> History ({history.length})
            </h2>
            <button onClick={() => setCollapseSignal(s => s + 1)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-300 underline">
              Collapse All
            </button>
          </div>
          {history.map(r => (
            <RecallCard
              key={r.id}
              recall={r}
              user={user}
              onRefresh={fetchRecalls}
              collapseSignal={collapseSignal}
            />
          ))}
        </div>
      )}

      {/* Issue modal */}
      {showIssue && (
        <IssueModal
          onClose={() => setShowIssue(false)}
          onIssued={(recall) => {
            setShowIssue(false);
            fetchRecalls();
          }}
        />
      )}
      </div>
    </>
  );
}
