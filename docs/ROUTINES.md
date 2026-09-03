# Routines (scheduled watches)

A **routine** is a scheduled OpenFirehouse agent, not a chat persona and not
a second product. It uses the same signed-in badge and the same
`POST /api/agent/invoke` plug as [Ask Open Firehouse](ASK-OPEN-FIREHOUSE.md).

The first routine is the **weekday morning shift brief**.

## What it does

On weekday mornings it reads:

| Verb | What the chief sees |
|---|---|
| `board_read` | Command Board posture |
| `duty_read` | Who is riding today |
| `roster_read` | Headcount on file |
| `apparatus_status_read` | Units in service / OOS |
| `incident_read` | Anything that still looks open |

It writes a short digest an officer would actually read. It **stays silent**
when the house is calm or nothing changed since the last check (no spam).
It never writes incident / NFIRS / NERIS narrative, never clears a unit, and
never auto-Accepts a gated write.

## How Dale / Matt demo it (no cron SSH)

Public GitHub has no Vercel PR preview. Local `npm run dev` is the path.

1. Stack this branch on the Ask + MCP drafts (do **not** merge PR #2 or #3 to `main`).
2. `npm install` and `npm run dev` with `DATABASE_URL` + `JWT_SECRET`.
   `SEED_DEMO=true` / `OPENFIREHOUSE_DEMO=true` loads Maplewood so the board
   and duty list have something to say.
3. Sign in at `http://localhost:5173`.
4. Open **Ask Open Firehouse** (top bar).
5. Either:
   - Click **Run morning brief now** in the right-hand Duty brief card, or
   - Open **Routines → Morning brief** in the left rail and click the same button.
6. The Dashboard also shows the same card (same session, same invoke reads).

The button runs as the signed-in JWT. There is no bot account.

## Schedule

| Knob | Default | Where |
|---|---|---|
| Vercel Cron | `0 11 * * *` (11:00 UTC daily) | `vercel.json` |
| House clock | `07:00` | `MORNING_BRIEF_HOUR` |
| Time zone | `America/New_York` | `MORNING_BRIEF_TZ` |
| In-process ticker | off | `MORNING_BRIEF_INPROCESS=true` (or `OPENFIREHOUSE_DEMO=true` on a long-lived Node host, not Vercel) |
| Scheduled actor | first officer/chief in the department | `OPENFIREHOUSE_ROUTINE_ACTOR=<username>` |

11:00 UTC is **07:00 America/New_York during EDT**. The cron fires every day
so the scheduled-jobs panel does not go red over a weekend; the handler
does **not** write a visible brief on Saturday or Sunday.

On the scheduled tick the brief uses a **real department member** (officer
first, or `OPENFIREHOUSE_ROUTINE_ACTOR`) and calls `invoke()` as that badge.
That is a service path, not a superuser bot.

Self-hosters who are not on US Eastern should change the `vercel.json`
schedule (UTC) and/or `MORNING_BRIEF_TZ` / `MORNING_BRIEF_HOUR`.

## API

```
GET  /api/agent/routines
GET  /api/agent/routines/morning-brief
POST /api/agent/routines/morning-brief/run
GET  /api/cron/morning-brief          # CRON_SECRET; Vercel Cron
```

`POST .../run` is the demo door. It always returns a visible digest.

## What this is not

- Not a merge of PR #2 or #3 to `main`.
- Not a second SKU. MCP stays a plug.
- Not training-expiry, NERIS-stuck, or overnight watch (later routines).
- Not an external Grok / Inkbox client.
