# Tidy DS Toolbox

A Figma plugin that bundles several Design System maintenance modules (DS Explorer, Component Labels, Tidy Icon Care, Sticker Sheet Builder, Tidy Mapper, Audit, etc.) into a single shell. Being extended to act as an execution surface for AI agents that drive Figma operations on behalf of a designer.

## Language

**Operation**:
A single Figma action exposed to an agent. Discoverable, callable, returns a structured result. Each Operation has a snake_case id prefixed `tidy_` for vendor namespacing (e.g. `tidy_misprint_find_components`); MCP exposes the id verbatim as the tool name. Comes in three flavours:

- **Query Operation** — read-only; returns DS / file / selection state so the agent can plan without asking the designer (e.g. `list-components`, `get-audit-report`).
- **Plan Operation** — takes intent, returns an inspectable JSON plan. May be non-deterministic.
- **Execute Operation** — consumes a plan exactly; same plan in → same diff out.

_Avoid_: Skill (collides with Claude Code skills), Tool (collides with MCP `tool` and the plugin's `Utilities`/IconTool), Action (collides with internal `{ target, action, payload }` message envelope), Command, Capability.

**Bridge**:
The connection between the plugin (running inside Figma) and the **MCP Server**. Plugin opens the connection outbound (websocket) because it cannot accept inbound traffic from the sandboxed iframe.

**MCP Server**:
A Node.js process shipped from this repo. Exposes each **Operation** as an MCP tool with a JSON schema, and relays calls over the **Bridge** to the plugin.

**Session**:
The lifetime of a single **Bridge** connection — bound to one Figma window and one `fileKey`. If the designer switches Figma files or closes the plugin, the Session ends; node IDs and other handles from that Session are no longer valid. The MVP supports exactly one Session at a time and fails fast on switch (typed `file_switched` error to the agent).

**Module**:
A top-level entry in `moduleRegistry.ts` (e.g. DS Explorer, Audit). Contains UI, a backend handler, and zero or more **Features**.

**Feature**:
A named sub-area inside a **Module**, declared in the module's `features` array (e.g. `audit-add-note`, `sticker-sheet-build-all`). Today used for keyword search; likely the natural granularity at which **Operations** will be exposed.

## Relationships

- A **Module** contains many **Features**.
- A **Module** may expose several **Operations** spanning Query / Plan / Execute categories. The mapping is not necessarily 1:1 with **Features**.
- The **MCP Server** talks to the plugin over the **Bridge**; Claude Code (or any MCP host) talks to the **MCP Server**.

## Composition rules

- **Execute Operations never embed lookup.** If an Operation could be expressed as "find X then apply Y," `find` is a **Query Operation** and `apply` is an **Execute Operation**. The agent (or a wrapping Plan Operation) composes them. Keeps Execute Operations strictly deterministic and makes finders reusable across **Modules**.
- **Execute Operations take explicit IDs.** Selection is a fallback for designer-driven UI calls; agent-driven calls always pass `nodeIds` (or equivalent). See [ADR-0001](docs/adr/0001-plan-execute-split-for-operations.md).

## Flagged ambiguities

- "Skill" — the user initially used this to mean an atomic Figma call. Reserved for Claude Code skills only. Use **Operation** for the Figma-side unit.
