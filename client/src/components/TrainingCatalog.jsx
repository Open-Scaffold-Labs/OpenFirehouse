/**
 * TrainingCatalog.jsx — Training Hub: Video courses, manual entry, CSV import
 *
 * Tabs:
 *  1. Catalog — browse/search/filter courses (built-in + department-added), play video, take quiz
 *  2. Add Course — form for officers/chiefs to create department video courses
 *  3. Log Training — manual entry for in-person drills, external courses, conferences
 *  4. Import — CSV bulk import from Vector Solutions, FireRescue1, etc.
 *
 * All data flows through the REST API → PostgreSQL.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Play, Clock, Award, BookOpen, Search, ChevronLeft, CheckCircle2,
  XCircle, RotateCcw, ArrowRight, Video, Shield, Printer,
  BarChart3, Tag, Plus, Upload, FileText, Save, Trash2,
  Edit3, Loader2, AlertTriangle, ExternalLink, Download,
} from 'lucide-react';
import { ISO_CATEGORIES, getIsoCategoryById } from '../data/trainingVideos';
import { api, getStoredUser } from '../utils/api';


// ─── sub-components ──────────────────────────────────────────────────────────

function IsoCategoryBadge({ isoCategoryId, size = 'sm' }) {
  const cat = getIsoCategoryById(isoCategoryId);
  if (!cat) return null;
  const cls = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${cls} ${cat.color}`}>
      <Shield size={size === 'sm' ? 10 : 13} /> {cat.label}
    </span>
  );
}

function LevelBadge({ level }) {
  const colors = {
    awareness:  'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300',
    operations: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
    advanced:   'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${colors[level] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
      {level}
    </span>
  );
}

// Normalize course shape from API (snake_case) to UI (camelCase)
function normalizeCourse(c) {
  if (!c) return c;
  return {
    id:              c.id,
    title:           c.title || '',
    description:     c.description || '',
    videoUrl:        c.video_url || c.videoUrl || '',
    videoType:       c.video_type || c.videoType || 'youtube',
    isoCategory:     c.iso_category || c.isoCategory || 'general-ceu',
    ceuHours:        parseFloat(c.ceu_hours ?? c.ceuHours ?? 0),
    durationMinutes: parseInt(c.duration_minutes ?? c.durationMinutes ?? 0, 10),
    level:           c.level || 'awareness',
    passingScore:    parseInt(c.passing_score ?? c.passingScore ?? 80, 10),
    instructor:      c.instructor || '',
    provider:        c.provider || '',
    tags:            (typeof c.tags === 'string' ? JSON.parse(c.tags) : c.tags) || [],
    prerequisites:   (typeof c.prerequisites === 'string' ? JSON.parse(c.prerequisites) : c.prerequisites) || [],
    quiz:            (typeof c.quiz === 'string' ? JSON.parse(c.quiz) : c.quiz) || [],
    source:          c.source || 'department',
    createdBy:       c.created_by || c.createdBy || '',
    _raw:            c,
  };
}


// ─── course card ─────────────────────────────────────────────────────────────

function CourseCard({ course, progress, onSelect, onEdit, canEdit }) {
  const passed = progress?.quiz_passed || progress?.quizPassed;
  const started = !!progress;

  return (
    <div
      onClick={() => onSelect(course)}
      className={`bg-white dark:bg-gray-900 rounded-xl border shadow-sm flex flex-col transition-all hover:shadow-md cursor-pointer ${
        passed ? 'border-emerald-200 dark:border-emerald-900' : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className={`h-1.5 rounded-t-xl ${passed ? 'bg-emerald-400' : 'bg-red-600'}`} />
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video size={18} className="text-red-600 dark:text-red-400" />
            <span className="text-xs text-gray-400 font-medium">
              {course.source === 'department' ? 'Dept Course' : 'Video Course'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <IsoCategoryBadge isoCategoryId={course.isoCategory} />
            {canEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(course); }}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"
                title="Edit course"
                aria-label="Edit course"
              >
                <Edit3 size={14} />
              </button>
            )}
          </div>
        </div>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight">{course.title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed line-clamp-2">{course.description}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
          {course.durationMinutes > 0 && <span className="flex items-center gap-1"><Clock size={12} /> {course.durationMinutes} min</span>}
          <span className="flex items-center gap-1"><Award size={12} /> {course.ceuHours} CEU</span>
          {course.quiz.length > 0 && <span className="flex items-center gap-1"><BookOpen size={12} /> {course.quiz.length} questions</span>}
          <LevelBadge level={course.level} />
        </div>
        {course.instructor && <p className="text-xs text-gray-400">{course.instructor}{course.provider ? ` · ${course.provider}` : ''}</p>}
        {started && (
          <div className="mt-auto pt-2">
            {passed ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 size={13} /> Passed — {progress.quiz_score || progress.quizScore}%
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <RotateCcw size={13} /> In Progress
              </span>
            )}
          </div>
        )}
      </div>
      <div className="px-5 pb-5">
        <button className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
          passed
            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-900'
            : 'bg-red-700 text-white hover:bg-red-800'
        }`}>
          {passed ? <><RotateCcw size={15} /> Review</> : started ? <><Play size={15} /> Continue</> : <><Play size={15} /> Start Course</>}
        </button>
      </div>
    </div>
  );
}


// ─── Course Player (video + quiz) ────────────────────────────────────────────

function CoursePlayer({ course, progress, onBack, onComplete }) {
  const [phase, setPhase] = useState(progress?.quiz_passed || progress?.quizPassed ? 'results' : 'video');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(progress?.quiz_score ?? progress?.quizScore ?? null);
  const [passed, setPassed] = useState(progress?.quiz_passed ?? progress?.quizPassed ?? false);

  const handleStartQuiz = () => { setPhase('quiz'); setCurrentQ(0); setAnswers({}); setSubmitted(false); setScore(null); };
  const handleAnswer = (qIdx, ansIdx) => { if (!submitted) setAnswers(prev => ({ ...prev, [qIdx]: ansIdx })); };

  const handleSubmitQuiz = () => {
    let correct = 0;
    course.quiz.forEach((q, i) => { if (answers[i] === q.answer) correct++; });
    const pct = course.quiz.length > 0 ? Math.round((correct / course.quiz.length) * 100) : 100;
    const didPass = pct >= course.passingScore;
    setScore(pct);
    setPassed(didPass);
    setSubmitted(true);
    setPhase('results');
    onComplete(course, { quizScore: pct, quizPassed: didPass, ceuAwarded: didPass ? course.ceuHours : 0 });
  };

  const allAnswered = course.quiz.length === 0 || course.quiz.every((_, i) => answers[i] !== undefined);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} aria-label="Back to catalog" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><ChevronLeft size={20} /></button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{course.title}</h2>
          <div className="flex items-center gap-3 mt-1">
            <IsoCategoryBadge isoCategoryId={course.isoCategory} />
            <LevelBadge level={course.level} />
            <span className="text-xs text-gray-400">{course.ceuHours} CEU · {course.durationMinutes} min</span>
          </div>
        </div>
      </div>

      {/* Video phase */}
      {phase === 'video' && (
        <div className="space-y-6">
          <div className="bg-gray-900 rounded-xl aspect-video flex items-center justify-center relative overflow-hidden">
            {course.videoUrl ? (
              <iframe src={course.videoUrl} className="w-full h-full rounded-xl"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen title={course.title} />
            ) : (
              <div className="text-center text-gray-400">
                <Video size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium">Video content placeholder</p>
                <p className="text-xs mt-1 opacity-60">Department will link a YouTube, Vimeo, or uploaded video here</p>
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100">About This Course</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{course.description}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div><p className="text-xs text-gray-400">Instructor</p><p className="text-sm font-medium text-gray-800 dark:text-gray-100">{course.instructor || '—'}</p></div>
              <div><p className="text-xs text-gray-400">Provider</p><p className="text-sm font-medium text-gray-800 dark:text-gray-100">{course.provider || '—'}</p></div>
              <div><p className="text-xs text-gray-400">Level</p><p className="text-sm font-medium text-gray-800 dark:text-gray-100 capitalize">{course.level}</p></div>
              <div><p className="text-xs text-gray-400">Pass Score</p><p className="text-sm font-medium text-gray-800 dark:text-gray-100">{course.passingScore}%</p></div>
            </div>
            {course.tags.length > 0 && (
              <div className="pt-2">
                <p className="text-xs text-gray-400 mb-1">Tags</p>
                <div className="flex gap-2 flex-wrap">
                  {course.tags.map(t => (
                    <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-full text-xs text-gray-500 dark:text-gray-400">
                      <Tag size={10} /> {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={handleStartQuiz}
            className="w-full sm:w-auto px-6 py-3 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800 transition-colors flex items-center gap-2">
            <BookOpen size={18} /> {course.quiz.length > 0 ? `Take Quiz (${course.quiz.length} Questions)` : 'Mark Complete'}
          </button>
        </div>
      )}

      {/* Quiz phase */}
      {phase === 'quiz' && !submitted && course.quiz.length > 0 && (
        <div className="space-y-6">
          <div className="bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
            <div className="bg-red-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${(Object.keys(answers).length / course.quiz.length) * 100}%` }} />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Question {currentQ + 1} of {course.quiz.length} · Must score {course.passingScore}% to pass</p>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-relaxed">{course.quiz[currentQ].q}</h3>
            <div className="space-y-2">
              {course.quiz[currentQ].options.map((opt, i) => (
                <button key={i} onClick={() => handleAnswer(currentQ, i)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                    answers[currentQ] === i ? 'border-red-600 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 font-medium' : 'border-gray-200 dark:border-gray-700 hover:border-red-300 text-gray-700 dark:text-gray-300'
                  }`}>
                  <span className="font-semibold text-gray-400 mr-2">{String.fromCharCode(65 + i)}.</span>{opt}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentQ(Math.max(0, currentQ - 1))} disabled={currentQ === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">Previous</button>
            {currentQ < course.quiz.length - 1 ? (
              <button onClick={() => setCurrentQ(currentQ + 1)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center gap-1 transition-colors">
                Next <ArrowRight size={14} />
              </button>
            ) : (
              <button onClick={handleSubmitQuiz} disabled={!allAnswered}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-red-700 text-white hover:bg-red-800 disabled:opacity-40 transition-colors">
                Submit Quiz
              </button>
            )}
          </div>
          <div className="flex gap-1.5 justify-center flex-wrap">
            {course.quiz.map((_, i) => (
              <button key={i} onClick={() => setCurrentQ(i)}
                className={`w-7 h-7 rounded-full text-xs font-semibold transition-colors ${
                  currentQ === i ? 'bg-red-700 text-white' : answers[i] !== undefined ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                }`}>{i + 1}</button>
            ))}
          </div>
        </div>
      )}

      {/* Results phase */}
      {phase === 'results' && (
        <div className="space-y-6">
          <div className={`rounded-xl border p-8 text-center ${passed ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900' : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900'}`}>
            <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center text-3xl font-bold ${
              passed ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'}`}>{score}%</div>
            <h3 className={`text-xl font-bold mt-4 ${passed ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300'}`}>
              {passed ? 'Course Passed!' : 'Not Quite — Try Again'}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
              {passed
                ? `You earned ${course.ceuHours} training hour${course.ceuHours !== 1 ? 's' : ''} in ${getIsoCategoryById(course.isoCategory)?.label ?? 'General'}.`
                : `You needed ${course.passingScore}% to pass. Review the material and retake the quiz.`}
            </p>
          </div>
          {submitted && course.quiz.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-bold text-gray-800 dark:text-gray-100">Answer Review</h4>
              {course.quiz.map((q, i) => {
                const correct = answers[i] === q.answer;
                return (
                  <div key={i} className={`rounded-xl border p-4 ${correct ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/50' : 'border-red-200 dark:border-red-900 bg-red-50/50'}`}>
                    <div className="flex items-start gap-2">
                      {correct ? <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" /> : <XCircle size={18} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />}
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{q.q}</p>
                        <p className="text-xs mt-1"><span className="text-gray-500 dark:text-gray-400">Your answer: </span>
                          <span className={correct ? 'text-emerald-700 dark:text-emerald-300 font-medium' : 'text-red-700 dark:text-red-300 font-medium'}>{q.options[answers[i]] ?? 'No answer'}</span></p>
                        {!correct && <p className="text-xs mt-0.5"><span className="text-gray-500 dark:text-gray-400">Correct: </span><span className="text-emerald-700 dark:text-emerald-300 font-medium">{q.options[q.answer]}</span></p>}
                        {q.explanation && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">{q.explanation}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-3 flex-wrap">
            {!passed && <button onClick={handleStartQuiz} className="px-5 py-2.5 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800 flex items-center gap-2 transition-colors"><RotateCcw size={16} /> Retake Quiz</button>}
            <button onClick={onBack} className="px-5 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors"><ChevronLeft size={16} /> Back to Catalog</button>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Course Editor (Add / Edit) ─────────────────────────────────────────────

const EMPTY_COURSE = {
  title: '', description: '', video_url: '', video_type: 'youtube',
  iso_category: 'general-ceu', ceu_hours: 0, duration_minutes: 0,
  level: 'awareness', passing_score: 80, instructor: '', provider: '',
  tags: [], prerequisites: [], quiz: [],
};

function CourseEditor({ course, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => {
    if (course) {
      return {
        title: course.title || '', description: course.description || '',
        video_url: course.videoUrl || course.video_url || '',
        video_type: course.videoType || course.video_type || 'youtube',
        iso_category: course.isoCategory || course.iso_category || 'general-ceu',
        ceu_hours: course.ceuHours ?? course.ceu_hours ?? 0,
        duration_minutes: course.durationMinutes ?? course.duration_minutes ?? 0,
        level: course.level || 'awareness',
        passing_score: course.passingScore ?? course.passing_score ?? 80,
        instructor: course.instructor || '', provider: course.provider || '',
        tags: course.tags || [], prerequisites: course.prerequisites || [],
        quiz: course.quiz || [],
      };
    }
    return { ...EMPTY_COURSE };
  });
  const [tagInput, setTagInput] = useState('');
  const [showQuizBuilder, setShowQuizBuilder] = useState(false);

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) { set('tags', [...form.tags, t]); setTagInput(''); }
  };
  const removeTag = (t) => set('tags', form.tags.filter(x => x !== t));

  // Quiz builder
  const addQuestion = () => {
    set('quiz', [...form.quiz, { q: '', options: ['', '', '', ''], answer: 0, explanation: '' }]);
  };
  const updateQuestion = (idx, field, value) => {
    const q = [...form.quiz];
    q[idx] = { ...q[idx], [field]: value };
    set('quiz', q);
  };
  const updateOption = (qIdx, oIdx, value) => {
    const q = [...form.quiz];
    q[qIdx] = { ...q[qIdx], options: q[qIdx].options.map((o, i) => i === oIdx ? value : o) };
    set('quiz', q);
  };
  const removeQuestion = (idx) => set('quiz', form.quiz.filter((_, i) => i !== idx));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} aria-label="Cancel and go back" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronLeft size={20} /></button>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{course ? 'Edit Course' : 'Add New Course'}</h2>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Course Title *</label>
          <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 dark:bg-gray-900 dark:text-gray-100"
            placeholder="e.g. HazMat Operations Annual Refresher" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 dark:bg-gray-900 dark:text-gray-100"
            placeholder="What does this course cover?" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Video URL</label>
            <input type="url" value={form.video_url} onChange={e => set('video_url', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 dark:bg-gray-900 dark:text-gray-100"
              placeholder="https://www.youtube.com/embed/..." />
            <p className="text-xs text-gray-400 mt-1">YouTube: use embed URL (youtube.com/embed/ID). Vimeo: use player URL (player.vimeo.com/video/ID).</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Video Type</label>
            <select value={form.video_type} onChange={e => set('video_type', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-900 dark:text-gray-100">
              <option value="youtube">YouTube</option>
              <option value="vimeo">Vimeo</option>
              <option value="hosted">Self-Hosted URL</option>
              <option value="department">Department Upload</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ISO Category</label>
            <select value={form.iso_category} onChange={e => set('iso_category', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-900 dark:text-gray-100">
              {ISO_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}{c.ppcSection ? ` (${c.ppcSection})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Training Hours</label>
            <input type="number" step="0.5" min="0" value={form.ceu_hours} onChange={e => set('ceu_hours', parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duration (min)</label>
            <input type="number" min="0" value={form.duration_minutes} onChange={e => set('duration_minutes', parseInt(e.target.value) || 0)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Level</label>
            <select value={form.level} onChange={e => set('level', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-900 dark:text-gray-100">
              <option value="awareness">Awareness</option>
              <option value="operations">Operations</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Instructor</label>
            <input type="text" value={form.instructor} onChange={e => set('instructor', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
            <input type="text" value={form.provider} onChange={e => set('provider', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="e.g. FireRescue1 Academy" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Passing Score (%)</label>
            <input type="number" min="0" max="100" value={form.passing_score} onChange={e => set('passing_score', parseInt(e.target.value) || 80)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags</label>
          <div className="flex gap-2 flex-wrap mb-2">
            {form.tags.map(t => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs text-gray-600 dark:text-gray-300">
                {t} <button onClick={() => removeTag(t)} aria-label={`Remove tag ${t}`} className="text-gray-400 hover:text-red-500">&times;</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Add tag…" aria-label="Add tag" />
            <button onClick={addTag} className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">Add</button>
          </div>
        </div>

        {/* Quiz builder toggle */}
        <div>
          <button onClick={() => setShowQuizBuilder(!showQuizBuilder)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-red-700 transition-colors">
            <BookOpen size={16} />
            {showQuizBuilder ? 'Hide Quiz Builder' : `Quiz Builder (${form.quiz.length} questions)`}
          </button>
        </div>

        {showQuizBuilder && (
          <div className="space-y-4 pl-4 border-l-2 border-red-200 dark:border-red-900">
            {form.quiz.map((q, qIdx) => (
              <div key={qIdx} className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Question {qIdx + 1}</span>
                  <button onClick={() => removeQuestion(qIdx)} aria-label="Remove question" className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                </div>
                <input type="text" value={q.q} onChange={e => updateQuestion(qIdx, 'q', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Question text" aria-label={`Question ${qIdx + 1} text`} />
                {q.options.map((opt, oIdx) => (
                  <div key={oIdx} className="flex items-center gap-2">
                    <input type="radio" name={`q${qIdx}`} checked={q.answer === oIdx}
                      onChange={() => updateQuestion(qIdx, 'answer', oIdx)} className="accent-red-600" aria-label={`Mark option ${String.fromCharCode(65 + oIdx)} as correct answer`} />
                    <input type="text" value={opt} onChange={e => updateOption(qIdx, oIdx, e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder={`Option ${String.fromCharCode(65 + oIdx)}`} aria-label={`Option ${String.fromCharCode(65 + oIdx)}`} />
                  </div>
                ))}
                <input type="text" value={q.explanation} onChange={e => updateQuestion(qIdx, 'explanation', e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 dark:bg-gray-900" placeholder="Explanation (shown after quiz)" aria-label="Answer explanation" />
              </div>
            ))}
            <button onClick={addQuestion} className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300 hover:text-red-800">
              <Plus size={16} /> Add Question
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button onClick={() => onSave(form)} disabled={!form.title.trim() || saving}
          className="px-6 py-3 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800 disabled:opacity-40 flex items-center gap-2 transition-colors">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} {course ? 'Update Course' : 'Create Course'}
        </button>
        <button onClick={onCancel} className="px-6 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
      </div>
    </div>
  );
}


// ─── CSV Import Panel ───────────────────────────────────────────────────────

function ImportPanel({ onImport, importing }) {
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState([]);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target.result);
      parseCSV(ev.target.result);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text) => {
    setError('');
    try {
      const lines = text.trim().split('\n');
      if (lines.length < 2) { setError('CSV must have a header row and at least one data row.'); return; }
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());

      // Map common header names
      const nameIdx    = headers.findIndex(h => ['member name','member_name','name','membername','student'].includes(h));
      const courseIdx   = headers.findIndex(h => ['course name','course_name','course','coursename','title'].includes(h));
      const dateIdx     = headers.findIndex(h => ['completed date','completed_date','date','completeddate','completion date'].includes(h));
      const hoursIdx    = headers.findIndex(h => ['hours','ceu_hours','ceu hours','credit hours','training hours'].includes(h));
      const statusIdx   = headers.findIndex(h => ['status','result','pass/fail'].includes(h));
      const typeIdx     = headers.findIndex(h => ['type','category','training type'].includes(h));
      const providerIdx = headers.findIndex(h => ['provider','source','platform','location'].includes(h));
      const instrIdx    = headers.findIndex(h => ['instructor','teacher','trainer'].includes(h));

      if (nameIdx === -1 || courseIdx === -1) {
        setError('CSV must have "Member Name" and "Course Name" columns.');
        return;
      }

      const records = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 2 || !cols[courseIdx]) continue;
        records.push({
          memberName:    cols[nameIdx] || '',
          courseName:    cols[courseIdx] || '',
          completedDate: dateIdx >= 0 ? cols[dateIdx] || '' : '',
          hours:         hoursIdx >= 0 ? parseFloat(cols[hoursIdx]) || 0 : 0,
          status:        statusIdx >= 0 ? cols[statusIdx] || 'Passed' : 'Passed',
          type:          typeIdx >= 0 ? cols[typeIdx] || 'External Course' : 'External Course',
          provider:      providerIdx >= 0 ? cols[providerIdx] || '' : '',
          instructor:    instrIdx >= 0 ? cols[instrIdx] || '' : '',
          source:        'csv-import',
        });
      }

      if (records.length === 0) { setError('No valid records found in CSV.'); return; }
      setParsed(records);
    } catch (err) {
      setError('Failed to parse CSV: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Upload size={18} className="text-red-600 dark:text-red-400" /> Import Training Records</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Upload a CSV file from your training platform (Vector Solutions, FireRescue1 Academy, state fire academy, etc.)
          to import completion records into OpenFirehouse. Records will be added to your department's unified training log.
        </p>

        <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Required CSV Columns</p>
          <p className="text-xs text-blue-600 dark:text-blue-400"><strong>Member Name</strong>, <strong>Course Name</strong></p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Optional: Completed Date, Hours, Status, Type, Provider, Instructor</p>
        </div>

        <div>
          <input type="file" accept=".csv,.txt" ref={fileRef} onChange={handleFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()}
            className="px-5 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg font-medium text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors">
            <FileText size={16} /> Choose CSV File
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Or paste CSV text</label>
          <textarea value={csvText} onChange={e => { setCsvText(e.target.value); if (e.target.value.trim()) parseCSV(e.target.value); else setParsed([]); }}
            rows={6} className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:bg-gray-900 dark:text-gray-100"
            placeholder={'Member Name,Course Name,Completed Date,Hours,Status\nJohn Smith,HazMat Awareness,2026-03-15,4,Passed'} />
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {parsed.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{parsed.length} records ready to import</p>
            <div className="max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-950 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-300">Member</th>
                    <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-300">Course</th>
                    <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-300">Date</th>
                    <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-300">Hours</th>
                    <th className="text-left p-2 font-medium text-gray-600 dark:text-gray-300">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="p-2">{r.memberName}</td>
                      <td className="p-2">{r.courseName}</td>
                      <td className="p-2">{r.completedDate || '—'}</td>
                      <td className="p-2">{r.hours}</td>
                      <td className="p-2">{r.status}</td>
                    </tr>
                  ))}
                  {parsed.length > 50 && <tr><td colSpan={5} className="p-2 text-center text-gray-400">…and {parsed.length - 50} more</td></tr>}
                </tbody>
              </table>
            </div>
            <button onClick={() => onImport(parsed)} disabled={importing}
              className="mt-4 px-6 py-3 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800 disabled:opacity-40 flex items-center gap-2 transition-colors">
              {importing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />} Import {parsed.length} Records
            </button>
          </div>
        )}
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300">
        <p className="font-semibold mb-1">Supported Platforms</p>
        <p className="text-xs leading-relaxed text-amber-600 dark:text-amber-400">
          Most training platforms let you export training records as CSV. Look for "Export" or "Reports" in your platform's admin panel.
          Common platforms: Vector Solutions (TargetSolutions), FireRescue1 Academy, your state fire academy portal, National Fire Academy,
          or any platform with CSV export.
        </p>
      </div>
    </div>
  );
}


// ─── Manual Training Log Entry ──────────────────────────────────────────────

function TrainingLogEntry({ onSave, saving }) {
  const [form, setForm] = useState({
    memberName: '', courseName: '', type: 'In-Service Drill', status: 'Passed',
    completedDate: new Date().toISOString().split('T')[0], hours: 0,
    instructor: '', location: '', notes: '', delivery_method: 'Classroom',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const user = getStoredUser();

  useEffect(() => {
    if (user?.name && !form.memberName) set('memberName', user.name);
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><FileText size={18} className="text-red-600 dark:text-red-400" /> Log Training Activity</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Record in-person drills, ride-alongs, conferences, external online courses, or any training activity
          that happens outside OpenFirehouse. These records are grouped by FSRS Item 580 sub-item and
          counted toward its stated hours requirement.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Member Name *</label>
            <input type="text" value={form.memberName} onChange={e => set('memberName', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Course / Activity Name *</label>
            <input type="text" value={form.courseName} onChange={e => set('courseName', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="e.g. HazMat Refresher — Vector Solutions" />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-900 dark:text-gray-100">
              <option>In-Service Drill</option>
              <option>External Course</option>
              <option>Conference</option>
              <option>Ride-Along</option>
              <option>Certification Class</option>
              <option>Practical Skills</option>
              <option>Online Course</option>
              <option>Self-Study</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input type="date" value={form.completedDate} onChange={e => set('completedDate', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hours</label>
            <input type="number" step="0.5" min="0" value={form.hours} onChange={e => set('hours', parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery</label>
            <select value={form.delivery_method} onChange={e => set('delivery_method', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-900 dark:text-gray-100">
              <option>Classroom</option>
              <option>Online</option>
              <option>Hands-On</option>
              <option>Blended</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Instructor</label>
            <input type="text" value={form.instructor} onChange={e => set('instructor', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Name or N/A" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location / Provider</label>
            <input type="text" value={form.location} onChange={e => set('location', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="e.g. Station 14, FireRescue1 Academy" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Topics covered, skills practiced, etc." />
        </div>
      </div>

      <button onClick={() => onSave(form)} disabled={!form.memberName.trim() || !form.courseName.trim() || saving}
        className="px-6 py-3 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800 disabled:opacity-40 flex items-center gap-2 transition-colors">
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save Training Record
      </button>
    </div>
  );
}


// ─── ISO Dashboard Strip ─────────────────────────────────────────────────────

function IsoDashboard({ courses, completions }) {
  const catHours = {};
  ISO_CATEGORIES.forEach(c => { catHours[c.id] = 0; });

  // Count hours from course completions
  completions.filter(c => c.quiz_passed || c.quizPassed).forEach(comp => {
    const course = courses.find(c => c.id === comp.course_id);
    if (course) {
      const cat = course.isoCategory || course.iso_category || 'general-ceu';
      catHours[cat] = (catHours[cat] || 0) + (course.ceuHours ?? course.ceu_hours ?? 0);
    }
  });

  // Hours-based sub-items only — 580.H is a coverage requirement, not hours.
  const scored = ISO_CATEGORIES.filter(c => c.ppcSection && c.annualRequirement);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 size={18} className="text-red-600 dark:text-red-400" />
        <h3 className="font-bold text-gray-900 dark:text-gray-100">ISO Category Hours Progress</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {scored.map(cat => {
          const hrs = catHours[cat.id] || 0;
          const pct = cat.annualRequirement ? Math.min(100, Math.round((hrs / cat.annualRequirement) * 100)) : 0;
          return (
            <div key={cat.id} className="rounded-lg border border-gray-100 dark:border-gray-700 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cat.color}`}>{cat.label}</span>
                <span className="text-xs text-gray-400">{cat.ppcSection}</span>
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-full h-2 mt-2 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-blue-500' : 'bg-red-500'}`}
                  style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">{hrs.toFixed(1)} hrs</span>
                <span className="text-xs text-gray-400">/ {cat.annualRequirement} req</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── Main Export ─────────────────────────────────────────────────────────────

export default function TrainingCatalog() {
  const user = getStoredUser();
  const canEdit = user && user.accessLevel >= 2; // officers+

  // Tab state
  const [tab, setTab] = useState('catalog'); // 'catalog' | 'add' | 'log' | 'import'
  const [editingCourse, setEditingCourse] = useState(null);

  // Data
  const [courses, setCourses] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState('');

  // Catalog state
  const [search, setSearch] = useState('');
  const [isoFilter, setIsoFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [activeCourse, setActiveCourse] = useState(null);

  // Load courses + completions from API
  const load = useCallback(async () => {
    try {
      const [coursesRes, completionsRes] = await Promise.all([
        api.get('/api/training/courses'),
        api.get('/api/training/courses/completions/me'),
      ]);
      setCourses((coursesRes.data || []).map(normalizeCourse));
      setCompletions(completionsRes.data || []);
    } catch (err) {
      console.error('Failed to load training data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  // ── Course CRUD ──
  const handleSaveCourse = async (form) => {
    setSaving(true);
    try {
      if (editingCourse) {
        await api.put(`/api/training/courses/${editingCourse.id}`, form);
        showToast('Course updated successfully');
      } else {
        await api.post('/api/training/courses', form);
        showToast('Course created successfully');
      }
      setEditingCourse(null);
      setTab('catalog');
      await load();
    } catch (err) {
      showToast('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditCourse = (course) => {
    setEditingCourse(course);
    setTab('add');
  };

  // ── Course completion ──
  const handleComplete = async (course, result) => {
    try {
      await api.post(`/api/training/courses/${course.id}/complete`, {
        quiz_score: result.quizScore,
        quiz_passed: result.quizPassed,
        ceu_awarded: result.ceuAwarded,
      });
      await load();
    } catch (err) {
      console.error('Failed to record completion:', err);
    }
  };

  // ── Manual training log ──
  const handleLogTraining = async (form) => {
    setSaving(true);
    try {
      await api.post('/api/training', form);
      showToast('Training record saved');
      setTab('catalog');
    } catch (err) {
      showToast('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── CSV import ──
  const handleImport = async (records) => {
    setImporting(true);
    try {
      const res = await api.post('/api/training/courses/import', { records });
      showToast(`Imported ${res.count} training records`);
      setTab('catalog');
      await load();
    } catch (err) {
      showToast('Error: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  // ── Filter courses ──
  const filtered = courses.filter(c => {
    if (isoFilter !== 'all' && c.isoCategory !== isoFilter) return false;
    if (levelFilter !== 'all' && c.level !== levelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) ||
        c.instructor.toLowerCase().includes(q) || c.tags.some(t => t.toLowerCase().includes(q));
    }
    return true;
  });

  const completionMap = {};
  completions.forEach(c => { completionMap[c.course_id] = c; });
  const passedCount = completions.filter(c => c.quiz_passed).length;
  const totalCeu = completions.filter(c => c.quiz_passed).reduce((sum, c) => sum + parseFloat(c.ceu_awarded || 0), 0);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={24} className="animate-spin mr-2" /> Loading training hub…
      </div>
    );
  }

  // ── Course player view ──
  if (activeCourse) {
    return (
      <CoursePlayer
        course={activeCourse}
        progress={completionMap[activeCourse.id]}
        onBack={() => setActiveCourse(null)}
        onComplete={handleComplete}
      />
    );
  }

  // ── Tab: Add/Edit Course ──
  if (tab === 'add') {
    return (
      <CourseEditor
        course={editingCourse}
        onSave={handleSaveCourse}
        onCancel={() => { setEditingCourse(null); setTab('catalog'); }}
        saving={saving}
      />
    );
  }

  // ── Tab: Log Training ──
  if (tab === 'log') {
    return (
      <>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setTab('catalog')} aria-label="Back to catalog" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronLeft size={20} /></button>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Log Training</h2>
        </div>
        <TrainingLogEntry onSave={handleLogTraining} saving={saving} />
      </>
    );
  }

  // ── Tab: Import ──
  if (tab === 'import') {
    return (
      <>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setTab('catalog')} aria-label="Back to catalog" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronLeft size={20} /></button>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Import Training Records</h2>
        </div>
        <ImportPanel onImport={handleImport} importing={importing} />
      </>
    );
  }

  // ── Tab: Catalog (default) ──
  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 size={16} className="text-emerald-400" /> {toast}
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <button onClick={() => { setEditingCourse(null); setTab('add'); }}
            className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-semibold hover:bg-red-800 flex items-center gap-2 transition-colors">
            <Plus size={16} /> Add Course
          </button>
        )}
        <button onClick={() => setTab('log')}
          className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors">
          <FileText size={16} /> Log Training
        </button>
        <button onClick={() => setTab('import')}
          className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors">
          <Upload size={16} /> Import CSV
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Video Courses',     value: courses.length,   color: 'bg-red-500' },
          { label: 'Completed',         value: passedCount,       color: 'bg-emerald-500' },
          { label: 'Training Hours',    value: totalCeu.toFixed(1), color: 'bg-blue-500' },
          { label: 'ISO Categories',    value: ISO_CATEGORIES.filter(c => c.ppcSection).length, color: 'bg-purple-500' },
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

      {/* ISO dashboard */}
      <IsoDashboard courses={courses} completions={completions} />

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search courses, instructors, tags…"
            aria-label="Search courses"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 dark:bg-gray-900 dark:text-gray-100" />
        </div>
        <select value={isoFilter} onChange={e => setIsoFilter(e.target.value)} aria-label="Filter by ISO category"
          className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:text-gray-100">
          <option value="all">All ISO Categories</option>
          {ISO_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} aria-label="Filter by level"
          className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:text-gray-100">
          <option value="all">All Levels</option>
          <option value="awareness">Awareness</option>
          <option value="operations">Operations</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>

      {/* Course grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {courses.length === 0 ? (
            <>
              <Video size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No courses yet</p>
              <p className="text-xs mt-1">
                {canEdit
                  ? 'Click "Add Course" to create your first video training course.'
                  : 'Your training officer will add courses here. Use "Log Training" to record external training.'}
              </p>
            </>
          ) : (
            <>
              <Search size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No courses match your filters.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(course => (
            <CourseCard key={course.id} course={course}
              progress={completionMap[course.id]}
              onSelect={setActiveCourse}
              onEdit={handleEditCourse}
              canEdit={canEdit} />
          ))}
        </div>
      )}

      {/* Info footer */}
      <div className="rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 p-4 text-sm text-blue-700 dark:text-blue-300">
        <p className="font-semibold mb-1">Training Hub — Your Single Training Record</p>
        <p className="text-xs leading-relaxed text-blue-600 dark:text-blue-400">
          OpenFirehouse is your department's unified training record. Add your own video courses with quizzes,
          log in-person drills and external training, or import records from third-party training platforms
          or your state fire academy. All training hours are grouped by FSRS Item 580 sub-item and tracked
          against its stated hours requirement.
        </p>
      </div>
    </div>
  );
}
