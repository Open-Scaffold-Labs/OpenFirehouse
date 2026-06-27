// api.js — Hazmat reference data access for the web (mirrors mobile db.ts).
//
// The mobile reference reads an offline SQLite DB; the web reads the SAME
// enriched ERG data from the server-side reference tables via the public,
// read-only /api/hazmat endpoints (data stays server-side/private — never
// bundled to the browser). Function names + return shapes mirror the mobile
// db.ts so the ported screens/components run unchanged.
//
// normalizeRow rebuilds the nested `guide` and `isolation` objects from the
// flat joined columns (the mobile normalizeRow did the same off SQLite rows),
// and Number()-coerces Postgres NUMERIC values (which arrive as strings).

import { api } from '../utils/api';

const NUMERIC_FIELDS = [
  'flash_point_c', 'boiling_point_c', 'idlh_ppm', 'tlv_twa_ppm',
  'stel_ppm', 'ceiling_ppm', 'idlh_mg_m3', 'vapor_density',
  'vapor_pressure_mmhg', 'vapor_pressure_temp_c', 'specific_gravity',
  'melting_point_c', 'autoignition_temp_c', 'lel_pct', 'uel_pct',
  'molecular_weight_g_mol',
];

const ISO_NUMERIC = [
  'small_spill_isolate_m', 'small_spill_day_km', 'small_spill_night_km',
  'large_spill_isolate_m', 'large_spill_day_km', 'large_spill_night_km',
  'fire_isolate_m',
];

const num = v => (v === null || v === undefined || v === '') ? null : Number(v);

function normalizeRow(row) {
  if (!row) return row;
  const r = { ...row };
  for (const f of NUMERIC_FIELDS) if (f in r) r[f] = num(r[f]);

  // Booleans arrive as true/false from pg; arrays (synonyms, ghs_*,
  // incompatibilities) arrive as JS arrays; data_sources as a JS object.

  if (r.guide_title) {
    r.guide = {
      guide_number:        r.guide_number,
      title:               r.guide_title,
      hazard_class:        r.guide_hazard_class ?? r.hazard_class,
      fire_explosion:      r.fire_explosion      ?? null,
      health_hazards:      r.health_hazards      ?? null,
      public_safety:       r.public_safety       ?? null,
      protective_clothing: r.protective_clothing ?? null,
      evacuation:          r.evacuation          ?? null,
      fire_response:       r.fire_response        ?? null,
      spill_response:      r.spill_response       ?? null,
      first_aid:           r.first_aid            ?? null,
      ppe_level:           r.ppe_level            ?? null,
      special_hazards:     r.special_hazards      ?? null,
      needs_proximity_suit: !!r.needs_proximity_suit,
    };
  }

  if (r.small_spill_isolate_m != null || r.large_spill_isolate_m != null) {
    r.isolation = {
      un_number:             r.un_number,
      name:                  r.name,
      guide_number:          r.guide_number,
      small_spill_isolate_m: num(r.small_spill_isolate_m),
      small_spill_day_km:    num(r.small_spill_day_km),
      small_spill_night_km:  num(r.small_spill_night_km),
      large_spill_isolate_m: num(r.large_spill_isolate_m),
      large_spill_day_km:    num(r.large_spill_day_km),
      large_spill_night_km:  num(r.large_spill_night_km),
      fire_isolate_m:        num(r.fire_isolate_m),
    };
  }
  return r;
}

function normalizeIso(iso) {
  if (!iso) return null;
  const r = { ...iso };
  for (const f of ISO_NUMERIC) if (f in r) r[f] = num(r[f]);
  return r;
}

// ─── SEARCH ───────────────────────────────────────────────────────────────
export async function searchMaterials(query, limit = 50, offset = 0) {
  const q = (query || '').trim();
  if (!q) return { results: [], total: 0 };
  const res = await api.get(
    `/api/hazmat/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`
  );
  const data = res.data || [];
  return { results: data.map(normalizeRow), total: res.total ?? data.length };
}

// ─── MATERIAL BY UN ─────────────────────────────────────────────────────────
export async function getMaterialByUN(unNumber) {
  const res = await api.get(`/api/hazmat/material/${encodeURIComponent(unNumber)}`);
  return {
    materials: (res.data || []).map(normalizeRow),
    isolation: normalizeIso((res.isolation || [])[0] ?? null),
    table3:    res.table3 || [],
  };
}

// ─── MATERIAL BY ID (stable deep-link key) ───────────────────────────────────
export async function getMaterialById(id) {
  const res = await api.get(`/api/hazmat/material-by-id/${id}`);
  const mat = res.data ? normalizeRow(res.data) : null;
  if (mat) {
    mat.isolation = normalizeIso((res.isolation || [])[0] ?? null);
    mat.table3 = res.table3 || [];
  }
  return mat;
}

// ─── GUIDE ──────────────────────────────────────────────────────────────────
export async function getGuide(guideNumber) {
  const res = await api.get(`/api/hazmat/guide/${guideNumber}`);
  const d = res.data || {};
  return { guide: d.guide ?? null, materials: (d.materials || []).map(normalizeRow) };
}

// All ERG guides (number + title), ascending.
export async function getGuides() {
  const res = await api.get('/api/hazmat/guides');
  return res.data || [];
}

// ─── MATERIALS BY CLASS ──────────────────────────────────────────────────────
export async function getMaterialsByClass(hazardClass, limit = 100) {
  const res = await api.get(
    `/api/hazmat/search?type=class&q=${encodeURIComponent(hazardClass)}&limit=${limit}`
  );
  return (res.data || []).map(normalizeRow);
}

// ─── CLASS COUNTS (Placard grid) ─────────────────────────────────────────────
export async function getClassCounts() {
  const res = await api.get('/api/hazmat/class-counts');
  return res.data || {};
}

// ─── STATS ────────────────────────────────────────────────────────────────
export async function getStats() {
  return api.get('/api/hazmat/stats');
}
