/**
 * Types for the Off-Boarding plugin
 * Helps pack/unpack pages for sharing across files
 */

export type OffBoardingAction =
  | "get-pages"
  | "pack-pages"
  | "unpack-pages"
  | "find-bound-variables"
  | "find-hidden-styles"
  // #167: stops an in-flight pack-pages run between pages.
  | "cancel-pack";

export interface PageInfo {
  id: string;
  name: string;
}

export interface OffBoardingResult {
  success: boolean;
  message: string;
  pages?: PageInfo[];
  count?: number;
  // #167: set when pack-pages was stopped by the designer before finishing.
  // Names what was packed and what wasn't, rather than leaving the designer
  // to infer it from the canvas.
  stopped?: boolean;
  packedPageNames?: string[];
  remainingPageNames?: string[];
}

export interface PackPagesPayload {
  pageIds: string[];
}
