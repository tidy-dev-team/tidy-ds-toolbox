// Both halves of the Bridge over a real socket, with a stand-in for the plugin
// main thread. This is the closest an in-process test gets to what an agent
// experiences: MCP server -> socket -> UiBridge -> MainDispatcher -> "main".
//
// It exists for the id contract (#180). The two halves key their pending maps
// on different ids — the MCP server on the envelope's `req_NNNN`, the UI on the
// `mcp_N_req_NNNN` the main thread echoes back — and an answer sent under the
// wrong one is dropped as unknown, so the caller waits out its whole budget and
// is told the plugin never responded. A short budget here turns that failure
// into a `TIMEOUT` code rather than a slow test.

import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { createServer } from "node:net";
import { WebSocket as NodeWebSocket } from "ws";
import { BridgeServer, type BridgeError } from "./bridge-server.ts";
import { UiBridge } from "../../src/shared/operations/ui-bridge.ts";
import {
  MainDispatcher,
  type MainRequestMessage,
} from "../../src/shared/operations/main-dispatcher.ts";
import {
  bindSession,
  dispatch as registryDispatch,
  registerOperation,
  requestCancellation,
} from "../../src/shared/operations/registry.ts";
import { yieldToMain } from "../../src/shared/cancellation.ts";
import type { BridgeResponse } from "../../src/shared/operations/types.ts";

/** UiBridge dials the global WebSocket; Node's is not guaranteed at our floor. */
vi.stubGlobal("WebSocket", NodeWebSocket);

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

const running: UiBridge[] = [];
afterEach(() => {
  for (const bridge of running.splice(0)) bridge.stop();
});

/**
 * Stands the plugin up: a Bridge server, the UI half dialling it, and `main`
 * as the fake main thread answering whatever the dispatcher posts.
 */
async function connectHalves(
  main: (message: MainRequestMessage, dispatcher: MainDispatcher) => void,
): Promise<BridgeServer> {
  const port = await freePort();
  const server = new BridgeServer("127.0.0.1", port);
  await server.listen();

  const dispatcher = new MainDispatcher({
    post: (message) => main(message, dispatcher),
  });
  const ui = new UiBridge({
    url: `ws://127.0.0.1:${port}`,
    dispatch: (req) => dispatcher.dispatch(req),
    cancel: (env) => dispatcher.cancel(env),
  });
  running.push(ui);
  await new Promise<void>((resolve) => {
    ui.start();
    const poll = setInterval(() => {
      if (server.connected) {
        clearInterval(poll);
        resolve();
      }
    }, 5);
  });
  return server;
}

describe("Bridge round trip", () => {
  it("gives the caller the main thread's own error, not a timeout", async () => {
    const server = await connectHalves(({ requestId }, dispatcher) => {
      dispatcher.handleMessage({
        type: "error",
        requestId,
        error: "Unknown mcp-bridge action: dispatchh",
      });
    });

    const err = await server
      .call("tidy_doc_build_page", {}, { kind: "execute", timeoutMs: 500 })
      .then(() => null)
      .catch((e: BridgeError) => e);

    expect(err).toMatchObject({
      code: "INTERNAL",
      message: "Unknown mcp-bridge action: dispatchh",
    });
  });

  it("gives the caller a result the main thread produced", async () => {
    const server = await connectHalves(({ requestId }, dispatcher) => {
      const result: BridgeResponse = {
        // Main answers under the Bridge id it was handed, which is not the id
        // the UI half keys its own pending map on.
        id: requestId.replace(/^mcp_\d+_/, ""),
        ok: true,
        result: { pages: ["Cover", "Components"] },
      };
      dispatcher.handleMessage({ type: "response", requestId, result });
    });

    await expect(
      server.call(
        "tidy_file_list_pages",
        {},
        { kind: "query", timeoutMs: 500 },
      ),
    ).resolves.toEqual({ pages: ["Cover", "Components"] });
  });
});

/**
 * The whole of #183 over a real socket: a Bridge timeout reaching the token of
 * the Operation it named, and the answer coming back.
 *
 * `main` here is the plugin main thread's routing from `moduleHandlers.ts` -
 * dispatch to the registry, cancel to `requestCancellation` - against the real
 * registry. Nothing about the path is stubbed except Figma, which neither half
 * touches.
 */
async function connectToRegistry(): Promise<BridgeServer> {
  return connectHalves(async (message, dispatcher) => {
    const result =
      message.action === "dispatch"
        ? await registryDispatch(message.payload)
        : await requestCancellation(message.payload.id, 1_000);
    dispatcher.handleMessage({
      type: "response",
      requestId: message.requestId,
      result,
    });
  });
}

/** Polls until `done`, so a socket hop is not raced on a bare microtask tick. */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 400 && !done(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("a Bridge timeout reaching the Operation it timed out on", () => {
  beforeAll(() => bindSession("roundtrip-session"));

  it("cancels the token of a run that checks it, and reports the stop", async () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    let sawCancellation = false;
    registerOperation(
      {
        id: "test_roundtrip_cancellable",
        kind: "execute",
        module: "test",
        summary: "a run that checks its token",
        paramsExample: {},
        cancellable: true,
      },
      async (_params, ctx) => {
        while (!ctx.cancellation.isCancelled) await yieldToMain();
        sawCancellation = true;
        return "stopped early";
      },
    );

    const server = await connectToRegistry();

    await expect(
      server.call(
        "test_roundtrip_cancellable",
        {},
        { kind: "execute", timeoutMs: 100 },
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });

    // The caller was answered at the timeout. What follows is the run being
    // told, which is the whole point: without it the handler above loops for
    // the rest of the Session with nobody waiting on it.
    await until(() => sawCancellation);
    expect(sawCancellation).toBe(true);

    await until(() => stderr.join("").includes("and stopped"));
    expect(stderr.join("")).toContain(
      "test_roundtrip_cancellable (req_0001) was asked to stop, and stopped",
    );
  });

  it("reports a run that cannot be stopped as still running, and never as stopped", async () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    registerOperation(
      {
        id: "test_roundtrip_uninterruptible",
        kind: "execute",
        module: "test",
        summary: "a run with no checkpoint, like every Operation today",
        paramsExample: {},
      },
      async () => {
        await gate;
        return "finished on its own";
      },
    );

    const server = await connectToRegistry();

    await expect(
      server.call(
        "test_roundtrip_uninterruptible",
        {},
        { kind: "execute", timeoutMs: 100 },
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });

    await until(() => stderr.join("").includes("cannot be stopped"));
    const log = stderr.join("");
    expect(log).toContain(
      "test_roundtrip_uninterruptible (req_0001) cannot be stopped",
    );
    expect(log).toContain("is still running");
    // The claim that must never be made about a loop with no checkpoint.
    expect(log).not.toContain("and stopped");

    release();
  });
});
