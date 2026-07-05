---
name: tidy-doc
description: Generate Figma component documentation pages with the Tidy DS Toolbox tidy-doc Operations. Use when the user asks to document a component, generate component docs, create a Documentation Page, or run tidy-doc.
---

# tidy-doc — orchestrating skill

This skill authors the Doc Spec and drives the two `tidy-doc` Operations:

1. `tidy_doc_read_component` — read live derived facts from the selected/passed Figma component.
2. Author a Doc Spec using only those facts plus Kido editorial prose.
3. `tidy_doc_build_page` — render or replace the Documentation Page.

There is **no mandatory approval gate**. The rendered Figma page is the review surface; the Doc Spec is logged for on-demand inspection and cheap re-runs replace the generated page wholesale.

## Required references

Before authoring, read these files in this skill directory:

- `kido-editorial-standard.md` — voice, tone, length, and wording rules.
- `authoring-rules.md` — per-Section slot rules and never-invent constraints.
- `button-exemplar.md` — worked Button example and calibration notes.

## Trigger phrases

Use this skill for requests like:

- "document this component"
- "generate docs for this button"
- "build a Documentation Page"
- "run tidy-doc"
- `/tidy-ds:tidy-doc`

## Operation flow

1. Parse an optional node id from the user. If absent, rely on current Figma selection.
2. Call `tidy_doc_read_component`.
3. Study the returned facts:
   - `familyAxis`, `stateAxis`, `sizeAxis`, `demoted`, `pinnedDefaults`
   - `breakdown` anatomy facts
   - `modeCollections`
   - `relatedCandidates`
4. Author a Doc Spec:
   - `status` is required. Use user-supplied status if given, otherwise `IDEATION`.
   - Include only Sections with meaningful content and/or derived renderable facts.
   - Keep prose within the schema limits and the editorial standard.
   - Use symbolic references exactly as returned by `read_component`.
5. Print/log the Doc Spec as compact JSON unless the user asked not to.
6. Call `tidy_doc_build_page` with `{ nodeId?, docSpec }`.
7. Report `pageFrameId`, `sourceComponentId`, and any Sections intentionally skipped.

## Never-invent rule

The model may author judgment/prose, but it must never invent derived facts:

- Never invent variant family values, state values, size values, mode ids, measurements, sibling component names, or icon/width/height facts.
- Never copy measurements into the Doc Spec.
- Never create a Do/Don't scenario that requires arbitrary nodes or other components. Drop it instead.
- Never add empty filler just to satisfy a perceived minimum. Minimums are presence-only.

## Re-authoring from unresolved references

If `tidy_doc_build_page` returns `INVALID_PARAMS` with `details.unresolved`:

1. Treat the array as a complete worklist.
2. Fix every unresolved reference in one pass.
3. Prefer each item’s `didYouMean` when present and compatible with the intended meaning.
4. If no compatible real reference exists, drop that Section item/sub-part rather than approximating.
5. Re-run `tidy_doc_build_page` once with the corrected Doc Spec.

## Output style

Keep the user-facing response short:

- One sentence that the page was built/rebuilt.
- `pageFrameId` and `sourceComponentId`.
- Bullet list of Sections included/skipped.
- If a retry happened, mention it and summarize fixed unresolved refs.
