/// <reference types="@figma/plugin-typings" />

/**
 * Type definitions for the Tidy Color Finder module.
 *
 * Shape mirrors the parent Tidy DS Toolbox module convention: a string-literal
 * action union the handler switches on, plus payload/result interfaces shared
 * between ui.tsx and logic.ts.
 *
 * NOTE: `ColorUsage` and `ColorInventory` are deliberately free of any Figma
 * type so the pure aggregator (utils/inventory.ts) can be unit-tested without a
 * Figma runtime.
 */

export type TidyColorFinderAction = "list-pages" | "scan-colors" | "show-page";

// The four role tables. Gradient/image paints are counted as "other" and
// excluded from the tables. "icon" is detected by layer name (see
// utils/categorize.ts) and wins over background/text for fills only.
export type ColorRole = "background" | "text" | "border" | "icon";

export type ScopeMode =
  | "current-page"
  | "selected-pages"
  | "all-pages"
  | "current-selection";

export interface ScanScope {
  mode: ScopeMode;
  // Page ids, used when mode === "selected-pages".
  pageIds?: string[];
}

export interface ScanOptions {
  includeBackgrounds: boolean;
  includeText: boolean;
  includeBorders: boolean;
  includeIcons: boolean;
  // Drop colors already bound to a variable before aggregating. (Style-only
  // colors are kept — a style is the old way; the goal is variables.)
  skipTokenized: boolean;
  // Descend into the children of component instances.
  lookInsideInstances: boolean;
  // Order each section by hue instead of usage count (issue #3).
  sortByHue?: boolean;
}

// --- list-pages ---

export interface PageInfo {
  id: string;
  name: string;
  isCurrent: boolean;
}

export interface ListPagesResult {
  pages: PageInfo[];
}

// --- scan-colors ---

export interface ScanColorsPayload {
  scope: ScanScope;
  options: ScanOptions;
  requestId?: string;
}

// A container a color is used inside (component set / section / top-level node).
export interface UsageContainer {
  id: string;
  name: string;
  type: string;
}

/**
 * One solid-color usage, fully serializable. This is the seam between the
 * Figma-bound tree walk (utils/scan.ts) and the pure aggregator
 * (utils/inventory.ts).
 */
export interface ColorUsage {
  hex: string; // uppercase "#RRGGBB"
  opacity: number; // 0..1, paint opacity
  role: ColorRole;
  container: UsageContainer;
  // Variable name if the paint is bound to a variable — either directly on the
  // node's paint, or inside the applied color style's paint. Else null.
  variableName: string | null;
  // Applied color style (PaintStyle) name, else null.
  styleName: string | null;
}

export interface BuildInventoryOptions {
  pagesScanned: number;
  // Count of gradient/image/video paints skipped during extraction.
  otherSkipped: number;
  // Max distinct containers listed per color before "and N more".
  whereUsedCap?: number;
  sortByHue?: boolean;
}

export interface HSL {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
}

export interface InventoryColor {
  hex: string;
  opacity: number;
  hsl: HSL;
  count: number;
  variableName: string | null;
  styleName: string | null;
  whereUsed: UsageContainer[]; // capped
  whereUsedOverflow: number; // "and N more" remainder
}

export interface InventorySection {
  role: ColorRole;
  colors: InventoryColor[];
}

export interface InventorySummary {
  pagesScanned: number;
  uniqueTotal: number;
  byRole: Record<ColorRole, number>;
  untokenized: number;
  otherSkipped: number;
}

export interface ColorInventory {
  summary: InventorySummary;
  sections: InventorySection[];
}

// Returned by the scan-colors action once the page has been built. Carries the
// full inventory so the UI can offer client-side actions (e.g. copy as
// markdown) without a round trip.
export interface ScanColorsResult {
  pageId: string;
  pageName: string;
  inventory: ColorInventory;
}

// Progress messages posted to the UI during a scan.
export interface ScanProgress {
  type: "progress";
  payload: {
    pagesScanned: number;
    totalPages: number;
    nodesScanned: number;
  };
}
