# Conventional Commits Guide

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification for commit messages. This enables automated changelog generation and semantic versioning.

## Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Type

Must be one of the following:

- **feat**: A new feature (triggers MINOR version bump)
- **fix**: A bug fix (triggers PATCH version bump)
- **docs**: Documentation only changes
- **style**: Changes that don't affect code meaning (whitespace, formatting, etc.)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Code change that improves performance (triggers PATCH version bump)
- **test**: Adding missing tests or correcting existing tests
- **build**: Changes to build system or external dependencies
- **ci**: Changes to CI configuration files and scripts
- **chore**: Other changes that don't modify src or test files

### Scope (Optional)

The scope provides additional context about which part of the codebase is affected:

- **shell**: Changes to the plugin shell/architecture
- **component-labels**: Component Labels module
- **ds-explorer**: DS Explorer module
- **sticker-sheet**: Sticker Sheet Builder module
- **icon-care**: Tidy Icon Care module
- **token-tracker**: Token Tracker module
- **ui**: UI components or styling
- **build**: Build configuration
- **deps**: Dependency updates

### Description

- Use imperative, present tense: "change" not "changed" nor "changes"
- Don't capitalize first letter
- No period (.) at the end
- Keep it concise (under 72 characters)

### Body (Optional)

- Use imperative, present tense
- Include motivation for the change
- Contrast with previous behavior
- Wrap at 72 characters

### Footer (Optional)

- Reference issues: `Fixes #123`, `Closes #456`
- Breaking changes: Start with `BREAKING CHANGE:` (triggers MAJOR version bump)

## Examples

### Feature Addition

```
feat(sticker-sheet): add support for boolean variants

Implement rendering of boolean variant properties in the sticker sheet
builder. This allows users to visualize components with true/false
variant states.

Closes #42
```

### Bug Fix

```
fix(component-labels): prevent duplicate label creation

Check for existing labels before creating new ones to avoid
duplicates when running the plugin multiple times.
```

### Breaking Change

```
feat(shell)!: redesign module registration API

BREAKING CHANGE: Module registration now requires explicit version
declaration. Update all modules to include version field in their
configuration.

Migration guide:
- Add `version: "1.0.0"` to module config
- Update imports to use new `registerModule` function
```

### Documentation

```
docs: update installation instructions

Add steps for importing plugin via manifest URL instead of local file.
```

### Refactoring

```
refactor(ui): extract common form components

Create reusable FormControl and Panel components to reduce code
duplication across module UIs.
```

### Performance Improvement

```
perf(ds-explorer): optimize component search algorithm

Replace linear search with indexed lookup for faster component
discovery in large design systems.
```

### Dependency Update

```
chore(deps): upgrade React to v19

Update React and React DOM to latest stable version for improved
performance and new features.
```

## Version Bumps

Based on commit types:

| Commit Type                                   | Version Bump          | Example                 |
| --------------------------------------------- | --------------------- | ----------------------- |
| feat                                          | MINOR (1.0.0 → 1.1.0) | New features            |
| fix, perf                                     | PATCH (1.0.0 → 1.0.1) | Bug fixes, improvements |
| BREAKING CHANGE                               | MAJOR (1.0.0 → 2.0.0) | Breaking changes        |
| docs, style, refactor, test, build, ci, chore | None                  | No version bump         |

## Using the Version Bump Script

To create a new release:

1. Make your changes and commit with conventional commits
2. Run the version bump script (via npm helper or directly):
   ```bash
   npm run release:patch   # for bug fixes
   npm run release:minor   # for new features
   npm run release:major   # for breaking changes
   ```
   > These commands wrap `./scripts/version-bump.sh <type>` if you prefer calling the shell script directly.
3. Review the changes: `git show`
4. Push to trigger the release: `npm run release:push`

## Tools

Consider using these tools to enforce conventional commits:

- **commitlint**: Lints commit messages
- **commitizen**: Interactive commit message wizard
- **husky**: Git hooks to enforce commit message format
- **standard-version**: Automated versioning and changelog generation

## Resources

- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
