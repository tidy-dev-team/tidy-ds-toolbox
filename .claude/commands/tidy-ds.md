---
description: Inspect or place a DS Explorer component (properties, description, nested instances, or a canvas clone of a variant set) via the Tidy DS Toolbox MCP server.
allowed-tools:
  - "mcp__tidy-ds-toolbox__tidy_ds_explorer_list_components"
  - "mcp__tidy-ds-toolbox__tidy_ds_explorer_get_component"
  - "mcp__tidy-ds-toolbox__tidy_ds_explorer_place_set"
---

Inspect or place a design-system component from DS Explorer.

User-supplied arguments (may be empty): $ARGUMENTS

## Argument parsing

- If `$ARGUMENTS` is empty, call `mcp__tidy-ds-toolbox__tidy_ds_explorer_list_components` with `{}` and report the count + first 20 names. Suggest the user pass a name next.
- If `$ARGUMENTS` contains `*`, treat it as a glob and call `tidy_ds_explorer_list_components` with `{ namePattern: <glob> }`. Render matches as `name — key`.
- Otherwise the first token is the exact component name. Then look at the remaining tokens:
  - `--place` → call `mcp__tidy-ds-toolbox__tidy_ds_explorer_place_set` with `{ name }`. Optional `x=<num>` / `y=<num>` / `pageId=<id>` / `localize=<none|detach|styles|full>` tokens become extra params. By default the placed clone is de-linked from Kido-DS (`localize='full'`: nested instances detached into frames + paint/text/effect styles localized); pass `localize=none` to keep the old fully-linked behavior, or `detach`/`styles` for one half only. Variables/tokens always stay bound to Kido-DS. Report the returned `nodeId` and remind the user it can be piped into `/tidy-labels <nodeId>`.
  - `--image` → call `tidy_ds_explorer_get_component` with `{ name, includeImage: true }`.
  - Neither flag → call `tidy_ds_explorer_get_component` with `{ name }`.

## After the get call

- Report: name, key, type, description (or "(no description)"), property list (`name — type, defaultValue`), and nested instances if any.
- If `includeImage` was set, mention that an image was returned (do not inline the base64).

## After the place call

- Report the returned `nodeId`, `name`, `pageId`, and `(x, y)`. Also report `detachedInstances` and `localizedStyles` so the user can see how much was de-linked from Kido-DS.
- Remind the user: pipe `nodeId` into `/tidy-labels <nodeId>` to build variant labels on it.

## Error handling

- On `INVALID_PARAMS` with `details.availableNames`, the name didn't match. Show the closest 5–10 matches from `availableNames` (substring or case-insensitive) and tell the user to retry with one of them.
- On `WRONG_NODE_TYPE` from `place_set`, the named component is a single component (not a set). Suggest using `/tidy-ds <name>` (without `--place`) to inspect it instead.
- On `NOT_FOUND`, the component is registered but Figma failed to import it (likely the library isn't available in this file). Surface the underlying error message.
- On `BRIDGE_DISCONNECTED`, tell the user to open the Tidy DS Toolbox plugin in Figma.
