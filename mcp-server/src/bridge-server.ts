// MCP-server-side half of the Bridge. Listens on 127.0.0.1:9876 (no auth per
// ADR-0005) and accepts the plugin's outbound WebSocket connection. The
// plugin can only dial outbound (sandbox), so the *server* lives here even
// though we think of the plugin as the work surface.
//
// MVP supports one Session at a time (CONTEXT.md). If a second client tries
// to connect while one is already attached, we close the second with a
// MULTI_CONNECT reason so the user sees a clear error.

import { WebSocketServer, WebSocket } from "ws";
import type {
  BridgeRequest,
  BridgeResponse,
  BridgeErrorPayload,
  OperationKind,
} from "../../src/shared/operations/types.ts";
import { buildTimeoutMessage } from "./timeout-message.ts";

export type BridgeError = BridgeErrorPayload;

/** Per-call knobs the catalogue entry supplies. */
export interface CallOptions {
  /**
   * The Operation's declared kind. Required, not optional: it decides what a
   * timeout tells the caller, and an Operation that forgot to say whether it
   * writes would get advice that could double a write.
   */
  kind: OperationKind;
  /** Bridge timeout override; falls back to DEFAULT_CALL_TIMEOUT_MS. */
  timeoutMs?: number;
}

interface Pending {
  resolve: (result: unknown) => void;
  reject: (err: BridgeError) => void;
  timer: NodeJS.Timeout;
}

/** Exported so the UI-side backstop can be held above every budget here. */
export const DEFAULT_CALL_TIMEOUT_MS = 30_000;
const WAIT_FOR_CLIENT_MS = 15_000;

export class BridgeServer {
  private client: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private nextId = 0;
  private host: string;
  private port: number;
  private clientWaiters: Array<() => void> = [];

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  /** Read-only view of whether a plugin is attached right now. */
  get connected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  private waitForClient(timeoutMs: number): Promise<boolean> {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.clientWaiters.indexOf(notify);
        if (idx >= 0) this.clientWaiters.splice(idx, 1);
        resolve(false);
      }, timeoutMs);
      const notify = () => {
        clearTimeout(timer);
        resolve(true);
      };
      this.clientWaiters.push(notify);
    });
  }

  async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ host: this.host, port: this.port });
      const onListening = () => {
        wss.off("error", onError);
        wss.on("connection", (ws) => this.onConnection(ws));
        wss.on("error", (err) => this.log(`server error: ${err.message}`));
        resolve();
      };
      const onError = (err: Error) => {
        wss.off("listening", onListening);
        reject(err);
      };
      wss.once("listening", onListening);
      wss.once("error", onError);
    });
  }

  async call<T = unknown>(
    operation: string,
    params: unknown,
    options: CallOptions,
  ): Promise<T> {
    const { kind, timeoutMs } = options;
    if (!this.client || this.client.readyState !== WebSocket.OPEN) {
      const arrived = await this.waitForClient(WAIT_FOR_CLIENT_MS);
      if (!arrived) {
        throw {
          code: "BRIDGE_DISCONNECTED",
          message:
            "Plugin is not connected. Open the Tidy DS Toolbox plugin in Figma; it will reconnect automatically.",
          recoverable: true,
        } satisfies BridgeError;
      }
    }
    const id = "req_" + (++this.nextId).toString().padStart(4, "0");
    const envelope: BridgeRequest = { id, operation, params };
    const effectiveTimeout = timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject({
          code: "TIMEOUT",
          // Wording comes from the Operation's declared `kind` (#182), so a
          // newly declared Operation is worded correctly with no edit here.
          message: buildTimeoutMessage(operation, kind, effectiveTimeout),
          recoverable: true,
        } satisfies BridgeError);
      }, effectiveTimeout);

      this.pending.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
        timer,
      });

      /**
       * Ends the call now, taking the timer and the map entry with it. The
       * delete result is the guard against settling twice: a send that reports
       * a write error after the plugin has already answered finds no entry.
       */
      const undeliverable = (detail: string) => {
        if (!this.pending.delete(id)) return;
        clearTimeout(timer);
        reject({
          code: "BRIDGE_DISCONNECTED",
          // Safe to retry whatever the Operation's kind: nothing was
          // delivered, so not even a write can have half-run.
          message: `${detail} Open the Tidy DS Toolbox plugin in Figma; it will reconnect automatically, then call ${operation} again.`,
          recoverable: true,
        } satisfies BridgeError);
      };

      // Read the socket once. `waitForClient` above only promises that a client
      // *arrived*, not that it is still here, and a bare `this.client!.send`
      // answers a disconnect with `INTERNAL: Cannot read properties of null` —
      // an untyped error the agent cannot act on, leaving the entry to sit
      // until the timeout it should have pre-empted.
      const client = this.client;
      if (!client || client.readyState !== WebSocket.OPEN) {
        undeliverable("The plugin disconnected before the request was sent.");
        return;
      }
      try {
        client.send(JSON.stringify(envelope), (err) => {
          if (err)
            undeliverable(`The request could not be sent: ${err.message}.`);
        });
      } catch (err) {
        undeliverable(
          `The request could not be sent: ${(err as Error).message}.`,
        );
      }
    });
  }

  private onConnection(ws: WebSocket): void {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      this.log("rejecting second plugin connection — one Session at a time");
      ws.close(1008, "another plugin instance is already connected");
      return;
    }
    this.log("plugin connected");
    this.client = ws;
    ws.on("message", (data) => this.onMessage(data.toString()));
    ws.on("close", () => this.onClientClose(ws));
    ws.on("error", (err) => this.log(`client socket error: ${err.message}`));
    const waiters = this.clientWaiters.splice(0);
    for (const w of waiters) w();
  }

  private onMessage(raw: string): void {
    let msg: BridgeResponse;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.log(`dropping malformed message: ${raw.slice(0, 80)}`);
      return;
    }
    const pending = this.pending.get(msg.id);
    if (!pending) {
      this.log(`response for unknown id ${msg.id}`);
      return;
    }
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.ok) pending.resolve(msg.result);
    else pending.reject(msg.error);
  }

  private onClientClose(ws: WebSocket): void {
    if (this.client !== ws) return; // a rejected secondary connection
    this.log("plugin disconnected");
    this.client = null;
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject({
        code: "BRIDGE_DISCONNECTED",
        message: "Bridge closed while operation was in flight",
        recoverable: true,
      });
    }
    this.pending.clear();
  }

  private log(msg: string): void {
    process.stderr.write(`[bridge] ${msg}\n`);
  }
}
