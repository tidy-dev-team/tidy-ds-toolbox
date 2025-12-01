#!/bin/bash
# Helper script to configure rclone with Dropbox access token
# Usage: DROPBOX_ACCESS_TOKEN=your_token ./scripts/configure-rclone.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔧 Configuring rclone for Dropbox..."

# Check if DROPBOX_ACCESS_TOKEN is set
if [ -z "$DROPBOX_ACCESS_TOKEN" ]; then
  echo -e "${RED}Error: DROPBOX_ACCESS_TOKEN not set${NC}"
  echo ""
  echo "Usage:"
  echo "  DROPBOX_ACCESS_TOKEN=your_token ./scripts/configure-rclone.sh"
  echo ""
  echo "To get a Dropbox access token:"
  echo "  1. Go to https://www.dropbox.com/developers/apps"
  echo "  2. Create a new app or select existing"
  echo "  3. Generate an access token"
  echo "  4. Set it as DROPBOX_ACCESS_TOKEN environment variable"
  exit 1
fi

# Create rclone config directory
mkdir -p ~/.config/rclone

# Create rclone config for Dropbox
cat > ~/.config/rclone/rclone.conf <<EOF
[dropbox]
type = dropbox
token = {"access_token":"$DROPBOX_ACCESS_TOKEN"}
EOF

echo -e "${GREEN}✅ rclone configured successfully${NC}"
echo ""
echo "Test the configuration with:"
echo "  rclone lsd dropbox:"
echo ""
echo "Or list the Figma Plugins folder:"
echo "  rclone lsf dropbox:\"Figma Plugins/\""
