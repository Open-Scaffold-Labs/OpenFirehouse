# ADR-0003 — AVL / Vehicle Location Ingestion (hardware-modem feeds, login-independent)

**Status:** Accepted (build in progress) · **Date:** 2026-06-19 · **Owners:** Matt (+ Dale for review of the auth/DB surface)
**Supersedes/relates:** builds on the Phase-1 GPS pipeline (migration 0023, `unit_locations`) and mirrors the CAD ingestion architecture (per-department webhook secret + vendor adapter registry).

## Context

OpenFirehouse shows each apparatus on the command map from a live location feed. Today the only source is the **mounted iPad** (the unit-login device) reporting its own GPS. That is great for departments with no vehicle hardware (volunteer/budget-limited) — zero capital cost.

But the established fire/EMS market runs **hardware AVL**: an in-vehicle modem/router transmits the apparatus position **continuously whenever the truck is powered, independent of any login**. The crew's mobile terminal handles messaging/status; it does not gate whether the truck shows on the map. A crew cannot "log the truck off" the AVL map. (This also encodes a department doctrine: a rig's presence on the command map is a dispatch/chief decision, never a crew action — see the rig-terminal change shipped 2026-06-19.)

**To win rip-and-replace deals on day one, OF must ingest a department's existing hardware AVL feed** so they migrate with the *same* workflow — while still offering the iPad path for departments without hardware. Supporting **both** sources from one command map is the differentiator.

## Decision

Build a **complete, extensible AVL ingestion subsystem** that mirrors OF's proven CAD ingestion architecture (per-department secret auth + a vendor **adapter registry** + a shared normalize→store→broadcast pipeline). The command map and storage are already **source-agnostic** (`unit_locations` keyed by `apparatus_id`), so the work is entirely on the *receiving* side; nothing downstream changes.

The location dot's source becomes one of: (a) the mounted iPad app (existing), or (b) any number of hardware/cloud AVL feeds — all normalized into the same `unit_locations` upsert + realtime broadcast.

## Architecture (mirrors `server/src/cad/`)

```
server/src/avl/
  index.js          # ingest orchestrator: auth → adapter → normalize → upsert → broadcast
  deviceAuth.js     # per-department / per-device shared-secret verification (mirrors cad/webhookAuth.js)
  adapters/
    generic.js      # OF's own documented JSON contract (fully specified here — universal)
    nmea.js         # NMEA-0183 RMC/GGA sentence parsing (the universal GPS-hardware standard)
    <vendor>.js     # one per AVL/telematics provider — written ONLY against that vendor's real, verified API spec
  adapters/index.js # registry: vendorId → adapter
```

**Auth (`deviceAuth.js`):** per-department AVL credentials, secret stored as a **sha256 hash** (never plaintext), presented via `X-AVL-Secret` header / `Authorization: Bearer` / query (timing-safe compare), resolved to a department by a `SECURITY DEFINER` function — exactly the pattern in `cad/webhookAuth.js` + `of_cad_connection_by_webhook_secret`. Fail-closed in production (unset secret → 503). EXECUTE granted to `of_app` only.

