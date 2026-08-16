// UI-thread half of the MCP Bridge. The plugin sandbox's main thread has no
// network access — only the UI iframe does — so this is where the WebSocket
// to the MCP server lives.
//
// Flow per incoming BridgeRequest from the MCP server:
//   socket → here → postToFigma({ target: "mcp-bridge", action: "dispatch" })
//          → plugin-main onmessage → moduleHandlers["mcp-bridge"]
//          → dispatch() → BridgeResponse → response message via postToUI
//          → here → socket.send(BridgeResponse)
//
// A BridgeCancel (#183) takes the same road under action "cancel" and comes
// back as a BridgeCancelResult. The two are held apart by the envelope's
// `type` at every hop, so a stop request can never be run as a call.
//
// Reconnect with exponential backoff (1s → 2s → … → 30s cap) while the plugin
// is open. The plugin opening / closing defines the Session lifetime.

import type {
  BridgeCancel,
  BridgeCancelResult,
  BridgeEnvelope,
  BridgeRequest,
  BridgeResponse,
  BridgeErrorPayload,
} from "./types";

const DEFAULT_URL = "ws://localhost:9876";
const MIN_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 10_000;

type DispatchFn = (req: BridgeRequest) => Promise<BridgeResponse>;
type CancelFn = (env: BridgeCancel) => Promise<BridgeCancelResult>;

export type BridgeStatus = "connecting" | "open" | "closed";

interface BridgeOptions {
  url?: string;
  dispatch: DispatchFn;
  cancel: CancelFn;
  log?: (msg: string) => void;
  onStatusChange?: (status: BridgeStatus) => void;
}

export class UiBridge {
  private url: string;
  private dispatch: DispatchFn;
  private cancel: CancelFn;
  private log: (msg: string) => void;
  private onStatusChange: (status: BridgeStatus) => void;
  private ws: WebSocket | null = null;
  private backoff = MIN_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(opts: BridgeOptions) {
    this.url = opts.url ?? DEFAULT_URL;
    this.dispatch = opts.dispatch;
    this.cancel = opts.cancel;
    this.log = opts.log ?? (() => {});
    this.onStatusChange = opts.onStatusChange ?? (() => {});
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.onStatusChange("closed");
  }

  private connect(): void {
    if (this.stopped) return;
    this.log(`connecting to ${this.url}`);
    this.onStatusChange("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.log(`construct failed: ${(err as Error).message}`);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.log("connected");
      this.backoff = MIN_BACKOFF_MS;
      this.onStatusChange("open");
    });

    ws.addEventListener("message", async (ev) => {
      await this.onMessage(ev.data);
    });

    ws.addEventListener("close", () => {
      this.log("closed");
      this.ws = null;
      this.onStatusChange("closed");
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      this.log("socket error");
    });
  }

  /**
   * Routes one frame on the envelope's discriminator, and only on that.
   *
   * An unrecognised kind is dropped with a log rather than guessed at: the
   * MCP server keys its pending map on ids it sent, so an answer to a frame
   * this build does not understand has nowhere to land, and dispatching it
   * anyway would run an Operation nobody asked to run.
   */
  private async onMessage(raw: unknown): Promise<void> {
    let envelope: BridgeEnvelope;
    try {
      envelope = JSON.parse(String(raw));
    } catch {
      this.log(`dropping malformed envelope: ${String(raw).slice(0, 80)}`);
      return;
    }
    switch (envelope?.type) {
      case "dispatch":
        await this.runDispatch(envelope);
        return;
      case "cancel":
        await this.runCancel(envelope);
        return;
      default: {
        const kind = (envelope as { type?: unknown })?.type;
        const id = (envelope as { id?: unknown })?.id;
        this.log(
          `dropping envelope of unrecognised kind '${String(kind)}' (id ${String(id)})`,
        );
      }
    }
  }

  /**
   * Asks the plugin to stop the run the Bridge named, and reports the answer.
   *
   * Nothing in here may throw outward. A cancellation is a request *about* a
   * call that is still in progress, so a failure on this path must stay a log
   * line - turning it into a broken Operation would make the stop request more
   * damaging than the timeout it followed.
   */
  private async runCancel(env: BridgeCancel): Promise<void> {
    this.log(`cancel requested for ${env.id}: ${env.reason}`);
    let report: BridgeCancelResult;
    try {
      report = await this.cancel(env);
    } catch (err) {
      this.log(`cancel for ${env.id} failed: ${(err as Error).message}`);
      report = { type: "cancel_result", id: env.id, status: "unknown" };
    }
    this.send(report, `cancel report for ${env.id}`);
  }

  private async runDispatch(req: BridgeRequest): Promise<void> {
    let res: BridgeResponse;
    try {
      res = await this.dispatch(req);
    } catch (err) {
      const errorPayload: BridgeErrorPayload = {
        code: "INTERNAL",
        message: (err as Error).message ?? String(err),
        recoverable: false,
      };
      res = { id: req.id, ok: false, error: errorPayload };
    }
    this.send(res, `response for ${req.id}`);
  }

  /** Writes one frame back, or says which one was dropped and why. */
  private send(frame: BridgeResponse | BridgeCancelResult, what: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    } else {
      this.log(`drop ${what}: socket not open`);
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    this.log(`reconnecting in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
