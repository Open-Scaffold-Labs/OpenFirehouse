/**
 * NG911Console.jsx — Next Generation 911 Call Display
 *
 * Shows incoming NG911 calls with rich data: caller GPS on map,
 * photos/video from caller, text messages, verified address,
 * building info, and one-click incident creation.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Phone, MapPin, Camera, MessageSquare, Building2, Clock, AlertTriangle,
  Loader2, ChevronDown, ChevronUp, Flame, Plus, CheckCircle, X,
  Navigation, Shield, FileText,
} from 'lucide-react';
import { api } from '../utils/api';

const PRIORITY_COLORS = {
  emergency: { bg: 'bg-red-100 dark:bg-red-950/50', text: 'text-red-700 dark:text-red-300', badge: 'bg-red-600 text-white' },
  high:      { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-700 dark:text-orange-300', badge: 'bg-orange-500 text-white' },
  standard:  { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-500 text-white' },
  low:       { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-300', badge: 'bg-gray-500 text-white' },
};

const STATUS_COLORS = {
  new:        { bg: 'bg-amber-100 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-300' },
  dispatched: { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-300' },
  processed:  { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300' },
};

// ─── Call Card ───────────────────────────────────────────────────────────────

function CallCard({ call, onCreateIncident, onSelect, selected }) {
  const pri = PRIORITY_COLORS[call.priority] || PRIORITY_COLORS.standard;
  const sts = STATUS_COLORS[call.status] || STATUS_COLORS.new;
  const address = [call.verified_address, call.verified_city, call.verified_state].filter(Boolean).join(', ');
  const mediaCount = (call.media_urls || []).length;
  const textCount = (call.caller_text_messages || []).length;
  const hasLocation = call.caller_latitude && call.caller_longitude;

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border-2 transition-all ${selected ? 'border-red-400 shadow-lg' : 'border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md'}`}>
      <button onClick={() => onSelect(call.id)} className="w-full text-left p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${call.status === 'new' ? 'bg-red-100 dark:bg-red-950/50 animate-pulse' : 'bg-gray-100 dark:bg-gray-800'}`}>
              <Phone size={18} className={call.status === 'new' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-black text-gray-900 dark:text-gray-100">{call.call_type}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pri.badge}`}>{call.priority}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sts.bg} ${sts.text}`}>{call.status}</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 flex items-center gap-1">
                <MapPin size={11} /> {address || 'Address pending'}
              </p>
            </div>
          </div>
          <span className="text-[10px] text-gray-400 flex-shrink-0">
            {new Date(call.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Quick info bar */}
        <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
          {call.caller_name && (
            <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <Phone size={9} /> {call.caller_name}
            </span>
          )}
          {call.building_name && (
            <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <Building2 size={9} /> {call.building_name}
            </span>
          )}
          {call.floor && <span className="text-gray-400">Floor: {call.floor}</span>}
          {call.room && <span className="text-gray-400">Room: {call.room}</span>}
          {hasLocation && (
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-bold">
              <Navigation size={9} /> GPS verified ({call.caller_accuracy_meters}m)
            </span>
          )}
          {mediaCount > 0 && (
            <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-bold">
              <Camera size={9} /> {mediaCount} media
            </span>
          )}
          {textCount > 0 && (
            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold">
              <MessageSquare size={9} /> {textCount} texts
            </span>
          )}
        </div>

        {/* Narrative preview */}
        {call.call_narrative && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2 leading-relaxed">{call.call_narrative}</p>
        )}
      </button>

      {/* Expanded detail */}
      {selected && (
        <div className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-3">
          {/* Full narrative */}
          {call.call_narrative && (
            <div className="bg-gray-50 dark:bg-gray-950 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Call Narrative</p>
              <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{call.call_narrative}</p>
            </div>
          )}

          {/* Text messages from caller */}
          {textCount > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1.5 flex items-center gap-1">
                <MessageSquare size={10} /> Text Messages from Caller
              </p>
              <div className="space-y-1">
                {(call.caller_text_messages || []).map((t, i) => (
                  <div key={i} className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg px-3 py-1.5">
                    <span className="text-[10px] text-blue-400 font-mono flex-shrink-0">{t.time}</span>
                    <p className="text-xs text-blue-800 dark:text-blue-300">{t.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Media from caller */}
          {mediaCount > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1.5 flex items-center gap-1">
                <Camera size={10} /> Caller Media
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(call.media_urls || []).map((m, i) => (
                  <div key={i} className="bg-gray-900 rounded-lg p-2 text-center">
                    <div className="w-full h-20 bg-gray-800 rounded flex items-center justify-center mb-1">
                      <Camera size={20} className="text-gray-600" />
                    </div>
                    <p className="text-[9px] text-gray-400">{m.caption || `Media ${i + 1}`}</p>
                    <p className="text-[8px] text-gray-500">{m.timestamp}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supplemental data */}
          {call.supplemental_data && Object.keys(call.supplemental_data).length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1.5 flex items-center gap-1">
                <FileText size={10} /> Supplemental Location Data
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(call.supplemental_data).map(([k, v]) => (
                  <div key={k} className="bg-gray-50 dark:bg-gray-950 rounded px-2 py-1">
                    <p className="text-[9px] text-gray-400 uppercase">{k.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-gray-800 dark:text-gray-100 font-medium">{String(v)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PSAP info */}
          <div className="flex items-center gap-3 text-[10px] text-gray-400">
            <span>PSAP: {call.psap_name || '--'}</span>
            <span>ANI: {call.ani || '--'}</span>
            <span>ESN: {call.esn || '--'}</span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {!call.incident_created && (
              <button
                onClick={() => onCreateIncident(call.id)}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl"
              >
                <Flame size={13} /> Create Incident
              </button>
            )}
            {call.incident_created && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 text-xs font-bold rounded-xl">
                <CheckCircle size={13} /> Incident Created
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function NG911Console() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/api/ng911/calls');
      setCalls(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Auto-refresh every 10 seconds
  useEffect(() => { const id = setInterval(load, 10000); return () => clearInterval(id); }, [load]);

  async function handleCreateIncident(callId) {
    try {
      await api.post(`/api/ng911/calls/${callId}/create-incident`);
      load();
    } catch (e) { console.error(e); alert('Failed to create incident'); }
  }

  const newCalls = calls.filter(c => c.status === 'new');
  const processedCalls = calls.filter(c => c.status !== 'new');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
            <Phone size={22} className="text-red-700 dark:text-red-300" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">NG911 Console</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Next Generation 911 calls with GPS, multimedia, and verified locations</p>
          </div>
        </div>
        {newCalls.length > 0 && (
          <span className="text-sm font-black text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/50 px-3 py-1.5 rounded-full animate-pulse">
            {newCalls.length} NEW {newCalls.length === 1 ? 'CALL' : 'CALLS'}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-black text-gray-900 dark:text-gray-100">{calls.length}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase">Total Calls</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-black text-red-600 dark:text-red-400">{newCalls.length}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase">Pending</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-black text-green-600 dark:text-green-400">{calls.filter(c => c.incident_created).length}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase">Incidents Created</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-black text-purple-600 dark:text-purple-400">{calls.filter(c => (c.media_urls || []).length > 0).length}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase">With Media</p>
        </div>
      </div>

      {/* NG911 info banner */}
      <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 flex items-start gap-3">
        <Shield size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-blue-800 dark:text-blue-300">NG911-Ready Architecture</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
            This console accepts NENA i3-format calls from NG911-enabled PSAPs. Incoming calls include verified GPS coordinates, caller-provided photos and video, text messages, and supplemental location data (building name, floor, room). One-click incident creation auto-populates all fields from the call data.
          </p>
        </div>
      </div>

      {/* Call list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : calls.length === 0 ? (
        <div className="text-center py-12">
          <Phone size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-bold text-gray-500 dark:text-gray-400">No NG911 calls</p>
          <p className="text-xs text-gray-400 mt-1">Calls from NG911-enabled PSAPs will appear here with GPS, media, and verified locations.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {newCalls.length > 0 && (
            <p className="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-wide">New Calls</p>
          )}
          {newCalls.map(c => (
            <CallCard key={c.id} call={c} selected={selected === c.id}
              onSelect={(id) => setSelected(selected === id ? null : id)}
              onCreateIncident={handleCreateIncident} />
          ))}
          {processedCalls.length > 0 && (
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-4">Processed</p>
          )}
          {processedCalls.map(c => (
            <CallCard key={c.id} call={c} selected={selected === c.id}
              onSelect={(id) => setSelected(selected === id ? null : id)}
              onCreateIncident={handleCreateIncident} />
          ))}
        </div>
      )}
    </div>
  );
}
