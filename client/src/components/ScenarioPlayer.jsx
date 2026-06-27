/**
 * ScenarioPlayer.jsx — Interactive scenario decision-tree player (Phase 5)
 *
 * Flow:
 *  1. Setup screen  — dispatch info + narrative + situation details
 *  2. Scene loop    — situation text → 4 choice buttons → outcome reveal
 *  3. Debrief screen — score, grade, decision review, AI-generated feedback
 *
 * Scoring: each choice is worth 0, 1, or 2 points.
 * Grades:  Excellent ≥ 80% · Competent ≥ 60% · Needs Review < 60%
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  X, Target, Clock, Award,
  CheckCircle2, AlertTriangle, Star, Loader2, Play,
  Radio, MessageSquare, Send, RotateCcw, Trophy,
  AlertCircle, ArrowRight, BookOpen,
} from 'lucide-react';
import { api } from '../utils/api';

// ─── Shuffle choices (Fisher-Yates) ───────────────────────────────────────────

function shuffleChoices(choices) {
  const arr = [...choices];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const POSITION_LABELS = ['A', 'B', 'C', 'D'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function grade(pct) {
  if (pct >= 80) return { label: 'Excellent',    style: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900', icon: <Star size={18} className="text-emerald-500" /> };
  if (pct >= 60) return { label: 'Competent',    style: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900',       icon: <CheckCircle2 size={18} className="text-blue-500" /> };
  return            { label: 'Needs Review', style: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900',     icon: <AlertTriangle size={18} className="text-amber-500" /> };
}

function ChoiceButton({ choice, state, onSelect, positionLabel }) {
  // state: 'idle' | 'selected' | 'correct' | 'wrong' | 'revealed'
  const isThis    = state.selectedId === choice.id;
  const revealed  = state.phase === 'revealed';

  let cls = 'w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ';
  if (!revealed) {
    cls += isThis
      ? 'border-red-600 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300'
      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 text-gray-700 dark:text-gray-300 cursor-pointer';
  } else {
    // show colors for all choices after reveal
    if (choice.outcome.points === 2) {
      cls += 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300';
    } else if (choice.outcome.points === 1) {
      cls += 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300';
    } else {
      cls += isThis
        ? 'border-red-400 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300'
        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-gray-400';
    }
  }

  return (
    <button
      onClick={() => !revealed && onSelect(choice.id)}
      disabled={revealed}
      className={cls}
    >
      <div className="flex items-start gap-3">
        <span className="font-bold mt-0.5 uppercase text-xs w-4 flex-shrink-0">
          {positionLabel || choice.id}.
        </span>
        <span className="flex-1">{choice.text}</span>
        {revealed && (
          <span className="flex-shrink-0 ml-2">
            {choice.outcome.points === 2 && <CheckCircle2 size={16} className="text-emerald-500" />}
            {choice.outcome.points === 1 && <CheckCircle2 size={16} className="text-blue-400" />}
            {choice.outcome.points === 0 && isThis && <AlertCircle size={16} className="text-red-500" />}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── AI Debrief Panel ─────────────────────────────────────────────────────────

function AiDebriefPanel({ scenario, decisions, score, pct }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [generated, setGenerated] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function generateDebrief() {
    setLoading(true);
    const decisionSummary = decisions.map((d, i) => {
      const scene  = scenario.scenes[i];
      const choice = scene.choices.find(c => c.id === d.choiceId);
      return `Scene ${i + 1} (${scene.title}): chose "${choice?.text}" — ${d.points}/2 pts. Outcome: ${choice?.outcome.narrative}`;
    }).join('\n');

    const prompt = `You are an experienced NJ fire service instructor providing a post-incident debrief.
The student just completed the scenario "${scenario.title}" and scored ${pct}% (${score} points).
Grade: ${grade(pct).label}

Decision log:
${decisionSummary}

Key lessons from the scenario author:
${scenario.debrief.keyLessons.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Provide a concise, encouraging debrief in 3 paragraphs:
1. Overall performance summary with specific praise or constructive feedback
2. The 1-2 most important decision points and why they matter operationally
3. Recommended study or practice focus areas based on their performance

Keep it practical, NJ-specific where relevant, and end with a motivating statement. Use plain text, no markdown headers.`;

    try {
      const data = await api.post('/api/assistant', { message: prompt });
      setMessages([{ role: 'assistant', text: data.reply }]);
      setGenerated(true);
    } catch {
      setMessages([{ role: 'assistant', text: 'AI debrief unavailable right now — review the key lessons below for feedback.' }]);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }

  async function sendFollowUp(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);
    try {
      const context = `Scenario: ${scenario.title}. Student scored ${pct}% (${grade(pct).label}).`;
      const data = await api.post('/api/assistant', {
        message: `${context}\n\nFollow-up question: ${userMsg}`,
      });
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Unable to get a response. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="bg-gray-900 px-5 py-3 flex items-center gap-2">
        <MessageSquare size={16} className="text-red-400" />
        <span className="text-sm font-semibold text-white">AI Instructor Debrief</span>
      </div>

      <div className="p-5 space-y-4">
        {!generated && !loading && (
          <div className="text-center space-y-3 py-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Get personalized feedback on your command decisions from your AI instructor.
            </p>
            <button
              onClick={generateDebrief}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-700 text-white rounded-lg text-sm font-semibold hover:bg-red-800 transition-colors"
            >
              <MessageSquare size={15} /> Generate My Debrief
            </button>
          </div>
        )}

        {loading && !generated && (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Writing your personalized debrief…</span>
          </div>
        )}

        {messages.length > 0 && (
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`text-sm leading-relaxed rounded-lg px-4 py-3 ${
                  m.role === 'assistant'
                    ? 'bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-300'
                    : 'bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 text-right'
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-gray-400 pl-2">
                <Loader2 size={12} className="animate-spin" /> Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {generated && (
          <form onSubmit={sendFollowUp} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask a follow-up question…"
              aria-label="Ask a follow-up question"
              className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-gray-50 dark:bg-gray-950 dark:text-gray-100"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Send question"
              className="px-3 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors disabled:opacity-50"
            >
              <Send size={15} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScenarioPlayer({ scenario, onCompleted, onClose }) {
  // phase: 'setup' | 'scene' | 'debrief'
  const [phase,     setPhase]     = useState('setup');
  const [sceneIdx,  setSceneIdx]  = useState(0);
  // decisions: [{ choiceId, points }] — one per scene
  const [decisions, setDecisions] = useState([]);
  // per-scene choice UI state
  const [choiceState, setChoiceState] = useState({ phase: 'idle', selectedId: null });
  const [saving, setSaving] = useState(false);

  const scene   = scenario.scenes[sceneIdx];

  // Pre-shuffle choices for every scene once on mount so positions are randomized
  // but stable during the session. useMemo ensures the shuffle only happens once per scenario.
  const shuffledScenes = useMemo(
    () => scenario.scenes.map(s => ({ ...s, choices: shuffleChoices(s.choices) })),
    [scenario]
  );
  const shuffledChoices = shuffledScenes[sceneIdx]?.choices || scene.choices;

  const total   = scenario.scenes.reduce((sum, s) => sum + Math.max(...s.choices.map(c => c.outcome.points)), 0);
  const earned  = decisions.reduce((sum, d) => sum + d.points, 0);
  const pct     = total > 0 ? Math.round((earned / total) * 100) : 0;
  const g       = grade(pct);
  const passed  = pct >= scenario.passingScore;

  // Save completion when we enter debrief phase
  useEffect(() => {
    if (phase !== 'debrief') return;
    (async () => {
      setSaving(true);
      try {
        await api.post(`/api/scenarios/${scenario.id}/complete`, {
          score:       pct,
          passed,
          creditHours: passed ? scenario.creditHours : 0,
          scenarioTitle: scenario.title,
        });
        if (onCompleted) onCompleted();
      } catch {
        // non-fatal — debrief still shows
      } finally {
        setSaving(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function handleChoiceSelect(choiceId) {
    if (choiceState.phase === 'revealed') return;
    setChoiceState({ phase: 'revealed', selectedId: choiceId });
  }

  function handleNextScene() {
    const choice = scene.choices.find(c => c.id === choiceState.selectedId);
    const newDecisions = [...decisions, { choiceId: choiceState.selectedId, points: choice.outcome.points }];
    setDecisions(newDecisions);

    if (sceneIdx < scenario.scenes.length - 1) {
      setSceneIdx(i => i + 1);
      setChoiceState({ phase: 'idle', selectedId: null });
    } else {
      setPhase('debrief');
    }
  }

  // ── Setup screen ────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="fixed inset-0 sm:left-56 z-50 bg-gray-900/80 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          {/* header */}
          <div className="bg-gray-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{scenario.icon}</span>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Scenario</p>
                <h2 className="text-white font-bold text-lg leading-tight">{scenario.title}</h2>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* meta strip */}
          <div className="flex items-center gap-6 px-6 py-3 bg-gray-800 text-xs text-gray-400 flex-shrink-0">
            <span className="flex items-center gap-1.5"><Clock size={12} /> ~{scenario.estimatedMinutes} min</span>
            <span className="flex items-center gap-1.5"><Target size={12} /> {scenario.scenes.length} scenes</span>
            <span className="flex items-center gap-1.5"><Award size={12} /> {scenario.creditHours} CE hr · Pass ≥ {scenario.passingScore}%</span>
          </div>

          <div className="overflow-y-auto flex-1 p-6 space-y-5">
            {/* dispatch box */}
            <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Radio size={13} /> Dispatch
              </p>
              <p className="text-sm text-amber-900 dark:text-amber-200 font-mono leading-relaxed">{scenario.setup.dispatch}</p>
            </div>

            {/* narrative */}
            <div>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Situation Briefing</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{scenario.setup.narrative}</p>
            </div>

            {/* details */}
            <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-4 space-y-1.5">
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Key Information</p>
              {scenario.setup.details.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-red-500 font-bold mt-0.5 flex-shrink-0">›</span>
                  <span>{d}</span>
                </div>
              ))}
            </div>

            {/* grading reminder */}
            <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl p-4 text-xs text-blue-700 dark:text-blue-300">
              <p className="font-semibold mb-1">How scoring works</p>
              <p>Each scene presents 4 choices. The best option earns 2 pts, a reasonable option earns 1 pt, and poor choices earn 0 pts.
              Score ≥ {scenario.passingScore}% to earn your CE credit and an AI instructor debrief.</p>
            </div>
          </div>

          {/* footer */}
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
            <button
              onClick={() => setPhase('scene')}
              className="w-full flex items-center justify-center gap-2 py-3 bg-red-700 text-white rounded-xl font-bold hover:bg-red-800 transition-colors shadow-sm"
            >
              <Play size={18} /> Begin Scenario
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Scene screen ────────────────────────────────────────────────────────────
  if (phase === 'scene') {
    const selectedChoice = choiceState.selectedId
      ? scene.choices.find(c => c.id === choiceState.selectedId)
      : null;
    const revealed = choiceState.phase === 'revealed';

    return (
      <div className="fixed inset-0 sm:left-56 z-50 bg-gray-900/80 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          {/* header */}
          <div className="bg-gray-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-lg">{scenario.icon}</span>
              <div>
                <p className="text-xs text-gray-400">{scenario.title}</p>
                <p className="text-white font-semibold text-sm">{scene.title}</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* progress bar */}
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 flex-shrink-0">
            <div
              className="h-full bg-red-600 transition-all duration-500"
              style={{ width: `${((sceneIdx) / scenario.scenes.length) * 100}%` }}
            />
          </div>

          {/* scene counter */}
          <div className="flex items-center justify-between px-6 py-2 bg-gray-50 dark:bg-gray-950 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
            <span>Scene {sceneIdx + 1} of {scenario.scenes.length}</span>
            <span className="font-medium">{earned} pts earned so far</span>
          </div>

          <div className="overflow-y-auto flex-1 p-6 space-y-5">
            {/* situation */}
            <div>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Situation</p>
              <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed bg-gray-50 dark:bg-gray-950 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                {scene.situation}
              </p>
            </div>

            {/* choices */}
            <div>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                {revealed ? 'Decision Review' : 'What do you do?'}
              </p>
              <div className="space-y-2.5">
                {shuffledChoices.map((choice, idx) => (
                  <ChoiceButton
                    key={choice.id}
                    choice={choice}
                    state={choiceState}
                    onSelect={handleChoiceSelect}
                    positionLabel={POSITION_LABELS[idx]}
                  />
                ))}
              </div>
            </div>

            {/* outcome reveal */}
            {revealed && selectedChoice && (
              <div className={`rounded-xl border-2 p-4 space-y-2 ${
                selectedChoice.outcome.points === 2 ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/50' :
                selectedChoice.outcome.points === 1 ? 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50' :
                'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50'
              }`}>
                <div className="flex items-center gap-2">
                  {selectedChoice.outcome.points === 2 && <><CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" /><span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Best Choice — +2 pts</span></>}
                  {selectedChoice.outcome.points === 1 && <><CheckCircle2 size={16} className="text-blue-600 dark:text-blue-400" /><span className="text-sm font-bold text-blue-700 dark:text-blue-300">Acceptable Choice — +1 pt</span></>}
                  {selectedChoice.outcome.points === 0 && <><AlertCircle size={16} className="text-red-600 dark:text-red-400" /><span className="text-sm font-bold text-red-700 dark:text-red-300">Poor Choice — +0 pts</span></>}
                </div>
                <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{selectedChoice.outcome.narrative}</p>
              </div>
            )}
          </div>

          {/* footer */}
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
            {!revealed ? (
              <p className="text-xs text-gray-400 text-center">Select a choice above to continue</p>
            ) : (
              <button
                onClick={handleNextScene}
                className="w-full flex items-center justify-center gap-2 py-3 bg-red-700 text-white rounded-xl font-bold hover:bg-red-800 transition-colors shadow-sm"
              >
                {sceneIdx < scenario.scenes.length - 1 ? (
                  <><ArrowRight size={18} /> Next Scene</>
                ) : (
                  <><Trophy size={18} /> See My Results</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Debrief screen ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-gray-900/80 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* header */}
        <div className="bg-gray-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{scenario.icon}</span>
            <div>
              <p className="text-xs text-gray-400">Scenario Complete</p>
              <h2 className="text-white font-bold text-lg leading-tight">{scenario.title}</h2>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* score hero */}
          <div className={`rounded-xl border-2 p-6 text-center space-y-2 ${g.bg}`}>
            <div className="flex justify-center">{g.icon}</div>
            <p className={`text-4xl font-black ${g.style}`}>{pct}%</p>
            <p className={`text-lg font-bold ${g.style}`}>{g.label}</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">{earned} of {total} points</p>
            {passed ? (
              <div className="inline-flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-full">
                <Award size={13} /> {scenario.creditHours} CE hour logged to your Training Record
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-full">
                <AlertTriangle size={13} /> Score ≥ {scenario.passingScore}% required for CE credit
              </div>
            )}
            {saving && <p className="text-xs text-gray-400 flex items-center justify-center gap-1"><Loader2 size={11} className="animate-spin" /> Saving…</p>}
          </div>

          {/* decision review */}
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Your Decision Log</p>
            <div className="space-y-2">
              {decisions.map((d, i) => {
                const sc     = scenario.scenes[i];
                const choice = sc.choices.find(c => c.id === d.choiceId);
                return (
                  <div key={i} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-950 rounded-lg p-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {d.points === 2 && <CheckCircle2 size={15} className="text-emerald-500" />}
                      {d.points === 1 && <CheckCircle2 size={15} className="text-blue-400" />}
                      {d.points === 0 && <AlertCircle size={15} className="text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">{sc.title}</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{choice?.text}</p>
                    </div>
                    <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                      d.points === 2 ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' :
                      d.points === 1 ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300' :
                      'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                    }`}>
                      +{d.points}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* key lessons */}
          <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl p-4">
            <p className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-1.5">
              <BookOpen size={14} /> Key Lessons
            </p>
            <ul className="space-y-1.5">
              {scenario.debrief.keyLessons.map((lesson, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-300">
                  <span className="font-bold mt-0.5 flex-shrink-0">{i + 1}.</span>
                  <span>{lesson}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* references */}
          {scenario.debrief.references?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">References</p>
              <div className="flex flex-wrap gap-1.5">
                {scenario.debrief.references.map((ref, i) => (
                  <span key={i} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2.5 py-1 rounded-full font-medium">
                    {ref}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* AI debrief */}
          <AiDebriefPanel
            scenario={scenario}
            decisions={decisions}
            score={earned}
            pct={pct}
          />
        </div>

        {/* footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => {
              setPhase('setup');
              setSceneIdx(0);
              setDecisions([]);
              setChoiceState({ phase: 'idle', selectedId: null });
            }}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:border-red-300 hover:text-red-700 transition-colors"
          >
            <RotateCcw size={15} /> Run Again
          </button>
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-700 text-white rounded-xl font-bold hover:bg-red-800 transition-colors shadow-sm text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
