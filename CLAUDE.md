# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build
npm run build          # Build both UI (Vite) and plugin code (esbuild)
npm run build:ui       # Build UI only
npm run build:main     # Build plugin code only

# Quality
npm run typecheck      # TypeScript type checking (no emit)
npm run lint           # ESLint on src/**/*.{ts,tsx}
npm run test           # Vitest (run mode) — unit tests for *.test.ts
npm run format         # Prettier format
npm run format:check   # Check formatting without changes

# Release
npm run release:patch  # Bump patch version + commit + tag
npm run release:minor  # Bump minor version + commit + tag
npm run release:push   # Push commits and tags to remote
```

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

`code.ts` wraps all operations in a timeout (30 seconds default). Long-running operations (batch builds, report generation) must bypass this via the `isLongRunningAction` check. `src/shared/error-handler.ts` provides `isRecoverableError()` to distinguish user-fixable errors from critical ones.

### Operations / MCP Bridge (agent-facing surface)

Separate from the in-plugin module pattern, the codebase exposes typed **Operations** to AI agents over an MCP server. Domain vocabulary and composition rules live in [`CONTEXT.md`](CONTEXT.md); decisions in [`docs/adr/0001`–`0005`](docs/adr/).

Layout:
- `src/shared/operations/types.ts`, `errors.ts` — canonical `OperationSpec`, `OperationHandler`, `OperationError`, error-code enum, bridge envelopes. Shared between plugin and MCP server.
- `src/shared/operations/registry.ts` — plugin-main-thread `registerOperation` / `dispatch` / `bindSession`.
- `src/shared/operations/register-all.ts` — side-effect import that pulls in every module's operation registrations. Add a line here when a new module exposes operations.
- `src/shared/operations/ui-bridge.ts`, `ui-bridge-startup.ts` — UI-iframe WebSocket to `ws://localhost:9876`; relays envelopes to the main thread via the existing `postMessage` channel.
- `src/plugins/<module>/operations.ts` — per-module `registerOperation(...)` calls. Each id is snake_case and `tidy_`-prefixed (e.g. `tidy_misprint_find_components`).
- `mcp-server/` — Node MCP server that **listens** on `127.0.0.1:9876` and accepts the plugin's outbound connection (plugin sandbox can't accept inbound, hence inverted server/client roles).
- `claude-plugin/` — canonical source of the **Claude Code plugin** (`.claude-plugin/plugin.json`, `commands/tidy-*.md`, `skills/`). `npm run build:plugin` bundles the MCP server into it and assembles an installable, marketplace-rooted tree under `dist-plugin/` (version synced from the root `package.json`). The `/tidy-*` commands live here (not in `.claude/commands/`); see `docs/plugin-dev.md` for the local-install dogfood loop. Tools from the plugin-bundled server are namespaced `mcp__plugin_tidy-ds_tidy-ds-toolbox__<op>`.

Production builds keep the dev WebSocket bridge disabled: the dev socket (`ws://localhost:9876`) is allow-listed only under `devAllowedDomains`, never `allowedDomains`. (`allowedDomains` now holds the single usage-analytics ingest origin — see below.) Adding a new Operation: implement and register in the module's `operations.ts`, declare it in `mcp-server/src/catalogue.ts` (Zod input schema + summary), rebuild, reload the plugin in Figma.

**Figma window must stay focused during Operations calls.** The Figma desktop app is Electron-based; macOS throttles unfocused/background windows, which stalls the plugin's JS execution (the WebSocket to the MCP server can stay open while the plugin sandbox makes no progress). This looks identical to a slow op — the MCP call just hits its timeout. Keep the Figma window open and in the foreground while an agent is driving Operations, especially for slower ops (`tidy_doc_build_page`, `tidy_ds_template_run`, `tidy_component_labels_build`). There's no way to detect or work around this from inside the plugin sandbox.

### Usage Analytics (Phase 2)

Anonymous usage events (module opens + actions) ship to a self-hosted pipeline. The plugin thread can't do network, so `src/code.ts` relays each captured event to the UI thread (`setUsageRelay` in `src/shared/analytics/capture.ts`), and `src/shared/analytics/transport.ts` does a **fire-and-forget** `POST /events` (any failure swallowed — never affects a user action). Endpoint + shared token are injected at build time via Vite `define` from `TIDY_INGEST_TOKEN` (never committed; empty token disables sending). The ingest service + deploy runbook live in [`analytics-server/`](analytics-server/README.md); it runs at `https://toolbox-logs.wearekido.dev`, which is the lone entry in `manifest.json` `allowedDomains`. See [`docs/prd-usage-analytics-phase2.md`](docs/prd-usage-analytics-phase2.md).

## Figma Plugin Development

- Figma API types come from `@figma/plugin-typings` — no runtime import needed, types are globally available.
- `figma` and `__html__` are declared as globals in ESLint (`eslint.config.mjs`).
- The `manifest.json` controls plugin permissions; most features need `activeselection` scope.
- To load locally in Figma: Plugins → Development → Import plugin from manifest → select `manifest.json`.

## Commit Conventions

Follow Conventional Commits with these scopes:
`shell`, `component-labels`, `ds-explorer`, `sticker-sheet`, `icon-care`, `tidy-mapper`, `utilities`, `audit`, `release-notes`, `off-boarding`, `mcp`, `ui`, `build`, `deps`

Version bumps follow semver: `feat` → minor, `fix`/`perf` → patch, `BREAKING CHANGE` → major.
