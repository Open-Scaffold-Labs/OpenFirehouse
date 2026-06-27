import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Colors, Typography, Spacing, Radius, PLACARD_COLORS } from './theme';
import { getMaterialsByClass, searchMaterials, getClassCounts, getGuide } from './api';
import MaterialCard from './MaterialCard';

// PlacardScreen — DOT placard grid + UN/guide search (web port of mobile
// PlacardScreen.tsx). Diamonds render the official placard color (49 CFR 172)
// with the class number + name; tapping a class lists its materials. The UN box
// also pins an ERG guide card when given a 3-digit guide number.

const PLACARD_CLASSES = [
  { class: '1',   label: 'Explosives',          name: 'EXPLOSIVES',           textColor: '#000', glowColor: '#FF8C00' },
  { class: '2.1', label: 'Flammable Gas',        name: 'FLAMMABLE GAS',        textColor: '#fff', glowColor: '#FF2200' },
  { class: '2.2', label: 'Non-Flammable Gas',    name: 'NON-FLAM. GAS',        textColor: '#fff', glowColor: '#00C853' },
  { class: '2.3', label: 'Poison Gas',           name: 'POISON GAS',           textColor: '#000', glowColor: '#FFFFFF' },
  { class: '3',   label: 'Flammable Liquid',     name: 'FLAMMABLE',            textColor: '#fff', glowColor: '#FF2200' },
  { class: '4.1', label: 'Flammable Solid',      name: 'FLAMMABLE SOLID',      textColor: '#000', glowColor: '#FF4444' },
  { class: '4.2', label: 'Spont. Combustible',   name: 'SPONT. COMBUST.',      textColor: '#000', glowColor: '#FF6600' },
  { class: '4.3', label: 'Dangerous When Wet',   name: 'DANGEROUS WHEN WET',   textColor: '#fff', glowColor: '#2196F3' },
  { class: '5.1', label: 'Oxidizer',             name: 'OXIDIZER',             textColor: '#000', glowColor: '#FFD600' },
  { class: '5.2', label: 'Organic Peroxide',     name: 'ORGANIC PEROXIDE',     textColor: '#000', glowColor: '#FF6D00' },
  { class: '6.1', label: 'Toxic',                name: 'TOXIC',                textColor: '#000', glowColor: '#9C27B0' },
  { class: '6.2', label: 'Infectious Substance', name: 'INFECTIOUS',           textColor: '#000', glowColor: '#FF6F00' },
  { class: '7',   label: 'Radioactive',          name: 'RADIOACTIVE',          textColor: '#000', glowColor: '#FFEA00' },
  { class: '8',   label: 'Corrosive',            name: 'CORROSIVE',            textColor: '#000', glowColor: '#78909C' },
  { class: '9',   label: 'Miscellaneous',        name: 'MISC.',                textColor: '#000', glowColor: '#90A4AE' },
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

function PlacardTile({ item, count, onPress }) {
  const color = PLACARD_COLORS[item.class];
  const lightBg = color === '#FFFFFF' || color === '#FFF8E1';
  return (
    <button type="button" onClick={onPress} title={`Class ${item.class} — ${item.label}`} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: 'transparent', border: 'none', cursor: 'pointer', padding: '10px 2px',
    }}>
      <div style={{ width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{
          width: 68, height: 68, transform: 'rotate(45deg)', borderRadius: 8,
          background: color, border: `1.5px solid ${lightBg ? '#666' : 'rgba(0,0,0,0.25)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 22px ${item.glowColor}99, 0 4px 8px rgba(0,0,0,0.5)`,
        }}>
          <div style={{ transform: 'rotate(-45deg)', textAlign: 'center', width: 86, padding: 2 }}>
            <div style={{ fontSize: 8.5, fontWeight: 900, color: item.textColor, letterSpacing: 0.3, lineHeight: 1.05 }}>{item.name}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: item.textColor, lineHeight: 1.1 }}>{item.class}</div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: Typography.semibold, color: Colors.textPrimary, textAlign: 'center', lineHeight: 1.2 }}>{item.label}</div>
      {count > 0 && <div style={{ fontSize: 11, color: Colors.textSecondary }}>{count} material{count !== 1 ? 's' : ''}</div>}
    </button>
  );
}

