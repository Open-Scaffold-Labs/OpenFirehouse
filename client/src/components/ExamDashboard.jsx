import { useState, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, BarChart3, Clock, Target,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  BookOpen, Play,
} from 'lucide-react';
import { api } from '../utils/api';
import { generateCertificate } from '../utils/examCertificate';
import { DEMO_EXAMS } from '../data/examBank';

// ─── normalize DB (snake_case) → component (camelCase) ──────────────────────
function normalizeExam(e) {
  const questions = typeof e.questions === 'string' ? JSON.parse(e.questions) : (e.questions || []);
  return {
    ...e,
    questions,
    questionCount: e.questionCount ?? questions.length,
    timeLimit: e.timeLimit ?? e.time_limit ?? 0,
    passingScore: e.passingScore ?? e.passing_score ?? 70,
    dueDate: e.dueDate ?? e.due_date ?? null,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(minutes) {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function StatCard({ icon: Icon, label, value, color = 'text-gray-700 dark:text-gray-300' }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex items-start gap-3">
      <div className="p-2 bg-gray-50 dark:bg-gray-950 rounded-lg">
        <Icon size={18} className={color} />
      </div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
        <p className={`text-2xl font-bold leading-none mt-0.5 ${color}`}>{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'published') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-900">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Published
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      Draft
    </span>
  );
}

function PassBadge({ passed }) {
  if (passed === undefined) return null;
  if (passed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-900">
        <CheckCircle2 size={14} />
        Passed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900">
      <AlertCircle size={14} />
      Failed
    </span>
  );
}

// ─── Results Expandable ────────────────────────────────────────────────────────

function ResultsExpandable({ exam, submissions = [] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition"
      >
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        View Results ({submissions.length} submissions)
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {submissions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No submissions yet.</p>
          ) : (
            submissions.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-950 rounded-lg p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{sub.memberName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{fmtDate(sub.completedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{sub.score}%</p>
                    {sub.timeMinutes && <p className="text-xs text-gray-500 dark:text-gray-400">{fmtTime(sub.timeMinutes)}</p>}
                  </div>
                  <PassBadge passed={sub.passed} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Officer/Chief View ────────────────────────────────────────────────────────

function OfficerView({ user, exams, onNavigateToBuilder, onNavigateToPlayer, onDelete }) {
  const [selectedExam, setSelectedExam] = useState(null);
  const [submissions, setSubmissions] = useState({});
  const [loadingSubmissions, setLoadingSubmissions] = useState(new Set());

  const publishedCount = exams.filter((e) => e.status === 'published').length;
  const draftCount = exams.filter((e) => e.status === 'draft').length;
  const totalSubmissions = Object.values(submissions).reduce((sum, subs) => sum + subs.length, 0);
  const avgPassRate = exams.length > 0
    ? Math.round(
        exams.reduce((sum, e) => sum + (e.avgPassRate || 0), 0) / exams.length
      )
    : 0;

  async function loadSubmissionsForExam(examId) {
    if (submissions[examId]) return;
    const loading = new Set(loadingSubmissions);
    loading.add(examId);
    setLoadingSubmissions(loading);

    try {
      const data = await api.get(`/api/exams/${examId}/submissions`);
      setSubmissions((prev) => ({ ...prev, [examId]: Array.isArray(data) ? data : data?.data ?? [] }));
    } catch (err) {
      console.error('Error loading submissions:', err);
    } finally {
      loading.delete(examId);
      setLoadingSubmissions(loading);
    }
  }

  async function handleDelete(examId) {
    if (!window.confirm('Are you sure? This cannot be undone.')) return;
    try {
      await api.delete(`/api/exams/${examId}`);
      // Refresh exams list by triggering parent refetch
      window.location.reload();
    } catch (err) {
      console.error('Error deleting exam:', err);
      alert('Failed to delete exam');
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={BookOpen} label="Total Exams" value={exams.length} color="text-blue-600 dark:text-blue-400" />
        <StatCard icon={CheckCircle2} label="Published" value={publishedCount} color="text-green-600 dark:text-green-400" />
        <StatCard icon={AlertCircle} label="Draft" value={draftCount} color="text-gray-600 dark:text-gray-300" />
        <StatCard icon={BarChart3} label="Avg Pass Rate" value={`${avgPassRate}%`} color="text-purple-600 dark:text-purple-400" />
      </div>

      {/* Create Button */}
      <button
        onClick={() => onNavigateToBuilder(null)}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition shadow-sm"
      >
        <Plus size={18} />
        Create New Exam
      </button>

      {/* Exams List */}
      {exams.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <BookOpen size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-gray-600 dark:text-gray-300 font-medium">No exams yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Create your first exam to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <div key={exam.id} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4 hover:shadow-md transition">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">{exam.title}</h3>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {exam.category && (
                      <span className="text-xs bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full border border-blue-200 dark:border-blue-900">
                        {exam.category}
                      </span>
                    )}
                    <StatusBadge status={exam.status} />
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-sm">
                <div className="text-gray-600 dark:text-gray-300">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Questions</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{exam.questionCount || 0}</p>
                </div>
                <div className="text-gray-600 dark:text-gray-300">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Time Limit</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{fmtTime(exam.timeLimit)}</p>
                </div>
                <div className="text-gray-600 dark:text-gray-300">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Pass Score</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{exam.passingScore || 0}%</p>
                </div>
                <div className="text-gray-600 dark:text-gray-300">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Due Date</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{exam.dueDate ? fmtDate(exam.dueDate) : '—'}</p>
                </div>
              </div>

              {/* Submission Stats */}
              {exam.submissionCount !== undefined && (
                <div className="mb-3 p-2 bg-gray-50 dark:bg-gray-950 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                  <p>
                    <span className="font-semibold">{exam.submissionCount}</span> completed
                    {exam.avgPassRate !== undefined && (
                      <>
                        {' '}
                        • <span className="font-semibold">{exam.avgPassRate}%</span> avg score
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Results */}
              {submissions[exam.id] && (
                <ResultsExpandable
                  exam={exam}
                  submissions={submissions[exam.id]}
                />
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => onNavigateToPlayer(exam)}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 transition shadow-sm"
                >
                  <Play size={16} />
                  Take Exam
                </button>
                <button
                  onClick={() => onNavigateToBuilder(exam)}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-300 rounded-lg font-medium text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition border border-gray-200 dark:border-gray-700"
                >
                  <Edit2 size={16} />
                  Edit
                </button>
                <button
                  onClick={() => {
                    loadSubmissionsForExam(exam.id);
                  }}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-300 rounded-lg font-medium text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition border border-gray-200 dark:border-gray-700"
                  disabled={loadingSubmissions.has(exam.id)}
                >
                  <BarChart3 size={16} />
                  {loadingSubmissions.has(exam.id) ? 'Loading...' : 'Results'}
                </button>
                <button
                  onClick={() => handleDelete(exam.id)}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 rounded-lg font-medium text-sm hover:bg-red-100 dark:hover:bg-red-950/50 transition border border-red-200 dark:border-red-900"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Member View ────────────────────────────────────────────────────────────────

function MemberView({ user, assignments = [], results = [], onNavigateToPlayer }) {
  return (
    <div className="space-y-8">
      {/* My Assignments */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">My Assignments</h2>
        {assignments.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <BookOpen size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-gray-600 dark:text-gray-300 font-medium">No pending exams</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((exam) => (
              <div key={exam.id} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">{exam.title}</h3>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {exam.category && (
                        <span className="text-xs bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full border border-blue-200 dark:border-blue-900">
                          {exam.category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Time Limit</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{fmtTime(exam.timeLimit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Questions</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{exam.questionCount || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Due</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{exam.dueDate ? fmtDate(exam.dueDate) : '—'}</p>
                  </div>
                </div>

                <button
                  onClick={() => onNavigateToPlayer(exam)}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition shadow-sm"
                >
                  Take Exam
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* My Results */}
      {results.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">My Results</h2>
          <div className="space-y-3">
            {results.map((result) => (
              <div key={result.id} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{result.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{fmtDate(result.completedAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{result.score}%</p>
                    </div>
                    <PassBadge passed={result.passed} />
                  </div>
                </div>

                {result.passed ? (
                  <button
                    onClick={() => generateCertificate({
                      memberName: user?.name || 'Firefighter',
                      examTitle: result.title || 'Certification Exam',
                      score: result.score,
                      date: fmtDate(result.completed_at || result.completedAt),
                    })}
                    className="mt-3 w-full px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition"
                  >
                    Download Certificate (PDF)
                  </button>
                ) : (
                  <button
                    onClick={() => onNavigateToPlayer(result)}
                    className="mt-3 w-full px-4 py-2 bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-300 font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition border border-gray-200 dark:border-gray-700"
                  >
                    Retake Exam
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ExamDashboard({ user, onNavigateToBuilder, onNavigateToPlayer }) {
  const [exams, setExams] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isOfficer = user?.role === 'officer' || user?.role === 'chief';

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        if (isOfficer) {
          const examsData = await api.get('/api/exams');
          const raw = Array.isArray(examsData) ? examsData : examsData?.data ?? [];
          setExams(raw.map(normalizeExam));
        } else {
          const [assignmentsData, resultsData] = await Promise.all([
            api.get('/api/exams/my-assignments').catch(() => []),
            api.get('/api/exams/my-results').catch(() => []),
          ]);
          const rawAssign = Array.isArray(assignmentsData) ? assignmentsData : assignmentsData?.data ?? [];
          setAssignments(rawAssign.map(normalizeExam));
          setResults(Array.isArray(resultsData) ? resultsData : resultsData?.data ?? []);
        }
      } catch (err) {
        console.error('ExamDashboard fetch error:', err);
        // Fallback to built-in NFPA exam bank when API unavailable (offline/demo)
        const normalized = DEMO_EXAMS.map(normalizeExam);
        if (isOfficer) {
          setExams(normalized);
        } else {
          // In demo mode, show all exams as available assignments for members too
          setAssignments(normalized);
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [isOfficer]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-700 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-300">Loading exams...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg p-6 text-center">
        <AlertCircle size={32} className="mx-auto text-red-500 mb-2" />
        <p className="text-red-900 dark:text-red-200 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div>
      {isOfficer ? (
        <OfficerView
          user={user}
          exams={exams}
          onNavigateToBuilder={onNavigateToBuilder}
          onNavigateToPlayer={onNavigateToPlayer}
          onDelete={() => {}}
        />
      ) : (
        <MemberView
          user={user}
          assignments={assignments}
          results={results}
          onNavigateToPlayer={onNavigateToPlayer}
        />
      )}
    </div>
  );
}
