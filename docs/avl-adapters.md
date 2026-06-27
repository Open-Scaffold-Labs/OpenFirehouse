# Adding an AVL vendor adapter

How to onboard a new vehicle-AVL provider into OpenFirehouse. The ingestion engine
(ADR-0003) is built so each vendor's data format plugs into **one place** — an adapter.
Adding a vendor is a single small file + one registry line + a test. No changes to auth,
storage, realtime, or the command map.

## The one rule (read first)

**Only write an adapter against the vendor's real, verified API/webhook spec. Never guess a
format.** A mis-parsed location feed silently mis-plots a rig on the command map — that's a
life-safety failure. If you don't have the vendor's documented payload, you don't have an
adapter yet; use the `generic` JSON contract or `nmea` until you do.

## What an adapter is

A pure function that turns the vendor's raw payload into OF's **canonical fix shape**, and
nothing else (no DB, no network, no side effects):

```
parse(payload) -> Array<Fix>
```

Canonical `Fix`:

| field      | type            | notes |
|------------|-----------------|-------|
| `deviceRef`| string \| null  | the vendor's device/unit id (modem serial, GPS id, unit ref). `null` if the format carries none (e.g. raw NMEA) — the connection/request supplies it. |
| `lat`      | number          | decimal degrees |
| `lng`      | number          | decimal degrees |
| `heading`  | number \| null  | degrees |
| `speed`    | number \| null  | **metres/second** (convert knots/mph/kmh) |
| `accuracy` | number \| null  | **metres** (e.g. HDOP × nominal) |
| `ts`       | number \| null  | epoch **ms** (or null) |

The orchestrator (`server/src/avl/index.js`) does everything downstream: validation, the
**100 m accuracy gate** (`server/src/avl/fix.js`), `deviceRef → apparatus` mapping, the
`unit_locations` upsert, and the realtime broadcast. **Your adapter must not duplicate any of
that — just parse.**

## Recipe (≈ an afternoon)

1. **Get the vendor's real spec** — a sample payload + field docs. Save a representative
   sample for the test.
2. **Create `server/src/avl/adapters/<vendor>.js`** exporting `parse(payload)`. Map the
   vendor's fields to the canonical `Fix` shape. Coerce units (speed → m/s; accuracy → m).
   Be tolerant of missing optional fields; return `[]` for anything you can't parse rather
   than throwing.
3. **Register it** — add one line to `server/src/avl/adapters/index.js`:
   ```js
   const acme = require('./acme');
   const ADAPTERS = { generic, nmea, acme };
   ```
   The `vendorId` on the AVL connection selects the adapter (falls back to `generic`).
4. **Test it** — add cases to `server/src/tests/avlAdapters.test.js` using the **real sample
   payload**, asserting a known decode (lat/lng/speed). Run:
   ```
   cd server && node --test --test-force-exit src/tests/avlAdapters.test.js
   ```
5. **Onboard a department** — in the app: **Vehicle AVL** (chief) → create a feed with that
   `vendorId` → it shows a one-time secret + the ingest URL. Point the vendor's outbound feed
   at `POST /api/avl/ingest` (or `/api/avl/ingest/<vendorId>`) with header
   `X-AVL-Secret: <secret>`, then map each device id → apparatus. Done.

## Template

```js
'use strict';
/**
 * server/src/avl/adapters/<vendor>.js — <Vendor> AVL adapter (ADR-0003).
 * Written against <Vendor>'s documented webhook spec vX (link). Sample payload
 * in src/tests/avlAdapters.test.js. Pure: payload -> canonical fixes, no I/O.
 */
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function one(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const lat = num(rec.<latField>);
  const lng = num(rec.<lngField>);
  if (lat == null || lng == null) return null;       // skip records without a position
  return {
    deviceRef: rec.<idField> != null ? String(rec.<idField>) : null,
    lat,
    lng,
    heading: num(rec.<headingField>),
    speed: num(rec.<speedField>) /* * <to-m/s factor> */,
    accuracy: num(rec.<accuracyField>),
    ts: rec.<tsField> ? Date.parse(rec.<tsField>) : null,
  };
}

function parse(payload) {
  let data = payload;
  if (typeof payload === 'string') { try { data = JSON.parse(payload); } catch { return []; } }
  const arr = Array.isArray(data) ? data
    : (data && Array.isArray(data.<arrayField>)) ? data.<arrayField>
    : (data && typeof data === 'object') ? [data] : [];
  return arr.map(one).filter(Boolean);
}

module.exports = { parse };
```

## Reference adapters

- `generic.js` — OF's own JSON contract (alias-tolerant). Use as the model for a JSON vendor.
- `nmea.js` — NMEA-0183 (RMC/GGA). Use as the model for a raw-GPS/text format, and note how
  `deviceRef` is `null` (supplied by the connection, stamped in `fix.js normalizeFixes`).

## See also

`docs/adr/ADR-0003-avl-vehicle-location-ingestion.md` (architecture + auth + data model).
