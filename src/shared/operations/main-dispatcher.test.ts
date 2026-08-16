import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MainDispatcher,
  UI_BACKSTOP_MS,
  CANCEL_BACKSTOP_MS,
  type MainRequestMessage,
} from "./main-dispatcher";
import { CANCEL_GRACE_MS } from "./registry";
import { CATALOGUE } from "../../../mcp-server/src/catalogue";
import { DEFAULT_CALL_TIMEOUT_MS } from "../../../mcp-server/src/bridge-server";

function collector() {
  const posted: MainRequestMessage[] = [];
  const dispatcher = new MainDispatcher({ post: (m) => posted.push(m) });
  return { posted, dispatcher };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("MainDispatcher", () => {
  it("answers a main-thread error under the Bridge request id, not the UI one", async () => {
    const { posted, dispatcher } = collector();

    const answer = dispatcher.dispatch({
      type: "dispatch",
      id: "req_0007",
      operation: "tidy_doc_build_page",
      params: {},
    });
    const uiRequestId = posted[0].requestId;
    expect(uiRequestId).not.toBe("req_0007");

    dispatcher.handleMessage({
      type: "error",
      requestId: uiRequestId,
      error: "component is not a component set",
    });

    const res = await answer;
    expect(res.id).toBe("req_0007");
    expect(res).toMatchObject({
      ok: false,
      error: { code: "INTERNAL", message: "component is not a component set" },
    });
  });

  it("settles requests main never answers, and holds none of them afterwards", async () => {
    vi.useFakeTimers();
    const { posted, dispatcher } = collector();

    const answered = dispatcher.dispatch({
      type: "dispatch",
      id: "req_0001",
      operation: "tidy_qa_run",
      params: {},
    });
    const abandoned = [
      dispatcher.dispatch({
        type: "dispatch",
        id: "req_0002",
        operation: "x",
        params: {},
      }),
      dispatcher.dispatch({
        type: "dispatch",
        id: "req_0003",
        operation: "y",
        params: {},
      }),
    ];
    expect(dispatcher.pendingCount()).toBe(3);

    dispatcher.handleMessage({
      type: "response",
      requestId: posted[0].requestId,
      result: { id: "req_0001", ok: true, result: { findings: [] } },
    });
    await expect(answered).resolves.toMatchObject({ ok: true });
    expect(dispatcher.pendingCount()).toBe(2);

    await vi.advanceTimersByTimeAsync(UI_BACKSTOP_MS);

    expect(await abandoned[0]).toMatchObject({
      id: "req_0002",
      ok: false,
      error: { code: "TIMEOUT" },
    });
    expect(await abandoned[1]).toMatchObject({ id: "req_0003", ok: false });
    expect(dispatcher.pendingCount()).toBe(0);
  });

  it("settles what is still in flight when the bridge closes", async () => {
    const { posted, dispatcher } = collector();

    const inFlight = dispatcher.dispatch({
      type: "dispatch",
      id: "req_0004",
      operation: "tidy_ds_template_run",
      params: {},
    });

    dispatcher.close();

    expect(await inFlight).toMatchObject({
      id: "req_0004",
      ok: false,
      error: { code: "BRIDGE_DISCONNECTED" },
    });
    expect(dispatcher.pendingCount()).toBe(0);

    // A reply that arrives after the close has nothing to answer.
    dispatcher.handleMessage({
      type: "response",
      requestId: posted[0].requestId,
      result: { id: "req_0004", ok: true, result: {} },
    });
    expect(dispatcher.pendingCount()).toBe(0);
  });
});

describe("MainDispatcher.cancel", () => {
  it("relays the cancellation to main and answers with the report main sends back", async () => {
    const { posted, dispatcher } = collector();

    const answer = dispatcher.cancel({
      type: "cancel",
      id: "req_0007",
      reason: "the Bridge stopped waiting after 60000ms",
    });

    // Routed as its own action, beside dispatch rather than through it: main
    // must never mistake a stop request for a call to run something.
    expect(posted[0]).toMatchObject({
      target: "mcp-bridge",
      action: "cancel",
      payload: { type: "cancel", id: "req_0007" },
    });

    dispatcher.handleMessage({
      type: "response",
      requestId: posted[0].requestId,
      result: {
        type: "cancel_result",
        id: "req_0007",
        status: "not_cancellable",
        operation: "tidy_qa_run",
      },
    });

    await expect(answer).resolves.toEqual({
      type: "cancel_result",
      id: "req_0007",
      status: "not_cancellable",
      operation: "tidy_qa_run",
    });
    expect(dispatcher.pendingCount()).toBe(0);
  });

  it("claims nothing about a cancellation main never answers", async () => {
    vi.useFakeTimers();
    const { dispatcher } = collector();

    const answer = dispatcher.cancel({
      type: "cancel",
      id: "req_0008",
      reason: "the Bridge stopped waiting after 30000ms",
    });
    await vi.advanceTimersByTimeAsync(CANCEL_BACKSTOP_MS);

    // Silence is not a stop, and it is not a refusal either. The plugin thread
    // being too wedged to answer is exactly when a made-up status would do the
    // most damage, so the report says only what is known.
    await expect(answer).resolves.toEqual({
      type: "cancel_result",
      id: "req_0008",
      status: "unknown",
    });
    expect(dispatcher.pendingCount()).toBe(0);
  });
});

describe("UI_BACKSTOP_MS", () => {
  // Not a behaviour test — a drift guard. The backstop is only ever meant to
  // stop a pending entry outliving the Session; the deadline a caller actually
  // meets must stay the Bridge's, whose wording explains what to do next.
  it("outlives every budget the MCP catalogue declares", () => {
    const longest = Math.max(
      DEFAULT_CALL_TIMEOUT_MS,
      ...CATALOGUE.map((entry) => entry.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS),
    );
    expect(UI_BACKSTOP_MS).toBeGreaterThan(longest);
  });
});

describe("CANCEL_BACKSTOP_MS", () => {
  // A drift guard, like the one above. The registry answers a cancellation
  // only after watching for the grace, so a backstop at or below that would
  // report `unknown` for stops that were about to be reported honestly.
  it("outlives the grace the registry waits before it answers", () => {
    expect(CANCEL_BACKSTOP_MS).toBeGreaterThan(CANCEL_GRACE_MS);
  });
});
