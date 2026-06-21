# PRD — Usage Analytics, Phase 1 (Internal Instrumentation)

Status: **proposed** · Owner: Dmitri · Date: 2026-06-21 · Depends on: none
Companion: [Phase 2 PRD](prd-usage-analytics-phase2.md) · Background: [plan](usage-analytics-plan.md)

## 1. Summary

Instrument the Tidy DS Toolbox so that every real user **action** and every genuine
**module switch** produces a structured usage event, captured at a single point in the
plugin thread. Phase 1 emits these events to the console + an in-memory buffer only — no
persistence, no network. Its sole purpose is to **prove the instrumentation fires correctly
and the event shape is right** before any server work begins.

## 2. Problem & context

We want to know which of the 10 sub-plugins are actually used. Phase 1 does **not** answer
that question — `figma.clientStorage` is siloed per Figma-identity/browser, and under our
shared login the data is fragmented across machines. Phase 1 is therefore explicitly a
**throwaway developer checkpoint**: a way to validate the capture mechanism on a single
machine. The real answer is delivered by Phase 2 (server).

## 3. Goals

- A single capture hook records `action` and `module_open` events with the agreed shape.
- Noise (shell housekeeping, mcp-bridge, startup restore) is correctly excluded.
- Events are observable by a developer (console + on-demand buffer dump).
- Zero impact on plugin behavior or performance.

## 4. Non-goals (explicitly out of scope for Phase 1)

- No persistence (`clientStorage`, files).
- No network / no server / no batching.
- No dashboard or local UI for viewing events.
- No `manifest.json` `allowedDomains` change.
- No durable retry. This is all Phase 2.

## 5. Functional requirements

### FR1 — Capture hook
Add one usage-capture point in `src/code.ts`, inside the `figma.ui.onmessage` dispatcher
(the single choke point through which all UI→plugin messages flow). No per-module changes.

### FR2 — Event types
| type          | trigger                                                        |
|---------------|----------------------------------------------------------------|
| `action`      | any non-denylisted `{target, action}` message from a module    |
| `module_open` | the `save-storage` write of `activeModule` (genuine user switch)|

### FR3 — Event shape
```jsonc
{
  "schemaVersion": 1,
  "type": "action" | "module_open",
  "module": "<PluginID / target>",
  "action": "<raw action string>" | null,   // null for module_open
  "fileKey": "<figma.fileKey, fallback figma.root.id>",
  "fileName": "<figma.root.name>",
  "pluginVersion": "<from package.json / build constant>",
  "sessionId": "<minted once per plugin open>",
  "clientTs": "<ISO timestamp>"
}
```

### FR4 — Denylist (capture-by-default, exclude noise)
Exclude from `action` events:
- `target: "shell"` housekeeping (`save-storage`, `load-storage`, theme/settings sync) —
  **except** the `save-storage`/`activeModule` write, which is emitted as `module_open`.
- `target: "mcp-bridge"`.

### FR5 — Startup-restore exclusion
The startup `load-storage` restore of `activeModule` (app rehydration in `ShellContext`)
**must not** emit a `module_open`. Only genuine user switches count.

### FR6 — No payload contents
Record only `{module, action}` identity. The `payload` is never read into an event.

### FR7 — Context resolution
- `fileKey`: use `figma.fileKey`; if `null`/unavailable, fall back to `figma.root.id`. Never block.
- `fileName`: `figma.root.name`.
- `pluginVersion`: build-time constant sourced from `package.json`.
- `sessionId`: minted once per plugin open (UI thread), included on every event.

### FR8 — Developer observability
- `console.log` each event in a clearly-tagged, structured form.
- An in-memory ring buffer (bounded, e.g. last 200 events) with a dev-only on-demand dump
  (console function or hidden control). Buffer is cleared on plugin close.

### FR9 — Safety
Capture must be wrapped so it can never throw into, block, or delay a user action. A failure
in event construction is swallowed silently.

## 6. Acceptance criteria

- [ ] Clicking a primary action in each of the 10 modules produces exactly one `action` event
      with correct `module` + `action`.
- [ ] Switching modules produces exactly one `module_open`; reopening the plugin (restoring
      the last module) produces **zero** `module_open`.
- [ ] No events are produced for shell housekeeping or mcp-bridge traffic.
- [ ] No event contains any payload data.
- [ ] `fileKey` resolves (or falls back to `root.id`) and `fileName` is present.
- [ ] On-demand dump returns the recent buffer.
- [ ] Plugin behavior, timings, and existing logs are unchanged for the user.

## 7. Rollout

Phase 1 is dev-only. It may ship behind the normal build (it's inert — console only) but is
not the deliverable; it is the gate to Phase 2. Bump plugin version per semver if it ships.

## 8. Open questions

- Exact mechanism for the dev dump (global console fn vs hidden button) — implementer's choice.
- Confirm `figma.fileKey` availability in our environment during validation (drives the
  fallback path).
