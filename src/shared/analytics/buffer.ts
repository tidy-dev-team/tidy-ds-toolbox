// In-memory ring buffer of the most recent usage events, for dev observability.
// Bounded; cleared on plugin close (module-scope state, no persistence).
// See docs/prd-usage-analytics-phase1.md (FR8) and issue #38.

import type { UsageEvent } from "./types";

const MAX_BUFFER_SIZE = 200;
const buffer: UsageEvent[] = [];

export function appendUsageEvent(event: UsageEvent): void {
  buffer.push(event);
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.shift();
  }
}

export function getRecentEvents(): UsageEvent[] {
  return buffer.slice();
}

export function getBufferSize(): number {
  return buffer.length;
}

export function clearUsageBuffer(): void {
  buffer.length = 0;
}

// Dev-only: dump the current buffer to the console and return it. Exposed to
// the dev console via `globalThis.__dumpUsageEvents` in code.ts. Reads only
// in-memory state — inert in production.
export function dumpUsageEvents(): UsageEvent[] {
  const events = getRecentEvents();
  // eslint-disable-next-line no-console
  console.log(`[usage] ${events.length} buffered event(s)`, events);
  return events;
}
