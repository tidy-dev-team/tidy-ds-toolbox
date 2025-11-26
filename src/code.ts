/// <reference types="@figma/plugin-typings" />

import * as dsExplorerLogic from "./plugins/ds-explorer/logic";
import * as shapeShifterLogic from "./plugins/shape-shifter/logic";
import * as textMasterLogic from "./plugins/text-master/logic";

figma.showUI(__html__, { width: 800, height: 600 });

// Module handlers map
const handlers: Record<string, Function> = {
  "shape-shifter": shapeShifterLogic.handleShapeShifter,
  "text-master": textMasterLogic.handleTextMaster,
  "ds-explorer": async (action: string, payload: any) => {
    switch (action) {
      case "get-component-properties":
        return await dsExplorerLogic.handleGetComponentProperties(payload, figma);
      case "build-component":
        return await dsExplorerLogic.handleBuildComponent(payload, figma);
      default:
        throw new Error(`Unknown DS Explorer action: ${action}`);
    }
  },
};

// Handle shell storage operations
async function handleShellStorage(action: string, payload: any, requestId?: string) {
  if (action === "save-storage") {
    await figma.clientStorage.setAsync(payload.key, payload.value);
    return;
  }
  
  if (action === "load-storage") {
    const value = await figma.clientStorage.getAsync(payload.key);
    figma.ui.postMessage({
      type: "response",
      requestId,
      result: value,
    });
  }
}

// Send response to UI
function sendResponse(requestId: string | undefined, result: any, error?: string) {
  if (!requestId) return;
  
  figma.ui.postMessage({
    type: error ? "error" : "response",
    requestId,
    result: error ? undefined : result,
    error,
  });
}

// Message routing
figma.ui.onmessage = async (msg: any) => {
  const message = msg?.pluginMessage || msg;

  if (!message?.target || !message?.action) {
    console.log("⚠️ [Main] Invalid message format:", msg);
    return;
  }

  const { target, action, payload, requestId } = message;

  try {
    // Handle shell-specific actions
    if (target === "shell") {
      await handleShellStorage(action, payload, requestId);
      return;
    }

    // Handle module actions
    if (!handlers[target]) {
      throw new Error(`Unknown module: ${target}`);
    }

    const result = await handlers[target](action, payload, figma);
    sendResponse(requestId, result);
  } catch (error: any) {
    console.error(`❌ [Main] Error handling ${target}:${action}:`, error.message);
    sendResponse(requestId, null, error?.message || String(error));
  }
};
