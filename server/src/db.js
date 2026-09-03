'use strict';
/**
 * db.js — PostgreSQL database using pg driver
 *
 * Async query interface using the 'pg' npm package.
 * Replaces node:sqlite synchronous API with async/await patterns.
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { buildSslConfig } = require('./sslConfig');
// Server-owned permit vocabulary (Phase 3, module 3.0). The db layer must not
// carry its own idea of the default status — that disagreement is what 3.0 found.
const {
  DEFAULT_PERMIT_STATUS,
  // The lifecycle writers below guard on these SETS, never on a status literal. Migration
  // 0094 added AboutToExpire + Delinquent to the revocable and terminable sets, and the
  // guards here were left reading `status = 'Active'` — so the routes admitted a permit the
  // writes then refused. See the writers for what that actually broke.
  REVOCABLE_PERMIT_STATUSES,
  TERMINABLE_PERMIT_STATUSES,
  RENEWABLE_PERMIT_STATUSES,
} = require('./constants/permitStatus');

// Strip sslmode from URL to avoid pg driver conflicts — we handle SSL explicitly.
// The localhost default keeps `npm run dev` working with no env, but silently
// connecting to it in a deployed environment masks a missing DATABASE_URL (that
// is how a prod misconfig surfaces as "role postgres does not exist"). Warn loudly
// rather than fall back quietly. We don't hard-exit: NODE_ENV is exported
// `production` globally in this shell, so it can't distinguish real prod from local.
if (!process.env.DATABASE_URL) {
  console.warn(
    '[db] DATABASE_URL is not set — falling back to postgresql://…@localhost/freestation. '
    + 'This is correct for local dev, but in any deployed environment it means the '
    + 'database is misconfigured. Set DATABASE_URL.',
  );
}
const rawDbUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/freestation';
const dbUrl = rawDbUrl.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
const isRemoteDb = dbUrl && !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1');
// TLS: pin the Supabase CA and verify when DATABASE_CA is set; otherwise stay on
// the legacy unverified path with a warning, so deploying never breaks prod.
// See docs/ops/prod-db-tls-ca-pinning.md.
const sslConfig = buildSslConfig(isRemoteDb);

// Initialize pool from DATABASE_URL or use local dev defaults
// Serverless-friendly settings: single connection, fast timeout, no idle retention
const pool = new Pool({
  connectionString: dbUrl,
  ssl: sslConfig,
  max: 1,                        // one connection per serverless invocation
  connectionTimeoutMillis: 5000, // fail fast instead of hanging forever
  idleTimeoutMillis: 0,          // don't retain idle connections across freezes
});

// ── P5: request-scoped client routing ────────────────────────────────────────
// Override pool.query so that when a per-request transaction context is active
// (middleware/dbTransaction.js), queries run on that pinned client — inheriting
// its open transaction and app.department_id / app.user_id GUCs (RLS enforcement).
// With NO active context (cron, boot/initDb, seed scripts, the pre-auth bootstrap
// reads in requireAuth), it falls back to the raw pool — behavior-identical to
// pre-P5. Because all ~1,100 `pool.query` call sites across the server hold a
// reference to THIS exported pool object, every one inherits this with zero edits.
// Variadic forwarding preserves every pg signature (text, [params], [callback],
// or a single config object).
const dbContext = require('./utils/dbContext');
const _rawPoolQuery = pool.query.bind(pool);

// In enforced mode (P5_TXN=on) the app connects as the NON-OWNER of_app role,
// which cannot run DDL (CREATE/ALTER/DROP/...) — Postgres denies it BEFORE the
// `IF NOT EXISTS` short-circuit, so even "ensure" statements on existing tables
// error ("permission denied for schema public" / "must be owner"). The codebase
// has many request-path "ensure table/index" calls; under of_app the schema is
// instead guaranteed by migrations (owner-time), so we no-op runtime DDL here at
// the single query chokepoint rather than letting those routes 500. When P5_TXN
// is off (dev / owner / CI), DDL runs exactly as before — fully backward-compatible.
const _DDL_RE = /^\s*(create|alter|drop|truncate|reindex|comment\s+on)\b/i;
function _isSkippableDDL(args) {
  if (process.env.P5_TXN !== 'on') return false;
  const sql = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].text);
  return typeof sql === 'string' && _DDL_RE.test(sql);
}
pool.query = function (...args) {
  if (_isSkippableDDL(args)) {
    const result = { command: 'SKIPPED_DDL', rowCount: 0, rows: [], fields: [] };
    const cb = args.find((a) => typeof a === 'function');
    if (cb) { cb(null, result); return; }
    return Promise.resolve(result);
  }
  const client = dbContext.getClient();
  if (client) return client.query(...args);
  return _rawPoolQuery(...args);
};

// ── P5: transaction-aware runner (deadlock-safe under max:1) ──────────────────
// Any helper that needs a multi-statement transaction MUST use this instead of
// a bare pool.connect(). When a per-request transaction context is already open
// (P5_TXN=on), opening a SECOND connection would block forever under the max:1
// pool (the request holds the only connection) — a deadlock. So: reuse the
// request's pinned client via a SAVEPOINT (nested atomicity — a failure here
// rolls back just this unit, not the whole request). When there is NO ambient
// context (cron, boot, seed scripts, or P5_TXN off), behave exactly as before:
// own connection + BEGIN/COMMIT/ROLLBACK + release. `fn` receives the client.
async function runInTransaction(fn) {
  const existing = dbContext.getClient();
  if (existing) {
    const sp = 'sp_' + Math.random().toString(36).slice(2, 12);
    await existing.query(`SAVEPOINT ${sp}`);
    try {
      const result = await fn(existing);
      await existing.query(`RELEASE SAVEPOINT ${sp}`);
      return result;
    } catch (e) {
      await existing.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      throw e;
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── P5: run a block in a department context for NO-JWT public paths ────────────
// The public credential paths (tv-data PIN, radio-ingest key, ical token, CAD
// webhook) have no JWT, so the dbTransaction middleware never runs for them.
// After they resolve their tenant from the credential, they wrap their DB work
// in this so the queries run inside a transaction with app.department_id /
// app.user_id set — required once FORCE RLS is on (Phase C), and the source of
// their entry in the 100%-GUC-coverage proof. `fn` takes no args: the existing
// pool.query calls inside it auto-route to the pinned client via the ALS context.
//
// OPT-IN + behavior-neutral when P5_TXN is off: fn() runs directly on the raw
// pool exactly as before. departmentId must already be resolved+validated by the
// caller (never trust an unauthenticated body for it).
async function runWithDepartment(departmentId, userId, fn) {
  if (process.env.P5_TXN !== 'on') return fn();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.department_id', $1, true)", [departmentId == null ? '' : String(departmentId)]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId == null ? '' : String(userId)]);
    const result = await dbContext.run({ client }, () => fn());
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── Raw query helper ─────────────────────────────────────────────────────────
async function query(sql, params) {
  const r = await pool.query(sql, params);
  return r;
}

// ── Helper: buildSetClause for UPDATE queries ────────────────────────────────
function buildSetClause(data, allowed, startIdx) {
  const keys = Object.keys(data).filter(k => allowed.includes(k));
  const sets = keys.map((k, i) => `"${k}" = $${startIdx + i}`).join(', ');
  const values = keys.map(k => data[k]);
  return { sets, values, nextIdx: startIdx + keys.length };
}

// ── Schema initialization ────────────────────────────────────────────────────

async function initDb() {
  // ── Enforced mode (P5_TXN=on): schema is OWNER-MANAGED, do nothing ──────
  // In enforced mode the app connects as the NON-OWNER of_app role and the
  // schema is applied by hand via docs/migrations/* as the owner. Every
  // CREATE/ALTER/INDEX here is either no-op'd by the DDL-skip chokepoint or
  // would fail for a non-owner, and the data backfills/setval are already
  // applied. Skipping initDb entirely is the correct behavior — and it also
  // closes a fall-through hole: if the fast-path probe below errors transiently
  // (e.g. a pooler credential-cache miss during a password rotation), the old
  // code dropped into FULL init and ran owner-only ops (setval on
  // departments_id_seq) under of_app, logging a spurious "DB initialization
  // failed". Fresh installs (owner, P5_TXN off) still run the full bootstrap.
  if (process.env.P5_TXN === 'on') {
    console.log('[initDb] enforced mode (P5_TXN=on) — schema is owner-managed; skipping init');
    return;
  }

  // ── Fast-path: skip schema init only if the DB is actually SEEDED ───────
  // On Vercel serverless, running 89 CREATE TABLE IF NOT EXISTS queries takes
  // too long and the connection gets terminated, so we skip when already
  // bootstrapped. IMPORTANT: probe for DATA, not just the table — a schema-only
  // baseline load (db/baseline.sql, used by CI + fresh self-host installs)
  // creates the tables but leaves them empty. In that case we must fall through
  // and run the idempotent seeds (reference data + station 1 + bootstrap chief),
  // otherwise the install is missing its station-1 row (FK failures) and seeds.
  // Probe public.stations directly: if the table is missing the query errors and
  // the catch falls through to full init (fresh non-baseline DB).
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM public.stations');
    if (rows[0].n > 0 && process.env.OF_FORCE_INIT !== '1') {
      console.log('[initDb] Already bootstrapped (stations has data) — skipping schema init');
      return;
    }
    // OF_FORCE_INIT=1 — run the full (idempotent) schema pass even on a seeded DB.
    //
    // WHY THIS EXISTS (2026-07-14): a long-lived DEV database drifts. Tables added to
    // db.js later are never created there, because this fast-path skips the whole schema
    // pass the moment `stations` has rows. The result is endpoints that 500 in dev on a
    // missing relation while PROD is perfectly fine — a phantom bug that costs an hour
    // and, worse, teaches you to ignore 500s. (Found the hard way: /api/alerts was 500ing
    // on `of_rank_notifications` locally; the table has existed in prod for weeks. A
    // sweep then found TWELVE tables in prod that the local DB had never created.)
    //
    // The SCHEMA statements are all CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS,
    // so re-running them is safe. But be warned: the init path ALSO contains DATA
    // backfills, and those are NOT immune to a drifted dev DB. (Proved it: this aborted
    // on an of_user_departments FK because two orphaned test users pointed at stations a
    // test run had already deleted. Clean the orphans, and it completes.) So it is a
    // self-heal, not a magic wand — read the error if it stops.
    //     OF_FORCE_INIT=1 DATABASE_URL=…localhost…/freestation node server/src/index.js
    // Do NOT set it in production — prod schema is owner-managed via docs/migrations/*
    // and the P5_TXN guard above already refuses this path there.
    if (rows[0].n > 0) console.log('[initDb] OF_FORCE_INIT=1 — re-running the idempotent schema pass on a seeded DB');
    console.log('[initDb] Schema present but unseeded (baseline load) — running idempotent init + seeds');
  } catch (err) {
    console.warn('[initDb] Fast-path check failed, running full init:', err.message);
  }

  // Stations table (multi-tenancy)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      fdid TEXT DEFAULT '',
      address TEXT DEFAULT '',
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
      zip TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      -- NERIS registry (0065): the NERIS-issued station id (FD…S###) once the
      -- chief registers this station. SERVER-OWNED (utils/nerisRegistry.js).
      neris_station_id TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Users table (auth)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT DEFAULT '',
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      "passwordHash" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // seeded_at flag — stamped after first successful seed run (startup performance)
  await pool.query(`ALTER TABLE stations ADD COLUMN IF NOT EXISTS seeded_at TIMESTAMPTZ DEFAULT NULL`);

  // User preferences column (Phase 6)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'`);

  // Members table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      "memberNumber" TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      rank TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT DEFAULT 'Active',
      joined TEXT NOT NULL,
      dob TEXT DEFAULT '',
      phone TEXT DEFAULT '',

      email TEXT DEFAULT '',
      station_email TEXT DEFAULT '',
      personal_email TEXT DEFAULT '',

      address TEXT DEFAULT '',
      "emergencyContactName" TEXT DEFAULT '',
      "emergencyContactPhone" TEXT DEFAULT '',
      "emergencyContactRelation" TEXT DEFAULT '',
      certifications TEXT DEFAULT '[]',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Apparatus table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apparatus (
      id SERIAL PRIMARY KEY,
      designation TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      year INTEGER NOT NULL,
      make TEXT DEFAULT '',
      model TEXT DEFAULT '',
      status TEXT DEFAULT 'In Service',
      mileage INTEGER DEFAULT 0,
      "lastService" TEXT DEFAULT '',
      "nextServiceDue" TEXT DEFAULT '',
      "assignedOperator" TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      -- NERIS unit-type vocabulary (0042 — mirrored here late; the migration was
      -- applied to prod 2026-06 but never added to this CREATE): the VERBATIM
      -- 49-value type_unit code, NULL when the legacy label can't be mapped
      -- without a human choice (never guessed). Display label stays in "type".
      neris_type TEXT,
      -- NERIS registry (0065): the NERIS-issued unit id (FD…S###U###) once the
      -- chief registers this rig. SERVER-OWNED (utils/nerisRegistry.js).
      neris_unit_id TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Incidents table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id SERIAL PRIMARY KEY,
      "incidentNumber" TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT DEFAULT '',
      type TEXT NOT NULL,
      "alarmLevel" TEXT DEFAULT 'Still',
      address TEXT DEFAULT '',
      units TEXT DEFAULT '[]',
      personnel TEXT DEFAULT '[]',
      disposition TEXT DEFAULT '',
      injuries INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      photos TEXT DEFAULT '[]',
      "dispatchTime" TEXT DEFAULT '',
      "clearTime" TEXT DEFAULT '',
      description TEXT DEFAULT '',
      station_id INTEGER DEFAULT 1,
      incident_date DATE,
      -- ── NERIS incident-record axis (migration 0060, D3) ─────────────────────
      -- Control values stored VERBATIM in the standard's ||-path format (D2);
      -- value membership is enforced server-side (constants/neris + utils/
      -- nerisValidate.js — D5 keeps the big evolving enums OUT of DB CHECKs).
      -- Postgres enforces shape/count, the stable 3-value noaction set, and
      -- actions XOR noaction. The legacy free-text disposition column above is
      -- display-only history — never an input to a decision or an export.
      neris_incident_types JSONB
        CONSTRAINT incidents_neris_types_shape_chk
        CHECK (neris_incident_types IS NULL
               OR (jsonb_typeof(neris_incident_types) = 'array'
                   AND jsonb_array_length(neris_incident_types) BETWEEN 1 AND 3)),
      neris_actions JSONB
        CONSTRAINT incidents_neris_actions_shape_chk
        CHECK (neris_actions IS NULL OR jsonb_typeof(neris_actions) = 'array'),
      neris_noaction TEXT
        CONSTRAINT incidents_neris_noaction_chk
        CHECK (neris_noaction IS NULL
               OR neris_noaction IN ('CANCELLED','STAGED_STANDBY','NO_INCIDENT_FOUND')),
      neris_fire_detail JSONB
        CONSTRAINT incidents_neris_fire_detail_chk
        CHECK (neris_fire_detail IS NULL OR jsonb_typeof(neris_fire_detail) = 'object'),
      neris_hazsit_detail JSONB
        CONSTRAINT incidents_neris_hazsit_detail_chk
        CHECK (neris_hazsit_detail IS NULL OR jsonb_typeof(neris_hazsit_detail) = 'object'),
      neris_medical_details JSONB
        CONSTRAINT incidents_neris_medical_details_chk
        CHECK (neris_medical_details IS NULL OR jsonb_typeof(neris_medical_details) = 'array'),
      neris_aids JSONB
        CONSTRAINT incidents_neris_aids_chk
        CHECK (neris_aids IS NULL OR jsonb_typeof(neris_aids) = 'array'),
      CONSTRAINT incidents_neris_action_xor_chk
        CHECK (NOT (neris_noaction IS NOT NULL
                    AND jsonb_array_length(COALESCE(neris_actions, '[]'::jsonb)) > 0)),
      -- ── NERIS Phase 2 (migration 0061): casualty capture, PSAP fallbacks,
      -- review chain. neris_status/neris_review are ROUTE-OWNED (P2-D6) — never
      -- client-writable; transitions go through the one CAS'd status route.
      neris_casualty_rescues JSONB
        CONSTRAINT incidents_neris_casualty_rescues_chk
        CHECK (neris_casualty_rescues IS NULL OR jsonb_typeof(neris_casualty_rescues) = 'array'),
      neris_dispatch_times JSONB
        CONSTRAINT incidents_neris_dispatch_times_chk
        CHECK (neris_dispatch_times IS NULL OR jsonb_typeof(neris_dispatch_times) = 'object'),
      neris_status TEXT NOT NULL DEFAULT 'draft'
        CONSTRAINT incidents_neris_status_chk
        CHECK (neris_status IN ('draft','in_review','approved')),
      neris_review JSONB
        CONSTRAINT incidents_neris_review_chk
        CHECK (neris_review IS NULL OR jsonb_typeof(neris_review) = 'object'),
      -- ── NERIS Fire Protection modules (migration 0063): the five IncidentPayload
      -- alarm/suppression modules stored VERBATIM in the spec's own shape (D2).
      -- A DEDICATED column (not keys in neris_fire_detail) because the spec has
      -- them as top-level siblings of fire_detail, and the official NERIS app
      -- captures them on ANY incident type (CRR) — fire_detail is FIRE-coupled.
      neris_fire_protection JSONB
        CONSTRAINT incidents_neris_fire_protection_chk
        CHECK (neris_fire_protection IS NULL OR jsonb_typeof(neris_fire_protection) = 'object'),
      -- ── NERIS Track B (migration 0064): the submission axis. SERVER-OWNED —
      -- written only by utils/nerisSubmit.js + the sweep cron, never by clients.
      -- neris_submission_state is OUR lifecycle (stable set → CHECK, D5);
      -- neris_incident_status is NERIS's own status VERBATIM (D2, no CHECK —
      -- externally sourced; a future NERIS value must never break ingestion).
      neris_incident_uid TEXT,
      neris_submission_state TEXT NOT NULL DEFAULT 'not_submitted'
        CONSTRAINT incidents_neris_submission_state_chk
        CHECK (neris_submission_state IN ('not_submitted','submitted','update_pending','submit_failed','refused')),
      neris_incident_status TEXT,
      neris_submission_log JSONB
        CONSTRAINT incidents_neris_submission_log_chk
        CHECK (neris_submission_log IS NULL OR jsonb_typeof(neris_submission_log) = 'array'),
      neris_submitted_at TIMESTAMPTZ,
      neris_status_checked_at TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add columns if missing (migration for existing DBs)
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE incidents ADD COLUMN IF NOT EXISTS "dispatchTime" TEXT DEFAULT '';
      ALTER TABLE incidents ADD COLUMN IF NOT EXISTS "clearTime" TEXT DEFAULT '';
      ALTER TABLE incidents ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
      ALTER TABLE incidents ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE incidents ADD COLUMN IF NOT EXISTS incident_date DATE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$
  `);

  // ── 0060 self-heal: NERIS incident-record columns on an EXISTING db ────────
  // Mirrors docs/migrations/0060 (fresh installs get these from the CREATE TABLE
  // above). Individual statements, NOT one swallow-all DO block — a single atomic
  // block with an EXCEPTION handler silently rolls back EVERY alter on one
  // failure (the idx_members_crew lesson, 2026-07-12). Constraint adds are
  // guarded on pg_constraint so a re-run (and a fresh install, where the CREATE
  // TABLE already declared them) is a no-op.
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_incident_types  JSONB`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_actions         JSONB`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_noaction        TEXT`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_fire_detail     JSONB`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_hazsit_detail   JSONB`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_medical_details JSONB`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_aids            JSONB`);
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_types_shape_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_types_shape_chk
        CHECK (neris_incident_types IS NULL OR (jsonb_typeof(neris_incident_types) = 'array' AND jsonb_array_length(neris_incident_types) BETWEEN 1 AND 3));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_actions_shape_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_actions_shape_chk
        CHECK (neris_actions IS NULL OR jsonb_typeof(neris_actions) = 'array');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_noaction_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_noaction_chk
        CHECK (neris_noaction IS NULL OR neris_noaction IN ('CANCELLED','STAGED_STANDBY','NO_INCIDENT_FOUND'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_action_xor_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_action_xor_chk
        CHECK (NOT (neris_noaction IS NOT NULL AND jsonb_array_length(COALESCE(neris_actions, '[]'::jsonb)) > 0));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_fire_detail_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_fire_detail_chk
        CHECK (neris_fire_detail IS NULL OR jsonb_typeof(neris_fire_detail) = 'object');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_hazsit_detail_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_hazsit_detail_chk
        CHECK (neris_hazsit_detail IS NULL OR jsonb_typeof(neris_hazsit_detail) = 'object');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_medical_details_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_medical_details_chk
        CHECK (neris_medical_details IS NULL OR jsonb_typeof(neris_medical_details) = 'array');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_aids_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_aids_chk
        CHECK (neris_aids IS NULL OR jsonb_typeof(neris_aids) = 'array');
    END IF;
  END $$`);

  // ── 0061 self-heal: NERIS Phase 2 columns on an EXISTING db ────────────────
  // Mirrors docs/migrations/0061 (fresh installs get these from the CREATE TABLE
  // above). Same pattern as the 0060 block: individual statements, NOT one
  // swallow-all DO block; constraint adds guarded on pg_constraint.
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_casualty_rescues JSONB`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_dispatch_times   JSONB`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_status TEXT NOT NULL DEFAULT 'draft'`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_review JSONB`);
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_casualty_rescues_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_casualty_rescues_chk
        CHECK (neris_casualty_rescues IS NULL OR jsonb_typeof(neris_casualty_rescues) = 'array');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_dispatch_times_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_dispatch_times_chk
        CHECK (neris_dispatch_times IS NULL OR jsonb_typeof(neris_dispatch_times) = 'object');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_status_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_status_chk
        CHECK (neris_status IN ('draft','in_review','approved'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_review_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_review_chk
        CHECK (neris_review IS NULL OR jsonb_typeof(neris_review) = 'object');
    END IF;
  END $$`);

  // ── 0063 self-heal: NERIS Fire Protection column on an EXISTING db ─────────
  // Mirrors docs/migrations/0063 (fresh installs get it from the CREATE TABLE
  // above). Same pattern: individual statement + pg_constraint-guarded CHECK.
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_fire_protection JSONB`);
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_fire_protection_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_fire_protection_chk
        CHECK (neris_fire_protection IS NULL OR jsonb_typeof(neris_fire_protection) = 'object');
    END IF;
  END $$`);

  // ── 0064 self-heal: NERIS Track B submission axis on an EXISTING db ────────
  // Mirrors docs/migrations/0064. Individual statements; CHECKs guarded.
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_incident_uid TEXT`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_submission_state TEXT NOT NULL DEFAULT 'not_submitted'`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_incident_status TEXT`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_submission_log JSONB`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_submitted_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS neris_status_checked_at TIMESTAMPTZ`);
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_submission_state_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_submission_state_chk
        CHECK (neris_submission_state IN ('not_submitted','submitted','update_pending','submit_failed','refused'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incidents_neris_submission_log_chk' AND conrelid='public.incidents'::regclass) THEN
      ALTER TABLE public.incidents ADD CONSTRAINT incidents_neris_submission_log_chk
        CHECK (neris_submission_log IS NULL OR jsonb_typeof(neris_submission_log) = 'array');
    END IF;
  END $$`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_incidents_neris_sweep ON public.incidents (department_id)
    WHERE neris_submission_state IN ('submit_failed','update_pending')
       OR (neris_incident_uid IS NOT NULL
           AND neris_incident_status IN ('SUBMITTED','PENDING_APPROVAL','PENDING_INCIDENT_DATA'))`);
  await pool.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS neris_id TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS neris_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE`);

  // ── 0042 self-heal (backfilled 2026-07-20 — the migration was applied to
  // prod in June but never mirrored here, so a FRESH install lacked the column)
  // + 0065 self-heal: NERIS registry ids on stations/apparatus ────────────────
  await pool.query(`ALTER TABLE apparatus ADD COLUMN IF NOT EXISTS neris_type TEXT`);
  await pool.query(`ALTER TABLE stations  ADD COLUMN IF NOT EXISTS neris_station_id TEXT`);
  await pool.query(`ALTER TABLE apparatus ADD COLUMN IF NOT EXISTS neris_unit_id TEXT`);

  // Backfill incident_date from text date column
  await pool.query(`UPDATE incidents SET incident_date = date::date WHERE incident_date IS NULL AND date IS NOT NULL AND date != ''`).catch(() => {});

  // Training table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS training (
      id SERIAL PRIMARY KEY,
      "memberId" INTEGER DEFAULT 0,
      "memberName" TEXT DEFAULT '',
      "courseName" TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'Passed',
      "completedDate" TEXT,
      "expiresDate" TEXT,
      hours REAL DEFAULT 0,
      instructor TEXT DEFAULT '',
      location TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Maintenance table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS maintenance (
      id SERIAL PRIMARY KEY,
      "apparatusId" INTEGER DEFAULT 0,
      "apparatusName" TEXT DEFAULT '',
      type TEXT NOT NULL,
      priority TEXT DEFAULT 'Routine',
      status TEXT DEFAULT 'Pending',
      date TEXT NOT NULL,
      mileage INTEGER,
      "engineHours" REAL,
      description TEXT DEFAULT '',
      technician TEXT DEFAULT '',
      vendor TEXT DEFAULT '',
      "laborHours" REAL,
      "partsCost" REAL,
      "laborCost" REAL,
      "totalCost" REAL,
      "workOrder" TEXT DEFAULT '',
      "nextServiceMiles" INTEGER,
      "nextServiceDate" TEXT,
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Shifts table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shifts (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      "shiftType" TEXT NOT NULL,
      crew TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Shift patterns (recurring templates)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shift_patterns (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      "shiftType" TEXT NOT NULL,
      "startDate" TEXT NOT NULL,
      "endDate" TEXT,
      "repeatRule" TEXT NOT NULL DEFAULT 'weekly',
      "repeatDays" TEXT DEFAULT '[]',
      "memberIds" TEXT DEFAULT '[]',
      "minCrew" INTEGER DEFAULT 3,
      "isActive" BOOLEAN DEFAULT TRUE,
      notes TEXT DEFAULT '',
      station_id INTEGER DEFAULT 1,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Leave requests (PTO, sick, swap coverage)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id SERIAL PRIMARY KEY,
      "memberId" INTEGER NOT NULL,
      "memberName" TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'PTO',
      "startDate" TEXT NOT NULL,
      "endDate" TEXT NOT NULL,
      status TEXT DEFAULT 'Pending',
      "approvedBy" TEXT,
      "approvedAt" TIMESTAMPTZ,
      reason TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      station_id INTEGER DEFAULT 1,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Shift swap requests
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shift_swaps (
      id SERIAL PRIMARY KEY,
      "shiftId" INTEGER NOT NULL,
      "requesterId" INTEGER NOT NULL,
      "requesterName" TEXT NOT NULL,
      "coveredById" INTEGER,
      "coveredByName" TEXT,
      status TEXT DEFAULT 'Open',
      reason TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      station_id INTEGER DEFAULT 1,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Coverage Outreach tracking
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coverage_outreach (
      id SERIAL PRIMARY KEY,
      "leaveRequestId" INTEGER NOT NULL,
      "shiftId" INTEGER NOT NULL,
      "memberId" INTEGER NOT NULL,
      "memberName" TEXT NOT NULL,
      "contactMethod" TEXT DEFAULT 'sms',
      status TEXT DEFAULT 'Pending',
      "sentAt" TIMESTAMPTZ,
      "respondedAt" TIMESTAMPTZ,
      response TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      station_id INTEGER DEFAULT 1,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Station Log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS station_log (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      shift TEXT DEFAULT 'Day',
      "officerOnDuty" TEXT DEFAULT '',
      "membersOnDuty" TEXT DEFAULT '[]',
      "weatherConditions" TEXT DEFAULT '',
      "callCount" INTEGER DEFAULT 0,
      "apparatusChecked" BOOLEAN DEFAULT FALSE,
      "stationChecked" BOOLEAN DEFAULT FALSE,
      events TEXT DEFAULT '[]',
      visitors TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Fire Inspection Properties table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_properties (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT DEFAULT '',
      "occupancyType" TEXT DEFAULT '',
      "propertyUseCode" TEXT DEFAULT '',
      "ownerName" TEXT DEFAULT '',
      "ownerPhone" TEXT DEFAULT '',
      "ownerEmail" TEXT DEFAULT '',
      "contactName" TEXT DEFAULT '',
      "contactPhone" TEXT DEFAULT '',
      "squareFootage" INTEGER,
      stories INTEGER DEFAULT 1,
      "occupantLoad" INTEGER,
      sprinklered BOOLEAN DEFAULT FALSE,
      "alarmMonitored" BOOLEAN DEFAULT FALSE,
      "hazmatOnsite" BOOLEAN DEFAULT FALSE,
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
  `);

  // Fire Inspections table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_inspections (
      id SERIAL PRIMARY KEY,
      "propertyId" INTEGER NOT NULL,
      type TEXT DEFAULT 'Annual Inspection',
      "inspectorName" TEXT DEFAULT '',
      "scheduledDate" TEXT,
      "completedDate" TEXT,
      -- result      = the historical record, VERBATIM. Display only. Never an input to a decision.
      -- result_code = the CONTROL value (migration 0056). A closed set, matched EXACTLY.
      -- Before 0056 the pass-with-open-violations doctrine was enforced by /^pass\\b/i against
      -- this free-text column — and "Passed"/"Passing" sailed straight through it. Never again:
      -- nothing pattern-matches a result. See constants/inspectionResult.js.
      result TEXT,
      result_code TEXT
        CONSTRAINT fi_inspections_result_code_chk
        CHECK (result_code IS NULL OR result_code IN ('PASS','FAIL','REINSPECTION_REQUIRED','NOT_COMPLETED')),
      violations TEXT DEFAULT '[]',
      "followUpDate" TEXT,
      notes TEXT DEFAULT '',
      assigned_to_user_id INTEGER,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
  `);
  // NOTE (2026-07-13): idx_fi_inspections_assignee is NOT created here — it was,
  // and it broke every fresh install. fi_inspections does not declare
  // department_id in its CREATE TABLE; it acquires the column later, in
  // applyDepartmentExpand(). Indexing (department_id, …) at this point therefore
  // throws 42703 on a blank DB and aborts initDb after ~15 tables. Same trap that
  // caught idx_members_crew on 2026-07-12. The index now lives in
  // applyDepartmentExpand, after the column exists. Do not move it back.

  // Fire Permits table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_permits (
      id SERIAL PRIMARY KEY,
      "propertyId" INTEGER NOT NULL,
      type TEXT NOT NULL,
      "permitNumber" TEXT DEFAULT '',
      "issuedDate" TEXT,
      "expiresDate" TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      "issuedBy" TEXT DEFAULT '',
      fee NUMERIC(12,2),
      conditions TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      issued_by_user_id INTEGER,
      superseded_by_permit_id INTEGER,
      revoked_at TIMESTAMPTZ,
      terminated_at TIMESTAMPTZ,
      revocation_ground TEXT,
      revocation_ground_citation TEXT,
      revocation_basis TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
  `);
  // Migration 0090 mirror (fresh installs) — applied to prod by hand 2026-07-26.
  // Existing prod is ALTERed by the migration; these run only on a fresh DB.
  //  - fee is NUMERIC, never REAL: IEEE-754 floating point for money.
  //  - status defaults to 'Pending': a created permit has not been ISSUED.
  //  - permit numbers are unique per department and span soft-deleted rows — a
  //    document number is consumed once and never reused (blank/NULL excluded so a
  //    legacy blank can't become a hard insert failure).
  //  - the propertyId FK is RESTRICT, not CASCADE: a permit is the record of a
  //    regulatory act and must not vanish with a property cleanup.
  // NOTE: the (department_id, "permitNumber") unique index is NOT here — fi_permits
  // only acquires department_id in the DEPT_TABLES loop later in this function, so
  // it is created there (same relocation precedent as idx_members_crew, 2026-07-12).
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_permits_property ON fi_permits ("propertyId");`);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE fi_permits ADD CONSTRAINT fi_permits_property_fk
        FOREIGN KEY ("propertyId") REFERENCES fi_properties (id) ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
  `);

  // ── Migration 0092 mirror — permit lifecycle core (3.1a). Prod-applied 2026-07-27. ──
  // These ALTERs are NOT redundant with the CREATE TABLE above: `CREATE TABLE IF NOT
  // EXISTS` cannot alter a table that already exists, so a dev DB created before 3.1a
  // would silently never get these columns. That exact gap is what produced 0091.
  await pool.query(`
    ALTER TABLE fi_permits
      ADD COLUMN IF NOT EXISTS superseded_by_permit_id    INTEGER,
      ADD COLUMN IF NOT EXISTS revoked_at                 TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS terminated_at              TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS revocation_ground          TEXT,
      ADD COLUMN IF NOT EXISTS revocation_ground_citation TEXT,
      ADD COLUMN IF NOT EXISTS revocation_basis           TEXT;
  `);
  await pool.query(`UPDATE fi_permits SET status = 'Pending' WHERE status IS NULL;`);
  await pool.query(`
    DO $$ BEGIN ALTER TABLE fi_permits ALTER COLUMN status SET NOT NULL;
    EXCEPTION WHEN others THEN NULL; END $$;
  `);
  // status is a CONTROL value — it decides whether a permit is valid. This repo has paid
  // twice for leaving one as free text (the /^pass\\b/i regex that let "Passed" defeat a
  // life-safety guard, closed by 0056; and 'Abated' counting as open forever). The server
  // owns the set in constants/permitStatus.js; this puts Postgres behind it.
  // NOT NULL matters: a CHECK passes on NULL (unknown), so without it a NULL status would
  // slip straight through the constraint.
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE fi_permits ADD CONSTRAINT fi_permits_status_chk
        CHECK (status IN ('Pending','Active','AboutToExpire','Delinquent','Expired',
                          'Revoked','Denied','TerminatedByTransfer'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  // ⚠ The list above is the 0094 (3.1b) set, not 0092's. AboutToExpire and Delinquent are
  // the two phases the documented market places BETWEEN in-force and dead, and 'Expired' is
  // the TRAPDOOR where renewal is withdrawn — grace runs UPSTREAM of it. Widened here rather
  // than added as a second block because a fresh install needs the FINAL state in one place;
  // a second ADD CONSTRAINT would no-op against the first and leave new installs on the old
  // set — which is exactly the class of gap that produced 0091.
  // IFC §105.3.1 — a permit is not transferable; a change of occupancy/operation/tenancy/
  // ownership terminates it and mints a successor. RESTRICT, never CASCADE: deleting a
  // successor must not destroy the record of what it superseded.
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE fi_permits ADD CONSTRAINT fi_permits_superseded_by_fk
        FOREIGN KEY (superseded_by_permit_id) REFERENCES fi_permits (id) ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fi_permits_superseded_by
      ON fi_permits (superseded_by_permit_id) WHERE superseded_by_permit_id IS NOT NULL;
  `);
  // The SEVEN model grounds (IFC §105.4) + LOCAL_GROUND. The model list is prefaced
  // "including, but not limited to", so a hard-closed set of seven would BLOCK a lawful
  // local revocation — LOCAL_GROUND is the lawful escape, and it is a coded value with a
  // CONTRACT (a citation is required), not a return to free text.
  // Keep in lockstep with constants/permitGrounds.js.
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE fi_permits ADD CONSTRAINT fi_permits_revocation_ground_chk
        CHECK (revocation_ground IS NULL OR revocation_ground IN (
          'MISREPRESENTATION','DIFFERENT_LOCATION','DIFFERENT_ACTIVITY','CONDITION_VIOLATED',
          'DIFFERENT_PERSON','NONCOMPLIANCE_WITH_ORDER','ISSUED_IN_ERROR','LOCAL_GROUND'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE fi_permits ADD CONSTRAINT fi_permits_local_ground_citation_chk
        CHECK (revocation_ground IS DISTINCT FROM 'LOCAL_GROUND'
               OR (revocation_ground_citation IS NOT NULL AND btrim(revocation_ground_citation) <> ''));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  // A ground says what KIND; the basis says what HAPPENED. A revocation is never reason-free.
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE fi_permits ADD CONSTRAINT fi_permits_revocation_basis_chk
        CHECK (revocation_ground IS NULL
               OR (revocation_basis IS NOT NULL AND btrim(revocation_basis) <> ''));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // ── Migration 0093 mirror — the permit type catalogue + effective-dated expiration
  //    rule groups (Phase 3, module 3.1b). Spec §3.1–3.2.
  //
  //    WHY A MIRROR AT ALL: initDb() fast-paths on an existing database, so these blocks
  //    run only on a FRESH install. A migration applied by hand to prod and NOT mirrored
  //    here leaves new installs missing the table — the gap that produced 0091.
  //
  //    Duration deliberately does NOT live on the type: neither documented platform
  //    carries a scalar term. It lives in the rule group, alongside the about-to-expire
  //    window and the grace period. Single basis, from issuance — the market's multi-basis
  //    axis is construction machinery.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_permit_expiration_rule_groups (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      name          TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (department_id, name)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_permit_expiration_rules (
      id                  SERIAL PRIMARY KEY,
      department_id       INTEGER NOT NULL,
      group_id            INTEGER NOT NULL REFERENCES fi_permit_expiration_rule_groups(id) ON DELETE RESTRICT,
      version             INTEGER NOT NULL CHECK (version > 0),
      term_value          INTEGER NOT NULL CHECK (term_value > 0),
      term_unit           TEXT    NOT NULL CHECK (term_unit IN ('day','month','year')),
      notice_window_days  INTEGER NOT NULL DEFAULT 30 CHECK (notice_window_days >= 0),
      grace_days          INTEGER NOT NULL DEFAULT 0 CHECK (grace_days >= 0),
      effective_from      DATE NOT NULL,
      effective_to        DATE,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by_user_id  INTEGER,
      UNIQUE (group_id, version),
      CHECK (effective_to IS NULL OR effective_to >= effective_from)
    );
  `);
  // Exactly ONE open version per group — an ambiguous "which rule applies today" is how an
  // issued permit ends up with a term nobody can reconstruct.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_fi_permit_expiration_rules_open
      ON fi_permit_expiration_rules (group_id) WHERE effective_to IS NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_permit_types (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      code          TEXT NOT NULL,
      name          TEXT NOT NULL,
      ifc_section   TEXT,
      expiration_rule_group_id INTEGER REFERENCES fi_permit_expiration_rule_groups(id) ON DELETE RESTRICT,
      fee_schedule_id INTEGER,
      requires_inspection BOOLEAN NOT NULL DEFAULT FALSE,
      allow_renewal BOOLEAN NOT NULL DEFAULT TRUE,
      portal_visibility TEXT NOT NULL DEFAULT 'staff_only'
        CHECK (portal_visibility IN ('staff_only','view_only','apply_online')),
      autonumber_prefix TEXT,
      status        TEXT NOT NULL DEFAULT 'Draft'
        CHECK (status IN ('Draft','Active','Retired')),
      valid_from    DATE,
      valid_to      DATE,
      version               INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      superseded_by_type_id INTEGER REFERENCES fi_permit_types(id) ON DELETE RESTRICT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
    );
  `);
  // A retired type KEEPS its code (its issued permits reference it), so uniqueness is
  // scoped to the live ones — otherwise clone-and-retire collides with itself.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_fi_permit_types_dept_code_live
      ON fi_permit_types (department_id, code) WHERE status <> 'Retired';
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_permit_types_dept ON fi_permit_types (department_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_permit_types_dept_status ON fi_permit_types (department_id, status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_permit_expiration_rule_groups_dept ON fi_permit_expiration_rule_groups (department_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_permit_expiration_rules_group ON fi_permit_expiration_rules (group_id, effective_from DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_permit_expiration_rules_dept ON fi_permit_expiration_rules (department_id);`);

  // ── Migration 0094 mirror — the R7 snapshot on fi_permits + write-once enforcement.
  //    An issued permit stores the term IN FORCE AT ISSUANCE; a later catalogue edit changes
  //    only future issuances. Recorded honestly: this is NOT a market copy — no admin guide
  //    reached states what happens to an already-issued permit when its type is edited, and
  //    one platform ships retain-vs-adopt as a switch with no documented default. R7 is this
  //    repo's RECORD_FINALIZED doctrine filling a genuine silence.
  await pool.query(`ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS permit_type_id     INTEGER;`);
  await pool.query(`ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS expiration_rule_id INTEGER;`);
  await pool.query(`ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS term_value         INTEGER;`);
  await pool.query(`ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS term_unit          TEXT;`);
  await pool.query(`ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS notice_window_days INTEGER;`);
  await pool.query(`ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS grace_days         INTEGER;`);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE fi_permits ADD CONSTRAINT fi_permits_permit_type_fk
        FOREIGN KEY (permit_type_id) REFERENCES fi_permit_types(id) ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE fi_permits ADD CONSTRAINT fi_permits_expiration_rule_fk
        FOREIGN KEY (expiration_rule_id) REFERENCES fi_permit_expiration_rules(id) ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE fi_permits ADD CONSTRAINT fi_permits_term_chk
        CHECK ((term_value IS NULL OR term_value > 0)
           AND (term_unit  IS NULL OR term_unit IN ('day','month','year'))
           AND (notice_window_days IS NULL OR notice_window_days >= 0)
           AND (grace_days IS NULL OR grace_days >= 0));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fi_permits_type ON fi_permits (permit_type_id)
      WHERE permit_type_id IS NOT NULL;
  `);
  // WRITE-ONCE. of_app holds TABLE-LEVEL UPDATE on fi_permits, so a new column is writable
  // by default — every "snapshot" would have been freely rewritable, which is the 0082
  // finding again. A snapshot that can be edited is not a snapshot. NULL -> value is the
  // issuance write and is allowed; value -> same value must stay allowed or every unrelated
  // UPDATE breaks; value -> different is refused. Table-specific by design (the repo has
  // been burned by a shared trigger throwing 42703 across ~100 unrelated tables).
  await pool.query(`
    CREATE OR REPLACE FUNCTION fi_permits_snapshot_write_once()
    RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
    BEGIN
      IF OLD.permit_type_id IS NOT NULL AND NEW.permit_type_id IS DISTINCT FROM OLD.permit_type_id THEN
        RAISE EXCEPTION 'permit_type_id is fixed at issuance (R7 snapshot) and cannot be changed' USING ERRCODE = 'check_violation';
      END IF;
      IF OLD.expiration_rule_id IS NOT NULL AND NEW.expiration_rule_id IS DISTINCT FROM OLD.expiration_rule_id THEN
        RAISE EXCEPTION 'expiration_rule_id is fixed at issuance (R7 snapshot) and cannot be changed' USING ERRCODE = 'check_violation';
      END IF;
      IF OLD.term_value IS NOT NULL AND NEW.term_value IS DISTINCT FROM OLD.term_value THEN
        RAISE EXCEPTION 'term_value is fixed at issuance (R7 snapshot) and cannot be changed' USING ERRCODE = 'check_violation';
      END IF;
      IF OLD.term_unit IS NOT NULL AND NEW.term_unit IS DISTINCT FROM OLD.term_unit THEN
        RAISE EXCEPTION 'term_unit is fixed at issuance (R7 snapshot) and cannot be changed' USING ERRCODE = 'check_violation';
      END IF;
      IF OLD.notice_window_days IS NOT NULL AND NEW.notice_window_days IS DISTINCT FROM OLD.notice_window_days THEN
        RAISE EXCEPTION 'notice_window_days is fixed at issuance (R7 snapshot) and cannot be changed' USING ERRCODE = 'check_violation';
      END IF;
      IF OLD.grace_days IS NOT NULL AND NEW.grace_days IS DISTINCT FROM OLD.grace_days THEN
        RAISE EXCEPTION 'grace_days is fixed at issuance (R7 snapshot) and cannot be changed' USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END $fn$;
  `);
  await pool.query(`DROP TRIGGER IF EXISTS trg_fi_permits_snapshot_write_once ON fi_permits;`);
  await pool.query(`
    CREATE TRIGGER trg_fi_permits_snapshot_write_once
      BEFORE UPDATE ON fi_permits
      FOR EACH ROW EXECUTE FUNCTION fi_permits_snapshot_write_once();
  `);
  // ── Migration 0095 mirror — the append-only scheduled-job run ledger (R8).
  //    ONE ROW PER RUN, WRITTEN AT THE END, and physically append-only. A row that could be
  //    updated after the fact cannot answer the only question this table exists to answer:
  //    did this job actually run? A run that dies mid-flight therefore leaves NO row — that
  //    absence IS the signal, and it is what the staleness check reads.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_job_runs (
      id             SERIAL PRIMARY KEY,
      department_id  INTEGER NOT NULL,
      job_name       TEXT NOT NULL CHECK (job_name IN ('permit_expiry')),
      started_at     TIMESTAMPTZ NOT NULL,
      finished_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      outcome        TEXT NOT NULL CHECK (outcome IN ('success','failed')),
      evaluated_for  DATE NOT NULL,
      examined       INTEGER NOT NULL DEFAULT 0,
      transitioned   INTEGER NOT NULL DEFAULT 0,
      skipped_no_terms INTEGER NOT NULL DEFAULT 0,
      -- 0117 mirror: a run that transitioned 12 permits and notified 0 is a broken run that
      -- every other counter on this row would report as healthy.
      notified       INTEGER NOT NULL DEFAULT 0,
      error          TEXT,
      CHECK (finished_at >= started_at),
      CHECK ((outcome = 'failed') OR (error IS NULL))
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_job_runs_dept_job ON fi_job_runs (department_id, job_name, finished_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_job_runs_last_success ON fi_job_runs (department_id, job_name, finished_at DESC) WHERE outcome = 'success';`);
  // 0117 mirror for installs created between 0095 and 0117: CREATE TABLE IF NOT EXISTS above
  // is a no-op on an existing table, so the column needs its own additive statement.
  await pool.query(`ALTER TABLE fi_job_runs ADD COLUMN IF NOT EXISTS notified INTEGER NOT NULL DEFAULT 0`);

  // 0116 mirror (Phase 3.1b) — the expiry-notice ledger.
  //    NOT fi_notices: that table is the VIOLATION notice, a served legal instrument whose
  //    inspection_id is a NOT NULL FK. An expiry notice has no inspection. Per R1 the market's
  //    expiry artifacts are reminders and invoices (spec §0.1), not served instruments, so the
  //    Jones v. Flowers service machinery deliberately does NOT apply here.
  //    Three kinds, mirroring the ladder's target status — 'delinquent' is the documented
  //    +30-day late notice and notifying without it would be less than the market.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_permit_notices (
      id             SERIAL PRIMARY KEY,
      department_id  INTEGER NOT NULL,
      permit_id      INTEGER NOT NULL REFERENCES fi_permits(id) ON DELETE RESTRICT,
      notice_kind    TEXT NOT NULL CHECK (notice_kind IN ('about_to_expire','delinquent','expired')),
      audience       TEXT NOT NULL CHECK (audience IN ('permittee','bureau')),
      from_status    TEXT NOT NULL,
      to_status      TEXT NOT NULL,
      evaluated_for  DATE NOT NULL,
      recipient_email TEXT NOT NULL DEFAULT '',
      subject        TEXT NOT NULL DEFAULT '',
      body           TEXT NOT NULL DEFAULT '',
      delivery_state TEXT NOT NULL DEFAULT 'queued'
                     CHECK (delivery_state IN ('queued','sent','failed','no_recipient')),
      delivery_error TEXT,
      sent_at        TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ((delivery_state = 'sent') = (sent_at IS NOT NULL)),
      CHECK ((delivery_state = 'failed') OR (delivery_error IS NULL))
    );
  `);
  // The idempotency guard is a DATABASE invariant, not a code convention: spec §6 row 10
  // ("no duplicate notifications"). A code-level "did we already?" check races; this cannot.
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_fi_permit_notices_once ON fi_permit_notices (department_id, permit_id, notice_kind, audience);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_permit_notices_dept_created ON fi_permit_notices (department_id, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_permit_notices_permit ON fi_permit_notices (department_id, permit_id);`);
  // Append-only, trigger-enforced. The notice FACT is immutable; only the delivery seam moves,
  // and only out of 'queued'. Mirrored here so a fresh install is not silently unguarded.
  await pool.query(`
    CREATE OR REPLACE FUNCTION fi_permit_notices_immutable()
    RETURNS TRIGGER AS $fn$
    BEGIN
      IF OLD.delivery_state <> 'queued' THEN
        RAISE EXCEPTION 'fi_permit_notices %: delivery already resolved as %, it cannot change again',
          OLD.id, OLD.delivery_state;
      END IF;
      IF NEW.id              IS DISTINCT FROM OLD.id
      OR NEW.department_id   IS DISTINCT FROM OLD.department_id
      OR NEW.permit_id       IS DISTINCT FROM OLD.permit_id
      OR NEW.notice_kind     IS DISTINCT FROM OLD.notice_kind
      OR NEW.audience        IS DISTINCT FROM OLD.audience
      OR NEW.from_status     IS DISTINCT FROM OLD.from_status
      OR NEW.to_status       IS DISTINCT FROM OLD.to_status
      OR NEW.evaluated_for   IS DISTINCT FROM OLD.evaluated_for
      OR NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
      OR NEW.subject         IS DISTINCT FROM OLD.subject
      OR NEW.body            IS DISTINCT FROM OLD.body
      OR NEW.created_at      IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'fi_permit_notices %: the notice record is append-only; only delivery_state, sent_at and delivery_error may change', OLD.id;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql SET search_path = public, pg_temp;
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_fi_permit_notices_immutable ON fi_permit_notices');
  await pool.query(`
    CREATE TRIGGER trg_fi_permit_notices_immutable
      BEFORE UPDATE ON fi_permit_notices
      FOR EACH ROW EXECUTE FUNCTION fi_permit_notices_immutable();
  `);

  // 0118 mirror (Phase 3.2 Slice A) — fee schedules + the assessment record.
  //    Shape rationale lives in docs/migrations/0118-fi-fee-schedules.sql; the short version is
  //    that it is the negative image of three published government audits (spec §1.9): adopted
  //    fee terms are FROZEN (a change is a new version), an adopted version must name the
  //    instrument that adopted it, zero-fee assessments are first-class rather than absences,
  //    and a re-inspection fee cannot exist without an attested human reason (§1.6 — one
  //    county's own matrix has two near-identical rows with OPPOSITE outcomes, discriminated
  //    only by a judgment about fault).
  //    Mirrored here in full — triggers and grants included — because a fresh install that got
  //    the tables but not the guards would be silently unguarded, which is worse than not
  //    having the feature.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_fee_schedules (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      name          TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (department_id, name)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_fee_schedule_versions (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      schedule_id   INTEGER NOT NULL REFERENCES fi_fee_schedules(id) ON DELETE RESTRICT,
      version       INTEGER NOT NULL CHECK (version > 0),
      status        TEXT NOT NULL DEFAULT 'Draft'
                    CHECK (status IN ('Draft','Adopted','Superseded')),
      adopting_instrument     TEXT CHECK (adopting_instrument IN
                                ('ordinance','ordinance_exhibit','code_appendix','board_resolution',
                                 'resolution_under_enabling_ordinance')),
      adopting_instrument_ref TEXT,
      adopted_by              TEXT,
      adopted_on              DATE,
      effective_from      DATE NOT NULL,
      effective_to        DATE,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by_user_id  INTEGER,
      penalty_multiplier       NUMERIC(4,2) NOT NULL DEFAULT 2.00
                               CHECK (penalty_multiplier >= 1.50 AND penalty_multiplier <= 4.00),
      penalty_stacking_allowed BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE (schedule_id, version),
      CHECK (effective_to IS NULL OR effective_to >= effective_from),
      CHECK (status = 'Draft' OR (adopting_instrument IS NOT NULL
                                  AND adopting_instrument_ref IS NOT NULL
                                  AND adopted_by IS NOT NULL
                                  AND adopted_on IS NOT NULL))
    );
  `);
  // Exactly ONE open version per schedule — two makes "which fee applied on the day this was
  // assessed" ambiguous, and an ambiguous answer there IS the rate-table audit finding.
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_fi_fee_schedule_versions_open ON fi_fee_schedule_versions (schedule_id) WHERE effective_to IS NULL;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_fee_items (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      version_id    INTEGER NOT NULL REFERENCES fi_fee_schedule_versions(id) ON DELETE RESTRICT,
      code          TEXT NOT NULL,
      name          TEXT NOT NULL,
      kind          TEXT NOT NULL CHECK (kind IN
                      ('flat','tiered','valuation','hourly','percent_of','surcharge')),
      input_variable TEXT CHECK (input_variable IN
                       ('square_footage','occupant_load','stories','sprinkler_heads','alarm_devices',
                        'smoke_heat_vents','gate_count','tank_count','chemical_count','licensed_beds',
                        'students','apartment_units','hotel_rooms','hazmat_quantity',
                        'construction_valuation','job_material_cost','acres','outside_storage_area',
                        'hours','occupancy_group')),
      input_item_id  INTEGER REFERENCES fi_fee_items(id) ON DELETE RESTRICT,
      tier_axis_2    TEXT CHECK (tier_axis_2 IN
                       ('square_footage','occupant_load','stories','sprinkler_heads','alarm_devices',
                        'smoke_heat_vents','gate_count','tank_count','chemical_count','licensed_beds',
                        'students','apartment_units','hotel_rooms','hazmat_quantity',
                        'construction_valuation','job_material_cost','acres','outside_storage_area',
                        'hours','occupancy_group')),
      flat_amount   NUMERIC(12,2) CHECK (flat_amount IS NULL OR flat_amount >= 0),
      hourly_rate       NUMERIC(10,2) CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
      minimum_hours     NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (minimum_hours >= 0),
      rounding_increment_hours NUMERIC(6,4)
                        CHECK (rounding_increment_hours IS NULL OR rounding_increment_hours > 0),
      rounding_mode     TEXT NOT NULL DEFAULT 'up_any_part'
                        CHECK (rounding_mode IN ('up_any_part','nearest','down','none')),
      after_hours_multiplier NUMERIC(4,2)
                        CHECK (after_hours_multiplier IS NULL OR after_hours_multiplier >= 1.00),
      percent_rate  NUMERIC(7,4) CHECK (percent_rate IS NULL OR percent_rate >= 0),
      surchargeable BOOLEAN NOT NULL DEFAULT TRUE,
      min_amount    NUMERIC(12,2) CHECK (min_amount IS NULL OR min_amount >= 0),
      max_amount    NUMERIC(12,2) CHECK (max_amount IS NULL OR max_amount >= 0),
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (version_id, code),
      CHECK (input_item_id IS NULL OR input_item_id <> id),
      CHECK (max_amount IS NULL OR min_amount IS NULL OR max_amount >= min_amount),
      CHECK (NOT (kind = 'surcharge' AND surchargeable)),
      CHECK (kind <> 'flat'       OR flat_amount IS NOT NULL),
      CHECK (kind <> 'hourly'     OR hourly_rate IS NOT NULL),
      CHECK (kind <> 'percent_of' OR (percent_rate IS NOT NULL AND input_item_id IS NOT NULL)),
      CHECK (kind <> 'surcharge'  OR percent_rate IS NOT NULL),
      CHECK (kind <> 'tiered'     OR input_variable IS NOT NULL),
      CHECK (kind <> 'valuation'  OR input_variable IS NOT NULL OR input_item_id IS NOT NULL)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_fee_item_tiers (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      item_id       INTEGER NOT NULL REFERENCES fi_fee_items(id) ON DELETE RESTRICT,
      axis1_min     NUMERIC(16,4),
      axis1_max     NUMERIC(16,4),
      axis1_match   TEXT,
      axis2_min     NUMERIC(16,4),
      axis2_max     NUMERIC(16,4),
      axis2_match   TEXT,
      amount        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
      per_unit      NUMERIC(12,4) CHECK (per_unit IS NULL OR per_unit >= 0),
      unit_size     NUMERIC(16,4) CHECK (unit_size IS NULL OR unit_size > 0),
      -- 0120: the basis is the tier's to STATE. "$250 plus $15 per 1,000 sq ft" is $370 or $295
      -- on the same building depending on this field, so it has no default and is required
      -- exactly when per_unit is present.
      -- WARNING: the two CHECKs on this column are deliberately NOT inline. They are added by the
      -- guarded ALTER block below, under the SAME NAMES migration 0120 uses. Declaring them
      -- inline as well produced anonymous duplicates (per_unit_basis_check alongside
      -- per_unit_basis_ck), so a fresh install carried 72 constraints where a migrated database
      -- carried 70 — a fingerprint mismatch, caught by comparing the two.
      -- (No backticks in this comment: it lives inside a JS template literal.)
      per_unit_basis TEXT,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (axis1_max IS NULL OR axis1_min IS NULL OR axis1_max > axis1_min),
      CHECK (axis2_max IS NULL OR axis2_min IS NULL OR axis2_max > axis2_min),
      CHECK (axis1_match IS NULL OR (axis1_min IS NULL AND axis1_max IS NULL)),
      CHECK (axis2_match IS NULL OR (axis2_min IS NULL AND axis2_max IS NULL)),
      CHECK ((per_unit IS NULL) = (unit_size IS NULL))
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_fee_item_modifiers (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      item_id       INTEGER NOT NULL REFERENCES fi_fee_items(id) ON DELETE RESTRICT,
      seq           INTEGER NOT NULL CHECK (seq > 0),
      kind          TEXT NOT NULL CHECK (kind IN
                      ('percent_add','percent_multiply','amount_add','per_unit_add','floor','cap')),
      value         NUMERIC(16,4) NOT NULL,
      per_unit_variable TEXT CHECK (per_unit_variable IN
                       ('square_footage','occupant_load','stories','sprinkler_heads','alarm_devices',
                        'smoke_heat_vents','gate_count','tank_count','chemical_count','licensed_beds',
                        'students','apartment_units','hotel_rooms','hazmat_quantity',
                        'construction_valuation','job_material_cost','acres','outside_storage_area',
                        'hours','occupancy_group')),
      unit_size     NUMERIC(16,4) CHECK (unit_size IS NULL OR unit_size > 0),
      note          TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (item_id, seq),
      CHECK (kind <> 'per_unit_add' OR (per_unit_variable IS NOT NULL AND unit_size IS NOT NULL))
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_fee_assessments (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      permit_id     INTEGER REFERENCES fi_permits(id) ON DELETE RESTRICT,
      inspection_id INTEGER REFERENCES fi_inspections(id) ON DELETE RESTRICT,
      CHECK ((permit_id IS NOT NULL) <> (inspection_id IS NOT NULL)),
      assessment_kind TEXT NOT NULL DEFAULT 'base' CHECK (assessment_kind IN
                        ('base','reinspection','penalty_work_without_permit','surcharge','other')),
      schedule_version_id INTEGER NOT NULL
                          REFERENCES fi_fee_schedule_versions(id) ON DELETE RESTRICT,
      vesting_date        DATE NOT NULL,
      inputs            JSONB NOT NULL DEFAULT '{}'::jsonb,
      computed_amount   NUMERIC(12,2) NOT NULL CHECK (computed_amount >= 0),
      computed_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
      computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      committed_amount    NUMERIC(12,2) CHECK (committed_amount IS NULL OR committed_amount >= 0),
      committed_by_user_id INTEGER,
      committed_at        TIMESTAMPTZ,
      override_reason     TEXT,
      reason_code        TEXT,
      reason_text        TEXT,
      attested_by_user_id INTEGER,
      waiver_amount    NUMERIC(12,2) CHECK (waiver_amount IS NULL OR waiver_amount >= 0),
      waiver_reason    TEXT,
      waived_by_user_id INTEGER,
      waived_at        TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ((committed_amount IS NULL) = (committed_at IS NULL)),
      CHECK (committed_amount IS NULL OR committed_by_user_id IS NOT NULL),
      CHECK (committed_amount IS NULL OR committed_amount = computed_amount
             OR (override_reason IS NOT NULL AND length(btrim(override_reason)) > 0)),
      CHECK (assessment_kind <> 'reinspection'
             OR (reason_code IS NOT NULL AND attested_by_user_id IS NOT NULL)),
      CHECK (waiver_amount IS NULL
             OR (waiver_reason IS NOT NULL AND length(btrim(waiver_reason)) > 0
                 AND waived_by_user_id IS NOT NULL AND waived_at IS NOT NULL))
    );
  `);
  // 0120 mirror for installs created between 0118 and 0120: CREATE TABLE IF NOT EXISTS above is
  // a no-op on an existing table, so the column and its pairing rule need their own statements.
  await pool.query(`ALTER TABLE fi_fee_item_tiers ADD COLUMN IF NOT EXISTS per_unit_basis TEXT`);
  await pool.query(`
    DO $pub$
    DECLARE offending INT;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_fee_item_tiers_per_unit_basis_ck') THEN
        ALTER TABLE fi_fee_item_tiers ADD CONSTRAINT fi_fee_item_tiers_per_unit_basis_ck
          CHECK (per_unit_basis IS NULL OR per_unit_basis IN ('whole_quantity','excess_above_floor'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_fee_item_tiers_per_unit_complete_ck') THEN
        ALTER TABLE fi_fee_item_tiers ADD CONSTRAINT fi_fee_item_tiers_per_unit_complete_ck
          CHECK ((per_unit IS NULL) = (per_unit_basis IS NULL)) NOT VALID;
      END IF;
      SELECT count(*) INTO offending FROM fi_fee_item_tiers
       WHERE (per_unit IS NULL) <> (per_unit_basis IS NULL);
      IF offending = 0 THEN
        ALTER TABLE fi_fee_item_tiers VALIDATE CONSTRAINT fi_fee_item_tiers_per_unit_complete_ck;
      END IF;
    END $pub$;
  `);

  // Closes 3.1b's fee_schedule_id seam. Guarded because ADD CONSTRAINT is not IF NOT EXISTS.
  await pool.query(`
    DO $seam$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fi_permit_types_fee_schedule') THEN
        ALTER TABLE fi_permit_types
          ADD CONSTRAINT fk_fi_permit_types_fee_schedule
          FOREIGN KEY (fee_schedule_id) REFERENCES fi_fee_schedules(id) ON DELETE RESTRICT;
      END IF;
    END $seam$;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_schedules_dept ON fi_fee_schedules (department_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_schedule_versions_sched ON fi_fee_schedule_versions (schedule_id, effective_from DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_schedule_versions_dept ON fi_fee_schedule_versions (department_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_items_version ON fi_fee_items (version_id, sort_order);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_items_dept ON fi_fee_items (department_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_items_input ON fi_fee_items (input_item_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_item_tiers_item ON fi_fee_item_tiers (item_id, sort_order);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_item_tiers_dept ON fi_fee_item_tiers (department_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_item_modifiers_item ON fi_fee_item_modifiers (item_id, seq);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_item_modifiers_dept ON fi_fee_item_modifiers (department_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_assessments_permit ON fi_fee_assessments (department_id, permit_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_assessments_inspection ON fi_fee_assessments (department_id, inspection_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_assessments_dept_created ON fi_fee_assessments (department_id, created_at DESC);`);
  // F18: the auditor's FIRST stop is voided and zero-fee records. If that query is a full scan,
  // nobody runs it — so the zero-fee case gets its own partial index.
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_fee_assessments_zero_fee ON fi_fee_assessments (department_id, created_at DESC) WHERE computed_amount = 0 OR committed_amount = 0;`);
  // Adopted fee terms are frozen. Enforced at the DATABASE and not in the route, so it holds
  // regardless of who is asking — which is what makes F14 (an inspector editing the fee
  // schedule) a property of the schema rather than of the route being written correctly.
  await pool.query(`
    CREATE OR REPLACE FUNCTION fi_fee_schedule_versions_freeze()
    RETURNS TRIGGER AS $fn$
    BEGIN
      IF OLD.status = 'Draft' THEN
        RETURN NEW;
      END IF;
      IF NEW.id                      IS DISTINCT FROM OLD.id
      OR NEW.department_id           IS DISTINCT FROM OLD.department_id
      OR NEW.schedule_id             IS DISTINCT FROM OLD.schedule_id
      OR NEW.version                 IS DISTINCT FROM OLD.version
      OR NEW.effective_from          IS DISTINCT FROM OLD.effective_from
      OR NEW.adopting_instrument     IS DISTINCT FROM OLD.adopting_instrument
      OR NEW.adopting_instrument_ref IS DISTINCT FROM OLD.adopting_instrument_ref
      OR NEW.adopted_by              IS DISTINCT FROM OLD.adopted_by
      OR NEW.adopted_on              IS DISTINCT FROM OLD.adopted_on
      OR NEW.penalty_multiplier      IS DISTINCT FROM OLD.penalty_multiplier
      OR NEW.penalty_stacking_allowed IS DISTINCT FROM OLD.penalty_stacking_allowed
      OR NEW.created_at              IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'fi_fee_schedule_versions %: version is % — adopted fee terms are frozen. Author a NEW version; only effective_to and status may change.', OLD.id, OLD.status;
      END IF;
      IF NEW.status = 'Draft' THEN
        RAISE EXCEPTION 'fi_fee_schedule_versions %: cannot return an adopted version to Draft', OLD.id;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql SET search_path = public, pg_temp;
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_fi_fee_schedule_versions_freeze ON fi_fee_schedule_versions');
  await pool.query(`
    CREATE TRIGGER trg_fi_fee_schedule_versions_freeze
      BEFORE UPDATE ON fi_fee_schedule_versions
      FOR EACH ROW EXECUTE FUNCTION fi_fee_schedule_versions_freeze();
  `);
  // Fee lines are editable ONLY while their version is a Draft. This is a ROW-STATE condition,
  // which a column grant cannot express — hence a trigger, shared by all three child tables.
  await pool.query(`
    CREATE OR REPLACE FUNCTION fi_fee_item_draft_only()
    RETURNS TRIGGER AS $fn$
    DECLARE v_status TEXT; v_version_id INTEGER; v_item_id INTEGER;
    BEGIN
      IF TG_TABLE_NAME = 'fi_fee_items' THEN
        v_version_id := COALESCE(OLD.version_id, NEW.version_id);
      ELSE
        v_item_id := COALESCE(OLD.item_id, NEW.item_id);
        SELECT i.version_id INTO v_version_id FROM fi_fee_items i WHERE i.id = v_item_id;
      END IF;
      SELECT status INTO v_status FROM fi_fee_schedule_versions WHERE id = v_version_id;
      IF v_status IS DISTINCT FROM 'Draft' THEN
        RAISE EXCEPTION '%: fee schedule version % is % — its fee lines are frozen. Author a NEW version.',
          TG_TABLE_NAME, v_version_id, COALESCE(v_status, 'missing');
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $fn$ LANGUAGE plpgsql SET search_path = public, pg_temp;
  `);
  await pool.query(`
    DO $trg$
    DECLARE t TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY['fi_fee_items','fi_fee_item_tiers','fi_fee_item_modifiers'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_draft_only ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%s_draft_only BEFORE UPDATE OR DELETE ON %I '
                    || 'FOR EACH ROW EXECUTE FUNCTION fi_fee_item_draft_only()', t, t);
      END LOOP;
    END $trg$;
  `);
  // The COMPUTATION is a fact and never changes. The commit and the waiver resolve after the
  // row exists and each may resolve exactly ONCE — re-committing a different amount in place
  // with no second record is the "fake refunds to cover the theft of cash" shape the state
  // comptroller's manual names by that name.
  await pool.query(`
    CREATE OR REPLACE FUNCTION fi_fee_assessments_append_only()
    RETURNS TRIGGER AS $fn$
    BEGIN
      IF NEW.id                  IS DISTINCT FROM OLD.id
      OR NEW.department_id       IS DISTINCT FROM OLD.department_id
      OR NEW.permit_id           IS DISTINCT FROM OLD.permit_id
      OR NEW.inspection_id       IS DISTINCT FROM OLD.inspection_id
      OR NEW.assessment_kind     IS DISTINCT FROM OLD.assessment_kind
      OR NEW.schedule_version_id IS DISTINCT FROM OLD.schedule_version_id
      OR NEW.vesting_date        IS DISTINCT FROM OLD.vesting_date
      OR NEW.inputs              IS DISTINCT FROM OLD.inputs
      OR NEW.computed_amount     IS DISTINCT FROM OLD.computed_amount
      OR NEW.computed_breakdown  IS DISTINCT FROM OLD.computed_breakdown
      OR NEW.computed_at         IS DISTINCT FROM OLD.computed_at
      OR NEW.created_at          IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'fi_fee_assessments %: the computation is append-only. Re-assess by creating a NEW assessment.', OLD.id;
      END IF;
      IF OLD.committed_at IS NOT NULL
         AND (NEW.committed_amount     IS DISTINCT FROM OLD.committed_amount
           OR NEW.committed_at         IS DISTINCT FROM OLD.committed_at
           OR NEW.committed_by_user_id IS DISTINCT FROM OLD.committed_by_user_id
           OR NEW.override_reason      IS DISTINCT FROM OLD.override_reason) THEN
        RAISE EXCEPTION 'fi_fee_assessments %: already committed at %. A committed charge is corrected by a NEW linked record, never in place.', OLD.id, OLD.committed_at;
      END IF;
      IF OLD.waived_at IS NOT NULL
         AND (NEW.waiver_amount     IS DISTINCT FROM OLD.waiver_amount
           OR NEW.waiver_reason     IS DISTINCT FROM OLD.waiver_reason
           OR NEW.waived_by_user_id IS DISTINCT FROM OLD.waived_by_user_id
           OR NEW.waived_at         IS DISTINCT FROM OLD.waived_at) THEN
        RAISE EXCEPTION 'fi_fee_assessments %: waiver already recorded at % and cannot be rewritten', OLD.id, OLD.waived_at;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql SET search_path = public, pg_temp;
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_fi_fee_assessments_append_only ON fi_fee_assessments');
  await pool.query(`
    CREATE TRIGGER trg_fi_fee_assessments_append_only
      BEFORE UPDATE ON fi_fee_assessments
      FOR EACH ROW EXECUTE FUNCTION fi_fee_assessments_append_only();
  `);
  // RLS + column-scoped grants. The 0082 lesson: Supabase default privileges auto-grant
  // table-level UPDATE, and a REVOKE from PUBLIC alone does not strip it — so the REVOKE is
  // per-role and the UPDATE is re-granted by COLUMN.
  await pool.query(`
    DO $feerls$
    DECLARE t TEXT; r TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY['fi_fee_schedules','fi_fee_schedule_versions','fi_fee_items',
                               'fi_fee_item_tiers','fi_fee_item_modifiers','fi_fee_assessments'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
        EXECUTE format('CREATE POLICY dept_isolation ON public.%I '
                    || 'USING (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int)', t);
      END LOOP;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
        FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON fi_fee_schedules, '
                        || 'fi_fee_schedule_versions, fi_fee_items, fi_fee_item_tiers, '
                        || 'fi_fee_item_modifiers, fi_fee_assessments FROM %I', r);
          END IF;
        END LOOP;
        GRANT SELECT, INSERT ON fi_fee_schedules, fi_fee_schedule_versions, fi_fee_items,
                                fi_fee_item_tiers, fi_fee_item_modifiers, fi_fee_assessments TO of_app;
        GRANT UPDATE (name, updated_at) ON fi_fee_schedules TO of_app;
        GRANT UPDATE (status, effective_to, effective_from, adopting_instrument,
                      adopting_instrument_ref, adopted_by, adopted_on,
                      penalty_multiplier, penalty_stacking_allowed) ON fi_fee_schedule_versions TO of_app;
        GRANT UPDATE, DELETE ON fi_fee_items, fi_fee_item_tiers, fi_fee_item_modifiers TO of_app;
        GRANT UPDATE (committed_amount, committed_by_user_id, committed_at, override_reason,
                      reason_code, reason_text, attested_by_user_id,
                      waiver_amount, waiver_reason, waived_by_user_id, waived_at)
          ON fi_fee_assessments TO of_app;
      END IF;
    END $feerls$;
  `);

  // ── Invoice ledger (migration 0125 mirror — fresh installs). Module 3.2 Slice B. ────────
  // Numbering is FY-DEPT-NNNNNN allocated from a COUNTER ROW, not a Postgres SEQUENCE: a
  // sequence gaps on every rolled-back transaction, which would manufacture gaps that the
  // gap report then asks a human to investigate for nothing.
  await pool.query(`
    ALTER TABLE fi_settings ADD COLUMN IF NOT EXISTS invoice_number_prefix TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE fi_settings ADD COLUMN IF NOT EXISTS fiscal_year_start_month SMALLINT NOT NULL DEFAULT 1;
  `);
  await pool.query(`
    DO $invcfg$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_settings_fy_start_month_ck') THEN
        ALTER TABLE fi_settings ADD CONSTRAINT fi_settings_fy_start_month_ck
          CHECK (fiscal_year_start_month BETWEEN 1 AND 12);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_settings_invoice_prefix_ck') THEN
        ALTER TABLE fi_settings ADD CONSTRAINT fi_settings_invoice_prefix_ck
          CHECK (invoice_number_prefix ~ '^[A-Z0-9]{0,12}$');
      END IF;
    END $invcfg$;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_invoice_sequences (
      department_id INTEGER NOT NULL,
      fiscal_year   INTEGER NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 9999),
      -- NON-EMPTY unlike the fi_settings default: an unset prefix would mint FY2026--000001
      -- onto a document retained forever. The route refuses first; this is the backstop.
      prefix        TEXT NOT NULL CHECK (prefix ~ '^[A-Z0-9]{1,12}$'),
      last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (department_id, fiscal_year)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_invoices (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      invoice_number  TEXT    NOT NULL CHECK (invoice_number ~ '^FY[0-9]{4}-[A-Z0-9]{1,12}-[0-9]{6,}$'),
      fiscal_year     INTEGER NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 9999),
      sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),
      status       TEXT NOT NULL DEFAULT 'Issued' CHECK (status IN ('Issued', 'Void')),
      invoice_kind TEXT NOT NULL DEFAULT 'original' CHECK (invoice_kind IN ('original', 'adjustment')),
      adjusts_invoice_id     INTEGER REFERENCES fi_invoices(id) ON DELETE RESTRICT,
      adjustment_reason_code TEXT,
      adjustment_reason_text TEXT,
      adjustment_approving_authority TEXT,
      bill_to_name    TEXT NOT NULL CHECK (length(btrim(bill_to_name)) > 0),
      bill_to_address TEXT,
      bill_to_email   TEXT,
      invoice_amount  NUMERIC(12,2) NOT NULL,
      fee_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
      penalty_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
      posting_fee     NUMERIC(12,2) NOT NULL DEFAULT 0,
      interest_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      invoice_date        DATE NOT NULL,
      due_date            DATE,
      second_notice_date  DATE,
      final_notice_date   DATE,
      lien_date           DATE,
      sent_to_bureau_date DATE,
      void_reason_code TEXT,
      void_reason_text TEXT,
      void_approving_authority TEXT,
      voided_by_user_id INTEGER,
      voided_at        TIMESTAMPTZ,
      issued_by_user_id INTEGER NOT NULL,
      idempotency_key   TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fi_invoices_seq_unique    UNIQUE (department_id, fiscal_year, sequence_number),
      CONSTRAINT fi_invoices_number_unique UNIQUE (department_id, invoice_number),
      CHECK ((invoice_kind = 'original') = (adjusts_invoice_id IS NULL)),
      -- ⚠ Every nullable column tested in a CHECK carries an explicit IS NOT NULL:
      -- length(btrim(NULL)) > 0 is NULL and a CHECK treats NULL as PASS (three-valued
      -- logic). 0126 tightened these on existing installs; fresh installs get them here.
      CONSTRAINT fi_invoices_adjustment_complete_ck CHECK (invoice_kind = 'original' OR (
               adjustment_reason_code IS NOT NULL
               AND adjustment_reason_text IS NOT NULL
               AND length(btrim(adjustment_reason_text)) > 0
               AND adjustment_approving_authority IS NOT NULL
               AND length(btrim(adjustment_approving_authority)) > 0)),
      CHECK (invoice_amount = fee_amount + penalty_amount + posting_fee + interest_amount),
      CHECK (invoice_kind = 'adjustment' OR (
               invoice_amount >= 0 AND fee_amount >= 0 AND penalty_amount >= 0
               AND posting_fee >= 0 AND interest_amount >= 0)),
      CHECK (due_date            IS NULL OR due_date            >= invoice_date),
      CHECK (second_notice_date  IS NULL OR second_notice_date  >= invoice_date),
      CHECK (final_notice_date   IS NULL OR final_notice_date   >= invoice_date),
      CHECK (lien_date           IS NULL OR lien_date           >= invoice_date),
      CHECK (sent_to_bureau_date IS NULL OR sent_to_bureau_date >= invoice_date),
      CHECK ((status = 'Void') = (voided_at IS NOT NULL)),
      CONSTRAINT fi_invoices_void_complete_ck CHECK (voided_at IS NULL OR (
               void_reason_code IS NOT NULL
               AND void_reason_text IS NOT NULL AND length(btrim(void_reason_text)) > 0
               AND void_approving_authority IS NOT NULL
               AND length(btrim(void_approving_authority)) > 0
               AND voided_by_user_id IS NOT NULL)),
      CHECK (adjusts_invoice_id IS NULL OR adjusts_invoice_id <> id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_invoice_lines (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      invoice_id    INTEGER NOT NULL REFERENCES fi_invoices(id) ON DELETE RESTRICT,
      line_number   INTEGER NOT NULL CHECK (line_number >= 1),
      line_kind   TEXT NOT NULL CHECK (line_kind IN ('fee', 'penalty', 'posting_fee', 'interest')),
      description TEXT NOT NULL CHECK (length(btrim(description)) > 0),
      amount      NUMERIC(12,2) NOT NULL,
      assessment_id INTEGER REFERENCES fi_fee_assessments(id) ON DELETE RESTRICT,
      permit_id     INTEGER REFERENCES fi_permits(id)         ON DELETE RESTRICT,
      inspection_id INTEGER REFERENCES fi_inspections(id)     ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fi_invoice_lines_number_unique UNIQUE (invoice_id, line_number)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_invoices_dept_created ON fi_invoices (department_id, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_invoices_dept_fy_seq ON fi_invoices (department_id, fiscal_year, sequence_number);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_invoices_adjusts ON fi_invoices (adjusts_invoice_id) WHERE adjusts_invoice_id IS NOT NULL;`);
  // The auditor's two first stops get partial indexes rather than a full ledger scan (F18).
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_invoices_zero_amount ON fi_invoices (department_id, created_at DESC) WHERE invoice_amount = 0;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_invoices_voided ON fi_invoices (department_id, voided_at DESC) WHERE voided_at IS NOT NULL;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fi_invoices_idempotency ON fi_invoices (department_id, idempotency_key) WHERE idempotency_key IS NOT NULL;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_invoice_lines_invoice ON fi_invoice_lines (invoice_id, line_number);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_invoice_lines_assessment ON fi_invoice_lines (department_id, assessment_id) WHERE assessment_id IS NOT NULL;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_invoice_lines_permit ON fi_invoice_lines (department_id, permit_id) WHERE permit_id IS NOT NULL;`);

  // ⚠ The SET search_path is declared INLINE on each function below, never added by a later
  // ALTER. CREATE OR REPLACE FUNCTION DISCARDS a SET clause, so an ALTER-applied search_path
  // is silently undone by the next fresh install (the 0119 lesson).
  await pool.query(`
    CREATE OR REPLACE FUNCTION fi_invoice_lines_append_only()
    RETURNS TRIGGER
    SET search_path = pg_catalog, public
    AS $invln$
    BEGIN
      RAISE EXCEPTION
        'fi_invoice_lines is append-only (attempted % on line %). An invoice line is part of an issued document; correct it with an adjustment invoice, never in place.',
        TG_OP, COALESCE(OLD.id, NEW.id);
    END;
    $invln$ LANGUAGE plpgsql;
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_fi_invoice_lines_append_only ON fi_invoice_lines');
  await pool.query(`
    CREATE TRIGGER trg_fi_invoice_lines_append_only
      BEFORE UPDATE OR DELETE ON fi_invoice_lines
      FOR EACH ROW EXECUTE FUNCTION fi_invoice_lines_append_only();
  `);
  // A line's sign is governed by its PARENT's kind — a cross-table rule, so it cannot be a
  // CHECK. Without it, the header's no-negatives CHECK is defeated by a negative line plus a
  // compensating positive one. Verified reachable through the route's single-statement CTE mint.
  await pool.query(`
    CREATE OR REPLACE FUNCTION fi_invoice_lines_sign_matches_parent()
    RETURNS TRIGGER
    SET search_path = pg_catalog, public
    AS $invsign$
    DECLARE parent_kind TEXT; parent_dept INTEGER;
    BEGIN
      SELECT invoice_kind, department_id INTO parent_kind, parent_dept
        FROM fi_invoices WHERE id = NEW.invoice_id;
      IF parent_kind IS NULL THEN
        RAISE EXCEPTION 'fi_invoice_lines: invoice % does not exist', NEW.invoice_id;
      END IF;
      IF parent_dept IS DISTINCT FROM NEW.department_id THEN
        RAISE EXCEPTION 'fi_invoice_lines: line department % does not match invoice % department %',
          NEW.department_id, NEW.invoice_id, parent_dept;
      END IF;
      IF parent_kind = 'original' AND NEW.amount < 0 THEN
        RAISE EXCEPTION 'fi_invoice_lines: a negative amount (%) is not permitted on an ORIGINAL invoice (%). A credit belongs on an adjustment invoice.',
          NEW.amount, NEW.invoice_id;
      END IF;
      RETURN NEW;
    END;
    $invsign$ LANGUAGE plpgsql;
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_fi_invoice_lines_sign ON fi_invoice_lines');
  await pool.query(`
    CREATE TRIGGER trg_fi_invoice_lines_sign
      BEFORE INSERT ON fi_invoice_lines
      FOR EACH ROW EXECUTE FUNCTION fi_invoice_lines_sign_matches_parent();
  `);
  // The header has exactly two seams: the dunning stamps and the void. Everything that
  // constitutes the document is frozen.
  await pool.query(`
    CREATE OR REPLACE FUNCTION fi_invoices_append_only()
    RETURNS TRIGGER
    SET search_path = pg_catalog, public
    AS $invao$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
          'fi_invoices %: an issued invoice is never deleted. Void it — the number is consumed and the record is retained.',
          OLD.id;
      END IF;

      IF NEW.id                     IS DISTINCT FROM OLD.id
      OR NEW.department_id          IS DISTINCT FROM OLD.department_id
      OR NEW.invoice_number         IS DISTINCT FROM OLD.invoice_number
      OR NEW.fiscal_year            IS DISTINCT FROM OLD.fiscal_year
      OR NEW.sequence_number        IS DISTINCT FROM OLD.sequence_number
      OR NEW.invoice_kind           IS DISTINCT FROM OLD.invoice_kind
      OR NEW.adjusts_invoice_id     IS DISTINCT FROM OLD.adjusts_invoice_id
      OR NEW.adjustment_reason_code IS DISTINCT FROM OLD.adjustment_reason_code
      OR NEW.adjustment_reason_text IS DISTINCT FROM OLD.adjustment_reason_text
      OR NEW.adjustment_approving_authority IS DISTINCT FROM OLD.adjustment_approving_authority
      OR NEW.bill_to_name           IS DISTINCT FROM OLD.bill_to_name
      OR NEW.bill_to_address        IS DISTINCT FROM OLD.bill_to_address
      OR NEW.bill_to_email          IS DISTINCT FROM OLD.bill_to_email
      OR NEW.invoice_amount         IS DISTINCT FROM OLD.invoice_amount
      OR NEW.fee_amount             IS DISTINCT FROM OLD.fee_amount
      OR NEW.penalty_amount         IS DISTINCT FROM OLD.penalty_amount
      OR NEW.posting_fee            IS DISTINCT FROM OLD.posting_fee
      OR NEW.interest_amount        IS DISTINCT FROM OLD.interest_amount
      OR NEW.invoice_date           IS DISTINCT FROM OLD.invoice_date
      OR NEW.issued_by_user_id      IS DISTINCT FROM OLD.issued_by_user_id
      OR NEW.idempotency_key        IS DISTINCT FROM OLD.idempotency_key
      OR NEW.created_at             IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION
          'fi_invoices %: this column is part of the issued document and is append-only. Correct it with an adjustment invoice, never in place.',
          OLD.id;
      END IF;

      IF OLD.voided_at IS NOT NULL
         AND (NEW.status                   IS DISTINCT FROM OLD.status
           OR NEW.voided_at                IS DISTINCT FROM OLD.voided_at
           OR NEW.voided_by_user_id        IS DISTINCT FROM OLD.voided_by_user_id
           OR NEW.void_reason_code         IS DISTINCT FROM OLD.void_reason_code
           OR NEW.void_reason_text         IS DISTINCT FROM OLD.void_reason_text
           OR NEW.void_approving_authority IS DISTINCT FROM OLD.void_approving_authority) THEN
        RAISE EXCEPTION 'fi_invoices %: already voided at % and cannot be re-voided or un-voided',
          OLD.id, OLD.voided_at;
      END IF;

      IF (OLD.due_date            IS NOT NULL AND NEW.due_date            IS DISTINCT FROM OLD.due_date)
      OR (OLD.second_notice_date  IS NOT NULL AND NEW.second_notice_date  IS DISTINCT FROM OLD.second_notice_date)
      OR (OLD.final_notice_date   IS NOT NULL AND NEW.final_notice_date   IS DISTINCT FROM OLD.final_notice_date)
      OR (OLD.lien_date           IS NOT NULL AND NEW.lien_date           IS DISTINCT FROM OLD.lien_date)
      OR (OLD.sent_to_bureau_date IS NOT NULL AND NEW.sent_to_bureau_date IS DISTINCT FROM OLD.sent_to_bureau_date) THEN
        RAISE EXCEPTION
          'fi_invoices %: a dunning stamp records an act on a date and cannot be rewritten once set.',
          OLD.id;
      END IF;

      RETURN NEW;
    END;
    $invao$ LANGUAGE plpgsql;
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_fi_invoices_append_only ON fi_invoices');
  await pool.query(`
    CREATE TRIGGER trg_fi_invoices_append_only
      BEFORE UPDATE OR DELETE ON fi_invoices
      FOR EACH ROW EXECUTE FUNCTION fi_invoices_append_only();
  `);
  // security_invoker is LOAD-BEARING: a view's default is to run with its OWNER's privileges,
  // which would BYPASS RLS and let one department read another's numbering.
  await pool.query(`
    CREATE OR REPLACE VIEW fi_invoice_number_gaps
      WITH (security_invoker = true) AS
    SELECT s.department_id, s.fiscal_year, s.prefix,
           g.n AS missing_sequence_number,
           format('FY%s-%s-%s', s.fiscal_year, s.prefix, lpad(g.n::text, 6, '0')) AS missing_invoice_number
      FROM fi_invoice_sequences s
      CROSS JOIN LATERAL generate_series(1, s.last_sequence) AS g(n)
     WHERE NOT EXISTS (
             SELECT 1 FROM fi_invoices i
              WHERE i.department_id   = s.department_id
                AND i.fiscal_year     = s.fiscal_year
                AND i.sequence_number = g.n);
  `);
  // A voided invoice is deliberately NOT a gap: a void consumes and retains its number.
  await pool.query(`
    DO $invrls$
    DECLARE t TEXT; r TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY['fi_invoice_sequences','fi_invoices','fi_invoice_lines'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
        EXECUTE format('CREATE POLICY dept_isolation ON public.%I '
                    || 'USING (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int)', t);
      END LOOP;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
        FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON fi_invoices, '
                        || 'fi_invoice_lines, fi_invoice_sequences FROM %I', r);
          END IF;
        END LOOP;
        GRANT SELECT, INSERT ON fi_invoices      TO of_app;
        GRANT SELECT, INSERT ON fi_invoice_lines TO of_app;
        -- Exactly the two seams. Even a route that tries to rewrite an amount is refused at
        -- the grant layer, before the trigger is reached.
        GRANT UPDATE (status, void_reason_code, void_reason_text, void_approving_authority,
                      voided_by_user_id, voided_at,
                      due_date, second_notice_date, final_notice_date, lien_date, sent_to_bureau_date)
          ON fi_invoices TO of_app;
        -- The counter is genuinely mutable; that is what lets the ledger be immutable.
        GRANT SELECT, INSERT ON fi_invoice_sequences TO of_app;
        GRANT UPDATE (last_sequence, updated_at) ON fi_invoice_sequences TO of_app;
        GRANT SELECT ON fi_invoice_number_gaps TO of_app;
        GRANT USAGE, SELECT ON SEQUENCE fi_invoices_id_seq      TO of_app;
        GRANT USAGE, SELECT ON SEQUENCE fi_invoice_lines_id_seq TO of_app;
      END IF;
    END $invrls$;
  `);

  // ── Payment ledger (migration 0126 mirror — fresh installs). Module 3.2 Slice C. ────────
  // Receipts applied against invoices + refund authorisations, one number series per
  // (dept, FY) from a COUNTER ROW (never a Postgres SEQUENCE — it gaps on rollback), the
  // receipt gap report, the derived-balance view (balance is NEVER a column), and the R9
  // waiver/refund approval band (threshold is per-dept CONFIG, ships NULL = no band).
  await pool.query(`
    ALTER TABLE fi_settings ADD COLUMN IF NOT EXISTS waiver_approval_threshold NUMERIC(12,2);
  `);
  await pool.query(`
    DO $paycfg$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_settings_waiver_threshold_ck') THEN
        ALTER TABLE fi_settings ADD CONSTRAINT fi_settings_waiver_threshold_ck
          CHECK (waiver_approval_threshold IS NULL OR waiver_approval_threshold >= 0);
      END IF;
    END $paycfg$;
  `);
  await pool.query(`
    ALTER TABLE fi_fee_assessments ADD COLUMN IF NOT EXISTS waiver_approving_authority TEXT;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_receipt_sequences (
      department_id INTEGER NOT NULL,
      fiscal_year   INTEGER NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 9999),
      prefix        TEXT NOT NULL CHECK (prefix ~ '^[A-Z0-9]{1,12}$'),
      last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (department_id, fiscal_year)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_payments (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment', 'refund_authorization')),
      receipt_number  TEXT    NOT NULL CHECK (receipt_number ~ '^FY[0-9]{4}-[A-Z0-9]{1,12}-R[0-9]{6,}$'),
      fiscal_year     INTEGER NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 9999),
      sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),
      status TEXT NOT NULL DEFAULT 'Recorded' CHECK (status IN ('Recorded', 'Void')),
      invoice_id INTEGER NOT NULL REFERENCES fi_invoices(id) ON DELETE RESTRICT,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      method       TEXT CHECK (method IN ('cash', 'check', 'card', 'ach', 'money_order', 'other')),
      check_number TEXT,
      payor_name   TEXT NOT NULL CHECK (length(btrim(payor_name)) > 0),
      purpose      TEXT,
      received_by_user_id INTEGER NOT NULL,
      received_date DATE NOT NULL,
      deposit_batch_ref TEXT,
      notes        TEXT,
      refund_of_payment_id   INTEGER REFERENCES fi_payments(id) ON DELETE RESTRICT,
      refund_reason_code     TEXT CHECK (refund_reason_code IS NULL OR refund_reason_code IN
                               ('overpayment', 'duplicate_payment', 'permit_withdrawn',
                                'fee_adjusted', 'paid_in_error', 'other')),
      refund_reason_text     TEXT,
      refund_approving_authority TEXT,
      refund_second_approver TEXT,
      void_reason_code TEXT CHECK (void_reason_code IS NULL OR void_reason_code IN
                         ('recorded_in_error', 'wrong_amount', 'wrong_invoice', 'wrong_payor',
                          'duplicate', 'other')),
      void_reason_text TEXT,
      void_approving_authority TEXT,
      voided_by_user_id INTEGER,
      voided_at        TIMESTAMPTZ,
      issued_by_user_id INTEGER NOT NULL,
      idempotency_key   TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fi_payments_seq_unique    UNIQUE (department_id, fiscal_year, sequence_number),
      CONSTRAINT fi_payments_number_unique UNIQUE (department_id, receipt_number),
      CHECK ((kind = 'payment') = (method IS NOT NULL)),
      CHECK (check_number IS NULL OR method IN ('check', 'money_order')),
      CONSTRAINT fi_payments_check_needs_number_ck CHECK (
        method IS DISTINCT FROM 'check'
        OR (check_number IS NOT NULL AND length(btrim(check_number)) > 0)),
      CHECK ((kind = 'refund_authorization') = (refund_reason_code IS NOT NULL)),
      CONSTRAINT fi_payments_refund_complete_ck CHECK (kind = 'payment' OR (
               refund_reason_text IS NOT NULL AND length(btrim(refund_reason_text)) > 0
               AND refund_approving_authority IS NOT NULL
               AND length(btrim(refund_approving_authority)) > 0)),
      CHECK (kind = 'refund_authorization' OR (
               refund_reason_text IS NULL AND refund_approving_authority IS NULL
               AND refund_second_approver IS NULL AND refund_of_payment_id IS NULL)),
      CHECK ((status = 'Void') = (voided_at IS NOT NULL)),
      CONSTRAINT fi_payments_void_complete_ck CHECK (voided_at IS NULL OR (
               void_reason_code IS NOT NULL
               AND void_reason_text IS NOT NULL AND length(btrim(void_reason_text)) > 0
               AND void_approving_authority IS NOT NULL
               AND length(btrim(void_approving_authority)) > 0
               AND voided_by_user_id IS NOT NULL)),
      CHECK (refund_of_payment_id IS NULL OR refund_of_payment_id <> id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_payments_dept_created ON fi_payments (department_id, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_payments_invoice ON fi_payments (invoice_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_payments_dept_fy_seq ON fi_payments (department_id, fiscal_year, sequence_number);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_payments_voided ON fi_payments (department_id, voided_at DESC) WHERE voided_at IS NOT NULL;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_payments_refunds ON fi_payments (department_id, created_at DESC) WHERE kind = 'refund_authorization';`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fi_payments_idempotency ON fi_payments (department_id, idempotency_key) WHERE idempotency_key IS NOT NULL;`);
  // Cross-table integrity: invoice exists, same dept, not Void; a linked refund names a real
  // same-invoice payment; the R9 band demands a second approver at/above the threshold.
  // SET search_path is INLINE (the 0119 lesson — an ALTER-applied one is discarded here).
  await pool.query(`
    CREATE OR REPLACE FUNCTION fi_payments_integrity()
    RETURNS TRIGGER
    SET search_path = pg_catalog, public
    AS $payint$
    DECLARE inv RECORD; refunded RECORD; band NUMERIC;
    BEGIN
      SELECT department_id, status INTO inv FROM fi_invoices WHERE id = NEW.invoice_id;
      IF inv IS NULL THEN
        RAISE EXCEPTION 'fi_payments: invoice % does not exist', NEW.invoice_id;
      END IF;
      IF inv.department_id IS DISTINCT FROM NEW.department_id THEN
        RAISE EXCEPTION 'fi_payments: payment department % does not match invoice % department %',
          NEW.department_id, NEW.invoice_id, inv.department_id;
      END IF;
      IF inv.status = 'Void' THEN
        RAISE EXCEPTION 'fi_payments: invoice % is void; record the money against a live document or leave it unapplied on a new one',
          NEW.invoice_id;
      END IF;

      IF NEW.kind = 'refund_authorization' THEN
        IF NEW.refund_of_payment_id IS NOT NULL THEN
          SELECT department_id, invoice_id, kind INTO refunded
            FROM fi_payments WHERE id = NEW.refund_of_payment_id;
          IF refunded IS NULL THEN
            RAISE EXCEPTION 'fi_payments: refunded payment % does not exist', NEW.refund_of_payment_id;
          END IF;
          IF refunded.department_id IS DISTINCT FROM NEW.department_id
             OR refunded.invoice_id IS DISTINCT FROM NEW.invoice_id
             OR refunded.kind IS DISTINCT FROM 'payment' THEN
            RAISE EXCEPTION 'fi_payments: refund must name a payment on the same invoice in the same department';
          END IF;
        END IF;
        SELECT waiver_approval_threshold INTO band
          FROM fi_settings WHERE department_id = NEW.department_id;
        IF band IS NOT NULL AND NEW.amount >= band
           AND (NEW.refund_second_approver IS NULL OR length(btrim(NEW.refund_second_approver)) = 0) THEN
          RAISE EXCEPTION 'fi_payments: a refund of % is at or above this department''s approval threshold (%) and requires a second named approver',
            NEW.amount, band;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $payint$ LANGUAGE plpgsql;
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_fi_payments_integrity ON fi_payments');
  await pool.query(`
    CREATE TRIGGER trg_fi_payments_integrity
      BEFORE INSERT ON fi_payments
      FOR EACH ROW EXECUTE FUNCTION fi_payments_integrity();
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION fi_assessment_waiver_band()
    RETURNS TRIGGER
    SET search_path = pg_catalog, public
    AS $payband$
    DECLARE band NUMERIC;
    BEGIN
      IF NEW.waived_at IS NOT NULL AND OLD.waived_at IS NULL THEN
        SELECT waiver_approval_threshold INTO band
          FROM fi_settings WHERE department_id = NEW.department_id;
        IF band IS NOT NULL AND COALESCE(NEW.waiver_amount, 0) >= band
           AND (NEW.waiver_approving_authority IS NULL
                OR length(btrim(NEW.waiver_approving_authority)) = 0) THEN
          RAISE EXCEPTION 'fi_fee_assessments: a waiver of % is at or above this department''s approval threshold (%) and requires a second named approver',
            NEW.waiver_amount, band;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $payband$ LANGUAGE plpgsql;
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_fi_assessment_waiver_band ON fi_fee_assessments');
  await pool.query(`
    CREATE TRIGGER trg_fi_assessment_waiver_band
      BEFORE UPDATE ON fi_fee_assessments
      FOR EACH ROW EXECUTE FUNCTION fi_assessment_waiver_band();
  `);
  // A receipt has exactly ONE seam: the void.
  await pool.query(`
    CREATE OR REPLACE FUNCTION fi_payments_append_only()
    RETURNS TRIGGER
    SET search_path = pg_catalog, public
    AS $payao$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
          'fi_payments %: a recorded receipt is never deleted. Void it — the number is consumed and the record retained.',
          OLD.id;
      END IF;

      IF NEW.id                   IS DISTINCT FROM OLD.id
      OR NEW.department_id        IS DISTINCT FROM OLD.department_id
      OR NEW.kind                 IS DISTINCT FROM OLD.kind
      OR NEW.receipt_number       IS DISTINCT FROM OLD.receipt_number
      OR NEW.fiscal_year          IS DISTINCT FROM OLD.fiscal_year
      OR NEW.sequence_number      IS DISTINCT FROM OLD.sequence_number
      OR NEW.invoice_id           IS DISTINCT FROM OLD.invoice_id
      OR NEW.amount               IS DISTINCT FROM OLD.amount
      OR NEW.method               IS DISTINCT FROM OLD.method
      OR NEW.check_number         IS DISTINCT FROM OLD.check_number
      OR NEW.payor_name           IS DISTINCT FROM OLD.payor_name
      OR NEW.purpose              IS DISTINCT FROM OLD.purpose
      OR NEW.received_by_user_id  IS DISTINCT FROM OLD.received_by_user_id
      OR NEW.received_date        IS DISTINCT FROM OLD.received_date
      OR NEW.deposit_batch_ref    IS DISTINCT FROM OLD.deposit_batch_ref
      OR NEW.notes                IS DISTINCT FROM OLD.notes
      OR NEW.refund_of_payment_id IS DISTINCT FROM OLD.refund_of_payment_id
      OR NEW.refund_reason_code   IS DISTINCT FROM OLD.refund_reason_code
      OR NEW.refund_reason_text   IS DISTINCT FROM OLD.refund_reason_text
      OR NEW.refund_approving_authority IS DISTINCT FROM OLD.refund_approving_authority
      OR NEW.refund_second_approver     IS DISTINCT FROM OLD.refund_second_approver
      OR NEW.issued_by_user_id    IS DISTINCT FROM OLD.issued_by_user_id
      OR NEW.idempotency_key      IS DISTINCT FROM OLD.idempotency_key
      OR NEW.created_at           IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION
          'fi_payments %: this column is part of the recorded receipt and is append-only. A wrong receipt is voided and re-recorded, never edited.',
          OLD.id;
      END IF;

      IF OLD.voided_at IS NOT NULL
         AND (NEW.status                   IS DISTINCT FROM OLD.status
           OR NEW.voided_at                IS DISTINCT FROM OLD.voided_at
           OR NEW.voided_by_user_id        IS DISTINCT FROM OLD.voided_by_user_id
           OR NEW.void_reason_code         IS DISTINCT FROM OLD.void_reason_code
           OR NEW.void_reason_text         IS DISTINCT FROM OLD.void_reason_text
           OR NEW.void_approving_authority IS DISTINCT FROM OLD.void_approving_authority) THEN
        RAISE EXCEPTION 'fi_payments %: already voided at % and cannot be re-voided or un-voided',
          OLD.id, OLD.voided_at;
      END IF;

      RETURN NEW;
    END;
    $payao$ LANGUAGE plpgsql;
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_fi_payments_append_only ON fi_payments');
  await pool.query(`
    CREATE TRIGGER trg_fi_payments_append_only
      BEFORE UPDATE OR DELETE ON fi_payments
      FOR EACH ROW EXECUTE FUNCTION fi_payments_append_only();
  `);
  // Voided receipts COUNT AS PRESENT — a void consumes and retains its number.
  await pool.query(`
    CREATE OR REPLACE VIEW fi_receipt_number_gaps
      WITH (security_invoker = true) AS
    SELECT s.department_id, s.fiscal_year, s.prefix,
           g.n AS missing_sequence_number,
           format('FY%s-%s-R%s', s.fiscal_year, s.prefix, lpad(g.n::text, 6, '0')) AS missing_receipt_number
      FROM fi_receipt_sequences s
      CROSS JOIN LATERAL generate_series(1, s.last_sequence) AS g(n)
     WHERE NOT EXISTS (
             SELECT 1 FROM fi_payments p
              WHERE p.department_id   = s.department_id
                AND p.fiscal_year     = s.fiscal_year
                AND p.sequence_number = g.n);
  `);
  // BALANCE IS NEVER A COLUMN. Refund authorisations ADD to the balance; void rows count for
  // nothing; a negative balance IS overpayment/unapplied cash — representable, not an error.
  await pool.query(`
    CREATE OR REPLACE VIEW fi_invoice_balances
      WITH (security_invoker = true) AS
    SELECT i.id AS invoice_id,
           i.department_id,
           i.invoice_number,
           i.status,
           i.invoice_amount,
           COALESCE(p.paid, 0)     AS paid_amount,
           COALESCE(p.refunded, 0) AS refunded_amount,
           (i.invoice_amount - COALESCE(p.paid, 0) + COALESCE(p.refunded, 0)) AS balance
      FROM fi_invoices i
      LEFT JOIN LATERAL (
        SELECT SUM(amount) FILTER (WHERE kind = 'payment')              AS paid,
               SUM(amount) FILTER (WHERE kind = 'refund_authorization') AS refunded
          FROM fi_payments p
         WHERE p.invoice_id = i.id AND p.status <> 'Void'
      ) p ON TRUE;
  `);
  await pool.query(`
    DO $payrls$
    DECLARE t TEXT; r TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY['fi_receipt_sequences','fi_payments'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
        EXECUTE format('CREATE POLICY dept_isolation ON public.%I '
                    || 'USING (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int)', t);
      END LOOP;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
        FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON fi_payments, fi_receipt_sequences FROM %I', r);
          END IF;
        END LOOP;
        GRANT SELECT, INSERT ON fi_payments TO of_app;
        -- Exactly the void seam. A route that tries to rewrite an amount is refused at the
        -- grant layer, before the trigger is reached.
        GRANT UPDATE (status, void_reason_code, void_reason_text, void_approving_authority,
                      voided_by_user_id, voided_at)
          ON fi_payments TO of_app;
        GRANT SELECT, INSERT ON fi_receipt_sequences TO of_app;
        GRANT UPDATE (last_sequence, updated_at) ON fi_receipt_sequences TO of_app;
        GRANT SELECT ON fi_receipt_number_gaps TO of_app;
        GRANT SELECT ON fi_invoice_balances    TO of_app;
        GRANT USAGE, SELECT ON SEQUENCE fi_payments_id_seq TO of_app;
        -- 0118's column-scoped UPDATE grant predates the R9 second-approver column; without
        -- this the band trigger would demand a value of_app cannot write (#61, mode 2).
        GRANT UPDATE (waiver_approving_authority) ON fi_fee_assessments TO of_app;
      END IF;
    END $payrls$;
  `);
  // 0126 §11: tighten 0125's two NULL-leaky CHECKs on fi_invoices for EXISTING installs
  // (fresh installs already get the named versions in the CREATE TABLE above). Guarded:
  // refuses if a row would violate; discovers old constraint names by DEFINITION.
  await pool.query(`
    DO $paytighten$
    DECLARE cname TEXT; bad INTEGER;
    BEGIN
      SELECT count(*) INTO bad FROM fi_invoices
       WHERE voided_at IS NOT NULL
         AND (void_reason_code IS NULL
              OR void_reason_text IS NULL OR length(btrim(void_reason_text)) = 0
              OR void_approving_authority IS NULL OR length(btrim(void_approving_authority)) = 0
              OR voided_by_user_id IS NULL);
      IF bad > 0 THEN
        RAISE EXCEPTION '0126 mirror: % voided fi_invoices rows have incomplete void paperwork — investigate before tightening', bad;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_invoices_void_complete_ck') THEN
        SELECT conname INTO cname FROM pg_constraint
         WHERE conrelid = 'fi_invoices'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%void_reason_code IS NOT NULL%';
        IF cname IS NOT NULL THEN
          EXECUTE format('ALTER TABLE fi_invoices DROP CONSTRAINT %I', cname);
        END IF;
        ALTER TABLE fi_invoices ADD CONSTRAINT fi_invoices_void_complete_ck
          CHECK (voided_at IS NULL OR (
                   void_reason_code IS NOT NULL
                   AND void_reason_text IS NOT NULL AND length(btrim(void_reason_text)) > 0
                   AND void_approving_authority IS NOT NULL
                   AND length(btrim(void_approving_authority)) > 0
                   AND voided_by_user_id IS NOT NULL));
      END IF;

      SELECT count(*) INTO bad FROM fi_invoices
       WHERE invoice_kind = 'adjustment'
         AND (adjustment_reason_code IS NULL
              OR adjustment_reason_text IS NULL OR length(btrim(adjustment_reason_text)) = 0
              OR adjustment_approving_authority IS NULL
              OR length(btrim(adjustment_approving_authority)) = 0);
      IF bad > 0 THEN
        RAISE EXCEPTION '0126 mirror: % adjustment fi_invoices rows have incomplete paperwork — investigate before tightening', bad;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_invoices_adjustment_complete_ck') THEN
        SELECT conname INTO cname FROM pg_constraint
         WHERE conrelid = 'fi_invoices'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%adjustment_reason_code IS NOT NULL%';
        IF cname IS NOT NULL THEN
          EXECUTE format('ALTER TABLE fi_invoices DROP CONSTRAINT %I', cname);
        END IF;
        ALTER TABLE fi_invoices ADD CONSTRAINT fi_invoices_adjustment_complete_ck
          CHECK (invoice_kind = 'original' OR (
                   adjustment_reason_code IS NOT NULL
                   AND adjustment_reason_text IS NOT NULL
                   AND length(btrim(adjustment_reason_text)) > 0
                   AND adjustment_approving_authority IS NOT NULL
                   AND length(btrim(adjustment_approving_authority)) > 0));
      END IF;
    END $paytighten$;
  `);

  // ⚠ 0094 also added `departments.treat_delinquent_as_valid` and 0096 DROPPED it the same
  // day. Do not re-add it. It asked whether a permit in grace is lawful to operate on —
  // a question this product does not answer (Matt, 2026-07-27). Making it configurable
  // looked humble but wasn't: a configurable legal conclusion is still a legal conclusion,
  // and a department that never touched its settings would have got a verdict it never
  // chose. What replaces it is stating the facts — term ended on X, renewable until Y.

  // Prevention Core Phase 1 data model (migration 0047 mirror — fresh installs).
  // fi_violations is the queryable mirror of fi_inspections.violations (Phase-1
  // authority model: the JSON array is still the API contract; rows synced at the
  // route chokepoint via utils/fiViolationSync.js). RLS for these lands in the
  // dept_isolation loop below alongside unit_locations et al.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_violations (
      id             SERIAL PRIMARY KEY,
      department_id  INTEGER NOT NULL,
      inspection_id  INTEGER NOT NULL REFERENCES fi_inspections(id) ON DELETE RESTRICT,
      violation_key  TEXT    NOT NULL,
      position       INTEGER NOT NULL DEFAULT 0,
      code           TEXT,
      description    TEXT,
      -- no severity column — DROPPED in migration 0055 (2026-07-14). Fire inspection has
      -- no Low/Moderate/High grade; imminent_hazard is the real, code-grounded flag.
      status         TEXT    NOT NULL DEFAULT 'Open',
      status_raw     TEXT,
      notes          TEXT,
      reported_date        DATE,
      sched_recheck_date   DATE,
      actual_recheck_date  DATE,
      next_recheck_date    DATE,
      repaired_date        DATE,
      imminent_hazard  BOOLEAN NOT NULL DEFAULT FALSE,
      carried_from_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      UNIQUE (inspection_id, violation_key)
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_violations_dept ON fi_violations (department_id)');
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_violations_dept_status ON fi_violations (department_id, status) WHERE deleted_at IS NULL`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_code_library (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      code          TEXT NOT NULL,
      title         TEXT NOT NULL DEFAULT '',
      category      TEXT NOT NULL DEFAULT '',
      code_body     TEXT NOT NULL DEFAULT '',
      edition       TEXT NOT NULL DEFAULT '',
      section       TEXT NOT NULL DEFAULT '',
      link_url      TEXT NOT NULL DEFAULT '',
      remediation_text TEXT NOT NULL DEFAULT '',
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      UNIQUE (department_id, code)
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_code_library_dept ON fi_code_library (department_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_checklists (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      name          TEXT NOT NULL,
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_checklists_dept ON fi_checklists (department_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_inspection_types (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      name          TEXT NOT NULL,
      default_frequency_days INTEGER,
      default_checklist_id   INTEGER REFERENCES fi_checklists(id) ON DELETE SET NULL,
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      UNIQUE (department_id, name)
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_inspection_types_dept ON fi_inspection_types (department_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_checklist_items (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      checklist_id  INTEGER NOT NULL REFERENCES fi_checklists(id) ON DELETE CASCADE,
      prompt        TEXT NOT NULL,
      code_ref_id   INTEGER REFERENCES fi_code_library(id) ON DELETE SET NULL,
      required      BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_checklist_items_dept ON fi_checklist_items (department_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_checklist_items_list ON fi_checklist_items (checklist_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_notices (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      inspection_id INTEGER NOT NULL REFERENCES fi_inspections(id) ON DELETE RESTRICT,
      storage_path  TEXT NOT NULL DEFAULT '',
      pdf           BYTEA,
      file_name     TEXT NOT NULL DEFAULT '',
      generated_by_user_id INTEGER,
      generated_by  TEXT NOT NULL DEFAULT '',
      sent_to       TEXT NOT NULL DEFAULT '',
      sent_at       TIMESTAMPTZ,
      method        TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_notices_dept ON fi_notices (department_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_notices_insp ON fi_notices (inspection_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_signatures (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      inspection_id INTEGER NOT NULL REFERENCES fi_inspections(id) ON DELETE RESTRICT,
      role          TEXT NOT NULL CHECK (role IN ('occupant','inspector')),
      signer_name   TEXT NOT NULL DEFAULT '',
      storage_path  TEXT NOT NULL DEFAULT '',
      image         BYTEA,
      signed_by_user_id INTEGER,
      signed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      -- 0053 mirror — signature OUTCOMES. An absent row was ambiguous (refused?
      -- nobody home? inspector forgot?); every outcome is now stated. Refusal is a
      -- recorded event and does NOT invalidate the notice. Plus the ESIGN/UETA
      -- trail: the SHA-256 binds the signature to the exact document signed.
      status        TEXT NOT NULL DEFAULT 'signed'
                      CHECK (status IN ('signed','refused','unable_no_party_present','unable_other','declined_by_policy')),
      signer_role_label TEXT NOT NULL DEFAULT '',
      refusal_reason    TEXT NOT NULL DEFAULT '',
      advisements_read  BOOLEAN NOT NULL DEFAULT FALSE,
      document_sha256   TEXT NOT NULL DEFAULT '',
      consent_text      TEXT NOT NULL DEFAULT '',
      device_label      TEXT NOT NULL DEFAULT '',
      gps_lat           DOUBLE PRECISION,
      gps_lng           DOUBLE PRECISION,
      gps_accuracy_m    DOUBLE PRECISION
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_signatures_dept ON fi_signatures (department_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_signatures_insp ON fi_signatures (inspection_id)');

  // ── Service of notice (0053 mirror) ───────────────────────────────────────
  // A notice of violation is made valid by SERVICE, not by a signature (IFC
  // §109.3.1; IPMC §107.3). One notice → MANY service records, because the
  // statutes demand conjunctions ("mail AND post"). Append-only: retire, never
  // delete — these are subpoenable.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_notice_service (
      id             SERIAL PRIMARY KEY,
      department_id  INTEGER NOT NULL,
      inspection_id  INTEGER NOT NULL REFERENCES fi_inspections(id) ON DELETE RESTRICT,
      notice_id      INTEGER REFERENCES fi_notices(id) ON DELETE RESTRICT,
      method         TEXT NOT NULL CHECK (method IN ('personal_service','left_with_responsible_person',
                       'posted_premises','certified_mail','first_class_mail','certificate_of_mailing','email')),
      outcome        TEXT NOT NULL CHECK (outcome IN ('served','refused_signature','refused_acceptance',
                       'no_party_present','mailed','accepted','delivered','returned_undelivered','unclaimed','posted')),
      attempt_seq    INTEGER NOT NULL DEFAULT 1,
      -- SERVER-AUTHORITATIVE. Every clock (correction deadline, appeal window)
      -- runs from THIS, never from the day the notice was generated.
      served_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      served_by_user_id INTEGER,
      served_by      TEXT NOT NULL DEFAULT '',
      servee_name         TEXT NOT NULL DEFAULT '',
      servee_relationship TEXT NOT NULL DEFAULT '',
      address_used   TEXT NOT NULL DEFAULT '',
      address_source TEXT NOT NULL DEFAULT '',
      posting_photo        BYTEA,
      posting_lat          DOUBLE PRECISION,
      posting_lng          DOUBLE PRECISION,
      posting_accuracy_m   DOUBLE PRECISION,
      posting_location_desc TEXT NOT NULL DEFAULT '',
      mail_class            TEXT NOT NULL DEFAULT '',
      mail_tracking_number  TEXT NOT NULL DEFAULT '',
      mail_accepted_at      TIMESTAMPTZ,
      mail_delivered_at     TIMESTAMPTZ,
      mail_returned_at      TIMESTAMPTZ,   -- the Jones v. Flowers trigger
      return_receipt_pdf    BYTEA,
      delivery_signature    BYTEA,
      delivered_address     TEXT NOT NULL DEFAULT '',
      notes       TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      voided_at   TIMESTAMPTZ,
      void_reason TEXT NOT NULL DEFAULT ''
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_notice_service_dept ON fi_notice_service (department_id)');
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_notice_service_inspection
    ON fi_notice_service (department_id, inspection_id) WHERE voided_at IS NULL`);
  // RLS is attached here rather than in the shared tenant-table loop below, so the
  // fresh-install path for this table stands entirely on its own.
  try {
    await pool.query('ALTER TABLE public.fi_notice_service ENABLE ROW LEVEL SECURITY');
    await pool.query('DROP POLICY IF EXISTS dept_isolation ON public.fi_notice_service');
    await pool.query(`CREATE POLICY dept_isolation ON public.fi_notice_service FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)`);
  } catch (e) {
    if (e.code !== '42P01') throw e; // undefined_table — skip on installs without it
  }

  // ── Offline sync idempotency (0054 mirror) ────────────────────────────────
  // An offline write can ARRIVE and be APPLIED while its acknowledgment is lost on
  // the way back. The client retries — correctly. Without this ledger that retry
  // writes the violation, the signature, or the SERVED NOTICE a SECOND TIME, on a
  // legal record. UNIQUE (department_id, client_id) IS the guarantee: the second
  // arrival cannot insert, so the server answers `duplicate` and applies nothing.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_sync_ops (
      id             SERIAL PRIMARY KEY,
      department_id  INTEGER NOT NULL,
      client_id      TEXT NOT NULL,   -- the device's UUID idempotency key
      op             TEXT NOT NULL,
      inspection_id  INTEGER,
      result_id      INTEGER,         -- the row the op produced; a retry gets the SAME id back
      applied_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (department_id, client_id)
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_sync_ops_dept ON fi_sync_ops (department_id)');
  try {
    await pool.query('ALTER TABLE public.fi_sync_ops ENABLE ROW LEVEL SECURITY');
    await pool.query('DROP POLICY IF EXISTS dept_isolation ON public.fi_sync_ops');
    await pool.query(`CREATE POLICY dept_isolation ON public.fi_sync_ops FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)`);
  } catch (e) {
    if (e.code !== '42P01') throw e; // undefined_table — skip on installs without it
  }
  // TRAP 1 (0054 mirror): when the notice is rendered ON DEVICE and the paper is handed
  // to the owner, THOSE bytes are the served instrument. They are uploaded verbatim and
  // stored append-only; `source` says so and `sha256` is the hash the device computed
  // over the bytes the occupant actually signed (the server re-verifies it on upload).
  await pool.query(`ALTER TABLE fi_notices ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'server'`);
  await pool.query(`ALTER TABLE fi_notices ADD COLUMN IF NOT EXISTS sha256 TEXT NOT NULL DEFAULT ''`);

  // ── Prevention Core Phase 2 substrate (0049 + 0050 fresh-install mirror) ──
  // fi_designations — rank-INDEPENDENT prevention permissions (grant history is
  // a record: revoke sets revoked_at, never deletes). fi_inspection_answers —
  // checklist findings snapshots (prompt + code frozen at answer time).
  // fi_settings — per-dept toggles + the six department-authored notice blocks.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_designations (
      id                 SERIAL PRIMARY KEY,
      department_id      INTEGER NOT NULL,
      user_id            INTEGER NOT NULL,
      role               TEXT NOT NULL CHECK (role IN ('inspector','prevention_admin')),
      granted_by_user_id INTEGER,
      granted_by         TEXT NOT NULL DEFAULT '',
      granted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at         TIMESTAMPTZ,
      revoked_by         TEXT NOT NULL DEFAULT ''
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_designations_dept ON fi_designations (department_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_designations_user ON fi_designations (department_id, user_id) WHERE revoked_at IS NULL');
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_fi_designations_active
    ON fi_designations (department_id, user_id, role) WHERE revoked_at IS NULL`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_inspection_answers (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL,
      inspection_id INTEGER NOT NULL REFERENCES fi_inspections(id) ON DELETE RESTRICT,
      checklist_id  INTEGER REFERENCES fi_checklists(id) ON DELETE SET NULL,
      item_id       INTEGER REFERENCES fi_checklist_items(id) ON DELETE SET NULL,
      prompt        TEXT NOT NULL,
      code_snapshot TEXT NOT NULL DEFAULT '',
      answer        TEXT NOT NULL CHECK (answer IN ('yes','no','na')),
      position      INTEGER NOT NULL DEFAULT 0,
      answered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_answers_dept ON fi_inspection_answers (department_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fi_answers_insp ON fi_inspection_answers (inspection_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_settings (
      department_id          INTEGER PRIMARY KEY,
      allow_crew_inspections BOOLEAN NOT NULL DEFAULT TRUE,
      admin_only_commit      BOOLEAN NOT NULL DEFAULT FALSE,
      notice_header          TEXT NOT NULL DEFAULT '',
      notice_body            TEXT NOT NULL DEFAULT '',
      notice_legalese        TEXT NOT NULL DEFAULT '',
      notice_passed_body     TEXT NOT NULL DEFAULT '',
      notice_footer          TEXT NOT NULL DEFAULT '',
      signature_agreement_text TEXT NOT NULL DEFAULT '',
      -- 0053 mirror — service/signature policy. Jurisdiction-neutral defaults:
      -- the INSPECTOR must sign (an unsigned notice is a defective instrument);
      -- the OCCUPANT's signature is receipt-acknowledgment and is NEVER required,
      -- because refusing it invalidates nothing. UETA §18 leaves e-signature
      -- acceptance on enforcement records to each agency — hence per-department.
      require_inspector_signature BOOLEAN NOT NULL DEFAULT TRUE,
      require_recipient_signature BOOLEAN NOT NULL DEFAULT FALSE,
      refusal_advisement_text     TEXT NOT NULL DEFAULT '',
      certificate_of_service_text TEXT NOT NULL DEFAULT '',
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Hydrants table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hydrants (
      id SERIAL PRIMARY KEY,
      -- NOT globally UNIQUE (0104). Every municipality numbers hydrants from 1;
      -- a global unique refused the second department its own H-001. The real
      -- key is uq_hydrants_dept_number (department_id, "hydrantNumber").
      "hydrantNumber" TEXT NOT NULL,
      "streetAddress" TEXT DEFAULT '',
      intersection TEXT DEFAULT '',
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
      zip TEXT DEFAULT '',
      type TEXT DEFAULT 'Dry Barrel',
      manufacturer TEXT DEFAULT '',
      model TEXT DEFAULT '',
      "yearInstalled" INTEGER,
      "mainSize" TEXT DEFAULT '',
      "outletSize" TEXT DEFAULT '',
      "numOutlets" INTEGER DEFAULT 2,
      status TEXT DEFAULT 'In Service',
      "staticPressure" REAL,
      "residualPressure" REAL,
      "flowRate" REAL,
      "lastTestDate" TEXT,
      "nextTestDue" TEXT,
      "testedBy" TEXT DEFAULT '',
      "lastInspectionDate" TEXT,
      "ownedBy" TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      lat REAL,
      lng REAL,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Volunteer Hours table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_hours (
      id SERIAL PRIMARY KEY,
      "memberId" INTEGER NOT NULL,
      "memberName" TEXT NOT NULL,
      date TEXT NOT NULL,
      "activityType" TEXT NOT NULL,
      hours REAL DEFAULT 0,
      description TEXT DEFAULT '',
      reference TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Grants table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS grants (
      id SERIAL PRIMARY KEY,
      "grantName" TEXT NOT NULL,
      type TEXT DEFAULT '',
      "fundingAgency" TEXT DEFAULT '',
      "programYear" INTEGER,
      status TEXT DEFAULT 'Planning',
      "applicationDate" TEXT,
      "awardDate" TEXT,
      "amountRequested" REAL DEFAULT 0,
      "amountAwarded" REAL,
      "matchRequired" BOOLEAN DEFAULT FALSE,
      "matchPercent" REAL DEFAULT 0,
      "matchAmount" REAL,
      "grantPeriodStart" TEXT,
      "grantPeriodEnd" TEXT,
      "reportingDeadlines" TEXT DEFAULT '[]',
      expenditures TEXT DEFAULT '[]',
      "contactName" TEXT DEFAULT '',
      "contactEmail" TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Mutual Aid table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mutual_aid (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      direction TEXT DEFAULT 'Given',
      "incidentType" TEXT DEFAULT '',
      status TEXT DEFAULT 'Completed',
      "partnerDepartment" TEXT DEFAULT '',
      address TEXT DEFAULT '',
      "unitsDeployed" TEXT DEFAULT '[]',
      "personnelCount" INTEGER DEFAULT 0,
      "requestTime" TEXT DEFAULT '',
      "clearTime" TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      "incidentNumber" TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // SOGs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sogs (
      id SERIAL PRIMARY KEY,
      number TEXT DEFAULT '',
      title TEXT NOT NULL,
      category TEXT DEFAULT 'Operations',
      status TEXT DEFAULT 'Active',
      version TEXT DEFAULT '1.0',
      "effectiveDate" TEXT,
      "reviewDate" TEXT,
      "lastReviewedDate" TEXT,
      author TEXT DEFAULT '',
      "approvedBy" TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      content TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Wellness table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wellness (
      id SERIAL PRIMARY KEY,
      "memberId" INTEGER NOT NULL UNIQUE,
      "memberName" TEXT NOT NULL,
      "bloodType" TEXT DEFAULT '',
      "medicalRestrictions" TEXT DEFAULT '',
      "physicalDue" TEXT,
      "scbaFitDue" TEXT,
      physicals TEXT DEFAULT '[]',
      "scbaFitTests" TEXT DEFAULT '[]',
      vaccinations TEXT DEFAULT '[]',
      exposures TEXT DEFAULT '[]',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Recruitment table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recruitment (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      dob TEXT,
      source TEXT DEFAULT '',
      recruiter TEXT DEFAULT '',
      stage TEXT DEFAULT 'Prospect',
      "dateAdded" TEXT NOT NULL,
      "stageHistory" TEXT DEFAULT '[]',
      checklist TEXT DEFAULT '{}',
      notes TEXT DEFAULT '',
      "interviewDate" TEXT DEFAULT '',
      "physicalDate" TEXT DEFAULT '',
      "orientationDate" TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Events table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'Other',
      date TEXT NOT NULL,
      "startTime" TEXT DEFAULT '',
      "endTime" TEXT DEFAULT '',
      location TEXT DEFAULT '',
      organizer TEXT DEFAULT '',
      description TEXT DEFAULT '',
      "maxAttendees" INTEGER,
      rsvps TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Pre-Incident Plans table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pre_plans (
      id SERIAL PRIMARY KEY,
      "occupancyName" TEXT NOT NULL,
      address TEXT DEFAULT '',
      "occupancyType" TEXT DEFAULT '',
      "riskLevel" TEXT DEFAULT 'Moderate',
      "constructionType" TEXT DEFAULT '',
      "yearBuilt" INTEGER,
      stories INTEGER,
      "sqFootage" INTEGER,
      "lastInspection" TEXT,
      "lastUpdated" TEXT,
      "lastUpdatedBy" TEXT DEFAULT '',
      contacts TEXT DEFAULT '[]',
      hazards TEXT DEFAULT '[]',
      access TEXT DEFAULT '{}',
      "waterSupply" TEXT DEFAULT '[]',
      suppression TEXT DEFAULT '{}',
      utilities TEXT DEFAULT '{}',
      notes TEXT DEFAULT '',
      "evacuationRoutes" TEXT DEFAULT '',
      "reviewedBy" TEXT DEFAULT '',
      "reviewedAt" TIMESTAMPTZ,
      "reviewNotes" TEXT DEFAULT '',
      attachments TEXT DEFAULT '[]',
      "tacticalSketch" TEXT DEFAULT '[]',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Drills table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drills (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT DEFAULT '',
      date TEXT NOT NULL,
      "startTime" TEXT DEFAULT '',
      duration INTEGER DEFAULT 0,
      location TEXT DEFAULT '',
      instructor TEXT DEFAULT '',
      objectives TEXT DEFAULT '[]',
      attendees TEXT DEFAULT '[]',
      "isoHours" BOOLEAN DEFAULT TRUE,
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Courses table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS courses (
      id SERIAL PRIMARY KEY,
      "courseName" TEXT NOT NULL,
      type TEXT DEFAULT '',
      provider TEXT DEFAULT '',
      "startDate" TEXT,
      "endDate" TEXT,
      location TEXT DEFAULT '',
      "certificationEarned" TEXT DEFAULT '',
      "certExpireYears" INTEGER DEFAULT 0,
      cost INTEGER DEFAULT 0,
      instructor TEXT DEFAULT '',
      attendees TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Assets table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      condition TEXT DEFAULT 'Serviceable',
      "serialNumber" TEXT DEFAULT '',
      "assignedTo" TEXT,
      location TEXT DEFAULT '',
      "purchaseDate" TEXT DEFAULT '',
      "lastInspection" TEXT DEFAULT '',
      "nextInspectionDue" TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // SCBA Cylinders table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cylinders (
      id SERIAL PRIMARY KEY,
      "unitId" TEXT NOT NULL,
      make TEXT DEFAULT '',
      model TEXT DEFAULT '',
      size TEXT DEFAULT '',
      material TEXT DEFAULT '',
      serial TEXT DEFAULT '',
      "manufactureYear" INTEGER DEFAULT 0,
      "currentPressure" INTEGER DEFAULT 0,
      "maxPressure" INTEGER DEFAULT 4500,
      "lastHydroDate" TEXT DEFAULT '',
      "nextHydroDate" TEXT DEFAULT '',
      "lastInspectionDate" TEXT DEFAULT '',
      "nextInspectionDate" TEXT DEFAULT '',
      "assignedMember" TEXT DEFAULT '',
      "assignedUnit" TEXT DEFAULT '',
      status TEXT DEFAULT 'In Service',
      notes TEXT DEFAULT '',
      "fillLog" TEXT DEFAULT '[]',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Fill Stations table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fill_stations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT '',
      "bankPressure" INTEGER,
      "maxPressure" INTEGER DEFAULT 4500,
      "lastInspectionDate" TEXT DEFAULT '',
      "nextInspectionDate" TEXT DEFAULT '',
      status TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // CAD Connections table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cad_connections (
      id SERIAL PRIMARY KEY,
      "vendorId" TEXT DEFAULT '',
      name TEXT NOT NULL,
      status TEXT DEFAULT 'Inactive',
      host TEXT DEFAULT '',
      "apiKey" TEXT DEFAULT '',
      "syncInterval" TEXT DEFAULT 'Manual only',
      notes TEXT DEFAULT '',
      "incidentsImported" INTEGER DEFAULT 0,
      "lastSync" TEXT,
      "lastSyncResult" TEXT DEFAULT '',
      "fieldMap" TEXT DEFAULT '{}',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Investigations table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS investigations (
      id SERIAL PRIMARY KEY,
      "caseNumber" TEXT NOT NULL,
      "incidentDate" TEXT DEFAULT '',
      address TEXT DEFAULT '',
      "occupancyType" TEXT DEFAULT '',
      cause TEXT DEFAULT 'Undetermined',
      "causeDetail" TEXT DEFAULT '',
      investigator TEXT DEFAULT '',
      "startDate" TEXT,
      "completionDate" TEXT,
      "estimatedLoss" REAL,
      "actualLoss" REAL,
      status TEXT DEFAULT 'Open',
      narrative TEXT DEFAULT '',
      findings TEXT DEFAULT '',
      recommendations TEXT DEFAULT '',
      evidence TEXT DEFAULT '[]',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Pay Entries table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pay_entries (
      id SERIAL PRIMARY KEY,
      "memberId" INTEGER,
      "memberName" TEXT DEFAULT '',
      "payPeriodStart" TEXT NOT NULL,
      "payPeriodEnd" TEXT NOT NULL,
      "regularHours" REAL DEFAULT 0,
      "overtimeHours" REAL DEFAULT 0,
      "specialPay" TEXT DEFAULT '[]',
      "grossPay" REAL,
      "netPay" REAL,
      deductions TEXT DEFAULT '[]',
      "paymentDate" TEXT,
      "paymentMethod" TEXT DEFAULT 'Check',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // CRR Visits table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crr_visits (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      location TEXT DEFAULT '',
      reason TEXT DEFAULT '',
      "memberPresent" TEXT DEFAULT '[]',
      "visitDuration" REAL DEFAULT 0,
      status TEXT DEFAULT 'Completed',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // CRR Programs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crr_programs (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      coordinator TEXT DEFAULT '',
      "startDate" TEXT,
      "endDate" TEXT,
      budget REAL,
      status TEXT DEFAULT 'Active',
      description TEXT DEFAULT '',
      participants TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Budget Lines table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS budget_lines (
      id SERIAL PRIMARY KEY,
      "lineNumber" TEXT NOT NULL,
      "fiscalYear" INTEGER,
      description TEXT DEFAULT '',
      category TEXT DEFAULT '',
      "budgetedAmount" REAL DEFAULT 0,
      status TEXT DEFAULT 'Active',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Budget Transactions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS budget_transactions (
      id SERIAL PRIMARY KEY,
      "budgetLineId" INTEGER,
      date TEXT NOT NULL,
      "transactionType" TEXT DEFAULT 'Purchase',
      description TEXT DEFAULT '',
      amount REAL NOT NULL,
      "approvedBy" TEXT DEFAULT '',
      vendor TEXT DEFAULT '',
      "receiptPath" TEXT DEFAULT '',
      status TEXT DEFAULT 'Pending',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // NFIRS Reports table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nfirs_reports (
      id SERIAL PRIMARY KEY,
      "incidentNumber" TEXT,
      "reportingArea" TEXT DEFAULT '',
      "stateIncidentNumber" TEXT DEFAULT '',
      "federalIncidentNumber" TEXT DEFAULT '',
      "reportDate" TEXT,
      "estimatedPropertyLoss" REAL DEFAULT 0,
      "estimatedPropertyValue" REAL DEFAULT 0,
      status TEXT DEFAULT 'Draft',
      "suppressionApparatus" TEXT DEFAULT '[]',
      "suppressionPersonnel" TEXT DEFAULT '[]',
      "emsApparatus" TEXT DEFAULT '[]',
      "emsPersonnel" TEXT DEFAULT '[]',
      "otherApparatus" TEXT DEFAULT '[]',
      "otherPersonnel" TEXT DEFAULT '[]',
      "civilianDeaths" INTEGER DEFAULT 0,
      "civilianInjuries" INTEGER DEFAULT 0,
      "fsDeaths" INTEGER DEFAULT 0,
      "fsInjuries" INTEGER DEFAULT 0,
      "propertyLoss" REAL DEFAULT 0,
      "contentsLoss" REAL DEFAULT 0,
      "isStructureFire" BOOLEAN DEFAULT FALSE,
      "structureType" TEXT DEFAULT '',
      "buildingStatus" TEXT DEFAULT '',
      "storiesAboveGrade" INTEGER DEFAULT 0,
      "storiesBelowGrade" INTEGER DEFAULT 0,
      "mainFloorArea" INTEGER DEFAULT 0,
      "fireOriginCode" TEXT DEFAULT '',
      "fireCauseCode" TEXT DEFAULT '',
      "contributingFactor1" TEXT DEFAULT '',
      "contributingFactor2" TEXT DEFAULT '',
      "humanFactors1" TEXT DEFAULT '',
      "humanFactors2" TEXT DEFAULT '',
      "detectorPresence" TEXT DEFAULT '',
      "detectorOperation" TEXT DEFAULT '',
      "detectorEffectiveness" TEXT DEFAULT '',
      "detectorFailureReason" TEXT DEFAULT '',
      "sprinklerPresence" TEXT DEFAULT '',
      "sprinklerOperation" TEXT DEFAULT '',
      "sprinklerFailureReason" TEXT DEFAULT '',
      "narrativeStatement" TEXT DEFAULT '',
      "preparedBy" TEXT DEFAULT '',
      "officerInCharge" TEXT DEFAULT '',
      "reviewedBy" TEXT DEFAULT '',
      "linkedIncidentId" INTEGER,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Checklist templates and completions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS checklist_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      apparatus TEXT DEFAULT '',
      frequency TEXT DEFAULT 'Daily',
      "estimatedMinutes" INTEGER DEFAULT 15,
      categories JSONB DEFAULT '[]',
      station_id INTEGER DEFAULT 1,
      "createdAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS checklist_completions (
      id SERIAL PRIMARY KEY,
      "templateId" INTEGER REFERENCES checklist_templates(id) ON DELETE CASCADE,
      "templateName" TEXT DEFAULT '',
      apparatus TEXT DEFAULT '',
      frequency TEXT DEFAULT '',
      "completedDate" TEXT NOT NULL,
      "completedBy" TEXT DEFAULT '',
      status TEXT DEFAULT 'Pass',
      notes TEXT DEFAULT '',
      responses JSONB DEFAULT '{}',
      station_id INTEGER DEFAULT 1,
      "createdAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Batch all ALTER TABLE migrations in a single round-trip ──────────────
  // This runs ~70 column additions in ONE query instead of 70 separate ones,
  // cutting DB init from ~5-10s to <500ms on subsequent starts.
  await pool.query(`
    DO $$ BEGIN
      -- station_id on all tables
      ALTER TABLE members ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      -- 0073 (2.2): a member's HOME station (detail/move-up is seat station != home).
      ALTER TABLE members ADD COLUMN IF NOT EXISTS home_station_id INTEGER;
      ALTER TABLE apparatus ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE incidents ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE training ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE training ADD COLUMN IF NOT EXISTS delivery_method TEXT DEFAULT 'Classroom';
      ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE shifts ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE shifts ADD COLUMN IF NOT EXISTS "patternId" INTEGER;
      ALTER TABLE shifts ADD COLUMN IF NOT EXISTS "memberIds" TEXT DEFAULT '[]';
      ALTER TABLE shifts ADD COLUMN IF NOT EXISTS "isOverride" BOOLEAN DEFAULT FALSE;
      ALTER TABLE station_log ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE fi_properties ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE fi_inspections ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE fi_permits ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE hydrants ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE volunteer_hours ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE grants ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE mutual_aid ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE sogs ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE wellness ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS rrule TEXT;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_id INTEGER;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS original_date TEXT;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false;
      ALTER TABLE pre_plans ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE drills ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE courses ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
      ALTER TABLE members ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT '';
      ALTER TABLE incidents ADD COLUMN IF NOT EXISTS "dispatchTime" TEXT DEFAULT '';
      ALTER TABLE incidents ADD COLUMN IF NOT EXISTS "clearTime" TEXT DEFAULT '';
      ALTER TABLE apparatus ADD COLUMN IF NOT EXISTS vin TEXT DEFAULT '';
      ALTER TABLE cylinders ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE fill_stations ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE cad_connections ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE investigations ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE pay_entries ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE crr_visits ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE crr_programs ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE budget_transactions ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE budget_transactions ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Expense';
      ALTER TABLE budget_transactions ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '';
      ALTER TABLE budget_transactions ADD COLUMN IF NOT EXISTS subcategory TEXT DEFAULT '';
      ALTER TABLE budget_transactions ADD COLUMN IF NOT EXISTS "checkNumber" TEXT DEFAULT '';
      ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS latitude TEXT DEFAULT '';
      ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS longitude TEXT DEFAULT '';
      ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS "dispatchTime" TEXT DEFAULT '';
      ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS "onSceneTime" TEXT DEFAULT '';
      ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS "unitClearTime" TEXT DEFAULT '';
      ALTER TABLE nfirs_reports ADD COLUMN IF NOT EXISTS "respondingUnits" TEXT DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS station_id INTEGER DEFAULT 1;
      -- Migration 0025: unit-login accounts (role='unit') are bound to one apparatus.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS apparatus_id INTEGER REFERENCES apparatus(id) ON DELETE SET NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apparatus_unit ON users (apparatus_id) WHERE apparatus_id IS NOT NULL;
      -- Migration 0026: rank-derived notification overrides (chief-configurable).
      CREATE TABLE IF NOT EXISTS of_rank_notifications (
        department_id INTEGER NOT NULL,
        tier          TEXT    NOT NULL,
        notif_type    TEXT    NOT NULL,
        enabled       BOOLEAN NOT NULL,
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (department_id, tier, notif_type)
      );
      -- Migration 0027: standing member assignment (career + volunteer org structure).
      -- Reuses members.employment_type for career/volunteer; only the standing
      -- unit + group assignment is new.
      ALTER TABLE members ADD COLUMN IF NOT EXISTS assigned_unit_id INTEGER REFERENCES apparatus(id) ON DELETE SET NULL;
      ALTER TABLE members ADD COLUMN IF NOT EXISTS assigned_group TEXT;
      -- idx_members_crew moved to applyDepartmentExpand (2026-07-12): it needs
      -- members.department_id, which does not exist yet on a FRESH install — and
      -- because this batch is ONE atomic DO block with a swallow-all handler, that
      -- single failure silently rolled back EVERY alter here (fresh installs broke
      -- from 2026-06-18 until this fix; existing DBs were unaffected because the
      -- column already existed). Keep this block free of department_id references.
      ALTER TABLE members ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT TRUE;
      ALTER TABLE incidents ADD COLUMN IF NOT EXISTS photos TEXT DEFAULT '[]';
      -- Phase 1: Career-Ready Foundation
      ALTER TABLE members ADD COLUMN IF NOT EXISTS hire_date TEXT DEFAULT '';
      ALTER TABLE members ADD COLUMN IF NOT EXISTS rank_date TEXT DEFAULT '';
      ALTER TABLE members ADD COLUMN IF NOT EXISTS seniority_number INTEGER DEFAULT 0;
      ALTER TABLE members ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'volunteer';
      ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS platoon TEXT DEFAULT '';
      ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS cycle_type TEXT DEFAULT '';
      ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS cycle_on INTEGER DEFAULT 0;
      ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS cycle_off INTEGER DEFAULT 0;
      ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS kelly_day_interval INTEGER DEFAULT 0;
      ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS anchor_date TEXT DEFAULT '';
      -- 0068 (Phase 1.1b): generalized cycle + named preset. preset_key records
      -- the named pattern a dept chose (24/48, kelly, pitman_223, custom, …);
      -- cycle_pattern is a JSON on/off day-state array for the 2-2-3/Pitman/DuPont
      -- class that cycle_on/cycle_off cannot express (empty '[]' = simple path).
      ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS preset_key TEXT DEFAULT '';
      ALTER TABLE shift_patterns ADD COLUMN IF NOT EXISTS cycle_pattern TEXT DEFAULT '[]';
      -- 0068 (Phase 1.1b): run_lists becomes a DERIVED published snapshot.
      -- published_from_shift_id = the shift whose apparatus_assignments were
      -- serialized in (nullable, NO FK — active_boards FK-trap lesson); source =
      -- 'published' | 'import' | 'legacy'.
      ALTER TABLE run_lists ADD COLUMN IF NOT EXISTS published_from_shift_id INTEGER;
      ALTER TABLE run_lists ADD COLUMN IF NOT EXISTS source TEXT;
      -- FLSA config on stations
      ALTER TABLE stations ADD COLUMN IF NOT EXISTS flsa_work_period INTEGER DEFAULT 7;
      ALTER TABLE stations ADD COLUMN IF NOT EXISTS flsa_ot_threshold NUMERIC DEFAULT 40;
      ALTER TABLE stations ADD COLUMN IF NOT EXISTS flsa_period_start TEXT DEFAULT '';
      ALTER TABLE stations ADD COLUMN IF NOT EXISTS dept_type TEXT DEFAULT 'volunteer';
      ALTER TABLE stations ADD COLUMN IF NOT EXISTS min_staffing_block BOOLEAN DEFAULT FALSE;
      -- W3.5: per-department AI daily token budget (NULL = global default)
      ALTER TABLE stations ADD COLUMN IF NOT EXISTS ai_daily_token_budget INTEGER DEFAULT NULL;
      -- Phase hydrant-preplan: GPS coordinates + pre-plan enhancements
      ALTER TABLE hydrants ADD COLUMN IF NOT EXISTS lat REAL;
      ALTER TABLE hydrants ADD COLUMN IF NOT EXISTS lng REAL;
      ALTER TABLE pre_plans ADD COLUMN IF NOT EXISTS "evacuationRoutes" TEXT DEFAULT '';
      ALTER TABLE pre_plans ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT DEFAULT '';
      ALTER TABLE pre_plans ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ;
      ALTER TABLE pre_plans ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT DEFAULT '';
      ALTER TABLE pre_plans ADD COLUMN IF NOT EXISTS attachments TEXT DEFAULT '[]';
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$
  `);

  // ── W3.5: AI usage ledger (per-department token budgets) ──────────────────
  // utils/aiBudget.js also lazily creates this (ensureTable) so existing prod
  // picks it up on first AI call; kept here so FRESH installs match. Applied
  // to production by hand 2026-06-10 (Supabase SQL) like the indexes below.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id SERIAL PRIMARY KEY,
      station_id INTEGER NOT NULL,
      used_on DATE NOT NULL DEFAULT CURRENT_DATE,
      action TEXT DEFAULT '',
      model TEXT DEFAULT '',
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      estimated BOOLEAN DEFAULT FALSE,
      calls INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_ai_usage_station_date ON ai_usage (station_id, used_on)'
  );

  // NOTE (2026-06-12): the per-department index, batch-2 RLS/index, and 0003
  // deny-all RLS mirror blocks that used to live here referenced tables that
  // initDb only creates further down (cad_alerts, unit_statuses, radio_config,
  // grievances, …) — on a FRESH database the very first boot died with
  // `relation "cad_alerts" does not exist` and could never recover. They now
  // run at the END of initDb, after every CREATE TABLE. See
  // applyPostSchemaHardening() at the bottom of this function.

  // ── Phase 2: Operational Depth ─────────────────────────────────────────

  // Qualifications / Certifications table — proper tracking with expirations
  await pool.query(`
    CREATE TABLE IF NOT EXISTS member_qualifications (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      cert_type TEXT NOT NULL,
      cert_name TEXT NOT NULL,
      issued_date TEXT DEFAULT '',
      expiry_date TEXT DEFAULT '',
      issuing_authority TEXT DEFAULT '',
      cert_number TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Apparatus position requirements — what certs are needed for each apparatus position
  // 0066: tenant anchor is department_id (FK added post-departments in the 0066
  // mirror block). station_id is a nullable legacy column — do NOT key on it.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apparatus_positions (
      id SERIAL PRIMARY KEY,
      apparatus_id INTEGER NOT NULL REFERENCES apparatus(id) ON DELETE CASCADE,
      department_id INTEGER,
      station_id INTEGER,
      position_name TEXT NOT NULL,
      required_certs TEXT DEFAULT '[]',
      min_rank TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    )
  `);

  // Daily apparatus assignments — who is assigned to what apparatus/position per shift
  // 0066: department-keyed (see apparatus_positions note above).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apparatus_assignments (
      id SERIAL PRIMARY KEY,
      -- 1.1c-a: the riding board is keyed on the DATE. shift_id is an OPTIONAL
      -- provenance link to the rotation that generated the on-duty list (NULL
      -- for a roster posted directly on a date — volunteer / ad-hoc / import).
      -- (migration 0069 enforces date NOT NULL on existing prod after backfill.)
      shift_id INTEGER REFERENCES shifts(id) ON DELETE CASCADE,
      -- 1.1c-b (0070): apparatus_id is NULLABLE. Seatless-but-paid on-duty
      -- (duty command / floater / admin / coverage) is a first-class assignment
      -- type in the market grain — it still accrues payroll hours without a rig seat.
      apparatus_id INTEGER REFERENCES apparatus(id) ON DELETE CASCADE,
      position_id INTEGER REFERENCES apparatus_positions(id) ON DELETE SET NULL,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      department_id INTEGER,
      station_id INTEGER,
      position_name TEXT DEFAULT '',
      date DATE,
      -- 1.1c-b (0070): hours + tour fields — the date-keyed assignment IS the timecard
      -- line ("the timecard flows from the seat/assignment you rode"). daily_staffing folded in here.
      hours NUMERIC(5,2),
      start_time TEXT,
      end_time TEXT,
      status TEXT DEFAULT 'on_duty',
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Run lists — submitted daily run list snapshots, used to sync TV display
  // 0066: one snapshot per (department, date) — the uniqueness anchor moved off
  // the mis-populated station_id.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS run_lists (
      id SERIAL PRIMARY KEY,
      department_id INTEGER,
      -- 0072 (2.1a): the roster is per STATION — each firehouse publishes its own daily
      -- riding board, so station_id is part of the uniqueness key (a shared department-wide
      -- roster per date would clobber the moment a department runs a second station).
      station_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      payload JSONB NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(department_id, station_id, date)
    )
  `);

  // ── Phase 3: Advanced Compliance & Workforce Management ─────────────────

  // Overtime equalization — track OT hours per member for fair distribution
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ot_records (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
      ot_date TEXT NOT NULL,
      ot_hours NUMERIC NOT NULL DEFAULT 0,
      ot_type TEXT DEFAULT 'mandatory',
      reason TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      -- 0078 (1.2f): FLSA earn-code axis for §225 qualified-OT reporting. earn_code is the
      -- FLSA basis (NULL = unclassified, surfaced not auto-qualified); regular_rate is the
      -- optional half-premium basis. Orthogonal to ot_type (mandatory/voluntary equalization).
      earn_code TEXT
        CONSTRAINT ot_records_earn_code_chk
        CHECK (earn_code IS NULL OR earn_code IN ('flsa_ot','cba_ot','other_premium','comp_cashout')),
      regular_rate NUMERIC
    )
  `);
  // 0078 self-heal for existing installs (fresh installs already have the columns above).
  await pool.query(`ALTER TABLE ot_records ADD COLUMN IF NOT EXISTS earn_code TEXT`).catch(() => {});
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ot_records_earn_code_chk') THEN
      ALTER TABLE ot_records ADD CONSTRAINT ot_records_earn_code_chk
        CHECK (earn_code IS NULL OR earn_code IN ('flsa_ot','cba_ot','other_premium','comp_cashout'));
    END IF;
  END $$;`).catch(() => {});
  await pool.query(`ALTER TABLE ot_records ADD COLUMN IF NOT EXISTS regular_rate NUMERIC`).catch(() => {});

  // Personnel actions — promotions, disciplinary, commendations, reviews
  await pool.query(`
    CREATE TABLE IF NOT EXISTS personnel_actions (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      action_date TEXT NOT NULL,
      description TEXT DEFAULT '',
      details JSONB DEFAULT '{}',
      issued_by TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      attachments TEXT DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Exposure & safety records — OSHA-required tracking
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exposure_records (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      incident_id INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
      exposure_date TEXT NOT NULL,
      exposure_type TEXT NOT NULL,
      substance TEXT DEFAULT '',
      duration_minutes INTEGER DEFAULT 0,
      ppe_worn TEXT DEFAULT '[]',
      symptoms TEXT DEFAULT '',
      medical_followup BOOLEAN DEFAULT FALSE,
      followup_date TEXT DEFAULT '',
      followup_notes TEXT DEFAULT '',
      reported_by TEXT DEFAULT '',
      status TEXT DEFAULT 'reported',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Shift trades — formalized trades with FLSA impact tracking
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shift_trades (
      id SERIAL PRIMARY KEY,
      station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      requesting_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      covering_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      original_shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
      payback_shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
      trade_date TEXT NOT NULL,
      payback_date TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      ot_impact_hours NUMERIC DEFAULT 0,
      flsa_period_hours_requester NUMERIC DEFAULT 0,
      flsa_period_hours_coverer NUMERIC DEFAULT 0,
      notes TEXT DEFAULT '',
      approved_by TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── Compliance core (2026-06-10, Dale roadmap Phase 2) ──────────────────────
  // DOCTRINE (Matt, 2026-06-10): AI plays zero role in incident narratives —
  // the officer writes incidents.notes (the NERIS/NFIRS legal record) directly.
  // The ai_narrative_drafts table (the short-lived officer-approval gate for
  // AI drafts) was removed along with all AI narrative generation. Do not
  // reintroduce it.

  // Append-only audit trail for legally-sensitive records (incidents, exposure
  // records, grievances). No UPDATE/DELETE path exists —
  // rows are written once and read by chiefs/auditors.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          SERIAL PRIMARY KEY,
      station_id  INTEGER NOT NULL DEFAULT 1,
      user_id     INTEGER,
      user_name   TEXT DEFAULT '',
      action      TEXT NOT NULL,
      table_name  TEXT NOT NULL,
      record_id   INTEGER,
      detail      JSONB DEFAULT '{}'::jsonb,
      at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_log_station_at ON audit_log (station_id, at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_log_record ON audit_log (table_name, record_id)');

  // Soft-delete for legal records: DELETE routes set deleted_at instead of
  // removing rows; every read path filters deleted_at IS NULL.
  await pool.query('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
  await pool.query('ALTER TABLE exposure_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
  // (grievances deleted_at moved below its CREATE TABLE — on a FRESH database
  // this line ran ~500 lines before grievances existed and killed first boot.)

  // ── Tenant-scoped unique keys (0104) ────────────────────────────────────────
  // Same defect class as the incidentNumber fix directly below, found 2026-07-26
  // by sweeping all 23 unique keys on tables carrying department_id. CAD run
  // numbers and hydrant numbers are namespaced PER DEPARTMENT — a global UNIQUE
  // refuses the second department its own 2026-000123 / H-001. For cad_alerts
  // that is a DROPPED DISPATCH caused by another tenant's data.
  // NULLS NOT DISTINCT so a NULL department_id cannot open a dedupe hole in the
  // ON CONFLICT (department_id, alert_id) path in cadAlertCreate.
  // NOTE: the cad_alerts half of 0104 lives further down, immediately after
  // `CREATE TABLE IF NOT EXISTS cad_alerts` — that table is created BELOW this
  // point, so creating its index here would fail 42P01 on a fresh install.
  // hydrants is created ~900 lines above, so its index is safe here.
  await pool.query('ALTER TABLE hydrants DROP CONSTRAINT IF EXISTS "hydrants_hydrantNumber_key"');
  await pool.query('DROP INDEX IF EXISTS "hydrants_hydrantNumber_key"');
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_hydrants_dept_number
      ON hydrants (department_id, "hydrantNumber") NULLS NOT DISTINCT
  `);

  // Incident-number uniqueness: per-STATION and only among ACTIVE (non-deleted)
  // incidents. The old global UNIQUE on "incidentNumber" wrongly blocked two
  // departments from sharing a number AND blocked reuse after a soft-delete.
  await pool.query('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS "incidents_incidentNumber_key"');
  await pool.query('DROP INDEX IF EXISTS "incidents_incidentNumber_key"');
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_station_number_active
      ON incidents (station_id, "incidentNumber") WHERE deleted_at IS NULL
  `);

  // AI assistant API key — stored server-side, never sent to browser
  await pool.query("ALTER TABLE stations ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT DEFAULT ''");

  // TV PIN — generated once per station, used to authenticate the wall TV display (no JWT needed).
  // Generated with a CSPRNG (crypto.randomBytes), NOT SQL RANDOM(): Postgres RANDOM() is a
  // seeded PRNG, not cryptographically secure, and a TV PIN is a shared-secret credential.
  // Stored plaintext here and upgraded to an HMAC-SHA256 hash on first use (see config/tvPin.js).
  await pool.query('ALTER TABLE stations ADD COLUMN IF NOT EXISTS tv_pin TEXT');
  {
    const nodeCrypto = require('crypto');
    // Format preserved: XXXX-XXXX uppercase hex, so findStationByPin and existing PINs are unaffected.
    const newPin = () =>
      `${nodeCrypto.randomBytes(2).toString('hex')}-${nodeCrypto.randomBytes(2).toString('hex')}`.toUpperCase();
    const { rows: needPin } = await pool.query('SELECT id FROM stations WHERE tv_pin IS NULL');
    for (const { id } of needPin) {
      await pool.query('UPDATE stations SET tv_pin = $1 WHERE id = $2 AND tv_pin IS NULL', [newPin(), id]);
    }
  }

  // On-demand training module completions (Phase 4)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS module_completions (
      id SERIAL PRIMARY KEY,
      station_id   INTEGER DEFAULT 1,
      user_id      INTEGER,
      member_name  TEXT DEFAULT '',
      module_id    TEXT NOT NULL,
      score        INTEGER DEFAULT 0,
      passed       BOOLEAN DEFAULT TRUE,
      completed_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (station_id, user_id, module_id)
    )
  `);

  // Department-created video training courses (Phase 7 — Training Hub)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_courses (
      id SERIAL PRIMARY KEY,
      station_id      INTEGER NOT NULL DEFAULT 1,
      title           TEXT NOT NULL,
      description     TEXT DEFAULT '',
      video_url       TEXT DEFAULT '',
      video_type      TEXT DEFAULT 'youtube',
      iso_category    TEXT DEFAULT 'general-ceu',
      ceu_hours       NUMERIC(4,1) DEFAULT 0,
      duration_minutes INTEGER DEFAULT 0,
      level           TEXT DEFAULT 'awareness',
      passing_score   INTEGER DEFAULT 80,
      instructor      TEXT DEFAULT '',
      provider        TEXT DEFAULT '',
      tags            JSONB DEFAULT '[]',
      prerequisites   JSONB DEFAULT '[]',
      quiz            JSONB DEFAULT '[]',
      source          TEXT DEFAULT 'department',
      external_id     TEXT DEFAULT '',
      active          BOOLEAN DEFAULT TRUE,
      created_by      TEXT DEFAULT '',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Video course completion records (Phase 7 — Training Hub)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_course_completions (
      id SERIAL PRIMARY KEY,
      station_id      INTEGER NOT NULL DEFAULT 1,
      course_id       INTEGER REFERENCES training_courses(id) ON DELETE SET NULL,
      user_id         INTEGER,
      member_name     TEXT DEFAULT '',
      quiz_score      INTEGER DEFAULT 0,
      quiz_passed     BOOLEAN DEFAULT FALSE,
      ceu_awarded     NUMERIC(4,1) DEFAULT 0,
      attempts        INTEGER DEFAULT 1,
      started_at      TIMESTAMPTZ DEFAULT NOW(),
      completed_at    TIMESTAMPTZ,
      certificate_id  TEXT DEFAULT '',
      source          TEXT DEFAULT 'internal',
      external_ref    TEXT DEFAULT '',
      UNIQUE (station_id, course_id, user_id)
    )
  `);

  // Scenario-based learning completions (Phase 5)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scenario_completions (
      id SERIAL PRIMARY KEY,
      station_id   INTEGER DEFAULT 1,
      user_id      INTEGER,
      member_name  TEXT DEFAULT '',
      scenario_id  TEXT NOT NULL,
      score        INTEGER DEFAULT 0,
      passed       BOOLEAN DEFAULT FALSE,
      completed_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (station_id, user_id, scenario_id)
    )
  `);

  // Incident responses — who's responding to what (Phase 6)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS incident_responses (
      id SERIAL PRIMARY KEY,
      station_id    INTEGER DEFAULT 1,
      incident_id   INTEGER,
      user_id       INTEGER,
      member_name   TEXT DEFAULT '',
      status        TEXT DEFAULT 'responding',
      cert_level    TEXT DEFAULT 'probationary',
      responded_at  TIMESTAMPTZ DEFAULT NOW(),
      on_scene_at   TIMESTAMPTZ,
      cleared_at    TIMESTAMPTZ,
      apparatus_id  INTEGER REFERENCES apparatus(id) ON DELETE SET NULL,
      position_id   INTEGER REFERENCES apparatus_positions(id) ON DELETE SET NULL,
      position_name TEXT,
      member_id     INTEGER,
      UNIQUE (station_id, incident_id, user_id)
    )
  `);

  // Push notification subscriptions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      station_id INTEGER DEFAULT 1,
      user_id INTEGER,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Recall events table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recall_events (
      id SERIAL PRIMARY KEY,
      station_id INTEGER DEFAULT 1,
      level TEXT NOT NULL DEFAULT 'additional',
      incident_type TEXT DEFAULT '',
      location TEXT DEFAULT '',
      message TEXT DEFAULT '',
      issued_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    )
  `);

  // Recall responses table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cad_alerts (
      id            SERIAL PRIMARY KEY,
      -- NOT globally UNIQUE (0104). CAD run numbers are namespaced per
      -- department; a global unique refused the SECOND department the same run
      -- number — a dropped dispatch caused by another tenant. The real key is
      -- uq_cad_alerts_dept_alert (department_id, alert_id), created below.
      alert_id      TEXT,
      address       TEXT DEFAULT '',
      units         TEXT DEFAULT '',
      description   TEXT DEFAULT '',
      details       TEXT DEFAULT '',
      latitude      NUMERIC,
      longitude     NUMERIC,
      dispatched_at TIMESTAMPTZ DEFAULT NOW(),
      raw           JSONB,
      station_id    INTEGER DEFAULT 1,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE cad_alerts ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ`);
  // 0044 — call-close lifecycle: disposition (app-validated vocabulary) +
  // who cleared it (NULL for system paths: CAD close event / auto-expiry).
  await pool.query(`ALTER TABLE cad_alerts ADD COLUMN IF NOT EXISTS disposition TEXT`);
  await pool.query(`ALTER TABLE cad_alerts ADD COLUMN IF NOT EXISTS cleared_by INTEGER`);
  // 0061 (P2-D4) — PSAP call times, populated when a CAD webhook carries them.
  // Nullable, never invented; the NERIS transformer prefers these over the
  // officer-entered incidents.neris_dispatch_times fallback.
  await pool.query(`ALTER TABLE cad_alerts ADD COLUMN IF NOT EXISTS call_answered_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE cad_alerts ADD COLUMN IF NOT EXISTS call_arrival_at TIMESTAMPTZ`);
  // 0100 (Phase 4) — the call -> incident link. cad/pipeline.js processStatusUpdate
  // reads this to attribute CAD-fed unit-status events to a call; every
  // response-time report depends on it. Written ONLY by
  // POST /api/active-board/link-incident. Fresh installs get it here; prod got it
  // via docs/migrations/0100-cad-alerts-incident-link.sql on 2026-07-26.
  await pool.query(`ALTER TABLE cad_alerts ADD COLUMN IF NOT EXISTS incident_id INTEGER`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_cad_alerts_incident ON cad_alerts (incident_id) WHERE incident_id IS NOT NULL`
  );

  // 0104 (cad_alerts half) — MUST live here, after CREATE TABLE cad_alerts above.
  // CAD run numbers are namespaced per department; the old global UNIQUE refused
  // the SECOND department the same run number, i.e. a dropped dispatch caused by
  // another tenant's data. The inline `alert_id TEXT UNIQUE` was removed from the
  // CREATE TABLE for the same reason — otherwise a FRESH install recreates the
  // defect, which is exactly what happened on the local dev DB and is how this
  // ordering bug was caught. NULLS NOT DISTINCT so a NULL department_id cannot
  // open a dedupe hole in cadAlertCreate's ON CONFLICT (department_id, alert_id).
  await pool.query('ALTER TABLE cad_alerts DROP CONSTRAINT IF EXISTS cad_alerts_alert_id_key');
  await pool.query('DROP INDEX IF EXISTS cad_alerts_alert_id_key');
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cad_alerts_dept_alert
      ON cad_alerts (department_id, alert_id) NULLS NOT DISTINCT
  `);

  // 0101 — per-department ADOPTED response-time targets + the tour changeover
  // fallback. CFAI requires an agency benchmark next to the measured baseline
  // plus the gap between them; without this the report renders only a baseline.
  // Defaults are NOT seeded — a row OVERRIDES constants/responseMetrics.js, and
  // absence means "use the standard", so an NFPA correction never strands rows.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS response_benchmarks (
      id              SERIAL PRIMARY KEY,
      department_id   INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      objective_key   TEXT    NOT NULL,
      target_seconds  INTEGER,
      target_fraction NUMERIC(4,3),
      rationale       TEXT,
      adopted_on      DATE,
      updated_by      INTEGER,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_response_benchmarks_dept_objective
      ON response_benchmarks (department_id, objective_key)
  `);
  await pool.query('ALTER TABLE departments ADD COLUMN IF NOT EXISTS tour_start_time TEXT');
  await pool.query('ALTER TABLE departments ADD COLUMN IF NOT EXISTS tour_length_hours NUMERIC(4,2)');

  // 0106 — cad_alerts identifier provenance + an always-present identifier.
  // Mirrored for FRESH installs. The NOT NULL matters here: 0104 made
  // (department_id, alert_id) unique with NULLS NOT DISTINCT, so a null would
  // make the SECOND such call in a department a refused, silently dropped
  // dispatch — the one failure this domain does not tolerate.
  await pool.query("ALTER TABLE cad_alerts ADD COLUMN IF NOT EXISTS alert_id_source TEXT");
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'cad_alerts'::regclass AND conname = 'cad_alerts_alert_id_source_check'
      ) THEN
        ALTER TABLE cad_alerts
          ADD CONSTRAINT cad_alerts_alert_id_source_check
          CHECK (alert_id_source IS NULL OR alert_id_source IN ('vendor','synthesized'));
      END IF;
    END $$
  `);
  await pool.query('ALTER TABLE cad_alerts ALTER COLUMN alert_id SET NOT NULL');

  // 0105 — report_schedules: standing instructions to deliver a canned report on
  // a cadence. Mirrored here for FRESH installs, which is not optional: 0104
  // shipped correct on prod and BROKEN on a new database earlier this phase
  // because the mirror was skipped. The stations/departments/users FKs mean this
  // block must run AFTER those tables exist — it is placed with the other Phase 4
  // migrations, well past their definitions.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_schedules (
      id                 SERIAL PRIMARY KEY,
      department_id      INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      station_id         INTEGER REFERENCES stations(id) ON DELETE SET NULL,
      report_key         TEXT NOT NULL
                         CHECK (report_key IN ('response_compliance','incident_activity','cert_expiry')),
      cadence            TEXT NOT NULL CHECK (cadence IN ('weekly','monthly')),
      recipients         TEXT[] NOT NULL CHECK (cardinality(recipients) BETWEEN 1 AND 20),
      enabled            BOOLEAN NOT NULL DEFAULT TRUE,
      last_period_key    TEXT,
      last_run_at        TIMESTAMPTZ,
      last_status        TEXT CHECK (last_status IN
                           ('sent','no_email_configured','send_failed','no_data')),
      last_error         TEXT,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_report_schedules_due
      ON report_schedules (department_id, enabled) WHERE enabled
  `);

  // 0103 — incidents.cad_run_number: THE call->incident association key.
  await pool.query('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS cad_run_number TEXT');
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_dept_cad_run
      ON incidents (department_id, cad_run_number) NULLS NOT DISTINCT
      WHERE cad_run_number IS NOT NULL AND deleted_at IS NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_incidents_cad_run_lookup
      ON incidents (department_id, cad_run_number) WHERE cad_run_number IS NOT NULL
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recall_responses (
      id SERIAL PRIMARY KEY,
      recall_id INTEGER NOT NULL REFERENCES recall_events(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL,
      member_name TEXT NOT NULL,
      response TEXT NOT NULL,
      eta TEXT DEFAULT '',
      responded_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(recall_id, member_id)
    )
  `);
  // 0037: structured recall destination (Station/Scene/Unable). Additive +
  // nullable; NULL = legacy "responding (unspecified)". Named CHECK mirrors
  // docs/migrations/0037-recall-response-destination.sql.
  await pool.query(`ALTER TABLE recall_responses ADD COLUMN IF NOT EXISTS destination TEXT`);
  await pool.query(`DO $do$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'recall_responses_destination_check'
        AND conrelid = 'public.recall_responses'::regclass
    ) THEN
      ALTER TABLE public.recall_responses
        ADD CONSTRAINT recall_responses_destination_check CHECK (
          destination IS NULL
          OR (response = 'responding' AND destination IN ('station', 'scene'))
        );
    END IF;
  END $do$;`);

  // Active boards table (Command Board incident tracking)
  // 0066: ONE board per DEPARTMENT — the PK moved off the mis-populated
  // station_id (which had been receiving department ids since the dept expand;
  // the multi-house time bomb). station_id is a nullable legacy column. The
  // department_id FK lands in the 0066 mirror block (departments is created
  // later in initDb).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS active_boards (
      department_id INTEGER PRIMARY KEY,
      station_id  INTEGER,
      incident_type TEXT,
      address       TEXT,
      dispatched_at TIMESTAMPTZ,
      personnel_count INTEGER DEFAULT 0,
      units_count     INTEGER DEFAULT 0,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Link an active call to the saved incident record (NFIRS apparatus times).
  await pool.query(`ALTER TABLE active_boards ADD COLUMN IF NOT EXISTS incident_id INTEGER`);

  // ── Unit Status Lifecycle (Phase 2) ─────────────────────────────────────────
  // Current incident status of each apparatus (one row per apparatus per
  // station). Kept SEPARATE from apparatus.status (which is maintenance/OOS).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS unit_statuses (
      id            SERIAL PRIMARY KEY,
      station_id    INTEGER NOT NULL DEFAULT 1,
      apparatus_id  INTEGER REFERENCES apparatus(id) ON DELETE CASCADE,
      designation   TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'in_service',
      incident_id   INTEGER,
      updated_by    INTEGER,
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (station_id, apparatus_id)
    )
  `);

  // Append-only history of every status change — feeds the incident timeline
  // and the per-unit NFIRS/NERIS times (dispatched / enroute / arrival / clear).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS unit_status_history (
      id            SERIAL PRIMARY KEY,
      station_id    INTEGER NOT NULL DEFAULT 1,
      apparatus_id  INTEGER,
      designation   TEXT NOT NULL,
      incident_id   INTEGER,
      status        TEXT NOT NULL,
      changed_by    INTEGER,
      changed_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Live apparatus GPS — one row per rig (upsert). Drives the dispatch map dots. (0023)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS unit_locations (
      id            SERIAL PRIMARY KEY,
      apparatus_id  INTEGER NOT NULL REFERENCES apparatus(id) ON DELETE CASCADE,
      station_id    INTEGER NOT NULL DEFAULT 1,
      department_id INTEGER NOT NULL DEFAULT 1,
      latitude      DOUBLE PRECISION NOT NULL,
      longitude     DOUBLE PRECISION NOT NULL,
      heading       REAL,
      speed         REAL,
      accuracy      REAL,
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_locations_apparatus ON unit_locations(apparatus_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_unit_locations_dept_updated ON unit_locations(department_id, updated_at DESC)');

  // Expo push tokens (Phase 3 push fan-out; created with 0023 so the migration is atomic).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expo_push_tokens (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      station_id    INTEGER NOT NULL DEFAULT 1,
      department_id INTEGER NOT NULL DEFAULT 1,
      token         TEXT NOT NULL UNIQUE,
      device_name   TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_expo_push_tokens_dept ON expo_push_tokens(department_id)');

  // Pre-plan photos — first-class photo metadata; bytes in the private
  // `preplan-photos` storage bucket. (0043)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pre_plan_photos (
      id            SERIAL PRIMARY KEY,
      plan_id       INTEGER NOT NULL REFERENCES pre_plans(id) ON DELETE CASCADE,
      station_id    INTEGER NOT NULL DEFAULT 1,
      department_id INTEGER NOT NULL DEFAULT 1,
      storage_path  TEXT NOT NULL UNIQUE,
      caption       TEXT NOT NULL DEFAULT '',
      category      TEXT NOT NULL DEFAULT 'general',
      mimetype      TEXT NOT NULL DEFAULT '',
      size_bytes    INTEGER,
      uploaded_by   TEXT NOT NULL DEFAULT '',
      taken_at      TIMESTAMPTZ,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_pre_plan_photos_plan ON pre_plan_photos(plan_id, sort_order, id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_pre_plan_photos_dept ON pre_plan_photos(department_id)');

  // Unit status-timer acknowledgments — APPEND-ONLY dispatcher "status check"
  // record; resets the overdue timer (0046, LEITSC §1.7.3 parity).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS unit_status_acks (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL DEFAULT 1,
      station_id    INTEGER,
      apparatus_id  INTEGER NOT NULL REFERENCES apparatus(id) ON DELETE CASCADE,
      designation   TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL,
      status_since  TIMESTAMPTZ,
      acked_by      INTEGER,
      acked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_unit_status_acks_unit ON unit_status_acks(department_id, apparatus_id, acked_at DESC)');

  // PAR persistence (0048): interval + last-PAR on the board; append-only
  // par_checks record. The Command Board's existing PAR UI gets a spine.
  await pool.query('ALTER TABLE active_boards ADD COLUMN IF NOT EXISTS par_interval_min INTEGER');
  await pool.query('ALTER TABLE active_boards ADD COLUMN IF NOT EXISTS last_par_at TIMESTAMPTZ');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS par_checks (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL DEFAULT 1,
      station_id    INTEGER,
      incident_id   INTEGER,
      incident_type TEXT NOT NULL DEFAULT '',
      address       TEXT NOT NULL DEFAULT '',
      accounted     INTEGER NOT NULL DEFAULT 0,
      missing       INTEGER NOT NULL DEFAULT 0,
      total         INTEGER NOT NULL DEFAULT 0,
      results       JSONB,
      ran_by        INTEGER,
      ran_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      client_id     UUID
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_par_checks_dept_time ON par_checks(department_id, ran_at DESC)');
  // 0058: replayable PAR idempotency key. Self-heals a par_checks created before
  // 0058 (CREATE TABLE IF NOT EXISTS won't add the column). The partial unique
  // index dedupes client-minted PARs; legacy NULL client_id rows are exempt.
  await pool.query('ALTER TABLE par_checks ADD COLUMN IF NOT EXISTS client_id UUID');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_par_checks_dept_client ON par_checks(department_id, client_id) WHERE client_id IS NOT NULL');

  // ── Radio Integration ──────────────────────────────────────────────────────

  // Radio log — every transcribed radio transmission
  await pool.query(`
    CREATE TABLE IF NOT EXISTS radio_log (
      id            SERIAL PRIMARY KEY,
      station_id    INTEGER DEFAULT 1,
      timestamp     TIMESTAMPTZ DEFAULT NOW(),
      talkgroup     TEXT DEFAULT '',
      talkgroup_id  INTEGER,
      transcript    TEXT NOT NULL,
      confidence    REAL DEFAULT 1.0,
      duration_sec  REAL DEFAULT 0,
      audio_url     TEXT DEFAULT '',
      is_dispatch   BOOLEAN DEFAULT false,
      priority      TEXT DEFAULT 'normal',
      source        TEXT DEFAULT 'sdr',
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_radio_log_station_ts ON radio_log (station_id, timestamp DESC)`);

  // Radio configuration — per-station talkgroup mappings and settings
  await pool.query(`
    CREATE TABLE IF NOT EXISTS radio_config (
      id            SERIAL PRIMARY KEY,
      station_id    INTEGER DEFAULT 1 UNIQUE,
      enabled       BOOLEAN DEFAULT false,
      api_key       TEXT DEFAULT '',
      talkgroups    JSONB DEFAULT '[]',
      dispatch_keywords JSONB DEFAULT '[]',
      whisper_mode  TEXT DEFAULT 'cloud',
      retention_days INTEGER DEFAULT 30,
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── Phase 7: Exams ──────────────────────────────────────────────────────────

  // Exam definitions (created by officers/chiefs)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exams (
      id SERIAL PRIMARY KEY,
      station_id    INTEGER DEFAULT 1,
      title         TEXT NOT NULL,
      description   TEXT DEFAULT '',
      category      TEXT DEFAULT 'General',
      time_limit    INTEGER DEFAULT 0,
      passing_score INTEGER DEFAULT 70,
      randomize     BOOLEAN DEFAULT true,
      questions     JSONB DEFAULT '[]',
      created_by    INTEGER,
      status        TEXT DEFAULT 'draft',
      due_date      DATE,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Exam assignments (which members must take which exams)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exam_assignments (
      id SERIAL PRIMARY KEY,
      station_id    INTEGER DEFAULT 1,
      exam_id       INTEGER REFERENCES exams(id) ON DELETE CASCADE,
      user_id       INTEGER,
      assigned_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (station_id, exam_id, user_id)
    )
  `);

  // Exam submissions (completed attempts)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exam_submissions (
      id SERIAL PRIMARY KEY,
      station_id    INTEGER DEFAULT 1,
      exam_id       INTEGER REFERENCES exams(id) ON DELETE CASCADE,
      user_id       INTEGER,
      score         INTEGER DEFAULT 0,
      passed        BOOLEAN DEFAULT false,
      answers       JSONB DEFAULT '[]',
      started_at    TIMESTAMPTZ DEFAULT NOW(),
      completed_at  TIMESTAMPTZ DEFAULT NOW(),
      time_spent    INTEGER DEFAULT 0,
      UNIQUE (station_id, exam_id, user_id)
    )
  `);

  // ── Phase 8: Feature Gap Fixes ────────────────────────────────────────────

  // Real-time member availability
  await pool.query(`
    CREATE TABLE IF NOT EXISTS member_availability (
      id SERIAL PRIMARY KEY,
      department_id INTEGER,
      station_id    INTEGER,
      user_id       INTEGER NOT NULL,
      member_name   TEXT DEFAULT '',
      available     BOOLEAN DEFAULT false,
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (department_id, user_id)
    )
  `);

  // Department bulletin board / announcements
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bulletins (
      id SERIAL PRIMARY KEY,
      station_id    INTEGER DEFAULT 1,
      title         TEXT NOT NULL,
      body          TEXT DEFAULT '',
      category      TEXT DEFAULT 'General',
      priority      TEXT DEFAULT 'normal',
      pinned        BOOLEAN DEFAULT false,
      author_id     INTEGER,
      author_name   TEXT DEFAULT '',
      expires_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Member-to-member direct messages (email-style)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id            SERIAL PRIMARY KEY,
      station_id    INTEGER DEFAULT 1,
      from_id       INTEGER,
      from_name     TEXT DEFAULT '',
      from_username TEXT DEFAULT '',
      to_username   TEXT NOT NULL,
      subject       TEXT NOT NULL DEFAULT '',
      body          TEXT DEFAULT '',
      sent_at       TIMESTAMPTZ DEFAULT NOW(),
      read_at       TIMESTAMPTZ
    )
  `);

  // Fundraising campaigns / fund drives
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fundraising_campaigns (
      id SERIAL PRIMARY KEY,
      station_id    INTEGER DEFAULT 1,
      name          TEXT NOT NULL,
      description   TEXT DEFAULT '',
      type          TEXT DEFAULT 'Fund Drive',
      goal_amount   NUMERIC(12,2) DEFAULT 0,
      raised_amount NUMERIC(12,2) DEFAULT 0,
      start_date    DATE,
      end_date      DATE,
      status        TEXT DEFAULT 'Planning',
      created_by    INTEGER,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Fundraising donations
  await pool.query(`
    CREATE TABLE IF NOT EXISTS donations (
      id SERIAL PRIMARY KEY,
      station_id    INTEGER DEFAULT 1,
      campaign_id   INTEGER REFERENCES fundraising_campaigns(id) ON DELETE SET NULL,
      donor_name    TEXT NOT NULL,
      donor_email   TEXT DEFAULT '',
      donor_phone   TEXT DEFAULT '',
      donor_address TEXT DEFAULT '',
      amount        NUMERIC(12,2) NOT NULL,
      method        TEXT DEFAULT 'Check',
      reference     TEXT DEFAULT '',
      receipt_sent  BOOLEAN DEFAULT false,
      notes         TEXT DEFAULT '',
      donated_at    DATE DEFAULT CURRENT_DATE,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Community outreach events
  await pool.query(`
    CREATE TABLE IF NOT EXISTS community_events (
      id SERIAL PRIMARY KEY,
      station_id INTEGER DEFAULT 1,
      title TEXT NOT NULL,
      event_type TEXT DEFAULT 'Other',
      date DATE,
      start_time TEXT,
      end_time TEXT,
      location TEXT DEFAULT '',
      address TEXT DEFAULT '',
      audience_type TEXT DEFAULT 'mixed',
      audience_age_range TEXT DEFAULT '',
      estimated_attendance INTEGER DEFAULT 0,
      actual_attendance INTEGER,
      partner_org TEXT DEFAULT '',
      partner_contact_name TEXT DEFAULT '',
      partner_contact_phone TEXT DEFAULT '',
      partner_contact_email TEXT DEFAULT '',
      apparatus_needed JSONB DEFAULT '[]',
      equipment_needed JSONB DEFAULT '[]',
      materials_needed JSONB DEFAULT '[]',
      assigned_members JSONB DEFAULT '[]',
      lead_member_id INTEGER,
      safety_checklist JSONB DEFAULT '[]',
      safety_notes TEXT DEFAULT '',
      special_accommodations TEXT DEFAULT '',
      materials_distributed JSONB DEFAULT '[]',
      photos_taken BOOLEAN DEFAULT false,
      media_coverage TEXT DEFAULT '',
      follow_up_notes TEXT DEFAULT '',
      follow_up_date DATE,
      volunteer_hours NUMERIC(6,1) DEFAULT 0,
      detectors_installed INTEGER DEFAULT 0,
      cpr_certifications INTEGER DEFAULT 0,
      escape_plans_created INTEGER DEFAULT 0,
      status TEXT DEFAULT 'planned',
      recurring TEXT DEFAULT 'none',
      recurring_notes TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Junior / Cadet program members
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cadets (
      id SERIAL PRIMARY KEY,
      station_id        INTEGER DEFAULT 1,
      name              TEXT NOT NULL,
      date_of_birth     DATE,
      parent_guardian    TEXT DEFAULT '',
      parent_phone      TEXT DEFAULT '',
      parent_email      TEXT DEFAULT '',
      school            TEXT DEFAULT '',
      enrolled_date     DATE DEFAULT CURRENT_DATE,
      status            TEXT DEFAULT 'Active',
      rank              TEXT DEFAULT 'Cadet',
      notes             TEXT DEFAULT '',
      certifications    JSONB DEFAULT '[]',
      training_hours    NUMERIC(8,1) DEFAULT 0,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── Phase 4: Operational Intelligence & Daily Management ─────────────────

  // Daily staffing entries — track who's on duty each day by position
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_staffing (
      id SERIAL PRIMARY KEY,
      station_id     INTEGER NOT NULL DEFAULT 1,
      date           DATE NOT NULL DEFAULT CURRENT_DATE,
      member_id      INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      position       TEXT DEFAULT '',
      apparatus_id   INTEGER,
      status         TEXT DEFAULT 'on_duty',
      start_time     TEXT DEFAULT '08:00',
      end_time       TEXT DEFAULT '08:00',
      hours          NUMERIC(5,2) DEFAULT 24,
      notes          TEXT DEFAULT '',
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Apparatus out-of-service tracking
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apparatus_oos (
      id SERIAL PRIMARY KEY,
      station_id     INTEGER NOT NULL DEFAULT 1,
      apparatus_id   INTEGER NOT NULL,
      reason         TEXT NOT NULL DEFAULT '',
      oos_type       TEXT DEFAULT 'mechanical',
      start_date     DATE NOT NULL DEFAULT CURRENT_DATE,
      end_date       DATE,
      estimated_return DATE,
      impact_level   TEXT DEFAULT 'moderate',
      coverage_plan  TEXT DEFAULT '',
      reported_by    TEXT DEFAULT '',
      status         TEXT DEFAULT 'active',
      notes          TEXT DEFAULT '',
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Timesheets / payroll periods
  await pool.query(`
    CREATE TABLE IF NOT EXISTS timesheets (
      id SERIAL PRIMARY KEY,
      station_id     INTEGER NOT NULL DEFAULT 1,
      member_id      INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      period_start   DATE NOT NULL,
      period_end     DATE NOT NULL,
      regular_hours  NUMERIC(6,2) DEFAULT 0,
      ot_hours       NUMERIC(6,2) DEFAULT 0,
      leave_hours    NUMERIC(6,2) DEFAULT 0,
      trade_hours    NUMERIC(6,2) DEFAULT 0,
      total_hours    NUMERIC(6,2) DEFAULT 0,
      flsa_period    TEXT DEFAULT '',
      status         TEXT DEFAULT 'draft',
      approved_by    TEXT DEFAULT '',
      approved_at    TIMESTAMPTZ,
      notes          TEXT DEFAULT '',
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Union grievance tracking
  await pool.query(`
    CREATE TABLE IF NOT EXISTS grievances (
      id SERIAL PRIMARY KEY,
      station_id      INTEGER NOT NULL DEFAULT 1,
      grievance_number TEXT DEFAULT '',
      filed_by        INTEGER REFERENCES members(id) ON DELETE SET NULL,
      filed_date      DATE DEFAULT CURRENT_DATE,
      cba_article     TEXT DEFAULT '',
      subject         TEXT NOT NULL DEFAULT '',
      description     TEXT DEFAULT '',
      grievance_type  TEXT DEFAULT 'contract_violation',
      current_step    TEXT DEFAULT 'step_1',
      status          TEXT DEFAULT 'open',
      resolution      TEXT DEFAULT '',
      resolved_date   DATE,
      assigned_to     TEXT DEFAULT '',
      union_rep       TEXT DEFAULT '',
      management_rep  TEXT DEFAULT '',
      notes           TEXT DEFAULT '',
      timeline        JSONB DEFAULT '[]',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Soft-delete for legal records (compliance core, 2026-06-10) — lives here,
  // directly after the CREATE, so fresh installs don't hit a missing relation.
  await pool.query('ALTER TABLE grievances ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');

  // ── Phase 5: Institutional Knowledge & Preparedness ──────────────────────

  // Incident after-action reports
  await pool.query(`
    CREATE TABLE IF NOT EXISTS after_action_reports (
      id SERIAL PRIMARY KEY,
      station_id      INTEGER NOT NULL DEFAULT 1,
      incident_id     INTEGER,
      incident_date   DATE,
      incident_type   TEXT DEFAULT '',
      location        TEXT DEFAULT '',
      title           TEXT NOT NULL DEFAULT '',
      summary         TEXT DEFAULT '',
      strengths       JSONB DEFAULT '[]',
      improvements    JSONB DEFAULT '[]',
      action_items    JSONB DEFAULT '[]',
      lessons_learned TEXT DEFAULT '',
      attendees       JSONB DEFAULT '[]',
      conducted_by    TEXT DEFAULT '',
      conducted_date  DATE DEFAULT CURRENT_DATE,
      status          TEXT DEFAULT 'draft',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Mutual aid agreements (formal agreements, not incident-level mutual aid)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mutual_aid_agreements (
      id SERIAL PRIMARY KEY,
      station_id       INTEGER NOT NULL DEFAULT 1,
      partner_agency   TEXT NOT NULL DEFAULT '',
      partner_fdid     TEXT DEFAULT '',
      partner_contact  TEXT DEFAULT '',
      partner_phone    TEXT DEFAULT '',
      partner_email    TEXT DEFAULT '',
      agreement_type   TEXT DEFAULT 'automatic',
      services         JSONB DEFAULT '[]',
      effective_date   DATE,
      expiration_date  DATE,
      auto_renew       BOOLEAN DEFAULT true,
      distance_miles   NUMERIC(6,1) DEFAULT 0,
      response_time_min INTEGER DEFAULT 0,
      status           TEXT DEFAULT 'active',
      document_ref     TEXT DEFAULT '',
      notes            TEXT DEFAULT '',
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Annual training plans / programs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_plans (
      id SERIAL PRIMARY KEY,
      station_id      INTEGER NOT NULL DEFAULT 1,
      title           TEXT NOT NULL DEFAULT '',
      year            INTEGER DEFAULT EXTRACT(YEAR FROM NOW()),
      description     TEXT DEFAULT '',
      category        TEXT DEFAULT 'general',
      target_hours    NUMERIC(6,1) DEFAULT 0,
      completed_hours NUMERIC(6,1) DEFAULT 0,
      objectives      JSONB DEFAULT '[]',
      schedule        JSONB DEFAULT '[]',
      assigned_to     JSONB DEFAULT '[]',
      status          TEXT DEFAULT 'planned',
      priority        TEXT DEFAULT 'normal',
      created_by      TEXT DEFAULT '',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Department document vault
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dept_documents (
      id SERIAL PRIMARY KEY,
      station_id      INTEGER NOT NULL DEFAULT 1,
      title           TEXT NOT NULL DEFAULT '',
      category        TEXT DEFAULT 'general',
      doc_type        TEXT DEFAULT 'policy',
      description     TEXT DEFAULT '',
      version         TEXT DEFAULT '1.0',
      effective_date  DATE,
      review_date     DATE,
      file_ref        TEXT DEFAULT '',
      content         TEXT DEFAULT '',
      tags            JSONB DEFAULT '[]',
      uploaded_by     TEXT DEFAULT '',
      status          TEXT DEFAULT 'active',
      access_level    TEXT DEFAULT 'all',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── Phase 6: Communication & Accountability ────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_minutes (
      id              SERIAL PRIMARY KEY,
      station_id      INTEGER REFERENCES stations(id),
      title           TEXT NOT NULL,
      meeting_date    DATE NOT NULL,
      meeting_type    TEXT DEFAULT 'regular',
      location        TEXT,
      called_by       TEXT,
      attendees       JSONB DEFAULT '[]',
      agenda          JSONB DEFAULT '[]',
      motions         JSONB DEFAULT '[]',
      action_items    JSONB DEFAULT '[]',
      notes           TEXT,
      next_meeting    DATE,
      recorded_by     TEXT,
      status          TEXT DEFAULT 'draft',
      linked_module   TEXT,
      linked_record_id INTEGER,
      linked_label    TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Add linked columns if they don't exist (migration for existing DBs)
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE meeting_minutes ADD COLUMN IF NOT EXISTS linked_module TEXT;
      ALTER TABLE meeting_minutes ADD COLUMN IF NOT EXISTS linked_record_id INTEGER;
      ALTER TABLE meeting_minutes ADD COLUMN IF NOT EXISTS linked_label TEXT;
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS policy_acknowledgments (
      id              SERIAL PRIMARY KEY,
      station_id      INTEGER REFERENCES stations(id),
      policy_title    TEXT NOT NULL,
      policy_ref      TEXT,
      policy_type     TEXT DEFAULT 'sog',
      description     TEXT,
      effective_date  DATE,
      review_date     DATE,
      required_by     JSONB DEFAULT '[]',
      acknowledged_by JSONB DEFAULT '[]',
      total_required  INTEGER DEFAULT 0,
      total_acknowledged INTEGER DEFAULT 0,
      status          TEXT DEFAULT 'active',
      created_by      TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS equipment_checkout (
      id              SERIAL PRIMARY KEY,
      station_id      INTEGER REFERENCES stations(id),
      item_name       TEXT NOT NULL,
      item_type       TEXT DEFAULT 'radio',
      serial_number   TEXT,
      asset_tag       TEXT,
      checked_out_by  INTEGER REFERENCES members(id),
      checked_out_at  TIMESTAMPTZ DEFAULT NOW(),
      expected_return TIMESTAMPTZ,
      returned_at     TIMESTAMPTZ,
      returned_to     TEXT,
      condition_out   TEXT DEFAULT 'good',
      condition_in    TEXT,
      purpose         TEXT,
      notes           TEXT,
      status          TEXT DEFAULT 'checked_out',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS incident_costs (
      id              SERIAL PRIMARY KEY,
      station_id      INTEGER REFERENCES stations(id),
      incident_id     INTEGER,
      incident_number TEXT,
      incident_date   DATE,
      incident_type   TEXT,
      location        TEXT,
      apparatus_costs JSONB DEFAULT '[]',
      personnel_costs JSONB DEFAULT '[]',
      material_costs  JSONB DEFAULT '[]',
      other_costs     JSONB DEFAULT '[]',
      total_cost      NUMERIC(12,2) DEFAULT 0,
      billable        BOOLEAN DEFAULT FALSE,
      billed_to       TEXT,
      invoice_number  TEXT,
      payment_status  TEXT DEFAULT 'not_billed',
      notes           TEXT,
      calculated_by   TEXT,
      status          TEXT DEFAULT 'draft',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Attachments table (document attachment system for cross-module use)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attachments (
      id SERIAL PRIMARY KEY,
      station_id INTEGER DEFAULT 1,
      module TEXT NOT NULL,
      record_id INTEGER,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      extracted_text TEXT,
      ai_extracted JSONB,
      description TEXT DEFAULT '',
      uploaded_by TEXT,
      category TEXT DEFAULT 'general',
      is_source BOOLEAN DEFAULT false,
      access_level TEXT DEFAULT 'all',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_module_record ON attachments(module, record_id);
  `);

  // iCal / Google Calendar subscription tokens — allows members to subscribe from their phones
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_subscriptions (
      id SERIAL PRIMARY KEY,
      member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
      station_id INTEGER DEFAULT 1,
      cal_token TEXT UNIQUE NOT NULL,
      tier TEXT DEFAULT 'member',
      categories JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_fetched_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_calendar_subscriptions_token ON calendar_subscriptions(cal_token);
    CREATE INDEX IF NOT EXISTS idx_calendar_subscriptions_member ON calendar_subscriptions(member_id);
  `);

  // Add cal_token column to members table (for legacy support)
  await pool.query(`
    ALTER TABLE members ADD COLUMN IF NOT EXISTS cal_token TEXT UNIQUE;
  `);

  // ── Personal Assistant: Preferences ─────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assistant_preferences (
      id SERIAL PRIMARY KEY,
      station_id INTEGER DEFAULT 1,
      member_id INTEGER NOT NULL,
      focus_mode TEXT DEFAULT 'off_duty',
      focus_mode_auto BOOLEAN DEFAULT true,
      alert_channels JSONB DEFAULT '{"in_app": true, "email_daily": false, "push": false}',
      watch_config JSONB DEFAULT '{}',
      email_connected BOOLEAN DEFAULT false,
      email_provider TEXT,
      daily_digest_time TIME DEFAULT '06:00',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(station_id, member_id)
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_preferences_member ON assistant_preferences(member_id);
  `);

  // ── Personal Assistant: Alerts ──────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assistant_alerts (
      id SERIAL PRIMARY KEY,
      station_id INTEGER DEFAULT 1,
      member_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      description TEXT,
      source_type TEXT DEFAULT 'internal_rule',
      source_ref TEXT,
      target_module TEXT,
      target_record_id INTEGER,
      focus_modes JSONB DEFAULT '["on_duty","off_duty","officer_mode"]',
      viewed_at TIMESTAMPTZ,
      acted_on BOOLEAN DEFAULT false,
      action_taken TEXT,
      suggested_action_url TEXT,
      suggested_action_text TEXT,
      display_priority INTEGER DEFAULT 100,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_alerts_member ON assistant_alerts(member_id, viewed_at);
    CREATE INDEX IF NOT EXISTS idx_assistant_alerts_category ON assistant_alerts(category, member_id);
  `);

  // ── Personal Assistant: Feedback ────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assistant_feedback (
      id SERIAL PRIMARY KEY,
      station_id INTEGER DEFAULT 1,
      member_id INTEGER NOT NULL,
      alert_id INTEGER REFERENCES assistant_alerts(id) ON DELETE CASCADE,
      feedback TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_feedback_member ON assistant_feedback(member_id);
  `);

  // ── Workflow Tasks — AI orchestration task tracking ────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_tasks (
      id SERIAL PRIMARY KEY,
      station_id INTEGER DEFAULT 1,
      user_id INTEGER,
      title TEXT NOT NULL,
      task_type TEXT NOT NULL DEFAULT 'incident_report',
      target_module TEXT NOT NULL DEFAULT 'incidents',
      target_record_id INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      checklist JSONB DEFAULT '[]',
      ai_drafts JSONB DEFAULT '{}',
      conversation JSONB DEFAULT '[]',
      deadline TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_tasks_station ON workflow_tasks(station_id, status);
    CREATE INDEX IF NOT EXISTS idx_workflow_tasks_user ON workflow_tasks(user_id, status);
  `);

  // ── Correspondence Log — universal across modules ─────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS correspondence (
      id SERIAL PRIMARY KEY,
      station_id INTEGER DEFAULT 1,
      module TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      entry_type TEXT NOT NULL DEFAULT 'email',
      from_name TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      body TEXT DEFAULT '',
      file_name TEXT DEFAULT '',
      file_url TEXT DEFAULT '',
      file_size INTEGER DEFAULT 0,
      entered_by TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_correspondence_module_record ON correspondence(module, record_id);
  `);

  // ── Demo data seeding ──────────────────────────────────────────────────────
  // Each section is wrapped individually so one failure doesn't block others.
  //
  // DEMO_LABELS are gated on process.env.SEED_DEMO === 'true'. Without that
  // env var set, a clone of the repo deploys CLEAN: tables exist, the
  // 'stations' placeholder + ERG hazmat reference data are present, and
  // the Department Setup Wizard creates the first chief account on first run.
  //
  // With SEED_DEMO=true (set on the public Vercel demo only), all the
  // Maplewood Fire Department fictional content gets seeded for evaluation.
  const DEMO_LABELS = new Set([
    'users', 'members', 'apparatus', 'incidents', 'exams',
    'meeting_minutes', 'policy_acknowledgments', 'equipment_checkout',
    'bulletins', 'grievances', 'incident_costs', 'checklist_templates',
  ]);
  const SEED_DEMO = process.env.SEED_DEMO === 'true';

  async function safeSeed(label, fn) {
    if (DEMO_LABELS.has(label) && !SEED_DEMO) {
      console.log(`[demo-gate] skipping safeSeed("${label}") — set SEED_DEMO=true to populate Maplewood demo data`);
      return;
    }
    try { await fn(); } catch (e) { console.warn(`⚠️  Seed "${label}" failed:`, e.message); }
  }

  await safeSeed('stations', async () => {
  const { rows: stRows } = await pool.query('SELECT COUNT(*) as c FROM stations');
  if (parseInt(stRows[0].c) === 0) {
    await pool.query(
      `INSERT INTO stations (name, fdid, city, state) VALUES ($1, $2, $3, $4)`,
      ['Maplewood Fire Department', '10042', 'Maplewood', 'MN']
    );
  }
  });

  await safeSeed('users', async () => {
    const hash = bcrypt.hashSync('1234', 10);
    const demos = [
      { username: 'chief',         name: 'Sarah Chen',     initials: 'DR', role: 'chief'          },
      { username: 'officer',       name: 'Maria Delgado',  initials: 'MD', role: 'officer'        },
      { username: 'bchief',        name: 'B/C McGee',    initials: 'BM', role: 'battalion_chief' },
      { username: 'member',        name: 'Nathan McGee',   initials: 'NM', role: 'member'         },
      { username: 'dispatch',      name: 'Dispatch Center',initials: 'DC', role: 'dispatch'       },
    ];
    for (const u of demos) {
      await pool.query(
        `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (username) DO NOTHING`,
        [u.username, u.name, u.initials, u.role, hash, 1]
      );
    }
  });

  await safeSeed('members', async () => {
  const demoMembers = [
    { num:'M-001', name:'Sarah Chen',      rank:'Fire Chief',   role:'chief',   status:'Active',       joined:'2008-03-15', phone:'555-201-0001', station_email:'sarah.chen@maplewoodfd.org', personal_email:'schen@gmail.com', certs:'["FF I","FF II","EMT-B","Fire Officer II","HAZMAT Ops","NIMS IS-700"]' },
    { num:'M-002', name:'Maria Delgado',   rank:'Captain',               role:'officer', status:'Active',       joined:'2011-06-20', phone:'555-201-0002', station_email:'maria.delgado@maplewoodfd.org', personal_email:'m.delgado@yahoo.com', certs:'["FF I","FF II","Fire Officer I","HazMat Operations","Instructor I"]' },
    { num:'M-003', name:'Nathan McGee',    rank:'Firefighter',           role:'member',  status:'Active',       joined:'2013-09-10', phone:'555-201-0003', station_email:'nathan.mcgee@maplewoodfd.org', personal_email:'nmcgee1985@outlook.com', certs:'["FF I","FF II","EMT-Basic","Driver/Operator - Pumper"]' },
    { num:'M-004', name:'Sandra Kim',      rank:'Firefighter/EMT',       role:'member',  status:'Active',       joined:'2016-02-28', phone:'555-201-0004', station_email:'sandra.kim@maplewoodfd.org', personal_email:'skim@icloud.com', certs:'["FF I","FF II","EMT-B","Hazmat Operations"]' },
    { num:'M-005', name:'James Ortega',    rank:'Firefighter',           role:'member',  status:'Active',       joined:'2017-07-04', phone:'555-201-0005', station_email:'james.ortega@maplewoodfd.org', personal_email:'jortega.ff@gmail.com', certs:'["FF I","FF II","Technical Rescue"]' },
    { num:'M-006', name:'Tracy Benson',    rank:'Firefighter/EMT',       role:'member',  status:'Active',       joined:'2018-11-01', phone:'555-201-0006', station_email:'tracy.benson@maplewoodfd.org', personal_email:'tracybenson@yahoo.com', certs:'["FF I","FF II","Wildland Firefighter","HAZMAT Ops"]' },
    { num:'M-007', name:'Mike Harrington', rank:'Firefighter',           role:'member',  status:'Active',       joined:'2019-04-15', phone:'555-201-0007', station_email:'mike.harrington@maplewoodfd.org', personal_email:'mharrington82@gmail.com', certs:'["FF I","NIMS IS-700","EMT-B"]' },
    { num:'M-008', name:'Lisa Fontaine',   rank:'Firefighter/Paramedic', role:'member',  status:'Active',       joined:'2020-01-20', phone:'555-201-0008', station_email:'lisa.fontaine@maplewoodfd.org', personal_email:'lfontaine@hotmail.com', certs:'["FF I","FF II","Paramedic","Technical Rescue - Rope"]' },
    { num:'M-009', name:'Carlos Ruiz',     rank:'Probationary FF',       role:'member',  status:'Probationary', joined:'2023-08-01', phone:'555-201-0009', station_email:'carlos.ruiz@maplewoodfd.org', personal_email:'cruiz2001@gmail.com', certs:'["FF I"]' },
    { num:'M-010', name:'Amy Winters',     rank:'Probationary FF',       role:'member',  status:'Probationary', joined:'2024-01-10', phone:'555-201-0010', station_email:'amy.winters@maplewoodfd.org', personal_email:'awinters2000@yahoo.com', certs:'[]' },
    { num:'M-011', name:'Kevin Marsh',     rank:'Driver/Engineer',       role:'member',  status:'Active',       joined:'2015-05-12', phone:'555-201-0011', station_email:'kevin.marsh@maplewoodfd.org', personal_email:'kmarsh1988@gmail.com', certs:'["FF I","FF II","Driver/Operator - Pumper","Driver/Operator - Aerial"]' },
    { num:'M-012', name:'Diane Tolliver',  rank:'Driver/Engineer',       role:'member',  status:'Active',       joined:'2014-09-22', phone:'555-201-0012', station_email:'diane.tolliver@maplewoodfd.org', personal_email:'dtolliver@icloud.com', certs:'["FF I","FF II","Driver/Operator - Pumper"]' },
  ];
  for (const m of demoMembers) {
    await pool.query(
      // Bare ON CONFLICT DO NOTHING (no named target): this demo seed runs
      // EARLIER in initDb than applyDepartmentExpand creates the per-department
      // index (idx_members_dept_number), so a named composite target wouldn't
      // resolve yet. A bare target conflicts on whatever unique index exists
      // (or none) — robust to ordering. initDb only runs on a FRESH DB anyway
      // (members empty), so this is purely defensive against a re-run.
      `INSERT INTO members ("memberNumber","name","rank","role","status","joined","phone","station_email","personal_email","certifications","station_id")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT DO NOTHING`,
      [m.num, m.name, m.rank, m.role, m.status, m.joined, m.phone, m.station_email, m.personal_email, m.certs, 1]
    );
  }
  console.log('✅  Demo members seeded');
  });

  await safeSeed('apparatus', async () => {
  const demoApp = [
    { des:'Engine 1',  type:'Engine',    year:2018, make:'Pierce',       model:'Enforcer',   status:'In Service',     mileage:42800, notes:'Primary attack engine. 1500 GPM pump, 750 gal tank.' },
    { des:'Engine 2',  type:'Engine',    year:2011, make:'KME',          model:'Predator',   status:'In Service',     mileage:98500, notes:'Reserve engine. 1250 GPM pump, 500 gal tank.' },
    { des:'Ladder 1',  type:'Ladder',    year:2020, make:'Pierce',       model:'Ascendant',  status:'In Service',     mileage:28300, notes:'100ft aerial ladder. Quint configuration.' },
    { des:'Rescue 1',  type:'Rescue',    year:2016, make:'Spartan',      model:'ERV',        status:'In Service',     mileage:61200, notes:'Heavy rescue. Extrication, confined space, rope rescue.' },
    { des:'Tanker 1',  type:'Tanker',    year:2014, make:'Freightliner', model:'M2',         status:'In Service',     mileage:54700, notes:'3000 gal water tanker for rural operations.' },
    { des:'Medic 1',   type:'Ambulance', year:2022, make:'Ford',         model:'F-450',      status:'In Service',     mileage:18900, notes:'ALS ambulance. Primary EMS response.' },
    { des:'Medic 2',   type:'Ambulance', year:2019, make:'Ford',         model:'F-450 (Res)',status:'Out of Service', mileage:74300, notes:'Reserve medic. Generator service due.' },
    { des:'Utility 1', type:'Utility',   year:2021, make:'Ford',         model:'F-250',      status:'In Service',     mileage:33100, notes:'Battalion chief vehicle. Command post.' },
  ];
  for (const a of demoApp) {
    await pool.query(
      `INSERT INTO apparatus (designation,type,year,make,model,status,mileage,"lastService","nextServiceDue",notes,station_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT DO NOTHING`,
      [a.des, a.type, a.year, a.make, a.model, a.status, a.mileage, '2024-10-15', '2025-04-15', a.notes, 1]
    );
  }
  console.log('✅  Demo apparatus seeded');
  });

  await safeSeed('incidents', async () => {
  const demoInc = [
    { num:'2025-0412', date:'2025-03-08', time:'14:23', type:'Structure Fire',      alarm:'2nd Alarm', addr:'847 Oak Street',         units:'["Engine 1","Engine 2","Ladder 1","Rescue 1"]', pers:12, disp:'Extinguished',        notes:'Residential kitchen fire. Contained to room of origin.' },
    { num:'2025-0387', date:'2025-03-05', time:'08:45', type:'Motor Vehicle Crash', alarm:'1st Alarm', addr:'US-47 & County Rd 12',   units:'["Engine 1","Rescue 1","Medic 1"]',             pers:6,  disp:'Patients Transported', notes:'2-vehicle MVA. 1 extrication required. 3 transported.' },
    { num:'2025-0341', date:'2025-02-28', time:'21:12', type:'EMS - Cardiac',       alarm:'1st Alarm', addr:'2204 Maple Avenue',       units:'["Medic 1","Engine 1"]',                        pers:4,  disp:'Transported - ALS',   notes:'STEMI alert. Patient transported to Maplewood Regional.' },
    { num:'2025-0298', date:'2025-02-19', time:'03:37', type:'Carbon Monoxide',     alarm:'1st Alarm', addr:'516 Birchwood Drive',     units:'["Engine 1","Medic 1"]',                        pers:4,  disp:'Mitigated',            notes:'CO detector activation. Faulty furnace. 4 occupants evaluated.' },
    { num:'2025-0251', date:'2025-02-11', time:'11:50', type:'Brush Fire',          alarm:'1st Alarm', addr:'Ridgeline Rd near MM 6',  units:'["Engine 1","Tanker 1","Utility 1"]',           pers:6,  disp:'Extinguished',         notes:'3 acre brush fire. Wind-driven. Contained in 45 minutes.' },
    { num:'2025-0204', date:'2025-02-02', time:'16:08', type:'Gas Leak',            alarm:'1st Alarm', addr:'1122 Commerce Blvd',      units:'["Engine 1","Utility 1"]',                      pers:4,  disp:'Mitigated',            notes:'Natural gas leak at commercial building. Utility notified.' },
    { num:'2025-0178', date:'2025-01-27', time:'09:14', type:'Wildland Fire',       alarm:'2nd Alarm', addr:'Timber Creek Rd, Mile 3', units:'["Engine 1","Engine 2","Tanker 1","Utility 1"]',pers:10, disp:'Extinguished',         notes:'15 acre timber fire. Mutual aid from 3 neighboring departments.' },
    { num:'2025-0142', date:'2025-01-18', time:'19:55', type:'EMS - Trauma',        alarm:'1st Alarm', addr:'99 Industrial Park Dr',   units:'["Medic 1","Engine 1","Rescue 1"]',             pers:6,  disp:'Transported - ALS',   notes:'Industrial injury. Patient airlifted to Level 1 trauma center.' },
  ];
  for (const i of demoInc) {
    await pool.query(
      `INSERT INTO incidents ("incidentNumber",date,time,type,"alarmLevel",address,units,personnel,disposition,notes,photos,station_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT DO NOTHING`,
      [i.num, i.date, i.time, i.type, i.alarm, i.addr, i.units, i.pers, i.disp, i.notes, '[]', 1]
    );
  }
  console.log('✅  Demo incidents seeded');
  });

  await safeSeed('exams', async () => {
  const { EXAM_BANK } = require('./seed-exams');
  let seededCount = 0;
  for (const exam of EXAM_BANK) {
    const { rows: existing } = await pool.query(
      'SELECT id FROM exams WHERE station_id = 1 AND title = $1', [exam.title]
    );
    if (existing.length === 0) {
      await pool.query(
        `INSERT INTO exams (station_id, title, description, category, time_limit, passing_score, randomize, questions, created_by, status, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [1, exam.title, exam.description, exam.category, exam.time_limit, exam.passing_score,
         exam.randomize, JSON.stringify(exam.questions), 1, exam.status, null]
      );
      seededCount++;
    }
  }
  if (seededCount > 0) {
    console.log(`✅  Certification exam bank: seeded ${seededCount} new exam(s) (${EXAM_BANK.length} total in bank)`);
  }
  });

  // ── Seed Phase 5 & 6 modules ────────────────────────────────────────────────

  await safeSeed('meeting_minutes', async () => {
  console.log('[inline-meeting-seed] ▶ Starting inline meeting_minutes seed');
  const { rows: mmCheck } = await pool.query('SELECT COUNT(*) as c FROM meeting_minutes WHERE station_id = 1');
  const cnt = parseInt(mmCheck[0].c);
  console.log('[inline-meeting-seed] Current count:', cnt);
  if (cnt === 0) {
    const meetingMinutes = [
      { title: 'January Regular Meeting', meeting_date: '2026-01-14', meeting_type: 'regular', location: 'Station 14 — Meeting Room', called_by: 'Chief Chen', attendees: JSON.stringify([{id:1,name:'Sarah Chen'},{id:2,name:'Maria Delgado'},{id:3,name:'Nathan McGee'},{id:4,name:'Sandra Kim'},{id:5,name:'James Ortega'},{id:6,name:'Tracy Benson'},{id:7,name:'Mike Harrington'},{id:11,name:'Kevin Marsh'}]), agenda: JSON.stringify([{item:'Treasurer Report — Q4 financials',presenter:'Chief Chen'},{item:'New SCBA mask fitting schedule',presenter:'Capt. Delgado'},{item:'Spring fund drive planning',presenter:'Lt. McGee'}]), motions: JSON.stringify([{motion:'Approve $4,200 for SCBA mask replacements',moved_by:'Maria Delgado',seconded_by:'Nathan McGee',result:'Passed 8-0'},{motion:'Set spring fund drive date for April 18',moved_by:'Nathan McGee',seconded_by:'James Ortega',result:'Passed 7-1'}]), action_items: JSON.stringify([{task:'Schedule SCBA mask fittings for all members',assigned_to:'Maria Delgado',due_date:'2026-02-01'},{task:'Book Elks Lodge for fund drive',assigned_to:'Nathan McGee',due_date:'2026-02-15'},{task:'Send Q4 financials to township',assigned_to:'Sarah Chen',due_date:'2026-01-31'}]), notes: 'Good attendance. Chief reminded all members about upcoming ISO evaluation in March.', next_meeting: '2026-02-11', recorded_by: 'Nathan McGee', status: 'approved' },
      { title: 'February Regular Meeting', meeting_date: '2026-02-11', meeting_type: 'regular', location: 'Station 14 — Meeting Room', called_by: 'Chief Chen', attendees: JSON.stringify([{id:1,name:'Sarah Chen'},{id:2,name:'Maria Delgado'},{id:3,name:'Nathan McGee'},{id:4,name:'Sandra Kim'},{id:6,name:'Tracy Benson'},{id:8,name:'Lisa Fontaine'},{id:9,name:'Carlos Ruiz'},{id:11,name:'Kevin Marsh'},{id:12,name:'Diane Tolliver'}]), agenda: JSON.stringify([{item:'SCBA mask fitting update',presenter:'Capt. Delgado'},{item:'ISO evaluation preparation',presenter:'Chief Chen'},{item:'Probationary member progress',presenter:'Lt. McGee'},{item:'Spring training calendar',presenter:'Capt. Delgado'}]), motions: JSON.stringify([{motion:'Approve Carlos Ruiz for Firefighter I practical exam',moved_by:'Nathan McGee',seconded_by:'Sandra Kim',result:'Passed 9-0'}]), action_items: JSON.stringify([{task:'Complete pre-plans for all target hazards before ISO visit',assigned_to:'Sandra Kim',due_date:'2026-03-01'},{task:'Verify all hydrant flow test records are current',assigned_to:'Kevin Marsh',due_date:'2026-02-28'},{task:'Schedule FF1 practical exam for Carlos Ruiz',assigned_to:'Nathan McGee',due_date:'2026-02-20'}]), notes: 'ISO evaluation tentatively scheduled for March 20. All records must be current.', next_meeting: '2026-03-11', recorded_by: 'Nathan McGee', status: 'approved' },
      { title: 'Emergency Officers Meeting', meeting_date: '2026-02-25', meeting_type: 'special', location: 'Station 14 — Chief\'s Office', called_by: 'Chief Chen', attendees: JSON.stringify([{id:1,name:'Sarah Chen'},{id:2,name:'Maria Delgado'},{id:3,name:'Nathan McGee'}]), agenda: JSON.stringify([{item:'Mutual aid agreement renewal with Millburn FD',presenter:'Chief Chen'},{item:'Water main break response protocol',presenter:'Capt. Delgado'}]), motions: JSON.stringify([{motion:'Authorize Chief to sign renewed mutual aid agreement with Millburn',moved_by:'Maria Delgado',seconded_by:'Nathan McGee',result:'Passed 3-0'}]), action_items: JSON.stringify([{task:'Sign and file mutual aid agreement',assigned_to:'Sarah Chen',due_date:'2026-03-01'}]), notes: 'Emergency meeting called due to expiring mutual aid agreement deadline.', next_meeting: '2026-03-11', recorded_by: 'Maria Delgado', status: 'approved' },
    ];
    let inlineInserted = 0;
    for (const mm of meetingMinutes) {
      try {
        await pool.query(
          `INSERT INTO meeting_minutes (station_id, title, meeting_date, meeting_type, location, called_by, attendees, agenda, motions, action_items, notes, next_meeting, recorded_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [1, mm.title, mm.meeting_date, mm.meeting_type, mm.location, mm.called_by, mm.attendees, mm.agenda, mm.motions, mm.action_items, mm.notes, mm.next_meeting, mm.recorded_by, mm.status]
        );
        inlineInserted++;
        console.log(`[inline-meeting-seed]   ✔ Inserted: "${mm.title}"`);
      } catch (e) {
        console.error(`[inline-meeting-seed]   ❌ FAILED "${mm.title}":`, e.message);
      }
    }
    console.log(`✅  Demo meeting minutes seeded (${inlineInserted}/${meetingMinutes.length})`);
  } else {
    console.log('[inline-meeting-seed] Already has data, skipping.');
  }
  });

  await safeSeed('policy_acknowledgments', async () => {
  const { rows: paCheck } = await pool.query('SELECT COUNT(*) as c FROM policy_acknowledgments WHERE station_id = 1');
  if (parseInt(paCheck[0].c) === 0) {
    const policies = [
      { policy_title: 'SOG 100 — Response to Structure Fires', policy_ref: 'SOG-100', policy_type: 'sog', description: 'Standard operating guideline for response to confirmed structure fire incidents. Covers initial dispatch, first-due assignments, RIT, and accountability.', effective_date: '2025-06-01', review_date: '2026-06-01', required_by: JSON.stringify([{id:1,name:'Sarah Chen'},{id:2,name:'Maria Delgado'},{id:3,name:'Nathan McGee'},{id:4,name:'Sandra Kim'},{id:5,name:'James Ortega'},{id:6,name:'Tracy Benson'},{id:7,name:'Mike Harrington'},{id:8,name:'Lisa Fontaine'},{id:9,name:'Carlos Ruiz'},{id:10,name:'Amy Winters'},{id:11,name:'Kevin Marsh'},{id:12,name:'Diane Tolliver'}]), acknowledged_by: JSON.stringify([{member_id:1,name:'Sarah Chen',acknowledged_at:'2025-06-05'},{member_id:2,name:'Maria Delgado',acknowledged_at:'2025-06-06'},{member_id:3,name:'Nathan McGee',acknowledged_at:'2025-06-06'},{member_id:4,name:'Sandra Kim',acknowledged_at:'2025-06-07'},{member_id:5,name:'James Ortega',acknowledged_at:'2025-06-08'},{member_id:6,name:'Tracy Benson',acknowledged_at:'2025-06-08'},{member_id:7,name:'Mike Harrington',acknowledged_at:'2025-06-10'},{member_id:8,name:'Lisa Fontaine',acknowledged_at:'2025-06-10'},{member_id:11,name:'Kevin Marsh',acknowledged_at:'2025-06-12'},{member_id:12,name:'Diane Tolliver',acknowledged_at:'2025-06-12'}]), total_required: 12, total_acknowledged: 10, created_by: 'Sarah Chen', status: 'active' },
      { policy_title: 'Safety Bulletin — Lithium Battery Fires', policy_ref: 'SB-2026-01', policy_type: 'safety_bulletin', description: 'New procedures for lithium-ion battery fire incidents including EV fires. Covers suppression tactics, PPE requirements, and overhaul precautions.', effective_date: '2026-01-15', review_date: '2027-01-15', required_by: JSON.stringify([{id:1,name:'Sarah Chen'},{id:2,name:'Maria Delgado'},{id:3,name:'Nathan McGee'},{id:4,name:'Sandra Kim'},{id:5,name:'James Ortega'},{id:6,name:'Tracy Benson'},{id:7,name:'Mike Harrington'},{id:8,name:'Lisa Fontaine'},{id:9,name:'Carlos Ruiz'},{id:10,name:'Amy Winters'},{id:11,name:'Kevin Marsh'},{id:12,name:'Diane Tolliver'}]), acknowledged_by: JSON.stringify([{member_id:1,name:'Sarah Chen',acknowledged_at:'2026-01-16'},{member_id:2,name:'Maria Delgado',acknowledged_at:'2026-01-17'},{member_id:3,name:'Nathan McGee',acknowledged_at:'2026-01-18'},{member_id:4,name:'Sandra Kim',acknowledged_at:'2026-01-20'}]), total_required: 12, total_acknowledged: 4, created_by: 'Sarah Chen', status: 'active' },
      { policy_title: 'Code of Conduct — Social Media Policy', policy_ref: 'COC-005', policy_type: 'code_of_conduct', description: 'Guidelines for member conduct on social media regarding department activities, incident scenes, and patient information.', effective_date: '2025-09-01', review_date: '2026-09-01', required_by: JSON.stringify([{id:1,name:'Sarah Chen'},{id:2,name:'Maria Delgado'},{id:3,name:'Nathan McGee'},{id:4,name:'Sandra Kim'},{id:5,name:'James Ortega'},{id:6,name:'Tracy Benson'},{id:7,name:'Mike Harrington'},{id:8,name:'Lisa Fontaine'},{id:9,name:'Carlos Ruiz'},{id:10,name:'Amy Winters'},{id:11,name:'Kevin Marsh'},{id:12,name:'Diane Tolliver'}]), acknowledged_by: JSON.stringify([{member_id:1,name:'Sarah Chen',acknowledged_at:'2025-09-02'},{member_id:2,name:'Maria Delgado',acknowledged_at:'2025-09-03'},{member_id:3,name:'Nathan McGee',acknowledged_at:'2025-09-03'},{member_id:4,name:'Sandra Kim',acknowledged_at:'2025-09-05'},{member_id:5,name:'James Ortega',acknowledged_at:'2025-09-05'},{member_id:6,name:'Tracy Benson',acknowledged_at:'2025-09-06'},{member_id:7,name:'Mike Harrington',acknowledged_at:'2025-09-07'},{member_id:8,name:'Lisa Fontaine',acknowledged_at:'2025-09-08'},{member_id:9,name:'Carlos Ruiz',acknowledged_at:'2025-09-10'},{member_id:10,name:'Amy Winters',acknowledged_at:'2025-09-10'},{member_id:11,name:'Kevin Marsh',acknowledged_at:'2025-09-12'},{member_id:12,name:'Diane Tolliver',acknowledged_at:'2025-09-12'}]), total_required: 12, total_acknowledged: 12, created_by: 'Sarah Chen', status: 'active' },
    ];
    for (const p of policies) {
      await pool.query(
        `INSERT INTO policy_acknowledgments (station_id, policy_title, policy_ref, policy_type, description, effective_date, review_date, required_by, acknowledged_by, total_required, total_acknowledged, created_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
        [1, p.policy_title, p.policy_ref, p.policy_type, p.description, p.effective_date, p.review_date, p.required_by, p.acknowledged_by, p.total_required, p.total_acknowledged, p.created_by, p.status]
      );
    }
    console.log('✅  Demo policy acknowledgments seeded');
  }
  });

  await safeSeed('equipment_checkout', async () => {
  const { rows: ecCheck } = await pool.query('SELECT COUNT(*) as c FROM equipment_checkout WHERE station_id = 1');
  if (parseInt(ecCheck[0].c) === 0) {
    const checkouts = [
      { item_name: 'Thermal Imaging Camera #2', item_type: 'tac', serial_number: 'TIC-2024-0042', asset_tag: 'MFD-TIC-002', checked_out_by: 2, checked_out_at: '2026-03-10 08:30:00', expected_return: '2026-03-10 18:00:00', condition_out: 'good', purpose: 'Building inspection — 42 Main St pre-plan survey', status: 'checked_out' },
      { item_name: 'Portable Radio #8', item_type: 'radio', serial_number: 'MOT-APX-1008', asset_tag: 'MFD-RAD-008', checked_out_by: 5, checked_out_at: '2026-03-12 07:00:00', expected_return: '2026-03-12 19:00:00', condition_out: 'good', purpose: 'Mutual aid standby — Millburn 2nd alarm', status: 'checked_out' },
      { item_name: 'Gas Detector — 4-Gas', item_type: 'detector', serial_number: 'MSA-4G-0023', asset_tag: 'MFD-DET-003', checked_out_by: 4, checked_out_at: '2026-03-08 14:00:00', expected_return: '2026-03-08 17:00:00', returned_at: '2026-03-08 16:45:00', returned_to: 'Nathan McGee', condition_out: 'good', condition_in: 'good', purpose: 'CO investigation — 18 Oak Ave', status: 'returned' },
      { item_name: 'Halligan Bar — Spare', item_type: 'forcible_entry', serial_number: null, asset_tag: 'MFD-FE-007', checked_out_by: 7, checked_out_at: '2026-03-05 09:00:00', expected_return: '2026-03-06 09:00:00', condition_out: 'fair', purpose: 'Forcible entry training at drill tower', status: 'overdue' },
    ];
    for (const c of checkouts) {
      await pool.query(
        `INSERT INTO equipment_checkout (station_id, item_name, item_type, serial_number, asset_tag, checked_out_by, checked_out_at, expected_return, returned_at, returned_to, condition_out, condition_in, purpose, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`,
        [1, c.item_name, c.item_type, c.serial_number, c.asset_tag, c.checked_out_by, c.checked_out_at, c.expected_return, c.returned_at || null, c.returned_to || null, c.condition_out, c.condition_in || null, c.purpose, c.status]
      );
    }
    console.log('✅  Demo equipment checkouts seeded');
  }
  });

  await safeSeed('incident_costs', async () => {
  const { rows: icCheck } = await pool.query('SELECT COUNT(*) as c FROM incident_costs WHERE station_id = 1');
  if (parseInt(icCheck[0].c) === 0) {
    const incidentCosts = [
      { incident_number: '2026-0014', incident_date: '2026-02-18', incident_type: 'Structure Fire', location: '127 Elm Street', apparatus_costs: JSON.stringify([{unit:'Engine 14',hours:4.5,rate:185,total:832.50},{unit:'Ladder 14',hours:3.0,rate:225,total:675.00},{unit:'Rescue 14',hours:2.0,rate:150,total:300.00}]), personnel_costs: JSON.stringify([{role:'Interior crew',count:6,hours:4.5,rate:35,total:945.00},{role:'Command staff',count:2,hours:5.0,rate:45,total:450.00},{role:'RIT team',count:4,hours:3.0,rate:35,total:420.00}]), material_costs: JSON.stringify([{item:'Foam concentrate',quantity:20,unit:'gallons',rate:18,total:360.00},{item:'Salvage covers',quantity:4,unit:'each',rate:85,total:340.00}]), other_costs: JSON.stringify([{description:'Rehab — food and water',total:125.00},{description:'Fuel surcharge',total:95.00}]), total_cost: 4542.50, billable: true, billed_to: 'Homeowner insurance — State Farm', invoice_number: 'INV-2026-0014', payment_status: 'pending', calculated_by: 'Sarah Chen', status: 'final' },
      { incident_number: '2026-0022', incident_date: '2026-03-02', incident_type: 'Hazmat — Gas Leak', location: '45 Commerce Blvd — Industrial Park', apparatus_costs: JSON.stringify([{unit:'Engine 14',hours:2.0,rate:185,total:370.00},{unit:'Hazmat 14',hours:3.5,rate:275,total:962.50}]), personnel_costs: JSON.stringify([{role:'Hazmat tech',count:3,hours:3.5,rate:45,total:472.50},{role:'Support crew',count:4,hours:2.0,rate:35,total:280.00}]), material_costs: JSON.stringify([{item:'Absorbent booms',quantity:6,unit:'each',rate:42,total:252.00},{item:'Level A suits — decon',quantity:2,unit:'each',rate:125,total:250.00}]), other_costs: JSON.stringify([{description:'DEP notification and reporting',total:75.00}]), total_cost: 2662.00, billable: true, billed_to: 'ABC Chemical Corp', invoice_number: 'INV-2026-0022', payment_status: 'unpaid', calculated_by: 'Sarah Chen', status: 'final' },
    ];
    for (const ic of incidentCosts) {
      await pool.query(
        `INSERT INTO incident_costs (station_id, incident_number, incident_date, incident_type, location, apparatus_costs, personnel_costs, material_costs, other_costs, total_cost, billable, billed_to, invoice_number, payment_status, calculated_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT DO NOTHING`,
        [1, ic.incident_number, ic.incident_date, ic.incident_type, ic.location, ic.apparatus_costs, ic.personnel_costs, ic.material_costs, ic.other_costs, ic.total_cost, ic.billable, ic.billed_to, ic.invoice_number, ic.payment_status, ic.calculated_by, ic.status]
      );
    }
    console.log('✅  Demo incident costs seeded');
  }
  });

  await safeSeed('bulletins', async () => {
  const { rows: bulCheck } = await pool.query('SELECT COUNT(*) as c FROM bulletins WHERE station_id = 1');
  if (parseInt(bulCheck[0].c) === 0) {
    const bulletins = [
      { title: 'ISO Evaluation — March 20th', body: 'The ISO evaluation team will be conducting our PPC reassessment on March 20, 2026. All records must be current. Please ensure your training hours, equipment checks, and pre-plans are up to date. Contact Chief Chen with any questions.', category: 'Operations', priority: 'urgent', pinned: true, author_name: 'Sarah Chen' },
      { title: 'Spring Fund Drive — April 18', body: 'Our annual spring fund drive is scheduled for Saturday, April 18 at the Elks Lodge. We need volunteers for setup (3 PM), serving (5-9 PM), and cleanup. Sign up on the board in the kitchen. Families welcome!', category: 'Events', priority: 'normal', pinned: true, author_name: 'Nathan McGee' },
      { title: 'New SCBA Mask Fitting Schedule', body: 'All members must complete annual SCBA mask fit testing by February 28. Fittings are available:\n- Feb 10, 18:00–20:00\n- Feb 15, 09:00–12:00\n- Feb 22, 18:00–20:00\nContact Capt. Delgado to schedule your slot.', category: 'Safety', priority: 'high', pinned: false, author_name: 'Maria Delgado' },
      { title: 'Apparatus Bay Floor Recoating', body: 'The apparatus bay floor will be recoated the weekend of March 7-8. All vehicles will need to be moved to the rear lot by Friday evening. Please do not walk on the new coating for 48 hours.', category: 'Facilities', priority: 'normal', pinned: false, author_name: 'Sarah Chen' },
    ];
    for (const b of bulletins) {
      await pool.query(
        `INSERT INTO bulletins (station_id, title, body, category, priority, pinned, author_id, author_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [1, b.title, b.body, b.category, b.priority, b.pinned, 1, b.author_name]
      );
    }
    console.log('✅  Demo bulletins seeded');
  }
  });

  await safeSeed('grievances', async () => {
  const { rows: grCheck } = await pool.query('SELECT COUNT(*) as c FROM grievances WHERE station_id = 1');
  if (parseInt(grCheck[0].c) === 0) {
    const grievances = [
      { filed_by: 5, filed_date: '2026-01-22', grievance_type: 'working_conditions', subject: 'Broken HVAC in bunk room', description: 'The heating unit in the upstairs bunk room has been non-functional since December. Multiple requests to have it repaired have gone unanswered. Members sleeping in the bunk room during overnight duty are sleeping in 55°F temperatures.', status: 'resolved', current_step: 'step_3', resolution: 'HVAC unit replaced with new system on Feb 3. Temporary space heaters provided in the interim.', resolved_date: '2026-02-03', assigned_to: 'Sarah Chen', grievance_number: 'GRV-2026-004', cba_article: 'Article 5 — Working Conditions', union_rep: 'Mike Harrington', management_rep: 'Sarah Chen' },
      { filed_by: 9, filed_date: '2026-02-14', grievance_type: 'training', subject: 'Denied FF1 practical exam scheduling', description: 'I completed all prerequisites for the Firefighter I practical exam in January but was told I had to wait until the next testing cycle in June. Other probationary members in neighboring departments are being tested on a rolling basis.', status: 'open', current_step: 'step_2', resolution: null, resolved_date: null, assigned_to: 'Maria Delgado', grievance_number: 'GRV-2026-005', cba_article: 'Article 9 — Training Opportunities', union_rep: 'Nathan McGee', management_rep: 'Maria Delgado' },
    ];
    for (const g of grievances) {
      await pool.query(
        `INSERT INTO grievances (station_id, filed_by, filed_date, grievance_type, subject, description, status, current_step, resolution, resolved_date, assigned_to, grievance_number, cba_article, union_rep, management_rep) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING`,
        [1, g.filed_by, g.filed_date, g.grievance_type, g.subject, g.description, g.status, g.current_step, g.resolution, g.resolved_date, g.assigned_to, g.grievance_number, g.cba_article, g.union_rep, g.management_rep]
      );
    }
    console.log('✅  Demo grievances seeded');
  }
  });

  // ── Bootstrap: first chief account from env vars (headless install) ─────────
  // For self-hosting fire departments: drop BOOTSTRAP_CHIEF_USERNAME and
  // BOOTSTRAP_CHIEF_PASSWORD in server/.env on first deploy. If no users
  // exist (clean install with SEED_DEMO unset), a chief account gets created
  // automatically. After first successful login, set those env vars to
  // empty / remove them — they're not used again.
  //
  // Optional: BOOTSTRAP_CHIEF_NAME for the display name (defaults to "Chief").
  if (process.env.BOOTSTRAP_CHIEF_USERNAME && process.env.BOOTSTRAP_CHIEF_PASSWORD) {
    try {
      const { rows } = await pool.query('SELECT COUNT(*) AS c FROM users');
      if (parseInt(rows[0].c) === 0) {
        const chiefName = process.env.BOOTSTRAP_CHIEF_NAME || 'Chief';
        const initials = chiefName
          .split(/\s+/)
          .map(s => s[0] || '')
          .join('')
          .toUpperCase()
          .slice(0, 4) || 'CH';
        const hash = bcrypt.hashSync(process.env.BOOTSTRAP_CHIEF_PASSWORD, 10);
        await pool.query(
          `INSERT INTO users (username, name, initials, role, "passwordHash", station_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (username) DO NOTHING`,
          [process.env.BOOTSTRAP_CHIEF_USERNAME, chiefName, initials, 'chief', hash, 1]
        );
        console.log(`[bootstrap] Created chief account "${process.env.BOOTSTRAP_CHIEF_USERNAME}" (${chiefName}) — remove BOOTSTRAP_CHIEF_* env vars after first login.`);
      } else {
        console.log('[bootstrap] Users already exist — skipping BOOTSTRAP_CHIEF_* env var setup.');
      }
    } catch (e) {
      console.warn('[bootstrap] Failed to create chief account from env vars:', e.message);
    }
  }

  // ── Post-schema hardening (MUST stay at the END of initDb) ────────────────
  // These mirror docs/migrations/0002-*.sql + 0003-*.sql plus the 2026-06-10
  // per-department indexes so FRESH installs match prod. They reference nearly
  // every table above, so they can only run after all CREATE TABLEs. Each
  // statement is applied individually and a missing relation is skipped with a
  // warning instead of aborting init — fs_hazmat_* tables, for example, are
  // created later by ensureHazmatReference()/ensureHazmatIncidentTables()
  // (index.js), not by initDb.
  // Prod note: the fast-path at the top of initDb returns early on an
  // already-bootstrapped DB, so changes here do NOT auto-apply to existing
  // production — apply by hand (Supabase SQL) as well.
  async function applyPostSchemaHardening() {
    const statements = [
      // Per-department query indexes (multi-tenant scaling, 2026-06-10)
      'CREATE INDEX IF NOT EXISTS idx_cad_alerts_station_ts ON cad_alerts (station_id, dispatched_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_incidents_station ON incidents (station_id)',
      'CREATE INDEX IF NOT EXISTS idx_unit_status_history_station_incident ON unit_status_history (station_id, incident_id)',
      'CREATE INDEX IF NOT EXISTS idx_members_station ON members (station_id)',
      // batch-2 (2026-06-10): credential-table RLS + FK covering indexes
      'ALTER TABLE cad_connections ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE radio_config    ENABLE ROW LEVEL SECURITY',
      'CREATE INDEX IF NOT EXISTS idx_unit_statuses_apparatus ON unit_statuses(apparatus_id)',
      'CREATE INDEX IF NOT EXISTS idx_app_assign_apparatus ON apparatus_assignments(apparatus_id)',
      'CREATE INDEX IF NOT EXISTS idx_app_assign_member    ON apparatus_assignments(member_id)',
      'CREATE INDEX IF NOT EXISTS idx_app_assign_position  ON apparatus_assignments(position_id)',
      'CREATE INDEX IF NOT EXISTS idx_app_assign_shift     ON apparatus_assignments(shift_id)',
      'CREATE INDEX IF NOT EXISTS idx_app_assign_station   ON apparatus_assignments(station_id)',
      // 1.1c-a: the riding board read path + race-proof seat integrity
      // (one person per department/date/apparatus/position_name). See migration 0069.
      'CREATE INDEX IF NOT EXISTS idx_app_assign_dept_date ON apparatus_assignments(department_id, date)',
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_apparatus_assignments_seat ON apparatus_assignments(department_id, date, apparatus_id, position_name)',
      'CREATE INDEX IF NOT EXISTS idx_app_pos_apparatus    ON apparatus_positions(apparatus_id)',
      'CREATE INDEX IF NOT EXISTS idx_app_pos_station      ON apparatus_positions(station_id)',
      'CREATE INDEX IF NOT EXISTS idx_exposure_incident    ON exposure_records(incident_id)',
      'CREATE INDEX IF NOT EXISTS idx_exposure_member      ON exposure_records(member_id)',
      'CREATE INDEX IF NOT EXISTS idx_exposure_station     ON exposure_records(station_id)',
      'CREATE INDEX IF NOT EXISTS idx_hazinc_created_by    ON fs_hazmat_incidents(created_by)',
      'CREATE INDEX IF NOT EXISTS idx_hazinc_ic_user       ON fs_hazmat_incidents(ic_user_id)',
      'CREATE INDEX IF NOT EXISTS idx_hazinc_station       ON fs_hazmat_incidents(station_id)',
      'CREATE INDEX IF NOT EXISTS idx_hazaudit_changed_by  ON fs_hazmat_incident_audit(changed_by)',
      'CREATE INDEX IF NOT EXISTS idx_grievances_filed_by  ON grievances(filed_by)',
      'CREATE INDEX IF NOT EXISTS idx_inc_costs_station    ON incident_costs(station_id)',
    ];
    // 0003 (2026-06-12): deny-all RLS on the remaining OF tables. RLS on, NO
    // policies, NO FORCE → the owner role (postgres, which the app connects
    // as) bypasses RLS, so the app is unaffected; non-owner API roles (anon
    // via PostgREST) get deny-all. Closes anon reads of members/
    // users(passwordHash)/incidents/etc.
    // Table names are hardcoded constants (not user input).
    const RLS_DENY_ALL_TABLES = [
      'active_boards','after_action_reports','ai_usage','apparatus','apparatus_assignments',
      'apparatus_oos','apparatus_positions','assets','assistant_alerts','assistant_feedback',
      'assistant_preferences','attachments','audit_log','budget_lines','budget_transactions',
      'bulletins','cad_alerts','cadets','calendar_subscriptions','checklist_completions',
      'checklist_templates','community_events','correspondence','courses','coverage_outreach',
      'crr_programs','crr_visits','cylinders','daily_staffing','dept_documents','donations',
      'drills','equipment_checkout','events','exam_assignments','exam_submissions','exams',
      'exposure_records','fi_inspections','fi_permits','fi_properties','fill_stations',
      'fundraising_campaigns','grants','grievances','hydrants','incident_costs',
      'incident_responses','incidents','investigations','leave_requests','maintenance',
      'meeting_minutes','member_availability','member_qualifications','members','messages',
      'module_completions','mutual_aid','mutual_aid_agreements','nfirs_reports','ot_records',
      'pay_entries','personnel_actions','policy_acknowledgments','pre_plans','push_subscriptions',
      'radio_log','recall_events','recall_responses','recruitment','run_lists','scenario_completions',
      'shift_patterns','shift_swaps','shift_trades','shifts','sogs','station_log','stations',
      'timesheets','training','training_course_completions','training_courses','training_plans',
      'unit_locations','expo_push_tokens','pre_plan_photos','unit_status_acks','par_checks','unit_status_history','unit_statuses','users','volunteer_hours','wellness','workflow_tasks',
    ];
    for (const t of RLS_DENY_ALL_TABLES) {
      statements.push(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    }
    for (const sql of statements) {
      try {
        await pool.query(sql);
      } catch (e) {
        if (e.code === '42P01') {
          // undefined_table — created by a later ensure*/seed step (or a
          // feature table this install doesn't have yet). Skipping is safe:
          // prod already has these applied by hand.
          console.warn(`[initDb hardening] skipped (relation missing): ${sql.slice(0, 80)}`);
        } else if (e.code === '42703') {
          // undefined_column — a column added later in init (or by a migration
          // this install hasn't mirrored yet). Warn LOUDLY instead of killing a
          // fresh install: the 2026-06-18→07-12 fresh-install breakage was this
          // exact class, hidden by an over-broad swallow elsewhere. Prod is
          // unaffected either way (these are applied by hand there).
          console.warn(`[initDb hardening] skipped (column missing): ${sql.slice(0, 80)}`);
        } else {
          throw e;
        }
      }
    }
  }
  await applyPostSchemaHardening();
  await applyDepartmentExpand();
}

// ── Multi-tenant EXPAND (mirrors docs/migrations/0004-departments-expand.sql) ─
// Phase 1 of the department gameplan: adds the `department` tenant key
// ALONGSIDE station_id and backfills it, so behavior is unchanged (code still
// reads station_id until the Phase 3 query migration). Runs at the END of
// initDb — it references nearly every table + needs members/apparatus to exist
// for the landmine fixes. Kept here so FRESH installs match a DB that had 0004
// applied by hand. Idempotent. department_id is NOT added to `users` (shared
// platform identity; membership lives in of_user_departments).
async function applyDepartmentExpand() {
  // 1. departments — the tenant (customer / billing unit).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      fdid          TEXT DEFAULT '',
      dept_type     TEXT DEFAULT '',
      plan_tier     TEXT DEFAULT '',
      shift_pattern TEXT,
      flsa_work_period      INTEGER,
      flsa_ot_threshold     NUMERIC,
      flsa_period_start     TEXT,
      ai_daily_token_budget INTEGER,
      tv_pin                TEXT,
      allow_rig_status      BOOLEAN NOT NULL DEFAULT TRUE,
      -- NERIS Track B (0064): the department's NERIS entity id + the live-
      -- submission gate. DEFAULT FALSE — nothing submits nationally until a
      -- chief explicitly enables it (the market's default-off pattern).
      neris_id              TEXT DEFAULT '',
      neris_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      par_interval_default_min INTEGER
        CONSTRAINT departments_par_interval_default_chk
        CHECK (par_interval_default_min IS NULL
               OR (par_interval_default_min >= 1 AND par_interval_default_min <= 180)),
      -- 0075 — per-department minimum-staffing config + warn/block enforcement.
      -- NULL min → the leave path falls back to the historic default (3); 'warn'
      -- is the market norm and preserves prior behavior (nothing was ever blocked).
      min_staffing_per_shift INTEGER,
      staffing_enforcement  TEXT NOT NULL DEFAULT 'warn'
        CONSTRAINT departments_staffing_enforcement_chk
        CHECK (staffing_enforcement IN ('warn','block')),
      stripe_customer_id    TEXT DEFAULT '',
      stripe_subscription_id TEXT DEFAULT '',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // 2. of_user_departments — OF-owned membership (does NOT touch shared users).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS of_user_departments (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      role          TEXT DEFAULT 'member',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, department_id)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_of_user_departments_user ON of_user_departments(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_of_user_departments_dept ON of_user_departments(department_id)');

  // 3. stations.department_id (which department owns this house).
  await pool.query('ALTER TABLE stations ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id)');

  // 3b. departments.shift_pattern (P4.3) — the department's shift MODE label
  // (e.g. "24/48", "Volunteer (No Shifts)") chosen in the Department Setup
  // Wizard. A starting preference the Duty Schedule reads to seed concrete
  // shift templates later — NOT a template itself.
  await pool.query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS shift_pattern TEXT");
  // 0040 — rig self-statusing toggle (TRUE = rig may status its own unit).
  await pool.query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS allow_rig_status BOOLEAN NOT NULL DEFAULT TRUE");
  // 0044 — opt-in auto-expiry backstop for CAD feeds that never send a close
  // event. NULL = off. Closes the CALL only; unit statuses are never touched.
  await pool.query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS cad_auto_expire_hours INTEGER");
  // 0046 — per-status timer thresholds (minutes; 0=off; NULL=defaults).
  await pool.query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS status_timer_config JSONB");
  // 0062 — department SOG default for the Command Board PAR interval (minutes,
  // 1-180). NULL = no timer until command sets one (no NFPA-mandated interval —
  // never hardcode). Pre-fills a newly activated board; command keeps the
  // per-incident override. CHECK added via guarded DO (idempotent on old DBs).
  await pool.query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS par_interval_default_min INTEGER");
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'departments_par_interval_default_chk'
                     AND conrelid = 'public.departments'::regclass) THEN
      ALTER TABLE public.departments
        ADD CONSTRAINT departments_par_interval_default_chk
        CHECK (par_interval_default_min IS NULL
               OR (par_interval_default_min >= 1 AND par_interval_default_min <= 180));
    END IF;
  END $$`);

  // 0110 (Phase 5) — session + idle timeout, admin-configurable. Defaults
  // REPRODUCE the pre-0110 behaviour exactly (7d idle, 7d absolute) so a fresh
  // install and an existing one behave identically until a chief tightens them.
  // Separate web and mobile windows match the two strongest implementations in
  // the market; the CHECK ranges mirror migration 0110 and routes/departments.js.
  await pool.query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS session_idle_minutes_web INTEGER NOT NULL DEFAULT 10080");
  await pool.query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS session_idle_minutes_mobile INTEGER NOT NULL DEFAULT 10080");
  await pool.query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS session_max_hours INTEGER NOT NULL DEFAULT 168");
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_session_idle_web_ck') THEN
      ALTER TABLE public.departments ADD CONSTRAINT departments_session_idle_web_ck
        CHECK (session_idle_minutes_web BETWEEN 5 AND 10080);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_session_idle_mobile_ck') THEN
      ALTER TABLE public.departments ADD CONSTRAINT departments_session_idle_mobile_ck
        CHECK (session_idle_minutes_mobile BETWEEN 5 AND 10080);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_session_max_hours_ck') THEN
      ALTER TABLE public.departments ADD CONSTRAINT departments_session_max_hours_ck
        CHECK (session_max_hours BETWEEN 1 AND 168);
    END IF;
  END $$`);

  // 0113 (Phase 5 / 5.7) — department-authored custom roles. Built-in rows are
  // trigger-protected from update/delete; custom rows are RLS-scoped. The code
  // ladder in requireRole.js remains the source of truth for built-ins, so a DB
  // problem can never dissolve them and lock a department out of its own system.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS of_roles (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      key           TEXT    NOT NULL,
      label         TEXT    NOT NULL,
      level         INTEGER NOT NULL DEFAULT 1,
      pages         JSONB   NOT NULL DEFAULT '[]'::jsonb,
      is_builtin    BOOLEAN NOT NULL DEFAULT FALSE,
      created_by    INTEGER REFERENCES users(id),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT of_roles_level_ck CHECK (level BETWEEN 1 AND 3),
      CONSTRAINT of_roles_pages_is_array_ck CHECK (jsonb_typeof(pages) = 'array'),
      CONSTRAINT of_roles_key_shape_ck CHECK (key ~ '^[a-z][a-z0-9_]{1,38}$'),
      CONSTRAINT of_roles_dept_key_uniq UNIQUE (department_id, key)
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_of_roles_dept ON of_roles (department_id)');
  await pool.query(`CREATE OR REPLACE FUNCTION of_roles_protect_builtin() RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    BEGIN
      IF (TG_OP = 'DELETE' AND OLD.is_builtin) THEN
        RAISE EXCEPTION 'built-in roles cannot be deleted' USING ERRCODE = 'check_violation';
      END IF;
      IF (TG_OP = 'UPDATE' AND OLD.is_builtin) THEN
        RAISE EXCEPTION 'built-in roles cannot be modified' USING ERRCODE = 'check_violation';
      END IF;
      RETURN COALESCE(NEW, OLD);
    END $fn$`);
  await pool.query('DROP TRIGGER IF EXISTS trg_of_roles_protect_builtin ON of_roles');
  await pool.query(`CREATE TRIGGER trg_of_roles_protect_builtin
    BEFORE UPDATE OR DELETE ON of_roles FOR EACH ROW EXECUTE FUNCTION of_roles_protect_builtin()`);

  // 0111 (Phase 5) — TOTP MFA. State lives on `users` (not a new table) because
  // the login-time check runs BEFORE any department context exists; a separate
  // table would need an RLS policy it cannot satisfy pre-auth, or a Dale-gated
  // SECURITY DEFINER function. All columns additive/nullable — `users` is shared
  // with FireHazmat and is unaffected. mfa_required DEFAULTs FALSE so nothing
  // switches on silently.
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_step BIGINT");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_codes JSONB");
  await pool.query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users (station_id) WHERE mfa_enabled = FALSE");

  // 0075 — per-department minimum-staffing config + warn/block enforcement.
  await pool.query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS min_staffing_per_shift INTEGER");
  await pool.query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS staffing_enforcement TEXT NOT NULL DEFAULT 'warn'");
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'departments_staffing_enforcement_chk'
                     AND conrelid = 'public.departments'::regclass) THEN
      ALTER TABLE public.departments
        ADD CONSTRAINT departments_staffing_enforcement_chk
        CHECK (staffing_enforcement IN ('warn','block'));
    END IF;
  END $$`);

  // 3c. of_member_invites (P4.4) — single-use, hashed, expiring set-password
  // invites. The chief issues one when adding a member; the member redeems it at
  // POST /api/auth/accept-invite to set their password. token_hash = sha256 hex of
  // a high-entropy secret (the secret is shown to the chief ONCE, never stored).
  // RLS IS ON (0016): the chief-facing issue route is authenticated (GUC set), and
  // the unauthenticated accept-invite redeem goes through of_redeem_member_invite
  // (DEFINER, owner-side) so it works under RLS while staying authorized by the
  // single-use token hash. See the redeem-fn + policy block just below.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS of_member_invites (
      id                 SERIAL PRIMARY KEY,
      member_id          INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      department_id      INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      token_hash         TEXT NOT NULL,
      expires_at         TIMESTAMPTZ NOT NULL,
      used_at            TIMESTAMPTZ,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_member_invites_token ON of_member_invites(token_hash)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_member_invites_member ON of_member_invites(member_id)');
  // of_app (non-owner, prod) needs table + sequence privileges; owner installs no-op the grant.
  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
      GRANT SELECT, INSERT, UPDATE ON public.of_member_invites TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.of_member_invites_id_seq TO of_app;
    END IF;
  END $$;`);
  // of_redeem_member_invite (0016) — owner-side, single-use, atomic redeem.
  // Claims the invite (marks used iff unused + unexpired) AND sets the password
  // in one DEFINER call; authorized by the token hash, not a dept GUC — which is
  // why it must be DEFINER. This is what lets of_member_invites carry RLS.
  await pool.query('DROP FUNCTION IF EXISTS public.of_redeem_member_invite(text,text)');
  await pool.query(`
    CREATE OR REPLACE FUNCTION public.of_redeem_member_invite(
      p_token_hash text, p_password_hash text
    ) RETURNS TABLE (redeemed_invite_id int, redeemed_user_id int, redeemed_member_id int, redeemed_department_id int)
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
    AS $fn$
    DECLARE v_invite int; v_user int; v_member int; v_dept int;
    BEGIN
      IF p_password_hash IS NULL OR length(p_password_hash) < 20 THEN
        RAISE EXCEPTION 'of_redeem_member_invite: password hash required'; END IF;
      UPDATE of_member_invites SET used_at = now()
        WHERE token_hash = p_token_hash AND used_at IS NULL AND expires_at > now()
        RETURNING id, user_id, member_id, department_id INTO v_invite, v_user, v_member, v_dept;
      IF v_invite IS NULL THEN RAISE EXCEPTION 'of_redeem_member_invite: invalid, used, or expired invite'; END IF;
      UPDATE users SET "passwordHash" = p_password_hash WHERE id = v_user;
      RETURN QUERY SELECT v_invite, v_user, v_member, v_dept;
    END;
    $fn$;
  `);
  await pool.query(`DO $$
    DECLARE r text; f text := 'public.of_redeem_member_invite(text,text)';
    BEGIN
      IF to_regprocedure(f) IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r); END IF;
        END LOOP;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO of_app', f); END IF;
      END IF;
    END $$;`);
  await pool.query('ALTER TABLE public.of_member_invites ENABLE ROW LEVEL SECURITY');
  await pool.query('DROP POLICY IF EXISTS dept_isolation ON public.of_member_invites');
  await pool.query(`CREATE POLICY dept_isolation ON public.of_member_invites FOR ALL
    USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
    WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)`);

  // 3d. station_displays (2.3 / 0074) — device pairing for wall displays. A display
  // binds to ONE station via a single-use pairing code (chief-issued, authenticated),
  // then authenticates ongoing reads with a persistent device token. Both the public
  // redeem and the public token-resolve run via DEFINER fns (no dept GUC), authorized
  // by the hashed secret — the of_member_invites pattern. RLS ON; chief create/list/
  // revoke run authenticated (dept GUC). ⚠️ public-auth/DEFINER surface (Dale review).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS station_displays (
      id SERIAL PRIMARY KEY,
      department_id      INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      station_id         INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      label              TEXT DEFAULT '',
      status             TEXT NOT NULL DEFAULT 'pending',
      pairing_code_hash  TEXT,
      pairing_expires_at TIMESTAMPTZ,
      device_token_hash  TEXT UNIQUE,
      paired_at          TIMESTAMPTZ,
      last_seen_at       TIMESTAMPTZ,
      created_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_station_displays_dept ON station_displays(department_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_station_displays_device_token ON station_displays(device_token_hash)');
  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.station_displays TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.station_displays_id_seq TO of_app;
    END IF;
  END $$;`);
  await pool.query('DROP FUNCTION IF EXISTS public.of_redeem_station_pairing(text,text)');
  await pool.query(`
    CREATE OR REPLACE FUNCTION public.of_redeem_station_pairing(
      p_code_hash text, p_device_token_hash text
    ) RETURNS TABLE (display_id int, dept_id int, stn_id int, display_label text)
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
    AS $fn$
    DECLARE v_id int; v_dept int; v_stn int; v_label text;
    BEGIN
      IF p_device_token_hash IS NULL OR length(p_device_token_hash) < 32 THEN
        RAISE EXCEPTION 'of_redeem_station_pairing: device token hash required'; END IF;
      UPDATE station_displays
         SET status='active', device_token_hash=p_device_token_hash,
             paired_at=now(), last_seen_at=now(), pairing_code_hash=NULL, pairing_expires_at=NULL
        WHERE pairing_code_hash=p_code_hash AND status='pending' AND pairing_expires_at > now()
        RETURNING id, department_id, station_id, label INTO v_id, v_dept, v_stn, v_label;
      IF v_id IS NULL THEN RAISE EXCEPTION 'of_redeem_station_pairing: invalid, used, or expired pairing code'; END IF;
      RETURN QUERY SELECT v_id, v_dept, v_stn, v_label;
    END; $fn$;
  `);
  await pool.query('DROP FUNCTION IF EXISTS public.of_resolve_station_display(text)');
  await pool.query(`
    CREATE OR REPLACE FUNCTION public.of_resolve_station_display(p_device_token_hash text)
    RETURNS TABLE (display_id int, dept_id int, stn_id int)
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
    AS $fn$
    DECLARE v_id int; v_dept int; v_stn int;
    BEGIN
      IF p_device_token_hash IS NULL OR length(p_device_token_hash) < 32 THEN RETURN; END IF;
      UPDATE station_displays SET last_seen_at=now()
        WHERE device_token_hash=p_device_token_hash AND status='active'
        RETURNING id, department_id, station_id INTO v_id, v_dept, v_stn;
      IF v_id IS NOT NULL THEN RETURN QUERY SELECT v_id, v_dept, v_stn; END IF;
    END; $fn$;
  `);
  await pool.query(`DO $$
    DECLARE r text; fns text[] := ARRAY['public.of_redeem_station_pairing(text,text)','public.of_resolve_station_display(text)']; f text;
    BEGIN
      FOREACH f IN ARRAY fns LOOP
        IF to_regprocedure(f) IS NOT NULL THEN
          EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
          FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r); END IF;
          END LOOP;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO of_app', f); END IF;
        END IF;
      END LOOP;
    END $$;`);
  await pool.query('ALTER TABLE public.station_displays ENABLE ROW LEVEL SECURITY');
  await pool.query('DROP POLICY IF EXISTS dept_isolation ON public.station_displays');
  await pool.query(`CREATE POLICY dept_isolation ON public.station_displays FOR ALL
    USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
    WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)`);

  // 3h. leave banks (1.2a / 0076) — per-dept accrual BANKS: leave_types (config),
  // leave_balances (derived cache), leave_accrual_ledger (append-only movements;
  // REVOKE UPDATE/DELETE). Mirror of docs/migrations/0076-leave-banks.sql for fresh
  // installs (prod applied via Supabase MCP). department_id from the JWT; RLS
  // dept_isolation on all three. leave_types/leave_balances are deactivated/upserted,
  // never hard-deleted → of_app has no DELETE on them either.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.leave_types (
      id              SERIAL PRIMARY KEY,
      department_id   INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      code            TEXT NOT NULL,
      name            TEXT NOT NULL,
      unit            TEXT NOT NULL DEFAULT 'hours'
                        CONSTRAINT leave_types_unit_chk CHECK (unit IN ('hours','shifts','days')),
      accrual_method  TEXT NOT NULL DEFAULT 'none'
                        CONSTRAINT leave_types_accrual_method_chk
                        CHECK (accrual_method IN ('none','per_period','annual_grant','anniversary','per_hours_worked')),
      accrual_rate    NUMERIC NOT NULL DEFAULT 0,
      period          TEXT
                        CONSTRAINT leave_types_period_chk
                        CHECK (period IS NULL OR period IN ('biweekly','monthly','annual')),
      carryover_cap   NUMERIC,
      accrual_cap     NUMERIC,
      allow_negative  BOOLEAN NOT NULL DEFAULT FALSE,
      negative_floor  NUMERIC NOT NULL DEFAULT 0,
      tenure_tiers    JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_flsa_comp    BOOLEAN NOT NULL DEFAULT FALSE,
      is_paid         BOOLEAN NOT NULL DEFAULT TRUE,
      active          BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT leave_types_dept_code_uniq UNIQUE (department_id, code)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_leave_types_dept ON public.leave_types(department_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.leave_balances (
      id             SERIAL PRIMARY KEY,
      department_id  INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      member_id      INTEGER NOT NULL,
      leave_type_id  INTEGER NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
      balance_hours  NUMERIC NOT NULL DEFAULT 0,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT leave_balances_uniq UNIQUE (department_id, member_id, leave_type_id)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_leave_balances_dept_member ON public.leave_balances(department_id, member_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.leave_accrual_ledger (
      id                 SERIAL PRIMARY KEY,
      department_id      INTEGER NOT NULL,
      member_id          INTEGER NOT NULL,
      leave_type_id      INTEGER NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
      delta_hours        NUMERIC NOT NULL,
      reason             TEXT NOT NULL
                           CONSTRAINT leave_ledger_reason_chk
                           CHECK (reason IN ('accrual','grant','usage','adjustment','reversal')),
      source_kind        TEXT NOT NULL DEFAULT 'manual'
                           CONSTRAINT leave_ledger_source_kind_chk
                           CHECK (source_kind IN ('leave_request','manual','accrual_run')),
      source_id          INTEGER,
      period_key         TEXT,
      rate_at_post       NUMERIC,
      note               TEXT,
      created_by_user_id INTEGER,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leave_ledger_dept_member_type
    ON public.leave_accrual_ledger(department_id, member_id, leave_type_id, created_at)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_ledger_accrual_period
    ON public.leave_accrual_ledger(department_id, leave_type_id, member_id, period_key)
    WHERE period_key IS NOT NULL`);
  for (const t of ['leave_types', 'leave_balances', 'leave_accrual_ledger']) {
    await pool.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`DROP POLICY IF EXISTS dept_isolation ON public.${t}`);
    await pool.query(`CREATE POLICY dept_isolation ON public.${t} FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)`);
  }
  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
      GRANT SELECT, INSERT, UPDATE ON public.leave_types TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.leave_types_id_seq TO of_app;
      GRANT SELECT, INSERT, UPDATE ON public.leave_balances TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.leave_balances_id_seq TO of_app;
      GRANT SELECT, INSERT ON public.leave_accrual_ledger TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.leave_accrual_ledger_id_seq TO of_app;
    END IF;
  END $$;`);
  await pool.query(`DO $$
    DECLARE r text;
  BEGIN
    REVOKE UPDATE, DELETE ON public.leave_accrual_ledger FROM PUBLIC;
    REVOKE DELETE ON public.leave_types, public.leave_balances FROM PUBLIC;
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE UPDATE, DELETE ON public.leave_accrual_ledger FROM %I', r);
        EXECUTE format('REVOKE DELETE ON public.leave_types, public.leave_balances FROM %I', r);
      END IF;
    END LOOP;
  END $$;`);

  // 3h.1 leave_requests → bank link (1.2b / 0077). Additive nullable columns so an
  // approved request can post a `usage` debit against a bank (leave_type_id) for `hours`.
  // Runs AFTER leave_types exists (the FK target). Mirror of docs/migrations/0077.
  await pool.query(`ALTER TABLE public.leave_requests
    ADD COLUMN IF NOT EXISTS leave_type_id INTEGER REFERENCES public.leave_types(id) ON DELETE SET NULL`).catch((e) => {
    if (e.code !== '42P01' && e.code !== '42710') throw e; // table/constraint may not exist yet on a partial fresh install
  });
  await pool.query('ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS hours NUMERIC').catch((e) => {
    if (e.code !== '42P01') throw e;
  });
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_type
    ON public.leave_requests(leave_type_id) WHERE leave_type_id IS NOT NULL`).catch(() => {});

  // 3h.2 min-staffing rules + unified vacancies (1.4 / 0080). Layered minimums at three
  // grains (shift_count / rank_count / cert_count / apparatus_seats), time-windowed +
  // date-bounded; vacancies = THE unified open-coverage record (lifecycle engine-owned,
  // never hard-deleted — DELETE revoked). Mirror of docs/migrations/0080 (fresh installs;
  // prod applied via Supabase MCP 2026-07-25).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.min_staffing_rules (
      id             SERIAL PRIMARY KEY,
      department_id  INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      station_id     INTEGER,
      name           TEXT NOT NULL,
      rule_type      TEXT NOT NULL
                       CONSTRAINT msr_rule_type_chk
                       CHECK (rule_type IN ('shift_count','rank_count','cert_count','apparatus_seats')),
      target         TEXT,
      min_count      INTEGER NOT NULL
                       CONSTRAINT msr_min_count_chk CHECK (min_count >= 0),
      shift_type     TEXT,
      time_start     TIME,
      time_end       TIME,
      days_of_week   TEXT,
      effective_from DATE,
      effective_to   DATE,
      active         BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_msr_dept_active ON public.min_staffing_rules(department_id, active)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.vacancies (
      id                  SERIAL PRIMARY KEY,
      department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      station_id          INTEGER,
      shift_date          DATE NOT NULL,
      shift_id            INTEGER,
      apparatus_id        INTEGER,
      position_id         INTEGER,
      position_name       TEXT NOT NULL DEFAULT '',
      required_rank       TEXT NOT NULL DEFAULT '',
      required_certs      TEXT NOT NULL DEFAULT '[]',
      start_ts            TIMESTAMPTZ,
      end_ts              TIMESTAMPTZ,
      hours               NUMERIC,
      cause               TEXT NOT NULL
                            CONSTRAINT vacancies_cause_chk
                            CHECK (cause IN ('leave','sick_callout','trade_fallout','open_slot','manual')),
      cause_kind          TEXT,
      cause_id            INTEGER,
      priority            INTEGER NOT NULL DEFAULT 2
                            CONSTRAINT vacancies_priority_chk CHECK (priority BETWEEN 1 AND 3),
      status              TEXT NOT NULL DEFAULT 'open'
                            CONSTRAINT vacancies_status_chk
                            CHECK (status IN ('open','offering','filled','cancelled','expired')),
      filled_by_member_id INTEGER,
      filled_at           TIMESTAMPTZ,
      fill_method         TEXT
                            CONSTRAINT vacancies_fill_method_chk
                            CHECK (fill_method IS NULL OR fill_method IN ('accepted_offer','assigned')),
      cancelled_reason    TEXT,
      created_by_user_id  INTEGER,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vacancies_dept_status_date
    ON public.vacancies(department_id, status, shift_date)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_vacancies_live_cause
    ON public.vacancies(department_id, cause_kind, cause_id, shift_date, position_name)
    WHERE status IN ('open','offering') AND cause_id IS NOT NULL`);
  for (const t of ['min_staffing_rules', 'vacancies']) {
    await pool.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`DROP POLICY IF EXISTS dept_isolation ON public.${t}`);
    await pool.query(`CREATE POLICY dept_isolation ON public.${t} FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)`);
  }
  await pool.query(`ALTER TABLE public.coverage_outreach
    ADD COLUMN IF NOT EXISTS vacancy_id INTEGER REFERENCES public.vacancies(id) ON DELETE SET NULL`).catch((e) => {
    if (e.code !== '42P01') throw e;
  });
  await pool.query('CREATE INDEX IF NOT EXISTS idx_coverage_outreach_vacancy ON public.coverage_outreach(vacancy_id)').catch(() => {});
  await pool.query('ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS vacancy_split_allowed BOOLEAN NOT NULL DEFAULT FALSE');
  await pool.query('ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS vacancy_auto_open BOOLEAN NOT NULL DEFAULT TRUE');
  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
      GRANT SELECT, INSERT, UPDATE ON public.min_staffing_rules TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.min_staffing_rules_id_seq TO of_app;
      GRANT SELECT, INSERT, UPDATE ON public.vacancies TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.vacancies_id_seq TO of_app;
    END IF;
  END $$;`);
  await pool.query(`DO $$
    DECLARE r text;
  BEGIN
    REVOKE DELETE ON public.min_staffing_rules, public.vacancies FROM PUBLIC;
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE DELETE ON public.min_staffing_rules, public.vacancies FROM %I', r);
      END IF;
    END LOOP;
  END $$;`);

  // 3h.3 ordered hiring engine + grievance audit (1.5 / 0081). Named per-dept lists (3 rule
  // families + tie-break chains), APPEND-ONLY fairness ledger (separate from ot_records/FLSA
  // — never merged, market doctrine), hiring_events with the immutable at-the-moment list
  // snapshot (the skip-order grievance record), and the offer sequence with RESERVED channel
  // fields (in_app now; sms/voice/email at 1.6). Mirror of docs/migrations/0081 (fresh
  // installs; prod applied via Supabase MCP 2026-07-25).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.hiring_lists (
      id                   SERIAL PRIMARY KEY,
      department_id        INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      name                 TEXT NOT NULL,
      list_type            TEXT NOT NULL DEFAULT 'voluntary'
                             CONSTRAINT hiring_lists_type_chk
                             CHECK (list_type IN ('voluntary','mandatory')),
      target_rank          TEXT NOT NULL DEFAULT '',
      required_certs       TEXT NOT NULL DEFAULT '[]',
      order_method         TEXT NOT NULL DEFAULT 'hours_asc'
                             CONSTRAINT hiring_lists_order_chk
                             CHECK (order_method IN ('hours_asc','rotation','seniority','manual')),
      tie_breakers         TEXT NOT NULL DEFAULT '["seniority","member_id"]',
      charge_worked        BOOLEAN NOT NULL DEFAULT TRUE,
      charge_refused       BOOLEAN NOT NULL DEFAULT FALSE,
      charge_expired       BOOLEAN NOT NULL DEFAULT FALSE,
      reset_period         TEXT NOT NULL DEFAULT 'annual'
                             CONSTRAINT hiring_lists_reset_chk
                             CHECK (reset_period IN ('annual','none')),
      reset_anchor         TEXT NOT NULL DEFAULT '01-01',
      offer_window_minutes INTEGER NOT NULL DEFAULT 30
                             CONSTRAINT hiring_lists_window_chk CHECK (offer_window_minutes BETWEEN 1 AND 10080),
      sort_order           INTEGER NOT NULL DEFAULT 0,
      active               BOOLEAN NOT NULL DEFAULT TRUE,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_hiring_lists_dept ON public.hiring_lists(department_id, active)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.hiring_list_members (
      id              SERIAL PRIMARY KEY,
      department_id   INTEGER NOT NULL,
      list_id         INTEGER NOT NULL REFERENCES public.hiring_lists(id) ON DELETE CASCADE,
      member_id       INTEGER NOT NULL,
      manual_order    INTEGER NOT NULL DEFAULT 0,
      last_awarded_at TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT hiring_list_members_uniq UNIQUE (list_id, member_id)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_hlm_dept_list ON public.hiring_list_members(department_id, list_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.hiring_charge_ledger (
      id                 SERIAL PRIMARY KEY,
      department_id      INTEGER NOT NULL,
      list_id            INTEGER NOT NULL REFERENCES public.hiring_lists(id) ON DELETE RESTRICT,
      member_id          INTEGER NOT NULL,
      delta_hours        NUMERIC NOT NULL,
      reason             TEXT NOT NULL
                           CONSTRAINT hcl_reason_chk
                           CHECK (reason IN ('worked','refused','expired','mandate_hold','adjustment','reversal','seed')),
      source_kind        TEXT,
      source_id          INTEGER,
      note               TEXT,
      created_by_user_id INTEGER,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_hcl_dept_list_member
    ON public.hiring_charge_ledger(department_id, list_id, member_id, created_at)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.hiring_events (
      id                  SERIAL PRIMARY KEY,
      department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      vacancy_id          INTEGER NOT NULL,
      list_id             INTEGER NOT NULL REFERENCES public.hiring_lists(id) ON DELETE RESTRICT,
      mode                TEXT NOT NULL DEFAULT 'sequential'
                            CONSTRAINT hiring_events_mode_chk
                            CHECK (mode IN ('sequential','blast')),
      status              TEXT NOT NULL DEFAULT 'open'
                            CONSTRAINT hiring_events_status_chk
                            CHECK (status IN ('open','awarded','exhausted','cancelled')),
      list_snapshot       TEXT NOT NULL,
      awarded_member_id   INTEGER,
      award_method        TEXT
                            CONSTRAINT hiring_events_award_chk
                            CHECK (award_method IS NULL OR award_method IN ('accepted','assigned_bypass','mandate')),
      cancelled_reason    TEXT,
      started_by_user_id  INTEGER,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at           TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_hiring_events_dept_status
    ON public.hiring_events(department_id, status, created_at)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_hiring_events_live_vacancy
    ON public.hiring_events(department_id, vacancy_id) WHERE status = 'open'`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.hiring_offers (
      id               SERIAL PRIMARY KEY,
      department_id    INTEGER NOT NULL,
      event_id         INTEGER NOT NULL REFERENCES public.hiring_events(id) ON DELETE CASCADE,
      member_id        INTEGER NOT NULL,
      position_in_list INTEGER NOT NULL DEFAULT 0,
      offered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at       TIMESTAMPTZ,
      channel          TEXT NOT NULL DEFAULT 'in_app'
                         CONSTRAINT hiring_offers_channel_chk
                         CHECK (channel IN ('in_app','sms','voice','email')),
      contact_ref      TEXT,
      outcome          TEXT NOT NULL DEFAULT 'pending'
                         CONSTRAINT hiring_offers_outcome_chk
                         CHECK (outcome IN ('pending','accepted','declined','expired','skipped','superseded')),
      outcome_at       TIMESTAMPTZ,
      outcome_note     TEXT,
      charged          BOOLEAN NOT NULL DEFAULT FALSE,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT hiring_offers_event_member_uniq UNIQUE (event_id, member_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_hiring_offers_dept_member
    ON public.hiring_offers(department_id, member_id, outcome)`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_hiring_offers_event ON public.hiring_offers(event_id)');
  for (const t of ['hiring_lists', 'hiring_list_members', 'hiring_charge_ledger', 'hiring_events', 'hiring_offers']) {
    await pool.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`DROP POLICY IF EXISTS dept_isolation ON public.${t}`);
    await pool.query(`CREATE POLICY dept_isolation ON public.${t} FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)`);
  }
  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
      GRANT SELECT, INSERT, UPDATE ON public.hiring_lists TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.hiring_lists_id_seq TO of_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.hiring_list_members TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.hiring_list_members_id_seq TO of_app;
      GRANT SELECT, INSERT ON public.hiring_charge_ledger TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.hiring_charge_ledger_id_seq TO of_app;
      GRANT SELECT, INSERT, UPDATE ON public.hiring_events TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.hiring_events_id_seq TO of_app;
      GRANT SELECT, INSERT, UPDATE ON public.hiring_offers TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.hiring_offers_id_seq TO of_app;
    END IF;
  END $$;`);
  await pool.query(`DO $$
    DECLARE r text;
  BEGIN
    REVOKE UPDATE, DELETE ON public.hiring_charge_ledger FROM PUBLIC;
    REVOKE DELETE ON public.hiring_lists, public.hiring_events, public.hiring_offers FROM PUBLIC;
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE UPDATE, DELETE ON public.hiring_charge_ledger FROM %I', r);
        EXECUTE format('REVOKE DELETE ON public.hiring_lists, public.hiring_events, public.hiring_offers FROM %I', r);
      END IF;
    END LOOP;
  END $$;`);

  // 3h.4 apparatus-checks rebuild (Phase 2.1 / 0082). Versioned templates (immutable
  // item snapshots — editing mints the next version), finalized check records with
  // server-DERIVED result_code (the passed-with-open-defect guard has no client door),
  // append-only item outcomes. Soft-delete only: of_app's UPDATE on apparatus_checks is
  // column-scoped to deleted_at. Mirror of docs/migrations/0082 (fresh installs; prod
  // applied via Supabase MCP 2026-07-25).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.check_templates (
      id                  SERIAL PRIMARY KEY,
      department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      station_id          INTEGER,
      name                TEXT NOT NULL,
      apparatus_id        INTEGER REFERENCES public.apparatus(id) ON DELETE SET NULL,
      frequency           TEXT NOT NULL DEFAULT 'daily'
                            CONSTRAINT check_templates_frequency_chk
                            CHECK (frequency IN ('daily','weekly','monthly')),
      active              BOOLEAN NOT NULL DEFAULT TRUE,
      current_version_id  INTEGER,
      created_by_user_id  INTEGER,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at          TIMESTAMPTZ
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_check_templates_department ON public.check_templates(department_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.check_template_versions (
      id                  SERIAL PRIMARY KEY,
      template_id         INTEGER NOT NULL REFERENCES public.check_templates(id) ON DELETE RESTRICT,
      department_id       INTEGER NOT NULL,
      version             INTEGER NOT NULL,
      items               JSONB NOT NULL,
      created_by_user_id  INTEGER,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT check_template_versions_unique UNIQUE (template_id, version)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_check_template_versions_department ON public.check_template_versions(department_id)');
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_templates_current_version_fk') THEN
      ALTER TABLE public.check_templates
        ADD CONSTRAINT check_templates_current_version_fk
        FOREIGN KEY (current_version_id) REFERENCES public.check_template_versions(id) ON DELETE SET NULL;
    END IF;
  END $$;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.apparatus_checks (
      id                   SERIAL PRIMARY KEY,
      department_id        INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      station_id           INTEGER,
      template_id          INTEGER NOT NULL REFERENCES public.check_templates(id) ON DELETE RESTRICT,
      template_version_id  INTEGER NOT NULL REFERENCES public.check_template_versions(id) ON DELETE RESTRICT,
      apparatus_id         INTEGER REFERENCES public.apparatus(id) ON DELETE SET NULL,
      apparatus_name       TEXT NOT NULL DEFAULT '',
      frequency            TEXT NOT NULL DEFAULT 'daily',
      check_date           DATE NOT NULL,
      completed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_by_user_id INTEGER NOT NULL,
      completed_by_name    TEXT NOT NULL DEFAULT '',
      result_code          TEXT NOT NULL
                             CONSTRAINT apparatus_checks_result_chk
                             CHECK (result_code IN ('PASS','DEFECTS_FOUND')),
      item_count           INTEGER NOT NULL DEFAULT 0,
      failed_count         INTEGER NOT NULL DEFAULT 0,
      notes                TEXT NOT NULL DEFAULT '',
      deleted_at           TIMESTAMPTZ
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_apparatus_checks_department ON public.apparatus_checks(department_id)');
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_apparatus_checks_tpl_app_date
    ON public.apparatus_checks(template_id, apparatus_id, check_date DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.apparatus_check_items (
      id             SERIAL PRIMARY KEY,
      check_id       INTEGER NOT NULL REFERENCES public.apparatus_checks(id) ON DELETE CASCADE,
      department_id  INTEGER NOT NULL,
      item_key       TEXT NOT NULL,
      section        TEXT NOT NULL DEFAULT '',
      label          TEXT NOT NULL,
      outcome        TEXT NOT NULL
                       CONSTRAINT apparatus_check_items_outcome_chk
                       CHECK (outcome IN ('pass','fail','na')),
      note           TEXT NOT NULL DEFAULT ''
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_apparatus_check_items_check ON public.apparatus_check_items(check_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_apparatus_check_items_department ON public.apparatus_check_items(department_id)');
  for (const t of ['check_templates', 'check_template_versions', 'apparatus_checks', 'apparatus_check_items']) {
    await pool.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`DROP POLICY IF EXISTS dept_isolation ON public.${t}`);
    await pool.query(`CREATE POLICY dept_isolation ON public.${t} FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)`);
  }
  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
      GRANT SELECT, INSERT, UPDATE ON public.check_templates TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.check_templates_id_seq TO of_app;
      GRANT SELECT, INSERT ON public.check_template_versions TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.check_template_versions_id_seq TO of_app;
      GRANT SELECT, INSERT ON public.apparatus_checks TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.apparatus_checks_id_seq TO of_app;
      GRANT SELECT, INSERT ON public.apparatus_check_items TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.apparatus_check_items_id_seq TO of_app;
    END IF;
  END $$;`);
  await pool.query(`DO $$
    DECLARE r text;
  BEGIN
    REVOKE UPDATE, DELETE ON public.check_template_versions, public.apparatus_check_items FROM PUBLIC;
    REVOKE UPDATE, DELETE ON public.apparatus_checks FROM PUBLIC;
    REVOKE DELETE ON public.check_templates FROM PUBLIC;
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE UPDATE, DELETE ON public.check_template_versions, public.apparatus_check_items FROM %I', r);
        -- Per-role UPDATE strip (not just PUBLIC): default privileges auto-grant a
        -- table-level UPDATE that would let result_code be rewritten (D6 probe catch).
        EXECUTE format('REVOKE UPDATE, DELETE ON public.apparatus_checks FROM %I', r);
        EXECUTE format('REVOKE DELETE ON public.check_templates FROM %I', r);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
      GRANT UPDATE (deleted_at) ON public.apparatus_checks TO of_app;
    END IF;
  END $$;`);

  // 3h.5 defect→work-order rebuild (Phase 2.2 / 0083). Defects first-class (dedupe-on-
  // reflag partial unique), work orders with a closed status enum (resolved TERMINAL —
  // corrections are a new WO via supersedes_id), NUMERIC parts/labor lines, APPEND-ONLY
  // notes thread, PM schedules (whichever-first; due computed on view; a human opens the
  // WO — never auto-generated), users.fleet_maintenance capability grant. Mirror of
  // docs/migrations/0083 (fresh installs; prod applied via Supabase MCP 2026-07-26).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.defects (
      id                  SERIAL PRIMARY KEY,
      department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      station_id          INTEGER,
      apparatus_id        INTEGER NOT NULL REFERENCES public.apparatus(id) ON DELETE CASCADE,
      source              TEXT NOT NULL DEFAULT 'manual'
                            CONSTRAINT defects_source_chk CHECK (source IN ('check','manual')),
      check_id            INTEGER REFERENCES public.apparatus_checks(id) ON DELETE SET NULL,
      item_key            TEXT NOT NULL DEFAULT '',
      title               TEXT NOT NULL,
      detail              TEXT NOT NULL DEFAULT '',
      priority            TEXT NOT NULL DEFAULT 'routine'
                            CONSTRAINT defects_priority_chk
                            CHECK (priority IN ('routine','urgent','emergency')),
      status              TEXT NOT NULL DEFAULT 'open'
                            CONSTRAINT defects_status_chk
                            CHECK (status IN ('open','in_work','resolved','cancelled')),
      reported_by_user_id INTEGER,
      reported_by_name    TEXT NOT NULL DEFAULT '',
      resolution_kind     TEXT
                            CONSTRAINT defects_reskind_chk
                            CHECK (resolution_kind IS NULL OR resolution_kind IN ('work_order','manual')),
      resolution_note     TEXT NOT NULL DEFAULT '',
      resolved_at         TIMESTAMPTZ,
      resolved_by_user_id INTEGER,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_defects_department ON public.defects(department_id, status)');
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_defects_live_check_item
    ON public.defects(department_id, apparatus_id, item_key)
    WHERE status IN ('open','in_work') AND source = 'check' AND item_key <> ''`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.work_orders (
      id                  SERIAL PRIMARY KEY,
      department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      station_id          INTEGER,
      apparatus_id        INTEGER REFERENCES public.apparatus(id) ON DELETE SET NULL,
      asset_label         TEXT NOT NULL DEFAULT '',
      defect_id           INTEGER REFERENCES public.defects(id) ON DELETE SET NULL,
      pm_schedule_id      INTEGER,
      title               TEXT NOT NULL,
      description         TEXT NOT NULL DEFAULT '',
      priority            TEXT NOT NULL DEFAULT 'routine'
                            CONSTRAINT work_orders_priority_chk
                            CHECK (priority IN ('routine','urgent','emergency')),
      status              TEXT NOT NULL DEFAULT 'open'
                            CONSTRAINT work_orders_status_chk
                            CHECK (status IN ('open','in_progress','awaiting_parts','resolved','cancelled')),
      assigned_to_user_id INTEGER,
      assigned_to_name    TEXT NOT NULL DEFAULT '',
      vendor_name         TEXT NOT NULL DEFAULT '',
      vendor_cost         NUMERIC(10,2),
      labor_hours         NUMERIC(6,2),
      labor_rate          NUMERIC(8,2),
      legacy_cost         NUMERIC(10,2),
      supersedes_id       INTEGER REFERENCES public.work_orders(id) ON DELETE SET NULL,
      resolution_note     TEXT NOT NULL DEFAULT '',
      opened_by_user_id   INTEGER,
      opened_by_name      TEXT NOT NULL DEFAULT '',
      resolved_at         TIMESTAMPTZ,
      resolved_by_user_id INTEGER,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at          TIMESTAMPTZ
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_work_orders_department ON public.work_orders(department_id, status)');
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_work_orders_assigned ON public.work_orders(department_id, assigned_to_user_id)
    WHERE status IN ('open','in_progress','awaiting_parts')`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_live_defect
    ON public.work_orders(defect_id)
    WHERE defect_id IS NOT NULL AND status IN ('open','in_progress','awaiting_parts')`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.work_order_parts (
      id                 SERIAL PRIMARY KEY,
      work_order_id      INTEGER NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
      department_id      INTEGER NOT NULL,
      name               TEXT NOT NULL,
      qty                NUMERIC(8,2) NOT NULL DEFAULT 1,
      unit_cost          NUMERIC(10,2) NOT NULL DEFAULT 0,
      created_by_user_id INTEGER,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_wo_parts_wo ON public.work_order_parts(work_order_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_wo_parts_department ON public.work_order_parts(department_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.work_order_notes (
      id             SERIAL PRIMARY KEY,
      work_order_id  INTEGER NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
      department_id  INTEGER NOT NULL,
      author_user_id INTEGER,
      author_name    TEXT NOT NULL DEFAULT '',
      body           TEXT NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_wo_notes_wo ON public.work_order_notes(work_order_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_wo_notes_department ON public.work_order_notes(department_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.pm_schedules (
      id                     SERIAL PRIMARY KEY,
      department_id          INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      station_id             INTEGER,
      apparatus_id           INTEGER NOT NULL REFERENCES public.apparatus(id) ON DELETE CASCADE,
      task                   TEXT NOT NULL,
      interval_days          INTEGER,
      interval_miles         INTEGER,
      interval_hours         NUMERIC(8,1),
      last_done_date         DATE,
      last_done_mileage      INTEGER,
      last_done_engine_hours NUMERIC(8,1),
      active                 BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id     INTEGER,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at             TIMESTAMPTZ,
      CONSTRAINT pm_schedules_trigger_chk
        CHECK (interval_days IS NOT NULL OR interval_miles IS NOT NULL OR interval_hours IS NOT NULL)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_pm_schedules_department ON public.pm_schedules(department_id, active)');
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_pm_fk') THEN
      ALTER TABLE public.work_orders
        ADD CONSTRAINT work_orders_pm_fk
        FOREIGN KEY (pm_schedule_id) REFERENCES public.pm_schedules(id) ON DELETE SET NULL;
    END IF;
  END $$;`);
  await pool.query('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fleet_maintenance BOOLEAN NOT NULL DEFAULT FALSE');
  for (const t of ['defects', 'work_orders', 'work_order_parts', 'work_order_notes', 'pm_schedules']) {
    await pool.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`DROP POLICY IF EXISTS dept_isolation ON public.${t}`);
    await pool.query(`CREATE POLICY dept_isolation ON public.${t} FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)`);
  }
  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
      GRANT SELECT, INSERT, UPDATE ON public.defects TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.defects_id_seq TO of_app;
      GRANT SELECT, INSERT, UPDATE ON public.work_orders TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.work_orders_id_seq TO of_app;
      GRANT SELECT, INSERT, DELETE ON public.work_order_parts TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.work_order_parts_id_seq TO of_app;
      GRANT SELECT, INSERT ON public.work_order_notes TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.work_order_notes_id_seq TO of_app;
      GRANT SELECT, INSERT, UPDATE ON public.pm_schedules TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.pm_schedules_id_seq TO of_app;
    END IF;
  END $$;`);
  await pool.query(`DO $$
    DECLARE r text;
  BEGIN
    REVOKE UPDATE, DELETE ON public.work_order_notes FROM PUBLIC;
    REVOKE DELETE ON public.defects, public.work_orders, public.pm_schedules FROM PUBLIC;
    REVOKE UPDATE ON public.work_order_parts FROM PUBLIC;
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE UPDATE, DELETE ON public.work_order_notes FROM %I', r);
        EXECUTE format('REVOKE DELETE ON public.defects, public.work_orders, public.pm_schedules FROM %I', r);
        EXECUTE format('REVOKE UPDATE ON public.work_order_parts FROM %I', r);
      END IF;
    END LOOP;
  END $$;`);

  // 3h.6 generic asset-test engine (Phase 2.3 / 0084). Tracked assets (closed lifecycle
  // status, alert-only retirement clocks), per-dept test-type config (anchors incl. the
  // hose first-from-manufacture rule), FINALIZED test events (UNRECORDED = legacy-import
  // only). Mirror of docs/migrations/0084 (fresh installs; prod via Supabase MCP 2026-07-26).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.tracked_assets (
      id                  SERIAL PRIMARY KEY,
      department_id       INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      station_id          INTEGER,
      family              TEXT NOT NULL
                            CONSTRAINT tracked_assets_family_chk
                            CHECK (family IN ('scba','hose','ladder','ppe','other')),
      name                TEXT NOT NULL,
      serial              TEXT NOT NULL DEFAULT '',
      identity            JSONB NOT NULL DEFAULT '{}',
      manufacture_date    DATE,
      manufacture_year    INTEGER,
      in_service_date     DATE,
      assigned_member_id  INTEGER REFERENCES public.members(id) ON DELETE SET NULL,
      apparatus_id        INTEGER REFERENCES public.apparatus(id) ON DELETE SET NULL,
      status              TEXT NOT NULL DEFAULT 'in_service'
                            CONSTRAINT tracked_assets_status_chk
                            CHECK (status IN ('in_service','out_of_service','condemned','retired')),
      status_reason       TEXT NOT NULL DEFAULT '',
      retirement_months   INTEGER,
      retirement_advisory BOOLEAN NOT NULL DEFAULT FALSE,
      notes               TEXT NOT NULL DEFAULT '',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at          TIMESTAMPTZ
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tracked_assets_department ON public.tracked_assets(department_id, family, status)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.asset_test_types (
      id            SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      station_id    INTEGER,
      name          TEXT NOT NULL,
      family        TEXT NOT NULL
                      CONSTRAINT asset_test_types_family_chk
                      CHECK (family IN ('scba','hose','ladder','ppe','pump','other')),
      target        TEXT NOT NULL DEFAULT 'asset'
                      CONSTRAINT asset_test_types_target_chk CHECK (target IN ('asset','apparatus')),
      interval_days INTEGER NOT NULL
                      CONSTRAINT asset_test_types_interval_chk CHECK (interval_days BETWEEN 1 AND 7300),
      anchor        TEXT NOT NULL DEFAULT 'last_event'
                      CONSTRAINT asset_test_types_anchor_chk
                      CHECK (anchor IN ('last_event','manufacture','in_service')),
      first_anchor  TEXT
                      CONSTRAINT asset_test_types_first_anchor_chk
                      CHECK (first_anchor IS NULL OR first_anchor IN ('manufacture','in_service')),
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at    TIMESTAMPTZ
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_asset_test_types_department ON public.asset_test_types(department_id, family, active)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.asset_test_events (
      id                   SERIAL PRIMARY KEY,
      department_id        INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      station_id           INTEGER,
      test_type_id         INTEGER NOT NULL REFERENCES public.asset_test_types(id) ON DELETE RESTRICT,
      asset_id             INTEGER REFERENCES public.tracked_assets(id) ON DELETE CASCADE,
      apparatus_id         INTEGER REFERENCES public.apparatus(id) ON DELETE CASCADE,
      event_date           DATE NOT NULL,
      result               TEXT NOT NULL
                             CONSTRAINT asset_test_events_result_chk
                             CHECK (result IN ('PASS','FAIL','NOT_COMPLETED','UNRECORDED')),
      performed_by_user_id INTEGER,
      performed_by_name    TEXT NOT NULL DEFAULT '',
      outside_company      TEXT NOT NULL DEFAULT '',
      pressure_used        NUMERIC(6,0),
      readings             JSONB,
      note                 TEXT NOT NULL DEFAULT '',
      recorded_by_user_id  INTEGER,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at           TIMESTAMPTZ,
      CONSTRAINT asset_test_events_one_target_chk
        CHECK ((asset_id IS NOT NULL)::int + (apparatus_id IS NOT NULL)::int = 1)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_asset_test_events_department ON public.asset_test_events(department_id)');
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_asset_test_events_target
    ON public.asset_test_events(test_type_id, asset_id, apparatus_id, event_date DESC)`);
  for (const t of ['tracked_assets', 'asset_test_types', 'asset_test_events']) {
    await pool.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`DROP POLICY IF EXISTS dept_isolation ON public.${t}`);
    await pool.query(`CREATE POLICY dept_isolation ON public.${t} FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)`);
  }
  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
      GRANT SELECT, INSERT, UPDATE ON public.tracked_assets TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.tracked_assets_id_seq TO of_app;
      GRANT SELECT, INSERT, UPDATE ON public.asset_test_types TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.asset_test_types_id_seq TO of_app;
      GRANT SELECT, INSERT ON public.asset_test_events TO of_app;
      GRANT UPDATE (deleted_at) ON public.asset_test_events TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.asset_test_events_id_seq TO of_app;
    END IF;
  END $$;`);
  await pool.query(`DO $$
    DECLARE r text;
  BEGIN
    REVOKE UPDATE, DELETE ON public.asset_test_events FROM PUBLIC;
    REVOKE DELETE ON public.tracked_assets, public.asset_test_types FROM PUBLIC;
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE UPDATE, DELETE ON public.asset_test_events FROM %I', r);
        EXECUTE format('REVOKE DELETE ON public.tracked_assets, public.asset_test_types FROM %I', r);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
      GRANT UPDATE (deleted_at) ON public.asset_test_events TO of_app;
    END IF;
  END $$;`);

  // 3h.7 par-level inventory (Phase 2.4 / 0085). Append-only inventory_txns behind cached
  // balances (stock/lots, CHECK qty >= 0 — physical negative-stock block); par per
  // (item × location); requisitions where ACCEPTANCE NEVER MOVES STOCK. Mirror of
  // docs/migrations/0085 (fresh installs; prod via Supabase MCP 2026-07-26).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.inventory_items (
      id SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      station_id INTEGER, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT 'each', tracks_lots BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_inventory_items_department ON public.inventory_items(department_id, active)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.inventory_locations (
      id SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      station_id INTEGER, name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'supply_room'
        CONSTRAINT inventory_locations_kind_chk
        CHECK (kind IN ('supply_room','station','apparatus','kit','other')),
      apparatus_id INTEGER REFERENCES public.apparatus(id) ON DELETE SET NULL,
      parent_id INTEGER REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_inventory_locations_department ON public.inventory_locations(department_id, active)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.inventory_stock (
      id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
      qty NUMERIC(12,2) NOT NULL DEFAULT 0 CONSTRAINT inventory_stock_qty_chk CHECK (qty >= 0),
      par_min NUMERIC(12,2), par_max NUMERIC(12,2),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT inventory_stock_pair_uniq UNIQUE (item_id, location_id)
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_inventory_stock_department ON public.inventory_stock(department_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.inventory_lots (
      id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
      lot_number TEXT NOT NULL DEFAULT '', expiration_date DATE,
      qty NUMERIC(12,2) NOT NULL DEFAULT 0 CONSTRAINT inventory_lots_qty_chk CHECK (qty >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_inventory_lots_department ON public.inventory_lots(department_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_inventory_lots_item_loc ON public.inventory_lots(item_id, location_id)');
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inventory_lots_expiry ON public.inventory_lots(department_id, expiration_date)
    WHERE expiration_date IS NOT NULL`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.inventory_txns (
      id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
      lot_id INTEGER REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
      verb TEXT NOT NULL CONSTRAINT inventory_txns_verb_chk
        CHECK (verb IN ('usage','restock','transfer','count_adjust')),
      qty_delta NUMERIC(12,2) NOT NULL,
      counterpart_location_id INTEGER REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
      counted_qty NUMERIC(12,2), incident_ref TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '', requisition_id INTEGER,
      performed_by_user_id INTEGER, performed_by_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_inventory_txns_department ON public.inventory_txns(department_id, created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_inventory_txns_item_loc ON public.inventory_txns(item_id, location_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.requisitions (
      id SERIAL PRIMARY KEY,
      department_id INTEGER NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
      station_id INTEGER,
      to_location_id INTEGER NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
      from_location_id INTEGER REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'submitted' CONSTRAINT requisitions_status_chk
        CHECK (status IN ('submitted','accepted','denied','fulfilled','cancelled')),
      note TEXT NOT NULL DEFAULT '', requested_by_user_id INTEGER,
      requested_by_name TEXT NOT NULL DEFAULT '', decided_by_user_id INTEGER,
      decided_at TIMESTAMPTZ, decide_note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_requisitions_department ON public.requisitions(department_id, status)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.requisition_lines (
      id SERIAL PRIMARY KEY,
      requisition_id INTEGER NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
      department_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
      qty_requested NUMERIC(12,2) NOT NULL
        CONSTRAINT requisition_lines_qty_chk CHECK (qty_requested > 0),
      qty_fulfilled NUMERIC(12,2)
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_requisition_lines_req ON public.requisition_lines(requisition_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_requisition_lines_department ON public.requisition_lines(department_id)');
  for (const t of ['inventory_items', 'inventory_locations', 'inventory_stock', 'inventory_lots', 'inventory_txns', 'requisitions', 'requisition_lines']) {
    await pool.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`DROP POLICY IF EXISTS dept_isolation ON public.${t}`);
    await pool.query(`CREATE POLICY dept_isolation ON public.${t} FOR ALL
      USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
      WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)`);
  }
  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
      GRANT SELECT, INSERT, UPDATE ON public.inventory_items, public.inventory_locations,
        public.inventory_stock, public.inventory_lots, public.requisitions, public.requisition_lines TO of_app;
      GRANT SELECT, INSERT ON public.inventory_txns TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.inventory_items_id_seq, public.inventory_locations_id_seq,
        public.inventory_stock_id_seq, public.inventory_lots_id_seq, public.inventory_txns_id_seq,
        public.requisitions_id_seq, public.requisition_lines_id_seq TO of_app;
    END IF;
  END $$;`);
  await pool.query(`DO $$
    DECLARE r text;
  BEGIN
    REVOKE UPDATE, DELETE ON public.inventory_txns FROM PUBLIC;
    REVOKE DELETE ON public.inventory_items, public.inventory_locations, public.inventory_stock,
                     public.inventory_lots, public.requisitions, public.requisition_lines FROM PUBLIC;
    FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE UPDATE, DELETE ON public.inventory_txns FROM %I', r);
        EXECUTE format('REVOKE DELETE ON public.inventory_items, public.inventory_locations, public.inventory_stock, public.inventory_lots, public.requisitions, public.requisition_lines FROM %I', r);
      END IF;
    END LOOP;
  END $$;`);

  // 3h.8 scan tags (Phase 2.5 / 0086): opaque per-record QR identities on the four
  // taggable tables + backfill. Mirror of docs/migrations/0086.
  for (const t of ['tracked_assets', 'inventory_items', 'inventory_locations', 'apparatus']) {
    await pool.query(`ALTER TABLE public.${t} ADD COLUMN IF NOT EXISTS scan_tag TEXT`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_${t}_scan_tag ON public.${t}(scan_tag) WHERE scan_tag IS NOT NULL`);
    await pool.query(`UPDATE public.${t} SET scan_tag = 'ofh' || substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 20) WHERE scan_tag IS NULL`);
  }

  // 3h.9 controlled-substance chain of custody (Phase 2.7 / 0087, Dale-gated for
  // prod — this mirror serves FRESH installs). Mirror of docs/migrations/0087.
  // 21 CFR §1304.27 (91 FR 5241). cs_events is append-only; grants are applied by
  // the migration on managed installs (the of_app role doesn't exist on local dev).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cs_substances (
      id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL, station_id INTEGER NOT NULL,
      name TEXT NOT NULL, schedule TEXT NOT NULL CHECK (schedule IN ('II','III','IV','V')),
      finished_form TEXT NOT NULL, unit_label TEXT NOT NULL DEFAULT 'mg',
      units_per_container NUMERIC(10,2) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (department_id, name, finished_form))`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cs_locations (
      id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL, station_id INTEGER NOT NULL,
      name TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('vault','safe','box','other')),
      home_station_id INTEGER REFERENCES stations(id), apparatus_id INTEGER REFERENCES apparatus(id),
      seal_mode TEXT NOT NULL DEFAULT 'single' CHECK (seal_mode IN ('none','single','multi')),
      current_seals TEXT NOT NULL DEFAULT '', par_level INTEGER,
      active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (department_id, name))`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cs_items (
      id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL, station_id INTEGER NOT NULL,
      substance_id INTEGER NOT NULL REFERENCES cs_substances(id) ON DELETE RESTRICT,
      control_no TEXT NOT NULL, lot_no TEXT NOT NULL DEFAULT '', expiration DATE,
      location_id INTEGER REFERENCES cs_locations(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'in_stock' CHECK (status IN
        ('in_stock','administered','wasted','expired','broken','transferred','destroyed')),
      remaining_units NUMERIC(10,2), acquired_event_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (department_id, control_no))`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cs_events (
      id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL, station_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('acquire','deliver','restock_hospital','transfer',
        'administer','waste','expire','break','destroy','count_adjust')),
      item_id INTEGER REFERENCES cs_items(id) ON DELETE RESTRICT,
      location_id INTEGER REFERENCES cs_locations(id) ON DELETE RESTRICT,
      to_location_id INTEGER REFERENCES cs_locations(id) ON DELETE RESTRICT,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), client_recorded_at TIMESTAMPTZ,
      amount_administered NUMERIC(10,2), amount_disposed NUMERIC(10,2),
      manner_disposed TEXT NOT NULL DEFAULT '', patient_identifier TEXT NOT NULL DEFAULT '',
      incident_number TEXT NOT NULL DEFAULT '', standing_order BOOLEAN,
      authorizer_name TEXT NOT NULL DEFAULT '', counterpart_name TEXT NOT NULL DEFAULT '',
      counterpart_address TEXT NOT NULL DEFAULT '', counterpart_dea_no TEXT NOT NULL DEFAULT '',
      containers INTEGER, units_per_container NUMERIC(10,2),
      seals_broken TEXT NOT NULL DEFAULT '', seals_applied TEXT NOT NULL DEFAULT '',
      actor_user_id INTEGER NOT NULL REFERENCES users(id), actor_name TEXT NOT NULL,
      actor_signature TEXT NOT NULL DEFAULT '',
      witness_user_id INTEGER REFERENCES users(id), witness_name TEXT NOT NULL DEFAULT '',
      witness_signature TEXT NOT NULL DEFAULT '', corrects_event_id INTEGER REFERENCES cs_events(id),
      note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (witness_user_id IS NULL OR witness_user_id <> actor_user_id))`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cs_counts (
      id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL, station_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL REFERENCES cs_locations(id) ON DELETE RESTRICT,
      kind TEXT NOT NULL CHECK (kind IN ('on_coming','off_going','audit','biennial')),
      counted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      seals_verified TEXT NOT NULL DEFAULT '', seals_intact BOOLEAN NOT NULL DEFAULT TRUE,
      verifier1_user_id INTEGER NOT NULL REFERENCES users(id), verifier1_name TEXT NOT NULL,
      verifier2_user_id INTEGER NOT NULL REFERENCES users(id), verifier2_name TEXT NOT NULL,
      verifier2_signature TEXT NOT NULL DEFAULT '', clean BOOLEAN NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      CHECK (verifier2_user_id <> verifier1_user_id))`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cs_count_lines (
      id SERIAL PRIMARY KEY, count_id INTEGER NOT NULL REFERENCES cs_counts(id) ON DELETE CASCADE,
      department_id INTEGER NOT NULL, item_id INTEGER REFERENCES cs_items(id) ON DELETE RESTRICT,
      expected_present BOOLEAN NOT NULL, actual_present BOOLEAN NOT NULL)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cs_discrepancies (
      id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL, station_id INTEGER NOT NULL,
      count_id INTEGER REFERENCES cs_counts(id) ON DELETE RESTRICT,
      item_id INTEGER REFERENCES cs_items(id) ON DELETE RESTRICT,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), detail TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
      resolution TEXT NOT NULL DEFAULT '', resolution_note TEXT NOT NULL DEFAULT '',
      resolved_at TIMESTAMPTZ, resolved_by_user_id INTEGER REFERENCES users(id),
      resolving_event_id INTEGER REFERENCES cs_events(id))`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cs_notifications (
      id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL, station_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL REFERENCES cs_events(id) ON DELETE RESTRICT,
      due_by TIMESTAMPTZ NOT NULL, acknowledged_at TIMESTAMPTZ,
      acknowledged_by_user_id INTEGER REFERENCES users(id))`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cs_pin_hash TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cs_manager BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE cs_events ADD COLUMN IF NOT EXISTS actor_signature TEXT NOT NULL DEFAULT ''`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cs_items_dept_status ON cs_items (department_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cs_events_dept_time ON cs_events (department_id, occurred_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cs_events_item ON cs_events (item_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cs_counts_dept_loc ON cs_counts (department_id, location_id, counted_at DESC)`);

  // unit_locations + expo_push_tokens dept_isolation (0023) + pre_plan_photos
  // (0043) — matches the pattern above.
  // Existence-guarded: on an install where the table isn't present yet (e.g. a dev DB
  // that fast-pathed table creation), skip rather than throw.
  for (const t of ['unit_locations', 'expo_push_tokens', 'pre_plan_photos', 'unit_status_acks', 'par_checks',
                   // Prevention Core Phase 1 (0047 mirror):
                   'fi_violations', 'fi_code_library', 'fi_inspection_types',
                   'fi_checklists', 'fi_checklist_items', 'fi_notices', 'fi_signatures',
                   // Prevention Core Phase 2 (0049 mirror):
                   'fi_designations', 'fi_inspection_answers', 'fi_settings',
                   // CS chain of custody (0087 mirror, Phase 2.7):
                   'cs_substances', 'cs_locations', 'cs_items', 'cs_events',
                   'cs_counts', 'cs_count_lines', 'cs_discrepancies', 'cs_notifications',
                   // Permit catalogue + expiration rule groups (0093 mirror, Phase 3.1b):
                   'fi_permit_expiration_rule_groups', 'fi_permit_expiration_rules',
                   'fi_permit_types',
                   // The scheduled-job run ledger (0095 mirror, Phase 3.1b):
                   'fi_job_runs',
                   // The expiry-notice ledger (0116 mirror, Phase 3.1b):
                   'fi_permit_notices']) {
    try {
      await pool.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
      await pool.query(`DROP POLICY IF EXISTS dept_isolation ON public.${t}`);
      await pool.query(`CREATE POLICY dept_isolation ON public.${t} FOR ALL
        USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
        WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)`);
    } catch (e) {
      if (e.code !== '42P01') throw e; // 42P01 = undefined_table; skip on installs without it
    }
  }

  // 3d. of_department_join_codes + of_register_pending_member (P4.4 self-claim,
  // migration 0013). Hashed/expiring/rotatable join codes; the DEFINER fn
  // validates a code → department and atomically creates a pending member login.
  // Mirror of docs/migrations/0013 (fresh installs; prod applied via Supabase MCP).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS of_department_join_codes (
      id                 SERIAL PRIMARY KEY,
      department_id      INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      code_hash          TEXT NOT NULL,
      expires_at         TIMESTAMPTZ NOT NULL,
      revoked_at         TIMESTAMPTZ,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_join_codes_hash ON of_department_join_codes(code_hash)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_join_codes_dept ON of_department_join_codes(department_id)');

  // weather_cache — shared server-side WeatherKit cache (global, non-tenant; no
  // FKs, no PII — just cached public weather keyed by coordinate rounded to ~1km).
  // Backs GET /api/weather/point so N rig devices on one incident = 1 WeatherKit
  // call per ~10-min window. Fresh installs here; prod applied via Supabase MCP.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weather_cache (
      lat_key    NUMERIC NOT NULL,
      lng_key    NUMERIC NOT NULL,
      payload    JSONB   NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (lat_key, lng_key)
    )
  `);
  await pool.query('DROP FUNCTION IF EXISTS public.of_register_pending_member(text,text,text,text,text)');
  await pool.query(`
    CREATE OR REPLACE FUNCTION public.of_register_pending_member(
      p_username text, p_password_hash text, p_name text, p_join_code_hash text, p_requested_rank text
    ) RETURNS TABLE (new_user_id int, new_department_id int)
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
    AS $fn$
    DECLARE v_dept int; v_station int; v_user int; v_member_no text;
    BEGIN
      IF p_username IS NULL OR length(btrim(p_username)) < 3 THEN
        RAISE EXCEPTION 'of_register_pending_member: username required (min 3 chars)'; END IF;
      IF p_password_hash IS NULL OR length(p_password_hash) < 20 THEN
        RAISE EXCEPTION 'of_register_pending_member: password hash required'; END IF;
      SELECT department_id INTO v_dept FROM of_department_join_codes
        WHERE code_hash = p_join_code_hash AND revoked_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1;
      IF v_dept IS NULL THEN RAISE EXCEPTION 'of_register_pending_member: invalid or expired join code'; END IF;
      IF EXISTS (SELECT 1 FROM users WHERE username = lower(btrim(p_username))) THEN
        RAISE EXCEPTION 'of_register_pending_member: username taken' USING ERRCODE = '23505'; END IF;
      SELECT min(id) INTO v_station FROM stations WHERE department_id = v_dept;
      IF v_station IS NULL THEN RAISE EXCEPTION 'of_register_pending_member: department % has no station', v_dept; END IF;
      INSERT INTO users (username, name, initials, role, "passwordHash", email, station_id)
        VALUES (lower(btrim(p_username)), btrim(p_name),
                upper(left(regexp_replace(coalesce(p_name,''), '[^A-Za-z]', '', 'g'), 2)),
                'member', p_password_hash, '', v_station)
        RETURNING id INTO v_user;
      SELECT 'M-' || lpad(((COALESCE(max((regexp_match("memberNumber", '^M-([0-9]+)$'))[1]::int), 0)) + 1)::text, 3, '0')
        INTO v_member_no FROM members WHERE department_id = v_dept;
      INSERT INTO members ("memberNumber", name, rank, role, status, joined, rank_verified, user_id, station_id, department_id)
        VALUES (v_member_no, btrim(p_name), COALESCE(NULLIF(btrim(p_requested_rank), ''), 'Firefighter'),
                'Firefighter', 'Active', to_char(now(), 'YYYY-MM-DD'), false, v_user, v_station, v_dept);
      INSERT INTO of_user_departments (user_id, department_id, role)
        VALUES (v_user, v_dept, 'member') ON CONFLICT (user_id, department_id) DO NOTHING;
      RETURN QUERY SELECT v_user, v_dept;
    END;
    $fn$;
  `);
  await pool.query(`DO $$
    DECLARE r text; f text := 'public.of_register_pending_member(text,text,text,text,text)';
    BEGIN
      IF to_regprocedure(f) IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r); END IF;
        END LOOP;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO of_app', f); END IF;
      END IF;
    END $$;`);
  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
      GRANT SELECT, INSERT, UPDATE ON public.of_department_join_codes TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.of_department_join_codes_id_seq TO of_app;
    END IF;
  END $$;`);

  // of_department_join_codes RLS (0015) — matches the dept_isolation pattern on the
  // ~100 other tenant tables. Safe: chief routes set the GUC; of_register_pending_member
  // reads it owner-side (DEFINER, bypasses RLS). of_member_invites is also RLS-on
  // now (0016) via the of_redeem_member_invite DEFINER fn above.
  await pool.query('ALTER TABLE public.of_department_join_codes ENABLE ROW LEVEL SECURITY');
  await pool.query('DROP POLICY IF EXISTS dept_isolation ON public.of_department_join_codes');
  await pool.query(`CREATE POLICY dept_isolation ON public.of_department_join_codes FOR ALL
    USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
    WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)`);

  // 3e. users email-verification (0014) — additive; users is shared (OF + FireHazmat),
  // these default safe so FireHazmat is unaffected. Token-in-DB (sha256); a soft
  // trust signal + abuse filter for self-serve signup, never a hard block.
  await pool.query('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false');
  await pool.query('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verify_token_hash text');
  await pool.query('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verify_sent_at timestamptz');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email_verify_token ON public.users(email_verify_token_hash)');

  // 3f. Legal-record FK hardening (0016): exposure_records + personnel_actions are
  // subpoenable. They were ON DELETE CASCADE to members; the app never hard-deletes
  // a member (removal = status flip), so flip both to RESTRICT — the DB now refuses
  // to delete a member that still has legal records (defense-in-depth). Idempotent.
  await pool.query(`DO $$ BEGIN
    IF to_regclass('public.exposure_records') IS NOT NULL THEN
      ALTER TABLE public.exposure_records  DROP CONSTRAINT IF EXISTS exposure_records_member_id_fkey;
      ALTER TABLE public.exposure_records  ADD CONSTRAINT exposure_records_member_id_fkey
        FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE RESTRICT;
    END IF;
    IF to_regclass('public.personnel_actions') IS NOT NULL THEN
      ALTER TABLE public.personnel_actions DROP CONSTRAINT IF EXISTS personnel_actions_member_id_fkey;
      ALTER TABLE public.personnel_actions ADD CONSTRAINT personnel_actions_member_id_fkey
        FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE RESTRICT;
    END IF;
  END $$;`);

  // 3g. department_id indexes (0019, P7 perf pass) — self-healing: ensures every
  // public tenant table that has a department_id column carries a leading index on
  // it (the column every query + the RLS dept_isolation policy filters on). Covers
  // fresh installs AND any future tenant table automatically. Excludes fs_hazmat_*
  // (FireHazmat domain). Idempotent; instant on small tables.
  await pool.query(`DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT c.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'department_id' AND a.attnum > 0 AND NOT a.attisdropped
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname NOT LIKE 'fs_hazmat%'
          AND c.oid NOT IN (
            SELECT i.indrelid FROM pg_index i
            JOIN pg_attribute ia ON ia.attrelid = i.indrelid AND ia.attnum = i.indkey[0] AND ia.attname = 'department_id')
      LOOP
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(department_id)', 'idx_'||r.relname||'_department', r.relname);
      END LOOP;
    END $$;`);

  // 4. Backfill: one department per existing station (1 station = 1 dept today).
  await pool.query(`
    INSERT INTO departments (id, name, fdid, dept_type, flsa_work_period, flsa_ot_threshold,
                             flsa_period_start, ai_daily_token_budget, tv_pin)
    SELECT s.id, s.name, COALESCE(s.fdid,''), COALESCE(s.dept_type,''),
           s.flsa_work_period, s.flsa_ot_threshold, s.flsa_period_start,
           s.ai_daily_token_budget, s.tv_pin
    FROM stations s
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(`SELECT setval(pg_get_serial_sequence('departments','id'),
                                  GREATEST((SELECT MAX(id) FROM departments), 1))`);
  await pool.query('UPDATE stations SET department_id = id WHERE department_id IS NULL');
  await pool.query(`
    INSERT INTO of_user_departments (user_id, department_id, role)
    SELECT u.id, u.station_id, COALESCE(u.role,'member')
    FROM users u WHERE u.station_id IS NOT NULL
    ON CONFLICT (user_id, department_id) DO NOTHING
  `);

  // 5. department_id on every tenant table (EXPAND), backfilled from station_id.
  const DEPT_TABLES = [
      'active_boards', 'active_resources', 'after_action_reports', 'ai_usage', 'apparatus',
      'apparatus_assignments', 'apparatus_oos', 'apparatus_positions', 'assets', 'assistant_alerts',
      'assistant_feedback', 'assistant_preferences', 'attachments', 'audit_log', 'budget_lines',
      'budget_transactions', 'bulletins', 'cad_alerts', 'cad_connections', 'cadets',
      'calendar_subscriptions', 'checklist_completions', 'checklist_templates', 'community_events', 'correspondence',
      'courses', 'coverage_outreach', 'crr_programs', 'crr_visits', 'cylinders',
      'daily_staffing', 'dept_documents', 'donations', 'drills', 'equipment_checkout',
      'events', 'exam_assignments', 'exam_submissions', 'exams', 'exposure_records',
      'fi_inspections', 'fi_permits', 'fi_properties', 'fill_stations', 'fs_hazmat_incidents',
      'fundraising_campaigns', 'grants', 'grievances', 'hydrants', 'incident_costs',
      'incident_responses', 'incidents', 'investigations', 'knox_access_log', 'knox_boxes',
      'knox_inspections', 'leave_requests', 'maintenance', 'meeting_minutes', 'member_availability',
      'member_qualifications', 'members', 'messages', 'module_completions', 'mutual_aid',
      'mutual_aid_agreements', 'nfirs_reports', 'ng911_calls', 'ot_records', 'pay_entries',
      'personnel_actions', 'policy_acknowledgments', 'pre_plans', 'push_subscriptions', 'radio_config',
      'radio_log', 'recall_events', 'recruitment', 'run_lists', 'scenario_completions',
      'shift_patterns', 'shift_swaps', 'shift_trades', 'shifts', 'sogs',
      'station_log', 'timesheets', 'training', 'training_course_completions', 'training_courses',
      'training_plans', 'unit_status_history', 'unit_statuses', 'vacancy_fill', 'volunteer_hours',
      'wellness', 'workflow_tasks',
  ];
  for (const t of DEPT_TABLES) {
    try {
      await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS department_id INTEGER`);
      await pool.query(`UPDATE ${t} SET department_id = station_id WHERE department_id IS NULL`);
    } catch (e) {
      if (e.code === '42P01') console.warn(`[initDb expand] skipped (relation missing): ${t}`);
      else throw e;
    }
  }
  for (const t of ['incidents','members','cad_alerts','unit_status_history','apparatus','exposure_records']) {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_department ON ${t}(department_id)`).catch(() => {});
  }
  // Relocated from the batched ALTER block (2026-07-12): needs members.department_id,
  // which only exists after the DEPT_TABLES loop above. No-op on existing DBs.
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_members_crew ON members (department_id, assigned_unit_id, assigned_group)`).catch(() => {});
  // 0090 (Phase 3, module 3.0) — permit numbers are unique per department. Lives HERE
  // for the same reason as the line above: fi_permits only acquires department_id in
  // the DEPT_TABLES loop. The index deliberately SPANS soft-deleted rows — a document
  // number is consumed once and never reused (the market's numbering rule; a reusable
  // number makes a gap indistinguishable from a renumbering). Blank/NULL numbers are
  // excluded so a legacy blank can't become a hard insert failure. No-op on prod,
  // where the migration already created it.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_fi_permits_dept_permit_number
      ON fi_permits (department_id, "permitNumber")
      WHERE "permitNumber" IS NOT NULL AND btrim("permitNumber") <> ''
  `);
  // 0051 — the open-work queue index. Lives HERE, not next to the CREATE TABLE:
  // fi_inspections only acquires department_id in this function, so indexing it
  // any earlier throws 42703 on a fresh install and takes initDb down with it.
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_inspections_assignee
    ON fi_inspections (department_id, assigned_to_user_id)
    WHERE deleted_at IS NULL AND "completedDate" IS NULL`).catch(() => {});
  // 0056 — the result axis. Same reason it lives here and not next to the CREATE TABLE:
  // department_id does not exist until this function runs. (The column + CHECK ARE in the
  // CREATE TABLE — only the composite index has to wait.)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fi_inspections_dept_result_code
    ON fi_inspections (department_id, result_code)`).catch(() => {});
  // 0056 backfill for an EXISTING db: exact matches ONLY. Ambiguous values (e.g.
  // 'Pass with Violations') stay NULL on purpose — rewriting a recorded result into a
  // different result obscures previously recorded information. They are surfaced for a
  // human decision, never defaulted. See docs/migrations/0056 and constants/inspectionResult.js.
  await pool.query(`
    UPDATE fi_inspections SET result_code = CASE lower(btrim(result))
      WHEN 'pass'                  THEN 'PASS'
      WHEN 'fail'                  THEN 'FAIL'
      WHEN 'reinspection required' THEN 'REINSPECTION_REQUIRED'
      WHEN 'not completed'         THEN 'NOT_COMPLETED'
    END
    WHERE result_code IS NULL
      AND lower(btrim(result)) IN ('pass','fail','reinspection required','not completed')`).catch(() => {});

  // 6. Landmine fixes — rescope uniqueness to per-department (gameplan §6).
  await pool.query('ALTER TABLE members  DROP CONSTRAINT IF EXISTS "members_memberNumber_key"');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_members_dept_number ON members (department_id, "memberNumber")');
  await pool.query('ALTER TABLE apparatus DROP CONSTRAINT IF EXISTS apparatus_designation_key');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_apparatus_dept_designation ON apparatus (department_id, designation)');

  // 7. fs_hazmat_incident_audit (§9 Q5) — no station_id; dept_id from its parent
  //    incident. Guarded: created by ensureHazmatIncidentTables, may not exist yet.
  try {
    await pool.query('ALTER TABLE fs_hazmat_incident_audit ADD COLUMN IF NOT EXISTS department_id INTEGER');
    await pool.query(`UPDATE fs_hazmat_incident_audit a SET department_id = i.department_id
                      FROM fs_hazmat_incidents i WHERE a.incident_id = i.id AND a.department_id IS NULL`);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_hazaudit_department ON fs_hazmat_incident_audit(department_id)');
  } catch (e) {
    if (e.code === '42P01') console.warn('[initDb expand] fs_hazmat_incident_audit not present yet — skipped');
    else throw e;
  }

  // 8. P4.1 (migration 0012) — members <-> users identity link + chief rank-verify.
  //    Additive only. The SECURITY DEFINER provisioning fns (of_provision_department,
  //    of_link_member) + the of_user_departments REVOKE are P5-ENFORCEMENT objects,
  //    applied to prod via docs/migrations/0012 — NOT mirrored here (same as 0006-0008).
  await pool.query('ALTER TABLE members ADD COLUMN IF NOT EXISTS user_id integer REFERENCES users(id) ON DELETE SET NULL');
  await pool.query('ALTER TABLE members ADD COLUMN IF NOT EXISTS rank_verified boolean NOT NULL DEFAULT false');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id)');

  // 8b. P0 identity link keys (migration 0028) — make the account<->person link
  //     ROBUST before any backfill. One login maps to at most ONE member row per
  //     department (partial unique); stable SSO/SCIM-ready correlation columns
  //     (external_id) + agency-badge column (personnel_id), dormant until P6.
  //     Internal join key stays members.id; these are ATTRIBUTES, never join keys.
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_members_user_dept ON members (user_id, department_id) WHERE user_id IS NOT NULL');
  await pool.query('ALTER TABLE members ADD COLUMN IF NOT EXISTS personnel_id TEXT');
  await pool.query('ALTER TABLE members ADD COLUMN IF NOT EXISTS external_id  TEXT');
  await pool.query('ALTER TABLE users   ADD COLUMN IF NOT EXISTS external_id  TEXT');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_members_external_id ON members (department_id, external_id) WHERE external_id IS NOT NULL');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_id ON users (external_id) WHERE external_id IS NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_members_personnel_id ON members (department_id, personnel_id) WHERE personnel_id IS NOT NULL');

  // 8c. P3 (migration 0029) — STABLE responder<->person link on the accountability
  //     record. member_id FK ON DELETE RESTRICT (people are deactivated, never
  //     hard-deleted; protects historical attribution). Added here (after all
  //     tables exist) to avoid CREATE-TABLE ordering coupling with members.
  await pool.query('ALTER TABLE incident_responses ADD COLUMN IF NOT EXISTS member_id INTEGER');
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='incident_responses_member_id_fkey' AND conrelid='public.incident_responses'::regclass) THEN
      ALTER TABLE incident_responses ADD CONSTRAINT incident_responses_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;
    END IF;
  END $$;`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_incident_responses_member ON incident_responses (member_id) WHERE member_id IS NOT NULL');

  // 8. department_id sync trigger (mirrors migration 0005, upgraded by 0020).
  //    On any write that leaves department_id NULL, resolves it from the row's
  //    station -> that station's REAL department (COALESCE fallback to station_id
  //    for orphan/pre-backfill rows). This keeps all ~236 insert paths tenant-
  //    correct for BOTH single- and multi-house departments without writing
  //    department_id at every call site. Kept as the robust mechanism (not the
  //    old `:= station_id`, which was only correct under 1-dept=1-station).
  await pool.query(`
    CREATE OR REPLACE FUNCTION of_sync_department_id() RETURNS trigger AS $fn$
    BEGIN
      IF TG_TABLE_NAME = 'apparatus_assignments' THEN IF NEW.station_id IS NULL AND NEW.apparatus_id IS NOT NULL THEN NEW.station_id := (SELECT station_id FROM public.apparatus WHERE id = NEW.apparatus_id); END IF; END IF; -- 0072: seated assignments carry their station (nested: NEW.apparatus_id only referenced for this table)
      IF NEW.department_id IS NULL THEN NEW.department_id := COALESCE((SELECT s.department_id FROM public.stations s WHERE s.id = NEW.station_id), NEW.station_id); END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    DO $do$
    DECLARE t text;
    BEGIN
      FOR t IN
        SELECT c1.table_name FROM information_schema.columns c1
        JOIN information_schema.columns c2
          ON c1.table_name = c2.table_name AND c2.table_schema='public' AND c2.column_name='department_id'
        WHERE c1.table_schema='public' AND c1.column_name='station_id'
        GROUP BY c1.table_name
      LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_department_id ON %I', t);
        EXECUTE format('CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION of_sync_department_id()', t);
      END LOOP;
    END $do$;
  `);

  // ── 0066 mirror — department-keyed run foundation ──────────────────────────
  // Existing DBs got this via docs/migrations/0066-department-key-run-foundation.sql
  // (applied by hand, ledgered). This converges a FRESH install to the same
  // shape: the four "who's riding" tables anchor on department_id (the RLS
  // tenant key) with a real FK to departments, and the legacy station_id FK /
  // NOT NULL / uniqueness anchors are gone. Guarded + idempotent; lives HERE
  // because departments only exists after applyDepartmentExpand.
  await pool.query(`DO $do$
    BEGIN
      -- active_boards: PK on department_id (fresh installs already create it so;
      -- this re-keys any DB still carrying the station_id PK that missed 0066)
      IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a
                   ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
                 WHERE c.conrelid = 'active_boards'::regclass
                   AND c.contype = 'p' AND a.attname = 'station_id') THEN
        UPDATE active_boards SET department_id = station_id WHERE department_id IS NULL;
        ALTER TABLE active_boards ALTER COLUMN department_id SET NOT NULL;
        ALTER TABLE active_boards DROP CONSTRAINT IF EXISTS active_boards_station_id_fkey;
        ALTER TABLE active_boards DROP CONSTRAINT active_boards_pkey;
        ALTER TABLE active_boards ADD CONSTRAINT active_boards_pkey PRIMARY KEY (department_id);
        ALTER TABLE active_boards ALTER COLUMN station_id DROP NOT NULL;
      END IF;
      -- run_lists: per-station roster grain (0072). Bring any older key forward to
      -- (department_id, station_id, date). First a legacy (station_id, date) key → dept-keyed…
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'run_lists_station_id_date_key') THEN
        UPDATE run_lists SET department_id = station_id WHERE department_id IS NULL;
        ALTER TABLE run_lists DROP CONSTRAINT run_lists_station_id_date_key;
      END IF;
      ALTER TABLE run_lists DROP CONSTRAINT IF EXISTS run_lists_station_id_fkey;
      -- …then to the per-station key. Backfill station_id from the department's sole station
      -- (single-house); only enforce NOT NULL + the per-station unique once no NULLs remain
      -- (a multi-house legacy install would resolve station per row before this can enforce).
      UPDATE run_lists r SET station_id = s.id FROM stations s
        WHERE s.department_id = r.department_id AND r.station_id IS NULL
          AND (SELECT count(*) FROM stations s2 WHERE s2.department_id = r.department_id) = 1;
      IF NOT EXISTS (SELECT 1 FROM run_lists WHERE station_id IS NULL) THEN
        ALTER TABLE run_lists ALTER COLUMN station_id SET NOT NULL;
        ALTER TABLE run_lists DROP CONSTRAINT IF EXISTS run_lists_department_id_date_key;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'run_lists_dept_station_date_key') THEN
          ALTER TABLE run_lists ADD CONSTRAINT run_lists_dept_station_date_key UNIQUE (department_id, station_id, date);
        END IF;
      END IF;
      ALTER TABLE apparatus_assignments DROP CONSTRAINT IF EXISTS apparatus_assignments_station_id_fkey;
      ALTER TABLE apparatus_assignments ALTER COLUMN station_id DROP NOT NULL;
      -- 1.1c-b (0070): seatless-but-paid on-duty is first-class; hours folded onto the board.
      ALTER TABLE apparatus_assignments ALTER COLUMN apparatus_id DROP NOT NULL;
      ALTER TABLE apparatus_assignments ADD COLUMN IF NOT EXISTS hours      NUMERIC(5,2);
      ALTER TABLE apparatus_assignments ADD COLUMN IF NOT EXISTS start_time TEXT;
      ALTER TABLE apparatus_assignments ADD COLUMN IF NOT EXISTS end_time   TEXT;
      ALTER TABLE apparatus_assignments ADD COLUMN IF NOT EXISTS status     TEXT DEFAULT 'on_duty';
      ALTER TABLE apparatus_assignments ADD COLUMN IF NOT EXISTS notes      TEXT DEFAULT '';
      ALTER TABLE apparatus_positions DROP CONSTRAINT IF EXISTS apparatus_positions_station_id_fkey;
      ALTER TABLE apparatus_positions ALTER COLUMN station_id DROP NOT NULL;
      -- department FKs (idempotent by name)
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'active_boards_department_id_fkey') THEN
        ALTER TABLE active_boards ADD CONSTRAINT active_boards_department_id_fkey
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'run_lists_department_id_fkey') THEN
        ALTER TABLE run_lists ADD CONSTRAINT run_lists_department_id_fkey
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apparatus_assignments_department_id_fkey') THEN
        ALTER TABLE apparatus_assignments ADD CONSTRAINT apparatus_assignments_department_id_fkey
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apparatus_positions_department_id_fkey') THEN
        ALTER TABLE apparatus_positions ADD CONSTRAINT apparatus_positions_department_id_fkey
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
      END IF;
    END $do$;`);
  // of_station_department(station_id) — RLS-bypassing resolver (0020). The CAD
  // pipeline calls this before it has a dept context to set the request GUC +
  // key the realtime broadcast. Read-only, search_path-locked, EXECUTE to of_app.
  await pool.query(`CREATE OR REPLACE FUNCTION public.of_station_department(p_station_id integer)
    RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $fn$ SELECT department_id FROM public.stations WHERE id = p_station_id $fn$`);
  await pool.query(`DO $do$
    DECLARE r text; f text := 'public.of_station_department(integer)';
    BEGIN
      IF to_regprocedure(f) IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r); END IF;
        END LOOP;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO of_app', f); END IF;
      END IF;
    END $do$;`);

  // Per-department CAD webhook (0021): each cad_connection carries its own webhook
  // secret (sha256 hash stored). of_cad_connection_by_webhook_secret resolves the
  // hash -> dept+station, BYPASSING RLS (the webhook is unauthenticated). EXECUTE
  // to of_app only. Lets each department connect its own CAD feed.
  await pool.query('ALTER TABLE public.cad_connections ADD COLUMN IF NOT EXISTS webhook_secret_hash text');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_cad_connections_webhook_secret ON public.cad_connections(webhook_secret_hash)');
  await pool.query(`CREATE OR REPLACE FUNCTION public.of_cad_connection_by_webhook_secret(p_secret_hash text)
    RETURNS TABLE (connection_id integer, department_id integer, station_id integer, vendor_id text)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $fn$ SELECT id, department_id, station_id, "vendorId" FROM public.cad_connections
            WHERE webhook_secret_hash = p_secret_hash AND COALESCE(status,'') NOT IN ('Inactive','disabled','revoked')
            ORDER BY id DESC LIMIT 1 $fn$`);
  await pool.query(`DO $do$
    DECLARE r text; f text := 'public.of_cad_connection_by_webhook_secret(text)';
    BEGIN
      IF to_regprocedure(f) IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r); END IF;
        END LOOP;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO of_app', f); END IF;
      END IF;
    END $do$;`);

  // ── 0115 + 0121 mirror: the CAD INGEST RECEIPT LOG ─────────────────────────────────────
  //
  // 🔴 WHY THIS BLOCK EXISTS AT ALL — it was MISSING, and the gap had a dated cause.
  // `cad_ingest_log` / `cad_ingest_outcome` appeared in NEITHER fresh-install path: not here,
  // and not in `db/baseline.sql` (which is dated 2026-07-26, while migration 0115 created these
  // tables on 2026-07-27 — the snapshot predates the table by one day). Every other cad_* table
  // is in both. So a brand-new department came up with no receipt log, while every sibling table
  // arrived normally. Found 2026-08-04.
  //
  // That matters more than a missing table usually would, because 4C.2's whole doctrine is that
  // a dispatch we fail to record is not delayed, it is GONE — the sending CAD believes it was
  // delivered, NENA-STA-024 §3.3.5.3.1 gives it no retry on anything but a 503, and no vendor
  // implements redelivery. The receipt IS the guarantee. Pre-launch, EVERY real customer is a
  // fresh install, so the first department to sign up would have launched without it.
  //
  // Definitions copied from 0115 verbatim (including 0121's TRUNCATE revoke), so a fresh install
  // and a migrated database converge. Verified by fingerprint after a DROP + ensureDb rebuild.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.cad_ingest_log (
      id             BIGSERIAL PRIMARY KEY,
      -- i3 §2.1.8: every LogEvent gets a globally unique id. Also the handle handed back in the ack.
      log_event_id   UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      department_id  INTEGER     NOT NULL,
      station_id     INTEGER,
      connection_id  INTEGER,
      -- clock_timestamp(), NOT now(): now() is transaction-start and identical for every row in a
      -- txn. i3 §2.3 needs enough precision to ORDER two events inside the same second.
      received_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      vendor         TEXT        NOT NULL,
      source_ip      INET,                    -- i3 §4.12.3.7 required member
      raw_body       TEXT        NOT NULL,    -- i3 §4.12.3.7 required member
      -- Redacted at the application layer: the secret may arrive in a query parameter as well as
      -- a header, so the URL is scrubbed too. A credential must never come to rest in a table we
      -- keep forever.
      headers        JSONB
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cad_ingest_log_dept_time ON public.cad_ingest_log (department_id, received_at DESC);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.cad_ingest_outcome (
      id               BIGSERIAL PRIMARY KEY,
      log_event_id     UUID        NOT NULL REFERENCES public.cad_ingest_log (log_event_id),
      department_id    INTEGER     NOT NULL,
      at               TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      -- A CLOSED SET, matched exactly, enforced in Postgres — the fi_inspections result_code
      -- lesson: a free-text control value WILL drift into three vocabularies across three
      -- writers, and nothing may ever pattern-match it.
      parse_status     TEXT        NOT NULL
                         CHECK (parse_status IN ('parsed','unparseable','processing_failed')),
      parse_error      TEXT,
      alert_id         TEXT,
      -- What we actually answered, so the response contract stays auditable after the fact
      -- rather than inferred from code that has since changed.
      responded_status SMALLINT    NOT NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cad_ingest_outcome_event ON public.cad_ingest_outcome (log_event_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cad_ingest_outcome_unparseable ON public.cad_ingest_outcome (department_id, at DESC) WHERE parse_status <> 'parsed';`);
  // 0127 mirror (4C.4): the operator's disposition of a fault. A THIRD append-only row rather
  // than a mutable column on the outcome — "these bytes arrived", "we could read them" and "a
  // human worked it" are three facts established at different times by different actors, and
  // a column seam would mean granting of_app UPDATE on a table whose whole value is that it
  // holds none. Spec: docs/CAD-INGEST-4C4-SPEC-2026-08-05.md §4.
  // Every nullable column tested inside a CHECK carries an explicit IS NOT NULL arm:
  // length(btrim(NULL)) > 0 is NULL, and a CHECK treats NULL as PASS (the 0125 leak, found by
  // a probe during 0126).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.cad_ingest_review (
      id             BIGSERIAL PRIMARY KEY,
      outcome_id     BIGINT      NOT NULL REFERENCES public.cad_ingest_outcome (id),
      department_id  INTEGER     NOT NULL,
      reviewed_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      -- users.id, no FK (the audit_log convention): a review is a fact about what happened and
      -- must survive the reviewer's account being removed.
      reviewed_by    INTEGER     NOT NULL,
      -- FROZEN at review time, so a rename or deactivation cannot rewrite who cleared a fault.
      reviewer_name  TEXT        NOT NULL,
      note           TEXT,
      CONSTRAINT cad_ingest_review_reviewer_name_present
        CHECK (length(btrim(reviewer_name)) > 0),
      CONSTRAINT cad_ingest_review_note_nonempty
        CHECK (note IS NULL OR length(btrim(note)) > 0)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cad_ingest_review_outcome ON public.cad_ingest_review (outcome_id, reviewed_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cad_ingest_review_dept_time ON public.cad_ingest_review (department_id, reviewed_at DESC);`);
  // Append-only + RLS + grants. The REVOKE list includes TRUNCATE (0121): 0115 stripped
  // UPDATE/DELETE but not TRUNCATE, and Supabase grants it by schema default — so a bypass-RLS
  // role could empty the entire archive-forever log in one statement.
  await pool.query(`
    DO $cadlog$
    DECLARE t TEXT; r TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY['cad_ingest_log','cad_ingest_outcome','cad_ingest_review'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS dept_isolation ON public.%I', t);
        EXECUTE format('CREATE POLICY dept_isolation ON public.%I FOR ALL '
                    || 'USING (department_id = (NULLIF(current_setting(''app.department_id'', true), ''''))::integer) '
                    || 'WITH CHECK (department_id = (NULLIF(current_setting(''app.department_id'', true), ''''))::integer)', t);
        FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role','PUBLIC'] LOOP
          IF r = 'PUBLIC' OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM %s', t,
                           CASE WHEN r = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r) END);
          END IF;
        END LOOP;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
          EXECUTE format('GRANT SELECT, INSERT ON public.%I TO of_app', t);
          EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I_id_seq TO of_app', t);
        END IF;
      END LOOP;
    END $cadlog$;
  `);

  // ── 0128 mirror: of_cron_runs — the platform-job INVOCATION ledger ────────────────────
  //
  // Five Vercel crons, and nothing noticed if one stopped firing. Every way a cron goes quiet
  // produces SILENCE inside our process — a rotated CRON_SECRET refuses the invocation before
  // any handler runs, a dropped vercel.json line removes it entirely, a timeout kills it
  // mid-flight — so on-error alerting is structurally blind to all three. ABSENCE OF SUCCESS
  // is the only signal that catches them.
  //
  // Deliberately SEPARATE from fi_job_runs (0095), which is the permit-expiry DOMAIN ledger:
  // its columns are domain columns on purpose and it is department_id NOT NULL, while
  // `reconcile` has no department at all (licenses is global). Two questions, two tables:
  // "what did the ladder DO" vs "did this invocation HAPPEN". The doctrine is shared and is
  // 0095's — one row per run, written at the END; a run that dies leaves no row, and that
  // absence IS the signal.
  //
  // GLOBAL by design, and said so with a NAMED permissive policy rather than by leaving RLS
  // off: a global table with RLS off is indistinguishable, to a later audit, from a tenant
  // table somebody forgot. `summary` carries TOTALS ONLY — every chief can read this table.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.of_cron_runs (
      id           BIGSERIAL PRIMARY KEY,
      -- A CLOSED SET, matched exactly, kept in lock-step with constants/cronJobs.js; a test
      -- asserts both against vercel.json. A typo'd job name would create a job nothing ever
      -- looks for — the very failure this table detects, arriving through the back door.
      job_name     TEXT        NOT NULL
                     CHECK (job_name IN ('reconcile','retention','neris_sweep',
                                         'report_delivery','permit_expiry')),
      started_at   TIMESTAMPTZ NOT NULL,
      finished_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      outcome      TEXT        NOT NULL CHECK (outcome IN ('success','failed')),
      summary      JSONB,
      error        TEXT,
      CONSTRAINT of_cron_runs_time_order CHECK (finished_at >= started_at),
      CONSTRAINT of_cron_runs_error_only_on_failure
        CHECK ((outcome = 'failed') OR (error IS NULL)),
      -- Explicit IS NOT NULL arm: length(btrim(NULL)) > 0 is NULL and a CHECK treats NULL as
      -- PASS (the 0125 leak, found by a probe during 0126).
      CONSTRAINT of_cron_runs_error_nonempty
        CHECK (error IS NULL OR length(btrim(error)) > 0),
      CONSTRAINT of_cron_runs_summary_small
        CHECK (summary IS NULL OR length(summary::text) <= 2000)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_of_cron_runs_job_success ON public.of_cron_runs (job_name, finished_at DESC) WHERE outcome = 'success';`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_of_cron_runs_job_time ON public.of_cron_runs (job_name, finished_at DESC);`);
  await pool.query(`
    DO $cronruns$
    DECLARE r TEXT;
    BEGIN
      EXECUTE 'ALTER TABLE public.of_cron_runs ENABLE ROW LEVEL SECURITY';
      EXECUTE 'DROP POLICY IF EXISTS global_read ON public.of_cron_runs';
      EXECUTE 'CREATE POLICY global_read ON public.of_cron_runs FOR ALL USING (true) WITH CHECK (true)';
      FOREACH r IN ARRAY ARRAY['of_app','anon','authenticated','service_role','PUBLIC'] LOOP
        IF r = 'PUBLIC' OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
          EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.of_cron_runs FROM %s',
                         CASE WHEN r = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r) END);
        END IF;
      END LOOP;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'of_app') THEN
        EXECUTE 'GRANT SELECT, INSERT ON public.of_cron_runs TO of_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.of_cron_runs_id_seq TO of_app';
      END IF;
    END $cronruns$;
  `);

  // ── 0129 mirror: agent_approvals — department-local MCP human gate ──────────
  // Gated fire verbs (NERIS submit, notify chief, unit clear/release) land here
  // instead of writing the record. A chief/officer accepts or rejects on the
  // existing Dashboard. Tenant-scoped; not a new admin console.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.agent_approvals (
      id                 BIGSERIAL PRIMARY KEY,
      department_id      INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      verb               TEXT NOT NULL,
      status             TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','rejected')),
      payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
      summary            TEXT NOT NULL DEFAULT '',
      requested_by       INTEGER,
      requested_by_name  TEXT DEFAULT '',
      requested_by_role  TEXT DEFAULT '',
      resolved_by        INTEGER,
      resolved_by_name   TEXT,
      resolved_at        TIMESTAMPTZ,
      resolve_note       TEXT,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_agent_approvals_dept_status ON public.agent_approvals (department_id, status, created_at DESC)');
  await pool.query(`
    DO $agentappr$
    BEGIN
      EXECUTE 'ALTER TABLE public.agent_approvals ENABLE ROW LEVEL SECURITY';
      EXECUTE 'DROP POLICY IF EXISTS dept_isolation ON public.agent_approvals';
      EXECUTE 'CREATE POLICY dept_isolation ON public.agent_approvals FOR ALL
        USING (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int)
        WITH CHECK (department_id = NULLIF(current_setting(''app.department_id'', true), '''')::int)';
    END $agentappr$;
  `);

  // AVL ingestion (0032, ADR-0003): per-dept hardware vehicle-location feeds.
  // Mirrors the CAD webhook model. Fresh-install mirror of docs/migrations/0032.
  await pool.query(`CREATE TABLE IF NOT EXISTS public.avl_connections (
    id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT 'AVL Feed', vendor_id TEXT NOT NULL DEFAULT 'generic',
    status TEXT NOT NULL DEFAULT 'Active', webhook_secret_hash TEXT,
    field_map TEXT NOT NULL DEFAULT '{}', last_fix_at TIMESTAMPTZ,
    fixes_ingested INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_avl_connections_dept ON public.avl_connections(department_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_avl_connections_secret ON public.avl_connections(webhook_secret_hash)');
  await pool.query(`CREATE TABLE IF NOT EXISTS public.avl_devices (
    id SERIAL PRIMARY KEY, department_id INTEGER NOT NULL,
    device_ref TEXT NOT NULL, apparatus_id INTEGER NOT NULL, label TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (department_id, device_ref))`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_avl_devices_dept ON public.avl_devices(department_id)');
  await pool.query(`CREATE OR REPLACE FUNCTION public.of_avl_connection_by_webhook_secret(p_secret_hash text)
    RETURNS TABLE (connection_id integer, department_id integer, vendor_id text)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $fn$ SELECT id, department_id, vendor_id FROM public.avl_connections
            WHERE webhook_secret_hash = p_secret_hash AND COALESCE(status,'') NOT IN ('Inactive','disabled','revoked')
            ORDER BY id DESC LIMIT 1 $fn$`);
  await pool.query(`DO $do$
    DECLARE r text; f text := 'public.of_avl_connection_by_webhook_secret(text)';
    BEGIN
      IF to_regprocedure(f) IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r); END IF;
        END LOOP;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO of_app', f); END IF;
      END IF;
    END $do$;`);
  await pool.query('ALTER TABLE public.avl_connections ENABLE ROW LEVEL SECURITY');
  await pool.query('ALTER TABLE public.avl_devices ENABLE ROW LEVEL SECURITY');
  await pool.query(`DO $do$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='avl_connections' AND policyname='dept_isolation') THEN
      CREATE POLICY dept_isolation ON public.avl_connections FOR ALL
        USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
        WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='avl_devices' AND policyname='dept_isolation') THEN
      CREATE POLICY dept_isolation ON public.avl_devices FOR ALL
        USING (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer)
        WITH CHECK (department_id = (NULLIF(current_setting('app.department_id', true), ''))::integer);
    END IF;
  END $do$;`);
  await pool.query(`DO $do$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='of_app') THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.avl_connections TO of_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.avl_devices TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.avl_connections_id_seq TO of_app;
      GRANT USAGE, SELECT ON SEQUENCE public.avl_devices_id_seq TO of_app;
    END IF;
  END $do$;`);
}

// ── Checklist seed function ──────────────────────────────────────────────────────

async function seedChecklists(stationId = 1) {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM checklist_templates WHERE department_id = $1', [stationId]);
  if (parseInt(rows[0].c) === 0) {
    // Insert first 2 templates
    const templates = [
      {
        name: 'Engine 14 — Daily Check',
        apparatus: 'Engine 14',
        frequency: 'Daily',
        estimatedMinutes: 20,
        categories: JSON.stringify([
          {
            name: 'Cab & Driver Area',
            items: [
              { id: 'e-cab-01', description: 'Fuel level ≥ 3/4 tank', type: 'pass_fail' },
              { id: 'e-cab-02', description: 'Engine oil level — check dipstick', type: 'pass_fail' },
            ],
          },
        ]),
      },
      {
        name: 'Rescue 14 — Daily Check',
        apparatus: 'Rescue 14',
        frequency: 'Daily',
        estimatedMinutes: 25,
        categories: JSON.stringify([
          {
            name: 'Cab & Driver Area',
            items: [
              { id: 'r-cab-01', description: 'Fuel level ≥ 3/4 tank', type: 'pass_fail' },
              { id: 'r-cab-02', description: 'Engine oil and coolant levels', type: 'pass_fail' },
            ],
          },
        ]),
      },
    ];

    for (const tpl of templates) {
      await pool.query(
        'INSERT INTO checklist_templates (name, apparatus, frequency, "estimatedMinutes", categories, station_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [tpl.name, tpl.apparatus, tpl.frequency, tpl.estimatedMinutes, tpl.categories, stationId]
      );
    }
  }
}

// ── JSON Serialization/Deserialization Helpers ───────────────────────────────

function deserialize(row) {
  if (!row) return null;
  return {
    ...row,
    certifications: JSON.parse(row.certifications || '[]'),
  };
}

function serialize(data) {
  const out = { ...data };
  if (Array.isArray(out.certifications)) {
    out.certifications = JSON.stringify(out.certifications);
  }
  return out;
}

function safeParseArray(val) {
  if (Array.isArray(val)) return val;
  if (val == null || val === '') return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function incDeserialize(row) {
  if (!row) return null;
  return {
    ...row,
    units:     safeParseArray(row.units),
    personnel: safeParseArray(row.personnel),
    photos:    safeParseArray(row.photos),
  };
}

function incSerialize(data) {
  const out = { ...data };
  if (Array.isArray(out.units))     out.units     = JSON.stringify(out.units);
  if (Array.isArray(out.personnel)) out.personnel = JSON.stringify(out.personnel);
  if (Array.isArray(out.photos))    out.photos    = JSON.stringify(out.photos);
  // NERIS JSONB columns (0060). Stringified here because node-postgres renders a
  // bare JS ARRAY param as a Postgres array literal ('{…}'), not JSON — the same
  // reason mayday.scene_snapshot stringifies. (units/personnel/photos above are
  // legacy TEXT-JSON and stay exactly as they are.) neris_noaction is plain TEXT.
  for (const k of ['neris_incident_types', 'neris_actions', 'neris_fire_detail',
                   'neris_hazsit_detail', 'neris_medical_details', 'neris_aids',
                   'neris_casualty_rescues', 'neris_dispatch_times', 'neris_fire_protection']) {
    if (out[k] !== null && typeof out[k] === 'object') out[k] = JSON.stringify(out[k]);
  }
  return out;
}

function shiftDeserialize(row) {
  if (!row) return null;
  return {
    ...row,
    crew: JSON.parse(row.crew || '[]'),
    memberIds: JSON.parse(row.memberIds || '[]'),
    isOverride: !!row.isOverride,
    patternId: row.patternId || null,
  };
}

function shiftSerialize(data) {
  const out = { ...data };
  if (Array.isArray(out.crew)) out.crew = JSON.stringify(out.crew);
  if (Array.isArray(out.memberIds)) out.memberIds = JSON.stringify(out.memberIds);
  return out;
}

// Shift Pattern serialize/deserialize
function spDeserialize(row) {
  if (!row) return null;
  return {
    ...row,
    repeatDays: JSON.parse(row.repeatDays || '[]'),
    memberIds: JSON.parse(row.memberIds || '[]'),
    // 0068: generalized cycle day-state array (empty [] = use cycle_on/cycle_off)
    cycle_pattern: JSON.parse(row.cycle_pattern || '[]'),
  };
}
function spSerialize(data) {
  const out = { ...data };
  if (Array.isArray(out.repeatDays)) out.repeatDays = JSON.stringify(out.repeatDays);
  if (Array.isArray(out.memberIds)) out.memberIds = JSON.stringify(out.memberIds);
  if (Array.isArray(out.cycle_pattern)) out.cycle_pattern = JSON.stringify(out.cycle_pattern);
  return out;
}

// Leave Request serialize/deserialize
function lrDeserialize(row) {
  if (!row) return null;
  return { ...row };
}

// Shift Swap serialize/deserialize
function ssDeserialize(row) {
  if (!row) return null;
  return { ...row };
}

function slDeserialize(row) {
  if (!row) return null;
  return {
    ...row,
    membersOnDuty:    JSON.parse(row.membersOnDuty    || '[]'),
    events:           JSON.parse(row.events           || '[]'),
    apparatusChecked: Boolean(row.apparatusChecked),
    stationChecked:   Boolean(row.stationChecked),
  };
}

function slSerialize(data) {
  const out = { ...data };
  if (Array.isArray(out.membersOnDuty)) out.membersOnDuty = JSON.stringify(out.membersOnDuty);
  if (Array.isArray(out.events))        out.events        = JSON.stringify(out.events);
  if (typeof out.apparatusChecked === 'boolean') out.apparatusChecked = out.apparatusChecked ? true : false;
  if (typeof out.stationChecked   === 'boolean') out.stationChecked   = out.stationChecked   ? true : false;
  return out;
}

function fiPropDeserialize(r) {
  if (!r) return null;
  return { ...r, sprinklered: Boolean(r.sprinklered), alarmMonitored: Boolean(r.alarmMonitored), hazmatOnsite: Boolean(r.hazmatOnsite) };
}

function fiPropSerialize(d) {
  const o = { ...d };
  if (typeof o.sprinklered    === 'boolean') o.sprinklered    = o.sprinklered;
  if (typeof o.alarmMonitored === 'boolean') o.alarmMonitored = o.alarmMonitored;
  if (typeof o.hazmatOnsite   === 'boolean') o.hazmatOnsite   = o.hazmatOnsite;
  return o;
}

function fiInsDeserialize(r) { return r ? { ...r, violations: JSON.parse(r.violations||'[]') } : null; }
function fiInsSerialize(d)   { const o={...d}; if(Array.isArray(o.violations)) o.violations=JSON.stringify(o.violations); return o; }

function grDeserialize(r) {
  if (!r) return null;
  return {
    ...r,
    matchRequired:       Boolean(r.matchRequired),
    reportingDeadlines:  JSON.parse(r.reportingDeadlines || '[]'),
    expenditures:        JSON.parse(r.expenditures       || '[]'),
  };
}

function grSerialize(d) {
  const o = { ...d };
  if (o.matchRequired !== undefined) o.matchRequired = o.matchRequired ? true : false;
  if (Array.isArray(o.reportingDeadlines)) o.reportingDeadlines = JSON.stringify(o.reportingDeadlines);
  if (Array.isArray(o.expenditures))       o.expenditures       = JSON.stringify(o.expenditures);
  return o;
}

function maDeserialize(r) { return r ? { ...r, unitsDeployed: JSON.parse(r.unitsDeployed || '[]') } : null; }
function maSerialize(d)   { const o={...d}; if(Array.isArray(o.unitsDeployed)) o.unitsDeployed=JSON.stringify(o.unitsDeployed); return o; }

function sogDeserialize(r) { return r ? { ...r, tags: JSON.parse(r.tags||'[]') } : null; }
function sogSerialize(d)   { const o={...d}; if(Array.isArray(o.tags)) o.tags=JSON.stringify(o.tags); return o; }

function wlDeserialize(r) {
  if (!r) return null;
  return {
    ...r,
    physicals:    JSON.parse(r.physicals    || '[]'),
    scbaFitTests: JSON.parse(r.scbaFitTests || '[]'),
    vaccinations: JSON.parse(r.vaccinations || '[]'),
    exposures:    JSON.parse(r.exposures    || '[]'),
  };
}

function wlSerialize(d) {
  const o = { ...d };
  if (Array.isArray(o.physicals))    o.physicals    = JSON.stringify(o.physicals);
  if (Array.isArray(o.scbaFitTests)) o.scbaFitTests = JSON.stringify(o.scbaFitTests);
  if (Array.isArray(o.vaccinations)) o.vaccinations = JSON.stringify(o.vaccinations);
  if (Array.isArray(o.exposures))    o.exposures    = JSON.stringify(o.exposures);
  return o;
}

function rcDeserialize(r) {
  if (!r) return null;
  return {
    ...r,
    stageHistory: JSON.parse(r.stageHistory || '[]'),
    checklist:    JSON.parse(r.checklist    || '{}'),
  };
}

function rcSerialize(d) {
  const o = { ...d };
  if (Array.isArray(o.stageHistory))                    o.stageHistory = JSON.stringify(o.stageHistory);
  if (o.checklist && typeof o.checklist === 'object')   o.checklist    = JSON.stringify(o.checklist);
  return o;
}

function evDeserialize(r) { return r ? { ...r, rsvps: JSON.parse(r.rsvps || '[]') } : null; }
function evSerialize(d)   { const o={...d}; if (Array.isArray(o.rsvps)) o.rsvps=JSON.stringify(o.rsvps); return o; }
function evExpandRecurrence(event, startDate, endDate) {
  // Helper to expand recurring events - will be used with rrule helper
  if (!event.rrule) return [event];
  // This will be properly implemented after rrule helper is created
  return [event];
}

function ppDeserialize(r) {
  if (!r) return null;
  return {
    ...r,
    contacts:   JSON.parse(r.contacts   || '[]'),
    hazards:    JSON.parse(r.hazards    || '[]'),
    access:     JSON.parse(r.access     || '{}'),
    waterSupply: JSON.parse(r.waterSupply || '[]'),
    suppression: JSON.parse(r.suppression || '{}'),
    utilities:   JSON.parse(r.utilities   || '{}'),
    // Tactical sketch = vector strokes drawn on the iPad pre-plan. `|| '[]'` keeps
    // this safe before migration 0033 is applied (column absent → undefined → []).
    tacticalSketch: JSON.parse(r.tacticalSketch || '[]'),
  };
}

function ppSerialize(d) {
  const o = { ...d };
  if (Array.isArray(o.contacts))   o.contacts   = JSON.stringify(o.contacts);
  if (Array.isArray(o.hazards))    o.hazards    = JSON.stringify(o.hazards);
  if (o.access && typeof o.access === 'object')         o.access         = JSON.stringify(o.access);
  if (Array.isArray(o.waterSupply)) o.waterSupply = JSON.stringify(o.waterSupply);
  if (o.suppression && typeof o.suppression === 'object') o.suppression = JSON.stringify(o.suppression);
  if (o.utilities && typeof o.utilities === 'object')   o.utilities = JSON.stringify(o.utilities);
  if (Array.isArray(o.tacticalSketch)) o.tacticalSketch = JSON.stringify(o.tacticalSketch);
  return o;
}

function drDeserialize(r) {
  if (!r) return null;
  return {
    ...r,
    objectives: JSON.parse(r.objectives || '[]'),
    attendees:  JSON.parse(r.attendees  || '[]'),
  };
}

function drSerialize(d) {
  const o = { ...d };
  if (Array.isArray(o.objectives)) o.objectives = JSON.stringify(o.objectives);
  if (Array.isArray(o.attendees))  o.attendees  = JSON.stringify(o.attendees);
  return o;
}

function coDeserialize(r) { return r ? { ...r, attendees: JSON.parse(r.attendees || '[]') } : null; }
function coSerialize(d)   { const o={...d}; if(Array.isArray(o.attendees)) o.attendees=JSON.stringify(o.attendees); return o; }


function cadDeserialize(r) {
  if (!r) return null;
  const { webhook_secret_hash, ...rest } = r; // never expose the secret hash to clients
  return { ...rest, fieldMap: JSON.parse(r.fieldMap || '{}') };
}
function cadSerialize(d)   { const o={...d}; if (o.fieldMap && typeof o.fieldMap === 'object') o.fieldMap=JSON.stringify(o.fieldMap); return o; }

function invDeserialize(r) { return r ? { ...r, evidence: JSON.parse(r.evidence||'[]') } : null; }
function invSerialize(d)   { const o={...d}; if(Array.isArray(o.evidence)) o.evidence=JSON.stringify(o.evidence); return o; }

function peDeserialize(r) {
  if (!r) return null;
  return {
    ...r,
    specialPay: JSON.parse(r.specialPay || '[]'),
    deductions: JSON.parse(r.deductions || '[]'),
  };
}

function peSerialize(d) {
  const o = { ...d };
  if (Array.isArray(o.specialPay)) o.specialPay = JSON.stringify(o.specialPay);
  if (Array.isArray(o.deductions)) o.deductions = JSON.stringify(o.deductions);
  return o;
}

function cvDeserialize(r) { return r ? { ...r, memberPresent: JSON.parse(r.memberPresent || '[]') } : null; }
function cvSerialize(d)   { const o={...d}; if(Array.isArray(o.memberPresent)) o.memberPresent=JSON.stringify(o.memberPresent); return o; }

function cpDeserialize(r) { return r ? { ...r, participants: JSON.parse(r.participants || '[]') } : null; }
function cpSerialize(d)   { const o={...d}; if(Array.isArray(o.participants)) o.participants=JSON.stringify(o.participants); return o; }

function nfDeserialize(r) {
  if (!r) return null;
  return {
    ...r,
    suppressionApparatus:  JSON.parse(r.suppressionApparatus  || '[]'),
    suppressionPersonnel:  JSON.parse(r.suppressionPersonnel  || '[]'),
    emsApparatus:          JSON.parse(r.emsApparatus          || '[]'),
    emsPersonnel:          JSON.parse(r.emsPersonnel          || '[]'),
    otherApparatus:        JSON.parse(r.otherApparatus        || '[]'),
    otherPersonnel:        JSON.parse(r.otherPersonnel        || '[]'),
    isStructureFire:       Boolean(r.isStructureFire),
  };
}

function nfSerialize(d) {
  const o = { ...d };
  if (Array.isArray(o.suppressionApparatus))  o.suppressionApparatus  = JSON.stringify(o.suppressionApparatus);
  if (Array.isArray(o.suppressionPersonnel))  o.suppressionPersonnel  = JSON.stringify(o.suppressionPersonnel);
  if (Array.isArray(o.emsApparatus))          o.emsApparatus          = JSON.stringify(o.emsApparatus);
  if (Array.isArray(o.emsPersonnel))          o.emsPersonnel          = JSON.stringify(o.emsPersonnel);
  if (Array.isArray(o.otherApparatus))        o.otherApparatus        = JSON.stringify(o.otherApparatus);
  if (Array.isArray(o.otherPersonnel))        o.otherPersonnel        = JSON.stringify(o.otherPersonnel);
  if (typeof o.isStructureFire === 'boolean') o.isStructureFire = o.isStructureFire;
  return o;
}

// ── ASYNC CRUD FUNCTIONS ─────────────────────────────────────────────────────

// Members
// ── Phase 3 (MIGRATE): access is keyed on department_id, not station_id. ──
// The of_sync_department_id trigger (migration 0005) keeps department_id =
// station_id on every write, so these reads are safe for rows inserted by ANY
// path. Callers pass req.user.department_id (or, during transition,
// req.user.stationId — equal values). station_id stays written as the house
// tag. Param named departmentId to make the access key explicit.
async function all(departmentId) {
  const r = await pool.query('SELECT * FROM members WHERE department_id = $1 ORDER BY name ASC', [departmentId]);
  return r.rows.map(deserialize);
}

async function findById(id, departmentId) {
  const r = await pool.query('SELECT * FROM members WHERE id = $1 AND department_id = $2', [id, departmentId]);
  return deserialize(r.rows[0] || null);
}

async function findByMemberNumber(memberNumber, departmentId) {
  const r = await pool.query('SELECT * FROM members WHERE "memberNumber" = $1 AND department_id = $2', [memberNumber, departmentId]);
  return deserialize(r.rows[0] || null);
}

// Resolve the member row backing a user account (the user→member link).
// Department-scoped; null when no member is linked (resolver then falls back).
async function memberByUserId(userId, departmentId) {
  if (userId == null) return null;
  const r = await pool.query('SELECT * FROM members WHERE user_id = $1 AND department_id = $2 LIMIT 1', [userId, departmentId]);
  return deserialize(r.rows[0] || null);
}

// IDs of members sharing a standing unit + group (a career officer's crew).
// Department-scoped. IS NOT DISTINCT FROM makes NULL group match NULL group.
// Returns member IDs (not names) so the alert feed filters by stable id, not by
// a fragile name match.
async function crewMemberIds(departmentId, unitId, group) {
  if (unitId == null) return [];
  const r = await pool.query(
    'SELECT id FROM members WHERE department_id = $1 AND assigned_unit_id = $2 AND assigned_group IS NOT DISTINCT FROM $3',
    [departmentId, unitId, group ?? null],
  );
  return r.rows.map((x) => x.id);
}

// IDs of members at a station/house (volunteer-officer oversight scope).
async function stationMemberIds(departmentId, stationId) {
  if (stationId == null) return [];
  const r = await pool.query(
    'SELECT id FROM members WHERE department_id = $1 AND station_id = $2',
    [departmentId, stationId],
  );
  return r.rows.map((x) => x.id);
}

async function create(data, departmentId) {
  const d = serialize(data);
  // Write both keys explicitly: station_id (house tag) AND department_id
  // (tenant). The trigger would mirror anyway, but being explicit keeps the
  // create path correct independent of the transitional trigger.
  const r = await pool.query(
    `INSERT INTO members ("memberNumber","name","rank","role","status","joined","dob","phone","email","station_email","personal_email","address","emergencyContactName","emergencyContactPhone","emergencyContactRelation","certifications","photo_url","hire_date","rank_date","seniority_number","employment_type","assigned_unit_id","assigned_group","station_id","department_id")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
    [d.memberNumber, d.name, d.rank, d.role, d.status||'Active', d.joined, d.dob||'', d.phone||'', d.email||'', d.station_email||'', d.personal_email||'', d.address||'', d.emergencyContactName||'', d.emergencyContactPhone||'', d.emergencyContactRelation||'', d.certifications||'[]', d.photo_url||'', d.hire_date||'', d.rank_date||'', d.seniority_number||0, d.employment_type||'volunteer', d.assigned_unit_id ?? null, d.assigned_group ?? null, departmentId, departmentId]
  );
  return deserialize(r.rows[0]);
}

async function update(id, data, departmentId) {

  const allowed = ['memberNumber','name','rank','role','status','joined','dob','phone','email','station_email','personal_email','address','emergencyContactName','emergencyContactPhone','emergencyContactRelation','certifications','photo_url','hire_date','rank_date','seniority_number','employment_type','assigned_unit_id','assigned_group'];

  const d = serialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return findById(id, departmentId);
  values.push(id, departmentId);
  const r = await pool.query(
    `UPDATE members SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return deserialize(r.rows[0]);
}

async function remove(id, departmentId) {
  await pool.query('DELETE FROM members WHERE id = $1 AND department_id = $2', [id, departmentId]);
}

// Apparatus
// ── Phase 3 (MIGRATE): apparatus ACCESS keyed on department_id. ──
// NOTE apparatus is the case where station_id is NOT merely transitional: it's
// the meaningful "which house this rig lives in" tag and survives into the
// target model. Access (the tenant boundary) is department_id; station_id is
// the house. During this single-station transition house == tenant, so create
// writes both from the same value; true house/tenant separation arrives with
// provisioning (Phase 4). designation is unique PER department now
// (idx_apparatus_dept_designation), so findByDesignation filters department_id.
async function appAll(departmentId) {
  const r = await pool.query('SELECT * FROM apparatus WHERE department_id = $1 ORDER BY designation ASC', [departmentId]);
  return r.rows;
}

async function appFindById(id, departmentId) {
  const r = await pool.query('SELECT * FROM apparatus WHERE id = $1 AND department_id = $2', [id, departmentId]);
  return r.rows[0] || null;
}

async function appFindByDesignation(designation, departmentId) {
  const r = await pool.query('SELECT * FROM apparatus WHERE designation = $1 AND department_id = $2', [designation, departmentId]);
  return r.rows[0] || null;
}

async function appCreate(data, departmentId) {
  // station_id = the rig's house, department_id = the owning tenant. Equal
  // during the single-station transition; provisioning will pass a distinct
  // house. data.station_id honored if a caller already supplies a house.
  const houseId = data.station_id ?? departmentId;
  const r = await pool.query(
    `INSERT INTO apparatus (designation,type,year,make,model,status,mileage,"lastService","nextServiceDue","assignedOperator",notes,station_id,department_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [data.designation, data.type, data.year, data.make||'', data.model||'', data.status||'In Service', data.mileage||0, data.lastService||'', data.nextServiceDue||'', data.assignedOperator||'', data.notes||'', houseId, departmentId]
  );
  return r.rows[0];
}

async function appUpdate(id, data, departmentId) {
  const allowed = ['designation','type','year','make','model','status','mileage','lastService','nextServiceDue','assignedOperator','notes','station_id'];
  const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
  if (!sets) return appFindById(id, departmentId);
  values.push(id, departmentId);
  const r = await pool.query(
    `UPDATE apparatus SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

async function appRemove(id, departmentId) {
  await pool.query('DELETE FROM apparatus WHERE id = $1 AND department_id = $2', [id, departmentId]);
}

// Incidents — soft-deleted rows (deleted_at set) are invisible to every read
// path; incRemove soft-deletes (Phase 2.2: incident reports are legal records,
// nothing hard-DELETEs them anymore).
// ── Phase 3 (MIGRATE): incidents access keyed on department_id. ──
// As with members: the of_sync_department_id trigger keeps department_id =
// station_id on every write, so these reads are safe regardless of which path
// (route, CAD pipeline, ng911 conversion, import) inserted the incident.
// Param named departmentId; create writes both keys; deleted_at filtering
// (legal-record soft-delete) is preserved exactly.
async function incAll(departmentId) {
  const r = await pool.query('SELECT * FROM incidents WHERE department_id = $1 AND deleted_at IS NULL ORDER BY date DESC, time DESC', [departmentId]);
  return r.rows.map(incDeserialize);
}

async function incFindById(id, departmentId) {
  const r = await pool.query('SELECT * FROM incidents WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [id, departmentId]);
  return incDeserialize(r.rows[0] || null);
}

async function incFindByNumber(incidentNumber, departmentId) {
  // Soft-deleted incidents do NOT block reuse of their incident number — a
  // mistakenly-deleted report can be recreated under the correct number.
  const r = await pool.query('SELECT * FROM incidents WHERE "incidentNumber" = $1 AND department_id = $2 AND deleted_at IS NULL', [incidentNumber, departmentId]);
  return incDeserialize(r.rows[0] || null);
}

async function incCreate(data, departmentId) {
  const d = incSerialize(data);
  const r = await pool.query(
    `INSERT INTO incidents ("incidentNumber",date,time,type,"alarmLevel",address,units,personnel,disposition,injuries,notes,photos,
                            neris_incident_types,neris_actions,neris_noaction,neris_fire_detail,neris_hazsit_detail,neris_medical_details,neris_aids,
                            neris_casualty_rescues,neris_dispatch_times,neris_fire_protection,
                            station_id,department_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
             $13::jsonb,$14::jsonb,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,
             $20::jsonb,$21::jsonb,$22::jsonb,
             $23,$24) RETURNING *`,
    [d.incidentNumber, d.date, d.time||'', d.type, d.alarmLevel||'Still', d.address||'', d.units||'[]', d.personnel||'[]', d.disposition||'', d.injuries||0, d.notes||'', d.photos||'[]',
     d.neris_incident_types ?? null, d.neris_actions ?? null, d.neris_noaction ?? null, d.neris_fire_detail ?? null, d.neris_hazsit_detail ?? null, d.neris_medical_details ?? null, d.neris_aids ?? null,
     d.neris_casualty_rescues ?? null, d.neris_dispatch_times ?? null, d.neris_fire_protection ?? null,
     departmentId, departmentId]
  );
  return incDeserialize(r.rows[0]);
}

async function incUpdate(id, data, departmentId) {
  const allowed = ['incidentNumber','date','time','type','alarmLevel','address','units','personnel','disposition','injuries','notes','photos',
                   // NERIS axis (0060 + 0061) — validated upstream by utils/nerisValidate.js.
                   // neris_status / neris_review are DELIBERATELY absent: route-owned
                   // (P2-D6) — they change ONLY via incNerisStatusTransition below.
                   'neris_incident_types','neris_actions','neris_noaction','neris_fire_detail','neris_hazsit_detail','neris_medical_details','neris_aids',
                   'neris_casualty_rescues','neris_dispatch_times','neris_fire_protection'];
  const d = incSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return incFindById(id, departmentId);
  values.push(id, departmentId);
  const r = await pool.query(
    `UPDATE incidents SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return incDeserialize(r.rows[0]);
}

// NERIS review-chain transition (P2-D6/F23) — the ONE writer of neris_status /
// neris_review. COMPARE-AND-SET: the UPDATE only lands when the row still holds
// the status the caller read (two reviewers racing → the loser gets 0 rows →
// the route answers 409 STALE_STATUS). Department-scoped + soft-delete-aware
// like every other incidents read/write.
async function incNerisStatusTransition(id, departmentId, expectedStatus, nextStatus, review) {
  const r = await pool.query(
    `UPDATE incidents SET neris_status = $1, neris_review = $2::jsonb, "updatedAt" = NOW()
     WHERE id = $3 AND department_id = $4 AND deleted_at IS NULL AND neris_status = $5
     RETURNING *`,
    [nextStatus, JSON.stringify(review || {}), id, departmentId, expectedStatus]
  );
  return incDeserialize(r.rows[0] || null);
}

async function incRemove(id, departmentId) {
  // Soft-delete: legal record retention (Phase 2.2). The row stays; every
  // read path filters deleted_at IS NULL. Audit entry written by the route.
  await pool.query('UPDATE incidents SET deleted_at = NOW() WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [id, departmentId]);
}

// ── NERIS Track B (0064): the SERVER-OWNED submission-axis writer ────────────
// The ONE write path for the submission fields — routes never accept these from
// clients (they are absent from every whitelist). `logEntry` is appended to the
// bounded submission history (last 20 kept — enough forensics, no unbounded row).
async function incNerisSubmissionUpdate(id, departmentId, patch, logEntry) {
  const allowed = ['neris_incident_uid', 'neris_submission_state', 'neris_incident_status',
                   'neris_submitted_at', 'neris_status_checked_at'];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const k of allowed) {
    if (patch[k] !== undefined) { sets.push(`${k} = $${i++}`); vals.push(patch[k]); }
  }
  if (logEntry) {
    // Keep the NEWEST 20, in CHRONOLOGICAL order: inner picks by ord DESC,
    // outer re-aggregates ORDER BY ord ASC. (The first version aggregated in
    // DESC pick-order and SCRAMBLED the array — caught by the Track B live
    // proofs when .at(-1) surfaced a middle entry.)
    sets.push(`neris_submission_log = (
      SELECT COALESCE(jsonb_agg(e ORDER BY ord), '[]'::jsonb) FROM (
        SELECT e, ord FROM jsonb_array_elements(COALESCE(neris_submission_log, '[]'::jsonb) || $${i}::jsonb) WITH ORDINALITY AS t(e, ord)
        ORDER BY ord DESC LIMIT 20
      ) sub
    )`);
    vals.push(JSON.stringify([logEntry]));
    i += 1;
  }
  if (!sets.length) return null;
  vals.push(id, departmentId);
  const r = await pool.query(
    `UPDATE incidents SET ${sets.join(', ')} WHERE id = $${i} AND department_id = $${i + 1} RETURNING *`,
    vals
  );
  return incDeserialize(r.rows[0] || null);
}

// Sweep read path (cron, owner-side): retryables + stale non-terminal statuses.
// Explicit column list, ids + submission fields only — the cron never needs the
// narrative or any PII-adjacent content for its decision-making.
async function incNerisSweepCandidates(limit = 25, staleMinutes = 55) {
  const r = await pool.query(
    `SELECT i.id, i.department_id, i.neris_incident_uid, i.neris_submission_state,
            i.neris_incident_status, i.neris_status_checked_at, i.neris_status
     FROM incidents i
     JOIN departments d ON d.id = i.department_id
     WHERE i.deleted_at IS NULL
       AND d.neris_submission_enabled = TRUE
       AND COALESCE(d.neris_id, '') <> ''
       AND (
         (i.neris_submission_state IN ('submit_failed','update_pending') AND i.neris_status = 'approved')
         OR (i.neris_incident_uid IS NOT NULL
             AND i.neris_incident_status IN ('SUBMITTED','PENDING_APPROVAL','PENDING_INCIDENT_DATA')
             AND (i.neris_status_checked_at IS NULL OR i.neris_status_checked_at < NOW() - ($2 || ' minutes')::interval))
       )
     ORDER BY i."updatedAt" ASC
     LIMIT $1`,
    [limit, String(staleMinutes)]
  );
  return r.rows;
}

// Training
async function trAll(stationId) {
  const r = await pool.query('SELECT * FROM training WHERE department_id = $1 ORDER BY "completedDate" DESC, id DESC', [stationId]);
  return r.rows;
}

async function trFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM training WHERE id = $1 AND department_id = $2', [id, stationId]);
  return r.rows[0] || null;
}

async function trCreate(data, stationId) {
  const r = await pool.query(
    `INSERT INTO training ("memberId","memberName","courseName",type,status,"completedDate","expiresDate",hours,instructor,location,notes,delivery_method,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [data.memberId||0, data.memberName||'', data.courseName, data.type, data.status||'Passed', data.completedDate||null, data.expiresDate||null, data.hours||0, data.instructor||'', data.location||'', data.notes||'', data.delivery_method||'Classroom', stationId]
  );
  return r.rows[0];
}

async function trUpdate(id, data, stationId) {
  const allowed = ['memberId','memberName','courseName','type','status','completedDate','expiresDate','hours','instructor','location','notes','delivery_method'];
  const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
  if (!sets) return trFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE training SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

async function trRemove(id, stationId) {
  await pool.query('DELETE FROM training WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Maintenance helpers RETIRED in Phase 2.2 (0083): the module was rebuilt as
// routes/workOrders.js + routes/defects.js on the work_orders model. The legacy
// maintenance table remains (additive discipline; its rows were migrated) but has
// no code readers; the old mnt* helpers carried the PATCH-zeroes-apparatusId bug
// and REAL-typed money and are gone.

// Shifts
// 1.1b roster canonicalization: shifts.memberIds (ids) is the AUTHORITATIVE
// roster; shift.crew (names) is DERIVED from it on read, so a member rename
// propagates everywhere and the old name-string fragility is dead. Every
// consumer that reads shift.crew (client scheduleRules, feeds, staffing) now
// receives id-backed names without changing its own logic. Legacy rows with no
// memberIds keep their stored crew names (pre-launch test data; not id-backed).
async function resolveShiftRosters(shifts, deptId) {
  const ids = new Set();
  for (const s of shifts) for (const id of (s.memberIds || [])) ids.add(id);
  if (ids.size === 0) {
    for (const s of shifts) if (s.roster === undefined) s.roster = [];
    return shifts;
  }
  const mr = await pool.query(
    'SELECT id, name, rank FROM members WHERE department_id = $1 AND id = ANY($2)',
    [deptId, [...ids]]);
  const byId = new Map(mr.rows.map((m) => [m.id, m]));
  for (const s of shifts) {
    if (Array.isArray(s.memberIds) && s.memberIds.length) {
      const roster = s.memberIds.map((id) => byId.get(id)).filter(Boolean)
        .map((m) => ({ id: m.id, name: m.name, rank: m.rank }));
      s.roster = roster;                    // structured, id-backed
      s.crew = roster.map((m) => m.name);   // derived display names (rename-proof)
    } else {
      s.roster = [];                        // legacy: stored crew names, no ids
    }
  }
  return shifts;
}

// Resolve member ids -> display names (in id order), dept-scoped. Used to keep
// the derived crew-names SNAPSHOT on shifts.crew in step with the authoritative
// memberIds at write time (so raw `SELECT crew` readers still see names).
async function resolveMemberNames(deptId, ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const r = await pool.query(
    'SELECT id, name FROM members WHERE department_id = $1 AND id = ANY($2)', [deptId, ids]);
  const byId = new Map(r.rows.map((m) => [m.id, m.name]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function shiftAll(stationId) {
  const r = await pool.query('SELECT * FROM shifts WHERE department_id = $1 ORDER BY date ASC, "shiftType" ASC', [stationId]);
  return resolveShiftRosters(r.rows.map(shiftDeserialize), stationId);
}

async function shiftFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM shifts WHERE id = $1 AND department_id = $2', [id, stationId]);
  if (!r.rows[0]) return null;
  const [resolved] = await resolveShiftRosters([shiftDeserialize(r.rows[0])], stationId);
  return resolved;
}

async function shiftCreate(data, stationId) {
  // 1.1b: memberIds (ids) is authoritative — derive the crew names snapshot from
  // it so shifts.crew stays a faithful (rename-refreshed-on-write) mirror.
  if (Array.isArray(data.memberIds) && data.memberIds.length) {
    data = { ...data, crew: await resolveMemberNames(stationId, data.memberIds) };
  }
  const d = shiftSerialize(data);
  const r = await pool.query(
    // 0068/1.1b: write department_id EXPLICITLY (the tenant key) rather than
    // leaning on the of_sync_department_id BEFORE-INSERT trigger to derive it
    // from station_id. The trigger IS present on prod + local (verified
    // 2026-07-22) and only fills a NULL, so an explicit value is never clobbered
    // — this just stops the calendar core depending on a trigger at all, which
    // is the CLAUDE.md doctrine (the sync trigger is the cross-tenant corruption
    // path; importRunList + apparatusAssignments already write it explicitly).
    `INSERT INTO shifts (date,"shiftType",crew,"memberIds","patternId","isOverride",notes,station_id,department_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [d.date, d.shiftType, d.crew||'[]', d.memberIds||'[]', d.patternId||null, d.isOverride||false, d.notes||'', stationId, stationId]
  );
  return shiftDeserialize(r.rows[0]);
}

async function shiftUpdate(id, data, stationId) {
  // 1.1b: if the update changes memberIds, re-derive the crew names snapshot.
  if (Array.isArray(data.memberIds)) {
    data = { ...data, crew: await resolveMemberNames(stationId, data.memberIds) };
  }
  const allowed = ['date','shiftType','crew','memberIds','patternId','isOverride','notes'];
  const d = shiftSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return shiftFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE shifts SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return shiftDeserialize(r.rows[0]);
}

async function shiftRemove(id, stationId) {
  await pool.query('DELETE FROM shifts WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Shift Patterns
async function spAll(stationId) {
  const r = await pool.query('SELECT * FROM shift_patterns WHERE department_id = $1 ORDER BY "startDate" ASC', [stationId]);
  return r.rows.map(spDeserialize);
}

async function spFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM shift_patterns WHERE id = $1 AND department_id = $2', [id, stationId]);
  return spDeserialize(r.rows[0] || null);
}

async function spCreate(data, stationId) {
  const d = spSerialize(data);
  const r = await pool.query(
    `INSERT INTO shift_patterns (name,"shiftType","startDate","endDate","repeatRule","repeatDays","memberIds","minCrew","isActive",notes,platoon,cycle_type,cycle_on,cycle_off,kelly_day_interval,anchor_date,preset_key,cycle_pattern,station_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [d.name, d.shiftType, d.startDate, d.endDate||null, d.repeatRule||'weekly', d.repeatDays||'[]', d.memberIds||'[]', d.minCrew||3, d.isActive!==false, d.notes||'', d.platoon||'', d.cycle_type||'', d.cycle_on||0, d.cycle_off||0, d.kelly_day_interval||0, d.anchor_date||'', d.preset_key||'', d.cycle_pattern||'[]', stationId]
  );
  return spDeserialize(r.rows[0]);
}

async function spUpdate(id, data, stationId) {
  const allowed = ['name','shiftType','startDate','endDate','repeatRule','repeatDays','memberIds','minCrew','isActive','notes','platoon','cycle_type','cycle_on','cycle_off','kelly_day_interval','anchor_date','preset_key','cycle_pattern'];
  const d = spSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return spFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE shift_patterns SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return spDeserialize(r.rows[0]);
}

async function spRemove(id, stationId) {
  await pool.query('DELETE FROM shift_patterns WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Leave Requests
async function lrAll(stationId) {
  const r = await pool.query('SELECT * FROM leave_requests WHERE department_id = $1 ORDER BY "startDate" DESC', [stationId]);
  return r.rows.map(lrDeserialize);
}

async function lrFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM leave_requests WHERE id = $1 AND department_id = $2', [id, stationId]);
  return lrDeserialize(r.rows[0] || null);
}

async function lrCreate(data, stationId) {
  const d = data;
  const r = await pool.query(
    `INSERT INTO leave_requests ("memberId","memberName",type,"startDate","endDate",status,"approvedBy","approvedAt",reason,notes,leave_type_id,hours,station_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [d.memberId, d.memberName, d.type||'PTO', d.startDate, d.endDate, d.status||'Pending', d.approvedBy||null, d.approvedAt||null, d.reason||'', d.notes||'', d.leave_type_id ?? null, d.hours ?? null, stationId]
  );
  return lrDeserialize(r.rows[0]);
}

async function lrUpdate(id, data, stationId) {
  const allowed = ['type','startDate','endDate','status','approvedBy','approvedAt','reason','notes','leave_type_id','hours'];
  const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
  if (!sets) return lrFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE leave_requests SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return lrDeserialize(r.rows[0]);
}

async function lrRemove(id, stationId) {
  await pool.query('DELETE FROM leave_requests WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Shift Swaps
async function ssAll(stationId) {
  const r = await pool.query('SELECT * FROM shift_swaps WHERE department_id = $1 ORDER BY "createdAt" DESC', [stationId]);
  return r.rows.map(ssDeserialize);
}

async function ssAllForShift(shiftId, stationId) {
  const r = await pool.query('SELECT * FROM shift_swaps WHERE "shiftId" = $1 AND department_id = $2 ORDER BY "createdAt" DESC', [shiftId, stationId]);
  return r.rows.map(ssDeserialize);
}

async function ssFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM shift_swaps WHERE id = $1 AND department_id = $2', [id, stationId]);
  return ssDeserialize(r.rows[0] || null);
}

async function ssCreate(data, stationId) {
  const d = data;
  const r = await pool.query(
    `INSERT INTO shift_swaps ("shiftId","requesterId","requesterName","coveredById","coveredByName",status,reason,notes,station_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [d.shiftId, d.requesterId, d.requesterName, d.coveredById||null, d.coveredByName||null, d.status||'Open', d.reason||'', d.notes||'', stationId]
  );
  return ssDeserialize(r.rows[0]);
}

async function ssUpdate(id, data, stationId) {
  const allowed = ['coveredById','coveredByName','status','notes'];
  const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
  if (!sets) return ssFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE shift_swaps SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return ssDeserialize(r.rows[0]);
}

async function ssRemove(id, stationId) {
  await pool.query('DELETE FROM shift_swaps WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Coverage Outreach
async function outreachAll(stationId) {
  const r = await pool.query('SELECT * FROM coverage_outreach WHERE department_id = $1 ORDER BY "createdAt" DESC', [stationId]);
  return r.rows.map(row => row);
}

async function outreachAllForLeave(leaveRequestId, stationId) {
  const r = await pool.query('SELECT * FROM coverage_outreach WHERE "leaveRequestId" = $1 AND department_id = $2 ORDER BY "createdAt" DESC', [leaveRequestId, stationId]);
  return r.rows.map(row => row);
}

async function outreachAllForShift(shiftId, stationId) {
  const r = await pool.query('SELECT * FROM coverage_outreach WHERE "shiftId" = $1 AND department_id = $2 ORDER BY "createdAt" DESC', [shiftId, stationId]);
  return r.rows.map(row => row);
}

async function outreachFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM coverage_outreach WHERE id = $1 AND department_id = $2', [id, stationId]);
  return r.rows[0] || null;
}

async function outreachCreate(data, stationId) {
  const d = data;
  const r = await pool.query(
    `INSERT INTO coverage_outreach ("leaveRequestId","shiftId","memberId","memberName","contactMethod","status","sentAt","respondedAt","response","notes",station_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [d.leaveRequestId, d.shiftId, d.memberId, d.memberName, d.contactMethod||'sms', d.status||'Pending', d.sentAt||null, d.respondedAt||null, d.response||'', d.notes||'', stationId]
  );
  return r.rows[0];
}

async function outreachUpdate(id, data, stationId) {
  const allowed = ['contactMethod','status','sentAt','respondedAt','response','notes'];
  const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
  if (!sets) return outreachFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE coverage_outreach SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

async function outreachRemove(id, stationId) {
  await pool.query('DELETE FROM coverage_outreach WHERE id = $1 AND department_id = $2', [id, stationId]);
}

/**
 * Expand shift patterns into individual shift records for a date range.
 * This generates shifts from recurring patterns, skipping dates where
 * manual overrides already exist.
 */
async function expandPatterns(stationId, startDate, endDate) {
  // 1.1a (2026-07-22): all date math here runs on YYYY-MM-DD STRING primitives
  // (utils/localDate — the Prevention core's proven lib). The old Date-object
  // version formatted via toISOString(), which shifts a local-midnight Date to
  // the PREVIOUS day in any timezone behind UTC — every generated shift was
  // off-by-one. Doctrine: a shift belongs to its START date (Matt, 2026-07-22).
  const { addDaysISO, coerceIsoDay } = require('./utils/localDate');
  const { isOnDutyForDate } = require('./utils/shiftPatternEngine');
  const patterns = await spAll(stationId);
  const activePatterns = patterns.filter(p => p.isActive);

  // Get existing shifts in range to avoid duplicates
  const existingRes = await pool.query(
    `SELECT * FROM shifts WHERE department_id = $1 AND date >= $2 AND date <= $3`,
    [stationId, startDate, endDate]
  );
  const existingShifts = existingRes.rows.map(shiftDeserialize);

  // Get approved leave in range
  const leaveRes = await pool.query(
    `SELECT * FROM leave_requests WHERE department_id = $1 AND status = 'Approved' AND "startDate" <= $3 AND "endDate" >= $2`,
    [stationId, startDate, endDate]
  );
  const approvedLeave = leaveRes.rows;

  const generated = [];

  for (const pattern of activePatterns) {
    // Determine which dates this pattern applies to
    const patStart = pattern.startDate > startDate ? pattern.startDate : startDate;
    const patEnd = pattern.endDate && pattern.endDate < endDate ? pattern.endDate : endDate;

    let current = coerceIsoDay(patStart);
    const end = coerceIsoDay(patEnd);
    if (!current || !end) continue; // malformed pattern dates generate nothing (parity with old Invalid-Date behavior)

    while (current <= end) { // ISO date strings compare correctly as strings
      const dateStr = current;
      // 1.1b: ONE source of truth for the cycle math (utils/shiftPatternEngine).
      // The generalized cycle_pattern (2-2-3/Pitman/DuPont/custom) wins when
      // present; otherwise the simple cycle_on/cycle_off (+ Kelly) and the
      // calendar rules run exactly as before. Day boundary = the shift's START
      // date (coerced ISO string — never a Date object).
      const shouldGenerate = isOnDutyForDate(pattern, current);

      if (shouldGenerate) {
        // Check if manual override exists for this date+shiftType
        const hasOverride = existingShifts.some(
          s => s.date === dateStr && s.shiftType === pattern.shiftType && s.isOverride
        );

        if (!hasOverride) {
          // Check if pattern-generated shift already exists
          const alreadyGenerated = existingShifts.some(
            s => s.date === dateStr && s.shiftType === pattern.shiftType && s.patternId === pattern.id
          );

          if (!alreadyGenerated) {
            // Filter out members on approved leave
            const availableMembers = pattern.memberIds.filter(mid => {
              return !approvedLeave.some(l =>
                l.memberId === mid && l.startDate <= dateStr && l.endDate >= dateStr
              );
            });

            generated.push({
              date: dateStr,
              shiftType: pattern.shiftType,
              memberIds: availableMembers,
              crew: [], // Will be resolved to names by the caller
              patternId: pattern.id,
              isOverride: false,
              notes: '',
            });
          }
        }
      }

      current = addDaysISO(current, 1);
    }
  }

  return generated;
}

// Station Log
async function slAll(stationId) {
  const r = await pool.query('SELECT * FROM station_log WHERE department_id = $1 ORDER BY date DESC', [stationId]);
  return r.rows.map(slDeserialize);
}

async function slFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM station_log WHERE id = $1 AND department_id = $2', [id, stationId]);
  return slDeserialize(r.rows[0] || null);
}

async function slCreate(data, stationId) {
  const d = slSerialize(data);
  const r = await pool.query(
    `INSERT INTO station_log (date,shift,"officerOnDuty","membersOnDuty","weatherConditions","callCount","apparatusChecked","stationChecked",events,visitors,notes,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [d.date, d.shift||'Day', d.officerOnDuty||'', d.membersOnDuty||'[]', d.weatherConditions||'', d.callCount||0, d.apparatusChecked||false, d.stationChecked||false, d.events||'[]', d.visitors||'', d.notes||'', stationId]
  );
  return slDeserialize(r.rows[0]);
}

async function slUpdate(id, data, stationId) {
  const allowed = ['date','shift','officerOnDuty','membersOnDuty','weatherConditions','callCount','apparatusChecked','stationChecked','events','visitors','notes'];
  const d = slSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return slFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE station_log SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return slDeserialize(r.rows[0]);
}

async function slRemove(id, stationId) {
  await pool.query('DELETE FROM station_log WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Fire Inspection Properties
// P0.2 (2026-07-12): fi_* records are legal records — soft-delete doctrine (same as
// incidents/exposure_records). Every read filters deleted_at IS NULL; remove() flips
// the flag. Migration 0045 adds the column on existing DBs; CREATE TABLE has it fresh.
async function fiPropAll(stationId) {
  const r = await pool.query('SELECT * FROM fi_properties WHERE department_id = $1 AND deleted_at IS NULL ORDER BY name ASC', [stationId]);
  return r.rows.map(fiPropDeserialize);
}

async function fiPropFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM fi_properties WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [id, stationId]);
  return fiPropDeserialize(r.rows[0] || null);
}

async function fiPropCreate(data, stationId) {
  const d = fiPropSerialize(data);
  const allowed = ['name','address','occupancyType','propertyUseCode','ownerName','ownerPhone','ownerEmail','contactName','contactPhone','squareFootage','stories','occupantLoad','sprinklered','alarmMonitored','hazmatOnsite','notes','station_id'];
  const keys = allowed.filter(k => k === 'station_id' || d[k] !== undefined);
  const cols = keys.map(k => `"${k}"`).join(',');
  const placeholders = keys.map((_, i) => `$${i+1}`).join(',');
  const vals = keys.map(k => k === 'station_id' ? stationId : d[k]);
  const r = await pool.query(
    `INSERT INTO fi_properties (${cols}) VALUES (${placeholders}) RETURNING *`,
    vals
  );
  return fiPropDeserialize(r.rows[0]);
}

async function fiPropUpdate(id, data, stationId) {
  const allowed = ['name','address','occupancyType','propertyUseCode','ownerName','ownerPhone','ownerEmail','contactName','contactPhone','squareFootage','stories','occupantLoad','sprinklered','alarmMonitored','hazmatOnsite','notes'];
  const d = fiPropSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return fiPropFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE fi_properties SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return fiPropDeserialize(r.rows[0]);
}

async function fiPropRemove(id, stationId) {
  await pool.query('UPDATE fi_properties SET deleted_at = NOW() WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [id, stationId]);
}

// Fire Inspections
async function fiInsAll(stationId) {
  const r = await pool.query('SELECT * FROM fi_inspections WHERE department_id = $1 AND deleted_at IS NULL ORDER BY "scheduledDate" DESC', [stationId]);
  return r.rows.map(fiInsDeserialize);
}

async function fiInsFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM fi_inspections WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [id, stationId]);
  return fiInsDeserialize(r.rows[0] || null);
}

async function fiInsCreate(data, stationId) {
  const d = fiInsSerialize(data);
  const r = await pool.query(
    `INSERT INTO fi_inspections ("propertyId",type,"inspectorName","scheduledDate","completedDate",result,result_code,violations,"followUpDate",notes,assigned_to_user_id,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [d.propertyId, d.type||'Annual Inspection', d.inspectorName||'', d.scheduledDate||null, d.completedDate||null, d.result||null, d.result_code ?? null, d.violations||'[]', d.followUpDate||null, d.notes||'', d.assigned_to_user_id ?? null, stationId]
  );
  return fiInsDeserialize(r.rows[0]);
}

async function fiInsUpdate(id, data, stationId) {
  // ⚠️ `completedDate`, `result`, and `result_code` remain writable HERE because the
  // COMPLETION ENGINE (routes/fiWorkflow.completeInspection) is the one legitimate writer
  // of them — it stamps them after check-then-write. The ROUTES are what refuse them from
  // a plain PATCH (fiInspections.js + fiSync.js), so there is exactly ONE door to a
  // completed record. Do NOT add a new caller of fiInsUpdate that sets these three
  // without going through the engine. (2026-07-14 — this whitelist is what the PATCH back
  // door walked through.)
  const allowed = ['propertyId','type','inspectorName','scheduledDate','completedDate','result','result_code','violations','followUpDate','notes','assigned_to_user_id'];
  const d = fiInsSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return fiInsFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE fi_inspections SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return fiInsDeserialize(r.rows[0]);
}

async function fiInsRemove(id, stationId) {
  await pool.query('UPDATE fi_inspections SET deleted_at = NOW() WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [id, stationId]);
}

// Fire Permits
async function fiPermAll(stationId) {
  const r = await pool.query('SELECT * FROM fi_permits WHERE department_id = $1 AND deleted_at IS NULL ORDER BY "issuedDate" DESC', [stationId]);
  return r.rows;
}

async function fiPermFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM fi_permits WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [id, stationId]);
  return r.rows[0] || null;
}

async function fiPermCreate(data, stationId) {
  // status default is DEFAULT_PERMIT_STATUS ('Pending'), NOT 'Active'. Module 3.0
  // found two disagreeing defaults for one column — the route sent 'Pending' while
  // this layer fell back to 'Active', so the answer depended on which caller you
  // came through. The vocabulary is server-owned in constants/permitStatus.js.
  const r = await pool.query(
    `INSERT INTO fi_permits ("propertyId",type,"permitNumber","issuedDate","expiresDate",status,"issuedBy",fee,conditions,notes,issued_by_user_id,station_id,permit_type_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [data.propertyId, data.type, data.permitNumber||'', data.issuedDate||null, data.expiresDate||null, data.status||DEFAULT_PERMIT_STATUS, data.issuedBy||'', data.fee ?? null, data.conditions||'', data.notes||'', data.issued_by_user_id ?? null, stationId, data.permit_type_id ?? null]
  );
  return r.rows[0];
}

async function fiPermUpdate(id, data, stationId) {
  // issued_by_user_id is intentionally NOT patchable: who issued a permit is a fact
  // about an event, not an editable attribute. It is set once, at create.
  //
  // 3.1a — `status` and `issuedDate` LEFT THIS LIST DELIBERATELY.
  // Issuing a permit mints a legal instrument, and terminal acts (revoke, terminate)
  // withdraw one. Those go through the engine below, which is the SOLE writer. The route
  // refuses these fields with 409 ISSUANCE_VIA_ENGINE, and this list is the second fence:
  // a guard that exists on one writer and not another is not a guard (proven live
  // 2026-07-14, when the same record answered 422 on /complete and 200 OK on PATCH).
  // Anything reaching here with a status in the payload silently drops it rather than
  // writing it — and the route's refusal means nothing legitimate ever does.
  const allowed = ['propertyId','type','permitNumber','expiresDate','issuedBy','fee','conditions','notes'];
  const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
  if (!sets) return fiPermFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE fi_permits SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

// ── 3.1a lifecycle writers — the ONLY paths that move a permit's status ──────────────
// Each is a single guarded UPDATE with the precondition in the WHERE clause, so the
// transition is atomic and a concurrent caller cannot double-apply it. A zero-row result
// means the precondition was false, and the caller must treat that as a refusal — NOT
// retry it, and NOT report success. The pool is max:1, so nothing here may open a second
// connection (lesson #12).

/** Pending → Active. The sole writer of an issuance. */
/**
 * Pending → Active, and the ONE moment the R7 term snapshot is written.
 *
 * 🔴 THE SNAPSHOT IS WRITTEN HERE OR NOWHERE. 0094 added the columns and 0094's write-once
 * trigger makes them immutable the instant they hold a value — so if issuance does not write
 * them, they stay NULL forever and the permit can never enter the expiry ladder. That was
 * the state until now: the ladder, the job and the monitor were all live and correct, and
 * every permit was skipped for want of terms. Correct machinery with nothing flowing
 * through it is the same species of trap as a green build over a dead page.
 *
 * `snapshot` is null for a permit with no catalogue type (the legacy path, and the four
 * permits already on prod). Those keep working exactly as before and the job leaves them
 * alone rather than inventing terms for a legal record.
 */
async function fiPermIssue(id, { issuedDate, issuedByUserId, issuedByName, snapshot }, stationId) {
  const s = snapshot || {};
  const r = await pool.query(
    `UPDATE fi_permits
        SET status = 'Active',
            "issuedDate" = $1,
            issued_by_user_id = $2,
            "issuedBy" = CASE WHEN COALESCE(btrim("issuedBy"), '') = '' THEN $3 ELSE "issuedBy" END,
            -- COALESCE($n, existing): when there is no catalogue type every one of these is
            -- a no-op, so the legacy issuance path is byte-for-byte unchanged.
            "expiresDate"      = COALESCE($6, "expiresDate"),
            expiration_rule_id = COALESCE($7, expiration_rule_id),
            term_value         = COALESCE($8, term_value),
            term_unit          = COALESCE($9, term_unit),
            notice_window_days = COALESCE($10, notice_window_days),
            grace_days         = COALESCE($11, grace_days),
            "updatedAt" = NOW()
      WHERE id = $4 AND department_id = $5 AND deleted_at IS NULL
        AND status = 'Pending'
      RETURNING *`,
    [issuedDate, issuedByUserId ?? null, issuedByName ?? '', id, stationId,
     s.expiresDate ?? null, s.expiration_rule_id ?? null, s.term_value ?? null,
     s.term_unit ?? null, s.notice_window_days ?? null, s.grace_days ?? null]
  );
  return r.rows[0] || null;
}

/** Active → Revoked, on an enumerated ground with a written basis. Terminal. */
async function fiPermRevoke(id, { ground, citation, basis }, stationId) {
  const r = await pool.query(
    `UPDATE fi_permits
        SET status = 'Revoked',
            revoked_at = NOW(),
            revocation_ground = $1,
            revocation_ground_citation = NULLIF(btrim(COALESCE($2, '')), ''),
            revocation_basis = $3,
            "updatedAt" = NOW()
      WHERE id = $4 AND department_id = $5 AND deleted_at IS NULL
        AND status = ANY($6)
      RETURNING *`,
    [ground, citation ?? null, basis, id, stationId, REVOCABLE_PERMIT_STATUSES]
  );
  return r.rows[0] || null;
}

/**
 * Revocable/terminable → TerminatedByTransfer, linked to the successor it minted. Terminal.
 *
 * 🔴 FIXED 2026-08-01 — this guard and fiPermRevoke's both read `status = 'Active'` while
 * their ROUTES admitted the full sets. Migration 0094 added AboutToExpire and Delinquent to
 * revocable+terminable; the guards were never updated, so for a permit in either of those
 * states the route passed its gate and the write then matched ZERO rows:
 *   · revoke  → a flat 409. An IFC §105.4 revocation was simply impossible on an
 *               about-to-expire or delinquent permit.
 *   · terminate → worse. The successor is minted BEFORE this update, so the caller got a
 *               409 and an ORPHANED permit was left behind holding a consumed permit number.
 * Dormant until now only because the expiry job has never run on prod, so neither status has
 * ever existed there. Renewal (3.1b) is offered on exactly those two statuses, which is what
 * surfaced it. This is the "status decisions read SETS, never string literals" fence that
 * constants/permitStatus.js already documents — the DB layer was outside it.
 */
async function fiPermTerminate(id, { successorId }, stationId) {
  const r = await pool.query(
    `UPDATE fi_permits
        SET status = 'TerminatedByTransfer',
            terminated_at = NOW(),
            superseded_by_permit_id = $1,
            "updatedAt" = NOW()
      WHERE id = $2 AND department_id = $3 AND deleted_at IS NULL
        AND status = ANY($4)
      RETURNING *`,
    [successorId, id, stationId, TERMINABLE_PERMIT_STATUSES]
  );
  return r.rows[0] || null;
}

/**
 * Link a parent permit to the RENEWAL child it just minted (3.1b, spec §3.4).
 *
 * Reuses `superseded_by_permit_id` — the same column terminate-and-reissue uses — because the
 * spec is explicit that renewal must not invent a second linkage. The two are told apart by
 * the PARENT's own fields, not by a new column: a terminated parent is `TerminatedByTransfer`
 * with `terminated_at` set, whereas a renewed parent keeps its renewable status and a NULL
 * `terminated_at` and simply runs its term out. Nothing about the parent's lifecycle changes
 * when it is renewed — a renewal is a successor instrument, not an ending.
 *
 * Both preconditions live IN THE WHERE CLAUSE so the write itself is the guard:
 *   · `status = ANY(RENEWABLE)` — withdrawn at Expired, per the documented market behaviour.
 *   · `superseded_by_permit_id IS NULL` — ONE renewal in flight per parent. A concurrent
 *     second attempt matches zero rows and the caller answers 409 instead of minting a
 *     second child. A check done in JS before the write would lose that race.
 */
async function fiPermRenewLink(id, { renewalId }, stationId) {
  const r = await pool.query(
    `UPDATE fi_permits
        SET superseded_by_permit_id = $1,
            "updatedAt" = NOW()
      WHERE id = $2 AND department_id = $3 AND deleted_at IS NULL
        AND status = ANY($4)
        AND superseded_by_permit_id IS NULL
      RETURNING *`,
    [renewalId, id, stationId, RENEWABLE_PERMIT_STATUSES]
  );
  return r.rows[0] || null;
}

async function fiPermRemove(id, stationId) {
  await pool.query('UPDATE fi_permits SET deleted_at = NOW() WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [id, stationId]);
}

// Hydrants
async function hydAll(stationId) {
  const r = await pool.query('SELECT * FROM hydrants WHERE department_id = $1 ORDER BY "hydrantNumber" ASC', [stationId]);
  return r.rows;
}

async function hydFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM hydrants WHERE id = $1 AND department_id = $2', [id, stationId]);
  return r.rows[0] || null;
}

async function hydFindByNum(n, stationId) {
  const r = await pool.query('SELECT * FROM hydrants WHERE "hydrantNumber" = $1 AND department_id = $2', [n, stationId]);
  return r.rows[0] || null;
}

async function hydCreate(data, stationId) {
  const allowed = ['hydrantNumber','streetAddress','intersection','city','state','zip','type','manufacturer','model','yearInstalled','mainSize','outletSize','numOutlets','status','staticPressure','residualPressure','flowRate','lastTestDate','nextTestDue','testedBy','lastInspectionDate','ownedBy','notes','lat','lng','station_id'];
  const keys = allowed.filter(k => k === 'station_id' || data[k] !== undefined);
  const cols = keys.map(k => `"${k}"`).join(',');
  const placeholders = keys.map((_, i) => `$${i+1}`).join(',');
  const vals = keys.map(k => k === 'station_id' ? stationId : data[k]);
  const r = await pool.query(
    `INSERT INTO hydrants (${cols}) VALUES (${placeholders}) RETURNING *`,
    vals
  );
  return r.rows[0];
}

async function hydUpdate(id, data, stationId) {
  const allowed = ['hydrantNumber','streetAddress','intersection','city','state','zip','type','manufacturer','model','yearInstalled','mainSize','outletSize','numOutlets','status','staticPressure','residualPressure','flowRate','lastTestDate','nextTestDue','testedBy','lastInspectionDate','ownedBy','notes','lat','lng'];
  const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
  if (!sets) return hydFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE hydrants SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

async function hydRemove(id, stationId) {
  await pool.query('DELETE FROM hydrants WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Volunteer Hours
async function vhAll(stationId) {
  const r = await pool.query('SELECT * FROM volunteer_hours WHERE department_id = $1 ORDER BY date DESC', [stationId]);
  return r.rows;
}

async function vhFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM volunteer_hours WHERE id = $1 AND department_id = $2', [id, stationId]);
  return r.rows[0] || null;
}

async function vhCreate(data, stationId) {
  const r = await pool.query(
    `INSERT INTO volunteer_hours ("memberId","memberName",date,"activityType",hours,description,reference,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [data.memberId, data.memberName, data.date, data.activityType, data.hours||0, data.description||'', data.reference||'', stationId]
  );
  return r.rows[0];
}

async function vhUpdate(id, data, stationId) {
  const allowed = ['memberId','memberName','date','activityType','hours','description','reference'];
  const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
  if (!sets) return vhFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE volunteer_hours SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

async function vhRemove(id, stationId) {
  await pool.query('DELETE FROM volunteer_hours WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Grants
async function grAll(stationId) {
  const r = await pool.query('SELECT * FROM grants WHERE department_id = $1 ORDER BY "programYear" DESC, "grantName" ASC', [stationId]);
  return r.rows.map(grDeserialize);
}

async function grFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM grants WHERE id = $1 AND department_id = $2', [id, stationId]);
  return grDeserialize(r.rows[0] || null);
}

async function grCreate(data, stationId) {
  const d = grSerialize(data);
  const r = await pool.query(
    `INSERT INTO grants ("grantName",type,"fundingAgency","programYear",status,"applicationDate","awardDate","amountRequested","amountAwarded","matchRequired","matchPercent","matchAmount","grantPeriodStart","grantPeriodEnd","reportingDeadlines",expenditures,"contactName","contactEmail",notes,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
    [d.grantName, d.type||'', d.fundingAgency||'', d.programYear||null, d.status||'Planning', d.applicationDate||null, d.awardDate||null, d.amountRequested||0, d.amountAwarded||null, d.matchRequired||false, d.matchPercent||0, d.matchAmount||null, d.grantPeriodStart||null, d.grantPeriodEnd||null, d.reportingDeadlines||'[]', d.expenditures||'[]', d.contactName||'', d.contactEmail||'', d.notes||'', stationId]
  );
  return grDeserialize(r.rows[0]);
}

async function grUpdate(id, data, stationId) {
  const allowed = ['grantName','type','fundingAgency','programYear','status','applicationDate','awardDate','amountRequested','amountAwarded','matchRequired','matchPercent','matchAmount','grantPeriodStart','grantPeriodEnd','reportingDeadlines','expenditures','contactName','contactEmail','notes'];
  const d = grSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return grFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE grants SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return grDeserialize(r.rows[0]);
}

async function grRemove(id, stationId) {
  await pool.query('DELETE FROM grants WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Mutual Aid
async function maAll(stationId) {
  const r = await pool.query('SELECT * FROM mutual_aid WHERE department_id = $1 ORDER BY date DESC', [stationId]);
  return r.rows.map(maDeserialize);
}

async function maFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM mutual_aid WHERE id = $1 AND department_id = $2', [id, stationId]);
  return maDeserialize(r.rows[0] || null);
}

async function maCreate(data, stationId) {
  const d = maSerialize(data);
  const r = await pool.query(
    `INSERT INTO mutual_aid (date,direction,"incidentType",status,"partnerDepartment",address,"unitsDeployed","personnelCount","requestTime","clearTime",notes,"incidentNumber",station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [d.date, d.direction||'Given', d.incidentType||'', d.status||'Completed', d.partnerDepartment||'', d.address||'', d.unitsDeployed||'[]', d.personnelCount||0, d.requestTime||'', d.clearTime||'', d.notes||'', d.incidentNumber||'', stationId]
  );
  return maDeserialize(r.rows[0]);
}

async function maUpdate(id, data, stationId) {
  const allowed = ['date','direction','incidentType','status','partnerDepartment','address','unitsDeployed','personnelCount','requestTime','clearTime','notes','incidentNumber'];
  const d = maSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return maFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE mutual_aid SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return maDeserialize(r.rows[0]);
}

async function maRemove(id, stationId) {
  await pool.query('DELETE FROM mutual_aid WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// SOGs
async function sogAll(stationId) {
  const r = await pool.query('SELECT * FROM sogs WHERE department_id = $1 ORDER BY number ASC, title ASC', [stationId]);
  return r.rows.map(sogDeserialize);
}

async function sogFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM sogs WHERE id = $1 AND department_id = $2', [id, stationId]);
  return sogDeserialize(r.rows[0] || null);
}

async function sogCreate(data, stationId) {
  const d = sogSerialize(data);
  const r = await pool.query(
    `INSERT INTO sogs (number,title,category,status,version,"effectiveDate","reviewDate","lastReviewedDate",author,"approvedBy",summary,content,tags,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [d.number||'', d.title, d.category||'Operations', d.status||'Active', d.version||'1.0', d.effectiveDate||null, d.reviewDate||null, d.lastReviewedDate||null, d.author||'', d.approvedBy||'', d.summary||'', d.content||'', d.tags||'[]', stationId]
  );
  return sogDeserialize(r.rows[0]);
}

async function sogUpdate(id, data, stationId) {
  const allowed = ['number','title','category','status','version','effectiveDate','reviewDate','lastReviewedDate','author','approvedBy','summary','content','tags'];
  const d = sogSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return sogFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE sogs SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return sogDeserialize(r.rows[0]);
}

async function sogRemove(id, stationId) {
  await pool.query('DELETE FROM sogs WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Wellness
async function wlAll(stationId) {
  const r = await pool.query('SELECT * FROM wellness WHERE department_id = $1 ORDER BY "memberName" ASC', [stationId]);
  return r.rows.map(wlDeserialize);
}

async function wlFindByMemberId(id, stationId) {
  const r = await pool.query('SELECT * FROM wellness WHERE "memberId" = $1 AND department_id = $2', [id, stationId]);
  return wlDeserialize(r.rows[0] || null);
}

async function wlCreate(data, stationId) {
  const d = wlSerialize(data);
  const r = await pool.query(
    `INSERT INTO wellness ("memberId","memberName","bloodType","medicalRestrictions","physicalDue","scbaFitDue",physicals,"scbaFitTests",vaccinations,exposures,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [d.memberId, d.memberName, d.bloodType||'', d.medicalRestrictions||'', d.physicalDue||null, d.scbaFitDue||null, d.physicals||'[]', d.scbaFitTests||'[]', d.vaccinations||'[]', d.exposures||'[]', stationId]
  );
  return wlDeserialize(r.rows[0]);
}

async function wlUpdate(memberId, data, stationId) {
  const allowed = ['bloodType','medicalRestrictions','physicalDue','scbaFitDue','physicals','scbaFitTests','vaccinations','exposures'];
  const d = wlSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return wlFindByMemberId(memberId, stationId);
  values.push(memberId, stationId);
  const r = await pool.query(
    `UPDATE wellness SET ${sets}, "updatedAt" = NOW() WHERE "memberId" = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return wlDeserialize(r.rows[0]);
}

async function wlRemove(memberId, stationId) {
  await pool.query('DELETE FROM wellness WHERE "memberId" = $1 AND department_id = $2', [memberId, stationId]);
}

// Recruitment
async function rcAll(stationId) {
  const r = await pool.query('SELECT * FROM recruitment WHERE department_id = $1 ORDER BY "dateAdded" DESC', [stationId]);
  return r.rows.map(rcDeserialize);
}

async function rcFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM recruitment WHERE id = $1 AND department_id = $2', [id, stationId]);
  return rcDeserialize(r.rows[0] || null);
}

async function rcCreate(data, stationId) {
  const d = rcSerialize(data);
  const r = await pool.query(
    `INSERT INTO recruitment (name,phone,email,address,dob,source,recruiter,stage,"dateAdded","stageHistory",checklist,notes,"interviewDate","physicalDate","orientationDate",station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [d.name, d.phone||'', d.email||'', d.address||'', d.dob||null, d.source||'', d.recruiter||'', d.stage||'Prospect', d.dateAdded, d.stageHistory||'[]', d.checklist||'{}', d.notes||'', d.interviewDate||'', d.physicalDate||'', d.orientationDate||'', stationId]
  );
  return rcDeserialize(r.rows[0]);
}

async function rcUpdate(id, data, stationId) {
  const allowed = ['name','phone','email','address','dob','source','recruiter','stage','dateAdded','stageHistory','checklist','notes','interviewDate','physicalDate','orientationDate'];
  const d = rcSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return rcFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE recruitment SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return rcDeserialize(r.rows[0]);
}

async function rcRemove(id, stationId) {
  await pool.query('DELETE FROM recruitment WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Events
async function evAll(stationId) {
  const r = await pool.query('SELECT * FROM events WHERE department_id = $1 ORDER BY date ASC', [stationId]);
  return r.rows.map(evDeserialize);
}

async function evFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM events WHERE id = $1 AND department_id = $2', [id, stationId]);
  return evDeserialize(r.rows[0] || null);
}

async function evCreate(data, stationId) {
  const d = evSerialize(data);
  const r = await pool.query(
    `INSERT INTO events (title,type,date,"startTime","endTime",location,organizer,description,"maxAttendees",rsvps,notes,station_id,rrule,recurrence_id,original_date,is_cancelled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [d.title, d.type||'Other', d.date, d.startTime||'', d.endTime||'', d.location||'', d.organizer||'', d.description||'', d.maxAttendees||null, d.rsvps||'[]', d.notes||'', stationId, d.rrule||null, d.recurrence_id||null, d.original_date||null, d.is_cancelled||false]
  );
  return evDeserialize(r.rows[0]);
}

async function evUpdate(id, data, stationId) {
  const allowed = ['title','type','date','startTime','endTime','location','organizer','description','maxAttendees','rsvps','notes','rrule','recurrence_id','original_date','is_cancelled'];
  const d = evSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return evFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE events SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return evDeserialize(r.rows[0]);
}

async function evRemove(id, stationId) {
  await pool.query('DELETE FROM events WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Pre-Incident Plans
async function ppAll(stationId) {
  const r = await pool.query('SELECT * FROM pre_plans WHERE department_id = $1 ORDER BY "occupancyName" ASC', [stationId]);
  return r.rows.map(ppDeserialize);
}

async function ppFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM pre_plans WHERE id = $1 AND department_id = $2', [id, stationId]);
  return ppDeserialize(r.rows[0] || null);
}

async function ppCreate(data, stationId) {
  const d = ppSerialize(data);
  const r = await pool.query(
    `INSERT INTO pre_plans ("occupancyName",address,"occupancyType","riskLevel","constructionType","yearBuilt",stories,"sqFootage","lastInspection","lastUpdated","lastUpdatedBy",contacts,hazards,access,"waterSupply",suppression,utilities,notes,"evacuationRoutes","reviewedBy","reviewedAt","reviewNotes",station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
    [d.occupancyName, d.address||'', d.occupancyType||'', d.riskLevel||'Moderate', d.constructionType||'', d.yearBuilt||null, d.stories||null, d.sqFootage||null, d.lastInspection||null, d.lastUpdated||null, d.lastUpdatedBy||'', d.contacts||'[]', d.hazards||'[]', d.access||'{}', d.waterSupply||'[]', d.suppression||'{}', d.utilities||'{}', d.notes||'', d.evacuationRoutes||'', d.reviewedBy||'', d.reviewedAt||null, d.reviewNotes||'', stationId]
  );
  return ppDeserialize(r.rows[0]);
}

async function ppUpdate(id, data, stationId) {
  const allowed = ['occupancyName','address','occupancyType','riskLevel','constructionType','yearBuilt','stories','sqFootage','lastInspection','lastUpdated','lastUpdatedBy','contacts','hazards','access','waterSupply','suppression','utilities','notes','evacuationRoutes','reviewedBy','reviewedAt','reviewNotes','tacticalSketch'];
  const d = ppSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return ppFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE pre_plans SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return ppDeserialize(r.rows[0]);
}

async function ppRemove(id, stationId) {
  await pool.query('DELETE FROM pre_plans WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// ── pre_plan_photos (0043) — first-class pre-plan photo METADATA ─────────────
// Bytes live in the private `preplan-photos` storage bucket; these rows carry
// caption/category/uploader/ordering/primary + the one-query Size-Up count.
async function pppListForPlan(planId, deptId) {
  const r = await pool.query(
    'SELECT * FROM pre_plan_photos WHERE plan_id = $1 AND department_id = $2 ORDER BY sort_order, id',
    [planId, deptId]
  );
  return r.rows;
}

async function pppFindById(id, planId, deptId) {
  const r = await pool.query(
    'SELECT * FROM pre_plan_photos WHERE id = $1 AND plan_id = $2 AND department_id = $3',
    [id, planId, deptId]
  );
  return r.rows[0] || null;
}

async function pppCountForPlan(planId, deptId) {
  const r = await pool.query(
    'SELECT COUNT(*)::int AS n FROM pre_plan_photos WHERE plan_id = $1 AND department_id = $2',
    [planId, deptId]
  );
  return r.rows[0]?.n ?? 0;
}

/**
 * Photo counts for EVERY plan in a department, as { [planId]: n }.
 *
 * One grouped query, not N. Exists so GET /api/pre-plans can carry `photoCount` on
 * each row — the mobile Size-Up now matches the pre-plan from the device's CACHED
 * district list (offline-first, 2026-07-13) instead of calling /by-address, so the
 * count has to ride the cached row or the building-photo strip silently disappears
 * on any device that never opened that plan.
 */
async function pppCountsByDept(deptId) {
  const r = await pool.query(
    'SELECT plan_id, COUNT(*)::int AS n FROM pre_plan_photos WHERE department_id = $1 GROUP BY plan_id',
    [deptId]
  );
  const out = {};
  for (const row of r.rows) out[row.plan_id] = row.n;
  return out;
}

async function pppInsert(d) {
  // sort_order appends at the end of the plan's strip (MAX + 1, 0 when empty).
  const r = await pool.query(
    `INSERT INTO pre_plan_photos
       (plan_id, station_id, department_id, storage_path, caption, category, mimetype, size_bytes, uploaded_by, taken_at, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
       COALESCE((SELECT MAX(sort_order) + 1 FROM pre_plan_photos WHERE plan_id = $1 AND department_id = $3), 0))
     RETURNING *`,
    [d.planId, d.stationId, d.departmentId, d.storagePath, d.caption || '', d.category || 'general',
     d.mimetype || '', d.sizeBytes ?? null, d.uploadedBy || '', d.takenAt ?? null]
  );
  return r.rows[0];
}

async function pppUpdate(id, planId, deptId, f) {
  const sets = []; const vals = []; let i = 1;
  if (f.caption   !== undefined) { sets.push(`caption = $${i++}`);    vals.push(f.caption); }
  if (f.category  !== undefined) { sets.push(`category = $${i++}`);   vals.push(f.category); }
  if (f.sortOrder !== undefined) { sets.push(`sort_order = $${i++}`); vals.push(f.sortOrder); }
  // isPrimary here is the UNSET path only (this row → false). Setting a NEW
  // primary must go through pppSetPrimary, which atomically clears siblings.
  if (f.isPrimary !== undefined) { sets.push(`is_primary = $${i++}`); vals.push(!!f.isPrimary); }
  if (!sets.length) return pppFindById(id, planId, deptId);
  vals.push(id, planId, deptId);
  const r = await pool.query(
    `UPDATE pre_plan_photos SET ${sets.join(', ')} WHERE id = $${i} AND plan_id = $${i + 1} AND department_id = $${i + 2} RETURNING *`,
    vals
  );
  return r.rows[0] || null;
}

async function pppSetPrimary(id, planId, deptId) {
  // Single statement — atomic on the max:1 serverless pool (lesson #12): the
  // chosen photo becomes primary, every sibling is cleared, in one UPDATE.
  const r = await pool.query(
    `UPDATE pre_plan_photos SET is_primary = (id = $1)
     WHERE plan_id = $2 AND department_id = $3
     RETURNING *`,
    [id, planId, deptId]
  );
  return r.rows.find((x) => x.id === id) || null;
}

async function pppRemove(id, planId, deptId) {
  await pool.query(
    'DELETE FROM pre_plan_photos WHERE id = $1 AND plan_id = $2 AND department_id = $3',
    [id, planId, deptId]
  );
}

// Drills
async function drAll(stationId) {
  const r = await pool.query('SELECT * FROM drills WHERE department_id = $1 ORDER BY date DESC', [stationId]);
  return r.rows.map(drDeserialize);
}

async function drFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM drills WHERE id = $1 AND department_id = $2', [id, stationId]);
  return drDeserialize(r.rows[0] || null);
}

async function drCreate(data, stationId) {
  const d = drSerialize(data);
  const r = await pool.query(
    `INSERT INTO drills (title,type,date,"startTime",duration,location,instructor,objectives,attendees,"isoHours",notes,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [d.title, d.type||'', d.date, d.startTime||'', d.duration||0, d.location||'', d.instructor||'', d.objectives||'[]', d.attendees||'[]', d.isoHours||true, d.notes||'', stationId]
  );
  return drDeserialize(r.rows[0]);
}

async function drUpdate(id, data, stationId) {
  const allowed = ['title','type','date','startTime','duration','location','instructor','objectives','attendees','isoHours','notes'];
  const d = drSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return drFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE drills SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return drDeserialize(r.rows[0]);
}

async function drRemove(id, stationId) {
  await pool.query('DELETE FROM drills WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Courses
async function coAll(stationId) {
  const r = await pool.query('SELECT * FROM courses WHERE department_id = $1 ORDER BY "courseName" ASC', [stationId]);
  return r.rows.map(coDeserialize);
}

async function coFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM courses WHERE id = $1 AND department_id = $2', [id, stationId]);
  return coDeserialize(r.rows[0] || null);
}

async function coCreate(data, stationId) {
  const d = coSerialize(data);
  const r = await pool.query(
    `INSERT INTO courses ("courseName",type,provider,"startDate","endDate",location,"certificationEarned","certExpireYears",cost,instructor,attendees,notes,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [d.courseName, d.type||'', d.provider||'', d.startDate||null, d.endDate||null, d.location||'', d.certificationEarned||'', d.certExpireYears||0, d.cost||0, d.instructor||'', d.attendees||'[]', d.notes||'', stationId]
  );
  return coDeserialize(r.rows[0]);
}

async function coUpdate(id, data, stationId) {
  const allowed = ['courseName','type','provider','startDate','endDate','location','certificationEarned','certExpireYears','cost','instructor','attendees','notes'];
  const d = coSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return coFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE courses SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return coDeserialize(r.rows[0]);
}

async function coRemove(id, stationId) {
  await pool.query('DELETE FROM courses WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Assets
async function astAll(stationId) {
  const r = await pool.query('SELECT * FROM assets WHERE department_id = $1 ORDER BY name ASC', [stationId]);
  return r.rows;
}

async function astFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM assets WHERE id = $1 AND department_id = $2', [id, stationId]);
  return r.rows[0] || null;
}

async function astCreate(data, stationId) {
  const r = await pool.query(
    `INSERT INTO assets (name,category,condition,"serialNumber","assignedTo",location,"purchaseDate","lastInspection","nextInspectionDue",notes,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [data.name, data.category||'', data.condition||'Serviceable', data.serialNumber||'', data.assignedTo||null, data.location||'', data.purchaseDate||'', data.lastInspection||'', data.nextInspectionDue||'', data.notes||'', stationId]
  );
  return r.rows[0];
}

async function astUpdate(id, data, stationId) {
  const allowed = ['name','category','condition','serialNumber','assignedTo','location','purchaseDate','lastInspection','nextInspectionDue','notes'];
  const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
  if (!sets) return astFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE assets SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

async function astRemove(id, stationId) {
  await pool.query('DELETE FROM assets WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// SCBA cylinder helpers RETIRED in Phase 2.3 (0084): rebuilt as the generic asset-test
// engine (routes/assetTests.js — tracked_assets/asset_test_types/asset_test_events). The
// legacy cylinders table remains (additive; its 8 prod rows migrated with UNRECORDED
// anchor events — real dates, honest results) but has no code readers.

// Fill Stations
async function fsAll(stationId) {
  const r = await pool.query('SELECT * FROM fill_stations WHERE department_id = $1 ORDER BY id ASC', [stationId]);
  return r.rows;
}

async function fsCreate(data, stationId) {
  const r = await pool.query(
    `INSERT INTO fill_stations (name,type,"bankPressure","maxPressure","lastInspectionDate","nextInspectionDate",status,notes,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [data.name, data.type||'', data.bankPressure||null, data.maxPressure||4500, data.lastInspectionDate||'', data.nextInspectionDate||'', data.status||'', data.notes||'', stationId]
  );
  return r.rows[0];
}

// CAD Connections
async function cadAll(stationId) {
  const r = await pool.query('SELECT * FROM cad_connections WHERE department_id = $1 ORDER BY name ASC', [stationId]);
  return r.rows.map(cadDeserialize);
}

async function cadFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM cad_connections WHERE id = $1 AND department_id = $2', [id, stationId]);
  return cadDeserialize(r.rows[0] || null);
}

async function cadCreate(data, stationId) {
  const d = cadSerialize(data);
  // Per-connection webhook secret (0021): high-entropy, shown to the chief ONCE.
  // Only the sha256 hash is stored; the inbound webhook matches against it.
  const crypto = require('crypto');
  const secret = 'ofcad_' + crypto.randomBytes(24).toString('base64url');
  const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
  // station_id = the house this feed maps to; department_id written EXPLICITLY
  // (the param is req.user.department_id) so the connection is correctly tenanted.
  const houseStationId = d.station_id != null ? d.station_id : stationId;
  const r = await pool.query(
    `INSERT INTO cad_connections ("vendorId",name,status,host,"apiKey","syncInterval",notes,"incidentsImported","lastSync","lastSyncResult","fieldMap",station_id,department_id,webhook_secret_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [d.vendorId||'', d.name, d.status||'Inactive', d.host||'', d.apiKey||'', d.syncInterval||'Manual only', d.notes||'', d.incidentsImported||0, d.lastSync||null, d.lastSyncResult||'', d.fieldMap||'{}', houseStationId, stationId, secretHash]
  );
  const out = cadDeserialize(r.rows[0]);
  out.webhook_secret = secret; // returned ONCE, on create only — never stored/returned again
  return out;
}

async function cadUpdate(id, data, stationId) {
  const allowed = ['vendorId','name','status','host','apiKey','syncInterval','notes','incidentsImported','lastSync','lastSyncResult','fieldMap'];
  const d = cadSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return cadFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE cad_connections SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return cadDeserialize(r.rows[0]);
}

async function cadRemove(id, stationId) {
  await pool.query('DELETE FROM cad_connections WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Investigations
async function invAll(stationId) {
  const r = await pool.query('SELECT * FROM investigations WHERE department_id = $1 ORDER BY "startDate" DESC', [stationId]);
  return r.rows.map(invDeserialize);
}

async function invFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM investigations WHERE id = $1 AND department_id = $2', [id, stationId]);
  return invDeserialize(r.rows[0] || null);
}

async function invCreate(data, stationId) {
  const d = invSerialize(data);
  const r = await pool.query(
    `INSERT INTO investigations ("caseNumber","incidentDate",address,"occupancyType",cause,"causeDetail",investigator,"startDate","completionDate","estimatedLoss","actualLoss",status,narrative,findings,recommendations,evidence,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [d.caseNumber, d.incidentDate||'', d.address||'', d.occupancyType||'', d.cause||'Undetermined', d.causeDetail||'', d.investigator||'', d.startDate||null, d.completionDate||null, d.estimatedLoss||null, d.actualLoss||null, d.status||'Open', d.narrative||'', d.findings||'', d.recommendations||'', d.evidence||'[]', stationId]
  );
  return invDeserialize(r.rows[0]);
}

async function invUpdate(id, data, stationId) {
  const allowed = ['caseNumber','incidentDate','address','occupancyType','cause','causeDetail','investigator','startDate','completionDate','estimatedLoss','actualLoss','status','narrative','findings','recommendations','evidence'];
  const d = invSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return invFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE investigations SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return invDeserialize(r.rows[0]);
}

async function invRemove(id, stationId) {
  await pool.query('DELETE FROM investigations WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Pay Entries
async function peAll(stationId) {
  const r = await pool.query('SELECT * FROM pay_entries WHERE department_id = $1 ORDER BY "payPeriodEnd" DESC', [stationId]);
  return r.rows.map(peDeserialize);
}

async function peFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM pay_entries WHERE id = $1 AND department_id = $2', [id, stationId]);
  return peDeserialize(r.rows[0] || null);
}

async function peCreate(data, stationId) {
  const d = peSerialize(data);
  const r = await pool.query(
    `INSERT INTO pay_entries ("memberId","memberName","payPeriodStart","payPeriodEnd","regularHours","overtimeHours","specialPay","grossPay","netPay",deductions,"paymentDate","paymentMethod",notes,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [d.memberId||null, d.memberName||'', d.payPeriodStart, d.payPeriodEnd, d.regularHours||0, d.overtimeHours||0, d.specialPay||'[]', d.grossPay||null, d.netPay||null, d.deductions||'[]', d.paymentDate||null, d.paymentMethod||'Check', d.notes||'', stationId]
  );
  return peDeserialize(r.rows[0]);
}

async function peUpdate(id, data, stationId) {
  const allowed = ['memberId','memberName','payPeriodStart','payPeriodEnd','regularHours','overtimeHours','specialPay','grossPay','netPay','deductions','paymentDate','paymentMethod','notes'];
  const d = peSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return peFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE pay_entries SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return peDeserialize(r.rows[0]);
}

async function peRemove(id, stationId) {
  await pool.query('DELETE FROM pay_entries WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// CRR Visits
async function cvAll(stationId) {
  const r = await pool.query('SELECT * FROM crr_visits WHERE department_id = $1 ORDER BY date DESC', [stationId]);
  return r.rows.map(cvDeserialize);
}

async function cvFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM crr_visits WHERE id = $1 AND department_id = $2', [id, stationId]);
  return cvDeserialize(r.rows[0] || null);
}

async function cvCreate(data, stationId) {
  const d = cvSerialize(data);
  const r = await pool.query(
    `INSERT INTO crr_visits (date,location,reason,"memberPresent","visitDuration",status,notes,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [d.date, d.location||'', d.reason||'', d.memberPresent||'[]', d.visitDuration||0, d.status||'Completed', d.notes||'', stationId]
  );
  return cvDeserialize(r.rows[0]);
}

async function cvUpdate(id, data, stationId) {
  const allowed = ['date','location','reason','memberPresent','visitDuration','status','notes'];
  const d = cvSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return cvFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE crr_visits SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return cvDeserialize(r.rows[0]);
}

async function cvRemove(id, stationId) {
  await pool.query('DELETE FROM crr_visits WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// CRR Programs
async function cpAll(stationId) {
  const r = await pool.query('SELECT * FROM crr_programs WHERE department_id = $1 ORDER BY name ASC', [stationId]);
  return r.rows.map(cpDeserialize);
}

async function cpFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM crr_programs WHERE id = $1 AND department_id = $2', [id, stationId]);
  return cpDeserialize(r.rows[0] || null);
}

async function cpCreate(data, stationId) {
  const d = cpSerialize(data);
  const r = await pool.query(
    `INSERT INTO crr_programs (name,coordinator,"startDate","endDate",budget,status,description,participants,notes,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [d.name, d.coordinator||'', d.startDate||null, d.endDate||null, d.budget||null, d.status||'Active', d.description||'', d.participants||'[]', d.notes||'', stationId]
  );
  return cpDeserialize(r.rows[0]);
}

async function cpUpdate(id, data, stationId) {
  const allowed = ['name','coordinator','startDate','endDate','budget','status','description','participants','notes'];
  const d = cpSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return cpFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE crr_programs SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return cpDeserialize(r.rows[0]);
}

async function cpRemove(id, stationId) {
  await pool.query('DELETE FROM crr_programs WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Budget Lines
async function blAll(stationId) {
  const r = await pool.query(
    `SELECT *, "budgetedAmount" AS allocated, description AS subcategory
     FROM budget_lines WHERE department_id = $1 ORDER BY "lineNumber" ASC`,
    [stationId]
  );
  return r.rows;
}

async function blFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM budget_lines WHERE id = $1 AND department_id = $2', [id, stationId]);
  return r.rows[0] || null;
}

async function blCreate(data, stationId) {
  const r = await pool.query(
    `INSERT INTO budget_lines ("lineNumber","fiscalYear",description,category,"budgetedAmount",status,notes,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [data.lineNumber, data.fiscalYear||null, data.description||'', data.category||'', data.budgetedAmount||0, data.status||'Active', data.notes||'', stationId]
  );
  return r.rows[0];
}

async function blUpdate(id, data, stationId) {
  const allowed = ['lineNumber','fiscalYear','description','category','budgetedAmount','status','notes'];
  const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
  if (!sets) return blFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE budget_lines SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

async function blRemove(id, stationId) {
  await pool.query('DELETE FROM budget_lines WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Budget Transactions
async function btAll(stationId) {
  const r = await pool.query('SELECT * FROM budget_transactions WHERE department_id = $1 ORDER BY date DESC', [stationId]);
  return r.rows;
}

async function btFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM budget_transactions WHERE id = $1 AND department_id = $2', [id, stationId]);
  return r.rows[0] || null;
}

async function btCreate(data, stationId) {
  const txnType = data.transactionType || data.type || 'Purchase';
  const r = await pool.query(
    `INSERT INTO budget_transactions ("budgetLineId",date,"transactionType",description,amount,"approvedBy",vendor,"receiptPath",status,notes,station_id,type,category,subcategory,"checkNumber")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [data.budgetLineId||null, data.date, txnType, data.description||'', data.amount, data.approvedBy||'', data.vendor||'', data.receiptPath||'', data.status||'Pending', data.notes||'', stationId,
     data.type||txnType, data.category||'', data.subcategory||'', data.checkNumber||'']
  );
  return r.rows[0];
}

async function btUpdate(id, data, stationId) {
  const allowed = ['budgetLineId','date','transactionType','description','amount','approvedBy','vendor','receiptPath','status','notes','type','category','subcategory','checkNumber'];
  const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
  if (!sets) return btFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE budget_transactions SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

async function btRemove(id, stationId) {
  await pool.query('DELETE FROM budget_transactions WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// NFIRS Reports
async function nfAll(stationId) {
  const r = await pool.query('SELECT * FROM nfirs_reports WHERE department_id = $1 ORDER BY "reportDate" DESC', [stationId]);
  return r.rows.map(nfDeserialize);
}

async function nfFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM nfirs_reports WHERE id = $1 AND department_id = $2', [id, stationId]);
  return nfDeserialize(r.rows[0] || null);
}

async function nfCreate(data, stationId) {
  const d = nfSerialize(data);
  const r = await pool.query(
    `INSERT INTO nfirs_reports ("incidentNumber","reportingArea","stateIncidentNumber","federalIncidentNumber","reportDate","estimatedPropertyLoss","estimatedPropertyValue",status,"suppressionApparatus","suppressionPersonnel","emsApparatus","emsPersonnel","otherApparatus","otherPersonnel","civilianDeaths","civilianInjuries","fsDeaths","fsInjuries","propertyLoss","contentsLoss","isStructureFire","structureType","buildingStatus","storiesAboveGrade","storiesBelowGrade","mainFloorArea","fireOriginCode","fireCauseCode","contributingFactor1","contributingFactor2","humanFactors1","humanFactors2","detectorPresence","detectorOperation","detectorEffectiveness","detectorFailureReason","sprinklerPresence","sprinklerOperation","sprinklerFailureReason","narrativeStatement","preparedBy","officerInCharge","reviewedBy","linkedIncidentId",station_id,latitude,longitude,"dispatchTime","onSceneTime","unitClearTime","respondingUnits")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51) RETURNING *`,
    [d.incidentNumber||null, d.reportingArea||'', d.stateIncidentNumber||'', d.federalIncidentNumber||'', d.reportDate||null, d.estimatedPropertyLoss||0, d.estimatedPropertyValue||0, d.status||'Draft', d.suppressionApparatus||'[]', d.suppressionPersonnel||'[]', d.emsApparatus||'[]', d.emsPersonnel||'[]', d.otherApparatus||'[]', d.otherPersonnel||'[]', d.civilianDeaths||0, d.civilianInjuries||0, d.fsDeaths||0, d.fsInjuries||0, d.propertyLoss||0, d.contentsLoss||0, d.isStructureFire||false, d.structureType||'', d.buildingStatus||'', d.storiesAboveGrade||0, d.storiesBelowGrade||0, d.mainFloorArea||0, d.fireOriginCode||'', d.fireCauseCode||'', d.contributingFactor1||'', d.contributingFactor2||'', d.humanFactors1||'', d.humanFactors2||'', d.detectorPresence||'', d.detectorOperation||'', d.detectorEffectiveness||'', d.detectorFailureReason||'', d.sprinklerPresence||'', d.sprinklerOperation||'', d.sprinklerFailureReason||'', d.narrativeStatement||'', d.preparedBy||'', d.officerInCharge||'', d.reviewedBy||'', d.linkedIncidentId||null, stationId, d.latitude||'', d.longitude||'', d.dispatchTime||'', d.onSceneTime||'', d.unitClearTime||'', d.respondingUnits||'']
  );
  return nfDeserialize(r.rows[0]);
}

async function nfUpdate(id, data, stationId) {
  const allowed = ['incidentNumber','reportingArea','stateIncidentNumber','federalIncidentNumber','reportDate','estimatedPropertyLoss','estimatedPropertyValue','status','suppressionApparatus','suppressionPersonnel','emsApparatus','emsPersonnel','otherApparatus','otherPersonnel','civilianDeaths','civilianInjuries','fsDeaths','fsInjuries','propertyLoss','contentsLoss','isStructureFire','structureType','buildingStatus','storiesAboveGrade','storiesBelowGrade','mainFloorArea','fireOriginCode','fireCauseCode','contributingFactor1','contributingFactor2','humanFactors1','humanFactors2','detectorPresence','detectorOperation','detectorEffectiveness','detectorFailureReason','sprinklerPresence','sprinklerOperation','sprinklerFailureReason','narrativeStatement','preparedBy','officerInCharge','reviewedBy','linkedIncidentId','latitude','longitude','dispatchTime','onSceneTime','unitClearTime','respondingUnits'];
  const d = nfSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return nfFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE nfirs_reports SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return nfDeserialize(r.rows[0]);
}

async function nfRemove(id, stationId) {
  await pool.query('DELETE FROM nfirs_reports WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Stations
const stations = {
  async all() {
    const r = await pool.query('SELECT * FROM stations ORDER BY name ASC');
    return r.rows;
  },
  async findById(id) {
    const r = await pool.query('SELECT * FROM stations WHERE id = $1', [id]);
    return r.rows[0] || null;
  },
  async create(data) {
    const r = await pool.query(
      `INSERT INTO stations (name, fdid, address, city, state, zip, phone, email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [data.name, data.fdid||'', data.address||'', data.city||'', data.state||'', data.zip||'', data.phone||'', data.email||'']
    );
    return r.rows[0];
  },
  async update(id, data) {
    const allowed = ['name','fdid','address','city','state','zip','phone','email'];
    const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
    if (!sets) return stations.findById(id);
    values.push(id);
    const r = await pool.query(`UPDATE stations SET ${sets} WHERE id = $${nextIdx} RETURNING *`, values);
    return r.rows[0];
  },
  async getApiKey(stationId, keyName) {
    const col = keyName === 'anthropicApiKey' ? 'anthropic_api_key' : null;
    if (!col) return null;
    const r = await pool.query(`SELECT ${col} FROM stations WHERE id = $1`, [stationId]);
    return r.rows[0] ? (r.rows[0][col] || null) : null;
  },
  async setApiKey(stationId, keyName, value) {
    const col = keyName === 'anthropicApiKey' ? 'anthropic_api_key' : null;
    if (!col) return;
    await pool.query(`UPDATE stations SET ${col} = $1 WHERE id = $2`, [value || '', stationId]);
  },
};

// Users
const users = {
  async findByUsername(username) {
    const r = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return r.rows[0] || null;
  },
  async findById(id) {
    // fleet_maintenance = the 2.2 mechanic capability grant (0083); guarded so pre-0083
    // DBs (fresh initDb runs the ALTER later in boot) don't 42703 during the window.
    try {
      const r = await pool.query('SELECT id, username, name, initials, role, email, station_id, apparatus_id, email_verified, fleet_maintenance, cs_manager FROM users WHERE id = $1', [id]);
      return r.rows[0] || null;
    } catch (e) {
      if (e.code !== '42703') throw e;
      const r = await pool.query('SELECT id, username, name, initials, role, email, station_id, apparatus_id, email_verified FROM users WHERE id = $1', [id]);
      return r.rows[0] || null;
    }
  },
  // Resolve a user's ACTIVE department (multi-tenant Phase 2). Source of truth
  // is of_user_departments; during the EXPAND transition we fall back to the
  // department mirroring the user's station (dept.id == station_id after the
  // 0004 backfill), so users without an explicit membership row still resolve.
  // v1 is single-active-department (§9 Q3): if a user belongs to several, the
  // lowest department_id wins deterministically. Returns null only if neither
  // a membership nor a station exists → caller fails closed.
  async resolveDepartmentId(userId, stationId) {
    // Bootstrap lookup: runs during auth BEFORE the per-request GUC context
    // exists. Under the non-owner of_app role, of_user_departments is
    // RLS-protected by app.user_id, so a direct read here would return 0 rows.
    // The SECURITY DEFINER function of_resolve_department (0008) does the lookup
    // as owner (bypassing RLS) for this one controlled case. Falls back to a
    // direct read on DBs where 0008 isn't applied, then to the station mirror.
    try {
      const r = await pool.query('SELECT public.of_resolve_department($1) AS department_id', [userId]);
      const d = r.rows[0]?.department_id;
      return d != null ? d : (stationId ?? null);
    } catch (e) {
      if (e.code !== '42883') throw e; // 42883 = function does not exist (pre-0008)
    }
    try {
      const r = await pool.query(
        'SELECT department_id FROM of_user_departments WHERE user_id = $1 ORDER BY department_id ASC LIMIT 1',
        [userId]
      );
      if (r.rows.length) return r.rows[0].department_id;
    } catch (e) {
      // of_user_departments missing (pre-EXPAND DB) — fall through to station.
      if (e.code !== '42P01') throw e;
    }
    return stationId ?? null;
  },
  async getPreferences(id) {
    const r = await pool.query('SELECT preferences FROM users WHERE id = $1', [id]);
    return r.rows[0]?.preferences ?? {};
  },
  async setPreferences(id, prefs) {
    await pool.query('UPDATE users SET preferences = $1 WHERE id = $2', [JSON.stringify(prefs), id]);
  },
};

// Checklist templates
// Checklist template/completion helpers RETIRED in Phase 2.1 (0082): the module was
// rebuilt as routes/checks.js on the new versioned check_templates/apparatus_checks
// model. The old tables remain (additive discipline) but have no code readers; the old
// ccAll/ccCreate helpers carried a latent JSON.parse-on-JSONB 500 and are gone.

// ─── CAD Alerts ───────────────────────────────────────────────────────────────
async function cadAlertCreate(d) {
  const r = await pool.query(
    `INSERT INTO cad_alerts (alert_id, alert_id_source, address, units, description, details, latitude, longitude, dispatched_at, raw, station_id, call_answered_at, call_arrival_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (department_id, alert_id) DO NOTHING
     RETURNING *`,
    // 0106: alert_id_source records whether the identifier came from the CAD or
    // was synthesized by us. Provenance must never masquerade — an operator
    // seeing a synthesized id needs to know their CAD is misconfigured rather
    // than read it back over the radio as the call's run number.
    // 0104: the conflict target is (department_id, alert_id), NOT alert_id alone.
    // CAD run numbers are namespaced per department — the old global UNIQUE meant
    // the SECOND department to be dispatched run number 2026-000123 had its alert
    // REFUSED (23505). A dropped dispatch caused by another tenant's data.
    // department_id is not in the column list on purpose: the BEFORE INSERT
    // trigger trg_sync_department_id populates it, and BEFORE triggers run ahead
    // of the uniqueness check, so the conflict target resolves correctly. Verified
    // live on prod 2026-07-26 with this exact statement shape (insert + replay:
    // trigger set department_id, replay deduped to 0 rows).
    [d.alertId, d.alertIdSource||null, d.address||'', d.units||'', d.description||'', d.details||'',
     d.latitude||null, d.longitude||null, d.dispatchedAt||new Date().toISOString(),
     d.raw ? JSON.stringify(d.raw) : null, d.stationId||1,
     d.callAnsweredAt||null, d.callArrivalAt||null]
  );
  const alert = r.rows[0] || null;
  // Index the dispatch into the archive at unit-response grain (migration 0041).
  // This is the ONE chokepoint every dispatch flows through (webhook + simulate),
  // so putting it here means no ingest path can silently skip the archive.
  if (alert) await cadAlertUnitsWrite(alert);
  return alert;
}

/**
 * Parse a new alert's `units` string into cad_alert_units rows.
 *
 * BEST-EFFORT BY DESIGN. The dispatch itself is life-safety; the archive row is
 * bookkeeping. If this throws (bad parse, constraint, whatever), the officer must
 * still get the call — so we log and swallow rather than failing the ingest. The
 * verbatim `cad_alerts.units` string is untouched either way, so a failure here is
 * always recoverable by re-running the backfill.
 */
async function cadAlertUnitsWrite(alert) {
  try {
    if (!alert || !alert.units || !alert.department_id) return;
    const { parseUnits } = require('./utils/unitParse');

    // Fleet is department-scoped: Engine 1 in dept A is NOT Engine 1 in dept B.
    const fleet = await pool.query(
      `SELECT id, designation, aliases FROM apparatus WHERE department_id = $1`,
      [alert.department_id]);

    const rows = parseUnits(alert.units, fleet.rows);
    for (const u of rows) {
      await pool.query(
        `INSERT INTO cad_alert_units
           (department_id, station_id, cad_alert_id, unit_raw, unit_norm,
            apparatus_id, ambiguous, seq, dispatched_at, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'cad')
         ON CONFLICT DO NOTHING`,
        [alert.department_id, alert.station_id, alert.id, u.unit_raw, u.unit_norm,
         u.apparatus_id, u.ambiguous, u.seq, alert.dispatched_at]);
    }
  } catch (err) {
    // Never let the archive break the dispatch.
    console.error(JSON.stringify({ kind: 'cad_alert_units_write_failed',
      alert_id: alert && alert.id, error: err.message }));
  }
}
// ── Phase 3 (MIGRATE): CAD-alert READ access keyed on department_id. ──
// cadAlertCreate (called by the CAD pipeline, whose tenant comes from
// CAD_STATION_MAP/env — NOT a JWT) still writes station_id as the dispatch
// ORIGIN; the of_sync_department_id trigger fills department_id. The reads the
// dispatcher hits (recent/findById/clear/clearAll) flip to department_id so
// the active feed + board banner are department-scoped. NOTE: the realtime
// PING topic is still station-keyed (dispatchTopic) — renaming it needs the
// client in lockstep + simulator verification, deferred to its own step.
async function cadAlertRecent(departmentId, limit = 50) {
  // Cleared (resolved) calls drop out of the active feed + the board banner.
  const r = await pool.query(
    `SELECT * FROM cad_alerts WHERE department_id = $1 AND cleared_at IS NULL ORDER BY dispatched_at DESC LIMIT $2`,
    [departmentId, limit]
  );
  return r.rows;
}
// 4.1a-R — the calls a CAD picker may offer when an officer writes a report.
//
// Deliberately NOT cadAlertRecent: that returns UNCLEARED calls only, because it
// feeds the active dispatch board. A report is normally written after the call
// clears — that is the whole point of end-of-shift paperwork — so a picker built
// on the active feed would show an empty list exactly when it is needed.
//
// Already-linked calls are RETURNED, not filtered out, carrying the incident they
// belong to. The picker shows them disabled with "already on 26-0042" rather than
// hiding them: an officer who cannot find their call needs to see that someone
// already filed it, not an unexplained absence.
async function cadAlertSelectable(departmentId, { days = 7, limit = 100 } = {}) {
  const r = await pool.query(
    `SELECT a.id, a.alert_id, a.address, a.units, a.description,
            a.dispatched_at, a.cleared_at, a.incident_id,
            i."incidentNumber" AS incident_number
       FROM cad_alerts a
       LEFT JOIN incidents i
              ON i.id = a.incident_id AND i.deleted_at IS NULL
      WHERE a.department_id = $1
        AND a.dispatched_at >= NOW() - ($2 || ' days')::interval
      ORDER BY a.dispatched_at DESC
      LIMIT $3`,
    [departmentId, String(days), limit]
  );
  return r.rows;
}
async function cadAlertFindById(id, departmentId) {
  const r = await pool.query(
    `SELECT * FROM cad_alerts WHERE id = $1 AND department_id = $2`, [id, departmentId]
  );
  return r.rows[0] || null;
}
// Soft-clear: dispatch resolves a call. Keeps the row (history); it just leaves
// the active feed. Idempotent.
async function cadAlertClear(id, departmentId, { disposition = null, clearedBy = null } = {}) {
  const r = await pool.query(
    `UPDATE cad_alerts SET cleared_at = NOW(), disposition = $3, cleared_by = $4
     WHERE id = $1 AND department_id = $2 AND cleared_at IS NULL RETURNING id`,
    [id, departmentId, disposition, clearedBy]
  );
  return r.rows[0] || null;
}
async function cadAlertClearAll(departmentId, clearedBy = null) {
  const r = await pool.query(
    `UPDATE cad_alerts SET cleared_at = NOW(), cleared_by = $2 WHERE department_id = $1 AND cleared_at IS NULL`,
    [departmentId, clearedBy]
  );
  return r.rowCount;
}
// Reopen a mis-closed call (the mature platforms ship this alongside manual
// close). Clears the close metadata; unit statuses are untouched either way.
async function cadAlertReopen(id, departmentId) {
  const r = await pool.query(
    `UPDATE cad_alerts SET cleared_at = NULL, disposition = NULL, cleared_by = NULL
     WHERE id = $1 AND department_id = $2 AND cleared_at IS NOT NULL RETURNING id`,
    [id, departmentId]
  );
  return r.rows[0] || null;
}
// Close a call from a CAD-sent close event (matched by the CAD's own alert id).
async function cadAlertCloseByExternalId(externalAlertId, departmentId) {
  const r = await pool.query(
    `UPDATE cad_alerts SET cleared_at = NOW(), disposition = 'cad_closed'
     WHERE alert_id = $1 AND department_id = $2 AND cleared_at IS NULL RETURNING id`,
    [externalAlertId, departmentId]
  );
  return r.rows[0] || null;
}
// Opt-in expiry backstop (0044): one no-op-when-off statement. Closes CALLS
// only — never a unit status (radio doctrine; orphan flag covers the rest).
// (cadAlertExpireStale removed 2026-07-16 — no auto-expiry timer; call closing is
// CAD-close-event + manual-clear only, matching the market. See routes/cad.js.)

// ─── Active Board ──────────────────────────────────────────────────────────────
// 0066: the board is keyed on DEPARTMENT_ID — one board per department, the
// same key RLS isolates on. These helpers previously wrote the caller's
// department id into the station_id FK column (the multi-house time bomb);
// every query below is department-keyed now. Do not reintroduce station_id.
async function activeBoardUpsert(departmentId, data) {
  const { incidentType, address, dispatchedAt, personnelCount, unitsCount } = data;
  const { rows } = await pool.query(
    `INSERT INTO active_boards (department_id, incident_type, address, dispatched_at, personnel_count, units_count, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (department_id) DO UPDATE SET
       incident_type=$2, address=$3, dispatched_at=$4, personnel_count=$5, units_count=$6, updated_at=NOW()
     RETURNING *`,
    [departmentId, incidentType||'', address||'', dispatchedAt||new Date(), personnelCount||0, unitsCount||0]
  );
  return rows[0];
}

async function activeBoardGet(departmentId) {
  const { rows } = await pool.query('SELECT * FROM active_boards WHERE department_id=$1', [departmentId]);
  return rows[0] || null;
}

async function activeBoardClear(departmentId) {
  await pool.query('DELETE FROM active_boards WHERE department_id=$1', [departmentId]);
}

async function activeBoardSetIncident(departmentId, incidentId) {
  await pool.query('UPDATE active_boards SET incident_id=$2 WHERE department_id=$1', [departmentId, incidentId]);
}

// ─── Unit Status Lifecycle (Phase 2) ───────────────────────────────────────
// Server-locked status enum (CAD-standard). 'out_of_service' mirrors the
// maintenance state and is read-only through this surface.
// NINE canonical statuses (0022 model + EMS extension 2026-07-13). transporting
// (patient aboard, to destination) and at_hospital (at destination — offload/
// decon/restock) are COMMITTED, non-dispatchable, and NEVER mass-reset (a rig
// with a patient is not a stale board entry). Cross-stack lockstep: web
// UnitStatusBoard STATUS_ORDER + mobile constants/statusMeta.ts change with this
// line or not at all.
const UNIT_STATUS_VALUES = ['in_service', 'dispatched', 'enroute', 'on_scene', 'transporting', 'at_hospital', 'returning', 'on_the_air', 'out_of_service'];

// Current status of every fleet apparatus (LEFT JOIN so units with no row yet
// read as 'in_service'), plus any non-fleet (CAD) units that have a status row.
async function unitStatusList(stationId) {
  const { rows } = await pool.query(
    `SELECT a.id AS apparatus_id, a.designation, a.type, a.station_id,
            COALESCE(us.status, 'in_service') AS status,
            us.incident_id, us.updated_by, us.updated_at
       FROM apparatus a
       LEFT JOIN unit_statuses us ON us.apparatus_id = a.id AND us.department_id = $1
      WHERE a.department_id = $1
      UNION ALL
     SELECT us.apparatus_id, us.designation, NULL AS type, NULL AS station_id,
            us.status, us.incident_id, us.updated_by, us.updated_at
       FROM unit_statuses us
      WHERE us.department_id = $1 AND us.apparatus_id IS NULL
      ORDER BY designation ASC`,
    [stationId]
  );
  return rows;
}

// Upsert one unit's status + append history, atomically.
async function unitStatusSet(stationId, { apparatusId, designation, status, incidentId, userId }) {
  if (!UNIT_STATUS_VALUES.includes(status)) {
    throw new Error(`Invalid unit status: ${status}`);
  }
  return runInTransaction(async (client) => {
    let row;
    if (apparatusId) {
      const r = await client.query(
        `INSERT INTO unit_statuses (station_id, apparatus_id, designation, status, incident_id, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (station_id, apparatus_id) DO UPDATE SET
           status=$4, incident_id=$5, updated_by=$6, updated_at=NOW()
         RETURNING *`,
        [stationId, apparatusId, designation || '', status, incidentId || null, userId || null]
      );
      row = r.rows[0];
    } else {
      // Non-fleet (CAD) unit keyed by designation — manual upsert.
      const upd = await client.query(
        `UPDATE unit_statuses SET status=$3, incident_id=$4, updated_by=$5, updated_at=NOW()
           WHERE station_id=$1 AND apparatus_id IS NULL AND designation=$2 RETURNING *`,
        [stationId, designation || '', status, incidentId || null, userId || null]
      );
      row = upd.rows[0];
      if (!row) {
        const ins = await client.query(
          `INSERT INTO unit_statuses (station_id, apparatus_id, designation, status, incident_id, updated_by, updated_at)
           VALUES ($1,NULL,$2,$3,$4,$5,NOW()) RETURNING *`,
          [stationId, designation || '', status, incidentId || null, userId || null]
        );
        row = ins.rows[0];
      }
    }
    await client.query(
      `INSERT INTO unit_status_history (station_id, apparatus_id, designation, incident_id, status, changed_by, changed_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [stationId, apparatusId || null, designation || '', incidentId || null, status, userId || null]
    );
    return row;
  });
}

// Reset every committed unit back to 'in_service' (end of call). Writes a
// history row per unit actually reset. Returns the number reset. If an
// incidentId is supplied, the 'in_service' (clear-time) history rows are stamped
// with it so the incident captures per-apparatus clear times.
async function unitStatusResetAll(stationId, userId, incidentId) {
  return runInTransaction(async (client) => {
    // Never auto-release an out_of_service rig (mechanical OOS) or an on_the_air
    // rig (deliberately in service, out of quarters) just because a call cleared.
    const { rows } = await client.query(
      `UPDATE unit_statuses SET status='in_service', incident_id=NULL, updated_by=$2, updated_at=NOW()
         WHERE station_id=$1 AND status NOT IN ('in_service', 'out_of_service', 'on_the_air', 'transporting', 'at_hospital') RETURNING apparatus_id, designation`,
      [stationId, userId || null]
    );
    for (const r of rows) {
      await client.query(
        `INSERT INTO unit_status_history (station_id, apparatus_id, designation, incident_id, status, changed_by, changed_at)
         VALUES ($1,$2,$3,$4,'in_service',$5,NOW())`,
        [stationId, r.apparatus_id || null, r.designation || '', incidentId || null, userId || null]
      );
    }
    return rows.length;
  });
}

async function unitStatusHistory(stationId, incidentId) {
  const { rows } = await pool.query(
    `SELECT * FROM unit_status_history WHERE station_id=$1 AND incident_id=$2 ORDER BY changed_at ASC`,
    [stationId, incidentId]
  );
  return rows;
}

// Stamp incident_id onto all of this call's status-history rows (everything
// since the call's dispatch that isn't already attributed). Idempotent.
async function unitStatusHistoryBackfillIncident(stationId, incidentId, sinceTs) {
  const { rowCount } = await pool.query(
    `UPDATE unit_status_history SET incident_id=$2
       WHERE station_id=$1 AND incident_id IS NULL AND changed_at >= $3`,
    [stationId, incidentId, sinceTs]
  );
  return rowCount;
}

// Derive per-apparatus NFIRS times (dispatched / en route / arrival / clear)
// from the stamped status history for one incident.
async function incidentApparatusTimes(stationId, incidentId) {
  const { rows } = await pool.query(
    `SELECT MAX(designation) AS designation,
            MIN(changed_at) FILTER (WHERE status='dispatched') AS dispatched_at,
            MIN(changed_at) FILTER (WHERE status='enroute')    AS enroute_at,
            MIN(changed_at) FILTER (WHERE status='on_scene')   AS on_scene_at,
            MAX(changed_at) FILTER (WHERE status='in_service')  AS clear_at,
            MIN(changed_at) AS first_at
       FROM unit_status_history
      WHERE station_id=$1 AND incident_id=$2
      GROUP BY COALESCE(apparatus_id::text, designation)
      ORDER BY MIN(changed_at) ASC`,
    [stationId, incidentId]
  );
  return rows;
}

// ─── Training Courses (Phase 7 — Training Hub) ─────────────────────────────
async function tcAll(stationId) {
  const { rows } = await pool.query(
    'SELECT * FROM training_courses WHERE department_id = $1 AND active = TRUE ORDER BY created_at DESC',
    [stationId]
  );
  return rows;
}
async function tcFindById(id, stationId) {
  const { rows } = await pool.query(
    'SELECT * FROM training_courses WHERE id = $1 AND department_id = $2', [id, stationId]
  );
  return rows[0] || null;
}
async function tcCreate(data, stationId) {
  const { rows } = await pool.query(
    `INSERT INTO training_courses (station_id, title, description, video_url, video_type, iso_category, ceu_hours, duration_minutes, level, passing_score, instructor, provider, tags, prerequisites, quiz, source, external_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [stationId, data.title, data.description||'', data.video_url||'', data.video_type||'youtube',
     data.iso_category||'general-ceu', data.ceu_hours||0, data.duration_minutes||0,
     data.level||'awareness', data.passing_score||80, data.instructor||'', data.provider||'',
     JSON.stringify(data.tags||[]), JSON.stringify(data.prerequisites||[]),
     JSON.stringify(data.quiz||[]), data.source||'department', data.external_id||'', data.created_by||'']
  );
  return rows[0];
}
async function tcUpdate(id, data, stationId) {
  const allowed = ['title','description','video_url','video_type','iso_category','ceu_hours','duration_minutes','level','passing_score','instructor','provider','tags','prerequisites','quiz','source','external_id','active'];
  const fields = [];
  const values = [];
  let idx = 1;
  for (const key of allowed) {
    if (data[key] !== undefined) {
      const val = ['tags','prerequisites','quiz'].includes(key) ? JSON.stringify(data[key]) : data[key];
      fields.push(`${key} = $${idx++}`);
      values.push(val);
    }
  }
  if (!fields.length) return tcFindById(id, stationId);
  values.push(id, stationId);
  const { rows } = await pool.query(
    `UPDATE training_courses SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} AND department_id = $${idx+1} RETURNING *`,
    values
  );
  return rows[0];
}
async function tcRemove(id, stationId) {
  // soft-delete
  await pool.query('UPDATE training_courses SET active = FALSE, updated_at = NOW() WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Training Course Completions
async function tccAllForUser(userId, stationId) {
  const { rows } = await pool.query(
    `SELECT cc.*, tc.title as course_title, tc.iso_category, tc.ceu_hours as course_ceu_hours, tc.level
     FROM training_course_completions cc
     LEFT JOIN training_courses tc ON cc.course_id = tc.id
     WHERE cc.department_id = $1 AND cc.user_id = $2
     ORDER BY cc.completed_at DESC NULLS LAST`,
    [stationId, userId]
  );
  return rows;
}
async function tccAllForStation(stationId) {
  const { rows } = await pool.query(
    `SELECT cc.*, tc.title as course_title, tc.iso_category, tc.ceu_hours as course_ceu_hours, tc.level
     FROM training_course_completions cc
     LEFT JOIN training_courses tc ON cc.course_id = tc.id
     WHERE cc.department_id = $1
     ORDER BY cc.completed_at DESC NULLS LAST`,
    [stationId]
  );
  return rows;
}
async function tccUpsert(stationId, data) {
  const { rows } = await pool.query(
    `INSERT INTO training_course_completions (station_id, course_id, user_id, member_name, quiz_score, quiz_passed, ceu_awarded, attempts, started_at, completed_at, certificate_id, source, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (station_id, course_id, user_id)
     DO UPDATE SET quiz_score = $5, quiz_passed = $6, ceu_awarded = $7, attempts = training_course_completions.attempts + 1, completed_at = $10, certificate_id = $11
     RETURNING *`,
    [stationId, data.course_id, data.user_id, data.member_name||'', data.quiz_score||0,
     data.quiz_passed||false, data.ceu_awarded||0, data.attempts||1,
     data.started_at||new Date().toISOString(), data.completed_at||null,
     data.certificate_id||'', data.source||'internal', data.external_ref||'']
  );
  return rows[0];
}
async function tccBulkImport(stationId, records) {
  const results = [];
  for (const rec of records) {
    const row = await tccUpsert(stationId, rec);
    results.push(row);
  }
  return results;
}

// Attach the department_id sync trigger to a LAZILY-created table (one created
// by a route's ensureTables() AFTER initDb's applyDepartmentExpand has already
// run, so the bulk trigger pass missed it). Idempotent. The
// of_sync_department_id function is created in applyDepartmentExpand (initDb),
// which always completes before any route handler runs ensureTables — but
// CREATE OR REPLACE it here too so this is self-contained and order-proof.
async function ensureDeptSyncTrigger(...tables) {
  await pool.query(`
    CREATE OR REPLACE FUNCTION of_sync_department_id() RETURNS trigger AS $fn$
    BEGIN
      IF TG_TABLE_NAME = 'apparatus_assignments' THEN IF NEW.station_id IS NULL AND NEW.apparatus_id IS NOT NULL THEN NEW.station_id := (SELECT station_id FROM public.apparatus WHERE id = NEW.apparatus_id); END IF; END IF; -- 0072: seated assignments carry their station (nested: NEW.apparatus_id only referenced for this table)
      IF NEW.department_id IS NULL THEN NEW.department_id := COALESCE((SELECT s.department_id FROM public.stations s WHERE s.id = NEW.station_id), NEW.station_id); END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  for (const t of tables) {
    if (!/^[a-z0-9_]+$/.test(t)) continue; // identifier safety (constants only)
    await pool.query(`DROP TRIGGER IF EXISTS trg_sync_department_id ON ${t}`);
    await pool.query(`CREATE TRIGGER trg_sync_department_id BEFORE INSERT OR UPDATE ON ${t} FOR EACH ROW EXECUTE FUNCTION of_sync_department_id()`);
  }
}

// ─── Live apparatus GPS (Phase 1, migration 0023) ───────────────────────────
// One row per apparatus (upsert). Department-scoped; RLS enforces isolation.
async function unitLocationsUpsert(departmentId, { apparatusId, stationId, latitude, longitude, heading, speed, accuracy }) {
  const { rows } = await pool.query(
    `INSERT INTO unit_locations (apparatus_id, station_id, department_id, latitude, longitude, heading, speed, accuracy, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (apparatus_id) DO UPDATE SET
       latitude=$4, longitude=$5, heading=$6, speed=$7, accuracy=$8, updated_at=NOW()
     RETURNING *`,
    [apparatusId, stationId, departmentId, latitude, longitude, heading ?? null, speed ?? null, accuracy ?? null]
  );
  return rows[0];
}

// Every apparatus position updated in the last 5 minutes, with designation + live status.
async function unitLocationsListActive(departmentId) {
  const { rows } = await pool.query(
    `SELECT ul.apparatus_id, a.designation, a.type,
            ul.latitude, ul.longitude, ul.heading, ul.speed, ul.accuracy, ul.updated_at,
            COALESCE(us.status, 'in_service') AS status
       FROM unit_locations ul
       JOIN apparatus a ON a.id = ul.apparatus_id AND a.department_id = $1
       LEFT JOIN unit_statuses us ON us.apparatus_id = ul.apparatus_id AND us.department_id = $1
      WHERE ul.department_id = $1
        AND ul.updated_at > NOW() - interval '5 minutes'
      ORDER BY a.designation ASC`,
    [departmentId]
  );
  return rows;
}

module.exports = {
  query,
  runInTransaction,
  runWithDepartment,
  pool,
  ensureDeptSyncTrigger,
  stations,
  members: { all, findById, findByMemberNumber, create, update, remove, memberByUserId, crewMemberIds, stationMemberIds },
  apparatus: { all: appAll, findById: appFindById, findByDesignation: appFindByDesignation, create: appCreate, update: appUpdate, remove: appRemove },
  incidents: { all: incAll, findById: incFindById, findByNumber: incFindByNumber, create: incCreate, update: incUpdate, remove: incRemove, nerisStatusTransition: incNerisStatusTransition, nerisSubmissionUpdate: incNerisSubmissionUpdate, nerisSweepCandidates: incNerisSweepCandidates },
  training: { all: trAll, findById: trFindById, create: trCreate, update: trUpdate, remove: trRemove },
  trainingCourses: { all: tcAll, findById: tcFindById, create: tcCreate, update: tcUpdate, remove: tcRemove },
  trainingCourseCompletions: { allForUser: tccAllForUser, allForStation: tccAllForStation, upsert: tccUpsert, bulkImport: tccBulkImport },
  shifts: { all: shiftAll, findById: shiftFindById, create: shiftCreate, update: shiftUpdate, remove: shiftRemove },
  shiftPatterns: { all: spAll, findById: spFindById, create: spCreate, update: spUpdate, remove: spRemove, expand: expandPatterns },
  leaveRequests: { all: lrAll, findById: lrFindById, create: lrCreate, update: lrUpdate, remove: lrRemove },
  shiftSwaps: { all: ssAll, allForShift: ssAllForShift, findById: ssFindById, create: ssCreate, update: ssUpdate, remove: ssRemove },
  coverageOutreach: { all: outreachAll, allForLeave: outreachAllForLeave, allForShift: outreachAllForShift, findById: outreachFindById, create: outreachCreate, update: outreachUpdate, remove: outreachRemove },
  stationLog: { all: slAll, findById: slFindById, create: slCreate, update: slUpdate, remove: slRemove },
  fiProperties: { all: fiPropAll, findById: fiPropFindById, create: fiPropCreate, update: fiPropUpdate, remove: fiPropRemove },
  fiInspections: { all: fiInsAll, findById: fiInsFindById, create: fiInsCreate, update: fiInsUpdate, remove: fiInsRemove },
  // issue/revoke/terminate are the 3.1a lifecycle engine's writers. `update` deliberately
  // cannot reach status or issuedDate — see fiPermUpdate.
  fiPermits: { all: fiPermAll, findById: fiPermFindById, create: fiPermCreate, update: fiPermUpdate, remove: fiPermRemove,
               issue: fiPermIssue, revoke: fiPermRevoke, terminate: fiPermTerminate,
               renewLink: fiPermRenewLink },
  hydrants: { all: hydAll, findById: hydFindById, findByNumber: hydFindByNum, create: hydCreate, update: hydUpdate, remove: hydRemove },
  volunteerHours: { all: vhAll, findById: vhFindById, create: vhCreate, update: vhUpdate, remove: vhRemove },
  grants: { all: grAll, findById: grFindById, create: grCreate, update: grUpdate, remove: grRemove },
  mutualAid: { all: maAll, findById: maFindById, create: maCreate, update: maUpdate, remove: maRemove },
  sogs: { all: sogAll, findById: sogFindById, create: sogCreate, update: sogUpdate, remove: sogRemove },
  wellness: { all: wlAll, findByMemberId: wlFindByMemberId, create: wlCreate, update: wlUpdate, remove: wlRemove },
  recruitment: { all: rcAll, findById: rcFindById, create: rcCreate, update: rcUpdate, remove: rcRemove },
  events: { all: evAll, findById: evFindById, create: evCreate, update: evUpdate, remove: evRemove },
  prePlans: { all: ppAll, findById: ppFindById, create: ppCreate, update: ppUpdate, remove: ppRemove },
  prePlanPhotos: {
    listForPlan: pppListForPlan, findById: pppFindById, countForPlan: pppCountForPlan,
    countsByDept: pppCountsByDept,
    insert: pppInsert, update: pppUpdate, setPrimary: pppSetPrimary, remove: pppRemove,
  },
  unitStatusAcks: {
    // Latest ack per apparatus for the board's timer computation (0046).
    async latestPerUnit(departmentId) {
      const r = await pool.query(
        `SELECT DISTINCT ON (apparatus_id) apparatus_id, acked_at
           FROM unit_status_acks WHERE department_id = $1
          ORDER BY apparatus_id, acked_at DESC`,
        [departmentId]
      );
      return new Map(r.rows.map((x) => [x.apparatus_id, x.acked_at]));
    },
    // Append-only insert — the dispatcher's recorded "status check" action.
    async insert(d) {
      const r = await pool.query(
        `INSERT INTO unit_status_acks (department_id, station_id, apparatus_id, designation, status, status_since, acked_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [d.departmentId, d.stationId ?? null, d.apparatusId, d.designation || '', d.status, d.statusSince ?? null, d.ackedBy ?? null]
      );
      return r.rows[0];
    },
  },
  // 0046 — the department's per-status timer thresholds (JSONB or null).
  async statusTimerConfig(departmentId) {
    const r = await pool.query('SELECT status_timer_config FROM departments WHERE id = $1', [departmentId]);
    return r.rows[0]?.status_timer_config ?? null;
  },
  drills: { all: drAll, findById: drFindById, create: drCreate, update: drUpdate, remove: drRemove },
  courses: { all: coAll, findById: coFindById, create: coCreate, update: coUpdate, remove: coRemove },
  assets: { all: astAll, findById: astFindById, create: astCreate, update: astUpdate, remove: astRemove },
  fillStations: { all: fsAll, create: fsCreate },
  cadConnections: { all: cadAll, findById: cadFindById, create: cadCreate, update: cadUpdate, remove: cadRemove },
  investigations: { all: invAll, findById: invFindById, create: invCreate, update: invUpdate, remove: invRemove },
  payEntries: { all: peAll, findById: peFindById, create: peCreate, update: peUpdate, remove: peRemove },
  crrVisits: { all: cvAll, findById: cvFindById, create: cvCreate, update: cvUpdate, remove: cvRemove },
  crrPrograms: { all: cpAll, findById: cpFindById, create: cpCreate, update: cpUpdate, remove: cpRemove },
  budgetLines: { all: blAll, findById: blFindById, create: blCreate, update: blUpdate, remove: blRemove },
  budgetTransactions: { all: btAll, findById: btFindById, create: btCreate, update: btUpdate, remove: btRemove },
  nfirsReports: { all: nfAll, findById: nfFindById, create: nfCreate, update: nfUpdate, remove: nfRemove },
  users,
  seedChecklists,
  pushSubscriptions: {
    async upsert(sub, userId, stationId = 1) {
      await pool.query(
        `INSERT INTO push_subscriptions (station_id, user_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE SET p256dh = $4, auth = $5, user_id = $2`,
        [stationId, userId || null, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
      );
    },
    async remove(endpoint) {
      await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    },
    async allForStation(stationId = 1) {
      const { rows } = await pool.query(
        'SELECT * FROM push_subscriptions WHERE department_id = $1', [stationId]
      );
      return rows;
    },
  },
  cadAlerts: {
    create: cadAlertCreate, recent: cadAlertRecent, findById: cadAlertFindById,
    selectable: cadAlertSelectable,
    clear: cadAlertClear, clearAll: cadAlertClearAll, reopen: cadAlertReopen,
    closeByExternalId: cadAlertCloseByExternalId,

    // REVERTED 2026-07-26 (Matt): a `linkIncident` helper briefly lived here and
    // was called from POST /api/active-board/link-incident. It picked "the one
    // currently open call" — a HEURISTIC, and the wrong architecture twice over:
    //   (1) The Command Board does not own this association. It is a
    //       scene-management tool; it reflects state, it does not activate it.
    //   (2) The market does not match on "which call is open". Every surveyed
    //       platform keys the association on the CAD DISPATCH/RUN NUMBER, which is
    //       unique — so concurrent calls are simply not ambiguous. Designing around
    //       an ambiguity that the correct key eliminates was the error.
    // The association belongs where an incident is created FROM a call, keyed on
    // the run number. cad_alerts.incident_id (migration 0100) is still the right
    // column; only its writer was wrong. Do not reintroduce a heuristic writer.
  },
  moduleCompletions: {
    async allForStation(stationId) {
      const { rows } = await pool.query(
        'SELECT * FROM module_completions WHERE department_id = $1 ORDER BY completed_at DESC',
        [stationId]
      );
      return rows;
    },
    async allForUser(userId, stationId) {
      const { rows } = await pool.query(
        'SELECT * FROM module_completions WHERE department_id = $1 AND user_id = $2 ORDER BY completed_at DESC',
        [stationId, userId]
      );
      return rows;
    },
    async upsert(stationId, userId, memberName, moduleId, score, passed) {
      const { rows } = await pool.query(
        `INSERT INTO module_completions (station_id, user_id, member_name, module_id, score, passed, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (station_id, user_id, module_id)
         DO UPDATE SET score = $5, passed = $6, completed_at = NOW()
         RETURNING *`,
        [stationId, userId, memberName, moduleId, score, passed]
      );
      return rows[0];
    },
  },
  scenarioCompletions: {
    async allForStation(stationId) {
      const { rows } = await pool.query(
        'SELECT * FROM scenario_completions WHERE department_id = $1 ORDER BY completed_at DESC',
        [stationId]
      );
      return rows;
    },
    async allForUser(userId, stationId) {
      const { rows } = await pool.query(
        'SELECT * FROM scenario_completions WHERE department_id = $1 AND user_id = $2 ORDER BY completed_at DESC',
        [stationId, userId]
      );
      return rows;
    },
    async upsert(stationId, userId, memberName, scenarioId, score, passed) {
      const { rows } = await pool.query(
        `INSERT INTO scenario_completions (station_id, user_id, member_name, scenario_id, score, passed, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (station_id, user_id, scenario_id)
         DO UPDATE SET score = $5, passed = $6, completed_at = NOW()
         RETURNING *`,
        [stationId, userId, memberName, scenarioId, score, passed]
      );
      return rows[0];
    },
  },
  incidentResponses: {
    async upsert(stationId, incidentId, userId, memberName, status, certLevel, seat = {}) {
      const { apparatusId = null, positionId = null, positionName = null, memberId = null } = seat;
      const timeCol = status === 'on_scene' ? ', on_scene_at = NOW()' : status === 'cleared' ? ', cleared_at = NOW()' : '';
      // COALESCE keeps a previously-declared seat when a later status update
      // (e.g. on_scene) doesn't re-send the apparatus/position. member_name is
      // ALWAYS refreshed to the latest display value (P8.1); member_id is the
      // STABLE link (P3) and is preserved if a later update can't re-resolve it.
      const { rows } = await pool.query(
        `INSERT INTO incident_responses
           (station_id, incident_id, user_id, member_name, status, cert_level,
            apparatus_id, position_id, position_name, member_id, responded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         ON CONFLICT (station_id, incident_id, user_id)
         DO UPDATE SET
           status        = $5,
           cert_level    = $6,
           member_name   = $4,
           member_id     = COALESCE($10, incident_responses.member_id),
           apparatus_id  = COALESCE($7, incident_responses.apparatus_id),
           position_id   = COALESCE($8, incident_responses.position_id),
           position_name = COALESCE($9, incident_responses.position_name)
           ${timeCol}
         RETURNING *`,
        [stationId, incidentId, userId, memberName, status, certLevel, apparatusId, positionId, positionName, memberId]
      );
      return rows[0];
    },
    async forIncident(stationId, incidentId) {
      const { rows } = await pool.query(
        'SELECT * FROM incident_responses WHERE department_id = $1 AND incident_id = $2 ORDER BY responded_at ASC',
        [stationId, incidentId]
      );
      return rows;
    },
  },
  activeBoard: {
    upsert: activeBoardUpsert, get: activeBoardGet, clear: activeBoardClear, setIncident: activeBoardSetIncident,
    // ── FIRST UNIT ON SCENE — the PAR clock's anchor (2026-07-14) ─────────────
    // NFPA 1500 §8.2.4: the incident clock starts "when the first arriving unit is
    // on-scene." That is the anchor the PAR interval counts from — so it has to be
    // a REAL time, not a button the IC remembered to press.
    //
    // OF already has this time and was throwing it away. Dispatch flips a unit to
    // `on_scene` on the Unit Status Board after verbal radio traffic; that write
    // lands in unit_status_history with changed_at + changed_by. Meanwhile the
    // Command Board made the IC ALSO tap an "On Scene" milestone — the same fact,
    // entered twice, free to disagree, and the safety-critical clock was hanging
    // off the second copy.
    //
    // This DERIVES the anchor from the human's radio-confirmed status change. It is
    // NOT an inference and it does not violate radio doctrine: no geofence, no GPS,
    // no AI. A person already made this call over the radio; we are simply reading
    // what they said instead of asking them to say it twice.
    //
    // Scoped to `changed_at >= dispatched_at` so a stale on-scene from a PREVIOUS
    // call can never anchor this one's clock.
    async firstUnitOnScene(departmentId) {
      const b = await pool.query(
        'SELECT dispatched_at FROM active_boards WHERE department_id = $1',
        [departmentId]
      );
      const dispatchedAt = b.rows[0]?.dispatched_at;
      if (!dispatchedAt) return null;

      const r = await pool.query(
        `SELECT designation, changed_at, changed_by
           FROM unit_status_history
          WHERE department_id = $1
            AND status = 'on_scene'
            AND changed_at >= $2
          ORDER BY changed_at ASC
          LIMIT 1`,
        [departmentId, dispatchedAt]
      );
      if (!r.rows[0]) return null;
      return {
        at: r.rows[0].changed_at,
        designation: r.rows[0].designation,   // WHICH rig — provenance, always
        changedBy: r.rows[0].changed_by,      // WHO said so — this is a legal record
      };
    },

    // PAR spine (0048)
    async setParInterval(departmentId, minutes) {
      const r = await pool.query(
        'UPDATE active_boards SET par_interval_min = $2, updated_at = NOW() WHERE department_id = $1 RETURNING *',
        [departmentId, minutes]
      );
      return r.rows[0] || null;
    },
    // Record a completed PAR as a REPLAYABLE, append-only legal record (0058).
    //
    // A PAR is a record of something that happened, at a time, on a call. It must
    // land even if the board is gone (the call closed while the write was queued
    // offline), it must record WHEN THE PAR ACTUALLY HAPPENED (client ran_at), and
    // a retry must not double-record (client_id idempotency). The old version
    // 404'd without a live board, stamped NOW(), and had no key — so a PAR that
    // failed on a dead network could not be queued and replayed. See 0058.
    async recordPar(departmentId, d) {
      // Best-effort: reset the shared countdown IF a board is live. A missing board
      // no longer blocks the record — the PAR is the point, the countdown is not.
      const b = await pool.query(
        'UPDATE active_boards SET last_par_at = NOW(), updated_at = NOW() WHERE department_id = $1 RETURNING *',
        [departmentId]
      );
      const board = b.rows[0] || null;

      // Snapshot fields: prefer the live board; else the client-supplied snapshot
      // (so a PAR recorded after the call closed still carries its incident context).
      const stationId    = board?.station_id ?? d.stationId ?? null;
      const incidentId   = board?.incident_id ?? d.incidentId ?? null;
      const incidentType = board?.incident_type || d.incidentType || '';
      const address      = board?.address || d.address || '';
      // Client-authoritative time of the PAR; NOW() only if the client didn't send one.
      const ranAt        = d.ranAt ? new Date(d.ranAt) : new Date();
      const results      = d.results ? JSON.stringify(d.results) : null;

      // Idempotent insert keyed on the client-minted UUID. A replay is answered as
      // a DUPLICATE and treated as success — the only thing between a retried PAR
      // and a double-record. Degrades safely if the 0058 column is not present yet
      // (an early code deploy against an un-migrated prod must not 500).
      if (d.clientId) {
        try {
          const ins = await pool.query(
            `INSERT INTO par_checks
               (department_id, station_id, incident_id, incident_type, address,
                accounted, missing, total, results, ran_by, ran_at, client_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (department_id, client_id) WHERE client_id IS NOT NULL
               DO NOTHING
             RETURNING *`,
            [departmentId, stationId, incidentId, incidentType, address,
             d.accounted, d.missing, d.total, results, d.ranBy ?? null, ranAt, d.clientId]
          );
          if (ins.rows[0]) return { board, check: ins.rows[0], duplicate: false };
          // Conflict → the PAR is already recorded. Return it; the client treats
          // duplicate as success (idempotency contract).
          const existing = await pool.query(
            'SELECT * FROM par_checks WHERE department_id = $1 AND client_id = $2',
            [departmentId, d.clientId]
          );
          return { board, check: existing.rows[0] || null, duplicate: true };
        } catch (e) {
          // 42703 undefined_column / 42P10 no matching unique index — the 0058
          // migration has not reached this DB yet. Fall through to the un-keyed
          // insert so the PAR is still recorded (non-idempotent, but never lost).
          if (e.code !== '42703' && e.code !== '42P10') throw e;
        }
      }

      const r = await pool.query(
        `INSERT INTO par_checks
           (department_id, station_id, incident_id, incident_type, address,
            accounted, missing, total, results, ran_by, ran_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [departmentId, stationId, incidentId, incidentType, address,
         d.accounted, d.missing, d.total, results, d.ranBy ?? null, ranAt]
      );
      return { board, check: r.rows[0], duplicate: false };
    },
  },
  // ── MAYDAY record (0059): sealed declaration + append-only event log ────────
  // Idempotent on the client-minted client_id (a replay is a duplicate = success).
  // declared_at / at default to server NOW() — a spoofed device clock cannot move
  // the legal record. Append-only: no update/delete method exists, and the DB
  // REVOKEs UPDATE/DELETE from of_app regardless.
  mayday: {
    async declare(departmentId, d) {
      const snapshot = d.sceneSnapshot != null ? JSON.stringify(d.sceneSnapshot) : '{}';
      const ins = await pool.query(
        `INSERT INTO mayday_events
           (client_id, department_id, incident_id, board_key, client_recorded_at,
            declared_by_user_id, victim_unit, nature, scene_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
         ON CONFLICT (client_id) DO NOTHING
         RETURNING *`,
        [d.clientId, departmentId, d.incidentId ?? null, d.boardKey ?? null,
         d.clientRecordedAt ?? null, d.declaredByUserId, d.victimUnit ?? null,
         d.nature ?? null, snapshot]);
      if (ins.rows[0]) return { mayday: ins.rows[0], duplicate: false };
      const ex = await pool.query(
        'SELECT * FROM mayday_events WHERE client_id=$1 AND department_id=$2',
        [d.clientId, departmentId]);
      return { mayday: ex.rows[0] || null, duplicate: true };
    },
    async appendEvent(departmentId, maydayId, e) {
      const payload = e.payload != null ? JSON.stringify(e.payload) : null;
      const ins = await pool.query(
        `INSERT INTO mayday_event_log
           (client_id, mayday_id, department_id, actor_user_id, kind, payload)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (client_id) DO NOTHING
         RETURNING *`,
        [e.clientId, maydayId, departmentId, e.actorUserId, e.kind, payload]);
      if (ins.rows[0]) return { event: ins.rows[0], duplicate: false };
      const ex = await pool.query(
        'SELECT * FROM mayday_event_log WHERE client_id=$1 AND department_id=$2',
        [e.clientId, departmentId]);
      return { event: ex.rows[0] || null, duplicate: true };
    },
    // Active = the most recent declaration with NO 'resolved' log row.
    async getActive(departmentId) {
      const m = await pool.query(
        `SELECT me.* FROM mayday_events me
          WHERE me.department_id=$1
            AND NOT EXISTS (SELECT 1 FROM mayday_event_log l
                             WHERE l.mayday_id=me.client_id AND l.kind='resolved')
          ORDER BY me.declared_at DESC LIMIT 1`,
        [departmentId]);
      if (!m.rows[0]) return null;
      const log = await pool.query(
        'SELECT * FROM mayday_event_log WHERE mayday_id=$1 AND department_id=$2 ORDER BY at ASC',
        [m.rows[0].client_id, departmentId]);
      return { ...m.rows[0], log: log.rows };
    },
    async getById(departmentId, maydayId) {
      const m = await pool.query(
        'SELECT * FROM mayday_events WHERE client_id=$1 AND department_id=$2',
        [maydayId, departmentId]);
      if (!m.rows[0]) return null;
      const log = await pool.query(
        'SELECT * FROM mayday_event_log WHERE mayday_id=$1 AND department_id=$2 ORDER BY at ASC',
        [maydayId, departmentId]);
      return { ...m.rows[0], log: log.rows };
    },
    // v1 resolve gate: a whole-scene PAR = a par_check recorded AFTER the
    // declaration with zero missing and a positive total. Per-unit roster
    // reconciliation is a later refinement; this is the honest floor.
    async parCompleteForScene(departmentId, maydayId) {
      const m = await pool.query(
        'SELECT declared_at FROM mayday_events WHERE client_id=$1 AND department_id=$2',
        [maydayId, departmentId]);
      if (!m.rows[0]) return false;
      const r = await pool.query(
        `SELECT 1 FROM par_checks
          WHERE department_id=$1 AND ran_at >= $2 AND missing=0 AND total>0 LIMIT 1`,
        [departmentId, m.rows[0].declared_at]);
      return r.rowCount > 0;
    },
  },
  UNIT_STATUS_VALUES,
  unitStatus: {
    list: unitStatusList,
    set: unitStatusSet,
    resetAll: unitStatusResetAll,
    history: unitStatusHistory,
    backfillIncident: unitStatusHistoryBackfillIncident,
    apparatusTimes: incidentApparatusTimes,
  },
  unitLocations: {
    upsert: unitLocationsUpsert,
    listActive: unitLocationsListActive,
  },
  // Rank-derived notification overrides (migration 0026). Sparse: only cells the
  // chief changed from the fixed defaults are stored.
  rankNotifications: {
    async getOverrides(departmentId) {
      const { rows } = await pool.query(
        'SELECT tier, notif_type, enabled FROM of_rank_notifications WHERE department_id = $1',
        [departmentId],
      );
      return rows;
    },
    // rows: [{ tier, notif_type, enabled }]. Upserts each cell.
    async setOverrides(departmentId, rows) {
      for (const r of rows) {
        await pool.query(
          `INSERT INTO of_rank_notifications (department_id, tier, notif_type, enabled, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (department_id, tier, notif_type)
           DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
          [departmentId, r.tier, r.notif_type, !!r.enabled],
        );
      }
    },
  },
  radioLog: {
    async insert(stationId, entry) {
      const { talkgroup, talkgroup_id, transcript, confidence, duration_sec, audio_url, is_dispatch, priority, source } = entry;
      const { rows } = await pool.query(
        `INSERT INTO radio_log (station_id, talkgroup, talkgroup_id, transcript, confidence, duration_sec, audio_url, is_dispatch, priority, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [stationId, talkgroup || '', talkgroup_id || null, transcript, confidence ?? 1.0, duration_sec || 0, audio_url || '', is_dispatch || false, priority || 'normal', source || 'sdr']
      );
      return rows[0];
    },
    async recent(stationId, limit = 50) {
      const { rows } = await pool.query(
        'SELECT * FROM radio_log WHERE department_id = $1 ORDER BY timestamp DESC LIMIT $2',
        [stationId, limit]
      );
      return rows;
    },
    async search(stationId, { q, talkgroup, startDate, endDate, limit = 100 }) {
      let where = 'department_id = $1';
      const params = [stationId];
      let idx = 2;
      if (q) { where += ` AND transcript ILIKE $${idx}`; params.push(`%${q}%`); idx++; }
      if (talkgroup) { where += ` AND talkgroup = $${idx}`; params.push(talkgroup); idx++; }
      if (startDate) { where += ` AND timestamp >= $${idx}`; params.push(startDate); idx++; }
      if (endDate) { where += ` AND timestamp <= $${idx}`; params.push(endDate); idx++; }
      params.push(limit);
      const { rows } = await pool.query(
        `SELECT * FROM radio_log WHERE ${where} ORDER BY timestamp DESC LIMIT $${idx}`,
        params
      );
      return rows;
    },
    async cleanup(stationId, retentionDays = 30) {
      const { rowCount } = await pool.query(
        `DELETE FROM radio_log WHERE department_id = $1 AND timestamp < NOW() - INTERVAL '1 day' * $2`,
        [stationId, retentionDays]
      );
      return rowCount;
    },
  },
  radioConfig: {
    async get(stationId) {
      const { rows } = await pool.query('SELECT * FROM radio_config WHERE department_id = $1', [stationId]);
      return rows[0] || null;
    },
    async upsert(stationId, data) {
      const { enabled, api_key, talkgroups, dispatch_keywords, whisper_mode, retention_days } = data;
      const { rows } = await pool.query(
        `INSERT INTO radio_config (station_id, enabled, api_key, talkgroups, dispatch_keywords, whisper_mode, retention_days, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (station_id) DO UPDATE SET
           enabled = COALESCE($2, radio_config.enabled),
           api_key = COALESCE($3, radio_config.api_key),
           talkgroups = COALESCE($4, radio_config.talkgroups),
           dispatch_keywords = COALESCE($5, radio_config.dispatch_keywords),
           whisper_mode = COALESCE($6, radio_config.whisper_mode),
           retention_days = COALESCE($7, radio_config.retention_days),
           updated_at = NOW()
         RETURNING *`,
        [stationId, enabled ?? false, api_key || '', talkgroups ? JSON.stringify(talkgroups) : '[]', dispatch_keywords ? JSON.stringify(dispatch_keywords) : '[]', whisper_mode || 'cloud', retention_days ?? 30]
      );
      return rows[0];
    },
  },
  recall: {
    async create(stationId, { level, incidentType, location, message, issuedBy }) {
      const { rows } = await pool.query(
        `INSERT INTO recall_events (station_id, level, incident_type, location, message, issued_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [stationId, level, incidentType || '', location || '', message || '', issuedBy]
      );
      return rows[0];
    },
    async allForStation(stationId) {
      const { rows } = await pool.query(
        `SELECT r.*,
           COALESCE(json_agg(rr ORDER BY rr.responded_at) FILTER (WHERE rr.id IS NOT NULL), '[]') AS responses
         FROM recall_events r
         LEFT JOIN recall_responses rr ON rr.recall_id = r.id
         WHERE r.department_id = $1
         GROUP BY r.id
         ORDER BY r.created_at DESC`,
        [stationId]
      );
      return rows;
    },
    async findById(id, stationId) {
      const { rows } = await pool.query(
        `SELECT r.*,
           COALESCE(json_agg(rr ORDER BY rr.responded_at) FILTER (WHERE rr.id IS NOT NULL), '[]') AS responses
         FROM recall_events r
         LEFT JOIN recall_responses rr ON rr.recall_id = r.id
         WHERE r.id = $1 AND r.department_id = $2
         GROUP BY r.id`,
        [id, stationId]
      );
      return rows[0] || null;
    },
    async active(stationId) {
      const { rows } = await pool.query(
        `SELECT r.*,
           COALESCE(json_agg(rr ORDER BY rr.responded_at) FILTER (WHERE rr.id IS NOT NULL), '[]') AS responses
         FROM recall_events r
         LEFT JOIN recall_responses rr ON rr.recall_id = r.id
         WHERE r.department_id = $1 AND r.status = 'active'
         GROUP BY r.id
         ORDER BY r.created_at DESC
         LIMIT 1`,
        [stationId]
      );
      return rows[0] || null;
    },
    async respond(recallId, memberId, memberName, response, eta, destination) {
      // destination: 'station' | 'scene' | null — only meaningful with
      // response='responding'; normalized here so the CHECK can never trip.
      const dest = response === 'responding' && ['station', 'scene'].includes(destination)
        ? destination : null;
      const { rows } = await pool.query(
        `INSERT INTO recall_responses (recall_id, member_id, member_name, response, eta, destination)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (recall_id, member_id) DO UPDATE
           SET response = $4, eta = $5, destination = $6, responded_at = NOW()
         RETURNING *`,
        [recallId, memberId, memberName, response, eta || '', dest]
      );
      return rows[0];
    },
    async close(id, departmentId) {
      // 1.1a fix: every other recall read filters department_id; this filtered
      // station_id — close silently no-op'd for any multi-house department.
      const { rows } = await pool.query(
        `UPDATE recall_events SET status='closed', closed_at=NOW()
         WHERE id=$1 AND department_id=$2 RETURNING *`,
        [id, departmentId]
      );
      return rows[0] || null;
    },
  },
  // ── Exams ────────────────────────────────────────────────────────────────
  exams: {
    async allForStation(stationId) {
      const { rows } = await pool.query(
        'SELECT * FROM exams WHERE department_id = $1 ORDER BY created_at DESC',
        [stationId]
      );
      return rows;
    },
    async findById(id, stationId) {
      const { rows } = await pool.query(
        'SELECT * FROM exams WHERE id = $1 AND department_id = $2',
        [id, stationId]
      );
      return rows[0] || null;
    },
    async create(stationId, data) {
      const { title, description, category, time_limit, passing_score, randomize, questions, created_by, status, due_date } = data;
      const { rows } = await pool.query(
        `INSERT INTO exams (station_id, title, description, category, time_limit, passing_score, randomize, questions, created_by, status, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [stationId, title, description || '', category || 'General', time_limit || 0, passing_score || 70,
         randomize !== false, JSON.stringify(questions || []), created_by, status || 'draft', due_date || null]
      );
      return rows[0];
    },
    async update(id, stationId, data) {
      const fields = [];
      const vals = [];
      let idx = 3;
      const allowed = ['title','description','category','time_limit','passing_score','randomize','questions','status','due_date'];
      for (const key of allowed) {
        if (data[key] !== undefined) {
          fields.push(`${key} = $${idx}`);
          vals.push(key === 'questions' ? JSON.stringify(data[key]) : data[key]);
          idx++;
        }
      }
      if (fields.length === 0) return null;
      fields.push(`updated_at = NOW()`);
      const { rows } = await pool.query(
        `UPDATE exams SET ${fields.join(', ')} WHERE id = $1 AND department_id = $2 RETURNING *`,
        [id, stationId, ...vals]
      );
      return rows[0] || null;
    },
    async remove(id, stationId) {
      const { rowCount } = await pool.query(
        'DELETE FROM exams WHERE id = $1 AND department_id = $2',
        [id, stationId]
      );
      return rowCount > 0;
    },
  },
  examAssignments: {
    async forExam(examId, stationId) {
      const { rows } = await pool.query(
        'SELECT * FROM exam_assignments WHERE exam_id = $1 AND department_id = $2',
        [examId, stationId]
      );
      return rows;
    },
    async forUser(userId, stationId) {
      const { rows } = await pool.query(
        `SELECT ea.*, e.title, e.category, e.time_limit, e.passing_score, e.status as exam_status, e.due_date
         FROM exam_assignments ea
         JOIN exams e ON e.id = ea.exam_id
         WHERE ea.user_id = $1 AND ea.department_id = $2
         ORDER BY ea.assigned_at DESC`,
        [userId, stationId]
      );
      return rows;
    },
    async assign(stationId, examId, userIds) {
      // W2.5 audit (2026-06-10): userIds are client-supplied — only assign to
      // users that actually belong to this station (silently drops foreign ids,
      // matching the existing ON CONFLICT silent-skip semantics).
      // NOTE: `users` has NO department_id column — it's the shared platform
      // identity table (of_user_departments holds membership). Scope by
      // station_id, value-equal to department_id during EXPAND. The Phase-3
      // bulk flip wrongly swept this to department_id, which threw 42703 at
      // runtime; reverted 2026-06-13 (mirrors the messages-recipient fix).
      // Revisit when users tenancy is modeled (Phase 4+).
      const { rows: validRows } = await pool.query(
        'SELECT id FROM users WHERE station_id = $1 AND id = ANY($2::int[])',
        [stationId, userIds.map(Number).filter(Number.isFinite)]
      );
      const validIds = new Set(validRows.map((r) => r.id));
      const results = [];
      for (const uid of userIds) {
        if (!validIds.has(Number(uid))) continue;
        const { rows } = await pool.query(
          `INSERT INTO exam_assignments (station_id, exam_id, user_id)
           VALUES ($1,$2,$3)
           ON CONFLICT (station_id, exam_id, user_id) DO NOTHING
           RETURNING *`,
          [stationId, examId, uid]
        );
        if (rows[0]) results.push(rows[0]);
      }
      return results;
    },
    async remove(stationId, examId, userId) {
      const { rowCount } = await pool.query(
        'DELETE FROM exam_assignments WHERE department_id = $1 AND exam_id = $2 AND user_id = $3',
        [stationId, examId, userId]
      );
      return rowCount > 0;
    },
  },
  examSubmissions: {
    async forExam(examId, stationId) {
      const { rows } = await pool.query(
        'SELECT * FROM exam_submissions WHERE exam_id = $1 AND department_id = $2 ORDER BY completed_at DESC',
        [examId, stationId]
      );
      return rows;
    },
    async forUser(userId, stationId) {
      const { rows } = await pool.query(
        `SELECT es.*, e.title, e.category, e.passing_score
         FROM exam_submissions es
         JOIN exams e ON e.id = es.exam_id
         WHERE es.user_id = $1 AND es.department_id = $2
         ORDER BY es.completed_at DESC`,
        [userId, stationId]
      );
      return rows;
    },
    async submit(stationId, data) {
      const { exam_id, user_id, score, passed, answers, started_at, time_spent } = data;
      const { rows } = await pool.query(
        `INSERT INTO exam_submissions (station_id, exam_id, user_id, score, passed, answers, started_at, completed_at, time_spent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8)
         ON CONFLICT (station_id, exam_id, user_id)
         DO UPDATE SET score = $4, passed = $5, answers = $6, completed_at = NOW(), time_spent = $8
         RETURNING *`,
        [stationId, exam_id, user_id, score, passed, JSON.stringify(answers || []), started_at || new Date().toISOString(), time_spent || 0]
      );
      return rows[0];
    },
  },

  // ── Member Availability ──────────────────────────────────────────────────
  availability: {
    async allForStation(stationId) {
      const { rows } = await pool.query(
        'SELECT * FROM member_availability WHERE department_id = $1 ORDER BY member_name',
        [stationId]
      );
      return rows;
    },
    async toggle(departmentId, userId, memberName, available) {
      // 0067: keyed on (department_id, user_id) — the old (station_id, user_id)
      // unique received department ids in the station column.
      const { rows } = await pool.query(
        `INSERT INTO member_availability (department_id, user_id, member_name, available, updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (department_id, user_id)
         DO UPDATE SET available = $4, member_name = $3, updated_at = NOW()
         RETURNING *`,
        [departmentId, userId, memberName, available]
      );
      return rows[0];
    },
  },

  // ── Bulletins ──────────────────────────────────────────────────────────
  bulletins: {
    async allForStation(stationId) {
      const { rows } = await pool.query(
        `SELECT * FROM bulletins WHERE department_id = $1
         AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY pinned DESC, created_at DESC`,
        [stationId]
      );
      return rows;
    },
    async create(stationId, data) {
      const { title, body, category, priority, pinned, author_id, author_name, expires_at } = data;
      const { rows } = await pool.query(
        `INSERT INTO bulletins (station_id, title, body, category, priority, pinned, author_id, author_name, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [stationId, title, body || '', category || 'General', priority || 'normal', pinned || false, author_id, author_name || '', expires_at || null]
      );
      return rows[0];
    },
    async update(id, stationId, data) {
      const fields = []; const vals = []; let idx = 3;
      for (const key of ['title','body','category','priority','pinned','expires_at']) {
        if (data[key] !== undefined) { fields.push(`${key} = $${idx}`); vals.push(data[key]); idx++; }
      }
      if (fields.length === 0) return null;
      fields.push('updated_at = NOW()');
      const { rows } = await pool.query(
        `UPDATE bulletins SET ${fields.join(', ')} WHERE id = $1 AND department_id = $2 RETURNING *`,
        [id, stationId, ...vals]
      );
      return rows[0] || null;
    },
    async remove(id, stationId) {
      const { rowCount } = await pool.query('DELETE FROM bulletins WHERE id = $1 AND department_id = $2', [id, stationId]);
      return rowCount > 0;
    },
  },

  // ── Fundraising ────────────────────────────────────────────────────────
  fundraising: {
    async allCampaigns(stationId) {
      const { rows } = await pool.query(
        'SELECT * FROM fundraising_campaigns WHERE department_id = $1 ORDER BY created_at DESC',
        [stationId]
      );
      return rows;
    },
    async createCampaign(stationId, data) {
      const { name, description, type, goal_amount, start_date, end_date, status, created_by } = data;
      const { rows } = await pool.query(
        `INSERT INTO fundraising_campaigns (station_id, name, description, type, goal_amount, start_date, end_date, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [stationId, name, description || '', type || 'Fund Drive', goal_amount || 0, start_date || null, end_date || null, status || 'Planning', created_by]
      );
      return rows[0];
    },
    async updateCampaign(id, stationId, data) {
      const fields = []; const vals = []; let idx = 3;
      for (const key of ['name','description','type','goal_amount','raised_amount','start_date','end_date','status']) {
        if (data[key] !== undefined) { fields.push(`${key} = $${idx}`); vals.push(data[key]); idx++; }
      }
      if (fields.length === 0) return null;
      fields.push('updated_at = NOW()');
      const { rows } = await pool.query(
        `UPDATE fundraising_campaigns SET ${fields.join(', ')} WHERE id = $1 AND department_id = $2 RETURNING *`,
        [id, stationId, ...vals]
      );
      return rows[0] || null;
    },
    async removeCampaign(id, stationId) {
      const { rowCount } = await pool.query('DELETE FROM fundraising_campaigns WHERE id = $1 AND department_id = $2', [id, stationId]);
      return rowCount > 0;
    },
    async allDonations(stationId, campaignId) {
      const where = campaignId
        ? 'WHERE department_id = $1 AND campaign_id = $2'
        : 'WHERE department_id = $1';
      const params = campaignId ? [stationId, campaignId] : [stationId];
      const { rows } = await pool.query(
        `SELECT * FROM donations ${where} ORDER BY donated_at DESC`,
        params
      );
      return rows;
    },
    async createDonation(stationId, data) {
      const { campaign_id, donor_name, donor_email, donor_phone, donor_address, amount, method, reference, notes, donated_at } = data;
      // Tenancy (W2.5 audit, 2026-06-10): campaign_id is client-supplied —
      // verify it belongs to the caller's station BEFORE attaching a donation,
      // otherwise a donation can rewrite another station's raised_amount.
      if (campaign_id) {
        const own = await pool.query(
          'SELECT id FROM fundraising_campaigns WHERE id = $1 AND department_id = $2',
          [campaign_id, stationId]
        );
        if (!own.rows.length) {
          const err = new Error('Campaign not found');
          err.status = 404;
          throw err;
        }
      }
      const { rows } = await pool.query(
        `INSERT INTO donations (station_id, campaign_id, donor_name, donor_email, donor_phone, donor_address, amount, method, reference, notes, donated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [stationId, campaign_id || null, donor_name, donor_email || '', donor_phone || '', donor_address || '', amount, method || 'Check', reference || '', notes || '', donated_at || new Date().toISOString().split('T')[0]]
      );
      // Update campaign raised_amount (station-scoped; SUM scoped too so a
      // polluted cross-station donation row can never inflate the total)
      if (campaign_id) {
        await pool.query(
          `UPDATE fundraising_campaigns SET raised_amount = (SELECT COALESCE(SUM(amount),0) FROM donations WHERE campaign_id = $1 AND department_id = $2), updated_at = NOW() WHERE id = $1 AND department_id = $2`,
          [campaign_id, stationId]
        );
      }
      return rows[0];
    },
    async removeDonation(id, stationId) {
      const don = await pool.query('SELECT campaign_id FROM donations WHERE id = $1 AND department_id = $2', [id, stationId]);
      const { rowCount } = await pool.query('DELETE FROM donations WHERE id = $1 AND department_id = $2', [id, stationId]);
      if (rowCount > 0 && don.rows[0]?.campaign_id) {
        await pool.query(
          `UPDATE fundraising_campaigns SET raised_amount = (SELECT COALESCE(SUM(amount),0) FROM donations WHERE campaign_id = $1 AND department_id = $2), updated_at = NOW() WHERE id = $1 AND department_id = $2`,
          [don.rows[0].campaign_id, stationId]
        );
      }
      return rowCount > 0;
    },
  },

  // ── Cadets ─────────────────────────────────────────────────────────────
  cadets: {
    async allForStation(stationId) {
      const { rows } = await pool.query('SELECT * FROM cadets WHERE department_id = $1 ORDER BY name', [stationId]);
      return rows;
    },
    async create(stationId, data) {
      const { name, date_of_birth, parent_guardian, parent_phone, parent_email, school, enrolled_date, status, rank, notes } = data;
      const { rows } = await pool.query(
        `INSERT INTO cadets (station_id, name, date_of_birth, parent_guardian, parent_phone, parent_email, school, enrolled_date, status, rank, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [stationId, name, date_of_birth || null, parent_guardian || '', parent_phone || '', parent_email || '', school || '', enrolled_date || new Date().toISOString().split('T')[0], status || 'Active', rank || 'Cadet', notes || '']
      );
      return rows[0];
    },
    async update(id, stationId, data) {
      const fields = []; const vals = []; let idx = 3;
      for (const key of ['name','date_of_birth','parent_guardian','parent_phone','parent_email','school','enrolled_date','status','rank','notes','certifications','training_hours']) {
        if (data[key] !== undefined) {
          fields.push(`${key} = $${idx}`);
          vals.push(key === 'certifications' ? JSON.stringify(data[key]) : data[key]);
          idx++;
        }
      }
      if (fields.length === 0) return null;
      fields.push('updated_at = NOW()');
      const { rows } = await pool.query(
        `UPDATE cadets SET ${fields.join(', ')} WHERE id = $1 AND department_id = $2 RETURNING *`,
        [id, stationId, ...vals]
      );
      return rows[0] || null;
    },
    async remove(id, stationId) {
      const { rowCount } = await pool.query('DELETE FROM cadets WHERE id = $1 AND department_id = $2', [id, stationId]);
      return rowCount > 0;
    },
  },

  // Lazy init — don't call initDb() at module load time.
  // On Vercel serverless the module-scope promise fires during the freeze/thaw
  // cycle and the connection dies before it resolves. Instead, let the first
  // request trigger it via ensureDb().
  _initPromise: null,
  ensureDb() {
    if (!this._initPromise) {
      this._initPromise = initDb().catch((err) => {
        // CRITICAL: do NOT memoize a rejected init. Before this catch, a
        // failed first boot pinned every later request to the same rejected
        // promise — index.js's retry flag reset was useless and a fresh DB
        // could never initialize (found 2026-06-12 by the tenancy suite).
        this._initPromise = null;
        throw err;
      });
    }
    return this._initPromise;
  },
  // Keep .ready as a getter for backward compat — returns the lazy promise
  get ready() {
    return this.ensureDb();
  },

  async forceSeedDemo(opts = {}) {
    // Defense-in-depth: this hard-deletes all station-1 data. Refuse to run
    // unless the caller passes an explicit { confirm: true } so it can never be
    // invoked bare (the /api/admin/seed-demo route also gates on SEED_DEMO).
    if (!opts.confirm) {
      throw new Error('forceSeedDemo requires { confirm: true } — it hard-deletes all station-1 data');
    }
    // Wipe and reseed all demo data for station 1
    await pool.query(`DELETE FROM training       WHERE station_id = 1`);
    await pool.query(`DELETE FROM maintenance    WHERE station_id = 1`);
    await pool.query(`DELETE FROM incidents      WHERE station_id = 1`);
    await pool.query(`DELETE FROM apparatus      WHERE station_id = 1`);
    await pool.query(`DELETE FROM members        WHERE station_id = 1`);

    // Members
    const demoMembers = [
      { num:'M-001', name:'Sarah Chen',        rank:'Fire Chief',   role:'chief',   status:'Active',       joined:'2008-03-15', phone:'555-201-0001', station_email:'sarah.chen@maplewoodfd.org', personal_email:'schen@gmail.com' },
      { num:'M-002', name:'Maria Delgado',     rank:'Captain',               role:'officer', status:'Active',       joined:'2011-06-20', phone:'555-201-0002', station_email:'maria.delgado@maplewoodfd.org', personal_email:'m.delgado@yahoo.com' },
      { num:'M-003', name:'Nathan McGee',      rank:'Firefighter',           role:'member',  status:'Active',       joined:'2013-09-10', phone:'555-201-0003', station_email:'nathan.mcgee@maplewoodfd.org', personal_email:'nmcgee1985@outlook.com' },
      { num:'M-004', name:'Sandra Kim',        rank:'Firefighter/EMT',       role:'member',  status:'Active',       joined:'2016-02-28', phone:'555-201-0004', station_email:'sandra.kim@maplewoodfd.org', personal_email:'skim@icloud.com' },
      { num:'M-005', name:'James Ortega',      rank:'Firefighter',           role:'member',  status:'Active',       joined:'2017-07-04', phone:'555-201-0005', station_email:'james.ortega@maplewoodfd.org', personal_email:'jortega.ff@gmail.com' },
      { num:'M-006', name:'Tracy Benson',      rank:'Firefighter/EMT',       role:'member',  status:'Active',       joined:'2018-11-01', phone:'555-201-0006', station_email:'tracy.benson@maplewoodfd.org', personal_email:'tracybenson@yahoo.com' },
      { num:'M-007', name:'Mike Harrington',   rank:'Firefighter',           role:'member',  status:'Active',       joined:'2019-04-15', phone:'555-201-0007', station_email:'mike.harrington@maplewoodfd.org', personal_email:'mharrington82@gmail.com' },
      { num:'M-008', name:'Lisa Fontaine',     rank:'Firefighter/Paramedic', role:'member',  status:'Active',       joined:'2020-01-20', phone:'555-201-0008', station_email:'lisa.fontaine@maplewoodfd.org', personal_email:'lfontaine@hotmail.com' },
      { num:'M-009', name:'Carlos Ruiz',       rank:'Probationary FF',       role:'member',  status:'Probationary', joined:'2023-08-01', phone:'555-201-0009', station_email:'carlos.ruiz@maplewoodfd.org', personal_email:'cruiz2001@gmail.com' },
      { num:'M-010', name:'Amy Winters',       rank:'Probationary FF',       role:'member',  status:'Probationary', joined:'2024-01-10', phone:'555-201-0010', station_email:'amy.winters@maplewoodfd.org', personal_email:'awinters2000@yahoo.com' },
      { num:'M-011', name:'Kevin Marsh',       rank:'Driver/Engineer',       role:'member',  status:'Active',       joined:'2015-05-12', phone:'555-201-0011', station_email:'kevin.marsh@maplewoodfd.org', personal_email:'kmarsh1988@gmail.com' },
      { num:'M-012', name:'Diane Tolliver',    rank:'Driver/Engineer',       role:'member',  status:'Active',       joined:'2014-09-22', phone:'555-201-0012', station_email:'diane.tolliver@maplewoodfd.org', personal_email:'dtolliver@icloud.com' },
    ];
    for (const m of demoMembers) {
      await pool.query(
        `INSERT INTO members ("memberNumber","name","rank","role","status","joined","phone","station_email","personal_email","certifications","station_id")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [m.num, m.name, m.rank, m.role, m.status, m.joined, m.phone, m.station_email, m.personal_email, '[]', 1]
      );
    }

    // Apparatus
    const demoApp = [
      { des:'Engine 1',   type:'Engine',    year:2018, make:'Pierce',       model:'Enforcer',   status:'In Service',     mileage:42800, lastSvc:'2024-10-15', nextSvc:'2025-04-15', notes:'Primary attack engine. 1500 GPM pump, 750 gal tank.' },
      { des:'Engine 2',   type:'Engine',    year:2011, make:'KME',          model:'Predator',   status:'In Service',     mileage:98500, lastSvc:'2024-08-20', nextSvc:'2025-02-20', notes:'Reserve engine. 1250 GPM pump, 500 gal tank.' },
      { des:'Ladder 1',   type:'Ladder',    year:2020, make:'Pierce',       model:'Ascendant',  status:'In Service',     mileage:28300, lastSvc:'2024-11-01', nextSvc:'2025-05-01', notes:'100ft aerial ladder. Quint configuration.' },
      { des:'Rescue 1',   type:'Rescue',    year:2016, make:'Spartan',      model:'ERV',        status:'In Service',     mileage:61200, lastSvc:'2024-09-10', nextSvc:'2025-03-10', notes:'Heavy rescue. Extrication, confined space, rope rescue.' },
      { des:'Tanker 1',   type:'Tanker',    year:2014, make:'Freightliner', model:'M2',         status:'In Service',     mileage:54700, lastSvc:'2024-07-30', nextSvc:'2025-01-30', notes:'3000 gal water tanker for rural operations.' },
      { des:'Medic 1',    type:'Ambulance', year:2022, make:'Ford',         model:'F-450',      status:'In Service',     mileage:18900, lastSvc:'2024-12-01', nextSvc:'2025-06-01', notes:'ALS ambulance. Primary EMS response.' },
      { des:'Medic 2',    type:'Ambulance', year:2019, make:'Ford',         model:'F-450',      status:'Out of Service', mileage:74300, lastSvc:'2024-06-15', nextSvc:'2024-12-15', notes:'Reserve medic. Generator service due.' },
      { des:'Utility 1',  type:'Utility',   year:2021, make:'Ford',         model:'F-250',      status:'In Service',     mileage:33100, lastSvc:'2024-10-20', nextSvc:'2025-04-20', notes:'Battalion chief vehicle. Command post.' },
    ];
    for (const a of demoApp) {
      await pool.query(
        `INSERT INTO apparatus (designation,type,year,make,model,status,mileage,"lastService","nextServiceDue",notes,station_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [a.des, a.type, a.year, a.make, a.model, a.status, a.mileage, a.lastSvc, a.nextSvc, a.notes, 1]
      );
    }

    // Incidents
    const demoInc = [
      { num:'2025-0412', date:'2025-03-08', time:'14:23', type:'Structure Fire',      alarm:'2nd Alarm', addr:'847 Oak Street',         units:'["Engine 1","Engine 2","Ladder 1","Rescue 1"]', pers:12, disp:'Extinguished',        notes:'Residential kitchen fire. Contained to room of origin.' },
      { num:'2025-0387', date:'2025-03-05', time:'08:45', type:'Motor Vehicle Crash', alarm:'1st Alarm', addr:'US-47 & County Rd 12',   units:'["Engine 1","Rescue 1","Medic 1"]',             pers:6,  disp:'Patients Transported', notes:'2-vehicle MVA. 1 extrication required. 3 transported.' },
      { num:'2025-0341', date:'2025-02-28', time:'21:12', type:'EMS - Cardiac',       alarm:'1st Alarm', addr:'2204 Maple Avenue',       units:'["Medic 1","Engine 1"]',                        pers:4,  disp:'Transported - ALS',    notes:'STEMI alert. Patient transported to Maplewood Regional.' },
      { num:'2025-0298', date:'2025-02-19', time:'03:37', type:'Carbon Monoxide',     alarm:'1st Alarm', addr:'516 Birchwood Drive',     units:'["Engine 1","Medic 1"]',                        pers:4,  disp:'Mitigated',            notes:'CO detector activation. Faulty furnace. 4 occupants evaluated.' },
      { num:'2025-0251', date:'2025-02-11', time:'11:50', type:'Brush Fire',          alarm:'1st Alarm', addr:'Ridgeline Rd near MM 6',  units:'["Engine 1","Tanker 1","Utility 1"]',           pers:6,  disp:'Extinguished',         notes:'3 acre brush fire. Wind-driven. Contained in 45 minutes.' },
      { num:'2025-0204', date:'2025-02-02', time:'16:08', type:'Gas Leak',            alarm:'1st Alarm', addr:'1122 Commerce Blvd',      units:'["Engine 1","Utility 1"]',                      pers:4,  disp:'Mitigated',            notes:'Natural gas leak at commercial building. Utility notified.' },
      { num:'2025-0178', date:'2025-01-27', time:'09:14', type:'Wildland Fire',       alarm:'2nd Alarm', addr:'Timber Creek Rd, Mile 3', units:'["Engine 1","Engine 2","Tanker 1","Utility 1"]',pers:10, disp:'Extinguished',         notes:'15 acre timber fire. Mutual aid from 3 neighboring departments.' },
      { num:'2025-0142', date:'2025-01-18', time:'19:55', type:'EMS - Trauma',        alarm:'1st Alarm', addr:'99 Industrial Park Dr',   units:'["Medic 1","Engine 1","Rescue 1"]',             pers:6,  disp:'Transported - ALS',    notes:'Industrial injury. Patient airlifted to Level 1 trauma center.' },
    ];
    for (const i of demoInc) {
      await pool.query(
        `INSERT INTO incidents ("incidentNumber",date,time,type,"alarmLevel",address,units,personnel,disposition,notes,photos,station_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [i.num, i.date, i.time, i.type, i.alarm, i.addr, i.units, i.pers, i.disp, i.notes, '[]', 1]
      );
    }

    // Training records
    const memberNames = demoMembers.slice(0, 8);
    const trainings = [
      { mId:1, mName:'Sarah Chen',      course:'Incident Command (ICS-300)',  type:'ICS',       status:'Completed', completed:'2024-11-10', expires:'2027-11-10', hours:24 },
      { mId:2, mName:'Maria Delgado',   course:'Firefighter II Recertification', type:'Certification', status:'Completed', completed:'2024-09-15', expires:'2026-09-15', hours:40 },
      { mId:3, mName:'Nathan McGee',    course:'HAZMAT Operations',           type:'Certification', status:'Completed', completed:'2024-08-22', expires:'2026-08-22', hours:32 },
      { mId:4, mName:'Sandra Kim',      course:'EMT Recertification',         type:'EMS',       status:'Completed', completed:'2024-12-01', expires:'2026-12-01', hours:36 },
      { mId:5, mName:'James Ortega',    course:'Driver/Operator - Pumper',    type:'Certification', status:'Completed', completed:'2024-07-08', expires:'2026-07-08', hours:24 },
      { mId:6, mName:'Tracy Benson',    course:'Pediatric Advanced Life Support', type:'EMS',   status:'Completed', completed:'2024-10-20', expires:'2026-10-20', hours:16 },
      { mId:7, mName:'Mike Harrington', course:'Rope Rescue Operations',      type:'Technical', status:'Completed', completed:'2024-06-14', expires:'2026-06-14', hours:40 },
      { mId:8, mName:'Lisa Fontaine',   course:'Paramedic Recertification',   type:'EMS',       status:'Completed', completed:'2024-11-30', expires:'2026-11-30', hours:48 },
      { mId:1, mName:'Sarah Chen',      course:'Fire Officer III',            type:'Leadership', status:'In Progress', completed:null, expires:null, hours:0 },
      { mId:9, mName:'Carlos Ruiz',     course:'Firefighter I',               type:'Certification', status:'In Progress', completed:null, expires:'2025-06-01', hours:0 },
    ];
    for (const t of trainings) {
      await pool.query(
        `INSERT INTO training ("memberId","memberName","courseName",type,status,"completedDate","expiresDate",hours,station_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [t.mId, t.mName, t.course, t.type, t.status, t.completed || null, t.expires || null, t.hours, 1]
      );
    }

    console.log('✅  forceSeedDemo complete: members, apparatus, incidents, training');
  },
  workflowTasks: {
    async all(stationId, status) {
      let q = 'SELECT * FROM workflow_tasks WHERE department_id = $1';
      const params = [stationId];
      if (status) { params.push(status); q += ` AND status = $${params.length}`; }
      q += ' ORDER BY updated_at DESC';
      const { rows } = await pool.query(q, params);
      return rows;
    },
    async findById(id, stationId) {
      const { rows } = await pool.query('SELECT * FROM workflow_tasks WHERE id = $1 AND department_id = $2', [id, stationId]);
      return rows[0] || null;
    },
    async create(data, stationId) {
      const { user_id, title, task_type, target_module, target_record_id, checklist, ai_drafts, conversation, deadline } = data;
      const { rows } = await pool.query(
        `INSERT INTO workflow_tasks (station_id, user_id, title, task_type, target_module, target_record_id, checklist, ai_drafts, conversation, deadline)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [stationId, user_id || null, title, task_type || 'incident_report', target_module || 'incidents',
         target_record_id || null, JSON.stringify(checklist || []), JSON.stringify(ai_drafts || {}),
         JSON.stringify(conversation || []), deadline || null]
      );
      return rows[0];
    },
    async update(id, data, stationId) {
      const allowed = ['title', 'status', 'checklist', 'ai_drafts', 'conversation', 'deadline', 'completed_at'];
      const sets = ['updated_at = NOW()'];
      const vals = [];
      let idx = 1;
      for (const key of allowed) {
        if (data[key] !== undefined) {
          const val = (typeof data[key] === 'object' && data[key] !== null) ? JSON.stringify(data[key]) : data[key];
          sets.push(`${key} = $${idx++}`);
          vals.push(val);
        }
      }
      if (vals.length === 0) return null;
      vals.push(id, stationId);
      const { rows } = await pool.query(
        `UPDATE workflow_tasks SET ${sets.join(', ')} WHERE id = $${idx++} AND department_id = $${idx} RETURNING *`,
        vals
      );
      return rows[0] || null;
    },
    async remove(id, stationId) {
      await pool.query('DELETE FROM workflow_tasks WHERE id = $1 AND department_id = $2', [id, stationId]);
    },
  },
};
