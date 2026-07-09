import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  createEventBatcher,
  createUsageBatcher,
  MAX_BATCH_SIZE,
  FLUSH_INTERVAL_MS,
} from "./transport";
import type { UsageEvent } from "./types";

function makeEvent(module: string): UsageEvent {
  return {
    schemaVersion: 2,
    type: "action",
    module,
    action: "do-thing",
    fileHash: "0123456789abcdef",
    pluginVersion: "1.13.0",
    sessionId: "s",
    clientTs: "2026-07-09T10:00:00.000Z",
  };
}

// Fake, injectable timer registry standing in for setTimeout/clearTimeout so
// the batching core can be driven without vi.useFakeTimers when that's not
// needed, and with it when it is.
function makeDeps() {
  const send = vi.fn<(events: UsageEvent[]) => void>();
  const setTimer = vi.fn((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearTimer = vi.fn((handle: unknown) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  );
  return { send, setTimer, clearTimer };
}

describe("createEventBatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes as a single send once the batch hits the max size", () => {
    const deps = makeDeps();
    const batcher = createEventBatcher(deps);

    for (let i = 0; i < MAX_BATCH_SIZE; i++) {
      batcher.add(makeEvent(`m${i}`));
    }

    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(deps.send.mock.calls[0][0]).toHaveLength(MAX_BATCH_SIZE);
    expect(deps.send.mock.calls[0][0].map((e) => e.module)).toEqual(
      Array.from({ length: MAX_BATCH_SIZE }, (_, i) => `m${i}`),
    );
  });

  it("flushes on the timer after ~15s even with fewer than the max buffered", () => {
    const deps = makeDeps();
    const batcher = createEventBatcher(deps);

    batcher.add(makeEvent("a"));
    batcher.add(makeEvent("b"));
    expect(deps.send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(FLUSH_INTERVAL_MS);

    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(deps.send.mock.calls[0][0].map((e) => e.module)).toEqual(["a", "b"]);
  });

  it("clears the buffer after a flush so nothing is double-sent", () => {
    const deps = makeDeps();
    const batcher = createEventBatcher(deps);

    batcher.add(makeEvent("a"));
    batcher.flush();
    expect(deps.send).toHaveBeenCalledTimes(1);

    // No pending events — a second flush (e.g. from a stray timer) is a no-op.
    batcher.flush();
    expect(deps.send).toHaveBeenCalledTimes(1);

    // Advancing time doesn't resurrect an old timer either — it was cleared.
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS);
    expect(deps.send).toHaveBeenCalledTimes(1);
  });

  it("a failing send is swallowed and does not affect the next batch", () => {
    const deps = makeDeps();
    deps.send.mockImplementationOnce(() => {
      throw new Error("network down");
    });
    const batcher = createEventBatcher(deps);

    batcher.add(makeEvent("a"));
    expect(() => batcher.flush()).not.toThrow();
    expect(deps.send).toHaveBeenCalledTimes(1);

    batcher.add(makeEvent("b"));
    batcher.flush();
    expect(deps.send).toHaveBeenCalledTimes(2);
    expect(deps.send.mock.calls[1][0].map((e) => e.module)).toEqual(["b"]);
  });

  it("does not buffer at all when the token is empty (sending disabled)", () => {
    const deps = makeDeps();
    expect(createUsageBatcher("", deps)).toBeNull();
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.setTimer).not.toHaveBeenCalled();
  });

  it("buffers normally when a token is present", () => {
    const deps = makeDeps();
    const batcher = createUsageBatcher("secret-token", deps);
    if (!batcher) throw new Error("expected a batcher when a token is set");
    batcher.add(makeEvent("a"));
    batcher.flush();
    expect(deps.send).toHaveBeenCalledTimes(1);
  });

  it("respects injected maxBatchSize / flushIntervalMs overrides", () => {
    const deps = makeDeps();
    const batcher = createEventBatcher({
      ...deps,
      maxBatchSize: 3,
      flushIntervalMs: 1_000,
    });

    batcher.add(makeEvent("a"));
    batcher.add(makeEvent("b"));
    batcher.add(makeEvent("c"));

    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(deps.send.mock.calls[0][0]).toHaveLength(3);
  });
});
