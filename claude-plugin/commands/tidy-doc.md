---
description: Generate a complete component Documentation Page in Figma via tidy-doc read → author Doc Spec → build.
allowed-tools:
  - "mcp__tidy-ds-toolbox__tidy_doc_read_component"
  - "mcp__plugin_tidy-ds_tidy-ds-toolbox__tidy_doc_read_component"
  - "mcp__tidy-ds-toolbox__tidy_doc_build_page"
  - "mcp__plugin_tidy-ds_tidy-ds-toolbox__tidy_doc_build_page"
---

Generate a complete Documentation Page for a selected Figma component or component set.

User-supplied arguments (may be empty): $ARGUMENTS

## Before you start

Use the bundled `tidy-doc` skill instructions. In particular:

- Read `skills/tidy-doc/SKILL.md`.
- Follow `skills/tidy-doc/kido-editorial-standard.md` for voice, tone, and length.
- Follow `skills/tidy-doc/authoring-rules.md` for per-Section slot rules.
- Use `skills/tidy-doc/button-exemplar.md` as the worked exemplar.

## Argument parsing

- First positional token (optional) is a Figma node id matching `^\d+:\d+$`. If absent, the Operations fall back to the current Figma selection.
- Optional `status=<StatusEnum>` sets the page status. If omitted, use `IDEATION` unless the user explicitly tells you a different lifecycle state.
- Optional `sections=<comma-list>` can restrict Sections (`variants,breakdown,mode,guidelines,related`). If absent, author every Section that has meaningful derived facts/content.
- Optional `dry-run=true` means call `tidy_doc_read_component`, author and print the Doc Spec, but do **not** call `tidy_doc_build_page`.

## Flow

1. Call `tidy_doc_read_component` with `{ nodeId }` or `{}`.
2. Author a complete Doc Spec from the returned derived facts. Never invent a variant, mode, measurement, or sibling name. Use only symbolic references returned by `read_component`:
   - `variants` keys from `familyAxis.values`.
   - `related` keys from `relatedCandidates[].name`.
   - Do/Don't `props` axis names/values from the categorised axes (`familyAxis`, `stateAxis`, `sizeAxis`).
   - `mode` carries only an optional caption; mode showcases are derived automatically.
3. Log the Doc Spec in your response in a compact fenced `json` block unless the user asked not to. This is the inspectable plan surface; there is no separate approval gate.
4. Unless `dry-run=true`, call `tidy_doc_build_page` with `{ nodeId?, docSpec }`.
5. Report the returned `pageFrameId` and `sourceComponentId`, and tell the user the rendered page is the review surface. Re-runs replace the generated page wholesale.

## Error handling

- On `BRIDGE_DISCONNECTED`, tell the user to open the Tidy DS Toolbox Figma plugin in the file and run the command again.
- On `WRONG_NODE_TYPE`, tell the user the target must be a `COMPONENT` or `COMPONENT_SET`.
- On `INVALID_PARAMS` with `details.issues`, the Doc Spec failed schema validation. Shorten/restructure prose to fit the schema limits and retry once.
- On `INVALID_PARAMS` with `details.unresolved`, re-author the affected references in one pass using the complete unresolved worklist. Use `didYouMean` hints when present. Then call `tidy_doc_build_page` again with the corrected Doc Spec.
- If a Section would require facts or a scene not representable by the schema, drop that Section/sub-part rather than approximating or fabricating it.
