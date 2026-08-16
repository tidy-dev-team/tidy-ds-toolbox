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
} from "./registry";
import type { BridgeResponse, OperationSpec } from "./types";

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
      id: "req_0001",
      operation: "test_slow_run",
      params: {},
    });
    const refused = await dispatch({
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
      id: "req_0010",
      operation: "tidy_qa_run_sim",
      params: {},
    });
    const refused = await dispatch({
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
      id: "req_0020",
      operation: "test_throws",
      params: {},
    });
    expect(errorOf(failed).code).toBe("INTERNAL");

    const next = await dispatch({
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
      id: "req_0030",
      operation: "tidy_qa_run_targets",
      params: { nodeId: "1:100" },
    });
    const refused = await dispatch({
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
      id: "req_0040",
      operation: "test_immediate",
      params: {},
    }).then((res) => {
      firstSettled = true;
      return res;
    });

    const refused = await dispatch({
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