export default function PlacardScreen({ onSelectMaterial, onSelectGuide }) {
  const mountedRef = useRef(true);
  const debounceRef = useRef(null);
  const [classCounts, setClassCounts] = useState({});
  const [selected, setSelected] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unQuery, setUnQuery] = useState('');
  const [guideMatch, setGuideMatch] = useState(null);

  useEffect(() => {
    mountedRef.current = true;
    getClassCounts().then(c => mountedRef.current && setClassCounts(c)).catch(() => {});
    return () => { mountedRef.current = false; if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleClassSelect = useCallback(async (cls) => {
    const next = selected === cls ? null : cls;
    setSelected(next); setUnQuery(''); setGuideMatch(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!next) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await getMaterialsByClass(next, 150);
      if (mountedRef.current) setResults(r);
    } finally { if (mountedRef.current) setLoading(false); }
  }, [selected]);

  const runUnSearch = useCallback(async (text) => {
    const t = text.trim();
    if (/^\d{3}$/.test(t)) {
      getGuide(parseInt(t, 10)).then(({ guide }) => { if (mountedRef.current) setGuideMatch(guide); })
        .catch(() => { if (mountedRef.current) setGuideMatch(null); });
    } else if (mountedRef.current) { setGuideMatch(null); }
    if (!t || t.length < 2) { if (mountedRef.current) setResults([]); return; }
    if (mountedRef.current) setLoading(true);
    try {
      const { results: r } = await searchMaterials(t, 50);
      if (mountedRef.current) setResults(r);
    } finally { if (mountedRef.current) setLoading(false); }
  }, []);

  const handleUnSearch = useCallback((text) => {
    setUnQuery(text); setSelected(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setResults([]); setGuideMatch(null); return; }
    debounceRef.current = setTimeout(() => runUnSearch(text), 200);
  }, [runUnSearch]);

  const selectedClass = PLACARD_CLASSES.find(c => c.class === selected);
  const showGrid = !selected && results.length === 0 && !guideMatch;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: Colors.bgPrimary }}>
      {/* Header */}
      <div style={{ padding: `${Spacing.sm}px ${Spacing.base}px ${Spacing.xs}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: Colors.textPrimary, letterSpacing: -0.3, textTransform: 'uppercase' }}>Placard Identification</span>
          <span style={{ background: Colors.accent + '22', border: `1px solid ${Colors.accent}`, borderRadius: Radius.xs, padding: '2px 8px', fontSize: 10, fontWeight: 800, color: Colors.accent, letterSpacing: 1.5 }}>DOT</span>
        </div>
        <div style={{ fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 3 }}>49 CFR 172 — Tap a hazard class or search by UN number</div>
        <div style={{ height: 2, borderRadius: 1, marginTop: 10, background: Colors.brandRed }} />
      </div>

      {/* UN/guide search */}
      <div style={{ padding: `${Spacing.md}px ${Spacing.base}px ${Spacing.sm}px`, position: 'relative' }}>
        <input
          value={unQuery}
          onChange={e => handleUnSearch(e.target.value)}
          placeholder="UN or ERG guide # (e.g. 1017, 127)"
          inputMode="numeric"
          maxLength={4}
          style={{
            width: '100%', boxSizing: 'border-box', background: Colors.searchBg,
            border: `2px solid ${unQuery ? Colors.searchFocus : Colors.searchBorder}`,
            borderRadius: Radius.md, color: Colors.textPrimary, fontSize: Typography.md,
            padding: `${Spacing.md - 2}px ${Spacing.base}px`, outline: 'none',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${Spacing.base}px ${Spacing.xl}px` }}>
        {showGrid ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: Spacing.sm, paddingTop: Spacing.xs }}>
            {PLACARD_CLASSES.map(item => (
              <PlacardTile key={item.class} item={item} count={classCounts[item.class]} onPress={() => handleClassSelect(item.class)} />
            ))}
          </div>
        ) : (
          <>
            {selected && selectedClass && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${Spacing.sm}px 0`, borderBottom: `1px solid ${Colors.border}`, marginBottom: Spacing.xs }}>
                <span style={{ border: `1px solid ${selectedClass.glowColor}`, background: selectedClass.glowColor + '18', borderRadius: Radius.full, padding: '5px 12px', fontSize: Typography.sm, fontWeight: Typography.semibold, color: selectedClass.glowColor }}>
                  Class {selected} — {selectedClass.label}
                </span>
                <button type="button" onClick={() => { setSelected(null); setResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: Typography.sm, color: Colors.textSecondary }}>Clear</button>
              </div>
            )}
            {guideMatch && <GuideSearchCard guide={guideMatch} onPress={() => onSelectGuide?.(guideMatch.guide_number)} />}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: Colors.textSecondary }}>Loading…</div>
            ) : results.length === 0 && !guideMatch ? (
              <div style={{ textAlign: 'center', padding: 60, color: Colors.textSecondary }}>No materials found</div>
            ) : (
              results.map((m, i) => <MaterialCard key={m.id ?? i} material={m} onPress={() => onSelectMaterial?.(m)} />)
            )}
          </>
        )}
      </div>
    </div>
  );
}
