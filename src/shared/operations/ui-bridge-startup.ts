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

// Fan-out only. Which transitions are worth reporting is `UiBridge`'s to
// decide and it already drops a repeat before calling this, so a second guard
// here would be a second copy of one rule with nothing to enforce.
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
    // The one place `__APP_VERSION__` is read on this path: it exists only
    // inside the Vite bundle, so UiBridge takes it as an option rather than
    // reaching for the global and becoming untestable outside one (#189).
    version: __APP_VERSION__,
    dispatch: (req) => dispatcher.dispatch(req),
    cancel: (env) => dispatcher.cancel(env),
    log: (m) => console.debug(`[mcp-bridge] ${m}`),
    onStatusChange: setStatus,
  });
  bridge.start();
}
