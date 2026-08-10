'use strict';
/**
 * responseReports.js — 4.1g · NFPA 1710 response-time compliance.
 *
 * Spec: docs/PHASE4-ANALYTICS-SPEC-2026-07-26.md
 * Vocabulary: constants/responseMetrics.js (closed set, exact match, every
 * target citing its edition and section).
 *
 * ─── WHERE THE NUMBERS COME FROM ────────────────────────────────────────────
 * The unit-status ladder, which is real timestamptz written by a human after
 * radio traffic or relayed from CAD:
 *     turnout  = dispatched -> enroute      (per unit)
 *     travel   = enroute    -> on_scene     (per unit)
 *     total    = the call's dispatch -> first arrival on scene
 *
 * Attribution comes from the run-number association (0100/0103). A status change
 * with no incident cannot be attributed to a call and is simply not in the data
 * set — it is not guessed into one by timing.
 *
 * ─── WHAT THIS DOES NOT DO ──────────────────────────────────────────────────
 * • ALARM HANDLING is `not_captured`. cad_alerts.call_answered_at and
 *   call_arrival_at are 0% populated on prod — no feed carries them yet. A
 *   segment nobody recorded stays not_captured; it is never defaulted and never
 *   inferred (the doctrine already ledgered in migration 0061).
 * • TOTAL RESPONSE is DISPATCH-ANCHORED, not PSAP-anchored, because there is no
 *   PSAP timestamp. It is labelled that way in the response. NFPA's total starts
 *   at PSAP receipt; claiming that anchor without the data would be a false
 *   claim in a document a chief hands to their AHJ.
 * • Objectives (4), (7) and (8) are NOT computed — they need staffing-at-arrival
 *   and per-unit capability flags OF does not have. They are NAMED in the
 *   response with the reason, so the reader sees "not captured" rather than a
 *   shorter list that looks complete.
 *
 * ─── CORRECTNESS ────────────────────────────────────────────────────────────
 * • An interval that ends before it starts is a DEFECT, counted and excluded —
 *   never silently complemented to 24 h, which is what the old responseAnalytics
 *   route did and how an out-of-order timestamp became a plausible number.
 * • The server does not derive "today": the period is a parameter (the
 *   fiReports/checks doctrine).
 * • percentile_cont in SQL. This is the repo's first use — `percentile_cont`
 *   appeared zero times before this file.
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { scoped, httpError, validate } = require('../utils/routeKit');
const { requireOfficer, requireChief } = require('../middleware/requireRole');
const { pool } = require('../db');
const { audit } = require('../utils/auditLog');
const { toCsv } = require('../utils/csv');
const {
  EDITION, OBJECTIVES, objectiveByKey, OBJECTIVES_NOT_COMPUTED, SEGMENTS, REPORTING, METRIC_STATE,
  INCIDENT_CLASS,
} = require('../constants/responseMetrics');

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// station_id is OPTIONAL and filters to ONE house. Note the repo's documented
// naming collision: scoped() hands back the DEPARTMENT under the name
// `stationId`, while incidents.station_id is the actual firehouse. Both appear
// below and they are not the same thing.
const periodQuery = z.object({
  from: isoDay,
  to: isoDay,
  station_id: z.string().regex(/^\d+$/).optional(),
});

/**
 * Resolve a client-supplied house to one the CALLER'S DEPARTMENT actually owns.
 *
 * This is the same reviewed pattern as resolveRosterStation and the 0074
 * station-display pairing: station_id here is a HOUSE reference, NOT the tenant
 * key — department_id from the JWT remains the tenant key, and this query is
 * scoped by it. A foreign or absent station resolves to null and the route
 * REFUSES, rather than silently returning an empty report that a chief would
 * read as "no incidents that period".
 *
 * Takes the whole query object — the same shape as resolveRosterStation — so
 * exactly ONE line in the route touches client input and the tenancy guard has a
 * single, reviewable surface to allow.
 *
 * @returns {Promise<{requested: boolean, stationId: number|null}>}
 */
async function resolveOwnStation(departmentId, query) {
  const raw = query && query.station_id;
  if (raw === undefined || raw === null || raw === '') return { requested: false, stationId: null };
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return { requested: true, stationId: null };
  const { rows } = await pool.query(
    'SELECT id FROM stations WHERE id = $1 AND department_id = $2', [id, departmentId]
  );
  return { requested: true, stationId: rows[0]?.id ?? null };
}

/**
 * Per-unit segment seconds for every attributed incident in the period.
 * One query; the shaping happens in JS where it is testable.
 */
