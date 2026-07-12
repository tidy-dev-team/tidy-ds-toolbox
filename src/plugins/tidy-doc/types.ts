/// <reference types="@figma/plugin-typings" />

import type { DocLayout } from "./utils/docLayout";

export type TidyDocAction = "get-context" | "document-selection" | "set-layout";

export interface GetContextResult {
  fileKey: string | null;
  layout: DocLayout;
}

export interface DocumentSelectionResult {
  pageFrameId: string;
  sourceComponentId: string;
  sourceComponentName: string;
}

export interface SetLayoutPayload {
  layout: DocLayout;
}

export interface SetLayoutResult {
  layout: DocLayout;
}

export type { DocSpec, DocStatus } from "./utils/docSpec";
export type { DerivedFacts } from "./utils/facts";
export type { UnresolvedRef } from "./utils/resolveReferences";
export type { DocLayout } from "./utils/docLayout";
