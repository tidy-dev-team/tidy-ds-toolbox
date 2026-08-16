// The dispatcher's single-flight guard (#186). No Figma and no socket: an
// Operation handler is a plain async function, so overlap is reproducible here
// exactly as it happens in the plugin - the second envelope arrives while the
// first handler is still awaiting.

import { describe, it, expect, beforeAll } from "vitest";
import {
  registerOperation,
  dispatch,
  bindSession,
  runningOperation,
  requestCancellation,
} from "./registry";
import type { BridgeResponse, OperationSpec } from "./types";
import { yieldToMain } from "../cancellation";

function spec(id: string): OperationSpec {
  return {
    id,
    kind: "execute",
    module: "test",
    summary: `test operation ${id}`,
    paramsExample: {},
  };
}

/** A handler that hangs until the test lets it finish, like a long QA run. */
function blockingHandler(): {
  handler: () => Promise<string>;
  finish: () => void;
} {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return {
    handler: async () => {
      await gate;
      return "done";
    },
    finish,
  };
}

function errorOf(res: BridgeResponse) {
  if (res.ok) throw new Error("expected a failed BridgeResponse");
  return res.error;
}

beforeAll(() => {
  bindSession("session-under-test");
});

describe("one Operation at a time", () => {
  it("refuses a second Operation with BUSY while the first is still running", async () => {
    const first = blockingHandler();
    registerOperation(spec("test_slow_run"), first.handler);
    registerOperation(spec("test_other_run"), async () => "other");

    const running = dispatch({
      type: "dispatch",
      id: "req_0001",
      operation: "test_slow_run",
      params: {},
    });
    const refused = await dispatch({
      type: "dispatch",
      id: "req_0002",
      operation: "test_other_run",
      params: {},
    });

    expect(errorOf(refused).code).toBe("BUSY");

    first.finish();
    await running;
  });

  it("names the Operation holding the slot and tells the caller to wait for it", async () => {
    const first = blockingHandler();
    registerOperation(spec("tidy_qa_run_sim"), first.handler);
    registerOperation(spec("tidy_qa_build_checklist_sim"), async () => "built");

    const running = dispatch({
      type: "dispatch",
      id: "req_0010",
      operation: "tidy_qa_run_sim",
      params: {},
    });
    const refused = await dispatch({
      type: "dispatch",
      id: "req_0011",
      operation: "tidy_qa_build_checklist_sim",
      params: {},
    });
    const error = errorOf(refused);

    // An agent that cannot tell *what* it is waiting behind has no way to
    // decide whether waiting is reasonable, so the name is the message's job.
    expect(error.message).toContain("tidy_qa_run_sim");
    expect(error.message).toMatch(/wait/i);
    // Recoverable: waiting fixes this, unlike an unknown operation.
    expect(error.recoverable).toBe(true);

    first.finish();
    await running;
  });

  it("releases the slot when a handler throws, so one failure cannot lock the session out", async () => {
    registerOperation(spec("test_throws"), async () => {
      throw new Error("handler blew up");
    });
    registerOperation(spec("test_after_throw"), async () => "ran anyway");

    const failed = await dispatch({
      type: "dispatch",
      id: "req_0020",
      operation: "test_throws",
      params: {},
    });
    expect(errorOf(failed).code).toBe("INTERNAL");

    const next = await dispatch({
      type: "dispatch",
      id: "req_0021",
      operation: "test_after_throw",
      params: {},
    });

    expect(next.ok).toBe(true);
  });

  it("refuses a second run against a different target too, because the probe sweep is page-scoped", async () => {
    const first = blockingHandler();
    registerOperation(spec("tidy_qa_run_targets"), first.handler);

    const running = dispatch({
      type: "dispatch",
      id: "req_0030",
      operation: "tidy_qa_run_targets",
      params: { nodeId: "1:100" },
    });
    const refused = await dispatch({
      type: "dispatch",
      id: "req_0031",
      operation: "tidy_qa_run_targets",
      params: { nodeId: "9:900" },
    });

    // A per-target guard would have let this through, and it is exactly the
    // case that corrupts: the QA probes sweep stray probe nodes across the
    // whole page, so a run against another component still deletes this
    // run's live probe.
    expect(errorOf(refused).code).toBe("BUSY");

    first.finish();
    await running;
  });

  it("refuses without waiting for the running Operation, and frees the slot when it ends", async () => {
    const first = blockingHandler();
    registerOperation(spec("test_immediate"), first.handler);

    let firstSettled = false;
    const running = dispatch({
      type: "dispatch",
      id: "req_0040",
      operation: "test_immediate",
      params: {},
    }).then((res) => {
      firstSettled = true;
      return res;
    });

    const refused = await dispatch({
      type: "dispatch",
      id: "req_0041",
      operation: "test_immediate",
      params: {},
    });

    expect(errorOf(refused).code).toBe("BUSY");
    // The refusal came back while the first was still open. A queued call
    // would have sat here spending the caller's Bridge budget instead.
    expect(firstSettled).toBe(false);
    // The run is reachable while it holds the slot - this is the state #183
    // extends with a cancel handle, rather than opening a second registry.
    expect(runningOperation()).toEqual({
      operation: "test_immediate",
      requestId: "req_0040",
    });

    first.finish();
    await running;

    expect(runningOperation()).toBeNull();
  });
});