async function segmentRows(departmentId, from, to, stationFilter) {
  const { rows } = await pool.query(
    `WITH scoped AS (
       SELECT i.id, i.type, i.station_id, a.dispatched_at
         FROM incidents i
         JOIN cad_alerts a
           ON a.incident_id = i.id
          AND a.department_id = i.department_id
        WHERE i.department_id = $1
          AND i.deleted_at IS NULL
          AND i.date >= $2 AND i.date <= $3
          AND ($4::int IS NULL OR i.station_id = $4::int)
     ),
     per_unit AS (
       SELECT u.incident_id,
              ap.type AS apparatus_type,
              MIN(u.changed_at) FILTER (WHERE u.status = 'dispatched') AS t_disp,
              MIN(u.changed_at) FILTER (WHERE u.status = 'enroute')    AS t_enr,
              MIN(u.changed_at) FILTER (WHERE u.status = 'on_scene')   AS t_arr
         FROM unit_status_history u
         JOIN apparatus ap ON ap.id = u.apparatus_id
        WHERE u.department_id = $1
          AND u.incident_id IN (SELECT id FROM scoped)
        GROUP BY u.incident_id, u.apparatus_id, ap.type
     )
     SELECT s.id AS incident_id, s.type AS incident_type, s.dispatched_at,
            s.station_id, st.name AS station_name,
            p.apparatus_type,
            EXTRACT(EPOCH FROM (p.t_enr - p.t_disp)) AS turnout_s,
            EXTRACT(EPOCH FROM (p.t_arr - p.t_enr))  AS travel_s,
            EXTRACT(EPOCH FROM (p.t_arr - s.dispatched_at)) AS total_s
       FROM scoped s
       JOIN per_unit p ON p.incident_id = s.id
       LEFT JOIN stations st ON st.id = s.station_id`,
    [departmentId, from, to, stationFilter ?? null]
  );
  return rows;
}

/**
 * NFPA §4.1.2.5.2 requires performance to be evaluated "in each geographic area
 * within the jurisdiction", and §4.1.2.6.1 requires the annual report to NAME
 * the areas not meeting objectives. A single department-wide number hides the
 * one house that is failing behind three that are not — which is the entire
 * reason the standard asks for the split.
 */
function byStation(rows, summariseFn, collectFn) {
  const groups = new Map();
  for (const r of rows) {
    const key = r.station_id ?? 0;
    if (!groups.has(key)) groups.set(key, { station_id: r.station_id ?? null, station_name: r.station_name ?? null, rows: [] });
    groups.get(key).rows.push(r);
  }
  return [...groups.values()].map((g) => {
    const t = collectFn(g.rows, 'turnout_s');
    const v = collectFn(g.rows, 'travel_s');
    const firsts = new Map();
    for (const r of g.rows) {
      const n = r.total_s === null ? null : Number(r.total_s);
      if (n === null || !Number.isFinite(n) || n < 0) continue;
      const cur = firsts.get(r.incident_id);
      if (cur === undefined || n < cur) firsts.set(r.incident_id, n);
    }
    return {
      station_id: g.station_id,
      station_name: g.station_name,
      incidents: new Set(g.rows.map((r) => r.incident_id)).size,
      turnout: { ...summariseFn(t.values), defects: t.defects },
      travel: { ...summariseFn(v.values), defects: v.defects },
      total_response: { ...summariseFn([...firsts.values()]), defects: 0 },
    };
  }).sort((a, b) => (a.station_id ?? 0) - (b.station_id ?? 0));
}

/** Exclusive-of-nulls, and an interval that ends before it starts is a DEFECT. */
function collect(rows, field) {
  const values = [];
  let defects = 0;
  for (const r of rows) {
    const v = r[field];
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (n < 0) { defects++; continue; }   // out of order — reported, never wrapped
    values.push(n);
  }
  return { values, defects };
}

/** The 90th percentile, linear interpolation — the same shape as percentile_cont. */
function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function summarise(values) {
  if (!values.length) return { n: 0, p90_seconds: null, state: METRIC_STATE.NOT_CAPTURED };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p90_seconds: Math.round(percentile(sorted, REPORTING.PERCENTILE) * 10) / 10,
    state: METRIC_STATE.OK,
  };
}

/** Department overrides from 0101; absence means "use the standard". */
async function benchmarkOverrides(departmentId) {
  const map = new Map();
  try {
    const { rows } = await pool.query(
      'SELECT objective_key, target_seconds, target_fraction FROM response_benchmarks WHERE department_id = $1',
      [departmentId]
    );
    for (const r of rows) map.set(r.objective_key, r);
  } catch (_) {
    // 0101 may not be applied on an older deployment — the standard's defaults
    // still produce a correct report, so this is not fatal.
  }
  return map;
}

/**
 * The compliance report, computed once.
 *
 * The JSON route and the CSV export BOTH call this. A separate query for the
 * export is how a downloaded report starts disagreeing with the screen it was
 * downloaded from — and the chief only finds out when someone at the AHJ
 * compares them.
 */
