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
npm run lint           # ESLint on src/**/*.{ts,tsx}, capped at 161 warnings
npm run test           # Vitest (run mode) — unit tests for *.test.ts
npm run format         # Prettier format
npm run format:check   # Check formatting without changes

# Release
npm run release:patch  # Bump patch version + commit + tag
npm run release:minor  # Bump minor version + commit + tag
npm run release:push   # Push commits and tags to remote
```

**The lint warning ceiling is a ratchet, and it only goes down.**
Every ESLint rule here is `warn` rather than `error`, including `no-explicit-any` and `no-non-null-assertion`, so before the cap the count could climb forever without failing anything - it had reached 179, and a `no-non-null-assertion` warning sitting in that pile was pointing straight at a real defect (#180) that nobody could see for the noise.
The number in the script is the count on the day it was set, not a target: lower it whenever a change removes warnings, and never raise it to make a commit pass.
A change that genuinely needs a higher ceiling is a change worth discussing, which is the point.
`scripts/` is not linted at all, though it now holds code (`scripts/lib/`) - a gap, not a decision.

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

`src/moduleRegistry.ts` is the central manifest for all plugins that have a panel. A module with no panel is absent from it: `tidy-doc` has no UI, no `logic.ts` and no entry here, because documentation is always initiated from Claude and it is reached only through its Operations. `qa` is the same. Neither is a gap. Each plugin exports a `ModuleManifest` with `id`, `label`, `state` (stable/beta/alpha), `icon`, `ui` (React component), and `keywords`/`features` (for search). It carries no `handler`: the UI is the only reader of the manifest and reaches a module's backend over postMessage, so naming the handler here only made `moduleRegistry.ts` import `moduleHandlers.ts` and pull the whole plugin thread into the UI bundle.

`src/moduleHandlers.ts` routes incoming messages from `code.ts` to the appropriate plugin handler based on `target`.

### Plugin Module Pattern

Each plugin lives in `src/plugins/{module-name}/` with three files:
- `ui.tsx` — React component rendered in the plugin viewport
- `logic.ts` — Backend handler receiving messages and calling Figma API
- `types.ts` — Typed action/payload interfaces shared between ui and logic

To add a plugin: create the three files, then register the module in `moduleRegistry.ts`.

### Shell State

The shell also announces when a module stops showing, and `src/shared/module-listeners.ts` is what acts on it.
Four modules registered `figma.on` handlers behind a module-level `listenersRegistered` boolean that was never reset, and nothing in `src/` ever called `figma.off`, so a handler installed by visiting a tab ran for the rest of the plugin session whatever module was showing.
That was not only a cost: `tidy-mapper`'s `selectionchange` handler *writes*, renaming every selected `SLICE` to the name the module holds (default "Avatar"), and it was installed from the top of the module's message handler while the panel posts a message on mount - so opening the tab once, without using it, was enough to have every slice the designer selected afterwards silently renamed.
`shellEffects` emits `module-deactivated` naming the module it navigated away from, `code.ts` routes it to `deactivateModule`, and a module declares its listeners as data (`ListenerBinding[]`) rather than as `figma.on` calls, because `figma.off` matches on function identity and the surest way to keep the attached reference is never to separate it from the detach.
Only when the module actually stopped showing: announcing it for a navigation that stays put would strand the module still on screen with no listeners and nothing to reinstall them.
Bridge mode counts, and it is the path that looks least like a deactivation - `activeModule` still names the module, so nothing about the navigation changes, but `App.tsx` returns the bridge bar and unmounts the panel.
Missing it is the worst version of the bug, because a listener left behind then survives a whole agent-driven session, which is the stretch when nobody is watching the canvas.
Leaving bridge mode announces nothing, and needs to: every module that installs listeners posts on mount, so the remount reinstalls them, and a deactivation there would remove what the mount is about to add.
**A module that needs a document event takes `createModuleListeners`; a bare `figma.on` in a module is the leak coming back.**
Iconfinder's `isActive` flag and its `stop` action were a second mechanism answering the same question from the panel's end, and went with this change rather than being copied into the other three.

`src/ShellContext.tsx` manages global state (active module, window dimensions, theme, settings) using React Context + Reducer. The active module ID is persisted to `figma.clientStorage` so it survives plugin reopens.
The state itself is not in that file. `src/shellState.ts` holds the reducer, the actions, and `shellEffects`, which decides what an action sends to the main thread; the provider owns the sending.
The reducer used to post from inside its own cases, which React may run more than once per dispatch - `main.tsx` wraps the app in StrictMode, so every module change was persisting twice.
Drive the shell through `stepShell`, never the reducer and `shellEffects` separately: React batches dispatches in one event handler, and `stepShell` returns the next state so the provider can advance its record per action rather than per render. Reading pre-action state from a render-time ref hands the second action of a batch a state the reducer has already moved past.
`src/shellState.ts` imports relatively, not through `@shared/*`, because `vitest.config.ts` declares no `resolve.alias` and does not inherit `vite.config.ts` - an aliased module cannot be unit tested at all.

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
  `dispatch` runs **one Operation at a time** (#186): a second envelope arriving while one is open is refused at once with `BUSY`, never queued, and `runningOperation()` is the read-only view of what holds the slot.
  The guard is global rather than per-target, and that is the whole point - the QA probes' stray-node sweep is page-scoped, so two runs against *different* components collide exactly as readily as two against the same one, and a per-target key would let through the case the guard exists to stop.
  Refused rather than queued because a queued call would wait behind a run that can last two minutes while its own Bridge budget expires, turning a fast honest refusal into the slow timeout #182 has just finished rewording.
  The slot is freed in a `finally`, on every path out of a run, because one leak locks the plugin out of Operations for the rest of the session.
  This guard covers the agent-facing path, and it is not the only one (#187).
  The Documentation Page builder keeps its own lock in `src/plugins/tidy-doc/utils/buildLock.ts`, keyed by source component.
  The two answer different questions - the registry "is another Operation running", the lock "is this page already being built" - and the lock is keyed by component rather than global because, unlike the QA probe sweep, two Documentation Page builds share no page state.
  **The second route that lock existed for is gone.** #187 wrote it because the panel's Document button reached the builder through the module-action path and never passed through `dispatch`; that button and the whole Tidy Doc panel were removed when documentation became something only Claude initiates, so `buildDocPage` now has exactly one caller and `dispatch` already serializes it.
  The lock and `BuildOrigin`'s `"panel"` value are left in place rather than deleted in the same change, because removing them is #187's AC4 question ("exactly one mechanism answers this") and deserves its own decision - see #211.
  Do not build anything new on either.
  The Bridge can ask a run to stop, and gets a truthful answer about whether asking achieved anything (#183).
  `requestCancellation(requestId)` lives on the same `RUNNING` record as the guard above, not in a second in-flight map, because two structures tracking one run would eventually disagree about whether there is anything left to stop.
  It answers one of four things, and only one of them is a successful stop: `not_running` (the reply and the timeout crossed, which is normal and not an error), `not_cancellable`, `stopped`, or `still_running`.
  Whether a handler has a checkpoint is declared on its spec as `cancellable`, never inferred - an Operation that has not said it checks `ctx.cancellation` is reported `not_cancellable` and left running.
  Inferring it by cancelling the token and calling it stopped if the run happened to end would report a run that merely finished on its own as one that obeyed, which is the exact false claim the ticket exists to prevent.
  A declaring Operation is watched for `CANCEL_GRACE_MS` after its token is marked, so `stopped` is a claim about the loop rather than about the clock.
  `tidy_ds_template_run` is the first and so far only adopter (#184); every other Operation is honestly reported `not_cancellable`, which is an accurate description rather than a gap - cancellation in this sandbox is cooperative and always will be, because Figma offers no way to interrupt a running handler.
  Adopting it is one flag on the spec plus `runUntilCancelled` (`src/shared/cancellation.ts`) around the loop's body.
  Take that helper rather than writing the loop: it owns the check-and-yield pairing, and the yield is the half that is easy to forget and silent when forgotten - the loop is itself what stops the cancellation message from ever running, so the token is never seen cancelled and the run finishes as if nobody asked.
- `src/shared/operations/register-all.ts` — side-effect import that pulls in every module's operation registrations. Add a line here when a new module exposes operations.
- `src/shared/operations/ui-bridge.ts`, `ui-bridge-startup.ts` — UI-iframe WebSocket to `ws://localhost:9876`; relays envelopes to the main thread via the existing `postMessage` channel.
  The server-to-plugin direction is a discriminated union (#183): `BridgeRequest` carries `type: "dispatch"`, `BridgeCancel` carries `type: "cancel"`, and every hop routes on that field alone - socket, `UiBridge`, `MainDispatcher`'s `dispatch`/`cancel` actions, and `moduleHandlers`' `mcp-bridge` handler.
  Nothing sniffs the payload's shape, so a cancellation can never be executed as a call, and an envelope of an unrecognised kind is dropped with a log rather than guessed at.
  A missing discriminator counts as unrecognised: both halves ship from one repo and one build, so an envelope without it is version skew rather than a shape to accommodate.
  Failures on the cancel path are logged and swallowed at both ends, because a broken stop request must not become a broken Operation - the call it names is still in progress.
  The reply direction stays untyped by comparison: a `BridgeCancelResult` is told apart from a `BridgeResponse` by `isCancelResult` in `bridge-server.ts`, since stamping a `type` on every response would rewrite every response construction in the plugin for no behaviour.
  It has to be told apart at all because a report carries the id of the call it names, and that call is routinely still pending - matched against the pending map it would settle a live call with neither a result nor an error.
  The in-flight envelopes themselves belong to `main-dispatcher.ts`, not to the startup glue, so that the pending map is testable without a DOM (#180).
  It holds the two ids apart deliberately: the MCP server keys its pending map on the envelope's `req_NNNN`, the UI side keys its own on the `mcp_N_req_NNNN` the main thread echoes back, and a response built on this side must carry the *Bridge* id or the server drops it as unknown and the caller waits out its whole budget for an answer that already arrived.
  Every promise it creates is settled: a reply, a `close()` when the Bridge goes down, or `UI_BACKSTOP_MS` for a request the main thread never answers at all.
  That backstop is held above every budget in `mcp-server/src/catalogue.ts` by a test, because it is there to stop a pending entry outliving the Session, and the deadline a caller actually meets must stay the Bridge's, whose wording says what to do next.
  The plugin thread cannot supply it, since `mcp-bridge:dispatch` is exempt from its deadline by design.
- `src/plugins/<module>/operations.ts` — per-module `registerOperation(...)` calls. Each id is snake_case and `tidy_`-prefixed (e.g. `tidy_misprint_find_components`).

The QA engine keeps the figma-touching code of its *checking* half in exactly three files: `src/plugins/qa/collector.ts` (reads the set, and the paint styles it references, into a plain-JSON snapshot), `src/plugins/qa/theme-probe.ts` (resolves variables per theme mode against one temporary frame, the ADR-0001 read-only carve-out), and `src/plugins/qa/resize-probe.ts` (instances the default variant into one temporary frame, drives its width and lengthens its text, and records boxes - the same carve-out, and it shares the theme probe's stray-node sweep).
Both probes exist for the same reason: their question is not recorded in the file.
The snapshot describes the component as it sits, so "what happens at a width it is not currently at" has no field to read, and the only way to know is to build one and look.
Everything decided *from* those boxes is pure and fixture-tested under `src/plugins/qa/resize/` - geometry detects, and nothing in the QA engine looks at a pixel to judge a resize.
Drawing is a separate concern and touches figma by definition, under `src/plugins/qa/render/`: `renderChecklist.ts`, `renderModeShowcase.ts` and `renderStateGrid.ts` draw, `primitives.ts` holds the palette and helpers they share, and the decisions they act on (`placement.ts`, `status-style.ts`, `mode-showcase.ts`, `resize-evidence.ts`, `contact-sheet.ts`, `finding-samples.ts`, `compose.ts`) are pure and unit-tested apart from the drawing.
Which of those blocks a build actually draws, and in what order, is `render/compose-artifacts.ts`.
A checklist build draws up to four things - the checklist, the per-mode showcase, the resize evidence, the contact sheet - and which exist depends on the component, so composing them is a sequence of build-place-or-skip steps rather than a layout.
That sequence used to sit unnamed inside `operations.ts`, where roughly 250 lines of it could not be reached without a live document; its decisions are now pure in `compose.ts` (whether to move an existing checklist, where the next block starts, what the run made of row 17) and only the building and placing is left beside them.
`operations.ts` is what an Operation *is* - parameters, the shared `runQa` pipeline, registration - and resolving what a run is about is `subject.ts`, the one part that searches the document rather than reading a component it was handed.
Two small files serve the read phase's cost rather than its meaning.
`batch.ts` resolves a list of ids in one batch instead of one round trip at a time, and owns the dedup and the ordering, because the theme probe's `unavailable` list reaches a check that reports the ids it was given and a findings list that reorders itself between runs on an unchanged component reads as churn.
`phase-timing.ts` makes a run say where its time went, at debug level, reachable from the Figma dev console with `__tidyEnableDebugLogging()` (exposed in `code.ts` beside `__dumpUsageEvents`).
That log exists because #213 batched a set of per-item costs on the strength of counted round trips and durations measured outside the sandbox, which is the one place none of the measurement happened; the next change of that kind should start from numbers the plugin reported.
Its total is a wall-clock span rather than a sum of phases, because phases nest - the canvas operation times the composition, and the composition times the one document traversal inside it.
**A new block beside the checklist is a change to `compose-artifacts.ts`, and its rule is a change to `compose.ts`; neither belongs in `operations.ts`.**
Finding what a rebuild has to replace is one traversal, not one per block (#179): `prior-artifacts.ts` loads every page once, walks once, and returns an index the checklist lookup and all three removals read from, so none of them searches for itself.
It used to be four full-document walks before anything was drawn - three of them `findAll` with an arbitrary predicate, which visits every node on every page - all asking the same question about a different plugin-data key, and all paid in full even on a healthy component where two of the blocks are never drawn.
That unconditional clearing is not the cost and must stay: a component that has since been fixed must not keep last run's broken-state pictures beside a freshly rebuilt checklist, where they read as current.
The pass is narrowed to frames, which the per-key walks were not - every artifact it indexes is created and stamped as a `FrameNode`, and the checklist's own lookup already narrowed this way - and a `removeIfPresent` guard covers the one hazard a single pass adds, that an index built up front can name a node something else has since removed.
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
  A Bridge call that exceeds its budget is worded from the catalogue entry's declared `kind`, never per Operation: `mcp-server/src/timeout-message.ts` is the pure function that decides it, and `bridge-server.ts` is its only caller.
  This is the agent-facing twin of the plugin thread's `buildOverrunMessage` (#162, #182) and exists for the same reason.
  A timeout asks the plugin to stop (#183) but stops nothing on its own, so an `execute` is still told the work continues, that the file may still be being written, and to check the canvas before calling again - never to retry, because a second `tidy_ds_template_run` over the first stamps the pages twice.
  That wording does not soften when an Operation becomes cancellable: the request is sent after the caller has already been answered, so whether it was obeyed is never known in time to word the timeout differently, and it arrives in the `[bridge]` log instead.
  The plugin announces its build version when it connects, and the server logs both against its own (#189): `mcp-server/src/version-report.ts` decides the wording, and it is the only place the two are compared.
  Both halves ship from one repo and one build and the code assumes it - #183's envelope union treats a missing discriminator as version skew rather than a shape to accommodate - but their reload paths are not symmetric, and that is what makes the check worth having.
  The Figma plugin reloads when a designer reopens it; the server is a process spawned at session start that keeps serving its own binary whatever is rebuilt on disk, so `/reload-plugins` and a fresh `npm run build:plugin` both leave it stale until the session restarts.
  The server's version is stamped in by `mcp-server/build.js` from the root `package.json`, the same single source the UI's `__APP_VERSION__` and the assembled plugin's manifest use; a raw-source run (`npm run mcp:server`) has no build step to stamp one and reports `source`, which declines the comparison rather than crying mismatch on every connect of the dev inner loop.
  A mismatch is a log line rather than a refusal, because refusing would make a stale session unusable during ordinary dogfooding when a warning naming both versions is enough to stop the failure being mysterious. See [`docs/plugin-dev.md`](docs/plugin-dev.md).
  A `query` gets a plain failure, because a read that stopped being waited on changed nothing.
  Both keep the unfocused-window explanation below, which is a real cause of these timeouts.
  A newly declared Operation is worded correctly with no edit here.
  Who may open the socket at all is decided in `mcp-server/src/origin-policy.ts`, again a pure function with `bridge-server.ts` as its only caller.
  ADR-0005 leaves the Bridge unauthenticated and that stands; what this answers is the one caller that cannot lie about who it is.
  A WebSocket handshake is exempt from the same-origin policy, so any page the developer has open can dial `ws://localhost:9876` - and `Origin` is a forbidden header, so page JavaScript can neither set nor remove the one thing that gives it away.
  The check therefore refuses browser origins and allows the plugin's (absent, `null`, `file://`, https on figma.com), which closes the tab route without asking the plugin to hold a secret the sandbox gives it nowhere to store.
  It runs in `verifyClient`, before a socket exists, so a refused page costs itself a 401 rather than costing the plugin the single client slot.
  An accepted origin that has one is logged, because if Figma ever serves the plugin UI from an origin this policy does not know, the refusal is the symptom and that line is the only diagnosis.
  The same constructor caps `maxPayload`, for the reason the origin check exists: the socket is unauthenticated, so ws's 100 MB default is a sender's licence to spend this process's memory.
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
`shell`, `component-labels`, `ds-explorer`, `sticker-sheet`, `icon-care`, `tidy-mapper`, `utilities`, `audit`, `release-notes`, `off-boarding`, `iconfinder`, `color-finder`, `tidy-doc`, `qa`, `mcp`, `ui`, `build`, `deps`

Version bumps follow semver: `feat` → minor, `fix`/`perf` → patch, `BREAKING CHANGE` → major.
