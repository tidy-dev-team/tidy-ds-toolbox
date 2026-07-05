/// <reference types="@figma/plugin-typings" />

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
