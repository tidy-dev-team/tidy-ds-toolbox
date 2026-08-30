/**
 * Types for the Off-Boarding plugin
 * Helps pack/unpack pages for sharing across files
 */

import { PackPlan, RefusalCode, UnpackPlan } from "./plan";

export type OffBoardingAction =
  | "get-pages"
  // #155: decide first. The plan is what the confirmation dialog shows and what
  // the applier then executes, so the dialog can never describe different work.
  | "plan-pack"
  | "plan-unpack"
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
  // #155: set on a plan-* reply. One of the two is always present: a plan the
  // designer can confirm, or the code naming why the module refused.
  plan?: PackPlan | UnpackPlan;
  refusalCode?: RefusalCode;
  // #167: set when pack-pages was stopped by the designer before finishing.
  // Names what was packed and what wasn't, rather than leaving the designer
  // to infer it from the canvas.
  stopped?: boolean;
  remainingPageNames?: string[];
}

export interface PlanPackPayload {
  pageIds: string[];
}

/** Applying is always applying a plan the designer has seen and confirmed. */
export interface ApplyPackPayload {
  plan: PackPlan;
}

export interface ApplyUnpackPayload {
  plan: UnpackPlan;
}
