'use strict';
/**
 * utils/statusTimers.js — unit status timers (0046, LEITSC §1.7.3 parity).
 *
 * Pure computation, unit-tested: overdue state derives AT READ TIME from the
 * unit's status timestamp and the latest dispatcher acknowledgment — no
 * scheduler to miss on serverless. An ack newer than the status change resets
 * the timer basis; a status change resets it naturally (new updated_at).
 *
 * Thresholds are MINUTES per status; 0 (or absent) = timer off. Departments
 * override via departments.status_timer_config (JSONB); NULL = these defaults
 * (the researched industry baseline, fire-adjusted: committed statuses timed,
 * dispatchable statuses off; on_scene is the crew-welfare timer).
 */

const DEFAULT_THRESHOLDS = {
  dispatched:     10, // toned out but never went en route — did they hear it?
  enroute:        10, // response taking too long
  on_scene:       30, // welfare check — long on-scene with no radio traffic
  transporting:   10, // transport leg taking too long (EMS, 2026-07-13)
  at_hospital:     0, // offload/turnaround timer — off by default, dept-configurable
  returning:       0,
  in_service:      0,
  on_the_air:      0,
  out_of_service:  0,
};

const TIMED_STATUSES = Object.keys(DEFAULT_THRESHOLDS);

/** Merge a department's JSONB config over the defaults. Unknown keys are
 * ignored; values clamped to 0..1440 integer minutes. Never throws. */
function effectiveThresholds(config) {
  const out = { ...DEFAULT_THRESHOLDS };
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    for (const k of TIMED_STATUSES) {
      const v = config[k];
      if (v === undefined || v === null) continue;
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = Math.min(1440, Math.max(0, Math.round(n)));
    }
  }
  return out;
}

/**
 * Timer state for one unit.
 * @param {string} status           canonical unit status
 * @param {string|Date|null} updatedAt   when the unit entered this status
 * @param {string|Date|null} lastAckAt   latest dispatcher ack for this unit (any time)
 * @param {object|null} config     departments.status_timer_config
 * @param {Date} [now]
 * @returns {{elapsedSec:number, thresholdMin:number, overdue:boolean, ackedAt:string|null}|null}
 *   null when no timer applies (status off, or no timestamp to measure from).
 */
function computeTimer(status, updatedAt, lastAckAt, config, now = new Date()) {
  const thresholds = effectiveThresholds(config);
  const thresholdMin = thresholds[status] ?? 0;
  if (!thresholdMin || !updatedAt) return null;

  const since = new Date(updatedAt);
  if (isNaN(since)) return null;

  // An ack only counts against the CURRENT stint: it must be newer than the
  // status change. Older acks belong to a previous stint and are irrelevant.
  let basis = since;
  let ackedAt = null;
  if (lastAckAt) {
    const ack = new Date(lastAckAt);
    if (!isNaN(ack) && ack > since) { basis = ack; ackedAt = ack.toISOString(); }
  }

  const elapsedSec = Math.max(0, Math.floor((now - basis) / 1000));
  return {
    elapsedSec,
    thresholdMin,
    overdue: elapsedSec >= thresholdMin * 60,
    ackedAt,
  };
}

module.exports = { DEFAULT_THRESHOLDS, TIMED_STATUSES, effectiveThresholds, computeTimer };
