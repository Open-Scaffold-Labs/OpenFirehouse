# OPENFIREHOUSE — Development Workflow & Collaboration Guide

**Version 0.7.0 | March 2026**
**Maintained by Open Scaffold Labs**
[github.com/Open-Scaffold-Labs/OpenFirehouse](https://github.com/Open-Scaffold-Labs/OpenFirehouse)

---

## 1. How This Works

Contributors push directly to the **main** branch on GitHub. Every push to main automatically deploys the live app via Vercel. For larger or riskier changes, open a pull request and ask another contributor to review before merging.

| Component | Stack | Deploys To |
|-----------|-------|------------|
| Frontend | React 19 + Vite + Tailwind | Vercel (auto) |
| Backend | Node.js + Express | Vercel serverless functions (auto, DB on Supabase) |
| Database | PostgreSQL | Supabase (managed) |
| Repo | GitHub (Open-Scaffold-Labs/OpenFirehouse) | Open Scaffold Labs team + invited contributors |

### Key URLs

- **Live App:** [openfirehouse.openscaffoldlabs.com](https://openfirehouse.openscaffoldlabs.com)
- **GitHub:** [github.com/Open-Scaffold-Labs/OpenFirehouse](https://github.com/Open-Scaffold-Labs/OpenFirehouse)
- **API:** Vercel serverless functions (deployed on the same Vercel project)

---

## 2. The One Rule That Matters

> ⭐ **Always pull before you start working and pull again before you push. That's it. Git handles the rest.**

Git has built-in safeguards that prevent you from overwriting other contributors' work:

**Push rejection:** If someone else pushed and you try to push without pulling, Git rejects the push. Pull first, then push. Works both ways.

**Auto-merge:** If you edited different files, Git combines both changes automatically. No extra work.

**Conflict detection:** If two contributors edited the same lines in the same file, Git flags it. Whoever pulled resolves it. This is rare when working on different features.

---

## 3. One-Time Setup

Do these steps once on your machine. After this, you're ready to develop.

### 1. Clone the repo

```bash
git clone https://github.com/Open-Scaffold-Labs/OpenFirehouse.git
cd OpenFirehouse
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up the server environment

```bash
cp server/.env.example server/.env
```

Then open `server/.env` in your editor and paste your `DATABASE_URL` (your own local Postgres, or a connection string provided by a maintainer). The `.env` file is in `.gitignore` so it never gets committed.

### 4. Start the app

You need two separate Terminal windows running at the same time.

**Terminal 1 — Server:**
```bash
cd ~/OpenFirehouse
export DATABASE_URL="postgresql://$(whoami)@localhost:5432/freestation"
npm run dev:server
```

**Terminal 2 — Client:**
```bash
cd ~/OpenFirehouse
npm run dev:client
```

> **Note:** `npm run dev` does not exist as a script. You must run the client and server separately using the two commands above.

### 5. Open in browser

Go to **http://localhost:5173** and log in with **chief / 1234**

> Other test logins: `officer / 1234` and `member / 1234` (different permission levels).

---

## 4. Daily Workflow

Follow these steps every time you sit down to code. It takes 10 seconds and prevents all sync problems.

### Before You Start Working

```bash
cd OpenFirehouse
git pull origin main
```

This downloads any changes other contributors made since your last session. If packages changed, also run `npm install`.

### While You Work

Edit code, test locally at localhost:5173. Nothing special here — just code normally.

### When You're Ready to Push

**1. Stage your files:**

```bash
git add <files you changed>
```

> **Tip:** use `git status` to see what changed. Use `git add .` to stage everything, or list specific files.

**2. Bump the version** (see Section 5 below)

**3. Commit your changes:**

```bash
git commit -m "Brief description of what you changed"
```

**4. Pull again** (in case someone else pushed while you were working):

```bash
git pull origin main
```

**5. Push:**

```bash
git push origin main
```

**6. Verify:** Open the live site in a Private/Incognito window to confirm your changes deployed.

> ⚠️ **Always use Private/Incognito to check the live site.** The service worker caches aggressively, and a normal browser window may show an old version.

---

## 5. Version Bumping

Every push that deploys must bump the build number. This ensures the service worker cache updates and users see the latest version.

### Three Files to Update

1. **client/package.json** — increment `"buildNumber"`
2. **server/package.json** — increment `"buildNumber"` (keep it matching)
3. **client/public/sw.js** — update the `CACHE_NAME` string

Example: if `buildNumber` is currently 2, change it to 3 in both package.json files, and update sw.js:

```js
// In sw.js, change:
const CACHE_NAME = 'openfirehouse-v0.10.10';

// To:
const CACHE_NAME = 'openfirehouse-v0.10.11';
```

### Full Version Format

The app uses four-part versioning: **major.minor.patch.build**

| Part | Name | When It Changes | Example |
|------|------|-----------------|---------|
| 1st | Major | Big milestone release | **1.0.0.0** |
| 2nd | Minor | New feature or module | **0.8.0.0** |
| 3rd | Patch | Bug fix, UI tweak | **0.7.1.0** |
| 4th | Build | Every single deploy | **0.7.0.3** |

For routine work, contributors only need to bump the build number. Maintainers handle major/minor/patch bumps when cutting a release.

---

## 6. Working with Claude (Cowork mode)

Open Scaffold Labs uses Claude in Cowork mode for parts of this workflow. Claude makes code changes, bumps the version, commits, and pushes to main. Vercel auto-deploys.

If you're sharing the repo with a Claude-driven workflow alongside human contributors, the same rule applies: always have Claude run `git pull` at the start of a session so it picks up everyone else's work.

See `docs/CONTRIBUTING-WITH-CLAUDE.md` for the patterns the team uses when working with Claude on this codebase.

---

## 7. A Typical Day

| Time | Contributor A | Contributor B |
|------|---------------|---------------|
| 9:00 AM | `git pull` — gets latest | `git pull` — gets latest |
| 9:30 AM | Works on weather widget | Works on training module |
| 10:15 AM | `git pull` + `push` — deploys | Still working... |
| 10:30 AM | Verifies on Vercel ✔ | `git pull` — gets A's fix |
| 11:00 AM | Sees B's changes next pull | `git pull` + `push` — deploys |

---

## 8. Troubleshooting

### "Git rejected my push"

This means someone else pushed while you were working. Totally normal. Just run:

```bash
git pull origin main
git push origin main
```

### "Merge conflict"

This means two contributors edited the same lines. Git marks the conflict in the file with `<<<<<<<` and `>>>>>>>` markers. Open the file, pick the correct version, delete the markers, then:

```bash
git add <the-conflicted-file>
git commit -m "Resolve merge conflict"
git push origin main
```

### "The live site looks old or broken"

The service worker caches aggressively. Open a Private/Incognito window and check again. If it's still broken, check the Vercel dashboard for build errors.

### "I need to undo my last push"

```bash
git revert HEAD
git push origin main
```

This creates a new commit that reverses your last change. It's safe and doesn't affect history.

> ⚠️ **Never use `git reset --hard` or `git push --force`.** These can destroy other contributors' work.

### "npm run dev:server or dev:client fails after pulling"

Someone probably added new packages. Run `npm install` and try again.

---

## 9. Quick Reference Card

| What You Want to Do | Command |
|---------------------|---------|
| Start the server (Terminal 1) | `export DATABASE_URL="postgresql://$(whoami)@localhost:5432/freestation" && npm run dev:server` |
| Start the client (Terminal 2) | `npm run dev:client` |
| Get the latest code | `git pull origin main` |
| See what you changed | `git status` |
| Stage your changes | `git add <files>` or `git add .` |
| Commit | `git commit -m "description"` |
| Push (triggers deploy) | `git push origin main` |
| View recent commits | `git log --oneline -10` |
| Undo last commit safely | `git revert HEAD && git push` |
| Re-install packages | `npm install` |
| Log in (local dev) | `chief / 1234` |

> **Remember: pull, work, pull, push. That's the whole workflow.**

---

## 10. Rules to Live By

1. **Always pull before you start** and pull again before you push.
2. **Never commit server/.env** — it has the database password and is already in `.gitignore`.
3. **Bump the version on every push** — `buildNumber` in both package.json files + `CACHE_NAME` in sw.js.
4. **Use Private/Incognito** to verify the live site after deploying.
5. **Never force-push to main** — no `git push --force` or `git reset --hard`. Use `git revert` instead. (Maintainers may occasionally force-push for security/scrub reasons; coordinate before doing so.)
6. **Communicate** — a quick heads-up like "I'm working on the schedule module" avoids conflicts entirely.
