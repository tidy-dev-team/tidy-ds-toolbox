// Coverage for the test-only sleeper Operations (#192): they exist so the
// Bridge-timeout -> cancellation-token path can be triggered on demand, and
// these tests are the deterministic (non-Figma, non-network) proof that each
// of the four CancellationStatus values comes out the way the header comment
// in test-sleep-operations.ts claims it does. The live-Figma half of this
// ticket's acceptance criteria - a real Bridge timing out against these same
// three ids - is out of reach here and is covered instead by the manual
// procedure in the PR/issue writeup.

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import "./test-sleep-operations";
import { bindSession, dispatch, requestCancellation } from "./registry";
import type { BridgeResponse } from "./types";

function errorOf(res: BridgeResponse) {
  if (res.ok) throw new Error("expected a failed BridgeResponse");
  return res.error;
}

function resultOf(res: BridgeResponse) {
  if (!res.ok)
    throw new Error(`expected ok, got ${res.error.code}: ${res.error.message}`);
  return res.result as {
    requestedDurationMs: number;
    unitMs: number;
    unitsRequested: number;
    unitsCompleted: number;
    cancelled: boolean;
  };
}

beforeAll(() => {
  bindSession("session-under-test");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("tidy_test_sleep_cancellable - the declaring, checking mode", () => {
  it("stops at its next unit boundary and reports 'stopped', with cancelled:true in the result", async () => {
    vi.useFakeTimers();

    const running = dispatch({
      type: "dispatch",
      id: "req_sleep_1",
      operation: "tidy_test_sleep_cancellable",
      params: { durationMs: 10_000, unitMs: 100 },
    });

    // Cancel while the first unit's delay(100) is still pending. The grace
    // (5000ms fake) is generous - this is testing the loop's checkpoint,
    // not a race against the grace window.
    const cancelled = requestCancellation("req_sleep_1", 5_000);
    await vi.advanceTimersByTimeAsync(150);

    await expect(cancelled).resolves.toEqual({
      type: "cancel_result",
      id: "req_sleep_1",
      status: "stopped",
      operation: "tidy_test_sleep_cancellable",
    });

    const result = resultOf(await running);
    expect(result.cancelled).toBe(true);
    expect(result.unitsCompleted).toBeLessThan(result.unitsRequested);
  });

  it("reports still_running when the grace closes before the next unit boundary", async () => {
    vi.useFakeTimers();

    const running = dispatch({
      type: "dispatch",
      id: "req_sleep_2",
      operation: "tidy_test_sleep_cancellable",
      // unitMs (5000) deliberately larger than the grace (50) below - the
      // run has a real checkpoint, it just hasn't reached it yet.
      params: { durationMs: 10_000, unitMs: 5_000 },
    });

    const cancelled = requestCancellation("req_sleep_2", 50);
    await vi.advanceTimersByTimeAsync(60);

    await expect(cancelled).resolves.toEqual({
      type: "cancel_result",
      id: "req_sleep_2",
      status: "still_running",
      operation: "tidy_test_sleep_cancellable",
    });

    // Let the run actually finish stopping so it doesn't leak into the next
    // test's single-Operation slot.
    await vi.advanceTimersByTimeAsync(5_000);
    const result = resultOf(await running);
    expect(result.cancelled).toBe(true);
  });
});

describe("tidy_test_sleep_ignore_token - declares a checkpoint it never reads", () => {
  it("marks the token on cancel, but the run never stops early: still_running, deterministically", async () => {
    vi.useFakeTimers();

    const running = dispatch({
      type: "dispatch",
      id: "req_sleep_3",
      operation: "tidy_test_sleep_ignore_token",
      // Total run time (2000ms) deliberately outlasts the grace below -
      // otherwise the run could finish on its own inside a generous grace
      // and read as "stopped" for the wrong reason (it ended in time, not
      // because it obeyed). A short grace against a longer run is what
      // isolates "asked, had no checkpoint, was still going" from "asked,
      // happened to finish anyway".
      params: { durationMs: 2_000, unitMs: 100 },
    });

    const cancelled = requestCancellation("req_sleep_3", 200);
    await vi.advanceTimersByTimeAsync(200);

    await expect(cancelled).resolves.toEqual({
      type: "cancel_result",
      id: "req_sleep_3",
      status: "still_running",
      operation: "tidy_test_sleep_ignore_token",
    });

    // The run itself still completes normally - cancellation asked for
    // nothing this Operation is capable of honouring.
    await vi.advanceTimersByTimeAsync(2_000);
    const result = resultOf(await running);
    expect(result.cancelled).toBe(false);
    expect(result.unitsCompleted).toBe(result.unitsRequested);
  });
});

describe("tidy_test_sleep_uncancellable - no declaration at all", () => {
  it("reports not_cancellable immediately, without waiting on anything, and leaves the run going", async () => {
    vi.useFakeTimers();

    const running = dispatch({
      type: "dispatch",
      id: "req_sleep_4",
      operation: "tidy_test_sleep_uncancellable",
      params: { durationMs: 300, unitMs: 100 },
    });

    await expect(requestCancellation("req_sleep_4", 10_000)).resolves.toEqual({
      type: "cancel_result",
      id: "req_sleep_4",
      status: "not_cancellable",
      operation: "tidy_test_sleep_uncancellable",
    });

    await vi.advanceTimersByTimeAsync(300);
    const result = resultOf(await running);
    expect(result.cancelled).toBe(false);
  });
});

describe("not_running - the fourth status, needing no special operation", () => {
  it("answers not_running for a requestId naming nothing in flight", async () => {
    await expect(requestCancellation("no-such-request")).resolves.toEqual({
      type: "cancel_result",
      id: "no-such-request",
      status: "not_running",
    });
  });
});

describe("param validation", () => {
  it("rejects a missing/non-positive durationMs with INVALID_PARAMS", async () => {
    const res = await dispatch({
      type: "dispatch",
      id: "req_sleep_bad_1",
      operation: "tidy_test_sleep_cancellable",
      params: {},
    });
    expect(errorOf(res).code).toBe("INVALID_PARAMS");
  });

  it("rejects a durationMs beyond the ceiling with INVALID_PARAMS", async () => {
    const res = await dispatch({
      type: "dispatch",
      id: "req_sleep_bad_2",
      operation: "tidy_test_sleep_cancellable",
      params: { durationMs: 60 * 60_000 },
    });
    expect(errorOf(res).code).toBe("INVALID_PARAMS");
  });

  it("rejects a non-positive unitMs with INVALID_PARAMS", async () => {
    const res = await dispatch({
      type: "dispatch",
      id: "req_sleep_bad_3",
      operation: "tidy_test_sleep_cancellable",
      params: { durationMs: 1_000, unitMs: 0 },
    });
    expect(errorOf(res).code).toBe("INVALID_PARAMS");
  });
});
