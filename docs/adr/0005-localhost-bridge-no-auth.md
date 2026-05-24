# Localhost-only Bridge, no auth (MVP)

The MCP server binds the Bridge websocket to `localhost:9876` and accepts any connection that arrives. No token, no trust-on-first-use, no rate limiting. The plugin's `manifest.json` whitelists exactly `ws://localhost:9876` under `networkAccess.devAllowedDomains` (production `allowedDomains` is `"none"` — the agent surface is dev-only for now). Both endpoints use the `localhost` hostname rather than `127.0.0.1` because Figma's manifest validator rejects IP literals as "not a valid URL"; binding the server to the same name avoids IPv4/IPv6 resolution drift.

Considered: TOFU (server binds to the first connection that lands, rejects others) and a shared token pasted into the plugin UI on first launch. Rejected for MVP because this is a single-user dev tool and the simplest thing that works is enough until we expose more dangerous operations or ship to shared machines.

## Threat model accepted

- Any other process on the user's machine can connect to `127.0.0.1:9876` and impersonate the plugin or call operations as the plugin. We accept this because the MVP user is the developer themselves, on their own machine, running a tool they trust.
- Browser tabs cannot reach raw websockets on `127.0.0.1` without same-origin / DNS-rebinding tricks, but those are not ruled out. If we add anything destructive (`figma.root` mutation at scale, file deletion), revisit before shipping.

## Consequences

- Zero auth code in the Bridge for now.
- `manifest.json` `networkAccess` is as narrow as the format allows: one URL.
- Trigger to revisit: shipping to multiple users on shared boxes, exposing destructive Operations, or any report of a local-process attack vector.
