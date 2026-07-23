// Operation handlers for the QA engine (issue #76). Registered into the
// global Operation registry at module load via
// src/shared/operations/register-all.ts.
//
// Single agent-facing surface: `tidy_qa_run`. Returns structured CheckResults
// plus a 19-item ChecklistReport (PRD catalogue merge). All checks are static:
// nothing in this module mutates the file.

import { ErrorCode, OperationError } from "../../shared/operations/errors";
import { registerOperation } from "../../shared/operations/registry";
import { collectSnapshot } from "./collector";
import { runChecks, unknownCheckIds } from "./checks";
import { buildChecklistReport } from "./report";
import { renderChecklist } from "./render/renderChecklist";
import type { CheckId, QaRunResult } from "./types";

interface QaRunParams {
  /** Figma node id of the target (instance / component / component set). */
  nodeId?: string;
  /** Alternatively: name or glob (e.g. "Button", "Notification*") matched against components/sets. */
  name?: string;
  /** Optional filter; defaults to all catalogue checks. */
  checks?: string[];
}

// Same glob semantics as tidy_misprint_find_components: '*' wildcards only.
function globToRegex(g: string): RegExp {
  const escaped = g
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("^" + escaped.join(".*") + "$");
}

type QaSubject = ComponentSetNode | ComponentNode;

/** Resolve any pointed-at node up to the owning component set (or standalone component). */
async function resolveUp(node: BaseNode): Promise<QaSubject | null> {
  switch (node.type) {
    case "COMPONENT_SET":
      return node;
    case "COMPONENT":
      return node.parent?.type === "COMPONENT_SET" ? node.parent : node;
    case "INSTANCE": {
      const main = await node.getMainComponentAsync();
      return main ? resolveUp(main) : null;
    }
    default:
      return null;
  }
}

/** Resolve a concrete node up to its owning set, or throw WRONG_NODE_TYPE. */
async function subjectFromNode(node: BaseNode): Promise<QaSubject> {
  const subject = await resolveUp(node);
  if (!subject) {
    throw new OperationError(
      ErrorCode.WRONG_NODE_TYPE,
      `node ${node.id} (${node.type}) does not resolve to a component set`,
      true,
      { nodeId: node.id, nodeType: node.type },
    );
  }
  return subject;
}

/**
 * The QA subject plus the node the run actually started from (`origin`) — an
 * instance/component/set for the nodeId and selection paths, or null for the
 * name/glob path. Carrying the origin here avoids a second node fetch just to
 * discover whether the run began at an instance.
 *
 * `origin` is typed as `SceneNode` (not `BaseNode`) because it is only ever
 * set from a node that `subjectFromNode` has already accepted — which only
 * succeeds for COMPONENT_SET / COMPONENT / INSTANCE, all SceneNode subtypes.
 */
interface ResolvedTarget {
  subject: QaSubject;
  origin: SceneNode | null;
}

async function resolveTarget(params: QaRunParams): Promise<ResolvedTarget> {
  if (params.nodeId) {
    const node = await figma.getNodeByIdAsync(params.nodeId);
    if (!node) {
      throw new OperationError(
        ErrorCode.NOT_FOUND,
        `node ${params.nodeId} not found`,
        true,
        { nodeId: params.nodeId },
      );
    }
    const subject = await subjectFromNode(node);
    return { subject, origin: node as SceneNode };
  }

  // no explicit target → fall back to the current selection
  if (!params.name) {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        "no target and nothing selected — select a component/component set/instance, or pass a nodeId or name",
      );
    }
    return { subject: await subjectFromNode(selection[0]), origin: selection[0] };
  }

  // name / glob path
  const pattern = globToRegex(params.name);
  await figma.loadAllPagesAsync();
  const candidates = figma.root.findAllWithCriteria({
    types: ["COMPONENT", "COMPONENT_SET"],
  });

  const subjects = new Map<string, QaSubject>();
  for (const candidate of candidates) {
    if (!pattern.test(candidate.name)) continue;
    const subject = await resolveUp(candidate);
    if (subject) subjects.set(subject.id, subject);
  }

  if (subjects.size === 0) {
    throw new OperationError(
      ErrorCode.NOT_FOUND,
      `no component or component set matches '${params.name}'`,
      true,
      { name: params.name },
    );
  }
  if (subjects.size > 1) {
    throw new OperationError(
      ErrorCode.INVALID_PARAMS,
      `'${params.name}' is ambiguous — ${subjects.size} component sets match; pass a nodeId or a narrower glob`,
      true,
      {
        candidates: Array.from(subjects.values(), (s) => ({
          id: s.id,
          name: s.name,
        })),
      },
    );
  }
  return {
    subject: subjects.values().next().value as QaSubject,
    origin: null,
  };
}

