# Backup and restore

A practical guide for keeping your department's data safe. Aimed at
the chief or IT person responsible for the deployment. The advice
differs by hosting model — Supabase, Docker Compose, or BYO
Postgres — so each section stands on its own.

## What needs backing up

Two things:

1. **The Postgres database** — every member, incident, NFIRS report,
   training record, policy, hydrant, pre-plan, and so on. Without
   the database, the application is a blank shell.
2. **The uploads directory** — photos attached to incidents, scanned
   policies, signed documents, profile photos. Located at
   `server/uploads/` in self-hosted deployments. Vercel deployments
   typically use external object storage (or accept that uploads
   are ephemeral); see the Vercel section below.

Configuration (`.env`) is not backed up automatically because it
contains secrets. Keep a separate copy somewhere secure (1Password,
your password manager, a sealed envelope in the chief's desk —
whatever your department already uses for sensitive credentials).

## Backup strategy by hosting model

### Supabase (managed)

Supabase includes Postgres backups by tier:

- **Free** — daily backups retained for 7 days, no point-in-time recovery
- **Pro** — daily backups retained for 7-30 days plus point-in-time
  recovery within 7 days
- **Team / Enterprise** — extended retention and longer PITR windows

For a volunteer department, the free tier's 7-day retention is
adequate but thin. Recommended cadence: weekly manual dump that
you keep yourself, in case Supabase has an outage at the same time
you have a data problem.

Manual dump from Supabase:

```bash
# From your laptop, with PostgreSQL client installed
pg_dump "$DATABASE_URL" \
  --no-owner --no-privileges --clean --if-exists \
  --file=openfirehouse-$(date +%Y%m%d).dump.sql
```

Compress and store somewhere off-site (Google Drive, Dropbox, a
NAS at the firehouse, or an encrypted USB drive that you swap
weekly).

**Automated (the hosted/flagship deployment):** the repo ships a
nightly encrypted backup job, `.github/workflows/db-backup.yml` —
a `pg_dump` at 08:20 UTC, AES256-encrypted, kept 30 days as a
GitHub artifact. It is an independent second copy in a different
failure domain from Supabase's own daily backups. To enable it,
set two repo secrets: `PROD_DATABASE_URL` (Session-pooler
connection string, port 5432) and `BACKUP_PASSPHRASE` (keep a copy
with your other deployment secrets — without it the backups are
unrecoverable). Owner: Dale (DB surface). Run a restore drill
quarterly: decrypt with `gpg -d`, `pg_restore` into a scratch
database, and spot-check row counts on `members`, `incidents`,
and `departments`.

**Retention/pruning** is separate from backup and handled in the
database itself: migration 0034 (with the 0035 hardening) prunes
six operational tables nightly on operator-tunable windows. Legal
records (incidents, exposure, grievances) are never auto-pruned.

Uploads on Vercel + Supabase: Vercel's serverless functions don't
have persistent disk, so `server/uploads/` is ephemeral by design.
The recommended path is to switch to Supabase Storage or an S3
bucket; until then, downloads from the app are the only backup.
Tracked as a known limitation.

### Docker Compose (self-hosted)

Two volumes contain your data: `openfirehouse_db` (Postgres) and
`openfirehouse_uploads` (file uploads). Back them up with a small
cron script:

```bash
#!/bin/bash
# /opt/openfirehouse-backup.sh — run nightly via cron
set -euo pipefail

BACKUP_DIR=/var/backups/openfirehouse
DATE=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

# Database
docker compose -f /opt/openfirehouse/docker-compose.yml exec -T db \
  pg_dump -U openfirehouse openfirehouse \
  | gzip > "$BACKUP_DIR/db-$DATE.sql.gz"

# Uploads volume
docker run --rm \
  -v openfirehouse_uploads:/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine \
  tar czf "/backup/uploads-$DATE.tar.gz" -C /data .

# Keep last 30 days
find "$BACKUP_DIR" -name "*.gz" -mtime +30 -delete
```

Add to root's crontab:

```cron
30 2 * * * /opt/openfirehouse-backup.sh
```

