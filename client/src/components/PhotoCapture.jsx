// PhotoCapture — camera / video / file picker with Cloudinary upload
// Used in IncidentForm to attach scene photos and video clips to incident reports.
// Photos: compressed client-side, uploaded as image resource.
// Video:  max 100 MB, max 60 seconds, uploaded as video resource.

import { useRef, useState } from 'react';
import { Camera, X, Loader2, ImagePlus, Video, VideoOff, Play } from 'lucide-react';

const CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const VIDEO_MAX_BYTES   = 100 * 1024 * 1024; // 100 MB
const VIDEO_MAX_SECONDS = 60;

// ── Helpers ────────────────────────────────────────────────────────────────

function isVideoUrl(url) {
  return url.includes('/video/upload/');
}

// Compress an image File to a JPEG blob at max 1200 px, quality 0.82
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else                { width  = Math.round(width  * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Check video duration by loading it into a temporary <video> element
function checkVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url   = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload  = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read video metadata.')); };
    video.src = url;
  });
}

// Upload to Cloudinary. resourceType: 'image' | 'video'
async function uploadToCloudinary(fileOrBlob, resourceType = 'image') {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      'Cloudinary not configured. Add VITE_CLOUDINARY_CLOUD_NAME and ' +
      'VITE_CLOUDINARY_UPLOAD_PRESET to Vercel environment variables.'
    );
  }
  const fd = new FormData();
  const ext = resourceType === 'video' ? 'mp4' : 'jpg';
  fd.append('file', fileOrBlob, `media.${ext}`);
  fd.append('upload_preset', UPLOAD_PRESET);
  fd.append('folder', 'incidents');

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
    { method: 'POST', body: fd }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Cloudinary upload failed (${res.status})`);
  return data.secure_url;
}

// ── PhotoCapture component ──────────────────────────────────────────────────

export default function PhotoCapture({ photos = [], onChange }) {
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const [uploading, setUploading] = useState([]);   // temp IDs in-flight
  const [error, setError]         = useState(null);

  // ── Photo handler ────────────────────────────────────────────────────────
  async function handlePhotoFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError(null);

    const tempIds = files.map((_, i) => `tmp-photo-${Date.now()}-${i}`);
    setUploading((prev) => [...prev, ...tempIds]);

    const newUrls = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const blob = await compressImage(files[i]);
        const url  = await uploadToCloudinary(blob, 'image');
        newUrls.push(url);
      } catch (err) {
        setError(err.message || 'Photo upload failed. Please try again.');
      } finally {
        setUploading((prev) => prev.filter((id) => id !== tempIds[i]));
      }
    }

    if (newUrls.length) onChange([...photos, ...newUrls]);
    e.target.value = '';
  }

  // ── Video handler ────────────────────────────────────────────────────────
  async function handleVideoFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError(null);

    for (const file of files) {
      // Size check
      if (file.size > VIDEO_MAX_BYTES) {
        setError(`Video too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum is 100 MB.`);
        e.target.value = '';
        return;
      }

      // Duration check
      try {
        const duration = await checkVideoDuration(file);
        if (duration > VIDEO_MAX_SECONDS) {
          setError(`Video too long (${Math.round(duration)}s). Maximum is ${VIDEO_MAX_SECONDS} seconds.`);
          e.target.value = '';
          return;
        }
      } catch {
        // If we can't read duration, allow upload and let Cloudinary enforce limits
      }

      const tempId = `tmp-video-${Date.now()}`;
      setUploading((prev) => [...prev, tempId]);

      try {
        const url = await uploadToCloudinary(file, 'video');
        onChange([...photos, url]);
      } catch (err) {
        setError(err.message || 'Video upload failed. Please try again.');
      } finally {
        setUploading((prev) => prev.filter((id) => id !== tempId));
      }
    }

    e.target.value = '';
  }

  function removeMedia(url) {
    onChange(photos.filter((u) => u !== url));
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Thumbnail grid */}
      {(photos.length > 0 || uploading.length > 0) && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
          {photos.map((url) =>
            isVideoUrl(url) ? (
              /* Video thumbnail */
              <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-900">
                <video
                  src={url}
                  className="w-full h-full object-cover opacity-80"
                  preload="metadata"
                  playsInline
                  muted
                />
                {/* Play button overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 rounded-full p-1.5">
                    <Play size={14} className="text-white fill-white" />
                  </div>
                </div>
                {/* Video badge */}
                <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide pointer-events-none">
                  Video
                </span>
                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeMedia(url)}
                  className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-10"
                  title="Remove video"
                  aria-label="Remove video"
                >
                  <X size={12} />
                </button>
                {/* Full-screen link */}
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="absolute inset-0" aria-label="Play full video" />
              </div>
            ) : (
              /* Photo thumbnail */
              <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                <img src={url} alt="Incident media" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeMedia(url)}
                  className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  title="Remove photo"
                  aria-label="Remove photo"
                >
                  <X size={12} />
                </button>
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="absolute inset-0" aria-label="View full size" />
              </div>
            )
          )}

          {/* Upload spinners */}
          {uploading.map((id) => (
            <div key={id} className="aspect-square rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Loader2 size={24} className="text-gray-500 dark:text-gray-400 animate-spin" />
            </div>
          ))}
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
          ⚠ {error}
        </p>
      )}

      {/* Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Take photo — opens rear camera */}
        <button type="button" onClick={() => photoInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 transition-colors">
          <Camera size={15} className="text-gray-500 dark:text-gray-400" />
          Take Photo
        </button>

        {/* Choose from library */}
        <button type="button" onClick={() => {
          if (photoInputRef.current) {
            photoInputRef.current.removeAttribute('capture');
            photoInputRef.current.click();
            setTimeout(() => photoInputRef.current?.setAttribute('capture', 'environment'), 100);
          }
        }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 transition-colors">
          <ImagePlus size={15} className="text-gray-500 dark:text-gray-400" />
          Library
        </button>

        {/* Record video */}
        <button type="button" onClick={() => videoInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 transition-colors">
          <Video size={15} className="text-gray-500 dark:text-gray-400" />
          Record Video
        </button>

        {/* Choose video from library */}
        <button type="button" onClick={() => {
          if (videoInputRef.current) {
            videoInputRef.current.removeAttribute('capture');
            videoInputRef.current.click();
            setTimeout(() => videoInputRef.current?.setAttribute('capture', 'environment'), 100);
          }
        }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 transition-colors">
          <VideoOff size={15} className="text-gray-500 dark:text-gray-400" />
          Video File
        </button>
      </div>

      {/* Limits hint */}
      <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
        Video: max 60 seconds · 100 MB
      </p>

      {/* Hidden photo input */}
      <input ref={photoInputRef} type="file" accept="image/*"
        capture="environment" multiple className="hidden" onChange={handlePhotoFiles} />

      {/* Hidden video input */}
      <input ref={videoInputRef} type="file" accept="video/*"
        capture="environment" className="hidden" onChange={handleVideoFiles} />
    </div>
  );
}
