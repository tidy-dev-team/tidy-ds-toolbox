/// <reference types="@figma/plugin-typings" />

// Types for the doc-markers helpers (see README in
// src/plugins/tags-spacings/ for where these came from and why they live
// here instead).

// Supported container node types the marker builders can measure
export type SupportedContainerNode =
  | FrameNode
  | ComponentNode
  | InstanceNode
  | GroupNode;

// Spacing units
export type SpacingUnits = "px" | "rem" | "percent" | "var";

// Spacing/size-marker configuration
export interface SpacingsConfig {
  includeSize: boolean;
  includePaddings: boolean;
  includeItemSpacing: boolean;
  units: SpacingUnits;
  rootSize: number;
  isShallow: boolean;
}
