/**
 * MyTraining.jsx — Personal training progress, ISO compliance dashboard,
 * and printable CEU certificate generation.
 *
 * Shows: completed courses, CEU hours by ISO category, ISO audit report,
 * and a printable certificate for each passed course.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Award, BarChart3, BookOpen, CheckCircle2, Clock, Download, GraduationCap,
  Printer, Shield, TrendingUp, Video, FileText, Calendar, User,
  ChevronDown, ChevronRight, AlertTriangle, Target, Loader2,
} from 'lucide-react';
import { ISO_CATEGORIES, getIsoCategoryById } from '../data/trainingVideos';
import { api } from '../utils/api';


// ─── CEU Certificate (printable) ─────────────────────────────────────────────

function CeuCertificate({ completion, onClose }) {
  const certRef = useRef(null);
  const courseName = completion.course_title || completion.courseName || '';
  const ceuHours = completion.ceu_awarded || completion.ceuAwarded || 0;
  const isoCategory = completion.course_iso_category || completion.isoCategory || '';
  const isoCat = getIsoCategoryById(isoCategory);
  const memberName = completion.member_name || completion.memberName || '';
  const quizScore = completion.quiz_score || completion.quizScore || 0;
  const completedAt = completion.completed_at || completion.completedAt || '';
  const certificateId = completion.certificate_id || completion.certificateId || '';

  const handlePrint = () => {
    const content = certRef.current;
    if (!content) return;
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>CEU Certificate — ${courseName}</title>
      <style>
        @page { size: landscape; margin: 0.75in; }
        body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a2e; }
        .cert-border { border: 3px double #b91c1c; padding: 48px; text-align: center; }
        .cert-title { font-size: 32px; font-weight: bold; color: #b91c1c; margin-bottom: 8px; }
        .cert-subtitle { font-size: 16px; color: #666; margin-bottom: 32px; }
        .cert-name { font-size: 28px; font-weight: bold; margin: 16px 0; }
        .cert-course { font-size: 18px; margin: 8px 0; }
        .cert-detail { font-size: 14px; color: #555; margin: 4px 0; }
        .cert-footer { display: flex; justify-content: space-between; margin-top: 48px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 12px; color: #888; }
        .cert-sig { text-align: center; width: 200px; }
        .cert-sig .line { border-top: 1px solid #333; margin-top: 48px; padding-top: 4px; }
      </style></head><body>
      <div class="cert-border">
        <div class="cert-title">Certificate of Continuing Education</div>
        <div class="cert-subtitle">OpenFirehouse Training Division</div>
        <p style="font-size:14px;color:#888;">This certifies that</p>
        <div class="cert-name">${memberName}</div>
        <p style="font-size:14px;color:#888;">has successfully completed the course</p>
        <div class="cert-course">${courseName}</div>
        <p class="cert-detail"><strong>${ceuHours} Continuing Education Unit${ceuHours !== 1 ? 's' : ''}</strong></p>
        <p class="cert-detail">ISO Category: ${isoCat?.label ?? 'General'}</p>
        <p class="cert-detail">Quiz Score: ${quizScore}% · Completed: ${completedAt ? new Date(completedAt).toLocaleDateString() : '—'}</p>
        <p class="cert-detail" style="color:#aaa;">Certificate ID: ${certificateId}</p>
        <div class="cert-footer">
          <div class="cert-sig"><div class="line">Training Officer</div></div>
          <div class="cert-sig"><div class="line">Fire Chief</div></div>
        </div>
      </div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-2xl w-full p-8 space-y-6" onClick={e => e.stopPropagation()}>
        {/* preview */}
        <div ref={certRef} className="border-4 border-double border-red-700 p-8 text-center rounded-lg">
          <h2 className="text-2xl font-bold text-red-700 dark:text-red-300">Certificate of Continuing Education</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">OpenFirehouse Training Division</p>
          <div className="mt-6">
            <p className="text-xs text-gray-400">This certifies that</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{memberName}</p>
            <p className="text-xs text-gray-400 mt-3">has successfully completed</p>
            <p className="text-lg font-semibold text-gray-800 dark:text-gray-100 mt-1">{courseName}</p>
          </div>
          <div className="mt-4 space-y-1 text-sm text-gray-600 dark:text-gray-300">
            <p><strong>{ceuHours} Training Hours</strong> · {isoCat?.label || 'General'}</p>
            <p>Score: {quizScore}% · {completedAt ? new Date(completedAt).toLocaleDateString() : '—'}</p>
            <p className="text-xs text-gray-400">ID: {certificateId}</p>
          </div>
        </div>

        {/* actions */}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2.5 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800 flex items-center gap-2"
          >
            <Printer size={16} /> Print Certificate
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Completion Row ──────────────────────────────────────────────────────────

