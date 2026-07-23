---
description: Run the DS Component QA checklist against a component set via the Tidy DS Toolbox MCP server. Target by node id, name, or glob — or omit to use the current selection. Read-only.
allowed-tools:
  - "mcp__tidy-ds-toolbox__tidy_qa_run"
  - "mcp__plugin_tidy-ds_tidy-ds-toolbox__tidy_qa_run"
---

Run the Tidy DS Toolbox QA checklist (`tidy_qa_run`) against a component set. The
operation is **static** — it never mutates the Figma file, only reports findings.

User-supplied arguments (may be empty): $ARGUMENTS

## Argument parsing

Split `$ARGUMENTS` on whitespace into tokens, then classify each:

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
- `/tidy-ds:tidy-qa` → `{}` (current selection, all checks)
- `/tidy-ds:tidy-qa Button` → `{ name: "Button" }`
- `/tidy-ds:tidy-qa Notification*` → `{ name: "Notification*" }`
- `/tidy-ds:tidy-qa 2625:10445 tokens grid-4px` → `{ nodeId: "2625:10445", checks: ["tokens", "grid-4px"] }`

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

- **`INVALID_PARAMS` "no target and nothing selected"** — the user passed no
  target and nothing is selected in Figma. Ask them to select a component /
  component set / instance, or pass a name or node id.
- **`INVALID_PARAMS` ambiguous** — a name/glob matched more than one set. The
  `details.candidates` array lists `{ id, name }`; show it and ask the user to
  pick (re-run with a node id or a narrower glob).
- **`INVALID_PARAMS` "unknown check id(s)"** — a check filter was misspelled;
  `details.unknown` lists them. Show the valid check ids above.
- **`NOT_FOUND`** — the node id or name matched nothing.
- **`WRONG_NODE_TYPE`** — the target doesn't resolve to a component set.
- **`BRIDGE_DISCONNECTED`** — tell the user to open the Tidy DS Toolbox plugin
  in Figma.
