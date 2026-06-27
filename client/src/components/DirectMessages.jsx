// DirectMessages — compose panel (email-style with subject line)
import { useState, useRef, useEffect } from 'react';
import { Mail, X, Plus, Send, Check, AlertCircle, Loader2, User } from 'lucide-react';
import { api } from '../utils/api';

// ─── Recipient Chip ───────────────────────────────────────────────────────────

function RecipientChip({ username, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 text-xs font-medium rounded-full pl-2 pr-1 py-0.5">
      <User size={10} className="flex-shrink-0" />
      @{username}
      <button
        onClick={onRemove}
        className="ml-0.5 p-0.5 hover:bg-red-200 dark:hover:bg-red-900 rounded-full transition-colors"
        title={`Remove @${username}`}
        aria-label={`Remove @${username}`}
      >
        <X size={10} />
      </button>
    </span>
  );
}

// ─── Compose Panel ────────────────────────────────────────────────────────────

export default function DirectMessages({ open, onClose, user, onSent }) {
  const [recipients,    setRecipients]    = useState([]);
  const [usernameInput, setUsernameInput] = useState('');
  const [subject,       setSubject]       = useState('');
  const [body,          setBody]          = useState('');
  const [sending,       setSending]       = useState(false);
  const [sent,          setSent]          = useState(false);
  const [error,         setError]         = useState('');
  const [addError,      setAddError]      = useState('');

  const panelRef    = useRef(null);
  const usernameRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  // Focus To: when opened
  useEffect(() => {
    if (open) setTimeout(() => usernameRef.current?.focus(), 50);
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setRecipients([]); setUsernameInput(''); setSubject('');
      setBody(''); setSent(false); setError(''); setAddError('');
    }
  }, [open]);

  function addRecipient() {
    const u = usernameInput.trim().replace(/^@/, '').toLowerCase();
    if (!u) return;
    if (recipients.includes(u)) { setAddError(`@${u} is already added.`); return; }
    if (u === user?.username?.toLowerCase()) { setAddError("You can't message yourself."); return; }
    setRecipients((prev) => [...prev, u]);
    setUsernameInput('');
    setAddError('');
    setTimeout(() => usernameRef.current?.focus(), 30);
  }

  function handleUsernameKey(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRecipient(); }
  }

  async function handleSend() {
    if (recipients.length === 0) { setError('Add at least one recipient.'); return; }
    if (!subject.trim())          { setError('Subject cannot be empty.'); return; }
    if (!body.trim())             { setError('Message body cannot be empty.'); return; }
    setError('');
    setSending(true);
    try {
      await api.post('/api/messages', {
        recipients,
        subject: subject.trim(),
        body:    body.trim(),
      });
      setSent(true);
      onSent?.(); // notify parent to refresh unread count
    } catch (err) {
      console.error('Message send error:', err);
      setError('Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  }

  function handleSendAnother() {
    setRecipients([]); setUsernameInput(''); setSubject('');
    setBody(''); setSent(false); setError(''); setAddError('');
    setTimeout(() => usernameRef.current?.focus(), 50);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end sm:pt-16 sm:pr-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div
        ref={panelRef}
        className="relative w-full sm:w-[480px] bg-white dark:bg-gray-900 rounded-b-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-red-700 text-white">
          <Mail size={18} />
          <div className="flex-1">
            <p className="text-sm font-bold leading-none">New Message</p>
            <p className="text-[11px] text-red-300 mt-0.5">Compose a direct message</p>
          </div>
          <button onClick={onClose} aria-label="Close compose panel" className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {sent ? (
          /* Success */
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-950/50 flex items-center justify-center">
              <Check size={28} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-900 dark:text-gray-100">Message Sent</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Delivered to{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">{recipients.map((r) => `@${r}`).join(', ')}</span>
              </p>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={handleSendAnother}
                className="px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-800 transition-colors">
                Compose Another
              </button>
              <button onClick={onClose}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Compose form — email field layout */
          <div className="flex flex-col flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">

            {/* To: */}
            <div className="flex items-start gap-3 px-4 py-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-1 w-14 shrink-0">To</span>
              <div className="flex-1">
                {recipients.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {recipients.map((u) => (
                      <RecipientChip key={u} username={u} onRemove={() => setRecipients((p) => p.filter((r) => r !== u))} />
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">@</span>
                    <input
                      ref={usernameRef}
                      type="text"
                      value={usernameInput}
                      onChange={(e) => { setUsernameInput(e.target.value); setAddError(''); }}
                      onKeyDown={handleUsernameKey}
                      placeholder="username"
                      aria-label="Recipient username"
                      className="w-full pl-6 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      autoComplete="off"
                      autoCapitalize="none"
                    />
                  </div>
                  <button
                    onClick={addRecipient}
                    disabled={!usernameInput.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
                  >
                    <Plus size={13} /> Add
                  </button>
                </div>
                {addError && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                    <AlertCircle size={11} /> {addError}
                  </p>
                )}
              </div>
            </div>

            {/* Subject: */}
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider w-14 shrink-0">Subject</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setError(''); }}
                placeholder="Enter a subject…"
                aria-label="Message subject"
                className="flex-1 text-sm border-0 outline-none focus:ring-0 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
            </div>

            {/* Body */}
            <div className="flex-1 px-4 py-3">
              <textarea
                value={body}
                onChange={(e) => { setBody(e.target.value); setError(''); }}
                placeholder="Write your message here…"
                aria-label="Message body"
                rows={8}
                className="w-full text-sm border-0 outline-none focus:ring-0 resize-none text-gray-800 dark:text-gray-100 placeholder-gray-400"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3">
              {error ? (
                <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle size={11} /> {error}
                </p>
              ) : (
                <p className="text-xs text-gray-400">
                  {recipients.length > 0
                    ? `To: ${recipients.map((r) => `@${r}`).join(', ')}`
                    : 'No recipients yet'}
                </p>
              )}
              <button
                onClick={handleSend}
                disabled={sending || recipients.length === 0 || !subject.trim() || !body.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {sending
                  ? <><Loader2 size={14} className="animate-spin" /> Sending…</>
                  : <><Send size={14} /> Send</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
