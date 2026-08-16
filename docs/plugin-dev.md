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

## Reload does not install

This is the one thing to know before editing anything under `claude-plugin/`.

`/reload-plugins` and installing a plugin are **different operations, and only one of them consults the marketplace**:

- **Reload** re-reads whatever already sits in `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`.
  It can never pick up new files, no matter how many times it runs, and it reports cheerful success either way (`Reloaded: 2 plugins · 6 skills · …`).
- **Install / update** re-copies from the marketplace source into the versioned cache directory and rewrites `~/.claude/plugins/installed_plugins.json`.

The secondary detail is that the cache is **keyed on the version string**.
An install at an unchanged version finds the directory already there and leaves it alone, a silent no-op.
So `dist-plugin/` can be perfectly correct, the marketplace can point straight at it, `/reload-plugins` can report success, and the agent still gets a copy that is days old.

That is not hypothetical.
A `1.17.0` cache sat five days stale while every `claude-plugin/` change landed correctly in the repo, and the installed `/tidy-qa` served pre-#118 guidance that told the agent to re-group findings the engine had already grouped.
See [#130](https://github.com/tidy-dev-team/tidy-ds-toolbox/issues/130).

**Do not fix this by bumping the version on every edit.**
That couples every prompt-wording tweak to a release, which is how the drift started.

### Which version is actually installed?

`installed_plugins.json` is the record of truth:

```bash
node -p "Object.entries(require(process.env.HOME+'/.claude/plugins/installed_plugins.json').plugins).map(([k,v])=>k+' → '+v[0].version+' ('+v[0].lastUpdated.slice(0,10)+')').join('\n')"
```

Use it to catch the case that bites hardest: an installed version older than the one `dist-plugin/` now assembles to.
It cannot catch same-version drift, though.
`version` is unchanged by definition in a same-version reinstall, and `gitCommitSha` records the repo HEAD at install time, so it says nothing about uncommitted edits under `claude-plugin/`.
Only a file diff settles that, which is what `npm run verify:plugin` is for.

## Install from the local path

```bash
npm run dogfood:plugin
```

This is the loop to use while developing.
It assembles `dist-plugin/`, **deletes the versioned cache directory** so the install cannot be a no-op, refreshes the marketplace, installs, and then diffs the installed tree against `claude-plugin/`.
No version bump required.
Restart Claude Code (or start a new session) afterwards — see below, because it is not only the command text that is frozen until you do.

### Rebuilding the server is not enough

The two halves of the Bridge do not reload the same way, and the harder one is the less visible one.

The **Figma plugin** reloads when a designer reopens it in Figma. One obvious action, and the loop above already tells you to do it.

The **MCP server** is a process Claude Code spawns when the session starts. Rebuilding it on disk changes nothing about the running process: it keeps serving its own binary until the session restarts. `/reload-plugins` does not restart it either.

So the natural sequence — change code, rebuild, reload the Figma plugin, test — leaves you running new plugin code against an old server, with your plugin-side change working and nothing saying the other half is stale.

That is not hypothetical either.
A session ran three tickets' worth of server changes against a binary from before any of them, and it was only caught because one of those tickets had changed a user-visible string that somebody recognised as the old wording.
See [#189](https://github.com/tidy-dev-team/tidy-ds-toolbox/issues/189).

**How to tell.** Since #189 the plugin announces its build when it connects, and the server logs both versions:

```
[bridge] plugin connected (awaiting version)
[bridge] plugin and server both on 1.17.2
```

A mismatch says so explicitly and names both. A line reading `server is running from raw source` means the raw-TS dev server (`npm run mcp:server`), which has no version to compare. If the `awaiting version` line is followed by nothing at all, the Figma plugin predates #189 and needs rebuilding.

Note that `npm run verify:plugin` does **not** catch this. It checks that `mcp/server.cjs` is present in the installed tree, but it cannot diff it, because the bundled server is injected by the assemble step rather than living in `claude-plugin/`. A stale `server.cjs` in the cache passes verification.

To check the installed copy at any time without reinstalling:

```bash
npm run verify:plugin
```

It exits non-zero and names every drifted file, in both directions: a stale or missing command, and an orphaned one that no longer exists in `claude-plugin/` but is still being served out of the cache.
Reach for it whenever a `/tidy-*` command behaves as if it were reading older instructions than the ones in the repo.
That symptom is nearly always this.

First-time (or manual) install, from inside Claude Code:

```
/plugin marketplace add /absolute/path/to/repo/dist-plugin
/plugin install tidy-ds@tidy-ds-marketplace
```

The commands appear namespaced: `/tidy-ds:tidy-find`, `/tidy-ds:tidy-misprint`,
`/tidy-ds:tidy-labels`, `/tidy-ds:tidy-ds`, `/tidy-ds:tidy-ds-template`,
`/tidy-ds:tidy-doc`, `/tidy-ds:tidy-qa`.

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

0. Run `npm run dogfood:plugin` so the installed commands actually match the
   repo, otherwise you are verifying the wrong text (see **Reload does not
   install** above).
1. Import the Figma plugin from its `manifest.json` (Figma → Plugins →
   Development → Import plugin from manifest) and run it so it connects to the
   bridge on `9876`.
2. In Claude Code (with the plugin installed), run `/tidy-ds:tidy-find` and
   confirm it returns components from the open file.
3. Select a component/component set in Figma and run `/tidy-ds:tidy-doc dry-run=true`
   to confirm the tidy-doc skill can read facts and author a Doc Spec without rendering.
4. Select a component/instance and run `/tidy-ds:tidy-qa --canvas` to confirm the
   checklist frame renders next to it; re-run it to confirm the prior frame is
   replaced rather than duplicated.
5. On `BRIDGE_DISCONNECTED`, the Figma plugin isn't running — open it.

## Inner loop (no plugin)

For day-to-day server work, run the server straight from TypeScript — no bundle,
no install:

```bash
npm run mcp:server      # raw TS via --experimental-strip-types
npm run mcp:smoketest   # bundle + assert the catalogue is served
```
