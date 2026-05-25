---
description: Build variant labels around a component set via the Tidy DS Toolbox MCP server.
allowed-tools:
  - "mcp__tidy-ds-toolbox__tidy_component_labels_get_variant_props"
  - "mcp__tidy-ds-toolbox__tidy_component_labels_build"
---

Inspect a component set's variant properties, then optionally build labels on its top and left edges.

User-supplied arguments (may be empty): $ARGUMENTS

## Argument parsing

- First positional token (optional) is a node id matching `^\d+:\d+$`. If absent, the operations fall back to the current Figma selection.
- Remaining tokens of the form `key=value` configure the build:
  - `top=<propName>` / `left=<propName>` / `secondTop=<propName>` / `secondLeft=<propName>` — variant property to label on each axis. Use `none` or omit to skip.
  - `groupSecondTop=true|false` / `groupSecondLeft=true|false` — merge adjacent second-level labels with the same value.
  - `spacing=<number>` / `fontSize=<number>` — pixel spacing and font size (defaults 16 / 12).
  - `extractElement=true|false` — extract the set to a top-level frame after labelling.

## Flow

1. Call `mcp__tidy-ds-toolbox__tidy_component_labels_get_variant_props` with `{ nodeId }` (or `{}` if no id). Surface the available variant properties to the user as `name — options[]`.
2. If the user supplied no axis arguments (no `top=`/`left=`/`secondTop=`/`secondLeft=`), stop here and ASK which variant property to label on which axis. Do not invent label assignments.
3. Otherwise call `mcp__tidy-ds-toolbox__tidy_component_labels_build` with `{ nodeId, labels: { top, left, secondTop, secondLeft, groupSecondTop, groupSecondLeft }, spacing?, fontSize?, extractElement? }`. Treat `none` as empty string `""`.

## After the build call

- On success, report the labelled set (`nodeId` + `name`).
- On `INVALID_PARAMS` with `details.invalid`, list the axes that referenced unknown variant properties and show the `availableProps` returned in `details`.
- On `WRONG_NODE_TYPE`, remind the user that the target must be a component set (`COMPONENT_SET`).
- On `BRIDGE_DISCONNECTED`, tell the user to open the Tidy DS Toolbox plugin in Figma.
