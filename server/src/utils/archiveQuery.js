/**
 * archiveQuery.js — the ONE query builder for the dispatch archive.
 *
 * Both the list view and the CSV export call this. That is deliberate: if the
 * export re-ran a slightly different query than the list, a chief would eventually
 * find that the number on screen and the number in the export disagree, and every
 * report we produce would lose its credibility. One builder, two renderers.
 *
 * Design notes that are load-bearing:
 *
 *  • UNIT FILTER IS NEVER `LIKE`. It joins cad_alert_units on apparatus_id (exact),
 *    falling back to the normalized token for mutual-aid rigs that aren't in the
 *    fleet. `units LIKE '%Engine 1%'` matches Engine 10/100 AND misses "E1" — both
 *    directions of wrong. Proven on our own prod data: substring said Engine 1 ran
 *    18 calls; it actually ran 19.
 *
 *  • DATES ARE INSTANTS, NOT CALENDAR DAYS. The caller sends `from`/`to` as ISO
 *    timestamps (the client converts the user's local day boundaries). We do NOT
 *    filter on a UTC calendar date: `dispatched_at::date = '2026-07-11'` puts an
 *    8pm-Eastern call on the WRONG DAY, because in UTC it's already tomorrow.
 *    (This exact class of bug is live elsewhere in the app — 48 components compute
 *    "today" with toISOString(). Not repeating it here.)
 *
 *  • KEYSET PAGINATION, NOT OFFSET. An archive is append-only and unbounded. OFFSET
 *    degrades deep in the table and — worse — can skip or duplicate rows when a new
 *    call lands mid-scroll. We page on (dispatched_at DESC, id DESC).
 */

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * @param {object} f  filters
 *   from, to       ISO instants (inclusive from, exclusive to)
 *   unitIds        number[]  apparatus ids (exact match — the safe path)
 *   unitTokens     string[]  normalized tokens, for mutual-aid rigs not in the fleet
 *   type           string    nature/description contains
 *   address        string    address contains
 *   q              string    free text over description/address/details/alert_id
 *   station        number
 *   includeCleared bool      default TRUE — the archive is the HISTORY; a cleared
 *                            call is the normal case, not an exclusion
 *   cursor         {ts, id}  keyset cursor from the previous page
 *   limit          number
 * @param {number} departmentId  ALWAYS from the JWT — never from the client
 */
function buildArchiveQuery(f = {}, departmentId) {
  if (!departmentId) throw new Error('departmentId is required (fail closed)');

  const where = ['a.department_id = $1'];
  const params = [departmentId];
  const p = (v) => { params.push(v); return `$${params.length}`; };

  if (f.from)    where.push(`a.dispatched_at >= ${p(f.from)}`);
  if (f.to)      where.push(`a.dispatched_at <  ${p(f.to)}`);
  if (f.station) where.push(`a.station_id = ${p(f.station)}`);

  if (f.type)    where.push(`a.description ILIKE ${p('%' + f.type + '%')}`);
  if (f.address) where.push(`a.address ILIKE ${p('%' + f.address + '%')}`);
  if (f.q) {
    const t = p('%' + f.q + '%');
    where.push(`(a.description ILIKE ${t} OR a.address ILIKE ${t} OR a.details ILIKE ${t} OR a.alert_id ILIKE ${t})`);
  }

  // Unit filter — EXISTS against the join table. Exact on apparatus_id; token match
  // only for rigs that legitimately have no apparatus_id (mutual aid).
  const unitIds = (f.unitIds || []).filter(n => Number.isInteger(n));
  const unitTokens = (f.unitTokens || []).filter(Boolean).map(s => String(s).toUpperCase());
  if (unitIds.length || unitTokens.length) {
    const clauses = [];
    if (unitIds.length)    clauses.push(`u.apparatus_id = ANY(${p(unitIds)})`);
    if (unitTokens.length) clauses.push(`u.unit_norm    = ANY(${p(unitTokens)})`);
    where.push(`EXISTS (
      SELECT 1 FROM cad_alert_units u
       WHERE u.cad_alert_id = a.id
         AND u.department_id = a.department_id
         AND (${clauses.join(' OR ')}))`);
  }

  // Keyset cursor: strictly "older than" the last row of the previous page.
  if (f.cursor && f.cursor.ts && f.cursor.id) {
    const ts = p(f.cursor.ts), id = p(f.cursor.id);
    where.push(`(a.dispatched_at, a.id) < (${ts}::timestamptz, ${id}::int)`);
  }

  const limit = Math.min(Math.max(parseInt(f.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  // The unit chips come back with the row — one query, not N+1 per call.
  const sql = `
    SELECT a.id, a.alert_id, a.description, a.address, a.details,
           a.latitude, a.longitude, a.dispatched_at, a.cleared_at, a.station_id,
           a.units AS units_raw,
           COALESCE((
             SELECT json_agg(json_build_object(
                      'unit', u.unit_raw, 'apparatusId', u.apparatus_id,
                      'ambiguous', u.ambiguous, 'enrouteAt', u.enroute_at,
                      'arrivedAt', u.arrived_at, 'clearedAt', u.cleared_at)
                      ORDER BY u.seq)
               FROM cad_alert_units u WHERE u.cad_alert_id = a.id
           ), '[]'::json) AS units
      FROM cad_alerts a
     WHERE ${where.join('\n       AND ')}
     ORDER BY a.dispatched_at DESC, a.id DESC
     LIMIT ${limit + 1}`;   // +1 row = "is there a next page", without a COUNT(*)

  // The exact same WHERE, for the total count shown next to the results.
  const countSql = `SELECT count(*)::int AS total FROM cad_alerts a WHERE ${where.join(' AND ')}`;

  return { sql, countSql, params, limit };
}

module.exports = { buildArchiveQuery, MAX_LIMIT, DEFAULT_LIMIT };
