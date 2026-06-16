#!/bin/bash
# One-click installer for the Tidy DS Toolbox Claude Code plugin via Google Drive.
#
# This file ships INSIDE the shared Google Drive folder (next to the
# `claude-plugin-latest/` marketplace tree) so designers without GitHub access
# can install the same plugin the GitHub channel produces. It registers the
# Drive-synced directory as a local-path marketplace and installs the plugin;
# re-running it after a Drive re-sync updates to the latest version.
#
# On macOS it can be saved with a `.command` extension and double-clicked from
# Finder. It is self-locating, so it works regardless of where Google Drive is
# mounted.

set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

MARKETPLACE_NAME="tidy-ds-marketplace"
PLUGIN_NAME="tidy-ds"

# Resolve this script's own directory; the marketplace tree sits beside it.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MKT_DIR="$SCRIPT_DIR/claude-plugin-latest"

echo -e "${BLUE}=== Install Tidy DS Toolbox (Claude Code plugin) ===${NC}"

# 1. Preconditions.
if ! command -v claude >/dev/null 2>&1; then
  echo -e "${RED}✗ The 'claude' command was not found.${NC}"
  echo "  Install Claude Code first: https://claude.com/claude-code"
  exit 1
fi
if [ ! -f "$MKT_DIR/.claude-plugin/marketplace.json" ]; then
  echo -e "${RED}✗ Marketplace not found at:${NC} $MKT_DIR"
  echo "  Make sure this installer is run from inside the synced Google Drive"
  echo "  'Tidy/plugins' folder, and that Google Drive has finished syncing."
  exit 1
fi

# 2. Register (or refresh) the local-path marketplace. Adding a marketplace with
#    an existing name replaces it, so a re-sync + re-run picks up new files; if
#    the add is rejected because it already exists, fall back to an update.
echo -e "${BLUE}→ Registering marketplace from Drive…${NC}"
if ! claude plugin marketplace add "$MKT_DIR" --scope user 2>/dev/null; then
  claude plugin marketplace update "$MARKETPLACE_NAME"
fi

# 3. Install (or update to the newly-synced version).
echo -e "${BLUE}→ Installing ${PLUGIN_NAME}…${NC}"
claude plugin install "${PLUGIN_NAME}@${MARKETPLACE_NAME}"

echo ""
echo -e "${GREEN}✅ Installed ${PLUGIN_NAME}.${NC}"
echo ""
echo "Next steps:"
echo "  • The /tidy-ds:* commands are now available in Claude Code."
echo "  • Open the Tidy DS Toolbox plugin in Figma so the commands can reach it."
echo "  • To update later: re-sync this Drive folder, then run this installer again."
echo ""
echo -e "${YELLOW}Fallback:${NC} if your Claude Code version cannot add a local-path"
echo "marketplace, run the MCP server directly instead (no marketplace needed):"
echo "  claude mcp add tidy-ds-toolbox -- node \"$MKT_DIR/$PLUGIN_NAME/mcp/server.cjs\""
echo "(the /tidy-ds:* commands won't be installed in that mode, but the agent"
echo " operations will still be available as mcp__tidy-ds-toolbox__* tools)."
