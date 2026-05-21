# Hybrid Operation discovery + version negotiation

The MCP server ships a static catalogue of Operations (so the agent sees a stable tool list at connect time, even before a designer opens Figma). The plugin announces its version and the set of Operations it actually supports on **Bridge** connection. If the agent invokes an Operation that the connected plugin doesn't support, the server returns a typed `UNSUPPORTED_OPERATION` error. This avoids lockstep releases between the plugin (which goes through the Figma plugin store) and the MCP server (which the team controls directly).

## Consequences

- The MCP server must own a versioned manifest of Operations and their minimum required plugin version.
- The plugin must expose a `handshake` Query Operation (or equivalent on connection) that reports `pluginVersion` + supported Operation IDs.
- When adding a new Operation, the workflow is: add to MCP server catalogue + plugin implementation in the same change, but the *release* of either can ship independently — the typed error gracefully handles either being ahead of the other.
