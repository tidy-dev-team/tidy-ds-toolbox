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
  // No `handler` here. A module's backend handler is reached by the *main*
  // thread through `moduleHandlers.ts`, keyed by the same id; the manifest is
  // read only by the UI, which talks to that handler over postMessage and
  // never calls it. Naming it here made `moduleRegistry.ts` import
  // `moduleHandlers.ts`, and with it every module's `logic.ts`, every
  // `operations.ts`, and the whole QA engine - all of it bundled into the UI
  // iframe, which cannot call any of it. The only reader was `moduleLoader.ts`,
  // which nothing imported.
  permissionRequirements: string[];
  settingsSchema?: any;
  keywords?: string[]; // Keywords for search
  features?: PluginFeature[]; // Sub-features within the plugin
  agentified?: boolean; // True if this module exposes operations over MCP / agents
}

export interface ModuleRegistry {
  [key: string]: ModuleManifest;
}
