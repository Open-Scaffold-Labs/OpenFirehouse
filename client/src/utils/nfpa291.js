/**
 * NFPA 291 — Recommended Practice for Fire Flow Testing and Marking of Hydrants
 * Color codes hydrants based on rated flow (GPM) from a standard 20 PSI residual.
 *
 * Class AA (Blue)   ≥ 1500 GPM  — Excellent
 * Class A  (Green)  1000–1499    — Good
 * Class B  (Orange)  500–999     — Fair
 * Class C  (Red)    < 500        — Poor
 * Unrated  (Gray)   No test data
 */

export const NFPA291_CLASSES = [
  {
    id:      'AA',
    label:   'Class AA',
    desc:    '≥ 1500 GPM',
    minGPM:  1500,
    maxGPM:  Infinity,
    color:   '#2563eb',   // blue-600
    tailwind:'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
    dot:     'bg-blue-500',
    pinColor:'#2563eb',
  },
  {
    id:      'A',
    label:   'Class A',
    desc:    '1000–1499 GPM',
    minGPM:  1000,
    maxGPM:  1499,
    color:   '#16a34a',   // green-600
    tailwind:'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
    dot:     'bg-green-500',
    pinColor:'#16a34a',
  },
  {
    id:      'B',
    label:   'Class B',
    desc:    '500–999 GPM',
    minGPM:  500,
    maxGPM:  999,
    color:   '#ea580c',   // orange-600
    tailwind:'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700',
    dot:     'bg-orange-500',
    pinColor:'#ea580c',
  },
  {
    id:      'C',
    label:   'Class C',
    desc:    '< 500 GPM',
    minGPM:  0,
    maxGPM:  499,
    color:   '#dc2626',   // red-600
    tailwind:'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700',
    dot:     'bg-red-500',
    pinColor:'#dc2626',
  },
  {
    id:      'UNRATED',
    label:   'Unrated',
    desc:    'No test data',
    minGPM:  null,
    maxGPM:  null,
    color:   '#6b7280',   // gray-500
    tailwind:'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600',
    dot:     'bg-gray-400',
    pinColor:'#6b7280',
  },
];

/**
 * Returns the NFPA 291 class for a given flow rate.
 * @param {number|null|undefined} gpm
 * @returns {object} The class descriptor from NFPA291_CLASSES
 */
export function nfpa291Class(gpm) {
  if (gpm == null || gpm === '' || isNaN(Number(gpm))) {
    return NFPA291_CLASSES.find(c => c.id === 'UNRATED');
  }
  const g = Number(gpm);
  return (
    NFPA291_CLASSES.find(c => c.minGPM != null && g >= c.minGPM && g <= c.maxGPM) ??
    NFPA291_CLASSES.find(c => c.id === 'UNRATED')
  );
}

/**
 * Returns the emoji glyph for a hydrant pin based on its NFPA 291 class.
 * Used as MapKit MarkerAnnotation glyphText.
 */
export function nfpaGlyph(cls) {
  switch (cls.id) {
    case 'AA': return '🔵';
    case 'A':  return '🟢';
    case 'B':  return '🟠';
    case 'C':  return '🔴';
    default:   return '⚪';
  }
}
