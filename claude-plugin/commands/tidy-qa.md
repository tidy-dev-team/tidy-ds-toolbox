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
  `preferred-values`. Collect these into the `checks` array (a filter — only
  these checks run).
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

1. Call `tidy_qa_run { name, checks }` first (or `tidy_find`) purely to resolve
   the name/glob to `target.id` — ignore its findings payload in canvas mode.
2. Then call `tidy_qa_build_checklist { nodeId: target.id, checks }`.

If a `nodeId` token was found, or no target was given (selection fallback),
skip straight to `tidy_qa_build_checklist` with `{ nodeId?, checks? }`.

This draws a checklist frame on the canvas next to the target — every
automated item with grouped findings, every manual item as an empty checkbox —
and is **idempotent**: re-running for the same target replaces its prior frame
rather than duplicating it.

The response is a small stub only:
`{ frameId, target: { id, name }, counts: { pass, warn, fail, manual, notImplemented } }`.
Report it directly — do not invent findings detail that isn't in the stub;
tell the user to look at the frame on canvas (e.g. "Checklist for Button: 4
pass, 3 warn, 1 fail, 10 manual — see the frame next to it on canvas.").

## Presenting the result

The response shape is
`{ target: { id, name }, results: CheckResult[], notImplemented: string[] }`.
Each `CheckResult` is `{ checkId, title, status, findings }`; each finding has a
`severity` (high / medium / low), `nodeId`, `nodeName`, `message`, and often
`expected` / `actual`.

A full-set run on a large component (e.g. a 64-variant Button) can return
**hundreds** of findings. **Do not echo the raw payload.** Summarise:

1. Lead with the target name/id and a one-line verdict (how many checks failed /
   warned / passed).
2. A compact table: one row per check — `title` · `status` · finding count.
3. For checks with findings, **group by kind** (dedupe repeated per-node
   findings — e.g. "42 layers: fill not bound to a color variable") with a
   count, and quote 1–2 representative findings verbatim (include `nodeId` and
   `message`). Surface **high** and **medium** severity first; summarise **low**
   severity as counts only unless the user asks for detail.
4. List any `notImplemented` check ids so the user knows what wasn't run.

> Large-output note: the raw result may still overflow. If the tool result is
> truncated to a file, read/group it before summarising rather than dumping it.
> Scoping the run to a single instance is tracked separately (issue #90).

## Errors

Same error contract for both `tidy_qa_run` and `tidy_qa_build_checklist`:

- **`INVALID_PARAMS` "no target and nothing selected"** — the user passed no
  target and nothing is selected in Figma. Ask them to select a component /
  component set / instance, or pass a name or node id (name only via
  `tidy_qa_run`/`tidy_find` in canvas mode — see above).
- **`INVALID_PARAMS` ambiguous** — a name/glob matched more than one set (from
  the resolving `tidy_qa_run`/`tidy_find` call in canvas mode). The
  `details.candidates` array lists `{ id, name }`; show it and ask the user to
  pick (re-run with a node id or a narrower glob).
- **`INVALID_PARAMS` "unknown check id(s)"** — a check filter was misspelled;
  `details.unknown` lists them. Show the valid check ids above.
- **`NOT_FOUND`** — the node id or name matched nothing.
- **`WRONG_NODE_TYPE`** — the target doesn't resolve to a component set.
- **`BRIDGE_DISCONNECTED`** — tell the user to open the Tidy DS Toolbox plugin
  in Figma.
