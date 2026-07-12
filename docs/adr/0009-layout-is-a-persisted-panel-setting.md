# Documentation Page layout is a persisted panel setting, not a Doc Spec field

A **Documentation Page** can now be built in one of two layouts: **horizontal** (the original left-to-right series of Sections) or **vertical** (a top-to-bottom size-grouped variant matrix, constraints redlines, and a Dos and Don'ts grid). Layout is a **code-owned rendering branch** — one of `"horizontal" | "vertical"` — selected by a setting persisted per Figma client (`figma.clientStorage`) and read once, internally, by the build orchestrator. The **Doc Spec** gains no layout field: the exact same authored spec renders into whichever layout is currently selected.

Two options were on the table:

- **(i) Layout as a persisted panel setting** — chosen. The tidy-doc panel exposes a horizontal/vertical selector; choosing one persists it via a `set-layout` action across the existing typed bridge (`clientStorage` is main-thread only, the panel is the UI thread). The build orchestrator (`buildDocPage`) resolves the persisted value once and branches the root frame's auto-layout direction and which section-assembly routine runs. Both current callers — `tidy_doc_build_page` and the panel's "Document selection" fallback — pass no layout argument and pick up the setting automatically. An explicit override parameter exists for tests and future callers.
- **(ii) Layout as a Doc Spec field** — the skill/agent would pass `layout: "vertical"` alongside the authored content, or a new command argument would select it. Rejected: it conflates a **presentation choice** with the **content contract**. The Doc Spec's whole purpose (ADR-0006, ADR-0008) is to be the layout-agnostic boundary between authored prose/symbolic references and deterministic rendering; adding a layout key there would make the same authored content render differently depending on what the agent happened to pass, undermining the "same spec, same page" guarantee replace-wholesale rebuilds depend on. It would also force every skill invocation to either hardcode or ask about a designer preference that belongs on the panel, not in the prompt.

## Why

The designer, not the agent, owns which shape a documentation page takes for their team's editorial needs — this is a per-project/per-client aesthetic choice, closer to "which theme" than to "what does this component do." Persisting it beside the panel (mirroring the `tidy-icon-care` module's existing `clientStorage` settings pattern) means the choice survives plugin reopens without becoming an argument the skill has to remember, thread through, or ask the user about on every call. Keeping it out of the Doc Spec also reaffirms **ADR-0006 (code-as-template)**: layout ownership stays entirely in deterministic plugin code, never something an agent call can flip mid-build.

## Consequences

- `buildDocPage`'s signature grows one optional parameter (`layoutOverride?: DocLayout`) purely for testability/future callers; both real callers pass nothing.
- The orchestrator's layout-agnostic scaffolding (fact derivation, reference resolution, replace-wholesale find/stamp/placement, the in-flight build guard) is shared unconditionally; only the root frame's direction and which section-assembly routine runs (`assembleHorizontalSections` vs `assembleVerticalSections`) branch on layout. The horizontal path is the moved-verbatim original and has zero behavior change.
- Adding a third layout later is a localized change: a new `DocLayout` variant, a new assembly routine, and one more panel option — the shared scaffolding and the Doc Spec are untouched.
- `tidy_doc_read_component` and the Doc Spec schema are unaffected by this decision; an agent authoring content never needs to know or care which layout is selected.
- The tidy-doc skill's documentation notes that layout is a panel setting the skill does not (and cannot) control via its Operation calls.
