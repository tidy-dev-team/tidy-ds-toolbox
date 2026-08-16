// Glue between UiBridge and the existing UI↔main postMessage channel.
// Mounted once at app startup (from main.tsx).

import { UiBridge, type BridgeStatus } from "./ui-bridge";
import { MainDispatcher } from "./main-dispatcher";

let bridge: UiBridge | null = null;

const dispatcher = new MainDispatcher({
  post: (message) => parent.postMessage({ pluginMessage: message }, "*"),
});

// Module-level connection status, subscribable by any module UI that wants
// to show a live Bridge indicator (e.g. tidy-doc's minimal shell) without
// threading a new prop through ShellContext for every consumer.
let currentStatus: BridgeStatus = "closed";
const statusSubscribers = new Set<(status: BridgeStatus) => void>();

function setStatus(status: BridgeStatus): void {
  currentStatus = status;
  for (const cb of statusSubscribers) cb(status);
}

export function getBridgeStatus(): BridgeStatus {
  return currentStatus;
}

export function subscribeBridgeStatus(
  cb: (status: BridgeStatus) => void,
): () => void {
  statusSubscribers.add(cb);
  return () => statusSubscribers.delete(cb);
}

function handleMainResponse(evt: MessageEvent): void {
  dispatcher.handleMessage(evt.data?.pluginMessage ?? evt.data);
}

export function startBridge(url?: string): void {
  if (bridge) return;
  window.addEventListener("message", handleMainResponse);
  bridge = new UiBridge({
    url,
    dispatch: (req) => dispatcher.dispatch(req),
    log: (m) => console.debug(`[mcp-bridge] ${m}`),
    onStatusChange: setStatus,
  });
  bridge.start();
}

export function stopBridge(): void {
  bridge?.stop();
  bridge = null;
  window.removeEventListener("message", handleMainResponse);
  dispatcher.close();
}
