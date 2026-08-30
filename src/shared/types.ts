// Shared types for the plugin system

export type PluginID =
  | "ds-explorer"
  | "component-labels"
  | "tidy-icon-care"
  | "sticker-sheet-builder"
  | "tidy-mapper"
  | "utilities"
  | "audit"
  | "release-notes"
  | "off-boarding"
  | "iconfinder"
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
    | "response"
    | "analyze-png"
    | "no-selection"
    | "loading"
    | "usage-event";
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
  // No `handler` here, and do not add one. The manifest is read only by the UI,
  // which reaches a module's backend over postMessage; the main thread resolves
  // handlers itself through `moduleHandlers.ts`, keyed by the same id. Naming a
  // handler here makes `moduleRegistry.ts` import `moduleHandlers.ts`, which
  // pulls every module's `logic.ts`, every `operations.ts`, and the QA engine
  // into the UI bundle - none of which the UI iframe can call.
  settingsSchema?: any;
  keywords?: string[]; // Keywords for search
  features?: PluginFeature[]; // Sub-features within the plugin
  agentified?: boolean; // True if this module exposes operations over MCP / agents
}

export interface ModuleRegistry {
  [key: string]: ModuleManifest;
}