function TrainingRow({ record, onViewCert }) {
  // Unified row — works with both training records and course completions
  const courseName = record.course_name || record.courseName || record.course_title || '';
  const type = record.type || record.source || '';
  const status = record.status || (record.quiz_passed ? 'Passed' : 'Incomplete');
  const hours = record.hours ?? record.ceu_awarded ?? 0;
  const completedDate = record.completed_date || record.completedDate || record.completed_at || '';
  const hasCert = record.certificate_id && record.quiz_passed;

  return (
    <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Video size={14} className="text-red-600 dark:text-red-400 shrink-0" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{courseName}</span>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{type}</span>
      </td>
      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">{hours}</td>
      <td className="py-3 px-4">
        {status === 'Passed' ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={13} /> {status}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <AlertTriangle size={13} /> {status}
          </span>
        )}
      </td>
      <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400">
        {completedDate ? new Date(completedDate).toLocaleDateString() : '—'}
      </td>
      <td className="py-3 px-4">
        {hasCert && (
          <button
            onClick={() => onViewCert(record)}
            className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium flex items-center gap-1"
          >
            <Award size={12} /> View Cert
          </button>
        )}
      </td>
    </tr>
  );
}


// ─── Training Hours by ISO Category ──────────────────────────────────────────
//
// Tracks THIS MEMBER's hours against the per-firefighter requirement each FSRS
// Item 580 sub-item states. It does NOT compute earned PPC credit: Item 580 is
// scored at the DEPARTMENT level against aggregate compliance, by a formula ISO
// owns — a per-member linear share of the maximum is not that formula, and a
// number on this screen must trace to a real FSRS calculation or not appear.

