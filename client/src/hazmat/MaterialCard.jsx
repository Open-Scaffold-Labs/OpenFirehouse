import React from 'react';
import { Colors, Typography, Spacing, Radius, getPpeColor } from './theme';
import { getHazardClass } from './hazardClasses';
import { formatUN, formatGuide } from './formatUN';
import { getAdvisories } from './advisories';

// MaterialCard — list row for a material (web port of mobile MaterialCard.tsx).
// Shows the highest-severity derived advisory banner, hazard-class badge, name +
// UN/guide/state meta, PPE level, and an isolation quick-view when present.
const MaterialCard = React.memo(function MaterialCard({ material, onPress, selected }) {
  const hazardInfo = getHazardClass(material.hazard_class);
  const advisories = getAdvisories(material);
  const primary = advisories[0];
  const ppeColor = getPpeColor(material.guide?.ppe_level ?? null);
  const iso = material.isolation;

  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: selected ? Colors.bgTertiary : Colors.bgSecondary,
        margin: `${Spacing.xs}px 0`,
        borderRadius: Radius.md,
        border: primary?.critical ? `2px solid ${Colors.brandRed}`
          : selected ? `1px solid ${Colors.accent}` : `1px solid ${Colors.border}`,
        borderLeftWidth: primary?.critical ? 5 : undefined,
        overflow: 'hidden', padding: 0,
        boxShadow: primary?.critical ? `0 0 12px ${Colors.brandRed}73` : 'none',
      }}
    >
      {primary && (
        <div style={{
          background: primary.critical ? '#1A0000' : Colors.criticalBg,
          padding: primary.critical ? '6px 12px' : '4px 12px',
          display: 'flex', alignItems: 'center', gap: 4,
          borderBottom: primary.critical ? '1px solid #FF000044' : 'none',
        }}>
          {primary.critical && <span style={{ color: Colors.brandRed, fontSize: 13 }}>{primary.key === 'tih' ? '☠' : '⚠'}</span>}
          <span style={{
            fontSize: Typography.xs, fontWeight: primary.critical ? 900 : Typography.bold,
            color: primary.critical ? Colors.brandRed : Colors.critical,
            letterSpacing: primary.critical ? 1.2 : 0.5,
          }}>{primary.label}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm }}>
        <div style={{
          width: 44, height: 44, borderRadius: Radius.sm, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hazardInfo.color + '22', border: `1px solid ${hazardInfo.color}`,
        }}>
          <span style={{ fontSize: Typography.xs, fontWeight: Typography.bold, color: hazardInfo.color }}>
            {material.hazard_class || '?'}
          </span>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary, lineHeight: '20px' }}>
            {material.name}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: Spacing.xs, alignItems: 'center' }}>
            {material.un_number && (
              <span style={{ fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.accent, background: Colors.accentDim, padding: '2px 6px', borderRadius: 4 }}>
                {formatUN(material.un_number)}
              </span>
            )}
            {material.guide_number && (
              <span style={{ fontSize: Typography.xs, color: Colors.textSecondary, background: Colors.bgTertiary, padding: '2px 6px', borderRadius: 4 }}>
                Guide {formatGuide(material.guide_number, material.polymerization_hazard)}
              </span>
            )}
            {material.physical_state && (
              <span style={{ fontSize: Typography.xs, color: Colors.textTertiary }}>{material.physical_state}</span>
            )}
          </div>
          {material.guide?.title && (
            <span style={{ fontSize: Typography.xs, color: Colors.textSecondary, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {material.guide.title}
            </span>
          )}
        </div>

        {material.guide?.ppe_level && (
          <div style={{ width: 32, height: 32, borderRadius: Radius.sm, border: `1.5px solid ${ppeColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: Typography.sm, fontWeight: Typography.bold, color: ppeColor }}>{material.guide.ppe_level}</span>
          </div>
        )}
        <span style={{ fontSize: 22, color: Colors.textTertiary, marginLeft: 2 }}>›</span>
      </div>

      {iso && (iso.small_spill_isolate_m || iso.large_spill_isolate_m) && (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', padding: `0 ${Spacing.md}px ${Spacing.sm}px` }}>
          {iso.large_spill_isolate_m ? (
            <>
              <span style={{ fontSize: Typography.xs, color: Colors.textSecondary }}>Large spill: </span>
              <span style={{ fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.critical }}>{iso.large_spill_isolate_m}m</span>
              {iso.large_spill_day_km && (<>
                <span style={{ fontSize: Typography.xs, color: Colors.textSecondary }}> · Day PAD: </span>
                <span style={{ fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.critical }}>{iso.large_spill_day_km}km</span>
              </>)}
            </>
          ) : (
            <>
              <span style={{ fontSize: Typography.xs, color: Colors.textSecondary }}>Small spill: </span>
              <span style={{ fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.critical }}>{iso.small_spill_isolate_m}m</span>
              {iso.small_spill_day_km && (<>
                <span style={{ fontSize: Typography.xs, color: Colors.textSecondary }}> · Day PAD: </span>
                <span style={{ fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.critical }}>{iso.small_spill_day_km}km</span>
              </>)}
            </>
          )}
        </div>
      )}
    </button>
  );
});

export default MaterialCard;
