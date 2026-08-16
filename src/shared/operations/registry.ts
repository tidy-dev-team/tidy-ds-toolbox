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
import type {
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

let RUNNING: RunningOperation | null = null;

/** What is running right now, or null. Read-only view of the guard's state. */
export function runningOperation(): RunningOperation | null {
  return RUNNING;
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
  if (RUNNING) {
    return {
      id: req.id,
      ok: false,
      error: {
        code: ErrorCode.BUSY,
        message:
          `Operation '${RUNNING.operation}' is already running, and the plugin ` +
          `runs one Operation at a time. Wait for it to finish before starting ` +
          `'${req.operation}' - starting a second one now would interleave two ` +
          `sets of edits in the same document.`,
        recoverable: true,
        details: {
          runningOperation: RUNNING.operation,
          runningRequestId: RUNNING.requestId,
        },
      },
    };
  }
  RUNNING = { operation: req.operation, requestId: req.id };
  const ctx: OperationContext = { sessionId: CURRENT_SESSION.sessionId };
  try {
    const result = await entry.handler(req.params, ctx);
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
  } finally {
    // Every path out of a run frees the slot: normal return, a thrown
    // OperationError, and an unexpected throw. A leak here would lock the
    // plugin out of Operations for the rest of the session.
    RUNNING = null;
  }
}
