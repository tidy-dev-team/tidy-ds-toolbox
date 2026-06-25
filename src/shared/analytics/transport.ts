// Usage-analytics transport for the UI thread (issue #43).
//
// The plugin thread relays each captured UsageEvent to the UI via postMessage
// (see code.ts `setUsageRelay`). Only the UI thread has network access, so it
// POSTs events to the self-hosted ingest endpoint. This slice sends one event
// per request; batching lands in #44.
//
// Hard requirement (FR4): sending is fully isolated. Any failure — server down,
// offline, sleeping droplet, non-2xx, blocked by network policy — is swallowed
// and must never throw into, block, or delay a user action. The plugin behaves
// identically to today when sending fails.

import type { UsageEvent } from "./types";

// Injected at build time by Vite `define` (see vite.config.ts).
// __INGEST_TOKEN__ is empty in builds without TIDY_INGEST_TOKEN set, which
// disables sending entirely — dev builds don't ship events unless opted in.
const ENDPOINT = __INGEST_ENDPOINT__;
const TOKEN = __INGEST_TOKEN__;

// Fire-and-forget POST of a single event. Never throws, never awaited.
function send(event: UsageEvent): void {
  if (!TOKEN) return; // no token baked in → sending disabled
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify([event]),
      // We never read the response; keep it cheap and detached.
      keepalive: true,
    }).catch(() => {
      // swallow: a failed send must be invisible to the user.
    });
  } catch {
    // swallow synchronous throws (e.g. fetch unavailable) too.
  }
}

function isUsageEventMessage(
  data: unknown,
): data is { type: "usage-event"; event: UsageEvent } {
  return (
    !!data &&
    typeof data === "object" &&
    (data as { type?: unknown }).type === "usage-event" &&
    !!(data as { event?: unknown }).event
  );
}

function handleMessage(evt: MessageEvent): void {
  // Figma wraps plugin→UI messages; unwrap defensively.
  const data: unknown =
    (evt.data as { pluginMessage?: unknown })?.pluginMessage ?? evt.data;
  if (!isUsageEventMessage(data)) return;
  send(data.event);
}

let started = false;

// Mounted once at app startup (from main.tsx), like the MCP bridge.
export function startUsageTransport(): void {
  if (started) return;
  started = true;
  window.addEventListener("message", handleMessage);
}
