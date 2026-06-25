# Code-as-template for component documentation layout

Layout of a **Documentation Page** is owned by deterministic plugin functions (`buildVariantsSection(content)`, `buildDoDontPair(content)`, …) that emit raw Figma nodes with literal hex/spacing values. The LLM is restricted to producing structured content for named slots; it never positions, sizes, or styles anything.

Three options were on the table:

- **(A) Figma template file** — a library of pre-built Section template components, cloned and filled. Rejected: the template would have to live in a Kido shared library, so instantiating its Chrome inside a *client's* file would link that client's project to Kido (and risk cross-client leakage) — the one linkage the generator must never introduce. A per-project copy avoids the leak but must be maintained everywhere, killing portability.
- **(B) LLM-generated layout** — the model assembles frames/auto-layout each call. Rejected: this is what the earlier cloud-skill attempt did, and layout drifted between documents because the model owned layout.
- **(B′) Code-as-template** — chosen.

The key reframe: *layout predictability is orthogonal to template-vs-generative.* Drift came from **who owned layout** (the LLM), not from generating versus cloning. Moving ownership into fixed code gives Path B's portability with Path A's predictability.

## Consequences

- The **Chrome** of every Section is identical across all documents and all projects by construction, and the tool ships **no Figma library dependency** — so it runs in any client project without dragging Kido assets in. (Specimens are live instances of the source component, which already lives in the current project, so that same-project linkage is fine; the rule is only about not introducing Kido/other-client linkage.)
- The plugin must ship and version a code-template inventory — one builder per Section type. Adding a Section type is a code change, not a Figma-file edit.
- A fixed **content schema** becomes the contract between the content side (LLM/Plan Operation) and the layout side (Execute Operation). Slots must be named and stable.
- **Specimens** (live component instances shown inside Sections) are explicitly *not* governed by this decision — their linkage to the source component is a separate, still-open question.
- Visually rich, bespoke graphics are out of reach without a code change; acceptable because the documentation graphics are simple (cards, text, specimen grids).
