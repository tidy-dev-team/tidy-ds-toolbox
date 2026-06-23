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

export type TidyColorFinderAction =
  | "list-pages"
  | "scan-colors"
  | "show-page"
  // Extract palette from raster images (issue #46, slices #47–#49):
  //   scan-image-palette:   plugin walks scope, exports image-bearing nodes,
  //                         returns PNG bytes for UI-thread decode + extract.
  //   render-palette-page:  UI sends the extracted palette back; plugin builds
  //                         the dedicated palette page and navigates to it.
  | "scan-image-palette"
  | "render-palette-page";

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

// ===========================================================================
// Extract palette from images (issue #46, slices #47–#49)
// ===========================================================================
//
// A separate round trip: the plugin walks the scope, finds image-bearing
// nodes and exports their rendered PNG (cropped/scaled/composited exactly as
// on canvas); the UI decodes each PNG on a <canvas> and runs the (pure)
// extractor; the resulting palette is handed back to the plugin, which
// renders the dedicated palette page. The cross-thread seam is RGBA bytes
// (UI-bound) and `PaletteColor[]` (figma-free, serializable) — kept free of
// any Figma type so the extractor can be unit-tested without a Figma runtime.

/** A back-link to the source node a color was found inside (palette page). */
export interface SourceNodeRef {
  id: string;
  name: string;
  type: string;
}

/**
 * One flat UI color extracted from raster images. Figma-free (no Paint/Solid
 * types) so the pure extractor in slice 2 can run in any unit-test context.
 * For image extraction `coverage` (0..1 of sampled pixels) stands in for the
 * vector scan's integer `count` — coverage is additive across images, so the
 * same seam serves slice 3's cross-image aggregation.
 */
export interface PaletteColor {
  hex: string; // uppercase "#RRGGBB"
  hsl: HSL;
  coverage: number; // 0..1, fraction of sampled pixels in this color
  foundIn: SourceNodeRef[]; // source nodes the color was found in
}

// --- scan-image-palette (plugin → UI) ---

/** One exported raster image, ready for UI-thread decode. */
export interface ImageExport {
  imageId: string; // unique per exported raster; pairs palette cells to source
  source: SourceNodeRef; // node the image was rendered from
  // Raw PNG bytes. Figma's postMessage is structured-clone, so a Uint8Array
  // crosses the bridge directly — no base64 inflation. The UI reads the true
  // pixel dimensions off the decoded bitmap, so they are not carried here.
  pngBytes: Uint8Array;
}

export interface ScanImagePalettePayload {
  scope: ScanScope;
  // Cap the longest edge of each exported PNG. Aspect ratio is preserved.
  // Larger = better color fidelity at the cost of more decode/sampling time.
  maxLongEdge?: number;
}

export interface ScanImagePaletteResult {
  images: ImageExport[];
  // Nodes that had a visible image fill but could not be exported (zero
  // bounds, export failure, …). Reported in the slice-3 summary.
  skipped: number;
  scopeLabel: string;
  pagesScanned: number;
  totalPages: number;
}

// --- render-palette-page (UI → plugin) ---

export interface PaletteSummary {
  imagesScanned: number;
  // Filled in slice 3; left 0 in slice 1 (naive extractor does not mask).
  photosMasked: number;
  // Nodes carrying a visible image fill that were detected within scope.
  nodesDetected: number;
}

export interface RenderPalettePagePayload {
  palette: PaletteColor[];
  summary: PaletteSummary;
  scopeLabel: string;
}

export interface RenderPalettePageResult {
  pageId: string;
  pageName: string;
}

// Progress messages posted to the UI during image-palette scanning. Extends
// the vector-scan `ScanProgress` with a `phase` field so the UI can render
// distinct export/sampling progress (slice 3). Slice 1 only emits the
// `exporting` phase from the plugin thread.
export interface ScanImageProgress {
  type: "progress";
  payload: {
    phase: "exporting" | "sampling";
    pagesScanned: number;
    totalPages: number;
    imagesExported: number; // exporting: images sent so far
    totalImages: number; // known after the scope walk completes
  };
}
