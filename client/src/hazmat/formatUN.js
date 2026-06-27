// formatUN.js — UN/NA + ERG guide display formatting (web port, verbatim).

export function formatUN(un_number) {
  if (!un_number) return '';
  const s = String(un_number).trim();
  const m = /^(NA|UN)\s*(.*)$/i.exec(s);
  if (m) {
    const prefix = m[1].toUpperCase();
    const rest = m[2].trim();
    return `${prefix} ${rest}`;
  }
  return `UN ${s}`;
}

// Appends the polymerization "P" suffix in a MATERIAL context (ERG Yellow
// Section Note 2). The guide's own page shows the bare number.
export function formatGuide(guide_number, polymerization_hazard) {
  if (guide_number == null) return '';
  return `${guide_number}${polymerization_hazard ? 'P' : ''}`;
}
