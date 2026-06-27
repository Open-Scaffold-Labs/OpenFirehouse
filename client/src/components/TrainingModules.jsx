/**
 * TrainingModules.jsx — On-demand training module catalog (Phase 4)
 *
 * Shows all available modules with category filtering, completion status,
 * estimated time, CE credit hours, and a launch button.
 */

import { useState, useEffect } from 'react';
import { BookOpen, Clock, Award, CheckCircle2, Play, RotateCcw, Loader2, Lock } from 'lucide-react';
import { MODULES, MODULE_CATEGORIES } from '../data/trainingModules';
import { api } from '../utils/api';

// ─── badge helpers ────────────────────────────────────────────────────────────

function CategoryBadge({ category }) {
  const colors = {
    Reporting:            'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300',
    Compliance:           'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
    'Command & Control':  'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
    'Hazardous Materials':'bg-yellow-100 dark:bg-yellow-950/50 text-yellow-800 dark:text-yellow-300',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors[category] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
      {category}
    </span>
  );
}

function CompletionBadge({ completion }) {
  if (!completion) return null;
  if (completion.passed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 size={11} /> Passed {completion.score}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">
      Needs Retry — {completion.score}%
    </span>
  );
}

// ─── module card ──────────────────────────────────────────────────────────────

function ModuleCard({ module, completion, onLaunch }) {
  const passed = completion?.passed;
  const tried  = !!completion;

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border shadow-sm flex flex-col transition-shadow hover:shadow-md ${
      passed ? 'border-emerald-200 dark:border-emerald-900' : 'border-gray-200 dark:border-gray-700'
    }`}>
      {/* top accent bar */}
      <div className={`h-1.5 rounded-t-xl ${passed ? 'bg-emerald-400' : 'bg-red-600'}`} />

      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* icon + category */}
        <div className="flex items-center justify-between">
          <span className="text-2xl">{module.icon}</span>
          <CategoryBadge category={module.category} />
        </div>

        {/* title + description */}
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight">{module.title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{module.description}</p>
        </div>

        {/* meta row */}
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Clock size={12} /> ~{module.estimatedMinutes} min
          </span>
          <span className="flex items-center gap-1">
            <Award size={12} /> {module.creditHours} CE hr{module.creditHours !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <BookOpen size={12} /> {module.slides.length} slides
          </span>
        </div>

        {/* passing score */}
        <p className="text-xs text-gray-400">Pass score: {module.passingScore}% · {module.quiz.length} quiz questions</p>

        {/* completion badge */}
        {tried && (
          <div className="mt-auto">
            <CompletionBadge completion={completion} />
            {passed && (
              <p className="text-xs text-gray-400 mt-1">
                Completed {new Date(completion.completed_at).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* action button */}
      <div className="px-5 pb-5">
        <button
          onClick={() => onLaunch(module)}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            passed
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-900'
              : 'bg-red-700 text-white hover:bg-red-800'
          }`}
        >
          {passed ? (
            <><RotateCcw size={15} /> Retake</>
          ) : tried ? (
            <><RotateCcw size={15} /> Retry</>
          ) : (
            <><Play size={15} /> Start Module</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function TrainingModules({ onLaunch }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [completions, setCompletions]       = useState([]);
  const [loading, setLoading]               = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await api.get('/api/modules/completions');
        const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        setCompletions(arr);
      } catch {
        // ignore — completions just show as blank
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // map moduleId → completion record
  const completionMap = {};
  completions.forEach(c => { completionMap[c.module_id] = c; });

  const visible = activeCategory === 'All'
    ? MODULES
    : MODULES.filter(m => m.category === activeCategory);

  const passedCount = completions.filter(c => c.passed).length;
  const totalHours  = completions
    .filter(c => c.passed)
    .reduce((sum, c) => {
      const mod = MODULES.find(m => m.id === c.module_id);
      return sum + (mod ? mod.creditHours : 0);
    }, 0);

  return (
    <div className="space-y-6">

      {/* ── summary strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Available Modules', value: MODULES.length,    color: 'bg-indigo-500' },
          { label: 'Completed',         value: passedCount,        color: 'bg-emerald-500' },
          { label: 'CE Hours Earned',   value: totalHours.toFixed(1), color: 'bg-blue-500' },
          { label: 'Categories',        value: MODULE_CATEGORIES.length - 1, color: 'bg-orange-500' },
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
        {MODULE_CATEGORIES.map(cat => (
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
                {MODULES.filter(m => m.category === cat).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── module grid ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-7 w-7 animate-spin mr-2" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map(module => (
            <ModuleCard
              key={module.id}
              module={module}
              completion={completionMap[module.id]}
              onLaunch={onLaunch}
            />
          ))}
        </div>
      )}

      {/* ── info footer ── */}
      <div className="rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 p-4 text-sm text-blue-700 dark:text-blue-300">
        <p className="font-semibold mb-1">About CE Credits</p>
        <p className="text-xs leading-relaxed text-blue-600 dark:text-blue-400">
          Passing a module automatically creates a Continuing Education training record in your Training Log.
          CE hours from modules count toward your annual LOSAP point total (up to 20 pts/year from training).
          Records are attributed to your account and visible to officers and chiefs.
        </p>
      </div>
    </div>
  );
}
