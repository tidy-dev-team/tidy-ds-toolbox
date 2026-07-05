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
The repeating layout scaffolding of a **Section** — card frame, header bar (icon + title + component-name subtitle + **status badge**), spacing. Owned by deterministic plugin code and emitted with literal values (hex, spacing) so it carries zero company-library linkage. This is what "code-as-template" produces. The **status badge** shows a page-level authored enum (`IDEATION` / `in process` / `DESIGN COMPLETED` / `REVIEWING` / `DEV HAND-OFF` / `ON HOLD` / `CANCELED` / `LIVE`) and is **code-generated** (pill + emoji + label, per-status color/emoji from code constants) — never an instance of the library status component, to preserve zero linkage. v1 ships **no footer/brand** (deferred — see the design doc): a logo asset + per-client branding is out of scope for the single portable build.

**Specimen**:
A rendered display of the documented component placed inside a **Section** (e.g. the variant grid, the do/don't examples, the per-mode showcase). A **live instance of the source component** — the source lives in the current project, so the resulting same-project linkage is acceptable and gives free auto-refresh. Distinct from **Chrome**, which is raw code-generated nodes with no linkage at all.

A **Specimen Scene** (used by Variants, Mode, and Do/Don't) is expressed in the **Doc Spec** with a constrained vocabulary only: one or more source-component instances, each with variant props set and an optional text/label override, in a simple row/stack, plus (for Do/Don't) a good/bad verdict and caption. The vocabulary cannot place arbitrary nodes or other components. A Do/Don't that would need a non-component scene is **dropped, not approximated**.

**Variant Family**:
The unit the **Variants** Section is split into — one block per value of the component's **type/kind axis** (e.g. `Primary`, `Secondary`, `Tertiary`, `Ghost`), each with an authored description, a "When to use" bullet list, and one **Specimen Scene** spanning the **state axis** (all states, in the component's own option order). The family axis and the state axis are **derived by value categorisation** (reusing sticker-sheet's `getProps()` buckets — `Primary/Secondary/…`→type, `Regular/Hover/…`→state, `S/M/L`→size), *not* by axis name, so a "Kind" axis is recognised as well as a "Type" axis. **Size is never a Variants axis** — it is excluded from this Section. A flat component (no type/kind axis) collapses to a single, unnamed family or skips the Section per skip-when-empty. **Ambiguous categorisation never guesses:** if *multiple* axes categorise as type, the family axis is chosen by fixed precedence (axis-name `Type` > `Kind` > `Variant`, then declaration order) and the demotion is logged, the loser folding into the state-spanning scene as a secondary axis; if *no* axis categorises as type (even when several axes exist), it falls back to the single-unnamed-family branch rather than promoting an arbitrary axis to families — manufacturing family names the designer never expressed is a categorical fabrication. `tidy_doc_read_component` surfaces the categorisation result (chosen family axis, demoted axes, buckets) so the author sees what it is authoring against. **Non-spanned axes are pinned to a derived canonical rest-state, never authored:** each state-cell sets family + state and pins every other required prop (size, any demoted type-ish axis, incidental `Icon`/`Loading`-style axes) to the component's `defaultVariant` value if exposed, else the first value in option order. A demoted axis pins to its default too — the scene never expands into a state×axis grid (that would break the row/stack vocabulary). `read_component` reports the pinned defaults so the author and a spec reviewer can see the conditions states are shown under.

**Code-as-template**:
The chosen approach where **Section** layout lives in fixed plugin functions (`buildVariantsSection(content)`, …) rather than in a Figma template file or in the LLM. Determinism comes from code constants; the LLM only supplies structured content for named slots.

**Doc Spec**:
The boundary object between the content side and the layout side: one JSON document describing a whole **Documentation Page** — a fixed-shape object whose keys are the Section types (`variants?`, `breakdown?`, `mode?`, `guidelines?`, `related?`); a Section is present iff its key is present (skip-when-empty), and the fixed order lives in code, so a reordered or duplicated page is **unrepresentable**. Each Section's value holds **authored prose + symbolic references to derived facts** (axis values, mode ids, sibling names) — *not* the facts themselves. `tidy_doc_build_page` **re-derives** the facts from the live component and validates that every symbolic reference resolves, so the LLM carries no measurement or variant value and cannot inject a fake one. Authored by the skill/LLM, so it is human-inspectable *before* layout; it plays the role of the "plan" from [ADR-0001](docs/adr/0001-plan-execute-split-for-operations.md) without needing a separate Plan Operation on the plugin side. Consumed whole, atomically, by the build Operation. See [ADR-0008](docs/adr/0008-facts-re-resolved-at-build.md).

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
  - **Replace-wholesale identifies own output by plugin data, never by name or position.** The page root frame is stamped with `setPluginData` (`tidy:doc-page` = `{ version, sourceComponentId, builtAt }`) — that marker is the identity of record. A rebuild does `findAll` for root frames whose `sourceComponentId` matches *this* source, deletes them, then builds fresh; scoped per source component, so documenting one component never touches another's page. Zero matches → first build; >1 match (e.g. a copy-pasted page duped the marker) → delete all and rebuild one, logging the cleanup. Name and position are display only — a designer may freely rename/move the page between runs without breaking idempotency or risking hand-made content nearby. **A generated page is owned output: designer edits inside it are replaced on rebuild** (edits belong in the source component or the Doc Spec, not the rendered page). Placement is a derived offset next to the source, independent of identity, so a moved-then-rebuilt page returns to the anchor.
- **Component Breakdown is a fixed catalogue of derived anatomy sub-sections, skip-when-empty.** The top-level Section rule applied one level down: a fixed, ordered set of anatomy builders (v1: **Height**, **Width**, **Icon placement**; Padding/Inner-spacing are a documented fast-follow since `tags-spacings` already measures them), each emitted only when the component exposes the relevant fact. Measurements are _Derived_ (`node.height` per size variant + `layoutSizingVertical` → "Fixed/Hug/Fill", `minWidth`/`maxWidth`, icon-variant detection); each sub-section carries an _optional_ authored caption. **Size lives here, not in Variants:** the Height sub-section enumerates the size axis, which is why Variants (Q3) excludes size. Markers are code-generated (`tags-spacings` builders), never Kido helper instances (ADR-0006).
- **Related-component candidates are derived by a file-wide token-overlap scan.** `tidy_doc_read_component` runs `findAllWithCriteria(['COMPONENT_SET','COMPONENT'])` over the current file and keeps components whose name shares the source's distinctive name token (e.g. source "Button" → "Icon Button", "Link Button", "Severity Button" — token-**containment**, not prefix), returning a capped, ranked candidate list. It **excludes** the source set + its own variants and the source's building-blocks (components appearing as nested instances inside it, found via the `findExposedInstances`/`getMainComponentAsync` walk). The candidate set is _Derived_; which candidates are genuinely related and the "use X when" guidance are _Authored_ (Hybrid, per the facts-vs-judgment rule). `tidy_doc_build_page` renders a **Specimen** of each selected sibling and rejects (per ADR-0008) any that does not resolve to a real component. No dependency on the Kido-specific `ds-explorer` registry, so it works in any client file.
- **v1 documents only the currently-open file.** The source component lives in the bound **Session**'s file; the **Documentation Page** is written onto the same canvas, next to the component. Cross-file documentation (component in another file via REST) is a deferred fast-follow.
- **Content consistency is enforced, not requested.** The **Doc Spec** is Zod-validated at the MCP boundary with hard per-slot constraints; malformed/over-long content is rejected before layout. Skill-encoded authoring rules + the Button exemplar are soft guidance on top. A Kido editorial standard (voice/tone/length) does not yet exist and is a deliverable of this work. See [ADR-0007](docs/adr/0007-schema-enforced-content-consistency.md).
  - **Constraints are asymmetric (no induced filler).** _Maximums_ are hard and universal (max length per slot, max item count), derived from the example doc. _Minimums_ are **presence-only**: a slot is required or optional (the example marks Breakdown captions "Description (optional)"), and a *present* list slot needs only ≥1 item — never a forced higher count. Forcing a minimum count would make the model invent filler, violating the never-invent spirit as surely as a fake fact. A Section/sub-section with neither derived nor worth-authoring content is **skipped, not padded**.
- **The LLM never invents derived facts.** Section content has three sources: _Derived_ (variant axes/values, mode list, real measurements — **read from Figma via Query Operations**, treated as ground truth), _Authored_ (descriptions, when-to-use, do/don't rationale — written by the LLM), and _Hybrid_ (LLM selects which real siblings/scenarios apply; the candidate set and the specimens themselves come from the file). Derived facts are read before the LLM authors anything, so prose can never name a variant or measurement that does not exist. **Enforced, not trusted:** the Doc Spec carries only *symbolic references* to derived facts; `tidy_doc_build_page` re-derives the facts from the live component at build time and rejects (typed error) any reference that does not resolve. The LLM never carries a measurement or variant value through the boundary. See [ADR-0008](docs/adr/0008-facts-re-resolved-at-build.md).

## Flagged ambiguities

- "Skill" — the user initially used this to mean an atomic Figma call. Reserved for Claude Code skills only. Use **Operation** for the Figma-side unit.