async function buildComplianceReport(departmentId, from, to, house) {
    // A house the caller's department does not own is REFUSED, not quietly
    // ignored — an empty report reads as "no incidents", which is a different
    // and much worse answer than "that is not your station".
    const stationFilter = house.stationId;
    const rows = await segmentRows(departmentId, from, to, stationFilter);
    const overrides = await benchmarkOverrides(departmentId);

    // ── segments, department-wide ──
    const turnout = collect(rows, 'turnout_s');
    const travel = collect(rows, 'travel_s');
    // Total response is per INCIDENT (first arrival), not per unit.
    const firstArrival = new Map();
    for (const r of rows) {
      const v = r.total_s === null ? null : Number(r.total_s);
      if (v === null || !Number.isFinite(v) || v < 0) continue;
      const cur = firstArrival.get(r.incident_id);
      if (cur === undefined || v < cur) firstArrival.set(r.incident_id, v);
    }

    const segments = [
      { key: SEGMENTS.TURNOUT.key, label: SEGMENTS.TURNOUT.label,
        source: SEGMENTS.TURNOUT.source, defects: turnout.defects, ...summarise(turnout.values) },
      { key: SEGMENTS.TRAVEL.key, label: SEGMENTS.TRAVEL.label,
        source: SEGMENTS.TRAVEL.source, defects: travel.defects, ...summarise(travel.values) },
      { key: SEGMENTS.TOTAL_RESPONSE.key, label: SEGMENTS.TOTAL_RESPONSE.label,
        source: SEGMENTS.TOTAL_RESPONSE.source, defects: 0,
        anchor: 'dispatch',
        anchor_note: 'dispatch-anchored, not PSAP-anchored — no PSAP timestamp is captured',
        ...summarise([...firstArrival.values()]) },
      // Alarm handling: the columns exist (0061) and carry nothing.
      { key: SEGMENTS.ALARM_HANDLING.key, label: SEGMENTS.ALARM_HANDLING.label,
        source: SEGMENTS.ALARM_HANDLING.source, n: 0, p90_seconds: null, defects: 0,
        state: METRIC_STATE.NOT_CAPTURED,
        not_captured_reason: 'no PSAP call-answered/arrival timestamp is recorded — never defaulted' },
    ];

    // ── objectives we can compute ──
    const fireTurnout = [];
    const emsTurnout = [];
    const engineTravel = [];
    for (const r of rows) {
      const cls = INCIDENT_CLASS.FIRE.includes(r.incident_type) ? 'fire'
        : INCIDENT_CLASS.EMS.includes(r.incident_type) ? 'ems' : null;
      const t = r.turnout_s === null ? null : Number(r.turnout_s);
      if (t !== null && Number.isFinite(t) && t >= 0) {
        if (cls === 'fire') fireTurnout.push(t);
        else if (cls === 'ems') emsTurnout.push(t);
      }
      const tr = r.travel_s === null ? null : Number(r.travel_s);
      if (tr !== null && Number.isFinite(tr) && tr >= 0 && r.apparatus_type === 'Engine') {
        engineTravel.push(tr);
      }
    }

    const computable = {
      turnout_fire: fireTurnout,
      turnout_ems: emsTurnout,
      travel_first_engine: engineTravel,
    };

    const objectives = OBJECTIVES
      .filter((o) => computable[o.key] !== undefined)
      .map((o) => {
        const values = computable[o.key];
        const ov = overrides.get(o.key);
        const targetSeconds = ov?.target_seconds ?? o.seconds;
        const targetFraction = ov?.target_fraction != null ? Number(ov.target_fraction) : o.fraction;
        const summary = summarise(values);
        const meeting = values.filter((v) => v <= targetSeconds).length;
        return {
          key: o.key, objective: o.n, applies_to: o.applies_to, source: o.source,
          ...summary,
          target_seconds: targetSeconds,
          target_fraction: targetFraction,
          target_is_department_override: !!ov,
          fraction_meeting: values.length ? Math.round((meeting / values.length) * 1000) / 1000 : null,
          meets_objective: values.length ? (meeting / values.length) >= targetFraction : null,
        };
      });

    return {
        period: { from, to },
        edition: EDITION,
        percentile: REPORTING.PERCENTILE,
        station_filter: stationFilter,
        segments,
        // Per-house split — NFPA §4.1.2.5.2 evaluates "in each geographic area",
        // and §4.1.2.6.1 requires the annual report to NAME the areas that are
        // not meeting objectives. A department-wide number hides the one house
        // that is failing behind the three that are not.
        by_station: byStation(rows, summarise, collect),
        objectives,
        // Named, not omitted — a shorter list would read as complete.
        not_computed: [
          ...OBJECTIVES_NOT_COMPUTED,
          { key: 'alarm_handling', reason: 'no PSAP timestamp is captured' },
        ],
    };
}

// GET /api/response-reports/compliance?from=&to=&station_id=
router.get('/compliance',
  requireOfficer,
  validate({ query: periodQuery }),
  scoped(async ({ req, stationId }) => {
    const { from, to } = req.query;
    const house = await resolveOwnStation(stationId, req.query);
    if (house.requested && house.stationId === null) {
      throw httpError(404, 'No such station in your department', 'STATION_NOT_FOUND');
    }
    return { data: await buildComplianceReport(stationId, from, to, house) };
  }));

