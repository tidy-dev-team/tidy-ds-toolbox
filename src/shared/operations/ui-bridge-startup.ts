// Glue between UiBridge and the existing UI↔main postMessage channel.
// Mounted once at app startup (from main.tsx).

import { UiBridge } from "./ui-bridge";
import type { BridgeRequest, BridgeResponse } from "./types";

let bridge: UiBridge | null = null;

const pending = new Map<string, (res: BridgeResponse) => void>();
let nextRequestId = 0;

function postOperationToMain(req: BridgeRequest): Promise<BridgeResponse> {
  return new Promise((resolve) => {
    const requestId = `mcp_${++nextRequestId}_${req.id}`;
    pending.set(requestId, resolve);
    parent.postMessage(
      {
        pluginMessage: {
          target: "mcp-bridge",
          action: "dispatch",
          payload: req,
          requestId,
        },
      },
      "*",
    );
  });
}

function handleMainResponse(evt: MessageEvent): void {
  const data = evt.data?.pluginMessage ?? evt.data;
  if (!data || typeof data !== "object") return;
  const requestId = (data as { requestId?: string }).requestId;
  if (!requestId || !pending.has(requestId)) return;
  const resolve = pending.get(requestId)!;
  pending.delete(requestId);
  // Main returns the BridgeResponse as `result` (success path) or as an
  // error string we never expect (registry.dispatch always resolves).
  const msg = data as {
    type?: string;
    result?: BridgeResponse;
    error?: string;
  };
  if (msg.type === "response" && msg.result) {
    resolve(msg.result);
  } else {
    resolve({
      id: requestId,
      ok: false,
      error: {
        code: "INTERNAL",
        message: msg.error ?? "main returned no result",
        recoverable: false,
      },
    });
  }
}

export function startBridge(url?: string): void {
  if (bridge) return;
  window.addEventListener("message", handleMainResponse);
  bridge = new UiBridge({
    url,
    dispatch: postOperationToMain,
    log: (m) => console.debug(`[mcp-bridge] ${m}`),
  });
  bridge.start();
}

export function stopBridge(): void {
  bridge?.stop();
  bridge = null;
  window.removeEventListener("message", handleMainResponse);
  pending.clear();
}
