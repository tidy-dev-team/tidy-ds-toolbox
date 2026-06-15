# Tidy DS Toolbox

A modular Figma plugin suite for design system management and component workflows.

## 📦 Modules

- **DS Explorer** — Browse and configure design system components
- **Component Labels** — Lay out variant-property labels around a component set
- **Tidy Icon Care** — Icon management and organization
- **Sticker Sheet Builder** — Generate component sticker sheets
- **Tidy Mapper** — Map and swap library components across files
- **Utilities** — Misprint (searchability tagging), Image Wrapper, Address Note, DS Template
- **Audit** — Annotate, generate, and export design-system audit reports
- **Release Notes** — Author and publish release notes for a design system
- **Off-Boarding** — Pack / unpack pages, find bound variables for handoff

## 🚀 Installation

### For Users

1. Download the latest `plugin-bundle.zip` from [Releases](https://github.com/tidy-dev-team/tidy-ds-toolbox/releases)
2. Extract the ZIP file
3. In Figma: **Plugins → Development → Import plugin from manifest...**
4. Select the `manifest.json` file from the extracted folder

**⚠️ Important:** Always download `plugin-bundle.zip` from the Assets section, NOT the source code archives!

## 🛠️ Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Development Scripts

```bash
npm run build:ui      # Build UI (Vite)
npm run build:main    # Build plugin code (esbuild)
npm run typecheck     # Run TypeScript type checking
npm run format        # Format code with Prettier
npm run format:check  # Check code formatting
npm run release:patch # Version bump (patch)
npm run release:minor # Version bump (minor)
npm run release:major # Version bump (major)
npm run release:push  # Push commits and tags
```

## 🤖 AI Agent Access (MCP — Dev Only)

The plugin ships with an MCP server that exposes a curated set of **Operations** (typed Figma actions) to Claude Code and other MCP hosts. This is a development-only surface today — `manifest.json` has `networkAccess.allowedDomains: ["none"]` so production builds get no network, and the dev socket is `ws://localhost:9876` (see [`docs/adr/0005-localhost-bridge-no-auth.md`](docs/adr/0005-localhost-bridge-no-auth.md) for the threat model). Background and vocabulary in [`CONTEXT.md`](CONTEXT.md).

### One-time setup

1. **Add the MCP server to Claude Code** (machine-local scope):

   ```bash
   claude mcp add tidy-ds-toolbox -s local -- \
     node --experimental-strip-types \
     "$(pwd)/mcp-server/src/server.ts"
   ```

   Verify:

   ```bash
   claude mcp list
   # → tidy-ds-toolbox: node --experimental-strip-types … - ✓ Connected
   ```

   Requires Node 22+ (for `--experimental-strip-types`). The path is absolute and machine-specific, which is why we use `-s local` (lives in `~/.claude.json`, not checked in).

2. **Restart Claude Code in this directory** so it picks up the new server. Tools then appear as `mcp__tidy-ds-toolbox__<tool_id>`.

### Order of operations every session

1. Open the plugin in Figma: **Plugins → Development → Tidy DS Toolbox**. The plugin's UI iframe tries to connect to `ws://localhost:9876` and retries with backoff.
2. Start a Claude Code session in this directory (or invoke any tool — Claude spawns the MCP server on first use, which binds the bridge port; the plugin connects within ~250 ms).
3. Call tools from your prompts; results round-trip MCP host → MCP server → Bridge → plugin → Figma and back.

### Exposed tools

| Tool | Kind | What it does |
| --- | --- | --- |
| `tidy_misprint_find_components` | Query | Find components / component sets in the active file. Params: `{ scope: "file" \| "page", pageId?, namePattern? }` (glob, e.g. `Btn*`). Returns `{ components: { id, name }[], summary }`. |
| `tidy_misprint_apply` | Execute | Append/replace a Hebrew-scrambled "misprint" line on each component's description, for searchability. Idempotent; atomic-fails if any id is missing or wrong type. |
| `tidy_ds_template_run` | Execute | Stamp the standard DS Template pages into the file. **Not** idempotent — running twice creates duplicates. Bridge timeout: 120 s. |
| `tidy_component_labels_get_variant_props` | Query | Inspect a component set and return its variant properties (name, options, default). Accepts an explicit `nodeId` or falls back to the current selection. |
| `tidy_component_labels_build` | Execute | Build variant labels around a component set's top and left edges. Accepts an explicit `nodeId` or falls back to the current selection. Validates that each axis references a known variant property; reports `availableProps` on mismatch. Bridge timeout: 120 s. |
| `tidy_ds_explorer_list_components` | Query | List the DS Explorer registry (name + library key + type), optionally filtered by a name glob. Names returned here are the valid inputs to `tidy_ds_explorer_get_component`. |
| `tidy_ds_explorer_get_component` | Query | Import a DS Explorer component by name and return `{ properties, description, nestedInstances }`. Set `includeImage: true` for a base64 PNG preview (heavier — agent-only). Errors `INVALID_PARAMS` with `details.availableNames` on unknown name. Bridge timeout: 60 s. |
| `tidy_ds_explorer_place_set` | Execute | Place a registered component SET onto a page as an editable clone, ready to be labelled by `tidy_component_labels_build`. Defaults to the current page and viewport centre. Returns the new `nodeId`. Errors `WRONG_NODE_TYPE` if the named component is a single component. Bridge timeout: 60 s. |

Query / Plan / Execute are the three Operation flavours from [`ADR-0001`](docs/adr/0001-plan-execute-split-for-operations.md). Lookup via a Query, pass the resulting ids to an Execute.

### Slash commands

Project-scoped wrappers in `.claude/commands/` expand into prompts that drive the tools above. They appear in `/` autocomplete after restarting Claude Code in this directory.

| Slash | What it does |
| --- | --- |
| `/tidy-find [scope] [pageId] [pattern]` | Wraps `tidy_misprint_find_components`. No args → `scope: "file"`. A positional glob (e.g. `Btn*`) is taken as `namePattern`. Renders matches as `name — id`. |
| `/tidy-misprint [ids\|names\|globs…]` | Wraps `tidy_misprint_apply`. Each argument is resolved by shape: `2226:741` → id, `Btn*` → glob, anything else → exact name (find first, then apply). With no args, finds the whole file and asks before applying. |
| `/tidy-ds-template [--force]` | Wraps `tidy_ds_template_run`. Confirms first (since it's not idempotent); `--force` skips the prompt. |
| `/tidy-labels [nodeId] [top=…] [left=…] [secondTop=…] [secondLeft=…] [groupSecondTop=true\|false] [groupSecondLeft=true\|false] [spacing=…] [fontSize=…] [extractElement=true\|false]` | Wraps `tidy_component_labels_get_variant_props` + `tidy_component_labels_build`. With no axis args, surfaces the variant properties and asks how to assign them. |
| `/tidy-ds [name\|glob] [--image] [--place [x=…] [y=…] [pageId=…]]` | Wraps `tidy_ds_explorer_list_components`, `tidy_ds_explorer_get_component`, and `tidy_ds_explorer_place_set`. No args → lists registered names. A glob lists matches. An exact name fetches the component; `--image` adds a PNG preview; `--place` drops a clone of the set onto the page and returns a `nodeId` you can pipe into `/tidy-labels`. |

### Troubleshooting

- **`claude mcp list` shows ✗ Failed** — usually the MCP server crashed on spawn. Run it manually to see stderr: `node --experimental-strip-types mcp-server/src/server.ts`.
- **Tool calls return `BRIDGE_DISCONNECTED`** — the plugin isn't open in Figma, or the file was switched (kills the Session). Open it; calls retry inside a 15 s wait window before failing.
- **Port 9876 already in use** — a leftover server is still bound. `lsof -i :9876 -t | xargs kill`.
- **Manifest validation errors after editing `networkAccess`** — Figma's validator rejects raw IP literals and only accepts `ws://` URLs under `devAllowedDomains`, not `allowedDomains`.

### Smoketest (without a real plugin)

Useful for confirming the MCP layer alone:

```bash
node --experimental-strip-types mcp-server/src/smoketest.ts
```

The smoketest spawns its own server. If the plugin is running, you'll see real component ids come back; without it, you'll see typed `BRIDGE_DISCONNECTED` / `UNSUPPORTED_OPERATION` errors, which is fine.

## 📝 Creating a New Release

### Quick Release Process

1. **Make your changes** and commit using [conventional commits](CONTRIBUTING.md)

2. **Run the version bump script:**

   ```bash
   npm run release:patch   # for bug fixes (1.0.0 → 1.0.1)
   npm run release:minor   # for new features (1.0.0 → 1.1.0)
   npm run release:major   # for breaking changes (1.0.0 → 2.0.0)
   ```

   > Prefer the npm scripts so the repo stays shell-agnostic. They wrap `./scripts/version-bump.sh <type>` if you need to call it directly.

3. **Push with tags:**

   ```bash
   npm run release:push
   ```

4. **Done!** GitHub Actions will automatically:
   - ✅ Run all CI checks (typecheck, format, build validation)
   - ✅ Validate version consistency
   - ✅ Build and package the plugin
   - ✅ Create a GitHub Release with `plugin-bundle.zip`
   - ✅ Generate release notes from changelog

### What the Version Bump Script Does

The script automatically:

- Updates version in `package.json`
- Stages `package.json`, `CHANGELOG.md`, and `README.md` (if present)
- Creates a git commit
- Creates a git tag (e.g., `v1.2.3`)

### Manual Release (Alternative)

If you prefer manual control:

```bash
# 1. Update versions manually in package.json and manifest.json
# 2. Commit changes
git add package.json manifest.json
git commit -m "chore: release v1.2.3"

# 3. Create and push tag
git tag v1.2.3
git push && git push --tags
```

### Version Bump Guidelines

Choose the appropriate version bump based on your changes:

| Change Type             | Version Bump | Command                           | Example       |
| ----------------------- | ------------ | --------------------------------- | ------------- |
| Bug fixes, patches      | **PATCH**    | `./scripts/version-bump.sh patch` | 1.0.0 → 1.0.1 |
| New features, additions | **MINOR**    | `./scripts/version-bump.sh minor` | 1.0.0 → 1.1.0 |
| Breaking changes        | **MAJOR**    | `./scripts/version-bump.sh major` | 1.0.0 → 2.0.0 |

## 🔄 CI/CD Pipeline

### Automated Workflows

**On every push/PR:**

- TypeScript type checking
- Code formatting validation (Prettier)
- Build validation
- Bundle size check

**On version tag push:**

- All CI checks
- Version consistency validation
- Build release artifacts
- Create GitHub Release with plugin bundle
- Attach `plugin-bundle.zip` for distribution
- Manual deployment available via scripts/deploy-to-drive.sh

### Manual Deployment to Google Drive (Optional)

For team distribution via Google Drive:

```bash
# 1. Make sure Google Drive is mounted and synced
# 2. Deploy current build
npm run build
./scripts/deploy-to-drive.sh
```

## 📂 Project Structure

```
├── manifest.json           # Figma plugin manifest
├── package.json           # Node dependencies
├── src/
│   ├── code.ts           # Plugin backend (Figma API)
│   ├── main.tsx          # UI entry point
│   ├── App.tsx           # Main UI component
│   ├── components/       # Shared UI components
│   ├── plugins/          # Individual plugin modules
│   └── shared/           # Shared utilities
├── dist/                 # Build output (gitignored)
├── scripts/              # Automation scripts
└── .github/workflows/    # CI/CD configuration
```

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Conventional commit guidelines
- Code style standards
- Development workflow

## 📋 Release Checklist

Before creating a release:

- [ ] All changes committed with conventional commits
- [ ] Code formatted (`npm run format`)
- [ ] TypeScript passes (`npm run typecheck`)
- [ ] Plugin builds successfully (`npm run build`)
- [ ] Tested in Figma
- [ ] Version bumped appropriately (patch/minor/major)
- [ ] Tag pushed to trigger release

## 🔍 Troubleshooting

### Release Workflow Failed

Check GitHub Actions logs for specific errors:

1. Go to **Actions** tab in GitHub
2. Click on the failed workflow run
3. Review error logs

Common issues:

- **Version mismatch:** Ensure package.json, manifest.json, and git tag all have the same version
- **Format check failed:** Run `npm run format` to fix
- **Build failed:** Check for TypeScript errors with `npm run typecheck`

### Plugin Bundle Not Attached

If `plugin-bundle.zip` is missing from the release:

1. Check that the `build-release` job completed successfully
2. Verify artifacts were uploaded in the workflow logs
3. Ensure you're downloading from the **Assets** section, not source code

## 📄 License

ISC

## 🔗 Links

- [GitHub Repository](https://github.com/tidy-dev-team/tidy-ds-toolbox)
- [Releases](https://github.com/tidy-dev-team/tidy-ds-toolbox/releases)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Domain language (CONTEXT.md)](CONTEXT.md)
- [Architecture decisions (docs/adr/)](docs/adr/)
