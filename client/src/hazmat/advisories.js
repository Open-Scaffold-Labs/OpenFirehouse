// advisories.js — Derived hazard advisories (web port, verbatim from mobile)
//
// Derives specific hazard advisories at render time from objective ERG/DOT
// fields. Never hand-set. Used identically by MaterialCard,
// MaterialDetailScreen, and GuideDetailScreen so all surfaces agree.
//
// Severity ordering (lower = more acute, shown first):
//   0 TOXIC INHALATION  ← is_tih
//   1 EXPLOSIVE         ← hazard_class division 1.x
//   1 RADIOACTIVE       ← hazard_class 7
//   2 POLYMERIZATION    ← polymerization_hazard (ERG "P" marker)
//   3 WATER-REACTIVE    ← is_water_reactive
//   3 PYROPHORIC        ← is_pyrophoric

export function getAdvisories(m) {
  const out = [];
  const cls = String(m.hazard_class ?? '');
  const isExplosive = cls === '1' || cls.startsWith('1.');

  if (m.is_tih) {
    out.push({
      key: 'tih', label: 'TOXIC INHALATION HAZARD', short: 'TIH',
      detail: 'Inhalation of vapors may be immediately dangerous to life or health',
      severity: 0, critical: true,
    });
  }
  if (isExplosive) {
    const div = cls.startsWith('1.') ? cls[2] : '1';
    const massExplosion = ['1', '2', '3', '5'].includes(div);
    out.push({
      key: 'explosive', label: 'EXPLOSIVE', short: 'EXPL',
      detail: massExplosion
        ? 'Mass-explosion or projection hazard — refer to the response guide'
        : 'Limited explosion hazard (Division 1.4/1.6) — refer to the response guide',
      severity: 1, critical: true,
    });
  }
  if (cls === '7') {
    out.push({
      key: 'radioactive', label: 'RADIOACTIVE', short: 'RAD',
      detail: 'Ionizing radiation hazard — limit exposure time and distance',
      severity: 1, critical: true,
    });
  }
  if (m.polymerization_hazard) {
    out.push({
      key: 'polymerization', label: 'POLYMERIZATION RISK', short: 'POLY',
      detail: 'May polymerize violently if heated or contaminated — container may rupture',
      severity: 2, critical: true,
    });
  }
  if (m.is_water_reactive) {
    out.push({
      key: 'water_reactive', label: 'WATER-REACTIVE', short: 'H₂O-RX',
      detail: 'Reacts with water — may release toxic or flammable gas',
      severity: 3, critical: false,
    });
  }
  if (m.is_pyrophoric) {
    out.push({
      key: 'pyrophoric', label: 'PYROPHORIC', short: 'PYRO',
      detail: 'May ignite spontaneously on contact with air',
      severity: 3, critical: false,
    });
  }
  return out.sort((a, b) => a.severity - b.severity);
}
