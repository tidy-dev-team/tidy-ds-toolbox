// Usage-analytics transport for the UI thread (issue #44).
//
// The plugin thread relays each captured UsageEvent to the UI via postMessage
// (see code.ts `setUsageRelay`). Only the UI thread has network access, so it
// batches events in memory and flushes them as a single POST to the
// self-hosted ingest endpoint — whichever comes first of 10 events buffered
// (FR2) or ~15 seconds since the first event entered the (empty) buffer
// (FR3). A flush is one `POST /events` with the whole batch as a JSON array;
// the buffer is cleared immediately, before the network call settles (FR4).
//
// Hard requirement (FR4/FR5): sending is fully isolated. Any failure — server
// down, offline, sleeping droplet, non-2xx, blocked by network policy — is
// swallowed and must never throw into, block, or delay a user action. Buffered
// events are in-memory only: events still queued when the plugin closes are
// dropped, and that's accepted (no persistence, no unload/visibility hooks).

import type { UsageEvent } from "./types";

// Injected at build time by Vite `define` (see vite.config.ts).
// __INGEST_TOKEN__ is empty in builds without TIDY_INGEST_TOKEN set, which
// disables sending entirely — dev builds don't ship events unless opted in.
const ENDPOINT = __INGEST_ENDPOINT__;
const TOKEN = __INGEST_TOKEN__;

export const MAX_BATCH_SIZE = 10;
export const FLUSH_INTERVAL_MS = 15_000;

// Pure-ish batching core (FR2/FR3), injectable so it's unit-testable without
// DOM/fetch/timers plumbing. `send` is the only side effect and is expected
// to be fire-and-forget on the caller's side (see `sendBatch` below).
export interface BatcherDeps {
  send: (events: UsageEvent[]) => void;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  maxBatchSize?: number;
  flushIntervalMs?: number;
}

export interface EventBatcher {
  add: (event: UsageEvent) => void;
  flush: () => void;
}

// Buffers events; flushes on whichever comes first: `maxBatchSize` events, or
// `flushIntervalMs` after the first event landed in an empty buffer. The
// timer is armed on the 0→1 transition only and cleared on every flush, so a
// steady trickle of events never fires more than one timer at a time.
export function createEventBatcher(deps: BatcherDeps): EventBatcher {
  const maxBatchSize = deps.maxBatchSize ?? MAX_BATCH_SIZE;
  const flushIntervalMs = deps.flushIntervalMs ?? FLUSH_INTERVAL_MS;

  let buffer: UsageEvent[] = [];
  let timer: unknown = null;

  function flush(): void {
    if (timer !== null) {
      deps.clearTimer(timer);
      timer = null;
    }
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    try {
      deps.send(batch);
    } catch {
      // FR4/FR5: a failing send must never propagate — the batch is already
      // gone from the buffer, so the next batch starts clean regardless.
    }
  }

  function add(event: UsageEvent): void {
    buffer.push(event);
    if (buffer.length === 1) {
      timer = deps.setTimer(flush, flushIntervalMs);
    }
    if (buffer.length >= maxBatchSize) {
      flush();
    }
  }

  return { add, flush };
}

// Fire-and-forget POST of a batch. Never throws, never awaited.
function sendBatch(events: UsageEvent[]): void {
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(events),
      // We never read the response; keep it cheap and detached.
      keepalive: true,
    }).catch(() => {
      // swallow: a failed send must be invisible to the user.
    });
  } catch {
    // swallow synchronous throws (e.g. fetch unavailable) too.
  }
}

// Only allocated if a token is present, so an empty token disables sending
// exactly as before — including not buffering a single event in memory.
// Exported (rather than inlined at module scope) so the empty-token /
// present-token branches are unit-testable without DOM/fetch/timer globals.
export function createUsageBatcher(
  token: string,
  deps: BatcherDeps,
): EventBatcher | null {
  return token ? createEventBatcher(deps) : null;
}

const batcher: EventBatcher | null = createUsageBatcher(TOKEN, {
  send: sendBatch,
  setTimer: (cb, ms) => setTimeout(cb, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
});

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
  if (!batcher) return; // sending disabled — don't even buffer
  // Figma wraps plugin→UI messages; unwrap defensively.
  const data: unknown =
    (evt.data as { pluginMessage?: unknown })?.pluginMessage ?? evt.data;
  if (!isUsageEventMessage(data)) return;
  batcher.add(data.event);
}

let started = false;

// Mounted once at app startup (from main.tsx), like the MCP bridge.
export function startUsageTransport(): void {
  if (started) return;
  started = true;
  window.addEventListener("message", handleMessage);
}
