// Plugin-main-thread Operation registry + dispatcher.
//
// The UI thread holds the Bridge WebSocket (only the UI iframe has network
// access per the Figma plugin sandbox). When the UI receives a BridgeRequest
// from the MCP server, it relays the envelope here via postMessage; we
// dispatch it to the matching handler and return a BridgeResponse, which the
// UI then sends back over the socket.
//
// Operations register themselves by calling `registerOperation` from their
// module's logic file. ADR-0001 / ADR-0003 govern the contracts.

import { ErrorCode, OperationError } from "./errors";
import {
  createCancellationToken,
  type CancellationToken,
} from "../cancellation";
import type {
  BridgeCancelResult,
  BridgeRequest,
  BridgeResponse,
  OperationContext,
  OperationHandler,
  OperationSpec,
} from "./types";

interface OperationEntry {
  spec: OperationSpec;
  handler: OperationHandler<unknown, unknown>;
}

const OPERATIONS = new Map<string, OperationEntry>();

export function registerOperation<P, R>(
  spec: OperationSpec,
  handler: OperationHandler<P, R>,
): void {
  if (OPERATIONS.has(spec.id)) {
    throw new Error(`Operation already registered: ${spec.id}`);
  }
  OPERATIONS.set(spec.id, {
    spec,
    handler: handler as OperationHandler<unknown, unknown>,
  });
}

export function listOperations(): OperationSpec[] {
  return Array.from(OPERATIONS.values(), (e) => e.spec);
}

// Session is owned by code.ts and rebound when the file changes. MVP supports
// exactly one Session at a time (CONTEXT.md).
let CURRENT_SESSION: { sessionId: string; active: boolean } | null = null;

export function bindSession(sessionId: string): void {
  CURRENT_SESSION = { sessionId, active: true };
}

export function endSession(): void {
  if (CURRENT_SESSION) CURRENT_SESSION.active = false;
}

/**
 * The Operation currently occupying the plugin, if any.
 *
 * The plugin runs one Operation at a time (#186). Two overlapping runs do not
 * divide the work between them - the plugin is single-threaded - they only
 * interleave their mutations of one document, and the QA probes' stray-node
 * sweep is page-scoped, so the second run deletes the first run's live probe.
 *
 * This guard answers "is another Operation running", globally, and only for
 * the agent-facing path. It is not the only guard, and the other one is not
 * redundant (#187): the Documentation Page builder keeps its own lock in
 * `src/plugins/tidy-doc/utils/buildLock.ts`, answering "is this page already
 * being built" for whichever route asked. This one cannot cover that question,
 * because the panel's Document button reaches that builder through the
 * module-action path and never passes through `dispatch` at all - so a
 * designer clicking mid-agent-build is invisible here. Deleting the builder's
 * lock as duplicated work reopens exactly that door.
 */
export interface RunningOperation {
  /** Operation id, e.g. `tidy_qa_run`. */
  operation: string;
  /** Bridge request id of the run holding the slot. */
  requestId: string;
}

/**
 * The slot itself. One record, not a map - the plugin runs one Operation at a
 * time (#186), so "what is running" is a single value or nothing.
 *
 * #183 hangs the cancel handle off this same record rather than opening a
 * second in-flight registry beside it. Two structures tracking one run can
 * disagree, and the one they would disagree about is whether there is anything
 * left to stop.
 */
interface RunningEntry {
  operation: string;
  requestId: string;
  /** Whether the handler declared that it checks `ctx.cancellation`. */
  cancellable: boolean;
  /** Handed to the handler as `ctx.cancellation`; the thing a cancel marks. */
  token: CancellationToken;
  /** Resolves when the run leaves `dispatch`, however it leaves. */
  settled: Promise<void>;
}

/**
 * How long a cancellation waits to see whether the run it asked actually
 * stopped, before answering `still_running`.
 *
 * Short on purpose. The answer is a report, not a deadline the caller is
 * waiting on - by the time a cancellation is sent, the Bridge has already told
 * the caller its call timed out. A generous wait here would only delay the
 * report of a run that was never going to stop.
 */
export const CANCEL_GRACE_MS = 2_000;

/** True if `settled` resolves inside the grace, false if the grace wins. */
function settledWithin(
  settled: Promise<void>,
  graceMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), graceMs);
    void settled.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

let RUNNING: RunningEntry | null = null;

/** What is running right now, or null. Read-only view of the guard's state. */
export function runningOperation(): RunningOperation | null {
  if (!RUNNING) return null;
  return { operation: RUNNING.operation, requestId: RUNNING.requestId };
}

/**
 * Asks the Operation running under `requestId` to stop, and answers honestly
 * about what that achieved.
 *
 * Total by construction: every path returns a `CancellationStatus`, and none
 * of them throws. A cancellation is a request about a call in progress, so a
 * failure here must never become a failure of that call.
 */
export async function requestCancellation(
  requestId: string,
  graceMs: number = CANCEL_GRACE_MS,
): Promise<BridgeCancelResult> {
  const entry = RUNNING;
  // Not an error, and not rare: the Bridge stops waiting on the same clock the
  // plugin answers on, so a cancellation routinely names a run that has just
  // finished. Also covers a late cancel for an older call.
  if (!entry || entry.requestId !== requestId) {
    return { type: "cancel_result", id: requestId, status: "not_running" };
  }
  if (!entry.cancellable) {
    return {
      type: "cancel_result",
      id: requestId,
      status: "not_cancellable",
      operation: entry.operation,
    };
  }
  entry.token.cancel();
  // Asking is not stopping. The run reaches its next checkpoint on its own
  // schedule, so the only way to report a stop honestly is to watch for it.
  const stopped = await settledWithin(entry.settled, graceMs);
  return {
    type: "cancel_result",
    id: requestId,
    status: stopped ? "stopped" : "still_running",
    operation: entry.operation,
  };
}

