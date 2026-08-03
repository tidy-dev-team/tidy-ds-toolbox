# Tidy DS Toolbox - Audit Review and Consolidation

Review date: 2026-08-03
Repository state reviewed: branch `main` at commit `e642718` (version 1.17.2).
Audit under review: [`audit-2026-08.md`](audit-2026-08.md), written against commit `8d7ec6c` (version 1.17.1).

The only change between the audit's reference commit and the reviewed state is the release commit itself (`package.json` and `package-lock.json`, 3 lines).
No finding was made obsolete by drift.

This document validates the audit, corrects it where it is wrong, and reorganises the surviving findings into problem groups.
It does not contain a PRD, a roadmap, or implementation tasks.

Section 8 now carries the owner's answers to all eighteen product decisions, recorded on 2026-08-03.
Section 7's ranking predates those answers; the note at its head lists what they change.

---

# 1. Overall assessment

**Verdict: mostly reliable, with two errors serious enough to change what the work should be, and a habit of putting real problems in prose instead of in findings.**

The audit understood the project correctly.
Its architecture description, its data-flow map, its trust-boundary model, and its list of what is well built are all accurate.
Every number I could re-measure came back within noise: 74 test files, 916 tests, 2.4 s; `dist/index.html` at 4,980 kB; `dist/code.js` at 319 kB; 173 lint warnings and 0 errors; 9 root advisories with 7 high; 6 mcp-server advisories.
Its icon-database timing claim reproduced almost exactly (I measured 276 ms against its 260 ms).
Of the 38 findings, 32 are accurate as written.
This is a careful audit, not a generated one.

Three things are wrong with it.

**First, two findings recommend work that would break the build or the product.**
ARCH-002 says the disabled `tags-spacings` module is 3,955 lines of dead code and can be deleted.
It is not dead.
`src/plugins/tidy-doc/utils/buildBreakdownSection.ts` imports three files from it, and that file is called by the live `tidy_doc_build_page` operation.
The audit even quoted `CONTEXT.md` saying so and then dismissed its own evidence.
REL-003 says to remove a `layoutMode = "VERTICAL"` assignment from a read path.
That assignment is load-bearing: the report frame is deliberately built *horizontal*, and this line is the only thing that ever makes it vertical, including for every PDF export.
Removing it changes the exported PDF layout.

**Second, the audit's severity calibration is honest but its recommended directions are sometimes disproportionate.**
The clearest case is PERF-001.
The audit correctly measures a 260 ms freeze and correctly recommends moving the icon database out of the UI bundle, which is days of architectural work.
It did not notice that 184 ms of those 260 ms come from one line using `Uint8Array.from(atob(s), c => c.charCodeAt(0))`, a per-character callback over 3.9 million characters.
I measured the equivalent tight loop at 6.1 ms, a 30x improvement, byte-identical output, three lines of change.
Two thirds of the user-facing freeze is a trivial fix that does not touch the bundle at all.
The bundle-size problem and the freeze problem are two problems, and the audit fused them into one expensive initiative.

**Third, several of the most interesting problems appear only as prose in sections 7 to 9 and therefore never got a finding ID, a severity, or a place in the priority list.**
The impure React reducer, the fact that agent-operation input validation lives outside the trust boundary, and the wrong `activeselection` claim in `CLAUDE.md` are all in the audit's body text and absent from its risk table.
Anything not in the table will not be prioritised.

**One area the audit missed entirely:** the project is half-migrated to Figma's dynamic-page document-access model.
The newer modules call `figma.loadAllPagesAsync()` before walking the document; the older ones (off-boarding, audit, sticker-sheet, release-notes publish) read `figma.root.children` synchronously with no such call.
If Figma ever requires `documentAccess: "dynamic-page"`, the destructive modules are exactly the ones that break.
This is a verified split in the code; the deprecation timeline is not something I can verify from the repository.

**Confidence in this review:** high for everything reachable from the repository, which is most of it.
I ran the full test suite, both builds, the typechecker, the linter, both `npm audit` trees, and my own decode benchmark, and I read the cited code with its surroundings rather than the quoted fragments.

**What I could not validate:** anything requiring a live Figma session (the timeout-continuation behaviour at runtime, the real plugin-data size cap, actual document-operation timings), the deployed analytics service and its data, and Figma's current deprecation policy for legacy document access.
The audit was appropriately explicit about the same limits.

