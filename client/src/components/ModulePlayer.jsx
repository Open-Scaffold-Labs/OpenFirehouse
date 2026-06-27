/**
 * ModulePlayer.jsx — Step-through training module player (Phase 4)
 *
 * Renders all 5 slide types, presents the quiz, scores it,
 * calls POST /api/modules/:id/complete, and shows a completion screen.
 */

import { useState, useRef, useEffect } from 'react';
import {
  X, ChevronLeft, ChevronRight, CheckCircle2, XCircle,
  Award, BookOpen, AlertTriangle, Loader2, MessageSquare, Send,
} from 'lucide-react';
import { api } from '../utils/api';

// ─── slide renderers ──────────────────────────────────────────────────────────

function IntroSlide({ slide }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 max-w-2xl mx-auto gap-6">
      <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-4xl">
        📚
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{slide.title}</h1>
      <p className="text-gray-600 dark:text-gray-300 text-base leading-relaxed">{slide.body}</p>
      {slide.note && (
        <p className="text-sm text-gray-400 italic">{slide.note}</p>
      )}
    </div>
  );
}

function ContentSlide({ slide }) {
  return (
    <div className="py-6 px-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{slide.title}</h2>
      <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{slide.body}</p>
      {slide.keyPoints && (
        <ul className="space-y-2 mt-2">
          {slide.keyPoints.map((pt, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="mt-1 w-5 h-5 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 flex items-center justify-center flex-shrink-0 text-xs font-bold">{i + 1}</span>
              {pt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListSlide({ slide }) {
  return (
    <div className="py-6 px-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{slide.title}</h2>
      {(slide.intro || slide.body) && (
        <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">{slide.intro || slide.body}</p>
      )}
      <ul className="space-y-2">
        {(slide.items || []).map((item, i) => {
          // items can be plain strings OR { label, text } objects
          const isObj = item && typeof item === 'object';
          return (
            <li key={i} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-950 rounded-lg p-3 text-sm text-gray-800 dark:text-gray-100">
              {isObj ? (
                <>
                  <span className="flex-shrink-0 min-w-[2rem] text-center font-bold text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 mt-0.5">
                    {item.label}
                  </span>
                  <span className="leading-relaxed">{item.text}</span>
                </>
              ) : (
                <>
                  <span className="text-red-600 dark:text-red-400 font-bold mt-0.5">•</span>
                  <span className="leading-relaxed">{item}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TableSlide({ slide }) {
  return (
    <div className="py-6 px-4 max-w-3xl mx-auto space-y-3">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{slide.title}</h2>
      {slide.intro && <p className="text-gray-600 dark:text-gray-300 text-sm">{slide.intro}</p>}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              {(slide.columns || []).map(col => (
                <th key={col} className="text-left px-4 py-2.5 font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wide">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(slide.rows || []).map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-950'}>
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-4 py-2.5 text-gray-700 dark:text-gray-300 ${ci === 0 ? 'font-mono font-bold text-red-700 dark:text-red-300' : ''}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CalloutSlide({ slide }) {
  const colors = {
    info:    'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300',
    warning: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300',
    tip:     'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300',
    default: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300',
  };
  const cls = colors[slide.tone] || colors.default;

  // Support two data shapes:
  //  (a) slide.points — flat string array (most common in module data)
  //  (b) slide.callout.{ title, body, items } — nested object format
  const hasFlatPoints = Array.isArray(slide.points) && slide.points.length > 0;
  const hasNestedCallout = slide.callout && (slide.callout.title || slide.callout.body || slide.callout.items);

  return (
    <div className="py-6 px-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{slide.title}</h2>
      {slide.intro && <p className="text-gray-600 dark:text-gray-300 text-sm">{slide.intro}</p>}

      <div className={`rounded-xl border p-5 ${cls}`}>
        {hasFlatPoints && (
          <ul className="space-y-2 text-sm">
            {slide.points.map((pt, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-bold mt-0.5 flex-shrink-0">→</span>
                <span className="leading-relaxed">{pt}</span>
              </li>
            ))}
          </ul>
        )}
        {hasNestedCallout && (
          <>
            {slide.callout.title && <p className="font-semibold mb-2">{slide.callout.title}</p>}
            {slide.callout.body  && <p className="text-sm leading-relaxed mb-2">{slide.callout.body}</p>}
            {slide.callout.items && (
              <ul className="mt-1 space-y-1 text-sm">
                {slide.callout.items.map((it, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-bold mt-0.5">→</span>
                    <span className="leading-relaxed">{it}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {slide.body && <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{slide.body}</p>}
    </div>
  );
}

function SlideRenderer({ slide }) {
  switch (slide.type) {
    case 'intro':   return <IntroSlide slide={slide} />;
    case 'content': return <ContentSlide slide={slide} />;
    case 'list':    return <ListSlide slide={slide} />;
    case 'table':   return <TableSlide slide={slide} />;
    case 'callout': return <CalloutSlide slide={slide} />;
    default:        return <ContentSlide slide={slide} />;
  }
}

// ─── quiz component ───────────────────────────────────────────────────────────

function Quiz({ module, onComplete }) {
  const [current, setCurrent]     = useState(0);
  const [selected, setSelected]   = useState(null);
  const [revealed, setRevealed]   = useState(false);
  const [answers, setAnswers]     = useState([]);  // array of booleans

  const q = module.quiz[current];
  const isLast = current === module.quiz.length - 1;

  function choose(idx) {
    if (revealed) return;
    setSelected(idx);
  }

  function handleCheck() {
    if (selected === null) return;
    setRevealed(true);
  }

  function handleNext() {
    const newAnswers = [...answers, selected === q.answer];
    setAnswers(newAnswers);
    if (isLast) {
      // score
      const correct = newAnswers.filter(Boolean).length;
      const score   = Math.round((correct / module.quiz.length) * 100);
      onComplete(score, newAnswers);
    } else {
      setCurrent(c => c + 1);
      setSelected(null);
      setRevealed(false);
    }
  }

  const optionClass = (idx) => {
    const base = 'w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ';
    if (!revealed) {
      return base + (selected === idx
        ? 'border-red-400 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 font-medium'
        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300');
    }
    if (idx === q.answer) return base + 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 font-medium';
    if (idx === selected) return base + 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300';
    return base + 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-gray-400';
  };

  return (
    <div className="max-w-xl mx-auto py-6 px-4 space-y-5">
      {/* progress */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>Question {current + 1} of {module.quiz.length}</span>
        <span>{answers.filter(Boolean).length} correct so far</span>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full">
        <div
          className="h-1.5 bg-red-600 rounded-full transition-all"
          style={{ width: `${((current) / module.quiz.length) * 100}%` }}
        />
      </div>

      {/* question */}
      <p className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-snug">{q.q}</p>

      {/* options */}
      <div className="space-y-2">
        {q.options.map((opt, i) => (
          <button key={i} onClick={() => choose(i)} className={optionClass(i)}>
            <span className="flex items-start gap-2">
              <span className="font-bold text-xs mt-0.5 opacity-60">{String.fromCharCode(65 + i)}.</span>
              {opt}
            </span>
          </button>
        ))}
      </div>

      {/* explanation (revealed) */}
      {revealed && (
        <div className={`rounded-xl p-4 text-sm ${selected === q.answer ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300'}`}>
          <p className="font-semibold mb-1">
            {selected === q.answer ? '✓ Correct!' : '✗ Not quite.'}
          </p>
          <p className="leading-relaxed">{q.explanation}</p>
        </div>
      )}

      {/* action buttons */}
      <div className="flex gap-3">
        {!revealed ? (
          <button
            onClick={handleCheck}
            disabled={selected === null}
            className="flex-1 py-2.5 rounded-xl bg-red-700 text-white text-sm font-semibold disabled:opacity-40 hover:bg-red-800 transition-colors"
          >
            Check Answer
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="flex-1 py-2.5 rounded-xl bg-red-700 text-white text-sm font-semibold hover:bg-red-800 transition-colors"
          >
            {isLast ? 'See Results' : 'Next Question →'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── completion screen ────────────────────────────────────────────────────────

function CompletionScreen({ module, score, passed, saving, onClose, onRetake }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center max-w-md mx-auto gap-5">
      <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl ${passed ? 'bg-emerald-100 dark:bg-emerald-950/50' : 'bg-red-100 dark:bg-red-950/50'}`}>
        {passed ? '🏆' : '📖'}
      </div>
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {passed ? 'Module Complete!' : 'Keep Studying'}
        </h2>
        <p className={`text-4xl font-black mb-1 ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {score}%
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {passed
            ? `Passed! (minimum ${module.passingScore}%)`
            : `Score below ${module.passingScore}% — retake to earn credit`}
        </p>
      </div>

      {passed && (
        <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl p-4 text-sm text-emerald-800 dark:text-emerald-300 w-full text-left">
          <p className="font-semibold mb-1">✅ Training Record Created</p>
          <p className="leading-relaxed text-xs">
            A Continuing Education record for <strong>{module.title}</strong> ({module.creditHours} CE hr{module.creditHours !== 1 ? 's' : ''}) has been added to your Training Log and counts toward your LOSAP hours.
          </p>
        </div>
      )}

      {saving && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Saving record…
        </div>
      )}

      <div className="flex gap-3 w-full">
        {!passed && (
          <button onClick={onRetake} className="flex-1 py-2.5 rounded-xl bg-red-700 text-white text-sm font-semibold hover:bg-red-800">
            Retake Module
          </button>
        )}
        <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${passed ? 'bg-emerald-700 text-white hover:bg-emerald-800 border-transparent' : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
          {passed ? 'Done' : 'Exit'}
        </button>
      </div>
    </div>
  );
}

// ─── main player ─────────────────────────────────────────────────────────────

export default function ModulePlayer({ module, onClose, onCompleted }) {
  const TOTAL_SLIDES = module.slides.length;

  const [phase, setPhase]       = useState('slides');   // 'slides' | 'quiz' | 'done'
  const [slideIdx, setSlideIdx] = useState(0);
  const [score, setScore]       = useState(null);
  const [passed, setPassed]     = useState(false);
  const [saving, setSaving]     = useState(false);

  // AI Q&A mini-panel
  const [qaOpen, setQaOpen]     = useState(false);
  const [qaInput, setQaInput]   = useState('');
  const [qaMessages, setQaMessages] = useState([]);
  const [qaLoading, setQaLoading]   = useState(false);
  const qaEndRef = useRef(null);

  useEffect(() => {
    if (qaOpen) qaEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [qaMessages, qaOpen]);

  async function handleQuizComplete(finalScore, _answers) {
    const didPass = finalScore >= module.passingScore;
    setScore(finalScore);
    setPassed(didPass);
    setPhase('done');

    setSaving(true);
    try {
      await api.post(`/api/modules/${module.id}/complete`, {
        score: finalScore,
        passed: didPass,
        creditHours: module.creditHours,
        moduleTitle: module.title,
      });
      if (didPass && onCompleted) onCompleted();
    } catch (err) {
      console.warn('Could not save module completion:', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendQaMessage() {
    const text = qaInput.trim();
    if (!text) return;
    setQaInput('');
    const userMsg = { role: 'user', content: text };
    const hist = [...qaMessages, userMsg];
    setQaMessages(hist);
    setQaLoading(true);

    try {
      const res = await api.post('/api/assistant', {
        messages: hist,
        context: `module="${module.title}" slide="${module.slides[phase === 'slides' ? slideIdx : 0]?.title || ''}"`,
      });
      setQaMessages([...hist, { role: 'assistant', content: res.reply || res.error || 'No response.' }]);
    } catch {
      setQaMessages([...hist, { role: 'assistant', content: 'Could not reach the assistant. Check your API key in Settings.' }]);
    } finally {
      setQaLoading(false);
    }
  }

  const progress = phase === 'slides'
    ? ((slideIdx + 1) / (TOTAL_SLIDES + 1)) * 100
    : phase === 'quiz' ? 85 : 100;

  return (
    <div className="fixed inset-0 sm:left-56 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] overflow-hidden">

        {/* ── header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl">{module.icon}</span>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{module.title}</p>
              <p className="text-xs text-gray-400">
                {phase === 'slides' && `Slide ${slideIdx + 1} of ${TOTAL_SLIDES}`}
                {phase === 'quiz'   && 'Knowledge Check'}
                {phase === 'done'   && 'Complete'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setQaOpen(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${qaOpen ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300'}`}
              title="Ask the AI assistant a question about this content"
            >
              <MessageSquare size={13} /> Ask AI
            </button>
            <button onClick={onClose} aria-label="Close module player" className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── progress bar ── */}
        <div className="h-1 bg-gray-100 dark:bg-gray-800 flex-shrink-0">
          <div
            className="h-1 bg-red-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* ── body ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* main content */}
          <div className="flex-1 overflow-y-auto">
            {phase === 'slides' && (
              <SlideRenderer slide={module.slides[slideIdx]} />
            )}
            {phase === 'quiz' && (
              <Quiz module={module} onComplete={handleQuizComplete} />
            )}
            {phase === 'done' && (
              <CompletionScreen
                module={module}
                score={score}
                passed={passed}
                saving={saving}
                onClose={onClose}
                onRetake={() => { setPhase('slides'); setSlideIdx(0); setScore(null); }}
              />
            )}
          </div>

          {/* AI Q&A panel */}
          {qaOpen && (
            <div className="w-72 border-l border-gray-100 dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-950 flex-shrink-0">
              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Ask AI about this content</p>
                <p className="text-xs text-gray-400">Clarify anything from the slides or quiz</p>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
                {qaMessages.length === 0 && (
                  <p className="text-xs text-gray-400 text-center pt-4">
                    Ask a question about {module.title}
                  </p>
                )}
                {qaMessages.map((m, i) => (
                  <div key={i} className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-red-700 text-white ml-4'
                      : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 mr-4'
                  }`}>
                    {m.content}
                  </div>
                ))}
                {qaLoading && (
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 mr-4">
                    <Loader2 size={12} className="animate-spin text-gray-400" />
                  </div>
                )}
                <div ref={qaEndRef} />
              </div>

              <div className="p-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex gap-1">
                <input
                  type="text"
                  value={qaInput}
                  onChange={e => setQaInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendQaMessage()}
                  placeholder="Ask a question…"
                  aria-label="Ask the AI assistant a question"
                  className="flex-1 text-xs px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-300 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  onClick={sendQaMessage}
                  disabled={!qaInput.trim() || qaLoading}
                  aria-label="Send question"
                  className="p-2 rounded-lg bg-red-700 text-white disabled:opacity-40 hover:bg-red-800"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── footer nav (slides only) ── */}
        {phase === 'slides' && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 rounded-b-2xl flex-shrink-0">
            <button
              onClick={() => setSlideIdx(i => Math.max(0, i - 1))}
              disabled={slideIdx === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronLeft size={16} /> Back
            </button>

            {/* dot indicators */}
            <div className="flex gap-1.5 flex-wrap justify-center max-w-xs">
              {module.slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSlideIdx(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className={`rounded-full transition-all ${
                    i === slideIdx ? 'w-5 h-2 bg-red-600' : 'w-2 h-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                  }`}
                />
              ))}
            </div>

            {slideIdx < TOTAL_SLIDES - 1 ? (
              <button
                onClick={() => setSlideIdx(i => i + 1)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-800 transition-colors"
              >
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={() => setPhase('quiz')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-800 transition-colors"
              >
                Take Quiz <BookOpen size={16} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
