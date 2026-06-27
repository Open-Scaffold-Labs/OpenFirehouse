// Default station settings — replaced by user input via StationSettings module
export const DEFAULT_SETTINGS = {
  stationName: 'Station 14',
  departmentName: 'Maplewood VFD',
  stationNumber: '14',
  address: '1400 Elm Street',
  city: 'Maplewood',
  state: 'PA',
  zip: '17001',
  phone: '(717) 555-0114',
  email: 'station14@maplewoodvfd.org',
  website: 'www.maplewoodvfd.org',
  chiefName: 'Sarah Chen',
  chiefPhone: '(717) 555-0100',
  chiefEmail: 'chief@maplewoodvfd.org',
  founded: '1952',
  county: 'Maplewood County',
  district: 'Fire District 3',
  fdid: 'PA-4214',           // Fire Dept ID for NFIRS
  minCrewSize: 3,
  shiftLength: 12,           // hours
  timezone: 'America/New_York',
  accentColor: '#B91C1C',    // red-700 — used in top bar
};

// localStorage key
export const SETTINGS_KEY = 'freestation_settings';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (_) {}
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
