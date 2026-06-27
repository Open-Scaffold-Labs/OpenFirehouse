/**
 * AssistantWidget.jsx — Floating AI chat assistant (Phase 3)
 *
 * A floating button in the bottom-right corner that opens a chat panel.
 * Maintains conversation history for the session.
 * Sends current page and user role as context with each message.
 *
 * Props:
 *   user      — current user object { role, name, ... }
 *   activePage — current page id (e.g. 'training', 'incidents')
 *   onNavigate — called with page id to navigate
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, X, Send, ChevronDown, Loader2,
  AlertTriangle, Settings, RefreshCw, Flame,
} from 'lucide-react';
import { api } from '../utils/api';

// ─── suggested starters by page ──────────────────────────────────────────────
const PAGE_STARTERS = {
  training: [
    'Which members are at risk of missing LOSAP this year?',
    'How do I pass the NFIRS module and get CE credit?',
    'What are the NJ FF I & II hour requirements?',
  ],
  incidents: [
    'What NFIRS code for a kitchen fire?',
    'What code for a car accident with injuries?',
    'How do I add personnel to an incident?',
  ],
  roster: [
    'How do I add a new member?',
    'How do I update certifications on a member?',
    'What does the member status field mean?',
  ],
  dashboard: [
    'How do I read the apparatus status board?',
    'What are the weather alert thresholds?',
    'How do I get to LOSAP compliance?',
  ],
  apparatus: [
    'How do I mark apparatus out of service?',
    'How do I log an inspection?',
    'What is the apparatus check interval?',
  ],
  budget: [
    'How do I add a budget line?',
    'How do grant funds appear in the budget?',
    'Can I export the budget to a spreadsheet?',
  ],
  command: [
    'How do I set up the Command Board for an active incident?',
    'How do I assign units and personnel on the board?',
    'What do the ICS position colors mean?',
  ],
  'incident-response': [
    'What does my AI Mission Brief include?',
    'How is my cert level determined for guidance?',
    'What should I do if the AI brief seems wrong for this call?',
  ],
  hazmat: [
    'How do I log a HazMat exposure for a member?',
    'What are the NFPA HazMat decon documentation requirements?',
    'How do I add a new chemical to the inventory?',
  ],
  cad: [
    'Which CAD vendors does OpenFirehouse support?',
    'How do I configure the CAD connection?',
    'Why are dispatches not showing up automatically?',
  ],
  nfirs: [
    'What is the difference between NFIRS and NERIS export?',
    'How do I link an NFIRS report to an incident?',
    'What does the completeness percentage mean?',
  ],
  inspections: [
    'How do I schedule a fire inspection?',
    'How do I track violations and re-inspections?',
    'What permit types are available?',
  ],
  wellness: [
    'How do I log a physical exam for a member?',
    'What triggers the SCBA fit test expiry warning?',
    'How do I add a vaccination record?',
  ],
  grants: [
    'How do I track an AFG grant application?',
    'What grant lifecycle stages are available?',
    'How do I log expenditures against a grant?',
  ],
  default: [
    'What features does OpenFirehouse have?',
    'What are the NJ LOSAP requirements?',
    'What are the most common NFIRS codes?',
  ],
};

function getStarters(page) {
  return PAGE_STARTERS[page] || PAGE_STARTERS.default;
}

// ─── message bubble ───────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0 mt-0.5">
          <Flame size={13} className="text-red-600 dark:text-red-400" />
        </div>
      )}
      <div
        className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-red-600 text-white rounded-tr-sm'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-tl-sm'
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function AssistantWidget({ user, activePage, onNavigate }) {
  const [open,       setOpen]       = useState(false);
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const [unread,     setUnread]     = useState(0);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const starters   = getStarters(activePage);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // Focus input when opening
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current.focus(), 100);
    }
    if (open) setUnread(0);
  }, [open]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || loading) return;

    const userMsg = { role: 'user', content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setError(null);
    setKeyMissing(false);

    try {
      // Send only content+role (no extra fields) to the API
      const apiMessages = newMessages.map((m) => ({ role: m.role, content: m.content }));
      const res = await api.post('/api/assistant', {
        messages: apiMessages,
        context: {
          page: activePage || 'unknown',
          role: user ? user.role : 'member',
        },
      });

      const reply = res.reply || 'Sorry, no response received.';
      const assistantMsg = { role: 'assistant', content: reply };
      setMessages((prev) => [...prev, assistantMsg]);
      if (!open) setUnread((n) => n + 1);
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error === 'NO_API_KEY') {
        setKeyMissing(true);
      } else {
        setError(err.message || 'Failed to get response');
      }
      // Remove the user message we optimistically added if it failed hard
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, activePage, user, open]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    setKeyMissing(false);
  }

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── floating button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${
          open ? 'bg-gray-700 rotate-12' : 'bg-red-600 hover:bg-red-700'
        }`}
        title="AI Assistant"
        aria-label="AI Assistant"
      >
        {open ? <X size={22} className="text-white" /> : <Bot size={22} className="text-white" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {/* ── chat panel ── */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
          style={{ maxHeight: 'calc(100vh - 120px)' }}>

          {/* header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-red-600 text-white shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 dark:bg-gray-900/20 flex items-center justify-center">
              <Flame size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm"><span className="text-white">OPEN</span><span className="text-red-300">FIREHOUSE</span> Assistant</p>
              <p className="text-xs text-red-200">NFIRS · LOSAP · Training · Operations</p>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                  title="Clear chat"
                  aria-label="Clear chat"
                >
                  <RefreshCw size={14} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                aria-label="Minimize assistant"
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>

          {/* messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">

            {/* welcome state */}
            {messages.length === 0 && !keyMissing && (
              <div className="space-y-4">
                <div className="text-center pt-2">
                  <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center mx-auto mb-2">
                    <Flame size={20} className="text-red-600 dark:text-red-400" />
                  </div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">How can I help?</p>
                  <p className="text-xs text-gray-400 mt-0.5">Ask about NFIRS, LOSAP, certifications, or how to use any feature.</p>
                </div>

                {/* suggested starters */}
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-400 font-medium">Suggested questions</p>
                  {starters.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="w-full text-left text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-950 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-700 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-red-200 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* no API key state */}
            {keyMissing && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 p-4 text-center space-y-3">
                <AlertTriangle size={20} className="text-amber-500 mx-auto" />
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">AI Assistant not configured</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">Add an Anthropic API key in Station Settings to enable the assistant.</p>
                <button
                  onClick={() => { setOpen(false); if (onNavigate) onNavigate('settings'); }}
                  className="flex items-center gap-2 mx-auto text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded-lg transition-colors"
                >
                  <Settings size={13} /> Go to Settings
                </button>
              </div>
            )}

            {/* conversation */}
            {messages.map((m, i) => <Bubble key={i} msg={m} />)}

            {/* loading indicator */}
            {loading && (
              <div className="flex justify-start gap-2">
                <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0 mt-0.5">
                  <Flame size={13} className="text-red-600 dark:text-red-400" />
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2.5 rounded-2xl rounded-tl-sm">
                  <Loader2 size={14} className="text-gray-400 animate-spin" />
                </div>
              </div>
            )}

            {/* error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2">
                <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* input */}
          <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-3 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about NFIRS, LOSAP, features…"
                aria-label="Message the assistant"
                rows={1}
                className="flex-1 resize-none text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 max-h-24 leading-relaxed dark:bg-gray-900 dark:text-gray-100"
                style={{ minHeight: 38 }}
                onInput={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="p-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors shrink-0"
              >
                <Send size={15} />
              </button>
            </div>
            <p className="text-center text-xs text-gray-300 dark:text-gray-600 mt-1.5">Powered by Claude · Enter to send</p>
          </div>
        </div>
      )}
    </>
  );
}
