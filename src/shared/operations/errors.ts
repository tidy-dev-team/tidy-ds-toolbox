// Typed error contract for Operations — ADR-0003.
// Handlers throw OperationError; the Bridge serialises into BridgeResponse.error.

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