**Did the audit over- or under-state problems?**
Both, in different places, and roughly in balance.
It overstates ARCH-002 (calls live code dead) and the effort implied by PERF-001.
It understates REL-003 (the mutation fires on the plugin's own default layout, not on an unusual designer edit), DX-003 (the deploy script deletes tracked files, it does not merely dirty them), and DX-004 (the stale `allowedDomains` claim is in the root `README.md` too, not only in the deployment copy).
It does not manufacture urgency.
Its "no critical vulnerability, no committed secret, no imminent data-loss path" conclusion is one I reach independently.

---

# 2. What was validated

## Repository areas inspected

- Root configuration: `package.json`, `manifest.json`, `vite.config.ts`, `esbuild.config.cjs`, `vitest.config.ts`, all three `tsconfig*.json`, `eslint.config.mjs`, `.gitignore`, `.prettierignore`, `.vscode/settings.json`.
- Shell and boundaries: `src/code.ts`, `src/ShellContext.tsx`, `src/moduleRegistry.ts`, `src/shared/error-handler.ts`, `src/shared/bridge.ts`, `src/shared/searchIndex.ts`, `src/shared/types.ts`, `src/shared/logging.ts`.
- Operations layer: `src/shared/operations/registry.ts`, `ui-bridge.ts`, and the cross-package imports in `mcp-server/src/catalogue.ts` and `bridge-server.ts`.
- Modules read in depth: `audit` (`logic.ts`, `ui.tsx`, the report builders), `off-boarding` (`logic.ts`, `ui.tsx`), `release-notes` (`logic.ts`, `render/publish.ts`, `utils/sprintHelpers.ts`), `iconfinder` (`logic.ts`, `db/load.ts`, `db/decode.ts`), `tidy-doc` (`buildDocPage.ts`, `buildBreakdownSection.ts`), `tags-spacings` (file inventory and its imported utilities).
- Analytics: `analytics-server/server.js`, `deploy/nginx-toolbox-logs.conf`, `dashboard/docker-compose.yml`, `package.json`, the SQL files, the full file inventory.
- Delivery: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `scripts/deploy-to-drive.sh`, `deployment/` (tracked contents versus working tree).
- Documentation: `README.md`, `CLAUDE.md`, `CONTEXT.md`, the 12 ADR filenames, the `docs/` inventory.

## Commands run

| Command | Result |
| --- | --- |
| `npm test` | 74 files, 916 tests, all passed, 2.43 s |
| `npm run typecheck` | passed, 0 errors, both trees |
| `npm run lint` | 173 warnings, 0 errors |
| `npm run build` | `dist/index.html` 4,980.14 kB (gzip 3,305.42 kB) in 3.55 s; `dist/code.js` 319.0 kB in 37 ms |
| `npm run build:mcp` | `mcp-server/dist/server.cjs` 980.9 kB in 77 ms |
| `npm audit` (root) | 9 vulnerabilities: 1 low, 1 moderate, 7 high; only `vite` is a direct dependency; all devDependencies |
| `npm audit` (mcp-server) | 6 vulnerabilities: `ws` high and direct, `hono` and `fast-uri` high and transitive |
| Bundle content greps | `ws` framing code present in `server.cjs`; zero `hono` occurrences |
| Custom decode benchmark | reproduced the icon-DB decode: 276 ms total, 14.0 MB JSON, 22,414 entries, 10.5 MB of SVG |
| Custom decode comparison | current base64 path 183.2 ms versus tight-loop equivalent 6.1 ms, byte-identical |

Both benchmark scripts were written to the scratchpad, run, and deleted.
No repository file was modified.

## Git history reviewed

547 commits, first on 2025-11-26, two main authors (406 and 140 commits).
453 tracked files.
Change-frequency ranking confirmed (`src/App.css` 96, `package.json` 75, `src/moduleRegistry.ts` and `mcp-server/src/catalogue.ts` 40 each, `src/code.ts` 38).
I did not repeat the audit's full-history secret scan; I found no reason to doubt it.

## Environmental limits

- No Figma session, so no plugin behaviour was observed at runtime.
- The deployed analytics service was not contacted and no credentials were used.
- The asset-manifest generator was not run (needs a Figma token).
- The Google Drive deploy script was not run (it writes to a shared team folder and deletes tracked files).
- No external documentation or advisory database was consulted, so claims about Figma's own deprecation timelines are marked as needing evidence.

---

# 3. Audit accuracy summary

All Critical and High findings: the audit issued none.
Its top severity is Medium.
All Medium findings are listed below, plus every Low or Informational finding that changes a group's shape.

| Audit finding | Validation result | Original severity | Corrected severity | Notes |
| --- | --- | --- | --- | --- |
| PERF-001 icon DB dominates bundle, 260 ms decode | Verified with corrections | Medium | Medium (split in two) | Measurement reproduced (276 ms, 14.0 MB, 22,414 entries). Two thirds of the freeze is one slow line, fixable in three lines at 30x. The recommended direction jumps to an architectural change and skips that. The 5 MB start-up cost is real and separate. |
| REL-001 timed-out operation keeps running | Verified | Medium | Medium | `Promise.race` in `error-handler.ts:35-56` with no cancellation, used at `code.ts:201-204`. Runtime behaviour still needs a live reproduction, as the audit said. |
| REL-002 audit handler loads fonts on every action | Verified | Low | Low | `loadFonts()` is awaited at `audit/logic.ts:42`, before the action switch. Every read-only action pays for it and fails if the font fails. |
| REL-003 "check report exists" mutates the document | Verified with corrections | Medium | Medium | Confirmed: `findReportFrame()` at `audit/logic.ts:390` sets `layoutMode` at line 404, and `handleCheckReportExists` calls it; `audit/ui.tsx:53` fires that on mount. Two corrections: there are three call sites (both PDF exports and the check), not a CSV path; and the assignment is load-bearing, see section 4. |
| REL-004 off-boarding temp page and unpack fallback | Verified | Medium | Medium | All three parts confirmed: name-only temp-page identity (`logic.ts:10-13`), `clearPage` removing every child (lines 27-32, called at 214), unpack falling back to `figma.currentPage` (line 276-278) and then moving each top-level frame's children into a new page and removing the frame (line 300-312). UI triggers both with one click, no confirmation. |
| REL-005 `Date.now()` ids can collide | Verified | Low | Low | `release-notes/logic.ts:95` and `:150`. Sprint ids are plugin-data keys, so a collision merges sprints. |
| REL-006 hand-maintained long-running allowlist | Verified | Medium | Medium | `code.ts:19-41`, ten literal strings, no enforcing test. Both actions the audit named as missing do exist and are absent: `audit:export-multipage-pdf` (a per-child `exportAsync` loop) and `off-boarding:pack-pages`. |
| REL-007 unbounded sprint blobs in plugin data | Needs more evidence | Low | Low | The storage shape is confirmed: one `JSON.stringify(sprint)` per key, no cap, no try/catch around the write. Whether Figma's per-entry cap is reachable by a realistic sprint is not verifiable here. |
| REL-008 Icon Finder exports on every selection change | Verified with corrections | Low | Low | No debounce, exports every selected node at 64 px. The audit omits the mitigation: an `isActive` flag (`iconfinder/logic.ts:6,20,25`) means this only runs while Icon Finder is the open module. |
| REL-009 publish redraws the whole file non-atomically | Verified | Low | Low | `publishNotes` (`render/publish.ts:186`) sweeps every stamped card across every page (line 220-226) before drawing. Interruption leaves a half-cleared canvas. Recoverable by undo or by re-publishing. |
| REL-010 committed asset manifest is empty | Verified | Low | Low | `{"generatedAt": null, "source": null, "components": {}}`. QA check #8 has never been able to fail anything. |
| SEC-001 seven high dev-dependency advisories | Verified | Medium | Low | Counts and packages confirmed. All are devDependencies and only `vite` is direct. None reach a shipped artifact. Medium overstates it; the cheap fix is still worth taking. |
| SEC-002 vulnerable `ws` in the shipped MCP bundle | Verified | Medium | Medium | `ws` 8.20.1 installed, inside the advisory range, and its framing code is genuinely present in `dist/server.cjs`. The audit's claim that `hono` is tree-shaken out also checks out: zero occurrences. Impact is local denial of service; the fix is a version bump. |
| SEC-003 unauthenticated localhost bridge | Verified | Low | Low | Accepted and documented in ADR-0005. See the addition in section 4 about where input validation sits relative to this boundary. |
| SEC-004 ingest token extractable, no rate limiting | Verified | Low | Low | Mechanism confirmed (`vite.config.ts:20` bakes `__INGEST_TOKEN__` into the single-file bundle). No rate limiting in `server.js` or the nginx vhost; only a 1 MB body cap. |
| SEC-005 `openExternalLink` accepts arbitrary strings | Verified with corrections | Low | Low | The sink is unvalidated as described. The audit says the call sites pass "only fixed URLs"; four of the five pass `docUrlFor(entry.source, entry.name)`, derived from the generated icon database. Still not attacker-controlled, but data-driven rather than fixed. |
| SEC-006 personal email in source | Verified | Low | Low | `src/App.tsx:153`. |
| SEC-007 FNV-1a file hash | Verified | Informational | Informational | Correct as written, including the reasoning for why the privacy property still holds. |
| ARCH-001 confirmed dead code | Verified, and extended | Low | Low | All five items have exactly one occurrence, their own definition: `searchIndexLegacy`, `withRetry`, `createShapeRectangles`, `insertText`, `getPluginEntries`, `getFeatureEntries`. `permissionRequirements` is populated in `moduleRegistry` and declared at `types.ts:65` and read nowhere. `debugLog` (`logging.ts:137`), which the audit only called "likely dead", is also confirmed dead. |
| ARCH-002 disabled `tags-spacings` is 3,955 lines of dead code | **Unsupported in its central claim** | Medium | Moderate, reframed | The module is disabled in the registry, but `tidy-doc/utils/buildBreakdownSection.ts:12-14` imports `sizeMarks`, `fontLoader`, and the `SpacingsConfig` type from it, and `buildDocPage.ts:100` calls that builder inside the live `tidy_doc_build_page` path. Deleting the folder breaks the build and a shipping agent feature. See section 4. |
| ARCH-003 release-notes UI is one 1,978-line file | Verified | Medium | Low | Line count exact, and it is the largest file in `src/` by a wide margin. This is a preference about editing comfort, not a defect: the module's logic is separately tested and the file is not implicated in any other finding. |
| ARCH-004 MCP server imports plugin source across the boundary | Verified | Low | Low | Four extension-bearing `../../src/...` imports in `bridge-server.ts` and `catalogue.ts`. Guarded by a dedicated CI job. |
| ARCH-005 `tsconfig.main.json` is unreferenced | Verified | Informational | Informational | Nothing in the repository refers to it except the audit itself. |
| DX-001 lint and format cover only `src/` | Verified | Low | Low | `eslint src`, `prettier --check "src/**"`. `mcp-server/`, `scripts/`, and `analytics-server/` are unchecked, including in CI. |
| DX-002 VSCode auto-approve names a missing script | Verified | Low | Low | `"npm run type-check"` against an actual script named `typecheck`. |
| DX-003 deploy script rewrites and removes tracked files | Verified, understated | Medium | Medium | Confirmed but worse than described. The audit cites line 47; the `rm -rf deployment` is at line 90, and there is a *second* one at line 186 labelled "Cleanup local deployment folder". A successful deploy therefore leaves four tracked files deleted from the working tree, not merely modified. |
| DX-004 stale duplicate README in `deployment/` | Verified with corrections | Low | Low | True of the committed file, which lacks `tidy_file_list_pages` and the QA tools. Partly outdated: the working-tree copy is already byte-identical to the root README, from an uncommitted deploy run. And the audit missed that the root `README.md` itself still claims `allowedDomains: ["none"]` at line 64 while line 164 correctly says the ingest origin. See section 4. |
| DX-005 stray artifacts at the root | Verified | Low | Low | `.ruff_cache/` exists and is not ignored (`git check-ignore` finds no rule). `temp/` exists, is ignored, and holds 203 MB. |
| TEST-001 no tests for the six oldest modules | Verified | Medium | High | Test-file counts per module confirmed exactly. My correction is upward: this is the group with the largest realistic consequence, and the audit's own REL-002, REL-003, and REL-004 are all inside those untested modules. |
| TEST-002 ingest service has no tests | Verified | Medium | Low | `analytics-server/package.json` has only a `start` script; the only file under `test/` is a JSON fixture. Consequence is analytics quality, not user harm. |
| TEST-003 no end-to-end or Figma-automation tests | Verified | Medium | Moderate | Accurate and correctly framed by the audit as strategic rather than actionable. |
| OPS-001 deprecated GitHub Action in the release pipeline | Verified | Medium | Low | `softprops/action-gh-release@v1` at `release.yml:168`; every other action is at v4. The consequence (a tag exists with no attached artifacts) is real but visible and re-runnable. |
| OPS-002 no changelog gate on release | Verified | Low | Low | Commented out at `release.yml:52-59`. |
| OPS-003 Metabase pinned to `latest` | Verified | Low | Low | Local dashboard only. |
| OPS-004 no analytics alerting or dashboard | Verified from the repository | Low | Low | Repository evidence supports it. The deployed state was not checked. |
| DEP-001 duplicated dependency trees | Verified | Informational | Informational | Documented in `CLAUDE.md`, deliberate. |
| DEP-002 `package.json` `main` points at a missing file | Verified | Informational | Informational | Inert. |

Low and Informational findings not otherwise discussed (SEC-007, ARCH-005, DEP-001, DEP-002, OPS-003) are all accurate as written and carry no consequence worth a group of their own.

---

# 4. Findings that should be rejected or corrected

## ARCH-002 is wrong about the thing it exists to say

The audit's headline is that `tags-spacings` is 3,955 lines of disabled, dead code, and its recommendation is "either delete it (git history keeps it) or move it to a clearly marked archive folder excluded from typecheck".

`src/plugins/tidy-doc/utils/buildBreakdownSection.ts` opens with:

- `buildSizeMarks` from `../../tags-spacings/utils/sizeMarks`
- `loadInterFont` from `../../tags-spacings/utils/fontLoader`
- the `SpacingsConfig` type from `../../tags-spacings/types`

`buildDocPage.ts:100` calls `buildBreakdownSection(source, spec, facts)`, and `buildDocPage` is what `tidy_doc_build_page` runs.
So 274 lines of the parked folder are a live dependency of a shipping, agent-facing feature.
The audit's own "Validation needed" line asked exactly the right question ("confirm tidy-doc does not import it") and then answered it wrongly, and `CONTEXT.md:101` states the dependency plainly ("Markers are code-generated (`tags-spacings` builders)").

Following the recommendation as written breaks `npm run build`.

The finding still points at something real, but it is a different problem: a folder the team believes is switched off contains a utility a current feature needs, and nothing in the code marks the difference between the 274 live lines and the 3,681 parked ones.
That is a genuine maintainability trap and it belongs in Group 5, reframed.

A second, smaller defect: ARCH-002's evidence says the module is "type-checked (`tsconfig.main.json` includes `src/plugins/**/logic.ts`)", while ARCH-005 says nothing references `tsconfig.main.json`.
Both cannot be true. The conclusion survives because the root `tsconfig.json` covers all of `src`.

## REL-003's recommendation is unsafe, and its scenario is backwards

The finding is correct that a read path mutates the document.
Two things about it are wrong.

Its recommended direction is "remove the assignment".
`buildLayoutFrames.ts:43-49` builds the report frame with `buildAutoLayoutFrame("report-frame", "HORIZONTAL", ...)`, and nothing else in the repository ever sets that frame's `layoutMode`.
The line in `findReportFrame` is therefore the only thing that ever makes the report vertical, and both PDF export paths go through it.
Remove it and every exported PDF changes from a vertical stack to a horizontal row.
The fix requires a decision about which layout the report is supposed to have, not a deletion.

Its failure scenario is "a designer sets the report frame to HORIZONTAL to arrange sections side by side; opening the Audit module re-flows the frame to VERTICAL".
Horizontal is not an unusual designer edit; it is what the plugin itself builds.
The re-flow happens on the ordinary path, every time the Audit module is opened over a freshly generated report.
This makes the finding stronger, not weaker, but the audit described the wrong situation, which would mislead anyone estimating how often it happens.

Also minor: the audit lists a CSV call site. There are three call sites, at lines 252, 286, and 375, and none of them is the CSV path.

## PERF-001's direction skips the cheap two thirds

The measurement is sound and I reproduced it.
The recommendation is to move the icon database out of the UI bundle via a secondary entry point or an on-demand asset fetch, which is a real project.

`decode.ts` decodes the base64 payload with `Uint8Array.from(atob(ICON_DB_GZIP_B64), c => c.charCodeAt(0))`.
That is a per-character JavaScript callback over 3,883,020 characters.
Measured: 183.2 ms.
The same conversion as a tight `for` loop over the `atob` result: 6.1 ms, byte-identical output.
Total decode falls from 276 ms to roughly 98 ms.

The audit's finding conflates two problems with very different costs:

1. A 5 MB HTML file is transferred and parsed on every plugin start, for every module user. Fixing this is architectural.
2. First Icon Finder use blocks the UI thread for about a quarter second. Two thirds of that is one line.

These should be prioritised separately, because one of them is nearly free.

## DX-003 understates what the deploy script does

The audit says a deploy "dirties the working tree".
`scripts/deploy-to-drive.sh` runs `rm -rf deployment` at line 90 *and again* at line 186 under the comment "Cleanup local deployment folder".
Four files tracked in git live in that directory (`CHANGELOG.md`, `CHECKSUMS.txt`, `README.md`, `manifest.json`).
A successful deploy deletes all four from the working tree.
That is a stronger version of the same problem and it makes the "stop tracking these files" direction more obviously correct.

## DX-004 blames the copy for a defect that is in the original

The audit's evidence for the stale deployment README includes: "it still says the manifest has `allowedDomains: ["none"]` (now the analytics origin)".
The root `README.md` says exactly that, at line 64.
It also says the correct thing at line 164.
So the live root README contradicts both the manifest and itself, and the "stale copy" framing hides a documentation defect in the file people actually read.

Separately, the working-tree `deployment/README.md` is currently byte-identical to the root README (`diff` returns nothing), because an earlier deploy refreshed it and nobody committed the result.
The audit's evidence describes the committed version, which is accurate, but the finding as phrased ("two READMEs drift") is half-outdated.

## SEC-001 is Medium in name only

Seven high advisories sounds serious.
All nine are devDependencies, only `vite` is direct, and none reaches `dist/index.html`, `dist/code.js`, or `mcp-server/dist/server.cjs`.
The audit says as much in its own body text and then leaves the severity at Medium, which distorts the risk table.
Low is the honest label. The fix remains cheap and worth taking.

## ARCH-003 is a preference, not a defect

A 1,978-line React file is uncomfortable to edit.
It is not implicated in any correctness, reliability, or security finding; the module's decision logic is extracted and tested separately; and the module is under active development by the people who know it.
Calling this Medium alongside document-mutation bugs flattens the difference between "someone might prefer this differently" and "this changes a designer's file without asking".
It should not compete for PRD scope on its own.

## Problems the audit found but did not record as findings

Each of these appears in the audit's prose and in none of its tables, so none of them reached its priority list.
I am promoting them because a finding that is not enumerated does not get scheduled.

**Agent-operation input validation lives outside the trust boundary.**
`dispatch()` in `src/shared/operations/registry.ts:57-108` looks up the operation, checks the session, and passes `req.params` straight to the handler.
There is no schema validation anywhere on the plugin side, and `ui-bridge.ts` only does `JSON.parse`.
The Zod schemas are in `mcp-server/src/catalogue.ts`, in a separate out-of-process program, behind a socket that ADR-0005 says accepts any local connection.
So the only runtime validation of agent input sits outside the boundary it is supposed to protect, and every operation handler is on its own.
The audit states the facts in section 7 and draws no conclusion.
Honestly scoped, this adds little on top of SEC-003, because a local process that can send malformed parameters can equally send well-formed ones and mutate the file legitimately. It is a robustness and defence-in-depth point, not a new exposure.

**The shell reducer performs side effects.**
`shellReducer` in `src/ShellContext.tsx` calls `postToFigma` inside its `case` branches (lines 55, 66, 90, 95, 100, 113, 118).
React invokes reducers twice under StrictMode in development specifically to surface this, so every module switch sends two messages in dev.
The writes are idempotent storage saves, so the harm today is noise.
The reason it matters is that it makes the reducer an unreliable place to add anything non-idempotent later, which is where analytics or a confirmation prompt would naturally go.

**`CLAUDE.md` describes permissions the manifest does not have.**
`CLAUDE.md:115` says "most features need `activeselection` scope".
`manifest.json` lists `permissions: ["currentuser"]` only.
The dead `permissionRequirements` metadata (ARCH-001) reinforces the same wrong picture.
This is the file agents read first.

## A problem neither the audit nor its prose covers

**The project is half-migrated to Figma's dynamic-page document access.**
`manifest.json` has no `documentAccess` field, so the plugin runs under legacy whole-document access.
The newer code is already written for the other model: `figma.loadAllPagesAsync()` is called in `qa/operations.ts`, three QA renderers, three `tidy-doc` utilities, `ds-explorer/operations.ts`, and `utilities/operations.ts`.
The older code is not.
There are 27 synchronous `figma.root.children` reads in `src/`, concentrated in off-boarding (7), sticker-sheet-builder (4), release-notes (4), and audit (4), and neither off-boarding, audit, nor `release-notes/render/publish.ts` calls `loadAllPagesAsync` anywhere.

The split is a verified fact.
Whether it becomes a problem depends on Figma's deprecation policy for legacy document access, which I cannot check from the repository, and on whether this plugin is ever submitted to the Figma Community rather than distributed by manifest import and Google Drive.
If it does become a problem, the modules that break are exactly the destructive, untested ones.

---

# 5. Consolidated problem groups

Nine groups.
Audit finding IDs are listed for traceability; the explanations stand on their own.

---

## Group 1: The plugin cannot tell a look from a change, and cannot stop a change once it starts

### In plain language

Some of the plugin's buttons only look at the file, and some of them change it.
The code does not record which is which.
As a result a "does a report exist?" question quietly rearranges the report, a read-only action waits for fonts it will never use, and a slow operation that gets reported as failed is still running and still editing the file.
The 30-second limit is not a stop button. It is a notification that gets sent while the work continues.

### Current situation

`src/code.ts` races each handler against a 30-second timer using `Promise.race`.
When the timer wins, the user gets an error and the handler keeps going in the sandbox, finishing whatever document edits it had started.
Which operations get the timer is decided by a hand-typed list of ten strings in `code.ts:19-41`.
Nothing checks that list against reality, and two plausibly slow actions are missing from it: exporting a multi-page PDF (a per-section export loop) and packing pages.

On the read side, `auditHandler` awaits Inter Regular and Bold before it looks at which action was requested, so checking a selection fails if the font service is slow.
And `findReportFrame()`, which the "does a report exist" check calls, sets the report frame's layout mode every time.

### Why this matters

The user-visible failure is duplication.
A designer runs a build, waits 30 seconds, sees "timed out", clicks again.
Two runs now write to the same file.
For release notes and tidy-doc this is survivable because they identify their output by ownership stamps, so a rebuild replaces rather than doubles.
For sticker sheets, component labels, and audit reports there is no such protection.

The subtler cost is that the error message is wrong.
"Timed out" reads as "nothing happened".
The truth is "we stopped watching".
Users who trust the first reading make the problem worse.

And a "check" that changes the document is the one behaviour the project's own ADR-0001 forbids for agent operations.
The rule exists; the older UI paths predate it and never got held to it.

### Affected areas

`src/code.ts`, `src/shared/error-handler.ts`, the audit module, and by extension every module with a slow action.
Designers using the plugin interactively.
The MCP path is exempt from the 30-second timer and enforces its own per-operation limits at the bridge, so agents are less exposed.

### Included audit findings

REL-001, REL-002, REL-003, REL-006.

### Validation status

Verified: all four, in code, with the surroundings read.
Corrected: REL-003, both in its consequence (the plugin's own default layout is the one that gets overwritten) and in its recommended fix (the assignment is load-bearing).
Uncertain: whether a timed-out handler's late writes can corrupt a stamped artifact in practice. That needs a live Figma reproduction, as the audit said.

### Importance

**High.**
Not because any single item is severe, but because they are one missing distinction showing up in four places, and the same distinction is what would make retries safe.
It is also the group where a small amount of structure buys a disproportionate amount of correctness.

### Broad direction

Give operations a declared shape: does this read or write, and how long may it take.
Once that exists, the timeout list stops being hand-typed, read paths stop paying write-path costs, and the timeout message can tell the truth about what is still running.

### Decisions needed from the project owner

1. Should the audit report be vertical or horizontal? The build says horizontal, the export path says vertical, and this has to be settled before the read-path mutation can be removed.
2. When an operation exceeds its time limit, what should the user be told and offered? "Still running, do not retry" and "cancelled" are different products.
3. Should read/write classification be enforced for UI actions, or only for agent operations where ADR-0001 already requires it?

### Open questions

- Do late writes from a timed-out handler actually collide with a retry's output, or does Figma serialise them harmlessly? This changes whether the group is about messaging or about correctness.
- How long do `audit:export-multipage-pdf` and `off-boarding:pack-pages` really take on the team's largest files? If both finish in five seconds the allowlist gap is theoretical.

---

## Group 2: The modules most able to damage a file are the ones with no tests

### In plain language

Six of the twelve modules have no automated tests at all, and they include the ones that delete pages, recreate pages, and move a designer's frames around.
One of them will, with a single unconfirmed click, take whatever is on the page you are looking at and scatter it into new pages.
The project has already proved it knows how to test this kind of code: the QA engine does exactly that, and it is the best-tested part of the repository.
The old modules never got the same treatment.

### Current situation

Tests exist for QA (36 files), tidy-doc (10), release-notes (9), iconfinder (5), color-finder (4), utilities (1), and tidy-icon-care (1).
There are none for audit, ds-explorer, component-labels, off-boarding, sticker-sheet-builder, or tidy-mapper.

Off-boarding is the sharpest example.
It identifies its scratch page purely by the name `__TCC_TEMP__` and deletes every child of any page with that name.
Its unpack path, when no such page exists, silently falls back to the current page, then for each top-level frame creates a new page, moves the frame's children into it, and removes the frame.
The UI wires both to one button with no confirmation dialog.
The realistic path into this is not exotic: pack, notice the temp page, delete it manually, click unpack to undo.

Nothing about this is caught by anything, because the pure part of the decision (which pages, which frames, what survives) is not separated from the Figma calls, so there is nothing to test.

### Why this matters

Two of the audit's own findings are the evidence.
REL-003 and REL-004 both live in untested modules, and both are document-mutating defects that survived months of daily manual use.
That is the group's argument in one sentence: this class of bug is invisible here, and it is not invisible in QA.

Figma's undo makes most of it recoverable, which is why this is not an emergency.
But undo requires noticing, and the destructive paths give no warning before and no summary after.

### Affected areas

`src/plugins/off-boarding/`, `audit/`, `sticker-sheet-builder/`, `component-labels/`, `ds-explorer/`, `tidy-mapper/`.
Designers, and the contents of their files.

### Included audit findings

TEST-001, REL-004, TEST-003 in part.
REL-002 and REL-003 are the symptoms and are handled in Group 1.

### Validation status

Verified: the test distribution, exactly. Every claim in REL-004, line by line.
Uncertain: nothing structural. The gap is a fact. What is uncertain is how often these flows are actually used, which the repository cannot answer and the analytics pipeline could.

### Importance

**High**, and higher than the audit's Medium.
This is the only group where the realistic bad outcome is a designer losing work.
It is also the group whose absence of coverage is why nobody can be confident about the rest.

### Broad direction

Carve the pure decisions out of the destructive modules and fixture-test them, using the seam the QA engine already established (a plain-data snapshot, a pure decision, a thin drawing layer).
Separately, make destructive operations state what they are about to do before doing it.

### Decisions needed from the project owner

1. Which of these six modules are strategically alive? Testing a module you intend to retire is waste, and the audit could not tell.
2. Should destructive operations require confirmation, and if so which ones? This is a product decision about how much friction designers will accept.
3. Is "recoverable by Figma undo" an acceptable safety guarantee, or should these operations be recoverable without relying on the user noticing?

### Open questions

- How often is off-boarding actually used, and by how many people? If the answer is "twice a year by one person" this drops several places.
- Does the team want the QA seam pattern applied everywhere, or is it accepted as specific to QA?

---

## Group 3: Release notes hold user-authored content with no durability story

### In plain language

The release-notes module is where people type things that exist nowhere else: what changed, why, who did it.
It stores each sprint as a single blob attached to the file, keyed by a timestamp, with no size limit, no error handling on write, and no backup.
Publishing wipes every card it owns across the whole file and then draws them again, so an interruption in the middle leaves the canvas half-empty.

### Current situation

Sprint and note ids are `Date.now().toString()`.
Sprint ids are used directly as plugin-data keys, so two sprints created in the same millisecond overwrite each other.
`saveSprint` does one `JSON.stringify(sprint)` into `figma.root.setSharedPluginData` with no try/catch, so a failed write surfaces as a generic handler error.
`publishNotes` sweeps every stamped card on every page before drawing anything.

The ownership model itself is genuinely good and recently hardened: cards are found by plugin-data stamp, never by name or position, and a publish deletes only what it can prove it wrote.
Three consecutive commits went into exactly that.
The gap is not identity. It is durability and interruption.

### Why this matters

This is the module under the heaviest active development and the one holding content with no other copy.
The id collision needs simultaneity, so it is unlikely by hand and plausible under automation.
The size limit is a real Figma constraint whose actual value I could not verify; if it is reachable, the failure mode is a note that appears to save and does not.
The interruption case is recoverable by re-publishing, but the module does not say "the canvas is incomplete, publish again", so the user has to work that out.

### Affected areas

`src/plugins/release-notes/`, particularly `utils/sprintHelpers.ts`, `logic.ts`, and `render/publish.ts`.
Designers writing release notes; the content itself.

### Included audit findings

REL-005, REL-007, REL-009.

### Validation status

Verified: the id scheme, the storage shape, the absence of write error handling, the sweep-then-draw sequence.
Needs more evidence: whether Figma's per-key plugin-data cap is reachable by a realistic sprint. Requires a live measurement.

### Importance

**Moderate.**
Each individual item is low-probability.
They cluster because they are all "this data has no second copy and no guardrails", and that is worth deciding about deliberately rather than discovering.

### Broad direction

Decide what durability this content is entitled to, then make the storage match: collision-proof ids, a known size ceiling with a clear message when it is hit, and a publish that either completes or is visibly incomplete.

### Decisions needed from the project owner

1. Is release-notes content important enough to need an export or backup path, or is "it lives in the Figma file" the intended contract?
2. Will release notes ever be driven by automation or an agent? That is what turns the id collision from theoretical into real.
3. Is a half-published canvas acceptable if the module says so clearly, or must publishing be atomic?

### Open questions

- What is Figma's actual per-entry plugin-data limit, and what does the team's largest real sprint weigh against it? This determines whether REL-007 is a real constraint or a non-issue.

---

## Group 4: Every designer pays the icon database's cost, whether or not they use it

### In plain language

The plugin ships as one self-contained 5 MB HTML file, and 3.9 MB of that is a database of 22,414 icons used by exactly one module.
Everyone who opens the plugin for anything transfers and parses all of it.
The first icon search then freezes the interface for about a quarter of a second, and most of that freeze is one avoidably slow line.

### Current situation

`dist/index.html` is 4,980 kB (3,305 kB gzipped).
`src/plugins/iconfinder/db/generated.ts` is 3,883,248 bytes of gzip-then-base64 JSON, so it passes into the bundle essentially verbatim: roughly 78% of the shipped HTML.
Decoding is lazy and memoised, and I measured it end to end at 276 ms, producing 14.0 MB of JSON with 10.5 MB of SVG path data.
Of that 276 ms, 183 ms is `Uint8Array.from(atob(...), c => c.charCodeAt(0))`, a per-character callback over 3.9 million characters.
The equivalent tight loop measures 6.1 ms with byte-identical output.

CI caps the bundle at 6 MB, leaving about 1 MB of headroom.

In the same area, Icon Finder re-exports every selected node as a PNG on every selection change with no debouncing, though only while Icon Finder is the open module.

### Why this matters

Plugin start-up is a cost paid on every session by every user of every module.
The 6 MB cap means the next icon pack added to the generator can fail the release pipeline, which turns a product decision into a build failure.
And the freeze is the kind of thing that makes a tool feel slow in a way users remember and cannot diagnose.

The reason this group is worth separating from general performance work is that it contains one nearly free win and one genuinely expensive one, and they should not be scheduled as a unit.

### Affected areas

`src/plugins/iconfinder/db/`, `vite.config.ts`, the CI bundle check.
Every plugin user, on every start.

### Included audit findings

PERF-001, REL-008.

### Validation status

Verified by independent measurement: bundle size, database size, decode timing, entry count, payload composition.
Corrected: the audit's recommended direction skips the cheap fix for two thirds of the measured freeze.

### Importance

**Moderate**, split.
The decode fix is small, safe, and measurably worth 30x on the dominant cost; there is no reason to defer it.
Restructuring the bundle is a real project whose value depends on how much start-up latency actually costs, which nobody has measured in Figma.

### Broad direction

Take the cheap decode fix on its own merits.
Then decide separately, with a measurement from inside Figma, whether the 5 MB start-up cost justifies moving the database out of the single-file bundle.

### Decisions needed from the project owner

1. What is the acceptable plugin start-up time? Without a target, the bundle work has no success criterion.
2. Should the icon database keep growing? If yes, the 1 MB of CI headroom is the real deadline.
3. Is Icon Finder important enough to justify architectural work on the bundle, or is it a secondary module?

### Open questions

- What does the 5 MB actually cost in real Figma start-up time? Figma may cache the UI HTML between opens, in which case the transfer is paid once per session and the whole finding shrinks. This is the single measurement that would most change this group's priority.

---

## Group 5: Code that looks retired but is not, and code that looks alive but is not

### In plain language

A reader cannot tell from the repository which code is in use.
One module is commented out of the menu and looks abandoned, but a current feature imports from it.
Half a dozen shared helpers look like the sanctioned way to do something and have never been called by anything.
A config file suggests the plugin thread is type-checked separately, and nothing uses it.
A 203 MB folder at the root holds a parallel copy of a real module.

### Current situation

`tags-spacings` is commented out of `moduleRegistry.ts:209-214`, and three of its files (`utils/sizeMarks.ts`, `utils/fontLoader.ts`, `types.ts`, 274 lines together) are imported by `tidy-doc/utils/buildBreakdownSection.ts`, which `buildDocPage.ts:100` calls inside the live `tidy_doc_build_page` operation.
The other roughly 3,681 lines are parked.
Nothing distinguishes the two.

In the other direction, `withRetry`, `createShapeRectangles`, `insertText`, `searchIndexLegacy`, `getPluginEntries`, `getFeatureEntries`, and `debugLog` each occur exactly once in the repository: their own definition.
`createShapeRectangles` and `insertText` target modules named `shape-shifter` and `text-master` that do not exist.
`withRetry` was announced as a feature in the changelog and never used; the QA code writes its own retry loops instead.
`permissionRequirements` is populated for every module and read by nothing, and it reinforces the wrong claim in `CLAUDE.md:115` that most features need `activeselection`, when the manifest requests only `currentuser`.

`tsconfig.main.json` is referenced by nothing. `temp/` holds 203 MB including a standalone copy of the release-notes plugin. `.ruff_cache/` is untracked and not ignored.

### Why this matters

This project is unusually well documented and is explicitly built to be read by coding agents.
That is exactly the setting where a dead export is expensive: it looks like the sanctioned path and it is a dead end.
`withRetry` is the clean example. Anyone adding retry logic will find it, use it, and be the first.

The `tags-spacings` case is the costly one, and the audit itself is the proof: a careful reader with the whole repository in front of them concluded the folder was deletable, and acting on that conclusion breaks the build.

### Affected areas

`src/shared/` (searchIndex, error-handler, bridge, types, logging), `src/plugins/tags-spacings/`, `src/plugins/tidy-doc/utils/buildBreakdownSection.ts`, `moduleRegistry.ts`, `CLAUDE.md`, repository root.
Developers and coding agents. No user-facing effect.

### Included audit findings

ARCH-001 (extended with `debugLog`), ARCH-002 (reframed, see section 4), ARCH-005, DX-005, DEP-002, DX-002, plus the `CLAUDE.md` permissions error the audit left in prose.

### Validation status

Verified: every dead-code claim, by occurrence count. Every stray artifact. The unreferenced config.
Disputed: ARCH-002's central claim. The module is not dead and must not be deleted.

### Importance

**Moderate.**
Nothing here harms a user.
It is promoted above the usual tidy-up tier for one reason: the project's stated strategy is to be legible to agents, and this is the group that makes it illegible. The audit's own error is the cost demonstrated.

### Broad direction

Make the in-use boundary explicit.
Move the shared utilities `tidy-doc` depends on somewhere that says they are shared, so the rest of `tags-spacings` can be honestly archived or deleted.
Delete the confirmed-dead exports.
Fix the documentation that describes permissions the plugin does not request.

### Decisions needed from the project owner

1. Is `tags-spacings` coming back as a module? Archive and extract are different jobs depending on the answer.
2. Should shared builders live in `src/shared/` rather than inside a module folder? This is the structural question underneath the whole group.
3. Is `temp/` still needed? It is 203 MB of ignored parallel code.

### Open questions

- Are there other cross-module imports reaching into disabled or module-private folders? I verified the `tags-spacings` case; I did not sweep exhaustively for others.

---

## Group 6: Third-party code with known holes, and a local door with no lock

### In plain language

One shipped artifact contains a library version with a published denial-of-service advisory.
That artifact is handed to other designers.
Separately, the channel an AI agent uses to drive the plugin accepts any program on the machine, by design, and the only thing that checks whether a request makes sense sits on the far side of that unlocked door.

### Current situation

`mcp-server` depends on `ws` ^8.18.0, resolving to 8.20.1, which is inside the advisory range for a memory-exhaustion issue.
I confirmed the vulnerable code is genuinely in the shipped bundle: `ws` framing internals are present in `mcp-server/dist/server.cjs`.
The audit's companion claim also holds: `hono` appears zero times in the bundle, so those advisories are tree-shaken away.
The fix is a version bump.

The root tree has 9 advisories, 7 high.
All are devDependencies, only `vite` is direct, and none reach any shipped bundle.

The bridge listens on 127.0.0.1:9876 and treats whoever connects as the plugin, which ADR-0005 documents as an accepted trade-off with named triggers for revisiting.
On top of that, `dispatch()` in the plugin passes request parameters straight to the operation handler with no validation.
The Zod schemas that describe valid input live in `mcp-server/src/catalogue.ts`, in a separate process, on the outside of the socket.

Also here: `figma.openExternal` is called with any string a UI message carries. All current callers are safe, though four of the five pass a URL derived from the generated icon database rather than a literal.

### Why this matters

`ws` is the one advisory that reaches something the team gives to other people, and its realistic impact is that a local process can exhaust the agent bridge's memory. That is annoying, not dangerous, and the fix is a lockfile bump, so the cost-benefit is unusually clear.

The validation point deserves honest scoping.
A local process that can send malformed parameters can equally send well-formed ones and legitimately mutate the file, so missing validation adds little exposure on top of what ADR-0005 already accepts.
What it does mean is that every handler must be independently defensive, and the schemas cannot be relied on as a boundary.

### Affected areas

`mcp-server/`, `src/shared/operations/registry.ts` and `ui-bridge.ts`, `src/code.ts`, root devDependencies.
Developers and agent users, on their own machines. Not end users.

### Included audit findings

SEC-001 (corrected to Low), SEC-002, SEC-003, SEC-005, plus the validation-boundary point the audit left in prose.

### Validation status

Verified: `ws` version and its presence in the bundle; `hono`'s absence; all advisory counts; the unauthenticated bridge; the absence of validation in `dispatch`.
Not disputed: ADR-0005's accepted-risk framing is sound for a single-user development tool.

### Importance

**Moderate for the dependency bumps, Monitor only for the bridge.**
The bumps are hours of work against a distributed artifact.
The bridge is a documented decision with documented triggers, and none of them has fired.

### Broad direction

Take the dependency updates and add whatever recurring check would have surfaced them.
Leave the bridge alone until an ADR-0005 trigger fires, and if the schemas are ever meant to be a boundary rather than documentation, move them inside it.

### Decisions needed from the project owner

1. Should dependency advisories be checked automatically, and should any of them fail CI? Today nothing surfaces them.
2. Do ADR-0005's revisit triggers still describe the actual risk, now that operations write to documents?
3. Are the MCP schemas documentation or enforcement? The answer decides whether validation needs to move.

### Open questions

- Will the MCP server ever run on a shared or multi-user machine? That is the ADR-0005 trigger and only the owner knows.

---

## Group 7: The analytics pipeline cannot be verified, audited, or trusted to be working

### In plain language

Product decisions about which modules to keep are meant to be based on usage data.
The pipeline that collects it is guarded by a password printed inside every copy of the plugin, has no rate limiting, has no tests, and has no alerting.
If it silently stopped recording tomorrow, nothing would say so.

### Current situation

The ingest token is injected at build time by `vite.config.ts:20` into the single-file UI bundle, so anyone with a released plugin can read it out.
The endpoint compares it in constant time, caps bodies at 1 MB, and caps batches at 1,000 events.
There is no rate limiting in `server.js` and none in the nginx vhost, which sets only `client_max_body_size 1m`.
CORS allows any origin, which the Figma iframe requires.

`analytics-server/package.json` declares only a `start` script; the sole file under `test/` is a JSON fixture.
The service exposes `/health` and nothing else, has no metric export and no alerting, and the README records the Metabase dashboard as still pending.
The local dashboard's Metabase image is pinned to `latest`.
The `events` table has no retention policy and its views aggregate over the whole table.

The privacy design itself is good and I am not disputing it: schema v2 carries no file names or raw keys, the file identity is hashed client-side, timestamps are set server-side, the Postgres roles are least-privilege, and there is a committed purge migration.
FNV-1a is a weaker hash than SHA-256, and the audit's reasoning for why the privacy property still holds is correct.

### Why this matters

The value of this pipeline is that it answers questions like "is anyone using off-boarding?", which is a question Group 2 needs answered to be prioritised properly.
Data whose integrity cannot be checked cannot settle that question.
Nothing about this harms users; the exposure is to the quality of the team's own decisions.

The most likely failure is not abuse but silence: a schema drift or a disk quota breaks inserts, the service logs errors nobody reads, and weeks of data quietly vanish.
The privacy filtering is the other silent-regression candidate, and it is exactly the behaviour with no test.

### Affected areas

`analytics-server/`, `src/shared/analytics/`, `vite.config.ts`.
The team's product decisions. Stored event data.

### Included audit findings

SEC-004, SEC-007, TEST-002, OPS-003, OPS-004, plus the retention question the audit raises in section 6.

### Validation status

Verified from the repository: the token mechanism, the absence of rate limiting, the absence of tests, the absence of alerting, the `latest` pin, the missing retention policy.
Not verified: the deployed service's actual state, its data volume, and whether events are currently arriving. I did not contact it.

### Importance

**Moderate.**
Low urgency, real value.
It is worth more than its severity suggests because it is the group that supplies evidence for the others.

### Broad direction

Decide what the analytics are for, then make them verifiable: a test for the privacy and insert path, a check that says when events stop arriving, and a retention decision made before the table is large.
Treat the token as identification rather than authentication and add volume limits if integrity matters.

### Decisions needed from the project owner

1. What decisions will this data actually drive? "Which modules to retire" and "how many people use us" need different guarantees.
2. Does analytics integrity matter enough to defend against a motivated insider, or is an extractable token acceptable?
3. What is the retention policy for the events table?
4. Who is accountable for noticing that ingestion stopped?

### Open questions

- Is the pipeline currently receiving events at all? Everything in this group is written from the repository, and the deployed reality could differ.

---

## Group 8: Releasing and distributing the plugin leaves the repository in an uncertain state

### In plain language

Shipping a release is partly scripted and partly manual, and the scripted parts have side effects on the repository itself.
One deploy script deletes files that are tracked in git.
Documentation is duplicated, drifts, and in one case the live copy contradicts both itself and the actual configuration.
The final step of the release pipeline uses a GitHub action version that GitHub has deprecated.

### Current situation

`scripts/deploy-to-drive.sh` runs `rm -rf deployment` at line 90, rebuilds the folder from `dist/`, `manifest.json`, `CHANGELOG.md`, and the root `README.md`, regenerates `CHECKSUMS.txt`, copies everything to Google Drive, and then runs `rm -rf deployment` again at line 186.
Four files in that folder are tracked in git.
The working tree confirms the pattern right now: `deployment/CHECKSUMS.txt` and `deployment/README.md` are both modified and uncommitted.

The committed `deployment/README.md` is stale, missing `tidy_file_list_pages` and the QA tools.
The working-tree copy has already been refreshed and is byte-identical to the root README.
The root `README.md` states at line 64 that the manifest has `allowedDomains: ["none"]` and at line 164 that it holds the single ingest origin; the manifest holds `https://toolbox-logs.wearekido.dev`, so line 64 is simply wrong in the file people read.

`release.yml:168` uses `softprops/action-gh-release@v1`, which runs on the deprecated Node 16 runtime, while every other action is at v4.
The changelog gate is commented out at lines 52-59.
Lint and format checks cover `src/` only, so `scripts/`, `mcp-server/`, and `analytics-server/` have no automated checks anywhere, including the release scripts themselves.
`.vscode/settings.json` auto-approves `npm run type-check`; the script is called `typecheck`.
The feedback button in `src/App.tsx:153` opens a personal mailbox.

### Why this matters

A deploy that deletes tracked files makes `git status` untrustworthy right when a developer most needs to know what changed.
If the script fails between the two `rm -rf` calls, the files are simply gone until someone runs `git checkout`.

A release that fails at its last step is worse than one that fails early: the tag exists, so the version is spent, but the artifacts are not attached and the distribution repository is not updated.

And the wrong `allowedDomains` claim in the root README matters more than a stale copy would: it tells a reader the plugin has no network access in production, when it posts analytics to a live endpoint.
That is the sort of statement someone would rely on when reasoning about privacy.

### Affected areas

`scripts/deploy-to-drive.sh`, `deployment/`, `.github/workflows/release.yml`, `README.md`, `package.json` scripts, `.vscode/settings.json`, `src/App.tsx`.
Developers and whoever performs releases. No direct user impact.

### Included audit findings

DX-001, DX-003 (understated, corrected), DX-004 (corrected and extended), OPS-001, OPS-002, SEC-006, DEP-002.

### Validation status

Verified: every item, including both `rm -rf` calls, the tracked-file list, the README contradiction, and the action version.
Corrected: DX-003's line number and its consequence; DX-004's scope, which reaches the root README.

### Importance

**Moderate.**
Individually small and individually cheap.
They cluster because they all make releasing feel uncertain, and uncertainty in a release process is the thing that eventually causes a bad release.

### Broad direction

Make the deploy build into a throwaway directory instead of a tracked one, so shipping never touches git state.
Generate the distributed documentation at deploy time from a single source and fix the claim that is wrong in the original.
Move the release pipeline's final step onto a supported action, and extend the automated checks to the scripts that perform releases.

### Decisions needed from the project owner

1. Should `deployment/` be a build output rather than tracked content? Everything else in this group follows from that answer.
2. Is Google Drive still the distribution channel, or has the Claude Code plugin route replaced it? If the latter, some of this work disappears rather than being done.
3. Should the changelog gate block a release or only warn?
4. Who owns the feedback channel, and should it be a team alias?

### Open questions

- Are `deploy-to-dropbox.sh` and `configure-rclone.sh` still live paths? The audit lists them as likely dead and I did not confirm either way.

---

## Group 9: The project is half-migrated to Figma's newer document-access model

### In plain language

Figma has two ways for a plugin to read a document: an older one where the whole file is available immediately, and a newer one where pages must be loaded on request.
The plugin is configured for the older way.
Its newer modules are already written for the newer way.
Its older modules are not, and they are the ones that delete and rearrange pages.

### Current situation

`manifest.json` has no `documentAccess` field, so the plugin runs under legacy whole-document access.

The newer code already calls `figma.loadAllPagesAsync()` before walking the document: `qa/operations.ts`, three QA renderers, three `tidy-doc` utilities, `ds-explorer/operations.ts`, and `utilities/operations.ts`.
Under the legacy model that call is a harmless no-op, so it is there for forward compatibility.

The older code does not.
There are 27 synchronous `figma.root.children` reads across `src/`, concentrated in off-boarding (7), sticker-sheet-builder (4), release-notes (4), and audit (4).
`grep` finds no `loadAllPagesAsync` anywhere in off-boarding, audit, or `release-notes/render/publish.ts`, and that last file is the whole-file publish sweep.

### Why this matters

Today, nothing.
The legacy model works and this costs the project nothing.

It matters as a shape.
If Figma ever requires the newer model, the modules that break are precisely the destructive, untested ones from Group 2, and they break in the part that walks every page deciding what to delete.
The newer half of the codebase is already prepared, which means the migration is partly done and nobody has recorded that it is in progress or how it ends.

The reason this is its own group rather than a note is that it changes the argument for Group 2.
If a document-access migration is coming, then rewriting off-boarding's page walk is not optional cleanup; it is work that has to happen anyway, and doing it with tests is barely more expensive than doing it without.

### Affected areas

`manifest.json`, off-boarding, audit, sticker-sheet-builder, `release-notes/render/publish.ts`.
Contingent on Figma's platform decisions.

### Included audit findings

None. The audit did not cover this.

### Validation status

Verified: the manifest's configuration, the split in the code, the exact call sites, the absence of `loadAllPagesAsync` in the three destructive modules.
Needs more evidence: whether Figma requires or intends to require `documentAccess: "dynamic-page"`, and on what timeline. I could not check external documentation, so the consequence is a plausible concern rather than a confirmed risk.

### Importance

**Needs more investigation before it can be ranked.**
If a deprecation is real and dated, this becomes High and it reshapes Group 2.
If it is not, this is Monitor only and the newer modules are simply well written.
Answering it is one documentation lookup.

### Broad direction

Establish whether the migration is required and by when.
If it is, treat it as the reason to rework the old modules' document walks, and combine it with the testing work rather than doing both separately.

### Decisions needed from the project owner

1. Will this plugin ever be submitted to the Figma Community, or stay on private distribution? Community submission is where platform requirements bite hardest.
2. Is dynamic-page compatibility a stated goal? The newer modules behave as if it is, and nothing records the decision.

### Open questions

- What is Figma's current policy and timeline for legacy document access? This single fact decides whether the group is urgent or irrelevant.

---

# 6. Relationships between groups

**Group 1 and Group 2 share a root cause and should be sequenced together.**
Both come from the older modules never having been held to the boundaries the newer ones follow.
Group 1 is about declaring what an operation does; Group 2 is about being able to verify it.
The overlap is concrete: REL-003, the read path that mutates, is a Group 1 defect discovered only because someone read code that Group 2 says has no tests.
Fixing Group 1 without Group 2 means fixing four known instances and having no way to know about the fifth.

**Group 9 may convert Group 2 from optional to mandatory.**
If Figma's document-access migration is required, the destructive modules' page walks have to be rewritten regardless.
That is the moment to add tests, because the code is being touched anyway.
Resolving Group 9's open question should therefore happen before Group 2 is scoped, and it costs almost nothing to resolve.

**Group 7 supplies the evidence Group 2 needs.**
"How much should we invest in off-boarding's safety?" depends on whether anyone uses off-boarding.
The analytics pipeline is supposed to answer that and currently cannot be trusted to.
This is a soft dependency, not a blocker: Group 2's worst case is bad enough to act on without usage data.

**Group 5 partly dissolves if Group 2 is done, and partly does not.**
The dead-code half is independent and cheap.
The `tags-spacings` half is a structural question about where shared builders live, and answering it touches `tidy-doc`, which is one of the well-tested modules. It does not depend on Group 2 and should not wait for it.

**Group 4 splits and the halves go different places.**
The decode fix is independent of everything, small, and measurable. It belongs in whatever the next small batch is.
The bundle restructuring depends on a measurement nobody has taken and on a product decision about Icon Finder's importance.

**Group 6 must stay separate despite looking adjacent to Group 7.**
Both mention tokens and trust.
They involve different decisions: Group 6 is about dependency maintenance on a developer-facing artifact, Group 7 is about whether product data can be trusted.
Combining them would bury the one genuinely cheap and clearly worthwhile item, the `ws` bump.

**Group 8 is independent of everything else and internally coherent.**
Nothing in it depends on any other group, and nothing else depends on it.
It is the most self-contained scope available.

**Group 3 is independent but sits inside the most active module.**
Release notes is where most current development happens, so this work competes with feature work rather than with the other groups.
That is a scheduling constraint, not a dependency.

**One apparent problem shrinks if another is addressed.**
Group 1's retry-duplication risk is largely neutralised for any module with stamped, provably-owned output, which release-notes and tidy-doc already have.
Extending that ownership pattern to sticker sheets, labels, and audit reports would make timeouts far less consequential without touching the timeout mechanism at all.

---

# 7. Recommended prioritization for discussion

This ranking was written before the owner answered section 8.
Five items below are now superseded:

- **Group 9** drops out of "discuss first" and becomes low priority. Distribution stays private and dynamic-page access is not a goal (items 12 and 13). What remains is one ADR sentence recording the decision.
- **Group 2** keeps full scope. All six modules are alive (item 1).
- **Group 1's** audit-layout question is deferred, because audit is paused (item 7). The rest of Group 1 is unaffected.
- **Group 7** has its product answer, its retention policy and its window fix (item 10), and its integrity question is settled (item 11). Its remaining questions, one live confirmation that events arrive and who watches for ingestion stopping, are deferred by the owner to a future date.
- **Group 8** keeps full scope. Google Drive is still the channel (item 14).

## Discuss first

**Group 2 (untested destructive modules)** and **Group 1 (read/write distinction and uncancellable operations)**.
These are the only groups where the realistic bad outcome is a designer losing work, and they share a root cause.
They also need the most product input: which of the six old modules are alive, and how much friction is acceptable on destructive actions.

**Group 9 (document-access migration)** belongs here despite being unranked, because it is cheap to resolve and it changes how Group 2 should be scoped.
Answer it before committing to a Group 2 shape.

## Strong PRD candidates

**Group 8 (release and distribution)**.
Fully verified, entirely self-contained, no dependencies, no architectural decisions, and it removes a class of "why is my working tree like this" confusion. The only real question is whether Google Drive is still the channel.

**Group 5 (parked versus live code)**.
Well verified, cheap, and it directly serves the project's stated goal of being legible to agents. The audit's own ARCH-002 error is the argument for it.

**The decode half of Group 4**.
A measured 30x improvement on the dominant cost of a user-visible freeze, three lines, byte-identical output. Too small for its own PRD; it should ride along with anything.

**Group 6's dependency bumps**.
Hours of work, one of them against an artifact given to other people. Also too small alone.

## Needs more investigation

**Group 4's bundle restructuring**.
Needs one measurement from inside Figma: what does 5 MB actually cost at start-up, given whatever caching Figma does. Without that number the work has no success criterion and could be entirely unnecessary.

**Group 7 (analytics verifiability)**.
Needs a product answer about what the data is for before anyone builds tests or alerting for it. Also needs someone to confirm events are currently arriving, which the repository cannot tell us.

**Group 3's storage limit question**.
One live measurement of Figma's plugin-data cap against the team's largest real sprint decides whether REL-007 is a constraint or a non-issue. The id-collision and interruption-messaging parts do not need that answer.

**Group 9**, as above, pending one documentation lookup.

## Probably defer

**Group 6's bridge work (SEC-003 and the validation boundary)**.
A documented, reasoned decision with explicit revisit triggers, none of which has fired. Changing it is expensive and nothing currently justifies it. Revisit if the tool reaches shared machines.

**ARCH-003 (the 1,978-line release-notes UI)**.
A preference about editing comfort in the module under heaviest active development, implicated in no other finding. Splitting it now competes with feature work for no measurable gain.

**TEST-003 (end-to-end Figma automation)**.
Correctly framed by the audit as strategic. It is real, it is large, and Group 2's pure-seam testing captures most of the value for a fraction of the cost. Revisit after Group 2 shows what is still uncovered.

**SEC-007, OPS-003, DEP-002, ARCH-005, DX-002**.
Genuinely trivial. They should be swept up alongside larger work in the same files, not planned.

---

# 8. Product-owner decisions

These are the decisions that change what a PRD would contain.

The owner answered all eighteen on 2026-08-03.
Each item below records the question, the answer, and a status.
Five items (6, 10, 15, 16 and 17) were passed back for a recommendation; the owner accepted every recommendation the same day, so they are decisions and not proposals.
The per-group "Decisions needed from the project owner" lists in section 5 are not restated here, but the answers below apply to them.

Status values:

- **Decided** - the owner gave a clear answer and no further input is needed.
- **Deferred** - the answer depends on work that is paused or not yet started.

Every question is now answered except item 7, which waits on the future of the audit module.

Two owner questions raised inside section 5 are not part of this list and stay open:

- Who is accountable for noticing that analytics ingestion stopped (Group 7). The owner deferred all remaining analytics questions to a future date. Item 10's decisions stand; the ownership and monitoring questions wait.
- Who owns the feedback channel, which currently points at a personal mailbox (Group 8).

---

## On the module portfolio

**1. Which of the six untested modules (audit, ds-explorer, component-labels, off-boarding, sticker-sheet-builder, tidy-mapper) are strategically alive?**

**Decided.**
All six are alive.
Some may change significantly.
Priority order for investment: ds-explorer, component-labels, sticker-sheet-builder and tidy-mapper rank higher than the other two for now.

Effect on Group 2: full scope stays.
No module gets tests skipped because of planned retirement.
The priority order puts off-boarding low, which is acceptable only because item 4 covers its worst path with a confirmation step.

**2. Is `tags-spacings` coming back as a module, or is it permanently parked?**

**Decided, with a condition.**
The owner wants it back, but not on the "Internal tools" page.
Until a different home exists, it stays parked.

Effect on Group 5: this is an archive job, not an extract job, and it is blocked on a product question the owner has not solved yet.
The three utility files `tidy-doc` needs must keep working while the module stays parked.

**3. Is Icon Finder worth architectural work on the UI bundle, given the 3.9 MB every other module's users pay at start?**

**Decided.**
Yes, the work is justified.
It is not top priority.

## On safety and recovery

**4. Should destructive operations require explicit confirmation?**

**Decided.**
Yes.
Off-boarding pack and unpack, audit erase, and release-notes clear canvas all get an explicit confirmation step.

**5. Is "recoverable by Figma undo" an acceptable guarantee for operations that rearrange pages?**

**Decided.**
Yes, Figma undo is enough.
No separate recovery or snapshot mechanism is needed.

Note: undo requires the user to notice in time, so this answer leans on item 4 to do the warning.

**6. When an operation exceeds its time limit, should the plugin report it as cancelled or as possibly still running?**

**Decided.**
The owner asked for a recommendation and accepted it.

Decision: report it as possibly still running, and add a real stop only where the sandbox allows one.

The present message is wrong in the direction that causes damage.
It reads as "nothing happened", so the designer clicks again, and two runs write to the same file.
Release notes and tidy-doc survive this because they identify their output by ownership stamps.
Sticker sheets, component labels and audit reports have no such protection, so the second run doubles the output.

Three parts, cheapest first:

1. For write operations, change the text to state that work continues and that the user must check the canvas before a retry.
2. Give each operation a declared shape: does it read or write, and how long may it take. This removes the hand-typed list of ten strings in `code.ts:19-41` and closes the two known gaps (`audit:export-multipage-pdf` and `off-boarding:pack-pages`).
3. For handlers that loop over items, add a cooperative cancel flag that the loop checks between items. This is the only true stop the Figma sandbox permits. `Promise.race` cannot stop a handler, so no part of the UI may present it as cancel.

**7. Should the audit report be laid out vertically or horizontally?**

**Deferred.**
Audit is on pause and may be replaced completely.

Effect on Group 1: the layout question is moot for now.
The safe minimal fix does not need it: stop `findReportFrame()` from setting the layout mode on the read path, and leave the assignment in the build path where it is load-bearing.

## On data and durability

**8. Is release-notes content entitled to an export or backup path?**

**Decided.**
No.
The content lives in the Figma file.
That is the intended contract.

**9. Will release notes ever be driven by an agent or by automation?**

**Decided in intent, and the blocking assumption is wrong.**
The owner wants this, but believes an agent cannot see or describe changes in a Figma file.

Correction: the plugin sandbox cannot see history, but the Figma REST API can.

- `GET /v1/files/:key/versions` lists the version history.
- `GET /v1/files/:key?version=<id>` returns the document tree at that version, so two versions can be diffed at node and property level.
- `GET /v1/files/:key/branches` and the branch compare give the same story for branch work.

This is the out-of-band pattern the repository already uses for `asset-manifest.json` through `npm run manifest:assets`, because the sandbox has no network.
So the path exists: a script fetches two versions, an agent describes the diff, an operation writes the note.

Effect: the timestamp-id collision stops being theoretical.
Two unattended runs in the same second collide.
Make the id collision-proof before any automation work starts.
It is cheap and it is a prerequisite.

**10. What decisions is the usage-analytics data meant to drive, and what is the retention policy?**

**Decided.**
The question the data must answer is which plugins are really used.
That may change.
The retention half was passed back for a recommendation, and the owner accepted it.

Decision: keep raw events for 13 months, and give the "really used" question a 90-day window by default.

The retention part is not a capacity problem.
A private plugin used by a handful of designers produces events in the low hundreds of thousands of rows a year, which Postgres does not notice.
Retention is therefore a data-handling policy: how long it is acceptable to hold per-session usage records, even hashed ones.
Thirteen months allows one year-over-year comparison and no more.
The job is one scheduled `DELETE` keyed on `received_at`, for which an index already exists (`02_schema.sql:22`).

The window part is the half that changes answers today.
Three of the four dashboard views aggregate over the whole table with no time filter:
`v_module_file_breadth` (`02_schema.sql:39-44`), `v_module_opens_vs_actions` (lines 47-52) and `v_action_breakdown` (lines 55-61).
Only `v_module_daily` buckets by day.
So "which plugins are really used" is currently answered over all time.
A module that was busy last spring and is dead now still looks used, and a module adopted last month looks weak beside a year of another module's history.
That skews the exact decision Group 2 depends on, so add a 90-day variant of those three views and make it the default the dashboard reads.

Effect on Group 7: its retention question (decision 3 in Group 7's list) is closed, and a view-window fix joins its scope.
Group 7's remaining owner question is who is accountable for noticing that ingestion stopped.

**11. Does analytics integrity matter enough to defend against token extraction from a released bundle?**

**Decided.**
No.

Effect on Group 7: scope shrinks from "make the pipeline tamper-proof" to "make the pipeline verifiable".

## On platform and distribution

**12. Will this plugin ever be submitted to the Figma Community?**

**Decided.**
No.
It stays private for the foreseeable future.

Effect on Group 9: not urgent.

**13. Is dynamic-page document access a stated goal?**

**Decided.**
No.
Many modules are older than dynamic access, and the project went with the defaults.
This was never a decision.

Effect on Group 9: record this in an ADR sentence so the next reader stops inferring a goal from the newer modules' behaviour.

**14. Is Google Drive still the distribution channel?**

**Decided.**
Yes.
Google Drive distributes both the Figma plugin and the Claude Code plugin.
The owner is open to changing this later.

Effect on Group 8: the work stays. Nothing disappears.

**15. Should `deployment/` be a build output rather than tracked content?**

**Decided.**
The owner asked for a recommendation and accepted it.

Decision: yes, make it a build output and untrack it.

`scripts/deploy-to-drive.sh` deletes the folder at line 90 and again at line 186.
Four files in it are tracked in git.
Shipping therefore makes `git status` untrustworthy, which is what the working tree shows right now.
If the script fails between the two deletes, the tracked files are gone until someone runs `git checkout`.

Build into a throwaway directory, add it to `.gitignore`, and generate the distributed README at deploy time from the root one.
If an auditable record of what shipped is wanted, attach `CHECKSUMS.txt` to the GitHub release instead of committing it.

Not a decision, and true whatever is chosen: `README.md:64` states `allowedDomains: ["none"]` while line 164 correctly names the ingest origin.
Line 64 tells a reader the plugin has no network access in production.
Fix it.

## On the agent surface

**16. Do ADR-0005's revisit triggers still describe the real risk, now that operations write to documents?**

**Decided.**
The owner asked for a recommendation and accepted it.

Decision: amend the wording, keep the decision.

The trigger already names "exposing destructive Operations".
Operations now write, so a reader cannot tell whether the trigger has fired.
In substance it has not: every write operation creates or replaces stamped artifacts, and none deletes or relocates a designer's own content.
The ADR does not say that, so nobody can check it.

Amend the trigger to separate the two cases: writes that create stamped artifacts (accepted), and writes that delete or relocate user content (trigger fires).
This keeps the ADR a live rule instead of an old one.

**17. Are the MCP Zod schemas documentation or enforcement?**

**Decided.**
The owner asked for a recommendation and accepted it.

Decision: they are documentation, the ADR should say so, and they stay where they are.

The schemas in `mcp-server/src/catalogue.ts` sit outside the socket, so they were never a boundary.
Their real job is to tell the agent how to call an operation, and they do it well.
Moving Zod into the plugin bundle costs bundle size for protection ADR-0005 already declines: a local process that can send malformed input can equally send valid input.

Instead, each operation handler validates its own inputs and fails through the existing `OperationError` contract.
That is defensive coding inside the trust boundary, with no new dependency, and it also protects against an agent that simply calls an operation wrongly.

**18. Should dependency advisories be surfaced automatically, and should any of them fail CI?**

**Decided.**
Surface them, but gate nothing.
A separate audit process is wanted, not a CI gate.

A scheduled workflow that reports and blocks nothing satisfies this at near zero cost.

---

# 9. Suggested PRD scope options

## Option A: Make document operations honest and testable

**Groups:** 1 and 2, informed by 9.

**Outcome:** Every operation declares whether it reads or writes and how long it may take; the operations that can damage a file have their decisions extracted into pure, fixture-tested code following the QA engine's existing seam; destructive actions say what they will do before doing it; a timed-out operation tells the truth about its state.

**Why together:** These are one missing distinction and one missing safety net, and they are the same distinction. Fixing the four known read-path and timeout defects without tests means fixing what was found and staying blind to the rest. The QA engine already proves the pattern works in this codebase, so this is applying an established internal approach rather than inventing one.

**Explicitly out of scope:** End-to-end Figma automation (TEST-003), rewriting the release-notes UI, bundle work, anything in analytics.

**Risks and unknowns:** The largest unknown is which of the six modules deserve the investment, which is decision 1 and is not answerable from the code. Group 9's answer could expand this scope from "add tests" to "rewrite the page walks with tests", which is a materially bigger job. Extracting pure seams from Figma-coupled code is the kind of work that reveals more coupling than expected.

**Size:** Large.

---

## Option B: Everything cheap, verified, and independent

**Groups:** 5, 8, the decode half of 4, the dependency bumps from 6.

**Outcome:** Dead exports gone; the `tags-spacings` boundary made explicit so the parked part can be honestly archived; documentation that contradicts the manifest corrected; deploys that no longer touch git state; the release pipeline off a deprecated action; lint and format extended to the scripts that ship releases; `ws` and `vite` updated; the icon decode 30x faster on its dominant cost.

**Why together:** Every item is fully verified, individually small, architecturally independent, and needs at most one decision. None competes with the others for the same files or the same reasoning. Together they remove most of the repository's day-to-day friction and most of what misleads a reader, including the specific trap that caused this audit's own worst error.

**Explicitly out of scope:** All testing work, all analytics work, the bundle restructuring, the bridge, the release-notes UI.

**Risks and unknowns:** Low risk throughout, which is the point. The one real dependency is decision 14 about the distribution channel, which could make part of the Group 8 work unnecessary rather than wrong. The `tags-spacings` extraction touches `tidy-doc`, so it needs care, but `tidy-doc` is well tested.

**Size:** Medium.

---

## Option C: Decide what the analytics are for, then make them trustworthy

**Groups:** 7.

**Outcome:** A stated purpose for the usage data; tests around the privacy filtering, the auth check, and the insert path; a check that notices when events stop arriving; a retention decision; the dashboard deployed; volume limits if integrity is judged to matter.

**Why together:** This is one system with one owner and one question behind it. It is separated from everything else because its value is indirect: it does not fix a user-facing problem, it makes the team's other decisions evidence-based. In particular it is what would tell you whether off-boarding is worth protecting.

**Explicitly out of scope:** Anything in the plugin. Changing the privacy design, which is sound.

**Risks and unknowns:** The pipeline's actual deployed state is unknown from here, so the work could turn out to be larger (nothing has been arriving) or smaller (it is fine and only needs a check) than the repository suggests. Its value depends entirely on decision 10, and if the honest answer is "we are not really using this data", the right scope is much smaller than it looks.

**Size:** Small to Medium.

---

## Option D: Answer the four questions that would change everything else

**Groups:** the open questions from 9, 4, 3, and 7.

**Outcome:** Four facts established. Whether Figma requires dynamic-page document access and by when. What 5 MB actually costs at plugin start inside Figma. What Figma's plugin-data cap is against the team's largest real sprint. Whether analytics events are currently arriving.

**Why together:** Each is a measurement or a lookup, not a change. Each currently determines whether a group is High or irrelevant. Group 9's answer reshapes Option A's scope; the start-up measurement decides whether Group 4's expensive half exists at all; the plugin-data answer settles a third of Group 3; the analytics answer sizes Option C. Doing these first means the other options get scoped against facts.

**Explicitly out of scope:** Any code change. This is deliberately a spike.

**Risks and unknowns:** Three of the four need a live Figma session, so this is not something an agent can do alone. The risk is that a spike with no deliverable gets deprioritised and the facts never arrive.

**Size:** Small.

---

## Option E: One safe module, done properly

**Groups:** the off-boarding parts of 1, 2, and 9.

**Outcome:** Off-boarding alone gets the full treatment: a namespaced and marker-verified temp page, a stored record of what was packed so unpack does not guess, confirmation before anything destructive, the current-page fallback removed or gated, its page walk made dynamic-page compatible, and its decisions extracted into fixture-tested pure code.

**Why together:** Off-boarding is the single most dangerous module in the repository and it is one of the smallest, at 892 lines. It carries every problem the larger options address, in miniature. Doing one module completely produces a worked example for the other five and a real estimate for Option A, instead of an argument about approach.

**Explicitly out of scope:** The other five untested modules. The timeout mechanism itself. Everything else.

**Risks and unknowns:** If decision 1 retires off-boarding, this is wasted, so that answer is a precondition. A single-module scope may not generalise as cleanly as hoped, though the QA engine suggests the pattern holds. And a well-executed pilot can become a reason to keep postponing the other five.

**Size:** Small.

---

# 10. Final recommendation

**1. The groups I believe matter most**

Group 2 (destructive modules with no safety net) and Group 1 (no distinction between reading and writing, and no way to stop an operation).
They are the only groups where the realistic bad outcome is a designer losing work, they share one root cause, and the audit's own REL-003 and REL-004 are the proof that this class of defect survives here for months.
Group 9 sits just behind them, not because it is urgent but because one lookup decides whether it makes Group 2 twice as important.

**2. The groups most confidently validated**

Group 5 and Group 8, with the caveat that ARCH-002 inside Group 5 needed correcting and I have corrected it.
Group 4's measurements, which I reproduced independently, including a finding the audit missed.
Group 6's dependency facts, which I confirmed by reading the shipped bundle rather than trusting `npm audit`.
Everything in these groups is verifiable from the repository and I verified it.

**3. The groups that should not enter a PRD yet**

Group 7, until someone says what the analytics data is for; the work is well understood and its value is not.
The bundle-restructuring half of Group 4, until someone measures plugin start-up inside Figma; today it is days of work against an unquantified cost.
Group 6's bridge and validation work, which is a documented decision whose revisit triggers have not fired.
ARCH-003 and TEST-003, for the reasons in section 7.

**4. The PRD scope option I would discuss first**

**Option A, "Make document operations honest and testable"**, but only after Option D's four questions are answered, and Option D is small enough to run in parallel with the conversation rather than before it.

Option A is the recommendation because it is the only scope that addresses something that can cost a designer their work, and because it applies a pattern this project has already proved works on its own hardest module.
Option B is more certain and cheaper and I would run it alongside as background work, but it fixes friction, not risk.

The one thing I would change about Option A before committing: scope it to Option E first.
Do off-boarding completely, as one worked example, then decide the remaining five with a real estimate in hand.
That converts the largest unknown in Option A, how expensive seam extraction actually is in this codebase, from an argument into a measurement.

**5. What I need from you**

Four answers scope everything above:

1. **Which of the six untested modules are alive?** Audit, ds-explorer, component-labels, off-boarding, sticker-sheet-builder, tidy-mapper. This single answer determines whether Option A is large or medium, and whether Option E is worth doing at all.
2. **Is `tags-spacings` coming back?** It is not deletable as the audit claimed, since `tidy-doc` imports three of its files. Archive-and-extract or revive are different jobs.
3. **Should destructive operations confirm before acting?** A product decision about designer friction that I should not make for you.
4. **Will the plugin ever go to the Figma Community, or stay on private distribution?** This decides whether the document-access migration is a deadline or a curiosity, and it changes Option A's shape.

Two more would sharpen the picture but do not block a decision: what the usage analytics are actually for, and whether Google Drive is still the distribution channel.

Tell me which groups and which requirements you want in the PRD and I will write it.
