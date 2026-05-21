# Handoff — Tidy DS Toolbox agentification

## Where this started

`IDEA.md` asked for three things:

1. Make the plugin more reliable.
2. Make it accessible to AI agents (this is the headline goal).
3. Find inconsistencies and potential problems.

We ran a grilling session (`/grill-with-docs IDEA.md`) and landed an architectural spine. Goal #3 was deliberately scoped *into* goal #2 — agentifying each module will force the inconsistencies into the open.

## What was decided

Captured durably in the repo:

- **`CONTEXT.md`** — domain language: **Operation** (with Query / Plan / Execute flavours), **Module**, **Feature**, **Bridge**, **MCP Server**, **Session**. Plus composition rules.
- **`docs/adr/0001-plan-execute-split-for-operations.md`** — every non-trivial mutating capability is split into a (possibly LLM-driven) Plan Operation and a deterministic Execute Operation. Read-only Query Operations sit alongside.
- **`docs/adr/0002-own-mcp-server-and-bridge.md`** — own MCP server in this repo; plugin connects outbound over websocket. Rejected `figma_execute`-style escape hatches (no LLM-written code on every call) and REST-only (can't reuse Plugin API code).
- **`docs/adr/0003-uniform-error-contract.md`** — single channel, thrown errors with typed `code`. Kills the existing `{ success: false }` discriminator pattern in `utilitiesHandler` and others.
- **`docs/adr/0004-hybrid-operation-discovery.md`** — static catalogue in MCP server + plugin version handshake + typed `UNSUPPORTED_OPERATION` errors. No lockstep release pain.

## MVP scope (chosen by the user)

Two Utilities sub-features, picked because they're already atomic single-action calls:

- **Misprint** → split into a Query Operation `find-components` (params: `{ scope: "file" | "page", pageId?, namePattern? }`, returns `{ ids, summary }`) + an Execute Operation `apply-misprint` (params: `{ nodeIds }`). Code lives at `src/plugins/utilities/utils/misprint.ts`. Already idempotent — `addMisprintToDescription` replaces existing misprint lines (`misprint.ts:29-37`).
- **DS Template** → stays as a parameterless Execute Operation. Designer-acknowledged that running it twice creates duplicate pages, and that's acceptable. Code at `src/plugins/utilities/utils/dsTemplate.ts`.

These prove the patterns; the rest of the modules (Audit, DS Explorer, Tidy Mapper, Sticker Sheet Builder, etc.) come later.

## Open branches the next session should resolve

The user is ready to start building, but these gate the actual implementation:

1. **Schema language** — Zod vs hand-written JSON Schema vs derive-from-TS. (Recommendation to validate: Zod, with `zod-to-json-schema` for MCP tool definitions.)
2. **Long-running Operation protocol** — `code.ts:13-20` already exempts a few Operations from the 30s timeout. The MCP side will need progress/streaming or polling. Decide before any Operation that exceeds 30s gets agentified.
3. **Repo layout** — does the MCP server live in this repo (monorepo with new `mcp-server/` package) or a sibling repo? Recommendation: same repo, easier shared types.
4. **Bridge transport details** — WebSocket framing, reconnect policy, auth model (localhost-only? token? trust-on-first-use?).
5. **Inconsistency pass (IDEA.md goal #3)** — defer until at least Misprint is agentified, then do a deliberate audit of what didn't fit.

## How the user likes to be grilled

Observed during the prior session — useful for any follow-up grill-style work:

- One question at a time, each with a labelled recommendation and clear trade-offs in the alternatives.
- Concrete file/line references in the framing — they react to actual code, not abstractions.
- They will simplify your scope if you over-engineer. (My initial MVP suggestion was Audit + Tidy Mapper; they cut it down to two Utilities sub-features. Trust that instinct.)
- They use the term "skill" loosely (because they're a Claude Code user) — push back on terminology collisions immediately.
- They want "automatic as possible, ask designer only when truly necessary" — i.e. invest in Query Operations so the agent can self-serve context.

## How to continue

The next session is probably implementation, not more grilling. A good first move: design the actual TypeScript types for `Operation`, `OperationResult`, the error-code enum, and the bridge message envelope — then sketch the two Misprint Operations against those types. That'll surface most of the remaining branches above as concrete questions.

If the user invokes another `/grill-with-docs` round, the open branches above are the agenda.

## Quick code map

- `src/code.ts` — plugin main thread, message routing, current 30s timeout + LONG_RUNNING_ACTIONS set.
- `src/moduleRegistry.ts` — manifest of all Modules and their Features (current shape).
- `src/moduleHandlers.ts` — routes messages by `target` to module handlers.
- `src/shared/bridge.ts` — current UI↔plugin postMessage helpers (the *plugin-internal* bridge; not to be confused with the **Bridge** to the MCP server we're designing).
- `src/shared/error-handler.ts` — current `withTimeout`, `formatErrorMessage`, `isRecoverableError`.
- `src/plugins/utilities/` — MVP target.
- `manifest.json` — currently no `networkAccess`. Will need it to add outbound websocket to the MCP server.
