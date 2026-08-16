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

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer } from "node:net";
import { WebSocket as NodeWebSocket } from "ws";
import { BridgeServer, type BridgeError } from "./bridge-server.ts";
import { UiBridge } from "../../src/shared/operations/ui-bridge.ts";
import { MainDispatcher } from "../../src/shared/operations/main-dispatcher.ts";
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
  main: (requestId: string, dispatcher: MainDispatcher) => void,
): Promise<BridgeServer> {
  const port = await freePort();
  const server = new BridgeServer("127.0.0.1", port);
  await server.listen();

  const dispatcher = new MainDispatcher({
    post: (message) => main(message.requestId, dispatcher),
  });
  const ui = new UiBridge({
    url: `ws://127.0.0.1:${port}`,
    dispatch: (req) => dispatcher.dispatch(req),
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
    const server = await connectHalves((requestId, dispatcher) => {
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
    const server = await connectHalves((requestId, dispatcher) => {
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
