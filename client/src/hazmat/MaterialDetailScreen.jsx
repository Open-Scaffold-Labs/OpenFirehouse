import React, { useEffect, useRef, useState } from 'react';
import { Colors, Typography, Spacing, Radius, getPpeColor, getPpeLabel } from './theme';
import { getHazardClass } from './hazardClasses';
import { getGhsPictogram, getGhsHazardStatement, sortGhsHazardsBySeverity } from './ghs';
import { formatUN, formatGuide } from './formatUN';
import { getAdvisories } from './advisories';
import { getMaterialById } from './api';

// MaterialDetailScreen — full material profile (web port of mobile
// MaterialDetailScreen.tsx). Faithful translation of the substance: TIH stripe,
// derived advisory banners, hero, isolation (Table 1) + Table 3, carcinogen /
// vapor-density cards, properties (with parent-UN inheritance captions), GHS
// classification, chemical identity, data sources, PPE + proximity/explosive/
// radiation advisories, recommended field instruments, guide sections, CHEMTREC.

// ── Recommended field instruments (verbatim from mobile) ─────────────────────
const INSTRUMENTS = {
  cgi_lel:    { name: 'CGI / LEL Meter + O₂', why: 'Detects combustible gas and oxygen depletion', color: '#ef4444' },
  pid:        { name: 'Photoionization Detector (PID)', why: 'Detects volatile organic compounds (VOCs) in ppb/ppm', color: '#a855f7' },
  cl2:        { name: 'Chlorine Meter (Cl₂)', why: 'Detects chlorine gas — IDLH 10 ppm', color: '#ef4444' },
  nh3:        { name: 'Ammonia Meter (NH₃)', why: 'Detects ammonia gas — IDLH 300 ppm', color: '#ef4444' },
  hcn:        { name: 'HCN Meter', why: 'Detects hydrogen cyanide — IDLH 50 ppm', color: '#ef4444' },
  so2:        { name: 'SO₂ Meter', why: 'Detects sulfur dioxide — IDLH 100 ppm', color: '#ef4444' },
  co:         { name: 'CO Meter', why: 'Detects carbon monoxide — IDLH 1,200 ppm', color: '#ef4444' },
  h2s:        { name: 'H₂S Meter', why: 'Detects hydrogen sulfide — IDLH 100 ppm', color: '#ef4444' },
  f_paper:    { name: 'Fluoride Detection Paper', why: 'Detects HF — turns yellow on contact. HF absorbs through skin', color: '#f59e0b' },
  ph_paper:   { name: 'pH Paper', why: 'Detects acid/base — test any visible moisture or condensation', color: '#10b981' },
  rad_survey: { name: 'Radiation Survey Meter', why: 'Detects ionizing radiation dose rate (gamma/beta)', color: '#f59e0b' },
  dosimeter:  { name: 'Dosimeter', why: 'Tracks cumulative radiation dose — turn-back 25 REM', color: '#f59e0b' },
  ir_thermo:  { name: 'Temperature Gun (IR)', why: 'Detects exothermic reaction or heat signature', color: '#ef4444' },
  o2:         { name: 'O₂ Monitor', why: 'Monitors oxygen levels — normal 20.9%', color: '#3b82f6' },
};
const CLASS_INSTRUMENTS = {
  '1': ['cgi_lel', 'ir_thermo'], '2': ['cgi_lel', 'o2'], '2.1': ['cgi_lel', 'o2', 'ir_thermo'],
  '2.2': ['o2', 'cgi_lel'], '2.3': ['cgi_lel', 'o2', 'pid'], '3': ['cgi_lel', 'pid', 'ir_thermo'],
  '4.1': ['cgi_lel', 'ir_thermo'], '4.2': ['cgi_lel', 'ir_thermo'], '4.3': ['cgi_lel', 'ir_thermo', 'ph_paper'],
  '5.1': ['o2', 'cgi_lel', 'ir_thermo'], '5.2': ['o2', 'cgi_lel', 'ir_thermo'], '6.1': ['pid', 'cgi_lel'],
  '6.2': [], '7': ['rad_survey', 'dosimeter'], '8': ['ph_paper', 'pid', 'cgi_lel'], '9': ['cgi_lel', 'pid'],
};
const UN_INSTRUMENT_OVERRIDES = {
  '1005': ['nh3'], '1017': ['cl2'], '1040': ['cgi_lel', 'pid'], '1050': ['f_paper', 'ph_paper'],
  '1052': ['f_paper', 'ph_paper'], '1053': ['h2s'], '1079': ['so2'], '1589': ['cl2'], '1613': ['hcn'],
  '1614': ['hcn'], '1829': ['so2'], '1831': ['ph_paper', 'f_paper'], '2186': ['f_paper', 'ph_paper'],
  '2188': ['pid'], '2199': ['pid'], '2202': ['h2s'], '2548': ['cl2'], '2676': ['h2s'], '3294': ['hcn'], '9279': ['co'],
};
function getRecommendedInstruments(guideClass, materialClass, unNumber) {
  const keys = new Set();
  for (const cls of [materialClass, guideClass].filter(Boolean)) {
    const ck = CLASS_INSTRUMENTS[cls] ?? CLASS_INSTRUMENTS[String(cls).split('.')[0]] ?? [];
    if (ck.length) { ck.forEach(k => keys.add(k)); break; }
  }
  if (unNumber && UN_INSTRUMENT_OVERRIDES[unNumber]) UN_INSTRUMENT_OVERRIDES[unNumber].forEach(k => keys.add(k));
  return Array.from(keys).map(k => INSTRUMENTS[k]).filter(Boolean);
}

