'use strict';
/**
 * utils/dbContext.js — per-request database context (P5 RLS plumbing).
 *
 * Holds an AsyncLocalStorage store carrying the request-scoped pg client that
 * has an open transaction with `app.department_id` / `app.user_id` GUCs set
 * (see middleware/dbTransaction.js). db.js's exported `pool.query` consults
 * getClient() and, when a request context is active, runs the query on that
 * pinned client so it participates in the request's transaction + GUCs.
 *
 * When NO context is active (cron jobs, boot/initDb, seed scripts, the
 * pre-auth bootstrap reads in requireAuth), getClient() returns null and
 * db.js falls back to the raw pool — identical to pre-P5 behavior.
 *
 * This module intentionally depends on NOTHING from db.js to avoid a require
 * cycle (db.js requires this; this requires only node:async_hooks).
 */

const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

/** The full store for the active request, or undefined if none. */
function getStore() {
  return als.getStore();
}

/** The request-scoped pg client if a transaction context is active, else null. */
function getClient() {
  const store = als.getStore();
  return store && store.client ? store.client : null;
}

/** Run `fn` with `store` as the active context. Used by the txn middleware. */
function run(store, fn) {
  return als.run(store, fn);
}

module.exports = { als, getStore, getClient, run };
