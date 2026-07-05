# Derived facts are re-resolved at build, not carried through the Doc Spec

The **Doc Spec** that `tidy_doc_build_page` consumes carries **authored prose plus symbolic references** to derived facts (axis values like `"Primary"`, mode ids, sibling component names) — never the facts themselves. At build time the Operation **re-derives** the facts from the live source component (variant enumeration, measurements, modes, specimen instances) and validates that every symbolic reference in the spec resolves against them. A reference that does not resolve fails the build with a typed error.

Two options were on the table:

- **(i) Re-resolve at build** — chosen. The skill reads facts via `tidy_doc_read_component`, authors prose keyed to fact identifiers, and `build_page` reads the component again to obtain the actual numbers/instances. The LLM is never the courier of a measurement or variant value.
- **(ii) Trust the courier** — the skill copies facts inline from `read_component` output into the Doc Spec and `build_page` trusts them. Simpler (one read), but the LLM physically carries every number and variant name across the boundary.

## Why

ADR-0007 makes *authored content* a system-enforced property rather than a requested one. The same logic applies to *facts*: consistency you request degrades, consistency you enforce at a boundary holds. Under (ii), Zod can only check a measurement's **shape** (it is a number, within a length cap) — it cannot check its **truth**, so a hallucinated `height: 48` validates cleanly. Under (i), the value the LLM never carries is a value it cannot fake; "the LLM never invents derived facts" becomes a property of the system, not a prompt instruction. `read_component` and `build_page` therefore share one fact-extraction code path (already reusable in the repo: `findAllVariantProps`, `getComponentPropertyInfo`, `absoluteBoundingBox` readers).

## Consequences

- `tidy_doc_build_page` reads the source component a second time (the component is in the bound Session's file — cheap). It is not a pure function of its JSON input; it is a pure function of `(Doc Spec, live component state)`.
- The build must define and validate the symbolic-reference vocabulary per Section (which keys reference an axis value, a mode id, a sibling name).
- **References are bare-by-position; the slot declares the kind.** A reference is the most fake-proof token that is still human-legible, and the resolving slot owns its kind: axis values are bare strings (`"Primary"`, `"Hover"`) resolved against the *categorised* axis for that slot (sticker-sheet `getProps()` buckets), siblings are the **exact component-name string** `read_component` returned (re-resolved by name via `findAllWithCriteria`, rejected if no match), and modes are referenced by **mode id** (what `setExplicitVariableModeForCollection` needs; the human label is re-derived for the Chrome). No reference is self-tagged with its kind — the schema position is. The cost is a small fixed per-slot resolution table, acceptable because the Section catalogue is closed.
- **Resolution failures are reported in a batch, not fail-on-first.** Structural validation runs first and fails fast (Zod, ADR-0007); reference resolution runs second and collects *every* unresolved reference into one typed `OperationError` payload (`unresolved: [{ slot, kind, value, didYouMean? }]`, ADR-0003), with a cheap nearest-match hint since the resolver already holds the full candidate set. The consumer is an LLM authoring the whole spec in one shot with replace-wholesale re-runs, so a complete worklist converges in one round-trip where fail-on-first would take N.
- If the component is edited between `read_component` and `build_page`, the build reflects the **newer** state and may reject prose that referenced a now-deleted variant. Given replace-wholesale rebuilds and cheap re-runs, failing loud and re-authoring is the intended behavior, not a regression.
- This sharpens, but does not replace, ADR-0007: ADR-0007 governs the shape/limits of *authored* slots; this ADR governs how *derived* slots are referenced and verified.
