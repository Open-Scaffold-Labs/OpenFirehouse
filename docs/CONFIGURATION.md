# Configuration reference

Every environment variable OpenFirehouse reads, organized by purpose.
Source of truth: `server/.env.example`. This document expands the
inline comments with defaults, validation rules, and operational
notes.

Required variables are marked **Required.** Everything else has a
working default or is optional.

## Core

| Variable        | Default | Required | Notes |
| --------------- | ------- | -------- | ----- |
| `PORT`          | `3005`  | No       | Express server port. The client (Vite dev server) is on 5173 separately. |
| `DATABASE_URL`  | —       | **Required** | Postgres connection string. Supabase: `postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres`. Local: `postgresql://user:pass@localhost:5432/openfirehouse`. |
| `JWT_SECRET`    | dev fallback | **Required in production** | The secret used to sign authentication tokens. **Do not leave at the default in production.** Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | No | Allowed CORS origin for the client. Comma-separated for multiple. Set to your Vercel URL in production. |
| `NODE_ENV`      | `development` | No | Set to `production` for hosted deploys. Affects logging verbosity and error-detail exposure. |

## Demo / seed control

| Variable      | Default | Required | Notes |
| ------------- | ------- | -------- | ----- |
| `SEED_DEMO`   | unset   | No       | When `true`, populates the database with the fictional Maplewood Fire Department: 12 members, 18 incidents, 16 apparatus, ~70 seed files of demo content. **Only set on the public demo deployment.** Real departments leave this unset so they get a clean install. |

The "always run" seeds (ERG hazmat dataset, NFPA course catalog) are
independent of this flag — they're public-domain reference data every
deployment gets.

## First-run bootstrap

These three are read only when the `users` table is empty. Once any
user exists, they're ignored and can be safely removed from `.env`.

| Variable                    | Default | Notes |
| --------------------------- | ------- | ----- |
| `BOOTSTRAP_CHIEF_USERNAME`  | —       | Username for the auto-created first chief account. |
| `BOOTSTRAP_CHIEF_PASSWORD`  | —       | Plain-text password — hashed via bcrypt before storage. **Change after first login.** |
| `BOOTSTRAP_CHIEF_NAME`      | —       | Display name on the first chief's profile. |

Alternative to using these: the in-app Setup Wizard at first page
load. See [INSTALL.md](INSTALL.md) Step 5.

## Bug-report email forwarding

