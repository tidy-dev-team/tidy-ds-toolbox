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
 */
interface ResolvedTarget {
  subject: QaSubject;
  origin: BaseNode | null;
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
    return { subject: await subjectFromNode(node), origin: node };
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

    return {
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
  },
);
