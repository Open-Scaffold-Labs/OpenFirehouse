'use strict';
/**
 * Hydrant Import — ArcGIS Feature Service + CSV
 *
 * POST /api/hydrants/import/preview  — validate + map fields, return sample rows (no DB write)
 * POST /api/hydrants/import/commit   — write validated rows to DB in a transaction
 */
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const https    = require('https');
const http     = require('http');
const url      = require('url');
const { pool } = require('../db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── SSRF guard ────────────────────────────────────────────────────────────

const ALLOWED_ARCGIS_HOSTNAMES = [
  /^.+\.arcgis\.com$/,
  /^.+\.esri\.com$/,
  /^.+\.maps\.arcgis\.com$/,
];

function validateArcgisUrl(raw) {
  let parsed;
  try { parsed = new url.URL(raw); } catch { return { ok: false, reason: 'Invalid URL' }; }
  if (!['https:', 'http:'].includes(parsed.protocol)) return { ok: false, reason: 'Only http/https allowed' };
  // Block private IP ranges
  const host = parsed.hostname;
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host)) {
    return { ok: false, reason: 'Private/internal addresses not allowed' };
  }
  const allowed = ALLOWED_ARCGIS_HOSTNAMES.some(re => re.test(host));
  if (!allowed) {
    return { ok: false, reason: `Host not on ArcGIS allowlist: ${host}` };
  }
  return { ok: true, parsed };
}

// ─── Fetch ArcGIS feature service (paginated) ──────────────────────────────

async function fetchArcgisFeatures(serviceUrl) {
  const base = serviceUrl.replace(/\/+$/, '');
  let offset = 0;
  const PAGE  = 1000;
  let allFeatures = [];

  while (true) {
    const queryUrl = `${base}/query?where=1%3D1&outFields=*&outSR=4326&f=json&resultOffset=${offset}&resultRecordCount=${PAGE}`;
    const data = await fetchJson(queryUrl);
    if (!data.features || !Array.isArray(data.features)) {
      throw new Error(data.error?.message || 'ArcGIS returned no features array');
    }
    allFeatures = allFeatures.concat(data.features);
    if (data.features.length < PAGE || !data.exceededTransferLimit) break;
    offset += PAGE;
    if (offset >= 5000) break; // hard cap: 5k hydrants per import
  }
  return allFeatures;
}

