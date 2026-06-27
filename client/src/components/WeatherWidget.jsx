import { useState, useEffect } from 'react';
import { Cloud, Wind, Droplets, AlertTriangle } from 'lucide-react';

// WMO weather code to emoji mapping
const WEATHER_EMOJI = {
  0: '☀️',    // Clear
  1: '🌤️',    // Mainly Clear
  2: '⛅',    // Partly Cloudy
  3: '☁️',    // Overcast
  45: '🌫️',   // Fog
  48: '🌫️',   // Depositing Rime Fog
  51: '🌦️',   // Light Drizzle
  53: '🌦️',   // Moderate Drizzle
  55: '🌦️',   // Dense Drizzle
  61: '🌧️',   // Slight Rain
  63: '🌧️',   // Moderate Rain
  65: '🌧️',   // Heavy Rain
  71: '❄️',    // Slight Snow
  73: '❄️',    // Moderate Snow
  75: '❄️',    // Heavy Snow
  80: '🌦️',   // Slight Showers
  81: '🌦️',   // Moderate Showers
  82: '🌦️',   // Violent Showers
  95: '⛈️',    // Thunderstorm
  96: '⛈️',    // Thunderstorm with Slight Hail
  99: '⛈️',    // Thunderstorm with Heavy Hail
};

// WMO weather code descriptions
const WEATHER_DESC = {
  0: 'Clear',
  1: 'Mainly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Fog',
  51: 'Drizzle',
  53: 'Drizzle',
  55: 'Drizzle',
  61: 'Rain',
  63: 'Rain',
  65: 'Rain',
  71: 'Snow',
  73: 'Snow',
  75: 'Snow',
  80: 'Showers',
  81: 'Showers',
  82: 'Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm',
};

