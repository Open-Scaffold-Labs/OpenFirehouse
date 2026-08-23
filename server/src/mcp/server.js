#!/usr/bin/env node
'use strict';
/**
 * Department-local MCP server for one OpenFirehouse install.
 *
 * Run next to the existing app/Postgres — not a hosted Independent.
 *
 *   OPENFIREHOUSE_API_URL=http://127.0.0.1:3005 \
 *   OPENFIREHOUSE_TOKEN=<department JWT> \
 *   node server/src/mcp/server.js
 *
 * The JWT is the same authz the app already uses. Tools call POST /api/agent/invoke.
 * See docs/AGENT-MCP.md.
 */

const { mcpTools } = require('../utils/agentVerbRegistry');

const API_URL = (process.env.OPENFIREHOUSE_API_URL || 'http://127.0.0.1:3005').replace(/\/$/, '');
const TOKEN = process.env.OPENFIREHOUSE_TOKEN || '';

function write(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function ok(id, result) {
  write({ jsonrpc: '2.0', id, result });
}

function fail(id, code, message) {
  write({ jsonrpc: '2.0', id, error: { code, message } });
}

async function invokeVerb(name, args) {
  if (!TOKEN) {
    const err = new Error('OPENFIREHOUSE_TOKEN is not set. Sign in to the department install and pass that JWT.');
    err.code = 'NO_TOKEN';
    throw err;
  }
  const res = await fetch(`${API_URL}/api/agent/invoke`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ verb: name, args: args || {} }),
  });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function handle(msg) {
  if (!msg || msg.jsonrpc !== '2.0') return;
  const { id, method, params } = msg;
  if (id === undefined && method && String(method).startsWith('notifications/')) return;

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'openfirehouse', version: '0.13.0' },
    });
  }
  if (method === 'ping') return ok(id, {});
  if (method === 'tools/list') {
    return ok(id, { tools: mcpTools() });
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    try {
      const result = await invokeVerb(name, args);
      return ok(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      });
    } catch (err) {
      return ok(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message, status: err.status, body: err.body }, null, 2) }],
        isError: true,
      });
    }
  }
  if (id !== undefined) fail(id, -32601, `Method not found: ${method}`);
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); }
    catch { continue; }
    Promise.resolve(handle(msg)).catch((err) => {
      if (msg && msg.id !== undefined) fail(msg.id, -32603, err.message);
    });
  }
});

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(`OpenFirehouse department MCP (stdio)

Self-host one department. The agent process runs on the install and
authenticates with a department JWT — the same roles the app uses.

  OPENFIREHOUSE_API_URL=http://127.0.0.1:3005
  OPENFIREHOUSE_TOKEN=<jwt from a department login>

  npm run mcp --workspace=server

Docs: docs/AGENT-MCP.md
`);
  process.exit(0);
}
