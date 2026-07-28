---
description: Find components / component sets in the current Figma file via the Tidy DS Toolbox MCP server.
allowed-tools:
  - "mcp__tidy-ds-toolbox__tidy_misprint_find_components"
  - "mcp__plugin_tidy-ds_tidy-ds-toolbox__tidy_misprint_find_components"
  - "mcp__tidy-ds-toolbox__tidy_file_list_pages"
  - "mcp__plugin_tidy-ds_tidy-ds-toolbox__tidy_file_list_pages"
---

Call `tidy_misprint_find_components` to find components in the active Figma file.

User-supplied arguments (may be empty): $ARGUMENTS

Argument parsing rules:
- First positional token is the scope: `file` (default) or `page`.
- If scope is `page`, the second token must be the Figma page id.
  If the user asked for a page but gave a page *name* rather than an id, or gave no id at all, call `tidy_file_list_pages` first and match the name against the returned pages (ambiguous or no match: show the list and ask).
- A token starting with `name=` or `pattern=` (e.g. `pattern=Btn*`) supplies the optional `namePattern` glob.
- If the user wrote a free-form glob without `pattern=`, treat it as the namePattern (e.g. `/tidy-ds:tidy-find file Btn*`).
- A token starting with `limit=` supplies the optional `limit` (1-1000, default 200).
- If no arguments at all, use `{ scope: "file" }`.

`namePattern` is a `*`-only glob, **case-sensitive**, and a pattern with no `*` is an exact match. It filters the response but does not make the scan cheaper.

After the call:
- The response shape is `{ components: { id, name }[], total, truncated, omitted, limit, summary }`.
- Report the `summary` and the count of components.
- Show the first 20 components as a `name — id` list, one per line. If there are more, say so and offer to paginate.
- **If `truncated` is true, say so explicitly** - this is a partial view of the file, not all of it. Report `omitted` and offer the three levers: a narrower `namePattern`, `scope: "page"` (list pages with `tidy_file_list_pages`), or a higher `limit`.
- If the result is non-empty, remind the user the ids can be passed to `/tidy-ds:tidy-misprint` to apply the misprint line.
- On a timeout against a very large file (an icon library), do not just retry the same call; switch to `scope: "page"` via `tidy_file_list_pages`.
- On `BRIDGE_DISCONNECTED`, tell the user to open the Tidy DS Toolbox plugin in Figma.
