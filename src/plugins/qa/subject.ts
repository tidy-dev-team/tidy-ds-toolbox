/// <reference types="@figma/plugin-typings" />

/**
 * Resolving what a QA run is about.
 *
 * Every QA Operation starts by turning what the caller pointed at - a node id, a
 * name or glob, or nothing at all - into the component set the checks run
 * against. That is one concern with three entrances, and it is figma-touching in
 * a way the rest of the run is not: it is the only part that searches the
 * document rather than reading a component it was handed.
 */

import { ErrorCode, OperationError } from "../../shared/operations/errors";
import { globToMatcher } from "../../shared/operations/glob";

/** What the checks run against: a component set, or a component standing alone. */
export type QaSubject = ComponentSetNode | ComponentNode;

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
export interface ResolvedTarget {
  subject: QaSubject;
  origin: SceneNode | null;
}

/** How a caller said what to check. Only the two fields that name a target. */
export interface TargetRequest {
  nodeId?: string;
  name?: string;
}

export async function resolveTarget(
  request: TargetRequest,
): Promise<ResolvedTarget> {
  if (request.nodeId) {
    const node = await figma.getNodeByIdAsync(request.nodeId);
    if (!node) {
      throw new OperationError(
        ErrorCode.NOT_FOUND,
        `node ${request.nodeId} not found`,
        true,
        { nodeId: request.nodeId },
      );
    }
    const subject = await subjectFromNode(node);
    return { subject, origin: node as SceneNode };
  }

  // no explicit target → fall back to the current selection
  if (!request.name) {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      throw new OperationError(
        ErrorCode.INVALID_PARAMS,
        "no target and nothing selected — select a component/component set/instance, or pass a nodeId or name",
      );
    }
    return {
      subject: await subjectFromNode(selection[0]),
      origin: selection[0],
    };
  }

  // name / glob path
  const pattern = globToMatcher(request.name);
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
      `no component or component set matches '${request.name}'`,
      true,
      { name: request.name },
    );
  }
  if (subjects.size > 1) {
    throw new OperationError(
      ErrorCode.INVALID_PARAMS,
      `'${request.name}' is ambiguous — ${subjects.size} component sets match; pass a nodeId or a narrower glob`,
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
