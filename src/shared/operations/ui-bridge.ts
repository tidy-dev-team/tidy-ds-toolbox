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
// Reconnect with exponential backoff (1s → 2s → … → 30s cap) while the plugin
// is open. The plugin opening / closing defines the Session lifetime.

import type {
  BridgeRequest,
  BridgeResponse,
  BridgeErrorPayload,
} from "./types";

const DEFAULT_URL = "ws://localhost:9876";
const MIN_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 10_000;

type DispatchFn = (req: BridgeRequest) => Promise<BridgeResponse>;

interface BridgeOptions {
  url?: string;
  dispatch: DispatchFn;
  log?: (msg: string) => void;
}

export class UiBridge {
  private url: string;
  private dispatch: DispatchFn;
  private log: (msg: string) => void;
  private ws: WebSocket | null = null;
  private backoff = MIN_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(opts: BridgeOptions) {
    this.url = opts.url ?? DEFAULT_URL;
    this.dispatch = opts.dispatch;
    this.log = opts.log ?? (() => {});
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
  }

  private connect(): void {
    if (this.stopped) return;
    this.log(`connecting to ${this.url}`);
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
    });

    ws.addEventListener("message", async (ev) => {
      await this.onMessage(ev.data);
    });

    ws.addEventListener("close", () => {
      this.log("closed");
      this.ws = null;
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      this.log("socket error");
    });
  }

  private async onMessage(raw: unknown): Promise<void> {
    let req: BridgeRequest;
    try {
      req = JSON.parse(String(raw));
    } catch {
      this.log(`dropping malformed envelope: ${String(raw).slice(0, 80)}`);
      return;
    }
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
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(res));
    } else {
      this.log(`drop response for ${req.id}: socket not open`);
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
