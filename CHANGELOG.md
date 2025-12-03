# Changelog

All notable changes to the Tidy DS Toolbox will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
