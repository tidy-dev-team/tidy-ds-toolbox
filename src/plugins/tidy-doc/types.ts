/// <reference types="@figma/plugin-typings" />

// No layout anywhere in this contract (ADR-0010): the panel no longer offers a
// choice, so `set-layout` and the layout field on the context readout are gone
// rather than kept as a channel nothing sends on. `DocLayout` stays a private
// detail of the renderer.

export type TidyDocAction = "get-context" | "document-selection";

export interface GetContextResult {
  fileKey: string | null;
}

export interface DocumentSelectionResult {
  pageFrameId: string;
  sourceComponentId: string;
  sourceComponentName: string;
}

export type { DocSpec, DocStatus } from "./utils/docSpec";
export type { DerivedFacts } from "./utils/facts";
export type { UnresolvedRef } from "./utils/resolveReferences";
