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
# Google Drive path - update this to match your actual mounted path
GOOGLE_DRIVE_PATH="$HOME/Library/CloudStorage/GoogleDrive-*/Shared drives/shared kido/Tidy/plugins"
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
ACTUAL_PATH=$(ls -d $GOOGLE_DRIVE_PATH 2>/dev/null | head -1)

if [ -z "$ACTUAL_PATH" ]; then
  echo -e "${RED}Error: Google Drive not found${NC}"
  echo ""
  echo "Google Drive must be mounted at one of these locations:"
  echo "  ~/Library/CloudStorage/GoogleDrive-*/Shared drives/shared kido/Tidy/plugins"
  echo ""
  echo "Make sure:"
  echo "  1. You have Google Drive installed and mounted"
  echo "  2. You have access to 'Shared drives/shared kido'"
  echo "  3. The 'Tidy' folder exists in the shared drive"
  echo ""
  echo "If the path is different, update GOOGLE_DRIVE_PATH in this script."
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
LATEST_PATH="$ACTUAL_PATH/latest"
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

