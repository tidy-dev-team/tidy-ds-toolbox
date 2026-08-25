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
  BridgeCancel,
  BridgeCancelResult,
  BridgeHello,
  BridgeRequest,
  BridgeResponse,
  BridgeErrorPayload,
  OperationKind,
} from "../../src/shared/operations/types.ts";
import { buildTimeoutMessage } from "./timeout-message.ts";
import {
  describeRefusedOrigin,
  isAllowedBridgeOrigin,
} from "./origin-policy.ts";
import {
  SERVER_VERSION,
  describeVersionMatch,
  versionSkewNote,
} from "./version-report.ts";

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

/**
 * Whether a frame from the plugin is a cancellation report rather than an
 * answer to a call.
 *
 * A predicate rather than a bare `msg.type ===` because only one side of this
 * direction carries a discriminator: a `BridgeResponse` is identified by `ok`,
 * and stamping a `type` on it to make a tidy union would rewrite every
 * response construction in the plugin for no behaviour. The request direction
 * is a real discriminated union (#183); this direction is a report told apart
 * from an answer, which is all it needs to be.
 */
function isCancelResult(msg: PluginFrame): msg is BridgeCancelResult {
  return (msg as BridgeCancelResult).type === "cancel_result";
}

/**
 * Whether a frame is the plugin announcing its build (#189).
 *
 * Told apart on the same principle as a cancel report: this direction has no
 * discriminator on every member, because a `BridgeResponse` is identified by
 * `ok` and stamping a `type` on it would rewrite every response construction
 * in the plugin for no behaviour.
 */
function isHello(msg: PluginFrame): msg is BridgeHello {
  return (msg as BridgeHello).type === "hello";
}

/** Everything the plugin can send back over the Bridge. */
type PluginFrame = BridgeResponse | BridgeCancelResult | BridgeHello;

/** Exported so the UI-side backstop can be held above every budget here. */
export const DEFAULT_CALL_TIMEOUT_MS = 30_000;
const WAIT_FOR_CLIENT_MS = 15_000;

/**
 * Largest frame the Bridge will accept, replacing `ws`'s 100 MB default.
 *
 * Held well above anything the plugin sends and well below "as much memory as
 * the sender feels like spending": the biggest real frames are the rendered
 * PNGs an image-returning Operation answers with, which are megabytes, not tens
 * of them. A frame over the cap closes the socket rather than being buffered,
 * and the plugin reconnects, so the cost of setting this too low is a visible
 * reconnect loop rather than a silently truncated answer.
 */
const MAX_FRAME_BYTES = 32 * 1024 * 1024;

export class BridgeServer {
  private client: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private nextId = 0;
  private host: string;
  private port: number;
  private clientWaiters: Array<() => void> = [];
  /**
   * What the attached plugin said it was, from its hello (#189). Held so a
   * failing call can name the skew, because the connect-time log that already
   * reports it never reaches the session: Claude Code captures this process's
   * stderr only until the MCP transport comes up.
   */
  private pluginVersion: string | undefined;

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
      const wss = new WebSocketServer({
        host: this.host,
        port: this.port,
        maxPayload: MAX_FRAME_BYTES,
        // Refused at the handshake, before a socket exists. Doing it here
        // rather than in `onConnection` is what makes the refusal cost the
        // caller a 401 instead of the single client slot: a page rejected
        // after connecting has already displaced whoever held it.
        // `origin` is typed optional against ws's own `string`, because the
        // header genuinely can be absent and the policy has a deliberate answer
        // for that case. Narrowing it here would make this file and
        // `origin-policy.ts` disagree about the domain concept.
        verifyClient: ({ origin }: { origin: string | undefined }) => {
          if (!isAllowedBridgeOrigin(origin)) {
            this.log(describeRefusedOrigin(origin));
            return false;
          }
          // Said out loud on the way in, and only when there is something to
          // say. If Figma ever serves the plugin UI from an origin this policy
          // does not know, the refusal above is the symptom and this line is
          // the diagnosis - without it, "the plugin stopped connecting" and
          // "the plugin is not running" look the same from here.
          if (origin) this.log(`handshake from origin ${origin}`);
          return true;
        },
      });
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
    const envelope: BridgeRequest = { type: "dispatch", id, operation, params };
    const effectiveTimeout = timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject({
          code: "TIMEOUT",
          // Wording comes from the Operation's declared `kind` (#182), so a
          // newly declared Operation is worded correctly with no edit here.
          // A stale server fails by not understanding a newer request: #183's
          // routing drops an envelope of an unrecognised kind, so nothing
          // answers and the call runs out its budget. That is identical to
          // slow work from here, which is why the skew is named at the
          // timeout rather than left in a log nobody can read (#189).
          message: [
            buildTimeoutMessage(operation, kind, effectiveTimeout),
            versionSkewNote(SERVER_VERSION, this.pluginVersion),
          ]
            .filter(Boolean)
            .join(" "),
          recoverable: true,
        } satisfies BridgeError);
        // Giving up listening is not the same as the work stopping (#183).
        // Told nothing, the plugin keeps running - on a write, that is a run
        // nobody is watching, still changing the file. Asking is all this end
        // can do; whether it achieves anything comes back as a cancel report.
        this.requestCancel(
          id,
          `the Bridge stopped waiting for ${operation} after ${effectiveTimeout}ms`,
        );
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

