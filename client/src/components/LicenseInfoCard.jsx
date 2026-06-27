import { useEffect, useState } from 'react';
import { api } from '../utils/api';

/**
 * LicenseInfoCard — shows the current department's OpenFirehouse license status
 * in Settings. Pulls fresh status from /api/license/status (authed, scoped to
 * the logged-in user's department) on mount. ADR-0001 Step 13.
 *
 * Deactivate is chief-only and per-department (server enforces both).
 */
export default function LicenseInfoCard() {
  const [status, setStatus] = useState(null);
  const [tierStatus, setTierStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [error, setError] = useState(null);

  function refresh() {
    setLoading(true);
    // License (entitlement) status + the P4.5 tier-status advisory (provisioning
    // layer). tier-status is chief-only, so a non-chief simply gets no advisory.
    Promise.allSettled([api.get('/api/license/status'), api.get('/api/departments/tier-status')])
      .then(([s, t]) => {
        if (s.status === 'fulfilled') setStatus(s.value);
        else setError(s.reason?.message || 'Could not load license status');
        if (t.status === 'fulfilled') setTierStatus(t.value?.data || null);
        setLoading(false);
      });
  }
  useEffect(refresh, []);

  async function deactivate() {
    setError(null);
    try {
      await api.post('/api/license/deactivate'); // authed + chief-only; throws on non-2xx
      // Hard reload — the App.jsx post-login gate now re-routes to activation.
      window.location.reload();
    } catch (e) {
      setError(e.message);
      setConfirmingDeactivate(false);
    }
  }

  const TIER_LABEL = {
    independent:  'Independent (Free)',
    career_small: 'Career Small ($999/year)',
    career_mid:   'Career Mid ($2,499/year)',
    metro:        'Metro ($4,999/year)',
  };
  const tierCls = {
    independent:  'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300',
    career_small: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300',
    career_mid:   'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300',
    metro:        'bg-red-100 dark:bg-red-950/50 text-red-900 dark:text-red-300',
  };

  const cardCls = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700';
  const card = {
    borderRadius: 12, padding: 20, marginBottom: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };
  const headingCls = 'text-gray-900 dark:text-gray-100';
  const heading = { margin: 0, fontSize: 18, fontWeight: 600 };
  const mutedCls = 'text-gray-500 dark:text-gray-400';
  const muted = { fontSize: 13 };
  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginTop: 12 };
  const labelCls = 'text-gray-500 dark:text-gray-400';
  const labelStyle = { fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.05 };
  const valueCls = 'text-gray-900 dark:text-gray-100';
  const value = { fontSize: 14, marginTop: 2 };

  // P4.5 storage advisory — real usage vs the tier's quota (advisory only).
  const st = tierStatus?.storage;
  const storageBlock = st ? (
    <div style={{ marginTop: 14 }}>
      <div className={labelCls} style={labelStyle}>Storage</div>
      <div className={valueCls} style={value}>{st.used_gb} GB / {st.quota_gb} GB ({st.percent}%)</div>
      <div style={{ height: 6, borderRadius: 4, marginTop: 6, overflow: 'hidden' }} className="bg-gray-200 dark:bg-gray-700">
        <div style={{ width: `${Math.min(100, st.percent)}%`, height: '100%', background: st.over_quota ? '#EF4444' : st.warn ? '#F59E0B' : '#22C55E' }} />
      </div>
      {st.advisory && <p className="text-amber-700 dark:text-amber-400" style={{ ...muted, marginTop: 6 }}>{st.advisory}</p>}
    </div>
  ) : null;

  if (loading) return <div className={cardCls} style={card}><h3 className={headingCls} style={heading}>License</h3><p className={mutedCls} style={muted}>Loading…</p></div>;
  if (error)   return <div className={cardCls} style={card}><h3 className={headingCls} style={heading}>License</h3><p className="text-red-900 dark:text-red-300" style={muted}>Error: {error}</p></div>;
  if (!status?.activated) return (
    <div className={cardCls} style={card}>
      <h3 className={headingCls} style={heading}>License</h3>
      <p className={mutedCls} style={muted}>Not activated.</p>
      {tierStatus?.advisory?.kind === 'needs_license' && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900" style={{ marginTop: 12, padding: 14, borderRadius: 8 }}>
          <p className="text-amber-800 dark:text-amber-300" style={{ margin: 0, fontWeight: 600 }}>Your size needs a paid license</p>
          <p className="text-amber-700 dark:text-amber-400" style={{ ...muted, marginTop: 4 }}>{tierStatus.advisory.message}</p>
          <a href="https://openfirehouse.openscaffoldlabs.com/buy" target="_blank" rel="noreferrer" className="bg-red-600 text-white" style={{ display: 'inline-block', marginTop: 10, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>Get a license</a>
        </div>
      )}
      {tierStatus && tierStatus.paid_tier === false && (
        <p className={mutedCls} style={{ ...muted, marginTop: 8 }}>You're on the free <strong>Independent</strong> tier — no license needed.</p>
      )}
      {storageBlock}
    </div>
  );

  const tier = status.tier || 'independent';
  const expires = status.expires_at ? new Date(status.expires_at).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : 'unknown';

  return (
    <div className={cardCls} style={card}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <h3 className={headingCls} style={heading}>License</h3>
        <span className={tierCls[tier] || ''} style={{
          padding: '4px 10px', borderRadius: 6, fontWeight: 600, fontSize: 13,
        }}>{TIER_LABEL[tier] || tier}</span>
      </div>
      <p className={mutedCls} style={{ ...muted, marginTop: 4 }}>This install is activated for the department below. The license auto-renews annually until cancelled in the customer portal.</p>

      <div style={row}>
        <div style={{ flex: '1 1 200px' }}>
          <div className={labelCls} style={labelStyle}>Department</div>
          <div className={valueCls} style={value}>{status.dept_name || '—'}</div>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <div className={labelCls} style={labelStyle}>Contact email</div>
          <div className={valueCls} style={value}>{status.dept_email || '—'}</div>
        </div>
      </div>

      <div style={row}>
        <div style={{ flex: '1 1 200px' }}>
          <div className={labelCls} style={labelStyle}>Expires</div>
          <div className={valueCls} style={value}>{expires}</div>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <div className={labelCls} style={labelStyle}>License id</div>
          <div className={valueCls} style={{ ...value, fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace', fontSize: 13 }}>{status.license_id}</div>
        </div>
      </div>

      {storageBlock}

      {tierStatus?.advisory?.kind === 'reattest' && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900" style={{ marginTop: 14, padding: 12, borderRadius: 8 }}>
          <p className="text-amber-800 dark:text-amber-300" style={{ ...muted, margin: 0 }}>{tierStatus.advisory.message}</p>
        </div>
      )}

      {confirmingDeactivate ? (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800" style={{ marginTop: 18, padding: 14, borderRadius: 8 }}>
          <p className="text-red-900 dark:text-red-300" style={{ margin: 0, fontWeight: 600 }}>Deactivate this install?</p>
          <p className="text-red-900 dark:text-red-300" style={{ ...muted, marginTop: 4 }}>The next time anyone opens OpenFirehouse they will see the activation screen until a license is re-pasted. Your data is not affected.</p>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button onClick={deactivate} className="bg-red-500 text-white" style={{ border:'none', borderRadius:8, padding:'8px 14px', fontWeight:600, cursor:'pointer' }}>Yes, deactivate</button>
            <button onClick={() => setConfirmingDeactivate(false)} className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600" style={{ borderRadius:8, padding:'8px 14px', fontWeight:600, cursor:'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 18, textAlign: 'right' }}>
          <button onClick={() => setConfirmingDeactivate(true)} className="bg-white dark:bg-gray-900 text-red-900 dark:text-red-300 border border-red-300 dark:border-red-800" style={{
            borderRadius:8,
            padding:'8px 14px', fontWeight:600, fontSize:13, cursor:'pointer',
          }}>Deactivate license…</button>
        </div>
      )}
    </div>
  );
}
