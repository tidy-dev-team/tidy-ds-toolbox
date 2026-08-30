/// <reference types="@figma/plugin-typings" />

/**
 * Type definitions for Tidy Component Labels plugin
 */

// Label configuration for positioning
export interface LabelConfig {
  top: string;
  left: string;
  secondTop: string;
  secondLeft: string;
  groupSecondTop: boolean;
  groupSecondLeft: boolean;
}

// Position coordinates
export interface Position {
  x: number;
  y: number;
}

// Variant property structure
export interface VariantProperty {
  type: string;
  variantOptions: string[];
  defaultValue: string | boolean;
}

// Message payloads
export interface BuildLabelsPayload {
  labels: LabelConfig;
  spacing: number;
  fontSize: number;
  extractElement: boolean;
  requestId?: string;
}

export interface SettingsPayload {
  spacing?: string;
  fontSize?: string;
  extractElement?: string;
}