function fetchJson(rawUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(rawUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    mod.get(rawUrl, { timeout: 20000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Invalid JSON from ArcGIS')); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('ArcGIS request timed out')));
  });
}

// ─── Field auto-mapper ─────────────────────────────────────────────────────

// Maps GIS attribute names → hydrant field names (case-insensitive partial match)
const FIELD_MAP = [
  { target: 'hydrantNumber',      aliases: ['hydrant_id','hydrant_num','hydrant_number','hyd_num','facilityid','objectid','id'] },
  { target: 'streetAddress',      aliases: ['address','street_address','street','location','site_address','fulladdress'] },
  { target: 'intersection',       aliases: ['intersection','cross_street','near_street','cross'] },
  { target: 'city',               aliases: ['city','municipality','city_name','muni'] },
  { target: 'state',              aliases: ['state','state_abbr','st'] },
  { target: 'zip',                aliases: ['zip','zipcode','zip_code','postal_code'] },
  { target: 'type',               aliases: ['type','hydrant_type','barrel_type','hyd_type'] },
  { target: 'manufacturer',       aliases: ['manufacturer','mfr','maker','brand'] },
  { target: 'model',              aliases: ['model','model_number','mod'] },
  { target: 'yearInstalled',      aliases: ['year_installed','install_year','year','installed'] },
  { target: 'mainSize',           aliases: ['main_size','pipe_size','mainsize','main_diameter'] },
  { target: 'outletSize',         aliases: ['outlet_size','nozzle_size','steamer_size'] },
  { target: 'status',             aliases: ['status','condition','hyd_status'] },
  { target: 'flowRate',           aliases: ['flow_rate','gpm','flow','flowrate','capacity'] },
  { target: 'staticPressure',     aliases: ['static_pressure','static_psi','static'] },
  { target: 'residualPressure',   aliases: ['residual_pressure','residual_psi','residual'] },
  { target: 'lastTestDate',       aliases: ['last_test_date','test_date','lasttest','last_tested'] },
  { target: 'nextTestDue',        aliases: ['next_test_due','next_test','test_due'] },
  { target: 'ownedBy',            aliases: ['owned_by','owner','utility','water_company'] },
  { target: 'notes',              aliases: ['notes','comments','remarks','description'] },
];

function autoMap(attrs) {
  const keys = Object.keys(attrs).map(k => k.toLowerCase());
  const mapping = {};
  for (const { target, aliases } of FIELD_MAP) {
    for (const alias of aliases) {
      const match = keys.find(k => k === alias || k.includes(alias));
      if (match) {
        const originalKey = Object.keys(attrs).find(k => k.toLowerCase() === match);
        mapping[target] = originalKey;
        break;
      }
    }
  }
  return mapping;
}

// ─── Feature → hydrant row ─────────────────────────────────────────────────

function featureToRow(feature, mapping) {
  const attrs = feature.attributes ?? {};
  const geom  = feature.geometry ?? {};
  const row = {};

  for (const [target, srcKey] of Object.entries(mapping)) {
    if (srcKey && attrs[srcKey] !== undefined && attrs[srcKey] !== null) {
      row[target] = String(attrs[srcKey]).trim();
    }
  }

  // Ensure hydrantNumber is set (fall back to OBJECTID)
  if (!row.hydrantNumber && attrs.OBJECTID) row.hydrantNumber = `GIS-${attrs.OBJECTID}`;
  if (!row.hydrantNumber && attrs.objectid) row.hydrantNumber = `GIS-${attrs.objectid}`;

  // Numeric coercions
  if (row.flowRate)          row.flowRate          = parseFloat(row.flowRate)          || null;
  if (row.staticPressure)    row.staticPressure    = parseFloat(row.staticPressure)    || null;
  if (row.residualPressure)  row.residualPressure  = parseFloat(row.residualPressure)  || null;
  if (row.yearInstalled)     row.yearInstalled      = parseInt(row.yearInstalled, 10)   || null;

  // GPS from geometry
  if (geom.x != null && geom.y != null) {
    row.lat = parseFloat(geom.y.toFixed(7));
    row.lng = parseFloat(geom.x.toFixed(7));
  }

  return row;
}

// ─── CSV parser ────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

// ─── Routes ────────────────────────────────────────────────────────────────

// Preview — no DB writes
router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    const stationId = req.user?.department_id;
    if (!stationId) return res.status(401).json({ error: 'Not authenticated' });

    let rows = [];
    let mapping = {};

    if (req.body.arcgisUrl) {
      // ArcGIS mode
      const check = validateArcgisUrl(req.body.arcgisUrl);
      if (!check.ok) return res.status(400).json({ error: check.reason });
      const features = await fetchArcgisFeatures(req.body.arcgisUrl);
      if (!features.length) return res.status(400).json({ error: 'No features found at that URL' });
      mapping = autoMap(features[0].attributes ?? {});
      rows = features.map(f => featureToRow(f, mapping));
    } else if (req.file) {
      // CSV mode
      const text = req.file.buffer.toString('utf-8');
      const parsed = parseCSV(text);
      if (!parsed.length) return res.status(400).json({ error: 'CSV is empty or unparseable' });
      mapping = autoMap(parsed[0]);
      rows = parsed.map(attrs => {
        const feature = { attributes: attrs, geometry: {} };
        // Also try lat/lng columns directly
        feature.geometry.y = parseFloat(attrs.lat ?? attrs.latitude ?? attrs.LAT ?? attrs.LATITUDE ?? '') || null;
        feature.geometry.x = parseFloat(attrs.lng ?? attrs.longitude ?? attrs.LNG ?? attrs.LONGITUDE ?? '') || null;
        return featureToRow(feature, mapping);
      });
    } else {
      return res.status(400).json({ error: 'Provide arcgisUrl or upload a CSV file' });
    }

    const valid   = rows.filter(r => r.hydrantNumber);
    const invalid = rows.filter(r => !r.hydrantNumber);
    const sample  = valid.slice(0, 10);
    const geoCount = valid.filter(r => r.lat && r.lng).length;

    res.json({
      total:    rows.length,
      valid:    valid.length,
      invalid:  invalid.length,
      geoCount,
      mapping,
      sample,
    });
  } catch (e) {
    console.error('hydrantImport preview error', e);
    res.status(500).json({ error: e.message || 'Preview failed' });
  }
});

