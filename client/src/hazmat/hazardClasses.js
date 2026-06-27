// hazardClasses.js — DOT hazard class display metadata (web port)
// Ported verbatim from the mobile reference (types/hazmat.ts HAZARD_CLASSES).
// `color` is a SEMANTIC display color tuned for the dark UI — distinct from the
// literal DOT placard colors in theme.js PLACARD_COLORS. Don't unify.

export const HAZARD_CLASSES = {
  '1':   { label: 'Explosives',                shortLabel: 'EXP',  color: '#FF6B00', description: 'Division 1.1–1.6' },
  '1.1': { label: 'Explosives Div 1.1',        shortLabel: 'EXP',  color: '#FF6B00', description: 'Mass explosion hazard' },
  '1.2': { label: 'Explosives Div 1.2',        shortLabel: 'EXP',  color: '#FF6B00', description: 'Projection hazard' },
  '1.3': { label: 'Explosives Div 1.3',        shortLabel: 'EXP',  color: '#FF6B00', description: 'Fire hazard' },
  '1.4': { label: 'Explosives Div 1.4',        shortLabel: 'EXP',  color: '#FF8C00', description: 'Minor blast hazard' },
  '1.5': { label: 'Explosives Div 1.5',        shortLabel: 'EXP',  color: '#FF8C00', description: 'Insensitive — mass explode' },
  '1.6': { label: 'Explosives Div 1.6',        shortLabel: 'EXP',  color: '#FF8C00', description: 'Extremely insensitive' },
  '2.1': { label: 'Flammable Gas',             shortLabel: 'FG',   color: '#FF4444', description: 'Ignites easily' },
  '2.2': { label: 'Non-Flammable Gas',         shortLabel: 'NFG',  color: '#4A90D9', description: 'May cause asphyxiation' },
  '2.3': { label: 'Toxic Gas',                 shortLabel: 'TG',   color: '#8B0000', description: 'Poisonous if inhaled' },
  '3':   { label: 'Flammable Liquid',          shortLabel: 'FL',   color: '#FF4444', description: 'Flash point below 60°C' },
  '4.1': { label: 'Flammable Solid',           shortLabel: 'FS',   color: '#FF6B00', description: 'Easily ignited solid' },
  '4.2': { label: 'Spontaneously Combustible', shortLabel: 'SC',   color: '#FF6B00', description: 'Self-heating/igniting' },
  '4.3': { label: 'Dangerous When Wet',        shortLabel: 'DWW',  color: '#0066CC', description: 'Reacts with water' },
  '5.1': { label: 'Oxidizer',                  shortLabel: 'OX',   color: '#FFD700', description: 'May intensify fire' },
  '5.2': { label: 'Organic Peroxide',          shortLabel: 'OP',   color: '#FFD700', description: 'Fire and explosion risk' },
  '6.1': { label: 'Toxic Substance',           shortLabel: 'TOX',  color: '#8B0000', description: 'Poisonous material' },
  '6.2': { label: 'Infectious Substance',      shortLabel: 'INF',  color: '#8B0000', description: 'Biological hazard' },
  '7':   { label: 'Radioactive',               shortLabel: 'RAD',  color: '#9B59B6', description: 'Ionizing radiation' },
  '8':   { label: 'Corrosive',                 shortLabel: 'COR',  color: '#2ECC71', description: 'Destroys living tissue/metal' },
  '9':   { label: 'Miscellaneous',             shortLabel: 'MISC', color: '#95A5A6', description: 'Various hazards' },
};

export function getHazardClass(hazardClass) {
  if (!hazardClass) return HAZARD_CLASSES['9'];
  const key = String(hazardClass).split('/')[0].trim();
  if (HAZARD_CLASSES[key]) return HAZARD_CLASSES[key];
  const numericKey = key.replace(/[A-Za-z]+$/, '');
  if (HAZARD_CLASSES[numericKey]) return HAZARD_CLASSES[numericKey];
  const intKey = key.split('.')[0];
  if (HAZARD_CLASSES[intKey]) return HAZARD_CLASSES[intKey];
  return HAZARD_CLASSES['9'];
}

// The 15 DOT classes shown in the Placard grid, in display order.
export const PLACARD_CLASSES = [
  { code: '1',   label: 'Explosives',                division: '1.1–1.6' },
  { code: '2.1', label: 'Flammable Gas',             division: '2.1' },
  { code: '2.2', label: 'Non-Flammable Gas',         division: '2.2' },
  { code: '2.3', label: 'Toxic Gas',                 division: '2.3' },
  { code: '3',   label: 'Flammable Liquid',          division: '3' },
  { code: '4.1', label: 'Flammable Solid',           division: '4.1' },
  { code: '4.2', label: 'Spontaneously Combustible', division: '4.2' },
  { code: '4.3', label: 'Dangerous When Wet',        division: '4.3' },
  { code: '5.1', label: 'Oxidizer',                  division: '5.1' },
  { code: '5.2', label: 'Organic Peroxide',          division: '5.2' },
  { code: '6.1', label: 'Toxic Substance',           division: '6.1' },
  { code: '6.2', label: 'Infectious Substance',      division: '6.2' },
  { code: '7',   label: 'Radioactive',               division: '7' },
  { code: '8',   label: 'Corrosive',                 division: '8' },
  { code: '9',   label: 'Miscellaneous',             division: '9' },
];
