# Installing OpenFirehouse

This guide walks a fire department's IT staff (or a tech-comfortable
chief) from a fresh GitHub clone to a working OpenFirehouse with a
first chief account ready to log in. It assumes no prior experience
with Node.js, Postgres, or Vercel.

If something doesn't work, [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
covers the common failures.

> **Maintainers — reproducible installs, CI, and disaster recovery:** the
> database schema is rebuilt from a committed, structure-only baseline
> (`db/baseline.sql`), not assembled piecemeal. See
> [SCHEMA-BASELINE.md](SCHEMA-BASELINE.md).

## Quick path: Docker Compose

If you have Docker installed and just want a working OpenFirehouse
on your own server, the Compose path is faster than the per-step
walkthrough below.

```bash
git clone https://github.com/Open-Scaffold-Labs/OpenFirehouse.git
cd OpenFirehouse
cp server/.env.example .env
# Edit .env — at minimum change JWT_SECRET to something random
docker compose up -d
```

Open http://localhost:3005. The setup wizard guides you through
creating your first chief account.

This brings up both OpenFirehouse and a Postgres database in
containers, with persistent volumes for data and uploads. Backups,
upgrades, and customization from this point are covered in
[BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md) and
[UPGRADING.md](UPGRADING.md).

The step-by-step walkthrough below is for departments that want to
deploy to Vercel + Supabase (the no-server-management path) or that
need finer control than Compose gives.

## What you need before you start

- **A computer that can run Node.js** — any Mac, Windows, or Linux
  machine made in the last seven years. About 4 GB of free disk
  space.
