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

// Plugin settings
export interface PluginSettings {
  spacing: number;
  fontSize: number;
  extractElement: boolean;
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

// Element rows for positioning
export interface ElementRows {
  leftRow: SceneNode[];
  topRow: SceneNode[];
}

// Component dropdown props
export interface DropdownElementProps {
  value: string;
  setValue: (value: string) => void;
  label?: string;
  icon?: {
    color: string;
    symbol: string;
  };
}

// Message payloads
export interface GetVariantPropsPayload {
  requestId?: string;
}

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
