# Own MCP server + plugin-as-bridge for agent access

The plugin becomes the *execution surface* for an MCP server shipped from this repo (`tidy-ds-mcp` or similar). The plugin (running in Figma) connects outbound to the MCP server over websocket; Claude Code (or any MCP host) talks to the server, which relays typed calls to the plugin. We chose this over piggybacking on figma-console's `figma_execute` (which would mean the LLM writes arbitrary JS on every call — no schemas, no audit trail, no determinism) and over a REST-only approach (which can't reuse the plugin's existing Figma Plugin API code or support arbitrary mutation).

## Consequences

- Every **Operation** is a named MCP tool with a JSON schema for input and output. No "execute arbitrary code" escape hatch.
- The repo grows a second deployable: the MCP server. Versioning between plugin and server becomes a real concern.
- The bridge is owned end-to-end, so the contract survives changes in third-party MCP tooling.
- A precondition for every agent-driven Operation is: Figma desktop (or web) is open, the Tidy DS plugin is running, and the MCP server is reachable from the host.
