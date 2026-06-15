import { PluginMessage, ShellMessage } from "./types";

// Helper to send messages from UI to main thread
export function postToFigma(message: PluginMessage): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

// Helper to send messages from main thread to UI
export function postToUI(message: ShellMessage): void {
  figma.ui.postMessage(message);
}

// Open a URL in the user's browser. Anchor navigation does not work inside
// Figma's iframe, so the main thread handles this top-level message via
// figma.openExternal (see code.ts).
export function openExternalLink(url: string): void {
  parent.postMessage(
    { pluginMessage: { type: "open-external-link", url } },
    "*",
  );
}

// Type-safe wrappers for specific modules
export function createShapeRectangles(count: number): void {
  postToFigma({
    target: "shape-shifter",
    action: "create-rects",
    payload: { count },
  });
}

export function insertText(text: string, style?: any): void {
  postToFigma({
    target: "text-master",
    action: "insert-text",
    payload: { text, style },
  });
}
