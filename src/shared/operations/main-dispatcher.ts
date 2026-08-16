// UI-side owner of the in-flight Operation envelopes.
//
// It mints the UI request id the plugin main thread echoes back, keeps the
// pending map, and turns whatever main answers into a BridgeResponse. It knows
// nothing about `parent.postMessage` or `window` — `ui-bridge-startup.ts` wires
// it to those — so the whole of it is testable without a DOM.

import type {
  BridgeCancel,
  BridgeCancelResult,
  BridgeRequest,
  BridgeResponse,
} from "./types";

/** Run an Operation. The `{ target, action, payload }` shape main routes on. */
export interface MainDispatchMessage {
  target: "mcp-bridge";
  action: "dispatch";
  payload: BridgeRequest;
  requestId: string;
}

/**
 * Ask the run under `payload.id` to stop.
 *
 * A distinct action rather than a flag on the dispatch payload, so main routes
 * the two apart on the same discriminator the socket does and a cancellation
 * can never be executed as a call.
 */
export interface MainCancelMessage {
  target: "mcp-bridge";
  action: "cancel";
  payload: BridgeCancel;
  requestId: string;
}

export type MainRequestMessage = MainDispatchMessage | MainCancelMessage;

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

/**
 * How long a cancellation waits for main's report before giving up on it.
 *
 * Far shorter than `UI_BACKSTOP_MS`, because these two wait for different
 * things. A dispatch waits out a whole Operation; a cancellation waits only
 * for main to look at one registry entry and answer, which the registry itself
 * bounds by its own grace. Reusing the dispatch backstop would leave a stop
 * request pending for minutes after the run it named had ended.
 */
export const CANCEL_BACKSTOP_MS = 15_000;

/** Anything the UI half is waiting for main to answer. */
interface Pending {
  /**
   * The id the MCP server keys *its* pending map on. Kept beside the resolver
   * because a response built on this side (an error, a backstop) has no other
   * way to reach it, and an answer under the UI-side id is dropped as unknown.
   */
  bridgeId: string;
  settle: (res: BridgeResponse | BridgeCancelResult) => void;
  /**
   * The answer to give when main produces none, in whatever shape this
   * envelope's caller is waiting for. A dispatch owes a `BridgeResponse` and a
   * cancellation owes a `BridgeCancelResult`, so the close and backstop paths
   * ask the entry rather than assuming one of the two.
   */
  noAnswer: (
    code: string,
    message: string,
  ) => BridgeResponse | BridgeCancelResult;
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
      const noAnswer = (code: string, message: string): BridgeResponse => ({
        id: req.id,
        ok: false,
        // INTERNAL is the one code main itself can cause, and it is the only
        // one of the three that is not the caller's to retry.
        error: { code, message, recoverable: code !== "INTERNAL" },
      });
      const timer = setTimeout(() => {
        this.settle(
          requestId,
          noAnswer(
            "TIMEOUT",
            `The plugin never answered ${req.operation}. Keep the Figma window focused while an agent is driving Operations; macOS throttles unfocused Electron windows and stalls the plugin sandbox.`,
          ),
        );
      }, this.backstopMs);
      this.pending.set(requestId, {
        bridgeId: req.id,
        settle: resolve as (res: BridgeResponse | BridgeCancelResult) => void,
        noAnswer,
        timer,
      });
      this.post({
        target: "mcp-bridge",
        action: "dispatch",
        payload: req,
        requestId,
      });
    });
  }

  /**
   * Relays a cancellation to main and returns whatever it reports back.
   *
   * Correlated through the same pending map as a dispatch, because it is the
   * same question - "did main answer the message I posted under this id" - and
   * a second map would be a second thing to leak.
   */
  cancel(env: BridgeCancel): Promise<BridgeCancelResult> {
    return new Promise((resolve) => {
      const requestId = `mcp_${++this.nextRequestId}_cancel_${env.id}`;
      // No status is invented on any path out of here. `unknown` is the
      // answer whenever main did not give one, and it is a real answer: it
      // says the run was asked and nothing is known about the result, which
      // is different from both "stopped" and "cannot be stopped".
      const noAnswer = (): BridgeCancelResult => ({
        type: "cancel_result",
        id: env.id,
        status: "unknown",
      });
      const timer = setTimeout(
        () => this.settle(requestId, noAnswer()),
        CANCEL_BACKSTOP_MS,
      );
      this.pending.set(requestId, {
        bridgeId: env.id,
        settle: resolve as (res: BridgeResponse | BridgeCancelResult) => void,
        noAnswer,
        timer,
      });
      this.post({
        target: "mcp-bridge",
        action: "cancel",
        payload: env,
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
      this.settle(
        requestId,
        entry.noAnswer(
          "BRIDGE_DISCONNECTED",
          "Bridge closed while the Operation was in flight",
        ),
      );
    }
  }

  /** Answers a request once, and forgets it. Every exit runs through here. */
  private settle(
    requestId: string,
    res: BridgeResponse | BridgeCancelResult,
  ): void {
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
      result?: BridgeResponse | BridgeCancelResult;
      error?: string;
    };
    if (!msg.requestId) return;
    const entry = this.pending.get(msg.requestId);
    if (!entry) return;
    // Main returns the answer as `result` (success path) or as an error string
    // (something threw before the registry was reached).
    if (msg.type === "response" && msg.result) {
      this.settle(msg.requestId, msg.result);
      return;
    }
    this.settle(
      msg.requestId,
      entry.noAnswer("INTERNAL", msg.error ?? "main returned no result"),
    );
  }
}