/**
 * Shared pipeline for both QA operations: validate the check filter, resolve the
 * target up to its set, snapshot it, run the checks, and build the full
 * QaRunResult (results + 19-item checklist). Returns the resolved subject and
 * origin node too, so the canvas op can place its frame next to the instance.
 */
async function runQa(
  params: QaRunParams,
): Promise<{ subject: QaSubject; origin: SceneNode | null; result: QaRunResult }> {
  if (params.checks) {
    const unknown = unknownCheckIds(params.checks);
    if (unknown.length > 0) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        `unknown check id(s): ${unknown.join(", ")}`,
        true,
        { unknown },
      );
    }
  }

  const { subject, origin } = await resolveTarget(params);
  const snapshot = collectSnapshot(subject);
  const outcome = runChecks(snapshot, params.checks as CheckId[] | undefined);
  const target = { id: subject.id, name: subject.name };
  // Record the instance the run started from, if any (for canvas placement).
  const generatedFor =
    origin?.type === "INSTANCE" ? { instanceId: origin.id } : undefined;

  const result: QaRunResult = {
    target,
    results: outcome.results,
    notImplemented: outcome.notImplemented,
    checklist: buildChecklistReport({
      target,
      results: outcome.results,
      notImplemented: outcome.notImplemented,
      generatedFor,
    }),
  };
  return { subject, origin, result };
}

registerOperation<QaRunParams, QaRunResult>(
  {
    id: "tidy_qa_run",
    kind: "query",
    module: "qa",
    summary:
      "Run the DS Component QA checklist (static Tier 1 checks) against a component set. Target by nodeId or name/glob, or omit both to use the current selection. Returns CheckResults plus a 19-item checklist model. Static — never mutates the file.",
    paramsExample: { name: "Button" },
  },
  async (params) => {
    const { result } = await runQa(params);
    return result;
  },
);

interface BuildChecklistResult {
  frameId: string;
  target: { id: string; name: string };
  counts: QaRunResult["checklist"]["counts"];
}

// No `name`/glob field: per CONTEXT.md, Execute Operations take explicit ids
// (selection is the only fallback) — lookup-by-name belongs to a Query
// Operation (tidy_qa_run), not embedded here.
interface BuildChecklistParams {
  /** Figma node id of the target (instance / component / component set). Omit to use the current selection. */
  nodeId?: string;
  /** Optional filter; defaults to all catalogue checks. */
  checks?: string[];
  /**
   * Optional: place the checklist next to this node instead of the resolved
   * target/origin — lets the designer keep the frame by the instance even
   * though checks ran against the owning set.
   */
  anchorNodeId?: string;
}

function isSceneNode(node: BaseNode): node is SceneNode {
  return "absoluteBoundingBox" in node;
}

registerOperation<BuildChecklistParams, BuildChecklistResult>(
  {
    id: "tidy_qa_build_checklist",
    kind: "execute",
    module: "qa",
    summary:
      "Run the DS Component QA checklist and render it as a frame on the canvas next to the target (intended: a placed instance; resolves up to the owning set). Draws all 19 checklist items — automated ones with grouped findings, manual ones as empty checkboxes. Idempotent per target: re-running replaces the prior checklist frame. Returns only a stub (frame id, target, and pass/warn/fail/manual/pending counts), never the full findings. Target by nodeId, or omit it to use the current selection (to target by name/glob, look it up first with tidy_qa_run or tidy_find and pass the resulting nodeId); optionally pass anchorNodeId to place the frame next to a different node (e.g. the instance) than the one checks ran against.",
    paramsExample: {},
  },
  async (params) => {
    const { subject, origin, result } = await runQa(params);
    let anchor: SceneNode = origin ?? subject;
    if (params.anchorNodeId) {
      const anchorNode = await figma.getNodeByIdAsync(params.anchorNodeId);
      if (!anchorNode || !isSceneNode(anchorNode)) {
        throw new OperationError(
          ErrorCode.NOT_FOUND,
          `anchor node ${params.anchorNodeId} not found`,
          true,
          { anchorNodeId: params.anchorNodeId },
        );
      }
      anchor = anchorNode;
    }
    const frame = await renderChecklist(result.checklist, anchor);
    return {
      frameId: frame.id,
      target: result.target,
      counts: result.checklist.counts,
    };
  },
);
