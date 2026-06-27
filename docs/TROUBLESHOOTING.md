# Troubleshooting

Common errors and how to fix them. Organized by the symptom you see.

If your problem isn't here, the in-app bug reporter
(`Settings → Report a bug`) sends a Claude-diagnosed report to the
maintainers — usually faster than filing a GitHub issue if the
problem is environment-specific.

## Install / startup errors

### `Cannot find module 'dotenv'`

You probably ran `npm install` inside `server/`. OpenFirehouse uses
npm workspaces; install at the repo root instead:

```bash
cd /path/to/OpenFirehouse
npm install
```

This installs deps for both client and server in one go.

### `error: password authentication failed for user "postgres"`

The Postgres connection string is wrong. Three common causes:

1. `[YOUR-PASSWORD]` placeholder was never substituted in
   `DATABASE_URL`. Open `server/.env`, replace the bracketed text
   with the actual database password.
2. Special characters in the password aren't URL-encoded. `@`, `:`,
   `/` and `?` must be percent-encoded. The simplest fix is to use
   a password without these characters.
3. The Supabase project's database password was rotated since
   `DATABASE_URL` was set. Regenerate the connection string from
   the Supabase dashboard (Settings → Database).

### Server starts but every API call returns 500 within Vercel

Vercel sets `process.env` from project Settings, not from `.env`
files. Set every required variable (`DATABASE_URL`, `JWT_SECRET`,
`CLIENT_ORIGIN`, `NODE_ENV=production`) in the Vercel dashboard
under **Settings → Environment Variables**, then redeploy.

### Client can connect but logging in fails with `Invalid or expired token`

The client and server are using different `JWT_SECRET` values, or
the server's `JWT_SECRET` changed since the client last logged in.

- Local dev: clear your browser's localStorage for the site and
  log in again.
- Production: confirm `JWT_SECRET` matches between every server
  instance (Vercel uses one value across functions, but if you're
  running multiple deployment environments, each has its own
  variable set).

### First page-load takes 5+ seconds

Normal. The server runs `initDb()` on the first API request, which
creates all 90 tables and runs the essential seeds (ERG hazmat,
NFPA courses). Subsequent requests are fast. This happens once per
fresh database.

## Setup-wizard / first-run errors

### Setup wizard doesn't appear, but no chief account exists

The wizard only shows when:

1. The `users` table is empty, AND
2. No `BOOTSTRAP_CHIEF_*` env vars are set

If you set `BOOTSTRAP_CHIEF_USERNAME` and the user was auto-created
on first boot, the wizard considers itself done. Either log in with
the bootstrap credentials, or:

```sql
DELETE FROM users;
```

and remove the `BOOTSTRAP_CHIEF_*` vars, then refresh the page.

### Setup wizard rejects the password as too short

The minimum is 8 characters. Pick a longer one. There are no
character-class requirements (no forced symbols / digits / case)
because those rules don't improve actual password strength and
discourage long passphrases.

## Database errors

### `relation "xyz" does not exist`

A migration didn't run. Possible causes:

1. The server crashed during initial `initDb()` and never finished
   creating tables. Restart the server; `initDb()` is idempotent
   and will resume.
2. The `DATABASE_URL` points at a different database than you
   expected. Verify with `psql $DATABASE_URL -c '\dt'`.
3. The schema was manually altered. Restore from backup, or run
   the relevant `CREATE TABLE IF NOT EXISTS` block from
   `server/src/db.js` by hand.

### `duplicate key value violates unique constraint`

Usually means a seed file ran twice. The seed scripts use
`ON CONFLICT DO NOTHING` for idempotency, but some early ones
don't — if you hit this on a seed-related operation, the failing
seed is the culprit. Open `server/src/seeds/` and check the file
named in the stack trace.

If it's `users` or `members`, you've probably manually inserted a
record that conflicts with a seed. Either delete the manual record
or skip the seed (`SEED_DEMO=false`).

### Performance: queries on the dispatch view are slow

Confirm indexes exist on `cad_alerts(station_id, dispatched_at)`
and `incidents(station_id, opened_at)`. These are created by
`initDb()`, but if you migrated from an early-2025 build they may
not be present:

