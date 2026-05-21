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
npm run format         # Prettier format
npm run format:check   # Check formatting without changes

# Release
npm run release:patch  # Bump patch version + commit + tag
npm run release:minor  # Bump minor version + commit + tag
npm run release:push   # Push commits and tags to remote
```

There is no test suite.

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

## Figma Plugin Development

- Figma API types come from `@figma/plugin-typings` — no runtime import needed, types are globally available.
- `figma` and `__html__` are declared as globals in ESLint (`eslint.config.mjs`).
- The `manifest.json` controls plugin permissions; most features need `activeselection` scope.
- To load locally in Figma: Plugins → Development → Import plugin from manifest → select `manifest.json`.

## Commit Conventions

Follow Conventional Commits with these scopes:
`shell`, `component-labels`, `ds-explorer`, `sticker-sheet`, `icon-care`, `ui`, `build`, `deps`

Version bumps follow semver: `feat` → minor, `fix`/`perf` → patch, `BREAKING CHANGE` → major.
