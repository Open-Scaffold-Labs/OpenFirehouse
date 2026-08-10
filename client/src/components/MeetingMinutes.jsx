import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, ChevronDown, ChevronRight, Users, FileText, CheckCircle, Clock, Trash2, X, Mic, MicOff, Square, Sparkles, Loader2, Edit3, Link2, Unlink } from 'lucide-react';
import { getToken } from '../utils/api';
import AIWriteTextarea from './AIWriteTextarea';

const API = import.meta.env.VITE_API_URL || '';

/** Build headers with auth token for all API calls */
function authHeaders(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  const tok = getToken();
  if (tok) h['Authorization'] = `Bearer ${tok}`;
  return h;
}
const MEETING_TYPES = ['regular','special','emergency','executive','committee','training','budget','planning','annual','other'];
const TYPE_LABELS = { regular:'Regular',special:'Special',emergency:'Emergency',executive:'Executive Board',committee:'Committee',training:'Training',budget:'Budget',planning:'Planning',annual:'Annual',other:'Other' };
const STATUS_COLORS = { draft:'bg-yellow-100 dark:bg-yellow-950/50 text-yellow-800 dark:text-yellow-300', approved:'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300', final:'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300', recording:'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300' };
const LINKABLE_MODULES = [
  { value: '', label: 'None (standalone meeting)' },
  { value: 'incidents', label: 'Incident' },
  { value: 'training', label: 'Training Record' },
  { value: 'after-action', label: 'After Action Report' },
  { value: 'grievances', label: 'Grievance' },
  { value: 'budget', label: 'Budget Line' },
  { value: 'grants', label: 'Grant' },
  { value: 'investigations', label: 'Fire Investigation' },
  { value: 'equipment-checkout', label: 'Equipment Issue' },
  { value: 'aid-agreements', label: 'Mutual Aid Agreement' },
  { value: 'mutualaid', label: 'Mutual Aid Activation' },
  { value: 'personnel-actions', label: 'Personnel Action' },
  { value: 'scba', label: 'SCBA / Air Management' },
  { value: 'maintenance', label: 'Maintenance Record' },
  { value: 'apparatus', label: 'Apparatus' },
  { value: 'inspections', label: 'Fire Inspection' },
  { value: 'hydrants', label: 'Hydrant Record' },
  { value: 'hazmat', label: 'Hazmat Incident' },
  { value: 'wellness', label: 'Wellness Check' },
  { value: 'shift-trades', label: 'Shift Trade' },
  { value: 'recruitment', label: 'Recruitment Candidate' },
  { value: 'sogs', label: 'SOG / Policy' },
  { value: 'community-outreach', label: 'Community Outreach' },
  { value: 'fundraising', label: 'Fundraising Campaign' },
];
// Reusable member select dropdown — used for called_by, recorded_by, moved_by, seconded_by, assigned_to
function MemberSelect({ members, value, onChange, placeholder, className = '' }) {
  return (
    <select
      aria-label={placeholder || 'Select member'}
      className={`border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 ${className} dark:text-gray-100 dark:border-gray-700`}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">{placeholder || 'Select member…'}</option>
      {(members || []).filter(m => m.status !== 'Inactive').map(m => (
        <option key={m.id} value={m.name}>{m.name} — {m.rank}</option>
      ))}
    </select>
  );
}

// Compact member select for inline use (motions, action items)
function MemberSelectCompact({ members, value, onChange, placeholder, className = '' }) {
  return (
    <select
      aria-label={placeholder || 'Select member'}
      className={`border rounded px-2 py-0.5 text-xs bg-white dark:bg-gray-900 ${className} dark:text-gray-100 dark:border-gray-700`}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">{placeholder || 'Select…'}</option>
      {(members || []).filter(m => m.status !== 'Inactive').map(m => (
        <option key={m.id} value={m.name}>{m.name}</option>
      ))}
    </select>
  );
}

const MODULE_COLORS = {
  incidents:'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300', training:'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
  'after-action':'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300', grievances:'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300',
  budget:'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300', grants:'bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300',
  investigations:'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300', 'equipment-checkout':'bg-cyan-100 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300',
  'aid-agreements':'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300', mutualaid:'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300',
  'personnel-actions':'bg-pink-100 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300', scba:'bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300',
  maintenance:'bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300', apparatus:'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300',
  inspections:'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300', hydrants:'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
  hazmat:'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300', wellness:'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
  'shift-trades':'bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300', recruitment:'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300',
  sogs:'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300', 'community-outreach':'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300',
  fundraising:'bg-pink-100 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300',
};

