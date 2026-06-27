// MessagesInbox — email-style inbox for member-to-member messages
import { useState, useEffect, useCallback } from 'react';
import {
  Mail, MailOpen, Inbox, Pencil, RefreshCw, ArrowLeft, User,
  Calendar, Loader2, AlertCircle,
} from 'lucide-react';
import { api } from '../utils/api';
import DirectMessages from './DirectMessages';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFull(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Message Row (inbox list item) ───────────────────────────────────────────

function MessageRow({ msg, selected, onClick }) {
  const unread = !msg.read_at;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-start gap-3 ${
        selected ? 'bg-red-50 dark:bg-red-950/50 border-l-2 border-l-red-600' : ''
      }`}
    >
      {/* Unread dot */}
      <div className="mt-1.5 shrink-0">
        {unread
          ? <span className="block w-2 h-2 rounded-full bg-red-600" />
          : <span className="block w-2 h-2 rounded-full bg-transparent" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={`text-sm truncate ${unread ? 'font-bold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
            {msg.from_name || msg.from_username || 'Unknown'}
          </span>
          <span className="text-[11px] text-gray-400 shrink-0">{formatDate(msg.sent_at)}</span>
        </div>
        <p className={`text-xs truncate mb-0.5 ${unread ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
          {msg.subject || '(no subject)'}
        </p>
        <p className="text-[11px] text-gray-400 truncate">{msg.body}</p>
      </div>
    </button>
  );
}

// ─── Message Detail ───────────────────────────────────────────────────────────

function MessageDetail({ msg, onBack }) {
  return (
    <div className="flex flex-col h-full">
      {/* Detail header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <button
          onClick={onBack}
          className="md:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500 dark:text-gray-400"
          title="Back to inbox"
          aria-label="Back to inbox"
        >
          <ArrowLeft size={16} />
        </button>
        <MailOpen size={15} className="text-red-600 dark:text-red-400 shrink-0" />
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100 flex-1 truncate">{msg.subject || '(no subject)'}</span>
      </div>

      {/* Email metadata */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-400 w-12">From</span>
          <span className="font-semibold text-gray-800 dark:text-gray-100">
            {msg.from_name || 'Unknown'}
            {msg.from_username && (
              <span className="font-normal text-gray-400 ml-1">@{msg.from_username}</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-400 w-12">To</span>
          <span className="text-gray-700 dark:text-gray-300">@{msg.to_username}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-400 w-12">Date</span>
          <span className="text-gray-700 dark:text-gray-300">{formatFull(msg.sent_at)}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">{msg.body}</p>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyInbox() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
      <Inbox size={40} className="text-gray-200 mb-3" />
      <p className="text-sm font-bold text-gray-400">Your inbox is empty</p>
      <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Messages from other members will appear here.</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MessagesInbox({ user, onUnreadChange }) {
  const [messages,     setMessages]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState(null); // message object
  const [composeOpen,  setComposeOpen]  = useState(false);
  const [error,        setError]        = useState('');
  const [showDetail,   setShowDetail]   = useState(false); // mobile: show detail panel

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/messages');
      const data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setMessages(data);
      // Report unread count upward
      onUnreadChange?.(data.filter((m) => !m.read_at).length);
    } catch (err) {
      console.error(err);
      setError('Failed to load messages.');
    } finally {
      setLoading(false);
    }
  }, [onUnreadChange]);

  useEffect(() => { load(); }, [load]);

  async function handleSelect(msg) {
    setSelected(msg);
    setShowDetail(true);
    // Mark as read if unread
    if (!msg.read_at) {
      try {
        await api.patch(`/api/messages/${msg.id}/read`, {});
        setMessages((prev) =>
          prev.map((m) => m.id === msg.id ? { ...m, read_at: new Date().toISOString() } : m)
        );
        onUnreadChange?.((prev) => Math.max(0, (prev ?? 1) - 1));
      } catch (_) { /* non-fatal */ }
    }
  }

  const unreadCount = messages.filter((m) => !m.read_at).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Page header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Mail size={18} className="text-red-600 dark:text-red-400" />
          <h2 className="text-base font-black text-gray-900 dark:text-gray-100">Inbox</h2>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-red-600 text-white text-[11px] font-bold rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500 dark:text-gray-400"
            title="Refresh"
            aria-label="Refresh inbox"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setComposeOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <Pencil size={13} /> Compose
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Inbox list */}
        <div className={`flex flex-col border-r border-gray-100 dark:border-gray-700 ${
          showDetail ? 'hidden md:flex md:w-80 lg:w-96' : 'flex w-full md:w-80 lg:w-96'
        }`}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-gray-300 dark:text-gray-600" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 px-4 py-4 text-xs text-red-600 dark:text-red-400">
              <AlertCircle size={14} /> {error}
            </div>
          ) : messages.length === 0 ? (
            <EmptyInbox />
          ) : (
            <div className="overflow-y-auto flex-1">
              {messages.map((msg) => (
                <MessageRow
                  key={msg.id}
                  msg={msg}
                  selected={selected?.id === msg.id}
                  onClick={() => handleSelect(msg)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className={`flex-1 min-w-0 ${
          showDetail ? 'flex flex-col' : 'hidden md:flex md:flex-col'
        }`}>
          {selected ? (
            <MessageDetail msg={selected} onBack={() => setShowDetail(false)} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
              <MailOpen size={36} className="text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">Select a message to read it</p>
            </div>
          )}
        </div>
      </div>

      {/* Compose panel */}
      <DirectMessages
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        user={user}
        onSent={() => { setComposeOpen(false); load(); }}
      />
    </div>
  );
}
