'use strict';
/**
 * seed-hazmat-json.js — Enriched ERG 2024 reference reseed (FireHazmat parity)
 *
 * Single source of truth: FireHazmat's `hazmat.json` (v2024.77+), copied
 * PRIVATELY into `server/data/hazmat.json` (gitignored — never committed, never
 * shipped to the browser). This module ingests that JSON into the public
 * read-only reference tables, bringing the web app to the SAME enriched data
 * the OF Mobile / FireHazmat reference uses:
 *
 *   fs_hazmat_guides              — 62 ERG response guides
 *   fs_hazmat_materials           — ~3,541 materials, ENRICHED 48-col schema
 *   fs_hazmat_isolation_distances — Table 1 (TIH / water-reactive)
 *   fs_hazmat_table3_distances    — Table 3 (container-specific large-spill)
 *
 * This REPLACES the legacy hardcoded-array seed (seed-hazmat.js + seed-erg-batch*.js)
 * as the reference data source. Key schema shift vs the legacy tables:
 *   - DROP the retired, ERG-ungrounded `above_the_line` / `high_risk` flag.
 *     Hazard advisories (TIH / explosive / radioactive / polymerization /
 *     water-reactive / pyrophoric) are DERIVED at render time from objective
 *     ERG/DOT fields (see client utils/advisories), never hand-set.
 *   - ADD 29 chemistry-enrichment columns (GHS, exposure limits, vapor
 *     behavior, molecular identity) + polymerization_hazard + is_pyrophoric.
 *
 * The JSON file is the seeding VEHICLE only — the private data lives in the
 * database. On Vercel the file is absent from the deploy (gitignored), so this
 * seed no-ops gracefully when the file is missing; prod is reseeded by running
 * this module against DATABASE_URL directly (admin step), not at boot.
 *
 * Data source: ERG 2024 (PHMSA/DOT) — US Government publication, public domain;
 * chemistry enrichment from ERG 2024, 49 CFR 172.101, NIOSH Pocket Guide,
 * PubChem, OSHA HCS / UN GHS (verbatim hazard text only). The cleaned,
 * enriched compilation is FireHazmat's protectable asset — keep it private.
 */

const fs   = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'hazmat.json');

// ── Enriched materials columns added on top of the legacy base schema ────────
// [columnName, postgresType]. Each ADD COLUMN is idempotent (IF NOT EXISTS).
const ENRICHMENT_COLUMNS = [
  ['polymerization_hazard',  'BOOLEAN DEFAULT false'],
  ['is_pyrophoric',          'BOOLEAN DEFAULT false'],
  ['stel_ppm',               'NUMERIC'],
  ['ceiling_ppm',            'NUMERIC'],
  ['is_carcinogen',          'BOOLEAN DEFAULT false'],
  ['carcinogen_class',       'TEXT'],
  ['idlh_mg_m3',             'NUMERIC'],
  ['vapor_density',          'NUMERIC'],
  ['vapor_pressure_mmhg',    'NUMERIC'],
  ['vapor_pressure_temp_c',  'NUMERIC'],
  ['specific_gravity',       'NUMERIC'],
  ['melting_point_c',        'NUMERIC'],
  ['autoignition_temp_c',    'NUMERIC'],
  ['lel_pct',                'NUMERIC'],
  ['lel_unit',               'TEXT'],
  ['uel_pct',                'NUMERIC'],
  ['uel_unit',               'TEXT'],
  ['molecular_formula',      'TEXT'],
  ['molecular_weight_g_mol', 'NUMERIC'],
  ['iupac_name',             'TEXT'],
  ['inchi_key',              'TEXT'],
  ['smiles',                 'TEXT'],
  ['water_solubility',       'TEXT'],
  ['incompatibilities',      'TEXT[]'],
  ['ghs_pictograms',         'TEXT[]'],
  ['ghs_signal_word',        'TEXT'],
  ['ghs_hazards',            'TEXT[]'],
  ['enriched_at',            'TEXT'],
  ['data_sources',           'JSONB'],
  ['pubchem_cid',            'INTEGER'],
];

