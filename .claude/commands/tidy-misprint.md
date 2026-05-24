---
description: Apply the searchability "misprint" line to component descriptions. Accepts node ids, names, or globs. With no args, finds first.
allowed-tools:
  - "mcp__tidy-ds-toolbox__tidy_misprint_apply"
  - "mcp__tidy-ds-toolbox__tidy_misprint_find_components"
---

Apply the Tidy DS Toolbox misprint operation to component descriptions.

User-supplied arguments: $ARGUMENTS

## Argument parsing

If `$ARGUMENTS` is empty, run the **whole-file flow** (see below).

Otherwise, split `$ARGUMENTS` on whitespace and commas into tokens. Classify each token:

- **Id** — matches `^\d+:\d+$` (e.g. `2226:741`). Use as-is.
- **Glob** — contains `*` (e.g. `Btn*`, `*Icon*`). Pass as `namePattern` to `tidy_misprint_find_components`.
- **Name** — anything else (e.g. `Zzz`, `Header`). Pass as a literal `namePattern` to `tidy_misprint_find_components` (the glob compiler treats no-`*` strings as exact match).

For every Name and Glob token, call `mcp__tidy-ds-toolbox__tidy_misprint_find_components` with `{ scope: "file", namePattern: <token> }`. Collect ids from the `components` array.

After all tokens are resolved:

- **Per-token failures:**
  - A **Name** token that resolves to 0 components: stop and report the unmatched name; do not apply anything.
  - A **Name** token that resolves to >1 components: list the matches as `name — id`, ASK the user whether to apply to all of them, just one, or cancel.
  - A **Glob** token that resolves to 0 components: warn but continue; the user was explicit about wanting a wildcard.
- **Combine** the resolved ids across all tokens, deduplicated.
- If the final id list is empty, stop and say so.
- Call `mcp__tidy-ds-toolbox__tidy_misprint_apply` with `{ nodeIds: <deduped ids> }`.

## Whole-file flow (empty `$ARGUMENTS`)

1. Call `mcp__tidy-ds-toolbox__tidy_misprint_find_components` with `{ scope: "file" }`.
2. If 0 components, stop and say so.
3. Otherwise summarise the result (count + first ~5 `name — id` rows) and ASK the user to confirm before applying to the full set. Do not auto-apply.
4. On confirmation, call `tidy_misprint_apply` with `nodeIds: components.map(c => c.id)`.

## After the apply call

- On success, report `updated` count and remind the user the operation is idempotent (running again replaces the line in place, no duplicates).
- On `NOT_FOUND` or `WRONG_NODE_TYPE`, surface the typed error and the `details` field (missing or wrongType ids) so the user can fix the input.
- On `BRIDGE_DISCONNECTED`, tell the user to open the Tidy DS Toolbox plugin in Figma.
