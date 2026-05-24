// PROTOTYPE — throwaway TUI shell aside, this file is the bit worth keeping.
// Pure logic: mock Figma state + operation registry + dispatcher.
// No console.log, no I/O. The CLI imports this and calls into it.

import { ErrorCode, OperationError } from "./types.ts";
import type {
  BridgeRequest,
  BridgeResponse,
  OperationContext,
  OperationHandler,
  OperationSpec,
} from "./types.ts";

// ─── Mock Figma file ────────────────────────────────────────────────────────

export type MockNodeType = "COMPONENT" | "COMPONENT_SET" | "FRAME" | "TEXT" | "PAGE";

export interface MockNode {
  id: string;
  type: MockNodeType;
  name: string;
  pageId: string;
  description?: string;
}

export interface MockPage {
  id: string;
  name: string;
}

export interface MockFile {
  fileKey: string;
  pages: MockPage[];
  nodes: MockNode[];
}

export function makeInitialFile(): MockFile {
  return {
    fileKey: "FILE_A",
    pages: [
      { id: "page1", name: "Buttons" },
      { id: "page2", name: "Inputs" },
    ],
    nodes: [
      { id: "n1", type: "COMPONENT", name: "Btn/Primary", pageId: "page1" },
      { id: "n2", type: "COMPONENT", name: "Btn/Secondary", pageId: "page1", description: "Use sparingly." },
      { id: "n3", type: "COMPONENT_SET", name: "Btn/Tertiary", pageId: "page1" },
      { id: "n4", type: "COMPONENT", name: "Input/Text", pageId: "page2" },
      { id: "n5", type: "FRAME", name: "Cover", pageId: "page1" },
    ],
  };
}

// ─── Session ────────────────────────────────────────────────────────────────

export interface Session {
  active: boolean;
  fileKey: string;
  sessionId: string;
  file: MockFile;
}

export function newSession(): Session {
  const file = makeInitialFile();
  return { active: true, fileKey: file.fileKey, sessionId: "sess_" + Math.random().toString(36).slice(2, 8), file };
}

/** Simulate the designer switching files — kills the Session per CONTEXT.md. */
export function switchFile(session: Session): void {
  session.active = false;
}

// ─── Operations ─────────────────────────────────────────────────────────────

const MISPRINT_PREFIX = "---------------------------------------------------- misprint:";
const HEBREW_MAP: Record<string, string> = { B: "נ", t: "א", n: "מ", "/": ".", P: "פ", r: "ר", i: "ת", m: "ם", a: "ש", y: "ה", e: "ק", c: "ב", o: "י", d: "ג", T: "ת", I: "י", x: "ס" };

function scramble(name: string): string {
  return name.split("").map(c => HEBREW_MAP[c] ?? c).join("");
}

// --- misprint.find-components (Query) ---

export interface FindComponentsParams {
  scope: "file" | "page";
  pageId?: string;
  namePattern?: string;
}
export interface FindComponentsResult {
  ids: string[];
  summary: string;
}

const findComponents: OperationHandler<FindComponentsParams, FindComponentsResult> =
  async (params, ctx) => {
    const session = sessionByCtx(ctx);
    if (!params.scope) throw new OperationError(ErrorCode.INVALID_PARAMS, "scope required");
    if (params.scope === "page" && !params.pageId) {
      throw new OperationError(ErrorCode.INVALID_PARAMS, "pageId required when scope=page");
    }
    if (params.pageId && !session.file.pages.some(p => p.id === params.pageId)) {
      throw new OperationError(ErrorCode.NOT_FOUND, `page ${params.pageId} not in file`, true, { pageId: params.pageId });
    }
    const pattern = params.namePattern ? globToRegex(params.namePattern) : null;
    const matches = session.file.nodes.filter(n => {
      if (n.type !== "COMPONENT" && n.type !== "COMPONENT_SET") return false;
      if (params.scope === "page" && n.pageId !== params.pageId) return false;
      if (pattern && !pattern.test(n.name)) return false;
      return true;
    });
    return { ids: matches.map(n => n.id), summary: `${matches.length} component(s) matched` };
  };

