'use strict';
/**
 * constants/workOrderVocab.js — defect/work-order vocabulary (Phase 2.2, migration 0083).
 *
 * CLOSED SETS, server-owned (the 0056/checkVocab doctrine). The market ships customizable
 * status lists — which is exactly how three-vocabulary drift happens (the 'Conditional'
 * lesson); we ship the documented semantic core as a fixed enum with the completed-locks-
 * the-record semantic made doctrine-grade: RESOLVED/CANCELLED are TERMINAL. Reopen is
 * forbidden — a correction is a NEW work order referencing the old (supersedes_id).
 *
 * PRIORITY IS DISPLAY/SORT ONLY (documented market-wide): it never drives status, OOS,
 * or any mechanical behavior.
 */

const WO_STATUSES = ['open', 'in_progress', 'awaiting_parts', 'resolved', 'cancelled'];
const WO_TERMINAL = ['resolved', 'cancelled'];

/** The one transition map (exact match; enforced at the ONE status door). */
const WO_TRANSITIONS = {
  open: ['in_progress', 'awaiting_parts', 'resolved', 'cancelled'],
  in_progress: ['awaiting_parts', 'resolved', 'cancelled'],
  awaiting_parts: ['in_progress', 'resolved', 'cancelled'],
  resolved: [],
  cancelled: [],
};

const DEFECT_STATUSES = ['open', 'in_work', 'resolved', 'cancelled'];
const PRIORITIES = ['routine', 'urgent', 'emergency'];

function isTerminal(status) {
  return WO_TERMINAL.includes(status);
}

function canTransition(from, to) {
  return Array.isArray(WO_TRANSITIONS[from]) && WO_TRANSITIONS[from].includes(to);
}

module.exports = {
  WO_STATUSES, WO_TERMINAL, WO_TRANSITIONS, DEFECT_STATUSES, PRIORITIES,
  isTerminal, canTransition,
};