function dataSourcesForDisplay(material) {
  if (!material.data_sources) return [];
  const sources = new Set();
  for (const tag of Object.values(material.data_sources)) {
    if (typeof tag !== 'string') continue;
    if (tag === 'PubChem') sources.add('PubChem (NIH/NLM)');
    else if (tag === 'NIOSH' || tag === 'NIOSH-explicit-none') sources.add('NIOSH Pocket Guide (CDC)');
    else if (tag.startsWith('derived:erg-guide-')) sources.add('ERG 2024 (DOT/PHMSA)');
    else if (tag.startsWith('derived:hazard-class-')) sources.add('49 CFR 172.101 (DOT)');
    else if (tag === 'curated-list:pyrophoric') sources.add('FireHazmat curated list (49 CFR Subpart B)');
  }
  const order = ['ERG 2024 (DOT/PHMSA)', '49 CFR 172.101 (DOT)', 'PubChem (NIH/NLM)', 'NIOSH Pocket Guide (CDC)', 'FireHazmat curated list (49 CFR Subpart B)'];
  return order.filter(s => sources.has(s));
}
function inheritedFromUn(material, field) {
  const tag = material.data_sources?.[field];
  if (typeof tag !== 'string') return null;
  return tag.startsWith('inherited:UN') ? tag.slice('inherited:UN'.length) : null;
}

const round = v => (v == null ? null : Math.round(v));

function PropertyCard({ label, value, highlight, criticalHighlight, inheritedFrom }) {
  const textColor = criticalHighlight ? Colors.critical : highlight ? Colors.warning : Colors.textPrimary;
  return (
    <div style={{
      background: criticalHighlight ? Colors.criticalBg : Colors.bgSecondary,
      border: `1px solid ${criticalHighlight ? Colors.criticalBorder : Colors.border}`,
      borderRadius: Radius.sm, padding: `${Spacing.sm}px ${Spacing.md}px`, minWidth: '45%', flex: 1,
    }}>
      <div style={{ fontSize: Typography.xs, color: Colors.textTertiary, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: Typography.sm, fontWeight: Typography.semibold, color: textColor }}>{value}</div>
      {inheritedFrom && <div style={{ fontSize: 10, color: Colors.textTertiary, fontStyle: 'italic', marginTop: 2 }}>from parent UN{inheritedFrom}</div>}
    </div>
  );
}

function IsoColumn({ label, isolate, dayKm, nightKm, primary, referToTable3 }) {
  const valColor = primary ? Colors.brandRed : Colors.textPrimary;
  const Stat = ({ l, v }) => (
    <div style={{ marginBottom: Spacing.sm }}>
      <div style={{ fontSize: Typography.xs, color: Colors.textPrimary }}>{l}</div>
      <div style={{ fontSize: Typography.xl, fontWeight: Typography.bold, color: valColor }}>{v}</div>
    </div>
  );
  return (
    <div style={{ flex: 1, padding: Spacing.md, background: primary ? '#3D0606' : 'transparent' }}>
      <div style={{ fontSize: Typography.xs, fontWeight: Typography.bold, color: primary ? Colors.brandRed : Colors.textSecondary, letterSpacing: 0.8, marginBottom: Spacing.sm }}>{label}</div>
      {isolate != null && <Stat l="Isolate" v={`${isolate}m`} />}
      {dayKm != null && <Stat l="☀ Day PAD" v={`${dayKm}km`} />}
      {nightKm != null && <Stat l="☾ Night PAD" v={`${nightKm}km`} />}
      {referToTable3 && (
        <div>
          <div style={{ fontSize: Typography.xs, color: Colors.brandRed }}>PAD distances</div>
          <div style={{ fontSize: 13, fontWeight: Typography.bold, color: Colors.brandRed }}>↓ See Table 3</div>
        </div>
      )}
    </div>
  );
}

