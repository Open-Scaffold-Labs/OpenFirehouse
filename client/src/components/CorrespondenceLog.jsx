/**
 * CorrespondenceLog — Universal component for logging correspondence
 * (pasted emails, uploaded files, notes) against any module record.
 *
 * Usage:
 *   <CorrespondenceLog module="grievances" recordId={7} recordLabel="GRV-2026-001" />
 *   <CorrespondenceLog module="personnel-actions" recordId={12} recordLabel="PA-2026-003" />
 *
 * Features:
 *   - Paste email content (from, subject, body)
 *   - Add file reference (name, URL)
 *   - Add free-form notes
 *   - Chronological display with entry type badges
 *   - Delete entries
 *   - Collapsible panel matching Attachments pattern
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Mail, Plus, ChevronDown, ChevronUp, FileText, File, Trash2,
  Loader2, X, MessageSquare, Paperclip, ExternalLink, Clock,
  Upload,
} from 'lucide-react';
import AIWriteTextarea from './AIWriteTextarea';
import DictateInput from './DictateInput';
import { api, getToken } from '../utils/api';

const TYPE_CONFIG = {
  email: { icon: Mail,          label: 'Email',  color: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/50',   badge: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'   },
  file:  { icon: Paperclip,     label: 'File',   color: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/50', badge: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' },
  note:  { icon: MessageSquare, label: 'Note',   color: 'border-l-gray-400 bg-gray-50 dark:bg-gray-950',   badge: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'   },
};

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// ── Single Entry Card ────────────────────────────────────────────────────────

function EntryCard({ entry, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const cfg = TYPE_CONFIG[entry.entry_type] || TYPE_CONFIG.note;
  const Icon = cfg.icon;

  const handleDelete = async () => {
    if (!window.confirm('Delete this correspondence entry?')) return;
    setDeleting(true);
    try {
      await api.delete(`/api/correspondence/${entry.id}`);
      onDelete(entry.id);
    } catch (e) {
      alert('Failed to delete entry');
    } finally {
      setDeleting(false);
    }
  };

  const bodyPreview = entry.body?.length > 150 ? entry.body.slice(0, 150) + '…' : entry.body;

  return (
    <div className={`rounded-lg border-l-4 border-r border-t border-b border-gray-200 dark:border-gray-700 ${cfg.color}`}>
      {/* Header */}
      <div
        className="flex items-start gap-2 px-3 py-2.5 cursor-pointer"
        role="button" tabIndex={0} aria-expanded={expanded} aria-label={`Toggle correspondence entry ${entry.subject || entry.file_name || cfg.label}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
        onClick={() => setExpanded(!expanded)}
      >
        <Icon size={14} className="text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cfg.badge}`}>
              {cfg.label}
            </span>
            {entry.subject && (
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{entry.subject}</span>
            )}
            {!entry.subject && entry.file_name && (
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{entry.file_name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500 dark:text-gray-400">
            {entry.from_name && <span>From: {entry.from_name}</span>}
            {entry.from_name && entry.created_at && <span>·</span>}
            {entry.created_at && (
              <span className="flex items-center gap-0.5">
                <Clock size={9} />
                {fmtDate(entry.created_at)} {fmtTime(entry.created_at)}
              </span>
            )}
            {entry.entered_by && <span>· by {entry.entered_by}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {entry.file_url && (
            <a
              href={entry.file_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
              title="Open file"
              aria-label="Open file"
            >
              <ExternalLink size={12} />
            </a>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            disabled={deleting}
            className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors disabled:opacity-50"
            title="Delete"
            aria-label="Delete correspondence entry"
          >
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
          {expanded ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
        </div>
      </div>

      {/* Body — collapsed preview or full */}
      {entry.body && (
        <div className="px-3 pb-2.5">
          <div className={`text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed ${!expanded ? 'line-clamp-2' : ''}`}>
            {expanded ? entry.body : bodyPreview}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add Entry Form ──────────────────────────────────────────────────────────

function AddEntryForm({ module, recordId, onAdd }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('email'); // email | file | note
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null); // File object for upload
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState({
    from_name: '',
    subject: '',
    body: '',
    file_name: '',
    file_url: '',
    entered_by: '',
  });

  const reset = () => {
    setForm({ from_name: '', subject: '', body: '', file_name: '', file_url: '', entered_by: '' });
    setSelectedFile(null);
    setDragOver(false);
    setTab('email');
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    setSelectedFile(file);
    setForm(f => ({ ...f, file_name: file.name }));
  };

  const handleSubmit = async () => {
    // Validate
    if (tab === 'email' && !form.body.trim()) {
      alert('Please paste the email content');
      return;
    }
    if (tab === 'file' && !selectedFile && !form.file_url.trim()) {
      alert('Please select a file or enter a file URL');
      return;
    }
    if (tab === 'note' && !form.body.trim()) {
      alert('Please enter a note');
      return;
    }

    setLoading(true);
    try {
      let result;

      if (tab === 'file' && selectedFile) {
        // Use multipart upload endpoint
        const fd = new FormData();
        fd.append('file', selectedFile);
        fd.append('module', module);
        fd.append('record_id', String(recordId));
        fd.append('from_name', form.from_name.trim());
        fd.append('subject', form.subject.trim());
        fd.append('body', form.body.trim());
        fd.append('entered_by', form.entered_by.trim());

        const BASE = import.meta.env.VITE_API_URL || '';
        const token = getToken();
        const resp = await fetch(`${BASE}/api/correspondence/upload`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `Upload failed (${resp.status})`);
        }
        result = await resp.json();
      } else {
        // JSON post for email/note/file-link
        const res = await api.post('/api/correspondence', {
          module,
          record_id: recordId,
          entry_type: tab,
          from_name: form.from_name.trim(),
          subject: form.subject.trim(),
          body: form.body.trim(),
          file_name: form.file_name.trim(),
          file_url: form.file_url.trim(),
          entered_by: form.entered_by.trim(),
        });
        result = res;
      }

      onAdd(result.data || result);
      reset();
      setOpen(false);
    } catch (e) {
      alert(`Failed to add entry: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 rounded-lg hover:bg-red-100 dark:hover:bg-red-900 transition-colors border border-red-200 dark:border-red-900"
      >
        <Plus size={12} />
        Add Correspondence
      </button>
    );
  }

  const inputCls = 'w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent';
  const labelCls = 'block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1';

  return (
    <div className="bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Add Correspondence</span>
        <button onClick={() => { reset(); setOpen(false); }} aria-label="Close add correspondence form" className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
          <X size={14} />
        </button>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
        {[
          { key: 'email', icon: Mail,          label: 'Paste Email' },
          { key: 'file',  icon: Upload,        label: 'Upload File' },
          { key: 'note',  icon: MessageSquare,  label: 'Note'       },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              tab === t.key ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <t.icon size={11} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Email paste fields */}
      {tab === 'email' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>From</label>
              <input value={form.from_name} onChange={e => setForm(f => ({ ...f, from_name: e.target.value }))}
                placeholder="Sender name or email" aria-label="From" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Subject</label>
              <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Email subject line" aria-label="Subject" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Email Body <span className="text-red-600 dark:text-red-400">*</span></label>
            <AIWriteTextarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Paste the email content here…"
              rows={6} name="body" id="email-body" />
            <p className="text-[10px] text-gray-400 mt-1">{form.body.length} characters</p>
          </div>
        </div>
      )}

      {/* File upload fields */}
      {tab === 'file' && (
        <div className="space-y-2">
          {/* Drag & drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileSelect(file);
            }}
            className={`relative rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
              dragOver
                ? 'border-red-400 bg-red-50 dark:bg-red-950/50'
                : selectedFile
                  ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/50'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2">
                <FileText size={16} className="text-green-600 dark:text-green-400" />
                <span className="text-xs font-semibold text-green-800 dark:text-green-300">{selectedFile.name}</span>
                <span className="text-[10px] text-green-600 dark:text-green-400">
                  ({(selectedFile.size / 1024).toFixed(0)} KB)
                </span>
                <button onClick={() => { setSelectedFile(null); setForm(f => ({ ...f, file_name: '' })); }}
                  aria-label="Remove selected file"
                  className="ml-2 p-0.5 text-gray-400 hover:text-red-600 rounded">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <>
                <Upload size={20} className="mx-auto text-gray-400 mb-1" />
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  Drag & drop a file here, or{' '}
                  <label className="text-red-600 dark:text-red-400 hover:text-red-700 cursor-pointer font-semibold underline">
                    browse
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.jpg,.jpeg,.png,.gif,.webp,.eml,.msg,.zip"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file);
                        e.target.value = ''; // reset so same file can be re-selected
                      }}
                    />
                  </label>
                </p>
                <p className="text-[10px] text-gray-400 mt-1">PDF, Word, Excel, images, .eml — up to 25 MB</p>
              </>
            )}
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <AIWriteTextarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Optional notes about this file…"
              rows={2} name="body" id="file-description" />
          </div>
        </div>
      )}

      {/* Note fields */}
      {tab === 'note' && (
        <div className="space-y-2">
          <div>
            <label className={labelCls}>Subject</label>
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Brief subject (optional)" aria-label="Subject" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Note <span className="text-red-600 dark:text-red-400">*</span></label>
            <AIWriteTextarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Enter your note…"
              rows={4} name="body" id="note-body" />
          </div>
        </div>
      )}

      {/* Entered by (always visible) */}
      <div>
        <label className={labelCls}>Entered By</label>
        <input value={form.entered_by} onChange={e => setForm(f => ({ ...f, entered_by: e.target.value }))}
          placeholder="Your name" aria-label="Entered by" className={inputCls} />
      </div>

      {/* Submit */}
      <div className="flex gap-2 pt-1">
        <button onClick={handleSubmit} disabled={loading}
          className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {loading ? 'Adding…' : `Add ${tab === 'email' ? 'Email' : tab === 'file' ? 'File' : 'Note'}`}
        </button>
        <button onClick={() => { reset(); setOpen(false); }}
          className="flex-1 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function CorrespondenceLog({
  module,
  recordId,
  recordLabel = '',
}) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const fetchEntries = useCallback(async () => {
    if (!module || !recordId) { setLoading(false); return; }
    try {
      const res = await api.get(`/api/correspondence?module=${module}&record_id=${recordId}`);
      const data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [module, recordId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleDelete = (id) => setEntries(prev => prev.filter(e => e.id !== id));
  const handleAdd = (entry) => setEntries(prev => [entry, ...prev]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-gray-400">
        <Loader2 size={14} className="animate-spin mr-2" />
        <span className="text-xs">Loading correspondence…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-blue-500" />
          <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
            Correspondence
            {entries.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-bold">
                {entries.length}
              </span>
            )}
          </span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="space-y-2">
          {entries.length === 0 ? (
            <div className="text-center py-5 text-gray-400 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700">
              <Mail size={20} className="mx-auto mb-1.5 opacity-30" />
              <p className="text-xs font-medium">No correspondence logged yet.</p>
              <p className="text-[10px] mt-0.5">Paste emails, link files, or add notes to build the paper trail.</p>
            </div>
          ) : (
            entries.map(entry => (
              <EntryCard key={entry.id} entry={entry} onDelete={handleDelete} />
            ))
          )}

          <AddEntryForm
            module={module}
            recordId={recordId}
            onAdd={handleAdd}
          />
        </div>
      )}
    </div>
  );
}
