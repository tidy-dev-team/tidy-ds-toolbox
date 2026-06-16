#!/bin/bash
# Google Drive deployment script for Tidy DS Toolbox
# Can be used standalone or as part of CI/CD pipeline
# Usage: ./scripts/deploy-to-dropbox.sh [version]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
# Optionally override via GOOGLE_DRIVE_PATH env var
DEFAULT_DRIVE_ROOT="$HOME/Library/CloudStorage"
GOOGLE_DRIVE_PATH="${GOOGLE_DRIVE_PATH:-}"
MAX_RELEASES=5

# Get version from argument or package.json
if [ -n "$1" ]; then
  VERSION="$1"
else
  VERSION=$(node -p "require('./package.json').version")
fi

echo -e "${BLUE}=== Google Drive Deployment Script ===${NC}"
echo -e "Version: ${GREEN}$VERSION${NC}"
echo ""

# Find Google Drive mount point
echo -e "${BLUE}🔍 Locating Google Drive...${NC}"

ACTUAL_PATH=""

# Helper to validate candidate path
use_candidate() {
  local candidate="$1"
  if [ -d "$candidate" ]; then
    ACTUAL_PATH="$candidate"
    return 0
  fi
  return 1
}

# 1) Explicit env var wins
if [ -n "$GOOGLE_DRIVE_PATH" ]; then
  use_candidate "$GOOGLE_DRIVE_PATH"
fi

# 2) Scan standard Google Drive mounts
if [ -z "$ACTUAL_PATH" ] && [ -d "$DEFAULT_DRIVE_ROOT" ]; then
  for account_dir in "$DEFAULT_DRIVE_ROOT"/GoogleDrive-*; do
    [ -d "$account_dir" ] || continue
    potential="$account_dir/Shared drives/shared kido/Tidy/plugins"
    if use_candidate "$potential"; then
      break
    fi
  done
fi

if [ -z "$ACTUAL_PATH" ]; then
  echo -e "${RED}Error: Google Drive not found${NC}"
  echo ""
  echo "Google Drive must be mounted at one of these locations:"
  echo "  $DEFAULT_DRIVE_ROOT/GoogleDrive-*/Shared drives/shared kido/Tidy/plugins"
  echo ""
  echo "Set GOOGLE_DRIVE_PATH env var if your mount path differs."
  echo ""
  echo "Make sure:"
  echo "  1. You have Google Drive installed and mounted"
  echo "  2. You have access to 'Shared drives/shared kido'"
  echo "  3. The 'Tidy' folder exists in the shared drive"
  exit 1
fi

echo -e "${GREEN}✅ Found: $ACTUAL_PATH${NC}"
echo ""

# Check if build artifacts exist
if [ ! -d "dist" ] || [ ! -f "manifest.json" ]; then
  echo -e "${RED}Error: Build artifacts not found${NC}"
  echo "Please run 'npm run build' first"
  exit 1
fi

# Create deployment directory
echo -e "${BLUE}📦 Preparing deployment package...${NC}"
rm -rf deployment
mkdir -p deployment
cp manifest.json deployment/
cp -r dist deployment/
[ -f CHANGELOG.md ] && cp CHANGELOG.md deployment/
[ -f README.md ] && cp README.md deployment/

# Calculate checksums
echo -e "${BLUE}🔐 Generating checksums...${NC}"
cd deployment
find . -type f -exec sha256sum {} \; > CHECKSUMS.txt
cd ..

# Deploy to versioned folder
echo -e "${BLUE}📤 Uploading to Google Drive (versioned)...${NC}"
VERSIONED_PATH="$ACTUAL_PATH/releases/v$VERSION"
mkdir -p "$VERSIONED_PATH"
cp -r deployment/* "$VERSIONED_PATH/"

# Deploy to latest folder
echo -e "${BLUE}📤 Updating latest version...${NC}"
LATEST_PATH="$ACTUAL_PATH/Tidy-DS-Toolbox-latest"
rm -rf "$LATEST_PATH"
mkdir -p "$LATEST_PATH"
cp -r deployment/* "$LATEST_PATH/"

# Create version info file
cat > "$LATEST_PATH/VERSION.txt" <<EOF
Version: $VERSION
Build Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Git Commit: $(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
Deployed by: $(git config user.name 2>/dev/null || echo "unknown")
EOF

echo -e "${GREEN}✅ Deployment successful!${NC}"
echo ""
echo "Deployed to:"
echo "  - $VERSIONED_PATH/"
echo "  - $LATEST_PATH/"
echo ""

# ---------------------------------------------------------------------------
# Claude Code plugin (agent surface) — same assembled bundle, Drive fallback
# channel. Designers without GitHub access install this from the synced folder.
# ---------------------------------------------------------------------------
echo -e "${BLUE}🤖 Deploying Claude Code plugin...${NC}"

# Assemble the marketplace tree if it isn't already present.
if [ ! -f "dist-plugin/.claude-plugin/marketplace.json" ]; then
  echo "  Assembling plugin (npm run build:plugin)..."
  npm run build:plugin
fi

# Publish the marketplace tree to a stable path so designers add it once and
# then just re-sync + re-run the installer to update.
CLAUDE_PLUGIN_PATH="$ACTUAL_PATH/claude-plugin-latest"
rm -rf "$CLAUDE_PLUGIN_PATH"
mkdir -p "$CLAUDE_PLUGIN_PATH"
cp -r dist-plugin/. "$CLAUDE_PLUGIN_PATH/"

# Drop the one-click installer beside the marketplace tree. The `.command`
# extension lets macOS designers double-click it from Finder; it self-locates
# the sibling marketplace tree, so the Drive mount path doesn't matter.
cp scripts/install-claude-plugin.sh "$ACTUAL_PATH/Install Tidy DS (Claude Code).command"
chmod +x "$ACTUAL_PATH/Install Tidy DS (Claude Code).command"

echo -e "${GREEN}✅ Claude Code plugin deployed!${NC}"
echo "  - $CLAUDE_PLUGIN_PATH/"
echo "  - $ACTUAL_PATH/Install Tidy DS (Claude Code).command"
echo ""

# Cleanup old releases
echo -e "${BLUE}🗑️  Managing release history...${NC}"
RELEASES_DIR="$ACTUAL_PATH/releases"
if [ -d "$RELEASES_DIR" ]; then
  OLD_RELEASES=$(ls -1d "$RELEASES_DIR"/v* 2>/dev/null | sort -V | head -n -$MAX_RELEASES)
  
  if [ -n "$OLD_RELEASES" ]; then
    echo "Archiving old releases (keeping last $MAX_RELEASES):"
    mkdir -p "$ACTUAL_PATH/archive"
    
    echo "$OLD_RELEASES" | while read -r folder; do
      if [ -d "$folder" ]; then
        FOLDER_NAME=$(basename "$folder")
        echo "  → Moving $FOLDER_NAME to archive/"
        mv "$folder" "$ACTUAL_PATH/archive/$FOLDER_NAME" 2>/dev/null || true
      fi
    done
  else
    echo "No old releases to archive"
  fi
else
  echo "Releases directory not found yet"
fi

# Cleanup local deployment folder
rm -rf deployment

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "Files are now available at:"
echo "  Shared drives > shared kido > Tidy > plugins > latest/"

