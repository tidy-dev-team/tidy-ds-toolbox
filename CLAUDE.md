# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build
npm run build          # Build both UI (Vite) and plugin code (esbuild)
npm run build:ui       # Build UI only
npm run build:main     # Build plugin code only

# Quality
npm run typecheck      # TypeScript type checking (no emit) - src *and* mcp-server
npm run lint           # ESLint on src/**/*.{ts,tsx}
npm run test           # Vitest (run mode) — unit tests for *.test.ts
npm run format         # Prettier format
npm run format:check   # Check formatting without changes

# Release
npm run release:patch  # Bump patch version + commit + tag
npm run release:minor  # Bump minor version + commit + tag
npm run release:push   # Push commits and tags to remote
```

Node version: `.nvmrc` is the single source of truth (`package.json` `engines` records the supported floor).
Single-version CI jobs read `.nvmrc`; the unit tests and the bundled MCP smoketest run a matrix that CI derives from `.nvmrc` and `engines` at run time, so no Node version is written into the workflow.
The floor is covered as well as the current version because runtime behaviour genuinely differs between majors - V8 changed `JSON.stringify`'s nesting limit between Node 21 and 22, and a test that passed on 24 failed on 20.

`npm ci` at the root also installs `mcp-server/node_modules` (via `postinstall`), which `npm run typecheck`, `npm run mcp:smoketest` and `npm run build:plugin` all need - the repo is two dependency trees, not an npm workspace.

Tests run under Vitest (`*.test.ts`, co-located with sources). Coverage is
partial — pure logic (analytics capture, operations) is tested; UI and Figma-API
code largely is not.

## Architecture

This is a Figma plugin with a **dual-threaded architecture**:

- **UI thread** — React 19 app bundled by Vite into `dist/index.html` (single-file, all assets inlined). Entry: `src/main.tsx` → `src/App.tsx`.
- **Plugin thread** — Figma API code bundled by esbuild into `dist/code.js`. Entry: `src/code.ts`.

The two threads communicate exclusively via typed postMessage. Helpers: `src/shared/bridge.ts` (`postToFigma`, `postToUI`). Messages follow the pattern `{ target: 'module-id', action: 'action-name', payload: ... }`.

### Plugin Registry System

`src/moduleRegistry.ts` is the central manifest for all plugins. Each plugin exports a `ModuleManifest` with `id`, `label`, `state` (stable/beta/alpha), `icon`, `ui` (React component), `handler` (backend function), and `keywords`/`features` (for search).

`src/moduleHandlers.ts` routes incoming messages from `code.ts` to the appropriate plugin handler based on `target`.

### Plugin Module Pattern

Each plugin lives in `src/plugins/{module-name}/` with three files:
- `ui.tsx` — React component rendered in the plugin viewport
- `logic.ts` — Backend handler receiving messages and calling Figma API
- `types.ts` — Typed action/payload interfaces shared between ui and logic

To add a plugin: create the three files, then register the module in `moduleRegistry.ts`.

### Shell State

`src/ShellContext.tsx` manages global state (active module, window dimensions, theme, settings) using React Context + Reducer. The active module ID is persisted to `figma.clientStorage` so it survives plugin reopens.

### Path Aliases

```
@shell/*   → src/*
@plugins/* → src/plugins/*
@shared/*  → src/shared/*
```

### Error Handling

`code.ts` wraps every plugin-thread action in a timeout (30 seconds default). The timeout decision comes from the **action catalogue** (`src/shared/action-catalogue.ts`), not a hand-typed list: each action id (`module:action`) can be declared there with an `effect` (`reads` | `writes` the document) and a `budget` (a timed duration, or `long-running` with a required `reason`). An action absent from the catalogue keeps the default timeout and the default (bare) overrun message. A declared action that overruns gets a message derived from its `effect` — a write is told its work continues and to check the canvas before retrying; a read gets a plain failure. **Adding a new action means adding a catalogue entry.** `src/shared/action-catalogue-invariants.test.ts` fails the suite otherwise: it discovers every action reachable through `src/moduleHandlers.ts`'s dispatch switches and asserts each one has a catalogue entry, that no catalogue entry names a nonexistent action, that no action is declared twice, and that every `long-running` entry carries a reason. `src/shared/error-handler.ts` provides `isRecoverableError()` to distinguish user-fixable errors from critical ones.

### Operations / MCP Bridge (agent-facing surface)

Separate from the in-plugin module pattern, the codebase exposes typed **Operations** to AI agents over an MCP server. Domain vocabulary and composition rules live in [`CONTEXT.md`](CONTEXT.md); decisions in [`docs/adr/0001`–`0005`](docs/adr/).

Layout:
- `src/shared/operations/types.ts`, `errors.ts` — canonical `OperationSpec`, `OperationHandler`, `OperationError`, error-code enum, bridge envelopes. Shared between plugin and MCP server.
- `src/shared/operations/registry.ts` — plugin-main-thread `registerOperation` / `dispatch` / `bindSession`.
- `src/shared/operations/register-all.ts` — side-effect import that pulls in every module's operation registrations. Add a line here when a new module exposes operations.
- `src/shared/operations/ui-bridge.ts`, `ui-bridge-startup.ts` — UI-iframe WebSocket to `ws://localhost:9876`; relays envelopes to the main thread via the existing `postMessage` channel.
- `src/plugins/<module>/operations.ts` — per-module `registerOperation(...)` calls. Each id is snake_case and `tidy_`-prefixed (e.g. `tidy_misprint_find_components`).

The QA engine keeps the figma-touching code of its *checking* half in exactly three files: `src/plugins/qa/collector.ts` (reads the set, and the paint styles it references, into a plain-JSON snapshot), `src/plugins/qa/theme-probe.ts` (resolves variables per theme mode against one temporary frame, the ADR-0001 read-only carve-out), and `src/plugins/qa/resize-probe.ts` (instances the default variant into one temporary frame, drives its width and lengthens its text, and records boxes - the same carve-out, and it shares the theme probe's stray-node sweep).
Both probes exist for the same reason: their question is not recorded in the file.
The snapshot describes the component as it sits, so "what happens at a width it is not currently at" has no field to read, and the only way to know is to build one and look.
Everything decided *from* those boxes is pure and fixture-tested under `src/plugins/qa/resize/` - geometry detects, and nothing in the QA engine looks at a pixel to judge a resize.
Drawing is a separate concern and touches figma by definition, under `src/plugins/qa/render/`: `renderChecklist.ts`, `renderModeShowcase.ts` and `renderStateGrid.ts` draw, `primitives.ts` holds the palette and helpers they share, and the decisions they act on (`placement.ts`, `status-style.ts`, `mode-showcase.ts`, `resize-evidence.ts`, `contact-sheet.ts`, `finding-samples.ts`) are pure and unit-tested apart from the drawing.
`renderStateGrid.ts` draws two blocks from one `StateGridPlan` shape - #111's resize evidence (the baseline beside the state that broke) and #112's property-combination contact sheet - because they are the same artifact with different content, and one renderer is what stops them drifting apart visually.
It reaches into the checking half deliberately: `driveWidthThrough` and `chooseVariant` come from `resize-probe.ts` so that the evidence block resizes the same variant the same way the measurement did.
Two copies of the FILL trap - where resizing a FILL instance directly moves nothing - would eventually disagree, and then the block would draw a component that never actually resized, contradicting the finding it exists to prove.
`finding-samples.ts` is the other such reach, for the same class of reason (#171): it decides which findings are worth illustrating with a live instance of an offending variant, which needs the catalogue's `showsVisibleDefect` flag and the severity ranking findings are already ordered by, so `renderChecklist.ts` also takes the snapshot the report was computed from.
A check that opts in must name the affected variants on its findings; the sample is never inferred from the offending node, because a variant found that way cannot say how many others share the defect, and a picture whose caption cannot state its coverage reads as "this is the problem" when it is one of eighteen.
Everything else under `src/plugins/qa/checks/` is pure `(snapshot) -> CheckResult` and fixture-tested.
Which of those two run for a given filter is *not* decided in the operation: `src/plugins/qa/checklist-catalogue.ts` is the single table declaring every checklist row - its title, its check function, and the snapshot facets that check `needs` - and `prepareSnapshot` (in `collector.ts`) collects exactly the declared union, so an unrequested facet is collected by nobody and a filtered run stays inert.
Add or drop a check by editing that one table: the `CheckId` union, the run registry, the default run order, the agent-facing `CHECK_IDS` list, and the row count are all derived from it, so an id no row claims cannot be spelled anywhere.
`checklist-catalogue.test.ts` asserts the remaining runtime invariants rather than restating today's headcount.
The one piece of external data is #8's approved-asset manifest: `src/plugins/qa/asset-manifest.json` is generated out-of-band by `npm run manifest:assets` (Figma REST API, since the sandbox has no network), committed, and inlined into the bundle by esbuild. It holds facts only - the rule for what counts as a deprecated page lives in `asset-manifest.ts`. An ungenerated manifest is a supported state. See [`docs/asset-manifest.md`](docs/asset-manifest.md).
- `mcp-server/` — Node MCP server that **listens** on `127.0.0.1:9876` and accepts the plugin's outbound connection (plugin sandbox can't accept inbound, hence inverted server/client roles).
- `claude-plugin/` — canonical source of the **Claude Code plugin** (`.claude-plugin/plugin.json`, `commands/tidy-*.md`, `skills/`). `npm run build:plugin` bundles the MCP server into it and assembles an installable, marketplace-rooted tree under `dist-plugin/` (version synced from the root `package.json`). The `/tidy-*` commands live here (not in `.claude/commands/`); see `docs/plugin-dev.md` for the local-install dogfood loop. Tools from the plugin-bundled server are namespaced `mcp__plugin_tidy-ds_tidy-ds-toolbox__<op>`.

Production builds keep the dev WebSocket bridge disabled: the dev socket (`ws://localhost:9876`) is allow-listed only under `devAllowedDomains`, never `allowedDomains`. (`allowedDomains` now holds the single usage-analytics ingest origin — see below.) Adding a new Operation: implement and register in the module's `operations.ts`, declare it in `mcp-server/src/catalogue.ts` (Zod input schema + summary), rebuild, reload the plugin in Figma.

**Figma window must stay focused during Operations calls.** The Figma desktop app is Electron-based; macOS throttles unfocused/background windows, which stalls the plugin's JS execution (the WebSocket to the MCP server can stay open while the plugin sandbox makes no progress). This looks identical to a slow op — the MCP call just hits its timeout. Keep the Figma window open and in the foreground while an agent is driving Operations, especially for slower ops (`tidy_doc_build_page`, `tidy_ds_template_run`, `tidy_component_labels_build`). There's no way to detect or work around this from inside the plugin sandbox.

### Usage Analytics (Phase 2)

Anonymous usage events (module opens + actions) ship to a self-hosted pipeline. The plugin thread can't do network, so `src/code.ts` relays each captured event to the UI thread (`setUsageRelay` in `src/shared/analytics/capture.ts`), and `src/shared/analytics/transport.ts` buffers events in memory and does a **fire-and-forget** batched `POST /events` (one request per batch of up to 10 events, or every ~15s, whichever comes first; any failure swallowed — never affects a user action). Endpoint + shared token are injected at build time via Vite `define` from `TIDY_INGEST_TOKEN` (never committed; empty token disables sending, including buffering). The ingest service + deploy runbook live in [`analytics-server/`](analytics-server/README.md); it runs at `https://toolbox-logs.wearekido.dev`, which is the lone entry in `manifest.json` `allowedDomains`. See [`docs/prd-usage-analytics-phase2.md`](docs/prd-usage-analytics-phase2.md).

## Figma Plugin Development

- Figma API types come from `@figma/plugin-typings` — no runtime import needed, types are globally available.
- `figma` and `__html__` are declared as globals in ESLint (`eslint.config.mjs`).
- The `manifest.json` controls plugin permissions; most features need `activeselection` scope.
- The plugin runs under legacy whole-document access (`manifest.json` declares no `documentAccess`). Newer modules call `figma.loadAllPagesAsync()` anyway and older ones do not; that split is recorded, and is not a migration in progress, in [ADR-0013](docs/adr/0013-legacy-document-access-by-default.md).
- To load locally in Figma: Plugins → Development → Import plugin from manifest → select `manifest.json`.

## Commit Conventions

Follow Conventional Commits with these scopes:
`shell`, `component-labels`, `ds-explorer`, `sticker-sheet`, `icon-care`, `tidy-mapper`, `utilities`, `audit`, `release-notes`, `off-boarding`, `mcp`, `ui`, `build`, `deps`

Version bumps follow semver: `feat` → minor, `fix`/`perf` → patch, `BREAKING CHANGE` → major.
