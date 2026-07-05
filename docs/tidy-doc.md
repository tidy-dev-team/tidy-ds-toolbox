# tidy-doc — generate component documentation pages

`tidy-doc` generates a full Figma Documentation Page for a selected component or component set. It is driven from Claude Code through the Tidy DS Toolbox Claude plugin and the local Figma bridge.

## What it builds

A generated page is a fixed ordered set of Section cards:

1. **Variants** — one family block per type/kind value, with authored prose and state-spanning specimens.
2. **Component Breakdown** — derived anatomy facts: Height, Width, Icon placement.
3. **Mode** — auto-detected variable-mode showcases, crossed and capped at 8.
4. **Usage Guidelines** — when-to-use / when-not-to-use / general bullets plus Do/Don't examples.
5. **Related Components** — selected sibling components from the file-wide candidate scan.

Sections with no useful content or no applicable derived facts are skipped. The output is tool-owned: re-running deletes the previous generated page for that source component and rebuilds it.

## Install / setup

### 1. Build and load the Figma plugin

```bash
npm run build
```

In Figma Desktop:

1. Plugins → Development → Import plugin from manifest.
2. Select this repo's `manifest.json`.
3. Run **Tidy DS Toolbox** in the file that contains the component.
4. Keep the plugin window open so the localhost bridge stays connected.

### 2. Install the Claude Code plugin locally

```bash
npm run build:plugin
```

In Claude Code:

```text
/plugin marketplace add /absolute/path/to/repo/dist-plugin
/plugin install tidy-ds@tidy-ds-marketplace
/reload-plugins
```

The MCP tools are exposed by the bundled server. The slash command is namespaced:

```text
/tidy-ds:tidy-doc
```

## Basic usage

1. Select a `COMPONENT` or `COMPONENT_SET` in Figma.
2. Ensure the Tidy DS Toolbox plugin is open.
3. In Claude Code, run:

```text
/tidy-ds:tidy-doc
```

Claude will:

1. call `tidy_doc_read_component`,
2. author and print a compact Doc Spec,
3. call `tidy_doc_build_page`,
4. report the generated `pageFrameId`.

No separate approval step is required. The rendered Figma page is the review surface.

## Arguments

```text
/tidy-ds:tidy-doc [nodeId] [status=<StatusEnum>] [sections=<list>] [dry-run=true]
```

Examples:

```text
/tidy-ds:tidy-doc
/tidy-ds:tidy-doc 2543:1881 status=REVIEWING
/tidy-ds:tidy-doc sections=variants,breakdown,related
/tidy-ds:tidy-doc dry-run=true
```

### `nodeId`

Optional Figma node id. If omitted, the Operations use the current Figma selection.

### `status`

Optional page status. Allowed values:

- `IDEATION`
- `in process`
- `DESIGN COMPLETED`
- `REVIEWING`
- `DEV HAND-OFF`
- `ON HOLD`
- `CANCELED`
- `LIVE`

Default: `IDEATION`.

### `sections`

Optional comma-list limiting authored Sections:

```text
variants,breakdown,mode,guidelines,related
```

Even when requested, a Section can still be skipped if the component has no derived facts for it.

### `dry-run=true`

Reads facts and authors the Doc Spec, but does not build the Figma page.

Use this to inspect the proposed content before rendering.

## How references work

The Doc Spec never carries measurements or raw derived facts. It carries prose plus symbolic references:

- `variants` keys must match `familyAxis.values` from `read_component`.
- Do/Don't scene `props` must use real axis names and values.
- `related` keys must match `relatedCandidates[].name`.
- Mode showcases are derived automatically from `modeCollections`; the Doc Spec only provides an optional caption.

`tidy_doc_build_page` re-reads the live component and rejects unresolved references in one batched payload with `didYouMean` hints. The skill then re-authors and retries once.

## Editorial rules

The shipped skill includes:

- `claude-plugin/skills/tidy-doc/kido-editorial-standard.md`
- `claude-plugin/skills/tidy-doc/authoring-rules.md`
- `claude-plugin/skills/tidy-doc/button-exemplar.md`

In short:

- keep prose short, practical, and design-system-native;
- never invent variant names, measurements, modes, or sibling names;
- do not add filler to satisfy imagined minimums;
- drop unrepresentable Do/Don't ideas rather than approximating them.

## Troubleshooting

### `BRIDGE_DISCONNECTED`

Open the Tidy DS Toolbox Figma plugin in the file and run the command again.

### `WRONG_NODE_TYPE`

Select a `COMPONENT` or `COMPONENT_SET`, or pass a valid node id.

### Schema validation errors

The authored Doc Spec exceeded a length/count limit or malformed a slot. Shorten/restructure and retry.

### Unresolved references

The component changed or the Doc Spec referenced a non-existent symbolic value. Use the returned `details.unresolved` list and `didYouMean` hints to re-author all broken references in one pass.

## Developer notes

Canonical plugin assets live in `claude-plugin/` and are assembled into `dist-plugin/` by:

```bash
npm run build:plugin
```

The Figma-side implementation lives under `src/plugins/tidy-doc/`. The operation catalogue lives in `mcp-server/src/catalogue.ts`.
