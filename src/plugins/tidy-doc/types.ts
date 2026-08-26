/// <reference types="@figma/plugin-typings" />

// No module-action contract here any more, and no layout in it either.
//
// Layout went first (ADR-0010): the panel stopped offering a choice, so
// `set-layout` and the layout field on the context readout were removed rather
// than kept as a channel nothing sends on. `DocLayout` stays a private detail
// of the renderer.
//
// Then the panel itself went. Documentation is always initiated from Claude, so
// the module has no UI and no handler - `get-context` and `document-selection`
// existed only to back the tab and its fallback button, and both are gone with
// it. What is left of tidy-doc is reached through its Operations, whose shapes
// live in `operations.ts` and `utils/docSpec.ts`, not here.
//
// The re-exports below stay because they are the module's vocabulary, used by
// the Operations and by the builders.

export type { DocSpec, DocStatus } from "./utils/docSpec";
export type { DerivedFacts } from "./utils/facts";
export type { UnresolvedRef } from "./utils/resolveReferences";
