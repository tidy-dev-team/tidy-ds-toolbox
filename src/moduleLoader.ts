import { ModuleManifest } from '@shared/types'

// Helper to load and wire a module
export function loadModule(manifest: ModuleManifest) {
  // In a more advanced setup, this could dynamically import modules
  // For now, modules are statically registered

  return {
    ui: manifest.ui,
    handler: manifest.handler,
  }
}

// Export handlers for the main thread
export function getModuleHandlers() {
  // This would be used in code.ts to register handlers
  const { moduleRegistry } = require('../moduleRegistry')

  const handlers: Record<string, Function> = {}
  Object.values(moduleRegistry).forEach(manifest => {
    handlers[manifest.id] = manifest.handler
  })

  return handlers
}