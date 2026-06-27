'use strict';
/**
 * server/src/cad/types.js — shared types for the CAD adapter framework.
 *
 * The framework is JavaScript (not TypeScript) for consistency with the rest
 * of the server, so types live in JSDoc. Any new CAD vendor adapter MUST
 * produce a CadIncident from the vendor's payload, and the framework hands
 * that off to the shared pipeline (server/src/cad/pipeline.js) for
 * persistence and broadcast.
 *
 * See docs/CAD_INTEGRATION_STRATEGY.md for the broader context.
 */

/**
 * Normalized representation of a dispatched incident. Every CAD adapter
 * produces this shape regardless of the upstream payload format.
 *
 * @typedef {Object} CadIncident
 * @property {string}        alertId       Vendor-side stable ID. Used for
 *                                         de-duplication; if the same alertId
 *                                         arrives twice, the second one is
 *                                         dropped.
 * @property {string}        address       Normalized address string, suitable
 *                                         for display in the dispatch view.
 * @property {string}        units         Comma-separated unit identifiers
 *                                         (e.g. "E41,L23,BC1").
 * @property {string}        description   Short call-type / nature string.
 * @property {string}        details       Free-text narrative, comments, or
 *                                         notes from the dispatcher.
 * @property {number|null}   latitude
 * @property {number|null}   longitude
 * @property {string}        dispatchedAt  ISO 8601 timestamp.
 * @property {Object}        raw           Original vendor payload, preserved
 *                                         for audit and debugging.
 * @property {number}        stationId     Which station this dispatch belongs
 *                                         to. Adapters that can derive this
 *                                         from the payload should; adapters
 *                                         that cannot should rely on the
 *                                         pipeline's station-resolution
 *                                         fallback.
 * @property {string}        source        Vendor slug — must match the
 *                                         adapter's `name` field.
 */

/**
 * Result of an adapter's parse() function.
 *
 * @typedef {{ ok: true, incident: CadIncident } | { ok: false, status: number, error: string }} ParseResult
 */

/**
 * Result of an adapter's optional authenticate() function. Adapters that need
 * to verify HMAC signatures, OAuth bearer tokens, or shared secrets implement
 * this. The framework calls authenticate() before parse(); if authenticate
 * returns ok:false, the request is rejected and parse() is never called.
 *
 * @typedef {{ ok: true, stationId?: number } | { ok: false, status: number, error: string }} AuthResult
 */

/**
 * A CAD adapter. One file per vendor in server/src/cad/adapters/.
 *
 * @typedef {Object} CadAdapter
 * @property {string} name
 *   Lowercase vendor slug. Used in the route URL as POST /api/cad/:name.
 *   MUST be URL-safe; conventionally one word, no hyphens.
 * @property {string} displayName
 *   Human-readable name for documentation and the webhook-URL settings page.
 * @property {(req: import('express').Request) => Promise<AuthResult>} [authenticate]
 *   Optional. Vendor-specific authentication. If omitted, the endpoint is
 *   treated as a public webhook with no verification (acceptable when the
 *   vendor sends from a known IP range or when the webhook URL itself is
 *   the secret).
 * @property {(req: import('express').Request, authStationId?: number) => Promise<ParseResult>} parse
 *   Vendor-specific payload parser. Receives the Express request and the
 *   stationId returned by authenticate() (if any). Returns a CadIncident or
 *   an error response.
 * @property {{ setupUrl?: string, payloadFormat?: string, notes?: string }} [docs]
 *   Optional metadata surfaced in the settings UI to help department admins
 *   configure their CAD account.
 */

module.exports = {};
