import type { CancellationToken } from "../cancellation";

// Canonical Operation types — see CONTEXT.md, ADR-0001, ADR-0002.
// Imported by both the plugin (src/) and the MCP server (mcp-server/).

/** Discriminator for the three Operation flavours from ADR-0001. */
export type OperationKind = "query" | "plan" | "execute";

/**
 * Static catalogue entry. Source of truth lives in the MCP server (ADR-0004);
 * the plugin advertises a version on Bridge connect and the server rejects
 * unsupported ops with typed UNSUPPORTED_OPERATION errors.
 *
 * `id` is snake_case and `tidy_`-prefixed for vendor namespacing
 * (e.g. `tidy_misprint_find_components`). MCP exposes the id verbatim
 * as the tool name, so the prefix makes our tools self-identifying when
 * a Claude Code session has multiple MCP servers attached.
 */
export interface OperationSpec {
  id: string;
  kind: OperationKind;
  module: string;
  summary: string;
  // Production: Zod schema, converted to JSON Schema for MCP tool definitions.
  paramsExample: unknown;
  /**
   * Whether this Operation's handler checks `ctx.cancellation` between units
   * of work, and yields (see `yieldToMain` in `src/shared/cancellation.ts`) so
   * an incoming request can be seen at all.
   *
   * Declared rather than inferred. Whether a loop has a checkpoint is not
   * observable from outside it, and the alternative - cancel the token, wait,
   * and call it stopped if the run happened to end - would report a run that
   * merely finished on its own as one that obeyed. That is the exact false
   * claim #183 exists to prevent, so an Operation that has not said it checks
   * is reported `not_cancellable` and left running.
   */
  cancellable?: boolean;
}

/**
 * Server -> plugin: run an Operation (ADR-0002).
 *
 * `type` is the union discriminator, and it is required rather than defaulted.
 * Both halves ship from one repo and one build - adding an Operation already
 * means rebuild the server and reload the plugin - so an envelope arriving
 * without it is a version skew, not a shape to accommodate. Sniffing for an
 * `operation` field instead would be exactly the guess #183 exists to remove:
 * a cancellation must never be mistaken for a dispatch.
 */
export interface BridgeRequest<P = unknown> {
  type: "dispatch";
  id: string;
  operation: string;
  params: P;
}

/**
 * Server -> plugin: stop the Operation running under `id`, if it can be
 * stopped.
 *
 * Sent when the Bridge gives up waiting. Nothing is cancelled by sending it:
 * Figma offers no way to interrupt a running handler, so a loop that never
 * asks whether it should stop cannot be stopped, and the honest outcome of
 * that case is a `CancellationStatus` saying so.
 */
export interface BridgeCancel {
  /** Not an id of its own - the id of the dispatch envelope being cancelled. */
  id: string;
  type: "cancel";
  /** Why the Bridge stopped waiting. Logged at both ends. */
  reason: string;
}

/** Everything the MCP server can send the plugin over the Bridge. */
export type BridgeEnvelope<P = unknown> = BridgeRequest<P> | BridgeCancel;

/**
 * What asking an Operation to stop actually achieved.
 *
 * Four answers, and only one of them is a successful stop. The distinction
 * that matters is `not_cancellable` versus `still_running`: the first says the
 * Operation has no checkpoint at all and never will stop, the second says it
 * has one and had not reached it yet. Collapsing them would hide which runs
 * are worth waiting for.
 */
export type CancellationStatus =
  /** Nothing is running under that id. The reply and the timeout crossed. */
  | "not_running"
  /** Running, but its loop never checks a token. Still running. NOT stopped. */
  | "not_cancellable"
  /** Asked, and the run ended. */
  | "stopped"
  /** Asked, it does check, but it had not stopped by the grace deadline. */
  | "still_running"
  /** The plugin never answered the request at all, so nothing can be claimed. */
  | "unknown";

/** The plugin's answer to a `BridgeCancel`, travelling back over the Bridge. */
export interface BridgeCancelResult {
  type: "cancel_result";
  /** The dispatch id the cancellation named. */
  id: string;
  status: CancellationStatus;
  /** What was running under that id, when anything was. */
  operation?: string;
}

export type BridgeResponse<R = unknown> =
  | { id: string; ok: true; result: R }
  | {
      id: string;
      ok: false;
      error: BridgeErrorPayload;
    };

/** Serialised form of an OperationError once it crosses the Bridge. */
export interface BridgeErrorPayload {
  code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

/** What an Operation handler returns when it succeeds. Errors are thrown (ADR-0003). */
export type OperationHandler<P, R> = (
  params: P,
  ctx: OperationContext,
) => Promise<R>;

/**
 * Runtime context handed to every operation handler.
 *
 * Only `sessionId` is on the context — `fileKey` lives on the Session itself
 * (CONTEXT.md), so handlers go through `sessionByCtx(ctx)` rather than reading
 * fileKey directly. Keeping the context minimal also makes it harder to drift
 * out of sync with the live Session.
 */
export interface OperationContext {
  sessionId: string;
  /**
   * Cooperative stop signal for this run (#183). Check it between units of
   * work and yield (`yieldToMain`), then declare `cancellable: true` on the
   * spec - a loop that checks but never yields can never see it set, and a
   * loop that checks without declaring is reported as unstoppable.
   */
  cancellation: CancellationToken;
}