// ── Meeting Setup Flow (pre-recording / pre-entry) ──────────────────────────

function MeetingSetup({ members, onStartRecording, onStartManual, onClose }) {
  const [f, setF] = useState({
    meeting_type: 'regular',
    title: '',
    location: '',
    called_by: '',
    attendees: [],
    linked_module: '',
    linked_record_id: '',
    linked_label: '',
  });
  const [linkableRecords, setLinkableRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  useEffect(() => {
    if (!f.linked_module) { setLinkableRecords([]); return; }
    setLoadingRecords(true);
    fetch(`${API}/api/meeting-minutes/linkable-records?module=${f.linked_module}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setLinkableRecords(Array.isArray(d) ? d : []))
      .catch(() => setLinkableRecords([]))
      .finally(() => setLoadingRecords(false));
  }, [f.linked_module]);

  const toggleAttendee = (id, name) => {
    const a = [...(f.attendees || [])];
    const idx = a.findIndex(x => x.id === id);
    idx >= 0 ? a.splice(idx, 1) : a.push({ id, name });
    setF({ ...f, attendees: a });
  };

  const selectAll = () => {
    const active = members.filter(m => m.status !== 'Inactive');
    setF({ ...f, attendees: active.map(m => ({ id: m.id, name: m.name })) });
  };

  const autoTitle = () => {
    const typeLabel = TYPE_LABELS[f.meeting_type] || 'Department';
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return `${typeLabel} Meeting — ${dateStr}`;
  };

  const handleProceed = (mode) => {
    const setup = {
      ...f,
      title: f.title || autoTitle(),
      meeting_date: new Date().toISOString().slice(0, 10),
    };
    if (mode === 'record') onStartRecording(setup);
    else onStartManual(setup);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-8 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg p-6 m-4">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Set Up Meeting</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Configure before recording or entering minutes</p>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          {/* Meeting type */}
          <div>
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1 block">Meeting Type *</label>
            <div className="grid grid-cols-3 gap-1.5">
              {MEETING_TYPES.slice(0, 9).map(t => (
                <button key={t} onClick={() => setF({ ...f, meeting_type: t })}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    f.meeting_type === t ? 'bg-red-600 text-white border-red-600' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300'
                  }`}>{TYPE_LABELS[t]}</button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1 block">Title (auto-generated if blank)</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder={autoTitle()} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
          </div>

          {/* Location + Called by */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1 block">Location</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="Station 14" value={f.location} onChange={e => setF({ ...f, location: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1 block">Called By</label>
              <MemberSelect members={members} value={f.called_by} onChange={v => setF({ ...f, called_by: v })} placeholder="Select member…" className="w-full" />
            </div>
          </div>

          {/* Attendees */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Attendees ({(f.attendees || []).length})</label>
              <button onClick={selectAll} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Select All Active</button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto border rounded-lg p-2">
              {members.filter(m => m.status !== 'Inactive').map(m => {
                const sel = (f.attendees || []).some(a => a.id === m.id);
                return <button key={m.id} type="button" onClick={() => toggleAttendee(m.id, m.name)}
                  className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${sel ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>{m.name}</button>;
              })}
            </div>
          </div>

          {/* Link to record */}
          <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 flex items-center gap-1"><Link2 size={12} /> Link to Record (optional)</p>
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Link to module" className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.linked_module || ''} onChange={e => setF({ ...f, linked_module: e.target.value, linked_record_id: '', linked_label: '' })}>
                {LINKABLE_MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {f.linked_module && (
                <select aria-label="Select linked record" className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.linked_record_id || ''} onChange={e => {
                  const rec = linkableRecords.find(r => String(r.id) === e.target.value);
                  setF({ ...f, linked_record_id: e.target.value ? parseInt(e.target.value) : '', linked_label: rec?.label || '' });
                }}>
                  <option value="">— Select record —</option>
                  {loadingRecords ? <option disabled>Loading...</option> : linkableRecords.map(r => <option key={r.id} value={r.id}>{r.label}{r.date ? ` (${new Date(r.date).toLocaleDateString()})` : ''}</option>)}
                </select>
              )}
            </div>
            {f.linked_label && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Linked to: {f.linked_label}</p>}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
          <div className="flex gap-2">
            <button onClick={() => handleProceed('manual')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium">
              <Edit3 size={16} /> Enter Manually
            </button>
            <button onClick={() => handleProceed('record')}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-violet-600 text-white rounded-lg hover:from-red-700 hover:to-violet-700 text-sm font-medium">
              <Mic size={16} /> Start Recording
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Live Recording Panel ──────────────────────────────────────────────────────

function RecordingPanel({ onComplete, onClose, setup }) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [duration, setDuration] = useState(0);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const transcriptRef = useRef('');

  const supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

  const startRecording = useCallback(() => {
    setError(null);
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setError('Speech recognition not supported in this browser. Use Chrome or Edge.'); return; }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript + ' ';
        } else {
          interimText += result[0].transcript;
        }
      }
      if (finalText) {
        transcriptRef.current += finalText;
        setTranscript(transcriptRef.current);
      }
      setInterim(interimText);
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') return; // normal, just silence
      if (event.error === 'aborted') return;
      setError(`Recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      // Auto-restart if still recording (browser stops after silence)
      if (recognitionRef.current && isRecording) {
        try { recognition.start(); } catch (_) {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setDuration(0);
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // prevent auto-restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setInterim('');
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const summarize = async () => {
    const text = transcriptRef.current.trim();
    if (!text || text.length < 20) { setError('Not enough transcript to summarize. Need at least a few sentences.'); return; }

    setSummarizing(true); setError(null);
    try {
      const resp = await fetch(`${API}/api/meeting-minutes/summarize`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ transcript: text }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      onComplete({ summary: data.summary, transcript: text });
    } catch (e) {
      setError(e.message);
    } finally {
      setSummarizing(false);
    }
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) { recognitionRef.current.stop(); }
      if (timerRef.current) { clearInterval(timerRef.current); }
    };
  }, []);

  const fmtTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-8 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl p-6 m-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Mic size={20} className="text-red-600 dark:text-red-400" /> Record Meeting
          </h3>
          <button onClick={() => { stopRecording(); onClose(); }} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>

        {!supported && (
          <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg p-3 mb-4 text-sm text-amber-800 dark:text-amber-300">
            Speech recognition is not supported in this browser. Please use Chrome or Edge. You can still type a transcript manually below.
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg p-3 mb-4 text-sm text-red-700 dark:text-red-300">{error}</div>
        )}

        {/* Recording controls */}
        <div className="flex items-center gap-4 mb-4">
          {!isRecording ? (
            <button onClick={startRecording} disabled={!supported} className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-full hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              <Mic size={18} /> Start Recording
            </button>
          ) : (
            <button onClick={stopRecording} className="flex items-center gap-2 px-5 py-2.5 bg-gray-800 text-white rounded-full hover:bg-gray-900 font-medium animate-pulse">
              <Square size={16} fill="currentColor" /> Stop Recording
            </button>
          )}
          {isRecording && (
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-mono font-bold text-red-600 dark:text-red-400">{fmtTime(duration)}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">Recording...</span>
            </div>
          )}
          {!isRecording && transcript && (
            <span className="text-sm text-gray-500 dark:text-gray-400">{fmtTime(duration)} recorded</span>
          )}
        </div>

        {/* Live transcript area */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1 block">TRANSCRIPT {isRecording && <span className="text-red-500">(live)</span>}</label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono h-64 resize-y dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700"
            placeholder={isRecording ? 'Speak now — transcript will appear here in real time...' : 'Click "Start Recording" to begin, or paste/type a transcript manually...'}
            value={transcript + (interim ? ' ' + interim : '')}
            onChange={e => { transcriptRef.current = e.target.value; setTranscript(e.target.value); }}
            readOnly={isRecording}
          />
          <p className="text-xs text-gray-400 mt-1">{transcript.split(/\s+/).filter(Boolean).length} words</p>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 pt-3 border-t">
          <button onClick={() => { stopRecording(); onClose(); }} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
          <button
            onClick={summarize}
            disabled={summarizing || (!transcript.trim())}
            className="flex items-center gap-2 px-5 py-2 text-sm bg-violet-700 text-white rounded-lg hover:bg-violet-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {summarizing ? <><Loader2 size={16} className="animate-spin" /> Summarizing...</> : <><Sparkles size={16} /> AI Summarize</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Minutes Modal (populated by AI or manual) ────────────────────────────

function MinutesModal({ members, onSave, onClose, initial }) {
  const [f, setF] = useState(initial || { title:'', meeting_date: new Date().toISOString().slice(0,10), meeting_type:'regular', location:'', called_by:'', attendees:[], agenda:[], motions:[], action_items:[], notes:'', recorded_by:'', next_meeting:'', raw_transcript:'', linked_module:'', linked_record_id:'', linked_label:'' });
  const [agendaInput, setAgendaInput] = useState('');
  const [motionInput, setMotionInput] = useState({ text:'', moved_by:'', seconded_by:'', result:'passed' });
  const [actionInput, setActionInput] = useState({ task:'', assigned_to:'', due_date:'' });
  const [showTranscript, setShowTranscript] = useState(false);
  const [linkableRecords, setLinkableRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // Load linkable records when module changes
  useEffect(() => {
    if (!f.linked_module) { setLinkableRecords([]); return; }
    setLoadingRecords(true);
    fetch(`${API}/api/meeting-minutes/linkable-records?module=${f.linked_module}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setLinkableRecords(Array.isArray(d) ? d : []))
      .catch(() => setLinkableRecords([]))
      .finally(() => setLoadingRecords(false));
  }, [f.linked_module]);

  const toggleAttendee = (id, name) => {
    const a = [...(f.attendees || [])];
    const idx = a.findIndex(x => x.id === id);
    idx >= 0 ? a.splice(idx, 1) : a.push({ id, name });
    setF({ ...f, attendees: a });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-6 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl p-6 m-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{initial?.id ? 'Edit Minutes' : 'Review & Publish Minutes'}</h3>
            {initial?.fromAI && <p className="text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1 mt-0.5"><Sparkles size={12} /> AI-generated draft — review and edit before publishing</p>}
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
          <input aria-label="Meeting title" className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="Meeting title *" value={f.title} onChange={e => setF({...f, title: e.target.value})} />
          <div className="grid grid-cols-2 gap-3">
            <input type="date" aria-label="Meeting date" className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.meeting_date} onChange={e => setF({...f, meeting_date: e.target.value})} />
            <select aria-label="Meeting type" className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.meeting_type} onChange={e => setF({...f, meeting_type: e.target.value})}>
              {MEETING_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input aria-label="Location" className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="Location" value={f.location} onChange={e => setF({...f, location: e.target.value})} />
            <MemberSelect members={members} value={f.called_by} onChange={v => setF({...f, called_by: v})} placeholder="Called by…" />
          </div>

          {/* Link to Record */}
          <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 flex items-center gap-1"><Link2 size={12} /> Link to Record (optional)</p>
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Link to module" className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.linked_module || ''} onChange={e => setF({...f, linked_module: e.target.value, linked_record_id: '', linked_label: ''})}>
                {LINKABLE_MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {f.linked_module && (
                <select aria-label="Select linked record" className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.linked_record_id || ''} onChange={e => {
                  const rec = linkableRecords.find(r => String(r.id) === e.target.value);
                  setF({...f, linked_record_id: e.target.value ? parseInt(e.target.value) : '', linked_label: rec?.label || ''});
                }}>
                  <option value="">— Select record —</option>
                  {loadingRecords ? <option disabled>Loading...</option> : linkableRecords.map(r => <option key={r.id} value={r.id}>{r.label}{r.date ? ` (${new Date(r.date).toLocaleDateString()})` : ''}</option>)}
                </select>
              )}
            </div>
            {f.linked_label && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Linked to: {f.linked_label}</p>}
          </div>

          {/* Attendees */}
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Attendees ({(f.attendees||[]).length})</p>
            <div className="flex flex-wrap gap-1.5">
              {members.map(m => {
                const sel = (f.attendees||[]).some(a => a.id === m.id);
                return <button key={m.id} type="button" onClick={() => toggleAttendee(m.id, m.name)}
                  className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${sel ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>{m.name}</button>;
              })}
            </div>
            {initial?.attendees_mentioned?.length > 0 && (
              <p className="text-xs text-violet-500 mt-1">AI detected names: {initial.attendees_mentioned.join(', ')}</p>
            )}
          </div>

          {/* Agenda */}
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Agenda Items</p>
            {(f.agenda||[]).map((a,i) => (
              <div key={i} className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-5">{i+1}.</span>
                <input aria-label={`Agenda item ${i+1}`} className="text-sm flex-1 border rounded px-2 py-1 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={a} onChange={e => { const ag = [...f.agenda]; ag[i] = e.target.value; setF({...f, agenda: ag}); }} />
                <button onClick={() => setF({...f, agenda: f.agenda.filter((_,j) => j !== i)})} aria-label={`Remove agenda item ${i+1}`} className="text-red-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <input aria-label="Add agenda item" className="flex-1 border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="Add agenda item" value={agendaInput} onChange={e => setAgendaInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && agendaInput.trim()) { setF({...f, agenda: [...(f.agenda||[]), agendaInput.trim()]}); setAgendaInput(''); }}} />
              <button type="button" onClick={() => { if (agendaInput.trim()) { setF({...f, agenda: [...(f.agenda||[]), agendaInput.trim()]}); setAgendaInput(''); }}} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700">Add</button>
            </div>
          </div>

          {/* Motions */}
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Motions</p>
            {(f.motions||[]).map((m,i) => (
              <div key={i} className="bg-gray-50 dark:bg-gray-950 rounded-lg p-2 mb-1 text-sm">
                <input aria-label={`Motion ${i+1} text`} className="w-full font-medium border rounded px-2 py-1 mb-1 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={m.text} onChange={e => { const mo = [...f.motions]; mo[i] = {...mo[i], text: e.target.value}; setF({...f, motions: mo}); }} />
                <div className="flex gap-2 items-center">
                  <MemberSelectCompact members={members} value={m.moved_by} onChange={v => { const mo = [...f.motions]; mo[i] = {...mo[i], moved_by: v}; setF({...f, motions: mo}); }} placeholder="Moved by…" className="flex-1" />
                  <MemberSelectCompact members={members} value={m.seconded_by} onChange={v => { const mo = [...f.motions]; mo[i] = {...mo[i], seconded_by: v}; setF({...f, motions: mo}); }} placeholder="Seconded by…" className="flex-1" />
                  <select aria-label={`Motion ${i+1} result`} className="border rounded px-2 py-0.5 text-xs dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={m.result} onChange={e => { const mo = [...f.motions]; mo[i] = {...mo[i], result: e.target.value}; setF({...f, motions: mo}); }}>
                    <option value="passed">Passed</option><option value="failed">Failed</option><option value="tabled">Tabled</option>
                  </select>
                  <button onClick={() => setF({...f, motions: f.motions.filter((_,j) => j !== i)})} aria-label={`Remove motion ${i+1}`} className="text-red-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <input aria-label="New motion text" className="border rounded-lg px-3 py-1.5 text-sm col-span-2 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="Motion text" value={motionInput.text} onChange={e => setMotionInput({...motionInput, text: e.target.value})} />
              <MemberSelect members={members} value={motionInput.moved_by} onChange={v => setMotionInput({...motionInput, moved_by: v})} placeholder="Moved by…" />
              <MemberSelect members={members} value={motionInput.seconded_by} onChange={v => setMotionInput({...motionInput, seconded_by: v})} placeholder="Seconded by…" />
              <select aria-label="New motion result" className="border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={motionInput.result} onChange={e => setMotionInput({...motionInput, result: e.target.value})}>
                <option value="passed">Passed</option><option value="failed">Failed</option><option value="tabled">Tabled</option>
              </select>
              <button type="button" onClick={() => { if (motionInput.text.trim()) { setF({...f, motions: [...(f.motions||[]), {...motionInput}]}); setMotionInput({text:'',moved_by:'',seconded_by:'',result:'passed'}); }}} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700">Add Motion</button>
            </div>
          </div>

          {/* Action Items */}
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Action Items</p>
            {(f.action_items||[]).map((a,i) => (
              <div key={i} className="flex items-center gap-2 mb-1 text-sm">
                <CheckCircle size={14} className="text-blue-500 flex-shrink-0" />
                <input aria-label={`Action item ${i+1} task`} className="flex-1 border rounded px-2 py-1 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={a.task} onChange={e => { const ai = [...f.action_items]; ai[i] = {...ai[i], task: e.target.value}; setF({...f, action_items: ai}); }} />
                <MemberSelectCompact members={members} value={a.assigned_to} onChange={v => { const ai = [...f.action_items]; ai[i] = {...ai[i], assigned_to: v}; setF({...f, action_items: ai}); }} placeholder="Assign…" className="w-32" />
                <input type="date" aria-label={`Action item ${i+1} due date`} className="border rounded px-2 py-1 text-xs dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={a.due_date||''} onChange={e => { const ai = [...f.action_items]; ai[i] = {...ai[i], due_date: e.target.value}; setF({...f, action_items: ai}); }} />
                <button onClick={() => setF({...f, action_items: f.action_items.filter((_,j) => j !== i)})} aria-label={`Remove action item ${i+1}`} className="text-red-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="grid grid-cols-3 gap-2">
              <input aria-label="New action item" className="border rounded-lg px-3 py-1.5 text-sm col-span-3 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="Action item" value={actionInput.task} onChange={e => setActionInput({...actionInput, task: e.target.value})} />
              <MemberSelect members={members} value={actionInput.assigned_to} onChange={v => setActionInput({...actionInput, assigned_to: v})} placeholder="Assigned to…" />
              <input type="date" aria-label="New action item due date" className="border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={actionInput.due_date} onChange={e => setActionInput({...actionInput, due_date: e.target.value})} />
              <button type="button" onClick={() => { if (actionInput.task.trim()) { setF({...f, action_items: [...(f.action_items||[]), {...actionInput}]}); setActionInput({task:'',assigned_to:'',due_date:''}); }}} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700">Add</button>
            </div>
          </div>

          <AIWriteTextarea rows={3} placeholder="General notes / key decisions" value={f.notes} onChange={e => setF({...f, notes: e.target.value})} name="notes" id="meeting-notes" />

          <div className="grid grid-cols-2 gap-3">
            <MemberSelect members={members} value={f.recorded_by} onChange={v => setF({...f, recorded_by: v})} placeholder="Recorded by…" />
            <input type="date" aria-label="Next meeting date" className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="Next meeting" value={f.next_meeting || ''} onChange={e => setF({...f, next_meeting: e.target.value})} />
          </div>

          {/* Raw transcript toggle */}
          {f.raw_transcript && (
            <div>
              <button onClick={() => setShowTranscript(!showTranscript)} className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1">
                <FileText size={12} /> {showTranscript ? 'Hide' : 'Show'} original transcript
              </button>
              {showTranscript && (
                <div className="mt-1 bg-gray-50 dark:bg-gray-950 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-300 font-mono max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {f.raw_transcript}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
          <button onClick={() => f.title && onSave(f)} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
            {initial?.id ? 'Update Minutes' : 'Save as Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MeetingMinutes() {
  const [minutes, setMinutes] = useState([]);
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState({});
  const [modal, setModal] = useState(null);     // null | {id,...} for edit | {fromAI:true,...} for AI result
  const [recording, setRecording] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupContext, setSetupContext] = useState(null); // holds pre-filled context from setup flow
  const [expanded, setExpanded] = useState(null);

  const load = () => {
    fetch(`${API}/api/meeting-minutes`, { headers: authHeaders() }).then(r => r.json()).then(d => setMinutes(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`${API}/api/meeting-minutes/stats`, { headers: authHeaders() }).then(r => r.json()).then(setStats).catch(() => {});
    fetch(`${API}/api/members`, { headers: authHeaders() }).then(r => r.json()).then(d => setMembers(Array.isArray(d) ? d : [])).catch(() => {});
  };
  useEffect(load, []);

  // Setup flow handlers
  const handleSetupRecord = (setup) => {
    setSetupOpen(false);
    setSetupContext(setup);
    setRecording(true);
  };

  const handleSetupManual = (setup) => {
    setSetupOpen(false);
    setSetupContext(null);
    setModal({
      title: setup.title || '',
      meeting_date: setup.meeting_date || new Date().toISOString().slice(0, 10),
      meeting_type: setup.meeting_type || 'regular',
      location: setup.location || '',
      called_by: setup.called_by || '',
      attendees: setup.attendees || [],
      agenda: [],
      motions: [],
      action_items: [],
      notes: '',
      recorded_by: '',
      next_meeting: '',
      linked_module: setup.linked_module || '',
      linked_record_id: setup.linked_record_id || '',
      linked_label: setup.linked_label || '',
    });
  };

  const handleAIComplete = ({ summary, transcript }) => {
    setRecording(false);
    const ctx = setupContext || {};
    if (summary) {
      setModal({
        fromAI: true,
        title: summary.title || ctx.title || '',
        meeting_date: ctx.meeting_date || new Date().toISOString().slice(0,10),
        meeting_type: summary.meeting_type || ctx.meeting_type || 'regular',
        location: ctx.location || '',
        called_by: ctx.called_by || '',
        attendees: ctx.attendees || [],
        attendees_mentioned: summary.attendees_mentioned || [],
        agenda: summary.agenda || [],
        motions: summary.motions || [],
        action_items: summary.action_items || [],
        notes: [
          ...(summary.key_decisions?.length ? ['Key decisions: ' + summary.key_decisions.join('; ')] : []),
          summary.notes || '',
        ].filter(Boolean).join('\n\n'),
        recorded_by: 'AI Transcription',
        next_meeting: '',
        raw_transcript: transcript,
        linked_module: ctx.linked_module || '',
        linked_record_id: ctx.linked_record_id || '',
        linked_label: ctx.linked_label || '',
      });
    } else {
      setModal({
        fromAI: true,
        title: ctx.title || 'Meeting — ' + new Date().toLocaleDateString(),
        meeting_date: ctx.meeting_date || new Date().toISOString().slice(0,10),
        meeting_type: ctx.meeting_type || 'regular',
        location: ctx.location || '', called_by: ctx.called_by || '',
        attendees: ctx.attendees || [], agenda: [], motions: [], action_items: [],
        notes: transcript,
        recorded_by: 'AI Transcription',
        next_meeting: '',
        raw_transcript: transcript,
        linked_module: ctx.linked_module || '',
        linked_record_id: ctx.linked_record_id || '',
        linked_label: ctx.linked_label || '',
      });
    }
    setSetupContext(null);
  };

  const save = async (data) => {
    const method = data.id ? 'PATCH' : 'POST';
    const url = data.id ? `${API}/api/meeting-minutes/${data.id}` : `${API}/api/meeting-minutes`;
    const payload = { ...data };
    // Don't send non-DB fields
    delete payload.fromAI;
    delete payload.attendees_mentioned;
    delete payload.raw_transcript;
    // Clean linked fields - send null if empty
    if (!payload.linked_module) { payload.linked_module = null; payload.linked_record_id = null; payload.linked_label = null; }
    await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
    setModal(null); load();
  };

  const del = async (id) => {
    if (!confirm('Delete these minutes?')) return;
    await fetch(`${API}/api/meeting-minutes/${id}`, { method: 'DELETE', headers: authHeaders() });
    load();
  };

  const finalize = async (m) => {
    await fetch(`${API}/api/meeting-minutes/${m.id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ status: 'approved' }) });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Meeting Minutes</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Record meetings with AI transcription, or create minutes manually</p>
        </div>
        {/* Blue: neutral create/save. Violet is reserved for AI surfaces (the AI
            Summarize action inside this same file keeps it) and red for live mission
            actions — creating a minutes record is neither. */}
        <button onClick={() => setSetupOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus size={16} /> New Meeting
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Meetings', val: stats.total || 0, icon: FileText, color: 'blue' },
          { label: 'Drafts', val: stats.drafts || 0, icon: Clock, color: 'yellow' },
          { label: 'This Year', val: stats.thisYear || 0, icon: Users, color: 'green' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-${s.color}-50`}><s.icon size={18} className={`text-${s.color}-600`} /></div>
              <div><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.val}</p><p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p></div>
            </div>
          </div>
        ))}
      </div>

      {/* AI info banner */}
      <div className="bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-900 rounded-xl p-4 flex items-start gap-3">
        <Sparkles size={20} className="text-violet-600 dark:text-violet-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">AI-Powered Meeting Minutes</p>
          <p className="text-xs text-violet-700 dark:text-violet-300 mt-0.5">Click "Record Meeting" to start live transcription. When you stop, AI will automatically extract agenda items, motions, action items, and key decisions. Review and edit before publishing.</p>
        </div>
      </div>

      {/* Minutes List */}
      <div className="space-y-3">
        {minutes.map(m => {
          const isOpen = expanded === m.id;
          const attendees = Array.isArray(m.attendees) ? m.attendees : [];
          const agenda = Array.isArray(m.agenda) ? m.agenda : [];
          const motions = Array.isArray(m.motions) ? m.motions : [];
          const actionItems = Array.isArray(m.action_items) ? m.action_items : [];
          return (
            <div key={m.id} className="bg-white dark:bg-gray-900 rounded-xl border">
              <button onClick={() => setExpanded(isOpen ? null : m.id)} className="w-full flex items-center gap-3 p-4 text-left">
                {isOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{m.title}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[m.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>{m.status}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{TYPE_LABELS[m.meeting_type] || m.meeting_type}</span>
                    {m.recorded_by === 'AI Transcription' && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 flex items-center gap-1"><Sparkles size={10} /> AI</span>}
                    {m.linked_module && m.linked_label && <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${MODULE_COLORS[m.linked_module] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}><Link2 size={10} /> {m.linked_label}</span>}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{new Date(m.meeting_date).toLocaleDateString()} · {attendees.length} attendees · {motions.length} motions · {actionItems.length} action items</p>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t pt-3">
                  {m.location && <p className="text-sm text-gray-600 dark:text-gray-300"><span className="font-medium">Location:</span> {m.location}</p>}
                  {attendees.length > 0 && (
                    <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">ATTENDEES</p>
                      <div className="flex flex-wrap gap-1">{attendees.map((a,i) => <span key={i} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 rounded-full text-xs">{a.name}</span>)}</div></div>
                  )}
                  {agenda.length > 0 && (
                    <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">AGENDA</p>
                      <ol className="list-decimal list-inside text-sm text-gray-700 dark:text-gray-300 space-y-0.5">{agenda.map((a,i) => <li key={i}>{a}</li>)}</ol></div>
                  )}
                  {motions.length > 0 && (
                    <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">MOTIONS</p>
                      {motions.map((mo,i) => (
                        <div key={i} className="bg-gray-50 dark:bg-gray-950 rounded-lg p-2 mb-1">
                          <p className="text-sm font-medium">{mo.text}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Moved: {mo.moved_by} · Seconded: {mo.seconded_by} · <span className={mo.result === 'passed' ? 'text-green-600 dark:text-green-400 font-bold' : 'text-red-600 dark:text-red-400 font-bold'}>{mo.result?.toUpperCase()}</span></p>
                        </div>
                      ))}</div>
                  )}
                  {actionItems.length > 0 && (
                    <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">ACTION ITEMS</p>
                      {actionItems.map((a,i) => (
                        <div key={i} className="flex items-center gap-2 text-sm"><CheckCircle size={14} className="text-blue-500" /><span className="flex-1">{a.task}</span><span className="text-xs text-gray-500 dark:text-gray-400">{a.assigned_to}</span>{a.due_date && <span className="text-xs text-gray-400">Due: {a.due_date}</span>}</div>
                      ))}</div>
                  )}
                  {m.notes && <div><p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">NOTES</p><p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{m.notes}</p></div>}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setModal(m)} className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg font-medium">Edit</button>
                    {m.status === 'draft' && <button onClick={() => finalize(m)} className="px-3 py-1.5 text-xs bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 hover:bg-green-200 rounded-lg font-medium">Approve</button>}
                    <button onClick={() => del(m.id)} className="px-3 py-1.5 text-xs bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 rounded-lg font-medium">Delete</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {minutes.length === 0 && <p className="text-center text-gray-400 py-12">No meeting minutes recorded yet</p>}
      </div>

      {/* Setup flow */}
      {setupOpen && <MeetingSetup members={members} onStartRecording={handleSetupRecord} onStartManual={handleSetupManual} onClose={() => setSetupOpen(false)} />}

      {/* Recording panel */}
      {recording && <RecordingPanel onComplete={handleAIComplete} onClose={() => { setRecording(false); setSetupContext(null); }} setup={setupContext} />}

      {/* Edit/review modal */}
      {modal && <MinutesModal members={members} initial={modal} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}
