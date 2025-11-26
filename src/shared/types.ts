// Shared types for the plugin system

export type PluginID = "dashboard" | "shape-shifter" | "text-master" | "color-lab" | (string & {})

export interface PluginMessage {
  target: PluginID
  action: string
  payload?: any
  requestId?: string
}

export interface ShellMessage {
  type: "resize" | "theme-sync" | "settings-update" | "module-loaded" | "error"
  payload?: any
}

// Specific message types for type safety
export interface ShapeShifterMessage extends PluginMessage {
  target: "shape-shifter"
  action: "create-rects" | "get-selection"
}

export interface TextMasterMessage extends PluginMessage {
  target: "text-master"
  action: "insert-text" | "load-fonts"
}

export interface ModuleManifest {
  id: PluginID
  label: string
  icon: string
  ui: React.ComponentType<any>
  handler: (action: string, payload: any, figma: any) => Promise<any>
  permissionRequirements: string[]
  settingsSchema?: any
}

export interface ModuleRegistry {
  [key: string]: ModuleManifest
}