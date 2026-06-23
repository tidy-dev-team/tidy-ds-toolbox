/// <reference types="@figma/plugin-typings" />

import { moduleHandlers } from "./moduleHandlers";
import { RESIZE_DEFAULT, clampSize } from "./shared/resize";
import {
  withTimeout,
  formatErrorMessage,
  isRecoverableError,
} from "./shared/error-handler";
import { createLogger } from "./shared/logging";
import { bindSession } from "./shared/operations/registry";
import { captureUsage } from "./shared/analytics/capture";
import { dumpUsageEvents } from "./shared/analytics/buffer";

// Configuration
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

// Actions that can take a long time and should not be timed out
const LONG_RUNNING_ACTIONS = new Set([
  "sticker-sheet-builder:build-all",
  "sticker-sheet-builder:build-one",
  "audit:generate-report",
  // Builds a clone, prunes variants, then de-links from Kido-DS (detach nested
  // instances + localize styles) — can exceed the default timeout on large sets.
  "ds-explorer:build-component",
  // Walks every node on the chosen scope (optionally all pages) extracting
  // solid-color usages, then renders an inventory page — can exceed the default
  // timeout on large files. Emits progress updates while it runs.
  "color-finder:scan-colors",
  "color-finder:scan-image-palette",
]);

// Create logger for main thread
const logger = createLogger("Main");

// Debug logging is disabled by default (warnings and errors only).
// To temporarily enable verbose logging during development, call
// createLogger().debug() within targeted code paths.

figma.showUI(__html__, RESIZE_DEFAULT);

// Bind the MCP Operation Session for the lifetime of this plugin run.
// MVP supports one Session at a time; reload tears it down.
bindSession(`sess_${figma.fileKey ?? "unknown"}_${Date.now().toString(36)}`);

// Usage analytics (Phase 1): expose the dev-only buffer dump on the plugin
// global so it can be inspected from the Figma dev console. Inert in
// production (reads in-memory state only). See issues #36–#38 and
// docs/prd-usage-analytics-phase1.md (FR8).
(globalThis as Record<string, unknown>).__dumpUsageEvents = dumpUsageEvents;

// Module handlers map
const handlers: Record<
  string,
  (action: string, payload: unknown, figma: PluginAPI) => Promise<unknown>
> = moduleHandlers;

// Handle shell-level commands coming from the UI shell
async function handleShellCommand(
  action: string,
  payload: unknown,
  requestId?: string,
) {
  switch (action) {
    case "save-storage": {
      const p = payload as { key: string; value: unknown };
      await figma.clientStorage.setAsync(p.key, p.value);
      return;
    }
    case "load-storage": {
      const p = payload as { key: string };
      const value = await figma.clientStorage.getAsync(p.key);
      figma.ui.postMessage({
        type: "response",
        requestId,
        result: value,
      });
      return;
    }
    case "resize-ui": {
      const p = payload as {
        width?: number;
        height?: number;
        mode?: "default" | "bridge";
      };
      const targetWidth = Number(p?.width) || RESIZE_DEFAULT.width;
      const targetHeight = Number(p?.height) || RESIZE_DEFAULT.height;
      const nextSize = clampSize(targetWidth, targetHeight, p?.mode);

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
  result: unknown,
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
figma.ui.onmessage = async (msg: unknown) => {
  const message = (msg as Record<string, unknown>)?.pluginMessage || msg;

  // Handle external link requests
  if (
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "open-external-link" &&
    "url" in message &&
    typeof message.url === "string"
  ) {
    figma.openExternal(message.url);
    return;
  }

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

  // Usage analytics: classify and emit a structured event for this message.
  // Never throws into the user action — captureUsage swallows internally (FR9).
  // Only {target, action} identity is recorded; payload is never copied (FR6).
  captureUsage(
    { target, action, payload },
    {
      fileKey: figma.fileKey ?? null,
      rootId: figma.root.id,
      rootName: figma.root.name,
    },
    __APP_VERSION__,
  );

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

    // Execute handler - skip timeout for long-running operations
    const operationName = `${target}:${action}`;
    const handlerPromise = handlers[target](action, payload, figma);

    const result = LONG_RUNNING_ACTIONS.has(operationName)
      ? await handlerPromise
      : await withTimeout(handlerPromise, DEFAULT_TIMEOUT_MS, operationName);

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
