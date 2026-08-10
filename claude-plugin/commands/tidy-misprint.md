---
description: Write the searchability lines ("Also known as:" plus "misprint") on component descriptions. Accepts node ids, names, or globs. With no args, finds first.
allowed-tools:
  - "mcp__tidy-ds-toolbox__tidy_misprint_apply"
  - "mcp__plugin_tidy-ds_tidy-ds-toolbox__tidy_misprint_apply"
  - "mcp__tidy-ds-toolbox__tidy_misprint_find_components"
  - "mcp__plugin_tidy-ds_tidy-ds-toolbox__tidy_misprint_find_components"
  - "mcp__tidy-ds-toolbox__tidy_file_list_pages"
  - "mcp__plugin_tidy-ds_tidy-ds-toolbox__tidy_file_list_pages"
---

Apply the Tidy DS Toolbox misprint operation to component descriptions.
It writes two lines: `Also known as:` with the component's alternative names, and the Hebrew-scrambled `misprint:` marker.

User-supplied arguments: $ARGUMENTS

## Argument parsing

If `$ARGUMENTS` is empty, run the **whole-file flow** (see below).

Otherwise, split `$ARGUMENTS` on whitespace and commas into tokens. Classify each token:

- **Id** — matches `^\d+:\d+$` (e.g. `2226:741`). Use as-is.
- **Glob** — contains `*` (e.g. `Btn*`, `*Icon*`). Pass as `namePattern` to `tidy_misprint_find_components`.
- **Name** — anything else (e.g. `Zzz`, `Header`). Pass as a literal `namePattern` to `tidy_misprint_find_components` (the glob compiler treats no-`*` strings as exact match).

For every Name and Glob token, call `tidy_misprint_find_components` with `{ scope: "file", namePattern: <token> }`. Collect ids from the `components` array.

**Never treat a truncated find as a complete one.** The find caps its output (default 200) and reports `total`, `truncated` and `omitted`. If `truncated` is true, applying to `components` would silently misprint a subset of what the user asked for. Stop, report `total` and `omitted`, and offer to re-run with a higher `limit` (max 1000) or page by page. Do not apply a partial list without saying so and getting confirmation.

After all tokens are resolved:

- **Per-token failures:**
  - A **Name** token that resolves to 0 components: stop and report the unmatched name; do not apply anything.
  - A **Name** token that resolves to >1 components: list the matches as `name — id`, ASK the user whether to apply to all of them, just one, or cancel.
  - A **Glob** token that resolves to 0 components: warn but continue; the user was explicit about wanting a wildcard.
- **Combine** the resolved ids across all tokens, deduplicated.
- If the final id list is empty, stop and say so.
- Call `tidy_misprint_apply` with `{ nodeIds: <deduped ids> }`.

## Whole-file flow (empty `$ARGUMENTS`)

1. Call `tidy_misprint_find_components` with `{ scope: "file" }`.
2. If 0 components, stop and say so.
3. If `truncated` is true, the file has more components than one pass returns. Report `total`, and ASK whether to raise `limit` (max 1000) or to go page by page (`tidy_file_list_pages` → `scope: "page"`). Never present a capped list as "the file".
4. Otherwise summarise the result (count + first ~5 `name — id` rows) and ASK the user to confirm before applying to the full set. Do not auto-apply.
5. On confirmation, call `tidy_misprint_apply` with `nodeIds: components.map(c => c.id)`.

## After the apply call

- On success, report `updated` count and remind the user the operation is idempotent (running again replaces the misprint line in place and merges the alias line, no duplicates).
- If `withoutAliases` is non-empty, list those names. The alias table (`src/shared/component-aliases.ts`) has no entry for them, so they got no `Also known as:` line and will still fail the QA description row until someone adds them.
- On `NOT_FOUND` or `WRONG_NODE_TYPE`, surface the typed error and the `details` field (missing or wrongType ids) so the user can fix the input.
- On `BRIDGE_DISCONNECTED`, tell the user to open the Tidy DS Toolbox plugin in Figma.
