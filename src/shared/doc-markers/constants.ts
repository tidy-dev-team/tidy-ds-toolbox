/// <reference types="@figma/plugin-typings" />

/**
 * Constants for Tags & Spacings plugin
 */

// Internal tools page name
export const INTERNAL_TOOLS_PAGE = "⚙️ Internal tools";

// Component names in internal tools
export const DS_ANATOMY_TAGS = ".DS anatomy tags";
export const DS_SIZE_MARKER = ".DS-size-marker";
export const DS_SPACING_MARKER = ".DS-spacing-marker";

// Tag positioning constants
export const TAG_DISTANCE_FROM_OBJECT = 2;
export const TAG_MICRO_SHIFT = 20;
export const TAG_LENGTH_EXTENSION = 15;
export const COLLISION_THRESHOLD = 30;
export const BASE_TAG_SIZE = 24;
export const EXTENSION_LENGTH = 64;

// Accepted node types for selection
export const ACCEPTED_TYPES: NodeType[] = ["FRAME", "INSTANCE", "COMPONENT"];

// Indexing schemes
export const NUMERIC_INDEXES = "0123456789";
export const ALPHABETIC_LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
export const ALPHABETIC_UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const GEOMETRIC_SHAPES = "●○■□▲△▼▽◆◇◊★☆✦✧✩✪✫✬✭✮✯";
export const CIRCLED_NUMBERS =
  "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿";

// Extended character set for large component sets
export const EXTENDED_ABC =
  "abcdefghijklmnopqrstuvwxyz" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
  "0123456789" +
  "αβγδεζηθικλμνξοπρστυφχψω" +
  "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ" +
  "♠♣♥♦" +
  "●○■□▲△▼▽◆◇◊" +
  "★☆✦✧✩✪✫✬✭✮✯" +
  "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

// Index scheme mapping
export const INDEX_SCHEMES: Record<string, string> = {
  alphabetic: ALPHABETIC_LOWERCASE,
  numeric: NUMERIC_INDEXES,
  geometric: GEOMETRIC_SHAPES,
  circled: CIRCLED_NUMBERS,
  extended: EXTENDED_ABC,
};

// Default settings
export const DEFAULT_TAGS_CONFIG = {
  tagDirection: "auto" as const,
  indexingScheme: "alphabetic" as const,
  startIndex: "a",
  includeInstances: true,
  includeText: true,
  maxWidth: 0,
};

export const DEFAULT_SPACINGS_CONFIG = {
  includeSize: true,
  includePaddings: true,
  includeItemSpacing: true,
  units: "px" as const,
  rootSize: 16,
  isShallow: true,
};
