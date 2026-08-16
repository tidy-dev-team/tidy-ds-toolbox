// UiBridge's envelope routing (#183).
//
// The seam is the socket: frames arrive, and what the UI half does with each
// one is the behaviour under test. The global `WebSocket` is a browser API,
// so it is faked here rather than dialled - that keeps the test free of a
// listening port and lets a frame be delivered synchronously.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { UiBridge } from "./ui-bridge";
import type {
  BridgeCancel,
  BridgeCancelResult,
  BridgeRequest,
  BridgeResponse,
} from "./types";

/** Minimal stand-in for the browser WebSocket UiBridge dials. */
class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  private listeners = new Map<string, Array<(ev: unknown) => unknown>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (ev: unknown) => unknown): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  /** Fires the open handshake the way the socket would once connected. */
  open(): void {
    for (const fn of this.listeners.get("open") ?? []) fn({});
  }

  /** Delivers a raw frame the way the socket would, and settles its handling. */
  async deliver(raw: string): Promise<void> {
    const results = (this.listeners.get("message") ?? []).map((fn) =>
      fn({ data: raw }),
    );
    await Promise.all(results);
  }

  /** Everything the bridge has sent back, parsed. */
  frames(): unknown[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

interface Harness {
  socket: FakeWebSocket;
  dispatched: BridgeRequest[];
  cancelled: BridgeCancel[];
  logs: string[];
}

function startBridge(
  overrides: {
    dispatch?: (req: BridgeRequest) => Promise<BridgeResponse>;
    cancel?: (env: BridgeCancel) => Promise<BridgeCancelResult>;
    version?: string;
  } = {},
): Harness {
  const dispatched: BridgeRequest[] = [];
  const cancelled: BridgeCancel[] = [];
  const logs: string[] = [];
  const bridge = new UiBridge({
    url: "ws://localhost:9876",
    log: (m) => logs.push(m),
    version: overrides.version,
    dispatch:
      overrides.dispatch ??
      (async (req) => {
        dispatched.push(req);
        return { id: req.id, ok: true, result: null };
      }),
    cancel:
      overrides.cancel ??
      (async (env) => {
        cancelled.push(env);
        return { type: "cancel_result", id: env.id, status: "not_running" };
      }),
  });
  bridge.start();
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!socket) throw new Error("UiBridge dialled no socket");
  return { socket, dispatched, cancelled, logs };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

describe("UiBridge envelope routing", () => {
  it("drops an envelope of an unrecognised kind, with a log, and keeps serving", async () => {
    const { socket, dispatched, logs } = startBridge();

    await socket.deliver(
      JSON.stringify({ type: "reticulate", id: "req_0001", operation: "x" }),
    );

    // Never mistaken for a dispatch, and never answered - the MCP server keys
    // its pending map on ids it sent, so an answer to a frame it does not
    // understand has nowhere to land.
    expect(dispatched).toEqual([]);
    expect(socket.sent).toEqual([]);
    expect(logs.join("\n")).toContain("reticulate");

    // The socket survives the unknown frame: a real dispatch still works.
    await socket.deliver(
      JSON.stringify({
        type: "dispatch",
        id: "req_0002",
        operation: "tidy_qa_run",
        params: {},
      }),
    );
    expect(dispatched.map((r) => r.id)).toEqual(["req_0002"]);
  });

  it("routes a cancellation to the cancel path and sends its report back", async () => {
    const { socket, dispatched, cancelled } = startBridge({
      cancel: async (env) => ({
        type: "cancel_result",
        id: env.id,
        status: "not_cancellable",
        operation: "tidy_qa_run",
      }),
    });

    await socket.deliver(
      JSON.stringify({
        type: "cancel",
        id: "req_0003",
        reason: "the Bridge stopped waiting after 60000ms",
      }),
    );

    // Never run as a call, and the report goes back under the id the Bridge
    // named - the only id the server side can match it to.
    expect(dispatched).toEqual([]);
    expect(cancelled).toEqual([]);
    expect(socket.frames()).toEqual([
      {
        type: "cancel_result",
        id: "req_0003",
        status: "not_cancellable",
        operation: "tidy_qa_run",
      },
    ]);
  });

  it("swallows a failure in the cancel path, and still claims nothing", async () => {
    const { socket, logs } = startBridge({
      cancel: async () => {
        throw new Error("registry exploded");
      },
    });

    await socket.deliver(
      JSON.stringify({
        type: "cancel",
        id: "req_0004",
        reason: "the Bridge stopped waiting after 30000ms",
      }),
    );

    // A broken stop request must not become a broken Operation, so it dies
    // here as a log line. What goes back says only that nothing is known.
    expect(logs.join("\n")).toContain("registry exploded");
    expect(socket.frames()).toEqual([
      { type: "cancel_result", id: "req_0004", status: "unknown" },
    ]);
  });
});

describe("UiBridge version handshake (#189)", () => {
  it("announces its build to the server as the first frame after connecting", () => {
    const { socket } = startBridge({ version: "1.17.2" });

    socket.open();

    // First, and before any Operation can be dispatched: the whole point is
    // that a mismatch is known at connect rather than inferred later from an
    // inexplicable timeout.
    expect(socket.frames()[0]).toEqual({ type: "hello", version: "1.17.2" });
  });

  it("still announces itself when the build carries no version, rather than staying silent", () => {
    const { socket } = startBridge({ version: undefined });

    socket.open();

    // Silence and "I have no version" are different facts, and only one of
    // them the server can act on. A hello with no version is reported as
    // older than the server; no hello at all leaves it guessing.
    expect(socket.frames()[0]).toEqual({ type: "hello" });
  });

  it("re-announces on a reconnect, so a plugin reloaded mid-session is noticed", () => {
    const { socket } = startBridge({ version: "1.17.2" });

    socket.open();
    socket.open();

    // A designer reopening the plugin in Figma is exactly how the halves come
    // back into step, so the server has to hear about it rather than keeping
    // the version it was told the first time.
    expect(socket.frames()).toEqual([
      { type: "hello", version: "1.17.2" },
      { type: "hello", version: "1.17.2" },
    ]);
  });
});
