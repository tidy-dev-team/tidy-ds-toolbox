#!/bin/bash
# Dropbox deployment script for Tidy DS Toolbox
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
BASE_PATH="Figma Plugins/Tidy DS Toolbox"
MAX_RELEASES=5

# Get version from argument or package.json
if [ -n "$1" ]; then
  VERSION="$1"
else
  VERSION=$(node -p "require('./package.json').version")
fi

echo -e "${BLUE}=== Dropbox Deployment Script ===${NC}"
echo -e "Version: ${GREEN}$VERSION${NC}"
echo ""

# Check if rclone is installed
if ! command -v rclone &> /dev/null; then
  echo -e "${YELLOW}rclone not found. Installing...${NC}"
  curl https://rclone.org/install.sh | sudo bash
fi

# Check if rclone is configured for Dropbox
if ! rclone listremotes | grep -q "dropbox:"; then
  echo -e "${RED}Error: rclone not configured for Dropbox${NC}"
  echo ""
  echo "To configure rclone:"
  echo "  1. Run: rclone config"
  echo "  2. Choose 'n' for new remote"
  echo "  3. Name it 'dropbox'"
  echo "  4. Choose type 'dropbox'"
  echo "  5. Follow the authentication steps"
  echo ""
  echo "Or set DROPBOX_ACCESS_TOKEN environment variable and run:"
  echo "  ./scripts/configure-rclone.sh"
  exit 1
fi

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
echo -e "${BLUE}📤 Uploading to Dropbox (versioned)...${NC}"
VERSIONED_PATH="$BASE_PATH/releases/v$VERSION"
rclone copy deployment "dropbox:$VERSIONED_PATH/" -v --progress

# Deploy to latest folder
echo -e "${BLUE}📤 Updating latest version...${NC}"
LATEST_PATH="$BASE_PATH/latest"
rclone sync deployment "dropbox:$LATEST_PATH/" -v --progress

# Create version info file
cat > deployment/VERSION.txt <<EOF
Version: $VERSION
Build Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Git Commit: $(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
EOF

rclone copy deployment/VERSION.txt "dropbox:$LATEST_PATH/" -v

echo -e "${GREEN}✅ Deployment successful!${NC}"
echo ""
echo "Deployed to:"
echo "  - dropbox:$VERSIONED_PATH/"
echo "  - dropbox:$LATEST_PATH/"
echo ""

# Cleanup old releases
echo -e "${BLUE}🗑️  Managing release history...${NC}"
OLD_RELEASES=$(rclone lsf "dropbox:$BASE_PATH/releases/" 2>/dev/null | sort -V | head -n -$MAX_RELEASES)

if [ -n "$OLD_RELEASES" ]; then
  echo "Archiving old releases (keeping last $MAX_RELEASES):"
  echo "$OLD_RELEASES" | while read -r folder; do
    if [ ! -z "$folder" ]; then
      echo "  → Moving $folder to archive/"
      rclone move "dropbox:$BASE_PATH/releases/$folder" "dropbox:$BASE_PATH/archive/$folder" -v
    fi
  done
else
  echo "No old releases to archive"
fi

# Cleanup local deployment folder
rm -rf deployment

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "Users can access the plugin from:"
echo "  Dropbox > Company Shared > $LATEST_PATH"