describe("asking a running Operation to stop", () => {
  it("treats a cancellation naming an Operation that already finished as a no-op", async () => {
    registerOperation(spec("test_quick_run"), async () => "done");

    await dispatch({
      type: "dispatch",
      id: "req_0100",
      operation: "test_quick_run",
      params: {},
    });

    // The reply and the Bridge's timeout can cross, so this arrives routinely
    // and is not an error: by the time it lands, the run it names has already
    // answered and there is nothing left to stop.
    await expect(requestCancellation("req_0100")).resolves.toEqual({
      type: "cancel_result",
      id: "req_0100",
      status: "not_running",
    });
  });

  it("treats a cancellation naming a different run than the open one as a no-op", async () => {
    const first = blockingHandler();
    registerOperation(spec("test_other_id"), first.handler);

    const running = dispatch({
      type: "dispatch",
      id: "req_0110",
      operation: "test_other_id",
      params: {},
    });

    // A late cancel for a call that finished two runs ago must not stop the
    // run that happens to hold the slot now.
    await expect(requestCancellation("req_0109")).resolves.toEqual({
      type: "cancel_result",
      id: "req_0109",
      status: "not_running",
    });
    expect(runningOperation()).toMatchObject({ requestId: "req_0110" });

    first.finish();
    await running;
  });

  it("reports an Operation that does not check a token as not stopped, and leaves it running", async () => {
    const first = blockingHandler();
    registerOperation(spec("test_uninterruptible"), first.handler);

    const running = dispatch({
      type: "dispatch",
      id: "req_0120",
      operation: "test_uninterruptible",
      params: {},
    });

    // The truthful answer for every Operation in the plugin today. Cancellation
    // here is cooperative and always will be, so a loop that never asks whether
    // it should stop cannot be stopped - and saying otherwise would be a worse
    // lie than the silence #178 exists to fix.
    await expect(requestCancellation("req_0120")).resolves.toEqual({
      type: "cancel_result",
      id: "req_0120",
      status: "not_cancellable",
      operation: "test_uninterruptible",
    });
    expect(runningOperation()).toMatchObject({ requestId: "req_0120" });

    first.finish();
    await running;
  });

  it("cancels a declaring Operation's token and reports the stop once the run ends", async () => {
    let sawCancellation = false;
    registerOperation(
      { ...spec("test_cancellable"), cancellable: true },
      async (_params, ctx) => {
        // The shape every adopter takes: check between units of work, and
        // yield, so the cancellation message gets a turn on the queue at all.
        while (!ctx.cancellation.isCancelled) await yieldToMain();
        sawCancellation = true;
        return "stopped early";
      },
    );

    const running = dispatch({
      type: "dispatch",
      id: "req_0130",
      operation: "test_cancellable",
      params: {},
    });

    await expect(requestCancellation("req_0130")).resolves.toEqual({
      type: "cancel_result",
      id: "req_0130",
      status: "stopped",
      operation: "test_cancellable",
    });

    // "stopped" is a claim about the loop, not about the clock: it is only
    // said when the run actually left dispatch after being asked.
    expect(sawCancellation).toBe(true);
    await running;
    expect(runningOperation()).toBeNull();
  });

  it("reports a declaring Operation that has not reached its checkpoint as still running", async () => {
    const first = blockingHandler();
    registerOperation(
      { ...spec("test_slow_checkpoint"), cancellable: true },
      first.handler,
    );

    const running = dispatch({
      type: "dispatch",
      id: "req_0140",
      operation: "test_slow_checkpoint",
      params: {},
    });

    // Declaring a checkpoint is not reaching one. This is the honest half of
    // the grace: asked, has somewhere to stop, has not stopped yet.
    await expect(requestCancellation("req_0140", 10)).resolves.toEqual({
      type: "cancel_result",
      id: "req_0140",
      status: "still_running",
      operation: "test_slow_checkpoint",
    });
    expect(runningOperation()).toMatchObject({ requestId: "req_0140" });

    first.finish();
    await running;
  });
});
