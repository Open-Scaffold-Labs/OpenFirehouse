import { useState, useEffect } from 'react';
import {
  Plus, AlertCircle, CheckCircle, Zap, TrendingUp,
  Flame, Droplet, Map, Shield, Clock, AlertTriangle,
} from 'lucide-react';
import { api } from '../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────────
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin h-8 w-8 border-4 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );
}

function ErrorAlert({ message }) {
  return (
    <div className="bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-800" style={{
      borderRadius: '0.75rem',
      padding: '1rem',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.75rem',
    }}>
      <AlertCircle size={20} className="text-red-500" style={{ flexShrink: 0 }} />
      <div>
        <p className="text-red-900 dark:text-red-300" style={{ fontSize: '0.875rem', fontWeight: 500 }}>{message}</p>
      </div>
    </div>
  );
}

function SuccessAlert({ message }) {
  return (
    <div className="bg-green-100 dark:bg-green-950/50 border border-green-300 dark:border-green-800" style={{
      borderRadius: '0.75rem',
      padding: '1rem',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.75rem',
    }}>
      <CheckCircle size={20} className="text-green-600 dark:text-green-400" style={{ flexShrink: 0 }} />
      <div>
        <p className="text-green-700 dark:text-green-300" style={{ fontSize: '0.875rem', fontWeight: 500 }}>{message}</p>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-white dark:bg-gray-900" style={{
      borderRadius: '1rem',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      padding: '1.5rem',
      marginBottom: '1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Icon size={20} className="text-red-500" />
        <h3 className="text-gray-900 dark:text-gray-100" style={{ fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function RiskBadge({ level }) {
  const colors = {
    low: { cls: 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300', label: 'Low Risk' },
    moderate: { cls: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300', label: 'Moderate Risk' },
    high: { cls: 'bg-orange-200 dark:bg-orange-950/50 text-amber-800 dark:text-orange-300', label: 'High Risk' },
    extreme: { cls: 'bg-red-200 dark:bg-red-950/50 text-red-900 dark:text-red-300', label: 'Extreme Risk' },
  };
  const color = colors[level?.toLowerCase()] || colors.moderate;
  return (
    <div className={color.cls} style={{
      display: 'inline-block',
      padding: '0.25rem 0.75rem',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
      fontWeight: 600,
    }}>
      {color.label}
    </div>
  );
}

function CircularProgress({ score }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <svg width="120" height="120">
        <circle cx="60" cy="60" r={radius} fill="none" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="4" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.3s ease', transform: 'rotate(-90deg)', transformOrigin: '60px 60px' }}
        />
        <text x="60" y="68" fontSize="24" fontWeight="bold" textAnchor="middle" fill={color}>
          {score}%
        </text>
      </svg>
      <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Completeness Score</p>
    </div>
  );
}

// ── Tab 1: Generate Pre-Plan ───────────────────────────────────────────────────
function GeneratePrePlanTab() {
  const [form, setForm] = useState({
    address: '',
    propertyType: 'Commercial',
    constructionType: 'Type II Non-Combustible',
    stories: '',
    squareFootage: '',
    occupancyType: 'B - Business',
    knownHazards: '',
    waterSupply: '',
    accessPoints: '',
    specialConsiderations: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const propertyTypes = [
    'Residential',
    'Commercial',
    'Industrial',
    'High-Rise',
    'School',
    'Hospital',
    'Assembly',
    'Storage',
    'Mixed-Use',
  ];

  const constructionTypes = [
    'Type I Fire Resistive',
    'Type II Non-Combustible',
    'Type III Ordinary',
    'Type IV Heavy Timber',
    'Type V Wood Frame',
  ];

  const occupancyTypes = [
    'A-1 - Assembly - Theaters',
    'A-2 - Assembly - Nightclubs',
    'A-3 - Assembly - Churches',
    'A-4 - Assembly - Arenas',
    'A-5 - Assembly - Outdoor',
    'B - Business',
    'E - Educational',
    'F-1 - Factory - Moderate hazard',
    'F-2 - Factory - Low hazard',
    'H-1 - High hazard - Detonation',
    'H-2 - High hazard - Deflagration',
    'H-3 - High hazard - Chemical reaction',
    'H-4 - High hazard - Oxidizing',
    'H-5 - High hazard - Unstable',
    'I-1 - Institutional - Supervisory',
    'I-2 - Institutional - Medical',
    'I-3 - Institutional - Detention',
    'I-4 - Institutional - Custody',
    'M - Mercantile',
    'R-1 - Residential - Hotels',
    'R-2 - Residential - Apartments',
    'R-3 - Residential - Single/Duplex',
    'R-4 - Residential - Care/Assisted',
    'S-1 - Storage - Moderate hazard',
    'S-2 - Storage - Low hazard',
  ];

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleGenerate() {
    setError('');
    setResult(null);

    if (!form.address.trim()) {
      setError('Address is required');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/api/preplan-ai/generate', form);
      if (response?.plan) {
        setResult(response.plan);
      } else {
        setError('Unexpected response format');
      }
    } catch (err) {
      console.error('Error generating pre-plan:', err);
      setError(err?.message || 'Failed to generate pre-plan. Check that AI keys are configured.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Address *
          </label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="123 Main St, Newark, NJ"
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Property Type
          </label>
          <select
            value={form.propertyType}
            onChange={(e) => set('propertyType', e.target.value)}
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          >
            {propertyTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Construction Type
          </label>
          <select
            value={form.constructionType}
            onChange={(e) => set('constructionType', e.target.value)}
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          >
            {constructionTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Stories
          </label>
          <input
            type="number"
            value={form.stories}
            onChange={(e) => set('stories', e.target.value)}
            placeholder="3"
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Square Footage
          </label>
          <input
            type="number"
            value={form.squareFootage}
            onChange={(e) => set('squareFootage', e.target.value)}
            placeholder="50000"
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Occupancy Type
          </label>
          <select
            value={form.occupancyType}
            onChange={(e) => set('occupancyType', e.target.value)}
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          >
            {occupancyTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Known Hazards
          </label>
          <textarea
            value={form.knownHazards}
            onChange={(e) => set('knownHazards', e.target.value)}
            placeholder="Flammable chemicals, compressed gases, etc."
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              minHeight: '80px',
              boxSizing: 'border-box',
              fontFamily: 'sans-serif',
            }}
          />
        </div>

        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Water Supply Notes
          </label>
          <textarea
            value={form.waterSupply}
            onChange={(e) => set('waterSupply', e.target.value)}
            placeholder="Hydrant locations, water mains, tanker shuttle areas"
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              minHeight: '80px',
              boxSizing: 'border-box',
              fontFamily: 'sans-serif',
            }}
          />
        </div>

        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Access Points
          </label>
          <textarea
            value={form.accessPoints}
            onChange={(e) => set('accessPoints', e.target.value)}
            placeholder="Loading docks, service entrances, roof access"
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              minHeight: '80px',
              boxSizing: 'border-box',
              fontFamily: 'sans-serif',
            }}
          />
        </div>

        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Special Considerations
          </label>
          <textarea
            value={form.specialConsiderations}
            onChange={(e) => set('specialConsiderations', e.target.value)}
            placeholder="Truss roof, elevator availability, solar panels, EV chargers, etc."
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              minHeight: '80px',
              boxSizing: 'border-box',
              fontFamily: 'sans-serif',
            }}
          />
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="bg-red-500 text-white"
        style={{
          padding: '0.5rem 1.5rem',
          borderRadius: '0.375rem',
          border: 'none',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <Flame size={16} />
        Generate Pre-Plan
      </button>

      {loading && <LoadingSpinner />}

      {result && (
        <div style={{ marginTop: '2rem' }}>
          <SuccessAlert message="Pre-incident plan generated successfully!" />
          <div className="bg-gray-100 dark:bg-gray-800" style={{ marginTop: '1rem', borderRadius: '1rem', padding: '1.5rem' }}>
            <h3 className="text-gray-900 dark:text-gray-100" style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>
              {result.address}
            </h3>

            {result.propertyInfo && (
              <Section title="Property Information" icon={Map}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', fontSize: '0.875rem' }}>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Type: {result.propertyInfo.type}</p>
                    <p className="text-gray-500 dark:text-gray-400">Construction: {result.propertyInfo.constructionType}</p>
                    <p className="text-gray-500 dark:text-gray-400">Stories: {result.propertyInfo.stories || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Sq Ft: {result.propertyInfo.squareFootage || '—'}</p>
                    <p className="text-gray-500 dark:text-gray-400">Occupancy: {result.propertyInfo.occupancyType || '—'}</p>
                    <p className="text-gray-500 dark:text-gray-400">Built: {result.propertyInfo.yearBuilt || '—'}</p>
                  </div>
                </div>
                {result.propertyInfo.utilities && (
                  <div style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
                    <p className="text-gray-900 dark:text-gray-100" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Utilities:</p>
                    {result.propertyInfo.utilities.map((u, i) => (
                      <p key={i} className="text-gray-500 dark:text-gray-400" style={{ marginLeft: '0.5rem' }}>• {u}</p>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {result.scenarios && result.scenarios.length > 0 && (
              <Section title="Tactical Scenarios" icon={AlertTriangle}>
                {result.scenarios.map((scenario, idx) => (
                  <div key={idx} className={idx < result.scenarios.length - 1 ? 'border-b border-gray-200 dark:border-gray-700' : ''} style={{ marginBottom: idx < result.scenarios.length - 1 ? '1rem' : 0, paddingBottom: idx < result.scenarios.length - 1 ? '1rem' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <h4 className="text-gray-900 dark:text-gray-100" style={{ fontSize: '0.95rem', fontWeight: 600 }}>{scenario.type}</h4>
                      <RiskBadge level={scenario.riskLevel} />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>{scenario.apparatusStrategy}</p>
                    {scenario.initialActions && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <p className="text-gray-600 dark:text-gray-300" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Initial Actions:</p>
                        <ul className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.8rem', paddingLeft: '1.5rem' }}>
                          {scenario.initialActions.map((action, i) => (
                            <li key={i}>{action}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {result.tactics && (
              <Section title="Tactical Considerations" icon={Shield}>
                {result.tactics.waterSupply && (
                  <div className="border-b border-gray-200 dark:border-gray-700" style={{ marginBottom: '1rem', paddingBottom: '1rem' }}>
                    <h5 className="text-gray-900 dark:text-gray-100" style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Water Supply</h5>
                    <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.8rem' }}>{result.tactics.waterSupply}</p>
                  </div>
                )}
                {result.tactics.apparatusPlacement && (
                  <div className="border-b border-gray-200 dark:border-gray-700" style={{ marginBottom: '1rem', paddingBottom: '1rem' }}>
                    <h5 className="text-gray-900 dark:text-gray-100" style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Apparatus Placement</h5>
                    <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.8rem' }}>{result.tactics.apparatusPlacement}</p>
                  </div>
                )}
                {result.tactics.ventilation && (
                  <div className="border-b border-gray-200 dark:border-gray-700" style={{ marginBottom: '1rem', paddingBottom: '1rem' }}>
                    <h5 className="text-gray-900 dark:text-gray-100" style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Ventilation</h5>
                    <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.8rem' }}>{result.tactics.ventilation}</p>
                  </div>
                )}
              </Section>
            )}

            {result.safety && (
              <Section title="Safety Considerations" icon={Shield}>
                {result.safety.ritConsiderations && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <p className="text-red-900 dark:text-red-300" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>RIT Setup:</p>
                    <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.8rem' }}>{result.safety.ritConsiderations}</p>
                  </div>
                )}
                {result.safety.ppeRequirements && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <p className="text-red-900 dark:text-red-300" style={{ fontSize: '0.8rem', fontWeight: 600 }}>PPE Requirements:</p>
                    <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.8rem' }}>{result.safety.ppeRequirements}</p>
                  </div>
                )}
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Enhance Existing ────────────────────────────────────────────────────
function EnhanceExistingTab() {
  const [preplans, setPreplans] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [enhancementLoading, setEnhancementLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchPreplans() {
      setLoading(true);
      try {
        const response = await api.get('/api/pre-plans');
        const plans = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
        setPreplans(plans);
        if (plans.length > 0) setSelectedId(String(plans[0].id));
      } catch (err) {
        console.error('Error fetching preplans:', err);
        setError('Failed to load pre-plans');
      } finally {
        setLoading(false);
      }
    }
    fetchPreplans();
  }, []);

  async function handleEnhance() {
    setError('');
    setResult(null);

    if (!selectedId) {
      setError('Please select a pre-plan');
      return;
    }

    setEnhancementLoading(true);
    try {
      const response = await api.post('/api/preplan-ai/enhance', { preplanId: Number(selectedId) });
      if (response) {
        setResult(response);
      } else {
        setError('Unexpected response format');
      }
    } catch (err) {
      console.error('Error enhancing pre-plan:', err);
      setError(err?.message || 'Failed to enhance pre-plan');
    } finally {
      setEnhancementLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Select Pre-Plan
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          >
            {preplans.map((plan) => (
              <option key={plan.id} value={String(plan.id)}>
                {plan.occupancyName || plan.address || `Plan #${plan.id}`}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleEnhance}
          disabled={enhancementLoading}
          className="bg-amber-500 text-white"
          style={{
            padding: '0.5rem 1.5rem',
            borderRadius: '0.375rem',
            border: 'none',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: enhancementLoading ? 'not-allowed' : 'pointer',
            opacity: enhancementLoading ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            whiteSpace: 'nowrap',
          }}
        >
          <Zap size={16} />
          Analyze & Enhance
        </button>
      </div>

      {error && <ErrorAlert message={error} />}
      {enhancementLoading && <LoadingSpinner />}

      {result && (
        <div style={{ marginTop: '2rem' }}>
          <SuccessAlert message="Analysis complete!" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem', marginBottom: '2rem' }}>
            <div className="bg-white dark:bg-gray-900" style={{
              borderRadius: '1rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              padding: '1.5rem',
              textAlign: 'center',
            }}>
              <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>Risk Rating</p>
              <RiskBadge level={result.riskRating} />
            </div>

            {result.completenessScore !== undefined && (
              <div className="bg-white dark:bg-gray-900" style={{
                borderRadius: '1rem',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                padding: '1.5rem',
              }}>
                <CircularProgress score={result.completenessScore} />
              </div>
            )}
          </div>

          {result.suggestions && result.suggestions.length > 0 && (
            <Section title="Enhancement Suggestions" icon={TrendingUp}>
              {result.suggestions.map((suggestion, idx) => (
                <div key={idx} className={idx < result.suggestions.length - 1 ? 'border-b border-gray-200 dark:border-gray-700' : ''} style={{
                  marginBottom: idx < result.suggestions.length - 1 ? '1rem' : 0,
                  paddingBottom: idx < result.suggestions.length - 1 ? '1rem' : 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div className={suggestion.priority === 'high' ? 'bg-red-100 dark:bg-red-950/50 text-red-900 dark:text-red-300' : suggestion.priority === 'medium' ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300' : 'bg-blue-100 dark:bg-blue-950/50 text-sky-900 dark:text-sky-300'} style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>
                      {suggestion.priority?.toUpperCase()}
                    </div>
                    <h4 className="text-gray-900 dark:text-gray-100" style={{ fontSize: '0.95rem', fontWeight: 600, flex: 1 }}>{suggestion.category}</h4>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>{suggestion.suggestion}</p>
                  <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>Rationale: {suggestion.rationale}</p>
                </div>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Hazard Analysis ─────────────────────────────────────────────────────
function HazardAnalysisTab() {
  const [form, setForm] = useState({
    propertyType: 'Commercial',
    constructionType: 'Type II Non-Combustible',
    hazards: [],
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const commonHazards = [
    'Flammable liquids',
    'Compressed gases',
    'Chemicals',
    'Truss construction',
    'Lightweight construction',
    'Solar panels',
    'EV charging stations',
    'Asbestos',
    'Lead paint',
    'Spray foam insulation',
  ];

  const propertyTypes = ['Residential', 'Commercial', 'Industrial', 'High-Rise', 'School', 'Hospital', 'Assembly', 'Storage', 'Mixed-Use'];
  const constructionTypes = ['Type I Fire Resistive', 'Type II Non-Combustible', 'Type III Ordinary', 'Type IV Heavy Timber', 'Type V Wood Frame'];

  function toggleHazard(hazard) {
    setForm((f) => ({
      ...f,
      hazards: f.hazards.includes(hazard)
        ? f.hazards.filter((h) => h !== hazard)
        : [...f.hazards, hazard],
    }));
  }

  async function handleAnalyze() {
    setError('');
    setResult(null);

    if (!form.propertyType) {
      setError('Property type is required');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/api/preplan-ai/hazard-analysis', {
        propertyType: form.propertyType,
        constructionType: form.constructionType,
        hazards: form.hazards,
      });
      if (response?.analysis) {
        setResult(response.analysis);
      } else {
        setError('Unexpected response format');
      }
    } catch (err) {
      console.error('Error analyzing hazards:', err);
      setError(err?.message || 'Failed to analyze hazards');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Property Type
          </label>
          <select
            value={form.propertyType}
            onChange={(e) => setForm((f) => ({ ...f, propertyType: e.target.value }))}
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          >
            {propertyTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Construction Type
          </label>
          <select
            value={form.constructionType}
            onChange={(e) => setForm((f) => ({ ...f, constructionType: e.target.value }))}
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          >
            {constructionTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900" style={{
        borderRadius: '1rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        padding: '1.5rem',
        marginBottom: '1rem',
      }}>
        <h3 className="text-gray-900 dark:text-gray-100" style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}>Known Hazards</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          {commonHazards.map((hazard) => (
            <label key={hazard} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.hazards.includes(hazard)}
                onChange={() => toggleHazard(hazard)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>{hazard}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="bg-red-500 text-white"
        style={{
          padding: '0.5rem 1.5rem',
          borderRadius: '0.375rem',
          border: 'none',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <AlertTriangle size={16} />
        Analyze Hazards
      </button>

      {loading && <LoadingSpinner />}

      {result && (
        <div style={{ marginTop: '2rem' }}>
          <SuccessAlert message="Hazard analysis complete!" />

          <Section title="Fire Behavior Prediction" icon={Flame}>
            <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>{result.fireBehavior}</p>
          </Section>

          <Section title="Collapse Risk Assessment" icon={AlertTriangle}>
            <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>{result.collapseRisk}</p>
          </Section>

          <Section title="HazMat Risks" icon={AlertCircle}>
            <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>{result.hazmatRisks}</p>
          </Section>

          <Section title="PPE Requirements" icon={Shield}>
            <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>{result.ppeRequirements}</p>
          </Section>

          <Section title="Tactical Notes" icon={TrendingUp}>
            <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>{result.tacticalNotes}</p>
          </Section>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Size-Up Builder ─────────────────────────────────────────────────────
function SizeUpBuilderTab() {
  const [form, setForm] = useState({
    incidentType: 'Structure Fire',
    propertyType: 'Commercial',
    conditions: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const incidentTypes = ['Structure Fire', 'Vehicle Fire', 'HazMat', 'Technical Rescue', 'EMS MCI', 'Wildland/Brush'];
  const propertyTypes = ['Residential', 'Commercial', 'Industrial', 'High-Rise', 'School', 'Hospital', 'Assembly', 'Storage', 'Vehicle', 'Other'];

  async function handleGenerate() {
    setError('');
    setResult(null);

    if (!form.incidentType) {
      setError('Incident type is required');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/api/preplan-ai/size-up', {
        incidentType: form.incidentType,
        propertyType: form.propertyType,
        conditions: form.conditions,
      });
      if (response?.sizeUp) {
        setResult(response.sizeUp);
      } else {
        setError('Unexpected response format');
      }
    } catch (err) {
      console.error('Error generating size-up:', err);
      setError(err?.message || 'Failed to generate size-up checklist');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Incident Type
          </label>
          <select
            value={form.incidentType}
            onChange={(e) => setForm((f) => ({ ...f, incidentType: e.target.value }))}
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          >
            {incidentTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Property Type
          </label>
          <select
            value={form.propertyType}
            onChange={(e) => setForm((f) => ({ ...f, propertyType: e.target.value }))}
            className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          >
            {propertyTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label className="text-gray-700 dark:text-gray-200" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Current Conditions
        </label>
        <textarea
          value={form.conditions}
          onChange={(e) => setForm((f) => ({ ...f, conditions: e.target.value }))}
          placeholder="Describe what you see on arrival - smoke color/volume, fire location, visible hazards, weather, etc."
          className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            minHeight: '100px',
            boxSizing: 'border-box',
            fontFamily: 'sans-serif',
          }}
        />
      </div>

      {error && <ErrorAlert message={error} />}

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="bg-red-500 text-white"
        style={{
          padding: '0.5rem 1.5rem',
          borderRadius: '0.375rem',
          border: 'none',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <Clock size={16} />
        Generate Size-Up
      </button>

      {loading && <LoadingSpinner />}

      {result && (
        <div style={{ marginTop: '2rem' }}>
          <SuccessAlert message="Size-up checklist generated!" />

          {result.initialActions && result.initialActions.length > 0 && (
            <Section title="Initial Actions" icon={Clock}>
              <ol className="text-gray-500 dark:text-gray-400" style={{ paddingLeft: '1.5rem', fontSize: '0.875rem' }}>
                {result.initialActions.map((action, idx) => (
                  <li key={idx} style={{ marginBottom: '0.5rem' }}>
                    <strong className="text-gray-900 dark:text-gray-100">{action.action}</strong>
                    {action.priority && <span className={action.priority === 'immediate' ? 'bg-red-100 dark:bg-red-950/50 text-red-900 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'} style={{ marginLeft: '0.5rem', fontSize: '0.75rem', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>({action.priority})</span>}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {result.decisionPoints && result.decisionPoints.length > 0 && (
            <Section title="Decision Points" icon={AlertCircle}>
              {result.decisionPoints.map((dp, idx) => (
                <div key={idx} className={idx < result.decisionPoints.length - 1 ? 'border-b border-gray-200 dark:border-gray-700' : ''} style={{
                  marginBottom: idx < result.decisionPoints.length - 1 ? '1rem' : 0,
                  paddingBottom: idx < result.decisionPoints.length - 1 ? '1rem' : 0,
                  fontSize: '0.875rem',
                }}>
                  <p className="text-gray-900 dark:text-gray-100" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>If: {dp.point}</p>
                  <p className="text-gray-500 dark:text-gray-400" style={{ marginLeft: '1rem', marginBottom: '0.25rem' }}>Yes → {dp.ifYes}</p>
                  <p className="text-gray-500 dark:text-gray-400" style={{ marginLeft: '1rem' }}>No → {dp.ifNo}</p>
                </div>
              ))}
            </Section>
          )}

          {result.benchmarks && result.benchmarks.length > 0 && (
            <Section title="Escalation Benchmarks" icon={TrendingUp}>
              {result.benchmarks.map((b, idx) => (
                <div key={idx} className={idx < result.benchmarks.length - 1 ? 'border-b border-gray-200 dark:border-gray-700' : ''} style={{
                  marginBottom: idx < result.benchmarks.length - 1 ? '1rem' : 0,
                  paddingBottom: idx < result.benchmarks.length - 1 ? '1rem' : 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <h4 className="text-gray-900 dark:text-gray-100" style={{ fontSize: '0.875rem', fontWeight: 600 }}>{b.benchmark}</h4>
                    <RiskBadge level={b.riskLevel} />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.8rem' }}>Action: {b.action}</p>
                </div>
              ))}
            </Section>
          )}

          {result.resources && result.resources.length > 0 && (
            <Section title="Recommended Resources" icon={Shield}>
              <ul className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', paddingLeft: '1.5rem' }}>
                {result.resources.map((r, idx) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </Section>
          )}

          {result.contingencies && result.contingencies.length > 0 && (
            <Section title="Contingencies" icon={AlertTriangle}>
              {result.contingencies.map((c, idx) => (
                <div key={idx} className={idx < result.contingencies.length - 1 ? 'border-b border-gray-200 dark:border-gray-700' : ''} style={{
                  marginBottom: idx < result.contingencies.length - 1 ? '1rem' : 0,
                  paddingBottom: idx < result.contingencies.length - 1 ? '1rem' : 0,
                }}>
                  <p className="text-gray-900 dark:text-gray-100" style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>If: {c.scenario}</p>
                  <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem', marginLeft: '1rem' }}>Then: {c.response}</p>
                </div>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PrePlanAI() {
  const [activeTab, setActiveTab] = useState('generate');

  const tabs = [
    { id: 'generate', label: 'Generate Pre-Plan', icon: Flame },
    { id: 'enhance', label: 'Enhance Existing', icon: Zap },
    { id: 'hazards', label: 'Hazard Analysis', icon: AlertTriangle },
    { id: 'sizeup', label: 'Size-Up Builder', icon: Clock },
  ];

  return (
    <div className="bg-gray-50 dark:bg-gray-950" style={{ minHeight: '100vh', padding: '1.5rem' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 className="text-gray-900 dark:text-gray-100" style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            AI Pre-Plan Generator
          </h1>
          <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.95rem' }}>
            Generate and enhance fire department pre-incident plans using AI-powered tactical analysis
          </p>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '2rem',
          overflowX: 'auto',
          paddingBottom: '0.5rem',
        }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={activeTab === tab.id ? 'bg-red-500 text-white' : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400'}
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                }}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="bg-white dark:bg-gray-900" style={{
          borderRadius: '1rem',
          padding: '2rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}>
          {activeTab === 'generate' && <GeneratePrePlanTab />}
          {activeTab === 'enhance' && <EnhanceExistingTab />}
          {activeTab === 'hazards' && <HazardAnalysisTab />}
          {activeTab === 'sizeup' && <SizeUpBuilderTab />}
        </div>
      </div>
    </div>
  );
}
