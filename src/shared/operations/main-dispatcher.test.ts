import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MainDispatcher,
  UI_BACKSTOP_MS,
  type MainRequestMessage,
} from "./main-dispatcher";
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
      id: "req_0001",
      operation: "tidy_qa_run",
      params: {},
    });
    const abandoned = [
      dispatcher.dispatch({ id: "req_0002", operation: "x", params: {} }),
      dispatcher.dispatch({ id: "req_0003", operation: "y", params: {} }),
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
