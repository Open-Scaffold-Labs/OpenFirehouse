'use strict';
// W3.3 (2026-06-10) — shared zod validation middleware.
//
// Usage:
//   const { z } = require('zod');
//   const validate = require('../middleware/validate');
//   router.get('/material/:un', validate({ params: z.object({ un: z.string().regex(/^\d{1,4}$/) }) }), handler);
//
// Validates req.body / req.query / req.params against the provided schemas.
// On failure responds 400 with a stable shape: { error, details: [...] }.
// On success replaces the validated slice with the PARSED data (so defaults
// and coercions apply downstream).
//
// Rollout order (roadmap 4.3): unauthenticated routes first — auth, tvData,
// hazmat public reads, cad vendor webhooks — then spread inward with W3.7's
// shared route helper.

function validate(schemas) {
  return (req, res, next) => {
    for (const key of ['params', 'query', 'body']) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: result.error.issues.map(
            (i) => `${key}${i.path.length ? '.' + i.path.join('.') : ''}: ${i.message}`
          ),
        });
      }
      req[key] = result.data;
    }
    next();
  };
}

module.exports = validate;
