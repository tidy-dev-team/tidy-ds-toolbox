---
description: Find components / component sets in the current Figma file via the Tidy DS Toolbox MCP server.
allowed-tools:
  - "mcp__tidy-ds-toolbox__tidy_misprint_find_components"
  - "mcp__plugin_tidy-ds_tidy-ds-toolbox__tidy_misprint_find_components"
---

Call `tidy_misprint_find_components` to find components in the active Figma file.

User-supplied arguments (may be empty): $ARGUMENTS

Argument parsing rules:
- First positional token is the scope: `file` (default) or `page`.
- If scope is `page`, the second token must be the Figma page id.
- A token starting with `name=` or `pattern=` (e.g. `pattern=Btn*`) supplies the optional `namePattern` glob.
- If the user wrote a free-form glob without `pattern=`, treat it as the namePattern (e.g. `/tidy-ds:tidy-find file Btn*`).
- If no arguments at all, use `{ scope: "file" }`.

After the call:
- The response shape is `{ components: { id, name }[], summary }`.
- Report the `summary` and the count of components.
- Show the first 20 components as a `name — id` list, one per line. If there are more, say so and offer to paginate.
- If the result is non-empty, remind the user the ids can be passed to `/tidy-ds:tidy-misprint` to apply the misprint line.
- On `BRIDGE_DISCONNECTED`, tell the user to open the Tidy DS Toolbox plugin in Figma.
