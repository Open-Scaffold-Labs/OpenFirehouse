import { useState } from 'react';
import { MessageSquarePlus, X, ChevronDown, Send, CheckCircle, AlertCircle, Wand2 } from 'lucide-react';
import { api } from '../utils/api';
import { fabSlotCls } from '../utils/fabRail';

// ─── Module list for dropdown ─────────────────────────────────────────────────

const MODULES = [
  'Dashboard',
  'Member Roster',
  'Duty Schedule',
  'Volunteer Hours',
  'Member Portal',
  'Training',
  'Health & Wellness',
  'Apparatus Tracker',
  'Maintenance Log',
  'Inspection Checklists',
  'Incident Log',
  'NFIRS / NERIS',
  'Hydrant Management',
  'Drills & Courses',
  'Station Daily Log',
  'Community Risk',
  'Pre-Incident Plans',
  'CAD Integration',
  'Fire Investigation',
  'Fire Inspections',
  'Mutual Aid',
  'Event Calendar',
  'Public Dashboard',
  'SOG Library',
  'Budget & Finance',
  'Grant Management',
  'Asset & Inventory',
  'Data Import',
  'Reports & Export',
  'AI Scheduling',
  'Station Settings',
  'General / Other',
];

const TYPES = [
  { id: 'feature',  label: '💡 Feature Request',  description: 'Suggest a new capability or improvement' },
  { id: 'bug',      label: '🐛 Bug Report',        description: 'Something isn\'t working correctly' },
  { id: 'question', label: '❓ Question',           description: 'Need help understanding how something works' },
  { id: 'support',  label: '🛠️ Support Request',   description: 'Need help with setup or configuration' },
];

const WEBHOOK_URL = import.meta.env.VITE_FEEDBACK_WEBHOOK_URL || null;

// ─── Select helper ────────────────────────────────────────────────────────────

