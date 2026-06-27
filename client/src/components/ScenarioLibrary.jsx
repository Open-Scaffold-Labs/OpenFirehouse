/**
 * ScenarioLibrary.jsx — Scenario-Based Learning catalog (Phase 5)
 *
 * Shows all available scenarios with category filtering, completion status,
 * difficulty badges, estimated time, CE credit, and a Launch button.
 */

import { useState, useEffect } from 'react';
import { Target, Clock, Award, CheckCircle2, Play, RotateCcw, Loader2, Star, AlertTriangle } from 'lucide-react';
import { SCENARIOS, SCENARIO_CATEGORIES, DIFFICULTY_STYLE } from '../data/scenarioData';
import { api } from '../utils/api';

// ─── Difficulty badge ─────────────────────────────────────────────────────────

function DifficultyBadge({ difficulty }) {
  const style = DIFFICULTY_STYLE[difficulty] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      {difficulty}
    </span>
  );
}

// ─── Score / grade badge ──────────────────────────────────────────────────────

function GradeBadge({ completion }) {
  if (!completion) return null;
  const pct = completion.score;
  if (pct >= 80) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
        <Star size={11} /> Excellent — {pct}%
      </span>
    );
  }
  if (pct >= 60) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
        <CheckCircle2 size={11} /> Competent — {pct}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
      <AlertTriangle size={11} /> Needs Review — {pct}%
    </span>
  );
}

// ─── Scenario card ────────────────────────────────────────────────────────────

function ScenarioCard({ scenario, completion, onLaunch }) {
  const passed   = completion && completion.score >= scenario.passingScore;
  const attempted = !!completion;

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border shadow-sm flex flex-col transition-shadow hover:shadow-md ${
      passed ? 'border-emerald-200 dark:border-emerald-900' : 'border-gray-200 dark:border-gray-700'
    }`}>
      {/* top accent bar */}
      <div className={`h-1.5 rounded-t-xl ${passed ? 'bg-emerald-400' : 'bg-red-600'}`} />

      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* icon + difficulty */}
        <div className="flex items-center justify-between">
          <span className="text-2xl">{scenario.icon}</span>
          <DifficultyBadge difficulty={scenario.difficulty} />
        </div>

        {/* title + description */}
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight">{scenario.title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{scenario.description}</p>
        </div>

        {/* category pill */}
        <div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${scenario.badgeColor}`}>
            {scenario.category}
          </span>
        </div>

        {/* meta row */}
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Clock size={12} /> ~{scenario.estimatedMinutes} min
          </span>
          <span className="flex items-center gap-1">
            <Award size={12} /> {scenario.creditHours} CE hr{scenario.creditHours !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Target size={12} /> {scenario.scenes.length} scenes
          </span>
        </div>

        {/* passing score */}
        <p className="text-xs text-gray-400">Pass score: {scenario.passingScore}%</p>

        {/* completion badge */}
        {attempted && (
          <div className="mt-auto">
            <GradeBadge completion={completion} />
            {passed && (
              <p className="text-xs text-gray-400 mt-1">
                Completed {new Date(completion.completed_at).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* launch button */}
      <div className="px-5 pb-5">
        <button
          onClick={() => onLaunch(scenario)}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            passed
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-900'
              : 'bg-red-700 text-white hover:bg-red-800'
          }`}
        >
          {passed ? (
            <><RotateCcw size={15} /> Run Again</>
          ) : attempted ? (
            <><RotateCcw size={15} /> Retry</>
          ) : (
            <><Play size={15} /> Start Scenario</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScenarioLibrary({ onLaunch }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [completions, setCompletions]       = useState([]);
  const [loading, setLoading]               = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await api.get('/api/scenarios/completions');
        const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        setCompletions(arr);
      } catch {
        // ignore — completions just show blank
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // map scenarioId → completion record
  const completionMap = {};
  completions.forEach(c => { completionMap[c.scenario_id] = c; });

  const visible = activeCategory === 'All'
    ? SCENARIOS
    : SCENARIOS.filter(s => s.category === activeCategory);

  const passedCount  = completions.filter(c => c.score >= 60).length;
  const excellentCount = completions.filter(c => c.score >= 80).length;
  const totalHours   = completions
    .filter(c => c.score >= 60)
    .reduce((sum, c) => {
      const sc = SCENARIOS.find(s => s.id === c.scenario_id);
      return sum + (sc ? sc.creditHours : 0);
    }, 0);

  return (
    <div className="space-y-6">

      {/* ── summary strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Available Scenarios', value: SCENARIOS.length,      color: 'bg-red-500' },
          { label: 'Completed',           value: passedCount,            color: 'bg-emerald-500' },
          { label: 'Excellent Ratings',   value: excellentCount,         color: 'bg-amber-500' },
          { label: 'CE Hours Earned',     value: totalHours.toFixed(1),  color: 'bg-blue-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3 shadow-sm">
            <div className={`w-2.5 h-10 rounded-full ${color}`} />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── category filter ── */}
      <div className="flex gap-2 flex-wrap">
        {SCENARIO_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              activeCategory === cat
                ? 'bg-red-700 text-white border-red-700'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300 hover:text-red-700'
            }`}
          >
            {cat}
            {cat !== 'All' && (
              <span className="ml-1.5 opacity-70">
                {SCENARIOS.filter(s => s.category === cat).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── scenario grid ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-7 w-7 animate-spin mr-2" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map(scenario => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              completion={completionMap[scenario.id]}
              onLaunch={onLaunch}
            />
          ))}
        </div>
      )}

      {/* ── grading guide ── */}
      <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
        <p className="font-semibold mb-2">Scenario Grading Scale</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
              <Star size={10} /> Excellent
            </span>
            <span className="text-red-600 dark:text-red-400">≥ 80% — Outstanding command decisions</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
              <CheckCircle2 size={10} /> Competent
            </span>
            <span className="text-red-600 dark:text-red-400">60–79% — Solid fundamentals, CE credit earned</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
              <AlertTriangle size={10} /> Needs Review
            </span>
            <span className="text-red-600 dark:text-red-400">&lt; 60% — Review materials and retry</span>
          </div>
        </div>
        <p className="text-xs mt-3 text-red-600 dark:text-red-400">
          Completing any scenario (score ≥ 60%) automatically logs 1.0 CE hour toward your annual LOSAP points.
          AI-generated debrief feedback is provided at the end of every run.
        </p>
      </div>
    </div>
  );
}
