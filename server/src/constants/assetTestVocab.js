'use strict';
/**
 * constants/assetTestVocab.js — asset-test engine vocabulary (Phase 2.3, migration 0084).
 * CLOSED SETS, server-owned. TEST RESULT and ASSET LIFECYCLE STATUS are deliberately
 * separate axes (the standards' own shape: "condemned" is NFPA's word): a FAIL proposes
 * a disposition; a HUMAN applies it through the one status door. UNRECORDED exists ONLY
 * for legacy imports and is NOT accepted from the API.
 */

const ASSET_FAMILIES = ['scba', 'hose', 'ladder', 'ppe', 'other'];
const TYPE_FAMILIES = [...ASSET_FAMILIES, 'pump']; // pump tests target APPARATUS
const TEST_RESULTS_API = ['PASS', 'FAIL', 'NOT_COMPLETED'];
const TEST_RESULTS_ALL = [...TEST_RESULTS_API, 'UNRECORDED'];
const ASSET_STATUSES = ['in_service', 'out_of_service', 'condemned', 'retired'];
const STATUS_REASON_REQUIRED = ['out_of_service', 'condemned', 'retired'];
const ANCHORS = ['last_event', 'manufacture', 'in_service'];

/** The standards' table-stakes cadences, seeded per-dept on first read (leave-banks pattern). */
const DEFAULT_TEST_TYPES = [
  { name: 'SCBA flow test', family: 'scba', target: 'asset', interval_days: 365, anchor: 'last_event' },
  { name: 'Cylinder hydrostatic test', family: 'scba', target: 'asset', interval_days: 1825, anchor: 'last_event' },
  { name: 'Hose service test', family: 'hose', target: 'asset', interval_days: 365, anchor: 'last_event', first_anchor: 'manufacture' },
  { name: 'Ladder service test', family: 'ladder', target: 'asset', interval_days: 365, anchor: 'last_event', first_anchor: 'in_service' },
  { name: 'Pump service test', family: 'pump', target: 'apparatus', interval_days: 365, anchor: 'last_event' },
  { name: 'PPE advanced inspection', family: 'ppe', target: 'asset', interval_days: 365, anchor: 'last_event' },
  { name: 'PPE advanced cleaning', family: 'ppe', target: 'asset', interval_days: 182, anchor: 'last_event' },
];

/** Family default retirement clocks, months (alert-only; per-asset override). */
const DEFAULT_RETIREMENT = {
  scba: { months: 180, advisory: false },  // composite 15 yr (per-cylinder DOT-SP override)
  ppe: { months: 120, advisory: false },   // NFPA 1851 10 yr mandatory (structural)
  hose: { months: 120, advisory: true },   // 10 yr ADVISORY service-life guidance
};

module.exports = {
  ASSET_FAMILIES, TYPE_FAMILIES, TEST_RESULTS_API, TEST_RESULTS_ALL,
  ASSET_STATUSES, STATUS_REASON_REQUIRED, ANCHORS, DEFAULT_TEST_TYPES, DEFAULT_RETIREMENT,
};
