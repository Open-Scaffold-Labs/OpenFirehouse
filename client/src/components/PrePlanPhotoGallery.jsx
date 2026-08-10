import { useState, useEffect, useRef } from 'react';
import { Camera, Upload, Trash2, Loader2, X, Star } from 'lucide-react';
import { api } from '../utils/api';

// ─── PrePlanPhotoGallery — first-class pre-plan PHOTOS (T.10) ─────────────────
// Fed by /api/pre-plans/:id/photos (pre_plan_photos table, migration 0043) —
// captioned + categorized, unlike the generic AttachmentGallery (which keeps
// documents). Crews capture on the apparatus tablet (PrePlanPhotoStrip);
// this gallery is the web view + desktop upload/edit surface.

// Mirrors routes/prePlanPhotos.js CATEGORIES.
const CATEGORIES = ['general', 'fdc', 'knox_box', 'access', 'utilities', 'water_supply', 'hazard'];
const CATEGORY_LABELS = {
  general: 'General', fdc: 'FDC', knox_box: 'Knox Box', access: 'Access',
  utilities: 'Utilities', water_supply: 'Water Supply', hazard: 'Hazard',
};

function Lightbox({ photo, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white/70 hover:text-white">
          <X size={24} />
        </button>
        <img
          src={photo.url}
          alt={photo.caption || CATEGORY_LABELS[photo.category] || 'Pre-plan photo'}
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl mx-auto block"
        />
        <p className="text-center text-white/80 text-sm mt-2">
          <span className="font-semibold">{CATEGORY_LABELS[photo.category] || photo.category}</span>
          {photo.caption ? ` — ${photo.caption}` : ''}
          {photo.uploadedBy ? <span className="text-white/50"> · {photo.uploadedBy}</span> : null}
        </p>
      </div>
    </div>
  );
}

export default function PrePlanPhotoGallery({ planId, readOnly = false }) {
  const [photos, setPhotos]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId]       = useState(null);
  const [error, setError]         = useState(null);
  const [lightbox, setLightbox]   = useState(null);
  const inputRef = useRef();

  useEffect(() => {
    if (!planId) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/api/pre-plans/${planId}/photos`);
        setPhotos(res?.data || []);
      } catch {
        setError('Failed to load photos');
      } finally {
        setLoading(false);
      }
    })();
  }, [planId]);

  async function handleFiles(fileList) {
    if (!fileList?.length) return;
    setUploading(true);
    setError(null);
    const added = [];
    for (const file of Array.from(fileList)) {
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('category', 'general'); // categorize after upload via the chip
        const res = await api.postForm(`/api/pre-plans/${planId}/photos`, form);
        if (res?.data) added.push(res.data);
      } catch {
        setError(`Upload failed: ${file.name}`);
      }
    }
    setPhotos(prev => [...prev, ...added]);
    setUploading(false);
  }

  async function patchPhoto(photo, fields) {
    setBusyId(photo.id);
    try {
      const res = await api.patch(`/api/pre-plans/${planId}/photos/${photo.id}`, fields);
      if (res?.data) {
        setPhotos(prev => prev.map(p => {
          if (p.id === photo.id) return { ...p, ...res.data, url: p.url }; // keep the signed url
          // setting a new primary clears the others
          return fields.isPrimary ? { ...p, isPrimary: false } : p;
        }));
      }
    } catch {
      setError('Update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(photo) {
    if (!window.confirm(`Delete this photo${photo.caption ? ` ("${photo.caption}")` : ''}?`)) return;
    setBusyId(photo.id);
    try {
      await api.delete(`/api/pre-plans/${planId}/photos/${photo.id}`);
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
    } catch {
      setError('Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors select-none border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 bg-gray-50 dark:bg-gray-900/50"
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm font-medium">Uploading…</span>
            </div>
          ) : (
            <>
              <Camera size={20} className="mx-auto text-gray-400 mb-1.5" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Add building photos — FDC, Knox box, access, shutoffs
              </p>
              <p className="text-xs text-gray-400 mt-0.5">JPEG, PNG, WebP, HEIC — up to 15 MB each</p>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
          <Loader2 size={16} className="animate-spin" /> Loading photos…
        </div>
      ) : photos.length === 0 ? (
        <p className="text-sm text-gray-400 py-1">
          No photos yet. Crews capture these on the apparatus tablet; they surface at dispatch on Size-Up.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((photo) => (
            <div key={photo.id} className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              <button
                type="button"
                onClick={() => photo.url && setLightbox(photo)}
                className="block w-full aspect-[4/3] bg-gray-200 dark:bg-gray-800"
              >
                {photo.url ? (
                  <img src={photo.url} alt={photo.caption || 'Pre-plan photo'} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">Unavailable</div>
                )}
              </button>
              <div className="p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  {readOnly ? (
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-blue-600 text-white">
                      {CATEGORY_LABELS[photo.category] || photo.category}
                    </span>
                  ) : (
                    <select
                      value={photo.category}
                      disabled={busyId === photo.id}
                      onChange={(e) => patchPhoto(photo, { category: e.target.value })}
                      className="text-[11px] font-semibold rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-1 py-0.5"
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                    </select>
                  )}
                  <div className="flex-1" />
                  {!readOnly && (
                    <>
                      <button
                        type="button"
                        title={photo.isPrimary ? 'Primary photo' : 'Make primary'}
                        disabled={busyId === photo.id}
                        onClick={() => !photo.isPrimary && patchPhoto(photo, { isPrimary: true })}
                        className={photo.isPrimary ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400'}
                      >
                        <Star size={15} fill={photo.isPrimary ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        title="Delete photo"
                        disabled={busyId === photo.id}
                        onClick={() => handleDelete(photo)}
                        className="text-gray-300 hover:text-red-500"
                      >
                        {busyId === photo.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      </button>
                    </>
                  )}
                </div>
                {readOnly ? (
                  photo.caption ? <p className="text-xs text-gray-600 dark:text-gray-300">{photo.caption}</p> : null
                ) : (
                  <input
                    type="text"
                    defaultValue={photo.caption}
                    placeholder="Caption — e.g. FDC, rear alley"
                    maxLength={500}
                    onBlur={(e) => { if (e.target.value !== photo.caption) patchPhoto(photo, { caption: e.target.value }); }}
                    className="w-full text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-1.5 py-1"
                  />
                )}
                {photo.uploadedBy ? (
                  <p className="text-[10px] text-gray-400">{photo.uploadedBy}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
