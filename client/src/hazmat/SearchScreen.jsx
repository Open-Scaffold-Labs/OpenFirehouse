import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Colors, Typography, Spacing, Radius, TOTAL_MATERIALS, TOTAL_GUIDES, TOTAL_ISOLATION_DISTANCES } from './theme';
import { searchMaterials, getMaterialsByClass, getStats, getGuide, getGuides } from './api';
import MaterialCard from './MaterialCard';

// SearchScreen — primary entry of the ERG reference (web port of mobile
// SearchScreen.tsx). Search by name / UN / CAS / guide #, hazard-class filter,
// a pinned ERG guide card when the query is a 3-digit guide, plus the home
// state (stats + hazard-class / Table-3 / guide quick buttons).

const CLASS_FILTERS = [
  { key: '1',   label: 'Explosives',  color: '#D35400' },
  { key: '2.1', label: 'Flam. Gas',   color: '#FF6B00' },
  { key: '2.3', label: 'Toxic Gas',   color: '#C0392B' },
  { key: '3',   label: 'Flam. Liq.',  color: '#FF4444' },
  { key: '4.3', label: 'Water React', color: '#2980B9' },
  { key: '5.1', label: 'Oxidizer',    color: '#E6C200' },
  { key: '6.1', label: 'Toxic',       color: '#7F8C8D' },
  { key: '7',   label: 'Radioactive', color: '#8E44AD' },
  { key: '8',   label: 'Corrosive',   color: '#27AE60' },
];

const TABLE3 = [
  { un: '1005', label: 'Ammonia' }, { un: '1017', label: 'Chlorine' },
  { un: '1040', label: 'Eth. Oxide' }, { un: '1050', label: 'HCl' },
  { un: '1052', label: 'HF' }, { un: '1079', label: 'SO₂' },
  { un: '2186', label: 'HCl Ref.' },
];

function GuideSearchCard({ guide, onPress }) {
  return (
    <button type="button" onClick={onPress} style={{
      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
      background: Colors.bgSecondary, border: `1px solid ${Colors.accent}`,
      borderLeft: `5px solid ${Colors.accent}`, borderRadius: Radius.md,
      margin: `${Spacing.xs}px 0`, padding: Spacing.md,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: Spacing.sm }}>
        <span style={{ fontSize: Typography.xl, fontWeight: 800, color: Colors.accent }}>{guide.guide_number}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: Typography.bold, color: Colors.accent, letterSpacing: 1 }}>ERG GUIDE</div>
          <div style={{ fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary }}>{guide.title}</div>
        </div>
        <span style={{ fontSize: 22, color: Colors.textTertiary }}>›</span>
      </div>
    </button>
  );
}