/** What a caller must say about the run it wants the slot for. */
export interface SlotClaim {
  /** Operation id, or the id of the Operation a panel route is really doing. */
  operation: string;
  /** Identifies this run. A Bridge request id, or a panel-minted one. */
  requestId: string;
  /** Whether the run checks `ctx.cancellation`. Declared, never inferred. */
  cancellable?: boolean;
}

/**
 * Runs `run` while holding the one-Operation-at-a-time slot, refusing with
 * `BUSY` if anything already holds it.
 *
 * This is the *only* writer of `RUNNING`, and that is the point of it existing
 * separately from `dispatch` (#186). The guard used to live inside `dispatch`,
 * which meant it answered "is another Operation running" only for calls that
 * arrived over the Bridge. The panel's Document button reaches the very same
 * builder through the module-action path and never passes through `dispatch`,
 * so a designer clicking mid-agent-run was invisible to the guard and the two
 * interleaved their edits to one document - exactly the thing #186 exists to
 * stop, silently not stopped.
 *
 * A second writer would have been the obvious fix and the wrong one: two places
 * setting one slot eventually disagree about whether it is held. So `dispatch`
 * is now a caller of this like any other route, and a route that wants the
 * guarantee asks for it here.
 *
 * Throws `OperationError` rather than returning a result shape, because the
 * non-Bridge callers are ordinary plugin code with no envelope to fill in.
 * `dispatch` catches it and turns it back into a `BridgeResponse`, which is the
 * path every other `OperationError` already takes, so the wire output for a
 * refused Bridge call is unchanged.
 */
export async function withOperationSlot<T>(
  claim: SlotClaim,
  run: (cancellation: CancellationToken) => Promise<T>,
): Promise<T> {
  if (RUNNING) {
    throw new OperationError(
      ErrorCode.BUSY,
      `Operation '${RUNNING.operation}' is already running, and the plugin ` +
        `runs one Operation at a time. Wait for it to finish before starting ` +
        `'${claim.operation}' - starting a second one now would interleave two ` +
        `sets of edits in the same document.`,
      true,
      {
        runningOperation: RUNNING.operation,
        runningRequestId: RUNNING.requestId,
      },
    );
  }
  let markSettled!: () => void;
  const settled = new Promise<void>((resolve) => {
    markSettled = resolve;
  });
  const token = createCancellationToken();
  RUNNING = {
    operation: claim.operation,
    requestId: claim.requestId,
    cancellable: claim.cancellable === true,
    token,
    settled,
  };
  try {
    return await run(token);
  } finally {
    // Every path out of a run frees the slot: normal return, a thrown
    // OperationError, and an unexpected throw. A leak here would lock the
    // plugin out of Operations for the rest of the session.
    RUNNING = null;
    // Releases anyone watching for this run to stop. Must follow the line
    // above: a cancellation resumed here reads `runningOperation()` next.
    markSettled();
  }
}

export async function dispatch(req: BridgeRequest): Promise<BridgeResponse> {
  const entry = OPERATIONS.get(req.operation);
  if (!entry) {
    return {
      id: req.id,
      ok: false,
      error: {
        code: ErrorCode.UNSUPPORTED_OPERATION,
        message: `unknown operation '${req.operation}'`,
        recoverable: false,
      },
    };
  }
  if (!CURRENT_SESSION || !CURRENT_SESSION.active) {
    return {
      id: req.id,
      ok: false,
      error: {
        code: ErrorCode.FILE_SWITCHED,
        message: "no active session",
        recoverable: false,
      },
    };
  }
  const sessionId = CURRENT_SESSION.sessionId;
  try {
    const result = await withOperationSlot(
      {
        operation: req.operation,
        requestId: req.id,
        cancellable: entry.spec.cancellable === true,
      },
      (cancellation) => {
        const ctx: OperationContext = {
          sessionId,
          // Every handler gets a token, whether or not it declared it checks
          // one. Handing it out unconditionally keeps adopting cancellation a
          // one-line change in the loop plus one flag on the spec, with
          // nothing to thread.
          cancellation,
        };
        return entry.handler(req.params, ctx);
      },
    );
    return { id: req.id, ok: true, result };
  } catch (err) {
    if (err instanceof OperationError) {
      return {
        id: req.id,
        ok: false,
        error: {
          code: err.code,
          message: err.message,
          recoverable: err.recoverable,
          details: err.details,
        },
      };
    }
    return {
      id: req.id,
      ok: false,
      error: {
        code: ErrorCode.INTERNAL,
        message: (err as Error).message ?? String(err),
        recoverable: false,
      },
    };
  }
  // No `finally` freeing the slot here. `withOperationSlot` owns it and frees
  // it on every path out of the run it started. Clearing it here as well would
  // be actively wrong on the refusal path: a call rejected with BUSY never held
  // the slot, so this would release the slot belonging to the run that is still
  // going - handing the plugin to the second caller precisely when the guard
  // had just done its job.
}
