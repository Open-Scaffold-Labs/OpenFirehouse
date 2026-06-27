/**
 * fireTranscript.js — Fire Service Speech Post-Processor
 *
 * Cleans up raw Web Speech API transcription to use proper fire service
 * terminology, apparatus designations, NFPA codes, ICS terms, radio codes,
 * and rank abbreviations.
 *
 * Designed to work as a pass-through: fireCleanup("engine one four two on scene")
 * → "Engine 142 on scene."
 */

// ── Apparatus designations ──────────────────────────────────────────────────
// Spoken number words → digits
const NUMBER_WORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14',
  fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
  twenty: '20', thirty: '30', forty: '40', fifty: '50',
};

// Apparatus type words (case-insensitive matching)
const APPARATUS_TYPES = [
  'engine', 'ladder', 'truck', 'tower', 'quint', 'rescue',
  'tanker', 'tender', 'brush', 'squad', 'hazmat', 'haz mat',
  'battalion', 'command', 'ems', 'medic', 'ambulance', 'marine',
  'utility', 'aerial', 'platform',
];

// ── Acronyms & abbreviations (spoken → written) ────────────────────────────
const ACRONYMS = {
  'par': 'PAR',
  'par check': 'PAR check',
  'ric': 'RIC',
  'rit': 'RIT',
  'ric rit': 'RIC/RIT',
  'ics': 'ICS',
  'ic': 'IC',
  'nims': 'NIMS',
  'scba': 'SCBA',
  'pass': 'PASS',
  'ppe': 'PPE',
  'ems': 'EMS',
  'als': 'ALS',
  'bls': 'BLS',
  'cpr': 'CPR',
  'aed': 'AED',
  'lz': 'LZ',
  'drt': 'DRT',
  'mayday': 'MAYDAY',
  'may day': 'MAYDAY',
  'rehab': 'Rehab',
  'staging': 'Staging',
  'command': 'Command',
  'ops': 'Ops',
  'div': 'Div',
  'group': 'Group',
  'sector': 'Sector',
  'hazmat': 'HazMat',
  'haz mat': 'HazMat',
  'decon': 'Decon',
  'overhaul': 'Overhaul',
  'ventilation': 'Ventilation',
  'primary search': 'Primary Search',
  'secondary search': 'Secondary Search',
  'all clear': 'All Clear',
  'under control': 'Under Control',
  'water on': 'Water On',
  'knockdown': 'Knockdown',
  'exposure': 'Exposure',
  'mutual aid': 'Mutual Aid',
  'auto aid': 'Auto Aid',
  'mva': 'MVA',
  'mvc': 'MVC',
  'loi': 'LOI',
  'sog': 'SOG',
  'sop': 'SOP',
  'losap': 'LOSAP',
  'cba': 'CBA',
  'flsa': 'FLSA',
  'osha': 'OSHA',
  'niosh': 'NIOSH',
  'iso': 'ISO',
  'nfirs': 'NFIRS',
  'neris': 'NERIS',
  'cad': 'CAD',
  'psi': 'PSI',
  'gpm': 'GPM',
  'lpm': 'LPM',
  'abc': 'ABC',
  'b c': 'B/C',
  'bc': 'B/C',
};

// ── NFPA standards ──────────────────────────────────────────────────────────
const NFPA_PATTERNS = [
  // "nfpa ten oh one" → "NFPA 1001"
  { spoken: /\bnfpa\s+ten\s+oh\s+one\b/gi, written: 'NFPA 1001' },
  { spoken: /\bnfpa\s+ten\s+oh\s+two\b/gi, written: 'NFPA 1002' },
  { spoken: /\bnfpa\s+fourteen\s+oh?\s*three\b/gi, written: 'NFPA 1403' },
  { spoken: /\bnfpa\s+fifteen\s+hundred\b/gi, written: 'NFPA 1500' },
  { spoken: /\bnfpa\s+nineteen\s+hundred\b/gi, written: 'NFPA 1900' },
  { spoken: /\bnfpa\s+(\d+)\b/gi, written: (_, n) => `NFPA ${n}` },
];

// ── Radio codes (10-codes) ──────────────────────────────────────────────────
const RADIO_CODES = {
  'ten four': '10-4',
  'ten-four': '10-4',
  '10 four': '10-4',
  'ten seven': '10-7',
  'ten eight': '10-8',
  'ten twenty': '10-20',
  'ten forty five': '10-45',
  'ten forty-five': '10-45',
  'signal zero': 'Signal 0',
  'signal one': 'Signal 1',
  'signal two': 'Signal 2',
  'signal three': 'Signal 3',
  'signal four': 'Signal 4',
  'signal five': 'Signal 5',
  'code red': 'Code Red',
  'code three': 'Code 3',
  'code four': 'Code 4',
};

