/**
 * ExamPlayer.jsx — Full-screen timed exam-taking experience for firefighters
 *
 * Flow:
 *  1. Start screen     — exam title, question count, time limit, passing score
 *  2. Question view    — one question at a time, multiple choice, timer, progress
 *     - Immediate feedback: correct = green, wrong = red + correct highlighted
 *  3. Review screen    — summary before submit, jump-back to change answers
 *  4. Results screen   — score, pass/fail, full answer review
 *  5. Auto-submit      — when timer runs out (if time_limit > 0)
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  X, Clock, AlertTriangle, CheckCircle2, XCircle, Flag,
  ChevronLeft, ChevronRight, Award, RotateCcw,
} from 'lucide-react';

// ─── Shuffle questions (Fisher-Yates) ──────────────────────────────────────

function shuffleQuestions(questions) {
  const arr = [...questions];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const CHOICE_LABELS = ['A', 'B', 'C', 'D'];

// ─── Format time (mm:ss) ──────────────────────────────────────────────────

function formatTime(seconds) {
  if (!seconds && seconds !== 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ─── Choice button with correct/wrong feedback ────────────────────────────

function ChoiceButton({ option, index, selected, correctAnswer, revealed, disabled, onSelect }) {
  const isSelected = selected === index;
  const isCorrect = index === correctAnswer;

  let cls = 'w-full text-left px-4 py-4 rounded-lg border-2 text-sm font-medium transition-all ';
  let icon = null;

  if (revealed) {
    // After answer is locked in — show feedback
    if (isCorrect) {
      // This is the correct answer — always green
      cls += 'border-green-500 bg-green-50 dark:bg-green-950/50 text-green-900 dark:text-green-200 cursor-default';
      icon = <CheckCircle2 size={18} className="text-green-600 dark:text-green-400 flex-shrink-0" />;
    } else if (isSelected && !isCorrect) {
      // User picked this wrong answer — red
      cls += 'border-red-500 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200 cursor-default';
      icon = <XCircle size={18} className="text-red-600 dark:text-red-400 flex-shrink-0" />;
    } else {
      // Unselected wrong answer — dim
      cls += 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 cursor-default opacity-60';
    }
  } else if (disabled) {
    cls += isSelected
      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 cursor-default'
      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-300 cursor-default';
  } else {
    cls += isSelected
      ? 'border-blue-600 bg-blue-100 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 cursor-pointer'
      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 hover:border-blue-300 dark:hover:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer';
  }

  return (
    <button
      onClick={() => !disabled && !revealed && onSelect(index)}
      disabled={disabled || revealed}
      className={cls}
    >
      <div className="flex items-center gap-3">
        <span className={`font-bold text-xs w-5 flex-shrink-0 uppercase ${
          revealed && isCorrect ? 'text-green-600 dark:text-green-400' :
          revealed && isSelected && !isCorrect ? 'text-red-600 dark:text-red-400' :
          'text-gray-500 dark:text-gray-400'
        }`}>
          {CHOICE_LABELS[index]}
        </span>
        <span className="flex-1">{option}</span>
        {icon}
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export default function ExamPlayer({ exam, onSubmit, onCancel }) {
  // Phase: 'start' | 'exam' | 'review' | 'results'
  const [phase, setPhase] = useState('start');
  const [currentQ, setCurrentQ] = useState(0);

  // Answers: [{ questionId, selected: index_or_null }]
  const [answers, setAnswers] = useState([]);
  // Track which questions have been "locked in" (answer revealed)
  const [revealed, setRevealed] = useState(new Set());
  const [flagged, setFlagged] = useState(new Set());

  // Timing
  const timeLimit = exam.time_limit ?? exam.timeLimit ?? 0;
  const passingScore = exam.passing_score ?? exam.passingScore ?? 70;
  const [secondsRemaining, setSecondsRemaining] = useState(
    timeLimit > 0 ? timeLimit * 60 : 0
  );
  const [startedAt, setStartedAt] = useState(null);
  const [autoSubmitting, setAutoSubmitting] = useState(false);

  // Results
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(null);

  // Randomize questions on mount
  const questions = typeof exam.questions === 'string' ? JSON.parse(exam.questions) : (exam.questions || []);
  const randomizedQuestions = useMemo(
    () => (exam.randomize ? shuffleQuestions(questions) : questions),
    [exam]
  );

  // Initialize answers once
  useEffect(() => {
    setAnswers(
      randomizedQuestions.map(q => ({
        questionId: q.id,
        selected: null,
      }))
    );
  }, [randomizedQuestions]);

  // Timer effect
  useEffect(() => {
    if (phase !== 'exam' || !startedAt) return;
    if (timeLimit <= 0) return; // No timer

    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        const next = prev - 1;
        if (next <= 0 && !autoSubmitting && !submitted) {
          setAutoSubmitting(true);
          return 0;
        }
        return Math.max(0, next);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, startedAt, timeLimit, autoSubmitting, submitted]);

  // Auto-submit effect
  useEffect(() => {
    if (!autoSubmitting || submitted) return;
    handleSubmit();
  }, [autoSubmitting]);

  // Select an answer and immediately reveal feedback
  function selectAnswer(qIndex, optionIndex) {
    const newAnswers = [...answers];
    newAnswers[qIndex] = { ...newAnswers[qIndex], selected: optionIndex };
    setAnswers(newAnswers);

    // Lock in and reveal correct/wrong
    const newRevealed = new Set(revealed);
    newRevealed.add(qIndex);
    setRevealed(newRevealed);
  }

  // Compute score
  function computeScore() {
    let correct = 0;
    randomizedQuestions.forEach((q, i) => {
      if (answers[i]?.selected === q.correctAnswer) correct++;
    });
    const pct = randomizedQuestions.length > 0
      ? Math.round((correct / randomizedQuestions.length) * 100)
      : 0;
    return { correct, total: randomizedQuestions.length, pct, passed: pct >= passingScore };
  }

  async function handleSubmit() {
    const result = computeScore();
    setScore(result);
    setSubmitted(true);
    setPhase('results');

    // Reveal all answers
    const allRevealed = new Set();
    randomizedQuestions.forEach((_, i) => allRevealed.add(i));
    setRevealed(allRevealed);

    // Try to send to server (will fail gracefully in demo)
    try {
      const timeSpent = Math.round((Date.now() - startedAt) / 1000);
      await onSubmit({
        answers,
        started_at: startedAt,
        time_spent: timeSpent,
      });
    } catch { /* demo mode — no server */ }
  }

  // ─ Start screen ─────────────────────────────────────────────────────────

  if (phase === 'start') {
    return (
      <div className="fixed inset-0 sm:left-56 z-50 bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-gray-700">
          {/* Header */}
          <div className="bg-gray-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <h2 className="text-white font-bold text-lg">Begin Exam</h2>
            <button onClick={onCancel} aria-label="Close exam" className="text-gray-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 p-6 space-y-5">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-white">{exam.title}</h1>
              <p className="text-sm text-gray-400">Firefighter Certification Exam</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                <p className="text-xs text-gray-400 font-semibold mb-1 uppercase">Questions</p>
                <p className="text-2xl font-bold text-white">{questions.length}</p>
              </div>
              <div className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                <p className="text-xs text-gray-400 font-semibold mb-1 uppercase">Time Limit</p>
                <p className="text-2xl font-bold text-white">
                  {timeLimit > 0 ? `${timeLimit} min` : 'Unlimited'}
                </p>
              </div>
              <div className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                <p className="text-xs text-gray-400 font-semibold mb-1 uppercase">Passing Score</p>
                <p className="text-2xl font-bold text-white">{passingScore}%</p>
              </div>
              <div className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                <p className="text-xs text-gray-400 font-semibold mb-1 uppercase">Format</p>
                <p className="text-2xl font-bold text-white">Multiple Choice</p>
              </div>
            </div>

            <div className="bg-blue-900/40 border border-blue-700 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-blue-100">Exam Instructions</p>
              <ul className="text-xs text-blue-100 space-y-1">
                <li className="flex items-start gap-2">
                  <span className="text-blue-300 font-bold mt-0.5">1.</span>
                  <span>Select your answer for each question</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-300 font-bold mt-0.5">2.</span>
                  <span>You'll see immediately if your answer is correct or wrong</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-300 font-bold mt-0.5">3.</span>
                  <span>Wrong answers will highlight the correct answer in green</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-300 font-bold mt-0.5">4.</span>
                  <span>
                    {timeLimit > 0
                      ? 'The exam will auto-submit when time runs out'
                      : 'Take as much time as you need'}
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-700 flex-shrink-0 space-y-3">
            <button
              onClick={() => {
                setPhase('exam');
                setStartedAt(Date.now());
              }}
              className="w-full py-3 bg-red-700 text-white rounded-lg font-bold hover:bg-red-800 transition-colors"
            >
              Begin Exam
            </button>
            <button
              onClick={onCancel}
              className="w-full py-2 border border-gray-600 text-gray-300 dark:text-gray-600 rounded-lg font-semibold hover:border-gray-500 hover:text-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─ Exam screen ──────────────────────────────────────────────────────────

  if (phase === 'exam') {
    const question = randomizedQuestions[currentQ];
    const answer = answers[currentQ];
    const isRevealed = revealed.has(currentQ);
    const isFlagged = flagged.has(currentQ);
    const timeWarning = timeLimit > 0 && secondsRemaining > 0 && secondsRemaining <= 5 * 60;
    const timeUp = timeLimit > 0 && secondsRemaining === 0;

    // Check if answer was correct (for feedback message)
    const wasCorrect = isRevealed && answer?.selected === question.correctAnswer;

    return (
      <div className="fixed inset-0 sm:left-56 z-50 bg-gray-900 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="text-sm text-gray-400">
            Question <span className="font-bold text-white">{currentQ + 1}</span> of{' '}
            <span className="font-bold text-white">{randomizedQuestions.length}</span>
          </div>
          {timeLimit > 0 && (
            <div
              className={`text-lg font-bold flex items-center gap-1 ${
                timeWarning ? 'text-red-500 animate-pulse' : 'text-white'
              }`}
            >
              <Clock size={18} />
              {formatTime(secondsRemaining)}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-gray-800 flex-shrink-0">
          <div
            className="h-full bg-red-700 transition-all duration-300"
            style={{ width: `${((currentQ + 1) / randomizedQuestions.length) * 100}%` }}
          />
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Time up warning */}
          {timeUp && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 flex items-start gap-3 sticky top-0">
              <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-100">
                <p className="font-semibold">Time's up!</p>
                <p className="text-xs mt-1">Your exam is being submitted automatically...</p>
              </div>
            </div>
          )}

          {/* Question text */}
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">
              Question {currentQ + 1}
            </p>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
              <p className="text-base leading-relaxed text-gray-100">{question.text}</p>
            </div>
          </div>

          {/* Options */}
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">
              {isRevealed ? 'Result' : 'Select Your Answer'}
            </p>
            <div className="space-y-3">
              {question.options.map((option, idx) => (
                <ChoiceButton
                  key={idx}
                  option={option}
                  index={idx}
                  selected={answer?.selected}
                  correctAnswer={question.correctAnswer}
                  revealed={isRevealed}
                  disabled={timeUp || autoSubmitting}
                  onSelect={idx => selectAnswer(currentQ, idx)}
                />
              ))}
            </div>
          </div>

          {/* Feedback message after answering */}
          {isRevealed && (
            <div className={`rounded-lg p-4 flex items-start gap-3 ${
              wasCorrect
                ? 'bg-green-900/40 border border-green-700'
                : 'bg-red-900/40 border border-red-700'
            }`}>
              {wasCorrect ? (
                <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-semibold ${wasCorrect ? 'text-green-100' : 'text-red-100'}`}>
                  {wasCorrect ? 'Correct!' : 'Incorrect'}
                </p>
                {!wasCorrect && (
                  <p className="text-xs text-red-200 mt-1">
                    The correct answer is <span className="font-bold text-green-300">{CHOICE_LABELS[question.correctAnswer]}: {question.options[question.correctAnswer]}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="bg-gray-800 border-t border-gray-700 px-4 py-3 flex-shrink-0 space-y-3">
          {/* Flag + Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const newFlagged = new Set(flagged);
                if (isFlagged) newFlagged.delete(currentQ);
                else newFlagged.add(currentQ);
                setFlagged(newFlagged);
              }}
              disabled={timeUp || autoSubmitting}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isFlagged
                  ? 'bg-amber-900/50 text-amber-300 border border-amber-700'
                  : 'bg-gray-700 text-gray-300 dark:text-gray-600 hover:text-gray-100 border border-gray-600'
              }`}
            >
              <Flag size={15} />
              {isFlagged ? 'Flagged' : 'Flag'}
            </button>

            <div className="flex-1" />

            {/* Prev button */}
            <button
              onClick={() => setCurrentQ(currentQ - 1)}
              disabled={currentQ === 0 || timeUp || autoSubmitting}
              aria-label="Previous question"
              className="p-2 bg-gray-700 text-gray-300 dark:text-gray-600 rounded-lg hover:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={18} />
            </button>

            {/* Next or Submit */}
            {currentQ < randomizedQuestions.length - 1 ? (
              <button
                onClick={() => setCurrentQ(currentQ + 1)}
                disabled={timeUp || autoSubmitting}
                className="px-4 py-2 bg-gray-700 text-gray-300 dark:text-gray-600 rounded-lg hover:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              >
                Next <ChevronRight size={18} />
              </button>
            ) : (
              <button
                onClick={() => setPhase('review')}
                disabled={timeUp || autoSubmitting}
                className="px-4 py-2 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                Review & Submit
              </button>
            )}
          </div>

          {/* Question navigator dots */}
          <div className="flex justify-center gap-1.5 flex-wrap">
            {randomizedQuestions.map((q, idx) => {
              const ans = answers[idx];
              const isAnswered = ans?.selected !== null && ans?.selected !== undefined;
              const isRev = revealed.has(idx);
              const wasRight = isRev && ans?.selected === q.correctAnswer;
              const isFlag = flagged.has(idx);

              let dotColor;
              if (isRev && wasRight) dotColor = 'bg-green-600 text-white';
              else if (isRev && !wasRight) dotColor = 'bg-red-600 text-white';
              else if (isFlag) dotColor = 'bg-amber-600 text-white';
              else if (isAnswered) dotColor = 'bg-blue-600 text-white';
              else dotColor = 'bg-gray-700 text-gray-400';

              return (
                <button
                  key={idx}
                  onClick={() => setCurrentQ(idx)}
                  disabled={timeUp || autoSubmitting}
                  className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                    idx === currentQ ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800' : ''
                  } ${dotColor}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ─ Review screen (before submit) ────────────────────────────────────────

  if (phase === 'review' && !submitted) {
    const timeSpent = Math.round((Date.now() - startedAt) / 1000);
    const answeredCount = answers.filter(a => a.selected !== null && a.selected !== undefined).length;
    const currentResult = computeScore();

    return (
      <div className="fixed inset-0 sm:left-56 z-50 bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-700">
          <div className="bg-gray-900 px-6 py-4 flex items-center justify-between flex-shrink-0 border-b border-gray-700">
            <h2 className="text-white font-bold text-lg">Review & Submit</h2>
            <button onClick={() => setPhase('exam')} aria-label="Back to exam" className="text-gray-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-6 space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-400 font-semibold uppercase">Answered</p>
                <p className="text-2xl font-bold text-white">{answeredCount} / {randomizedQuestions.length}</p>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-400 font-semibold uppercase">Current Score</p>
                <p className={`text-2xl font-bold ${currentResult.passed ? 'text-green-400' : 'text-red-400'}`}>
                  {currentResult.pct}%
                </p>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-400 font-semibold uppercase">Correct</p>
                <p className="text-2xl font-bold text-green-400">{currentResult.correct}</p>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-400 font-semibold uppercase">Time Spent</p>
                <p className="text-2xl font-bold text-white">{formatTime(timeSpent)}</p>
              </div>
            </div>

            {/* Question list */}
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Questions</p>
              {randomizedQuestions.map((q, idx) => {
                const ans = answers[idx];
                const isAnswered = ans?.selected !== null && ans?.selected !== undefined;
                const isRev = revealed.has(idx);
                const wasRight = isRev && ans?.selected === q.correctAnswer;
                const isFlag = flagged.has(idx);

                return (
                  <button
                    key={idx}
                    onClick={() => { setPhase('exam'); setCurrentQ(idx); }}
                    className="w-full flex items-center gap-3 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 transition-colors text-left"
                  >
                    <div className="flex-shrink-0">
                      {isRev && wasRight ? (
                        <CheckCircle2 size={16} className="text-green-400" />
                      ) : isRev && !wasRight ? (
                        <XCircle size={16} className="text-red-400" />
                      ) : isFlag ? (
                        <Flag size={16} className="text-amber-400" />
                      ) : isAnswered ? (
                        <CheckCircle2 size={16} className="text-blue-400" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-100">Q{idx + 1}</p>
                      <p className="text-xs text-gray-400 truncate">{q.text}</p>
                    </div>
                    <span className={`text-xs font-semibold ${
                      isRev && wasRight ? 'text-green-400' :
                      isRev && !wasRight ? 'text-red-400' :
                      isFlag ? 'text-amber-400' :
                      isAnswered ? 'text-blue-400' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {isRev && wasRight && 'Correct'}
                      {isRev && !wasRight && 'Wrong'}
                      {!isRev && isFlag && 'Flagged'}
                      {!isRev && isAnswered && !isFlag && 'Answered'}
                      {!isAnswered && !isFlag && 'Skipped'}
                    </span>
                  </button>
                );
              })}
            </div>

            {answeredCount < randomizedQuestions.length && (
              <div className="bg-amber-900/40 border border-amber-700 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-100">
                  <p className="font-semibold">{randomizedQuestions.length - answeredCount} question(s) not answered</p>
                  <p className="text-amber-200 mt-1">Unanswered questions count as wrong. Go back to complete them.</p>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-700 flex-shrink-0 space-y-3">
            <button
              onClick={() => setPhase('exam')}
              className="w-full py-2.5 border border-gray-600 text-gray-300 dark:text-gray-600 rounded-lg font-semibold hover:border-gray-500 hover:text-gray-100 transition-colors"
            >
              Back to Exam
            </button>
            <button
              onClick={handleSubmit}
              className="w-full py-3 bg-red-700 text-white rounded-lg font-bold hover:bg-red-800 transition-colors"
            >
              Submit Exam
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─ Results screen (after submit) ────────────────────────────────────────

  if (phase === 'results' && submitted && score) {
    return (
      <div className="fixed inset-0 sm:left-56 z-50 bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-700">
          {/* Header */}
          <div className={`px-6 py-5 flex-shrink-0 text-center ${
            score.passed ? 'bg-green-800' : 'bg-red-800'
          }`}>
            <div className="flex justify-center mb-3">
              {score.passed ? (
                <Award size={48} className="text-green-200" />
              ) : (
                <XCircle size={48} className="text-red-200" />
              )}
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">
              {score.passed ? 'PASSED!' : 'NOT PASSED'}
            </h2>
            <p className="text-sm text-white/80">
              {exam.title}
            </p>
          </div>

          <div className="overflow-y-auto flex-1 p-6 space-y-5">
            {/* Score display */}
            <div className="text-center py-4">
              <p className={`text-6xl font-black ${score.passed ? 'text-green-400' : 'text-red-400'}`}>
                {score.pct}%
              </p>
              <p className="text-sm text-gray-400 mt-2">
                {score.correct} of {score.total} correct &bull; Passing: {passingScore}%
              </p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-400">{score.correct}</p>
                <p className="text-xs text-green-300 font-medium">Correct</p>
              </div>
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">{score.total - score.correct}</p>
                <p className="text-xs text-red-300 font-medium">Wrong</p>
              </div>
              <div className="bg-gray-700 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-white">{score.total}</p>
                <p className="text-xs text-gray-400 font-medium">Total</p>
              </div>
            </div>

            {/* Full answer review */}
            <div className="space-y-3">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Answer Review</p>
              {randomizedQuestions.map((q, idx) => {
                const ans = answers[idx];
                const userAnswer = ans?.selected;
                const isCorrect = userAnswer === q.correctAnswer;

                return (
                  <div key={idx} className={`rounded-lg border p-4 ${
                    isCorrect
                      ? 'bg-green-900/20 border-green-700'
                      : 'bg-red-900/20 border-red-700'
                  }`}>
                    <div className="flex items-start gap-2 mb-2">
                      {isCorrect ? (
                        <CheckCircle2 size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                      )}
                      <p className="text-sm text-gray-100 font-medium">
                        <span className="text-gray-400">Q{idx + 1}.</span> {q.text}
                      </p>
                    </div>

                    {isCorrect ? (
                      <p className="text-xs text-green-300 ml-6">
                        Your answer: <span className="font-semibold">{CHOICE_LABELS[userAnswer]}. {q.options[userAnswer]}</span>
                      </p>
                    ) : (
                      <div className="ml-6 space-y-1">
                        <p className="text-xs text-red-300">
                          Your answer: <span className="font-semibold">
                            {userAnswer !== null && userAnswer !== undefined
                              ? `${CHOICE_LABELS[userAnswer]}. ${q.options[userAnswer]}`
                              : 'Not answered'}
                          </span>
                        </p>
                        <p className="text-xs text-green-300">
                          Correct answer: <span className="font-semibold">{CHOICE_LABELS[q.correctAnswer]}. {q.options[q.correctAnswer]}</span>
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-700 flex-shrink-0">
            <button
              onClick={onCancel}
              className="w-full py-3 bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-600 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
