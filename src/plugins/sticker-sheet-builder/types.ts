export type StickerSheetBuilderAction =
  | "init"
  | "load-context"
  | "build-one"
  | "build-all";

export interface StickerSheetBuilderContext {
  selectionValid: boolean;
  stickerSheetExists: boolean;
}

export interface StickerSheetBuilderResponse {
  builtCount?: number;
  context?: StickerSheetBuilderContext;
}

export const STICKER_SHEET_MODULE_ID = "sticker-sheet-builder";
export const STICKER_SHEET_CONTEXT_EVENT = "sticker-sheet-builder:context";

export const DEFAULT_STICKER_SHEET_CONTEXT: StickerSheetBuilderContext = {
  selectionValid: false,
  stickerSheetExists: false,
};
