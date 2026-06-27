import React, { useEffect, useState } from 'react';
import { Colors, Typography, Spacing, Radius, getPpeColor, getPpeLabel } from './theme';
import { getGuide } from './api';
import { formatUN } from './formatUN';
import { getAdvisories } from './advisories';

// GuideDetailScreen — full ERG response guide (web port of mobile
// GuideDetailScreen.tsx): header, PPE level + proximity/explosive/radiation
// advisories, the guide's response sections, and the materials using it.

const SECTION_META = [
  { key: 'public_safety',       title: 'PUBLIC SAFETY',       icon: '🛡️', color: Colors.info },
  { key: 'health_hazards',      title: 'HEALTH HAZARDS',      icon: '🏥', color: Colors.critical },
  { key: 'fire_explosion',      title: 'FIRE OR EXPLOSION',   icon: '🔥', color: Colors.warning },
  { key: 'evacuation',          title: 'EVACUATION',          icon: '🏃', color: Colors.critical },
  { key: 'protective_clothing', title: 'PROTECTIVE CLOTHING', icon: '🥼', color: Colors.warning },
  { key: 'spill_response',      title: 'SPILL OR LEAK',       icon: '💧', color: Colors.warning },
  { key: 'fire_response',       title: 'FIRE RESPONSE',       icon: '🧯', color: Colors.warning },
  { key: 'first_aid',           title: 'FIRST AID',           icon: '➕', color: Colors.safe },
  { key: 'special_hazards',     title: 'SPECIAL HAZARDS',     icon: '☢️', color: Colors.critical },
];

