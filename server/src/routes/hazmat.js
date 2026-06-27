'use strict';
/**
 * hazmat.js — Open Firehouse Hazmat Response Module API
 *
 * Endpoints:
 *   GET  /api/hazmat/search               — Search materials by name, UN#, or CAS
 *   GET  /api/hazmat/guide/:num           — ERG guide detail
 *   GET  /api/hazmat/material/:un         — Full material detail + isolation distances
 *   GET  /api/hazmat/placard/:code        — Placard / guide lookup by UN or NA number
 *   GET  /api/hazmat/unknown             — Unknown substance wizard data
 *   GET  /api/hazmat/pubchem/:name        — PubChem enrichment (server-side fetch)
 *   GET  /api/hazmat/incidents            — List logged incidents
 *   GET  /api/hazmat/incidents/export     — Export incidents as CSV
 *   POST /api/hazmat/incidents            — Create incident log entry
 *   PUT  /api/hazmat/incidents/:id        — Update incident (forward-only status)
 *
 * Data: ERG 2024 (PHMSA/DOT, public domain). PubChem via NIH public API.
 */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

// ── Helpers ──────────────────────────────────────────────────────────────────

const EXTERNAL_TIMEOUT_MS = 10_000; // 10 s hard cap on all external API calls

/**
 * Fetch JSON from an external URL with a hard AbortController timeout.
 * Throws on network error, timeout, or non-JSON response.
 */
