/**
 * IncidentMediaGallery.jsx — Scene Photo/Video Gallery for Command Board
 *
 * Displays photos uploaded from the scene in a horizontal scrollable
 * carousel. Shows on the Command Board during active incidents.
 * Includes a "Share Upload Link" button to generate a link anyone
 * at the scene can use to upload photos from their phone.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Camera, Image, Plus, Copy, Check, Loader2, X, ChevronLeft, ChevronRight,
  MapPin, Clock, User, Share2,
} from 'lucide-react';
import { api } from '../utils/api';

export default function IncidentMediaGallery({ incidentId, compact = false }) {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadUrl, setUploadUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!incidentId) return;
    setLoading(true);
    try {
      const r = await api.get(`/api/incident-media/${incidentId}`);
      setMedia(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [incidentId]);

  useEffect(() => { load(); }, [load]);
  // Auto-refresh every 15 seconds to pick up new uploads
  useEffect(() => { const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);

  async function generateUploadLink() {
    try {
      const r = await api.post('/api/incident-media/token', {
        incident_id: incidentId,
        incident_address: '',
      });
      setUploadUrl(r.uploadUrl);
    } catch (e) { console.error(e); }
  }

  function copyLink() {
    if (!uploadUrl) return;
    navigator.clipboard.writeText(uploadUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  }

  function textLink() {
    if (!uploadUrl) return;
    const body = encodeURIComponent(`Scene photo upload link: ${uploadUrl}`);
    window.open(`sms:?body=${body}`, '_blank');
  }

  if (!expanded && compact) {
    return (
      <button onClick={() => { setExpanded(true); if (!uploadUrl) generateUploadLink(); }}
        className="flex items-center gap-2 px-3 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl border border-gray-700 transition-colors w-full">
        <Camera size={14} className="text-purple-400" />
        <span className="text-xs font-bold flex-1 text-left">Scene Photos</span>
        {media.length > 0 && (
          <span className="text-[10px] font-black text-purple-400 bg-purple-900/50 px-2 py-0.5 rounded-full">
            {media.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700">
        <Camera size={14} className="text-purple-600 dark:text-purple-400" />
        <span className="text-xs font-black text-gray-700 dark:text-gray-300 flex-1">Scene Photos ({media.length})</span>
        {!uploadUrl ? (
          <button onClick={generateUploadLink} className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 px-2 py-1 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-950/50">
            <Share2 size={10} className="inline mr-1" /> Share Upload Link
          </button>
        ) : (
          <div className="flex gap-1">
            <button onClick={copyLink} className="text-[10px] font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">
              {copied ? <><Check size={10} className="inline mr-1" /> Copied</> : <><Copy size={10} className="inline mr-1" /> Copy</>}
            </button>
            <button onClick={textLink} className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/50 px-2 py-1 rounded-lg hover:bg-green-100 dark:hover:bg-green-950/50">
              Text
            </button>
          </div>
        )}
        {compact && <button onClick={() => setExpanded(false)} aria-label="Collapse scene photos" className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={12} /></button>}
      </div>

      {loading && media.length === 0 ? (
        <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-500 dark:text-gray-400" /></div>
      ) : media.length === 0 ? (
        <div className="text-center py-4">
          <Image size={20} className="mx-auto text-gray-300 dark:text-gray-600 mb-1" />
          <p className="text-[10px] text-gray-500 dark:text-gray-400">No photos yet. Share the upload link with crew on scene.</p>
        </div>
      ) : (
        <div className="flex gap-2 p-2 overflow-x-auto">
          {media.map(m => (
            <button key={m.id} onClick={() => setSelectedImage(m)}
              aria-label={m.caption || 'View scene photo'}
              className="flex-shrink-0 w-20 h-20 rounded-lg bg-gray-900 border-2 border-gray-200 dark:border-gray-700 hover:border-purple-400 overflow-hidden transition-all relative">
              {m.url ? (
                <img src={m.url} alt={m.caption || 'Scene photo'} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Camera size={16} className="text-gray-600 dark:text-gray-300" />
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                <p className="text-[8px] text-white truncate">{m.uploaded_by || 'Unknown'}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
          <div className="max-w-2xl w-full bg-gray-900 rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {selectedImage.url ? (
              <img src={selectedImage.url} alt={selectedImage.caption} className="w-full max-h-96 object-contain" />
            ) : (
              <div className="w-full h-64 flex items-center justify-center"><Camera size={32} className="text-gray-600 dark:text-gray-300" /></div>
            )}
            <div className="p-3 space-y-1">
              {selectedImage.caption && <p className="text-sm text-white font-bold">{selectedImage.caption}</p>}
              <div className="flex gap-3 text-[10px] text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1"><User size={9} /> {selectedImage.uploaded_by}</span>
                <span className="flex items-center gap-1"><Clock size={9} /> {new Date(selectedImage.created_at).toLocaleString()}</span>
                {selectedImage.latitude && <span className="flex items-center gap-1"><MapPin size={9} /> GPS tagged</span>}
              </div>
            </div>
            <button onClick={() => setSelectedImage(null)} aria-label="Close photo viewer" className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/80">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