function globToRegex(g: string): RegExp {
  return new RegExp("^" + g.split("*").map(escapeRe).join(".*") + "$");
}
function escapeRe(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

// --- misprint.apply (Execute) ---

export interface ApplyMisprintParams {
  nodeIds: string[];
}
export interface ApplyMisprintResult {
  updated: number;
  ids: string[];
}

const applyMisprint: OperationHandler<ApplyMisprintParams, ApplyMisprintResult> =
  async (params, ctx) => {
    const session = sessionByCtx(ctx);
    if (!Array.isArray(params.nodeIds) || params.nodeIds.length === 0) {
      throw new OperationError(ErrorCode.INVALID_PARAMS, "nodeIds must be a non-empty array");
    }
    const missing: string[] = [];
    const wrongType: string[] = [];
    const resolved: MockNode[] = [];
    for (const id of params.nodeIds) {
      const node = session.file.nodes.find(n => n.id === id);
      if (!node) { missing.push(id); continue; }
      if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
        wrongType.push(id);
        continue;
      }
      resolved.push(node);
    }
    if (missing.length) {
      throw new OperationError(ErrorCode.NOT_FOUND, `${missing.length} nodeId(s) not found`, true, { missing });
    }
    if (wrongType.length) {
      throw new OperationError(
        ErrorCode.WRONG_NODE_TYPE,
        `${wrongType.length} node(s) are not components`,
        true,
        { wrongType },
      );
    }
    for (const node of resolved) {
      const line = `${MISPRINT_PREFIX} ${scramble(node.name)}`;
      const lines = (node.description ?? "").split("\n").filter(Boolean);
      const idx = lines.findIndex(l => l.startsWith(MISPRINT_PREFIX.slice(0, 40)));
      if (idx >= 0) lines.splice(idx, 1, line);
      else lines.push(line);
      node.description = lines.join("\n");
    }
    return { updated: resolved.length, ids: resolved.map(n => n.id) };
  };

// --- ds-template.run (Execute, parameterless, non-idempotent — by design) ---

export interface DsTemplateRunResult {
  pagesCreated: number;
  pageIds: string[];
}

const runDsTemplate: OperationHandler<Record<string, never>, DsTemplateRunResult> =
  async (_params, ctx) => {
    const session = sessionByCtx(ctx);
    const created: MockPage[] = [
      { id: "page_" + rand(), name: "🎨 Cover" },
      { id: "page_" + rand(), name: "📚 Guidelines" },
    ];
    session.file.pages.push(...created);
    return { pagesCreated: created.length, pageIds: created.map(p => p.id) };
  };

function rand(): string { return Math.random().toString(36).slice(2, 6); }

// ─── Registry + dispatcher ──────────────────────────────────────────────────

interface OperationEntry<P = any, R = any> {
  spec: OperationSpec;
  handler: OperationHandler<P, R>;
}

export const OPERATIONS: OperationEntry[] = [
  {
    spec: { id: "misprint.find-components", kind: "query", module: "utilities", summary: "Find components by scope/pattern.", paramsExample: { scope: "file" } },
    handler: findComponents as OperationHandler<any, any>,
  },
  {
    spec: { id: "misprint.apply", kind: "execute", module: "utilities", summary: "Append/replace a misprint line on components.", paramsExample: { nodeIds: ["n1"] } },
    handler: applyMisprint as OperationHandler<any, any>,
  },
  {
    spec: { id: "ds-template.run", kind: "execute", module: "utilities", summary: "Stamp DS Template pages. NOT idempotent — duplicates on re-run.", paramsExample: {} },
    handler: runDsTemplate as OperationHandler<any, any>,
  },
];

// We thread the live Session via context.sessionId. The dispatcher injects it.
let CURRENT_SESSION: Session | null = null;
function sessionByCtx(ctx: OperationContext): Session {
  if (!CURRENT_SESSION || CURRENT_SESSION.sessionId !== ctx.sessionId) {
    throw new OperationError(ErrorCode.FILE_SWITCHED, "session no longer valid", false);
  }
  if (!CURRENT_SESSION.active) {
    throw new OperationError(ErrorCode.FILE_SWITCHED, "designer switched files", false);
  }
  return CURRENT_SESSION;
}

export function bindSession(s: Session): void { CURRENT_SESSION = s; }

/** Crosses the Bridge: request envelope in, response envelope out. */
export async function dispatch(req: BridgeRequest): Promise<BridgeResponse> {
  const entry = OPERATIONS.find(o => o.spec.id === req.operation);
  if (!entry) {
    return {
      id: req.id, ok: false,
      error: { code: ErrorCode.UNSUPPORTED_OPERATION, message: `unknown operation '${req.operation}'`, recoverable: false },
    };
  }
  if (!CURRENT_SESSION) {
    return {
      id: req.id, ok: false,
      error: { code: ErrorCode.FILE_SWITCHED, message: "no active session", recoverable: false },
    };
  }
  const ctx: OperationContext = { fileKey: CURRENT_SESSION.fileKey, sessionId: CURRENT_SESSION.sessionId };
  try {
    const result = await entry.handler(req.params, ctx);
    return { id: req.id, ok: true, result };
  } catch (err) {
    if (err instanceof OperationError) {
      return { id: req.id, ok: false, error: { code: err.code, message: err.message, recoverable: err.recoverable, details: err.details } };
    }
    return { id: req.id, ok: false, error: { code: ErrorCode.INTERNAL, message: (err as Error).message ?? String(err), recoverable: false } };
  }
}
