# Upgrading OpenFirehouse

OpenFirehouse hasn't started cutting tagged releases yet — `main`
is the working line, and self-hosters pull from there. This document
covers what to do when you upgrade, regardless of whether you're
upgrading by ten commits or by ten months.

When tagged releases begin, this document grows version-specific
sections. Until then, the general procedure is the same every time.

## Before you upgrade

1. **Read [CHANGELOG.md](../CHANGELOG.md)** for anything between your
   current commit and `main`. Look for entries marked
   `BREAKING` or `Security`.
2. **Take a backup.** Always. See
   [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md). The two-minute
   investment up front is the difference between "the upgrade
   broke something, let me revert" and "the upgrade broke
   something, my data is gone."
3. **Read the new release's `.env.example`** against your current
   `.env`. New env vars are usually optional but may be required
   for new features you'd like enabled.

## Upgrading

### Docker Compose

```bash
cd /opt/openfirehouse   # or wherever you cloned

# Save a backup first
./backup.sh   # or whatever your backup command is

# Pull latest code
git fetch origin
git pull origin main

# Rebuild and restart
docker compose build app
docker compose up -d app

# Watch the logs for migration messages
docker compose logs -f app
```

The first request after restart triggers `initDb()`, which runs any
new `ALTER TABLE` migrations idempotently. This is normally fast
(seconds), but large databases with new indexes can take longer.

### Vercel

Vercel auto-deploys on push to `main` (if you've connected your fork
to your Vercel project). To upgrade:

```bash
git pull upstream main      # in your fork
git push origin main        # → triggers Vercel build
```

Watch the Vercel deployment dashboard. The first request after
deploy triggers `initDb()` against your production database. If
the migration fails, the deployment doesn't roll back automatically
— you'll see errors in the function logs but the old code keeps
serving while you investigate.

### BYO host

Whatever PM2 or systemd unit you have managing the Node process:

```bash
git pull origin main
npm install   # picks up any new dependencies
npm run build # rebuilds the client
# restart your process manager
systemctl restart openfirehouse    # or pm2 restart all
```

## Post-upgrade checks

After any upgrade, run through this five-minute checklist:

1. **Health endpoint** — `curl https://your-deployment/health` returns 200
2. **Login works** — log in as chief
3. **Dispatch view loads** — Live Dispatch page renders, even if no
   recent dispatches
4. **AI features still respond** (if configured) — try an AI action
   on a sample incident
5. **Bug report submission succeeds** — Settings → Report a bug, submit
   a test report. This exercises the database write path, the AI
   diagnostic, and the Resend forwarding (if configured) in one shot.

If any of those fail, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Rolling back

If the upgrade goes badly, you have two options:

### Option A — revert the code only

If the database schema didn't change (no new `ALTER TABLE` ran),
just check out the previous commit and restart:

```bash
git log --oneline -5            # find the previous good commit
git checkout <commit-sha>
docker compose build app && docker compose up -d app
```

This works when the new code added a feature, broke something, but
didn't touch the schema.

### Option B — revert code and restore database

If the new code ran schema migrations and you need them undone, the
safe path is to restore your pre-upgrade backup:

```bash
docker compose stop app
gunzip -c /var/backups/openfirehouse/db-pre-upgrade.sql.gz \
  | docker compose exec -T db psql -U openfirehouse -d openfirehouse
git checkout <previous-commit>
docker compose build app && docker compose up -d app
```

You lose any data written between the backup and the rollback.

## What changes between upgrades

In practice, upgrades touch one or more of these:

- **Schema** — new tables, new columns, new indexes added via
  `ALTER TABLE IF NOT EXISTS` patterns in `server/src/db.js`.
  These run automatically and are idempotent.
- **Env vars** — new optional env vars in `server/.env.example`.
  Check the [CONFIGURATION.md](CONFIGURATION.md) reference for
  what each one does.
- **Dependencies** — `npm install` resolves these. Occasionally
  Node major-version requirements bump; check the `engines` field
  in `package.json`.
- **Client bundle** — Vite rebuilds the client. Users with the old
  bundle in their browser may need to hard-refresh (Cmd+Shift+R,
  Ctrl+Shift+R). The service worker tries to handle this
  automatically.
- **CAD adapters** — vendor-specific changes to
  `server/src/cad/adapters/`. If you've added a custom adapter,
  rebase your changes on top.

## When tagged releases begin

The plan is to start tagging releases once we have a stable
external-contributor cadence (probably mid-2026). At that point:

- Each release will have a tag (`v0.14.0`, `v1.0.0`, etc.)
- Each release will have a GitHub Release page with migration
  notes
- The CHANGELOG entries will be organized by tag
- LTS releases will be marked, with explicit support windows

Until then, `main` is the supported line. Pull when you want
features and fixes; pause when you don't.

## Long pauses

If you've been on an older commit for several months and are now
catching up, the upgrade is still one `git pull` — but the
post-upgrade checklist matters more than usual. Set aside an hour,
take the backup, and walk through the checks deliberately.

A safer alternative for very long catches: spin up a fresh
deployment from the latest `main`, point it at a copy of your
production database, smoke-test the whole flow in your spare
environment, then cut over by swapping DNS or environment
configuration. Takes longer in calendar time, but you discover any
issues in a place where rolling back is just "don't switch the
DNS."