// Commit — writes to DB inside a transaction
router.post('/commit', upload.single('file'), async (req, res) => {
  try {
    const stationId = req.user?.department_id;
    if (!stationId) return res.status(401).json({ error: 'Not authenticated' });

    let rows = [];
    let mapping = {};

    if (req.body.arcgisUrl) {
      const check = validateArcgisUrl(req.body.arcgisUrl);
      if (!check.ok) return res.status(400).json({ error: check.reason });
      const features = await fetchArcgisFeatures(req.body.arcgisUrl);
      mapping = autoMap(features[0]?.attributes ?? {});
      rows = features.map(f => featureToRow(f, mapping));
    } else if (req.file) {
      const text = req.file.buffer.toString('utf-8');
      const parsed = parseCSV(text);
      mapping = autoMap(parsed[0] ?? {});
      rows = parsed.map(attrs => {
        const feature = { attributes: attrs, geometry: {
          y: parseFloat(attrs.lat ?? attrs.latitude ?? '') || null,
          x: parseFloat(attrs.lng ?? attrs.longitude ?? '') || null,
        }};
        return featureToRow(feature, mapping);
      });
    } else {
      return res.status(400).json({ error: 'Provide arcgisUrl or upload a CSV file' });
    }

    const valid = rows.filter(r => r.hydrantNumber);
    if (!valid.length) return res.status(400).json({ error: 'No valid rows to import' });

    const client = await pool.connect();
    let inserted = 0, updated = 0, errors = 0;
    try {
      await client.query('BEGIN');

      for (const row of valid) {
        try {
          const existing = await client.query(
            'SELECT id FROM hydrants WHERE "hydrantNumber" = $1 AND department_id = $2',
            [row.hydrantNumber, stationId]
          );

          if (existing.rows.length) {
            // Update
            const fields = Object.entries(row)
              .filter(([k]) => k !== 'hydrantNumber')
              .map(([k], i) => `"${k}" = $${i + 2}`);
            const vals   = Object.entries(row)
              .filter(([k]) => k !== 'hydrantNumber')
              .map(([, v]) => v);
            if (fields.length) {
              await client.query(
                `UPDATE hydrants SET ${fields.join(', ')}, "updatedAt" = NOW() WHERE "hydrantNumber" = $1 AND department_id = $${vals.length + 2}`,
                [row.hydrantNumber, ...vals, stationId]
              );
            }
            updated++;
          } else {
            // Insert
            const allRow = { ...row, department_id: stationId };
            const cols   = Object.keys(allRow).map(k => `"${k}"`).join(', ');
            const phs    = Object.keys(allRow).map((_, i) => `$${i + 1}`).join(', ');
            const vals2  = Object.values(allRow);
            await client.query(`INSERT INTO hydrants (${cols}) VALUES (${phs})`, vals2);
            inserted++;
          }
        } catch (rowErr) {
          console.error('hydrantImport row error', row.hydrantNumber, rowErr.message);
          errors++;
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ inserted, updated, errors, total: valid.length });
  } catch (e) {
    console.error('hydrantImport commit error', e);
    res.status(500).json({ error: e.message || 'Import failed' });
  }
});

module.exports = router;