- **A Postgres database.** The two reliable choices:
  1. **Supabase** (recommended). Free tier is sufficient for any
     volunteer department. Takes about 5 minutes to set up at
     [supabase.com](https://supabase.com).
  2. **Local Postgres.** If your IT staff already runs Postgres
     somewhere, you can point OpenFirehouse at that. Version 14 or
     newer.
- **A way to host the application.** For most departments,
  [Vercel](https://vercel.com) is the right choice — free tier,
  automatic deploys from GitHub, and the live demo runs on it
  today. Alternatives: Railway, Render, Fly.io, or your own server.
- **About 30 minutes.** Less if you've done this before.

## Step 1: Set up a Postgres database

### Option A — Supabase (recommended)

1. Go to [supabase.com](https://supabase.com) and click **Start your
   project**. Sign up with GitHub if you don't have an account.
2. Click **New Project**. Choose a name like `openfirehouse-<your-dept>`.
   Pick the region closest to your station. Set a database password
   and write it down — you'll need it in a minute.
3. Wait about two minutes for the database to provision. While you
   wait, the dashboard will show you the project's Postgres
   credentials.
4. In the left sidebar, click **Settings → Database**. Under
   **Connection string**, copy the URI that looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[your-project-ref].supabase.co:5432/postgres
   ```
   Replace `[YOUR-PASSWORD]` with the password you set. Keep this
   string somewhere safe — that's your `DATABASE_URL`.

### Option B — Local Postgres

If your IT staff prefers local Postgres, install version 14+ on the
target server. Create a database:

```bash
createdb openfirehouse
```

Your `DATABASE_URL` looks like:
```
postgresql://your-username:your-password@localhost:5432/openfirehouse
```

OpenFirehouse will create all its tables automatically on first
startup (`initDb()` runs on first API request).

## Step 2: Clone the repository

```bash
git clone https://github.com/Open-Scaffold-Labs/OpenFirehouse.git
cd OpenFirehouse
```

## Step 3: Install dependencies

OpenFirehouse uses npm workspaces, so a single install at the root
covers both the client and the server:

```bash
npm install
```

This takes 1-3 minutes depending on your network.

## Step 4: Configure environment variables

Copy the example file and fill it in:

```bash
cp server/.env.example server/.env
```

Open `server/.env` in any text editor. The required fields:

```bash
PORT=3005
DATABASE_URL=postgresql://...     # ← from Step 1
JWT_SECRET=<a long random string>  # see below
CLIENT_ORIGIN=http://localhost:5173
NODE_ENV=development
```

**Generating `JWT_SECRET`.** This is the secret OpenFirehouse uses to
sign authentication tokens. Don't use a guessable value. Generate one
with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste the output as `JWT_SECRET`.

**Everything else is optional.** The
[CONFIGURATION.md](CONFIGURATION.md) reference covers every other
variable. You don't need any of them to run OpenFirehouse — they
unlock AI features, SMS alerts, CAD webhooks, etc., once you're
ready.

## Step 5: Create your first chief account

You have two options.

### Option A — Setup wizard (recommended for first time)

Just start the server (Step 6). When you open the app in your browser
and the database has no users yet, OpenFirehouse shows a one-page
setup wizard asking for your name, username, and password. Fill it
in; you're logged in as chief.

### Option B — Environment variables (headless install)

Add these lines to `server/.env`:

```bash
BOOTSTRAP_CHIEF_USERNAME=chief
BOOTSTRAP_CHIEF_PASSWORD=change-me-on-first-login
BOOTSTRAP_CHIEF_NAME=Your Name Here
```

When the server boots and the `users` table is empty, it auto-creates
that account. Useful if you're deploying via CI or doing the install
on a headless server.

Either way, **delete or change the password the first time you log
in.**

## Step 6: Start it up

From the repo root:

```bash
npm run dev
```

This starts the client (on port 5173) and the server (on port 3005)
concurrently. Open [http://localhost:5173](http://localhost:5173) in
your browser.

The first API request triggers `initDb()`, which creates all the
schema tables and seeds the ERG hazmat reference data and the NFPA
course catalog. The first page-load takes a couple of seconds longer
than subsequent ones because of this.

If you see the setup wizard, fill it in. If you used the
`BOOTSTRAP_CHIEF_*` env vars, log in with those credentials.

## Step 7: Deploy to production

For most departments, the path is:

1. **Push your fork** to a private GitHub repo your department owns.
2. **Connect Vercel to that repo.** vercel.com → Add New → Project
   → import the repo.
3. **In Vercel's project settings, add the same environment variables**
   you set in `server/.env`. At a minimum: `DATABASE_URL`,
   `JWT_SECRET`, `CLIENT_ORIGIN` (set to your Vercel URL),
   `NODE_ENV=production`.
4. **Click Deploy.** Vercel builds and hosts the app. You get a URL
   like `your-dept-openfirehouse.vercel.app`.

The live demo (open-firehouse-client.vercel.app) is deployed exactly
this way.

## Step 8: Optional — turn on CAD integration

If your department uses Active911, see
[CAD_SETUP_ACTIVE911.md](CAD_SETUP_ACTIVE911.md) for the four-step
walkthrough. Other CAD vendors are tracked in
[CAD_INTEGRATION_STRATEGY.md](CAD_INTEGRATION_STRATEGY.md) — adapter
scaffolding exists for IamResponding, FirstDue, and Zuercher; each
takes about a week of work to complete against a real webhook
payload.

## What just happened (summary)

You now have:

- A self-hosted OpenFirehouse with the entire feature set
- Your own Postgres database holding your department's data — nobody
  at Open Scaffold Labs can read it
- A chief account you control
- Public-domain ERG hazmat data and NFPA training-course catalog
  pre-loaded
- Zero recurring software costs (Supabase free tier + Vercel free
  tier covers it; ANTHROPIC_API_KEY for AI features is the only
  cost, and that's pay-per-use)

What you do **not** have yet, and probably want next:

- A real backup schedule. See
  [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for the recommended cadence
  if you're on Supabase.
- Your member roster imported. Use the in-app member-import flow
  under `Settings → Members → Import CSV`.
- Your apparatus list, your hydrant data, your pre-plans, your
  policies. All importable via Settings or via the CSV upload pages.

Welcome aboard.
