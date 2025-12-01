/// <reference types="@figma/plugin-typings" />

import * as dsExplorerLogic from "./plugins/ds-explorer/logic";
import { tokenTrackerHandler } from "./plugins/token-tracker/logic";
import { componentLabelsHandler } from "./plugins/component-labels/logic";
import { tidyIconCareHandler } from "./plugins/tidy-icon-care/logic";
import { stickerSheetBuilderHandler } from "./plugins/sticker-sheet-builder/logic";
import { RESIZE_DEFAULT, clampSize } from "./shared/resize";

figma.showUI(__html__, RESIZE_DEFAULT);

// Module handlers map
const handlers: Record<string, Function> = {
  "ds-explorer": async (action: string, payload: any) => {
    switch (action) {
      case "get-component-properties":
        return await dsExplorerLogic.handleGetComponentProperties(
          payload,
          figma,
        );
      case "build-component":
        return await dsExplorerLogic.handleBuildComponent(payload, figma);
      default:
        throw new Error(`Unknown DS Explorer action: ${action}`);
    }
  },
  "token-tracker": tokenTrackerHandler,
  "component-labels": componentLabelsHandler,
  "tidy-icon-care": tidyIconCareHandler,
  "sticker-sheet-builder": stickerSheetBuilderHandler,
};

// Handle shell-level commands coming from the UI shell
async function handleShellCommand(
  action: string,
  payload: any,
  requestId?: string,
) {
  switch (action) {
    case "save-storage": {
      await figma.clientStorage.setAsync(payload.key, payload.value);
      return;
    }
    case "load-storage": {
      const value = await figma.clientStorage.getAsync(payload.key);
      figma.ui.postMessage({
        type: "response",
        requestId,
        result: value,
      });
      return;
    }
    case "resize-ui": {
      const targetWidth = Number(payload?.width) || RESIZE_DEFAULT.width;
      const targetHeight = Number(payload?.height) || RESIZE_DEFAULT.height;
      const nextSize = clampSize(targetWidth, targetHeight);

      figma.ui.resize(nextSize.width, nextSize.height);
      figma.ui.postMessage({
        type: "resize",
        payload: nextSize,
      });
      return;
    }
    default: {
      console.warn(`⚠️ [Main] Unknown shell action: ${action}`);
    }
  }
}

// Send response to UI
function sendResponse(
  requestId: string | undefined,
  result: any,
  error?: string,
) {
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
    console.warn("⚠️ [Main] Invalid message format:", msg);
    return;
  }

  const { target, action, payload, requestId } = message;

  try {
    // Handle shell-specific actions
    if (target === "shell") {
      await handleShellCommand(action, payload, requestId);
      return;
    }

    // Handle module actions
    if (!handlers[target]) {
      throw new Error(`Unknown module: ${target}`);
    }

    const result = await handlers[target](action, payload, figma);
    sendResponse(requestId, result);
  } catch (error: any) {
    console.error(
      `❌ [Main] Error handling ${target}:${action}:`,
      error.message,
    );
    sendResponse(requestId, null, error?.message || String(error));
  }
};
