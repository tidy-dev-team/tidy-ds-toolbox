# Uniform error contract for Operations

Every Operation reports failure on exactly one channel: a thrown error carrying a typed `code` (e.g. `INVALID_INPUT`, `NO_TARGETS`, `FILE_SWITCHED`, `FIGMA_ERROR`, `TIMEOUT`) and a human-readable `message`. The success path always returns the Operation's result body and never a `{ success: false }` discriminator. The MCP server maps codes to MCP error responses; the plugin shell maps the same codes to designer notifications.

## Consequences

- Existing handlers that return `{ success: false, message }` (e.g. `utilitiesHandler` in `src/plugins/utilities/logic.ts`, several others) need to be refactored to throw typed errors. This is part of agentification work, not a separate cleanup.
- The current `{ type: 'error', requestId, error }` envelope in `code.ts` becomes the *only* failure path. The `{ success: false }` branch through the success envelope is removed.
- Agent loops can rely on standard MCP error semantics — no per-Operation result-shape sniffing.
- A central error-code enum needs to live in shared types so both the plugin and the MCP server reference the same source of truth.
