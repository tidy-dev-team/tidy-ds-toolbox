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
  }
}
