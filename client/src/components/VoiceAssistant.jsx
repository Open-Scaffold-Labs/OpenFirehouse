/**
 * VoiceAssistant.jsx — "Hey Firehouse" AI Voice Interface
 *
 * Floating mic button that enables hands-free AI interaction:
 * 1. Tap the mic (or it detects "Hey Firehouse" wake phrase)
 * 2. Web Speech API listens to the question
 * 3. Question + incident context sent to AI assistant endpoint
 * 4. Response spoken back via Speech Synthesis
 *
 * Works through any Bluetooth headset paired to the phone.
 * Designed for one-handed, eyes-free operation on the fireground.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, X, Loader2, MessageSquare, AlertTriangle, Headphones } from 'lucide-react';
import { api } from '../utils/api';

// ─── Speech Recognition wrapper ──────────────────────────────────────────────

function getSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;
  return recognition;
}

// ─── Text-to-Speech ──────────────────────────────────────────────────────────

function speak(text, onDone) {
  if (!window.speechSynthesis) { if (onDone) onDone(); return; }
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Calm, clear voice
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v =>
    /Samantha|Karen|Daniel|Alex|Google US English/i.test(v.name) && v.lang.startsWith('en')
  ) || voices.find(v => v.lang.startsWith('en'));
  if (preferred) utterance.voice = preferred;

  utterance.onend = () => { if (onDone) onDone(); };
  utterance.onerror = () => { if (onDone) onDone(); };
  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

// ─── Build context from active incident ──────────────────────────────────────

function buildContext(incident, prePlans, knoxBoxes) {
  const parts = [];

  if (incident) {
    parts.push(`ACTIVE INCIDENT: ${incident.type} at ${incident.address}`);
    if (incident.incidentNumber) parts.push(`Incident #${incident.incidentNumber}`);
    if (incident.units?.length) parts.push(`Units on scene: ${incident.units.map(u => `${u.designation} (${u.status})`).join(', ')}`);
    if (incident.commandAssumed) parts.push(`IC: ${incident.ic || incident.commandOfficer}`);
    if (incident.personnel?.length) parts.push(`${incident.personnel.length} personnel on scene`);
    const ms = incident.milestones || {};
    if (ms.dispatched) parts.push(`Dispatched: ${new Date(ms.dispatched).toLocaleTimeString()}`);
    if (ms.onScene) parts.push(`On scene: ${new Date(ms.onScene).toLocaleTimeString()}`);
    if (ms.waterOn) parts.push('Water on the fire');
    if (ms.underControl) parts.push('Fire under control');
  }

  if (prePlans?.length) {
    parts.push(`\nPRE-PLANS AVAILABLE: ${prePlans.slice(0, 3).map(p => `${p.occupancyName || p.property_name} at ${p.address}`).join('; ')}`);
  }

  if (knoxBoxes?.length) {
    parts.push(`\nKNOX BOXES: ${knoxBoxes.slice(0, 3).map(k => `${k.box_number} at ${k.address} (${k.contents || 'contents unknown'})`).join('; ')}`);
  }

  return parts.length > 0
    ? `\n\nCURRENT CONTEXT:\n${parts.join('\n')}\n\nUse this context to give specific, actionable answers. Keep responses under 3 sentences unless more detail is explicitly requested. This is a hands-free voice interaction — be concise.`
    : '\n\nNo active incident. Answer general fire service questions concisely (under 3 sentences).';
}

// ─── States ──────────────────────────────────────────────────────────────────

const STATE = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  ERROR: 'error',
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function VoiceAssistant({ incident, minimized = false }) {
  const [state, setState] = useState(STATE.IDLE);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState([]);
  const [muted, setMuted] = useState(false);

  const recognitionRef = useRef(null);
  const contextRef = useRef('');

  // Pre-load context from cached data
  useEffect(() => {
    const loadContext = async () => {
      let prePlans = [], knoxBoxes = [];
      try {
        const pp = await api.get('/api/pre-plans');
        prePlans = pp.data || [];
      } catch (_) {}
      try {
        const kn = await api.get('/api/knox-keys');
        knoxBoxes = kn.data || [];
      } catch (_) {}
      contextRef.current = buildContext(incident, prePlans, knoxBoxes);
    };
    loadContext();
  }, [incident]);

  // Update context when incident changes
  useEffect(() => {
    contextRef.current = buildContext(incident, [], []);
  }, [incident?.milestones, incident?.units, incident?.personnel]);

  const startListening = useCallback(() => {
    setError('');
    setTranscript('');
    setResponse('');

    const recognition = getSpeechRecognition();
    if (!recognition) {
      setError('Speech recognition not supported in this browser.');
      setState(STATE.ERROR);
      return;
    }

    recognitionRef.current = recognition;
    setState(STATE.LISTENING);

    let finalTranscript = '';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interim = t;
        }
      }
      setTranscript(finalTranscript || interim);
    };

    recognition.onend = () => {
      if (finalTranscript.trim()) {
        processQuestion(finalTranscript.trim());
      } else {
        setState(STATE.IDLE);
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech') {
        setState(STATE.IDLE);
      } else {
        setError(`Mic error: ${e.error}`);
        setState(STATE.ERROR);
      }
    };

    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const processQuestion = useCallback(async (question) => {
    setState(STATE.PROCESSING);
    setHistory(h => [...h, { role: 'user', text: question }]);

    try {
      const res = await api.post('/api/assistant', {
        message: question + contextRef.current,
        history: history.slice(-4).map(h => ({ role: h.role, content: h.text })),
      });

      const answer = res.response || res.content || res.text || 'I could not generate a response.';
      setResponse(answer);
      setHistory(h => [...h, { role: 'assistant', text: answer }]);

      if (!muted) {
        setState(STATE.SPEAKING);
        speak(answer, () => setState(STATE.IDLE));
      } else {
        setState(STATE.IDLE);
      }
    } catch (e) {
      const errMsg = e.message || 'Failed to get AI response.';
      setError(errMsg);
      setResponse('');
      setState(STATE.ERROR);
      setTimeout(() => setState(STATE.IDLE), 3000);
    }
  }, [history, muted]);

  const handleMicClick = () => {
    if (state === STATE.LISTENING) {
      stopListening();
    } else if (state === STATE.SPEAKING) {
      stopSpeaking();
      setState(STATE.IDLE);
    } else if (state === STATE.IDLE || state === STATE.ERROR) {
      startListening();
    }
  };

  // Color and animation based on state.
  // Idle uses Headphones to signal "hands-free voice assistant" — distinct
  // from the DictationWidget's Mic icon (which is for dictating into the
  // currently focused input). Once listening, it switches to a Mic to make
  // the active recording state unambiguous.
  const stateStyles = {
    [STATE.IDLE]:       { bg: 'bg-red-700 hover:bg-red-600', ring: '', icon: Headphones },
    [STATE.LISTENING]:  { bg: 'bg-red-600', ring: 'ring-4 ring-red-300 animate-pulse', icon: Mic },
    [STATE.PROCESSING]: { bg: 'bg-amber-600', ring: 'ring-4 ring-amber-300', icon: Loader2 },
    [STATE.SPEAKING]:   { bg: 'bg-green-600', ring: 'ring-4 ring-green-300 animate-pulse', icon: Volume2 },
    [STATE.ERROR]:      { bg: 'bg-gray-600', ring: '', icon: AlertTriangle },
  };

  const { bg, ring, icon: StateIcon } = stateStyles[state];
  const isActive = state !== STATE.IDLE;

  // ── Floating button only (minimized mode) ──
  if (minimized && !expanded) {
    return (
      <button
        onClick={handleMicClick}
        className={`fixed bottom-20 left-4 z-40 w-14 h-14 rounded-full ${bg} ${ring} shadow-2xl flex items-center justify-center transition-all`}
        title="Hey Firehouse — Voice Assistant"
        aria-label="Hey Firehouse voice assistant"
      >
        <StateIcon size={22} className={`text-white ${state === STATE.PROCESSING ? 'animate-spin' : ''}`} />
      </button>
    );
  }

  // ── Expanded panel ──
  return (
    <>
      {/* Floating mic button */}
      <button
        onClick={() => isActive ? handleMicClick() : setExpanded(e => !e)}
        onDoubleClick={handleMicClick}
        className={`fixed bottom-20 left-4 z-40 w-14 h-14 rounded-full ${bg} ${ring} shadow-2xl flex items-center justify-center transition-all`}
        title={isActive ? (state === STATE.LISTENING ? 'Stop listening' : state === STATE.SPEAKING ? 'Stop speaking' : 'Processing...') : 'Hey Firehouse — tap to ask'}
        aria-label={isActive ? (state === STATE.LISTENING ? 'Stop listening' : state === STATE.SPEAKING ? 'Stop speaking' : 'Processing') : 'Open voice assistant'}
      >
        <StateIcon size={22} className={`text-white ${state === STATE.PROCESSING ? 'animate-spin' : ''}`} />
      </button>

      {/* Panel */}
      {expanded && (
        <div className="fixed bottom-36 left-4 z-40 w-80 bg-gray-950 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
            <Mic size={14} className="text-red-400" />
            <span className="text-xs font-black text-white flex-1">Hey Firehouse</span>
            <button onClick={() => setMuted(m => !m)} aria-label={muted ? 'Unmute spoken responses' : 'Mute spoken responses'} className={`w-6 h-6 rounded flex items-center justify-center ${muted ? 'bg-gray-700' : 'bg-green-700'}`}>
              {muted ? <VolumeX size={10} className="text-gray-400" /> : <Volume2 size={10} className="text-white" />}
            </button>
            <button onClick={() => setExpanded(false)} aria-label="Close" className="text-gray-500 hover:text-white">
              <X size={14} />
            </button>
          </div>

          {/* State indicator */}
          <div className="px-3 py-2 border-b border-gray-800">
            {state === STATE.IDLE && (
              <p className="text-xs text-gray-400">Tap the mic button or double-tap to ask a question.</p>
            )}
            {state === STATE.LISTENING && (
              <div>
                <p className="text-xs text-red-400 font-bold animate-pulse">Listening...</p>
                {transcript && <p className="text-xs text-gray-300 mt-1 italic">"{transcript}"</p>}
              </div>
            )}
            {state === STATE.PROCESSING && (
              <div className="flex items-center gap-2">
                <Loader2 size={12} className="text-amber-400 animate-spin" />
                <p className="text-xs text-amber-400 font-bold">Thinking...</p>
              </div>
            )}
            {state === STATE.SPEAKING && (
              <p className="text-xs text-green-400 font-bold animate-pulse">Speaking response...</p>
            )}
            {state === STATE.ERROR && error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
          </div>

          {/* Response */}
          {response && (
            <div className="px-3 py-2 max-h-40 overflow-y-auto">
              <p className="text-xs text-gray-300 leading-relaxed">{response}</p>
            </div>
          )}

          {/* Quick ask button */}
          <div className="px-3 py-2 border-t border-gray-800">
            <button
              onClick={handleMicClick}
              disabled={state === STATE.PROCESSING}
              className={`w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                state === STATE.LISTENING
                  ? 'bg-red-600 text-white animate-pulse'
                  : 'bg-red-700 hover:bg-red-600 text-white'
              } disabled:opacity-50`}
            >
              <Mic size={14} />
              {state === STATE.LISTENING ? 'Tap to stop' : state === STATE.SPEAKING ? 'Tap to stop' : 'Ask a question'}
            </button>
          </div>

          {/* Context indicator */}
          {incident && (
            <div className="px-3 py-1.5 border-t border-gray-800 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <p className="text-[9px] text-gray-500">Context: {incident.type} @ {incident.address}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