function IsolationSection({ isolation, table3, critical }) {
  return (
    <div style={{
      padding: Spacing.base, borderBottom: `1px solid ${critical ? Colors.criticalBorder : Colors.border}`,
      background: critical ? Colors.criticalBg : 'transparent',
    }}>
      <div style={{ fontSize: Typography.xs, fontWeight: critical ? 900 : Typography.bold, color: critical ? Colors.brandRed : Colors.textTertiary, letterSpacing: 1.2, marginBottom: 4 }}>
        ISOLATION & PROTECTIVE ACTION DISTANCES
      </div>
      <div style={{ fontSize: Typography.xs, color: Colors.textTertiary, marginBottom: Spacing.md }}>ERG 2024 Table 1 — Initial isolation and protective actions</div>
      <div style={{ display: 'flex', background: Colors.bgSecondary, borderRadius: Radius.md, border: `${critical ? 2 : 1}px solid ${critical ? Colors.brandRed : Colors.border}`, overflow: 'hidden' }}>
        <IsoColumn label="SMALL SPILL" isolate={isolation.small_spill_isolate_m} dayKm={isolation.small_spill_day_km} nightKm={isolation.small_spill_night_km} />
        <div style={{ width: 1, background: Colors.brandRed }} />
        <IsoColumn label="LARGE SPILL" isolate={isolation.large_spill_isolate_m} dayKm={isolation.large_spill_day_km} nightKm={isolation.large_spill_night_km} primary referToTable3={table3.length > 0 && isolation.large_spill_isolate_m == null} />
      </div>
      {isolation.fire_isolate_m != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md, background: Colors.warningBg, borderRadius: Radius.sm, padding: Spacing.md }}>
          <span style={{ fontSize: Typography.sm, color: Colors.warning }}>🔥 Fire / Spill from fire:</span>
          <span style={{ fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.warning }}>Isolate {isolation.fire_isolate_m}m in all directions</span>
        </div>
      )}
    </div>
  );
}

