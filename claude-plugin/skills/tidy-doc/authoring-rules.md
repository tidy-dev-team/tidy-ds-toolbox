# tidy-doc authoring rules

These rules translate `tidy_doc_read_component` facts into a Doc Spec for `tidy_doc_build_page`.

## Envelope

Always author:

```json
{ "status": "IDEATION" }
```

Use a different status only when the user supplies one:

`IDEATION`, `in process`, `DESIGN COMPLETED`, `REVIEWING`, `DEV HAND-OFF`, `ON HOLD`, `CANCELED`, `LIVE`.

Only include optional Section keys when they have meaningful authored content and/or derived renderable facts.

## Variants

Facts used:

- `familyAxis.values` — the only valid `variants` object keys.
- `familyAxis.name === null` with value `"default"` means a single unnamed family.
- `stateAxis.values` tells what state-spanning row will render.
- `pinnedDefaults` explains the non-spanned rest-state conditions.

Authoring:

- Add one entry per family you can describe usefully.
- `description`: what this family is for, not how it is drawn.
- `whenToUse`: optional specific conditions; omit if it would be filler.
- If family is `"default"`, write about the component as a whole.
- Never use size as a variant family; size belongs in Breakdown.

## Component Breakdown

Facts used:

- `breakdown.heights` — size-axis height measurements and Fixed/Hug/Fill state.
- `breakdown.width` — min/max width facts when present.
- `breakdown.iconPlacement` — icon-related component property when detected.

Authoring:

- Include `breakdown` when at least one fact exists and a caption helps interpretation.
- Captions are optional. Do not restate the exact measurement marker.
- If no anatomy facts exist, omit `breakdown`; the builder also drops it if empty.

## Mode

Facts used:

- `modeCollections` — multi-mode variable collections bound to the component.

Authoring:

- Include `mode` only when `modeCollections.length > 0`.
- `caption`: optional; describe what users should compare across modes.
- Do not list every mode in prose; the builder renders the capped cross-product automatically.
- Do not invent or reference mode ids in prose.

## Usage Guidelines

Slots:

- `whenToUse`: positive conditions.
- `whenNotToUse`: negative conditions.
- `general`: broad rules that do not fit the previous two lists.
- `doDonts`: worked examples using source-component instances only.

Authoring:

- Include at least one non-empty sub-part or omit `guidelines`.
- Keep bullets concrete and non-overlapping.
- Author **3–6 Do/Don't pairs** (schema max 6; prefer 4+). Select them from
  `dodont-patterns.md`: apply every archetype pattern the component's axes support,
  then top up from the universal kit. Fewer than 3 is acceptable only when the axes
  genuinely cannot express more.
- Each pair must teach a distinct rule; the good and bad scenes differ in exactly
  the way the `description` names.
- Do/Don't pairs require both `good` and `bad` scenes.
- Each `SpecimenScene` uses 1–4 instances of the source component:

```json
{ "layout": "row", "instances": [{ "props": { "Type": "Primary" }, "labelOverride": "Optional label" }] }
```

Rules:

- `props` axis names and values must exist in the categorised axes returned by `read_component`.
- Use pinned defaults implicitly; only set props needed to show the scenario.
- If the example needs arbitrary nodes, another component, screenshots, custom text blocks, or complex layout, drop it.

## Related Components

Facts used:

- `relatedCandidates[].name` — the only valid `related` object keys.
- Candidate order is the render order.

Authoring:

- Select only genuinely related siblings.
- `guidance`: one sentence explaining when to use the sibling instead of or alongside the source.
- Do not include a sibling just because it was a candidate.
- If no candidate is actually related, omit `related`.

## Handling unresolved references

On a batched unresolved payload:

- `slot: "variants", kind: "familyValue"` — replace/drop an invalid variants key.
- `kind: "axisName"` — fix a Do/Don't scene axis name or drop the scene.
- `kind: "axisValue"` — fix a Do/Don't scene value or drop the scene.
- `slot: "related", kind: "siblingName"` — replace/drop a related key.

Fix all entries in the payload before retrying.
