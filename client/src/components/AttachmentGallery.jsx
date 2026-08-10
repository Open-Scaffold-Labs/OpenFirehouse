import { useState, useEffect, useRef } from 'react';
import {
  Paperclip, Upload, Trash2, FileText, Image, File,
  Loader2, X, ZoomIn, Download, AlertTriangle,
} from 'lucide-react';
import { api } from '../utils/api';

// ─── File type helpers ────────────────────────────────────────────────────────
function isImage(mimetype) {
  return mimetype?.startsWith('image/');
}

function fileIcon(mimetype) {
  if (isImage(mimetype))           return <Image size={18} className="text-blue-500" />;
  if (mimetype === 'application/pdf') return <FileText size={18} className="text-red-500" />;
  return <File size={18} className="text-gray-500 dark:text-gray-400" />;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function friendlyName(file) {
  // If an originalName was stored in metadata use it; otherwise clean up the UUID filename
  if (file.originalName) return file.originalName;
  const name = file.name || '';
  // Strip leading UUID and show extension
  const match = name.match(/[0-9a-f-]{36}\.(.+)/i);
  return match ? `Attachment.${match[1]}` : name;
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ file, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white/70 hover:text-white"
        >
          <X size={24} />
        </button>
        <img
          src={file.url}
          alt={friendlyName(file)}
          className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl mx-auto block"
        />
        <p className="text-center text-white/60 text-xs mt-2">{friendlyName(file)}</p>
      </div>
    </div>
  );
}

// ─── AttachmentGallery ────────────────────────────────────────────────────────
/**
 * Props:
 *   planId     — pre-plan ID (required)
 *   readOnly   — disable upload/delete (default false)
 */
export default function AttachmentGallery({ planId, readOnly = false }) {
  const [files, setFiles]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting]   = useState(null);
  const [error, setError]         = useState(null);
  const [lightbox, setLightbox]   = useState(null);
  const [dragOver, setDragOver]   = useState(false);
  const inputRef = useRef();

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!planId) return;
    loadFiles();
  }, [planId]);

  async function loadFiles() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/pre-plans/${planId}/attachments`);
      setFiles(res?.data || []);
    } catch (e) {
      setError('Failed to load attachments');
    } finally {
      setLoading(false);
    }
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  async function handleFiles(fileList) {
    if (!fileList?.length) return;
    setUploading(true);
    setError(null);
    const newFiles = [];
    for (const file of Array.from(fileList)) {
      try {
        const form = new FormData();
        form.append('file', file);
        // Use fetch directly — api.postForm handles multipart
        const res = await api.postForm(`/api/pre-plans/${planId}/attachments`, form);
        if (res?.data) newFiles.push(res.data);
      } catch (e) {
        setError(`Upload failed: ${file.name}`);
      }
    }
    setFiles(prev => [...prev, ...newFiles]);
    setUploading(false);
  }

  function onInputChange(e) { handleFiles(e.target.files); e.target.value = ''; }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(file) {
    if (!window.confirm(`Delete "${friendlyName(file)}"?`)) return;
    setDeleting(file.id);
    try {
      await api.delete(`/api/pre-plans/${planId}/attachments/${file.id}`);
      setFiles(prev => prev.filter(f => f.id !== file.id));
    } catch {
      setError('Delete failed');
    } finally {
      setDeleting(null);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Upload zone */}
      {!readOnly && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors select-none
            ${dragOver
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
              : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 bg-gray-50 dark:bg-gray-900/50'
            }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={onInputChange}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm font-medium">Uploading…</span>
            </div>
          ) : (
            <>
              <Upload size={20} className="mx-auto text-gray-500 dark:text-gray-400 mb-1.5" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Drop files here or click to browse
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Images, PDF, Word, Excel — up to 10 MB each
              </p>
            </>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* File grid */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-4 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading attachments…
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
          <Paperclip size={20} className="mx-auto mb-1.5 opacity-40" />
          No attachments yet
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {files.map(file => (
            <div
              key={file.id}
              className="group relative bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Preview */}
              {isImage(file.mimetype) && file.url ? (
                <div
                  className="h-28 bg-gray-100 dark:bg-gray-800 cursor-zoom-in overflow-hidden"
                  onClick={() => setLightbox(file)}
                >
                  <img
                    src={file.url}
                    alt={friendlyName(file)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <ZoomIn size={20} className="text-white drop-shadow" />
                  </div>
                </div>
              ) : (
                <div className="h-28 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                  {fileIcon(file.mimetype)}
                </div>
              )}

              {/* Info + actions */}
              <div className="px-2.5 py-2">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate leading-tight" title={friendlyName(file)}>
                  {friendlyName(file)}
                </p>
                {file.size && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{formatBytes(file.size)}</p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5">
                  {file.url && (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      download
                      className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      <Download size={10} /> Open
                    </a>
                  )}
                  {!readOnly && (
                    <button
                      onClick={() => handleDelete(file)}
                      disabled={deleting === file.id}
                      className="flex items-center justify-center w-6 h-6 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors disabled:opacity-40"
                    >
                      {deleting === file.id
                        ? <Loader2 size={10} className="animate-spin" />
                        : <Trash2 size={10} />
                      }
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && <Lightbox file={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
