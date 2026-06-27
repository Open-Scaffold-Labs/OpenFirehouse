import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, RotateCcw, SkipForward, X,
  Radio, Mic, ChevronDown, ChevronUp, Zap, Volume2, VolumeX,
} from 'lucide-react';
import { DEMO_SCENARIO } from '../data/demo-scenario';

// ─── Radio Audio Engine ──────────────────────────────────────────────────────
// Generates squelch/static sounds and reads radio transmissions aloud using
// Web Audio API + SpeechSynthesis. No external files needed.

function createRadioAudio() {
  let ctx = null;
  let speaking = false;

  function getCtx() {
    if (!ctx || ctx.state === 'closed') ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Short burst of filtered noise — simulates radio squelch
  function playSquelch(duration = 0.15, volume = 0.3) {
    try {
      const ac = getCtx();
      const bufferSize = ac.sampleRate * duration;
      const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * volume;
      }
      // Fade in/out to avoid clicks
      const fade = Math.floor(ac.sampleRate * 0.02);
      for (let i = 0; i < fade && i < bufferSize; i++) {
        data[i] *= i / fade;
        data[bufferSize - 1 - i] *= i / fade;
      }

      const source = ac.createBufferSource();
      source.buffer = buffer;

      // Bandpass filter for that radio-crackle sound
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2000;
      filter.Q.value = 1.5;

      const gain = ac.createGain();
      gain.gain.value = volume;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);
      source.start();
      return new Promise(r => setTimeout(r, duration * 1000));
    } catch (_) { return Promise.resolve(); }
  }

  // Roger beep — two short tones like a real radio
  function playRogerBeep(volume = 0.15) {
    try {
      const ac = getCtx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1200;
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.frequency.setValueAtTime(1200, ac.currentTime);
      osc.frequency.setValueAtTime(1500, ac.currentTime + 0.08);
      gain.gain.setValueAtTime(volume, ac.currentTime + 0.16);
      gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.2);
      osc.stop(ac.currentTime + 0.2);
      return new Promise(r => setTimeout(r, 220));
    } catch (_) { return Promise.resolve(); }
  }

  // Speak a radio transmission with squelch before/after
  async function speakTransmission(text, fromCallsign) {
    if (speaking || !window.speechSynthesis) return;
    speaking = true;
    try {
      await playSquelch(0.12, 0.25);

      await new Promise((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 0.9;
        utterance.volume = 0.9;

        // Try to find a male-sounding voice
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v =>
          /Daniel|Alex|Tom|Fred|Google US English|Aaron/i.test(v.name) && v.lang.startsWith('en')
        ) || voices.find(v => v.lang.startsWith('en'));
        if (preferred) utterance.voice = preferred;

        utterance.onend = resolve;
        utterance.onerror = resolve; // don't block on error
        window.speechSynthesis.speak(utterance);

        // Safety timeout in case onend never fires
        setTimeout(resolve, 15000);
      });

      await playSquelch(0.08, 0.15);
      await playRogerBeep(0.12);
    } finally {
      speaking = false;
    }
  }

  // Narrator voice — calmer, slower, different from radio voice
  async function speakNarrator(text) {
    if (speaking || !window.speechSynthesis) return;
    speaking = true;
    try {
      await new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.92;
        utterance.pitch = 1.05;
        utterance.volume = 0.85;

        // Pick a distinctly different voice — prefer female for contrast
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v =>
          /Samantha|Karen|Victoria|Moira|Tessa|Google UK English Female|Fiona/i.test(v.name) && v.lang.startsWith('en')
        ) || voices.find(v =>
          v.lang.startsWith('en') && /female/i.test(v.name)
        ) || voices.find(v => v.lang.startsWith('en'));
        if (preferred) utterance.voice = preferred;

        utterance.onend = resolve;
        utterance.onerror = resolve;
        window.speechSynthesis.speak(utterance);
        setTimeout(resolve, 20000);
      });
    } finally {
      speaking = false;
    }
  }

  function cancel() {
    speaking = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  return { speakTransmission, speakNarrator, playSquelch, playRogerBeep, cancel };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── DemoTimeline ─────────────────────────────────────────────────────────────
// Renders a sticky control bar + narrator cue panel at the top of CommandBoard.
// Props:
//   onEvent(event)     — called for each scenario event as it fires
//   onActivate(inc)    — called at t=0 to create the demo incident
//   onClose()          — dismiss the demo player
//   onDemoComplete()   — called when the scenario reaches the end

export default function DemoTimeline({ onEvent, onActivate, onClose, onDemoComplete, setIncident, onTick }) {
  const scenario = DEMO_SCENARIO;

  const [playing,       setPlaying]       = useState(false);
  const [elapsedSecs,   setElapsedSecs]   = useState(0);
  const [currentStep,   setCurrentStep]   = useState('');
  const [currentCue,    setCurrentCue]    = useState('');
  const [lastComms,     setLastComms]     = useState(null);
  const [showDetail,    setShowDetail]    = useState(false);
  const [started,       setStarted]       = useState(false);
  const [completed,     setCompleted]     = useState(false);
  const [audioEnabled,  setAudioEnabled]  = useState(true);

  // Radio audio engine (squelch + speech synthesis)
  const radioRef = useRef(null);
  if (!radioRef.current) radioRef.current = createRadioAudio();
  const audioEnabledRef = useRef(audioEnabled);
  useEffect(() => { audioEnabledRef.current = audioEnabled; }, [audioEnabled]);

  // Virtual clock tracking
  const startWallRef  = useRef(null);   // wall-clock time when last play() was pressed
  const elapsedAtPauseRef = useRef(0);  // elapsed seconds accumulated before last pause
  const firedRef      = useRef(new Set()); // set of event indices already fired
  const narratorFiredRef = useRef(new Set()); // narrator cues already spoken
  const rafRef        = useRef(null);

  // Keep fresh refs to callbacks so the memoized tick always has the latest
  const onEventRef        = useRef(onEvent);
  const onDemoCompleteRef = useRef(onDemoComplete);
  const setIncidentRef    = useRef(setIncident);
  const onTickRef         = useRef(onTick);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);
  useEffect(() => { onDemoCompleteRef.current = onDemoComplete; }, [onDemoComplete]);
  useEffect(() => { setIncidentRef.current = setIncident; }, [setIncident]);

  const total = scenario.totalDuration;

  // ── Tick ──────────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    if (!startWallRef.current) return;

    const wallElapsed = (Date.now() - startWallRef.current) / 1000;
    const virtualSecs = elapsedAtPauseRef.current + wallElapsed;
    const clamped     = Math.min(virtualSecs, total);

    setElapsedSecs(clamped);
    if (onTickRef.current) onTickRef.current(clamped);

    // Fire any events whose `t` has been crossed
    scenario.events.forEach((ev, idx) => {
      if (!firedRef.current.has(idx) && ev.t <= virtualSecs) {
        firedRef.current.add(idx);
        handleEvent(ev);
      }
    });

    // Update narrator cue + speak it aloud
    scenario.narratorCues.forEach((cue, idx) => {
      if (!narratorFiredRef.current.has(idx) && cue.t <= virtualSecs) {
        narratorFiredRef.current.add(idx);
        setCurrentCue(cue.text);
        // Speak narrator cue with distinct voice (after a short delay to let radio finish)
        if (audioEnabledRef.current && radioRef.current) {
          setTimeout(() => {
            if (radioRef.current) radioRef.current.speakNarrator(cue.text);
          }, 1500);
        }
      }
    });

    if (clamped >= total) {
      setPlaying(false);
      setCompleted(true);
      startWallRef.current = null;
      if (onDemoCompleteRef.current) onDemoCompleteRef.current();
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Event handler ─────────────────────────────────────────────────────────
  function handleEvent(ev) {
    if (ev.type === 'step') {
      setCurrentStep(ev.label);
    }

    if (ev.type === 'comms') {
      setLastComms({ from: ev.from, message: ev.message, channel: ev.channel });
      // Play radio audio: squelch + spoken transmission + roger beep
      if (audioEnabledRef.current && radioRef.current) {
        radioRef.current.speakTransmission(ev.message, ev.from);
      }
    }

    if (ev.type === 'demo_complete') {
      setCurrentStep('✅ Demo complete');
    }

    // Directly update the incident state in CommandBoard via ref
    const setter = setIncidentRef.current;
    if (setter) {
      setter(prev => {
        if (!prev) return prev;
        const now = new Date().toISOString();
        let updated = { ...prev };
        // Track what just changed for visual flash effects
        updated._demoFlash = { type: ev.type, time: Date.now() };

        if (ev.type === 'comms') {
          updated.commsLog = [
            { id: Date.now() + Math.random(), time: now, from: ev.from, message: ev.message, channel: ev.channel || 'Tac 1' },
            ...(prev.commsLog || []),
          ];
        }
        if (ev.type === 'unit_status') {
          const idx = ev.unit ?? ev.unitIndex;
          if (idx != null && updated.units[idx]) {
            const units = [...updated.units];
            units[idx] = { ...units[idx], status: ev.status };
            updated.units = units;
          }
        }
        if (ev.type === 'milestone') {
          updated.milestones = { ...updated.milestones, [ev.key]: ev.value || now };
        }
        if (ev.type === 'timeline_event') {
          updated.timelineEvents = [
            ...(updated.timelineEvents || []),
            { id: Date.now() + Math.random(), time: now, event: ev.event, type: ev.eventType || 'radio', auto: true },
          ];
        }
        if (ev.type === 'command_established') {
          updated.commandAssumed = true;
          updated.commandOfficer = ev.ic || ev.officer || '';
          updated.ic = ev.ic || ev.officer || '';
          updated.commandName = ev.commandName || '';
          updated.milestones = { ...updated.milestones, commandEstablished: now };
          // Only add IC role if not already present
          const existingRoles = updated.roles || [];
          if (!existingRoles.some(r => r.role === 'Incident Commander')) {
            updated.roles = [
              ...existingRoles,
              { id: Date.now(), role: 'Incident Commander', assignee: ev.ic || ev.officer || 'Unknown' },
            ];
          }
        }
        if (ev.type === 'add_personnel') {
          const existing = updated.personnel || [];
          if (!existing.some(p => p.name === ev.name)) {
            updated.personnel = [...existing, {
              id: Date.now() + Math.random(),
              name: ev.name,
              assignment: ev.assignment || 'Unassigned',
              status: ev.status || 'On Scene',
              lastPar: now,
            }];
          }
        }
        if (ev.type === 'update_personnel') {
          updated.personnel = (updated.personnel || []).map(p =>
            p.name === ev.name ? { ...p, status: ev.status } : p
          );
        }
        if (ev.type === 'add_role') {
          const existing = updated.roles || [];
          if (!existing.some(r => r.role === ev.role)) {
            updated.roles = [...existing, {
              id: Date.now() + Math.random(),
              role: ev.role,
              assignee: ev.assignee,
            }];
          }
        }
        if (ev.type === 'par_complete') {
          updated.milestones = { ...updated.milestones, parComplete: now };
          updated.timelineEvents = [
            ...(updated.timelineEvents || []),
            { id: Date.now() + Math.random(), time: now, event: `PAR complete — ${ev.count || 0} personnel, ${ev.missing || 0} missing`, type: 'par', auto: true },
          ];
        }
        return updated;
      });
    }

    // Also bubble up via callback (legacy)
    if (onEventRef.current) onEventRef.current(ev);
  }

  // ── Play ──────────────────────────────────────────────────────────────────
  function play() {
    if (completed) return;

    if (!started) {
      setStarted(true);
      // Create the incident immediately
      if (onActivate) onActivate(scenario.incident);
    }

    startWallRef.current = Date.now();
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }

  // ── Pause ─────────────────────────────────────────────────────────────────
  function pause() {
    setPlaying(false);
    if (startWallRef.current) {
      elapsedAtPauseRef.current += (Date.now() - startWallRef.current) / 1000;
      startWallRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }

  // ── Skip to next step ─────────────────────────────────────────────────────
  function skip() {
    const currentVirtual = elapsedAtPauseRef.current +
      (startWallRef.current ? (Date.now() - startWallRef.current) / 1000 : 0);

    // Find next step event beyond current time
    const nextStep = scenario.events.find(
      ev => ev.type === 'step' && ev.t > currentVirtual + 0.5
    );

    const jumpTo = nextStep ? nextStep.t : total;

    // Fire all skipped events immediately
    scenario.events.forEach((ev, idx) => {
      if (!firedRef.current.has(idx) && ev.t <= jumpTo) {
        firedRef.current.add(idx);
        handleEvent(ev);
      }
    });

    // Update narrator cue
    const cue = [...scenario.narratorCues]
      .filter(c => c.t <= jumpTo)
      .at(-1);
    if (cue) setCurrentCue(cue.text);

    // Reset wall clock to new position
    elapsedAtPauseRef.current = jumpTo;
    startWallRef.current = playing ? Date.now() : null;
    setElapsedSecs(jumpTo);

    if (jumpTo >= total) {
      setPlaying(false);
      setCompleted(true);
      if (onDemoCompleteRef.current) onDemoCompleteRef.current();
    }
  }

  // ── Restart ───────────────────────────────────────────────────────────────
  function restart() {
    pause();
    if (radioRef.current) radioRef.current.cancel();
    firedRef.current        = new Set();
    narratorFiredRef.current = new Set();
    elapsedAtPauseRef.current = 0;
    startWallRef.current = null;
    setElapsedSecs(0);
    setCurrentStep('');
    setCurrentCue('');
    setLastComms(null);
    setCompleted(false);
    setStarted(false);
  }

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (radioRef.current) radioRef.current.cancel();
    };
  }, []);

  // ── Progress percentage ───────────────────────────────────────────────────
  const pct = Math.min((elapsedSecs / total) * 100, 100);

  // ── Upcoming steps ────────────────────────────────────────────────────────
  const upcomingSteps = scenario.events
    .filter(ev => ev.type === 'step' && ev.t > elapsedSecs)
    .slice(0, 3);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-gradient-to-br from-gray-950 to-gray-900 text-white shadow-2xl overflow-hidden mb-4">

      {/* ── Top control bar ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">

        {/* Scenario badge */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="h-7 w-7 rounded-lg bg-red-600 flex items-center justify-center flex-shrink-0">
            <Zap size={14} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black text-red-400 uppercase tracking-wider">Demo Mode</p>
            <p className="text-xs font-semibold text-gray-200 truncate">{scenario.title}</p>
          </div>
        </div>

        {/* Current step */}
        {currentStep && (
          <div className="hidden sm:block flex-shrink-0 px-3 py-1 bg-white/10 rounded-lg">
            <p className="text-xs font-semibold text-white">{currentStep}</p>
          </div>
        )}

        {/* Time */}
        <div className="flex-shrink-0 font-mono text-sm font-bold tabular-nums text-gray-300 dark:text-gray-600">
          {fmtTime(elapsedSecs)} / {fmtTime(total)}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!playing ? (
            <button
              onClick={play}
              disabled={completed}
              className="h-8 w-8 rounded-lg bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors disabled:opacity-40"
              title={completed ? 'Demo complete' : started ? 'Resume' : 'Start demo'}
              aria-label={completed ? 'Demo complete' : started ? 'Resume demo' : 'Start demo'}
            >
              <Play size={14} fill="white" className="text-white ml-0.5" />
            </button>
          ) : (
            <button
              onClick={pause}
              className="h-8 w-8 rounded-lg bg-amber-500 hover:bg-amber-400 flex items-center justify-center transition-colors"
              title="Pause"
              aria-label="Pause demo"
            >
              <Pause size={14} fill="white" className="text-white" />
            </button>
          )}
          <button
            onClick={skip}
            disabled={completed}
            className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-40"
            title="Skip to next step"
            aria-label="Skip to next step"
          >
            <SkipForward size={13} className="text-white" />
          </button>
          <button
            onClick={restart}
            className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            title="Restart"
            aria-label="Restart demo"
          >
            <RotateCcw size={13} className="text-white" />
          </button>
          <button
            onClick={() => {
              setAudioEnabled(v => {
                if (v && radioRef.current) radioRef.current.cancel();
                return !v;
              });
            }}
            className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${audioEnabled ? 'bg-green-600 hover:bg-green-500' : 'bg-white/10 hover:bg-white/20'}`}
            title={audioEnabled ? 'Mute radio audio' : 'Enable radio audio'}
            aria-label={audioEnabled ? 'Mute radio audio' : 'Enable radio audio'}
          >
            {audioEnabled ? <Volume2 size={13} className="text-white" /> : <VolumeX size={13} className="text-gray-400" />}
          </button>
          <button
            onClick={() => setShowDetail(v => !v)}
            className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            title="Toggle detail panel"
            aria-label="Toggle detail panel"
            aria-expanded={showDetail}
          >
            {showDetail ? <ChevronUp size={13} className="text-white" /> : <ChevronDown size={13} className="text-white" />}
          </button>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-white/10 hover:bg-red-600 flex items-center justify-center transition-colors"
            title="Exit demo mode"
            aria-label="Exit demo mode"
          >
            <X size={13} className="text-white" />
          </button>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="h-1 bg-white/10">
        <div
          className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* ── Detail panel ── */}
      {showDetail && (
        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Narrator cue */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Mic size={11} className="text-amber-400" />
              <p className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Narrator Cue</p>
            </div>
            <p className="text-xs text-gray-300 dark:text-gray-600 leading-relaxed italic min-h-[3rem]">
              {currentCue
                ? `"${currentCue}"`
                : !started
                  ? 'Press ▶ to start the demo. Narrator talking points will appear here.'
                  : '…'}
            </p>
          </div>

          {/* Last radio call + upcoming steps */}
          <div className="space-y-2">
            {lastComms && (
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Radio size={11} className="text-blue-400" />
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-wider">
                    {lastComms.from} · {lastComms.channel}
                  </p>
                </div>
                <p className="text-xs text-gray-200 leading-relaxed line-clamp-2">"{lastComms.message}"</p>
              </div>
            )}

            {upcomingSteps.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-bold mb-1">Up next</p>
                <div className="space-y-0.5">
                  {upcomingSteps.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${i === 0 ? 'bg-red-400' : 'bg-gray-600'}`} />
                      <p className={`text-[11px] ${i === 0 ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>
                        {s.label} <span className="text-gray-600 dark:text-gray-300">— {fmtTime(s.t)}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {completed && (
              <div className="text-center py-1">
                <p className="text-xs font-black text-green-400">✅ Demo complete — great run!</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
