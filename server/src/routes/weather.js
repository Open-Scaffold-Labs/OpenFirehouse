'use strict';
/**
 * routes/weather.js — Weather data endpoint for the landing page.
 *
 * GET /api/weather/current
 *
 * Fetches current weather + 3-day forecast from OpenWeatherMap.
 * Falls back to a sensible default if no API key is configured.
 * Results are cached for 15 minutes to stay well within free-tier limits.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const router  = express.Router();
const { pool } = require('../db');

// In-memory caches — per station (W2.5 audit 2026-06-10: was one global cache
// + hardcoded Maplewood MN coords, so every department saw the same town's
// weather). Station location resolves from the stations row (zip, or
// city/state) via OWM geocoding; falls back to the legacy default.
const weatherCache = new Map(); // stationId -> { data, fetchedAt }
const geoCache     = new Map(); // stationId -> { lat, lon, name }
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Fallback coordinates — Maplewood, MN (the original single-tenant default)
const DEFAULT_LAT = 44.9537;
const DEFAULT_LON = -93.0252;
const DEFAULT_LOC = { lat: DEFAULT_LAT, lon: DEFAULT_LON, name: 'Maplewood, MN' };

async function resolveStationLocation(stationId) {
  if (geoCache.has(stationId)) return geoCache.get(stationId);
  let loc = DEFAULT_LOC;
  try {
    const { rows } = await pool.query('SELECT city, state, zip FROM stations WHERE id = $1', [stationId]);
    const st = rows[0];
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (st && apiKey && (st.zip || (st.city && st.state))) {
      if (st.zip) {
        const r = await fetch(`https://api.openweathermap.org/geo/1.0/zip?zip=${encodeURIComponent(st.zip)},US&appid=${apiKey}`);
        if (r.ok) {
          const g = await r.json();
          if (g.lat != null) loc = { lat: g.lat, lon: g.lon, name: g.name || `${st.city}, ${st.state}` };
        }
      }
      if (loc === DEFAULT_LOC && st.city && st.state) {
        const r = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(`${st.city},${st.state},US`)}&limit=1&appid=${apiKey}`);
        if (r.ok) {
          const g = (await r.json())[0];
          if (g?.lat != null) loc = { lat: g.lat, lon: g.lon, name: `${st.city}, ${st.state}` };
        }
      }
    } else if (st?.city && st?.state) {
      // No API key (simulated mode) — still label with the station's own town
      loc = { ...DEFAULT_LOC, name: `${st.city}, ${st.state}` };
    }
  } catch (err) {
    console.warn('[weather] geocode failed, using default location:', err.message);
  }
  geoCache.set(stationId, loc);
  return loc;
}

// NWS-style operational weather interpretation
function getOperationalAlerts(current, forecast) {
  const alerts = [];

  if (current.wind_speed >= 25) {
    alerts.push({
      level: 'warning',
      type: 'wind',
      text: `Wind advisory: ${Math.round(current.wind_speed)} mph gusts. Wildland readiness recommended.`,
    });
  }
  if (current.temp <= 15) {
    alerts.push({
      level: 'warning',
      type: 'cold',
      text: `Extreme cold: ${Math.round(current.temp)}°F. Hydrant freeze risk. Check frost-vulnerable zones.`,
    });
  }
  if (current.temp >= 95 || (current.temp >= 85 && current.humidity >= 70)) {
    const heatIndex = current.temp >= 85
      ? Math.round(-42.379 + 2.04901523 * current.temp + 10.14333127 * current.humidity
        - 0.22475541 * current.temp * current.humidity)
      : current.temp;
    alerts.push({
      level: 'warning',
      type: 'heat',
      text: `Heat index ${heatIndex}°F. Rehab protocols for all incidents. Hydration mandatory.`,
    });
  }
  if (current.visibility < 1) {
    alerts.push({
      level: 'caution',
      type: 'visibility',
      text: `Low visibility: ${current.visibility} mi. Reduce response speed. Use all warning lights.`,
    });
  }

  return alerts;
}

async function fetchWeather(loc = DEFAULT_LOC) {
  const apiKey = process.env.OPENWEATHER_API_KEY;

  // If no API key, return realistic mock data so the UI still works
  if (!apiKey) {
    const now = new Date();
    const hour = now.getHours();
    const month = now.getMonth(); // 0-indexed

    // Seasonal temperature baseline (Maplewood, MN)
    const seasonalTemps = [18, 22, 35, 50, 62, 74, 80, 78, 66, 50, 35, 22];
    const baseTemp = seasonalTemps[month];
    const dayVariance = hour >= 6 && hour <= 18 ? 8 : -5;

    return {
      current: {
        temp: baseTemp + dayVariance + Math.round((Math.random() - 0.5) * 6),
        feels_like: baseTemp + dayVariance - 3,
        humidity: 45 + Math.round(Math.random() * 30),
        wind_speed: 5 + Math.round(Math.random() * 15),
        wind_direction: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(Math.random() * 8)],
        conditions: month >= 11 || month <= 2 ? 'Overcast' : 'Partly Cloudy',
        icon: month >= 11 || month <= 2 ? 'cloudy' : 'partly-cloudy',
        visibility: 10,
        pressure: 1013 + Math.round((Math.random() - 0.5) * 20),
      },
      today: {
        high: baseTemp + 10,
        low: baseTemp - 5,
        sunrise: '06:45 AM',
        sunset: '06:15 PM',
        precipitation_pct: Math.round(Math.random() * 40),
        uv_index: month >= 4 && month <= 8 ? 6 : 2,
      },
      forecast: [
        { day: 'Tomorrow', high: baseTemp + 12, low: baseTemp - 3, conditions: 'Partly Cloudy', icon: 'partly-cloudy', precip_pct: 20 },
        { day: getDayName(1), high: baseTemp + 8, low: baseTemp - 6, conditions: month >= 11 || month <= 2 ? 'Snow Showers' : 'Mostly Sunny', icon: month >= 11 || month <= 2 ? 'snow' : 'sunny', precip_pct: month >= 11 || month <= 2 ? 60 : 10 },
        { day: getDayName(2), high: baseTemp + 11, low: baseTemp - 4, conditions: 'Clear', icon: 'clear', precip_pct: 5 },
      ],
      alerts: [],
      source: 'simulated',
      station_location: loc,
    };
  }

  // Real API call
  try {
    const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${loc.lat}&lon=${loc.lon}&units=imperial&exclude=minutely&appid=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`OpenWeatherMap ${resp.status}`);
    const d = await resp.json();

    const current = d.current;
    const daily = d.daily || [];

    const result = {
      current: {
        temp: Math.round(current.temp),
        feels_like: Math.round(current.feels_like),
        humidity: current.humidity,
        wind_speed: Math.round(current.wind_speed),
        wind_direction: degToCompass(current.wind_deg),
        conditions: current.weather?.[0]?.description || 'Unknown',
        icon: current.weather?.[0]?.icon || '01d',
        visibility: Math.round((current.visibility || 10000) / 1609.34), // meters to miles
        pressure: current.pressure,
      },
      today: daily[0] ? {
        high: Math.round(daily[0].temp.max),
        low: Math.round(daily[0].temp.min),
        sunrise: new Date(daily[0].sunrise * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        sunset: new Date(daily[0].sunset * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        precipitation_pct: Math.round((daily[0].pop || 0) * 100),
        uv_index: Math.round(daily[0].uvi || 0),
      } : null,
      forecast: daily.slice(1, 4).map((day, i) => ({
        day: i === 0 ? 'Tomorrow' : new Date(day.dt * 1000).toLocaleDateString('en-US', { weekday: 'short' }),
        high: Math.round(day.temp.max),
        low: Math.round(day.temp.min),
        conditions: day.weather?.[0]?.description || '',
        icon: day.weather?.[0]?.icon || '01d',
        precip_pct: Math.round((day.pop || 0) * 100),
      })),
      alerts: (d.alerts || []).map(a => ({
        event: a.event,
        sender: a.sender_name,
        start: new Date(a.start * 1000).toISOString(),
        end: new Date(a.end * 1000).toISOString(),
        description: a.description?.slice(0, 300),
      })),
      source: 'openweathermap',
      station_location: loc,
    };

    // Add operational alerts
    result.operational_alerts = getOperationalAlerts(result.current, result.forecast);

    return result;
  } catch (err) {
    console.error('[weather] API error:', err.message);
    return null;
  }
}

function degToCompass(deg) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function getDayName(offsetFromTomorrow) {
  const d = new Date();
  d.setDate(d.getDate() + 2 + offsetFromTomorrow);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

router.get('/current', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    const now = Date.now();
    const cached = weatherCache.get(stationId);
    if (cached && (now - cached.fetchedAt) < CACHE_TTL) {
      return res.json(cached.data);
    }

    const loc = await resolveStationLocation(stationId);
    const data = await fetchWeather(loc);
    if (data) {
      // Add operational alerts for simulated data too
      if (!data.operational_alerts) {
        data.operational_alerts = getOperationalAlerts(data.current, data.forecast);
      }
      weatherCache.set(stationId, { data, fetchedAt: now });
      return res.json(data);
    }
    res.status(503).json({ error: 'Weather data unavailable' });
  } catch (err) {
    console.error('[weather] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/weather/point?lat=&lng=  — Apple WeatherKit, cached server-side.
//
// SEPARATE from /current (the landing-page OpenWeatherMap widget above). This is
// the TACTICAL point-weather for the Size-Up map + hazmat plume: precise current
// wind (speed + "from" direction) at an arbitrary incident/spill coordinate.
//
// WHY A SHARED CACHE (not per-device): weather is shown during live dispatch on
// every rig device. A department with 5 rigs would otherwise fire 5+ identical
// WeatherKit calls for the SAME coordinate at the SAME moment — across every
// department that burns Apple's 500K/month quota on redundancy. We fetch ONCE
// per coordinate (rounded to ~1 km) per ~10-min window into the shared
// weather_cache table, so usage scales with active INCIDENTS, not devices. The
// Apple .p8 / token never leaves the server.
//
// Env (dormant until set → 503 weather_unconfigured): WEATHERKIT_KEY_ID,
// WEATHERKIT_SERVICE_ID, WEATHERKIT_PRIVATE_KEY, APPLE_TEAM_ID (reused from MapKit).
// ─────────────────────────────────────────────────────────────────────────────
const WK_TOKEN_TTL_SECONDS = 60 * 60;     // 1 h
const WK_CACHE_TTL_MS = 10 * 60 * 1000;   // 10 min
const WK_COORD_DP = 2;                    // ~1.1 km cache-key granularity

const APPLE_CONDITION_TO_WMO = {
  Clear: 0, MostlyClear: 1, PartlyCloudy: 2, MostlyCloudy: 3, Cloudy: 3,
  Foggy: 45, Haze: 45, Smoky: 45,
  Drizzle: 51, Rain: 63, HeavyRain: 65, Showers: 80, ScatteredShowers: 80,
  IsolatedThunderstorms: 95, Thunderstorms: 95, StrongStorms: 95,
  Flurries: 71, Snow: 73, HeavySnow: 75, Sleet: 67, FreezingRain: 66, Hail: 96,
  Breezy: 3, Windy: 3, Hurricane: 95, TropicalStorm: 95,
};

class WeatherConfigError extends Error {}

function mintWeatherKitToken() {
  const keyId = process.env.WEATHERKIT_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const serviceId = process.env.WEATHERKIT_SERVICE_ID;
  const privateKeyRaw = process.env.WEATHERKIT_PRIVATE_KEY;
  if (!keyId || !teamId || !serviceId || !privateKeyRaw) {
    throw new WeatherConfigError('missing_env_vars');
  }
  const privateKey = privateKeyRaw.includes('\\n')
    ? privateKeyRaw.replace(/\\n/g, '\n')
    : privateKeyRaw;
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: teamId, sub: serviceId, iat: now, exp: now + WK_TOKEN_TTL_SECONDS },
    privateKey,
    { algorithm: 'ES256', header: { kid: keyId, id: `${teamId}.${serviceId}`, typ: 'JWT', alg: 'ES256' } },
  );
}

async function fetchWeatherKitPoint(lat, lng) {
  const token = mintWeatherKitToken();
  const url =
    `https://weatherkit.apple.com/api/v1/weather/en_US/${lat.toFixed(4)}/${lng.toFixed(4)}` +
    `?dataSets=currentWeather,forecastDaily`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error('weatherkit_http_' + r.status);
  const j = await r.json();
  const cur = j && j.currentWeather ? j.currentWeather : {};
  const tempC = typeof cur.temperature === 'number' ? cur.temperature : NaN;
  const windKmH = typeof cur.windSpeed === 'number' ? cur.windSpeed : 0;
  const windDir = typeof cur.windDirection === 'number' ? Math.round(cur.windDirection) : 0;
  const condStr = typeof cur.conditionCode === 'string' ? cur.conditionCode : 'Clear';
  const today = j && j.forecastDaily && Array.isArray(j.forecastDaily.days) ? j.forecastDaily.days[0] : null;
  return {
    tempF: Number.isFinite(tempC) ? Math.round(tempC * 9 / 5 + 32) : null,
    windMph: Math.round(windKmH * 0.621371),
    windDeg: windDir,                                  // "from" direction (deg)
    weatherCode: APPLE_CONDITION_TO_WMO[condStr] ?? 0,
    sunrise: today && today.sunrise ? today.sunrise : null,
    sunset: today && today.sunset ? today.sunset : null,
  };
}

router.get('/point', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'bad_coords' });
  }
  const latKey = Number(lat.toFixed(WK_COORD_DP));
  const lngKey = Number(lng.toFixed(WK_COORD_DP));

  // 1. Shared cache (best-effort — a miss/err just means a fresh fetch).
  try {
    const { rows } = await pool.query(
      'SELECT payload, fetched_at FROM weather_cache WHERE lat_key = $1 AND lng_key = $2',
      [latKey, lngKey],
    );
    if (rows[0] && (Date.now() - new Date(rows[0].fetched_at).getTime()) < WK_CACHE_TTL_MS) {
      return res.json({ ...rows[0].payload, fetchedAt: rows[0].fetched_at, cached: true });
    }
  } catch (e) {
    console.error('[weather/point] cache read failed:', e && e.message);
  }

  // 2. Fresh fetch.
  let data;
  try {
    data = await fetchWeatherKitPoint(lat, lng);
  } catch (e) {
    if (e instanceof WeatherConfigError) return res.status(503).json({ error: 'weather_unconfigured' });
    console.error('[weather/point] fetch failed:', e && e.message);
    return res.status(502).json({ error: 'weather_fetch_failed' });
  }

  // 3. Write-through cache (best-effort).
  try {
    await pool.query(
      `INSERT INTO weather_cache (lat_key, lng_key, payload, fetched_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (lat_key, lng_key)
       DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()`,
      [latKey, lngKey, JSON.stringify(data)],
    );
  } catch (e) {
    console.error('[weather/point] cache write failed:', e && e.message);
  }

  return res.json({ ...data, fetchedAt: new Date().toISOString(), cached: false });
});

module.exports = router;
