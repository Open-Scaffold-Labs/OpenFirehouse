// RankNotificationSettings — chief-configurable rank → notification matrix
// (migration 0026). Notifications are determined by rank, not per member; this
// grid lets the chief set which categories each rank tier receives. Cert-alert
// SCOPE (own / station / all) is fixed by tier doctrine and shown as context.
import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { clearAlertsCache } from '../hooks/useAlerts';

const TIER_LABEL = { firefighter: 'Firefighter', officer: 'Lt / Captain', command: 'BC / DC / Chief' };
const TYPE_LABEL = {
  dispatch:    'Incident dispatch',
  training:    'Training / drill reminders',
  certs:       'Certification expirations',
  bulletins:   'Department bulletins',
  schedule:    'Schedule changes',
  maintenance: 'Apparatus / equipment',
  meetings:    'Dept / committee meetings',
};

export default function RankNotificationSettings() {
  const [matrix, setMatrix]       = useState(null);
  const [tiers, setTiers]         = useState([]);
  const [types, setTypes]         = useState([]);
  const [certScope, setCertScope] = useState({});
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');

  useEffect(() => {
    api.get('/api/notifications/rank-config')
      .then((r) => {
        const d = r.data;
        setMatrix(d.matrix); setTiers(d.tiers); setTypes(d.types); setCertScope(d.certScope || {});
      })
      .catch(() => setMsg('Could not load notification settings.'));
  }, []);

  function toggle(tier, type) {
    setMatrix((m) => ({ ...m, [tier]: { ...m[tier], [type]: !m[tier][type] } }));
  }

  async function save() {
    setSaving(true); setMsg('');
    const overrides = [];
    for (const tier of tiers) for (const type of types) {
      overrides.push({ tier, notif_type: type, enabled: !!matrix[tier][type] });
    }
    try {
      await api.patch('/api/notifications/rank-config', { overrides });
      clearAlertsCache(); // rule change → next alert fetch reflects the new gating
      setMsg('Saved — notifications now follow these rank rules.');
    } catch {
      setMsg('Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (!matrix) return <p className="text-sm text-gray-400">{msg || 'Loading…'}</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Notifications are set by <strong>rank</strong>, not per person — everyone of a rank
        gets the same alerts. Toggle which categories each rank receives.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 text-gray-500 dark:text-gray-400 font-semibold">Notification</th>
              {tiers.map((t) => (
                <th key={t} className="p-2 text-center text-gray-700 dark:text-gray-300 font-bold whitespace-nowrap">
                  {TIER_LABEL[t] || t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {types.map((type) => (
              <tr key={type} className="border-t border-gray-100 dark:border-gray-800">
                <td className="p-2 text-gray-700 dark:text-gray-300">
                  {TYPE_LABEL[type] || type}
                  {type === 'certs' && (
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Scope by rank: {tiers.map((t) => `${(TIER_LABEL[t] || t).split(' ')[0]} = ${certScope[t]}`).join(' · ')}
                    </span>
                  )}
                </td>
                {tiers.map((t) => (
                  <td key={t} className="p-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-red-600 cursor-pointer"
                      checked={!!matrix[t][type]}
                      onChange={() => toggle(t, type)}
                      aria-label={`${TYPE_LABEL[type] || type} for ${TIER_LABEL[t] || t}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save notification rules'}
        </button>
        {msg && <span className="text-xs text-gray-500 dark:text-gray-400">{msg}</span>}
      </div>
    </div>
  );
}
