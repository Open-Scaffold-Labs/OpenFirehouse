import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../utils/api';
import IncidentForm from './IncidentForm';
import { notifySaved } from '../utils/reportWindow';

/**
 * IncidentReportWindow — the incident report as its OWN BROWSER WINDOW.
 *
 * Spec: docs/INCIDENT-ENTRY-SPEC-2026-08-07.md, ruling R1 (Matt, 2026-08-07):
 * "can we make it a pop up that is just a seperate full page window that opens
 * up?" — a real second OS window, draggable to a second monitor, while the call
 * list stays LIVE on the first instead of dimmed behind a scrim.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT RENDER ──────────────────────────────────
 * No sidebar, no topbar, no floating widget rail. This window has exactly one
 * job. Re-rendering the app shell inside it would spend the width the whole
 * change was fought for — the modal it replaces showed 17 of 110 fields.
 *
 * ── AUTH ────────────────────────────────────────────────────────────────────
 * Same-origin, so `fs_token` in localStorage is already there; the window does
 * not prompt for a second login. It still fetches its own data because it is a
 * separate JS context with no access to the opener's React state.
 */
export default function IncidentReportWindow() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const incidentId = params.get('id');
  const isNew = params.get('new') === '1';

  const [incident, setIncident] = useState(null);
  const [nextNumber, setNextNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (incidentId) {
          const res = await api.get(`/api/incidents/${incidentId}`);
          if (alive) setIncident(res.data || res);
        } else {
          // Mint the next number the same way the list does, so a report opened
          // in its own window does not collide with one opened from the list.
          const res = await api.get('/api/incidents');
          const rows = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
          const yr = new Date().getFullYear().toString().slice(-2);
          const max = rows
            .map((i) => parseInt((i.incidentNumber || '').split('-')[1] || '0', 10))
            .reduce((a, b) => Math.max(a, b), 0);
          if (alive) setNextNumber(`${yr}-${String(max + 1).padStart(4, '0')}`);
        }
      } catch (err) {
        if (alive) setError(err.message || 'Could not load the report');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [incidentId]);

  const handleSave = useCallback(async (payload) => {
    try {
      if (incidentId) await api.put(`/api/incidents/${incidentId}`, payload);
      else await api.post('/api/incidents', payload);
      // Tell the list window, or the chief watches a stale table until they
      // refresh by hand. Best-effort: a failed notify must not fail the save.
      notifySaved({ incidentId: incidentId || null });
      setSaved(true);
    } catch (err) {
      // Surfaced, never swallowed — a save that did not happen must not look
      // like one that did (the 201-is-not-persistence lesson, in the UI layer).
      setError(err.message || 'Save failed — the report was NOT recorded. Nothing has been lost; try again.');
    }
  }, [incidentId]);

  // Closing is `window.close()` when we were opened by script; when the popup was
  // blocked the user got here by in-place navigation, so close() is a no-op and
  // history.back() is the honest fallback.
  const handleClose = useCallback(() => {
    if (window.opener && !window.opener.closed) { window.close(); return; }
    if (window.history.length > 1) window.history.back();
    else window.location.hash = '#/incidents';
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading the incident report…
        </div>
      </div>
    );
  }

  if (error && !saved) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
        <div className="max-w-md text-center">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">{error}</p>
          <button onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
        <div className="text-center">
          <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Incident report saved.</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">The incident list has been updated.</p>
          <button onClick={handleClose}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Close this window
          </button>
        </div>
      </div>
    );
  }

  if (!incidentId && !isNew) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">No incident specified.</p>
      </div>
    );
  }

  return (
    <IncidentForm
      layout="workspace"
      incident={incident}
      nextNumber={nextNumber}
      aiPrefill={null}
      onSave={handleSave}
      onClose={handleClose}
    />
  );
}
