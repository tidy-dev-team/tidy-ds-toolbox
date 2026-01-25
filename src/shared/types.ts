// Shared types for the plugin system

export type PluginID =
  | "ds-explorer"
  | "component-labels"
  | "tidy-icon-care"
  | "sticker-sheet-builder"
  | "tidy-mapper"
  | "utilities"
  | "audit"
  | "tags-spacings"
  | "release-notes"
  | "off-boarding"
  | (string & {});

export interface PluginMessage {
  target: PluginID;
  action: string;
  payload?: any;
  requestId?: string;
}

export interface ShellMessage {
  type:
    | "resize"
    | "theme-sync"
    | "settings-update"
    | "module-loaded"
    | "error"
    | "response";
  payload?: any;
  requestId?: string;
  result?: any;
}

// Module state type
export type ModuleState =
  | "stable"
  | "beta"
  | "alpha"
  | "experimental"
  | "deprecated";

// Specific message types for type safety

export interface PluginFeature {
  id: string;
  label: string;
  section?: string; // CSS selector or data attribute for scrolling
  keywords: string[];
}

export interface ModuleManifest {
  id: PluginID;
  label: string;
  state: ModuleState;
  icon: React.ComponentType<any> | string;
  ui: React.ComponentType<any>;
  handler: (action: string, payload: any, figma: any) => Promise<any>;
  permissionRequirements: string[];
  settingsSchema?: any;
  keywords?: string[]; // Keywords for search
  features?: PluginFeature[]; // Sub-features within the plugin
}

export interface ModuleRegistry {
  [key: string]: ModuleManifest;
}
