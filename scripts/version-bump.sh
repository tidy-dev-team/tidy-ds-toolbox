#!/bin/bash
# Version bump script for Tidy DS Toolbox
# Usage: ./scripts/version-bump.sh patch|minor|major

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if bump type is provided
if [ -z "$1" ]; then
  echo -e "${RED}Error: Version bump type required${NC}"
  echo "Usage: ./scripts/version-bump.sh patch|minor|major"
  echo ""
  echo "Examples:"
  echo "  ./scripts/version-bump.sh patch   # 1.0.0 -> 1.0.1"
  echo "  ./scripts/version-bump.sh minor   # 1.0.0 -> 1.1.0"
  echo "  ./scripts/version-bump.sh major   # 1.0.0 -> 2.0.0"
  exit 1
fi

BUMP_TYPE=$1

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo -e "${RED}Error: Invalid bump type '$BUMP_TYPE'${NC}"
  echo "Must be one of: patch, minor, major"
  exit 1
fi

# Check if working directory is clean
if [[ -n $(git status -s) ]]; then
  echo -e "${YELLOW}Warning: Working directory is not clean${NC}"
  git status -s
  echo ""
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 1
  fi
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}Current version: $CURRENT_VERSION${NC}"

# Bump version in package.json
echo "Bumping version ($BUMP_TYPE)..."
npm version $BUMP_TYPE --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}New version: $NEW_VERSION${NC}"

# Update manifest.json
echo "Updating manifest.json..."
if command -v jq &> /dev/null; then
  jq --arg version "$NEW_VERSION" '.version = $version' manifest.json > tmp.json && mv tmp.json manifest.json
else
  # Fallback to node if jq is not available
  node -e "
    const fs = require('fs');
    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    manifest.version = '$NEW_VERSION';
    fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  "
fi

# Stage changes
echo "Staging changes..."
git add package.json manifest.json

# Create commit
echo "Creating commit..."
git commit -m "chore: release v$NEW_VERSION"

# Create tag
echo "Creating tag..."
git tag "v$NEW_VERSION"

echo ""
echo -e "${GREEN}✅ Version bumped successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review the changes: git show"
echo "  2. Push to remote: git push && git push --tags"
echo "  3. This will trigger the release workflow"
echo ""
echo -e "${YELLOW}Note: To undo this version bump:${NC}"
echo "  git tag -d v$NEW_VERSION"
echo "  git reset --hard HEAD~1"
