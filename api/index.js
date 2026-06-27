// Vercel serverless entry point for the OpenFirehouse API.
// The real Express app lives in server/src/index.js; this file exists only
// so that Vercel treats /api as a single Node serverless function and routes
// every /api/* request into the Express router.
//
// vercel.json must include:
//   "functions": { "api/index.js": { "includeFiles": "server/**" } }
// so the server source tree is bundled with this function.
module.exports = require('../server/src/index.js');
