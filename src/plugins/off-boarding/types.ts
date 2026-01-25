/**
 * Types for the Off-Boarding plugin
 * Helps pack/unpack pages for sharing across files
 */

export type OffBoardingAction =
  | "get-pages"
  | "pack-pages"
  | "unpack-pages"
  | "find-bound-variables";

export interface PageInfo {
  id: string;
  name: string;
}

export interface OffBoardingResult {
  success: boolean;
  message: string;
  pages?: PageInfo[];
  count?: number;
}

export interface PackPagesPayload {
  pageIds: string[];
}
