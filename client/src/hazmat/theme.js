// theme.js — FireHazmat ERG reference design tokens (web port)
//
// Ported verbatim from the OF Mobile / FireHazmat reference (src/hazmat/theme).
// The web reference keeps FireHazmat's signature dark navy + ERG-orange
// command-center look as a self-contained module, driven by inline styles (the
// hex palette is fixed, so inline styles are the faithful, lowest-friction
// translation of the RN StyleSheet). Numeric sizes are px in React inline style.

export const Colors = {
  // Backgrounds
  bgPrimary:   '#0D1117',
  bgSecondary: '#161B22',
  bgTertiary:  '#21262D',
  bgElevated:  '#2D333B',

  // Brand
  accent:      '#F5820A',
  accentLight: '#FF9C2A',
  accentDim:   '#7A3F00',
  brandRed:    '#FF0000',
  rescueMagenta: '#FF2D92',
  fabBg:       '#1F2937',

  // Text
  textPrimary:   '#E6EDF3',
  textSecondary: '#8B949E',
  textTertiary:  '#484F58',
  textOnAccent:  '#FFFFFF',

  // Hazard status
  critical:      '#FF3B30',
  criticalBg:    '#3D1210',
  criticalBorder:'#7A1A15',
  warning:       '#FF9F0A',
  warningBg:     '#3D2800',
  safe:          '#30D158',
  safeBg:        '#0D2E18',
  info:          '#0A84FF',
  infoBg:        '#0A2440',

  // PPE
  ppeA: '#FF3B30',
  ppeB: '#FF9F0A',
  ppeC: '#FFD60A',
  ppeD: '#30D158',

  // Advisory banners
  proximityWarning:   '#FF6B00',
  proximityWarningBg: '#3A1E00',
  explosive:          '#FF453A',
  explosiveBg:        '#3D1210',
  radiation:          '#FFD60A',
  radiationBg:        '#3D3300',

  // UI
  border:      '#30363D',
  borderLight: '#21262D',
  separator:   '#21262D',
  overlay:     'rgba(0,0,0,0.6)',

  // Search
  searchBg:     '#21262D',
  searchBorder: '#30363D',
  searchFocus:  '#F5820A',
};

export const Typography = {
  xs: 11, sm: 13, base: 15, md: 17, lg: 20, xl: 24, xxl: 28, xxxl: 34,
  light: '300', regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800',
};

export const Spacing = { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48 };

export const Radius = { xs: 4, sm: 6, md: 10, lg: 14, xl: 20, full: 999 };

// Official DOT-spec placard colors per 49 CFR 172 — the physical placards
// firefighters see. Distinct from the semantic HAZARD_CLASSES colors.
export const PLACARD_COLORS = {
  '1':   '#FF8C00',
  '2.1': '#CC0000',
  '2.2': '#00963A',
  '2.3': '#FFFFFF',
  '3':   '#CC0000',
  '4.1': '#CC0000',
  '4.2': '#CC0000',
  '4.3': '#0070C0',
  '5.1': '#F5D400',
  '5.2': '#F5D400',
  '6.1': '#FFFFFF',
  '6.2': '#FFF8E1',
  '7':   '#F5D400',
  '8':   '#FFFFFF',
  '9':   '#FFFFFF',
};

// Dataset cardinality fallbacks (live counts come from getStats()).
export const TOTAL_MATERIALS = 3541;
export const TOTAL_GUIDES = 62;
export const TOTAL_ISOLATION_DISTANCES = 272;
export const TOTAL_TABLE3 = 26;

export function getPpeColor(level) {
  switch ((level || '').toUpperCase()) {
    case 'A': return Colors.ppeA;
    case 'B': return Colors.ppeB;
    case 'C': return Colors.ppeC;
    case 'D': return Colors.ppeD;
    default:  return Colors.textSecondary;
  }
}

export function getPpeLabel(level) {
  switch ((level || '').toUpperCase()) {
    case 'A': return 'Level A — Full Vapor Encapsulation + SCBA';
    case 'B': return 'Level B — Splash Protection + SCBA';
    case 'C': return 'Level C — Splash Protection + APR';
    case 'D': return 'Level D — Minimal / Standard Work Uniform';
    default:  return 'PPE Unknown';
  }
}