export default function WeatherWidget({ settings }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch weather data
  const fetchWeather = async () => {
    if (!settings?.city || !settings?.state || !settings?.zip) {
      return;
    }

    setLoading(true);
    try {
      // Step 1: Geocode location via Nominatim
      const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        settings.city
      )},${encodeURIComponent(settings.state)}&format=json&limit=1`;

      const geocodeRes = await fetch(geocodeUrl);
      if (!geocodeRes.ok) throw new Error('Geocoding failed');

      const locations = await geocodeRes.json();
      if (!locations || locations.length === 0) throw new Error('Location not found');

      const { lat, lon } = locations[0];

      // Step 2: Fetch weather from Open-Meteo
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,precipitation&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;

      const weatherRes = await fetch(weatherUrl);
      if (!weatherRes.ok) throw new Error('Weather fetch failed');

      const data = await weatherRes.json();
      setWeather(data.current);
    } catch (e) {
      console.error('Weather fetch error:', e);
      setWeather(null);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and 10-minute refresh
  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, 600000); // 10 minutes
    return () => clearInterval(interval);
  }, [settings?.city, settings?.state, settings?.zip]);

  if (!weather && !loading) {
    return null;
  }

  if (loading && !weather) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-4">
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading weather…</p>
      </div>
    );
  }

  if (!weather) {
    return null;
  }

  // Extract weather data
  const temp = Math.round(weather.temperature_2m);
  const feelsLike = Math.round(weather.apparent_temperature);
  const windSpeed = Math.round(weather.wind_speed_10m);
  const windDir = weather.wind_direction_10m ?? null;
  const windGusts = weather.wind_gusts_10m ? Math.round(weather.wind_gusts_10m) : null;
  const humidity = weather.relative_humidity_2m;
  const precipitation = weather.precipitation;
  const weatherCode = weather.weather_code;
  const emoji = WEATHER_EMOJI[weatherCode] || '🌤️';
  const desc = WEATHER_DESC[weatherCode] || 'Unknown';

  // Convert degrees to compass direction
  const degToCompass = (deg) => {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  };
  const compassDir = windDir !== null ? degToCompass(windDir) : null;

  // Wind intensity label
  const windLabel = windSpeed < 5 ? 'Calm'
    : windSpeed < 15 ? 'Light'
    : windSpeed < 25 ? 'Moderate'
    : windSpeed < 35 ? 'Strong'
    : 'Dangerous';
  const windColor = windSpeed < 15 ? 'text-green-700 dark:text-green-300'
    : windSpeed < 25 ? 'text-yellow-700 dark:text-yellow-300'
    : windSpeed < 35 ? 'text-orange-700 dark:text-orange-300'
    : 'text-red-700 dark:text-red-300';
  const windBg = windSpeed < 15 ? 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-900'
    : windSpeed < 25 ? 'bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-900'
    : windSpeed < 35 ? 'bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-900'
    : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900';

  // Fire weather warning: temp > 85°F AND humidity < 30% AND wind > 15 mph
  const fireWeatherWarning =
    temp > 85 && humidity < 30 && windSpeed > 15;

  // Ice/road warning: temp ≤ 32°F AND precipitation > 0
  const iceWarning = temp <= 32 && precipitation > 0;

  return (
    <div className="space-y-3 min-w-0 overflow-hidden">
      {/* Main weather card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-3">
        {/* Temperature row */}
        <div className="flex items-start justify-between gap-1 mb-2">
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="text-3xl font-bold text-gray-900 dark:text-gray-100 shrink-0">{temp}°</span>
            <span className="text-xl text-gray-500 dark:text-gray-400 shrink-0">{emoji}</span>
          </div>
          <div className="text-right text-xs min-w-0 shrink-0">
            <p className="text-gray-700 dark:text-gray-300 font-medium truncate">{desc}</p>
            <p className="text-gray-500 dark:text-gray-400">Feels {feelsLike}°</p>
          </div>
        </div>

        {/* Humidity row */}
        <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 mb-2">
          <Droplets className="h-3 w-3 shrink-0" />
          <span>{humidity}% humidity</span>
        </div>

        {/* Wind — featured section */}
        <div className={`rounded-lg border p-2.5 ${windBg}`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <Wind className={`h-3.5 w-3.5 shrink-0 ${windColor}`} />
              <span className={`text-[10px] font-bold uppercase tracking-wide ${windColor}`}>Wind</span>
            </div>
            <span className={`text-[10px] font-semibold ${windColor}`}>{windLabel}</span>
          </div>
          <div className="flex items-end gap-2">
            {/* Speed + gusts */}
            <div className="min-w-0">
              <span className={`text-xl font-bold ${windColor}`}>{windSpeed}</span>
              <span className={`text-xs ml-0.5 ${windColor}`}>mph</span>
              {windGusts && windGusts > windSpeed + 5 && (
                <p className="text-[10px] text-gray-600 dark:text-gray-300 mt-0.5">Gusts to {windGusts} mph</p>
              )}
            </div>
            {/* Compass direction */}
            {compassDir && (
              <div className="flex flex-col items-center ml-auto shrink-0">
                {/* Arrow rotated to wind direction */}
                <div
                  className={`text-sm font-bold leading-none ${windColor}`}
                  style={{ transform: `rotate(${windDir}deg)`, display: 'inline-block' }}
                  title={`${windDir}°`}
                >
                  ↑
                </div>
                <span className={`text-xs font-bold ${windColor}`}>{compassDir}</span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">from</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fire weather warning */}
      {fireWeatherWarning && (
        <div className="bg-orange-50 dark:bg-orange-950/50 border border-orange-300 dark:border-orange-800 rounded-lg p-3 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-orange-900 dark:text-orange-200">Fire Weather Warning</p>
            <p className="text-xs text-orange-700 dark:text-orange-300 mt-0.5">
              High temps, low humidity, and strong winds — increased fire danger
            </p>
          </div>
        </div>
      )}

      {/* Ice/road warning */}
      {iceWarning && (
        <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-300 dark:border-blue-800 rounded-lg p-3 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">Ice / Road Warning</p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
              Freezing temperatures with precipitation — slippery conditions expected
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
