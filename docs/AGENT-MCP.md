# Department-local MCP (first age-of-agents slice)

Self-host **one department**. The agent process runs on that install, next
to the existing app and Postgres. There is no hosted Independent, signup,
or multi-tenant agent cloud in this slice.

OpenFirehouse already is a console over ~150 JWT-gated routes. This slice
exposes a **small set of those routes** as MCP tools. It does **not**
promote `aiActionRegistry` — that file is an LLM prompt catalog (draft
facts, briefings). It is not a fire-verb contract, and it must not write
incident notes or NFIRS/NERIS narrative.

## What the agent can do

| Verb | What happens |
|---|---|
| `incident_read` | Reads `GET /api/incidents` or `GET /api/incidents/:id` |
| `incident_update` | Patches factual fields only. `notes` / narrative keys are stripped in code. |
| `roster_read` | Reads `GET /api/members` |
| `training_hours_read` | Reads `GET /api/training` |
| `apparatus_status_read` | Reads `GET /api/units/status` |
| `neris_submit` | **Queued.** A chief/officer must Accept on the Dashboard before the existing NERIS review door runs. |
| `notify_chief` | **Queued.** Sends an in-app message only after Accept. |
| `apparatus_status_update` | **Queued.** Unit clear/release and any other status flip wait for a human. Radio doctrine is unchanged: the app never auto-flips a unit. |

Legal-record and “speaks for the department” writes stay human-gated.
Incident narrative is officer-written only — the agent cannot write it.

## Run the MCP server

1. Run the department install (`npm run dev` — API on `:3005`).
2. Sign in as a department user and copy the access JWT (browser
   `localStorage.fs_token`, or a token you mint for an agent-named officer).
3. Point an MCP client (Claude Desktop / Cowork / another agent) at:

```bash
OPENFIREHOUSE_API_URL=http://127.0.0.1:3005 \
OPENFIREHOUSE_TOKEN=<that JWT> \
npm run mcp
```

The process speaks MCP over stdio (`initialize`, `tools/list`, `tools/call`).
Every tool call is `POST /api/agent/invoke` with the same `Authorization`
header the app already uses. Role gates are the existing ones
(`requireAuth` + `requireRole`).

Claude Desktop example (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "openfirehouse": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/OpenFirehouse",
      "env": {
        "OPENFIREHOUSE_API_URL": "http://127.0.0.1:3005",
        "OPENFIREHOUSE_TOKEN": "<department JWT>"
      }
    }
  }
}
```

## Approve or reject

Officers and chiefs see **Agent approvals** on the existing Dashboard.
Accept runs the underlying route as the approver. Reject dismisses it.
There is no new admin console.

## Prove it locally (no extra test DB)

With the API running and a JWT:

```bash
# 401 without a token
curl -s -o /tmp/out.json -w "%{http_code}\n" \
  -X POST http://127.0.0.1:3005/api/agent/invoke \
  -H 'Content-Type: application/json' \
  -d '{"verb":"incident_read","args":{}}'
# expect 401

# Authz-checked read
curl -s http://127.0.0.1:3005/api/agent/invoke \
  -H "Authorization: Bearer $OPENFIREHOUSE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"verb":"incident_read","args":{}}'

# Gated verb creates an approval row — it does not submit NERIS
curl -s http://127.0.0.1:3005/api/agent/invoke \
  -H "Authorization: Bearer $OPENFIREHOUSE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"verb":"neris_submit","args":{"id":1}}'
# expect 202 and {"queued":true,"approval":{...}}

# Officer/chief: list + accept or reject on the Dashboard, or:
curl -s http://127.0.0.1:3005/api/agent/approvals?status=pending \
  -H "Authorization: Bearer $CHIEF_TOKEN"
```

Always-on unit tests: `server/src/tests/agentVerbs.test.js`
(`npx --workspace=server node --test src/tests/agentVerbs.test.js`).
A live HTTP suite (`agentInvoke.http.test.js`) runs when `TENANCY_TEST_DB`
is set.

## What this is not

- Not a hosted Independent or multi-department agent cloud.
- Not Claude editing `Layout.jsx` to “run” the firehouse. Cowork stays the
  path for branding, seed data, and SOPs — see `CUSTOMIZE-WITH-COWORK.md`.
- Not AI drafting NFIRS/NERIS narrative. Code already forbids that.
- Not `cad_enrich_incident`. That path is unused and stays unwired.