// Ordered column list for the materials INSERT (must match valuesForMaterial).
const MATERIAL_COLUMNS = [
  'id', 'name', 'un_number', 'na_number', 'cas_number', 'guide_number',
  'hazard_class', 'hazard_division', 'is_tih', 'is_water_reactive',
  'polymerization_hazard', 'physical_state', 'color', 'odor',
  'flash_point_c', 'boiling_point_c', 'idlh_ppm', 'tlv_twa_ppm', 'synonyms',
  'stel_ppm', 'ceiling_ppm', 'is_carcinogen', 'carcinogen_class', 'idlh_mg_m3',
  'vapor_density', 'vapor_pressure_mmhg', 'vapor_pressure_temp_c',
  'specific_gravity', 'melting_point_c', 'autoignition_temp_c',
  'lel_pct', 'lel_unit', 'uel_pct', 'uel_unit',
  'molecular_formula', 'molecular_weight_g_mol', 'iupac_name', 'inchi_key',
  'smiles', 'water_solubility', 'is_pyrophoric', 'incompatibilities',
  'ghs_pictograms', 'ghs_signal_word', 'ghs_hazards', 'enriched_at',
  'data_sources', 'pubchem_cid',
];

const GUIDE_COLUMNS = [
  'guide_number', 'title', 'hazard_class', 'fire_explosion', 'health_hazards',
  'public_safety', 'protective_clothing', 'evacuation', 'fire_response',
  'spill_response', 'first_aid', 'ppe_level', 'special_hazards',
  'needs_proximity_suit',
];

const ISO_COLUMNS = [
  'un_number', 'name', 'guide_number',
  'small_spill_isolate_m', 'small_spill_day_km', 'small_spill_night_km',
  'large_spill_isolate_m', 'large_spill_day_km', 'large_spill_night_km',
  'fire_isolate_m',
];

const T3_COLUMNS = [
  'un_number', 'container_type', 'isolate_m', 'isolate_ft',
  'day_low_km', 'day_mod_km', 'day_high_km',
  'night_low_km', 'night_mod_km', 'night_high_km',
];

// ── Value coercion helpers ───────────────────────────────────────────────────
const bool = v => v === true || v === 1 || v === '1';
const num  = v => (v === '' || v === null || v === undefined) ? null : Number(v);
const str  = v => (v === null || v === undefined) ? null : String(v);

// Normalize UN: strip a redundant "UN " prefix but PRESERVE "NA " (so formatUN
// can show "NA 1993" vs "UN 1202"). Mirrors the mobile seed exactly.
function normalizeUN(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^NA\s/i.test(s)) return s.toUpperCase();
  return s.replace(/^UN\s+/i, '').trim() || null;
}

// synonyms / incompatibilities / GHS arrays → TEXT[] (array | pipe-string | null)
function toTextArray(v) {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const arr = v.map(x => String(x).trim()).filter(Boolean);
    return arr.length ? arr : null;
  }
  if (typeof v === 'string') {
    const arr = v.split('|').map(x => x.trim()).filter(Boolean);
    return arr.length ? arr : null;
  }
  return null;
}

