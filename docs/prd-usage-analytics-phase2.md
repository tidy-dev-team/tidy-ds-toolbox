# PRD — Usage Analytics, Phase 2 (Server Pipeline & Dashboard)

Status: **proposed** · Owner: Dmitri · Date: 2026-06-21 · Depends on: [Phase 1](prd-usage-analytics-phase1.md)
Background: [plan](usage-analytics-plan.md)

## 1. Summary

Deliver the version that actually answers the question: ship the Phase 1 usage events from
every team member's plugin to a **self-hosted pipeline on our DigitalOcean droplet**
(ingest endpoint → Postgres → Metabase), so we can see which sub-plugins are used and which
are dead. Transport is batched, fire-and-forget, on-by-default, and can never affect the
user's experience.

## 2. Problem & context

Phase 1 proved the events are correct but they never leave the machine, and per-machine
`clientStorage` is fragmented under our shared Figma login. Phase 2 centralizes the data so
team-wide usage becomes visible. Because `fileName` may contain client/project names, the
pipeline is **self-hosted on our infra** — no third-party SaaS.

## 3. Goals

- Usage events from all users land in a central Postgres on our droplet.
- A Metabase dashboard answers: which modules are used, how often, across how many distinct
  files, and opens-vs-actions per module.
- Sending is invisible to users and robust to server downtime/offline.
- Data stays on Kido infrastructure.

## 4. Non-goals

- No per-user analytics (no distinct-user identity exists — shared login).
- No real-time/streaming; near-real-time batch is sufficient.
- No durable client-side retry / offline queue (best-effort only).
- No opt-out / kill switch.
- No PostHog or cloud SaaS.

## 5. Architecture

```
plugin thread (code.ts capture)
  → postToUI relay  (plugin thread cannot do network)
    → UI thread: in-memory batch buffer
      → HTTPS POST /events  (batched)
        → Ingest endpoint (droplet) → Postgres
                                        → Metabase (dashboards)
```

Reuses the existing plugin→UI relay pattern (as the MCP bridge already does). Only the UI
thread has network access.

## 6. Functional requirements

### Plugin / client

**FR1 — Relay.** Events captured in `code.ts` (Phase 1) are relayed to the UI thread via
`postToUI` for transmission.

**FR2 — Batching.** The UI buffers events in memory and flushes on whichever comes first:
**10 events** or **~15 seconds**.

**FR3 — Transport.** Flush = one HTTPS `POST /events` with a JSON array of events.

**FR4 — Fire-and-forget / safety.** Send is fully isolated: any failure (server down,
offline, sleeping droplet, non-2xx) is swallowed. It must never throw into, block, or delay
a user action, and the plugin must behave identically to today when sending fails.

**FR5 — Best-effort, in-memory only.** No persistence of the buffer. Events in an unsent
buffer at plugin close, or lost to a failed send, are dropped. Acceptable — the decision is
statistical and robust to incidental loss.

**FR6 — On by default, no opt-out.** Enabled for all users; no UI toggle. Team is informed
out-of-band that usage is measured.

**FR7 — Manifest.** Add the exact ingest origin to `manifest.json` `allowedDomains`
(currently `["none"]`). Must be HTTPS.

### Server (DigitalOcean droplet)

**FR8 — Ingest endpoint.** `POST /events` accepts a JSON array, validates `schemaVersion`,
inserts rows. ~50 lines. Returns 2xx on accept; client ignores the response either way.

**FR9 — Server timestamp.** Endpoint stamps `received_at` per row; analysis uses
`received_at`, not the client `clientTs` (client clocks unreliable, esp. shared logins).

**FR10 — Storage.** Postgres `events` table:

| column         | notes                                   |
|----------------|-----------------------------------------|
| id             | pk                                      |
| schema_version | int                                     |
| type           | `action` \| `module_open`               |
| module         | text                                    |
| action         | text, nullable                          |
| file_key       | text                                    |
| file_name      | text                                    |
| plugin_version | text                                    |
| session_id     | text                                    |
| client_ts      | timestamptz, nullable (ordering only)   |
| received_at    | timestamptz, server-set                 |

**FR11 — Dashboard (Metabase).** Self-hosted on the droplet. Core views:
- Events (and distinct sessions) per module over time.
- **Distinct `file_key` per module** (breadth-of-use signal).
- Opens vs actions per module (the "opened-but-never-actioned" tell).
- Action breakdown within a module.

### Infrastructure / ops

**FR12 — Domain + TLS.** A subdomain → the droplet with a valid cert (Let's Encrypt). Figma
requires HTTPS with a valid cert for `fetch`.

**FR13 — Footprint.** Postgres + ingest service + Metabase on the existing droplet. Sized
for our volume (hundreds of events/day). Metabase ~1–2 GB RAM. (PostHog/cloud SaaS rejected.)

## 7. Acceptance criteria

- [ ] A real plugin session's actions appear in Postgres within one flush interval.
- [ ] `received_at` is server-set; ordering by it is correct.
- [ ] Stopping the ingest service / going offline causes **no** user-visible change and no
      errors surfaced in the plugin.
- [ ] Batches of up to 10 events POST as a single request; idle sessions flush within ~15s.
- [ ] Metabase shows events-per-module, distinct-files-per-module, and opens-vs-actions.
- [ ] `fileName` is present (accepted leak); no payload contents or user identity present.
- [ ] `allowedDomains` contains only the one ingest origin; production build still blocks all else.

## 8. Privacy & data governance

- `fileName` is the single deliberate leak (may contain client/project names); accepted
  because it is the actionable insight and the server is ours.
- No user identity (none available). No payload contents.
- All data resides on Kido's DigitalOcean infra; nothing sent to third parties.

## 9. Risks & mitigations

| risk                                          | mitigation                                  |
|-----------------------------------------------|---------------------------------------------|
| `figma.fileKey` null in some contexts         | fall back to `figma.root.id` (Phase 1)      |
| Last partial batch lost on plugin close       | accepted (best-effort); volume makes it noise|
| Droplet down → events lost                     | accepted; fire-and-forget, no user impact   |
| Metabase RAM pressure on shared droplet        | size/monitor; lightweight vs PostHog        |
| Adding `allowedDomains` weakens prod isolation | single exact HTTPS origin only              |

## 10. Open questions

- Final subdomain + cert provisioning approach on the droplet.
- Ingest service runtime (small Node/Express vs serverless on the droplet) — implementer's choice.
- Auth on `POST /events` (shared token in the build vs open endpoint) — decide before exposing.
