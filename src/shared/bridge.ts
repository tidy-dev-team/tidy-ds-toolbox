import { PluginMessage, ShellMessage } from './types'

// Helper to send messages from UI to main thread
export function postToFigma(message: PluginMessage): void {
  parent.postMessage({ pluginMessage: message }, '*')
}

// Helper to send messages from main thread to UI
export function postToUI(message: ShellMessage): void {
  figma.ui.postMessage(message)
}

// Type-safe wrappers for specific modules
export function createShapeRectangles(count: number): void {
  postToFigma({
    target: 'shape-shifter',
    action: 'create-rects',
    payload: { count }
  })
}

export function insertText(text: string, style?: any): void {
  postToFigma({
    target: 'text-master',
    action: 'insert-text',
    payload: { text, style }
  })
}