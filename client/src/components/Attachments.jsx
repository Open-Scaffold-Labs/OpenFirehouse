/**
 * Attachments — A shared component for displaying and managing file attachments
 * linked to any module's records via the module + record_id pattern.
 *
 * Usage:
 *   <Attachments module="aid-agreements" recordId={42} recordLabel="Riverside FD Agreement" />
 *   <Attachments module="grievances" recordId={7} recordLabel="GRV-2026-001" />
 *
 * Features:
 *   - Lists all attachments linked to a specific module record
 *   - Shows file type, size, upload date, category, and description
 *   - Add new attachment form with file URL, name, category, and description
 *   - Delete attachment with confirmation
 *   - Collapsible panel matching LinkedMeetings pattern
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Paperclip, Plus, ChevronDown, ChevronUp, FileText, Image, File,
  Trash2, ExternalLink, Loader2, X,
} from 'lucide-react';
import { api } from '../utils/api';

// Category color mapping for left border
const CATEGORY_COLORS = {
  source_document: 'border-l-red-600 bg-red-50 dark:bg-red-950/50',
  supplemental: 'border-l-blue-600 bg-blue-50 dark:bg-blue-950/50',
  photo: 'border-l-amber-600 bg-amber-50 dark:bg-amber-950/50',
  legal: 'border-l-purple-600 bg-purple-50 dark:bg-purple-950/50',
  general: 'border-l-gray-400 bg-gray-50 dark:bg-gray-950',
};

const CATEGORY_LABELS = {
  source_document: 'Source Document',
  supplemental: 'Supplemental',
  photo: 'Photo',
  legal: 'Legal',
  general: 'General',
};

// Format file size in human-readable format
function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Format date as "Jan 15, 2026"
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

// Get icon based on file extension
function getFileIcon(fileName) {
  if (!fileName) return <File size={14} className="text-gray-500 dark:text-gray-400" />;
  const ext = fileName.toLowerCase().split('.').pop();
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) {
    return <FileText size={14} className="text-gray-600 dark:text-gray-300" />;
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return <Image size={14} className="text-gray-600 dark:text-gray-300" />;
  }
  return <File size={14} className="text-gray-500 dark:text-gray-400" />;
}

// ── Single Attachment Card ──────────────────────────────────────────────────────

function AttachmentCard({ attachment, onDelete }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${attachment.file_name}"?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/api/attachments/${attachment.id}`);
      onDelete(attachment.id);
    } catch (e) {
      console.error('Failed to delete attachment:', e);
      alert('Failed to delete attachment');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`rounded-lg border-l-4 border-r border-t border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-start justify-between gap-3 ${CATEGORY_COLORS[attachment.category] || CATEGORY_COLORS.general}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2 mb-1">
          <div className="flex-shrink-0 mt-0.5">
            {getFileIcon(attachment.file_name)}
          </div>
          <div className="min-w-0 flex-1">
            <a
              href={attachment.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-red-600 hover:underline truncate block"
            >
              {attachment.file_name}
            </a>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white dark:bg-gray-900 bg-opacity-60 text-gray-700 dark:text-gray-300">
                {CATEGORY_LABELS[attachment.category] || attachment.category}
              </span>
              {attachment.file_size && (
                <span className="text-[10px] text-gray-600 dark:text-gray-300">
                  {formatFileSize(attachment.file_size)}
                </span>
              )}
              {attachment.created_at && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {fmtDate(attachment.created_at)}
                </span>
              )}
              {attachment.is_source && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-200 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-200">
                  Source
                </span>
              )}
            </div>
            {attachment.description && (
              <p className="text-xs text-gray-700 dark:text-gray-300 mt-2 leading-relaxed">
                {attachment.description}
              </p>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="flex-shrink-0 p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-white dark:hover:bg-gray-900 rounded-lg transition-colors disabled:opacity-50"
        title="Delete attachment"
        aria-label={`Delete attachment ${attachment.file_name}`}
      >
        {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      </button>
    </div>
  );
}

// ── Add Attachment Form ─────────────────────────────────────────────────────────

function AddAttachmentForm({ module, recordId, accessLevel, onAdd }) {
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    file_name: '',
    file_url: '',
    category: 'general',
    description: '',
    is_source: false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.file_name.trim() || !formData.file_url.trim()) {
      alert('File name and URL are required');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/api/attachments', {
        module,
        record_id: recordId,
        file_name: formData.file_name.trim(),
        file_url: formData.file_url.trim(),
        category: formData.category,
        description: formData.description.trim(),
        is_source: formData.is_source,
        access_level: accessLevel,
      });
      onAdd(res.data || res);
      setFormData({
        file_name: '',
        file_url: '',
        category: 'general',
        description: '',
        is_source: false,
      });
      setFormOpen(false);
    } catch (e) {
      console.error('Failed to add attachment:', e);
      alert(`Failed to add attachment: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!formOpen) {
    return (
      <button
        onClick={() => setFormOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 rounded-lg hover:bg-red-100 dark:hover:bg-red-900 transition-colors border border-red-200 dark:border-red-900"
      >
        <Plus size={12} />
        Add Attachment
      </button>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Add New Attachment</span>
        <button
          onClick={() => setFormOpen(false)}
          aria-label="Close add attachment form"
          className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            File Name <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <input
            type="text"
            name="file_name"
            value={formData.file_name}
            onChange={handleChange}
            placeholder="e.g., agreement-2026.pdf"
            aria-label="File name"
            className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            File URL <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <input
            type="url"
            name="file_url"
            value={formData.file_url}
            onChange={handleChange}
            placeholder="https://example.com/file.pdf"
            aria-label="File URL"
            className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Category
          </label>
          <select
            name="category"
            value={formData.category}
            onChange={handleChange}
            aria-label="Category"
            className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="general">General</option>
            <option value="source_document">Source Document</option>
            <option value="supplemental">Supplemental</option>
            <option value="photo">Photo</option>
            <option value="legal">Legal</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Optional notes about this attachment..."
            aria-label="Description"
            rows="2"
            className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            name="is_source"
            checked={formData.is_source}
            onChange={handleChange}
            className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 focus:ring-red-500"
          />
          <span className="font-medium text-gray-700 dark:text-gray-300">Mark as source document</span>
        </label>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {loading ? 'Adding...' : 'Add Attachment'}
          </button>
          <button
            type="button"
            onClick={() => setFormOpen(false)}
            className="flex-1 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────────

export default function Attachments({
  module,
  recordId,
  recordLabel = '',
  accessLevel = 'all',
}) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const fetchAttachments = useCallback(async () => {
    if (!module || !recordId) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get(`/api/attachments?module=${module}&record_id=${recordId}`);
      const data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setAttachments(data);
    } catch (e) {
      console.error('Failed to fetch attachments:', e);
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }, [module, recordId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleDelete = (id) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleAdd = (newAttachment) => {
    setAttachments(prev => [newAttachment, ...prev]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
        <Loader2 size={16} className="animate-spin mr-2" />
        <span className="text-sm">Loading attachments…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Paperclip size={16} className="text-slate-500" />
          <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
            Attachments
            {attachments.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
                {attachments.length}
              </span>
            )}
          </span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-500 dark:text-gray-400" /> : <ChevronDown size={14} className="text-gray-500 dark:text-gray-400" />}
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Attachment List */}
          {attachments.length === 0 ? (
            <div className="text-center py-6 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700">
              <Paperclip size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No attachments yet.</p>
              <p className="text-xs mt-1">Click "Add Attachment" to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachments
                .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
                .map(att => (
                  <AttachmentCard
                    key={att.id}
                    attachment={att}
                    onDelete={handleDelete}
                  />
                ))
              }
            </div>
          )}

          {/* Add Attachment Form */}
          <AddAttachmentForm
            module={module}
            recordId={recordId}
            accessLevel={accessLevel}
            onAdd={handleAdd}
          />
        </div>
      )}
    </div>
  );
}
