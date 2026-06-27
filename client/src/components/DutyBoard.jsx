import { useState, useEffect, useMemo } from 'react';
import { X, AlertTriangle, Cloud, Wind, Droplets } from 'lucide-react';
import { api } from '../utils/api';

const WEATHER_EMOJI = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌦️', 61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '❄️', 73: '❄️', 75: '❄️', 80: '🌦️', 81: '🌦️', 82: '🌦️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

const WEATHER_DESC = {
  0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog',
  51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Rain',
  71: 'Snow', 73: 'Snow', 75: 'Snow', 80: 'Showers', 81: 'Showers', 82: 'Showers',
  95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
};

const APPARATUS_TYPE_ICONS = {
  'Engine': '🚒', 'Ladder / Aerial': '🪜', 'Tanker': '🚛', 'Rescue': '🔧',
  'Brush': '🌲', 'Command': '🚗', 'Utility': '🔩', 'Ambulance / EMS': '🚑',
  'Hazmat': '☣️', 'Foam Unit': '💧',
};

export default function DutyBoard({ settings, onClose }) {
  const [members, setMembers] = useState([]);
  const [apparatus, setApparatus] = useState([]);
  const [activeBoard, setActiveBoard] = useState(null);
  const [recall, setRecall] = useState(null);
  const [weather, setWeather] = useState(null);
  const [time, setTime] = useState(new Date());

  const deptName = settings?.departmentName || 'Open Firehouse';
  const stationName = settings?.stationName || 'Station';

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        const [m, a, b, r] = await Promise.all([
          api.get('/api/members'),
          api.get('/api/apparatus'),
          api.get('/api/active-board').catch(() => null),
          api.get('/api/recall').catch(() => null),
        ]);
        setMembers(Array.isArray(m) ? m : m?.data ?? []);
        setApparatus(Array.isArray(a) ? a : a?.data ?? []);
        if (b && (Array.isArray(b) ? b[0] : b?.data?.[0])) {
          setActiveBoard(Array.isArray(b) ? b[0] : b?.data?.[0]);
        }
        if (r) {
          setRecall(Array.isArray(r) ? r[0] : r?.data?.[0]);
        }
      } catch (err) {
        console.error('DutyBoard data fetch error:', err);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch weather
  useEffect(() => {
    async function fetchWeather() {
      if (!settings?.city || !settings?.state) return;
      try {
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          settings.city
        )},${encodeURIComponent(settings.state)}&format=json&limit=1`;
        const geocodeRes = await fetch(geocodeUrl);
        if (!geocodeRes.ok) throw new Error('Geocoding failed');
        const locations = await geocodeRes.json();
        if (!locations?.length) throw new Error('Location not found');
        const { lat, lon } = locations[0];

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
        const weatherRes = await fetch(weatherUrl);
        if (!weatherRes.ok) throw new Error('Weather fetch failed');
        const data = await weatherRes.json();
        setWeather(data.current);
      } catch (e) {
        console.error('Weather fetch error:', e);
      }
    }

    fetchWeather();
    const interval = setInterval(fetchWeather, 600000);
    return () => clearInterval(interval);
  }, [settings?.city, settings?.state]);

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Count on-duty members
  const onDutyCount = useMemo(
    () => members.filter((m) => m.status === 'Active' && m.available !== false).length,
    [members]
  );

  // Count in-service apparatus
  const inServiceCount = useMemo(
    () => apparatus.filter((a) => a.status === 'In Service').length,
    [apparatus]
  );

  // Get status color for apparatus
  function getApparatusStatusColor(status) {
    switch (status) {
      case 'In Service':
        return { border: 'border-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/50' };
      case 'En Route':
      case 'Responding':
        return { border: 'border-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/50' };
      case 'On Scene':
        return { border: 'border-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/50' };
      case 'Out of Service':
        return { border: 'border-red-500', bg: 'bg-red-50 dark:bg-red-950/50' };
      default:
        return { border: 'border-gray-300 dark:border-gray-700', bg: 'bg-gray-50 dark:bg-gray-950' };
    }
  }

  function getApparatusStatusBgColor(status) {
    switch (status) {
      case 'In Service':
        return 'bg-emerald-600';
      case 'En Route':
      case 'Responding':
        return 'bg-amber-600';
      case 'On Scene':
        return 'bg-orange-600';
      case 'Out of Service':
        return 'bg-red-600';
      default:
        return 'bg-gray-400';
    }
  }

  // Format time
  const timeStr = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dateStr = time.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 text-white font-sans overflow-hidden">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
        title="Exit TV Mode"
        aria-label="Exit TV Mode"
      >
        <X size={24} />
      </button>

      {/* Header */}
      <div className="bg-gray-800 border-b-2 border-red-600 px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white">{deptName}</h1>
            <p className="text-sm text-gray-400 mt-1">{stationName}</p>
          </div>
          <div className="text-right">
            <p className="text-5xl font-bold font-mono text-white">{timeStr}</p>
            <p className="text-lg text-gray-400">{dateStr}</p>
          </div>
        </div>
      </div>

      {/* Main content grid: 60% left, 40% right */}
      <div className="flex flex-1 h-full overflow-hidden">
        {/* Left column (60%) */}
        <div className="w-3/5 border-r border-gray-700 px-8 py-6 overflow-y-auto space-y-6">
          {/* Active incident banner */}
          {activeBoard && (
            <div className="bg-red-600 border-2 border-red-500 rounded-lg p-6 animate-pulse">
              <div className="flex items-start gap-4">
                <AlertTriangle size={32} className="text-white flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="text-2xl font-bold text-white">ACTIVE INCIDENT</p>
                  <p className="text-lg text-red-100 mt-1">{activeBoard.type}</p>
                  <p className="text-sm text-red-100 mt-1">{activeBoard.address}</p>
                  <p className="text-xs text-red-100 mt-2">
                    Dispatch: {new Date(activeBoard.date).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* On Duty Today */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-4">
              On Duty Today ({onDutyCount})
            </h2>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {members
                .filter((m) => m.status === 'Active' && m.available !== false)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3 bg-gray-700 rounded border border-gray-600 hover:bg-gray-600 transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-semibold text-white truncate">
                        {member.name}
                      </p>
                      <p className="text-sm text-gray-400">{member.rank}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Active recall */}
          {recall && (
            <div className="bg-gray-800 rounded-lg p-6 border-2 border-amber-500">
              <h2 className="text-xl font-bold text-amber-300 mb-3">ACTIVE RECALL</h2>
              <p className="text-white font-semibold mb-2">{recall.title}</p>
              <p className="text-gray-300 dark:text-gray-600 text-sm mb-3">{recall.description}</p>
              <p className="text-sm text-gray-400">
                Responses: {recall.responses?.length ?? 0}
              </p>
            </div>
          )}
        </div>

        {/* Right column (40%) */}
        <div className="w-2/5 px-8 py-6 overflow-y-auto space-y-6">
          {/* Apparatus Status */}
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-white">
              Apparatus ({inServiceCount}/{apparatus.length})
            </h2>
            <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
              {apparatus.map((unit) => {
                const { border, bg } = getApparatusStatusColor(unit.status);
                const statusBg = getApparatusStatusBgColor(unit.status);
                return (
                  <div
                    key={unit.id}
                    className={`rounded-lg p-4 border-l-4 ${border} ${bg} bg-opacity-20 border-gray-700`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-3xl">
                            {APPARATUS_TYPE_ICONS[unit.type] || '🚒'}
                          </span>
                          <div>
                            <p className="text-lg font-bold text-white">
                              {unit.designation}
                            </p>
                            <p className="text-xs text-gray-400">{unit.type}</p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400">
                          {unit.year} {unit.make} {unit.model}
                        </p>
                        {unit.assignedOperator && (
                          <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
                            Op: {unit.assignedOperator}
                          </p>
                        )}
                      </div>
                      <div className={`${statusBg} text-white px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap`}>
                        {unit.status}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weather */}
          {weather && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="text-sm font-bold text-gray-300 dark:text-gray-600 uppercase tracking-wider mb-3">
                Weather
              </h3>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-3xl font-bold text-white">
                    {Math.round(weather.temperature_2m)}°F
                  </p>
                  <p className="text-sm text-gray-400">
                    {WEATHER_DESC[weather.weather_code] || 'Unknown'}
                  </p>
                </div>
                <p className="text-5xl">
                  {WEATHER_EMOJI[weather.weather_code] || '🌤️'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-gray-300 dark:text-gray-600">
                  <Wind size={14} />
                  <span>{Math.round(weather.wind_speed_10m)} mph</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-300 dark:text-gray-600">
                  <Droplets size={14} />
                  <span>{weather.relative_humidity_2m}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-800 border-t border-gray-700 px-8 py-3 flex items-center justify-between text-sm text-gray-400">
        <p><span className="font-semibold text-gray-300 dark:text-gray-600">OPEN</span><span className="font-semibold text-red-400">FIREHOUSE</span></p>
        <p>Last updated: {timeStr}</p>
      </div>
    </div>
  );
}
