'use strict';
/**
 * db.js — PostgreSQL database using pg driver
 *
 * Async query interface using the 'pg' npm package.
 * Replaces node:sqlite synchronous API with async/await patterns.
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Strip sslmode from URL to avoid pg driver conflicts — we handle SSL explicitly
const rawDbUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/freestation';
const dbUrl = rawDbUrl.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
const isRemoteDb = dbUrl && !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1');
const sslConfig = isRemoteDb ? { rejectUnauthorized: false } : false;

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
    if (rows[0].n > 0) {
      console.log('[initDb] Already bootstrapped (stations has data) — skipping schema init');
      return;
    }
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
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
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
      result TEXT,
      violations TEXT DEFAULT '[]',
      "followUpDate" TEXT,
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Fire Permits table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fi_permits (
      id SERIAL PRIMARY KEY,
      "propertyId" INTEGER NOT NULL,
      type TEXT NOT NULL,
      "permitNumber" TEXT DEFAULT '',
      "issuedDate" TEXT,
      "expiresDate" TEXT,
      status TEXT DEFAULT 'Active',
      "issuedBy" TEXT DEFAULT '',
      fee REAL,
      conditions TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Hydrants table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hydrants (
      id SERIAL PRIMARY KEY,
      "hydrantNumber" TEXT NOT NULL UNIQUE,
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
      CREATE INDEX IF NOT EXISTS idx_members_crew ON members (department_id, assigned_unit_id, assigned_group);
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apparatus_positions (
      id SERIAL PRIMARY KEY,
      apparatus_id INTEGER NOT NULL REFERENCES apparatus(id) ON DELETE CASCADE,
      station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      position_name TEXT NOT NULL,
      required_certs TEXT DEFAULT '[]',
      min_rank TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    )
  `);

  // Daily apparatus assignments — who is assigned to what apparatus/position per shift
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apparatus_assignments (
      id SERIAL PRIMARY KEY,
      shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
      apparatus_id INTEGER NOT NULL REFERENCES apparatus(id) ON DELETE CASCADE,
      position_id INTEGER REFERENCES apparatus_positions(id) ON DELETE SET NULL,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      position_name TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Run lists — submitted daily run list snapshots, used to sync TV display
  await pool.query(`
    CREATE TABLE IF NOT EXISTS run_lists (
      id SERIAL PRIMARY KEY,
      station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      payload JSONB NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(station_id, date)
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
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

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

  // TV PIN — generated once per station, used to authenticate the wall TV display (no JWT needed)
  await pool.query('ALTER TABLE stations ADD COLUMN IF NOT EXISTS tv_pin TEXT');
  await pool.query(`
    UPDATE stations
    SET tv_pin = UPPER(
      SUBSTRING(MD5(id::TEXT || RANDOM()::TEXT) FROM 1 FOR 4) || '-' ||
      SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4)
    )
    WHERE tv_pin IS NULL
  `);

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
      alert_id      TEXT UNIQUE,
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

  // Active boards table (Command Board incident tracking)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS active_boards (
      station_id  INTEGER PRIMARY KEY REFERENCES stations(id) ON DELETE CASCADE,
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
      station_id    INTEGER DEFAULT 1,
      user_id       INTEGER NOT NULL,
      member_name   TEXT DEFAULT '',
      available     BOOLEAN DEFAULT false,
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (station_id, user_id)
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
      'unit_locations','expo_push_tokens','unit_status_history','unit_statuses','users','volunteer_hours','wellness','workflow_tasks',
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

  // unit_locations + expo_push_tokens dept_isolation (0023) — matches the pattern above.
  // Existence-guarded: on an install where the table isn't present yet (e.g. a dev DB
  // that fast-pathed table creation), skip rather than throw.
  for (const t of ['unit_locations', 'expo_push_tokens']) {
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
      GRANT SELECT, INSERT, UPDATE ON public.avl_connections TO of_app;
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
  return { ...row, repeatDays: JSON.parse(row.repeatDays || '[]'), memberIds: JSON.parse(row.memberIds || '[]') };
}
function spSerialize(data) {
  const out = { ...data };
  if (Array.isArray(out.repeatDays)) out.repeatDays = JSON.stringify(out.repeatDays);
  if (Array.isArray(out.memberIds)) out.memberIds = JSON.stringify(out.memberIds);
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

function cylDeserialize(r) { return r ? { ...r, fillLog: JSON.parse(r.fillLog||'[]') } : null; }
function cylSerialize(d)   { const o={...d}; if (Array.isArray(o.fillLog)) o.fillLog=JSON.stringify(o.fillLog); return o; }

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
    `INSERT INTO incidents ("incidentNumber",date,time,type,"alarmLevel",address,units,personnel,disposition,injuries,notes,photos,station_id,department_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [d.incidentNumber, d.date, d.time||'', d.type, d.alarmLevel||'Still', d.address||'', d.units||'[]', d.personnel||'[]', d.disposition||'', d.injuries||0, d.notes||'', d.photos||'[]', departmentId, departmentId]
  );
  return incDeserialize(r.rows[0]);
}

async function incUpdate(id, data, departmentId) {
  const allowed = ['incidentNumber','date','time','type','alarmLevel','address','units','personnel','disposition','injuries','notes','photos'];
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

async function incRemove(id, departmentId) {
  // Soft-delete: legal record retention (Phase 2.2). The row stays; every
  // read path filters deleted_at IS NULL. Audit entry written by the route.
  await pool.query('UPDATE incidents SET deleted_at = NOW() WHERE id = $1 AND department_id = $2 AND deleted_at IS NULL', [id, departmentId]);
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

// Maintenance
async function mntAll(stationId) {
  const r = await pool.query('SELECT * FROM maintenance WHERE department_id = $1 ORDER BY date DESC', [stationId]);
  return r.rows;
}

async function mntFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM maintenance WHERE id = $1 AND department_id = $2', [id, stationId]);
  return r.rows[0] || null;
}

async function mntCreate(data, stationId) {
  const r = await pool.query(
    `INSERT INTO maintenance ("apparatusId","apparatusName",type,priority,status,date,mileage,"engineHours",description,technician,vendor,"laborHours","partsCost","laborCost","totalCost","workOrder","nextServiceMiles","nextServiceDate",notes,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
    [data.apparatusId||0, data.apparatusName||'', data.type, data.priority||'Routine', data.status||'Pending', data.date, data.mileage||null, data.engineHours||null, data.description||'', data.technician||'', data.vendor||'', data.laborHours||null, data.partsCost||null, data.laborCost||null, data.totalCost||null, data.workOrder||'', data.nextServiceMiles||null, data.nextServiceDate||'', data.notes||'', stationId]
  );
  return r.rows[0];
}

async function mntUpdate(id, data, stationId) {
  const allowed = ['apparatusId','apparatusName','type','priority','status','date','mileage','engineHours','description','technician','vendor','laborHours','partsCost','laborCost','totalCost','workOrder','nextServiceMiles','nextServiceDate','notes'];
  const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
  if (!sets) return mntFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE maintenance SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

async function mntRemove(id, stationId) {
  await pool.query('DELETE FROM maintenance WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Shifts
async function shiftAll(stationId) {
  const r = await pool.query('SELECT * FROM shifts WHERE department_id = $1 ORDER BY date ASC, "shiftType" ASC', [stationId]);
  return r.rows.map(shiftDeserialize);
}

async function shiftFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM shifts WHERE id = $1 AND department_id = $2', [id, stationId]);
  return shiftDeserialize(r.rows[0] || null);
}

async function shiftCreate(data, stationId) {
  const d = shiftSerialize(data);
  const r = await pool.query(
    `INSERT INTO shifts (date,"shiftType",crew,"memberIds","patternId","isOverride",notes,station_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [d.date, d.shiftType, d.crew||'[]', d.memberIds||'[]', d.patternId||null, d.isOverride||false, d.notes||'', stationId]
  );
  return shiftDeserialize(r.rows[0]);
}

async function shiftUpdate(id, data, stationId) {
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
    `INSERT INTO shift_patterns (name,"shiftType","startDate","endDate","repeatRule","repeatDays","memberIds","minCrew","isActive",notes,platoon,cycle_type,cycle_on,cycle_off,kelly_day_interval,anchor_date,station_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [d.name, d.shiftType, d.startDate, d.endDate||null, d.repeatRule||'weekly', d.repeatDays||'[]', d.memberIds||'[]', d.minCrew||3, d.isActive!==false, d.notes||'', d.platoon||'', d.cycle_type||'', d.cycle_on||0, d.cycle_off||0, d.kelly_day_interval||0, d.anchor_date||'', stationId]
  );
  return spDeserialize(r.rows[0]);
}

async function spUpdate(id, data, stationId) {
  const allowed = ['name','shiftType','startDate','endDate','repeatRule','repeatDays','memberIds','minCrew','isActive','notes','platoon','cycle_type','cycle_on','cycle_off','kelly_day_interval','anchor_date'];
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
    `INSERT INTO leave_requests ("memberId","memberName",type,"startDate","endDate",status,"approvedBy","approvedAt",reason,notes,station_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [d.memberId, d.memberName, d.type||'PTO', d.startDate, d.endDate, d.status||'Pending', d.approvedBy||null, d.approvedAt||null, d.reason||'', d.notes||'', stationId]
  );
  return lrDeserialize(r.rows[0]);
}

async function lrUpdate(id, data, stationId) {
  const allowed = ['type','startDate','endDate','status','approvedBy','approvedAt','reason','notes'];
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

    let current = new Date(patStart + 'T00:00:00');
    const end = new Date(patEnd + 'T00:00:00');

    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      const dow = current.getDay();

      let shouldGenerate = false;

      if (pattern.repeatRule === 'platoon' && pattern.cycle_on > 0 && pattern.cycle_off > 0) {
        // Platoon scheduling: X-on / Y-off cycle from anchor date
        const anchor = new Date((pattern.anchor_date || pattern.startDate) + 'T00:00:00');
        const daysSinceAnchor = Math.floor((current - anchor) / (24 * 60 * 60 * 1000));
        const cycleLength = pattern.cycle_on + pattern.cycle_off;
        const dayInCycle = ((daysSinceAnchor % cycleLength) + cycleLength) % cycleLength; // handle negatives
        const isOnDuty = dayInCycle < pattern.cycle_on;

        // Kelly Day: skip every Nth on-duty day
        if (isOnDuty && pattern.kelly_day_interval > 0) {
          // Count on-duty days since anchor
          let onDutyCount = 0;
          for (let dd = 0; dd <= daysSinceAnchor; dd++) {
            const dc = ((dd % cycleLength) + cycleLength) % cycleLength;
            if (dc < pattern.cycle_on) onDutyCount++;
          }
          shouldGenerate = (onDutyCount % pattern.kelly_day_interval) !== 0;
        } else {
          shouldGenerate = isOnDuty;
        }
      } else if (pattern.repeatRule === 'daily') {
        shouldGenerate = true;
      } else if (pattern.repeatRule === 'weekly' || pattern.repeatRule === 'biweekly') {
        shouldGenerate = pattern.repeatDays.includes(dow);
        if (pattern.repeatRule === 'biweekly') {
          // Calculate week number from start
          const weekDiff = Math.floor((current - new Date(pattern.startDate + 'T00:00:00')) / (7 * 24 * 60 * 60 * 1000));
          shouldGenerate = shouldGenerate && (weekDiff % 2 === 0);
        }
      }

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

      current.setDate(current.getDate() + 1);
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
async function fiPropAll(stationId) {
  const r = await pool.query('SELECT * FROM fi_properties WHERE department_id = $1 ORDER BY name ASC', [stationId]);
  return r.rows.map(fiPropDeserialize);
}

async function fiPropFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM fi_properties WHERE id = $1 AND department_id = $2', [id, stationId]);
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
  await pool.query('DELETE FROM fi_properties WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Fire Inspections
async function fiInsAll(stationId) {
  const r = await pool.query('SELECT * FROM fi_inspections WHERE department_id = $1 ORDER BY "scheduledDate" DESC', [stationId]);
  return r.rows.map(fiInsDeserialize);
}

async function fiInsFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM fi_inspections WHERE id = $1 AND department_id = $2', [id, stationId]);
  return fiInsDeserialize(r.rows[0] || null);
}

async function fiInsCreate(data, stationId) {
  const d = fiInsSerialize(data);
  const r = await pool.query(
    `INSERT INTO fi_inspections ("propertyId",type,"inspectorName","scheduledDate","completedDate",result,violations,"followUpDate",notes,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [d.propertyId, d.type||'Annual Inspection', d.inspectorName||'', d.scheduledDate||null, d.completedDate||null, d.result||null, d.violations||'[]', d.followUpDate||null, d.notes||'', stationId]
  );
  return fiInsDeserialize(r.rows[0]);
}

async function fiInsUpdate(id, data, stationId) {
  const allowed = ['propertyId','type','inspectorName','scheduledDate','completedDate','result','violations','followUpDate','notes'];
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
  await pool.query('DELETE FROM fi_inspections WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Fire Permits
async function fiPermAll(stationId) {
  const r = await pool.query('SELECT * FROM fi_permits WHERE department_id = $1 ORDER BY "issuedDate" DESC', [stationId]);
  return r.rows;
}

async function fiPermFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM fi_permits WHERE id = $1 AND department_id = $2', [id, stationId]);
  return r.rows[0] || null;
}

async function fiPermCreate(data, stationId) {
  const r = await pool.query(
    `INSERT INTO fi_permits ("propertyId",type,"permitNumber","issuedDate","expiresDate",status,"issuedBy",fee,conditions,notes,station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [data.propertyId, data.type, data.permitNumber||'', data.issuedDate||null, data.expiresDate||null, data.status||'Active', data.issuedBy||'', data.fee||null, data.conditions||'', data.notes||'', stationId]
  );
  return r.rows[0];
}

async function fiPermUpdate(id, data, stationId) {
  const allowed = ['propertyId','type','permitNumber','issuedDate','expiresDate','status','issuedBy','fee','conditions','notes'];
  const { sets, values, nextIdx } = buildSetClause(data, allowed, 1);
  if (!sets) return fiPermFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE fi_permits SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return r.rows[0];
}

async function fiPermRemove(id, stationId) {
  await pool.query('DELETE FROM fi_permits WHERE id = $1 AND department_id = $2', [id, stationId]);
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

// SCBA Cylinders
async function cylAll(stationId) {
  const r = await pool.query('SELECT * FROM cylinders WHERE department_id = $1 ORDER BY "unitId" ASC', [stationId]);
  return r.rows.map(cylDeserialize);
}

async function cylFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM cylinders WHERE id = $1 AND department_id = $2', [id, stationId]);
  return cylDeserialize(r.rows[0] || null);
}

async function cylCreate(data, stationId) {
  const d = cylSerialize(data);
  const r = await pool.query(
    `INSERT INTO cylinders ("unitId",make,model,size,material,serial,"manufactureYear","currentPressure","maxPressure","lastHydroDate","nextHydroDate","lastInspectionDate","nextInspectionDate","assignedMember","assignedUnit",status,notes,"fillLog",station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [d.unitId, d.make||'', d.model||'', d.size||'', d.material||'', d.serial||'', d.manufactureYear||0, d.currentPressure||0, d.maxPressure||4500, d.lastHydroDate||'', d.nextHydroDate||'', d.lastInspectionDate||'', d.nextInspectionDate||'', d.assignedMember||'', d.assignedUnit||'', d.status||'In Service', d.notes||'', d.fillLog||'[]', stationId]
  );
  return cylDeserialize(r.rows[0]);
}

async function cylUpdate(id, data, stationId) {
  const allowed = ['unitId','make','model','size','material','serial','manufactureYear','currentPressure','maxPressure','lastHydroDate','nextHydroDate','lastInspectionDate','nextInspectionDate','assignedMember','assignedUnit','status','notes','fillLog'];
  const d = cylSerialize(data);
  const { sets, values, nextIdx } = buildSetClause(d, allowed, 1);
  if (!sets) return cylFindById(id, stationId);
  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE cylinders SET ${sets}, "updatedAt" = NOW() WHERE id = $${nextIdx} AND department_id = $${nextIdx+1} RETURNING *`,
    values
  );
  return cylDeserialize(r.rows[0]);
}

async function cylRemove(id, stationId) {
  await pool.query('DELETE FROM cylinders WHERE id = $1 AND department_id = $2', [id, stationId]);
}

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
    const r = await pool.query('SELECT id, username, name, initials, role, email, station_id, apparatus_id, email_verified FROM users WHERE id = $1', [id]);
    return r.rows[0] || null;
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
function parseCategories(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'object' && val !== null) return val;
  return JSON.parse(val || '[]');
}

async function ctAll(stationId) {
  const r = await pool.query('SELECT * FROM checklist_templates WHERE department_id = $1 ORDER BY name ASC', [stationId]);
  return r.rows.map((row) => ({ ...row, categories: parseCategories(row.categories) }));
}

async function ctFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM checklist_templates WHERE id = $1 AND department_id = $2', [id, stationId]);
  if (!r.rows[0]) return null;
  return { ...r.rows[0], categories: parseCategories(r.rows[0].categories) };
}

async function ctCreate(data, stationId) {
  const r = await pool.query(
    'INSERT INTO checklist_templates (name, apparatus, frequency, "estimatedMinutes", categories, station_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [data.name, data.apparatus || '', data.frequency || 'Daily', data.estimatedMinutes || 15, JSON.stringify(data.categories || []), stationId]
  );
  return { ...r.rows[0], categories: parseCategories(r.rows[0].categories) };
}

async function ctUpdate(id, data, stationId) {
  const updates = [];
  const values = [];
  let idx = 1;

  if (data.name !== undefined) { updates.push(`name = $${idx++}`); values.push(data.name); }
  if (data.apparatus !== undefined) { updates.push(`apparatus = $${idx++}`); values.push(data.apparatus); }
  if (data.frequency !== undefined) { updates.push(`frequency = $${idx++}`); values.push(data.frequency); }
  if (data.estimatedMinutes !== undefined) { updates.push(`"estimatedMinutes" = $${idx++}`); values.push(data.estimatedMinutes); }
  if (data.categories !== undefined) { updates.push(`categories = $${idx++}`); values.push(JSON.stringify(data.categories)); }

  if (updates.length === 0) return ctFindById(id, stationId);

  values.push(id, stationId);
  const r = await pool.query(
    `UPDATE checklist_templates SET ${updates.join(', ')} WHERE id = $${idx} AND department_id = $${idx + 1} RETURNING *`,
    values
  );
  if (!r.rows[0]) return null;
  return { ...r.rows[0], categories: parseCategories(r.rows[0].categories) };
}

async function ctRemove(id, stationId) {
  await pool.query('DELETE FROM checklist_templates WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// Checklist completions
async function ccAll(stationId, templateId = null) {
  let query = 'SELECT * FROM checklist_completions WHERE department_id = $1';
  const values = [stationId];
  if (templateId) {
    query += ' AND "templateId" = $2';
    values.push(templateId);
  }
  query += ' ORDER BY "completedDate" DESC';
  const r = await pool.query(query, values);
  return r.rows.map((row) => ({ ...row, responses: JSON.parse(row.responses || '{}') }));
}

async function ccFindById(id, stationId) {
  const r = await pool.query('SELECT * FROM checklist_completions WHERE id = $1 AND department_id = $2', [id, stationId]);
  if (!r.rows[0]) return null;
  return { ...r.rows[0], responses: JSON.parse(r.rows[0].responses || '{}') };
}

async function ccCreate(data, stationId) {
  const r = await pool.query(
    'INSERT INTO checklist_completions ("templateId", "templateName", apparatus, frequency, "completedDate", "completedBy", status, notes, responses, station_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
    [data.templateId, data.templateName || '', data.apparatus || '', data.frequency || '', data.completedDate, data.completedBy || '', data.status || 'Pass', data.notes || '', JSON.stringify(data.responses || {}), stationId]
  );
  return { ...r.rows[0], responses: JSON.parse(r.rows[0].responses || '{}') };
}

async function ccRemove(id, stationId) {
  await pool.query('DELETE FROM checklist_completions WHERE id = $1 AND department_id = $2', [id, stationId]);
}

// ─── CAD Alerts ───────────────────────────────────────────────────────────────
async function cadAlertCreate(d) {
  const r = await pool.query(
    `INSERT INTO cad_alerts (alert_id, address, units, description, details, latitude, longitude, dispatched_at, raw, station_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (alert_id) DO NOTHING
     RETURNING *`,
    [d.alertId, d.address||'', d.units||'', d.description||'', d.details||'',
     d.latitude||null, d.longitude||null, d.dispatchedAt||new Date().toISOString(),
     d.raw ? JSON.stringify(d.raw) : null, d.stationId||1]
  );
  return r.rows[0] || null;
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
async function cadAlertFindById(id, departmentId) {
  const r = await pool.query(
    `SELECT * FROM cad_alerts WHERE id = $1 AND department_id = $2`, [id, departmentId]
  );
  return r.rows[0] || null;
}
// Soft-clear: dispatch resolves a call. Keeps the row (history); it just leaves
// the active feed. Idempotent.
async function cadAlertClear(id, departmentId) {
  const r = await pool.query(
    `UPDATE cad_alerts SET cleared_at = NOW() WHERE id = $1 AND department_id = $2 AND cleared_at IS NULL RETURNING id`,
    [id, departmentId]
  );
  return r.rows[0] || null;
}
async function cadAlertClearAll(departmentId) {
  const r = await pool.query(
    `UPDATE cad_alerts SET cleared_at = NOW() WHERE department_id = $1 AND cleared_at IS NULL`,
    [departmentId]
  );
  return r.rowCount;
}

// ─── Active Board ──────────────────────────────────────────────────────────────
async function activeBoardUpsert(stationId, data) {
  const { incidentType, address, dispatchedAt, personnelCount, unitsCount } = data;
  const { rows } = await pool.query(
    `INSERT INTO active_boards (station_id, incident_type, address, dispatched_at, personnel_count, units_count, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (station_id) DO UPDATE SET
       incident_type=$2, address=$3, dispatched_at=$4, personnel_count=$5, units_count=$6, updated_at=NOW()
     RETURNING *`,
    [stationId, incidentType||'', address||'', dispatchedAt||new Date(), personnelCount||0, unitsCount||0]
  );
  return rows[0];
}

async function activeBoardGet(stationId) {
  const { rows } = await pool.query('SELECT * FROM active_boards WHERE station_id=$1', [stationId]);
  return rows[0] || null;
}

async function activeBoardClear(stationId) {
  await pool.query('DELETE FROM active_boards WHERE station_id=$1', [stationId]);
}

async function activeBoardSetIncident(stationId, incidentId) {
  await pool.query('UPDATE active_boards SET incident_id=$2 WHERE station_id=$1', [stationId, incidentId]);
}

// ─── Unit Status Lifecycle (Phase 2) ───────────────────────────────────────
// Server-locked status enum (CAD-standard). 'out_of_service' mirrors the
// maintenance state and is read-only through this surface.
const UNIT_STATUS_VALUES = ['in_service', 'dispatched', 'enroute', 'on_scene', 'returning', 'on_the_air', 'out_of_service'];

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
         WHERE station_id=$1 AND status NOT IN ('in_service', 'out_of_service', 'on_the_air') RETURNING apparatus_id, designation`,
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
  incidents: { all: incAll, findById: incFindById, findByNumber: incFindByNumber, create: incCreate, update: incUpdate, remove: incRemove },
  training: { all: trAll, findById: trFindById, create: trCreate, update: trUpdate, remove: trRemove },
  trainingCourses: { all: tcAll, findById: tcFindById, create: tcCreate, update: tcUpdate, remove: tcRemove },
  trainingCourseCompletions: { allForUser: tccAllForUser, allForStation: tccAllForStation, upsert: tccUpsert, bulkImport: tccBulkImport },
  maintenance: { all: mntAll, findById: mntFindById, create: mntCreate, update: mntUpdate, remove: mntRemove },
  shifts: { all: shiftAll, findById: shiftFindById, create: shiftCreate, update: shiftUpdate, remove: shiftRemove },
  shiftPatterns: { all: spAll, findById: spFindById, create: spCreate, update: spUpdate, remove: spRemove, expand: expandPatterns },
  leaveRequests: { all: lrAll, findById: lrFindById, create: lrCreate, update: lrUpdate, remove: lrRemove },
  shiftSwaps: { all: ssAll, allForShift: ssAllForShift, findById: ssFindById, create: ssCreate, update: ssUpdate, remove: ssRemove },
  coverageOutreach: { all: outreachAll, allForLeave: outreachAllForLeave, allForShift: outreachAllForShift, findById: outreachFindById, create: outreachCreate, update: outreachUpdate, remove: outreachRemove },
  stationLog: { all: slAll, findById: slFindById, create: slCreate, update: slUpdate, remove: slRemove },
  fiProperties: { all: fiPropAll, findById: fiPropFindById, create: fiPropCreate, update: fiPropUpdate, remove: fiPropRemove },
  fiInspections: { all: fiInsAll, findById: fiInsFindById, create: fiInsCreate, update: fiInsUpdate, remove: fiInsRemove },
  fiPermits: { all: fiPermAll, findById: fiPermFindById, create: fiPermCreate, update: fiPermUpdate, remove: fiPermRemove },
  hydrants: { all: hydAll, findById: hydFindById, findByNumber: hydFindByNum, create: hydCreate, update: hydUpdate, remove: hydRemove },
  volunteerHours: { all: vhAll, findById: vhFindById, create: vhCreate, update: vhUpdate, remove: vhRemove },
  grants: { all: grAll, findById: grFindById, create: grCreate, update: grUpdate, remove: grRemove },
  mutualAid: { all: maAll, findById: maFindById, create: maCreate, update: maUpdate, remove: maRemove },
  sogs: { all: sogAll, findById: sogFindById, create: sogCreate, update: sogUpdate, remove: sogRemove },
  wellness: { all: wlAll, findByMemberId: wlFindByMemberId, create: wlCreate, update: wlUpdate, remove: wlRemove },
  recruitment: { all: rcAll, findById: rcFindById, create: rcCreate, update: rcUpdate, remove: rcRemove },
  events: { all: evAll, findById: evFindById, create: evCreate, update: evUpdate, remove: evRemove },
  prePlans: { all: ppAll, findById: ppFindById, create: ppCreate, update: ppUpdate, remove: ppRemove },
  drills: { all: drAll, findById: drFindById, create: drCreate, update: drUpdate, remove: drRemove },
  courses: { all: coAll, findById: coFindById, create: coCreate, update: coUpdate, remove: coRemove },
  assets: { all: astAll, findById: astFindById, create: astCreate, update: astUpdate, remove: astRemove },
  cylinders: { all: cylAll, findById: cylFindById, create: cylCreate, update: cylUpdate, remove: cylRemove },
  fillStations: { all: fsAll, create: fsCreate },
  cadConnections: { all: cadAll, findById: cadFindById, create: cadCreate, update: cadUpdate, remove: cadRemove },
  investigations: { all: invAll, findById: invFindById, create: invCreate, update: invUpdate, remove: invRemove },
  payEntries: { all: peAll, findById: peFindById, create: peCreate, update: peUpdate, remove: peRemove },
  crrVisits: { all: cvAll, findById: cvFindById, create: cvCreate, update: cvUpdate, remove: cvRemove },
  crrPrograms: { all: cpAll, findById: cpFindById, create: cpCreate, update: cpUpdate, remove: cpRemove },
  budgetLines: { all: blAll, findById: blFindById, create: blCreate, update: blUpdate, remove: blRemove },
  budgetTransactions: { all: btAll, findById: btFindById, create: btCreate, update: btUpdate, remove: btRemove },
  nfirsReports: { all: nfAll, findById: nfFindById, create: nfCreate, update: nfUpdate, remove: nfRemove },
  checklistTemplates: { all: ctAll, findById: ctFindById, create: ctCreate, update: ctUpdate, remove: ctRemove },
  checklistCompletions: { all: ccAll, findById: ccFindById, create: ccCreate, remove: ccRemove },
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
  cadAlerts: { create: cadAlertCreate, recent: cadAlertRecent, findById: cadAlertFindById, clear: cadAlertClear, clearAll: cadAlertClearAll },
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
  activeBoard: { upsert: activeBoardUpsert, get: activeBoardGet, clear: activeBoardClear, setIncident: activeBoardSetIncident },
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
    async respond(recallId, memberId, memberName, response, eta) {
      const { rows } = await pool.query(
        `INSERT INTO recall_responses (recall_id, member_id, member_name, response, eta)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (recall_id, member_id) DO UPDATE
           SET response = $4, eta = $5, responded_at = NOW()
         RETURNING *`,
        [recallId, memberId, memberName, response, eta || '']
      );
      return rows[0];
    },
    async close(id, stationId) {
      const { rows } = await pool.query(
        `UPDATE recall_events SET status='closed', closed_at=NOW()
         WHERE id=$1 AND station_id=$2 RETURNING *`,
        [id, stationId]
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
    async toggle(stationId, userId, memberName, available) {
      const { rows } = await pool.query(
        `INSERT INTO member_availability (station_id, user_id, member_name, available, updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (station_id, user_id)
         DO UPDATE SET available = $4, member_name = $3, updated_at = NOW()
         RETURNING *`,
        [stationId, userId, memberName, available]
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
