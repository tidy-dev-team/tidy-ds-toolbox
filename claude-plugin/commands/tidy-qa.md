---
description: Run the DS Component QA checklist against a component set via the Tidy DS Toolbox MCP server. Target by node id, name, or glob — or omit to use the current selection. Read-only by default; `--canvas` renders the checklist on canvas instead.
allowed-tools:
  - "mcp__tidy-ds-toolbox__tidy_qa_run"
  - "mcp__plugin_tidy-ds_tidy-ds-toolbox__tidy_qa_run"
  - "mcp__tidy-ds-toolbox__tidy_qa_build_checklist"
  - "mcp__plugin_tidy-ds_tidy-ds-toolbox__tidy_qa_build_checklist"
---

Run the Tidy DS Toolbox QA checklist against a component set — as a JSON report
(`tidy_qa_run`, the default) or, with `--canvas`, as a checklist frame drawn on
the Figma canvas (`tidy_qa_build_checklist`). `tidy_qa_run` never mutates the
file; `tidy_qa_build_checklist` only adds/replaces its own checklist frame.

User-supplied arguments (may be empty): $ARGUMENTS

## Argument parsing

Split `$ARGUMENTS` on whitespace into tokens, then classify each:

- **Canvas flag** — the token `--canvas` (or `--render`). Switches to canvas
  mode. Remove it from the token list before parsing the rest.
- **Check-id** — a token that exactly matches one of the known check ids:
  `set-name-casing`, `prop-order`, `tokens`, `layer-naming-structure`,
  `grid-4px`, `interaction-hover-only`, `description`, `no-conflicts`,
  `preferred-values`, `nesting-depth`, `asset-provenance`, `themes`,
  `high-contrast`, `responsive-bounds`, `documentation`,
  `variant-property-bindings`. Collect these into
  the `checks` array (a filter - only these checks run).
- **Id** — a token matching `^\d+:\d+$` (e.g. `2625:10445`). Use as `nodeId`.
- **Target name / glob** — every remaining token. Join them with spaces (names
  can contain spaces, e.g. `Button Icon`) and pass as `name`. A `*` makes it a
  glob (e.g. `Notification*`).

Note: a bare token that matches a check id is always treated as a check filter,
so a component *literally* named like a check id (e.g. `tokens`) can't be
targeted by name — pass its node id, or a glob like `tokens*`, instead.

Then build the call params:

- If a `nodeId` token was found, pass `{ nodeId }` (ignore any name tokens and
  say so).
- Else if there are target-name tokens, pass `{ name }`.
- Else pass **no target** — the operation falls back to the current Figma
  selection.
- Always include `checks` if any check-id tokens were collected; omit it to run
  the full catalogue.

Examples:
- `/tidy-ds:tidy-qa` → `tidy_qa_run {}` (current selection, all checks)
- `/tidy-ds:tidy-qa Button` → `tidy_qa_run { name: "Button" }`
- `/tidy-ds:tidy-qa Notification*` → `tidy_qa_run { name: "Notification*" }`
- `/tidy-ds:tidy-qa 2625:10445 tokens grid-4px` → `tidy_qa_run { nodeId: "2625:10445", checks: ["tokens", "grid-4px"] }`
- `/tidy-ds:tidy-qa --canvas` → `tidy_qa_build_checklist {}` (current selection)
- `/tidy-ds:tidy-qa --canvas 2625:10445` → `tidy_qa_build_checklist { nodeId: "2625:10445" }`
- `/tidy-ds:tidy-qa --canvas Button` → resolve `Button` to a nodeId first (see below), then `tidy_qa_build_checklist { nodeId }`

## Canvas mode (`--canvas`)

`tidy_qa_build_checklist` is an **Execute** operation and, unlike `tidy_qa_run`,
takes only `{ nodeId?, checks?, anchorNodeId? }` — **no `name`/glob lookup**. If
target-name tokens were parsed above:

1. Call `tidy_qa_run { name, checks }` first purely to resolve the name/glob to
   `target.id` — ignore its findings payload in canvas mode.
2. Then call `tidy_qa_build_checklist { nodeId: target.id, checks }`.

If a `nodeId` token was found, or no target was given (selection fallback),
skip straight to `tidy_qa_build_checklist` with `{ nodeId?, checks? }`.

This draws a checklist frame on the canvas next to the target — every
automated item with grouped findings, every manual item as an empty checkbox —
and is **idempotent**: re-running for the same target replaces its prior frame
rather than duplicating it.

