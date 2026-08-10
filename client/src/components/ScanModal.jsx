/**
 * ScanModal.jsx — camera QR scanning (Phase 2.5, migration 0086).
 *
 * getUserMedia → jsQR frame decode → dept-scoped resolve → an inline result card with
 * a page-relevant action (onResolved decides). Camera denied/unavailable → manual tag
 * entry — a manual path ALWAYS exists (the no-scan-gates ceiling).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Camera, Keyboard } from 'lucide-react';
import jsQR from 'jsqr';
import { api } from '../utils/api';

const TAG_RE = /^OFH1:(ofh[0-9a-f]{20})$/;

export default function ScanModal({ onClose, onResolved }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const doneRef = useRef(false);
  const [cameraState, setCameraState] = useState('starting'); // starting | live | unavailable
  const [manual, setManual] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const resolveTag = useCallback(async (tag) => {
    if (doneRef.current) return;
    doneRef.current = true;
    try {
      const r = await api.get(`/api/scan/resolve/${tag}`);
      setResult(r?.data || null);
      setError(null);
    } catch (e) {
      setError(e.status === 404
        ? 'Nothing in your department matches this label.'
        : (e.message || 'Could not resolve the label.'));
      doneRef.current = false; // let them rescan
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setCameraState('unavailable'); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        setCameraState('live');
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let lastDecode = 0;
        const tick = (ts) => {
          if (cancelled || doneRef.current) return;
          // Throttle to ~10 fps — full-res per-frame decode cooks low-end tablets
          // (design-critique 2.5).
          if (ts - lastDecode > 100 && video.readyState === video.HAVE_ENOUGH_DATA) {
            lastDecode = ts;
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            const m = code && TAG_RE.exec(code.data.trim());
            if (m) { resolveTag(m[1]); return; }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setCameraState('unavailable');
      }
    }
    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [resolveTag]);

  function submitManual() {
    const raw = manual.trim();
    const m = TAG_RE.exec(raw) || /^(ofh[0-9a-f]{20})$/.exec(raw);
    if (!m) { setError('That doesn\'t look like an OpenFirehouse label code.'); return; }
    resolveTag(m[1]);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Camera className="w-5 h-5" /> Scan a label
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {!result && cameraState !== 'unavailable' && (
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              {cameraState === 'starting' && (
                <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting camera…</p>
              )}
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
          {!result && cameraState === 'unavailable' && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Camera unavailable or permission denied — type the code from under the label instead.
            </p>
          )}
          {!result && (
            <div className="flex gap-2">
              <input value={manual} onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitManual(); }}
                placeholder="Or type the label code (ofh…)"
                className="flex-1 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2" />
              <button onClick={submitManual} disabled={!manual.trim()}
                className="px-3 py-2 min-h-[40px] text-sm rounded-lg border border-gray-300 dark:border-gray-600 flex items-center gap-1 disabled:opacity-40">
                <Keyboard className="w-4 h-4" /> Go
              </button>
            </div>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {result && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                {{ asset: 'Tracked asset', item: 'Supply item', location: 'Inventory location', apparatus: 'Apparatus' }[result.kind]}
              </p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{result.record.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {result.kind === 'asset' && `${result.record.family}${result.record.serial ? ` · ${result.record.serial}` : ''} · ${result.record.status}`}
                {result.kind === 'item' && `${result.record.category || 'supply'} · per ${result.record.unit}${result.record.tracks_lots ? ' · lot-tracked' : ''}`}
                {result.kind === 'location' && result.record.kind}
                {result.kind === 'apparatus' && `${result.record.type} · ${result.record.status}`}
              </p>
              <div className="flex gap-2 pt-1">
                <button onClick={() => onResolved(result)}
                  className="px-3 py-2 min-h-[40px] text-sm rounded-lg bg-blue-600 text-white">Open</button>
                <button onClick={() => { doneRef.current = false; setResult(null); }}
                  className="px-3 py-2 min-h-[40px] text-sm rounded-lg border border-gray-300 dark:border-gray-600">Scan another</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
