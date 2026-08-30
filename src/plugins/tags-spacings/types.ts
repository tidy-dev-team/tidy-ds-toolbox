/// <reference types="@figma/plugin-typings" />

// This directory is not a plugin module. "Tags & Spacings" was retired (its
// moduleRegistry.ts entry is gone). Its live measurement-marker code - the
// part tidy-doc's Component Breakdown section actually imports - has since
// moved to src/shared/doc-markers/ (see the README in this folder for the
// full story). What is left below is parked types for the rest of the old
// plugin: not dead, just waiting for a home. Do not go looking for a UI;
// there isn't one.

/**
 * Type definitions for the parked parts of Tags & Spacings
 */

import type { SpacingsConfig } from "../../shared/doc-markers/types";

// Available actions for the plugin
export type TagsSpacingsAction =
  | "init"
  | "selection-change"
  | "build-tags"
  | "build-spacings"
  | "build-internal-tools"
  | "delete-internal-tools"
  | "check-internal-tools";

// Tag positioning direction
export type TagDirection = "top" | "right" | "bottom" | "left" | "auto";

// Indexing scheme options
export type IndexingScheme =
  | "alphabetic"
  | "numeric"
  | "geometric"
  | "circled"
  | "extended";

// Tag configuration from UI
export interface TagsConfig {
  tagDirection: TagDirection;
  indexingScheme: IndexingScheme;
  startIndex: string;
  includeInstances: boolean;
  includeText: boolean;
  maxWidth?: number;
}

// Re-exported for parked code that still refers to the spacing config by
// its old name. The type itself now lives in src/shared/doc-markers/types.
export type { SpacingsConfig };

// Combined settings for persistence
export interface TagsSpacingsSettings {
  tags: TagsConfig;
  spacings: SpacingsConfig;
}

// Element data for tag placement
export interface ElementData {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  linkTarget?: string;
  styleName?: string;
  fontName?: FontName;
  fontSize?: number;
  midX: number;
  midY: number;
  index: number;
}

// Tag placement calculation result
export interface TagPlacement {
  direction: Exclude<TagDirection, "auto">;
  x: number;
  y: number;
  width: number;
  height: number;
  stemX: number;
  stemY: number;
  element: ElementData;
  microShift?: { x: number; y: number };
  lengthExtension?: number;
}

// Frame bounds for calculations
export interface FrameBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

// Padding measurements
export interface PaddingMeasurements {
  topPadding: { y: number; size: number };
  rightPadding: { x: number; size: number };
  bottomPadding: { y: number; size: number };
  leftPadding: { x: number; size: number };
}

// Element coordinates and dimensions array item
export type ElementCoordinates = [
  number, // x
  number, // y
  number, // width
  number, // height
  string, // name
  string | null, // linkTarget
  string?, // styleName
  FontName?, // fontName
  number?, // fontSize
];

// Result type for handler responses
export interface TagsSpacingsResult {
  success: boolean;
  message: string;
  count?: number;
}

// Payload types
export interface BuildTagsPayload {
  config: TagsConfig;
}

export interface BuildSpacingsPayload {
  config: SpacingsConfig;
}

// Selection info sent to UI
export interface SelectionInfo {
  hasValidSelection: boolean;
  selectionCount: number;
  selectionType: string;
}

// Internal tools result
export interface InternalToolsResult {
  success: boolean;
  message: string;
  action: "created" | "replaced" | "deleted";
  componentCount?: number;
}

// Payload types for internal tools
export interface BuildInternalToolsPayload {}

export interface DeleteInternalToolsPayload {}

export interface CheckInternalToolsPayload {}

// Internal tools status sent to UI
export interface InternalToolsStatus {
  exists: boolean;
  componentCount: number;
  missingComponents: string[];
  isHealthy: boolean;
}
