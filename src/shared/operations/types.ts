// Canonical Operation types — see CONTEXT.md, ADR-0001, ADR-0002.
// Imported by both the plugin (src/) and the MCP server (mcp-server/).

/** Discriminator for the three Operation flavours from ADR-0001. */
export type OperationKind = "query" | "plan" | "execute";

/**
 * Static catalogue entry. Source of truth lives in the MCP server (ADR-0004);
 * the plugin advertises a version on Bridge connect and the server rejects
 * unsupported ops with typed UNSUPPORTED_OPERATION errors.
 *
 * `id` is dotted: `<module>.<operation>` (e.g. `misprint.find-components`).
 */
export interface OperationSpec {
  id: string;
  kind: OperationKind;
  module: string;
  summary: string;
  // Production: Zod schema, converted to JSON Schema for MCP tool definitions.
  paramsExample: unknown;
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
export type OperationHandler<P, R> = (params: P, ctx: OperationContext) => Promise<R>;

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
}
