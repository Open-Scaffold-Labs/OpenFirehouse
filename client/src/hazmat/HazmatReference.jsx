import React, { useState, useCallback } from 'react';
import { Colors, Typography, Spacing, Radius } from './theme';
import SearchScreen from './SearchScreen';
import PlacardScreen from './PlacardScreen';
import WizardScreen from './WizardScreen';
import MaterialDetailScreen from './MaterialDetailScreen';
import GuideDetailScreen from './GuideDetailScreen';

// HazmatReference — the embedded FireHazmat ERG 2024 reference for the web app.
// Self-contained dark ERG module. Provides the internal navigation the mobile
// app gets from expo-router: three tabs (Search / Placard / Wizard) plus a
// detail stack (Material / Guide). All data comes from the public read-only
// /api/hazmat endpoints; the dataset itself never reaches the browser.

const TABS = [
  { key: 'search',  label: 'Search' },
  { key: 'placard', label: 'Placard' },
  { key: 'wizard',  label: 'Wizard' },
];

// Local error boundary — a render crash in a reference screen must never blank
// the page on a life-safety tool. Mirrors the mobile per-screen ErrorBoundary.
class HazmatErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[hazmat] render error:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: Spacing.xl, textAlign: 'center', color: Colors.textSecondary }}>
          <div style={{ fontSize: Typography.md, color: Colors.critical, fontWeight: Typography.bold, marginBottom: Spacing.sm }}>Something went wrong</div>
          <div style={{ fontSize: Typography.sm, marginBottom: Spacing.base }}>This reference screen hit an error. The rest of the app is unaffected.</div>
          <button type="button" onClick={() => this.setState({ error: null })} style={{
            background: Colors.accent, color: Colors.textOnAccent, border: 'none', borderRadius: Radius.md,
            padding: `${Spacing.sm}px ${Spacing.base}px`, cursor: 'pointer', fontWeight: Typography.bold,
          }}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function HazmatReference() {
  const [tab, setTab] = useState('search');
  const [stack, setStack] = useState([]);

  const push = useCallback(v => setStack(s => [...s, v]), []);
  const back = useCallback(() => setStack(s => s.slice(0, -1)), []);
  const selectMaterial = useCallback(m => push({ type: 'material', material: m }), [push]);
  const selectGuide = useCallback(n => push({ type: 'guide', guideNumber: n }), [push]);
  const openSearch = useCallback(() => { setStack([]); setTab('search'); }, []);

  const top = stack[stack.length - 1];

  let title = '';
  if (top?.type === 'material') title = top.material?.name || 'Material';
  else if (top?.type === 'guide') title = `ERG Guide ${top.guideNumber}`;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', minHeight: 480,
      background: Colors.bgPrimary, color: Colors.textPrimary, borderRadius: Radius.md, overflow: 'hidden',
      border: `1px solid ${Colors.border}`,
    }}>
      {/* Header: tab switcher (base) or back button (detail) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: Spacing.sm, padding: `${Spacing.sm}px ${Spacing.base}px`, borderBottom: `1px solid ${Colors.border}`, background: Colors.bgSecondary }}>
        {top ? (
          <>
            <button type="button" onClick={back} style={{
              display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none',
              color: Colors.accent, cursor: 'pointer', fontSize: Typography.base, fontWeight: Typography.semibold,
            }}>‹ Back</button>
            <span style={{ fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: Typography.sm, fontWeight: 800, marginRight: Spacing.sm }}>
              <span style={{ color: '#FF2020' }}>Fire</span><span style={{ color: '#F5820A' }}>Hazmat</span>
              <span style={{ color: Colors.textTertiary, fontWeight: Typography.medium }}> · ERG 2024</span>
            </span>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              {TABS.map(t => (
                <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
                  padding: `${Spacing.xs + 2}px ${Spacing.md}px`, cursor: 'pointer', borderRadius: Radius.sm,
                  border: `1px solid ${tab === t.key ? Colors.accent : Colors.border}`,
                  background: tab === t.key ? Colors.accent + '22' : 'transparent',
                  color: tab === t.key ? Colors.accent : Colors.textSecondary,
                  fontSize: Typography.sm, fontWeight: Typography.semibold,
                }}>{t.label}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <HazmatErrorBoundary key={top ? `${top.type}-${top.material?.id ?? top.guideNumber}` : tab}>
          {top?.type === 'material' ? (
            <MaterialDetailScreen material={top.material} onSelectGuide={selectGuide} />
          ) : top?.type === 'guide' ? (
            <GuideDetailScreen guideNumber={top.guideNumber} onSelectMaterial={selectMaterial} />
          ) : tab === 'search' ? (
            <SearchScreen onSelectMaterial={selectMaterial} onSelectGuide={selectGuide} />
          ) : tab === 'placard' ? (
            <PlacardScreen onSelectMaterial={selectMaterial} onSelectGuide={selectGuide} />
          ) : (
            <WizardScreen onSelectMaterial={selectMaterial} onSelectGuide={selectGuide} onOpenSearch={openSearch} />
          )}
        </HazmatErrorBoundary>
      </div>
    </div>
  );
}
