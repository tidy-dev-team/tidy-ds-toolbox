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

### Component documentation

**Documentation Page**:
The output artifact: a single canvas layout documenting one component (set). Composed of a horizontal series of **Sections**. The generator introduces **no linkage to Kido's shared libraries or other clients' files** — the only external reference it ever creates is to the source component, which lives in the *current* project (acceptable). See [ADR-0006](docs/adr/0006-code-as-template-for-doc-layout.md).

**Section**:
One card within a **Documentation Page** (e.g. Variants, Component Breakdown, Mode, Usage Guidelines, Related Components). Each Section has uniform **Chrome** plus type-specific content (prose, bullet lists, specimen grids, do/don't pairs).

**Chrome**:
The repeating layout scaffolding of a **Section** — card frame, header bar (icon + title + status badge), footer branding, spacing. Owned by deterministic plugin code and emitted with literal values (hex, spacing) so it carries zero company-library linkage. This is what "code-as-template" produces.

**Specimen**:
A rendered display of the documented component placed inside a **Section** (e.g. the variant grid, the do/don't examples, the per-mode showcase). A **live instance of the source component** — the source lives in the current project, so the resulting same-project linkage is acceptable and gives free auto-refresh. Distinct from **Chrome**, which is raw code-generated nodes with no linkage at all.

A **Specimen Scene** (used by Variants, Mode, and Do/Don't) is expressed in the **Doc Spec** with a constrained vocabulary only: one or more source-component instances, each with variant props set and an optional text/label override, in a simple row/stack, plus (for Do/Don't) a good/bad verdict and caption. The vocabulary cannot place arbitrary nodes or other components. A Do/Don't that would need a non-component scene is **dropped, not approximated**.

**Code-as-template**:
The chosen approach where **Section** layout lives in fixed plugin functions (`buildVariantsSection(content)`, …) rather than in a Figma template file or in the LLM. Determinism comes from code constants; the LLM only supplies structured content for named slots.

**Doc Spec**:
The boundary object between the content side and the layout side: one JSON document describing a whole **Documentation Page** — which **Sections** are present and each Section's filled slots (derived facts + authored prose + chosen **Specimen** configurations). Authored by the skill/LLM, so it is human-inspectable *before* layout; it plays the role of the "plan" from [ADR-0001](docs/adr/0001-plan-execute-split-for-operations.md) without needing a separate Plan Operation on the plugin side. Consumed whole, atomically, by the build Operation.

Documentation is a **new Module** (reusing the `sticker-sheet-builder` specimen-grid builders and the `tags-spacings` measurement-marker builders). Its UI is intentionally minimal: Bridge/Session status, bound `fileKey`, a live build log, and one fallback "Document selection" button (designer-driven path, selection as id fallback per [ADR-0001](docs/adr/0001-plan-execute-split-for-operations.md)) — the primary consumer is the Claude skill, not the UI.

The Module exposes exactly two Operations:
- **`tidy_doc_read_component`** (Query) — given the component, returns its structural skeleton (variant axes & values, modes present, measurements, sibling candidates) as ground-truth derived facts.
- **`tidy_doc_build_page`** (Execute) — consumes a complete **Doc Spec** and builds the whole page in one atomic, deterministic pass. Long-running, so it bypasses the 30s op timeout via `isLongRunningAction`.

## Relationships

- A **Module** contains many **Features**.
- A **Module** may expose several **Operations** spanning Query / Plan / Execute categories. The mapping is not necessarily 1:1 with **Features**.
- The **MCP Server** talks to the plugin over the **Bridge**; Claude Code (or any MCP host) talks to the **MCP Server**.

## Composition rules

- **Execute Operations never embed lookup.** If an Operation could be expressed as "find X then apply Y," `find` is a **Query Operation** and `apply` is an **Execute Operation**. The agent (or a wrapping Plan Operation) composes them. Keeps Execute Operations strictly deterministic and makes finders reusable across **Modules**.
- **Execute Operations take explicit IDs.** Selection is a fallback for designer-driven UI calls; agent-driven calls always pass `nodeIds` (or equivalent). See [ADR-0001](docs/adr/0001-plan-execute-split-for-operations.md).
- **A Documentation Page is a fixed, ordered set of Section types** (Variants, Component Breakdown, Mode, Usage Guidelines, Related Components for v1). Sections are never reordered or invented per component. Each Section is emitted only when the component has applicable content (**skip-when-empty**: a flat component skips Variants, a single-theme component skips Mode). See [ADR-0006](docs/adr/0006-code-as-template-for-doc-layout.md).
- **The Documentation Page is a tool-owned, replaceable artifact.** `tidy_doc_build_page` stamps the root frame with plugin data (source component id + a source hash). On re-run it finds the stamped frame, deletes it, and rebuilds fresh in place — never duplicating. Manual designer edits to a generated page are **not** preserved in v1; to curate, detach it out of the tool's path.
- **Mode Section discovery is automatic, crossed, and capped.** `tidy_doc_read_component` enumerates the variable collections the component's bound variables belong to, keeps those with >1 mode, and the Mode Section renders the **cross-product** of their modes — capped at **8 showcases**, dropping (and logging) the remainder. No multi-mode collection → no Mode Section (skip-when-empty). Each showcase is a container frame with `setExplicitVariableModeForCollection(collection, modeId)` pinned, specimen instance inside.
  - Use the **async** variable getters (`getLocalVariableCollectionsAsync`, `getVariableCollectionByIdAsync`) and the `(collection, modeId)` overload, so the Module survives a future `dynamic-page` manifest. **Do not** flip the plugin-wide `documentAccess` for this Module — it would force every other Tidy module onto async page loading. (No variable-mode code exists in the repo today — this is net-new.)
- **No mandatory approval gate.** The skill reads → authors the **Doc Spec** → calls `tidy_doc_build_page` in one flow. The Doc Spec is logged (inspectable on demand), but the *rendered page* is the review surface; cheap idempotent re-runs (replace-wholesale) make "don't like it → run again" the loop.
- **v1 documents only the currently-open file.** The source component lives in the bound **Session**'s file; the **Documentation Page** is written onto the same canvas, next to the component. Cross-file documentation (component in another file via REST) is a deferred fast-follow.
- **Content consistency is enforced, not requested.** The **Doc Spec** is Zod-validated at the MCP boundary with hard per-slot constraints (required slots, max lengths, enums, fixed counts); malformed/over-long content is rejected before layout. Skill-encoded authoring rules + the Button exemplar are soft guidance on top. A Kido editorial standard (voice/tone/length) does not yet exist and is a deliverable of this work. See [ADR-0007](docs/adr/0007-schema-enforced-content-consistency.md).
- **The LLM never invents derived facts.** Section content has three sources: _Derived_ (variant axes/values, mode list, real measurements — **read from Figma via Query Operations**, treated as ground truth), _Authored_ (descriptions, when-to-use, do/don't rationale — written by the LLM), and _Hybrid_ (LLM selects which real siblings/scenarios apply; the candidate set and the specimens themselves come from the file). Derived facts are read before the LLM authors anything, so prose can never name a variant or measurement that does not exist.

## Flagged ambiguities

- "Skill" — the user initially used this to mean an atomic Figma call. Reserved for Claude Code skills only. Use **Operation** for the Figma-side unit.