/** mm:ss, or blank. A CSV cell must never carry the word "null". */
function csvTime(seconds) {
  if (seconds === null || seconds === undefined) return '';
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Render a compliance report to CSV rows + columns.
 *
 * Extracted from the .csv route so SCHEDULED delivery (routes/cronReportDelivery)
 * emits a byte-identical file to the one a user downloads. Two renderers is how
 * an emailed report starts disagreeing with the page it claims to come from —
 * the same reason the export was built on buildComplianceReport() rather than
 * its own query.
 */
function renderComplianceCsv(rep, from, to) {
  const cols = [
    { key: 'section', header: 'Section' },
    { key: 'item', header: 'Item' },
    { key: 'p90', header: '90th percentile (mm:ss)' },
    { key: 'target', header: 'Target (mm:ss)' },
    { key: 'meeting', header: 'Meeting target' },
    { key: 'n', header: 'n' },
    { key: 'note', header: 'Note' },
  ];

  const rows = [];
  for (const s of rep.segments) {
    rows.push({
      section: 'Segment', item: s.label,
      p90: csvTime(s.p90_seconds), target: '', meeting: '', n: s.n,
      // "not captured" in the cell, never an empty-looking zero.
      note: s.state !== 'ok'
        ? `not captured — ${s.not_captured_reason || 'no data'}`
        : [s.anchor_note, s.defects ? `${s.defects} discarded (timestamp ended before it started)` : null]
          .filter(Boolean).join('; '),
    });
  }
  for (const o of rep.objectives) {
    rows.push({
      section: 'Objective', item: o.applies_to,
      p90: csvTime(o.p90_seconds),
      target: csvTime(o.target_seconds),
      meeting: o.fraction_meeting === null ? ''
        : `${Math.round(o.fraction_meeting * 100)}% of ${Math.round(o.target_fraction * 100)}%`,
      n: o.n,
      note: [o.source, o.target_is_department_override ? 'department-adopted target' : null]
        .filter(Boolean).join('; '),
    });
  }
  for (const st of rep.by_station) {
    rows.push({
      section: 'Station', item: st.station_name || `Station ${st.station_id}`,
      p90: csvTime(st.turnout.p90_seconds),
      target: '', meeting: '', n: st.incidents,
      note: `turnout ${csvTime(st.turnout.p90_seconds) || '—'}; travel ${csvTime(st.travel.p90_seconds) || '—'}; total ${csvTime(st.total_response.p90_seconds) || '—'}`,
    });
  }
  for (const nc of rep.not_computed) {
    rows.push({ section: 'Not measured', item: nc.key, p90: '', target: '', meeting: '', n: '', note: nc.reason });
  }
  rows.push({ section: 'Report', item: 'Period', p90: '', target: '', meeting: '', n: '', note: `${from} to ${to}` });
  rows.push({ section: 'Report', item: 'Standard', p90: '', target: '', meeting: '', n: '',
    note: `${rep.edition.standard} (${rep.edition.year}), amended by ${rep.edition.amended_by}` });
  rows.push({ section: 'Report', item: 'Successor', p90: '', target: '', meeting: '', n: '', note: rep.edition.successor });
  rows.push({ section: 'Report', item: 'Percentile', p90: '', target: '', meeting: '', n: '',
    note: `${Math.round(rep.percentile * 100)}th` });

  return toCsv(rows, cols);
}

/**
 * GET /api/response-reports/compliance.csv — the same report, as a file.
 *
 * ~8 of 9 surveyed platforms ship CSV export, so this is at the bar. Built on
 * the SAME buildComplianceReport() the screen uses — a separate query for the
 * export is how a downloaded file starts disagreeing with the page it came
 * from, and nobody notices until someone at the AHJ compares them.
 *
 * scoped() supports this because it returns early when the handler has already
 * written to res (headersSent), so a file download keeps the same fail-closed
 * tenancy guard as every JSON route.
 *
 * The footer rows are not decoration. A number in a spreadsheet outlives the
 * screen that explained it, so the file carries its own edition, percentile,
 * anchor deviations and the list of what was NOT measured. A bare table of
 * times would be read years later as though it were complete.
 */
router.get('/compliance.csv',
  requireOfficer,
  validate({ query: periodQuery }),
  scoped(async ({ req, res, stationId }) => {
    const { from, to } = req.query;
    const house = await resolveOwnStation(stationId, req.query);
    if (house.requested && house.stationId === null) {
      throw httpError(404, 'No such station in your department', 'STATION_NOT_FOUND');
    }
    const rep = await buildComplianceReport(stationId, from, to, house);

    const fname = `response-compliance-${from}_to_${to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(renderComplianceCsv(rep, from, to));
  }));

/**
 * GET /api/response-reports/heatmap — incident density.
 *
 * Heat maps are the single most consistently advertised analytics feature in
 * this market (~6 of 9 platforms), so this is squarely at the bar, not past it.
 *
 * ─── WHERE THE LOCATIONS COME FROM, AND THE HONEST LIMIT ────────────────────
 * incidents carry NO coordinates — there is no latitude/longitude column on the
 * table at all. The only geocoded thing in OF is cad_alerts.latitude/longitude,
 * so an incident is plottable ONLY through its call association (0100/0103), and
 * only when the CAD carried coordinates. On prod today that is 10 of 30 calls.
 *
 * We do NOT geocode addresses to fill the gap. That is an external call, a write
 * surface, and a guess about where a legal record happened. A map that plots
 * what it has and SAYS how much it could not plot is honest; a map silently
 * showing a third of the calls reads as the department's whole call volume.
 *
 * Binning happens in SQL so the payload is small and raw incident locations are
 * not shipped wholesale to the browser.
 */
router.get('/heatmap',
  requireOfficer,
  validate({ query: periodQuery }),
  scoped(async ({ req, stationId }) => {
    const { from, to } = req.query;
    const house = await resolveOwnStation(stationId, req.query);
    if (house.requested && house.stationId === null) {
      throw httpError(404, 'No such station in your department', 'STATION_NOT_FOUND');
    }

    // ~0.002 degrees is roughly 200 m of latitude — a city-block-ish cell, which
    // is the granularity a district map is read at. Fixed rather than exposed:
    // a client-chosen bin size invites cells so small the map becomes a scatter
    // of 1s, which is not a density map.
    const BIN = 0.002;

    const { rows } = await pool.query(
      `SELECT ROUND((a.latitude  / $4)::numeric) * $4 AS lat,
              ROUND((a.longitude / $4)::numeric) * $4 AS lng,
              COUNT(*)::int AS count
         FROM incidents i
         JOIN cad_alerts a
           ON a.incident_id = i.id AND a.department_id = i.department_id
        WHERE i.department_id = $1
          AND i.deleted_at IS NULL
          AND i.date >= $2 AND i.date <= $3
          AND ($5::int IS NULL OR i.station_id = $5::int)
          AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL
          AND a.latitude BETWEEN -90 AND 90
          AND a.longitude BETWEEN -180 AND 180
          AND NOT (a.latitude = 0 AND a.longitude = 0)
        GROUP BY 1, 2
        ORDER BY count DESC`,
      [stationId, from, to, BIN, house.stationId]
    );

    // Two plain facts, not a rate: how many are on the map, and how many are
    // not. Without the second number a chief reads the dots as their whole call
    // volume. (A completeness PERCENTAGE was cut — this is a map legend.)
    const totals = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (
                WHERE a.latitude IS NOT NULL AND a.longitude IS NOT NULL
                  AND NOT (a.latitude = 0 AND a.longitude = 0)
              )::int AS plottable
         FROM incidents i
         LEFT JOIN cad_alerts a
           ON a.incident_id = i.id AND a.department_id = i.department_id
        WHERE i.department_id = $1
          AND i.deleted_at IS NULL
          AND i.date >= $2 AND i.date <= $3
          AND ($4::int IS NULL OR i.station_id = $4::int)`,
      [stationId, from, to, house.stationId]
    );

    const total = totals.rows[0]?.total ?? 0;
    const plottable = totals.rows[0]?.plottable ?? 0;

    return {
      data: {
        period: { from, to },
        station_filter: house.stationId,
        bin_degrees: BIN,
        cells: rows.map((r) => ({
          lat: Number(r.lat), lng: Number(r.lng), count: r.count,
        })),
        incidents_plotted: plottable,
        incidents_without_location: total - plottable,
        no_location_reason: 'the incident has no CAD call with coordinates — addresses are never geocoded to fill the gap',
      },
    };
  }));

