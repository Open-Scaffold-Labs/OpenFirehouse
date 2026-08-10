'use strict';
// T.10 (2026-07-12) — pre-plan photos route: pure-helper validation.
// (Storage/DB behavior is covered by the G4 end-to-end pass; these lock the
// validation surface the route exposes to clients.)
const { test } = require('node:test');
const assert = require('node:assert');
const { CATEGORIES, validCategory, extFor } = require('../routes/prePlanPhotos');

test('CATEGORIES is the canonical closed set (app-validated, no CHECK constraint)', () => {
  assert.deepEqual(CATEGORIES, [
    'general', 'fdc', 'knox_box', 'access', 'utilities', 'water_supply', 'hazard',
  ]);
});

test('validCategory accepts every canonical category', () => {
  for (const c of CATEGORIES) assert.ok(validCategory(c), c);
});

test('validCategory rejects everything else', () => {
  assert.equal(validCategory('FDC'), false);          // case-sensitive codes
  assert.equal(validCategory('knox box'), false);     // underscore form only
  assert.equal(validCategory(''), false);
  assert.equal(validCategory(null), false);
  assert.equal(validCategory(undefined), false);
  assert.equal(validCategory('general; DROP TABLE'), false);
  assert.equal(validCategory(0), false);
});

test('extFor maps the photo mimetypes and falls back to jpg', () => {
  assert.equal(extFor('image/jpeg'), 'jpg');
  assert.equal(extFor('image/png'), 'png');
  assert.equal(extFor('image/webp'), 'webp');
  assert.equal(extFor('image/heic'), 'heic');
  assert.equal(extFor('image/heif'), 'heif');
  assert.equal(extFor('application/pdf'), 'jpg'); // filtered upstream by multer anyway
  assert.equal(extFor(undefined), 'jpg');
});
