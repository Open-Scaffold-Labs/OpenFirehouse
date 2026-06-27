# Active911 setup

A four-step walkthrough that gets dispatch alerts from your
Active911 account flowing into OpenFirehouse. Takes about ten
minutes if you have admin access to your Active911 agency.

This is the only fully-working CAD integration today. For the
others — IamResponding, FirstDue CAD, Zuercher — see
[CAD_INTEGRATION_STRATEGY.md](CAD_INTEGRATION_STRATEGY.md) for
status.

## What you need

- Admin access to your Active911 agency (you're listed as a
  Department Admin or higher in Active911's admin panel)
- A deployed OpenFirehouse instance with a public HTTPS URL
  (Vercel, Render, etc.) — local-only installs won't work because
  Active911 needs to reach your server from the public internet
- Five minutes for the smoke test at the end

## Step 1: Get your OpenFirehouse webhook URL

Log into OpenFirehouse as a chief. Go to **Settings → CAD
Integration**. The page shows your webhook URL, which looks like:

```
https://your-dept.vercel.app/api/cad/active911
```

(You can also derive this without the UI: it's your deployment's
base URL followed by `/api/cad/active911`.)

Copy the URL.

## Step 2: Add the webhook in Active911

1. Log into your Active911 admin panel at
   [interface.active911.com](https://interface.active911.com).
2. In the left sidebar, click **Agency Settings**.
3. Scroll to the **Webhooks** section. (If you don't see it, your
   Active911 plan may not include webhooks — contact Active911
   support to confirm.)
4. Click **Add Webhook**.
5. **URL:** paste the URL from Step 1.
6. **Trigger:** select "On dispatch" (or "All events" if you want
   status updates too — OpenFirehouse currently uses dispatch only).
7. **Format:** JSON.
8. Click **Save**.

Active911 will send a test payload right after you save. The
test usually fires within 30 seconds.

## Step 3: Verify the webhook landed

In OpenFirehouse, go to **Live Dispatch**. You should see a test
event appear at the top of the alert list with a description like
"Active911 webhook test."

If you don't see it within a minute:

- Check the OpenFirehouse server logs (Vercel: Project →
  Deployments → latest → Functions → `/api/cad/active911`). A
  successful test logs a JSON payload; an error logs the failure.
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) under "Dispatch /
  CAD errors" for the diagnostic checklist.

## Step 4: Optional — agency_id verification

By default, the OpenFirehouse Active911 endpoint accepts any
incoming payload — the webhook URL itself is the secret. This is
fine for most departments, especially with HTTPS, but you can add
a second factor by setting `ACTIVE911_AGENCY_ID`.

To find your Active911 agency_id, look at the payload in the test
event log. It's a field like `"agency_id": "ABC123"`.

Set the env var in your deployment:

- **Vercel:** Project Settings → Environment Variables → Add
  `ACTIVE911_AGENCY_ID=ABC123` → Redeploy
- **Local dev:** Add `ACTIVE911_AGENCY_ID=ABC123` to `server/.env`,
  restart the server

Active911 webhooks that don't carry a matching `agency_id` now
return 403. The webhook URL alone is no longer sufficient — a
leaked URL won't accept dispatches from elsewhere.

## What the integration does

Every Active911 dispatch creates a row in `cad_alerts` and a
matching row in `incidents`. The dispatch then:

1. Pushes via Server-Sent Events to every OpenFirehouse client
   subscribed to the dispatch stream **for the same station**
   (multi-station deployments correctly route)
2. Fires a Web Push notification to every member of the station
   who has push enabled
3. Becomes the source for an incident-command session if the chief
   opens it
4. Pre-populates address, units, call type, and dispatch timestamp
   in the NFIRS report draft

What it does **not** do:

- It does not send anything back to Active911. Status updates,
  closeout codes, and PCR data stay in OpenFirehouse. This is
  upstream Active911's design — their webhook is one-way.
- It does not handle audio. Active911's voice-page audio doesn't
  arrive over the webhook channel. Radio integration is tracked
  separately in
  [CAD_AND_RADIO_INTEGRATION.md](CAD_AND_RADIO_INTEGRATION.md).

## Multi-station departments

If one OpenFirehouse instance serves multiple stations, set
`CAD_STATION_MAP` to route dispatches per Active911 agency:

```bash
CAD_STATION_MAP='{"active911:ABC123":1,"active911:DEF456":2,"active911:GHI789":3}'
```

The keys are `active911:<agency_id>` and the values are the
OpenFirehouse `stationId`s. Dispatches whose agency_id doesn't
match any key fall back to `CAD_DEFAULT_STATION_ID` (default `1`).

## Removing the webhook

If you ever want to disconnect:

1. In Active911 admin, delete the webhook entry. Dispatches stop
   flowing immediately.
2. The OpenFirehouse `cad_alerts` table retains historical records;
   nothing gets deleted automatically.

## Troubleshooting

See the
[Dispatch / CAD errors](TROUBLESHOOTING.md#dispatch--cad-errors)
section of the main troubleshooting guide.

For Active911-specific issues (their interface, their plan
features), Active911's support is at support@active911.com.