The response is a small stub only:
`{ frameId, target: { id, name }, counts: { pass, warn, fail, manual, notImplemented, notApplicable, notRun, partial } }`.
`partial` counts automated rows that still need a human tick because the check
covers only part of the item (currently #3, #7, #17 and #19). Those rows are also
counted by their own status, so report them as outstanding work even when
`manual` is 0.
Report it directly - do not invent findings detail that isn't in the stub;
tell the user to look at the frame on canvas (e.g. "Checklist for Button: 9
pass, 4 warn, 2 fail, 3 manual, 4 partly manual - see the frame next to it on
canvas.").

The status buckets sum to exactly 19, so a total that falls short means you
misread one. `notApplicable` is a check that ran and found nothing to judge
(an asset set has no text to measure for contrast); `notRun` is a check a
`checks` filter excluded. Neither is a pass, and neither is a defect - say which
rows they were rather than folding them into either.

## Presenting the result

The response shape is
`{ target: { id, name }, results: CheckResult[], notImplemented: string[] }`.
Each `CheckResult` is `{ checkId, title, status, findings, note?, manualRemainder? }`;
each finding has a `severity` (high / medium / low), `nodeId`, `nodeName`,
`message`, and often `expected` / `actual`.

`note` says one of two things, depending on the status it sits on.
On any verdict the check reached - `pass`, `warn` or `fail` alike - it is a caveat: that verdict rests on partial evidence, or on a heuristic that may have judged the wrong thing.
On a `not_applicable` it is the reason the check had nothing to judge.
Quote it either way, and on a `warn` or `fail` too: the caveat says how far to trust the row, so dropping it there overstates the finding as much as dropping it on a `pass` overstates the tick.
On an asset set the n/a reasons are the bulk of what the run actually established, so dropping them leaves the user with a column of unexplained "n/a".

**Findings arrive deduped, one per defect** (issue #118). Variants share their
layers, so one mistake in a shared layer used to be reported once per variant:
170 findings for 4 defects on a 64-variant Button. A finding covering several
nodes carries:

- `count` - how many nodes it covers (absent means 1),
- `nodeIds` - those nodes, capped at 10, with `nodeId` still the representative,
- `nodeNames` - present only when the nodes had different names, in which case
  the message shows `"…"` and these say which. When the name is shared it stays
  in the message, so a finding reading `"Right Icon" itemSpacing is 10` with
  `count: 56` means one layer, 56 times.

So **do not re-group by hand**; report the counts as given. Findings come
severity-first, so the order is already the reporting order.

**Do not echo the raw payload** - a set with many genuinely distinct defects is
still long. Summarise:

1. Lead with the target name/id and a one-line verdict (how many checks failed /
   warned / passed).
2. A compact table: one row per check — `title` · `status` · finding count.
3. For checks with findings, quote the messages with their `count` (e.g. "`Right
   Icon` itemSpacing is 10, unbound, on 56 nodes"). Surface **high** and
   **medium** severity first; summarise **low** severity as counts only unless
   the user asks for detail.
4. For `not_applicable` rows, give the reason from `note` rather than just the status.
   "No text layers, so nothing to measure for contrast" is information; a bare "n/a" is not, and on an icon set most of the checklist is n/a.
5. List any `notImplemented` check ids so the user knows what wasn't run.

> Large-output note: if the tool result is still truncated to a file, read it
> before summarising rather than dumping it.
> Scoping the run to a single instance is tracked separately (issue #90).

## Errors

Same error contract for both `tidy_qa_run` and `tidy_qa_build_checklist`:

- **`INVALID_PARAMS` "no target and nothing selected"** — the user passed no
  target and nothing is selected in Figma. Ask them to select a component /
  component set / instance, or pass a name or node id (name only via the
  resolving `tidy_qa_run` call in canvas mode — see above).
- **`INVALID_PARAMS` ambiguous** — a name/glob matched more than one set (from
  the resolving `tidy_qa_run` call in canvas mode). The `details.candidates`
  array lists `{ id, name }`; show it and ask the user to pick (re-run with a
  node id or a narrower glob).
- **`INVALID_PARAMS` "unknown check id(s)"** — a check filter was misspelled;
  `details.unknown` lists them. Show the valid check ids above.
- **`NOT_FOUND`** — the node id or name matched nothing.
- **`WRONG_NODE_TYPE`** — the target doesn't resolve to a component set.
- **`BRIDGE_DISCONNECTED`** — tell the user to open the Tidy DS Toolbox plugin
  in Figma.
