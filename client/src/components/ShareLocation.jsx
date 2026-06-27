/**
 * ShareLocation.jsx — Generate and share live tracking links for mutual aid
 *
 * Creates a unique public URL that shows your apparatus location in real time.
 * The receiving department opens it in any browser — no login needed.
 */

import { useState } from 'react';
import { Share2, Copy, Check, X, MapPin, Phone, Radio, Users, Loader2 } from 'lucide-react';
import { api } from '../utils/api';

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-gray-50 dark:bg-gray-950 dark:text-gray-100';

export default function ShareLocation({ incident, unit, user, onClose }) {
  const [form, setForm] = useState({
    unit_designation: unit?.designation || '',
    unit_type: unit?.designation?.includes('Engine') ? 'Engine' : unit?.designation?.includes('Truck') ? 'Truck' : unit?.designation?.includes('Rescue') ? 'Rescue' : 'Apparatus',
    crew_names: '',
    crew_count: '',
    radio_channel: 'Tac 1',
    department_name: 'Maplewood VFD — Station 14',
    department_phone: '(570) 555-0100',
    destination_address: incident?.address || '',
    destination_department: '',
    incident_number: incident?.incidentNumber || '',
  });
  const [shareUrl, setShareUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function createShare() {
    setCreating(true);
    try {
      const r = await api.post('/api/live-share', form);
      setShareUrl(r.shareUrl || r.data?.shareUrl);
    } catch (e) {
      console.error('Failed to create share:', e);
    } finally { setCreating(false); }
  }

  function copyLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  }

  function textLink() {
    if (!shareUrl) return;
    const body = encodeURIComponent(`${form.unit_designation} responding mutual aid to ${form.destination_address}. Track us live: ${shareUrl}`);
    window.open(`sms:?body=${body}`, '_blank');
  }

  // After URL is generated
  if (shareUrl) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5 max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 flex items-center gap-2"><Share2 size={16} className="text-red-600 dark:text-red-400" /> Live Tracking Link Ready</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="bg-gray-50 dark:bg-gray-950 rounded-xl px-4 py-3 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Share this link — no login required</p>
          <p className="text-sm font-mono font-bold text-red-700 dark:text-red-300 break-all">{shareUrl}</p>
        </div>

        <div className="flex gap-2">
          <button onClick={copyLink} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold rounded-xl transition-colors">
            {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Link</>}
          </button>
          <button onClick={textLink} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-xl transition-colors">
            <Phone size={14} /> Text Link
          </button>
        </div>

        <div className="text-xs text-gray-400 text-center">
          Link expires in 4 hours or when you close the incident. The receiving department sees your live position on a map.
        </div>
      </div>
    );
  }

  // Form to set up the share
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 flex items-center gap-2"><Share2 size={16} className="text-red-600 dark:text-red-400" /> Share Live Location</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">Generate a tracking link to text to the requesting department. They see your apparatus on a live map — no app needed.</p>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Unit</label>
            <input className={INPUT} value={form.unit_designation} onChange={e => set('unit_designation', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Unit Type</label>
            <select className={INPUT} value={form.unit_type} onChange={e => set('unit_type', e.target.value)}>
              <option>Engine</option><option>Truck</option><option>Rescue</option><option>Tanker</option><option>Battalion</option><option>EMS</option><option>Other</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Destination Address</label>
          <input className={INPUT} value={form.destination_address} onChange={e => set('destination_address', e.target.value)} placeholder="123 Main St, Springfield" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Requesting Department</label>
            <input className={INPUT} value={form.destination_department} onChange={e => set('destination_department', e.target.value)} placeholder="Springfield FD" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Radio Channel</label>
            <input className={INPUT} value={form.radio_channel} onChange={e => set('radio_channel', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Crew Names</label>
            <input className={INPUT} value={form.crew_names} onChange={e => set('crew_names', e.target.value)} placeholder="Chen, Delgado, McGee" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Crew Count</label>
            <input type="number" className={INPUT} value={form.crew_count} onChange={e => set('crew_count', e.target.value)} placeholder="3" />
          </div>
        </div>
      </div>

      <button
        onClick={createShare}
        disabled={creating || !form.unit_designation}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-700 hover:bg-red-800 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
      >
        {creating ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
        Generate Tracking Link
      </button>
    </div>
  );
}