function Select({ value, onChange, options, placeholder }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={placeholder}
        className="w-full appearance-none bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 pr-8 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={typeof o === 'string' ? o : o.id} value={typeof o === 'string' ? o : o.id}>
            {typeof o === 'string' ? o : o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

/**
 * FeedbackWidget — Report-a-Bug / Feature-Request panel.
 *
 * Two modes:
 *  - Uncontrolled (default): renders its own floating trigger button.
 *  - Controlled: pass `open` and `onOpenChange` and the parent owns the trigger
 *    (e.g. a header-bar button). The floating FAB is suppressed in this mode.
 */
export default function FeedbackWidget({
  user, settings,
  open: openProp,
  onOpenChange,
}) {
  const isControlled = typeof openProp === 'boolean' && typeof onOpenChange === 'function';
  const [openInternal, setOpenInternal] = useState(false);
  const open = isControlled ? openProp : openInternal;
  const setOpen = isControlled ? onOpenChange : setOpenInternal;
  const [type, setType]         = useState('');
  const [module, setModule]     = useState('');
  const [summary, setSummary]   = useState('');
  const [detail, setDetail]     = useState('');
  const [dept, setDept]         = useState(settings?.departmentName || '');
  const [email, setEmail]       = useState(user?.email || '');
  const [runSelfHeal, setRunSelfHeal] = useState(true);   // default ON for bugs
  const [selfHealNote, setSelfHealNote] = useState('');    // 'triggered' | 'failed' | ''
  const [status, setStatus]     = useState('idle'); // idle | submitting | success | error
  const [errMsg, setErrMsg]     = useState('');

  function reset() {
    setType(''); setModule(''); setSummary(''); setDetail('');
    setDept(settings?.departmentName || ''); setEmail(user?.email || '');
    setRunSelfHeal(true); setSelfHealNote('');
    setStatus('idle'); setErrMsg('');
  }

  function handleClose() {
    setOpen(false);
    setTimeout(reset, 300);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!type || !summary.trim()) return;

    setStatus('submitting');

    const payload = {
      type,
      module: module || 'General / Other',
      summary: summary.trim(),
      detail: detail.trim(),
      department: dept.trim(),
      email: email.trim(),
      submittedAt: new Date().toISOString(),
      appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.7.0.1',
    };

    // For bugs with self-heal opted in, also kick off the AI diagnosis pass.
    // This is the same payload BugReporter used to send (page route +
    // browser context). Failures here don't block the main submit — the
    // primary feedback delivery still succeeds.
    const wantsSelfHeal = type === 'bug' && runSelfHeal;
    const selfHealPromise = wantsSelfHeal
      ? api.post('/api/debug-agent/report', {
          description: `${summary.trim()}\n\n${detail.trim()}`.trim(),
          page_route: window.location.pathname,
          context_bundle: {
            url: window.location.href,
            userAgent: navigator.userAgent,
            viewport: { w: window.innerWidth, h: window.innerHeight },
            timestamp: new Date().toISOString(),
            module: payload.module,
            department: payload.department,
          },
        }).then(() => setSelfHealNote('triggered'))
          .catch(() => setSelfHealNote('failed'))
      : Promise.resolve();

    try {
      if (WEBHOOK_URL) {
        const res = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
      } else {
        // Dev mode — simulate network delay
        await new Promise(r => setTimeout(r, 800));
        console.log('[Open Firehouse Feedback]', payload);
      }
      // Wait for self-heal to finish so we can show a unified status.
      await selfHealPromise;
      setStatus('success');
    } catch (err) {
      setErrMsg(err.message || 'Submission failed. Please try again.');
      setStatus('error');
    }
  }

  const canSubmit = type && summary.trim().length > 0 && status === 'idle';

  return (
    <>
      {/* ── Floating trigger button (only when uncontrolled) ─────────────── */}
      {!isControlled && (
        <button
          onClick={() => setOpen(true)}
          className={`${fabSlotCls('feedback')} z-30 flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg transition-all hover:shadow-xl hover:scale-105 active:scale-95`}
          title="Send feedback or request a feature"
        >
          <MessageSquarePlus size={16} />
          <span>Feedback</span>
        </button>
      )}

      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={handleClose}
        />
      )}

      {/* ── Panel ────────────────────────────────────────────────────────── */}
      <div className={`
        fixed bottom-0 right-0 z-50 w-full sm:w-[440px] sm:bottom-5 sm:right-5
        bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700
        transform transition-all duration-300 ease-out
        ${open ? 'translate-y-0 opacity-100' : 'translate-y-full sm:translate-y-8 opacity-0 pointer-events-none'}
      `}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Send Feedback</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Help us improve <span className="font-semibold text-gray-600 dark:text-gray-300">OPEN</span><span className="font-semibold text-red-600 dark:text-red-400">FIREHOUSE</span> for your department</p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close feedback panel"
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[80vh] overflow-y-auto">

          {status === 'success' ? (
            /* ── Success state ── */
            <div className="py-8 text-center">
              <CheckCircle className="mx-auto text-green-500 mb-3" size={40} />
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Thank you!</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-3">
                Your feedback has been received. We review every submission and prioritize based on community votes.
              </p>
              {selfHealNote === 'triggered' && (
                <div className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 px-3 py-1.5 rounded-full">
                  <Wand2 size={12} />
                  AI diagnosis started — a chief can dispatch a self-heal from the admin view.
                </div>
              )}
              {selfHealNote === 'failed' && (
                <div className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-full">
                  Self-heal couldn't be triggered, but your report was saved.
                </div>
              )}
              {selfHealNote === '' && <div className="mb-5" />}
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            /* ── Form ── */
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TYPES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setType(t.id)}
                      className={`text-left px-3 py-2.5 rounded-lg border-2 text-xs font-medium transition-all ${
                        type === t.id
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span className="block font-semibold">{t.label}</span>
                      <span className="block text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{t.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Module */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Module</label>
                <Select
                  value={module}
                  onChange={setModule}
                  options={MODULES}
                  placeholder="Which module does this relate to?"
                />
              </div>

              {/* Summary */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Summary <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  aria-label="Summary"
                  placeholder="One-line description of your feedback"
                  maxLength={120}
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-900"
                />
                <p className="text-right text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{summary.length}/120</p>
              </div>

              {/* Detail */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Details <span className="text-gray-500 dark:text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={detail}
                  onChange={e => setDetail(e.target.value)}
                  aria-label="Details"
                  placeholder="Steps to reproduce, expected behavior, use case, etc."
                  rows={3}
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none dark:bg-gray-900"
                />
              </div>

              {/* Self-heal opt-in — only when this is a bug report */}
              {type === 'bug' && (
                <label
                  className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                    runSelfHeal
                      ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900 hover:bg-amber-100 dark:hover:bg-amber-950/50'
                      : 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={runSelfHeal}
                    onChange={e => setRunSelfHeal(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-400 text-amber-600 dark:text-amber-400 focus:ring-amber-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800 dark:text-gray-100">
                      <Wand2 size={13} className="text-amber-600 dark:text-amber-400" />
                      Run AI diagnosis on this bug
                    </div>
                    <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5 leading-snug">
                      The assistant will read your description plus the current page route and try to
                      identify the root cause. A chief can then dispatch a self-heal fix from the admin view.
                    </p>
                  </div>
                </label>
              )}

              {/* Dept + Email row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Department</label>
                  <input
                    type="text"
                    value={dept}
                    onChange={e => setDept(e.target.value)}
                    aria-label="Department"
                    placeholder="Your dept name"
                    className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    aria-label="Email"
                    placeholder="For follow-up"
                    className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-900"
                  />
                </div>
              </div>

              {/* Error */}
              {status === 'error' && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                  <span>{errMsg}</span>
                </div>
              )}

              {/* Submit */}
              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  Free &amp; open source · Your feedback shapes development
                </p>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:bg-gray-200 disabled:text-gray-600 dark:disabled:bg-gray-700 dark:disabled:text-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {status === 'submitting' ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Sending…
                    </span>
                  ) : (
                    <>
                      <Send size={13} />
                      Submit
                    </>
                  )}
                </button>
              </div>

            </form>
          )}
        </div>
      </div>
    </>
  );
}
