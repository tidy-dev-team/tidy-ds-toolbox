/// <reference types="@figma/plugin-typings" />

import { moduleHandlers } from "./moduleHandlers";
import { RESIZE_DEFAULT, clampSize } from "./shared/resize";
import {
  withTimeout,
  formatErrorMessage,
  isRecoverableError,
  TimeoutError,
} from "./shared/error-handler";
import { classifyAction, buildOverrunMessage } from "./shared/action-catalogue";
import { createLogger } from "./shared/logging";
import { bindSession } from "./shared/operations/registry";
import { captureUsage, setUsageRelay } from "./shared/analytics/capture";
import { dumpUsageEvents } from "./shared/analytics/buffer";

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

// Usage analytics (Phase 2, #43): the plugin thread cannot do network, so relay
// each captured event to the UI thread, which POSTs it to the ingest endpoint.
// figma.ui exists (showUI ran above); the send is fire-and-forget on the UI side
// and the relay itself is wrapped so it can never affect a user action (FR4).
setUsageRelay((event) => {
  figma.ui.postMessage({ type: "usage-event", event });
});

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

    // Execute handler - the action catalogue (#162) decides whether this
    // action is timed or long-running, and (below) how an overrun reads.
    const operationName = `${target}:${action}`;
    const classification = classifyAction(operationName);
    const handlerPromise = handlers[target](action, payload, figma);

    const result =
      classification.budget.kind === "long-running"
        ? await handlerPromise
        : await withTimeout(
            handlerPromise,
            classification.budget.ms,
            operationName,
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

    // Send error response with recovery information. A timeout error gets
    // the catalogue's overrun wording — honest about whether the write is
    // still in flight — instead of the raw TimeoutError text.
    const operationName = `${target}:${action}`;
    const isTimeout = error instanceof TimeoutError;
    const responseMessage = isTimeout
      ? buildOverrunMessage(operationName, classifyAction(operationName))
      : errorMessage;

    sendResponse(requestId, null, responseMessage);

    // Notify user if error is not recoverable
    if (!recoverable) {
      figma.notify(`⚠️ ${responseMessage}`, { error: true });
    }
  }
};
