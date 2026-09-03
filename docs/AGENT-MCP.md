# Department-local MCP (preview / test)

Self-host **one department**. The agent process (or the in-app Ask UI) uses
the **same JWT and roles** as the signed-in firefighter. There is no
superuser bot login and no second product database.

OpenFirehouse already is a console over ~150 JWT-gated routes. This slice
exposes a **small set of those routes** as fire verbs. It does **not**
promote `aiActionRegistry` — that file is an LLM prompt catalog (draft
facts, briefings). It is not a fire-verb contract, and it must not write
incident notes or NFIRS/NERIS narrative.

**MCP is a plug, not a SKU.** Same login. Same badge. Same Postgres.

## Stable invoke path (Ask UI hangs here)

In-app **Ask Open Firehouse** is a **separate stacked PR**. It must call
this existing plug — do not invent a shadow API.

```
POST /api/agent/invoke
Authorization: Bearer <signed-in session JWT>
Content-Type: application/json

{ "verb": "incident_read", "args": {} }
```

| Discovery | `GET /api/agent/verbs` (any authed user) |
|---|---|
| Token | Same access JWT the browser already stores as `localStorage.fs_token` and sends on every `client/src/utils/api.js` request. Cookie refresh still applies; Ask should use the in-memory/session token, not a second bot secret. |
| Roles | Badge = capability. `member` (and up) for reads. `apparatus_status_update` is officer+. Accept on the Dashboard is officer+ **and** a different person than the requester. |

### How to attach the JWT

1. Sign in once through the normal OpenFirehouse login (chief / officer / member).
2. The app sets `Authorization: Bearer <access token>` on every `/api/*` call.
3. Ask UI (sibling PR) should reuse that helper — `api.post('/api/agent/invoke', { verb, args })` — so token refresh and 401 handling stay identical.
4. External MCP clients (Claude Desktop / Grok / Inkbox) copy the **member or dedicated service-account** JWT after that login. **Do not put a chief token in Claude Desktop.** Accept is a human officer on the Dashboard.

```bash
# 401 without a token
curl -s -o /tmp/out.json -w "%{http_code}\n" \
  -X POST http://127.0.0.1:3005/api/agent/invoke \
  -H 'Content-Type: application/json' \
  -d '{"verb":"incident_read","args":{}}'
# expect 401

# Catalog
curl -s http://127.0.0.1:3005/api/agent/verbs \
  -H "Authorization: Bearer $OPENFIREHOUSE_TOKEN"

# Immediate Duty/Board-style reads
curl -s http://127.0.0.1:3005/api/agent/invoke \
  -H "Authorization: Bearer $OPENFIREHOUSE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"verb":"duty_read","args":{}}'

curl -s http://127.0.0.1:3005/api/agent/invoke \
  -H "Authorization: Bearer $OPENFIREHOUSE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"verb":"board_read","args":{}}'
```

## What the agent can do

### Immediate reads (Ask UI hangs on these)

| Verb | Underlying route | Use |
|---|---|---|
| `incident_read` | `GET /api/incidents` or `GET /api/incidents/:id` | List or one incident |
| `roster_read` | `GET /api/members` | Department roster (Duty Board members) |
| `duty_read` | `GET /api/run-list/today` | Today's published riding list. Optional `date` (`YYYY-MM-DD`), `station_id` |
| `board_read` | `GET /api/active-board` | Live Command Board / active incident |
| `apparatus_status_read` | `GET /api/units/status` | Live unit status (Unit Status Board) |
| `training_hours_read` | `GET /api/training` | Training records / hours |

### Immediate fact update (allowlist, not narrative)

| Verb | What happens |
|---|---|
| `incident_update` | Patches only type, alarmLevel, address, units, personnel, disposition, injuries, date, time. Extra keys (including NERIS axis and notes) are dropped. Notes-only → `LEGAL_RECORD_FORBIDDEN`. |

### Gated writes (human Confirm on Dashboard)

| Verb | What happens |
|---|---|
| `neris_submit` | **Queued.** A different chief/officer must Accept before the existing NERIS review door runs. |
| `notify_chief` | **Queued.** Sends an in-app message only after Accept. |
| `apparatus_status_update` | **Queued.** Unit clear/release and any other status flip wait for a human. Officer+ to *request*. The app never auto-flips a unit. |

