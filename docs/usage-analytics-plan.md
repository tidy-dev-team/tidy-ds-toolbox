# Usage Analytics Plan

Status: **planned** · Owner: Dmitri · Date: 2026-06-21

## Goal

Understand **which sub-plugins (modules) are actually used and which are not**, so we
can make kill/keep decisions with evidence instead of intuition.

The primary signal is **actions** (do people *do* things in a module), with
**module opens** as the correlated headline metric. A module that's opened often but
never actioned is a *worse* sign than one never opened — it means people try it and bounce.

## Key constraints discovered (these shaped every decision)

- **No per-user identity.** All team members share a single Figma login, so
  `figma.currentUser.id` is identical for everyone — useless for distinguishing people.
  → We use **`fileKey` + `fileName`** as the proxy for distinct usage ("used across N
  files" ≈ breadth of usefulness).
- **Network is locked in production.** `manifest.json` has `allowedDomains: ["none"]`.
  Sending anywhere requires declaring an HTTPS origin there. Only the **UI thread** can
  do network; the plugin thread cannot.
- **`figma.fileKey` is not guaranteed** — can be `null` (unsaved files / some contexts).
  Fall back to `figma.root.id` (always present, stable per-document; not a shareable URL
  but fine for distinctness). Accessing `figma.currentUser`-style context lives only on
  the plugin thread.

## Event model

Two event types, one mechanism:

| type          | when                                              |
|---------------|---------------------------------------------------|
| `action`      | a real user action fires (a module's button press)|
| `module_open` | user switches to a module (genuine switch only)   |

### Event shape (sent to server)

```jsonc
{
  "schemaVersion": 1,        // future-proofing; bump on shape change
  "type": "action",          // or "module_open"
  "module": "ds-explorer",   // PluginID / target
  "action": "build-component", // raw action string; null for module_open
  "fileKey": "abc123",       // figma.fileKey, falls back to figma.root.id
  "fileName": "Kido Mobile DS", // deliberately included (see Privacy)
  "pluginVersion": "1.x.y",
  "sessionId": "uuid-per-plugin-open",
  "clientTs": "2026-06-21T10:00:00.000Z" // ordering only; server stamps received_at
}
```

**No payload contents are ever logged** — only the action's *identity*. Payloads carry
design data (labels, component keys, spacing); logging them leaks data for zero analytical
benefit.

## Capture: where the hook lives

**Single hook in `src/code.ts`, in the `figma.ui.onmessage` dispatcher.** Rationale:

- It is a true single choke point — every UI→plugin message routes through
  `handlers[target](action, payload, figma)`.
- It is the only place with `pluginVersion` context and `figma.fileKey` / `figma.root.id`
  / `figma.fileName`.
- The existing `logger.debug(...)` of every `target:action` already runs here.
- `module_open` is observable here too (arrives as `target:"shell", action:"save-storage",
  key:"activeModule"`).

### Denylist (capture-by-default, exclude noise)

We log everything **except**:
- `target: "shell"` housekeeping (`save-storage`/`load-storage`, theme/settings sync) —
  **with one exception:** the `save-storage` write of `activeModule` is mapped to a
  `module_open` event.
- `target: "mcp-bridge"`.

**Critically: do NOT count the startup `load-storage` module *restore* as a `module_open`** —
that's the app rehydrating, not a user choice, and counting it gives the last-used module a
free +1 on every launch.

Denylist (vs allowlist) chosen for the test phase so we *discover* the real action
vocabulary from live data; can tighten to an allowlist later if noise appears.

## Phase 1 — Internal (dev only, throwaway)

Purpose: prove the instrumentation fires correctly and the event shape is right **on my own
machine**. It cannot answer the team-usage question (clientStorage is siloed per
identity/browser; under shared login it's fragmented) — so it stays minimal and disposable.

- `console.log` the structured event.
- A tiny in-memory ring buffer dumpable on demand (dev-only console call / hidden button).
- **No persistence, no local dashboard.** Validate shape, then move to Phase 2.

## Phase 2 — Server (the version that answers the question)

Stack (all self-hosted on the existing **DigitalOcean** droplet — keeps client file names
in-house, no third-party SaaS):

- **Ingest endpoint** (~50 lines): `POST /events`, accept a batch, insert rows.
  - Server stamps `received_at` (analyze on this, not client time).
- **Postgres** — events table.
- **Metabase** — dashboards (events by module, distinct files per module, opens-vs-actions).
  No hand-built charts. ~1–2 GB RAM on the droplet; far lighter than PostHog, which is
  overkill for our volume (hundreds of events/day).

Rejected: full PostHog self-host (ClickHouse/Kafka stack, painful on one droplet, built for
millions of events). Rejected: cloud SaaS (client file names would leave our infra).

### Transport (plugin → server)

Flow: event captured in `code.ts` → relayed to UI via `postToUI` → UI batches → UI `POST`s.
(Reuses the existing plugin→UI relay pattern the MCP bridge already uses.)

- **Batched:** flush on whichever first — **10 events or ~15s.**
- **Fire-and-forget, errors swallowed.** Logging must NEVER affect a user action. A send
  failure (server down, offline, droplet asleep) leaves the plugin behaving exactly as today.
- **Best-effort, in-memory only.** Buffer lost on plugin close / failed send is acceptable —
  the decision is statistical and robust to a handful of dropped events. (Durable
  clientStorage retry was rejected as solving a precision problem we don't have.)
- **On by default, no opt-out, no kill switch.** An opt-out biases the data toward people who
  don't bother. Internal tool measuring an internal tool — be transparent with the team.

### Prerequisites before Phase 2 can send

- A real domain/subdomain → the droplet (e.g. `https://tidy-analytics.kido…`).
- **TLS** (Let's Encrypt) — Figma requires HTTPS with a valid cert.
- Add that exact origin to `manifest.json` `allowedDomains` (currently `["none"]`).

## Privacy posture

- `fileName` is the **one deliberate leak** — it may contain client/project names. Accepted
  because knowing *which* files drive usage is the actionable insight, and the server is ours.
- Everything else stays out: **no payload contents, no user identity** (none available anyway).
- `received_at` server-stamped; `clientTs` for ordering only.

## Implementation checklist

Phase 1:
- [ ] Add usage-event builder + denylist + `module_open` mapping in `src/code.ts` dispatcher.
- [ ] Mint `sessionId` once per plugin open; read `pluginVersion`, `fileKey`→`root.id`, `fileName`.
- [ ] `console.log` + in-memory ring buffer with on-demand dump.
- [ ] Manually verify each module's buttons produce correct events.

Phase 2:
- [ ] Stand up domain + TLS on the droplet.
- [ ] Postgres events table (with `schemaVersion`, `received_at`).
- [ ] Ingest endpoint `POST /events` (batch insert, server timestamp).
- [ ] Metabase on the droplet; build the core dashboards.
- [ ] Add the origin to `allowedDomains`; relay events plugin→UI; UI batch + fire-and-forget POST.
- [ ] Verify end-to-end from a real plugin session; bump plugin version per semver.
```
