export const SHIFT_TYPES = ['Day', 'Night', 'Duty Officer', '24-Hour'];

export const SHIFT_TIMES = {
  'Day':          { start: '06:00', end: '18:00', label: '0600–1800' },
  'Night':        { start: '18:00', end: '06:00', label: '1800–0600' },
  'Duty Officer': { start: '00:00', end: '23:59', label: '24-hr Officer' },
  '24-Hour':      { start: '08:00', end: '08:00', label: '0800–0800' },
};

export const MIN_CREW = 3; // minimum members for adequate coverage

// Generate sample schedule for current month + next month
function yyyymmdd(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return yyyymmdd(d);
}

const today = new Date();
const year  = today.getFullYear();
const month = today.getMonth(); // 0-indexed

// Build a set of shifts for the current month
const members = [
  'Sarah Chen',
  'Maria Delgado',
  'Nathan McGee',
  'Sandra Kim',
  'Tracy Benson',
  'James Ortega',
  'Mike Harrington',
  'Lisa Fontaine',
];

function buildShifts() {
  const shifts = [];
  let id = 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = yyyymmdd(new Date(year, month, day));
    const dow  = new Date(year, month, day).getDay(); // 0=Sun

    // Day shift — rotate through members
    const dayCrew = [
      members[day % members.length],
      members[(day + 2) % members.length],
      members[(day + 4) % members.length],
    ];
    shifts.push({ id: id++, date, shiftType: 'Day', crew: dayCrew, notes: '' });

    // Night shift — different rotation
    const nightCrew = [
      members[(day + 1) % members.length],
      members[(day + 3) % members.length],
      ...(dow === 5 || dow === 6 ? [members[(day + 5) % members.length]] : []),
    ];
    shifts.push({ id: id++, date, shiftType: 'Night', crew: nightCrew, notes: '' });

    // Duty officer — every day
    shifts.push({
      id: id++,
      date,
      shiftType: 'Duty Officer',
      crew: [members[(day + 6) % members.length]],
      notes: '',
    });
  }

  return shifts;
}

export const initialShifts = buildShifts();
