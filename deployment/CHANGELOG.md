# Changelog

All notable changes to the Tidy DS Toolbox will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.17] - 2025-12-03

### Added

- Comprehensive error handling system with `PluginError` and `TimeoutError` classes
- Request timeout protection (30-second default) for all async operations
- Retry logic utility (`withRetry`) for handling transient failures
- Structured logging system with configurable log levels (DEBUG, INFO, WARN, ERROR, NONE)
- Module-specific loggers with automatic prefixes and timestamps
- ESLint configuration with TypeScript and React rules for code quality enforcement
- ESLint integration in CI workflow to catch issues automatically

### Changed

- Consolidated duplicate module handler systems into single source of truth from `moduleRegistry`
- Improved error messages with better formatting and user-friendly display
- Enhanced message handler with structured logging and better type safety
- Logging now auto-enables in development mode for easier debugging
- Error responses now distinguish between recoverable and non-recoverable errors

### Fixed

- Plugin will no longer hang indefinitely on long-running operations
- Eliminated code duplication in module registration reducing maintenance burden
- Better type safety in message handling (replaced `any` with `unknown`)
- Consistent error handling across all plugin modules

### Technical

- ESLint reports 0 errors, 123 warnings (documenting existing technical debt)
- Foundation laid for future improvements in type safety and code quality
- Backward compatible logging API maintained for existing code

## [1.0.16] - 2025-12-03

### Fixed

- Fix for logging functionality

## [1.0.15] - 2025-12-03

### Added

- Implementation for logging functionality

## [1.0.14] - 2025-12-03

### Added

- Comprehensive README covering installation, release workflow, and Google Drive deployment

### Changed

- Release workflow now validates tag vs package.json, bundles only `manifest.json` + `dist/`, and generates clearer release notes
- CI build validation and checksum steps now target `dist/index.html`, matching the Vite output
- Manual Dropbox deploy script replaced with a Google Drive script that auto-detects each contributor's mount path
- Version management relies on `package.json` + git tags (removed manifest `version` field and simplified bump script)

### Fixed

- Ensured release artifacts attach correctly and documentation warns users to download `plugin-bundle.zip`

## [1.0.7] - 2025-12-01

### Fixed

- DS Explorer: Clean property names by removing #ID suffix from display
- CI/CD: Fix release workflow to properly attach plugin-bundle.zip
- CI/CD: Update build validation to use index.html instead of ui.html
- CI/CD: Remove ESLint check (no config present)
- CI/CD: Make CI workflow reusable for release pipeline

### Changed

- Release bundle now only contains manifest.json and dist/ folder
- Enhanced release notes with clear installation instructions

## [1.0.0] - 2025-12-01

### Added

- Initial release of Tidy DS Toolbox
- Component Labels plugin
- DS Explorer plugin
- Sticker Sheet Builder plugin
- Tidy Component Labels plugin
- Tidy Icon Care plugin
- Token Tracker plugin
- Modular plugin architecture with Shell system