```sql
CREATE INDEX IF NOT EXISTS idx_cad_alerts_station_dispatched
  ON cad_alerts (station_id, dispatched_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_station_opened
  ON incidents (station_id, opened_at DESC);
```

## Dispatch / CAD errors

### Active911 webhook returns 403 "Agency ID mismatch"

The `ACTIVE911_AGENCY_ID` env var is set, and the agency_id in the
incoming webhook payload doesn't match. Either:

1. Update the env var to match the agency_id Active911 is sending,
   OR
2. Unset the env var entirely (defaults the webhook URL to being
   the only secret)

### Active911 webhook returns 200 but dispatch view doesn't update

Three things to check in order:

1. **Are you connected to the dispatch stream?** Open the browser
   DevTools → Network → filter "stream". You should see a
   long-running connection to `/api/cad/stream`. If not, the
   client isn't subscribed.
2. **Is the dispatch landing in the right station?** Check
   `cad_alerts.station_id` for the most recent row. It must match
   the `stationId` claim in your JWT. If they don't match,
   `CAD_STATION_MAP` may be misconfigured.
3. **Is the SSE response being buffered upstream?** Some reverse
   proxies (especially nginx) buffer SSE by default. The server
   sets `X-Accel-Buffering: no` to disable this, but
   non-nginx proxies may need a different header.

### Scaffold CAD adapter returns 501

Expected. IamResponding, FirstDue, and Zuercher adapters are
registered but refuse to run until their `parse()` is validated
against a real webhook capture. See
`server/src/cad/adapters/<vendor>.js` for the checklist to take
each one out of scaffold mode.

## AI feature errors

### AI actions return "AI features are disabled"

`ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`, depending on the feature)
is unset. Add it to `server/.env` locally or to Vercel's
environment variables in production, then restart.

### AI features work locally but fail on Vercel

Vercel serverless functions have a 10-second timeout on the free
plan and 60 seconds on Pro. Some AI actions (especially the
incident command assistant and the report writer) routinely take
20-40 seconds. On the free plan, these features will time out.

Workarounds:

- Upgrade to Vercel Pro
- Move to a non-serverless host (Railway, Fly.io)
- Use a Claude Haiku-only configuration for the long-running
  actions (faster but lower quality)

## Production / hosting errors

### Vercel deploy fails with "no Output Directory named 'dist' found"

The build output directory is configured in `vercel.json`. If your
fork doesn't have that file (some older forks predate it), copy
`vercel.json` from upstream.

### Login works but every page after login is blank

Browser console probably shows a CORS error. `CLIENT_ORIGIN` in the
server env doesn't match the URL the browser is loading from.

- Local dev: `CLIENT_ORIGIN=http://localhost:5173`
- Production: `CLIENT_ORIGIN=https://your-deployment.vercel.app`
  (no trailing slash)

Multiple origins are allowed if comma-separated:
`CLIENT_ORIGIN=https://prod.vercel.app,https://staging.vercel.app`.

### Backups

Supabase's free tier includes daily backups for 7 days; the Pro
tier includes longer retention. For self-hosted Postgres, set up
`pg_dump` on a cron. Recommended minimum cadence is daily,
retained for 30 days.

To restore: drop the database, recreate it, and either restore the
pg_dump file or run `initDb()` against an empty database to start
fresh.

## Audit / CI errors

### PR fails the audit gate

The 14-point audit gate runs on every PR. A score that drops below
the base branch's score fails the check.

Common drops:

- New files added that aren't in the audit's known-files list →
  update the audit config in `openscaffold-core` (referenced by
  `.github/workflows/audit.yml`)
- README or CONTRIBUTING references something that no longer exists
- Component count claim in README diverges from actual component
  count

The audit output names the specific check that dropped. Fix that
check, push, and the gate re-runs.

## When all else fails

- File an issue using the bug-report template
- For urgent production issues with the live demo, email
  dale@openscaffoldlabs.com
- For security issues, see [SECURITY.md](../SECURITY.md) —
  please don't file public issues for vulnerabilities
