# CAD & Radio Integration Guide

_How to wire OpenFirehouse to your dispatch (CAD) system and your radio
traffic. Three integration paths, in order of effort and fidelity._

OpenFirehouse ships with **receive-side infrastructure complete**: SSE
streaming for CAD dispatch alerts, a WebSocket radio transcript feed,
search/filter/talkgroup-color UI, and AI hooks that can tag, classify,
and link inbound traffic to active incidents in real time.

What OpenFirehouse does **not** ship with is the ingestion-side glue
between your specific CAD vendor and radio system and the OpenFirehouse
API endpoints. That glue is necessarily department-specific. This
document covers the three integration paths in increasing order of
effort and capability.

---

## What ships in the core repo today

| Endpoint / channel | Status | What it does |
|---|---|---|
| `POST /api/cad/active911` | ✅ Production-ready | Public webhook. Active911 POSTs dispatch JSON; OpenFirehouse saves it, fires SSE to all connected browser tabs in the same station, and triggers the Layer 3 auto-pipeline (AI-enriched draft incident creation). |
| `POST /api/cad/incoming` | ✅ Production-ready | Generic CAD webhook for vendors with HTTP webhook support that don't match Active911's payload shape. Same downstream pipeline. |
| `GET /api/cad/stream` (SSE) | ✅ Production-ready | Authenticated browser tabs subscribe and receive dispatches in real time. Station-scoped — a tab from Dept A never sees Dept B's traffic. |
| `POST /api/radio/ingest` | ✅ Production-ready | Accepts already-transcribed radio messages (one or batched). Saves to `radio_log`, broadcasts to WebSocket subscribers, optionally invokes the AI classifier. |
| `WS /ws/radio` | ✅ Production-ready | Real-time radio transcript stream. Clients authenticate with JWT-derived station ID or a TV display PIN. Server maintains a per-station Set of subscribers; broadcasts within station. |
| `POST /api/radio/simulate` | ✅ Demo-only | Injects fake radio chatter for development and demo purposes. Not used in production. |
| Audio→text transcription | ❌ **Not in the repo** | You provide this. See the three paths below. |
| SDR gateway / radio audio capture | ❌ **Not in the repo** | You provide this. See Path C. |

The brochure's "Radio Feed" card and "CAD Integration" card are honest
about this. Receive-side is built; ingestion-side is your call to make
based on your department's existing infrastructure.

---

## Path A — Active911 + manual radio (lowest effort, lowest fidelity)

**Best for:** volunteer departments already using Active911, where adding
new hardware to the station isn't realistic.

### CAD wiring (30 minutes)

1. Log in to your Active911 admin console.
2. **Settings → Integration → Webhooks → Add Webhook.**
3. Configure:
   - URL: `https://your-openfirehouse-host.example.com/api/cad/active911`
   - Method: POST
   - Headers: (none required — the endpoint is public by design)
   - Trigger: "On dispatch"
4. Save. Fire a test dispatch from Active911.
5. Watch the OpenFirehouse Command Board live — the dispatch appears
   within 1-2 seconds. A draft incident can be auto-created in
   `olf_incidents` from CAD facts. Incident narrative stays
   officer-written — AI does not draft it.

### Radio (manual entry)

Designated dispatcher or duty officer types significant radio events
into the Radio Log page as they happen. The same UI works on a station
TV, an iPad in the watch room, or a phone in someone's pocket. AI
classification (priority, talkgroup, incident link) is automatic on
every entry.

**Ongoing cost:** labor. Roughly 5-10 minutes per active incident.
**Best fit:** departments with a watch-room volunteer or duty officer
who's already paying attention to radio traffic.

---

## Path B — Active911 + Broadcastify Calls + Whisper (medium effort, medium fidelity)

**Best for:** departments that want automated radio transcription
without installing hardware at the station.

### Prerequisites

- Broadcastify Calls subscription (~$15/month per station)
- Your department's dispatch frequency is monitored on Broadcastify (check at broadcastify.com)
- OpenAI account with Whisper API access (or a self-hosted whisper.cpp instance)

### How it works

Broadcastify Calls publishes per-transmission audio files with metadata
(timestamp, talkgroup, duration, source). A small worker process:

1. Polls Broadcastify's Calls API every 30 seconds for your monitored
   system.
2. Downloads new audio transmissions.
3. Pipes each transmission to Whisper for transcription.
4. POSTs the transcript + metadata to `/api/radio/ingest` on your
   OpenFirehouse instance.

The transcript appears in OpenFirehouse 30-90 seconds after the
transmission ended. Good enough for situational awareness, not good
enough for active-incident command (use Path C for that).

### Implementation

A reference worker is **not yet in this repo** but is straightforward
to write. ~150 lines of Node or Python. We'll publish one as
`openfirehouse-broadcastify-gateway` when there's customer demand.

**Ongoing cost:** ~$15/month Broadcastify + ~$0.006/min Whisper = roughly
$25/month per station for departments with typical call volume.

---

