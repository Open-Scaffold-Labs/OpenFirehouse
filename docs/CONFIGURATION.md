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
assistant, pre-plan summarizer, NFIRS narrative auto-fill, report
writer, etc.). Without these keys, AI features are disabled but the
rest of the product works normally.

| Variable             | Default | Notes |
| -------------------- | ------- | ----- |
| `ANTHROPIC_API_KEY`  | unset   | From [console.anthropic.com](https://console.anthropic.com). Used for the primary AI actions. |
| `OPENAI_API_KEY`     | unset   | Used for a smaller subset of AI features and as a fallback. |

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