  /**
   * Asks the plugin to stop the run under `id`. Fire and forget, by design.
   *
   * Nothing here may throw or reject. The caller has already been answered by
   * the time this runs, so there is nobody left to report a failure to - and a
   * stop request that broke the call it followed would be worse than the
   * silence it replaces. Every failure ends as a log line.
   */
  private requestCancel(id: string, reason: string): void {
    try {
      const client = this.client;
      if (!client || client.readyState !== WebSocket.OPEN) {
        this.log(`cannot ask ${id} to stop: plugin not connected`);
        return;
      }
      const envelope: BridgeCancel = { type: "cancel", id, reason };
      client.send(JSON.stringify(envelope), (err) => {
        if (err) this.log(`cancel for ${id} could not be sent: ${err.message}`);
      });
    } catch (err) {
      this.log(`cancel for ${id} failed: ${(err as Error).message}`);
    }
  }

  private onConnection(ws: WebSocket): void {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      this.log("rejecting second plugin connection — one Session at a time");
      ws.close(1008, "another plugin instance is already connected");
      return;
    }
    // The version comparison arrives separately, in the plugin's hello (#189).
    // Saying it is awaited makes its *absence* legible: a plugin old enough not
    // to send one leaves this line with nothing after it.
    this.log("plugin connected (awaiting version)");
    this.client = ws;
    ws.on("message", (data) => this.onMessage(data.toString()));
    ws.on("close", () => this.onClientClose(ws));
    ws.on("error", (err) => this.log(`client socket error: ${err.message}`));
    const waiters = this.clientWaiters.splice(0);
    for (const w of waiters) w();
  }

  private onMessage(raw: string): void {
    let msg: PluginFrame;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.log(`dropping malformed message: ${raw.slice(0, 80)}`);
      return;
    }
    // A cancel report carries the id of the call it names, and that call is
    // routinely still pending - the reply and the timeout can cross. Matched
    // against the pending map it would settle a live call with neither a
    // result nor an error, so it is routed out first, on its own kind.
    if (isCancelResult(msg)) {
      this.onCancelResult(msg);
      return;
    }
    // Routed out before the pending lookup for the same reason as a cancel
    // report: a hello carries no id, so matching it against the map would log
    // it as a response for an unknown id and say nothing useful.
    if (isHello(msg)) {
      this.pluginVersion = msg.version;
      this.log(describeVersionMatch(SERVER_VERSION, msg.version));
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

  /**
   * Records what asking a run to stop achieved.
   *
   * A log line and nothing more: the call this names was answered when the
   * Bridge stopped waiting, so there is no caller left to return it to. The
   * value is to the person watching, who otherwise cannot tell a run that
   * obeyed from one still writing to the file.
   */
  private onCancelResult(msg: BridgeCancelResult): void {
    const what = msg.operation ? `${msg.operation} (${msg.id})` : msg.id;
    switch (msg.status) {
      case "stopped":
        this.log(`${what} was asked to stop, and stopped`);
        return;
      case "not_running":
        this.log(`${what} had already finished when the stop request arrived`);
        return;
      case "not_cancellable":
        this.log(
          `${what} cannot be stopped - it does not check for cancellation - and is still running`,
        );
        return;
      case "still_running":
        this.log(`${what} was asked to stop and had not stopped yet`);
        return;
      default:
        this.log(
          `${what} was asked to stop; the plugin did not say what happened`,
        );
    }
  }

  private onClientClose(ws: WebSocket): void {
    if (this.client !== ws) return; // a rejected secondary connection
    this.log("plugin disconnected");
    this.client = null;
    // Forgotten with the socket: the next plugin to attach may be a different
    // build, and a remembered version would outlive the thing it described.
    this.pluginVersion = undefined;
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
