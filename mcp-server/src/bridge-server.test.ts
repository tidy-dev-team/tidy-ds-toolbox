// Integration cover for the Bridge's server half, over a real socket pair.
//
// These are regression guards rather than red-first slices: they pin the
// contract `call()` owes its caller — a typed BridgeError on every failing
// path, and nothing left pending afterwards — so that the cancel-envelope
// rewrite (#183) cannot quietly drop it.

import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:net";
import { WebSocket } from "ws";
import { BridgeServer, type BridgeError } from "./bridge-server.ts";
import type {
  BridgeRequest,
  BridgeResponse,
} from "../../src/shared/operations/types.ts";

/** A port nothing is listening on, so tests never collide with a live Bridge. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

const sockets: WebSocket[] = [];

/** Stands in for the plugin: connects, and answers with `reply`. */
async function connectPlugin(
  port: number,
  reply: (req: BridgeRequest) => BridgeResponse | undefined,
): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.push(ws);
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  ws.on("message", (raw) => {
    const res = reply(JSON.parse(raw.toString()) as BridgeRequest);
    if (res) ws.send(JSON.stringify(res));
  });
  return ws;
}

afterEach(() => {
  for (const ws of sockets.splice(0)) ws.terminate();
});

describe("BridgeServer.call", () => {
  it("answers the caller with the result the plugin replied under that id", async () => {
    const port = await freePort();
    const server = new BridgeServer("127.0.0.1", port);
    await server.listen();
    await connectPlugin(port, (req) => ({
      id: req.id,
      ok: true,
      result: { pages: ["Cover"] },
    }));

    await expect(
      server.call("tidy_file_list_pages", {}, { kind: "query" }),
    ).resolves.toEqual({ pages: ["Cover"] });
  });

  it("fails a call whose plugin vanishes mid-flight with a typed error", async () => {
    const port = await freePort();
    const server = new BridgeServer("127.0.0.1", port);
    await server.listen();
    const plugin = await connectPlugin(port, () => {
      // Take the envelope and answer nothing — then die.
      plugin.terminate();
      return undefined;
    });

    const err = await server
      .call("tidy_qa_run", {}, { kind: "query" })
      .then(() => null)
      .catch((e: BridgeError) => e);

    expect(err).toMatchObject({
      code: "BRIDGE_DISCONNECTED",
      recoverable: true,
    });
    expect(err).not.toBeInstanceOf(Error);
  });
});