function IsoAuditReport({ records, isoHours }) {
  const [expanded, setExpanded] = useState(false);

  // aggregate hours by ISO category from pre-computed isoHours map
  // Only the hours-based sub-items. 580.H is a COVERAGE requirement (every
  // qualifying building inspected annually), not an hours one, so it has no
  // annualRequirement and does not belong in an hours table.
  const catData = ISO_CATEGORIES.filter(c => c.ppcSection && c.annualRequirement).map(cat => {
    const hours = isoHours[cat.id] || 0;
    const pct = cat.annualRequirement ? Math.min(100, Math.round((hours / cat.annualRequirement) * 100)) : 0;
    return { ...cat, hours, pct };
  });

  const totalHours = catData.reduce((s, c) => s + c.hours, 0);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-red-600 dark:text-red-400" />
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Training Hours by ISO Category</h3>
          <span className="text-xs text-gray-400 ml-2">{new Date().getFullYear()} Training Year</span>
        </div>
        {expanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase">
                <th className="text-left py-2 px-2">Category</th>
                <th className="text-left py-2 px-2">PPC Section</th>
                <th className="text-right py-2 px-2">Hours Earned</th>
                <th className="text-right py-2 px-2">Requirement</th>
                <th className="text-right py-2 px-2">% Complete</th>
              </tr>
            </thead>
            <tbody>
              {catData.map(cat => (
                <tr key={cat.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cat.color}`}>{cat.label}</span>
                  </td>
                  <td className="py-2 px-2 text-xs text-gray-500 dark:text-gray-400">{cat.ppcSection}</td>
                  <td className="py-2 px-2 text-right font-medium">{cat.hours.toFixed(1)}</td>
                  <td className="py-2 px-2 text-right text-gray-500 dark:text-gray-400">{cat.annualRequirement}</td>
                  <td className="py-2 px-2 text-right">
                    <span className={`font-semibold ${cat.pct >= 100 ? 'text-emerald-600 dark:text-emerald-400' : cat.pct > 50 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                      {cat.pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 dark:bg-gray-950 font-semibold text-sm">
                <td className="py-2 px-2" colSpan={2}>Total</td>
                <td className="py-2 px-2 text-right">{totalHours.toFixed(1)}</td>
                <td className="py-2 px-2" />
                <td className="py-2 px-2" />
              </tr>
            </tfoot>
          </table>

          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
            >
              <Printer size={14} /> Print Report
            </button>
            <button className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2">
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Main Export ─────────────────────────────────────────────────────────────

export default function MyTraining({ user }) {
  const [viewCert, setViewCert] = useState(null);
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'passed' | 'incomplete'
  const [records, setRecords] = useState([]);
  const [courseCompletions, setCourseCompletions] = useState([]);
  const [loading, setLoading] = useState(true);

  const memberName = user?.name || 'Unknown';

  // Fetch training records + course completions from API
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [trRes, ccRes] = await Promise.all([
          api.get('/api/training'),
          api.get('/api/training/courses/completions/me'),
        ]);
        if (cancelled) return;
        // Training records are the unified source
        setRecords(trRes.data || []);
        setCourseCompletions(ccRes.data || []);
      } catch (err) {
        console.error('Failed to load training data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Filter records for this member
  const myRecords = records.filter(r =>
    (r.member_name || r.memberName || '').toLowerCase() === memberName.toLowerCase()
    || r.member_id === user?.id
  );

  const passedRecords = myRecords.filter(r => (r.status || '').toLowerCase() === 'passed');
  const incompleteRecords = myRecords.filter(r => (r.status || '').toLowerCase() !== 'passed');
  const totalHours = passedRecords.reduce((sum, r) => sum + (r.hours || 0), 0);

  const visible = viewMode === 'passed' ? passedRecords
    : viewMode === 'incomplete' ? incompleteRecords
    : myRecords;

  // ISO category progress — from course completions that have iso_category
  const catHours = {};
  ISO_CATEGORIES.forEach(c => { catHours[c.id] = 0; });
  courseCompletions.forEach(c => {
    if (c.quiz_passed && c.course_iso_category) {
      catHours[c.course_iso_category] = (catHours[c.course_iso_category] || 0) + (c.ceu_awarded || 0);
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-gray-400">
        <Loader2 size={24} className="animate-spin mr-2" /> Loading training data...
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── member header ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-red-700 dark:text-red-300 font-bold text-lg">
          {memberName.split(' ').map(n => n[0]).join('')}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{memberName}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Training Record — {new Date().getFullYear()}</p>
        </div>
      </div>

      {/* ── summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Records',          value: myRecords.length,       icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Training Hours',    value: totalHours.toFixed(1),  icon: Award,        color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Incomplete',        value: incompleteRecords.length, icon: Clock,      color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Certificates',      value: courseCompletions.filter(c => c.certificate_id && c.quiz_passed).length, icon: FileText, color: 'text-purple-600 dark:text-purple-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <Icon size={20} className={`${color} mb-2`} />
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {/* ── ISO category progress bars ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-red-600 dark:text-red-400" />
          <h3 className="font-bold text-gray-900 dark:text-gray-100">ISO Category Hours Progress</h3>
        </div>
        <div className="space-y-3">
          {ISO_CATEGORIES.filter(c => c.ppcSection && c.annualRequirement).map(cat => {
            const hrs = catHours[cat.id] || 0;
            const pct = cat.annualRequirement ? Math.min(100, Math.round((hrs / cat.annualRequirement) * 100)) : 0;
            return (
              <div key={cat.id} className="flex items-center gap-4">
                <span className={`w-40 shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold text-center ${cat.color}`}>
                  {cat.label}
                </span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-blue-500' : 'bg-red-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 w-20 text-right">{hrs.toFixed(1)} / {cat.annualRequirement} hrs</span>
                <span className={`text-xs font-semibold w-12 text-right ${pct >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── ISO audit report ── */}
      <IsoAuditReport records={myRecords} isoHours={catHours} />

      {/* ── completion table ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-5 flex items-center justify-between border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <GraduationCap size={18} className="text-red-600 dark:text-red-400" />
            Course History
          </h3>
          <div className="flex gap-1">
            {['all', 'passed', 'incomplete'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  viewMode === mode ? 'bg-red-700 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <BookOpen size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No courses in this category yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-950 text-xs text-gray-500 dark:text-gray-400 uppercase">
                  <th className="text-left py-2 px-4">Course / Activity</th>
                  <th className="text-left py-2 px-4">Type</th>
                  <th className="text-left py-2 px-4">Hours</th>
                  <th className="text-left py-2 px-4">Status</th>
                  <th className="text-left py-2 px-4">Date</th>
                  <th className="text-left py-2 px-4">Certificate</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <TrainingRow key={r.id || i} record={r} onViewCert={setViewCert} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── info footer ── */}
      <div className="rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 p-4 text-sm text-blue-700 dark:text-blue-300">
        <p className="font-semibold mb-1">About Your Training Record</p>
        <p className="text-xs leading-relaxed text-blue-600 dark:text-blue-400">
          This page shows all of your training activity — video courses, in-person drills,
          external platform imports, and manually logged entries. Training hours are grouped
          by FSRS Item 580 sub-item so you can see them against the per-firefighter requirement
          ISO states for each. Earned PPC credit is scored by ISO at the department level and is
          not calculated here. Use the "Print Certificate" feature for video course completions.
        </p>
      </div>

      {/* ── certificate modal ── */}
      {viewCert && (
        <CeuCertificate
          completion={viewCert}
          onClose={() => setViewCert(null)}
        />
      )}
    </div>
  );
}