When set, every bug report submitted via the in-app reporter is also
emailed to `SUPPORT_EMAIL`. Uses Resend ([resend.com](https://resend.com))
— free tier covers 3,000 emails/month.

| Variable             | Default | Notes |
| -------------------- | ------- | ----- |
| `SUPPORT_EMAIL`      | unset   | Comma-separated list of email addresses to forward bug reports to. |
| `RESEND_API_KEY`     | unset   | API key from resend.com → Settings → API. Required if `SUPPORT_EMAIL` is set. |
| `SUPPORT_FROM_EMAIL` | `OpenFirehouse <bugs@openfirehouse.com>` | The From address. Must be a domain verified in Resend. |

If these are unset, the in-app reporter still works — reports are
stored in the `bug_reports` table and run through the AI diagnostic
agent. Nobody outside the system gets notified.

## AI features

OpenFirehouse uses LLM APIs for ~25 AI actions (incident command
assistant, pre-plan summarizer, report writer, etc.). AI does not
draft incident or NFIRS/NERIS narrative. Without these keys, AI
features are disabled but the rest of the product works normally.
A department-local MCP server (see [AGENT-MCP.md](AGENT-MCP.md))
uses the same JWT/roles as the app — it does not need these keys.

| Variable             | Default | Notes |
| -------------------- | ------- | ----- |
| `ANTHROPIC_API_KEY`  | unset   | From [console.anthropic.com](https://console.anthropic.com). Used for the primary AI actions. |
| `OPENAI_API_KEY`     | unset   | Used for a smaller subset of AI features and as a fallback. |

## Morning shift brief (first routine)

Same `POST /api/agent/invoke` reads as Ask. Not a second product. See
[ROUTINES.md](ROUTINES.md).

| Variable | Default | Notes |
| -------- | ------- | ----- |
| `MORNING_BRIEF_TZ` | `America/New_York` | House clock for the in-process ticker and “is it morning?” checks. |
| `MORNING_BRIEF_HOUR` | `7` | Local hour (0–23) the weekday brief aims for. |
| `OPENFIREHOUSE_ROUTINE_ACTOR` | first officer/chief | Username the **scheduled** tick runs as. Must be a real member of the department. Manual **Run morning brief now** always uses the signed-in JWT. |
| `MORNING_BRIEF_INPROCESS` | unset | When `true` on a long-lived Node host (not Vercel), a one-minute ticker fires the brief at the local weekday hour. `OPENFIREHOUSE_DEMO=true` also enables it. |

Vercel Cron path: `GET /api/cron/morning-brief` at `0 11 * * *` (11:00 UTC).
The handler stays silent on Saturday and Sunday.

Costs are pay-per-use. A typical small department spends \$5-\$20 per
month on AI API costs.

## Twilio (SMS alerts)

Used to send dispatch SMS alerts to members who haven't enabled push
notifications.

| Variable              | Default | Notes |
| --------------------- | ------- | ----- |
| `TWILIO_ACCOUNT_SID`  | unset   | From your Twilio console. |
| `TWILIO_AUTH_TOKEN`   | unset   | From your Twilio console. |
| `TWILIO_FROM_NUMBER`  | unset   | A Twilio-provisioned phone number. |

Without these, SMS alerts are disabled.

## Web Push (browser notifications)

VAPID keys for Web Push Protocol. Generate with:
```bash
npx web-push generate-vapid-keys
```

| Variable             | Default | Notes |
| -------------------- | ------- | ----- |
| `VAPID_PUBLIC_KEY`   | unset   | Public key, also embedded in the client. |
| `VAPID_PRIVATE_KEY`  | unset   | Private key, server-side only. |
| `VAPID_EMAIL`        | unset   | `mailto:` URL identifying the push-notification sender. |

## Realtime (live push for dispatch, unit status and the maps)

**Push is the PRIMARY channel for dispatch. Configure it.**

Polling is a bounded fallback so a dropped connection degrades instead of going dark — it is
not an equivalent alternative. On a dispatch surface the difference between instant and
"up to 20–30 seconds" is operationally real, and you should treat an unconfigured or
disconnected push channel as a condition to fix, not a supported steady state.

The app will still run with these unset — it will not crash, and every live surface keeps
refreshing on its poll interval. That is deliberate (a dispatch surface must never
white-screen over a config problem), and it is what makes a self-host without Supabase
Realtime *possible*. It is not what makes it *advisable*.

Whichever channel is carrying your data, the surface tells you which one and how fresh it
is — see "Verifying it actually took" below.

Live push has **two halves, and you need both**. The server *publishes* Supabase Realtime
Broadcast messages; the browser *subscribes* to them. Configuring only one half is a
silent no-op — the half you set works and nothing tells you the other is missing.

| Variable | Half | Notes |
| -------- | ---- | ----- |
| `SUPABASE_URL` | server (publish) | Your Supabase project URL, e.g. `https://YOUR_PROJECT_REF.supabase.co`. |
| `SUPABASE_ANON_KEY` | server (publish) | The anon/public key. Settings → API in the Supabase dashboard. |
| `VITE_SUPABASE_URL` | **client (subscribe)** | The **same** project URL, exposed to the browser at build time. Goes in `client/.env`, not `server/.env`. |
| `VITE_SUPABASE_ANON_KEY` | **client (subscribe)** | The **same** anon key. Also `client/.env`. |

Both client values are public by design: the anon key grants no data access on its own,
the authz'd REST API stays the source of truth, and Broadcast messages are only treated
as "refetch now" signals.

⚠️ **The `VITE_`-prefixed pair is inlined at BUILD time, not read at runtime.** Vite
substitutes them when the client is compiled, so **changing them requires a rebuild and
redeploy** — an env-var edit alone does nothing. A missing `VITE_` var is silently
`undefined`, never a build error.

**Verifying it actually took.** Because the values are compiled in, the built bundle is
the source of truth. After deploying, grep it:

```bash
grep -c 'createClient' dist/assets/index-*.js     # 1 = realtime client built, 0 = disabled
```

The app also shows this to you: when live push is off, the sidebar renders
`Live push: off · 20s poll` beneath the version, and hovering it names the exact variable
that is missing.

**Optional strict mode.** Set `REQUIRE_REALTIME=1` on a deploy that *must* have live push
and the client build will **fail** rather than silently ship with polling — it also
rejects placeholder values copied from `client/.env.example`. Leave it unset (the default)
for CI, local development, and any self-host that doesn't use Realtime.

## CAD integration

One environment variable per CAD vendor in use. See
[CAD_INTEGRATION_STRATEGY.md](CAD_INTEGRATION_STRATEGY.md) for the
broader plan and `server/src/cad/adapters/<vendor>.js` for the
adapter source.

| Variable                       | Default | Notes |
| ------------------------------ | ------- | ----- |
| `ACTIVE911_AGENCY_ID`          | unset   | When set, requires the agency_id on incoming Active911 webhooks to match. Without it, the webhook URL itself is the only secret. |
| `IAMRESPONDING_WEBHOOK_SECRET` | unset   | Shared secret for the IamResponding adapter. Adapter is currently scaffold-only. |
| `FIRSTDUE_CLIENT_ID`           | unset   | OAuth client ID for FirstDue CAD. Scaffold-only. |
| `FIRSTDUE_CLIENT_SECRET`       | unset   | OAuth client secret for FirstDue CAD. Scaffold-only. |
| `ZUERCHER_API_KEY`             | unset   | API key for Zuercher (CentralSquare small-agency). Scaffold-only. |

### Multi-station CAD routing

These let one OpenFirehouse install serve multiple stations behind
one webhook URL. Single-station departments leave both unset.

| Variable                  | Default | Notes |
| ------------------------- | ------- | ----- |
| `CAD_DEFAULT_STATION_ID`  | `1`     | StationId used when no per-agency mapping matches. |
| `CAD_STATION_MAP`         | unset   | JSON object routing `<vendor-slug>:<vendor-agency-id>` → stationId. Example: `'{"active911:ABC123":1,"firstdue:tenant-7":2}'`. |

## What happens if you misconfigure

The server logs missing/invalid values on startup. Common patterns:

- **`Cannot find module 'dotenv'`** — you ran `npm install` in
  `server/` instead of at the repo root. Workspaces install at root.
- **`error: password authentication failed for user "postgres"`** —
  the `DATABASE_URL` password is wrong or the `[YOUR-PASSWORD]`
  placeholder was never substituted.
- **`SyntaxError: Unexpected token in JSON at position 0`** —
  `CAD_STATION_MAP` is set to invalid JSON. Wrap it in single quotes
  in `.env` so the shell doesn't strip the inner quotes.

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for the full failure
catalog.
