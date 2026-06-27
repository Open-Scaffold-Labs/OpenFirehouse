/**
 * IncidentResponse.jsx — Live Incident Assistant (Phase 6)
 *
 * Full-screen guidance overlay that activates when a member taps "I'm Responding."
 * Pulls their cert level from training records, incident data from the active board
 * or incident log, and current weather — then uses the AI to generate a personalized
 * mission brief scoped to what this volunteer is authorised to do.
 *
 * Dark theme, large text, mobile-first: designed to be readable in a moving vehicle.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  X, Radio, Shield, AlertTriangle, CheckCircle2, Loader2,
  MapPin, Clock, Thermometer, Wind, Send, MessageSquare,
  ChevronRight, Navigation, Siren, User, BookOpen, Phone,
} from 'lucide-react';
import { api } from '../utils/api';

// ─── NJ Certification Level Determination ─────────────────────────────────────

const CERT_LEVELS = [
  { id: 'officer',       label: 'Fire Officer',            interior: true,  command: true,  hazmat: false, color: 'bg-purple-500' },
  { id: 'ff2',           label: 'Firefighter II',          interior: true,  command: false, hazmat: false, color: 'bg-blue-500' },
  { id: 'ff1',           label: 'Firefighter I',           interior: true,  command: false, hazmat: false, color: 'bg-emerald-500' },
  { id: 'hazmat-ops',    label: 'HazMat Operations',       interior: false, command: false, hazmat: true,  color: 'bg-amber-500' },
  { id: 'hazmat-aware',  label: 'HazMat Awareness',        interior: false, command: false, hazmat: false, color: 'bg-yellow-500' },
  { id: 'emt',           label: 'EMT / First Responder',   interior: false, command: false, hazmat: false, color: 'bg-pink-500' },
  { id: 'probationary',  label: 'Probationary / Exterior', interior: false, command: false, hazmat: false, color: 'bg-gray-500' },
];

function determineCertLevel(records) {
  if (!records || records.length === 0) return CERT_LEVELS.find(c => c.id === 'probationary');
  const valid = records.filter(r =>
    r.status === 'Passed' &&
    (!r.expiresDate || new Date(r.expiresDate) > new Date())
  );
  const names = valid.map(r => (r.courseName || '').toLowerCase());

  if (names.some(n => /fire\s*officer|company\s*officer|officer\s*(i|1|ii|2)/i.test(n)))
    return CERT_LEVELS.find(c => c.id === 'officer');
  if (names.some(n => /firefighter\s*(ii|2)|ff\s*2/i.test(n)))
    return CERT_LEVELS.find(c => c.id === 'ff2');
  if (names.some(n => /firefighter\s*(i|1)|ff\s*1/i.test(n)))
    return CERT_LEVELS.find(c => c.id === 'ff1');
  if (names.some(n => /hazmat\s*op|haz\s*mat\s*op/i.test(n)))
    return CERT_LEVELS.find(c => c.id === 'hazmat-ops');
  if (names.some(n => /hazmat|haz\s*mat/i.test(n)))
    return CERT_LEVELS.find(c => c.id === 'hazmat-aware');
  if (names.some(n => /emt|paramedic|first\s*respond/i.test(n)))
    return CERT_LEVELS.find(c => c.id === 'emt');
  return CERT_LEVELS.find(c => c.id === 'probationary');
}

// ─── NJ restriction text per cert level ───────────────────────────────────────

function getRestrictions(cert) {
  if (cert.id === 'probationary') return [
    'You are NOT authorized for interior operations',
    'You are NOT authorized for roof ventilation',
    'You are NOT authorized to operate pumps or aerial devices without direct supervision',
    'Stay in your assigned staging area unless directed by IC',
  ];
  if (cert.id === 'ff1') return [
    'You ARE authorized for interior attack under officer supervision',
    'You are NOT authorized for incident command',
    'Always maintain two-in / two-out',
  ];
  if (cert.id === 'ff2') return [
    'Full interior operations authorized',
    'You may lead attack crews',
    'You are NOT authorized to assume incident command',
  ];
  if (cert.id === 'officer') return [
    'Full authority — interior, command, and tactical decisions',
    'You may assume or transfer command',
  ];
  if (cert.id === 'hazmat-ops') return [
    'HazMat defensive and offensive operations authorized',
    'You are NOT authorized for interior structural firefighting without FF1+',
  ];
  if (cert.id === 'emt') return [
    'Medical care and patient contact authorized',
    'You are NOT authorized for interior structural operations',
    'Stage at the EMS sector unless directed by IC',
  ];
  return ['Follow all directions from your Incident Commander'];
}

// ─── Elapsed timer ────────────────────────────────────────────────────────────

function ElapsedTimer({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <span className="font-mono font-bold text-red-400 text-lg">
      +{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    responding: 'bg-amber-500 animate-pulse',
    on_scene:   'bg-emerald-500',
    cleared:    'bg-gray-500',
  };
  const labels = { responding: 'EN ROUTE', on_scene: 'ON SCENE', cleared: 'CLEARED' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black text-white uppercase tracking-wider ${styles[status] ?? 'bg-gray-500'}`}>
      <span className="w-2 h-2 rounded-full bg-white/60" />
      {labels[status] ?? status}
    </span>
  );
}

// ─── Checklist item ───────────────────────────────────────────────────────────

function CheckItem({ text, checked, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all ${
        checked
          ? 'bg-emerald-900/30 border border-emerald-700/50'
          : 'bg-white/5 border border-white/10 hover:bg-white/10'
      }`}
    >
      <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? 'bg-emerald-500 border-emerald-500' : 'border-gray-500'
      }`}>
        {checked && <CheckCircle2 size={14} className="text-white" />}
      </div>
      <span className={`text-sm leading-relaxed ${checked ? 'text-emerald-300 line-through opacity-70' : 'text-gray-200'}`}>
        {text}
      </span>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function IncidentResponse({ incident, user, settings, onClose }) {
  // status: 'choose' | 'loading' | 'briefing' | 'active' | 'cleared'
  const [phase, setPhase]           = useState('choose');
  const [aiEnabled, setAiEnabled]   = useState(true);
  const [certLevel, setCertLevel]   = useState(null);
  const [briefing, setBriefing]     = useState('');
  const [checklist, setChecklist]   = useState([]);
  const [checked, setChecked]       = useState({});
  const [responseStatus, setResponseStatus] = useState('responding');

  // AI Q&A
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState('');
  const [aiLoading, setAiLoading]   = useState(false);
  const [showChat, setShowChat]     = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    chatRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── User chose: begin initialization ──

  function startResponse(useAI) {
    setAiEnabled(useAI);
    setPhase('loading');
  }

  useEffect(() => {
    if (phase !== 'loading') return;
    (async () => {
      try {
        // 1. Fetch volunteer's training records
        let records = [];
        try {
          const raw = await api.get('/api/training');
          records = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        } catch {}

        // 2. Determine cert level
        const cert = determineCertLevel(records);
        setCertLevel(cert);

        // 3. Log the response on the server
        try {
          await api.post(`/api/incidents/${incident.id || 0}/respond`, {
            status: 'responding',
            certLevel: cert.id,
          });
        } catch {}

        // If user opted out of AI, skip to a basic briefing
        if (!aiEnabled) {
          const restrictions = getRestrictions(cert);
          setBriefing({
            role: `Your role: ${cert.label} — ${cert.interior ? 'interior operations authorized' : 'exterior operations only'}`,
            hazards: `Standard hazards for ${incident.type || 'this incident type'}. Follow your SOGs.`,
            approach: 'Report to staging. Contact IC on arrival. Follow all directions.',
            donot: restrictions.join('. '),
          });
          setChecklist([
            'Don PPE and SCBA',
            'Confirm radio channel',
            'Report to staging area',
            'Contact IC for assignment',
            'Maintain accountability',
          ]);
          setPhase('briefing');
          return;
        }

        // 4. Build context and generate AI briefing
        const weatherInfo = settings?.city
          ? `Weather location: ${settings.city}, ${settings.state}`
          : 'Weather: unknown';

        const certNames = records
          .filter(r => r.status === 'Passed')
          .map(r => r.courseName)
          .join(', ') || 'None on file';

        const restrictions = getRestrictions(cert);

        const prompt = `You are an AI incident assistant for a New Jersey volunteer fire department. A volunteer is CURRENTLY RESPONDING to a live incident. Generate a concise, actionable mission brief.

INCIDENT:
- Type: ${incident.type || 'Unknown'}
- Address: ${incident.address || 'Unknown'}
- Dispatch time: ${incident.dispatched_at || incident.date || 'Just now'}
- Additional info: ${incident.description || incident.notes || 'None available'}
- Units dispatched: ${incident.units || incident.units_count || 'Unknown'}
- Personnel: ${incident.personnel_count || 'Unknown'}

RESPONDING MEMBER:
- Name: ${user.name}
- Role: ${user.role}
- Operational Level: ${cert.label}
- Interior Operations: ${cert.interior ? 'AUTHORIZED' : 'NOT AUTHORIZED'}
- Incident Command: ${cert.command ? 'AUTHORIZED' : 'NOT AUTHORIZED'}
- Current Certifications: ${certNames}

NJ OPERATIONAL RESTRICTIONS FOR THIS MEMBER:
${restrictions.map((r, i) => `${i + 1}. ${r}`).join('\n')}

${weatherInfo}

Generate a briefing with these EXACT sections separated by the markers below. Keep each section concise (2-4 bullet points max). Use plain text, no markdown headers. Write for a volunteer reading this on a phone while responding.

===ROLE===
One sentence describing their specific role on this call based on their cert level. Be direct: "Your role: [role]."

===HAZARDS===
Key hazards for this specific incident type. NJ-specific if relevant (construction types, highway protocols, etc.).

===APPROACH===
What to do on arrival. Specific, actionable steps in order.

===DONOT===
What this member must NOT do based on their certification level. Critical safety restrictions.

===CHECKLIST===
5-7 specific action items for this member as a numbered list. Items they should check off as they complete them. Appropriate to their cert level.`;

        try {
          const data = await api.post('/api/assistant', { message: prompt });
          const reply = data.reply || '';

          // Parse sections
          const getSection = (key) => {
            const re = new RegExp(`===${key}===([\\s\\S]*?)(?====|$)`);
            const m = reply.match(re);
            return m ? m[1].trim() : '';
          };

          const roleSec     = getSection('ROLE');
          const hazardsSec  = getSection('HAZARDS');
          const approachSec = getSection('APPROACH');
          const donotSec    = getSection('DONOT');
          const checkSec    = getSection('CHECKLIST');

          setBriefing({ role: roleSec, hazards: hazardsSec, approach: approachSec, donot: donotSec });

          // Parse checklist items
          const items = checkSec
            .split('\n')
            .map(l => l.replace(/^\d+[\.\)]\s*/, '').trim())
            .filter(l => l.length > 5);
          setChecklist(items);

        } catch {
          setBriefing({
            role: `Your role: ${cert.label} — ${cert.interior ? 'interior operations authorized' : 'exterior operations only'}`,
            hazards: 'AI briefing unavailable. Follow standard SOGs for this incident type.',
            approach: 'Report to staging. Contact IC on arrival. Follow all directions.',
            donot: restrictions.join('. '),
          });
          setChecklist([
            'Don PPE and SCBA',
            'Confirm radio channel',
            'Report to staging area',
            'Contact IC for assignment',
            'Maintain accountability',
          ]);
        }

        setPhase('briefing');
      } catch (err) {
        console.error('IncidentResponse init error:', err);
        setPhase('briefing');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Mark on-scene ──

  async function handleOnScene() {
    setResponseStatus('on_scene');
    setPhase('active');
    try {
      await api.post(`/api/incidents/${incident.id || 0}/respond`, {
        status: 'on_scene',
        certLevel: certLevel?.id || 'probationary',
      });
    } catch {}
  }

  // ── Clear from incident ──

  async function handleClear() {
    setResponseStatus('cleared');
    try {
      await api.post(`/api/incidents/${incident.id || 0}/respond`, {
        status: 'cleared',
        certLevel: certLevel?.id || 'probationary',
      });
    } catch {}
    setTimeout(() => onClose(), 1500);
  }

  // ── AI follow-up Q&A ──

  async function handleAsk(e) {
    e.preventDefault();
    if (!input.trim() || aiLoading) return;
    const q = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setAiLoading(true);

    const context = `Active incident: ${incident.type} at ${incident.address}. Responding volunteer: ${user.name}, cert level: ${certLevel?.label || 'unknown'}. ${certLevel?.interior ? 'Interior authorized.' : 'Exterior only.'}`;

    try {
      const data = await api.post('/api/assistant', {
        message: `${context}\n\nVolunteer asks while responding: ${q}\n\nAnswer concisely (2-3 sentences max). Be direct, action-oriented, and mindful of their certification restrictions.`,
      });
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Unable to get response. Follow your SOGs and IC direction.' }]);
    } finally {
      setAiLoading(false);
    }
  }

  // ── Toggle checklist items ──

  function toggleCheck(idx) {
    setChecked(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  const checkedCount  = Object.values(checked).filter(Boolean).length;
  const checklistPct  = checklist.length > 0 ? Math.round((checkedCount / checklist.length) * 100) : 0;

  // ── Choice screen: opt in or out of AI guidance ──

  if (phase === 'choose') {
    return (
      <div className="fixed inset-0 z-[60] bg-gray-950 flex flex-col items-center justify-center gap-6 p-6">
        {/* incident summary */}
        <div className="w-20 h-20 rounded-2xl bg-red-700 flex items-center justify-center shadow-xl shadow-red-900/50">
          <Siren size={36} className="text-white" />
        </div>
        <div className="text-center space-y-1.5">
          <p className="text-white font-black text-lg uppercase tracking-wider">Responding</p>
          <p className="text-red-400 font-semibold text-sm">{incident.type || 'Active Incident'}</p>
          {incident.address && <p className="text-gray-400 text-sm flex items-center justify-center gap-1"><MapPin size={13} /> {incident.address}</p>}
        </div>

        {/* two big buttons */}
        <div className="w-full max-w-sm space-y-3 mt-4">
          <button
            onClick={() => startResponse(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base px-6 py-4 rounded-2xl transition-colors shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-3"
          >
            <Radio size={20} />
            <div className="text-left">
              <span className="block">AI Mission Brief</span>
              <span className="block text-xs font-medium text-emerald-200 mt-0.5">Get personalized guidance for your cert level</span>
            </div>
          </button>
          <button
            onClick={() => startResponse(false)}
            className="w-full bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-base px-6 py-4 rounded-2xl transition-colors flex items-center justify-center gap-3"
          >
            <Shield size={20} />
            <div className="text-left">
              <span className="block">Standard Response</span>
              <span className="block text-xs font-medium text-gray-400 mt-0.5">Basic checklist without AI — just log my response</span>
            </div>
          </button>
        </div>

        <button onClick={onClose} className="mt-6 text-gray-600 dark:text-gray-300 hover:text-gray-400 text-sm transition-colors">
          Cancel
        </button>
      </div>
    );
  }

  // ── Loading screen ──

  if (phase === 'loading') {
    return (
      <div className="fixed inset-0 z-[60] bg-gray-950 flex flex-col items-center justify-center gap-6 p-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-red-700 flex items-center justify-center animate-pulse shadow-xl shadow-red-900/50">
            <Siren size={36} className="text-white" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <p className="text-white font-black text-lg uppercase tracking-wider">Generating Mission Brief</p>
          <p className="text-gray-400 text-sm">Analyzing incident, certifications, and conditions…</p>
        </div>
        <Loader2 size={28} className="text-red-500 animate-spin" />
      </div>
    );
  }

  // ── Main guidance view ──

  return (
    <div className="fixed inset-0 z-[60] bg-gray-950 flex flex-col overflow-hidden">

      {/* ── DISPATCH HEADER ── */}
      <div className="bg-red-800 flex-shrink-0">
        {/* top bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-red-900/50">
          <StatusBadge status={responseStatus} />
          <button onClick={onClose} aria-label="Close incident response" className="text-red-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        {/* incident info */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <Siren size={24} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-black text-lg leading-tight uppercase tracking-wide">
                {incident.type || 'Active Incident'}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <MapPin size={13} className="text-red-300 flex-shrink-0" />
                <p className="text-red-200 text-sm font-semibold truncate">{incident.address || 'Address unknown'}</p>
              </div>
            </div>
          </div>

          {/* meta row */}
          <div className="flex items-center gap-4 text-xs text-red-300 flex-wrap">
            {(incident.dispatched_at || incident.date) && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                <ElapsedTimer since={incident.dispatched_at || incident.date} />
              </span>
            )}
            {incident.units_count && (
              <span className="flex items-center gap-1">
                <Navigation size={12} /> {incident.units_count} units
              </span>
            )}
            {incident.personnel_count && (
              <span className="flex items-center gap-1">
                <User size={12} /> {incident.personnel_count} personnel
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── CERT LEVEL BANNER ── */}
      {certLevel && (
        <div className={`flex items-center gap-3 px-5 py-3 ${
          certLevel.interior ? 'bg-emerald-900/40 border-b border-emerald-800/50' : 'bg-amber-900/40 border-b border-amber-800/50'
        }`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${certLevel.color}`}>
            <Shield size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-bold">{certLevel.label}</p>
            <p className={`text-xs font-semibold ${certLevel.interior ? 'text-emerald-400' : 'text-amber-400'}`}>
              {certLevel.interior ? '✓ Interior Operations Authorized' : '⚠ Exterior Operations Only'}
            </p>
          </div>
        </div>
      )}

      {/* ── SCROLLABLE CONTENT ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-5">

          {/* ── YOUR ROLE ── */}
          {briefing.role && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Radio size={12} /> Your Mission
              </p>
              <p className="text-white text-sm leading-relaxed font-medium">{briefing.role}</p>
            </div>
          )}

          {/* ── HAZARDS ── */}
          {briefing.hazards && (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-2xl p-4">
              <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Key Hazards
              </p>
              <p className="text-amber-100 text-sm leading-relaxed whitespace-pre-line">{briefing.hazards}</p>
            </div>
          )}

          {/* ── APPROACH ── */}
          {briefing.approach && (
            <div className="bg-blue-900/20 border border-blue-700/30 rounded-2xl p-4">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Navigation size={12} /> On Arrival
              </p>
              <p className="text-blue-100 text-sm leading-relaxed whitespace-pre-line">{briefing.approach}</p>
            </div>
          )}

          {/* ── DO NOT ── */}
          {briefing.donot && (
            <div className="bg-red-900/20 border border-red-700/30 rounded-2xl p-4">
              <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <X size={12} /> Do NOT
              </p>
              <p className="text-red-200 text-sm leading-relaxed whitespace-pre-line font-medium">{briefing.donot}</p>
            </div>
          )}

          {/* ── CHECKLIST ── */}
          {checklist.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                  <CheckCircle2 size={12} /> Action Checklist
                </p>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">{checkedCount}/{checklist.length}</span>
              </div>
              {/* progress bar */}
              <div className="h-1.5 bg-white/10 rounded-full mb-3 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${checklistPct}%` }}
                />
              </div>
              <div className="space-y-2">
                {checklist.map((item, idx) => (
                  <CheckItem
                    key={idx}
                    text={item}
                    checked={!!checked[idx]}
                    onToggle={() => toggleCheck(idx)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── NJ RESTRICTIONS REMINDER ── */}
          {certLevel && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <BookOpen size={12} /> NJ Certification Restrictions
              </p>
              <div className="space-y-1.5">
                {getRestrictions(certLevel).map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                    <span className={`font-bold mt-0.5 flex-shrink-0 ${r.startsWith('You ARE') || r.startsWith('Full') ? 'text-emerald-500' : 'text-red-500'}`}>
                      {r.startsWith('You ARE') || r.startsWith('Full') ? '✓' : '✗'}
                    </span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AI Q&A (only when AI enabled) ── */}
          {aiEnabled && <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowChat(c => !c)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
            >
              <span className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                <MessageSquare size={12} /> Ask AI — Live Q&A
              </span>
              <ChevronRight size={14} className={`text-gray-500 dark:text-gray-400 transition-transform ${showChat ? 'rotate-90' : ''}`} />
            </button>

            {showChat && (
              <div className="border-t border-gray-800 p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                      Ask anything about this incident — hazards, procedure, equipment, NJ regulations.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {[
                        'Water supply options?',
                        'Where should I stage?',
                        'What PPE do I need?',
                      ].map((q) => (
                        <button
                          key={q}
                          onClick={() => { setInput(q); }}
                          className="text-xs bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {messages.map((m, i) => (
                      <div
                        key={i}
                        className={`text-sm rounded-xl px-3 py-2 ${
                          m.role === 'user'
                            ? 'bg-red-900/30 text-red-200 text-right ml-8'
                            : 'bg-white/5 text-gray-300 dark:text-gray-600 mr-8'
                        }`}
                      >
                        {m.text}
                      </div>
                    ))}
                    {aiLoading && (
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 pl-2">
                        <Loader2 size={11} className="animate-spin" /> Thinking…
                      </div>
                    )}
                    <div ref={chatRef} />
                  </div>
                )}

                <form onSubmit={handleAsk} className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    aria-label="Ask about this incident"
                    placeholder="Ask about this incident…"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700"
                    disabled={aiLoading}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || aiLoading}
                    aria-label="Send question"
                    className="px-3 py-2.5 bg-red-700 text-white rounded-xl hover:bg-red-600 transition-colors disabled:opacity-40"
                  >
                    <Send size={15} />
                  </button>
                </form>
              </div>
            )}
          </div>}

        </div>
      </div>

      {/* ── BOTTOM ACTION BAR ── */}
      <div className="flex-shrink-0 bg-gray-900 border-t border-gray-800 px-5 py-4">
        {responseStatus === 'responding' && (
          <button
            onClick={handleOnScene}
            className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white rounded-2xl font-black text-base uppercase tracking-wider hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/50 active:scale-[0.98]"
          >
            <MapPin size={20} /> I'm On Scene
          </button>
        )}
        {responseStatus === 'on_scene' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-emerald-400 justify-center">
              <CheckCircle2 size={14} /> On scene — guidance active. Complete your checklist.
            </div>
            <button
              onClick={handleClear}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gray-800 text-gray-300 dark:text-gray-600 rounded-2xl font-bold text-sm uppercase tracking-wider hover:bg-gray-700 transition-colors border border-gray-700"
            >
              Clear From Incident
            </button>
          </div>
        )}
        {responseStatus === 'cleared' && (
          <div className="text-center py-3">
            <p className="text-gray-400 text-sm font-semibold">Cleared. Stay safe.</p>
          </div>
        )}
      </div>
    </div>
  );
}
