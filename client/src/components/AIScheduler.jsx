import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Bot, RotateCcw, CalendarCheck, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { buildAIResponse } from '../utils/scheduleEngine';

const EXAMPLE_PROMPTS = [
  'Schedule this weekend with at least one officer on each shift',
  'Cover next week — McGee has a conflict Thursday and Friday',
  'Build a full crew for day shifts tomorrow and the day after',
  'I need night shifts covered for the next 3 days, minimum 4 people',
  'Schedule next weekend, Chen is unavailable Saturday morning',
];

const SHIFT_COLORS = {
  'Day':          'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300',
  'Night':        'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-900 text-indigo-800 dark:text-indigo-300',
  'Duty Officer': 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300',
  '24-Hour':      'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300',
};

const SHIFT_ICONS = { 'Day': '☀️', 'Night': '🌙', 'Duty Officer': '🛡️', '24-Hour': '🕐' };

function ScheduleCard({ result }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-red-600 dark:text-red-400" />
          Generated Schedule — {result.schedule.length} day{result.schedule.length !== 1 ? 's' : ''}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {result.schedule.map(({ date, dateLabel, shifts }) => (
            <div key={date} className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{dateLabel}</p>
              <div className="space-y-2">
                {shifts.map((shift) => (
                  <div key={`${date}-${shift.shiftType}`}
                    className={`rounded-lg border px-3 py-2.5 ${SHIFT_COLORS[shift.shiftType] || SHIFT_COLORS['Day']}`}>
                    <p className="text-xs font-semibold mb-1.5">
                      {SHIFT_ICONS[shift.shiftType]} {shift.shiftType} Shift
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {shift.crew.map((name) => (
                        <span key={name}
                          className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-gray-900/70 border border-current/20 px-2 py-0.5 text-xs font-medium">
                          <span className="h-4 w-4 rounded-full bg-red-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                            {name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                          </span>
                          {name.split(' ').slice(-1)[0]}
                        </span>
                      ))}
                      {shift.crew.length === 0 && (
                        <span className="text-xs opacity-60 italic">No crew available</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/50 border-t border-amber-100 dark:border-amber-900">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 dark:text-amber-300">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold
        ${isUser ? 'bg-gray-600' : 'bg-red-700'}`}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed
          ${isUser
            ? 'bg-red-700 text-white rounded-tr-sm'
            : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-tl-sm shadow-sm'
          }`}>
          {msg.text}
        </div>
        {msg.result && <ScheduleCard result={msg.result} />}
        <p className="text-xs text-gray-400 mt-1 px-1">{msg.time}</p>
      </div>
    </div>
  );
}

export default function AIScheduler() {
  const [messages, setMessages] = useState([
    {
      id: 0,
      role: 'assistant',
      text: "Hi — I'm OpenFirehouse's scheduling assistant, powered by Claude. Tell me what you need and I'll build a schedule using your department's active members.\n\nYou can describe conflicts, minimum staffing requirements, specific shift types, or anything else — just type it naturally.",
      result: null,
      time: 'Now',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function now() {
    return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function handleSend(text) {
    const userText = (text || input).trim();
    if (!userText) return;
    setInput('');

    // Add user message
    setMessages((prev) => [...prev, {
      id: prev.length,
      role: 'user',
      text: userText,
      result: null,
      time: now(),
    }]);

    setLoading(true);

    // Simulate network latency for realism
    setTimeout(() => {
      const { intro, schedule, warnings } = buildAIResponse(userText);

      setMessages((prev) => [...prev, {
        id: prev.length,
        role: 'assistant',
        text: intro,
        result: { schedule, warnings },
        time: now(),
      }]);
      setLoading(false);
    }, 900);
  }

  function handleReset() {
    setMessages((prev) => [prev[0]]);
    setInput('');
  }

  return (
    <div className="space-y-4">
      {/* ── Header banner ──────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-gradient-to-r from-red-700 to-red-900 p-5 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 dark:bg-gray-900/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold">AI Scheduling Assistant</h2>
              <p className="text-xs text-red-200">Powered by Claude · Station 14 Maplewood VFD</p>
            </div>
          </div>
          <button onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 dark:bg-gray-900/10 hover:bg-white/20 px-3 py-1.5 text-xs font-medium text-white transition-colors">
            <RotateCcw className="h-3.5 w-3.5" /> New Session
          </button>
        </div>
      </div>

      {/* ── Prototype notice ───────────────────────────────────────────────── */}
      <div className="flex items-start gap-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 px-4 py-3">
        <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          <span className="font-semibold">Prototype mode:</span> scheduling logic runs locally against your member data.
          In production, requests are sent to the OpenFirehouse API and processed by the Claude API for full natural language understanding.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* ── Chat window ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 flex flex-col rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 overflow-hidden" style={{ height: '600px' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {messages.map((msg) => <ChatMessage key={msg.id} msg={msg} />)}

            {loading && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-red-700 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-950">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Describe your scheduling need…"
                aria-label="Describe your scheduling need"
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                aria-label="Send message"
                className="rounded-lg bg-red-700 px-4 py-2.5 text-white hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Example prompts sidebar ───────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Try these</p>
            <div className="space-y-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  disabled={loading}
                  className="w-full text-left text-xs text-gray-600 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-700 transition-colors leading-relaxed disabled:opacity-40"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Active Members</p>
            <p className="text-xs text-gray-400 mb-2">Available for scheduling:</p>
            <div className="space-y-1.5">
              {['Sarah Chen','Maria Delgado','Nathan McGee','Sandra Kim',
                'Tracy Benson','James Ortega','Mike Harrington','Amy Winters'].map((name) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-red-700 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                    {name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
