import { describe, expect, it, beforeEach } from "vitest";

import {
  appendUsageEvent,
  clearUsageBuffer,
  getBufferSize,
  getRecentEvents,
} from "./buffer";
import type { UsageEvent } from "./types";

function makeEvent(module: string, action: string | null): UsageEvent {
  return {
    schemaVersion: 2,
    type: action === null ? "module_open" : "action",
    module,
    action,
    fileHash: "0123456789abcdef",
    pluginVersion: "1.7.0",
    sessionId: "s",
    clientTs: "2026-06-21T10:00:00.000Z",
  };
}

beforeEach(() => {
  clearUsageBuffer();
});

describe("usage ring buffer", () => {
  it("starts empty", () => {
    expect(getBufferSize()).toBe(0);
    expect(getRecentEvents()).toEqual([]);
  });

  it("appends events in order", () => {
    appendUsageEvent(makeEvent("audit", "generate-report"));
    appendUsageEvent(makeEvent("utilities", "do-thing"));
    expect(getBufferSize()).toBe(2);
    expect(getRecentEvents().map((e) => e.module)).toEqual([
      "audit",
      "utilities",
    ]);
  });

  it("caps at the configured size (last 200) by dropping the oldest", () => {
    for (let i = 0; i < 205; i++) {
      appendUsageEvent(makeEvent(`m${i}`, "a"));
    }
    expect(getBufferSize()).toBe(200);
    const events = getRecentEvents();
    expect(events[0].module).toBe("m5");
    expect(events[199].module).toBe("m204");
  });

  it("returns a copy so callers cannot mutate the internal buffer", () => {
    appendUsageEvent(makeEvent("audit", "x"));
    const events = getRecentEvents();
    events.pop();
    expect(getBufferSize()).toBe(1);
  });

  it("does not persist across a clear (empties to zero)", () => {
    appendUsageEvent(makeEvent("audit", "x"));
    clearUsageBuffer();
    expect(getBufferSize()).toBe(0);
    expect(getRecentEvents()).toEqual([]);
  });
});
