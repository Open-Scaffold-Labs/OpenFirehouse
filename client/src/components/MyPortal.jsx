/**
 * MyPortal.jsx — AI-Powered Member Portal: A Firefighter's Daily Operating System
 *
 * The first screen every firefighter sees. Replaces the legacy RMS Activity Entry,
 * Bulletin Board, Whiteboard, and My Info with an AI-powered daily hub.
 *
 * Sections:
 *  1. AI Shift Briefing (auto-generated)
 *  2. My Shift card (today's assignment, crew, apparatus)
 *  3. My Tasks card (pending activities, overdue checks)
 *  4. My Training card (compliance, upcoming, cert expirations)
 *  5. My Hours card (LOSAP, YTD hours)
 *  6. Activity Stream (filtered bulletin board)
 *  7. Quick Activity Logger
 *  8. Profile link
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Truck, Users, GraduationCap, Clock, Bell, Flame, CheckCircle,
  AlertTriangle, Calendar, Loader2, ChevronRight, Mic,
  Shield, FileText, MessageSquare, Zap,
  Coffee, User, Send, ChevronDown, ChevronUp, Mail,
} from 'lucide-react';
import { api } from '../utils/api';
import { localToday, localDayPlus } from '../utils/localDay';
import { useAttentionCount } from '../hooks/useAttentionCount';
import ActivityLoggerFull from './ActivityLogger';
import { DailyNotices, BoardHeader } from './EventCalendar';
import BulletinBoard from './BulletinBoard';
import MyLeave from './MyLeave';
import MyOtOffers from './MyOtOffers';

// ─── AI Shift Briefing Generator ─────────────────────────────────────────────

function generateBriefing(user, shift, training, alerts, weather) {
  const name = user?.name?.split(' ')[0] || 'Firefighter';
  const time = new Date().getHours();
  const greeting = time < 12 ? 'Good morning' : time < 17 ? 'Good afternoon' : 'Good evening';

  const parts = [`${greeting}, ${name}.`];

  if (shift) {
    parts.push(`You're on ${shift.apparatus || 'duty'} today${shift.crew?.length ? ` with ${shift.crew.join(', ')}` : ''}.`);
    if (shift.apparatusStatus) parts.push(`${shift.apparatus} is ${shift.apparatusStatus}.`);
  }

  if (training?.expiringSoon?.length) {
    const cert = training.expiringSoon[0];
    parts.push(`Your ${cert.course || cert.type || 'certification'} expires in ${cert.daysLeft} days.`);
  }

  if (training?.todayTraining) {
    parts.push(`Today's training: ${training.todayTraining}.`);
  }

  if (alerts?.length) {
    parts.push(`${alerts.length} alert${alerts.length > 1 ? 's' : ''} need${alerts.length === 1 ? 's' : ''} your attention.`);
  }

  if (weather) {
    parts.push(`Weather: ${weather}.`);
  }

  return parts.join(' ');
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color, onClick }) {
  return (
    <button onClick={onClick} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 text-left hover:shadow-md hover:border-red-200 transition-all w-full">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${color || 'bg-gray-100 dark:bg-gray-800'}`}>
          <Icon size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{value}</p>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
          {sub && <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 mt-2" />
      </div>
    </button>
  );
}

// ─── (removed) Activity Logger Quick Entry ──────────────────────────────────
//
// A local ACTIVITY_CATEGORIES array and a local ActivityLogger component lived
// here, left behind when this component was extracted into its own file. Neither
// was referenced: the portal renders ActivityLoggerFull (imported from
// './ActivityLogger') at the Log Activity card, and `ActivityLogger` here was
// shadowed and never mounted.
//
// Removed 2026-08-05 because the duplicate cost real time TWICE in one session —
// a tile recolor and a button recolor both went into this dead copy, passed the
// build and the tests, deployed, and changed nothing on screen. Both were caught
// only by grepping the served production bundle. Dead code that mirrors live code
// is not inert; it is a decoy that absorbs edits meant for the real thing.


// ─── Main Portal Component ───────────────────────────────────────────────────

// ─── Hey Firehouse Chat ───────────────────────────────────────────────────────

// `user` is a real parameter, not decoration: the greeting branch below falls back to
// `user?.name` when the member record has no name, and without it that line threw
// `user is not defined` — a ReferenceError hiding behind a `||`, so it only fired for
// members whose name was missing. Caught by the no-undef gate, not by any test.
function buildAIResponse(query, { user, member, myTraining, myHours, myIncidents, myTasks, bulletins, incidents, alerts }) {
  const q = query.toLowerCase();

  // Assignment / shift
  if (q.includes('assignment') || q.includes('apparatus') || q.includes('unit') || q.includes('assigned')) {
    return member
      ? `You are listed as ${member.rank || 'Firefighter'} — ${member.name}. Check the Schedule module for today's apparatus assignment.`
      : 'I don\'t have your shift assignment loaded. Check the Schedule module for today\'s run list.';
  }

  // Training / certs
  if (q.includes('training') || q.includes('cert') || q.includes('expir')) {
    if (myTraining.expiringSoon.length > 0) {
      const list = myTraining.expiringSoon.slice(0, 3).map(c => `${c.course || c.type} (${c.daysLeft} days)`).join(', ');
      return `You have ${myTraining.expiringSoon.length} certification(s) expiring soon: ${list}. Training compliance is at ${myTraining.compliance}%.`;
    }
    return `Your training compliance is ${myTraining.compliance}% with ${myTraining.records.length} records on file. All certifications are current.`;
  }

  // Hours / LOSAP
  if (q.includes('hour') || q.includes('losap')) {
    const pct = Math.round((myHours.ytd / myHours.losapTarget) * 100);
    return `You have ${myHours.ytd} volunteer hours year-to-date, which is ${pct}% of your ${myHours.losapTarget}-hour LOSAP target. Total career hours: ${Math.round(myHours.total)}.`;
  }

  // Incidents / calls
  if (q.includes('incident') || q.includes('call') || q.includes('run') || q.includes('respond')) {
    return `You have ${myIncidents} incidents on record in your career. For recent runs and dispatches, check the Live Dispatch or Incident Log modules.`;
  }

  // Notifications / alerts / tasks
  if (q.includes('notification') || q.includes('alert') || q.includes('task') || q.includes('pending') || q.includes('todo') || q.includes('attention')) {
    const alertCount = (alerts || []).length;
    return alertCount > 0
      ? `You have ${alertCount} notification${alertCount !== 1 ? 's' : ''} waiting. Head to the Notifications module to review and clear them.`
      : 'You\'re all caught up — no notifications right now.';
  }

  // Bulletins / updates
  if (q.includes('bulletin') || q.includes('update') || q.includes('news') || q.includes('message')) {
    return bulletins.length > 0
      ? `There ${bulletins.length === 1 ? 'is' : 'are'} ${bulletins.length} bulletin(s) posted. Check the Bulletin Board section for the latest department updates.`
      : 'No new bulletins at this time.';
  }

  // Greeting
  if (q.includes('hello') || q.includes('hey') || q.includes('hi ') || q === 'hi') {
    const name = member?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Firefighter';
    return `Hey ${name}! I'm Hey Firehouse, your AI assistant. You can ask me about your training, hours, certifications, incidents, tasks, or bulletins.`;
  }

  // What do I need to know
  if (q.includes('need to know') || q.includes('what\'s up') || q.includes('status') || q.includes('brief')) {
    const parts = [];
    const alertCount = (alerts || []).length;
    if (alertCount > 0) parts.push(`${alertCount} notification${alertCount !== 1 ? 's' : ''}`);
    if (myTraining.expiringSoon.length > 0) parts.push(`${myTraining.expiringSoon.length} cert(s) expiring soon`);
    if (bulletins.length > 0) parts.push(`${bulletins.length} bulletin(s) posted`);
    return parts.length > 0
      ? `Here's what needs your attention today: ${parts.join(', ')}.`
      : 'You\'re in good shape — no urgent items right now.';
  }

  // Fallback
  return `I can help you with your training records, certifications, LOSAP hours, shift assignment, incidents, tasks, and bulletins. Try asking something like "when does my EMT cert expire?" or "how many hours do I have?"`;
}

export default function MyPortal({ user, onNavigate, unreadMessageCount = 0 }) {
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [training, setTraining] = useState([]);
  const [hours, setHours] = useState([]);
  const [bulletins, setBulletins] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);

  // "Needs attention" from the ONE definition (hooks/useAttentionCount.js), so
  // this card cannot disagree with the sidebar bell. It used to count department
  // alerts ONLY — no workflow alerts, no unread bulletins, no unread DMs — so the
  // bell said 47 and this card said 36, one click apart, with nothing explaining
  // the gap. `alerts` (the actionable list) still drives the briefing prose below.
  const { total: attentionCount, alerts } = useAttentionCount(user, unreadMessageCount);

  // Hey Firehouse chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: 'Hey Firehouse is ready. Ask me anything about your shift, training, hours, or certifications.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatThinking, setChatThinking] = useState(false);
  const chatEndRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [memRes, trainRes, hourRes, bulRes, incRes, taskRes, msgRes] = await Promise.all([
        api.get('/api/members'),
        api.get('/api/training'),
        api.get('/api/volunteer-hours'),
        api.get('/api/bulletins').catch(() => ({ data: [] })),
        api.get('/api/incidents'),
        api.get('/api/workflows').catch(() => ({ data: [] })),
        api.get('/api/messages/unread-count').catch(() => ({ count: 0 })),
      ]);

      const members = memRes?.data || memRes || [];
      const me = members.find(m => m.name === user?.name) || members[0];
      setMember(me);
      setTraining(trainRes?.data || trainRes || []);
      setHours(hourRes?.data || hourRes || []);
      setBulletins(bulRes?.data || bulRes || []);
      setIncidents(incRes?.data || incRes || []);
      setTasks(taskRes?.data || taskRes || []);
      setUnreadMessages(msgRes?.count ?? 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Computed values
  const myTraining = useMemo(() => {
    if (!member) return { records: [], expiringSoon: [], compliance: 0, todayTraining: null };
    const records = (training || []).filter(t => t.memberId === member.id);
    // Local days, not UTC — a cert expiring TODAY must stay in "expiring soon"
    // for the whole local day, not drop out when UTC rolls over in the evening.
    const today = localToday();
    const soonStr = localDayPlus(90);
    const expiringSoon = records
      .filter(r => r.expiresDate && r.expiresDate >= today && r.expiresDate <= soonStr)
      .map(r => ({ ...r, daysLeft: Math.ceil((new Date(r.expiresDate) - new Date()) / 86400000) }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
    const passed = records.filter(r => r.status === 'Passed').length;
    const compliance = records.length ? Math.round((passed / records.length) * 100) : 100;
    return { records, expiringSoon, compliance, todayTraining: null };
  }, [member, training]);

  const myHours = useMemo(() => {
    if (!member) return { ytd: 0, total: 0, losapTarget: 50 };
    const yr = String(new Date().getFullYear());
    const memberHours = (hours || []).filter(h => h.memberId === member.id);
    const ytd = memberHours.filter(h => (h.date || '').startsWith(yr)).reduce((s, h) => s + (h.hours || 0), 0);
    return { ytd: Math.round(ytd * 10) / 10, total: memberHours.reduce((s, h) => s + (h.hours || 0), 0), losapTarget: 50 };
  }, [member, hours]);

  const myIncidents = useMemo(() => {
    if (!member) return 0;
    return (incidents || []).filter(i => i.personnel?.includes(member.name)).length;
  }, [member, incidents]);

  const myTasks = useMemo(() => {
    return (tasks || []).filter(t => t.assigned_to === user?.name && t.status !== 'completed').length;
  }, [tasks, user]);

  // Generate AI briefing
  const briefing = useMemo(() => {
    return generateBriefing(user, null, myTraining, [], null);
  }, [user, myTraining]);

  function sendChat(e) {
    e?.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    setChatMessages(m => [...m, { role: 'user', text }]);
    setChatInput('');
    setChatThinking(true);
    setTimeout(() => {
      const response = buildAIResponse(text, { user, member, myTraining, myHours, myIncidents, myTasks, bulletins, incidents, alerts });
      setChatMessages(m => [...m, { role: 'assistant', text: response }]);
      setChatThinking(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }, 600);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">Loading your portal...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Board Header (greeting, shift commander, weather, time) ── */}
      <BoardHeader />

      {/* ── Stat Cards Row ──
          Four cards in one row must answer the SAME KIND of question, or the row
          reads as four unrelated widgets. Two corrections here:
          · Notifications printed its number twice — "47" as the value and "47 need
            attention" underneath. That came in with the shared-count fix; the value
            says how many, so the subtitle should say what to do about it.
          · Messages showed an em-dash for zero, which at card size reads as a
            redaction bar, not a quantity. Zero is a number; print it. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Truck} label="My Assignment" color="bg-blue-600"
          value={member?.rank || 'On Duty'}
          sub={`${member?.name || user?.name || ''}`}
          onClick={() => onNavigate?.('schedule')}
        />
        <StatCard
          icon={Bell} label="Notifications" color={attentionCount > 0 ? 'bg-amber-600' : 'bg-green-600'}
          value={attentionCount}
          sub={attentionCount > 0 ? 'Need your attention' : 'All clear'}
          onClick={() => onNavigate?.('alerts')}
        />
        <StatCard
          icon={Calendar} label="The Board" color="bg-blue-700"
          value="View"
          sub="Daily schedule & assignments"
          onClick={() => onNavigate?.('calendar')}
        />
        <StatCard
          icon={Mail} label="Messages" color={unreadMessages > 0 ? 'bg-amber-600' : 'bg-gray-500'}
          value={unreadMessages}
          sub={unreadMessages > 0 ? `Unread message${unreadMessages !== 1 ? 's' : ''}` : 'No new messages'}
          onClick={() => onNavigate?.('messages')}
        />
      </div>

      {/* ── Quick Stats Bar ── */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5 bg-white dark:bg-gray-900 rounded-lg px-3 py-1.5 border border-gray-100 dark:border-gray-700">
          <Flame size={12} className="text-red-500" />
          <span className="font-bold text-gray-700 dark:text-gray-300">{myIncidents}</span>
          <span className="text-gray-500 dark:text-gray-400">incidents (career)</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white dark:bg-gray-900 rounded-lg px-3 py-1.5 border border-gray-100 dark:border-gray-700">
          <GraduationCap size={12} className="text-indigo-500" />
          <span className="font-bold text-gray-700 dark:text-gray-300">{myTraining.records.length}</span>
          <span className="text-gray-500 dark:text-gray-400">training records</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white dark:bg-gray-900 rounded-lg px-3 py-1.5 border border-gray-100 dark:border-gray-700">
          <Clock size={12} className="text-blue-500" />
          <span className="font-bold text-gray-700 dark:text-gray-300">{Math.round(myHours.total)}</span>
          <span className="text-gray-500 dark:text-gray-400">total volunteer hours</span>
        </div>
        {myTraining.expiringSoon.length > 0 && (
          <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/50 rounded-lg px-3 py-1.5 border border-amber-200 dark:border-amber-900">
            <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400" />
            <span className="font-bold text-amber-700 dark:text-amber-300">{myTraining.expiringSoon[0].course || 'Certification'}</span>
            <span className="text-amber-500">expires in {myTraining.expiringSoon[0].daysLeft} days</span>
          </div>
        )}
      </div>

      {/* ── Daily Notices + Bulletin Board (side by side) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <DailyNotices />
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <BulletinBoard />
        </div>
      </div>

      {/* ── My Leave (self-service balances + request time off, 1.2e) ── */}
      <MyLeave />

      {/* ── OT Offers (hiring engine, 1.5) — live offers + list standing ── */}
      <MyOtOffers />

      {/* ── Activity Logger (full legacy-RMS replacement) ── */}
      <ActivityLoggerFull user={user} onNavigate={onNavigate} />

      {/* ── Quick Links ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'My Training', icon: GraduationCap, page: 'training', color: 'text-indigo-600 dark:text-indigo-400' },
          { label: 'My Schedule', icon: Calendar, page: 'schedule', color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Station Log', icon: FileText, page: 'stationlog', color: 'text-gray-600 dark:text-gray-300' },
          { label: 'Full Profile', icon: User, page: 'roster', color: 'text-red-600 dark:text-red-400' },
        ].map(link => (
          <button key={link.page} onClick={() => onNavigate?.(link.page)}
            className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-gray-200 hover:shadow-sm transition-all">
            <link.icon size={14} className={link.color} />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{link.label}</span>
            <ChevronRight size={12} className="text-gray-300 dark:text-gray-600 ml-auto" />
          </button>
        ))}
      </div>

      {/* ── AI Shift Briefing + Hey Firehouse Chat ── */}
      {/* Solid violet, not a red gradient: standing ruling #2 — violet is the
          functional marker of an AI surface, it appears ONLY on AI surfaces, and
          no AI surface wears anything else. This card was red, which is the app's
          emergency colour and is what the ACTIVE INCIDENT banner wears. */}
      <div className="bg-violet-700 dark:bg-violet-800 rounded-2xl text-white shadow-lg overflow-hidden">
        {/* Briefing Header */}
        <div className="flex items-start gap-4 p-5">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Zap size={24} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] font-black text-violet-200 uppercase tracking-wider">AI Shift Briefing</p>
            </div>
            <p className="text-sm leading-relaxed text-violet-50">{briefing}</p>
          </div>
        </div>

        {/* Toggle Chat */}
        <div className="px-5 pb-3 border-t border-white/10 pt-3">
          <button
            onClick={() => setChatOpen(o => !o)}
            className="flex items-center gap-2 text-xs font-bold text-violet-100 hover:text-white transition-colors">
            <Mic size={12} />
            <span>Hey Firehouse — ask anything</span>
            {chatOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {/* Chat Panel */}
        {chatOpen && (
          <div className="border-t border-white/10">
            <div className="max-h-52 overflow-y-auto px-4 py-3 space-y-2">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-white/20 text-white'
                      : 'bg-black/20 text-violet-100'
                  }`}>
                    {msg.role === 'assistant' && (
                      <span className="text-[9px] font-black text-violet-200 uppercase tracking-wider block mb-0.5">Hey Firehouse</span>
                    )}
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatThinking && (
                <div className="flex justify-start">
                  <div className="bg-black/20 text-violet-100 px-3 py-2 rounded-xl text-xs flex items-center gap-1.5">
                    <Loader2 size={10} className="animate-spin" /> Thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChat} className="flex items-center gap-2 px-4 py-3 border-t border-white/10">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder='Ask anything — "when does my EMT expire?"'
                aria-label="Ask Hey Firehouse a question"
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white placeholder-violet-200 focus:outline-none focus:ring-2 focus:ring-white/30 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatThinking}
                aria-label="Send message"
                className="w-8 h-8 bg-white/20 hover:bg-white/30 disabled:opacity-40 rounded-lg flex items-center justify-center transition-all">
                <Send size={13} className="text-white" />
              </button>
            </form>
          </div>
        )}
      </div>

    </div>
  );
}
