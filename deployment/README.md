# Tidy DS Toolbox

A modular Figma plugin suite for design system management and component workflows.

## 📦 Modules

- **DS Explorer** - Browse and build design system components
- **Component Labels** - Manage component property labels
- **Sticker Sheet Builder** - Generate component sticker sheets
- **Tidy Icon Care** - Icon management and organization
- **Token Tracker** - Track and analyze design tokens

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
- [CI/CD Plan](CI_CD_PLAN.md)