/**
 * ─── ADOPTED TARGETS ────────────────────────────────────────────────────────
 * The market ships department-configurable targets: NFPA permits an AHJ to
 * modify the prescribed goals after a community risk assessment, and an agency's
 * ADOPTED benchmark is what its own reports are measured against.
 *
 * 0101 created the table and the compliance report already reads it — but until
 * now there was NO WRITE PATH AT ALL. The table could only be populated by
 * direct SQL, which is a migration shipped for a feature nobody could use. That
 * is the same defect I used to argue against building 0102, committed one
 * migration later.
 *
 * READ is officer+ (you see the target next to your performance). WRITE is
 * CHIEF ONLY and audited: a department's adopted response-time target is a claim
 * it makes to its AHJ, and it needs an attributable author.
 */

// GET /api/response-reports/benchmarks — adopted targets + the standard's defaults.
router.get('/benchmarks',
  requireOfficer,
  scoped(async ({ stationId }) => {
    const overrides = await benchmarkOverrides(stationId);
    return {
      data: OBJECTIVES
        .filter((o) => o.seconds !== null)   // (1) delegates; it has no single target
        .map((o) => {
          const ov = overrides.get(o.key);
          return {
            objective_key: o.key,
            applies_to: o.applies_to,
            source: o.source,
            standard_seconds: o.seconds,
            standard_fraction: o.fraction,
            adopted_seconds: ov?.target_seconds ?? null,
            adopted_fraction: ov?.target_fraction != null ? Number(ov.target_fraction) : null,
            is_adopted: !!ov,
          };
        }),
    };
  }));