Legal-record and “speaks for the department” writes stay human-gated.
**AI never authors legal narrative.** Unit clear/release and NERIS = human-confirmed.

Self-accept is forbidden: the requester cannot Accept or Reject their own
item (`403 SELF_ACCEPT_FORBIDDEN`).

## Preview vs local (Dale option A, Sep 3 2026)

This work lives on **draft PR #2**. **Do not merge to main** unless Dale
explicitly says merge later.

**Public GitHub has no Vercel PR preview.** The hosted Vercel project
`open-firehouse` is wired to `Open-Scaffold-Labs/OpenFirehouse-private`,
not this public AGPL repo. Pushing this branch will **not** mint a
`*.vercel.app` URL. CI on the PR (server tests + HTTP suite with
`TENANCY_TEST_DB`) is the automated proof.

### How Dale tests locally

```bash
git checkout cursor/department-mcp-approval-b5d9
npm install
# server/.env needs DATABASE_URL + JWT_SECRET (see docs/INSTALL.md)
npm run dev
```

1. Open `http://localhost:5173`, sign in as a **member** (or a dedicated
   service account). Copy `localStorage.fs_token` if you are curling.
2. Immediate read: `POST /api/agent/invoke` with `{"verb":"duty_read","args":{}}`
   or `board_read` / `incident_read` / `roster_read`. Expect `200` and
   `{"queued":false,"result":{...}}`.
3. Gated write: invoke `neris_submit` as that member. Expect `202` and an
   `agent_approvals` row. NERIS status on the incident stays `draft`.
4. Sign in as a **different** officer/chief. Dashboard → **Agent approvals**
   → Accept. Same user trying Accept → `403 SELF_ACCEPT_FORBIDDEN`.
5. Always-on contract tests (no extra DB):

```bash
node --test server/src/tests/agentVerbs.test.js
```

Live HTTP suite (same disposable Postgres CI uses):

```bash
npx --workspace=server node --test src/tests/agentInvoke.http.test.js
```

### How the Ask UI agent stacks

- Base branch: `cursor/department-mcp-approval-b5d9` (this PR), **not** a
  fork of invoke.
- Call `POST /api/agent/invoke` with the signed-in session JWT.
- Discover verbs via `GET /api/agent/verbs`.
- Reads above are live. Gated writes must show “queued — waiting on
  Dashboard Accept,” never pretend NERIS or unit-clear already happened.

## Run the stdio MCP server (optional, not required for Ask)

1. Run the department install (`npm run dev` — API on `:3005`).
2. Sign in as a **member or dedicated service account** and copy that access JWT.
3. Point an MCP client (Claude Desktop / Cowork / another agent) at:

```bash
OPENFIREHOUSE_API_URL=http://127.0.0.1:3005 \
OPENFIREHOUSE_TOKEN=<member or service-account JWT> \
npm run mcp
```

The process speaks MCP over stdio (`initialize`, `tools/list`, `tools/call`).
Every tool call is `POST /api/agent/invoke` with the same `Authorization`
header the app already uses.

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
        "OPENFIREHOUSE_TOKEN": "<member or service-account JWT>"
      }
    }
  }
}
```

## Approve or reject

Officers and chiefs see **Agent approvals** on the existing Dashboard
while signed in as themselves — not via the MCP token. Accept runs the
underlying route as that human. Reject dismisses it. The same user who
queued the verb cannot Accept. There is no new admin console.

## What this is not

- Not a hosted Independent or multi-department agent cloud.
- Not a separate MCP product with its own login + DB.
- Not Claude editing `Layout.jsx` to “run” the firehouse. Cowork stays the
  path for branding, seed data, and SOPs — see `CUSTOMIZE-WITH-COWORK.md`.
- Not AI drafting NFIRS/NERIS narrative. Code already forbids that.
- Not `cad_enrich_incident`. That path is unused and stays unwired.
- Not `apparatus_create` / fleet create (later).
- Not the in-app Ask chat UI (sibling PR).
