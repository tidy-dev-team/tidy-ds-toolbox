// UI-side owner of the in-flight Operation envelopes.
//
// It mints the UI request id the plugin main thread echoes back, keeps the
// pending map, and turns whatever main answers into a BridgeResponse. It knows
// nothing about `parent.postMessage` or `window` — `ui-bridge-startup.ts` wires
// it to those — so the whole of it is testable without a DOM.

import type { BridgeRequest, BridgeResponse } from "./types";

/** The `{ target, action, payload }` envelope the plugin main thread routes on. */
export interface MainRequestMessage {
  target: "mcp-bridge";
  action: "dispatch";
  payload: BridgeRequest;
  requestId: string;
}

/**
 * Backstop for a request the main thread never answers at all.
 *
 * Deliberately longer than the largest budget in the MCP catalogue, so the
 * Bridge's own timeout is always the deadline a caller actually meets and this
 * is only ever the thing that stops a pending entry living for the rest of the
 * Session. `main-dispatcher.test.ts` holds the two apart as the catalogue
 * grows.
 *
 * The plugin main thread cannot supply this itself: `mcp-bridge:dispatch` is
 * exempt from its deadline by design, so without it the UI side has no
 * backstop of any kind.
 */
export const UI_BACKSTOP_MS = 180_000;

export interface MainDispatcherOptions {
  post: (message: MainRequestMessage) => void;
  /** Overridable so a test does not have to drive the real backstop. */
  backstopMs?: number;
}

interface Pending {
  /**
   * The id the MCP server keys *its* pending map on. Kept beside the resolver
   * because a response built on this side (an error, a backstop) has no other
   * way to reach it, and an answer under the UI-side id is dropped as unknown.
   */
  bridgeId: string;
  settle: (res: BridgeResponse) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class MainDispatcher {
  private post: (message: MainRequestMessage) => void;
  private backstopMs: number;
  private pending = new Map<string, Pending>();
  private nextRequestId = 0;

  constructor(opts: MainDispatcherOptions) {
    this.post = opts.post;
    this.backstopMs = opts.backstopMs ?? UI_BACKSTOP_MS;
  }

  /** Read-only view of how many envelopes are still in flight. */
  pendingCount(): number {
    return this.pending.size;
  }

  dispatch(req: BridgeRequest): Promise<BridgeResponse> {
    return new Promise((resolve) => {
      const requestId = `mcp_${++this.nextRequestId}_${req.id}`;
      const timer = setTimeout(() => {
        this.settle(requestId, {
          id: req.id,
          ok: false,
          error: {
            code: "TIMEOUT",
            message: `The plugin never answered ${req.operation}. Keep the Figma window focused while an agent is driving Operations; macOS throttles unfocused Electron windows and stalls the plugin sandbox.`,
            recoverable: true,
          },
        });
      }, this.backstopMs);
      this.pending.set(requestId, { bridgeId: req.id, settle: resolve, timer });
      this.post({
        target: "mcp-bridge",
        action: "dispatch",
        payload: req,
        requestId,
      });
    });
  }

  /**
   * Ends the Session's in-flight work. Every outstanding promise is settled
   * with a typed error first: clearing the map on its own drops the resolvers,
   * and a caller awaiting a dropped resolver waits for a reply that can no
   * longer be produced.
   */
  close(): void {
    for (const [requestId, entry] of [...this.pending]) {
      this.settle(requestId, {
        id: entry.bridgeId,
        ok: false,
        error: {
          code: "BRIDGE_DISCONNECTED",
          message: "Bridge closed while the Operation was in flight",
          recoverable: true,
        },
      });
    }
  }

  /** Answers a request once, and forgets it. Every exit runs through here. */
  private settle(requestId: string, res: BridgeResponse): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.pending.delete(requestId);
    clearTimeout(entry.timer);
    entry.settle(res);
  }

  handleMessage(data: unknown): void {
    if (!data || typeof data !== "object") return;
    const msg = data as {
      type?: string;
      requestId?: string;
      result?: BridgeResponse;
      error?: string;
    };
    if (!msg.requestId) return;
    const entry = this.pending.get(msg.requestId);
    if (!entry) return;
    // Main returns the BridgeResponse as `result` (success path) or as an
    // error string (something threw before registry.dispatch was reached).
    if (msg.type === "response" && msg.result) {
      this.settle(msg.requestId, msg.result);
      return;
    }
    this.settle(msg.requestId, {
      id: entry.bridgeId,
      ok: false,
      error: {
        code: "INTERNAL",
        message: msg.error ?? "main returned no result",
        recoverable: false,
      },
    });
  }
}
