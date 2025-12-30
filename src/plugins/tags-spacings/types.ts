/// <reference types="@figma/plugin-typings" />

/**
 * Type definitions for Tags & Spacings plugin
 */

// Supported container node types for processing
export type SupportedContainerNode =
  | FrameNode
  | ComponentNode
  | InstanceNode
  | GroupNode;

// Available actions for the plugin
export type TagsSpacingsAction =
  | "init"
  | "selection-change"
  | "build-tags"
  | "build-spacings";

// Tag positioning direction
export type TagDirection = "top" | "right" | "bottom" | "left" | "auto";

// Indexing scheme options
export type IndexingScheme =
  | "alphabetic"
  | "numeric"
  | "geometric"
  | "circled"
  | "extended";

// Spacing units
export type SpacingUnits = "px" | "rem" | "percent" | "var";

// Tag configuration from UI
export interface TagsConfig {
  tagDirection: TagDirection;
  indexingScheme: IndexingScheme;
  startIndex: string;
  includeInstances: boolean;
  includeText: boolean;
  maxWidth?: number;
}

// Spacing configuration from UI
export interface SpacingsConfig {
  includeSize: boolean;
  includePaddings: boolean;
  includeItemSpacing: boolean;
  units: SpacingUnits;
  rootSize: number;
  isShallow: boolean;
}

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
