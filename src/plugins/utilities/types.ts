/**
 * Types for the Utilities plugin
 * Contains miscellaneous small utilities with no complex UI
 */

export type UtilitiesAction = "address-note" | "image-wrapper";

export interface UtilityResult {
  success: boolean;
  message: string;
  count?: number;
}
