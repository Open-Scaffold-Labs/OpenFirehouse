'use strict';
// Single source of truth for the JWT signing secret.
//
// SECURITY: in production (Vercel / any NODE_ENV=production deploy) the
// process REFUSES TO BOOT without JWT_SECRET — a known fallback secret would
// let anyone mint valid tokens. The dev fallback exists only for local work.
const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

if (IS_PROD && !process.env.JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET is not set. Refusing to start in production with the ' +
    'built-in dev secret — set JWT_SECRET in the environment.'
  );
}

const ACCESS_SECRET = process.env.JWT_SECRET || 'freestation-dev-secret-change-in-prod';
const REFRESH_SECRET = ACCESS_SECRET + '-refresh';

module.exports = { ACCESS_SECRET, REFRESH_SECRET };