function valuesForMaterial(m, fallbackId) {
  return [
    m.id ?? fallbackId,
    str(m.name),
    normalizeUN(m.un_number),
    normalizeUN(m.na_number),
    str(m.cas_number),
    m.guide_number ?? null,
    str(m.hazard_class),
    str(m.hazard_division),
    bool(m.is_tih),
    bool(m.is_water_reactive),
    bool(m.polymerization_hazard),
    str(m.physical_state),
    str(m.color),
    str(m.odor),
    num(m.flash_point_c),
    num(m.boiling_point_c),
    num(m.idlh_ppm),
    num(m.tlv_twa_ppm),
    toTextArray(m.synonyms),
    num(m.stel_ppm),
    num(m.ceiling_ppm),
    bool(m.is_carcinogen),
    str(m.carcinogen_class),
    num(m.idlh_mg_m3),
    num(m.vapor_density),
    num(m.vapor_pressure_mmhg),
    num(m.vapor_pressure_temp_c),
    num(m.specific_gravity),
    num(m.melting_point_c),
    num(m.autoignition_temp_c),
    num(m.lel_pct),
    str(m.lel_unit),
    num(m.uel_pct),
    str(m.uel_unit),
    str(m.molecular_formula),
    num(m.molecular_weight_g_mol),
    str(m.iupac_name),
    str(m.inchi_key),
    str(m.smiles),
    str(m.water_solubility),
    bool(m.is_pyrophoric),
    toTextArray(m.incompatibilities),
    toTextArray(m.ghs_pictograms),
    str(m.ghs_signal_word),
    toTextArray(m.ghs_hazards),
    str(m.enriched_at),
    m.data_sources ? JSON.stringify(m.data_sources) : null,
    m.pubchem_cid ?? null,
  ];
}

function valuesForGuide(g) {
  return [
    g.guide_number, str(g.title), str(g.hazard_class), str(g.fire_explosion),
    str(g.health_hazards), str(g.public_safety), str(g.protective_clothing),
    str(g.evacuation), str(g.fire_response), str(g.spill_response),
    str(g.first_aid), str(g.ppe_level), str(g.special_hazards),
    bool(g.needs_proximity_suit),
  ];
}

function valuesForIso(d) {
  return [
    normalizeUN(d.un_number), str(d.name), d.guide_number ?? null,
    num(d.small_spill_isolate_m), num(d.small_spill_day_km), num(d.small_spill_night_km),
    num(d.large_spill_isolate_m), num(d.large_spill_day_km), num(d.large_spill_night_km),
    num(d.fire_isolate_m),
  ];
}

function valuesForT3(r) {
  return [
    normalizeUN(r.un_number), str(r.container_type), num(r.isolate_m), num(r.isolate_ft),
    str(r.day_low_km), str(r.day_mod_km), str(r.day_high_km),
    str(r.night_low_km), str(r.night_mod_km), str(r.night_high_km),
  ];
}

// ── Chunked multi-row INSERT (stays well under Postgres' 65535 param cap) ─────
async function batchInsert(client, table, columns, rows, valueFn) {
  if (!rows.length) return;
  const colCount     = columns.length;
  const rowsPerChunk = Math.max(1, Math.floor(60000 / colCount));
  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    const chunk = rows.slice(i, i + rowsPerChunk);
    const params = [];
    const tuples = chunk.map((row, ri) => {
      const vals = valueFn(row, i + ri + 1);
      const ph = vals.map((_, ci) => `$${ri * colCount + ci + 1}`);
      params.push(...vals);
      return `(${ph.join(',')})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples.join(',')}`,
      params,
    );
  }
}