// ── Rank corrections ────────────────────────────────────────────────────────
const RANKS = {
  'chief': 'Chief',
  'deputy chief': 'Deputy Chief',
  'assistant chief': 'Assistant Chief',
  'battalion chief': 'Battalion Chief',
  'captain': 'Captain',
  'lieutenant': 'Lieutenant',
  'firefighter': 'Firefighter',
  'probationary firefighter': 'Probationary Firefighter',
  'probie': 'Probationary FF',
  'dispatcher': 'Dispatcher',
  'driver': 'Driver',
  'engineer': 'Engineer',
  'fire marshal': 'Fire Marshal',
  'inspector': 'Inspector',
  'safety officer': 'Safety Officer',
};

// ── ICS section titles ──────────────────────────────────────────────────────
const ICS_TITLES = {
  'operations section chief': 'Operations Section Chief',
  'operations chief': 'Operations Section Chief',
  'planning section chief': 'Planning Section Chief',
  'logistics section chief': 'Logistics Section Chief',
  'finance section chief': 'Finance/Admin Section Chief',
  'finance admin section chief': 'Finance/Admin Section Chief',
  'incident commander': 'Incident Commander',
  'deputy ic': 'Deputy IC',
  'safety officer': 'Safety Officer',
  'public information officer': 'Public Information Officer',
  'pio': 'PIO',
  'liaison officer': 'Liaison Officer',
};

// ── Main cleanup function ───────────────────────────────────────────────────

export function fireCleanup(raw) {
  if (!raw || typeof raw !== 'string') return raw;

  let text = raw;

  // 1. NFPA patterns (most specific, do first)
  for (const p of NFPA_PATTERNS) {
    text = text.replace(p.spoken, typeof p.written === 'function' ? p.written : p.written);
  }

  // 2. Radio codes
  for (const [spoken, written] of Object.entries(RADIO_CODES)) {
    const re = new RegExp(`\\b${spoken.replace(/-/g, '[- ]?')}\\b`, 'gi');
    text = text.replace(re, written);
  }

  // 3. ICS titles (longer phrases first to avoid partial matches)
  const icsSorted = Object.entries(ICS_TITLES).sort((a, b) => b[0].length - a[0].length);
  for (const [spoken, written] of icsSorted) {
    const re = new RegExp(`\\b${spoken}\\b`, 'gi');
    text = text.replace(re, written);
  }

  // 4. Ranks
  const ranksSorted = Object.entries(RANKS).sort((a, b) => b[0].length - a[0].length);
  for (const [spoken, written] of ranksSorted) {
    const re = new RegExp(`\\b${spoken}\\b`, 'gi');
    text = text.replace(re, written);
  }

  // 5. Apparatus designations: "engine one four two" → "Engine 142"
  for (const type of APPARATUS_TYPES) {
    // Match apparatus type followed by number words or digits
    const typeRe = new RegExp(
      `\\b(${type})\\s+((?:(?:${Object.keys(NUMBER_WORDS).join('|')}|\\d+)\\s*)+)\\b`,
      'gi'
    );
    text = text.replace(typeRe, (_match, apparatusType, numberPart) => {
      // Convert number words to digits
      const digits = numberPart
        .trim()
        .split(/\s+/)
        .map(w => NUMBER_WORDS[w.toLowerCase()] ?? w)
        .join('');
      const label = apparatusType.charAt(0).toUpperCase() + apparatusType.slice(1).toLowerCase();
      // Special cases
      if (label.toLowerCase() === 'haz mat' || label.toLowerCase() === 'hazmat') return `HazMat ${digits}`;
      if (label.toLowerCase() === 'ems') return `EMS ${digits}`;
      return `${label} ${digits}`;
    });
  }

  // 6. Acronyms (shorter terms — do after apparatus to avoid conflicts)
  // Sort by length descending so longer phrases match first
  const acronymsSorted = Object.entries(ACRONYMS).sort((a, b) => b[0].length - a[0].length);
  for (const [spoken, written] of acronymsSorted) {
    const re = new RegExp(`\\b${spoken}\\b`, 'gi');
    text = text.replace(re, written);
  }

  // 7. Common fire-specific spelling corrections
  text = text
    .replace(/\bfire ground\b/gi, 'fireground')
    .replace(/\bfire house\b/gi, 'firehouse')
    .replace(/\bfire fighter\b/gi, 'firefighter')
    .replace(/\bturn out\b/gi, 'turnout')
    .replace(/\bturn outs\b/gi, 'turnouts')
    .replace(/\bknock down\b/gi, 'knockdown')
    .replace(/\bover haul\b/gi, 'overhaul')
    .replace(/\bback draft\b/gi, 'backdraft')
    .replace(/\bflash over\b/gi, 'flashover')
    .replace(/\broll over\b/gi, 'rollover');

  return text;
}
