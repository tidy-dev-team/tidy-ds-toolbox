// PROTOTYPE — throwaway. The shapes here are the candidates being tested.
// Lift the ones that survive into src/shared/ when the prototype answers its question.

/** Discriminator for the three Operation flavours from ADR-0001. */
export type OperationKind = "query" | "plan" | "execute";

/**
 * Static catalogue entry. Lives in the MCP server (ADR-0004).
 * `id` is dotted: `<module>.<operation>`.
 */
export interface OperationSpec {
  id: string;
  kind: OperationKind;
  module: string;
  summary: string;
  // In production this would be a Zod schema or zod-to-json-schema output.
  paramsExample: unknown;
}

/** Typed error codes — ADR-0003. Throw inside operations; bridge serialises. */
export const ErrorCode = {
  INVALID_PARAMS: "INVALID_PARAMS",
  NOT_FOUND: "NOT_FOUND",
  WRONG_NODE_TYPE: "WRONG_NODE_TYPE",
  FILE_SWITCHED: "FILE_SWITCHED",
  UNSUPPORTED_OPERATION: "UNSUPPORTED_OPERATION",
  TIMEOUT: "TIMEOUT",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class OperationError extends Error {
  code: ErrorCode;
  recoverable: boolean;
  details: Record<string, unknown> | undefined;
  constructor(
    code: ErrorCode,
    message: string,
    recoverable: boolean = true,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OperationError";
    this.code = code;
    this.recoverable = recoverable;
    this.details = details;
  }
}

/** Wire envelope crossing the Bridge (ADR-0002). */
export interface BridgeRequest<P = unknown> {
  id: string;
  operation: string;
  params: P;
}

export type BridgeResponse<R = unknown> =
  | { id: string; ok: true; result: R }
  | {
      id: string;
      ok: false;
      error: {
        code: ErrorCode;
        message: string;
        recoverable: boolean;
        details?: Record<string, unknown>;
      };
    };

/** What an Operation handler returns when it succeeds. Errors are thrown. */
export type OperationHandler<P, R> = (params: P, ctx: OperationContext) => Promise<R>;

/** Runtime context handed to every operation. Holds the live Session. */
export interface OperationContext {
  fileKey: string;
  sessionId: string;
}