// ── Schema migration: bring reference tables to the enriched shape ───────────
async function migrateSchema(client) {
  // Reference tables are FK-free — safe to ensure/extend in place.
  await client.query(`
    CREATE TABLE IF NOT EXISTS fs_hazmat_guides (
      id               SERIAL PRIMARY KEY,
      guide_number     INTEGER NOT NULL UNIQUE,
      title            TEXT NOT NULL,
      hazard_class     TEXT,
      fire_explosion   TEXT,
      health_hazards   TEXT,
      public_safety    TEXT,
      protective_clothing TEXT,
      evacuation       TEXT,
      fire_response    TEXT,
      spill_response   TEXT,
      first_aid        TEXT,
      ppe_level        TEXT,
      special_hazards  TEXT,
      needs_proximity_suit BOOLEAN DEFAULT false,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS fs_hazmat_materials (
      id               INTEGER PRIMARY KEY,
      name             TEXT NOT NULL,
      un_number        VARCHAR(10),
      na_number        VARCHAR(10),
      cas_number       VARCHAR(20),
      guide_number     INTEGER,
      hazard_class     VARCHAR(10),
      hazard_division  VARCHAR(10),
      is_tih           BOOLEAN DEFAULT false,
      is_water_reactive BOOLEAN DEFAULT false,
      physical_state   TEXT,
      color            TEXT,
      odor             TEXT,
      flash_point_c    NUMERIC,
      boiling_point_c  NUMERIC,
      idlh_ppm         NUMERIC,
      tlv_twa_ppm      NUMERIC,
      synonyms         TEXT[],
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS fs_hazmat_isolation_distances (
      id                      SERIAL PRIMARY KEY,
      un_number               VARCHAR(10) NOT NULL,
      name                    TEXT NOT NULL,
      guide_number            INTEGER,
      small_spill_isolate_m   INTEGER,
      small_spill_day_km      NUMERIC,
      small_spill_night_km    NUMERIC,
      large_spill_isolate_m   INTEGER,
      large_spill_day_km      NUMERIC,
      large_spill_night_km    NUMERIC,
      fire_isolate_m          INTEGER,
      notes                   TEXT,
      created_at              TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS fs_hazmat_table3_distances (
      id              SERIAL PRIMARY KEY,
      un_number       VARCHAR(10)  NOT NULL,
      container_type  VARCHAR(100) NOT NULL,
      isolate_m       INTEGER      NOT NULL,
      isolate_ft      INTEGER      NOT NULL,
      day_low_km      TEXT         NOT NULL,
      day_mod_km      TEXT         NOT NULL,
      day_high_km     TEXT         NOT NULL,
      night_low_km    TEXT         NOT NULL,
      night_mod_km    TEXT         NOT NULL,
      night_high_km   TEXT         NOT NULL,
      created_at      TIMESTAMPTZ  DEFAULT NOW(),
      UNIQUE (un_number, container_type)
    );
  `);

  // Add enriched columns (idempotent).
  for (const [col, type] of ENRICHMENT_COLUMNS) {
    await client.query(`ALTER TABLE fs_hazmat_materials ADD COLUMN IF NOT EXISTS ${col} ${type}`);
  }

  // Drop the retired ERG-ungrounded flag from both tables (idempotent).
  await client.query(`ALTER TABLE fs_hazmat_materials DROP COLUMN IF EXISTS above_the_line`);
  await client.query(`ALTER TABLE fs_hazmat_guides     DROP COLUMN IF EXISTS above_the_line`);

  // Drop the legacy UNIQUE indexes that existed only to dedupe the old
  // multi-file hardcoded seed. The JSON load carries a stable primary-key id,
  // so (un_number, name) uniqueness is no longer the identity key and these
  // constraints could block a faithful load (e.g. two unnamed-UN entries that
  // legitimately share a display name). Idempotent.
  for (const idx of [
    'idx_hazmat_materials_un_name',
    'idx_hazmat_materials_null_un_name',
    'idx_hazmat_materials_un_lower_name',
    'idx_mat_high_risk',
  ]) {
    await client.query(`DROP INDEX IF EXISTS ${idx}`);
  }

  // Indexes for the read-paths the 5 reference screens hit.
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fs_hazmat_materials_name ON fs_hazmat_materials USING gin(to_tsvector('english', name))`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fs_hazmat_materials_un    ON fs_hazmat_materials(un_number)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fs_hazmat_materials_guide ON fs_hazmat_materials(guide_number)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fs_hazmat_materials_class ON fs_hazmat_materials(hazard_class)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fs_hazmat_materials_cas   ON fs_hazmat_materials(cas_number)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_t3_un ON fs_hazmat_table3_distances(un_number)`);
}

/**
 * Reseed the enriched ERG reference tables from the private hazmat.json.
 * Accepts a pg pool/client (so boot can pass the shared pool). Returns the
 * row counts seeded, or null if the JSON file is absent (graceful no-op).
 */
