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
  BridgeCancelResult,
  BridgeEnvelope,
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
  reply: (
    env: BridgeEnvelope,
  ) => BridgeResponse | BridgeCancelResult | undefined,
): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.push(ws);
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  ws.on("message", (raw) => {
    const res = reply(JSON.parse(raw.toString()) as BridgeEnvelope);
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

/** Polls until `done` or gives up, so a socket hop is not raced on a bare tick. */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("BridgeServer cancellation (#183)", () => {
  it("asks the plugin to stop the call it has just stopped waiting for", async () => {
    const port = await freePort();
    const server = new BridgeServer("127.0.0.1", port);
    await server.listen();
    const received: BridgeEnvelope[] = [];
    await connectPlugin(port, (env) => {
      received.push(env);
      return undefined; // never answer - drive the call to its budget
    });

    const err = await server
      .call("tidy_qa_run", {}, { kind: "query", timeoutMs: 50 })
      .then(() => null)
      .catch((e: BridgeError) => e);
    expect(err).toMatchObject({ code: "TIMEOUT" });

    await until(() => received.length >= 2);

    // Sent at the moment the Bridge stopped listening, and naming the call it
    // abandoned. Without it the plugin keeps working for a caller that has
    // already been told the call failed.
    expect(received[1]).toMatchObject({
      type: "cancel",
      id: (received[0] as { id: string }).id,
    });
    expect((received[1] as { reason: string }).reason).toBeTruthy();
  });

  it("does not mistake a cancellation report for the answer to a call", async () => {
    const port = await freePort();
    const server = new BridgeServer("127.0.0.1", port);
    await server.listen();
    await connectPlugin(port, (env) => {
      if (env.type !== "dispatch") return undefined;
      // A late report for an earlier run can land while a newer call is open,
      // and it carries that run's id. Answered as if it were a BridgeResponse
      // it would settle the wrong promise with neither a result nor an error.
      return { type: "cancel_result", id: env.id, status: "still_running" };
    });

    const err = await server
      .call("tidy_qa_run", {}, { kind: "query", timeoutMs: 100 })
      .then(() => null)
      .catch((e: BridgeError) => e);

    expect(err).toMatchObject({ code: "TIMEOUT" });
  });
});

describe("BridgeServer handshake", () => {
  // The tab route ADR-0005 believed was closed. `Origin` is a forbidden
  // header, so a browser cannot omit or fake this one; refusing it at the
  // handshake is what stops a page taking the single client slot.
  it("refuses a handshake from a web page origin", async () => {
    const port = await freePort();
    const server = new BridgeServer("127.0.0.1", port);
    await server.listen();

    const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
      origin: "https://example.com",
    });
    sockets.push(ws);
    const outcome = await new Promise<string>((resolve) => {
      ws.once("open", () => resolve("open"));
      ws.once("error", (err) => resolve(err.message));
    });

    expect(outcome).not.toBe("open");
    expect(server.connected).toBe(false);
  });

  it("accepts the plugin, which presents a figma origin", async () => {
    const port = await freePort();
    const server = new BridgeServer("127.0.0.1", port);
    await server.listen();

    const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
      origin: "https://www.figma.com",
    });
    sockets.push(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });

    expect(server.connected).toBe(true);
  });
});
