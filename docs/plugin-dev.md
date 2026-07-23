# Claude Code plugin — local development & dogfooding

The Tidy DS agent surface (the `/tidy-*` commands + the MCP server) ships as a
single **Claude Code plugin** named `tidy-ds`. Its canonical source lives in
[`claude-plugin/`](../claude-plugin); the bundled, installable tree is produced
by the assemble step under `dist-plugin/`.

This is the artifact designers receive, so dogfood it the same way they install it.

## Assemble

```bash
npm run build:plugin
```

This bundles the MCP server (`mcp-server/build.js`), copies the canonical
`claude-plugin/` tree, injects `mcp/server.cjs`, syncs the plugin version from
the root `package.json`, writes a marketplace manifest, and runs structural
checks. Output:

```
dist-plugin/                          ← marketplace root
  .claude-plugin/marketplace.json
  tidy-ds/                            ← plugin root
    .claude-plugin/plugin.json        ← version synced
    commands/tidy-*.md
    skills/
    mcp/server.cjs                    ← bundled server
```

## Install from the local path

```
/plugin marketplace add /absolute/path/to/repo/dist-plugin
/plugin install tidy-ds@tidy-ds-marketplace
```

Then `/reload-plugins` (or restart Claude Code). The commands appear namespaced:
`/tidy-ds:tidy-find`, `/tidy-ds:tidy-misprint`, `/tidy-ds:tidy-labels`,
`/tidy-ds:tidy-ds`, `/tidy-ds:tidy-ds-template`, `/tidy-ds:tidy-doc`,
`/tidy-ds:tidy-qa`.

The plugin's MCP server starts automatically; its tools are exposed as
`mcp__plugin_tidy-ds_tidy-ds-toolbox__<operation>`.

> **Port clash while dogfooding:** the bundled server binds the Figma bridge on
> `9876` — the same port the raw-TS dev server (`npm run mcp:server`) uses. Stop
> the standalone dev server before installing the plugin, or only one of them
> will bind the port. Designers only ever run the plugin's server, so this is a
> dev-only concern.

## Manual verification (needs Figma)

A `/tidy-*` round-trip can't run headless — it needs the Tidy DS Toolbox Figma
plugin open and connected over the bridge. To verify end-to-end:

1. Import the Figma plugin from its `manifest.json` (Figma → Plugins →
   Development → Import plugin from manifest) and run it so it connects to the
   bridge on `9876`.
2. In Claude Code (with the plugin installed), run `/tidy-ds:tidy-find` and
   confirm it returns components from the open file.
3. Select a component/component set in Figma and run `/tidy-ds:tidy-doc dry-run=true`
   to confirm the tidy-doc skill can read facts and author a Doc Spec without rendering.
3. On `BRIDGE_DISCONNECTED`, the Figma plugin isn't running — open it.

## Inner loop (no plugin)

For day-to-day server work, run the server straight from TypeScript — no bundle,
no install:

```bash
npm run mcp:server      # raw TS via --experimental-strip-types
npm run mcp:smoketest   # bundle + assert the catalogue is served
```