const benchmarkBody = z.object({
  target_seconds: z.number().int().positive().max(86400).nullable().optional(),
  target_fraction: z.number().positive().max(1).nullable().optional(),
  rationale: z.string().max(2000).optional(),
});

// PUT /api/response-reports/benchmarks/:key — adopt a target. CHIEF ONLY.
router.put('/benchmarks/:key',
  requireChief,
  validate({ body: benchmarkBody }),
  scoped(async ({ req, stationId }) => {
    // The objective key is validated against the CLOSED SET, not stored blind.
    // An unrecognised key would otherwise sit in the table forever, matching
    // nothing, and silently do nothing — which reads to a chief as "I set my
    // target and it was ignored".
    const objective = objectiveByKey(req.params.key);
    if (!objective || objective.seconds === null) {
      throw httpError(404, `Unknown objective "${req.params.key}"`, 'UNKNOWN_OBJECTIVE');
    }
    const { target_seconds = null, target_fraction = null, rationale = null } = req.body;
    if (target_seconds === null && target_fraction === null) {
      throw httpError(422, 'Set a target time, a target percentage, or both', 'EMPTY_BENCHMARK');
    }

    const { rows } = await pool.query(
      `INSERT INTO response_benchmarks
         (department_id, objective_key, target_seconds, target_fraction, rationale, adopted_on, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6,NOW())
       ON CONFLICT (department_id, objective_key) DO UPDATE
         SET target_seconds = EXCLUDED.target_seconds,
             target_fraction = EXCLUDED.target_fraction,
             rationale = EXCLUDED.rationale,
             adopted_on = CURRENT_DATE,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
       RETURNING objective_key, target_seconds, target_fraction, rationale, adopted_on`,
      [stationId, objective.key, target_seconds, target_fraction, rationale, req.user.id]
    );
    audit(stationId, req.user, 'update', 'response_benchmarks', null, {
      objective_key: objective.key, target_seconds, target_fraction,
    });
    return { data: rows[0] };
  }));

// DELETE /api/response-reports/benchmarks/:key — revert to the standard.
router.delete('/benchmarks/:key',
  requireChief,
  scoped(async ({ req, stationId }) => {
    const objective = objectiveByKey(req.params.key);
    if (!objective) throw httpError(404, `Unknown objective "${req.params.key}"`, 'UNKNOWN_OBJECTIVE');
    await pool.query(
      'DELETE FROM response_benchmarks WHERE department_id = $1 AND objective_key = $2',
      [stationId, objective.key]
    );
    audit(stationId, req.user, 'delete', 'response_benchmarks', null, { objective_key: objective.key });
    // Absence means "use the standard" — reverting is a delete, not a write of
    // the default. Storing a copy of the standard would strand the row if NFPA
    // ever corrects the number.
    return { data: { objective_key: objective.key, reverted_to_standard: true } };
  }));

const coverageQuery = periodQuery.extend({
  min_n: z.string().regex(/^\d{1,3}$/).optional(),
});

/**
 * GET /api/response-reports/coverage — MEASURED travel-time performance by area.
 *
 * ─── WHY THIS IS NOT AN ISOCHRONE, AND WHY THAT IS THE RIGHT CALL ───────────
 * Roughly 3 of 9 surveyed platforms advertise "coverage analysis". A market pass
 * (2026-07-27) found the term covers two different things:
 *
 *   MODELED  — drive-time polygons computed from a road network by a routing
 *              engine. A PREDICTION: "a rig could theoretically reach here in
 *              4 minutes."
 *   MEASURED — the travel time actually achieved, from the department's own
 *              recorded incidents, aggregated by area.
 *
 * We build MEASURED, deliberately, for three reasons that survived checking:
 *
 * 1. The standards world grades the measured number. NFPA's objectives are
 *    framed as performance achieved on ≥90% of incidents — a measurement against
 *    your own record. ISO's FSRS goes further and explicitly accepts demonstrated
 *    240-second travel at 90% IN LIEU OF its road-distance test.
 * 2. Mainstream records platforms do not build routing themselves; where modeled
 *    coverage appears it is an integration with a commercial GIS platform, a
 *    simulation product, or a consulting deliverable. We have no routing engine
 *    and no road network, and acquiring one is a data problem, not a feature.
 * 3. A modeled polygon built on assumed speeds would disagree with this
 *    department's own CAD-recorded times — the literature finds exactly that
 *    divergence — and we would be shipping a number we cannot validate against
 *    the one we already hold.
 *
 * So the word "coverage" is NOT used in the UI for this. It is labelled
 * "measured travel-time performance", because calling measured data "coverage"
 * invites a reader to treat it as a prediction about places no rig has been.
 *
 * ─── THE HONEST LIMIT, WHICH IS CURRENTLY THE WHOLE STORY ───────────────────
 * A bin needs BOTH a location AND a travel time. Location lives only on
 * cad_alerts; travel time lives only on unit_status_history keyed by incident.
 * The join runs unit_status_history -> incidents -> cad_alerts, so a point is
 * measurable only where the call/incident association (0100/0103) exists.
 * That association is minted from real CAD traffic going forward and was
 * deliberately NOT backfilled — timing-matching is the cross-attribution the
 * association was built to eliminate. On prod today that means very few
 * measurable points, and the response SAYS the count rather than drawing a
 * confident map of two dots.
 */