export default function SearchScreen({ onSelectMaterial, onSelectGuide, selectedMaterialId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [classFilter, setClassFilter] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [guideMatch, setGuideMatch] = useState(null);
  const [dbStats, setDbStats] = useState(null);
  const [guides, setGuides] = useState([]);
  const debounceRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  useEffect(() => {
    getStats().then(s => mountedRef.current && setDbStats({ materials: s.materials, guides: s.guides, isolations: s.isolations }))
      .catch(e => console.warn('[hazmat SearchScreen] getStats failed:', e));
    getGuides().then(g => mountedRef.current && setGuides(g))
      .catch(e => console.warn('[hazmat SearchScreen] getGuides failed:', e));
  }, []);

  const runSearch = useCallback(async (q, cls) => {
    const hasText = q.trim().length > 0;
    const hasClass = !!cls;
    if (!hasText && !hasClass) { setResults([]); setTotal(0); setHasSearched(false); setGuideMatch(null); return; }
    setLoading(true); setHasSearched(true);

    const trimmed = q.trim();
    if (/^\d{3}$/.test(trimmed)) {
      getGuide(parseInt(trimmed, 10)).then(({ guide }) => { if (mountedRef.current) setGuideMatch(guide); })
        .catch(() => { if (mountedRef.current) setGuideMatch(null); });
    } else { setGuideMatch(null); }

    try {
      let finalResults = [], finalTotal = 0;
      if (hasText && hasClass) {
        const { results: r } = await searchMaterials(trimmed, 200);
        finalResults = r.filter(m => (m.hazard_class || '').startsWith(cls));
        finalTotal = finalResults.length;
      } else if (hasClass && !hasText) {
        finalResults = await getMaterialsByClass(cls, 200);
        finalTotal = finalResults.length;
      } else {
        const { results: r, total: t2 } = await searchMaterials(trimmed, 100);
        finalResults = r; finalTotal = t2;
      }
      if (!mountedRef.current) return;
      setResults(finalResults); setTotal(finalTotal);
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const handleQueryChange = useCallback((text) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text, classFilter), 280);
  }, [classFilter, runSearch]);

  const handleClassFilter = useCallback((key) => {
    const next = classFilter === key ? null : key;
    setClassFilter(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runSearch(query, next);
  }, [classFilter, query, runSearch]);

  const handleClear = useCallback(() => {
    setQuery(''); setClassFilter(null); setResults([]); setTotal(0);
    setHasSearched(false); setGuideMatch(null);
  }, []);

  const handleQuickSearch = useCallback((q) => { setQuery(q); runSearch(q, classFilter); }, [runSearch, classFilter]);

  const showHome = !hasSearched && !loading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: Colors.bgPrimary }}>
      {/* Header */}
      <div style={{ padding: `${Spacing.sm}px ${Spacing.base}px ${Spacing.md}px`, textAlign: 'center', borderBottom: `1px solid ${Colors.border}` }}>
        <span style={{ fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textSecondary, letterSpacing: 1.6, textTransform: 'uppercase' }}>
          Search ERG 2024
        </span>
      </div>

      {/* Search input */}
      <div style={{ padding: `${Spacing.md}px ${Spacing.base}px ${Spacing.sm}px`, position: 'relative' }}>
        <input
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          placeholder="Name, UN, CAS, or ERG guide #"
          style={{
            width: '100%', boxSizing: 'border-box', background: Colors.searchBg,
            border: `2px solid ${query || classFilter ? Colors.searchFocus : Colors.searchBorder}`,
            borderRadius: Radius.md, color: Colors.textPrimary, fontSize: Typography.md,
            padding: `${Spacing.md}px ${Spacing.base}px`, outline: 'none',
            boxShadow: query || classFilter ? `0 0 12px ${Colors.brandRed}55` : 'none',
          }}
        />
        {(query || classFilter) && (
          <button type="button" onClick={handleClear} aria-label="Clear search" style={{
            position: 'absolute', right: Spacing.base + 12, top: '50%', transform: 'translateY(-50%)',
            background: Colors.bgTertiary, border: 'none', borderRadius: Radius.full, color: Colors.textSecondary,
            width: 24, height: 24, cursor: 'pointer', fontSize: 14, lineHeight: '24px',
          }}>×</button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${Spacing.base}px ${Spacing.xxl}px` }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: Spacing.xxl, color: Colors.textSecondary }}>
            Searching {(dbStats?.materials ?? TOTAL_MATERIALS).toLocaleString()} materials…
          </div>
        ) : hasSearched && results.length === 0 && !guideMatch ? (
          <div style={{ textAlign: 'center', padding: Spacing.xxl, color: Colors.textSecondary }}>
            <div style={{ fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textPrimary, marginBottom: Spacing.sm }}>No results found</div>
            <div style={{ fontSize: Typography.sm }}>Try a different name, UN number, or CAS number</div>
          </div>
        ) : !showHome ? (
          <>
            {total > 0 && (
              <div style={{ padding: `${Spacing.sm}px 0`, borderBottom: `1px solid ${Colors.border}`, marginBottom: Spacing.xs }}>
                <span style={{ fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium }}>
                  {total.toLocaleString()} result{total !== 1 ? 's' : ''}{classFilter ? ` · Class ${classFilter}` : ''}
                </span>
              </div>
            )}
            {guideMatch && <GuideSearchCard guide={guideMatch} onPress={() => onSelectGuide?.(guideMatch.guide_number)} />}
            {results.map(m => (
              <MaterialCard key={m.id} material={m} onPress={() => onSelectMaterial?.(m)}
                selected={selectedMaterialId != null && m.id === selectedMaterialId} />
            ))}
          </>
        ) : (
          <HomeState
            stats={dbStats}
            guides={guides}
            onQuickSearch={handleQuickSearch}
            onClassFilter={handleClassFilter}
            onGuidePress={n => onSelectGuide?.(n)}
          />
        )}
      </div>
    </div>
  );
}

function HomeState({ stats, guides, onQuickSearch, onClassFilter, onGuidePress }) {
  const materials = stats?.materials ?? TOTAL_MATERIALS;
  const guideCount = stats?.guides ?? TOTAL_GUIDES;
  const isolations = stats?.isolations ?? TOTAL_ISOLATION_DISTANCES;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: Spacing.base }}>
      {/* Hero */}
      <div style={{
        position: 'relative', width: 240, height: 150, display: 'flex',
        alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs,
        background: 'radial-gradient(circle, rgba(255,69,0,0.35) 0%, rgba(255,69,0,0.08) 40%, transparent 70%)',
      }}>
        <span style={{ fontSize: 88 }} role="img" aria-label="hazmat">☣️</span>
      </div>
      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1, marginBottom: Spacing.lg }}>
        <span style={{ color: '#FF2020' }}>Fire</span><span style={{ color: '#F5820A' }}>Hazmat</span>
      </div>

      {/* Stats */}
      <div style={{
        display: 'flex', alignItems: 'center', width: '100%', maxWidth: 520,
        background: Colors.bgSecondary, border: `1px solid ${Colors.brandRed}`,
        borderRadius: Radius.lg, padding: `${Spacing.md}px ${Spacing.base}px`, marginBottom: Spacing.lg,
      }}>
        {[[materials.toLocaleString(), 'MATERIALS'], [guideCount, 'GUIDES'], [isolations, 'ISOLATION ZONES']].map(([n, l], i) => (
          <React.Fragment key={l}>
            {i > 0 && <div style={{ width: 1, height: 32, background: Colors.border }} />}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: Typography.lg, fontWeight: 800, color: Colors.textPrimary }}>{n}</div>
              <div style={{ fontSize: 9, fontWeight: Typography.bold, color: Colors.textTertiary, letterSpacing: 1.2 }}>{l}</div>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Hazard class */}
      <Section label="HAZARD CLASS" color={Colors.textSecondary}>
        {CLASS_FILTERS.map(item => (
          <Chip key={item.key} color={item.color} onClick={() => onClassFilter(item.key)} label={item.label.toUpperCase()} accent />
        ))}
      </Section>

      {/* Table 3 */}
      <Section label="ERG TABLE 3 HAZARDS" color="#FF1A1A" glow>
        {TABLE3.map(item => (
          <Chip key={item.un} color="#FF1A1A" onClick={() => onQuickSearch(item.un)} label={item.label.toUpperCase()} accent glow />
        ))}
      </Section>

      {/* Guide numbers */}
      {guides.length > 0 && (
        <Section label="ERG GUIDE NUMBER" color={Colors.accent}>
          {guides.map(g => (
            <button key={g.guide_number} type="button" onClick={() => onGuidePress(g.guide_number)} title={g.title} style={{
              minWidth: 56, padding: `${Spacing.sm + 2}px ${Spacing.md}px`, cursor: 'pointer',
              borderRadius: Radius.md, border: `1.5px solid ${Colors.accent}60`, background: 'transparent',
              color: Colors.accent, fontSize: 15, fontWeight: 800, letterSpacing: 0.5,
              boxShadow: `0 0 10px #FF450055`,
            }}>{g.guide_number}</button>
          ))}
        </Section>
      )}

      <div style={{
        marginTop: Spacing.lg, width: '100%', maxWidth: 640, fontSize: Typography.xs,
        color: Colors.textSecondary, lineHeight: 1.5, borderLeft: `3px solid ${Colors.brandRed}`,
        background: Colors.bgSecondary, padding: Spacing.md, borderRadius: Radius.sm,
      }}>
        ⚠ ERG 2024 (PHMSA/DOT). For trained hazmat personnel only. Always confirm with official ERG documentation and incident command authority.
      </div>
    </div>
  );
}

function Section({ label, color, glow, children }) {
  return (
    <div style={{ width: '100%', maxWidth: 640, marginBottom: Spacing.lg }}>
      <div style={{
        fontSize: Typography.xs, fontWeight: Typography.bold, color, letterSpacing: 1.4,
        marginBottom: Spacing.sm, textAlign: 'center',
        textShadow: glow ? '0 0 12px #FF0000CC' : 'none',
      }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}

function Chip({ color, onClick, label, glow }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
      borderRadius: Radius.md, border: `1.5px solid ${color}${glow ? 'BB' : '60'}`,
      background: `${color}${glow ? '25' : '18'}`,
      padding: `${Spacing.md}px ${Spacing.base}px`,
      boxShadow: glow ? `0 0 16px ${color}99` : 'none',
    }}>
      <span style={{ width: 4, height: 16, borderRadius: 2, background: color }} />
      <span style={{ fontSize: Typography.xs + 1, fontWeight: Typography.bold, letterSpacing: 0.6, color, textShadow: glow ? '0 0 12px #FF0000CC' : 'none' }}>{label}</span>
    </button>
  );
}