function Advisory({ color, bg, title, children }) {
  return (
    <div style={{ border: `1px solid ${color}`, background: bg, borderRadius: Radius.md, padding: Spacing.base, marginTop: Spacing.sm }}>
      <div style={{ fontSize: Typography.sm, fontWeight: Typography.bold, color, letterSpacing: 0.5, marginBottom: Spacing.xs }}>{title}</div>
      <div style={{ fontSize: Typography.sm, color: Colors.textPrimary, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

export default function GuideDetailScreen({ guideNumber, onSelectMaterial }) {
  const [guide, setGuide] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!guideNumber) return;
    let cancelled = false;
    setGuide(null); setMaterials([]); setLoading(true);
    getGuide(guideNumber).then(({ guide: g, materials: m }) => {
      if (cancelled) return;
      setGuide(g); setMaterials(m); setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [guideNumber]);

  if (loading) return <div style={{ padding: Spacing.xxl, textAlign: 'center', color: Colors.textSecondary, background: Colors.bgPrimary, height: '100%' }}>Loading guide…</div>;
  if (!guide) return <div style={{ padding: Spacing.xxl, textAlign: 'center', color: Colors.textSecondary, background: Colors.bgPrimary, height: '100%' }}>Guide {guideNumber} not found</div>;

  const ppeColor = getPpeColor(guide.ppe_level);
  const sections = SECTION_META.filter(s => !!guide[s.key]);
  const isExplosive = guide.hazard_class === '1' || (guide.hazard_class || '').startsWith('1.');
  const shown = showAll ? materials : materials.slice(0, 20);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: Colors.bgPrimary, paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: Spacing.md, padding: Spacing.base, paddingBottom: Spacing.lg, borderBottom: `1px solid ${Colors.border}` }}>
        <div style={{ width: 64, height: 64, background: Colors.accent, borderRadius: Radius.md, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: Typography.bold, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 }}>ERG</span>
          <span style={{ fontSize: Typography.xxl, fontWeight: 800, color: '#fff' }}>{guide.guide_number}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 1.2 }}>{guide.title}</div>
          {guide.hazard_class && <div style={{ fontSize: Typography.sm, color: Colors.textSecondary, marginTop: Spacing.xs }}>Hazard Class {guide.hazard_class}</div>}
        </div>
      </div>

      {/* PPE + advisories */}
      {guide.ppe_level && (
        <div style={{ margin: `${Spacing.sm}px ${Spacing.base}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: Spacing.md, border: `1.5px solid ${ppeColor}`, borderRadius: Radius.md, padding: Spacing.md }}>
            <span style={{ background: ppeColor, borderRadius: Radius.sm, padding: `${Spacing.sm}px ${Spacing.md}px`, fontSize: Typography.md, fontWeight: Typography.bold, color: '#fff' }}>Level {guide.ppe_level}</span>
            <span style={{ fontSize: Typography.base, fontWeight: Typography.semibold, color: ppeColor, flex: 1 }}>{getPpeLabel(guide.ppe_level)}</span>
          </div>

          {guide.needs_proximity_suit && (
            <Advisory color={Colors.proximityWarning} bg={Colors.proximityWarningBg} title="🔥 PROXIMITY SUIT ADVISORY">
              This material presents significant flashover, BLEVE, or radiant heat risk. If fire is involved or imminent, standard chemical protective suits are NOT fire-rated and will fail under direct flame or extreme radiant heat. An aluminized proximity suit or fire entry suit is required for close-proximity operations involving fire.
            </Advisory>
          )}
          {isExplosive && (
            <Advisory color={Colors.explosive} bg={Colors.explosiveBg} title="💣 EXPLOSIVE QUANTITY ADVISORY">
              PPE recommendations assume appropriate standoff distance and controlled conditions. Explosive hazard severity scales dramatically with quantity present. For large quantities, mass-detonating, or high-order explosive incidents, no standard protective equipment provides adequate blast protection. If detonation risk is present, disregard PPE level — prioritize maximum standoff distance and evacuation. Defer to EOD/bomb disposal specialists.
            </Advisory>
          )}
          {guide.hazard_class === '7' && (
            <Advisory color={Colors.radiation} bg={Colors.radiationBg} title="☢️ RADIATION DOSE RATE ADVISORY">
              Standard hazmat suits protect against radioactive particle contamination (alpha/beta) but provide NO protection against gamma or neutron radiation. PPE effectiveness is entirely dependent on measured dose rates at the scene. At high dose rates, no standard protective equipment is adequate regardless of level. Always establish dose rate with a calibrated meter before entry. For high or unknown dose rates, defer to specialized radiological response teams (NRC Emergency: 1-301-816-5100).
            </Advisory>
          )}
        </div>
      )}

      {/* Sections */}
      {sections.map(s => (
        <div key={s.key} style={{ margin: `${Spacing.xs}px ${Spacing.base}px`, background: Colors.bgSecondary, borderRadius: Radius.md, border: `1px solid ${Colors.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: Spacing.sm, padding: `${Spacing.md}px ${Spacing.md}px ${Spacing.sm}px`, borderBottom: `1px solid ${Colors.border}` }}>
            <span>{s.icon}</span>
            <span style={{ fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 0.8, color: s.color }}>{s.title}</span>
          </div>
          <div style={{ fontSize: Typography.base, color: Colors.textSecondary, lineHeight: 1.5, padding: Spacing.md, whiteSpace: 'pre-wrap' }}>{guide[s.key]}</div>
        </div>
      ))}

      {/* Materials using this guide */}
      {materials.length > 0 && (
        <div style={{ marginTop: Spacing.lg, paddingTop: Spacing.base, borderTop: `1px solid ${Colors.border}` }}>
          <div style={{ fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textTertiary, letterSpacing: 1.2, padding: `0 ${Spacing.base}px`, marginBottom: Spacing.xs }}>
            MATERIALS USING GUIDE {guide.guide_number}
          </div>
          <div style={{ fontSize: Typography.sm, color: Colors.textSecondary, padding: `0 ${Spacing.base}px`, marginBottom: Spacing.md }}>
            {materials.length} material{materials.length !== 1 ? 's' : ''}
          </div>
          {shown.map((m, i) => {
            const adv = getAdvisories(m)[0];
            return (
              <button key={m.id ?? `${m.un_number ?? ''}-${i}`} type="button" onClick={() => onSelectMaterial?.(m)} style={{
                display: 'flex', alignItems: 'center', gap: Spacing.sm, width: '100%', textAlign: 'left', cursor: 'pointer',
                background: 'transparent', border: 'none', borderBottom: `1px solid ${Colors.border}`,
                padding: `${Spacing.md}px ${Spacing.base}px`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: Typography.base, color: Colors.textPrimary, fontWeight: Typography.medium }}>{m.name}</div>
                  <div style={{ fontSize: Typography.xs, color: Colors.textSecondary }}>
                    {[m.un_number ? formatUN(m.un_number) : null, m.hazard_class].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {adv && <span style={{ background: Colors.criticalBg, borderRadius: Radius.sm, padding: '2px 8px', fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.critical }}>{adv.short}</span>}
                <span style={{ fontSize: 22, color: Colors.textTertiary }}>›</span>
              </button>
            );
          })}
          {materials.length > 20 && (
            <button type="button" onClick={() => setShowAll(v => !v)} style={{
              display: 'block', width: '100%', textAlign: 'center', cursor: 'pointer',
              background: 'transparent', border: 'none', borderTop: `1px solid ${Colors.border}`,
              padding: Spacing.md, fontSize: Typography.sm, color: Colors.accent, fontWeight: Typography.semibold,
            }}>{showAll ? '▲ Show fewer' : `▼ Show all ${materials.length} materials`}</button>
          )}
        </div>
      )}

      <div style={{ margin: Spacing.base, padding: Spacing.md, textAlign: 'center', fontSize: Typography.xs, color: Colors.textTertiary }}>
        ERG Guide {guide.guide_number} · ERG 2024 (PHMSA/DOT) · Public Domain
      </div>
    </div>
  );
}