## Path C — RTL-SDR + Whisper at the station (highest effort, highest fidelity)

**Best for:** departments running real-time command operations where
the 30-second delay of Path B is unacceptable.

### Prerequisites

- Raspberry Pi 4 or 5 (~$60 with case + power)
- RTL-SDR USB dongle (~$30 — RTL-SDR Blog v4 recommended)
- Discone antenna for VHF/UHF fire-band reception (~$50)
- Total hardware: ~$140 per station
- Local Whisper instance via `whisper.cpp` (free, runs on the Pi itself
  for analog conventional systems; needs a small server for P25)

### How it works

1. RTL-SDR captures RF on your dispatch frequency (conventional analog,
   P25 Phase 1, or DMR depending on what your dept uses).
2. `rtl_fm` or `RTLSDR-Airband` (analog) or `DSDPlus`/`OP25` (digital)
   decodes the audio to a WAV stream.
3. A Voice-Activity-Detection (VAD) script segments audio into
   per-transmission clips.
4. Each clip is fed to `whisper.cpp` (or a local GPU server) for
   transcription.
5. The transcript + metadata (frequency, timestamp, signal quality)
   POSTs to `/api/radio/ingest` on your OpenFirehouse instance.

End-to-end latency: 2-8 seconds from radio key-up to text on screen.
Good enough for active fireground command.

### Implementation

We plan to ship a reference implementation as
`openfirehouse-radio-gateway` — a Docker image plus a Raspberry Pi
image for one-shot deployment. ~500-1,000 lines, plus a one-page setup
guide. Several days of focused work. This is the gateway the Tech
Architecture white paper assumes exists.

**Ongoing cost:** ~$140 hardware one-time + electricity. No
subscriptions if you run whisper.cpp locally.

**Caveat for digital systems:** P25 Phase 2, encrypted talkgroups, and
proprietary trunking systems (Motorola TRBO, NXDN) are technically
beyond what RTL-SDR + open-source decoders can handle reliably. Check
your dispatch frequency on RadioReference.com before investing in
hardware.

---

## Other CAD vendors (not Active911)

| Vendor | Webhook support | Recommended path |
|---|---|---|
| Active911 | ✅ Native | Path A |
| I Am Responding | ⚠️ Limited — outbound webhooks are an enterprise feature | Use generic `/api/cad/incoming` with a small adapter that polls their API |
| Tyler New World | ❌ No native webhook | Custom adapter polling their REST API |
| Motorola Premier One | ❌ No native webhook | Custom adapter |
| Hexagon OnCall (formerly Intergraph) | ⚠️ Vendor-dependent | Contact your CAD admin about webhook support |
| Sungard OSSI / Central Square | ❌ No native webhook | Custom adapter |
| ProQA | N/A (call-taking, not dispatch) | Pair with one of the above |
| Manual / no CAD | N/A | Path A radio approach; type incidents directly |

If your department uses a non-webhook CAD, the typical pattern is:

1. Write a small worker (`openfirehouse-cad-adapter-<vendor>`) that
   polls your CAD's API every N seconds for new dispatches.
2. Transform the response into the OpenFirehouse incoming payload shape.
3. POST to `/api/cad/incoming` on your OpenFirehouse instance.

We'd love adapters contributed back to the project. If you write one,
open a PR — even an unpolished version is more valuable than no
adapter at all.

---

## What the AI does with radio + CAD signals

Once a transcript or dispatch lands on `/api/radio/ingest` or
`/api/cad/*`, the Layer 3 pipeline takes over:

- **Inbound classification:** the radio transcript is tagged with
  talkgroup (Fire Dispatch / Fireground Tac / EMS / Mutual Aid /
  Command), priority (emergency / urgent / normal), and intent
  (request for resources, status report, benchmark call, mayday).
- **Incident linking:** if an active incident exists and the transcript
  mentions related apparatus, members, or location data, the
  transmission is linked to that incident's timeline.
- **Benchmark detection:** key phrases like "all clear," "primary
  search complete," "fire under control" are auto-recognized and
  surfaced on the Command Board.
- **CAD auto-pipeline:** new dispatches can create draft incidents in
  `olf_incidents` from dispatch facts and a matching pre-plan if one
  exists. Narrative is not AI-generated — officers write it.
- **NFIRS auto-completion:** when the chief opens the draft incident to
  finalize it, the NFIRS engine has already populated 47 fields across
  three tiers (direct mapping, lookup, AI inference).

These features work regardless of which ingestion path (A / B / C) the
department uses. Get the transcript to `/api/radio/ingest` and the
dispatch to `/api/cad/*` by whatever means works for your department,
and the AI does the rest.

---

## Questions, contributions, gateway repos

- Open an issue at https://github.com/Open-Scaffold-Labs/OpenFirehouse
  describing your CAD vendor or radio system.
- If you write a working adapter, open a PR.
- Email dale@openscaffoldlabs.com if your department wants Open
  Scaffold Labs to build a custom adapter as part of a Hosted or
  Enterprise tier agreement.
