export type StickerSheetBuilderAction =
  | "init"
  | "load-context"
  | "build-one"
  | "build-all"
  | "cancel-build"
  | "update-config";

export interface PageMarker {
  id: string;
  name: string;
}

export type GroupingMode = "section" | "page";

export interface StickerSheetConfig {
  selectedPageIds: string[];
  requireDescription: boolean;
  groupingMode: GroupingMode;
}

// Legacy config for migration
export interface LegacyStickerSheetConfig {
  startMarker?: PageMarker | null;
  endMarker?: PageMarker | null;
  requireDescription: boolean;
  groupingMode: GroupingMode;
}

export interface StickerSheetBuilderContext {
  selectionValid: boolean;
  stickerSheetExists: boolean;
  config: StickerSheetConfig;
  availablePages: PageMarker[];
}

export interface StickerSheetBuilderResponse {
  builtCount?: number;
  context?: StickerSheetBuilderContext;
  cancelled?: boolean;
}

export interface BuildProgress {
  current: number;
  total: number;
  currentComponentName: string;
}

export const STICKER_SHEET_MODULE_ID = "sticker-sheet-builder";
export const STICKER_SHEET_CONTEXT_EVENT = "sticker-sheet-builder:context";
export const STICKER_SHEET_PROGRESS_EVENT = "sticker-sheet-builder:progress";
export const STICKER_SHEET_CONFIG_KEY = "stickerSheetConfig";

export const DEFAULT_STICKER_SHEET_CONFIG: StickerSheetConfig = {
  selectedPageIds: [],
  requireDescription: true,
  groupingMode: "section",
};

export const DEFAULT_STICKER_SHEET_CONTEXT: StickerSheetBuilderContext = {
  selectionValid: false,
  stickerSheetExists: false,
  config: DEFAULT_STICKER_SHEET_CONFIG,
  availablePages: [],
};
