/**
 * AskOpenFirehouse — in-app chat face of the same product.
 *
 * Opens after login from the top-bar "Ask Open Firehouse" control.
 * Inherits the signed-in user's session (no bot login). Duty/Board
 * reads go through POST /api/agent/invoke. Gated writes stay on the
 * Dashboard Accept queue. The word for the plumbing layer is never
 * shown here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronDown, ClipboardList, GraduationCap, Lock,
  Send, Sparkles, Sunrise, Users,
} from 'lucide-react';
import { ROLES, isOfficerPlus } from '../data/auth';
import { actingAsInitials, actingAsLine, actingAsRole } from '../utils/actingAs';
import {
  acceptApproval,
  listPendingApprovals,
  rejectApproval,
} from '../utils/askInvoke';
import MorningBriefPanel from './MorningBriefPanel';
import {
  CLOSEOUT_PLACEHOLDER,
  DUTY_BOARD_WELCOME,
  TRAINING_APPARATUS_PLACEHOLDER,
  runDutyBoardTurn,
} from '../utils/dutyBoardAgent';
import HouseMark from './HouseMark';

const MODES = [
  { id: 'duty-board', label: 'Duty / Board', icon: Users },
  { id: 'incident-closeout', label: 'Incident closeout', icon: ClipboardList },
  { id: 'training-apparatus', label: 'Training & Apparatus', icon: GraduationCap, locked: true },
];

const FACE_NAV = [
  { id: 'command', label: 'Dispatch' },
  { id: 'roster', label: 'Roster' },
  { id: 'apparatus', label: 'Apparatus' },
  { id: 'training', label: 'Training' },
  { id: 'dashboard', label: 'Dashboard' },
];

function formatClock(ts) {
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDay(ts) {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return '';
  }
}

function approvalTitle(item) {
  const verb = String(item.verb || '');
  if (verb === 'neris_submit') return 'NERIS Submission';
  if (verb === 'notify_chief') return 'Notify Chief';
  if (verb === 'apparatus_status_update') return 'Unit status';
  return item.summary || verb.replace(/_/g, ' ') || 'Pending action';
}

function approvalVerbLabel(verb) {
  if (verb === 'neris_submit') return 'NERIS';
  if (verb === 'notify_chief') return 'Notify';
  if (verb === 'apparatus_status_update') return 'Apparatus';
  return String(verb || 'Action').replace(/_/g, ' ');
}

export default function AskOpenFirehouse({ user, onNavigate, onLogout }) {
  const [mode, setMode] = useState('duty-board');
  const [rail, setRail] = useState('agents');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [actingOpen, setActingOpen] = useState(false);
  const [approvals, setApprovals] = useState([]);
  const [approvalsError, setApprovalsError] = useState(null);
  const [canReview, setCanReview] = useState(false);
  const [busyApproval, setBusyApproval] = useState(null);
  const [messages, setMessages] = useState(() => [
    { id: 'welcome', role: 'agent', text: DUTY_BOARD_WELCOME, at: Date.now() },
  ]);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const acting = actingAsLine(user);
  const roleInfo = ROLES[user?.role] ?? {};
  const officer = isOfficerPlus(user) || (Number(user?.roleLevel) || 0) >= 2;

  const loadApprovals = useCallback(() => {
    listPendingApprovals()
      .then((rows) => {
        setApprovals(rows);
        setCanReview(true);
        setApprovalsError(null);
      })
      .catch((err) => {
        setApprovals([]);
        setCanReview(false);
        if (err?.status && err.status !== 403) {
          setApprovalsError(err.message || 'Could not load pending items.');
        } else {
          setApprovalsError(null);
        }
      });
  }, []);

  useEffect(() => { loadApprovals(); }, [loadApprovals]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  const pendingCount = approvals.length;

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const userMsg = { id: `u-${Date.now()}`, role: 'user', text, at: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    if (mode === 'incident-closeout') {
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`, role: 'agent', text: CLOSEOUT_PLACEHOLDER, at: Date.now(),
      }]);
      return;
    }
    if (mode === 'training-apparatus') {
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`, role: 'agent', text: TRAINING_APPARATUS_PLACEHOLDER, at: Date.now(),
      }]);
      return;
    }

    setBusy(true);
    try {
      const turn = await runDutyBoardTurn(text);
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`, role: 'agent', text: turn.text, at: Date.now(),
      }]);
      loadApprovals();
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`,
        role: 'agent',
        text: err?.message || 'Could not read department data.',
        at: Date.now(),
      }]);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function selectMode(next) {
    setRail('agents');
    setMode(next);
    if (next === 'incident-closeout') {
      setMessages((prev) => [...prev, {
        id: `m-${Date.now()}`, role: 'agent', text: CLOSEOUT_PLACEHOLDER, at: Date.now(),
      }]);
    } else if (next === 'training-apparatus') {
      setMessages((prev) => [...prev, {
        id: `m-${Date.now()}`, role: 'agent', text: TRAINING_APPARATUS_PLACEHOLDER, at: Date.now(),
      }]);
    }
  }

  async function resolveItem(id, action) {
    setBusyApproval(id);
    setApprovalsError(null);
    try {
      if (action === 'accept') await acceptApproval(id);
      else await rejectApproval(id);
      setApprovals((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      setApprovalsError(err.message || `Could not ${action}.`);
    } finally {
      setBusyApproval(null);
    }
  }

  const dayLabel = useMemo(() => formatDay(Date.now()), []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#f4f6f8] text-slate-900" data-ask-face="open-firehouse">
      <header className="flex-shrink-0 bg-[#1e3a5f] text-white shadow-md">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2 min-w-0"
            title="Back to OpenFirehouse"
          >
            <HouseMark size={30} />
            <span className="hidden sm:block text-sm font-bold tracking-tight">
              OpenFirehouse
            </span>
          </button>

          <nav className="hidden md:flex flex-1 items-center justify-center gap-1">
            {FACE_NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c41e3a] px-3 py-1.5 text-xs font-bold text-white shadow-sm">
              <Sparkles size={13} aria-hidden="true" />
              <span className="hidden sm:inline">Ask Open Firehouse</span>
              <span className="sm:hidden">Ask</span>
            </span>
            <div className="hidden sm:flex items-center gap-2 pl-1">
              <div className="text-right leading-tight">
                <p className="text-xs font-semibold">{user?.name}</p>
                <p className="text-[10px] text-slate-300">{roleInfo.label || actingAsRole(user)}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-white/15 text-[11px] font-black flex items-center justify-center">
                {actingAsInitials(user)}
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="text-[10px] text-slate-300 hover:text-white underline-offset-2 hover:underline"
                >
                  Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="hidden sm:flex w-52 flex-col border-r border-slate-200 bg-white">
          <h2 className="px-4 pt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Agents
          </h2>
          <div className="px-2 space-y-1">
            {MODES.map((m) => {
              const Icon = m.icon;
              const selected = rail === 'agents' && mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectMode(m.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-md border-l-2 ${
                    selected
                      ? 'bg-red-50 border-[#c41e3a] text-[#c41e3a] font-semibold'
                      : 'border-transparent text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m.locked ? <Lock size={15} className="flex-shrink-0" /> : <Icon size={15} className="flex-shrink-0" />}
                  <span className="truncate">{m.label}</span>
                </button>
              );
            })}
          </div>
          <h2 className="px-4 pt-5 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Routines
          </h2>
          <div className="px-2 space-y-1">
            <button
              type="button"
              onClick={() => setRail('morning-brief')}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-md border-l-2 ${
                rail === 'morning-brief'
                  ? 'bg-red-50 border-[#c41e3a] text-[#c41e3a] font-semibold'
                  : 'border-transparent text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Sunrise size={15} className="flex-shrink-0" />
              <span className="truncate">Morning brief</span>
            </button>
          </div>
          <p className="mt-auto px-4 py-3 text-[10px] text-slate-400">
            Same session · {acting}
          </p>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          <div className="sm:hidden flex gap-1 px-3 py-2 overflow-x-auto border-b border-slate-200 bg-white">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => selectMode(m.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${
                  rail === 'agents' && mode === m.id ? 'bg-red-50 text-[#c41e3a]' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {m.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRail('morning-brief')}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${
                rail === 'morning-brief' ? 'bg-red-50 text-[#c41e3a]' : 'bg-slate-100 text-slate-600'
              }`}
            >
              Morning brief
            </button>
          </div>

          {rail === 'morning-brief' ? (
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4">
              <p className="text-xs text-slate-500 mb-3 leading-snug">
                A scheduled watch, not a chat persona. It reads the board, who is riding,
                and apparatus OOS as your badge. It stays quiet when the house is calm.
              </p>
              <MorningBriefPanel
                onRan={(out) => {
                  if (out?.digest) {
                    setMessages((prev) => [...prev, {
                      id: `brief-${Date.now()}`,
                      role: 'agent',
                      text: out.digest,
                      at: Date.now(),
                    }]);
                  }
                }}
              />
            </div>
          ) : (
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 space-y-4">
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex-1 h-px bg-slate-200" />
              {dayLabel}
              <span className="flex-1 h-px bg-slate-200" />
            </div>

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'agent' && (
                  <div className="flex-shrink-0 mt-0.5">
                    <HouseMark size={26} />
                  </div>
                )}
                <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div
                    className={`px-3.5 py-2 text-sm leading-snug whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-[#1e3a5f] text-white rounded-2xl rounded-br-md'
                        : 'bg-slate-200 text-slate-800 rounded-2xl rounded-bl-md'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className={`text-[10px] text-slate-400 px-1 ${msg.role === 'user' ? 'self-end' : ''}`}>
                    {formatClock(msg.at)}
                    {msg.role === 'user' ? ' ✓✓' : ''}
                  </span>
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex gap-2 items-center text-xs text-slate-500">
                <HouseMark size={22} />
                Reading the board…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          )}

          {rail !== 'morning-brief' && (
          <div className="flex-shrink-0 px-3 sm:px-6 pb-4">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-3 pt-3 pb-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                placeholder="Ask about the board, roster, or apparatus..."
                className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-slate-400"
                aria-label="Ask Open Firehouse"
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setActingOpen((o) => !o)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                    aria-expanded={actingOpen}
                  >
                    <Users size={12} aria-hidden="true" />
                    Acting as: {acting}
                    <ChevronDown size={11} />
                  </button>
                  {actingOpen && (
                    <div className="absolute left-0 bottom-full mb-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg z-10">
                      <p className="font-semibold text-slate-800">Same signed-in badge</p>
                      <p className="mt-1 leading-snug">
                        This chat uses your OpenFirehouse session — {acting}.
                        There is no separate bot account. Reads run as you;
                        unit clear and NERIS wait for a different officer on the Dashboard.
                      </p>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={send}
                  disabled={busy || !input.trim()}
                  className="p-2 rounded-full bg-[#1e3a5f] text-white disabled:opacity-40"
                  aria-label="Send"
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </div>
          )}
        </main>

        <aside className="hidden lg:flex w-72 flex-col border-l border-slate-200 bg-white">
          <div className="px-3 pt-3">
            <MorningBriefPanel compact onRan={(out) => {
              if (out?.digest) {
                setRail('morning-brief');
                setMessages((prev) => [...prev, {
                  id: `brief-${Date.now()}`,
                  role: 'agent',
                  text: out.digest,
                  at: Date.now(),
                }]);
              }
            }} />
          </div>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-sm font-bold text-slate-800">Needs your Accept</h2>
            {pendingCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#c41e3a] text-white text-[10px] font-black flex items-center justify-center">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </div>
          <p className="px-4 pb-2 text-[11px] text-slate-500 leading-snug">
            Unit clear and NERIS stay human-confirmed. You cannot accept your own request.
          </p>
          {approvalsError && (
            <p className="px-4 pb-2 text-[11px] text-red-600">{approvalsError}</p>
          )}
          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
            {!canReview && (
              <p className="px-1 text-xs text-slate-500">
                Officers review pending actions on the Dashboard. This chat will not bury Accept in a message.
              </p>
            )}
            {canReview && !approvals.length && (
              <p className="px-1 text-xs text-slate-500">Nothing waiting for Accept.</p>
            )}
            {approvals.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start gap-2">
                  <div className="h-8 w-8 rounded-md bg-[#1e3a5f] text-white text-[11px] font-black flex items-center justify-center flex-shrink-0">
                    {approvalVerbLabel(item.verb).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-800 truncate">{approvalTitle(item)}</p>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                        Pending
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 leading-snug">{item.summary}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {formatDay(item.created_at)}
                      {item.created_at ? ` · ${formatClock(item.created_at)}` : ''}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Submitted by: {item.requested_by_name || item.requested_by_role || 'agent'}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('dashboard')}
                    className="text-xs font-bold text-[#c41e3a] hover:underline"
                  >
                    Review in Dashboard →
                  </button>
                  {officer && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyApproval === item.id}
                        onClick={() => resolveItem(item.id, 'accept')}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-50"
                      >
                        <Check size={12} /> Accept
                      </button>
                      <button
                        type="button"
                        disabled={busyApproval === item.id}
                        onClick={() => resolveItem(item.id, 'reject')}
                        className="text-[11px] font-semibold text-red-600 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="lg:hidden border-t border-slate-200 bg-white px-3 py-2">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="w-full flex items-center justify-between text-xs font-bold text-[#c41e3a]"
        >
          <span>Needs your Accept{pendingCount ? ` (${pendingCount})` : ''}</span>
          <span>Review in Dashboard →</span>
        </button>
      </div>
    </div>
  );
}