Recommended additional step: rsync or scp the resulting backups to
off-machine storage (a second server, a NAS, S3-compatible object
storage like Backblaze B2). Local-only backups protect you from
deletion accidents but not from a server fire.

### BYO Postgres (self-managed)

If your IT staff runs Postgres on their own infrastructure, they
almost certainly have a backup process already. Make sure
OpenFirehouse's database is in scope.

The minimum standard for any production deployment:

- Daily logical backup (`pg_dump`) retained for 30 days
- Weekly off-site copy (different building, different cloud
  region, different physical disk)
- Quarterly restore drill (see below)

## Restore procedure

The restore is one command but it destroys whatever data is
currently in the database — no merging, no append. Practice this
on a staging copy before you ever need it for real.

### From a Docker Compose backup

```bash
# Stop the app so it doesn't write during restore
docker compose stop app

# Restore the database from your backup file
gunzip -c /var/backups/openfirehouse/db-20260601-023000.sql.gz \
  | docker compose exec -T db psql -U openfirehouse -d openfirehouse

# Restore uploads
docker run --rm \
  -v openfirehouse_uploads:/data \
  -v /var/backups/openfirehouse:/backup \
  alpine \
  sh -c "cd /data && tar xzf /backup/uploads-20260601-023000.tar.gz"

# Bring the app back up
docker compose start app
```

### From a manual pg_dump

```bash
# Ideally restore into a fresh empty database, not over the live one
psql "$DATABASE_URL" < openfirehouse-20260601.dump.sql
```

If you're restoring over an existing database that has data, drop
and recreate it first:

```sql
DROP DATABASE openfirehouse;
CREATE DATABASE openfirehouse;
```

### After any restore

1. Restart the application so `initDb()` reconciles any schema
   drift between the dump version and the current code.
2. Smoke-test by logging in as chief, opening Live Dispatch, and
   verifying that a recent incident appears.
3. Check `bug_reports` for anything submitted right around the
   restore window so you know what got missed.

## Restore drill

Do this every quarter, or after any significant code upgrade. It
takes about 30 minutes and catches the failures (missing schema
upgrades, corrupted backup files, expired credentials) that turn
"we have backups" into "we have backups that don't work."

The drill:

1. Spin up an empty staging environment (a second Docker Compose
   stack on a different port, or a throwaway Supabase project)
2. Restore the most recent backup into it
3. Open the app, log in, navigate to Live Dispatch, NFIRS Reports,
   Members, Apparatus, Pre-Plans
4. Confirm everything renders without errors
5. Document the time the drill took and any rough edges. Take this
   to your next chief's meeting so the department knows the data
   is recoverable.

A backup you've never restored is a hope, not a backup.

## Disaster scenarios

| Scenario                                | What to do |
| --------------------------------------- | ---------- |
| Accidental data deletion (one record)   | Restore most recent backup to a staging environment, copy the missing record back via SQL `INSERT`, or re-enter manually if simpler. |
| Schema corruption / failed migration    | Roll back the application to the previous version, restore database backup taken before the upgrade, investigate the migration issue offline. |
| Server hardware failure                 | Stand up a new server, restore most recent off-site backup. Recovery time is bounded by your backup transfer speed. |
| Ransomware on the host                  | Restore from off-site backup to a clean host. Treat the compromised host as forensic evidence; do not attempt to clean it in place. |
| Catastrophic loss (fire, theft, flood)  | Same as ransomware. The off-site backup is the entire reason this row exists in the table. |

## What we recommend, in plain English

For a volunteer department on Supabase + Vercel:

- Trust Supabase's daily backups for routine recoverability
- Run a manual weekly `pg_dump` to your own storage — five minutes
  of effort per week buys you independence from Supabase being up
- Don't promise users that uploaded incident photos are durable
  yet; tell them to keep their own copies until OpenFirehouse
  ships proper external-storage integration

For a department self-hosting via Docker:

- The cron script above, running nightly
- Off-site rsync to a NAS or cloud object storage
- Quarterly restore drill

Either way: the chief or IT person responsible should be able to
articulate, without looking it up, "if our data is gone tomorrow,
the most we lose is X hours of work, and we can be back online in
Y hours." If you can't say that, your backup story isn't done yet.