async function seedHazmatFromJson(db) {
  if (!fs.existsSync(DATA_PATH)) {
    console.warn(`[seed] hazmat.json not found at ${DATA_PATH} — skipping enriched hazmat reseed (data already lives in the DB on prod).`);
    return null;
  }

  const raw  = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const guides    = raw.guides              || [];
  const materials = raw.materials           || [];
  const isolation = raw.isolation_distances || [];
  const table3    = raw.table3_distances    || [];

  // DATA-ONLY mode (SEED_DATA_ONLY=1): skip the owner-only schema migrate +
  // TRUNCATE and ONLY insert rows. Used when a non-owner role (e.g. of_app,
  // which has INSERT but not TRUNCATE/ALTER) does the bulk load after the
  // owner has already wiped the tables through a separate admin connection.
  const dataOnly = process.env.SEED_DATA_ONLY === '1';

  await db.query('BEGIN');
  try {
    if (!dataOnly) {
      await migrateSchema(db);
      // Clean wipe so no ghost rows survive a dataset change (reference tables
      // are FK-free; the operational fs_hazmat_incidents* tables are untouched).
      await db.query('TRUNCATE fs_hazmat_table3_distances, fs_hazmat_isolation_distances, fs_hazmat_materials, fs_hazmat_guides RESTART IDENTITY');
    } else {
      console.log('[seed] DATA-ONLY mode — schema migrate + truncate skipped (owner handles the wipe); inserting rows only.');
    }

    await batchInsert(db, 'fs_hazmat_guides',               GUIDE_COLUMNS, guides,    valuesForGuide);
    await batchInsert(db, 'fs_hazmat_materials',            MATERIAL_COLUMNS, materials, valuesForMaterial);
    await batchInsert(db, 'fs_hazmat_isolation_distances',  ISO_COLUMNS,   isolation, valuesForIso);
    await batchInsert(db, 'fs_hazmat_table3_distances',     T3_COLUMNS,    table3,    valuesForT3);

    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }

  const counts = {
    guides:    guides.length,
    materials: materials.length,
    isolation: isolation.length,
    table3:    table3.length,
    version:   raw.version || 'unknown',
  };
  console.log(`[seed] Enriched hazmat reseed complete — ${counts.materials} materials, ${counts.guides} guides, ${counts.isolation} isolation, ${counts.table3} table3 (v${counts.version}).`);
  return counts;
}

module.exports = seedHazmatFromJson;
module.exports.seedHazmatFromJson = seedHazmatFromJson;

// ── Standalone runner (local reseed / admin prod reseed) ─────────────────────
// Usage: DATABASE_URL=... node src/seed-hazmat-json.js
// Defaults to the local freestation DB when DATABASE_URL is unset.
if (require.main === module) {
  const { Pool } = require('pg');
  // No silent localhost fallback — running this bare used to quietly reseed the
  // LOCAL dev DB (a no-op there) while leaving the intended target untouched.
  // DATABASE_URL must be set explicitly; we print the target host (password
  // masked) so it's obvious which database is about to be reseeded.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('REFUSING TO RUN: DATABASE_URL is not set. Set it explicitly, e.g.\n' +
      "  DATABASE_URL='postgresql://USER:PASS@HOST:5432/postgres' node src/seed-hazmat-json.js\n" +
      "  (local dev: DATABASE_URL='postgresql://matthewlavin@localhost:5432/freestation')");
    process.exit(2);
  }
  try {
    const u = new URL(connectionString);
    console.log(`[seed] target database: ${u.protocol}//${u.username}:****@${u.hostname}:${u.port || ''}${u.pathname}`);
  } catch { /* non-URL form; proceed */ }
  // max:1 + a single checked-out client so the BEGIN…COMMIT runs on ONE
  // physical connection — required for correctness through Supabase's
  // connection pooler (a pooled multi-statement txn can otherwise split
  // across connections and silently break).
  const pool = new Pool({ connectionString, max: 1 });
  (async () => {
    const client = await pool.connect();
    try {
      const c = await seedHazmatFromJson(client);
      console.log('done:', c);
    } finally {
      client.release();
      await pool.end();
    }
  })()
    .then(() => process.exit(0))
    .catch(err => { console.error('seed failed:', err); process.exit(1); });
}
