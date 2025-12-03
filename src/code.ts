/// <reference types="@figma/plugin-typings" />

import { moduleRegistry } from "./moduleRegistry";
import { RESIZE_DEFAULT, clampSize } from "./shared/resize";
import {
  withTimeout,
  formatErrorMessage,
  isRecoverableError,
} from "./shared/error-handler";
import { createLogger } from "./shared/logging";

// Configuration
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

// Create logger for main thread
const logger = createLogger("Main");

// Debug logging is disabled by default (warnings and errors only).
// To temporarily enable verbose logging during development, call
// createLogger().debug() within targeted code paths.

figma.showUI(__html__, RESIZE_DEFAULT);

// Build handlers map from module registry
const handlers: Record<string, Function> = {};
Object.values(moduleRegistry).forEach((manifest) => {
  handlers[manifest.id] = manifest.handler;
});

// Handle shell-level commands coming from the UI shell
async function handleShellCommand(
  action: string,
  payload: any,
  requestId?: string
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
  error?: string
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
figma.ui.onmessage = async (msg: unknown) => {
  const message = (msg as Record<string, unknown>)?.pluginMessage || msg;

  if (
    !message ||
    typeof message !== "object" ||
    !("target" in message) ||
    !("action" in message)
  ) {
    logger.warn("Invalid message format", msg);
    return;
  }

  const { target, action, payload, requestId } = message as {
    target: string;
    action: string;
    payload?: unknown;
    requestId?: string;
  };

  logger.debug(`Received message: ${target}:${action}`, { payload, requestId });

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

    // Wrap handler execution with timeout
    const operationName = `${target}:${action}`;
    const result = await withTimeout(
      handlers[target](action, payload, figma),
      DEFAULT_TIMEOUT_MS,
      operationName
    );

    logger.debug(`Success: ${operationName}`, { result });
    sendResponse(requestId, result);
  } catch (error: unknown) {
    const errorMessage = formatErrorMessage(error);
    const recoverable = isRecoverableError(error);

    logger.error(`Error handling ${target}:${action}`, {
      error: errorMessage,
      recoverable,
    });

    // Send error response with recovery information
    sendResponse(requestId, null, errorMessage);

    // Notify user if error is not recoverable
    if (!recoverable) {
      figma.notify(`⚠️ ${errorMessage}`, { error: true });
    }
  }
};