function Table3Section({ rows }) {
  return (
    <div style={{ padding: Spacing.base, borderTop: `1px solid ${Colors.criticalBorder}`, borderBottom: `1px solid ${Colors.criticalBorder}`, background: '#120000' }}>
      <div style={{ fontSize: Typography.xs, fontWeight: 900, color: Colors.brandRed, letterSpacing: 1.5, marginBottom: 4 }}>TABLE 3 — LARGE SPILL: CONTAINER-SPECIFIC DISTANCES</div>
      <div style={{ fontSize: Typography.xs, color: Colors.textTertiary, marginBottom: Spacing.md }}>ERG 2024 Table 3 — Protective action distances by container type (large spills only)</div>
      <div style={{ display: 'flex', gap: Spacing.sm, background: Colors.infoBg, borderLeft: `3px solid ${Colors.info}`, borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.md }}>
        <span style={{ flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 1.4 }}>
          PADs <b style={{ color: Colors.textPrimary }}>shrink</b> as wind speed increases — turbulent air dilutes the plume faster. <b style={{ color: Colors.textPrimary }}>Night</b> values are larger than Day because stable nighttime atmosphere holds the plume together longer. Worst case is low wind + nighttime.
        </span>
      </div>
      {rows.map((row, idx) => (
        <div key={idx} style={{ background: Colors.bgSecondary, borderRadius: Radius.md, border: `1px solid ${Colors.brandRed}`, marginBottom: Spacing.md, overflow: 'hidden' }}>
          <div style={{ background: '#2A0000', padding: `${Spacing.sm}px ${Spacing.md}px`, borderBottom: `1px solid ${Colors.brandRed}` }}>
            <div style={{ fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.brandRed }}>{row.container_type}</div>
            <div style={{ fontSize: Typography.xs, color: Colors.textSecondary }}>Isolate {row.isolate_m} m / {row.isolate_ft} ft radius</div>
          </div>
          <div style={{ padding: Spacing.sm }}>
            <div style={{ display: 'flex', borderBottom: `1px solid ${Colors.border}`, paddingBottom: Spacing.xs, marginBottom: Spacing.xs }}>
              <span style={{ flex: 1 }} />
              <span style={{ width: 72, textAlign: 'center', fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.warning }}>DAY</span>
              <span style={{ width: 72, textAlign: 'center', fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.info }}>NIGHT</span>
            </div>
            {[['Low wind', row.day_low_km, row.night_low_km], ['Mod wind', row.day_mod_km, row.night_mod_km], ['High wind', row.day_high_km, row.night_high_km]].map(([l, d, n]) => {
              const isMax = String(d).includes('+') || String(n).includes('+');
              const vc = isMax ? Colors.critical : Colors.textPrimary;
              return (
                <div key={l} style={{ display: 'flex', alignItems: 'center', padding: '3px 0' }}>
                  <span style={{ flex: 1, fontSize: Typography.xs, color: Colors.textPrimary }}>{l}</span>
                  <span style={{ width: 72, textAlign: 'center', fontSize: Typography.sm, fontWeight: Typography.semibold, color: vc }}>{d} km</span>
                  <span style={{ width: 72, textAlign: 'center', fontSize: Typography.sm, fontWeight: Typography.semibold, color: vc }}>{n} km</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function GuideSection({ title, icon, content, color }) {
  return (
    <div style={{ margin: `${Spacing.xs}px ${Spacing.base}px`, background: Colors.bgSecondary, borderRadius: Radius.md, border: `1px solid ${Colors.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: Spacing.sm, padding: `${Spacing.md}px ${Spacing.md}px ${Spacing.sm}px` }}>
        <span>{icon}</span>
        <span style={{ fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 0.8, color }}>{title}</span>
      </div>
      <div style={{ fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 1.5, padding: `0 ${Spacing.md}px ${Spacing.md}px`, whiteSpace: 'pre-wrap' }}>{content}</div>
    </div>
  );
}

function Advisory({ color, bg, title, children }) {
  return (
    <div style={{ marginTop: Spacing.sm, border: `1px solid ${color}`, background: bg, borderRadius: Radius.md, padding: Spacing.base }}>
      <div style={{ fontSize: Typography.sm, fontWeight: Typography.bold, color, letterSpacing: 0.5, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: Typography.sm, color: Colors.textPrimary, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

export default function MaterialDetailScreen({ material: propMaterial, onSelectGuide }) {
  const [full, setFull] = useState(propMaterial);
  const [guide, setGuide] = useState(propMaterial?.guide ?? null);
  const [isolation, setIsolation] = useState(null);
  const [table3, setTable3] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!propMaterial) return;
    let cancelled = false;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setFull(propMaterial); setGuide(propMaterial.guide ?? null);
    setIsolation(null); setTable3([]); setLoading(true);
    const id = propMaterial.id;
    (async () => {
      try {
        const m = id != null ? await getMaterialById(id) : null;
        if (cancelled) return;
        if (m) {
          setFull(m);
          if (m.guide) setGuide(m.guide);
          if (m.isolation) setIsolation(m.isolation);
          if (m.table3?.length) setTable3(m.table3);
        }
      } catch (e) {
        console.warn('[hazmat MaterialDetail] hydrate failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [propMaterial?.id]);

  const material = full ?? propMaterial;
  if (!material) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: Colors.bgPrimary, color: Colors.textTertiary }}>Select a material to view details</div>;

  const hazardInfo = getHazardClass(material.hazard_class);
  const advisories = getAdvisories(material);
  const isCritical = advisories.some(a => a.critical);
  const ppeColor = getPpeColor(guide?.ppe_level ?? null);
  const isExplosive = guide && (guide.hazard_class === '1' || (guide.hazard_class || '').startsWith('1.'));
  const instruments = getRecommendedInstruments(guide?.hazard_class ?? null, material.hazard_class, material.un_number);
  const perRecord = dataSourcesForDisplay(material);
  const inh = f => inheritedFromUn(material, f);

  return (
    <div ref={scrollRef} style={{ height: '100%', overflowY: 'auto', background: Colors.bgPrimary, paddingTop: Spacing.base, paddingBottom: 40 }}>
      {/* TIH stripe */}
      {material.is_tih && (
        <div style={{ background: '#1A0000', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '6px 0', borderBottom: '2px solid #FF000066' }}>
          <span style={{ color: Colors.brandRed }}>☠</span>
          <span style={{ fontSize: 11, fontWeight: 900, color: Colors.brandRed, letterSpacing: 2 }}>TIH — IMMEDIATELY DANGEROUS TO LIFE</span>
          <span style={{ color: Colors.brandRed }}>☠</span>
        </div>
      )}

      {/* Advisory banners */}
      {advisories.map(adv => (
        <div key={adv.key} style={{
          display: 'flex', alignItems: 'center', gap: Spacing.md, padding: Spacing.base,
          background: adv.critical ? '#1A0000' : Colors.criticalBg,
          borderBottom: `${adv.critical ? 2 : 1}px solid ${adv.critical ? '#FF000044' : Colors.criticalBorder}`,
        }}>
          <span style={{ fontSize: 26, color: adv.critical ? Colors.brandRed : Colors.warning }}>{adv.critical ? '⛔' : '⚠'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: adv.critical ? Typography.md : Typography.base, fontWeight: 900, letterSpacing: adv.critical ? 1.5 : 0.5, color: adv.critical ? Colors.brandRed : Colors.critical }}>{adv.label}</div>
            <div style={{ fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 }}>{adv.detail}</div>
          </div>
        </div>
      ))}

      {/* Hero */}
      <div style={{ display: 'flex', gap: Spacing.md, padding: Spacing.base, paddingBottom: Spacing.lg, borderBottom: `1px solid ${Colors.border}` }}>
        <div style={{ width: 64, height: 64, borderRadius: Radius.md, border: `2px solid ${hazardInfo.color}`, background: hazardInfo.color + '20', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: Typography.md, fontWeight: Typography.bold, color: hazardInfo.color }}>{material.hazard_class || '?'}</span>
          <span style={{ fontSize: 9, fontWeight: Typography.semibold, color: hazardInfo.color, letterSpacing: 0.5 }}>{hazardInfo.shortLabel}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 1.2 }}>{material.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: Spacing.sm, alignItems: 'center', margin: `${Spacing.sm}px 0` }}>
            {material.un_number && <span style={{ background: Colors.accentDim, borderRadius: Radius.sm, padding: '3px 8px', fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.accent }}>{formatUN(material.un_number)}</span>}
            {material.na_number && <span style={{ background: Colors.bgTertiary, borderRadius: Radius.sm, padding: '3px 8px', fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.accent }}>NA {material.na_number}</span>}
            {material.cas_number && <span style={{ fontSize: Typography.xs, color: Colors.textTertiary }}>CAS {material.cas_number}</span>}
          </div>
          <div style={{ fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium }}>{hazardInfo.label}</div>
        </div>
      </div>

      {/* Isolation first (critical) */}
      {isolation && isCritical && <IsolationSection isolation={isolation} table3={table3} critical />}
      {table3.length > 0 && <Table3Section rows={table3} />}

      {/* Carcinogen */}
      {material.is_carcinogen && (
        <div style={{ display: 'flex', gap: Spacing.sm, margin: Spacing.base, background: '#3D0606', border: `1px solid ${Colors.brandRed}`, borderRadius: Radius.md, padding: Spacing.md }}>
          <span style={{ fontSize: 22 }}>☣️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: Typography.sm, fontWeight: 900, color: Colors.brandRed, letterSpacing: 1, marginBottom: 4 }}>KNOWN / SUSPECTED CARCINOGEN</div>
            {material.carcinogen_class && <div style={{ fontSize: Typography.xs, color: Colors.textPrimary, lineHeight: 1.4 }}>Classification: {material.carcinogen_class}</div>}
            <div style={{ fontSize: Typography.xs, color: Colors.textPrimary, lineHeight: 1.4 }}>No safe exposure level — escalate PPE; minimize entry time even with respiratory protection.</div>
          </div>
        </div>
      )}

      {/* Vapor density */}
      {material.vapor_density != null && (
        <div style={{ display: 'flex', gap: Spacing.sm, margin: Spacing.base, background: material.vapor_density >= 2.0 ? '#3D0606' : Colors.bgSecondary, border: `1px solid ${material.vapor_density >= 2.0 ? Colors.brandRed : Colors.border}`, borderRadius: Radius.sm, padding: Spacing.md }}>
          <span style={{ fontSize: 18 }}>{material.vapor_density >= 2.0 ? '⬇️' : material.vapor_density < 1.0 ? '⬆️' : '⭕'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, marginBottom: 2 }}>Vapor density {material.vapor_density.toFixed(2)} (vs air)</div>
            <div style={{ fontSize: Typography.xs, color: material.vapor_density >= 2.0 ? Colors.brandRed : Colors.textSecondary, fontWeight: material.vapor_density >= 2.0 ? 700 : 400, lineHeight: 1.4 }}>
              {material.vapor_density >= 2.0 ? 'HEAVIER THAN AIR — collects in basements, drains, low areas. Approach from upwind, uphill.'
                : material.vapor_density < 1.0 ? 'Lighter than air — disperses upward, accumulates at ceilings and roof vents.'
                : 'Slightly heavier than air — may pool in low spots in still conditions.'}
            </div>
          </div>
        </div>
      )}

      {/* Properties */}
      <Section title="PROPERTIES">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: Spacing.sm }}>
          {material.physical_state && <PropertyCard label="Physical State" value={material.physical_state} inheritedFrom={inh('physical_state')} />}
          {material.color && <PropertyCard label="Color" value={material.color} inheritedFrom={inh('color')} />}
          {material.odor && <PropertyCard label="Odor" value={material.odor} inheritedFrom={inh('odor')} />}
          {material.boiling_point_c != null && <PropertyCard label="Boiling Point" value={`${round(material.boiling_point_c)}°C`} inheritedFrom={inh('boiling_point_c')} />}
          {material.melting_point_c != null && <PropertyCard label="Melting Point" value={`${round(material.melting_point_c)}°C`} inheritedFrom={inh('melting_point_c')} />}
          {material.flash_point_c != null && <PropertyCard label="Flash Point" value={`${round(material.flash_point_c)}°C`} highlight inheritedFrom={inh('flash_point_c')} />}
          {material.autoignition_temp_c != null && <PropertyCard label="Autoignition" value={`${round(material.autoignition_temp_c)}°C`} highlight inheritedFrom={inh('autoignition_temp_c')} />}
          {material.vapor_pressure_mmhg != null && <PropertyCard label="Vapor Pressure" value={material.vapor_pressure_temp_c != null ? `${material.vapor_pressure_mmhg.toFixed(1)} mmHg @ ${round(material.vapor_pressure_temp_c)}°C` : `${material.vapor_pressure_mmhg.toFixed(1)} mmHg`} inheritedFrom={inh('vapor_pressure_mmhg')} />}
          {material.specific_gravity != null && <PropertyCard label="Specific Gravity" value={material.specific_gravity.toFixed(2)} inheritedFrom={inh('specific_gravity')} />}
          {(material.lel_pct != null || material.uel_pct != null) && (() => {
            const fmt = (v, u) => { const unit = u || '%'; return unit === '%' ? `${v}%` : unit === 'g/m3' ? `${v} g/m³` : `${v} ${unit}`; };
            const { lel_pct: lel, uel_pct: uel, lel_unit, uel_unit } = material;
            let label = 'Flammable Range', value;
            if (lel != null && uel != null) value = `${fmt(lel, lel_unit)} – ${fmt(uel, uel_unit)}`;
            else if (lel != null) { label = 'Lower Flammable Limit'; value = fmt(lel, lel_unit); }
            else { label = 'Upper Flammable Limit'; value = fmt(uel, uel_unit); }
            return <PropertyCard label={label} value={value} highlight inheritedFrom={inh('lel_pct') ?? inh('uel_pct')} />;
          })()}
          {(material.idlh_ppm != null || material.idlh_mg_m3 != null) && <PropertyCard label="IDLH" value={material.idlh_ppm != null && material.idlh_mg_m3 != null ? `${material.idlh_ppm} ppm (${material.idlh_mg_m3} mg/m³)` : material.idlh_ppm != null ? `${material.idlh_ppm} ppm` : `${material.idlh_mg_m3} mg/m³`} criticalHighlight inheritedFrom={inh('idlh_ppm') ?? inh('idlh_mg_m3')} />}
          {material.tlv_twa_ppm != null && <PropertyCard label="TLV-TWA" value={`${material.tlv_twa_ppm} ppm`} highlight inheritedFrom={inh('tlv_twa_ppm')} />}
          {material.stel_ppm != null && <PropertyCard label="STEL (15-min)" value={`${material.stel_ppm} ppm`} highlight inheritedFrom={inh('stel_ppm')} />}
          {material.ceiling_ppm != null && <PropertyCard label="Ceiling" value={`${material.ceiling_ppm} ppm`} criticalHighlight inheritedFrom={inh('ceiling_ppm')} />}
          {material.water_solubility && <PropertyCard label="Water Solubility" value={material.water_solubility === 'reacts' ? 'REACTS' : material.water_solubility} criticalHighlight={material.water_solubility === 'reacts'} inheritedFrom={inh('water_solubility')} />}
          {material.is_water_reactive && <PropertyCard label="Water Reactive" value="YES — Keep dry" criticalHighlight />}
          {material.is_pyrophoric && <PropertyCard label="Pyrophoric" value="Ignites in air" criticalHighlight />}
          {material.molecular_formula && <PropertyCard label="Formula" value={material.molecular_formula} inheritedFrom={inh('molecular_formula')} />}
          {material.molecular_weight_g_mol != null && <PropertyCard label="Molecular Weight" value={`${material.molecular_weight_g_mol.toFixed(2)} g/mol`} inheritedFrom={inh('molecular_weight_g_mol')} />}
        </div>
      </Section>

      {/* GHS */}
      {(material.ghs_pictograms?.length || material.ghs_signal_word || material.ghs_hazards?.length) && (
        <Section title="GHS CLASSIFICATION" titleColor={Colors.brandRed}>
          {material.ghs_signal_word && (
            <div style={{ fontSize: Typography.lg, fontWeight: 900, letterSpacing: 2, marginBottom: Spacing.xs, color: material.ghs_signal_word === 'Danger' ? Colors.brandRed : Colors.warning }}>
              {material.ghs_signal_word.toUpperCase()}
            </div>
          )}
          {material.ghs_pictograms?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm }}>
              {material.ghs_pictograms.map(code => {
                const p = getGhsPictogram(code);
                if (!p) return null;
                return (
                  <div key={code} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 96 }}>
                    <div style={{ width: 52, height: 52, transform: 'rotate(45deg)', border: `3px solid ${Colors.brandRed}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}>
                      <span style={{ transform: 'rotate(-45deg)', fontSize: 9, fontWeight: 900, color: '#000', textAlign: 'center', lineHeight: 1 }}>{code.replace('GHS', 'G')}</span>
                    </div>
                    <span style={{ fontSize: 10, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 }}>{p.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          {material.ghs_hazards?.length > 0 && (
            <div>
              {sortGhsHazardsBySeverity(material.ghs_hazards).slice(0, 8).map(code => {
                const stmt = getGhsHazardStatement(code);
                if (!stmt) return null;
                const flagged = /^H3[01345]/.test(code) || /^H36/.test(code) || /^H37/.test(code);
                return (
                  <div key={code} style={{ display: 'flex', gap: Spacing.sm, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: flagged ? Colors.brandRed : Colors.textTertiary, minWidth: 36, paddingTop: 1 }}>{code}</span>
                    <span style={{ flex: 1, fontSize: Typography.sm, color: flagged ? Colors.textPrimary : Colors.textSecondary, fontWeight: flagged ? 600 : 400, lineHeight: 1.4 }}>{stmt}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* Chemical identity */}
      {(material.iupac_name || material.inchi_key || material.synonyms?.length > 0) && (
        <Section title="CHEMICAL IDENTITY">
          {material.iupac_name && <div style={{ fontSize: Typography.sm, marginBottom: Spacing.xs, lineHeight: 1.4 }}><span style={{ color: Colors.textTertiary, fontWeight: Typography.semibold }}>IUPAC: </span><span style={{ color: Colors.textPrimary }}>{material.iupac_name}</span></div>}
          {material.synonyms?.length > 0 && <div style={{ fontSize: Typography.sm, marginBottom: Spacing.xs, lineHeight: 1.4 }}><span style={{ color: Colors.textTertiary, fontWeight: Typography.semibold }}>Also known as: </span><span style={{ color: Colors.textPrimary }}>{material.synonyms.slice(0, 6).join(', ')}</span></div>}
          {material.inchi_key && <div style={{ fontSize: Typography.sm, lineHeight: 1.4 }}><span style={{ color: Colors.textTertiary, fontWeight: Typography.semibold }}>InChI Key: </span><span style={{ color: Colors.textPrimary, fontFamily: 'monospace', fontSize: Typography.xs }}>{material.inchi_key}</span></div>}
        </Section>
      )}

      {/* PPE */}
      {guide?.ppe_level && (
        <Section title="PROTECTIVE EQUIPMENT">
          <div style={{ border: `2px solid ${ppeColor}`, borderRadius: Radius.md, padding: Spacing.base }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: Spacing.sm }}>
              <span style={{ background: ppeColor, borderRadius: Radius.sm, padding: `${Spacing.sm}px ${Spacing.md}px`, fontSize: Typography.md, fontWeight: Typography.bold, color: '#fff' }}>Level {guide.ppe_level}</span>
              <span style={{ fontSize: Typography.base, fontWeight: Typography.semibold, color: ppeColor, flex: 1 }}>{getPpeLabel(guide.ppe_level)}</span>
            </div>
            {guide.protective_clothing && <div style={{ fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 1.5, marginTop: Spacing.sm }}>{guide.protective_clothing}</div>}
          </div>
          {guide.needs_proximity_suit && <Advisory color={Colors.proximityWarning} bg={Colors.proximityWarningBg} title="🔥 PROXIMITY SUIT ADVISORY">This material presents significant flashover, BLEVE, or radiant heat risk. If fire is involved or imminent, standard chemical protective suits are NOT fire-rated and will fail under direct flame or extreme radiant heat. An aluminized proximity suit or fire entry suit is required for close-proximity operations involving fire.</Advisory>}
          {isExplosive && <Advisory color={Colors.explosive} bg={Colors.explosiveBg} title="💣 EXPLOSIVE QUANTITY ADVISORY">PPE recommendations assume appropriate standoff distance and controlled conditions. Explosive hazard severity scales dramatically with quantity present. For large quantities, mass-detonating, or high-order explosive incidents, no standard protective equipment provides adequate blast protection. If detonation risk is present, disregard PPE level — prioritize maximum standoff distance and evacuation. Defer to EOD/bomb disposal specialists.</Advisory>}
          {guide.hazard_class === '7' && <Advisory color={Colors.radiation} bg={Colors.radiationBg} title="☢️ RADIATION DOSE RATE ADVISORY">Standard hazmat suits protect against radioactive particle contamination (alpha/beta) but provide NO protection against gamma or neutron radiation. PPE effectiveness is entirely dependent on measured dose rates at the scene. Always establish dose rate with a calibrated meter before entry. For high or unknown dose rates, defer to specialized radiological response teams (NRC Emergency: 1-301-816-5100).</Advisory>}
        </Section>
      )}

      {/* Field instruments */}
      {instruments.length > 0 && (
        <Section title="RECOMMENDED FIELD INSTRUMENTS">
          {instruments.map((inst, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, background: Colors.bgSecondary, borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.xs }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: inst.color, marginTop: 6, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary }}>{inst.name}</div>
                <div style={{ fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2, lineHeight: 1.4 }}>{inst.why}</div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Isolation (non-critical) */}
      {isolation && !isCritical && <IsolationSection isolation={isolation} table3={table3} />}

      {/* Guide sections */}
      {guide && (
        <>
          {guide.public_safety && <GuideSection title="PUBLIC SAFETY" icon="🛡️" content={guide.public_safety} color={Colors.info} />}
          {guide.health_hazards && <GuideSection title="HEALTH HAZARDS" icon="🏥" content={guide.health_hazards} color={Colors.critical} />}
          {guide.fire_explosion && <GuideSection title="FIRE OR EXPLOSION" icon="🔥" content={guide.fire_explosion} color={Colors.warning} />}
          {guide.evacuation && <GuideSection title="EVACUATION" icon="🏃" content={guide.evacuation} color={Colors.critical} />}
          {guide.spill_response && <GuideSection title="SPILL OR LEAK" icon="💧" content={guide.spill_response} color={Colors.warning} />}
          {guide.fire_response && <GuideSection title="FIRE RESPONSE" icon="🧯" content={guide.fire_response} color={Colors.warning} />}
          {guide.first_aid && <GuideSection title="FIRST AID" icon="➕" content={guide.first_aid} color={Colors.safe} />}
          {guide.special_hazards && <GuideSection title="SPECIAL HAZARDS" icon="☢️" content={guide.special_hazards} color={Colors.critical} />}
          <button type="button" onClick={() => onSelectGuide?.(guide.guide_number)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 'calc(100% - 32px)',
            margin: Spacing.base, cursor: 'pointer', background: Colors.bgSecondary, borderRadius: Radius.md,
            border: `1px solid ${Colors.accent}`, padding: Spacing.base,
          }}>
            <span style={{ flex: 1, textAlign: 'left', fontSize: Typography.sm, color: Colors.accent, fontWeight: Typography.semibold }}>
              View Full ERG Guide {formatGuide(guide.guide_number, material.polymerization_hazard)} — {guide.title}
            </span>
            <span style={{ fontSize: Typography.lg, color: Colors.accent }}>→</span>
          </button>
        </>
      )}

      {loading && <div style={{ textAlign: 'center', padding: Spacing.base, color: Colors.textSecondary, fontSize: Typography.sm }}>Loading guide data…</div>}

      {/* Data sources */}
      {perRecord.length > 0 && (
        <div style={{ margin: `${Spacing.md}px ${Spacing.base}px 0`, paddingTop: Spacing.sm, borderTop: `1px solid ${Colors.border}` }}>
          <div style={{ fontSize: 10, color: Colors.textTertiary, lineHeight: 1.4 }}>Sources for this record: {perRecord.join(', ')}</div>
          <div style={{ fontSize: 10, color: Colors.textTertiary, lineHeight: 1.4, marginTop: 4 }}>All FireHazmat data is sourced exclusively from: ERG 2024 (DOT/PHMSA) · 49 CFR 172.101 (DOT) · PubChem (NIH/NLM) · NIOSH Pocket Guide (CDC). GHS hazard-statement text from OSHA HCS 29 CFR 1910.1200 Appendix C and UN GHS Rev. 9 Annex 3.</div>
        </div>
      )}

      {/* CHEMTREC */}
      <a href="tel:18004249300" style={{ display: 'block', textDecoration: 'none', margin: Spacing.base, background: Colors.criticalBg, borderRadius: Radius.md, border: `1.5px solid ${Colors.criticalBorder}`, padding: Spacing.base, textAlign: 'center' }}>
        <div style={{ fontSize: Typography.xs, color: Colors.textSecondary, letterSpacing: 0.5 }}>CHEMTREC 24-Hour Emergency ☎</div>
        <div style={{ fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.critical, marginTop: 2 }}>1-800-424-9300</div>
      </a>

      {/* Footer */}
      <div style={{ margin: Spacing.base, padding: Spacing.md, background: Colors.bgSecondary, borderRadius: Radius.md, borderLeft: `3px solid ${Colors.brandRed}` }}>
        <div style={{ fontSize: Typography.xs, color: Colors.textTertiary, textAlign: 'center', lineHeight: 1.5 }}>
          Data: ERG 2024 (PHMSA/DOT) · Public Domain. For use by trained hazmat personnel only. Always verify with official ERG documentation and incident command authority. This app does not replace professional hazmat training.
        </div>
      </div>
    </div>
  );
}

function Section({ title, titleColor, children }) {
  return (
    <div style={{ padding: Spacing.base, borderBottom: `1px solid ${Colors.border}` }}>
      <div style={{ fontSize: Typography.xs, fontWeight: Typography.bold, color: titleColor ?? Colors.textTertiary, letterSpacing: 1.2, marginBottom: Spacing.md }}>{title}</div>
      {children}
    </div>
  );
}