async function fetchJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`External API timeout after ${EXTERNAL_TIMEOUT_MS / 1000}s: ${url}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Forward-only status lifecycle: active → contained → resolved
const STATUS_ORDER = { active: 0, contained: 1, resolved: 2 };

// ── W3.3 — zod validation on the PUBLIC (unauthenticated) surface ─────────────
const { z } = require('zod');
const validate = require('../middleware/validate');
const searchQuerySchema = z.looseObject({
  q:      z.string().max(100).optional(),
  type:   z.string().max(20).optional(),
  limit:  z.string().regex(/^\d{1,4}$/).optional(),
  offset: z.string().regex(/^\d{1,7}$/).optional(),
});
const guideParamSchema    = z.object({ num: z.string().regex(/^\d{2,3}P?$/i, 'guide number like 128 or 128P') });
const materialParamSchema = z.object({ un: z.string().regex(/^(UN|NA)?\s*\d{1,4}$/i, 'UN number like 1017') });
const placardParamSchema  = z.object({ code: z.string().regex(/^[\w. -]{1,30}$/) });
const pubchemParamSchema  = z.object({ name: z.string().min(1).max(120) });

function noCache(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
}

// ── GET /api/hazmat/search ────────────────────────────────────────────────────
// Query params: q (text), type (name|un|class|all), limit, offset
router.get('/search', validate({ query: searchQuerySchema }), async (req, res) => {
  try {
    const rawQ  = (req.query.q || '').trim();
    const type  = req.query.type || 'all';
    const limit  = Math.min(parseInt(req.query.limit  || '50'), 200);
    const offset = Math.max(parseInt(req.query.offset || '0'),  0);

    if (!rawQ) return res.json({ data: [] });

    // Strip any "UN" or "NA" prefix so "UN1017" → "1017"
    const q = rawQ.replace(/^(UN|NA)\s*/i, '').trim();

    let sql, params;

    let countSql, countParams;

    if (type === 'un') {
      sql = `
        SELECT m.*, g.title as guide_title, g.ppe_level,
               iso.small_spill_isolate_m, iso.large_spill_isolate_m,
               iso.small_spill_day_km, iso.large_spill_day_km,
               iso.small_spill_night_km, iso.large_spill_night_km
        FROM fs_hazmat_materials m
        LEFT JOIN fs_hazmat_guides g ON g.guide_number = m.guide_number
        LEFT JOIN fs_hazmat_isolation_distances iso ON iso.un_number = m.un_number
        WHERE m.un_number ILIKE $1
        ORDER BY
          CASE WHEN m.un_number = $2 THEN 0 ELSE 1 END,
          m.is_tih DESC, m.polymerization_hazard DESC, m.is_water_reactive DESC, m.un_number, m.name
        LIMIT $3 OFFSET $4
      `;
      params = [q + '%', q, limit, offset];
      countSql    = `SELECT COUNT(*) FROM fs_hazmat_materials WHERE un_number ILIKE $1`;
      countParams = [q + '%'];
    } else if (type === 'class') {
      sql = `
        SELECT m.*, g.title as guide_title, g.ppe_level,
               iso.small_spill_isolate_m, iso.large_spill_isolate_m,
               iso.small_spill_day_km, iso.large_spill_day_km,
               iso.small_spill_night_km, iso.large_spill_night_km
        FROM fs_hazmat_materials m
        LEFT JOIN fs_hazmat_guides g ON g.guide_number = m.guide_number
        LEFT JOIN fs_hazmat_isolation_distances iso ON iso.un_number = m.un_number
        WHERE m.hazard_class ILIKE $1
        ORDER BY m.is_tih DESC, m.polymerization_hazard DESC, m.is_water_reactive DESC, m.name
        LIMIT $2 OFFSET $3
      `;
      params = [q + '%', limit, offset];
      countSql    = `SELECT COUNT(*) FROM fs_hazmat_materials WHERE hazard_class ILIKE $1`;
      countParams = [q + '%'];
    } else {
      sql = `
        SELECT m.*, g.title as guide_title, g.ppe_level,
               iso.small_spill_isolate_m, iso.large_spill_isolate_m,
               iso.small_spill_day_km, iso.large_spill_day_km,
               iso.small_spill_night_km, iso.large_spill_night_km
        FROM fs_hazmat_materials m
        LEFT JOIN fs_hazmat_guides g ON g.guide_number = m.guide_number
        LEFT JOIN fs_hazmat_isolation_distances iso ON iso.un_number = m.un_number
        WHERE m.name ILIKE $1
           OR m.un_number ILIKE $2
           OR m.un_number = $3
           OR m.hazard_class ILIKE $2
           OR m.cas_number ILIKE $2
           OR array_to_string(m.synonyms, '|') ILIKE $1
        ORDER BY
          CASE WHEN m.name ILIKE $4       THEN 0
               WHEN m.name ILIKE $1       THEN 1
               WHEN m.un_number = $3      THEN 2
               WHEN m.hazard_class ILIKE $2 THEN 3
               ELSE 4 END,
          m.is_tih DESC, m.polymerization_hazard DESC, m.is_water_reactive DESC, m.name
        LIMIT $5 OFFSET $6
      `;
      params = ['%' + q + '%', q + '%', q, q + '%', limit, offset];
      countSql    = `SELECT COUNT(*) FROM fs_hazmat_materials WHERE name ILIKE $1 OR un_number ILIKE $2 OR un_number = $3 OR hazard_class ILIKE $2 OR cas_number ILIKE $2 OR array_to_string(synonyms, '|') ILIKE $1`;
      countParams = ['%' + q + '%', q + '%', q];
    }

    const [r, countR] = await Promise.all([
      pool.query(sql, params),
      pool.query(countSql, countParams),
    ]);
    const total = parseInt(countR.rows[0].count);
    noCache(res);
    res.json({ data: r.rows, total, limit, offset, has_more: offset + r.rows.length < total });
  } catch (err) {
    console.error('hazmat search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/hazmat/guide/:num ────────────────────────────────────────────────
router.get('/guide/:num', validate({ params: guideParamSchema }), async (req, res) => {
  try {
    const guideNum = parseInt(req.params.num);
    if (isNaN(guideNum)) return res.status(400).json({ error: 'Invalid guide number' });

    const guideR = await pool.query(
      'SELECT * FROM fs_hazmat_guides WHERE guide_number = $1',
      [guideNum]
    );
    if (!guideR.rows.length) return res.status(404).json({ error: 'Guide not found' });

    // Also fetch materials that use this guide
    const matsR = await pool.query(
      `SELECT id, name, un_number, hazard_class, is_tih, is_water_reactive,
              is_pyrophoric, polymerization_hazard, physical_state
       FROM fs_hazmat_materials WHERE guide_number = $1 ORDER BY name LIMIT 100`,
      [guideNum]
    );

    noCache(res);
    res.json({ data: { guide: guideR.rows[0], materials: matsR.rows } });
  } catch (err) {
    console.error('hazmat guide error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/hazmat/material/:un ──────────────────────────────────────────────
router.get('/material/:un', validate({ params: materialParamSchema }), async (req, res) => {
  try {
    // Strip common prefixes (UN, NA) and pad to 4 digits so "UN1017" → "1017"
    const raw = req.params.un.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const un  = raw.replace(/^(UN|NA)/, '').padStart(4, '0');

    const matR = await pool.query(
      `SELECT m.*, g.title as guide_title, g.hazard_class as guide_hazard_class,
              g.fire_explosion, g.health_hazards, g.public_safety,
              g.protective_clothing, g.evacuation, g.fire_response,
              g.spill_response, g.first_aid, g.ppe_level,
              g.special_hazards, g.needs_proximity_suit
       FROM fs_hazmat_materials m
       LEFT JOIN fs_hazmat_guides g ON g.guide_number = m.guide_number
       WHERE m.un_number = $1
       ORDER BY m.name
       LIMIT 20`,
      [un]
    );

    if (!matR.rows.length) {
      // Try with leading-zero padding (e.g. "17" → "0017")
      const padded = un.replace(/^\d+$/, m => m.padStart(4, '0'));
      const partialR = await pool.query(
        `SELECT m.*, g.title as guide_title, g.ppe_level
         FROM fs_hazmat_materials m
         LEFT JOIN fs_hazmat_guides g ON g.guide_number = m.guide_number
         WHERE m.un_number = $1 OR m.un_number ILIKE $2
         ORDER BY m.name LIMIT 20`,
        [padded, padded + '%']
      );
      if (!partialR.rows.length) return res.status(404).json({ error: 'Material not found' });
      noCache(res);
      return res.json({ data: partialR.rows, isolation: [] });
    }

    // Fetch isolation distances (Table 1) and Table 3 container-specific distances
    const [isoR, t3R] = await Promise.all([
      pool.query(
        'SELECT * FROM fs_hazmat_isolation_distances WHERE un_number = $1',
        [un]
      ),
      pool.query(
        `SELECT id, un_number, container_type, isolate_m, isolate_ft,
                day_low_km, day_mod_km, day_high_km,
                night_low_km, night_mod_km, night_high_km
           FROM fs_hazmat_table3_distances
           WHERE un_number = $1
           ORDER BY isolate_m DESC`,
        [un]
      ),
    ]);

    noCache(res);
    res.json({ data: matR.rows, isolation: isoR.rows, table3: t3R.rows });
  } catch (err) {
    console.error('hazmat material error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/hazmat/placard/:code ─────────────────────────────────────────────
// Accepts UN number (4 digit) or NA number or placard class text
router.get('/placard/:code', validate({ params: placardParamSchema }), async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    // If purely numeric (UN/NA), treat as UN number lookup
    if (/^\d+$/.test(code)) {
      const r = await pool.query(
        `SELECT m.name, m.un_number, m.guide_number, m.hazard_class,
                m.is_tih, m.is_water_reactive, m.polymerization_hazard, m.physical_state,
                g.title as guide_title, g.ppe_level
         FROM fs_hazmat_materials m
         LEFT JOIN fs_hazmat_guides g ON g.guide_number = m.guide_number
         WHERE m.un_number = $1
         ORDER BY m.name LIMIT 10`,
        [code.padStart(4, '0')]
      );
      noCache(res);
      return res.json({ type: 'un_number', data: r.rows });
    }

    // Class / placard keyword search
    const classMap = {
      'CLASS1': '1', 'EXPLOSIVE': '1',
      'CLASS2': '2', 'GAS': '2', 'FLAMMABLEGAS': '2.1', 'NONFLAMMABLEGAS': '2.2', 'POISONGAS': '2.3',
      'CLASS3': '3', 'FLAMMABLE': '3', 'FLAMMABLELIQUID': '3',
      'CLASS4': '4', 'FLAMMABLESOLID': '4.1',
      'CLASS5': '5', 'OXIDIZER': '5.1', 'ORGANICPEROXIDE': '5.2',
      'CLASS6': '6', 'POISON': '6.1', 'TOXIC': '6.1', 'INFECTIOUSSUBSTANCE': '6.2',
      'CLASS7': '7', 'RADIOACTIVE': '7',
      'CLASS8': '8', 'CORROSIVE': '8',
      'CLASS9': '9', 'MISCELLANEOUS': '9',
      'DANGEROUSGOODS': '9',
    };

    const normalized = code.replace(/\s/g, '').toUpperCase();
    const hazClass = classMap[normalized];

    if (hazClass) {
      const r = await pool.query(
        `SELECT m.name, m.un_number, m.guide_number, m.hazard_class,
                m.is_tih, m.is_water_reactive, m.polymerization_hazard, g.title as guide_title
         FROM fs_hazmat_materials m
         LEFT JOIN fs_hazmat_guides g ON g.guide_number = m.guide_number
         WHERE m.hazard_class LIKE $1
         ORDER BY m.is_tih DESC, m.polymerization_hazard DESC, m.name
         LIMIT 30`,
        [hazClass + '%']
      );
      noCache(res);
      return res.json({ type: 'hazard_class', class: hazClass, data: r.rows });
    }

    // Fall back to name search
    const r = await pool.query(
      `SELECT m.name, m.un_number, m.guide_number, m.hazard_class,
              m.is_tih, m.is_water_reactive, m.polymerization_hazard, g.title as guide_title
       FROM fs_hazmat_materials m
       LEFT JOIN fs_hazmat_guides g ON g.guide_number = m.guide_number
       WHERE m.name ILIKE $1 OR m.hazard_class ILIKE $1
       ORDER BY m.is_tih DESC, m.polymerization_hazard DESC, m.name
       LIMIT 20`,
      ['%' + req.params.code + '%']
    );
    noCache(res);
    res.json({ type: 'name', data: r.rows });
  } catch (err) {
    console.error('placard lookup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/hazmat/unknown ───────────────────────────────────────────────────
// Returns wizard decision data: physical states, hazard classes, above/below line criteria
// Query params allow progressive filtering:
//   physical_state, color, odor, is_flammable, is_corrosive, is_reactive_water,
//   has_pressure, vapor_visible, fire_present, multiple_hazards
router.get('/unknown',  async (req, res) => {
  try {
    const {
      physical_state,
      color,
      odor,
      is_flammable,
      is_corrosive,
      is_reactive_water,
      has_pressure,
      vapor_visible,
      fire_present,
      multiple_hazards,
    } = req.query;

    const conditions = [];
    const params     = [];
    let   idx        = 1;

    if (physical_state) {
      conditions.push(`m.physical_state ILIKE $${idx++}`);
      params.push(physical_state);
    }
    if (color && color !== 'unknown') {
      conditions.push(`(m.color ILIKE $${idx} OR m.color IS NULL)`);
      params.push('%' + color + '%');
      idx++;
    }
    if (odor && odor !== 'unknown') {
      conditions.push(`(m.odor ILIKE $${idx} OR m.odor IS NULL)`);
      params.push('%' + odor + '%');
      idx++;
    }
    if (is_flammable === 'true') {
      conditions.push(`m.hazard_class IN ('3','2.1','4.1','4.2','4.3')`);
    }
    if (is_corrosive === 'true') {
      conditions.push(`m.hazard_class LIKE '8%'`);
    }
    if (is_reactive_water === 'true') {
      conditions.push(`m.is_water_reactive = true`);
    }
    if (multiple_hazards === 'true') {
      conditions.push(`(m.is_tih = true OR m.polymerization_hazard = true OR m.is_water_reactive = true)`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const sql = `
      SELECT m.name, m.un_number, m.guide_number, m.hazard_class,
             m.is_tih, m.is_water_reactive, m.polymerization_hazard, m.is_pyrophoric,
             m.physical_state, m.color, m.odor,
             m.flash_point_c, m.idlh_ppm,
             g.title as guide_title, g.ppe_level, g.health_hazards
      FROM fs_hazmat_materials m
      LEFT JOIN fs_hazmat_guides g ON g.guide_number = m.guide_number
      ${where}
      ORDER BY m.is_tih DESC, m.polymerization_hazard DESC, m.name
      LIMIT 50
    `;

    const r = await pool.query(sql, params);

    // High-danger flag: derived from objective ERG fields. True if the filters
    // or any match indicate a TIH / water-reactive / multi-hazard situation.
    const highDanger = (multiple_hazards === 'true') ||
                       (is_reactive_water === 'true') ||
                       (vapor_visible === 'true' && fire_present === 'true') ||
                       r.rows.some(row => row.is_tih || row.polymerization_hazard);

    noCache(res);
    res.json({
      data: r.rows,
      high_danger: highDanger,
      recommendation: highDanger
        ? 'HIGH DANGER — Maximum PPE, large isolation zone, specialist team. Confirm the substance and read the response guide before committing crews.'
        : 'Single-hazard profile likely. Follow the ERG guide and standard protocols. Confirm the substance once a placard/shipping papers are available.',
      match_count: r.rows.length,
    });
  } catch (err) {
    console.error('unknown substance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/hazmat/pubchem/:name ─────────────────────────────────────────────
// Fetches supplemental chemical data from PubChem (NIH free public API)
router.get('/pubchem/:name', validate({ params: pubchemParamSchema }), async (req, res) => {
  try {
    const name = encodeURIComponent(req.params.name.trim());

    // Step 1: Get CID — timeout enforced by fetchJSON
    const cidUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${name}/cids/JSON`;
    let cidData;
    try {
      cidData = await fetchJSON(cidUrl);
    } catch {
      return res.status(404).json({ error: 'Substance not found in PubChem' });
    }

    const cid = cidData?.IdentifierList?.CID?.[0];
    if (!cid) return res.status(404).json({ error: 'No PubChem CID found' });

    // Step 2: Fetch properties + GHS concurrently; GHS failure is non-fatal
    const propsUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/MolecularFormula,MolecularWeight,IUPACName,IsomericSMILES,InChIKey/JSON`;
    const ghsUrl   = `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON?heading=GHS+Classification`;

    const [propsResult, ghsResult] = await Promise.allSettled([
      fetchJSON(propsUrl),
      fetchJSON(ghsUrl),
    ]);

    const propsData = propsResult.status === 'fulfilled' ? propsResult.value : null;
    const ghsData   = ghsResult.status   === 'fulfilled' ? ghsResult.value   : null;

    // Safe property extraction — default to null if structure is unexpected
    let props = {};
    try { props = propsData?.PropertyTable?.Properties?.[0] ?? {}; } catch { props = {}; }

    // Safe GHS hazard statement + pictogram extraction with full null-guard at each level
    const ghsHazards   = [];
    const ghsPictograms = [];
    try {
      const sections = Array.isArray(ghsData?.Record?.Section) ? ghsData.Record.Section : [];
      for (const sec of sections) {
        const subSections = Array.isArray(sec?.Section) ? sec.Section : [];
        for (const sub of subSections) {
          if (!sub || typeof sub !== 'object') continue;

          if (sub.TOCHeading === 'GHS Hazard Statements') {
            const infos = Array.isArray(sub.Information) ? sub.Information : [];
            for (const info of infos) {
              const vals = Array.isArray(info?.Value?.StringWithMarkup) ? info.Value.StringWithMarkup : [];
              for (const val of vals) {
                if (val && typeof val.String === 'string') ghsHazards.push(val.String);
              }
            }
          }

          if (sub.TOCHeading === 'Pictogram(s)') {
            const infos = Array.isArray(sub.Information) ? sub.Information : [];
            for (const info of infos) {
              const vals = Array.isArray(info?.Value?.StringWithMarkup) ? info.Value.StringWithMarkup : [];
              for (const val of vals) {
                const markups = Array.isArray(val?.Markup) ? val.Markup : [];
                for (const markup of markups) {
                  if (markup && typeof markup.URL === 'string') ghsPictograms.push(markup.URL);
                }
              }
            }
          }
        }
      }
    } catch (parseErr) {
      // GHS parse failed entirely — return partial data rather than 500
      console.warn('pubchem GHS parse warning:', parseErr.message);
    }

    noCache(res);
    res.json({
      data: {
        cid,
        molecular_formula: props.MolecularFormula  ?? null,
        molecular_weight:  props.MolecularWeight   ?? null,
        iupac_name:        props.IUPACName         ?? null,
        smiles:            props.IsomericSMILES    ?? null,
        inchi_key:         props.InChIKey          ?? null,
        ghs_hazards:       ghsHazards.slice(0, 10),
        ghs_pictograms:    ghsPictograms.slice(0, 8),
        pubchem_url:       `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
      }
    });
  } catch (err) {
    console.error('pubchem error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/hazmat/incidents ─────────────────────────────────────────────────
router.get('/incidents', requireAuth, async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    const stationId = req.user.department_id ?? req.user.station_id;

    let where = 'WHERE hi.department_id = $1';
    const params = [stationId];
    let idx = 2;

    if (status) {
      where += ` AND hi.status = $${idx++}`;
      params.push(status);
    }

    const sql = `
      SELECT hi.*,
             u.name as ic_name
      FROM fs_hazmat_incidents hi
      LEFT JOIN users u ON u.id = hi.ic_user_id
      ${where}
      ORDER BY hi.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    params.push(parseInt(limit), parseInt(offset));

    const r = await pool.query(sql, params);
    noCache(res);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('hazmat incidents GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/hazmat/incidents ────────────────────────────────────────────────
router.post('/incidents', requireAuth, async (req, res) => {
  try {
    const stationId = req.user.department_id ?? req.user.station_id;
    const {
      material_name, un_number, guide_number, hazard_class,
      location_address, location_lat, location_lon,
      quantity_estimate, container_type, release_type,
      wind_direction, wind_speed_mph, temperature_f,
      ic_user_id, responders_count, evacuation_distance_m,
      notes, status,
    } = req.body;

    // Coerce empty strings to null for integer/numeric columns
    const toInt  = v => (v === '' || v === null || v === undefined) ? null : parseInt(v, 10);
    const toFloat = v => (v === '' || v === null || v === undefined) ? null : parseFloat(v);

    // W2.5 audit (2026-06-10): ic_user_id is client-supplied — only accept it
    // if it references a user in the caller's own station; otherwise fall back
    // to the caller themselves.
    let icUserId = toInt(ic_user_id) || req.user.id;
    if (icUserId !== req.user.id) {
      const own = await pool.query('SELECT id FROM users WHERE id = $1 AND station_id = $2', [icUserId, stationId]);
      if (!own.rows.length) icUserId = req.user.id;
    }

    const r = await pool.query(
      `INSERT INTO fs_hazmat_incidents
         (station_id, material_name, un_number, guide_number, hazard_class,
          location_address, location_lat, location_lon, quantity_estimate,
          container_type, release_type, wind_direction, wind_speed_mph,
          temperature_f, ic_user_id, responders_count, evacuation_distance_m,
          notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [stationId, material_name, un_number || null, guide_number || null, hazard_class || null,
       location_address || null, toFloat(location_lat), toFloat(location_lon), quantity_estimate || null,
       container_type || null, release_type || null, wind_direction || null, toFloat(wind_speed_mph),
       toFloat(temperature_f), icUserId, toInt(responders_count),
       toFloat(evacuation_distance_m), notes || null, status || 'active']
    );

    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error('hazmat incident POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/hazmat/incidents/export ─────────────────────────────────────────
// Returns all station incidents as CSV for after-action reports / regulatory filings.
// Query params: from (ISO date), to (ISO date)
router.get('/incidents/export', requireAuth, async (req, res) => {
  try {
    const stationId = req.user.department_id ?? req.user.station_id;
    const { from, to } = req.query;

    const conditions = ['hi.department_id = $1'];
    const params = [stationId];
    let idx = 2;
    if (from) { conditions.push(`hi.created_at >= $${idx++}`); params.push(from); }
    if (to)   { conditions.push(`hi.created_at <= $${idx++}`); params.push(to);   }

    const sql = `
      SELECT hi.id, hi.status, hi.material_name, hi.un_number, hi.guide_number,
             hi.hazard_class, hi.location_address, hi.quantity_estimate,
             hi.container_type, hi.release_type, hi.wind_direction,
             hi.wind_speed_mph, hi.temperature_f, hi.responders_count,
             hi.evacuation_distance_m, hi.notes,
             u.name as ic_name,
             hi.created_at, hi.updated_at, hi.resolved_at
      FROM fs_hazmat_incidents hi
      LEFT JOIN users u ON u.id = hi.ic_user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY hi.created_at DESC
    `;

    const r = await pool.query(sql, params);

    // Build CSV
    const cols = [
      'id','status','material_name','un_number','guide_number','hazard_class',
      'location_address','quantity_estimate','container_type','release_type',
      'wind_direction','wind_speed_mph','temperature_f','responders_count',
      'evacuation_distance_m','notes','ic_name','created_at','updated_at','resolved_at',
    ];
    const escape = v => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;
    const lines  = [cols.join(','), ...r.rows.map(row => cols.map(c => escape(row[c])).join(','))];

    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', `attachment; filename="hazmat_incidents_${Date.now()}.csv"`);
    res.send(lines.join('\r\n'));
  } catch (err) {
    console.error('hazmat incident export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/hazmat/incidents/:id ─────────────────────────────────────────────
router.put('/incidents/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const stationId = req.user.department_id ?? req.user.station_id;
    const userId    = req.user.id;

    // Fetch current incident to validate status transition
    const current = await pool.query(
      'SELECT * FROM fs_hazmat_incidents WHERE id = $1 AND department_id = $2',
      [id, stationId]
    );
    if (!current.rows.length) return res.status(404).json({ error: 'Incident not found' });
    const currentIncident = current.rows[0];

    const allowed = [
      'material_name','un_number','guide_number','hazard_class',
      'location_address','quantity_estimate','container_type','release_type',
      'wind_direction','wind_speed_mph','temperature_f','responders_count',
      'evacuation_distance_m','notes','status','resolved_at',
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields to update' });

    // Enforce forward-only status lifecycle: active → contained → resolved
    if (updates.status) {
      const currentOrder = STATUS_ORDER[currentIncident.status] ?? 0;
      const newOrder     = STATUS_ORDER[updates.status];
      if (newOrder === undefined) {
        return res.status(400).json({ error: `Invalid status: '${updates.status}'. Must be active, contained, or resolved.` });
      }
      if (newOrder < currentOrder) {
        return res.status(409).json({
          error: `Status transition not allowed: '${currentIncident.status}' → '${updates.status}'. Incidents can only move forward (active → contained → resolved). Open a new incident to re-activate.`,
        });
      }
    }

    // Auto-set resolved_at when closing
    if (updates.status === 'resolved' && !updates.resolved_at) {
      updates.resolved_at = new Date().toISOString();
    }

    const sets = Object.keys(updates).map((k, i) => `"${k}" = $${i + 3}`).join(', ');
    const vals = Object.values(updates);

    const r = await pool.query(
      `UPDATE fs_hazmat_incidents SET ${sets}, updated_at = NOW()
       WHERE id = $1 AND department_id = $2 RETURNING *`,
      [id, stationId, ...vals]
    );

    if (!r.rows.length) return res.status(404).json({ error: 'Incident not found' });

    // Write audit log entries for each changed field — single bulk INSERT
    try {
      const auditEntries = Object.entries(updates).map(([field, newVal]) => [
        parseInt(id),
        field,
        currentIncident[field] != null ? String(currentIncident[field]) : null,
        newVal          != null ? String(newVal)                    : null,
        userId,
      ]);
      if (auditEntries.length > 0) {
        const placeholders = auditEntries
          .map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`)
          .join(', ');
        const flatVals = auditEntries.flat();
        await pool.query(
          `INSERT INTO fs_hazmat_incident_audit
             (incident_id, field_changed, old_value, new_value, changed_by)
           VALUES ${placeholders}`,
          flatVals
        );
      }
    } catch (auditErr) {
      // Audit failure is non-fatal — log but don't break the response
      console.warn('hazmat audit log warning:', auditErr.message);
    }

    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('hazmat incident PUT error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/hazmat/stats ─────────────────────────────────────────────────────
// Shape aligned to the mobile/FireHazmat getStats(): materials/guides/isolations/
// table3 (+ legacy *_count aliases kept for any older caller).
router.get('/stats', async (req, res) => {
  try {
    const [matR, guideR, isoR, t3R, tihR] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM fs_hazmat_materials'),
      pool.query('SELECT COUNT(*) FROM fs_hazmat_guides'),
      pool.query('SELECT COUNT(*) FROM fs_hazmat_isolation_distances'),
      pool.query('SELECT COUNT(*) FROM fs_hazmat_table3_distances'),
      pool.query('SELECT COUNT(*) FROM fs_hazmat_materials WHERE is_tih = true'),
    ]);
    noCache(res);
    res.json({
      materials:  parseInt(matR.rows[0].count),
      guides:     parseInt(guideR.rows[0].count),
      isolations: parseInt(isoR.rows[0].count),
      table3:     parseInt(t3R.rows[0].count),
      tih_count:  parseInt(tihR.rows[0].count),
      // legacy aliases
      material_count: parseInt(matR.rows[0].count),
      guide_count:    parseInt(guideR.rows[0].count),
    });
  } catch (err) {
    console.error('hazmat stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/hazmat/guides ────────────────────────────────────────────────────
// All ERG guides (number + title), ascending — powers the guide-number quick
// buttons on the web Search screen (mirrors mobile getGuides()).
router.get('/guides', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT guide_number, title FROM fs_hazmat_guides ORDER BY guide_number'
    );
    noCache(res);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('hazmat guides list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/hazmat/class-counts ──────────────────────────────────────────────
// Material count per DOT hazard class — powers the Placard grid badges
// (mirrors mobile getClassCounts()).
router.get('/class-counts', async (req, res) => {
  try {
    const classes = ['1','2.1','2.2','2.3','3','4.1','4.2','4.3','5.1','5.2','6.1','6.2','7','8','9'];
    const r = await pool.query(
      `SELECT hazard_class, COUNT(*)::int AS cnt FROM fs_hazmat_materials
       WHERE hazard_class IS NOT NULL GROUP BY hazard_class`
    );
    const counts = {};
    for (const cls of classes) counts[cls] = 0;
    for (const row of r.rows) {
      // Bucket sub-divisions (e.g. '1.1D' → '1', '2.1' stays '2.1') into the
      // grid's class keys, matching the mobile LIKE-prefix counting.
      const hc = String(row.hazard_class);
      for (const cls of classes) {
        if (hc === cls || hc.startsWith(cls)) { counts[cls] += row.cnt; break; }
      }
    }
    noCache(res);
    res.json({ data: counts });
  } catch (err) {
    console.error('hazmat class-counts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/hazmat/material-by-id/:id ────────────────────────────────────────
// Stable-key lookup (UN numbers aren't unique and some materials have none) —
// powers deep links into the web Material detail (mirrors mobile getMaterialById()).
router.get('/material-by-id/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const matR = await pool.query(
      `SELECT m.*, g.title as guide_title, g.hazard_class as guide_hazard_class,
              g.fire_explosion, g.health_hazards, g.public_safety,
              g.protective_clothing, g.evacuation, g.fire_response,
              g.spill_response, g.first_aid, g.ppe_level,
              g.special_hazards, g.needs_proximity_suit
       FROM fs_hazmat_materials m
       LEFT JOIN fs_hazmat_guides g ON g.guide_number = m.guide_number
       WHERE m.id = $1 LIMIT 1`,
      [id]
    );
    if (!matR.rows.length) return res.status(404).json({ error: 'Material not found' });

    const un = matR.rows[0].un_number;
    let isolation = [], table3 = [];
    if (un) {
      [isolation, table3] = await Promise.all([
        pool.query('SELECT * FROM fs_hazmat_isolation_distances WHERE un_number = $1', [un]).then(r => r.rows),
        pool.query(`SELECT * FROM fs_hazmat_table3_distances WHERE un_number = $1 ORDER BY isolate_m DESC`, [un]).then(r => r.rows),
      ]);
    }
    noCache(res);
    res.json({ data: matR.rows[0], isolation, table3 });
  } catch (err) {
    console.error('hazmat material-by-id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