router.get('/coverage',
  requireOfficer,
  validate({ query: coverageQuery }),
  scoped(async ({ req, stationId }) => {
    const { from, to } = req.query;
    const minN = Math.min(Math.max(parseInt(req.query.min_n, 10) || 3, 1), 100);
    const house = await resolveOwnStation(stationId, req.query);
    if (house.requested && house.stationId === null) {
      throw httpError(404, 'No such station in your department', 'STATION_NOT_FOUND');
    }

    // Same bin size as the heat map so the two layers line up on screen. A
    // reader comparing "where the calls are" with "how fast we get there"
    // must be looking at the same cells.
    const BIN = 0.002;

    const { rows } = await pool.query(
      `WITH scoped AS (
         SELECT i.id, a.latitude, a.longitude
           FROM incidents i
           JOIN cad_alerts a
             ON a.incident_id = i.id AND a.department_id = i.department_id
          WHERE i.department_id = $1
            AND i.deleted_at IS NULL
            AND i.date >= $2 AND i.date <= $3
            AND ($5::int IS NULL OR i.station_id = $5::int)
            AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL
            -- Same coordinate sanity as the heat map, so the two layers select
            -- the same incidents. A 0,0 fix is Null Island, not a call.
            AND a.latitude BETWEEN -90 AND 90
            AND a.longitude BETWEEN -180 AND 180
            AND NOT (a.latitude = 0 AND a.longitude = 0)
       ),
       per_incident AS (
         -- FIRST-ARRIVING unit, and labelled as such. NFPA's "first unit" is the
         -- one that can affect the outcome per the agency's critical task
         -- analysis, which is not necessarily the first to arrive. We compute
         -- MIN(arrival) because that is what we can know, and we never call it
         -- something it is not.
         SELECT u.incident_id,
                EXTRACT(EPOCH FROM (
                  MIN(u.changed_at) FILTER (WHERE u.status = 'on_scene')
                  - MIN(u.changed_at) FILTER (WHERE u.status = 'enroute')
                )) AS travel_s
           FROM unit_status_history u
          WHERE u.department_id = $1
            AND u.incident_id IN (SELECT id FROM scoped)
          GROUP BY u.incident_id
       )
       SELECT ROUND((s.latitude  / $4)::numeric) * $4 AS lat,
              ROUND((s.longitude / $4)::numeric) * $4 AS lng,
              COUNT(*)::int AS n,
              PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY p.travel_s) AS p90_travel_s,
              MIN(p.travel_s) AS fastest_s
         FROM scoped s
         JOIN per_incident p ON p.incident_id = s.id
        -- A negative interval means a timestamp ended before it started. That is
        -- a defect, not a fast response, and it is discarded rather than
        -- flattening someone's average.
        WHERE p.travel_s IS NOT NULL AND p.travel_s >= 0
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      [stationId, from, to, BIN, house.stationId]
    );

    // Every incident that could NOT contribute, and why. Three distinct causes
    // that must never collapse into one number — they have different fixes.
    const { rows: [gaps] } = await pool.query(
      `SELECT COUNT(*)::int AS incidents,
              COUNT(*) FILTER (WHERE a.id IS NULL)::int AS not_linked_to_a_call,
              COUNT(*) FILTER (WHERE a.id IS NOT NULL AND a.latitude IS NULL)::int AS linked_but_not_geocoded,
              COUNT(*) FILTER (WHERE a.id IS NOT NULL AND a.latitude IS NOT NULL
                               AND NOT EXISTS (
                                 SELECT 1 FROM unit_status_history u
                                  WHERE u.incident_id = i.id AND u.department_id = $1
                                    AND u.status = 'on_scene'))::int AS no_arrival_recorded
         FROM incidents i
         LEFT JOIN cad_alerts a
           ON a.incident_id = i.id AND a.department_id = i.department_id
        WHERE i.department_id = $1
          AND i.deleted_at IS NULL
          AND i.date >= $2 AND i.date <= $3
          AND ($4::int IS NULL OR i.station_id = $4::int)`,
      [stationId, from, to, house.stationId]
    );

    // Bins below the threshold are RETURNED but flagged, never silently dropped
    // and never drawn as though they were a reliable figure. A 90th percentile
    // over two incidents is noise wearing a statistic's clothes.
    const bins = rows.map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lng),
      n: r.n,
      p90_travel_seconds: r.p90_travel_s === null ? null : Math.round(Number(r.p90_travel_s)),
      sufficient: r.n >= minN,
    }));

    return {
      data: {
        period: { from, to },
        station_filter: house.stationId,
        bin_degrees: BIN,
        min_n: minN,
        measure: 'travel_first_arriving_unit',
        // Said in the payload, not only in the UI, so an exported or
        // machine-read copy carries its own definition.
        measure_note: 'Travel time actually recorded, en route to on scene, for the first-arriving unit. Measured performance — not a modeled drive-time prediction.',
        bins,
        bins_sufficient: bins.filter((b) => b.sufficient).length,
        incidents_measured: bins.reduce((sum, b) => sum + b.n, 0),
        // The reasons a chief can act on, separated because the fixes differ.
        not_measurable: {
          incidents_in_period: gaps.incidents,
          not_linked_to_a_call: gaps.not_linked_to_a_call,
          linked_but_not_geocoded: gaps.linked_but_not_geocoded,
          no_arrival_recorded: gaps.no_arrival_recorded,
        },
      },
    };
  }));

/**
 * GET /api/response-reports/incident-activity — the two most-named analytical
 * reports in competitor libraries: incident breakdown by type, and apparatus
 * call counts.
 *
 * OF already exports 14 record types, but they are ROW DUMPS. "Incident Log" as
 * a CSV of incidents is data; "how many structure fires did we run last quarter
 * and which rig went to the most calls" is an answer. Every surveyed platform
 * advertises the answers by name. That is the gap this closes.
 *
 * Both are honest about their denominators: incidents with no attributed call
 * contribute to the type breakdown (that only needs incidents.type) but NOT to
 * apparatus counts (which need the unit-status ladder). Those are different
 * denominators and the response says so rather than implying one number.
 */
router.get('/incident-activity',
  requireOfficer,
  validate({ query: periodQuery }),
  scoped(async ({ req, stationId }) => {
    const { from, to } = req.query;
    const house = await resolveOwnStation(stationId, req.query);
    if (house.requested && house.stationId === null) {
      throw httpError(404, 'No such station in your department', 'STATION_NOT_FOUND');
    }

    const byType = await pool.query(
      `SELECT COALESCE(NULLIF(i.type, ''), 'Unspecified') AS type,
              COUNT(*)::int AS count
         FROM incidents i
        WHERE i.department_id = $1
          AND i.deleted_at IS NULL
          AND i.date >= $2 AND i.date <= $3
          AND ($4::int IS NULL OR i.station_id = $4::int)
        GROUP BY 1
        ORDER BY count DESC, type ASC`,
      [stationId, from, to, house.stationId]
    );

    const byMonth = await pool.query(
      `SELECT substring(i.date from 1 for 7) AS month, COUNT(*)::int AS count
         FROM incidents i
        WHERE i.department_id = $1
          AND i.deleted_at IS NULL
          AND i.date >= $2 AND i.date <= $3
          AND ($4::int IS NULL OR i.station_id = $4::int)
        GROUP BY 1
        ORDER BY 1`,
      [stationId, from, to, house.stationId]
    );

    // Apparatus activity counts DISTINCT incidents a rig was dispatched to —
    // not status rows, or a rig that changed status four times on one call would
    // look four times as busy.
    const byApparatus = await pool.query(
      `SELECT ap.designation, ap.type AS apparatus_type,
              COUNT(DISTINCT u.incident_id)::int AS calls
         FROM unit_status_history u
         JOIN apparatus ap ON ap.id = u.apparatus_id
         JOIN incidents i ON i.id = u.incident_id
        WHERE u.department_id = $1
          AND u.incident_id IS NOT NULL
          AND i.deleted_at IS NULL
          AND i.date >= $2 AND i.date <= $3
          AND ($4::int IS NULL OR i.station_id = $4::int)
        GROUP BY ap.designation, ap.type
        ORDER BY calls DESC, ap.designation ASC`,
      [stationId, from, to, house.stationId]
    );

    const totals = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE i.cad_run_number IS NOT NULL)::int AS attributed
         FROM incidents i
        WHERE i.department_id = $1
          AND i.deleted_at IS NULL
          AND i.date >= $2 AND i.date <= $3
          AND ($4::int IS NULL OR i.station_id = $4::int)`,
      [stationId, from, to, house.stationId]
    );

    return {
      data: {
        period: { from, to },
        station_filter: house.stationId,
        total_incidents: totals.rows[0]?.total ?? 0,
        by_type: byType.rows,
        by_month: byMonth.rows,
        by_apparatus: byApparatus.rows,
        // DIFFERENT DENOMINATORS, said out loud. The type breakdown counts every
        // incident; apparatus counts only reach incidents whose unit-status rows
        // are attributed to a call. Presenting both as one total would be wrong.
        apparatus_basis: {
          incidents_with_unit_data: totals.rows[0]?.attributed ?? 0,
          note: 'apparatus counts cover only incidents whose unit times are attributed to a call; the type breakdown covers every incident',
        },
      },
    };
  }));

module.exports = router;
// Named exports so scheduled delivery runs the SAME builder and the SAME
// renderer as the interactive route. Never a second engine.
module.exports.buildComplianceReport = buildComplianceReport;
module.exports.renderComplianceCsv   = renderComplianceCsv;
