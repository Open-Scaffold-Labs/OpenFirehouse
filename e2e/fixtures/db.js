import { expect } from '@playwright/test';

/**
 * Database end-state assertions.
 *
 * The point the report drives home: assert what actually landed in the record,
 * not what the screen said. A "Saved" toast is not a row. A PAR countdown on
 * screen is not a persisted, append-only accountability log. These helpers read
 * the record back over the API and assert on it.
 *
 * Uses the same token the UI holds (localStorage.fs_token), so reads are
 * tenant-scoped exactly as the app sees them.
 */

/** Pull the current session token out of the running page. */
export async function tokenOf(page) {
  return page.evaluate(() => localStorage.getItem('fs_token'));
}

/** Authenticated GET against the API, returning parsed JSON (raw, possibly enveloped). */
export async function apiGet(page, path, baseURL = '') {
  const token = await tokenOf(page);
  const res = await page.request.get(`${baseURL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  expect(res.ok(), `GET ${path} should succeed (${res.status()})`).toBeTruthy();
  return res.json();
}

/**
 * Unwrap a list endpoint. OpenFirehouse collections come back enveloped
 * (e.g. GET /api/incidents → { data: [...], count }), while some return a bare
 * array. This normalizes both to the array.
 */
export function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  for (const k of ['data', 'incidents', 'rows', 'items', 'results']) {
    if (Array.isArray(payload?.[k])) return payload[k];
  }
  return [];
}

/**
 * Assert an append-only ledger GREW by exactly `by` after an action, and never
 * shrank — the shape of "PAR history is evidence" and "audit trail is append-only".
 * Capture `before` prior to the action, pass it here after.
 */
export function expectLedgerGrewBy(before, after, by = 1) {
  expect(after.length, 'ledger must be append-only (never shrinks)').toBeGreaterThanOrEqual(before.length);
  expect(after.length - before.length, `ledger should grow by ${by}`).toBe(by);
}

/**
 * Assert no record leaked across tenants — every row belongs to the expected
 * department. Only usable on endpoints whose rows actually expose an ownership
 * field; some collections (e.g. /api/incidents) are scoped server-side and don't
 * carry a department id on the row, so isolation is proven by the cross-tenant
 * journey instead (06-tenancy-isolation, second test).
 */
export function expectAllOwnedBy(rows, departmentId) {
  for (const r of rows) {
    const dept = r.department_id ?? r.departmentId ?? r.station_id ?? r.stationId;
    expect(dept, `row ${r.id} must belong to department ${departmentId}`).toBe(departmentId);
  }
}