**Mapping:** each feed carries a hardware/device identifier (modem id, GPS unit id, or the vendor's unit reference). A mapping resolves `(department_id, device_ref) → apparatus_id`. Implemented as `avl_devices(department_id, device_ref, apparatus_id, …)` so one department can register many trucks, and a device can be re-pointed to a different apparatus without code changes.

**Adapters:** each adapter's only job is `(rawPayload) → [{ deviceRef, lat, lng, heading?, speed?, accuracy?, ts? }]`. The orchestrator then validates (lat/lng range, **drop fixes worse than 100 m** — same gate as the iPad path), resolves the apparatus, and calls the existing `unitLocations.upsert` + `broadcastUnitLocationsUpdate`. **No new map/storage/realtime code** — total reuse.

**Universal formats shipped day 1 (no vendor cooperation needed):**
- **generic JSON** — OF's own contract, fully documented; any integrator/middleware can POST it.
- **NMEA-0183** — the standard nearly all GPS hardware emits (RMC for lat/lng/speed/heading, GGA for fix quality). A modem/gateway that can forward raw GPS sentences is supported with no custom code.

**Vendor adapters:** added per provider, each written against the provider's **real, published API/webhook spec** (verified, never guessed — a mis-parsed life-safety location feed is unacceptable). Same model as the CAD adapter set. New vendor = one new adapter file + a registry line (hours), not a rearchitecture.

## Endpoint

`POST /api/avl/ingest` (and/or `/api/avl/ingest/:vendorId`) — authed by the AVL device secret (NOT a user JWT). Returns fast (`204`), best-effort, never blocks the sender (mirrors the location PATCH + CAD webhook ergonomics). Accepts batch (a feed often posts many units at once).

## Data model (migration, mirrors `cad_connections`)

- `avl_connections(id, department_id, name, vendor_id, status, webhook_secret_hash, field_map, last_fix_at, fixes_ingested, created_at, updated_at)` — per-department feed config + secret hash.
- `avl_devices(id, department_id, device_ref, apparatus_id, label, status, created_at, updated_at)` — hardware→apparatus mapping (unique on `(department_id, device_ref)`).
- `of_avl_connection_by_webhook_secret(p_hash)` `SECURITY DEFINER`, `search_path`-locked, EXECUTE to `of_app` only (anon/authenticated/service_role/PUBLIC revoked) — same hardening as the CAD resolver.
- RLS `dept_isolation` on both tables; mirrored into `db.js` for fresh installs; applied to prod by hand + ledgered.

## Security

- Secrets stored hashed; timing-safe compare; fail-closed in prod; per-department isolation via RLS + the DEFINER resolver.
- The realtime broadcast stays **id + coords only** (no PII), unchanged.
- Rate-limiting on the ingest endpoint (a hardware feed can be high-frequency) + the 100 m accuracy gate to reject noise.
- A revoked/`Inactive` connection is rejected by the resolver (same as CAD).

## Migration / positioning (why this wins deals)

- A department **already on hardware AVL** forwards its existing feed (vendor outbound webhook, or a thin forwarder emitting generic-JSON/NMEA) → trucks appear continuously on OF's command map, login-independent — *same workflow they have today*.
- A department **with no hardware** uses the iPad path — same map, zero capital cost.
- Honest dependency: the **sending** side depends on the department's current vendor supporting outbound forwarding (most do). OF's **receiving** side is complete and standards-based, so onboarding is configuration + (if a proprietary cloud) a verified adapter — not a code project per customer.

## Consequences

- **Positive:** day-1 readiness to ingest standard AVL feeds; one command map for hardware + iPad; clean extensibility identical to CAD; no downstream rework.
- **Cost:** new auth surface + two tables + a DEFINER fn (reviewed with Dale); per-vendor adapters require each vendor's real spec before they're trustworthy.
- **Explicitly NOT done:** fabricating adapters for vendors whose payload format we haven't verified (would risk mis-plotting a rig). Each vendor adapter ships only against a confirmed spec.

## Build status (living)
- [ ] Migration: `avl_connections`, `avl_devices`, `of_avl_connection_by_webhook_secret` (+ db.js mirror) — Dale review of the DEFINER/RLS surface.
- [ ] `avl/deviceAuth.js` (mirror cad/webhookAuth.js) + tests.
- [ ] `avl/adapters/{generic,nmea}.js` + registry + tests.
- [ ] `avl/index.js` orchestrator (validate → 100m gate → map device→apparatus → upsert → broadcast) + tests.
- [ ] `POST /api/avl/ingest` route + per-dept rate limit.
- [ ] Admin UI: register an AVL connection (generate secret) + map devices→apparatus.
- [ ] Verified vendor adapters (one per confirmed spec).

## Note for Matt (repo rule)
The existing `server/src/cad/adapters/*.js` filenames contain third-party product names — that conflicts with the "no competitor names in repo artifacts" rule. Flagging for a separate scrub (rename to neutral vendor codes + a private mapping). New AVL code uses neutral/generic naming.
